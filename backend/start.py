import os
import subprocess
import sys

# download supertonic tts if requested
if os.getenv("ENABLE_TTS", "0") == "1":
    subprocess.check_call([sys.executable, "download_models.py"])

if os.getenv("AI_PROVIDER") == "local" and not os.getenv("OPENROUTER_API_KEY"):
    subprocess.check_call([sys.executable, "download_model.py"])

subprocess.check_call([
    "uvicorn",
    "main:app",
    "--host",
    "0.0.0.0",
    "--port",
    os.getenv("PORT", "8000"),
])
