Start-Process powershell -ArgumentList '-NoExit','-Command','cd "' + $PSScriptRoot + '\backend"; python -m uvicorn main:app --host 127.0.0.1 --port 8000'
Start-Process powershell -ArgumentList '-NoExit','-Command','cd "' + $PSScriptRoot + '\frontend"; npm run dev'
