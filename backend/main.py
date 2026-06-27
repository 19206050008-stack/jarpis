import os
import io
import wave
import time
import sys
import asyncio
import hashlib
import getpass
import platform
from pathlib import Path
from threading import Lock

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response

_start_time = time.time()
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MODEL_PATH = os.getenv("MODEL_PATH", "models/Qwen3-0.6B-Q8_0.gguf")
AI_PROVIDER = os.getenv("AI_PROVIDER", "auto")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b:free")
MIMO_API = os.getenv("MIMO_API", "https://api.xiaomimimo.com")
MIMO_JWT = ""
MIMO_JWT_TIME = 0.0
MIMO_JWT_TTL = 50 * 60
_monitoring_cache = {"time": 0.0, "data": None}

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

app = FastAPI(title="Anta AI + TTS")
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


def _env_keys(*names: str) -> list[str]:
    keys: list[str] = []
    for name in names:
        value = os.getenv(name, "")
        keys += [x.strip() for x in value.split(",") if x.strip()]
    return list(dict.fromkeys(keys))


CAPABILITY_DB = {
    "openrouter": {"best_for": ["chat", "reasoning", "code", "summarize", "vision-by-model"], "missing": ["tts", "stt", "video_generation"]},
    "zenmux": {"best_for": ["chat", "reasoning", "code", "summarize"], "missing": ["tts", "stt", "image_generation", "video_generation"]},
    "zyloo": {"best_for": ["chat", "reasoning", "code", "summarize"], "missing": ["tts", "stt", "image_generation", "video_generation"]},
    "openagentic": {"best_for": ["chat", "agent", "reasoning", "summarize"], "missing": ["tts", "stt", "image_generation", "video_generation"]},
    "mimo": {"best_for": ["chat", "reasoning", "code", "summarize"], "missing": ["tts", "stt", "image_generation", "video_generation"]},
    "supertonic": {"best_for": ["tts-id"], "missing": ["chat", "stt", "image_generation", "video_generation"]},
    "builtin_search": {"best_for": ["web_search", "image_search", "video_search", "news", "article_extract"], "missing": ["image_generation", "video_generation"]},
}


def _all_chat_provider_specs() -> list[dict]:
    return [
        *({"name": "openagentic", "url": "https://openagentic.id/api/v1/chat/completions", "models_url": "https://openagentic.id/api/v1/models", "credits_url": None, "key": key, "model": os.getenv("OPENAGENTIC_MODEL", "open-agentic"), "capabilities": CAPABILITY_DB["openagentic"]["best_for"]} for key in _env_keys("OPENAGENTIC_API_KEY")),
        *({"name": "openrouter", "url": "https://openrouter.ai/api/v1/chat/completions", "models_url": "https://openrouter.ai/api/v1/models", "credits_url": "https://openrouter.ai/api/v1/credits", "key": key, "model": os.getenv("OPENROUTER_MODEL", OPENROUTER_MODEL), "capabilities": CAPABILITY_DB["openrouter"]["best_for"]} for key in _env_keys("OPENROUTER_API_KEYS", "OPENROUTER_API_KEY", "OPENROUTER_API_KEY2", "OPENROUTER_API_KEY3")),
        *({"name": "zenmux", "url": "https://zenmux.ai/api/v1/chat/completions", "models_url": "https://zenmux.ai/api/v1/models", "credits_url": None, "key": key, "model": os.getenv("ZENMUX_MODEL", "stepfun/step-3.7-flash-free"), "capabilities": CAPABILITY_DB["zenmux"]["best_for"]} for key in _env_keys("ZENMUX_API_KEY")),
        *({"name": "zyloo", "url": "https://api.zyloo.io/v1/chat/completions", "models_url": "https://api.zyloo.io/v1/models", "credits_url": None, "key": key, "model": os.getenv("ZYLOO_MODEL", "qwen3.7-plus"), "capabilities": CAPABILITY_DB["zyloo"]["best_for"]} for key in _env_keys("ZYLOO_API_KEY")),
    ]


def _disabled_providers() -> set[str]:
    return set(_env_keys("DISABLED_PROVIDERS") or ["zenmux", "zyloo"])


def _chat_providers() -> list[dict]:
    disabled = _disabled_providers()
    return [p for p in _all_chat_provider_specs() if p["name"] not in disabled]


def _intent_task(message: str) -> str:
    lower = message.lower()
    if any(x in lower for x in ["generate video", "buat video", "bikin video"]):
        return "video_generation"
    if any(x in lower for x in ["generate gambar", "buat gambar", "bikin gambar", "gambar ai"]):
        return "image_generation"
    if any(x in lower for x in ["transkrip", "speech to text", "stt"]):
        return "stt"
    if any(x in lower for x in ["bacakan", "text to speech", "tts", "suara"]):
        return "tts-id"
    if any(x in lower for x in ["cari gambar", "gambar ", "foto "]):
        return "image_search"
    if any(x in lower for x in ["berita", "artikel"]):
        return "news"
    return "chat"


def _providers_for_task(task: str) -> list[dict]:
    if task in {"chat", "reasoning", "code", "summarize"}:
        return _chat_providers()
    return [p for p in _chat_providers() if task in p["capabilities"]]


def _mimo_enabled() -> bool:
    return AI_PROVIDER in {"auto", "mimo"}


def _get_soup_parser() -> str:
    try:
        import lxml
        return "lxml"
    except ImportError:
        return "html.parser"


def _weak_answer(text: str) -> bool:
    lower = text.lower().strip()
    weak = ["tidak tahu", "tidak menemukan", "tidak bisa", "maaf", "can't", "cannot", "no result", "not found", "unable"]
    return len(lower) < 20 or any(w in lower for w in weak)


async def _openai_chat(provider: dict, system: str, message: str, payload: dict) -> str:
    headers = {"Authorization": f"Bearer {provider['key']}", "Content-Type": "application/json"}
    if provider["name"] == "openrouter":
        headers |= {"HTTP-Referer": os.getenv("APP_URL", "https://antasiar.web.id"), "X-Title": "Anta"}
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(provider["url"], headers=headers, json={
            "model": provider["model"],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": message}],
            "max_tokens": int(payload.get("max_tokens", os.getenv("MAX_TOKENS", "220"))),
            "temperature": float(payload.get("temperature", 0.7)),
            "stream": False,
        })
        if res.status_code >= 400:
            raise RuntimeError(f"{provider['name']} {res.status_code}: {res.text[:200]}")
        data = res.json()
        answer = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not answer:
            raise RuntimeError(f"{provider['name']} empty response")
        return answer.strip()


def _mimo_client() -> str:
    path = Path.home() / ".local" / "share" / "mimocode" / "mimo-free-client"
    if os.getenv("MIMO_CLIENT"):
        return os.environ["MIMO_CLIENT"].strip()
    if path.exists():
        return path.read_text().strip()
    raw = "|".join([platform.node(), sys.platform, platform.machine().lower(), getpass.getuser()])
    client = hashlib.sha256(raw.encode()).hexdigest()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(client)
    return client


async def _mimo_jwt() -> str:
    global MIMO_JWT, MIMO_JWT_TIME
    if MIMO_JWT and time.time() - MIMO_JWT_TIME < MIMO_JWT_TTL:
        return MIMO_JWT
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(f"{MIMO_API}/api/free-ai/bootstrap", json={"client": _mimo_client()})
        res.raise_for_status()
        data = res.json()
    MIMO_JWT = data.get("jwt", "")
    MIMO_JWT_TIME = time.time()
    if not MIMO_JWT:
        raise RuntimeError(f"mimo bootstrap failed: {data}")
    return MIMO_JWT


async def _mimo_chat(system: str, message: str, payload: dict) -> str:
    token = await _mimo_jwt()
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{MIMO_API}/api/free-ai/openai/chat",
            headers={"Authorization": f"Bearer {token}", "X-Mimo-Source": "mimocode-cli-free"},
            json={
                "model": "mimo-auto",
                "messages": [{"role": "system", "content": "You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks.\n" + system}, {"role": "user", "content": message}],
                "max_tokens": int(payload.get("max_tokens", os.getenv("MAX_TOKENS", "220"))),
                "temperature": float(payload.get("temperature", 0.7)),
                "stream": False,
            },
        )
        if res.status_code >= 400 and res.status_code != 401:
            raise RuntimeError(f"mimo {res.status_code}: {res.text[:200]}")
        if res.status_code == 401:
            global MIMO_JWT_TIME
            MIMO_JWT_TIME = 0
            raise RuntimeError(f"mimo 401: {res.text[:200]}")
        data = res.json()
    answer = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not answer:
        raise RuntimeError(f"mimo empty response: {data}")
    return answer.strip()


async def _pollinations_chat(prompt: str) -> str:
    import urllib.parse
    url = "https://text.pollinations.ai/prompt/" + urllib.parse.quote(prompt)
    async with httpx.AsyncClient(timeout=120, headers={"User-Agent": "Mozilla/5.0"}) as client:
        res = await client.get(url, params={"model": os.getenv("POLLINATIONS_MODEL", "openai")})
        res.raise_for_status()
        return res.text.strip()


@app.get("/providers")
def providers_status():
    configured = _chat_providers()
    return {
        "capability_db": CAPABILITY_DB,
        "chat_router": [{"order": i + 1, "name": p["name"], "model": p["model"], "capabilities": p["capabilities"], "configured": True} for i, p in enumerate(configured)] + [{"order": len(configured) + 1, "name": "mimo", "model": "mimo-auto", "capabilities": CAPABILITY_DB["mimo"]["best_for"], "configured": _mimo_enabled()}, {"order": len(configured) + 2, "name": "pollinations", "model": os.getenv("POLLINATIONS_MODEL", "openai"), "capabilities": ["chat"], "configured": True}],
        "local_tts": {"name": "supertonic", "capabilities": CAPABILITY_DB["supertonic"]["best_for"], "configured": _supertonic_available()},
        "search": {"name": "builtin_search", "capabilities": CAPABILITY_DB["builtin_search"]["best_for"], "configured": True},
    }


@app.get("/route")
def route_task(q: str):
    task = _intent_task(q)
    providers = _providers_for_task(task)
    return {"task": task, "providers": [{"name": p["name"], "model": p["model"], "capabilities": p["capabilities"]} for p in providers]}


@app.get("/health")
def health():
    import psutil
    proc = psutil.Process()
    mem = proc.memory_info()
    return {
        "ok": True,
        "model": "auto-router" if AI_PROVIDER == "auto" else "mimo-auto" if AI_PROVIDER == "mimo" else OPENROUTER_MODEL if OPENROUTER_API_KEY else AI_PROVIDER if AI_PROVIDER != "local" else MODEL_PATH,
        "tts_available": _supertonic_available(),
        "memory_mb": round(mem.rss / 1024 / 1024, 1),
        "cpu_percent": proc.cpu_percent(interval=0.1),
        "uptime_s": round(time.time() - _start_time),
    }


@app.post("/chat")
async def chat(payload: dict):
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    system = "Kamu Anta, asisten AI. Jawab langsung, ringkas, natural. Jangan pakai markdown. Jika tidak yakin atau tidak menemukan info, bilang singkat saja."
    prompt = f"{system}\n\nUser: {message}\nAnta:"
    task = payload.get("task") or _intent_task(message)
    errors: list[str] = []

    if task in {"image_generation", "video_generation", "stt"}:
        return Response(f"Fitur {task} belum punya provider aktif. Yang tersedia sekarang: chat/reasoning/code via AI keys, TTS Indonesia lokal, dan pencarian gambar/video/berita lewat backend.", media_type="text/plain; charset=utf-8", headers={"X-Anta-Task": task})

    for provider in _providers_for_task(task):
        try:
            answer = await _openai_chat(provider, system, message, payload)
            if payload.get("try_all") and _weak_answer(answer):
                errors.append(f"{provider['name']}: weak")
                continue
            return Response(answer, media_type="text/plain; charset=utf-8", headers={"X-Anta-Provider": provider["name"], "X-Anta-Model": provider["model"], "X-Anta-Task": task})
        except Exception as e:
            errors.append(f"{provider['name']}: {e}")

    if _mimo_enabled() and task in {"chat", "reasoning", "code", "summarize"}:
        try:
            answer = await _mimo_chat(system, message, payload)
            return Response(answer, media_type="text/plain; charset=utf-8", headers={"X-Anta-Provider": "mimo", "X-Anta-Model": "mimo-auto", "X-Anta-Task": task})
        except Exception as e:
            errors.append(f"mimo: {e}")

    if AI_PROVIDER == "local" and llm is not None:
        if not lock.acquire(blocking=False):
            return Response("Anta masih memproses pesan sebelumnya. Coba lagi sebentar.", media_type="text/plain; charset=utf-8")
        try:
            answer = "".join(chunk["choices"][0]["text"] for chunk in llm(
                prompt,
                max_tokens=int(payload.get("max_tokens", os.getenv("MAX_TOKENS", "80"))),
                temperature=float(payload.get("temperature", 0.7)),
                stream=True,
                stop=["User:", "</s>"],
            )).strip()
            if answer:
                return Response(answer, media_type="text/plain; charset=utf-8", headers={"X-Anta-Provider": "local", "X-Anta-Task": task})
        finally:
            lock.release()

    try:
        answer = await _pollinations_chat(prompt)
        return Response(answer, media_type="text/plain; charset=utf-8", headers={"X-Anta-Provider": "pollinations", "X-Anta-Task": task})
    except Exception as e:
        errors.append(f"pollinations: {e}")
        raise HTTPException(status_code=503, detail="; ".join(errors[-4:]))


async def _provider_monitor(provider: dict, idx: int) -> dict:
    safe = {k: provider[k] for k in ["name", "model", "capabilities"]}
    safe |= {"order": idx, "active": provider["name"] not in _disabled_providers(), "models": [], "models_count": None, "credit": None, "latency_s": None, "usable": False, "reason": ""}
    headers = {"Authorization": f"Bearer {provider['key']}"}
    if provider["name"] == "openrouter":
        headers |= {"HTTP-Referer": os.getenv("APP_URL", "https://antasiar.web.id"), "X-Title": "Anta"}
    async with httpx.AsyncClient(timeout=30) as client:
        if provider.get("models_url"):
            try:
                res = await client.get(provider["models_url"], headers=headers, follow_redirects=True)
                if res.headers.get("content-type", "").startswith("application/json"):
                    data = res.json().get("data", [])
                    safe["models_count"] = len(data)
                    safe["models"] = [m.get("id") for m in data[:40] if m.get("id")]
            except Exception as e:
                safe["models_error"] = str(e)[:120]
        if provider.get("credits_url"):
            try:
                res = await client.get(provider["credits_url"], headers=headers)
                if res.headers.get("content-type", "").startswith("application/json"):
                    safe["credit"] = res.json().get("data", res.json())
            except Exception as e:
                safe["credit_error"] = str(e)[:120]
        start = time.time()
        try:
            res = await client.post(provider["url"], headers=headers | {"Content-Type": "application/json"}, json={
                "model": provider["model"],
                "messages": [{"role": "user", "content": "Jawab hanya angka: 37*24+19=?"}],
                "max_tokens": 40,
                "temperature": 0.2,
                "stream": False,
            })
            safe["latency_s"] = round(time.time() - start, 2)
            if res.status_code >= 400:
                safe["reason"] = f"HTTP {res.status_code}: {res.text[:160]}"
            else:
                answer = res.json().get("choices", [{}])[0].get("message", {}).get("content") or ""
                safe["usable"] = "907" in answer
                safe["reason"] = answer[:160] if answer else "empty response"
        except Exception as e:
            safe["reason"] = f"{type(e).__name__}: {str(e)[:160]}"
    return safe


def _check_monitoring_token(req: Request):
    token = os.getenv("MONITORING_TOKEN", "").strip()
    if token and req.headers.get("x-monitoring-token", req.query_params.get("token", "")) != token:
        raise HTTPException(status_code=401, detail="monitoring token required")


@app.get("/monitoring")
async def monitoring(req: Request):
    _check_monitoring_token(req)
    ttl = int(os.getenv("MONITORING_CACHE_SECONDS", "120"))
    if _monitoring_cache["data"] and time.time() - _monitoring_cache["time"] < ttl:
        return _monitoring_cache["data"]

    specs = _all_chat_provider_specs()
    rows = await asyncio.gather(*[_provider_monitor(p, i + 1) for i, p in enumerate(specs)]) if specs else []
    if _mimo_enabled():
        rows.append({"order": len(rows) + 1, "name": "mimo", "model": "mimo-auto", "capabilities": CAPABILITY_DB["mimo"]["best_for"], "active": True, "models": ["mimo-auto"], "models_count": 1, "credit": "free/rate-limited", "latency_s": None, "usable": False, "reason": "risk-control/rate-limit possible; used before Pollinations"})
    rows.append({"order": len(rows) + 1, "name": "pollinations", "model": os.getenv("POLLINATIONS_MODEL", "openai"), "capabilities": ["chat"], "active": True, "models": [os.getenv("POLLINATIONS_MODEL", "openai")], "models_count": 1, "credit": "free", "latency_s": None, "usable": True, "reason": "fallback"})
    usable = sorted([r for r in rows if r["usable"] and r["active"]], key=lambda r: r["latency_s"] if r["latency_s"] is not None else 999)
    unusable = [r for r in rows if not r["usable"] or not r["active"]]
    data = {"default_provider": usable[0] if usable else None, "usable_by_speed": usable, "unusable": unusable, "providers": rows, "cached_for_s": ttl}
    _monitoring_cache.update({"time": time.time(), "data": data})
    return data


# Shared state for local agent, keyed per device/session.
agent_states: dict[str, dict] = {}

@app.post("/agent/state")
def update_agent_state(payload: dict):
    agent_id = str(payload.get("agent_id") or "default")[:80]
    agent_states[agent_id] = {"title": payload.get("title", ""), "process": payload.get("process", ""), "updated_at": time.time()}
    return {"status": "ok"}

@app.get("/agent/state")
def get_agent_state(agent_id: str = "default"):
    return agent_states.get(agent_id[:80], {"title": "", "process": ""})


@app.get("/proxy")
async def web_proxy(url: str):
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept-Encoding": "gzip, deflate",
            }
            res = await client.get(url, headers=headers)
            content = res.text
            
            # Inject base tag and CSP relaxation
            base_tag = f'<base href="{url}">'
            csp_meta = '<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">'
            inject = base_tag + csp_meta
            
            if "<head>" in content:
                content = content.replace("<head>", f"<head>{inject}", 1)
            elif "<html>" in content:
                content = content.replace("<html>", f"<html><head>{inject}</head>", 1)
            else:
                content = inject + content
            
            return Response(content=content, media_type="text/html", headers={
                "Access-Control-Allow-Origin": "*",
                "X-Frame-Options": "ALLOWALL",
                "Content-Security-Policy": "frame-ancestors *"
            })
        except Exception as e:
            error_html = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Error</title></head>
<body style="font-family:Arial;padding:40px;background:#0a0e27;color:#67e8f9;">
<h2 style="color:#22d3ee;">❌ Gagal memuat: {url}</h2>
<p><strong>Error:</strong> {str(e)}</p>
<p style="color:#94a3b8;">Kemungkinan penyebab:</p>
<ul style="color:#94a3b8;">
<li>Website memblokir akses via proxy</li>
<li>Timeout atau koneksi lambat</li>
<li>URL tidak valid</li>
</ul>
<button onclick="window.open('{url}', '_blank')" style="padding:10px 20px;background:#0891b2;color:white;border:0;border-radius:8px;cursor:pointer;margin-top:20px;">Buka di Tab Baru</button>
</body></html>'''
            return Response(content=error_html, media_type="text/html", status_code=500)


@app.get("/search")
async def search_web(q: str):
    import urllib.parse
    from bs4 import BeautifulSoup
    url = f"https://duckduckgo.com/html/?q={urllib.parse.quote(q)}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        try:
            res = await client.get(url, headers=headers)
            soup = BeautifulSoup(res.text, _get_soup_parser())
            results = []
            for item in soup.select(".result")[:10]:
                a = item.select_one(".result__a")
                if not a:
                    continue
                link = a.get("href", "")
                if "uddg=" in link:
                    link = urllib.parse.unquote(urllib.parse.parse_qs(urllib.parse.urlparse(link).query).get("uddg", [link])[0])
                snippet = item.select_one(".result__snippet")
                try:
                    source = urllib.parse.urlparse(link).netloc.replace("www.", "")
                except Exception:
                    source = "web"
                results.append({
                    "title": a.get_text(" ", strip=True),
                    "link": link,
                    "source": source,
                    "pubDate": snippet.get_text(" ", strip=True) if snippet else "",
                })
            return results
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/images")
async def search_images(q: str):
    import json
    import re
    import urllib.parse

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
        try:
            page = await client.get(f"https://duckduckgo.com/?q={urllib.parse.quote(q)}&iax=images&ia=images")
            token = re.search(r"vqd=['\"]([^'\"]+)", page.text)
            if token:
                res = await client.get("https://duckduckgo.com/i.js", params={"q": q, "vqd": token.group(1), "o": "json", "l": "id-id"})
                data = res.json()
                return [
                    {"title": x.get("title", ""), "image": x.get("image", ""), "thumbnail": x.get("thumbnail", ""), "source": x.get("source", "")}
                    for x in data.get("results", [])[:24]
                    if x.get("image") or x.get("thumbnail")
                ]
        except Exception:
            pass

        try:
            res = await client.get(f"https://www.bing.com/images/search?q={urllib.parse.quote(q)}")
            found = []
            for raw in re.findall(r"m=({.*?})", res.text):
                try:
                    data = json.loads(raw.replace("&quot;", '"'))
                    image = data.get("murl")
                    if image:
                        found.append({"title": data.get("t", ""), "image": image, "thumbnail": data.get("turl", image), "source": data.get("purl", "")})
                    if len(found) >= 24:
                        break
                except Exception:
                    continue
            return found
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/news")
async def get_news(q: str):
    import urllib.parse
    import xml.etree.ElementTree as ET
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}&hl=id&gl=ID&ceid=ID:id"
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        try:
            res = await client.get(url)
            root = ET.fromstring(res.text)
            items = []
            for item in root.findall(".//item")[:10]:
                link = item.find("link").text if item.find("link") is not None else ""
                # Google News links redirect — try to resolve them
                if link and "news.google.com" in link:
                    try:
                        head_res = await client.head(link, follow_redirects=True)
                        resolved = str(head_res.url)
                        if resolved and "news.google.com" not in resolved:
                            link = resolved
                    except Exception:
                        pass
                items.append({
                    "title": item.find("title").text if item.find("title") is not None else "",
                    "link": link,
                    "pubDate": item.find("pubDate").text if item.find("pubDate") is not None else "",
                    "source": item.find("source").text if item.find("source") is not None else ""
                })
            return items
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/article")
async def get_article(url: str):
    from bs4 import BeautifulSoup
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        try:
            res = await client.get(url, headers=headers)
            html = res.text
            soup = BeautifulSoup(html, _get_soup_parser())
            
            # Remove unwanted elements
            for tag in soup.find_all(["script", "style", "nav", "header", "footer", "aside", "iframe", "noscript", "form", "button"]):
                tag.decompose()
            
            # Try to find article content in common selectors
            article_text = ""
            
            # Strategy 1: Look for article/main content tags
            content_selectors = [
                soup.find("article"),
                soup.find("div", class_=lambda c: c and any(x in str(c).lower() for x in ["article", "content", "body-text", "post-content", "entry-content", "read__content"])),
                soup.find("div", id=lambda i: i and any(x in str(i).lower() for x in ["article", "content", "body"])),
                soup.find("main"),
            ]
            
            for container in content_selectors:
                if container:
                    # Get all paragraph text
                    paragraphs = container.find_all("p")
                    if paragraphs:
                        article_text = " ".join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 30)
                    if len(article_text) > 200:
                        break
            
            # Strategy 2: Fallback to all <p> tags if nothing found
            if len(article_text) < 200:
                paragraphs = soup.find_all("p")
                article_text = " ".join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 30)
            
            # Strategy 3: Last resort — get all text from body
            if len(article_text) < 100:
                body = soup.find("body")
                if body:
                    article_text = body.get_text(separator=" ", strip=True)
            
            # Clean up
            import re
            article_text = re.sub(r"\s+", " ", article_text).strip()
            
            # Validate: if text looks like garbage (too much code/JS), return empty
            if not article_text or len(article_text) < 50:
                return {"url": url, "text": "", "error": "no_content"}
            
            # Check for code/garbage indicators
            code_indicators = ["function(", "var ", "const ", "window.", "document.", "{\"", "};", "createElement"]
            code_count = sum(1 for ind in code_indicators if ind in article_text[:500])
            if code_count >= 3:
                return {"url": url, "text": "", "error": "code_content"}
            
            return {"url": url, "text": article_text[:6000]}
        except Exception as e:
            return {"url": url, "text": "", "error": str(e)}


@app.get("/videos")
async def search_videos(q: str):
    import urllib.parse
    import re
    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(q)}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            res = await client.get(url, headers=headers)
            html = res.text
            video_ids = re.findall(r'"videoId":"([^"]+)"', html)
            titles = re.findall(r'"title":\{"runs":\[\{"text":"([^"]+)"', html)
            seen = set()
            results = []
            for vid, title in zip(video_ids, titles):
                if vid not in seen:
                    seen.add(vid)
                    clean_title = title.encode().decode('unicode-escape', errors='ignore')
                    results.append({
                        "id": vid,
                        "title": clean_title,
                        "url": f"https://www.youtube.com/embed/{vid}"
                    })
                if len(results) >= 6:
                    break
            return results
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/speak")
def speak(req: SpeakRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Teks wajib diisi")
    
    speaker = (req.speaker or "andi").lower()
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
            gen.num_steps = int(os.getenv("TTS_STEPS", "4"))
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

