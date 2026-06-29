FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential cmake libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ .
RUN pip install --no-cache-dir -r requirements.txt

CMD python start.py
