@echo off
start "Jarpis Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000"
start "Jarpis Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
