import os
import subprocess
import sys

if not os.getenv("OPENROUTER_API_KEY"):
    subprocess.check_call([sys.executable, "download_model.py"])

subprocess.check_call([
    "uvicorn",
    "main:app",
    "--host",
    "0.0.0.0",
    "--port",
    os.getenv("PORT", "8000"),
])
