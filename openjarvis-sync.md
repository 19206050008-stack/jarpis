# OpenJarvis Sync

Clone ada di `../OpenJarvis`.

## Jalankan OpenJarvis lokal

```bash
cd ../OpenJarvis
uv sync --extra server
uv run jarvis serve --host 127.0.0.1 --port 8765 --agent simple
```

## Hubungkan Jarpis/Anta ke OpenJarvis

Isi env backend:

```text
OPENJARVIS_URL=http://127.0.0.1:8765
OPENJARVIS_API_KEY=
OPENJARVIS_MODEL=
```

`OPENJARVIS_MODEL` boleh kosong; backend ambil model pertama dari `/v1/models`.

## Test

```bash
curl http://127.0.0.1:8000/providers
curl -X POST http://127.0.0.1:8000/chat -H "Content-Type: application/json" -d "{\"message\":\"Halo, pakai OpenJarvis?\"}"
```
