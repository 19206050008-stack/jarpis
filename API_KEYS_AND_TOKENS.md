# API Keys & Tokens Jarpis

Daftar key/token yang dibutuhkan sesuai flowchart + kode sekarang.

## Wajib

### 1. Supabase

Env backend:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Dipakai untuk:
- `sessions`
- `messages`
- `memories`

Cara buat:
1. Buka Supabase.
2. Create project.
3. Masuk `Project Settings`.
4. Buka `API`.
5. Copy:
   - `Project URL` ke `SUPABASE_URL`
   - `service_role secret` ke `SUPABASE_SERVICE_ROLE_KEY`
6. Buka `SQL Editor`.
7. Jalankan isi file:

```text
supabase/schema.sql
```

Catatan: `service_role` hanya boleh di backend/Railway, jangan di frontend/Vercel.

---

### 2. AI Chat Provider

Pilih salah satu dulu.

#### Opsi A — OpenRouter

Env backend:

```env
OPENROUTER_API_KEYS=
OPENROUTER_MODEL=openai/gpt-oss-20b:free
```

Cara buat:
1. Buka https://openrouter.ai
2. Login.
3. Buka `Keys`.
4. Create API key.
5. Copy key ke `OPENROUTER_API_KEYS`.

Beberapa key bisa dipisah koma:

```env
OPENROUTER_API_KEYS=key1,key2,key3
```

#### Opsi B — OpenAgentic

Env backend:

```env
OPENAGENTIC_API_KEY=
OPENAGENTIC_MODEL=open-agentic
```

Cara buat:
1. Login ke platform OpenAgentic.
2. Buat API key.
3. Masukkan ke Railway env.

---

## Opsional Sesuai Flowchart

### 3. Google Calendar

Env backend sekarang:

```env
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/oauth/google/callback
```

Dipakai untuk:
- cek jadwal kalender
- contoh chat: `cek jadwal kalender`

Cara buat token:
1. Buka Google Cloud Console.
2. Create project.
3. Enable API: `Google Calendar API`.
4. Buka `APIs & Services > OAuth consent screen`.
5. Pilih `External` atau `Internal`.
6. Isi app name.
7. Tambah scope read calendar:

```text
https://www.googleapis.com/auth/calendar.readonly
```

Kalau nanti mau buat event, tambah:

```text
https://www.googleapis.com/auth/calendar.events
```

8. Buka `Credentials`.
9. Create `OAuth Client ID`.
10. Pilih `Desktop app` untuk test lokal.
11. Isi `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET`.
12. Jalankan backend lokal.
13. Buka `http://127.0.0.1:8000/oauth/google/url`.
14. Copy nilai `url`, buka di browser, login Google.
15. Setelah redirect, browser menampilkan JSON token.
16. Copy `refresh_token` ke:

```env
GOOGLE_REFRESH_TOKEN=
```

Catatan: `GOOGLE_CALENDAR_TOKEN` boleh kosong kalau `GOOGLE_REFRESH_TOKEN` sudah ada.

---

### 4. Spotify

Env backend:

```env
SPOTIFY_ACCESS_TOKEN=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/oauth/spotify/callback
```

Dipakai untuk:
- `spotify sedang putar apa`
- `putar lagu [judul]`
- `pause lagu`

Scope yang dibutuhkan:

```text
user-read-playback-state
user-read-currently-playing
user-modify-playback-state
```

Cara buat:
1. Buka https://developer.spotify.com/dashboard
2. Login.
3. Create app.
4. Isi redirect URI lokal, contoh:

```text
http://127.0.0.1:8888/callback
```

5. Simpan.
6. Ambil `Client ID` dan `Client Secret`.
7. Isi `SPOTIFY_CLIENT_ID` dan `SPOTIFY_CLIENT_SECRET`.
8. Jalankan backend lokal.
9. Buka `http://127.0.0.1:8000/oauth/spotify/url`.
10. Copy nilai `url`, buka di browser, login Spotify.
11. Setelah redirect, browser menampilkan JSON token.
12. Copy `refresh_token` ke:

```env
SPOTIFY_REFRESH_TOKEN=
```

Catatan:
- Beberapa endpoint playback butuh Spotify Premium.
- `SPOTIFY_ACCESS_TOKEN` boleh kosong kalau `SPOTIFY_REFRESH_TOKEN` sudah ada.

---

## Opsional TTS

### 5. Supertonic local TTS

Tidak butuh API key.

Env backend:

```env
ENABLE_TTS=1
```

Catatan:
- Kalau `ENABLE_TTS=1`, Railway akan download model TTS.
- Kalau storage/memory Railway kecil, bisa berat.
- Kalau belum perlu suara server, pakai:

```env
ENABLE_TTS=0
```

### 6. ElevenLabs TTS Cloud

Env backend:

```env
ELEVENLABS_API_KEYS=
ELEVENLABS_VOICE_ID=
```

Cara buat:
1. Buka https://elevenlabs.io
2. Login.
3. Buka profile/API keys.
4. Create API key.
5. Isi ke `ELEVENLABS_API_KEYS`.

Ini opsional. Flowchart memakai Custom TTS Engine, jadi Supertonic cukup dulu.

---

## Tidak Butuh API Key

### 7. DuckDuckGo Search

Tidak butuh key.

Dipakai untuk:
- `cari ...`
- `harga ...`

### 8. Google News RSS

Tidak butuh key.

Dipakai untuk:
- `berita ...`
- `artikel ...`

### 9. Marketplace Search

Tidak butuh key untuk versi sekarang.

Sekarang diganti jadi:
- search web
- fallback link Shopee/Tokopedia

---

## Tidak Dipakai

### Gemini

Tidak perlu:

```env
GEMINI_API_KEY=
```

Karena diminta jangan pakai Gemini.

### DrissionPage / Cloudflare bypass

Tidak dipakai. Diganti dengan:
- search marketplace
- link resmi Shopee/Tokopedia
- nanti kalau ada API resmi, pakai API resmi.

---

## Live OAuth Redirect

Untuk live, pakai URL backend Railway, bukan localhost.

Untuk domain kamu, pakai callback lewat frontend `antasiar.my.id` lalu Next.js proxy ke backend.

```env
BACKEND_PUBLIC_URL=https://antasiar.my.id
GOOGLE_REDIRECT_URI=https://antasiar.my.id/oauth/google/callback
SPOTIFY_REDIRECT_URI=https://antasiar.my.id/oauth/spotify/callback
```

Lalu tambahkan exact URL ini di:
- Google Cloud Console > OAuth Client > Authorized redirect URIs
- Spotify Developer Dashboard > App > Redirect URIs

Kalau ada error `redirect_uri: Not matching configuration`, artinya URL di env dan dashboard belum sama persis.

## Env Final Railway Backend

Minimal:

```env
AI_PROVIDER=auto
OPENROUTER_API_KEYS=
OPENROUTER_MODEL=openai/gpt-oss-20b:free

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

CORS_ORIGINS=https://domain-vercel-kamu.vercel.app,http://localhost:3000,http://127.0.0.1:3000

MAX_TOKENS=220
ENABLE_TTS=0
BACKEND_PUBLIC_URL=https://antasiar.my.id
GOOGLE_REDIRECT_URI=https://antasiar.my.id/oauth/google/callback
SPOTIFY_REDIRECT_URI=https://antasiar.my.id/oauth/spotify/callback
```

Opsional:

```env
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/oauth/google/callback

SPOTIFY_ACCESS_TOKEN=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/oauth/spotify/callback

ELEVENLABS_API_KEYS=
ELEVENLABS_VOICE_ID=
```

## Env Vercel Frontend

```env
NEXT_PUBLIC_API_URL=https://backend-railway-kamu.up.railway.app
```

## Yang Masih Perlu Dibuat

1. Refresh token Google Calendar.
2. Refresh token Spotify.
3. Create event Google Calendar.
4. LangChain orchestrator asli.
5. pgvector embedding memory asli.
