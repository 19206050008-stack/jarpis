"""
Indonesian TTS microservice (free, no API key).

Engines:
1) Microsoft Edge TTS (online) — id-ID Gadis/Ardi. Output: MP3.
2) sherpa-onnx (offline, ONNX, no torch, low RAM):
   - Piper id_ID (1 voice). VITS.
   - SupertonicTTS 3 (multi-speaker) — 10 Indonesian voices (sid 0-9, lang=id).
   Output: WAV.

Endpoints:
  GET  /health  -> { ok, voices: [ {id,label,group}, ... ] }
  POST /speak   -> audio/mpeg (edge) or audio/wav (local)
                   body: { "text": "...", "speaker": "neural-1",
                           "rate": "+0%", "pitch": "+0Hz", "speed": 1.0 }
"""

import asyncio
import io
import os
import threading
import wave
from collections import OrderedDict

import edge_tts
import numpy as np
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

MODELS_DIR = os.environ.get("MODELS_DIR", "models")
DEFAULT_SPEAKER = os.environ.get("DEFAULT_SPEAKER", "sari")

SUPERTONIC_DIR = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11"

# Edge TTS voices (disabled — diganti suara neural Supertonic atas permintaan).
EDGE_VOICES: dict = {}

# VITS (Piper) voices — dinonaktifkan (kurang natural).
LOCAL_VOICES: dict = {}

# SupertonicTTS Indonesian voices (1 model, 10 speaker: 5 wanita + 5 pria).
# id -> (sid, label, group). Asumsi urutan: sid 0-4 = wanita (F1-F5), 5-9 = pria (M1-M5).
SUPERTONIC_VOICES = {
    "sari":  (0, "Sari — Wanita",  "Indonesia"),
    "dewi":  (1, "Dewi — Wanita",  "Indonesia"),
    "ayu":   (2, "Ayu — Wanita",   "Indonesia"),
    "rina":  (3, "Rina — Wanita",  "Indonesia"),
    "maya":  (4, "Maya — Wanita",  "Indonesia"),
    "budi":  (5, "Budi — Pria",    "Indonesia"),
    "agus":  (6, "Agus — Pria",    "Indonesia"),
    "bayu":  (7, "Bayu — Pria",    "Indonesia"),
    "dimas": (8, "Dimas — Pria",   "Indonesia"),
    "andi":  (9, "Andi — Pria",    "Indonesia"),
}

app = FastAPI(title="Indonesian TTS (Edge + sherpa-onnx)")

# --- lazy model caches -------------------------------------------------------
_CACHE_MAX = 3
_local_cache: "OrderedDict[str, object]" = OrderedDict()
_supertonic = None
_cache_lock = threading.Lock()


def _local_available(folder: str) -> bool:
    return os.path.isdir(os.path.join(MODELS_DIR, folder))


def _supertonic_available() -> bool:
    d = os.path.join(MODELS_DIR, SUPERTONIC_DIR)
    return os.path.isfile(os.path.join(d, "tts.json"))


def _resolve_model(folder: str):
    path = os.path.join(MODELS_DIR, folder)
    onnx = None
    for f in sorted(os.listdir(path)):
        if f.endswith(".onnx"):
            onnx = os.path.join(path, f)
            break
    tokens = os.path.join(path, "tokens.txt")
    data_dir = os.path.join(path, "espeak-ng-data")
    data_dir = data_dir if os.path.isdir(data_dir) else ""
    return onnx, tokens, data_dir


def _get_local_tts(folder: str):
    with _cache_lock:
        if folder in _local_cache:
            _local_cache.move_to_end(folder)
            return _local_cache[folder]

    import sherpa_onnx

    onnx, tokens, data_dir = _resolve_model(folder)
    if not onnx or not os.path.exists(tokens):
        raise FileNotFoundError(f"Model {folder} tidak lengkap")

    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=onnx, tokens=tokens, lexicon="", data_dir=data_dir,
            ),
            provider="cpu", num_threads=1, debug=False,
        ),
        max_num_sentences=1,
    )
    tts = sherpa_onnx.OfflineTts(config)

    with _cache_lock:
        _local_cache[folder] = tts
        _local_cache.move_to_end(folder)
        while len(_local_cache) > _CACHE_MAX:
            _local_cache.popitem(last=False)
    return tts


def _get_supertonic():
    global _supertonic
    if _supertonic is not None:
        return _supertonic
    with _cache_lock:
        if _supertonic is not None:
            return _supertonic
        import sherpa_onnx
        d = os.path.join(MODELS_DIR, SUPERTONIC_DIR)
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                supertonic=sherpa_onnx.OfflineTtsSupertonicModelConfig(
                    duration_predictor=os.path.join(d, "duration_predictor.int8.onnx"),
                    text_encoder=os.path.join(d, "text_encoder.int8.onnx"),
                    vector_estimator=os.path.join(d, "vector_estimator.int8.onnx"),
                    vocoder=os.path.join(d, "vocoder.int8.onnx"),
                    tts_json=os.path.join(d, "tts.json"),
                    unicode_indexer=os.path.join(d, "unicode_indexer.bin"),
                    voice_style=os.path.join(d, "voice.bin"),
                ),
                provider="cpu", num_threads=2, debug=False,
            ),
        )
        _supertonic = sherpa_onnx.OfflineTts(cfg)
        return _supertonic


def _samples_to_wav(samples, sample_rate: int) -> bytes:
    arr = np.asarray(samples, dtype=np.float32)
    arr = np.clip(arr, -1.0, 1.0)
    pcm = (arr * 32767.0).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sample_rate))
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


# --- edge-tts ----------------------------------------------------------------
async def _edge_once(text: str, voice: str, rate: str, pitch: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    chunks = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.extend(chunk["data"])
    return bytes(chunks)


async def _edge_tts(text: str, voice: str, rate: str, pitch: str) -> bytes:
    last_err = None
    for _ in range(3):
        try:
            audio = await _edge_once(text, voice, rate, pitch)
            if audio:
                return audio
        except Exception as e:  # noqa: BLE001
            last_err = e
            await asyncio.sleep(0.5)
    if last_err:
        raise last_err
    return b""


# --- API ---------------------------------------------------------------------
class SpeakRequest(BaseModel):
    text: str
    speaker: str | None = None
    rate: str | None = None
    pitch: str | None = None
    speed: float | None = None


def _voice_list():
    out = []
    for vid, (_v, label, group) in EDGE_VOICES.items():
        out.append({"id": vid, "label": label, "group": group})
    for vid, (folder, label, group) in LOCAL_VOICES.items():
        if _local_available(folder):
            out.append({"id": vid, "label": label, "group": group})
    if _supertonic_available():
        for vid, (_sid, label, group) in SUPERTONIC_VOICES.items():
            out.append({"id": vid, "label": label, "group": group})
    return out


@app.get("/health")
def health():
    return {"ok": True, "voices": _voice_list()}


@app.post("/speak")
def speak(req: SpeakRequest):
    text = (req.text or "").strip()
    if not text:
        return JSONResponse({"error": "Teks wajib diisi"}, status_code=400)
    if len(text) > 5000:
        return JSONResponse({"error": "Teks terlalu panjang (maks 5000)"}, status_code=400)

    speaker = (req.speaker or DEFAULT_SPEAKER).lower()
    speed = float(req.speed) if req.speed else 1.0

    # Edge voices (MP3)
    if speaker in EDGE_VOICES:
        voice = EDGE_VOICES[speaker][0]
        rate = req.rate or "+0%"
        pitch = req.pitch or "+0Hz"
        try:
            audio = asyncio.run(_edge_tts(text, voice, rate, pitch))
        except Exception as e:  # noqa: BLE001
            return JSONResponse({"error": f"Gagal membuat audio: {e}"}, status_code=503)
        if not audio:
            return JSONResponse({"error": "Audio kosong"}, status_code=503)
        return Response(content=audio, media_type="audio/mpeg")

    # SupertonicTTS voices (WAV) — 10 Indonesian speakers
    if speaker in SUPERTONIC_VOICES:
        if not _supertonic_available():
            return JSONResponse({"error": f"Suara '{speaker}' tidak tersedia"}, status_code=404)
        sid = SUPERTONIC_VOICES[speaker][0]
        try:
            import sherpa_onnx
            tts = _get_supertonic()
            gen = sherpa_onnx.GenerationConfig()
            gen.sid = sid
            gen.num_steps = 8
            gen.speed = speed
            gen.extra["lang"] = "id"
            out = tts.generate(text, gen)
        except Exception as e:  # noqa: BLE001
            return JSONResponse({"error": f"Gagal membuat audio: {e}"}, status_code=503)
        if out is None or len(out.samples) == 0:
            return JSONResponse({"error": "Audio kosong"}, status_code=503)
        wav = _samples_to_wav(out.samples, out.sample_rate)
        return Response(content=wav, media_type="audio/wav")

    # VITS / Piper voices (WAV)
    if speaker in LOCAL_VOICES:
        folder = LOCAL_VOICES[speaker][0]
        if not _local_available(folder):
            return JSONResponse({"error": f"Suara '{speaker}' tidak tersedia"}, status_code=404)
        try:
            tts = _get_local_tts(folder)
            out = tts.generate(text, sid=0, speed=speed)
        except Exception as e:  # noqa: BLE001
            return JSONResponse({"error": f"Gagal membuat audio: {e}"}, status_code=503)
        if out is None or len(out.samples) == 0:
            return JSONResponse({"error": "Audio kosong"}, status_code=503)
        wav = _samples_to_wav(out.samples, out.sample_rate)
        return Response(content=wav, media_type="audio/wav")

    return JSONResponse({"error": f"Suara '{speaker}' tidak dikenal"}, status_code=400)
