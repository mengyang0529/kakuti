from typing import Optional, List
import os
from .. import db
from .translations import TranslationRepository
from ..config import settings
from ..services.storage_service import get_storage_service


class DocumentsRepository:
    def __init__(self):
        self.translation_repo = TranslationRepository()

    def create(self, doc_id: str, title: str, mime: str, body: str, file_path: str = None, file_size: int = None, original_filename: str = None) -> str:
        with db.transaction():
            db.execute(
                "INSERT INTO documents (id, title, mime, file_path, file_size, original_filename) VALUES (?, ?, ?, ?, ?, ?)",
                (doc_id, title, mime, file_path, file_size, original_filename)
            )
            db.execute(
                "INSERT INTO document_bodies (doc_id, body) VALUES (?, ?)",
                (doc_id, body)
            )
        return doc_id

    def get(self, doc_id: str) -> Optional[dict]:
        doc = db.query_one(
            "SELECT d.*, db.body FROM documents d LEFT JOIN document_bodies db ON d.id = db.doc_id WHERE d.id = ?",
            (doc_id,)
        )
        if doc:
            # Get tags
            tags = db.query_all(
                "SELECT t.name FROM tags t JOIN document_tags dt ON t.id = dt.tag_id WHERE dt.doc_id = ?",
                (doc_id,)
            )
            doc['tags'] = [t['name'] for t in tags]
        return doc
    
    def get_by_filename(self, filename: str) -> Optional[dict]:
        return db.query_one(
            "SELECT * FROM documents WHERE original_filename = ?",
            (filename,)
        )

    def list(self, limit: int = 100, offset: int = 0) -> List[dict]:
        return db.query_all(
            "SELECT d.* FROM documents d ORDER BY d.created_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )

    def update(self, doc_id: str, title: Optional[str] = None, body: Optional[str] = None):
        with db.transaction():
            if title is not None:
                db.execute("UPDATE documents SET title = ?, updated_at = datetime('now') WHERE id = ?", (title, doc_id))
            if body is not None:
                db.execute("UPDATE document_bodies SET body = ? WHERE doc_id = ?", (body, doc_id))

    def delete(self, doc_id: str):
        # Get document info before deleting from database
        doc = db.query_one("SELECT file_path, original_filename FROM documents WHERE id = ?", (doc_id,))
        
        with db.transaction():
            # Delete from all related tables first to handle any inconsistencies
            db.execute("DELETE FROM document_tags WHERE doc_id = ?", (doc_id,))
            db.execute("DELETE FROM highlights WHERE doc_id = ?", (doc_id,))
            db.execute("DELETE FROM notes WHERE doc_id = ?", (doc_id,))
            db.execute("DELETE FROM summaries WHERE doc_id = ?", (doc_id,))
            db.execute("DELETE FROM doc_embeddings WHERE doc_id = ?", (doc_id,))
            db.execute("DELETE FROM translations WHERE doc_id = ?", (doc_id,))
            # Clear translation cache
            self.translation_repo.delete_document_translation_cache()
            db.execute("DELETE FROM document_bodies WHERE doc_id = ?", (doc_id,))
            # Finally delete from the main documents table
            db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        
        # Delete the actual file from filesystem
        if doc:
            file_path = doc.get('file_path')
            if file_path:
                if file_path.startswith("gs://") and settings.GCS_BUCKET:
                    try:
                        prefix = f"gs://{settings.GCS_BUCKET}/"
                        if file_path.startswith(prefix):
                            object_name = file_path[len(prefix):]
                            get_storage_service().delete_object(object_name)
                        else:
                            print(f"Warning: GCS path {file_path} does not match configured bucket")
                    except Exception as e:
                        print(f"Warning: Failed to delete GCS object {file_path}: {e}")
                elif os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        return
                    except Exception as e:
                        print(f"Warning: Failed to delete file using stored path {file_path}: {e}")

            original_filename = doc.get('original_filename')
            if original_filename:
                from pathlib import Path
                storage_dir = Path("storage/doc_files").resolve()
                file_extension = Path(original_filename).suffix
                stored_file_path = storage_dir / f"{doc_id}{file_extension}"
                if stored_file_path.exists():
                    try:
                        stored_file_path.unlink()
                        print(f"Successfully deleted file: {stored_file_path}")
                    except Exception as e:
                        print(f"Warning: Failed to delete file {stored_file_path}: {e}")

    def search_fts(self, query: str, limit: int = 20) -> List[dict]:
        return db.query_all(
            """
            SELECT d.*, fts.rank AS rank
            FROM documents d
            JOIN document_bodies db ON db.doc_id = d.id
            JOIN documents_fts fts ON fts.rowid = db.rowid
            WHERE documents_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (query, limit)
        )

    def get_document_body(self, doc_id: str) -> Optional[dict]:
        return db.query_one(
            "SELECT * FROM document_bodies WHERE doc_id = ?",
            (doc_id,)
        )
