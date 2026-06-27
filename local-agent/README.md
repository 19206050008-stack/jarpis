# Jarpis Local Agent

Agent lokal pendamping Jarpis untuk mendeteksi aplikasi aktif/window yang sedang kamu buka di PC/laptop secara realtime.

## Cara Menjalankan di Laptop/PC (Windows)

1. Pastikan Python sudah ter-install.
2. Masuk ke folder agent:
   ```bash
   cd local-agent
   ```
3. Install dependency:
   ```bash
   pip install -r requirements.txt
   ```
4. Jalankan agent:
   ```bash
   set JARPIS_AGENT_ID=default
   python agent.py
   ```
   Kalau banyak device/user, pakai `JARPIS_AGENT_ID` berbeda dan samakan dengan `localStorage.anta_agent_id` di browser.

Agent ini akan memantau aplikasi terdepan yang sedang kamu buka dan mengirim datanya ke server Jarpis secara otomatis. Jarpis akan merespons/mengigau secara spontan sesuai aktivitas terbarumu.
