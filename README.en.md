# KAKUTI
[中文](README.cn.md)｜[日文](README.jp.md) 
Document management and reading tool. Upload PDFs/text, organize by workspaces, full‑text search and download. Enhance reading with notes and highlights, translate selected text, and ask AI questions (RAG). A Magic Wand smart selection (draw a line → select text below → query/explain/translate/annotate) is coming soon.

## Features

- Document upload: optionally attach to a workspace; text is extracted for full‑text search.
- Workspaces: create, rename, delete; browse and manage documents per workspace.
- Reader: smooth zoom/scroll, full‑text search, screenshot, text highlight and notes.
- Translation: one‑click translate for selected text (LLM provider configurable; caching supported).
- AI Q&A (RAG): ask questions about the current document or the whole workspace with cited sources.
- Delete & download: delete a single document (record and file) or download the original file.
- Coming soon: Magic Wand line → auto-select text below (same page, horizontally overlapping) → action dialog (Query/Explain/Translate/Annotate).

### Work in Progress

- Magic Wand smart selection enhancements (more precise selection, table/image capture)
- Structured table extraction and image capture
- Personal notebook/knowledge base features

## Deployment Environment

Requirements:

- Python 3.11+ (virtualenv recommended)
- Node.js 18+ (20+ recommended)
- SQLite (system default is fine)

Default ports:

- Backend: `8001`
- Frontend: `5173`

Authentication:

- All API requests require header `X-API-Key` by default (configurable via env vars).

## Installation

See [INSTALLATION](INSTALLATION.md) for complete setup of backend and frontend, environment variables, optional OCR/local embeddings, and PostgreSQL/pgvector.

## Dev Helper Scripts (Linux/macOS & Windows)

Quick one-shot setup and dev run. Install `conda` (Miniconda/Anaconda) and Node.js first.

### Linux / macOS (`scripts/dev.sh`)

- Setup environment and install deps:
  - `bash scripts/dev.sh setup --env kakuti [--ocr]`
- Start both backend and frontend:
  - `bash scripts/dev.sh start --env kakuti [--port 8001]`
- Start only backend or only frontend:
  - `bash scripts/dev.sh backend --env kakuti [--port 8001]`
  - `bash scripts/dev.sh frontend`
- Check status / stop:
  - `bash scripts/dev.sh status`
  - `bash scripts/dev.sh stop`

### Windows (`scripts\dev.ps1`)

- Run from PowerShell (allow execution for the session):
  - `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 setup --env kakuti [--ocr]`
- Start both backend and frontend:
  - `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 start --env kakuti [--port 8001]`
- Start only backend / only frontend:
  - `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 backend --env kakuti [--port 8001]`
  - `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 frontend`
- Check status / stop:
  - `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 status`
  - `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 stop`

Notes:
- Configure backend env in `backend/.env` (e.g., `REQUIRE_API_KEY`, `API_KEY`, `LLM_PROVIDER`, API keys). See the env section in `INSTALLATION.md`.
- Defaults: backend `:8001`, frontend `:5173`, conda env name `kakuti`, Python `3.11`.
- Logs and PIDs are written to the repo root: `backend_uvicorn.log`, `web_vite.log`, `backend_uvicorn.pid`, `web_vite.pid`.
- The Vite config sets `base` to `/kakuti/` by default; override with `VITE_BASE_PATH=/` when deploying under a custom domain.
- Frontend requests read `VITE_API_BASE` and `VITE_API_KEY` from build-time environment (configure them as Actions secrets for production).

## Default Storage Paths

- Database: `backend/storage/docmind.db` (WAL mode)
- Document files: `backend/storage/doc_files/{doc_id}.ext`
- Note files: `backend/storage/note_files/{doc_id}.md`

## Basic Usage

- Create workspace: via UI or `POST /api/v1/workspaces`
- Upload document: via UI or `POST /api/v1/documents/upload` (can include `workspace_id`)
- Read & search: in the reader, do full‑text search, translate selection, add highlights/notes
- AI Q&A: ask about a document or globally (RAG)
- Delete document: UI delete button or `DELETE /api/v1/documents/{doc_id}`

## Troubleshooting

- Auth 401/403
  - Ensure requests include `X-API-Key` and it matches `API_KEY` in `backend/.env`.
- DB locked / cannot write
  - Stop the backend before manual DB operations (WAL/SHM files should be removed only when the server is stopped).
- DB file size stays large after deletions
  - SQLite does not auto‑shrink. Compact with:
  - `sqlite3 backend/storage/docmind.db "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`
- Wrong DB file
  - Use `backend/storage/docmind.db` (not `backend/docmind.db`).

## Notes

- Direct download links cannot send headers; append `?api_key=` query parameter instead.
- Production recommendations:
  - Set a custom DB path, restrict CORS origins, use a strong API key.
  - Regularly back up the database and document files.
  - Prefer serving behind a reverse proxy (HTTPS).
