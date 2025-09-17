-- Core tables
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT,
  mime TEXT,
  file_path TEXT,
  file_size INTEGER,
  original_filename TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Workspaces and association (workspace is a higher-level container for documents)
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Association table linking documents to a workspace
-- Using a separate table avoids altering existing documents schema
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

-- FTS5
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title, body, content='document_bodies', content_rowid='rowid'
);

-- Recreate FTS triggers to ensure correct rowid usage
DROP TRIGGER IF EXISTS documents_ai;
DROP TRIGGER IF EXISTS documents_ad;
DROP TRIGGER IF EXISTS documents_au;

CREATE TRIGGER documents_ai AFTER INSERT ON document_bodies BEGIN
  INSERT INTO documents_fts(rowid, title, body)
    SELECT new.rowid, (SELECT title FROM documents WHERE id=new.doc_id), new.body;
END;
CREATE TRIGGER documents_ad AFTER DELETE ON document_bodies BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, body) VALUES('delete', old.rowid, '', '');
END;
CREATE TRIGGER documents_au AFTER UPDATE ON document_bodies BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, body) VALUES('delete', old.rowid, '', '');
  INSERT INTO documents_fts(rowid, title, body)
    SELECT new.rowid, (SELECT title FROM documents WHERE id=new.doc_id), new.body;
END;

-- tags
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT DEFAULT (datetime('now'))
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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_highlights_doc_id ON highlights(doc_id);
CREATE INDEX IF NOT EXISTS idx_highlights_page ON highlights(doc_id, page_number);

-- Fallback embeddings table (when sqlite-vec disabled)
CREATE TABLE IF NOT EXISTS doc_embeddings (
  doc_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  dim INT,
  vec BLOB
);

-- Translations table for document content
CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  title TEXT,
  body TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_translations_doc_id ON translations(doc_id);
CREATE INDEX IF NOT EXISTS idx_translations_language ON translations(doc_id, target_language);

-- Optional per-document metadata (e.g., color for note cards)
CREATE TABLE IF NOT EXISTS document_meta (
  doc_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  color TEXT
);

-- Processing locks for RAG indexing
CREATE TABLE IF NOT EXISTS processing_locks (
  document_id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Document chunks for RAG
CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  embedding BLOB,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_chunk ON document_chunks(document_id, chunk_index);
