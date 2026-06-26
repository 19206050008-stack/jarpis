# Riset Asset 3D Ringan untuk Orb Jarpis

Kebutuhan:

- tampil cepat di Vercel
- tidak menambah beban besar
- bisa berubah bentuk/bergerak realtime mengikuti audio
- tidak butuh asset berat atau loader 3D kompleks

## Opsi

### 1. CSS 3D procedural orb — dipakai sekarang

Ukuran tambahan: hampir 0 KB.

Kelebihan:

- sangat ringan
- tidak perlu download asset
- bisa spin, bounce, melt, slime, creature
- bisa dikontrol command
- bisa bereaksi realtime ke audio analyzer

Kekurangan:

- bukan model 3D GLB asli
- bentuk hewan hanya abstrak/stylized

### 2. Three.js + GLB

Ukuran tambahan: besar, ratusan KB sampai MB.

Kelebihan:

- 3D asli
- bisa pakai model hewan/robot

Kekurangan:

- lebih berat
- butuh asset GLB
- butuh loader
- animasi realtime lebih kompleks

### 3. Spline embed

Kelebihan:

- visual bagus

Kekurangan:

- tergantung layanan luar
- berat
- kurang cocok untuk realtime audio ringan

## Keputusan

Pakai CSS 3D procedural orb dulu.

Alasan: paling ringan dan benar-benar jalan di semua deploy. Kalau nanti butuh model 3D asli, baru tambah satu GLB kecil khusus, bukan semua bentuk/hewan sekaligus.
