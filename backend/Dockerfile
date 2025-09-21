FROM python:3.12-slim

ARG DEBIAN_FRONTEND=noninteractive

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_ROOT_USER_ACTION=ignore

# System packages required by PDF tooling used in the app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    libgl1 \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first to leverage docker layer caching
COPY requirements.txt ./requirements.txt
RUN pip install --upgrade pip \
 && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.8.0+cpu \
 && pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY ./ ./

RUN addgroup --system app \
    && adduser --system --group app \
    && chown -R app:app /app
USER app

EXPOSE 8080
ENV PORT=8080

# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$PORT"]
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
