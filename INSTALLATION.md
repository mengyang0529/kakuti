# Installation & Setup

This guide provides comprehensive installation options for Kakuti, from automated scripts to manual setup. Choose the method that best fits your needs.

## 🚀 Quick Start (Recommended)

### Automated Setup Scripts

We provide automated scripts for easy setup across different platforms and environments:

#### Option 1: Conda Environment (Recommended)

**Linux/macOS:**
```bash
# One-command setup and start
bash scripts/dev.sh setup --env kakuti --ocr
bash scripts/dev.sh start --env kakuti

# Open http://localhost:5173
```

**Windows:**
```powershell
# One-command setup and start
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 setup --env kakuti --ocr
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 start --env kakuti

# Open http://localhost:5173
```

#### Option 2: Python venv

**Linux/macOS:**
```bash
bash scripts/dev-venv.sh setup --python python3 --venv .venv
bash scripts/dev-venv.sh start --port 8001
```

**Windows:**
```powershell
powershell -File scripts/dev-venv.ps1 setup -python python -venv .venv
powershell -File scripts/dev-venv.ps1 start -port 8001
```

#### Option 3: Docker (Fullstack)

**Linux/macOS:**
```bash
# Quick start with Docker
bash scripts/docker-fullstack.sh build
export GEMINI_API_KEY="your-api-key"
bash scripts/docker-fullstack.sh start --port 8080

# Open http://localhost:8080
```

**Windows:**
```powershell
powershell -File scripts/docker-fullstack.ps1 build
$env:GEMINI_API_KEY="your-api-key"
powershell -File scripts/docker-fullstack.ps1 start -Port 8080

# Open http://localhost:8080
```

### ⚡ What the Scripts Do

1. **Automatic Environment Setup**: Create and configure conda/venv environments
2. **Dependency Installation**: Install all backend and frontend dependencies
3. **Environment File Creation**: Generate `.env.engine` and `.env.ui` with defaults
4. **Service Management**: Start, stop, and monitor both backend and frontend
5. **Cross-Platform Support**: Works on Linux, macOS, and Windows

### 🔧 Configuration Notes

- **API Keys**: Scripts will prompt you to update API keys in the generated `.env.engine` file
- **Default Ports**: Backend `:8001`, Frontend `:5173`, Docker `:8080`
- **Environment**: Conda env named `kakuti`, Python `3.11`
- **Logs**: Written to repo root (`backend_uvicorn.log`, `web_vite.log`)

For detailed script usage, see the main [README](README.md) files.

---

## 📋 Manual Installation

If you prefer manual setup or need custom configuration:

### Prerequisites

- Python 3.11+ (3.11 recommended)
- Node.js 18+ (20+ recommended)  
- SQLite (system default OK)
- Optional: PostgreSQL 14+ with `pgvector` extension
- Optional (OCR): Tesseract OCR engine (`tesseract` binary)

### Manual Quickstart

1) **Python Environment**

```bash
conda create -n kakuti python=3.11 -y
conda activate kakuti
pip install -r backend/requirements.txt
# Optional OCR support
conda install -c conda-forge tesseract -y
```

2) **Run Backend**

```bash
cd backend
uvicorn app.main:app --port 8001
```

3) **Frontend**

```bash
cd web
npm install
npm run dev
# Open http://localhost:5173
```

**Notes:**
- No API keys required to boot (mock fallbacks available)
- Set `GEMINI_API_KEY` in `backend/.env` for full functionality
- Scripts automatically handle this setup for you

---

---

## 🔧 Advanced Configuration

### Script Management Commands

Once you've completed setup, you can manage your development environment:

```bash
# Check service status
bash scripts/dev.sh status

# Stop all services  
bash scripts/dev.sh stop

# Start individual services
bash scripts/dev.sh backend --env kakuti
bash scripts/dev.sh frontend

# Docker management
bash scripts/docker-fullstack.sh logs --follow
bash scripts/docker-fullstack.sh shell
bash scripts/docker-fullstack.sh clean
```

### Production Deployment

For production deployment to Google Cloud Run:

```bash
cd backend
export GEMINI_API_KEY="your-production-api-key"
./deploy.sh
```

See the deployment scripts for full configuration options.

---

## 📚 Detailed Manual Setup

For those who prefer complete control over the installation process:

### System Requirements

- **Python 3.11+** (3.11 recommended)
- **Node.js 18+** (20+ recommended)  
- **SQLite** (system default OK)
- **Optional**: PostgreSQL 14+ with `pgvector` extension
- **Optional (OCR)**: Tesseract OCR engine (`tesseract` binary)

### Default Configuration

- **Backend**: http://localhost:8001
- **Frontend**: http://localhost:5173
- **Docker**: http://localhost:8080 (fullstack)

---

## 📦 Technical Details

### Dependency Summary

- Backend core: FastAPI, Uvicorn, Pydantic, python-dotenv, Loguru
- Data/processing: NumPy, PyMuPDF (`pymupdf`), Pillow, OpenCV (headless), pytesseract (requires Tesseract binary)
- HTTP/clients: httpx
- AI/LLM: google-generativeai (Gemini), OpenAI (via httpx), Ollama (via HTTP), sentence-transformers (local embeddings)
- RAG utilities: tiktoken
- DB: SQLite (built-in), PostgreSQL (`psycopg2-binary`) + `pgvector`
- Optional: sqlite-vec (SQLite extension)
\n+Frontend:
- React 19, react-dom 19
- Vite 7, @vitejs/plugin-react
- react-pdf + pdfjs-dist
- react-markdown + remark-gfm
- html2canvas
- (If used in code) prop-types

## Backend (FastAPI)

### Python dependencies

In a virtual environment:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Notes:
- `sentence-transformers` may pull a large deep learning stack (PyTorch). If you don’t need local embeddings, set `EMBEDDING_PROVIDER=openai` to avoid installing heavy packages.
- OCR requires native Tesseract. Install the system package (e.g., macOS: `brew install tesseract`; Ubuntu/Debian: `sudo apt-get install tesseract-ocr`).
- For PostgreSQL, `psycopg2-binary` is included. You still need a running PostgreSQL server if you enable it.

### Environment configuration (`backend/.env`)

Create `backend/.env` and set variables as needed. Example (annotated):

```env
# API key protection
REQUIRE_API_KEY=true
API_KEY=test-key

# LLM provider for generation (Gemini/OpenAI/Ollama)
LLM_PROVIDER=gemini             # or: openai | ollama
GEMINI_API_KEY=your-gemini-key  # if LLM_PROVIDER=gemini
OPENAI_API_KEY=your-openai-key  # if LLM_PROVIDER=openai
OLLAMA_ENDPOINT=http://localhost:11434  # if LLM_PROVIDER=ollama

# Embeddings provider and dimension
EMBEDDING_PROVIDER=openai       # local | openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-large  # 3072-dim
EMBED_DIM=3072                  # MUST match your embedding model dimension
# If using sqlite-vec (optional accelerated vector search):
SQLITE_VEC_ENABLE=false         # true to enable; requires sqlite-vec installed

# Database selection
DB_TYPE=sqlite                  # sqlite | postgresql
DOCMIND_DB=storage/docmind.db

# PostgreSQL settings (if DB_TYPE=postgresql)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=docmind
POSTGRES_USER=postgres
POSTGRES_PASSWORD=

# RAG behavior
RAG_EMBEDDING_MODEL=gemini-embedding-001  # used by Google embedding path
RAG_GENERATION_MODEL=gemini-1.5-flash
RAG_TOP_K=6
RAG_MMR_LAMBDA=0.5
RAG_SIMILARITY_THRESHOLD=0.3   # cosine similarity threshold (0–1)
RAG_MAX_CONTEXT_TOKENS=1800
RAG_BLOCK_MAX_TOKENS=800
RAG_BLOCK_TARGET_TOKENS=400
RAG_BLOCK_OVERLAP_TOKENS=80
```

Important:
- Keep `EMBED_DIM` consistent with your embedding provider/model.
  - OpenAI `text-embedding-3-large` → 3072
  - OpenAI `text-embedding-3-small`/`text-embedding-ada-002` → 1536
  - Local `all-MiniLM-L6-v2` → 384
- If you switch from 768/1536 to 3072 and use PostgreSQL/pgvector, update the column type to `vector(3072)` and reindex as needed.

### Database initialization

- SQLite: auto-initialized on first start using `backend/app/schema.sql`.
- PostgreSQL: ensure `pgvector` is installed on the server, then apply schema:

```bash
# in psql connected to your DB
CREATE EXTENSION IF NOT EXISTS vector;
\i backend/app/schema_postgres.sql
```

Set `DB_TYPE=postgresql` in `.env` to use it.

### Run backend

```bash
cd backend
uvicorn app.main:app --port 8001
```

## Frontend (Vite + React)

### Install dependencies

```bash
cd web
npm install
```

If the build complains about missing `prop-types`, install it:

```bash
npm install prop-types
```

### Frontend environment

Create `web/.env` (optional) to control the base URL for certain AI endpoints:

```env
VITE_API_BASE_URL=http://localhost:8001
```

Notes:
- Most services default to `http://localhost:8001/api/v1`. The `llmService` uses `VITE_API_BASE_URL` (default `http://localhost:8001`).
- Ensure the backend `API_KEY` matches the headers used in the frontend services (many requests send `X-API-Key: test-key`).

### PDF.js worker

`react-pdf` is configured in `web/src/components/PDFViewer/config/workerConfig.js`:
- Dev mode uses a version‑matched CDN worker automatically.
- Prod tries a local worker at `/node_modules/pdfjs-dist/build/pdf.worker.min.js`, falling back to CDN.
No additional setup is required for development.

### Run frontend

```bash
cd web
npm run dev
# Open http://localhost:5173
```

## Optional Features

### OCR (Tesseract)

- Install Tesseract OCR on your system (binary `tesseract` in PATH).
- If installed to a non‑standard path, set it in code (see `backend/app/services/ocr_service.py`) or via `pytesseract.pytesseract.tesseract_cmd`.

### sqlite-vec (optional)

- If you install the `sqlite-vec` extension and set `SQLITE_VEC_ENABLE=true`, the backend will attempt to load it and create a virtual table for vector search. If loading fails, it will automatically fall back to a Python implementation.

### Local embeddings (optional)

- Set `EMBEDDING_PROVIDER=local` to use `sentence-transformers` (`all-MiniLM-L6-v2`, 384‑dim). This usually requires PyTorch; pip will resolve dependencies but the install can be large.
- If you prefer to avoid the heavy install, use OpenAI embeddings (`EMBEDDING_PROVIDER=openai`).

## Troubleshooting

- 401/403: Set `REQUIRE_API_KEY=true` and ensure frontend sends `X-API-Key` matching `API_KEY`.
- DB locked or large DB: Stop backend before VACUUM; run `sqlite3 backend/storage/docmind.db "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`.
- Embedding dim mismatch: Ensure `EMBED_DIM` and DB vector column size match your embedding model.
- OCR errors: Verify Tesseract is installed and accessible from PATH.
- PostgreSQL errors about `vector`: Ensure `CREATE EXTENSION vector;` and run `schema_postgres.sql`.
