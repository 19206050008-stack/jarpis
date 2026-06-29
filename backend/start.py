import atexit
import os
import subprocess
import sys
import time


def _first_env_key(*names: str) -> str:
    for name in names:
        for value in os.getenv(name, "").split(","):
            value = value.strip()
            if value:
                return value
    return ""


def _ensure_anta_jarvis() -> bool:
    try:
        import openjarvis  # noqa: F401
        return True
    except ModuleNotFoundError:
        pass

    for base in ("anta-jarvis", "backend/anta-jarvis"):
        if os.path.isdir(base):
            print("Installing Anta Jarvis package...", flush=True)
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-cache-dir", f"./{base}[server,inference-cloud]"])
            return True

    print("Anta Jarvis folder not found; backend will continue without it", flush=True)
    return False


# download supertonic tts automatically if models not present
subprocess.check_call([sys.executable, "download_models.py"])

if os.getenv("AI_PROVIDER") == "local" and not os.getenv("OPENROUTER_API_KEY"):
    subprocess.check_call([sys.executable, "download_model.py"])

jarvis_proc = None
if os.getenv("ENABLE_ANTA_JARVIS", "1") != "0":
    openrouter_key = _first_env_key("OPENROUTER_API_KEY", "OPENROUTER_API_KEYS")
    if openrouter_key and _ensure_anta_jarvis():
        os.environ.setdefault("OPENROUTER_API_KEY", openrouter_key)
        model = os.getenv("OPENJARVIS_MODEL") or os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b:free")
        if os.getenv("OPENROUTER_API_KEY") and "/" in model and not model.startswith("openrouter/"):
            model = f"openrouter/{model}"
        os.environ["OPENJARVIS_MODEL"] = model
        os.environ.setdefault("OPENJARVIS_URL", "http://127.0.0.1:8765")
        jarvis_port = os.getenv("ANTA_JARVIS_PORT", "8765")
        print(f"Starting Anta Jarvis on 127.0.0.1:{jarvis_port} model={os.environ['OPENJARVIS_MODEL']}", flush=True)
        jarvis_proc = subprocess.Popen([
            sys.executable, "-m", "openjarvis.cli.__main__", "--quiet", "serve",
            "--host", "127.0.0.1",
            "--port", jarvis_port,
            "--engine", "cloud",
            "--model", os.environ["OPENJARVIS_MODEL"],
            "--agent", "simple",
        ])
        atexit.register(lambda: jarvis_proc and jarvis_proc.terminate())
        time.sleep(8)
        if jarvis_proc.poll() is not None:
            print(f"Anta Jarvis exited early with code {jarvis_proc.returncode}; backend will continue without it", flush=True)

subprocess.check_call([
    "uvicorn",
    "main:app",
    "--host",
    "0.0.0.0",
    "--port",
    os.getenv("PORT", "8000"),
])
