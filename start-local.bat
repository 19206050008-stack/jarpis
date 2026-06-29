@echo off
start "Anta Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000"
start "Anta Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
