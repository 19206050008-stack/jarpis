import os
import sys
import tarfile
import urllib.request

BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"
MODELS_DIR = os.environ.get("MODELS_DIR", "models")

ARCHIVES = [
    "sherpa-onnx-supertonic-3-tts-int8-2026-05-11",
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
    except Exception as e:
        print(f"  WARN failed {name}: {e}", file=sys.stderr)
        try:
            if os.path.exists(archive):
                os.remove(archive)
        except OSError:
            pass

print("done")
