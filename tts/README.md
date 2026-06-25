# Indonesian TTS Server (Edge TTS + sherpa-onnx)

Self-hosted, no API key. Powers the `/api/tts` route in the Next.js app.
Menggabungkan beberapa engine dalam satu API:

1. **Microsoft Edge TTS** (online, kualitas tinggi, tanpa API key)
   - `gadis` → id-ID-GadisNeural (Indonesia, wanita)
   - `ardi`  → id-ID-ArdiNeural (Indonesia, pria)
   Output: MP3.

2. **sherpa-onnx** (offline, ONNX/onnxruntime, tanpa torch, RAM rendah)
   - `indo-piper` → Piper Indonesia (VITS).
   - `neural-1` … `neural-10` → **SupertonicTTS 3** (10 suara Indonesia,
     `sid` 0-9, `lang=id`). Satu model int8 ringan, banyak suara.
   Model diunduh saat build, dimuat lazy. Output: WAV.

## Jalankan dengan Docker (disarankan)

```bash
cd tts-server
docker build -t ditulis-tts .
docker run -p 8080:8080 ditulis-tts
```

## Jalankan manual (Python 3.10–3.12)

```bash
cd tts-server
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python download_models.py
uvicorn app:app --host 0.0.0.0 --port 8080
```

## Uji

```bash
curl http://localhost:8080/health
# Edge (mp3):
curl -X POST http://localhost:8080/speak -H "Content-Type: application/json" \
  -d '{"text":"Halo dunia","speaker":"gadis"}' -o gadis.mp3
# Logat daerah (wav):
curl -X POST http://localhost:8080/speak -H "Content-Type: application/json" \
  -d '{"text":"Sugeng enjing","speaker":"jawa"}' -o jawa.wav
```

`GET /health` mengembalikan daftar voice yang benar-benar tersedia (voice MMS
yang gagal diunduh otomatis disembunyikan).

## Sambungkan ke Next.js

`.env.local` (dan host produksi):

```
LOCAL_TTS_URL=http://localhost:8080
```

Route `/api/tts` memakai server ini (tanpa fallback). Halaman `/tts-demo`
mengambil daftar voice dari `GET /api/tts` lalu menampilkannya per grup.

## Deploy ke Railway

1. **New** → **Deploy from GitHub repo**.
2. **Settings** service:
   - **Root Directory**: `tts-server`
   - **Builder**: Dockerfile (otomatis via `railway.json`)
3. Build mengunduh model ONNX kecil (tanpa torch). RAM saat jalan rendah karena
   model dimuat lazy + LRU cache (maks 3 model di memori).
4. **Settings → Networking → Generate Domain** untuk URL publik.
5. Uji `https://<domain>/health`.

### Sambungkan ke Vercel

**Settings → Environment Variables**:

```
LOCAL_TTS_URL = https://<domain-railway-anda>.up.railway.app
```

> Railway otomatis menyuntik `PORT`; Dockerfile listen ke `$PORT`. Tanpa API key.
> Catatan: voice Edge (Indonesia/Melayu) butuh koneksi keluar ke Microsoft;
> voice daerah (MMS/Piper) sepenuhnya offline di server.
