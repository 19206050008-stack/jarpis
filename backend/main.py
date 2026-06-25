import os
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from llama_cpp import Llama

MODEL_PATH = os.getenv("MODEL_PATH", "models/Qwen3-0.6B-Q8_0.gguf")

app = FastAPI(title="Jarpis AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = Llama(
    model_path=MODEL_PATH,
    n_ctx=int(os.getenv("N_CTX", "4096")),
    n_threads=int(os.getenv("N_THREADS", "4")),
    verbose=False,
)
lock = Lock()  # ponytail: one model, one request; queue/worker if traffic grows.


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_PATH}


@app.post("/chat")
def chat(payload: dict):
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    prompt = f"""Kamu Jarpis, asisten AI penulisan novel berbahasa Indonesia. Jawab ringkas dan berguna.

User: {message}
Jarpis:"""

    def generate():
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

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")
