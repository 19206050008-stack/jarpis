# Jarpis Backend

Backend AI minimal untuk Railway.

## Local test

```bash
cd jarpis/backend
python -m venv .venv
. .venv/Scripts/activate  # Windows
pip install -r requirements.txt
python download_model.py
uvicorn main:app --reload
```

Test:

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d "{\"message\":\"Halo Jarpis\"}"
```

## Railway start command

```bash
python download_model.py && uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Env hosted AI cepat

Kalau `OPENROUTER_API_KEY` diisi, backend tidak load GGUF lokal.

```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=qwen/qwen3-0.6b-04-28:free
APP_URL=https://jarpis-chi.vercel.app
MAX_TOKENS=160
CORS_ORIGINS=*
```

## Env lokal GGUF opsional

```text
MODEL_REPO=Qwen/Qwen3-0.6B-GGUF
MODEL_FILE=Qwen3-0.6B-Q8_0.gguf
MODEL_DIR=models
MODEL_PATH=models/Qwen3-0.6B-Q8_0.gguf
N_CTX=4096
N_THREADS=4
MAX_TOKENS=80
CORS_ORIGINS=*
```
