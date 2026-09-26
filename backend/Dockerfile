FROM python:3.11-slim

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    g++ \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ────────────────────────────────────────────────────────
WORKDIR /app

# ── Python dependencies (cached layer) ──────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Application code ─────────────────────────────────────────────────────────
COPY . .

# ── Create directories for persistent data ──────────────────────────────────
RUN mkdir -p /app/knowledge_base /app/chroma_store

# ── Non-root user for security ───────────────────────────────────────────────
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app
USER appuser

# ── Expose port ──────────────────────────────────────────────────────────────
EXPOSE 8000

# ── NOTE: Ingest is NOT run here. Run manually:
#    docker-compose exec backend python -m app.services.ingest
# ────────────────────────────────────────────────────────────────────────────
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
