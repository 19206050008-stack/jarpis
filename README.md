# JARPIS

Asisten AI personal minimal: Next.js frontend + FastAPI backend + Supabase history.

## Fitur sekarang

- Chat web sederhana
- Riwayat chat per sesi di Supabase
- Konteks 12 pesan terakhir saat menjawab
- LangChain-style orchestrator untuk route tool
- Web/news search lewat chat: `cari ...`, `berita ...`
- Ringkas artikel dari URL: `ringkas https://...`
- TTS opsional lewat `/speak`
- Voice input browser opsional
- Halaman status: `/settings`

## Struktur

```text
backend/        FastAPI API
frontend/       Next.js UI
supabase/       schema.sql
local-agent/    agent lokal lama, opsional
```

## Jalan lokal cepat

Windows:

```powershell
./start-local.ps1
```

atau klik `start-local.bat`.

Manual backend:

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

Manual frontend:

```bash
cd frontend
npm install
npm run dev
```

## Env backend Railway

```env
AI_PROVIDER=auto
OPENROUTER_API_KEYS=
OPENAGENTIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CORS_ORIGINS=https://domain-vercel-kamu.vercel.app
MAX_TOKENS=220
ENABLE_TTS=0
```

Set `ENABLE_TTS=1` hanya kalau mau download model TTS di Railway.

## Env frontend Vercel

```env
NEXT_PUBLIC_API_URL=https://backend-kamu.up.railway.app
```

## Supabase

Jalankan:

```text
supabase/schema.sql
```
