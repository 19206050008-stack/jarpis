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

    system = "Kamu Anta, asisten AI universal yang cerdas dan berpikir global. Jawab ringkas, objektif, dan berguna."
    prompt = f"""{system}

User: {message}
Anta:"""

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
                    "HTTP-Referer": os.getenv("APP_URL", "https://antasiar.web.id"),
                    "X-Title": "Anta",
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
            yield "Anta masih memproses pesan sebelumnya. Coba lagi sebentar."
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


# Shared state for local agent
agent_state = {"title": "", "process": ""}

@app.post("/agent/state")
def update_agent_state(payload: dict):
    global agent_state
    agent_state["title"] = payload.get("title", "")
    agent_state["process"] = payload.get("process", "")
    return {"status": "ok"}

@app.get("/agent/state")
def get_agent_state():
    return agent_state


@app.get("/proxy")
async def web_proxy(url: str):
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    async with httpx.AsyncClient(follow_redirects=True, timeout=30, verify=False) as client:
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
            soup = BeautifulSoup(html, "lxml")
            
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
