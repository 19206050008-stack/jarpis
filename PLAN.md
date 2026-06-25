# PLAN Jarpis

## Tujuan

Membuat asisten AI berbasis web:

```text
Next.js UI di Vercel
  -> Python FastAPI di Railway
  -> Qwen3-0.6B GGUF berjalan di Railway
  -> Supabase untuk auth, database, dan memory
```

Fokus awal: chat teks dulu. Voice, wake word, dan automation ditunda.

## Prinsip versi awal

- Satu user flow dulu: user kirim pesan, AI jawab streaming.
- Model GGUF tidak jalan lokal user; model berjalan di Railway.
- Supabase hanya untuk simpan data, bukan inference.
- Tidak bikin agent kompleks sebelum chat dasar stabil.

## Tahap 1 — Backend AI di Railway

Buat service Python minimal:

```text
jarpis/backend/
  main.py
  requirements.txt
  download_model.py
  Procfile atau railway start command
```

Fitur:

- FastAPI endpoint `POST /chat`
- load `Qwen3-0.6B-Q8_0.gguf` pakai `llama-cpp-python`
- streaming response teks
- CORS untuk domain Vercel
- health check `GET /health`

Catatan:

- Model diunduh dari Hugging Face saat deploy/start.
- Untuk awal boleh download saat start; kalau lambat, pindah ke Railway volume/build step.
- Batasi concurrency dulu: satu proses, satu model.

## Tahap 2 — UI Next.js di Vercel

Buat frontend minimal:

```text
jarpis/frontend/
  app/
  package.json
  .env.example
```

Fitur:

- halaman chat sederhana
- input pesan
- tampilkan jawaban streaming dari Railway
- loading/error state sederhana

Belum perlu:

- dashboard besar
- multi-agent
- plugin system
- voice UI

## Tahap 3 — Supabase

Tambahkan database setelah chat dasar jalan.

Tabel minimal:

```sql
profiles
chat_sessions
chat_messages
memories
```

Fitur:

- simpan pesan user dan AI
- list riwayat chat
- memory sederhana per user/project

Auth bisa ditambahkan setelah penyimpanan chat berjalan.

## Tahap 4 — Knowledge novel

Hubungkan Jarpis dengan file/proyek novel.

Fitur minimal:

- upload atau simpan dokumen ke Supabase
- ambil potongan dokumen relevan
- masukkan sebagai konteks prompt

Referensi lokal repo ini:

```text
otak/01-knowledge-penulisan-novel.md
otak/02-eyd-puebi.md
otak/03-cek-metafor.md
otak/04-cek-pola-ai.md
otak/05-syarat-jumlah-kata.md
otak/06-cek-inkonsistensi.md
```

## Tahap 5 — Suara / TTS

Jika service suara sudah ada di Railway, pakai itu sebagai service terpisah dari otak AI.

Flow minimal:

```text
Next.js
  -> Railway AI service: menghasilkan teks
  -> Railway Voice service: teks menjadi audio
  -> Next.js memutar audio
```

Fitur awal:

- pilih 1 dari 10 suara
- kirim teks jawaban AI ke endpoint TTS
- terima audio URL atau audio stream
- simpan voice id di setting user

Belum perlu:

- voice realtime dua arah
- interrupt saat AI bicara
- lip sync/avatar
- wake word

## Tahap 6 — Evaluasi model

Uji Qwen3-0.6B GGUF untuk tugas nyata:

- jawab chat pendek
- ringkas bab pendek
- cek inkonsistensi sederhana
- revisi paragraf

Jika kualitas kurang:

- tetap pakai Qwen kecil untuk tugas ringan
- tambahkan provider AI eksternal untuk tugas berat

## Risiko utama

1. Railway CPU lambat untuk inference.
2. Cold start lambat karena load/download model.
3. Qwen3 0.6B mungkin kurang kuat untuk analisis novel panjang.
4. Streaming/CORS bisa bermasalah saat Vercel -> Railway.

## Keputusan teknis awal

- Backend: FastAPI
- Runtime model: llama-cpp-python
- Model: Qwen/Qwen3-0.6B-GGUF, file `Qwen3-0.6B-Q8_0.gguf`
- Frontend: Next.js
- Hosting frontend: Vercel
- Hosting backend: Railway
- Database: Supabase
- Streaming: HTTP streaming dulu, bukan WebSocket

## Urutan kerja berikutnya

1. Buat `jarpis/backend` minimal.
2. Jalankan backend lokal untuk tes endpoint, tanpa Supabase.
3. Deploy backend ke Railway.
4. Buat `jarpis/frontend` minimal.
5. Deploy frontend ke Vercel.
6. Baru tambahkan Supabase chat history.

## Yang sengaja ditunda

- voice assistant
- wake word “Hey Jarvis”
- realtime WebSocket
- agent tools/plugin
- multi-user dashboard kompleks
- RAG/vector database
- pembayaran/subscription

Tambah hanya kalau chat dasar sudah terbukti jalan dan dipakai.
