FROM python:3.11-slim

# ca-certificates: for HTTPS model downloads. libgomp1: required by onnxruntime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py download_models.py ./

# Download the small ONNX voice models (~30-40MB each) at build time.
RUN python download_models.py

EXPOSE 8080
# Railway injects $PORT; fall back to 8080 for local runs.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
