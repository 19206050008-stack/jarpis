import os
from huggingface_hub import hf_hub_download

REPO_ID = os.getenv("MODEL_REPO", "Qwen/Qwen3-0.6B-GGUF")
FILENAME = os.getenv("MODEL_FILE", "Qwen3-0.6B-Q8_0.gguf")
MODEL_DIR = os.getenv("MODEL_DIR", "models")

if __name__ == "__main__":
    path = hf_hub_download(
        repo_id=REPO_ID,
        filename=FILENAME,
        local_dir=MODEL_DIR,
    )
    print(path)
