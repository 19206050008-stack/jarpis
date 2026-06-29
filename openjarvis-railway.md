# Deploy OpenJarvis ke Railway

Paling aman: OpenJarvis jadi service Railway terpisah, Jarpis/Anta tetap service sendiri.

## Service OpenJarvis

Buat service baru di Railway dari repo Jarpis ini, pakai folder `backend/anta-jarvis`.

Start command:

```bash
cd backend/anta-jarvis && python -m pip install uv && python -m uv sync --extra server --extra inference-cloud && python -m uv run jarvis serve --host 0.0.0.0 --port $PORT --engine cloud --model $OPENJARVIS_MODEL --agent simple
```

Env service OpenJarvis:

```text
OPENROUTER_API_KEY=sk-or-...
OPENJARVIS_MODEL=openai/gpt-oss-20b:free
```

Catatan: jangan pakai local Ollama/model besar di Railway dulu. Pakai cloud engine supaya service hidup cepat.

## Service Jarpis backend

Set env Railway backend Jarpis:

```text
OPENJARVIS_URL=https://openjarvis-service.up.railway.app
OPENJARVIS_API_KEY=
OPENJARVIS_MODEL=openai/gpt-oss-20b:free
```

## Vercel frontend Anta

Set env:

```text
NEXT_PUBLIC_OPENJARVIS_UI_URL=https://openjarvis-service.up.railway.app
```

Lalu buka Anta, tekan Ctrl/⌘+K, pilih `OpenJarvis`. UI OpenJarvis muncul di panel Monitor Anta.
