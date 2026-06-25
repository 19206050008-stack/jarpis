# Riset Singkat Referensi Jarpis

## GitHub UI reference

Ditemukan lewat GitHub search API:

- https://github.com/Kartik-2005-K/jarvis-assistant-ui
- https://github.com/hsirkar/jarvis-react
- https://github.com/Evan620/jarvis-ui
- https://github.com/raza-fast/jarvis-ai-assistant
- https://github.com/niranjandascp/Jarvis-AI-Assistant
- https://github.com/Dark-Vinaal/vinaal_portfolio

Pola yang bisa dipakai:

- HUD gelap
- orb / scanner di tengah
- panel modular
- aksen cyan neon
- command sidebar
- area output/monitor

## Provider AI tanpa API key

Yang langsung bisa dipakai dari browser/backend:

```text
https://text.pollinations.ai/prompt/{prompt}
```

Sudah dites dan menjawab cepat.

## Search tanpa API key

Untuk fitur cari yang benar-benar jalan tanpa API key:

- Web: DuckDuckGo URL
- Berita: Bing News URL
- Gambar: Bing Images URL
- Lagu: YouTube search URL

Catatan:

Search API native tanpa key tidak stabil. URL search lebih pasti jalan.

## Website dalam aplikasi

Website dibuka via iframe. Batasan:

- sebagian website memblokir iframe
- fallback wajib: tombol buka tab baru

Ini bukan skip fitur, ini batasan browser/security website.
