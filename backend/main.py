import os
import asyncio
import io
import wave
from collections import OrderedDict
from threading import Lock

import httpx
import numpy as np
import edge_tts
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

MODEL_PATH = os.getenv("MODEL_PATH", "models/Qwen3-0.6B-Q8_0.gguf")
AI_PROVIDER = os.getenv("AI_PROVIDER", "pollinations")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "qwen/qwen3-0.6b-04-28:free")

MODELS_DIR = os.getenv("MODELS_DIR", "models")
SUPERTONIC_DIR = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11"

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

app = FastAPI(title="Jarpis AI + TTS")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_supertonic = None
_tts_lock = Lock()

def _supertonic_available() -> bool:
    d = os.path.join(MODELS_DIR, SUPERTONIC_DIR)
    return os.path.isfile(os.path.join(d, "tts.json"))

def _get_supertonic():
    global _supertonic
    if _supertonic is not None:
        return _supertonic
    with _tts_lock:
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

class SpeakRequest(BaseModel):
    text: str
    speaker: str | None = None
    speed: float | None = None

llm = None
if AI_PROVIDER == "local" and not OPENROUTER_API_KEY:
    from llama_cpp import Llama

    llm = Llama(
        model_path=MODEL_PATH,
        n_ctx=int(os.getenv("N_CTX", "4096")),
        n_threads=int(os.getenv("N_THREADS", "4")),
        verbose=False,
    )
lock = Lock()  # ponytail: local GGUF is one request; hosted API does not need queue.


@app.get("/health")
def health():
    return {
        "ok": True, 
        "model": OPENROUTER_MODEL if OPENROUTER_API_KEY else AI_PROVIDER if AI_PROVIDER != "local" else MODEL_PATH,
        "tts_available": _supertonic_available()
    }


@app.post("/chat")
def chat(payload: dict):
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    system = "Kamu Jarpis, asisten AI penulisan novel berbahasa Indonesia. Jawab ringkas dan berguna."
    prompt = f"""{system}

User: {message}
Jarpis:"""

    async def pollinations_generate():
        import urllib.parse
        url = "https://text.pollinations.ai/prompt/" + urllib.parse.quote(prompt)
        async with httpx.AsyncClient(timeout=120, headers={"User-Agent": "Mozilla/5.0"}) as client:
            response = await client.get(url, params={"model": os.getenv("POLLINATIONS_MODEL", "openai")})
            yield response.text

    async def hosted_generate():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": os.getenv("APP_URL", "https://jarpis-chi.vercel.app"),
                    "X-Title": "Jarpis",
                },
                json={
                    "model": OPENROUTER_MODEL,
                    "stream": True,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": message},
                    ],
                    "max_tokens": int(payload.get("max_tokens", os.getenv("MAX_TOKENS", "160"))),
                    "temperature": float(payload.get("temperature", 0.7)),
                },
            ) as response:
                if response.status_code >= 400:
                    yield await response.aread()
                    return
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    import json
                    chunk = json.loads(data)
                    yield chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")

    def local_generate():
        if not lock.acquire(blocking=False):
            yield "Jarpis masih memproses pesan sebelumnya. Coba lagi sebentar."
            return
        try:
            for chunk in llm(
                prompt,
                max_tokens=int(payload.get("max_tokens", os.getenv("MAX_TOKENS", "80"))),
                temperature=float(payload.get("temperature", 0.7)),
                stream=True,
                stop=["User:", "</s>"],
            ):
                yield chunk["choices"][0]["text"]
        finally:
            lock.release()

    generator = hosted_generate() if OPENROUTER_API_KEY else pollinations_generate() if AI_PROVIDER == "pollinations" else local_generate()
    return StreamingResponse(generator, media_type="text/plain; charset=utf-8")


@app.post("/speak")
def speak(req: SpeakRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Teks wajib diisi")
    
    speaker = (req.speaker or "sari").lower()
    speed = float(req.speed) if req.speed else 1.0

    if speaker in SUPERTONIC_VOICES:
        if not _supertonic_available():
            raise HTTPException(status_code=404, detail=f"Suara '{speaker}' belum didownload. Pastikan ENABLE_TTS=1.")
        
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
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Gagal membuat audio: {e}")
            
        if out is None or len(out.samples) == 0:
            raise HTTPException(status_code=503, detail="Audio kosong")
            
        wav = _samples_to_wav(out.samples, out.sample_rate)
        return Response(content=wav, media_type="audio/wav")

    raise HTTPException(status_code=400, detail=f"Suara '{speaker}' tidak dikenal")
