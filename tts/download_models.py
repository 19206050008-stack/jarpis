"""Download lightweight ONNX TTS models (sherpa-onnx) at build time.

These are small VITS models (~30-40MB each) converted from Meta MMS and Piper.
They run on onnxruntime (no torch), so RAM stays low.

Source: https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models

The download is fault-tolerant: if any archive is missing/unavailable, it is
skipped (a warning is logged) and the server simply won't offer that voice.
"""
import os
import sys
import tarfile
import urllib.request

BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"
MODELS_DIR = os.environ.get("MODELS_DIR", "models")

# Archive base names (without .tar.bz2).
ARCHIVES = [
    "sherpa-onnx-supertonic-3-tts-int8-2026-05-11",  # SupertonicTTS (10 suara id)
]

os.makedirs(MODELS_DIR, exist_ok=True)

for name in ARCHIVES:
    target = os.path.join(MODELS_DIR, name)
    if os.path.isdir(target):
        print(f"skip {name} (exists)")
        continue
    url = f"{BASE}/{name}.tar.bz2"
    archive = os.path.join(MODELS_DIR, f"{name}.tar.bz2")
    try:
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, archive)
        print(f"extracting {name}")
        with tarfile.open(archive, "r:bz2") as tf:
            tf.extractall(MODELS_DIR)
        os.remove(archive)
        print(f"  ok {name}")
    except Exception as e:  # noqa: BLE001
        print(f"  WARN failed {name}: {e}", file=sys.stderr)
        try:
            if os.path.exists(archive):
                os.remove(archive)
        except OSError:
            pass

print("done")
