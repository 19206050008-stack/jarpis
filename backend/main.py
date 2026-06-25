import os
from threading import Lock

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

MODEL_PATH = os.getenv("MODEL_PATH", "models/Qwen3-0.6B-Q8_0.gguf")
AI_PROVIDER = os.getenv("AI_PROVIDER", "pollinations")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "qwen/qwen3-0.6b-04-28:free")

app = FastAPI(title="Jarpis AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    return {"ok": True, "model": OPENROUTER_MODEL if OPENROUTER_API_KEY else AI_PROVIDER if AI_PROVIDER != "local" else MODEL_PATH}


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
