import os
import io
import wave
import time
import sys
import json
from datetime import datetime, timedelta
import hmac
import base64
import asyncio
import hashlib
import re
import getpass
import platform
from pathlib import Path
from threading import Lock

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
except ImportError:
    pass  # python-dotenv not installed, rely on system env vars

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect

_start_time = time.time()
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from orchestrator import plan_task
except Exception:
    plan_task = None

AUTH_SECRET = os.getenv("ANTA_AUTH_SECRET", "change-me-local")
USER_PASSWORD = os.getenv("ANTA_USER_PASSWORD", "")
SUPERADMIN_PASSWORD = os.getenv("ANTA_SUPERADMIN_PASSWORD", "")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
GOOGLE_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "primary")
GOOGLE_CALENDAR_TOKEN = os.getenv("GOOGLE_CALENDAR_TOKEN", "")
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "").rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REFRESH_TOKEN = os.getenv("GOOGLE_REFRESH_TOKEN", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI") or (f"{BACKEND_PUBLIC_URL}/oauth/google/callback" if BACKEND_PUBLIC_URL else "http://localhost:8000/oauth/google/callback")
SPOTIFY_ACCESS_TOKEN = os.getenv("SPOTIFY_ACCESS_TOKEN", "")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")
SPOTIFY_REFRESH_TOKEN = os.getenv("SPOTIFY_REFRESH_TOKEN", "")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI") or (f"{BACKEND_PUBLIC_URL}/oauth/spotify/callback" if BACKEND_PUBLIC_URL else "http://localhost:8000/oauth/spotify/callback")

MODEL_PATH = os.getenv("MODEL_PATH", "models/Qwen3-0.6B-Q8_0.gguf")
AI_PROVIDER = os.getenv("AI_PROVIDER", "auto")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b:free")
MIMO_API = os.getenv("MIMO_API", "https://api.xiaomimimo.com")
MIMO_JWT = ""
MIMO_JWT_TIME = 0.0
MIMO_JWT_TTL = 50 * 60
_monitoring_cache = {"time": 0.0, "data": None}
_local_memories: list[str] = []

MODELS_DIR = os.getenv("MODELS_DIR", "models")
SUPERTONIC_DIR = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11"
ELEVENLABS_API_KEYS = [
    k.strip() for k in (os.getenv("ELEVENLABS_API_KEYS") or os.getenv("ELEVENLABS_API_KEY", "")).split(",") if k.strip()
]
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "gmnazjXOFoOcWA59sd5m")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")
ELEVENLABS_CACHE_DIR = Path(os.getenv("ELEVENLABS_CACHE_DIR", "tts_cache/elevenlabs_words"))
ELEVENLABS_VOICES = {
    "elevenlabs": (ELEVENLABS_VOICE_ID, "Anta v2 — Kira"),
    "elevenlabs-andi": ("TMvmhlKUioQA4U7LOoko", "Andi — clear friendly Indonesian"),
    "elevenlabs-cahaya": ("iWydkXKoiVtvdn4vLKp9", "Cahaya"),
    "elevenlabs-dakocan": ("plgKUYgnlZ1DCNh54DwJ", "Dakocan"),
    "elevenlabs-yetty": ("Lpe7uP03WRpCk9XkpFnf", "Yetty"),
    "elevenlabs-mizan": ("ACRfKVNOAnzVitkYerdl", "Mizan"),
    "elevenlabs-kira": ("gmnazjXOFoOcWA59sd5m", "Kira"),
    "elevenlabs-ahmad": ("d888tBvGmQT2u05J1xTv", "Ahmad"),
    "elevenlabs-aita": ("ffTJE9l3Kt2ipEM32UOc", "Aita"),
    "elevenlabs-zaak": ("HnnPtoATgzx4ubChwm24", "Zaak"),
    "elevenlabs-livna": ("GdyFAZdMpKMBHw5pc1Bu", "Livna"),
    "elevenlabs-mizani": ("IALUBpQ56gzxhNH8HDDK", "Mizani"),
    "elevenlabs-aita-hq": ("k5eTzx1VYYlp6BE39Qrj", "Aita HQ"),
    "elevenlabs-mila-rahmadania": ("wWRuqXP4yAwzRerUveS8", "Mila Rahmadania"),
    "elevenlabs-mila": ("JHVoEhIATOgU9MXpfMYg", "Mila"),
    "elevenlabs-ami": ("oEOMTAySmTfDmVF6zZ2i", "Ami"),
    "elevenlabs-mizani-assertive": ("xChNffR8mWkGIrdSUYsg", "Mizani Assertive"),
    "elevenlabs-devi": ("hNbh1PL2BQ5XtGBJqEiu", "Devi"),
}
_elevenlabs_key_index = 0

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
_cors_origins = list(dict.fromkeys(os.getenv("CORS_ORIGINS", "*").split(",") + [
    "https://antasiar.my.id",
    "https://www.antasiar.my.id",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3010",
    "http://127.0.0.1:3010",
]))
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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

def _hash_embedding(text: str, dims: int = 768) -> list[float]:
    vec = [0.0] * dims
    for word in re.findall(r"[\w-]+", text.lower(), flags=re.UNICODE):
        h = int(hashlib.sha1(word.encode("utf-8")).hexdigest(), 16)
        vec[h % dims] += 1.0 if h & 1 else -1.0
    norm = sum(x * x for x in vec) ** 0.5 or 1.0
    return [round(x / norm, 6) for x in vec]


def _vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"


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
    category: str | None = None

class LoginRequest(BaseModel):
    username: str
    password: str


def _sign(payload: str) -> str:
    return hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _token(role: str, username: str = "") -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"role": role, "username": username}).encode()).decode().rstrip("=")
    return f"{payload}.{_sign(payload)}"


def _role_from_auth(request: Request) -> str:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not token or "." not in token:
        return "user"
    payload, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(_sign(payload), sig):
        return "user"
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return data.get("role") if data.get("role") in {"user", "superadmin"} else "user"
    except Exception:
        return "user"


def _elevenlabs_word_path(word: str) -> Path:
    safe = re.sub(r"[^\w.-]+", "_", word.lower(), flags=re.UNICODE).strip("_")[:40] or "word"
    digest = hashlib.sha1(word.lower().encode("utf-8")).hexdigest()[:10]
    return ELEVENLABS_CACHE_DIR / f"{safe}-{digest}.mp3"


async def _elevenlabs_cached_audio(text: str, folder: str, voice_id: str | None = None) -> bytes:
    global _elevenlabs_key_index
    voice_id = voice_id or ELEVENLABS_VOICE_ID
    base = Path("tts_cache") / folder
    base.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(f"{voice_id}\n{text.lower()}".encode("utf-8")).hexdigest()
    path = base / f"{digest}.mp3"
    if path.exists():
        return path.read_bytes()
    if not ELEVENLABS_API_KEYS:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEYS belum diset")
    async with httpx.AsyncClient(timeout=60) as client:
        last = ""
        for offset in range(len(ELEVENLABS_API_KEYS)):
            idx = (_elevenlabs_key_index + offset) % len(ELEVENLABS_API_KEYS)
            res = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={"xi-api-key": ELEVENLABS_API_KEYS[idx], "Accept": "audio/mpeg"},
                json={"text": text, "model_id": ELEVENLABS_MODEL},
            )
            if res.status_code < 400:
                _elevenlabs_key_index = idx
                path.write_bytes(res.content)
                return res.content
            last = res.text
            if res.status_code not in {400, 401, 402, 403, 429}:  # try creator key after free-tier voice rejects
                break
    raise HTTPException(status_code=503, detail=last)


async def _elevenlabs_word_audio(word: str) -> bytes:
    ELEVENLABS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _elevenlabs_word_path(word)
    if path.exists():
        return path.read_bytes()
    audio = await _elevenlabs_cached_audio(word, "elevenlabs_words")
    path.write_bytes(audio)
    return audio


def _elevenlabs_voice(speaker: str | None) -> str:
    return ELEVENLABS_VOICES.get((speaker or "").lower(), ELEVENLABS_VOICES["elevenlabs"])[0]


def _anta_v2_manifest() -> list[dict]:
    path = Path("backend/tts_cache/anta-v2.1/_manifest.json")
    if not path.exists():
        return []
    import json
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def _anta_v2_cached_reply(text: str, category: str | None = None) -> bytes | None:
    clean = re.sub(r"\s+", " ", text.strip()).lower()
    items = _anta_v2_manifest()
    if category:
        wanted = category.lower().replace("-", " ")
        items = [x for x in items if wanted in x.get("category", "").lower()]
    for item in items:
        if re.sub(r"\s+", " ", item.get("text", "").strip()).lower() == clean:
            path = Path(item.get("file", ""))
            if path.exists():
                return path.read_bytes()
    return None

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
    if plan_task:
        return plan_task(message)
    lower = message.lower()
    if any(x in lower for x in ["generate video", "buat video", "bikin video"]):
        return "video_generation"
    if any(x in lower for x in ["generate gambar", "buat gambar", "bikin gambar", "gambar ai"]):
        return "image_generation"
    if any(x in lower for x in ["transkrip", "speech to text", "stt"]):
        return "stt"
    if any(x in lower for x in ["bacakan", "text to speech", "tts", "suara"]):
        return "tts-id"
    if any(x in lower for x in ["cari video", "video ", "youtube"]):
        return "video_search"
    if any(x in lower for x in ["cari gambar", "gambar ", "foto "]):
        return "image_search"
    if any(x in lower for x in ["berita", "artikel"]):
        return "news"
    if any(x in lower for x in ["kalender", "jadwal", "calendar"]):
        return "calendar"
    if "spotify" in lower or any(x in lower for x in ["putar lagu", "pause lagu", "lagu "]):
        return "spotify"
    if any(x in lower for x in ["harga", "marketplace", "shopee", "tokopedia", "tcg"]):
        return "marketplace"
    if any(x in lower for x in ["cari ", "search ", "googling"]):
        return "web_search"
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


async def _search_web_results(q: str) -> list[dict]:
    import urllib.parse
    from bs4 import BeautifulSoup
    url = f"https://duckduckgo.com/html/?q={urllib.parse.quote(q)}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    # ponytail: local Windows cert stores can break DDG; public search carries no secrets, so allow verify override here only.
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, verify=os.getenv("SEARCH_VERIFY_SSL", "0") == "1") as client:
        res = await client.get(url, headers=headers)
    soup = BeautifulSoup(res.text, _get_soup_parser())
    results = []
    for item in soup.select(".result")[:5]:
        a = item.select_one(".result__a")
        if not a:
            continue
        link = a.get("href", "")
        if "uddg=" in link:
            link = urllib.parse.unquote(urllib.parse.parse_qs(urllib.parse.urlparse(link).query).get("uddg", [link])[0])
        snippet = item.select_one(".result__snippet")
        results.append({"title": a.get_text(" ", strip=True), "link": link, "snippet": snippet.get_text(" ", strip=True) if snippet else ""})
    return results


async def _news_results(q: str) -> list[dict]:
    import urllib.parse
    import xml.etree.ElementTree as ET
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}&hl=id&gl=ID&ceid=ID:id"
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, verify=os.getenv("SEARCH_VERIFY_SSL", "0") == "1") as client:
        res = await client.get(url)
    root = ET.fromstring(res.text)
    return [{
        "title": item.findtext("title", ""),
        "link": item.findtext("link", ""),
        "pubDate": item.findtext("pubDate", ""),
        "source": item.findtext("source", ""),
    } for item in root.findall(".//item")[:5]]


async def _article_text(url: str) -> str:
    from bs4 import BeautifulSoup
    headers = {"User-Agent": "Mozilla/5.0", "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        res = await client.get(url, headers=headers)
    soup = BeautifulSoup(res.text, _get_soup_parser())
    for tag in soup.find_all(["script", "style", "nav", "header", "footer", "aside", "iframe", "noscript", "form", "button"]):
        tag.decompose()
    container = soup.find("article") or soup.find("main") or soup.find("body")
    paragraphs = (container or soup).find_all("p")
    text = " ".join(p.get_text(" ", strip=True) for p in paragraphs if len(p.get_text(" ", strip=True)) > 30)
    return re.sub(r"\s+", " ", text).strip()[:6000]


async def _google_access_token() -> str:
    if GOOGLE_CALENDAR_TOKEN:
        return GOOGLE_CALENDAR_TOKEN
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN):
        return ""
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": GOOGLE_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        })
    return res.json().get("access_token", "") if res.status_code < 400 else ""


async def _spotify_access_token() -> str:
    if SPOTIFY_ACCESS_TOKEN:
        return SPOTIFY_ACCESS_TOKEN
    if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET and SPOTIFY_REFRESH_TOKEN):
        return ""
    auth = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post("https://accounts.spotify.com/api/token", headers={"Authorization": f"Basic {auth}"}, data={
            "grant_type": "refresh_token",
            "refresh_token": SPOTIFY_REFRESH_TOKEN,
        })
    return res.json().get("access_token", "") if res.status_code < 400 else ""


async def _calendar_upcoming() -> str:
    token = await _google_access_token()
    if not token:
        return "Google Calendar belum aktif. Buka /oauth/google/url lalu simpan GOOGLE_REFRESH_TOKEN."
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get(
            f"https://www.googleapis.com/calendar/v3/calendars/{GOOGLE_CALENDAR_ID}/events",
            headers={"Authorization": f"Bearer {token}"},
            params={"timeMin": now, "singleEvents": "true", "orderBy": "startTime", "maxResults": "10"},
        )
    if res.status_code >= 400:
        return f"Google Calendar gagal: {res.status_code} {res.text[:160]}"
    items = res.json().get("items", [])
    if not items:
        return "Tidak ada jadwal terdekat."
    return "\n".join(f"{i+1}. {x.get('summary','(tanpa judul)')} — {x.get('start',{}).get('dateTime') or x.get('start',{}).get('date')}" for i, x in enumerate(items))


async def _calendar_create(summary: str, start: datetime | None = None) -> str:
    token = await _google_access_token()
    if not token:
        return "Google Calendar belum aktif. Buka /oauth/google/url lalu simpan GOOGLE_REFRESH_TOKEN."
    start = start or (datetime.now() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=1)
    event = {
        "summary": summary,
        "start": {"dateTime": start.isoformat(), "timeZone": "Asia/Jakarta"},
        "end": {"dateTime": end.isoformat(), "timeZone": "Asia/Jakarta"},
    }
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            f"https://www.googleapis.com/calendar/v3/calendars/{GOOGLE_CALENDAR_ID}/events",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=event,
        )
    if res.status_code >= 400:
        return f"Google Calendar gagal buat jadwal: {res.status_code} {res.text[:160]}"
    data = res.json()
    return f"Jadwal dibuat: {data.get('summary', summary)} — {data.get('htmlLink', '')}"


async def _spotify(action: str, q: str = "") -> str:
    token = await _spotify_access_token()
    if not token:
        return "Spotify belum aktif. Buka /oauth/spotify/url lalu simpan SPOTIFY_REFRESH_TOKEN."
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=20) as client:
        if action == "devices":
            res = await client.get("https://api.spotify.com/v1/me/player/devices", headers=headers)
            if res.status_code >= 400:
                return f"Spotify gagal cek device: {res.status_code} {res.text[:120]}"
            devices = res.json().get("devices", [])
            return "\n".join(f"{d.get('name')} ({d.get('type')}) active={d.get('is_active')}" for d in devices) or "Tidak ada device Spotify."
        if action == "pause":
            res = await client.put("https://api.spotify.com/v1/me/player/pause", headers=headers)
            return "Spotify dipause." if res.status_code in {200, 202, 204} else f"Spotify gagal pause: {res.status_code} {res.text[:120]}"
        if action == "current":
            res = await client.get("https://api.spotify.com/v1/me/player/currently-playing", headers=headers)
            if res.status_code == 204:
                return "Tidak ada lagu yang sedang diputar."
            if res.status_code >= 400:
                return f"Spotify gagal cek lagu: {res.status_code} {res.text[:120]}"
            item = res.json().get("item") or {}
            return f"Sedang diputar: {item.get('name', '(tidak diketahui)')}"
        devices_res = await client.get("https://api.spotify.com/v1/me/player/devices", headers=headers)
        devices = devices_res.json().get("devices", []) if devices_res.status_code < 400 else []
        device_id = next((d.get("id") for d in devices if d.get("is_active") and d.get("id")), None) or next((d.get("id") for d in devices if d.get("id")), None)
        if not device_id:
            return "Spotify gagal play: tidak ada device. Buka Spotify lalu play manual 1 detik."
        await client.put("https://api.spotify.com/v1/me/player", headers=headers | {"Content-Type": "application/json"}, json={"device_ids": [device_id], "play": False})
        res = await client.get("https://api.spotify.com/v1/search", headers=headers, params={"q": q, "type": "track", "limit": "1"})
        if res.status_code >= 400:
            return f"Spotify gagal cari lagu: {res.status_code} {res.text[:120]}"
        tracks = res.json().get("tracks", {}).get("items", [])
        if not tracks:
            return "Lagu tidak ditemukan."
        track = tracks[0]
        res = await client.put("https://api.spotify.com/v1/me/player/play", headers=headers | {"Content-Type": "application/json"}, params={"device_id": device_id}, json={"uris": [track["uri"]]})
        return f"Memutar Spotify: {track['name']}" if res.status_code in {200, 202, 204} else f"Spotify gagal play: {res.status_code} {res.text[:160]}"


def _weak_answer(text: str) -> bool:
    lower = text.lower().strip()
    weak = ["tidak tahu", "tidak menemukan", "tidak bisa", "maaf", "can't", "cannot", "no result", "not found", "unable"]
    return len(lower) < 20 or any(w in lower for w in weak)


async def _openai_chat(provider: dict, system: str, message: str, payload: dict) -> str:
    headers = {"Content-Type": "application/json"}
    if provider.get("key"):
        headers["Authorization"] = f"Bearer {provider['key']}"
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
        "chat_router": [{"order": i + 1, "name": p["name"], "model": p["model"] or "auto", "capabilities": p["capabilities"], "configured": True} for i, p in enumerate(configured)] + [{"order": len(configured) + 1, "name": "mimo", "model": "mimo-auto", "capabilities": CAPABILITY_DB["mimo"]["best_for"], "configured": _mimo_enabled()}, {"order": len(configured) + 2, "name": "pollinations", "model": os.getenv("POLLINATIONS_MODEL", "openai"), "capabilities": ["chat"], "configured": True}],
        "local_tts": {"name": "supertonic", "capabilities": CAPABILITY_DB["supertonic"]["best_for"], "configured": _supertonic_available()},
        "elevenlabs_tts": {"name": "elevenlabs", "capabilities": ["tts-natural", "tts-id"], "configured": bool(ELEVENLABS_API_KEYS), "voices": [{"id": k, "label": v[1]} for k, v in ELEVENLABS_VOICES.items()]},
        "search": {"name": "builtin_search", "capabilities": CAPABILITY_DB["builtin_search"]["best_for"], "configured": True},
    }


@app.get("/route")
def route_task(q: str):
    task = _intent_task(q)
    providers = _providers_for_task(task)
    return {"task": task, "providers": [{"name": p["name"], "model": p["model"] or "auto", "capabilities": p["capabilities"]} for p in providers]}


@app.get("/health")
def health():
    import psutil
    proc = psutil.Process()
    mem = proc.memory_info()
    return {
        "ok": True,
        "model": "auto-router" if AI_PROVIDER == "auto" else "mimo-auto" if AI_PROVIDER == "mimo" else OPENROUTER_MODEL if OPENROUTER_API_KEY else AI_PROVIDER if AI_PROVIDER != "local" else MODEL_PATH,
        "tts_available": _supertonic_available(),
        "elevenlabs_tts_available": bool(ELEVENLABS_API_KEYS),
        "memory_mb": round(mem.rss / 1024 / 1024, 1),
        "cpu_percent": proc.cpu_percent(interval=0.1),
        "uptime_s": round(time.time() - _start_time),
    }


@app.get("/chat/history")
async def chat_history(session_id: str):
    rows = await _supabase_get("messages", {
        "session_id": f"eq.{session_id}",
        "select": "role,content,created_at",
        "order": "created_at.asc",
        "limit": "100",
    })
    return [{"role": "ai" if r.get("role") == "ai" else "user", "text": r.get("content", "")} for r in rows if r.get("role") in {"user", "ai"}]


@app.delete("/chat/history")
async def delete_chat_history(session_id: str):
    await _supabase_delete("messages", {"session_id": f"eq.{session_id}"})
    await _supabase_delete("sessions", {"id": f"eq.{session_id}"})
    return {"ok": True}


@app.post("/memory/backfill")
async def memory_backfill(limit: int = 100):
    rows = await _supabase_get("memories", {"embedding": "is.null", "select": "id,content", "limit": str(limit)})
    for row in rows:
        await _supabase_patch("memories", {"id": f"eq.{row['id']}"}, {"embedding": _vector_literal(_hash_embedding(row.get("content", "")))})
    return {"ok": True, "updated": len(rows)}


@app.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            if data.get("type") == "ping":
                await ws.send_json({"type": "pong"})
                continue
            try:
                res = await chat({"message": data.get("message", ""), "session_id": data.get("session_id"), "try_all": True})
                await ws.send_json({"type": "answer", "text": res.body.decode("utf-8")})
            except Exception as e:
                await ws.send_json({"type": "answer", "text": f"Gagal memproses: {e}"})
    except WebSocketDisconnect:
        return


@app.post("/chat")
async def chat(payload: dict):
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    system = "Kamu Anta, asisten AI. Jawab langsung, ringkas, natural. Jangan pakai markdown. Jika tidak yakin atau tidak menemukan info, bilang singkat saja."
    prompt = f"{system}\n\nUser: {message}\nAnta:"
    task = payload.get("task") or _intent_task(message)
    session_id = (payload.get("session_id") or "").strip() or None
    errors: list[str] = []

    url_match = re.search(r"https?://\S+", message)
    if url_match and any(x in message.lower() for x in ["ringkas", "summarize", "resume", "jelaskan"]):
        article = await _article_text(url_match.group(0).rstrip(".,)"))
        routed_message = f"Ringkas dan jelaskan artikel ini dalam bahasa Indonesia.\n\nURL: {url_match.group(0)}\n\nISI:\n{article or 'Artikel tidak terbaca.'}"
        task = "summarize"
    else:
        routed_message = await _chat_context(session_id, message) if task in {"chat", "reasoning", "code", "summarize"} else message
    await _save_message(session_id, "user", message)

    async def reply(answer: str, headers: dict | None = None):
        await _save_message(session_id, "ai", answer)
        return Response(answer, media_type="text/plain; charset=utf-8", headers=headers or {})

    remember = re.match(r"^(ingat|simpan memori)(?:\s+bahwa)?\s+(.+)", message, flags=re.I)
    if remember:
        memory = remember.group(2).strip()
        await _save_memory(memory)
        return await reply(f"Saya ingat: {memory}", {"X-Anta-Task": "memory_write"})

    if task in {"image_generation", "video_generation", "stt"}:
        return await reply(f"Fitur {task} belum punya provider aktif. Yang tersedia sekarang: chat/reasoning/code via AI keys, TTS Indonesia lokal, dan pencarian gambar/video/berita lewat backend.", {"X-Anta-Task": task})

    if task in {"image_search", "video_search"}:
        q = re.sub(r"^(cari\s+)?(gambar|foto|video|youtube)\s+", "", message, flags=re.I).strip() or message
        if task == "image_search":
            rows = await search_images(q)
            text = "\n".join(f"{i + 1}. {r.get('title') or q}\n{r.get('image') or r.get('thumbnail')}" for i, r in enumerate(rows[:6]))
        else:
            rows = await search_videos(q)
            text = "\n".join(f"{i + 1}. {r.get('title') or q}\nhttps://www.youtube.com/watch?v={r.get('id')}" for i, r in enumerate(rows[:6]))
        return await reply(text or "Tidak ada hasil.", {"X-Anta-Task": task})

    if task in {"web_search", "news", "marketplace"}:
        q = re.sub(r"^(cari|search|googling|berita|artikel|harga)\s+", "", message, flags=re.I).strip() or message
        if task == "marketplace":
            q = f"{q} harga marketplace shopee tokopedia"
        rows = await (_news_results(q) if task == "news" else _search_web_results(q))
        text = "\n".join(f"{i + 1}. {r.get('title')}\n{r.get('link')}" for i, r in enumerate(rows))
        if not text:
            import urllib.parse
            clean = urllib.parse.quote(q.replace(" harga marketplace shopee tokopedia", ""))
            if task == "marketplace":
                text = f"1. Shopee\nhttps://shopee.co.id/search?keyword={clean}\n2. Tokopedia\nhttps://www.tokopedia.com/search?st=product&q={clean}"
            elif task == "web_search":
                text = f"1. Google Search\nhttps://www.google.com/search?q={clean}\n2. DuckDuckGo\nhttps://duckduckgo.com/?q={clean}"
        return await reply(text or "Tidak ada hasil.", {"X-Anta-Task": task})

    if task == "calendar":
        lower = message.lower()
        if any(x in lower for x in ["buat jadwal", "tambah jadwal", "atur jadwal", "buat kalender"]):
            title = re.sub(r"^(buat|tambah|atur)\s+(jadwal|kalender)\s*", "", message, flags=re.I).strip() or "Jadwal baru"
            when = None
            m = re.search(r"(20\d\d-\d\d-\d\d)(?:[ T](\d\d):(\d\d))?", message)
            if m:
                when = datetime.fromisoformat(f"{m.group(1)}T{m.group(2) or '09'}:{m.group(3) or '00'}:00")
                title = title.replace(m.group(0), "").strip() or "Jadwal baru"
            return await reply(await _calendar_create(title, when), {"X-Anta-Task": "calendar_create"})
        return await reply(await _calendar_upcoming(), {"X-Anta-Task": "calendar"})

    if task == "spotify":
        lower = message.lower()
        action = "pause" if "pause" in lower or "berhenti" in lower else "current" if "sedang" in lower or "apa" in lower else "play"
        q = re.sub(r"^(putar lagu|putar|spotify|lagu)\s+", "", message, flags=re.I).strip()
        return await reply(await _spotify(action, q), {"X-Anta-Task": "spotify"})

    for provider in _providers_for_task(task):
        try:
            answer = await _openai_chat(provider, system, routed_message, payload)
            if payload.get("try_all") and _weak_answer(answer):
                errors.append(f"{provider['name']}: weak")
                continue
            return await reply(answer, {"X-Anta-Provider": provider["name"], "X-Anta-Model": provider["model"], "X-Anta-Task": task})
        except Exception as e:
            errors.append(f"{provider['name']}: {e}")

    if _mimo_enabled() and task in {"chat", "reasoning", "code", "summarize"}:
        try:
            answer = await _mimo_chat(system, routed_message, payload)
            return await reply(answer, {"X-Anta-Provider": "mimo", "X-Anta-Model": "mimo-auto", "X-Anta-Task": task})
        except Exception as e:
            errors.append(f"mimo: {e}")

    if AI_PROVIDER == "local" and llm is not None:
        if not lock.acquire(blocking=False):
            return await reply("Anta masih memproses pesan sebelumnya. Coba lagi sebentar.")
        try:
            answer = "".join(chunk["choices"][0]["text"] for chunk in llm(
                f"{system}\n\nUser: {routed_message}\nAnta:",
                max_tokens=int(payload.get("max_tokens", os.getenv("MAX_TOKENS", "80"))),
                temperature=float(payload.get("temperature", 0.7)),
                stream=True,
                stop=["User:", "</s>"],
            )).strip()
            if answer:
                return await reply(answer, {"X-Anta-Provider": "local", "X-Anta-Task": task})
        finally:
            lock.release()

    try:
        answer = await _pollinations_chat(f"{system}\n\nUser: {routed_message}\nAnta:")
        return await reply(answer, {"X-Anta-Provider": "pollinations", "X-Anta-Task": task})
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
            model = provider["model"] or ""
            safe["model"] = model or "auto"
            res = await client.post(provider["url"], headers=headers | {"Content-Type": "application/json"}, json={
                "model": model,
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
    try:
        return await _search_web_results(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/images")
async def search_images(q: str):
    import json
    import re
    import urllib.parse

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    
    # Strategy 1: Bing Image Search (Fast & High Quality)
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
        try:
            res = await client.get(f"https://www.bing.com/images/search?q={urllib.parse.quote(q)}")
            if res.status_code == 200:
                found = []
                for raw in re.findall(r'm="({.*?})"', res.text):
                    try:
                        data = json.loads(raw.replace("&quot;", '"'))
                        image = data.get("murl")
                        if image:
                            found.append({
                                "title": data.get("t", ""),
                                "image": image,
                                "thumbnail": data.get("turl", image),
                                "source": data.get("purl", "Bing")
                            })
                        if len(found) >= 24:
                            break
                    except Exception:
                        continue
                if found:
                    return found
        except Exception:
            pass

        # Strategy 2: DuckDuckGo Image Search (Fallback)
        try:
            page = await client.get(f"https://duckduckgo.com/?q={urllib.parse.quote(q)}&iax=images&ia=images")
            token = re.search(r"vqd=['\"]([^'\"]+)", page.text)
            if token:
                res = await client.get("https://duckduckgo.com/i.js", params={"q": q, "vqd": token.group(1), "o": "json", "l": "id-id"})
                if res.status_code == 200:
                    data = res.json()
                    found = [
                        {
                            "title": x.get("title", ""),
                            "image": x.get("image", ""),
                            "thumbnail": x.get("thumbnail", ""),
                            "source": x.get("source", "DuckDuckGo")
                        }
                        for x in data.get("results", [])[:24]
                        if x.get("image") or x.get("thumbnail")
                    ]
                    if found:
                        return found
        except Exception:
            pass

        # Strategy 3: Wikimedia Commons API (Indestructible backup)
        try:
            url = f"https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&generator=search&gsrsearch={urllib.parse.quote(q)}&gsrnamespace=6&gsrlimit=24&format=json"
            res = await client.get(url, headers={"User-Agent": "anta-assistant/1.0"})
            if res.status_code == 200:
                data = res.json()
                pages = data.get("query", {}).get("pages", {})
                found = []
                for p in pages.values():
                    info = p.get("imageinfo", [{}])[0]
                    img_url = info.get("url")
                    if img_url:
                        title = p.get("title", "").replace("File:", "").split(".")[0]
                        found.append({
                            "title": title,
                            "image": img_url,
                            "thumbnail": info.get("descriptionurl") or img_url,
                            "source": "Wikimedia Commons"
                        })
                if found:
                    return found
        except Exception:
            pass

    return []


@app.get("/news")
async def get_news(q: str):
    try:
        return await _news_results(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/article")
async def get_article(url: str):
    try:
        text = await _article_text(url)
        return {"url": url, "text": text, "error": "" if text else "no_content"}
    except Exception as e:
        return {"url": url, "text": "", "error": str(e)}


async def _supabase_insert(table: str, row: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=row,
        )


async def _supabase_get(table: str, params: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            params=params,
        )
    return res.json() if res.status_code < 400 else []


async def _supabase_delete(table: str, params: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    async with httpx.AsyncClient(timeout=10) as client:
        await client.delete(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            params=params,
        )


async def _supabase_patch(table: str, params: dict, row: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
            params=params,
            json=row,
        )


async def _supabase_rpc(name: str, payload: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/rpc/{name}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"},
            json=payload,
        )
    return res.json() if res.status_code < 400 else None


async def _save_message(session_id: str | None, role: str, content: str):
    if session_id:
        await _supabase_insert("sessions", {"id": session_id})
        await _supabase_insert("messages", {"session_id": session_id, "role": role, "content": content[:8000]})


async def _save_memory(content: str):
    content = content[:4000]
    _local_memories.append(content)
    await _supabase_insert("memories", {"content": content, "embedding": _vector_literal(_hash_embedding(content))})


async def _search_memories(message: str) -> list[str]:
    words = [w for w in re.findall(r"[\w-]{4,}", message.lower(), flags=re.UNICODE) if w not in {"yang", "dengan", "tentang", "siapa", "apakah", "bagaimana"}]
    if not words:
        return []
    matched = await _supabase_rpc("match_memories", {"query_embedding": _vector_literal(_hash_embedding(message)), "match_count": 5})
    if isinstance(matched, list) and matched:
        return [x.get("content", "") for x in matched if x.get("content")][:5]
    rows = []
    for word in words[:4]:
        rows += [{"content": m} for m in _local_memories if word in m.lower()]
        rows += await _supabase_get("memories", {"content": f"ilike.*{word}*", "select": "content", "limit": "5"})
    seen, found = set(), []
    for row in rows:
        content = row.get("content", "")
        if content and content not in seen:
            seen.add(content)
            found.append(content)
    return found[:5]


async def _chat_context(session_id: str | None, message: str) -> str:
    parts = []
    memories = await _search_memories(message)
    if memories:
        parts.append("Memori relevan:\n" + "\n".join(f"- {m}" for m in memories))
    if session_id:
        rows = await _supabase_get("messages", {
            "session_id": f"eq.{session_id}",
            "select": "role,content,created_at",
            "order": "created_at.desc",
            "limit": "12",
        })
        rows = list(reversed(rows))
        if rows:
            parts.append("Riwayat singkat:\n" + "\n".join(f"{r.get('role')}: {r.get('content')}" for r in rows if r.get("content")))
    parts.append(f"Pesan terbaru user: {message}")
    return "\n\n".join(parts)


async def _save_login(username: str, role: str):
    await _supabase_insert("anta_logins", {"username": username, "role": role})

@app.post("/auth/login")
async def login(req: LoginRequest):
    username = req.username.lower().strip()
    role = "superadmin" if username == "admin" else "user" if username == "anta" else ""
    ok = (username == "admin" and req.password == SUPERADMIN_PASSWORD) or (username == "anta" and req.password == USER_PASSWORD)
    if not ok:
        raise HTTPException(status_code=401, detail="Login gagal")
    await _save_login(username, role)
    return {"username": username, "role": role, "token": _token(role, username)}

@app.get("/auth/me")
def me(request: Request):
    return {"role": _role_from_auth(request)}

@app.get("/oauth/google/url")
def google_oauth_url():
    import urllib.parse
    scope = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events"
    return {"url": "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent",
    })}


@app.get("/oauth/google/callback")
async def google_oauth_callback(code: str):
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
    return res.json()


@app.get("/oauth/spotify/url")
def spotify_oauth_url():
    import urllib.parse
    scope = "user-read-playback-state user-read-currently-playing user-modify-playback-state"
    return {"url": "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": SPOTIFY_CLIENT_ID,
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "response_type": "code",
        "scope": scope,
    })}


@app.get("/oauth/spotify/callback")
async def spotify_oauth_callback(code: str):
    auth = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post("https://accounts.spotify.com/api/token", headers={"Authorization": f"Basic {auth}"}, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": SPOTIFY_REDIRECT_URI,
        })
    return res.json()


@app.get("/calendar/upcoming")
async def calendar_upcoming():
    return {"text": await _calendar_upcoming()}


@app.post("/calendar/create")
async def calendar_create(payload: dict):
    start = datetime.fromisoformat(payload["start"]) if payload.get("start") else None
    return {"text": await _calendar_create(payload.get("summary", "Jadwal baru"), start)}


@app.get("/spotify/current")
async def spotify_current():
    return {"text": await _spotify("current")}


@app.get("/spotify/devices")
async def spotify_devices():
    return {"text": await _spotify("devices")}


@app.post("/spotify/{action}")
async def spotify_action(action: str, payload: dict | None = None):
    return {"text": await _spotify(action, (payload or {}).get("q", ""))}


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


@app.post("/speak-eleven-words")
async def speak_eleven_words(req: SpeakRequest):
    words = re.findall(r"[\w.-]+", (req.text or "").strip(), flags=re.UNICODE)
    if not words:
        raise HTTPException(status_code=400, detail="Teks wajib diisi")
    chunks = [await _elevenlabs_word_audio(word) for word in words[:80]]
    return Response(content=b"".join(chunks), media_type="audio/mpeg")

@app.post("/speak-eleven-smart")
async def speak_eleven_smart(req: SpeakRequest, request: Request):
    # ponytail: phrase cache is the natural/cheap middle ground; word-splicing stays fallback.
    text = re.sub(r"\s+", " ", (req.text or "").strip())
    if not text:
        raise HTTPException(status_code=400, detail="Teks wajib diisi")
    if _role_from_auth(request) != "superadmin":
        raise HTTPException(status_code=403, detail="Anta v2 hanya untuk superadmin")
    if (req.speaker or "").lower().startswith("elevenlabs"):
        cached = _anta_v2_cached_reply(text, req.category)
        if cached:
            return Response(content=cached, media_type="audio/mpeg")
    voice_id = _elevenlabs_voice(req.speaker)
    if len(text) <= 160:
        return Response(content=await _elevenlabs_cached_audio(text, "elevenlabs_phrases", voice_id), media_type="audio/mpeg")
    chunks = re.split(r"(?<=[.!?])\s+", text)
    audio = b"".join([await _elevenlabs_cached_audio(chunk[:160], "elevenlabs_phrases", voice_id) for chunk in chunks if chunk])
    return Response(content=audio, media_type="audio/mpeg")

@app.post("/speak")
def speak(req: SpeakRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Teks wajib diisi")
    
    speaker = (req.speaker or "andi").lower()
    speed = float(req.speed) if req.speed else 1.0

    if speaker not in SUPERTONIC_VOICES:
        speaker = "andi"
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

