# Setup Backend API URL

## Development (Local)

Create `.env.local` in `frontend/` directory:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Production (Vercel)

Set environment variable di Vercel dashboard:

```
NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
```

Atau jika backend di-deploy di Railway, gunakan Railway URL.

## Cara Cek Backend Running

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Buka http://localhost:8000/docs untuk melihat API documentation.

## Jika Backend Tidak Tersedia

Aplikasi akan fallback:
- Command `buka [website]` akan membuka di tab baru browser
- Berita, lagu, dan pencarian akan tetap berfungsi (langsung ke sumber)
