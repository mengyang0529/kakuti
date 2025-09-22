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

## Quick Start

### 🚀 Automated Setup (Recommended)

**Linux/macOS:**
```bash
bash scripts/dev.sh setup --env kakuti --ocr
bash scripts/dev.sh start --env kakuti
# Open http://localhost:5173
```

**Windows:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 setup --env kakuti --ocr
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 start --env kakuti
# Open http://localhost:5173
```

**Docker (Fullstack):**
```bash
bash scripts/docker-fullstack.sh build
export GEMINI_API_KEY="your-api-key"
bash scripts/docker-fullstack.sh start --port 8080
# Open http://localhost:8080
```

### 📖 Complete Installation Guide

For detailed installation options, manual setup, advanced configuration, and production deployment, see **[INSTALLATION.md](INSTALLATION.md)**.

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
