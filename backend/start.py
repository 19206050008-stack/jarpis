import subprocess
import sys

subprocess.check_call([sys.executable, "download_models.py"])

if __name__ == "__main__":
    subprocess.check_call([
        "uvicorn",
        "main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ])
