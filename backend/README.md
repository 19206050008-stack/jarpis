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

## Env AI gratis tanpa API key

Default backend memakai router otomatis: API key yang tersedia dulu, lalu MiMo Auto, lalu Pollinations.

Urutan chat:

1. OpenJarvis lokal (`OPENJARVIS_URL`) — local-first agent/server
2. OpenAgentic (`open-agentic`) — paling stabil dari test lokal
3. OpenRouter (`openai/gpt-oss-20b:free`)
4. Zenmux (`stepfun/step-3.7-flash-free`) — key dites 403/no permission
5. Zyloo (`qwen3.7-plus`) — key dites 402/insufficient credit
6. MiMo Auto (`mimo-auto`) — chat/reasoning/code/summarize, tanpa API key, bisa kena limit/risk control
7. Pollinations — fallback terakhir

```text
AI_PROVIDER=auto
MIMO_CLIENT=opsional-fingerprint-stabil
MAX_TOKENS=220
CORS_ORIGINS=*
```

Provider tertentu masih bisa dipaksa:

```text
AI_PROVIDER=mimo
# atau
AI_PROVIDER=pollinations
POLLINATIONS_MODEL=openai
```

## Env hosted AI router opsional

Isi key di backend, jangan pakai `NEXT_PUBLIC_*`. Router mencoba provider berurutan; kalau error atau jawaban lemah (`try_all=true`), lanjut ke otak berikutnya.

```text
OPENROUTER_API_KEYS=sk-or-...,sk-or-...
OPENROUTER_MODEL=openai/gpt-oss-20b:free
ZENMUX_API_KEY=sk-mg-...
ZENMUX_MODEL=stepfun/step-3.7-flash-free
ZYLOO_API_KEY=sk-zy-...
ZYLOO_MODEL=qwen3.7-plus
OPENJARVIS_URL=http://127.0.0.1:8765
OPENJARVIS_API_KEY=
OPENJARVIS_MODEL=
OPENAGENTIC_API_KEY=sk-...
OPENAGENTIC_MODEL=open-agentic
DISABLED_PROVIDERS=zenmux,zyloo
MONITORING_TOKEN=isi-token-rahasia
MONITORING_CACHE_SECONDS=120
APP_URL=https://jarpis-chi.vercel.app
MAX_TOKENS=220
CORS_ORIGINS=*
```

Cek provider:

```bash
curl http://localhost:8000/providers
curl -H "x-monitoring-token: $MONITORING_TOKEN" http://localhost:8000/monitoring
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
