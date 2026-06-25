# UI + Fitur Jarpis

## Keputusan utama

Chat AI tidak perlu Railway untuk mode gratis tanpa API key.

```text
Vercel Next.js
  -> Pollinations AI langsung dari browser
  -> Supabase untuk simpan chat
  -> Railway hanya untuk voice/service khusus nanti
```

Alasan:

- lebih cepat
- lebih murah
- lebih sedikit titik error
- tidak perlu GGUF/API key
- semua fitur awal bisa dipakai langsung

## Arah UI

Referensi yang dimaksud: gaya Jarvis/HUD futuristik.

Karena gambar referensi belum bisa dibuka langsung dari environment ini, desain dibuat dengan ciri yang aman:

- dark futuristic dashboard
- aksen cyan/biru neon
- orb AI di tengah/atas
- panel kaca/transparan
- sidebar command
- area utama bisa berganti mode
- chat tetap selalu tersedia
- mobile tetap bisa dipakai

## Fitur yang dibuat dulu karena bisa dipakai

### 1. Chat AI

Input bebas ke Jarpis.

Provider:

```text
Pollinations AI tanpa API key
```

Fallback:

```text
Railway /chat kalau NEXT_PUBLIC_API_URL diisi
```

### 2. Command launcher

Input yang sama bisa membaca perintah sederhana:

```text
/buka youtube.com
/cari berita pemilu hari ini
/cari gambar kota futuristik
/cari lagu lofi malam
/cari web tutorial next.js
/chat bantu buat outline novel
```

### 3. Web viewer dalam aplikasi

Untuk `/buka website`:

- tampilkan website di panel kanan via iframe jika situs mengizinkan
- kalau situs menolak iframe, tampilkan tombol `Buka di tab baru`

Catatan penting:

Banyak website besar memblokir iframe, misalnya Google, YouTube, Spotify, sebagian portal berita. Jadi fitur ini dibuat dengan fallback agar tetap berguna.

### 4. Search shortcuts yang pasti jalan

Karena pencarian web gratis tanpa API key sering dibatasi CORS, versi awal memakai search URL yang bisa dibuka langsung:

```text
web    -> DuckDuckGo
berita -> Google News / Bing News
gambar -> DuckDuckGo Images / Bing Images
lagu   -> YouTube search
```

Di UI hasilnya berupa:

- panel preview jika bisa di-embed
- tombol buka hasil pencarian di tab baru jika iframe diblokir

Ini lebih jujur dan terpakai daripada pura-pura punya search API tapi error.

### 5. Quick actions

Tombol cepat:

- Chat
- Web
- Berita
- Gambar
- Lagu
- Novel

Semua tombol hanya mengisi template command ke input, tidak bikin fitur mati.

## Fitur yang ditunda

Tidak dibuat dulu karena akan jadi pajangan/error tanpa API/key/izin browser:

- scraping hasil Google langsung
- crawling website otomatis
- play lagu langsung dari Spotify/YouTube
- browser penuh seperti Chrome di dalam app
- multi-tab browser kompleks
- realtime voice dua arah
- agent yang klik website sendiri

## Batasan teknis yang harus diterima

### Website di dalam aplikasi

Tidak semua website bisa dibuka dalam iframe karena header:

```text
X-Frame-Options
Content-Security-Policy frame-ancestors
```

Solusi minimal:

```text
iframe kalau bisa, tombol open tab kalau tidak
```

### Cari berita/gambar/lagu

Tanpa API key, cara stabil adalah membuka search URL.

Kalau nanti ingin hasil list native di aplikasi, perlu salah satu:

- SerpAPI
- Brave Search API
- Tavily
- Bing Search API
- custom scraper backend

Itu semua bukan versi gratis tanpa risiko.

## Urutan implementasi berikutnya

1. Ubah frontend agar AI langsung ke Pollinations.
2. Tambah command parser kecil di frontend.
3. Tambah layout dashboard Jarvis/HUD.
4. Tambah web/search viewer panel.
5. Simpan chat/perintah ke Supabase.
6. Baru sambungkan voice Railway kalau chat + command stabil.

## Definisi selesai tahap ini

Tahap ini dianggap selesai kalau:

- user bisa chat dengan Jarpis
- user bisa `/buka website`
- user bisa `/cari berita ...`
- user bisa `/cari gambar ...`
- user bisa `/cari lagu ...`
- kalau iframe gagal, ada tombol buka tab baru
- riwayat tetap tersimpan ke Supabase
