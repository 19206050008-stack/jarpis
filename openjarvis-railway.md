# Anta Jarvis di Railway

Sekarang OpenJarvis sudah digabung ke backend sebagai `backend/anta-jarvis`.

Tidak perlu service Railway kedua.

Railway cukup deploy backend Jarpis seperti biasa. Saat start, `backend/start.py` akan:

1. ambil `OPENROUTER_API_KEYS` pertama,
2. menjalankan Anta Jarvis internal di `127.0.0.1:8765`,
3. menjalankan backend Jarpis di `$PORT`,
4. expose Anta Jarvis lewat proxy publik `/jarvis`.

Env yang perlu ada di Railway backend Jarpis:

```text
OPENROUTER_API_KEYS=sk-or-...
OPENROUTER_MODEL=openai/gpt-oss-20b:free
ENABLE_ANTA_JARVIS=1
```

Opsional:

```text
OPENJARVIS_MODEL=openai/gpt-oss-20b:free
ANTA_JARVIS_PORT=8765
```

Frontend tidak perlu setting tambahan. Tombol OpenJarvis di orb membuka:

```text
https://jarpis-production-a270.up.railway.app/jarvis/
```

di dalam panel Monitor Anta.

Matikan Anta Jarvis internal:

```text
ENABLE_ANTA_JARVIS=0
```
