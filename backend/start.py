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


def _ensure_openjarvis() -> bool:
    try:
        import openjarvis  # noqa: F401
        return True
    except ModuleNotFoundError:
        pass

    for base in ("anta-jarvis", "backend/anta-jarvis"):
        if os.path.isdir(base):
            print("Installing Anta local agent package...", flush=True)
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-cache-dir", f"./{base}[server,inference-cloud]"])
            return True

    print("Anta local agent package folder not found; backend will continue without it", flush=True)
    return False


# ponytail: hosted deploy should not download a TTS model unless explicitly asked.
if os.getenv("ENABLE_TTS") == "1":
    subprocess.check_call([sys.executable, "download_models.py"])

if os.getenv("AI_PROVIDER") == "local" and not os.getenv("OPENROUTER_API_KEY"):
    subprocess.check_call([sys.executable, "download_model.py"])

agent_proc = None
if os.getenv("ENABLE_ANTA_JARVIS", "1") != "0":
    openrouter_key = _first_env_key("OPENROUTER_API_KEY", "OPENROUTER_API_KEYS")
    if openrouter_key and _ensure_openjarvis():
        os.environ.setdefault("OPENROUTER_API_KEY", openrouter_key)
        model = os.getenv("OPENJARVIS_MODEL") or os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b:free")
        if os.getenv("OPENROUTER_API_KEY") and "/" in model and not model.startswith("openrouter/"):
            model = f"openrouter/{model}"
        os.environ["OPENJARVIS_MODEL"] = model
        os.environ.setdefault("OPENJARVIS_URL", "http://127.0.0.1:8765")
        jarvis_port = os.getenv("ANTA_JARVIS_PORT", "8765")
        print(f"Starting Anta local agent on 127.0.0.1:{jarvis_port} model={os.environ['OPENJARVIS_MODEL']}", flush=True)
        agent_proc = subprocess.Popen([
            sys.executable, "-m", "openjarvis.cli.__main__", "--quiet", "serve",
            "--host", "127.0.0.1",
            "--port", jarvis_port,
            "--engine", "cloud",
            "--model", os.environ["OPENJARVIS_MODEL"],
            "--agent", "simple",
        ])
        atexit.register(lambda: agent_proc and agent_proc.terminate())
        time.sleep(8)
        if agent_proc.poll() is not None:
            print(f"Anta local agent exited early with code {agent_proc.returncode}; backend will continue without it", flush=True)

subprocess.check_call([
    "uvicorn",
    "main:app",
    "--host",
    "0.0.0.0",
    "--port",
    os.getenv("PORT", "8000"),
])
