# Anta Jarvis internal

Folder ini vendored OpenJarvis untuk backend Jarpis.

Tidak perlu service Railway terpisah. `../start.py` menjalankan service ini otomatis kalau env berikut ada:

```text
OPENROUTER_API_KEYS=sk-or-...
OPENROUTER_MODEL=openai/gpt-oss-20b:free
ENABLE_ANTA_JARVIS=1
```

Service internal berjalan di:

```text
http://127.0.0.1:8765
```

Backend Jarpis expose ke publik lewat:

```text
/jarvis
```
