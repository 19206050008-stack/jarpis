# JARPIS AI — Asisten Personal Universal & Realtime

Jarpis adalah asisten AI personal bergaya fiksi ilmiah (Sci-Fi HUD) yang berjalan di web secara realtime. Jarpis memiliki "otak" universal, visualizer 3D interaktif, kemampuan sintesis suara bahasa Indonesia, serta dapat terintegrasi dengan aktivitas lokal di komputer/HP kamu.

---

## 🚀 Fitur yang Sudah Aktif & Berjalan Nyata

### 1. Visualizer 3D Orb Jarpis
*   **Equalizer Realtime**: Orb di tengah layar berdenyut dan bergerak mengikuti volume/frekuensi suara asli Jarpis saat berbicara (menggunakan Web Audio API).
*   **Elastic Drag & Shake**: Orb interaktif dapat diklik, digeser bebas ke mana saja dengan efek elastis seperti karet, dan akan bergetar (shake) jika diklik cepat.
*   **Reaksi Spontan**: Jarpis secara spontan akan mengeluh atau merespons secara humoris jika badannya ditarik/dicubit.
*   **Random Morphing**: Saat idle, orb otomatis berganti mode bentuk secara dinamis (spin, slime, melt, bounce, creature).

### 2. Percakapan Instan (Low Latency)
*   **Instant Acknowledgment**: Begitu user mengirim pesan, Jarpis memberikan konfirmasi instan di UI dan suara sebelum jawaban utuh selesai dimuat (menghilangkan rasa delay).
*   **Karaoke Subtitle**: Subtitle melayang bergaya fiksi ilmiah yang muncul kata-per-kata secara mengalir selaras dengan dimulainya suara asli, dan bubble subtitle otomatis hilang hanya saat suara benar-benar selesai diputar.
*   **Smart Prompts**: Jawaban bersih tanpa markdown (`*`, `#`), debug commands, atau kutipan aneh. Jarpis selalu membalas dengan gaya natural layaknya manusia dan menutupnya dengan pertanyaan santai.
*   **Local Cache**: Jawaban dari prompt yang sama akan disimpan di `localStorage` agar balasan berikutnya muncul instan tanpa load API.

### 3. Idle Speech & Internet Awareness
*   **Mengigau Cerdas**: Jika didiamkan (idle) selama 8 hingga 40 detik, Jarpis akan tiba-kira menggerundel atau mengigau secara random (tidak monoton) menggunakan berbagai bahasa (Indonesia, Inggris, Jepang, Spanyol).
*   **Live News Input**: Igauan Jarpis terhubung secara berkala dengan portal berita hari ini untuk memberikan komentar/humor segar berdasarkan artikel nyata dari media kredibel (*Kompas, Tempo, BBC, CNN*).

### 4. 10 Pilihan Suara Bahasa Indonesia (TTS)
*   **Default Andi**: Menggunakan suara default pria "Andi".
*   **Ubah Via Perintah**: Kamu bisa menyuruh Jarpis mengganti suaranya kapan saja langsung lewat chat/suara (contoh: *"ganti suara dewi"*, *"ubah suara budi"*).
*   **Pilihan Suara**: Sari, Dewi, Ayu, Rina, Maya (Wanita) & Budi, Agus, Bayu, Dimas, Andi (Pria).

### 5. Multi-Popup Draggable Desk
*   **Fleksibilitas Panel**: Panel `Chat` dan `Monitor` berbentuk popup melayang yang bisa digeser, dikecilkan (minimize), atau ditutup.
*   **Sci-Fi Loading Overlay**: Menampilkan indikator loading hologram bertuliskan *"Jarpis memuat data..."* saat sedang memproses perintah pencarian.
*   **Voice Input**: Fitur rekam suara (mikrofon) langsung di dock bawah untuk mengirim perintah suara dalam bahasa Indonesia.

### 6. Perintah & Akses Sistem (Bukan Dummy)
*   **Akses Folder**: Melalui izin File System Access API, Jarpis bisa mencari file lokal di folder yang kamu izinkan dan membukanya di browser (perintah: *"izin folder"*, *"cari file bab 1"*, *"buka file pertama"*).
*   **Buka Aplikasi**: Jarpis bisa membuka aplikasi di HP/PC secara langsung (WhatsApp, Spotify, Telegram, Gmail, Maps, YouTube) dengan memberikan kalimat sapaan cerdas/rekomendasi dinamis dari AI sesaat sebelum aplikasi terbuka.
*   **Jarpis Secure Proxy**: Fitur `/buka [url]` memuat website secara langsung di panel monitor kanan dengan menembus batasan block iframe (X-Frame-Options/CORS).
*   **Embedded Media & News**: Fitur `/berita [topik]` dan `/lagu [musik]` memuat berita RSS terhangat dan YouTube Player resmi langsung di dalam panel aplikasi.

### 7. Pendamping Realtime: Jarpis Local Agent
*   **Active Window Tracking**: Script python ringan (`agent.py`) yang berjalan di background laptop/HP kamu untuk memantau aplikasi apa yang sedang aktif kamu buka secara nyata.
*   **Aktivasi Pintar**: Banner notifikasi agent muncul di bagian atas untuk mengaktifkan pemantauan. Setelah diaktifkan sekali, banner tidak akan pernah muncul lagi.
*   **Proactive Greeting**: Jarpis langsung menyapa kamu secara spontan dan humoris begitu tahu kamu membuka aplikasi tertentu di laptop (misal: membuka Spotify -> Jarpis menyarankan lagu).

---

## 🛠️ Arsitektur Teknologi

*   **Frontend**: Next.js (TypeScript, globals.css untuk animasi 3D, Web Audio API, Local Storage)
*   **Backend**: Python FastAPI (Inference audio via `sherpa-onnx` dan SupertonicTTS 3, RSS parser, proxy bypass)
*   **Database**: Supabase (Menyimpan tabel `chat_messages` dan `memories` secara otomatis di background)
*   **AI Engine**: Pollinations AI (Hosted API untuk chat tanpa kunci)

---

## 📂 Struktur Project

```text
jarpis/
├── backend/
│   ├── main.py             # Server FastAPI (Chat proxy, TTS, news API, web proxy)
│   ├── download_models.py  # Auto-download model suara ONNX Indonesia
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── globals.css     # Animasi visualizer 3D orb, popup desk, sci-fi styles
│   │   └── page.tsx        # UI & Logika interaksi Jarpis
│   ├── package.json
│   └── tsconfig.json
├── local-agent/
│   ├── agent.py            # Active window tracker (background OS script)
│   └── README.md           # Panduan setup lokal
├── supabase/
│   └── schema.sql          # Struktur database
└── README.md
```
