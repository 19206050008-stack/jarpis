# Anta Jarvis on Railway

Folder ini adalah salinan OpenJarvis yang dipasang di backend repo Jarpis.

Start command service Railway terpisah:

```bash
cd backend/anta-jarvis && python -m pip install uv && python -m uv sync --extra server --extra inference-cloud && python -m uv run jarvis serve --host 0.0.0.0 --port $PORT --engine cloud --model $OPENJARVIS_MODEL --agent simple
```

Env:

```text
OPENROUTER_API_KEY=sk-or-...
OPENJARVIS_MODEL=openai/gpt-oss-20b:free
```

Lalu di service backend Jarpis isi:

```text
OPENJARVIS_URL=https://service-anta-jarvis.up.railway.app
OPENJARVIS_MODEL=openai/gpt-oss-20b:free
```
