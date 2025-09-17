-- PostgreSQL schema with pgvector extension for RAG functionality
-- This schema is designed to work alongside the existing SQLite schema

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Core tables (PostgreSQL version)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT,
  mime TEXT,
  file_path TEXT,
  file_size INTEGER,
  original_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workspaces and association
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Association table linking documents to a workspace
CREATE TABLE IF NOT EXISTS workspace_documents (
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (workspace_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_documents_ws ON workspace_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_doc ON workspace_documents(doc_id);

CREATE TABLE IF NOT EXISTS document_bodies (
  doc_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  body TEXT
);

-- Document chunks table for RAG functionality
CREATE TABLE IF NOT EXISTS document_chunks (
  id BIGSERIAL PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  page_start INT,
  page_end INT,
  embedding vector(3072) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for document_chunks
CREATE UNIQUE INDEX IF NOT EXISTS ux_doc_chunks ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON document_chunks(document_id);
-- Note: For MVP, we use exact search. Later add: CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS document_tags (
  doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (doc_id, tag_id)
);

CREATE TABLE IF NOT EXISTS summaries (
  doc_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  summary TEXT,
  outline TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  doc_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Highlights table for document annotations
CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER,
  start_offset INTEGER,
  end_offset INTEGER,
  selected_text TEXT,
  color TEXT DEFAULT '#ffff00',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_highlights_doc_id ON highlights(doc_id);
CREATE INDEX IF NOT EXISTS idx_highlights_page ON highlights(doc_id, page_number);

-- Embeddings table (for non-chunk embeddings)
CREATE TABLE IF NOT EXISTS doc_embeddings (
  doc_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  dim INT,
  vec BYTEA
);

-- Translations table for document content
CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  title TEXT,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translations_doc_id ON translations(doc_id);
CREATE INDEX IF NOT EXISTS idx_translations_language ON translations(doc_id, target_language);

-- Optional per-document metadata
CREATE TABLE IF NOT EXISTS document_meta (
  doc_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  color TEXT
);
