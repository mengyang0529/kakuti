import uuid
from typing import Optional, List
from datetime import datetime

from .. import db


class TranslationRepository:
    def __init__(self):
        self.db = db.CONN

    def create_translation(
        self,
        doc_id: str,
        target_language: str,
        title: Optional[str] = None,
        body: Optional[str] = None,
    ) -> str:
        translation_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        self.db.execute(
            """
            INSERT INTO translations (id, doc_id, target_language, title, body, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (translation_id, doc_id, target_language, title, body, now, now),
        )
        self.db.commit()
        return translation_id

    def update_translation(
        self,
        translation_id: str,
        title: Optional[str] = None,
        body: Optional[str] = None,
    ) -> None:
        now = datetime.utcnow().isoformat()
        updates = []
        params = []
        
        if title is not None:
            updates.append("title = ?")
            params.append(title)
        if body is not None:
            updates.append("body = ?")
            params.append(body)
            
        if not updates:
            return
            
        updates.append("updated_at = ?")
        params.append(now)
        params.append(translation_id)
        
        query = f"UPDATE translations SET {', '.join(updates)} WHERE id = ?"
        self.db.execute(query, params)
        self.db.commit()

    def get_translation(self, translation_id: str) -> Optional[dict]:
        result = self.db.execute(
            "SELECT * FROM translations WHERE id = ?",
            (translation_id,),
        ).fetchone()
        return dict(result) if result else None

    def get_document_translations(self, doc_id: str) -> List[dict]:
        results = self.db.execute(
            "SELECT * FROM translations WHERE doc_id = ?",
            (doc_id,),
        ).fetchall()
        return [dict(row) for row in results]

    def get_document_translation_by_language(
        self, doc_id: str, target_language: str
    ) -> Optional[dict]:
        result = self.db.execute(
            "SELECT * FROM translations WHERE doc_id = ? AND target_language = ?",
            (doc_id, target_language),
        ).fetchone()
        return dict(result) if result else None

    def delete_translation(self, translation_id: str) -> None:
        self.db.execute("DELETE FROM translations WHERE id = ?", (translation_id,))
        self.db.commit()

    def delete_document_translations(self, doc_id: str) -> None:
        self.db.execute("DELETE FROM translations WHERE doc_id = ?", (doc_id,))
        self.db.commit()

    def delete_document_translation_cache(self) -> None:
        """
        Delete translation cache entries. Since we can't easily identify which
        cache entries belong to a specific document, we clear the entire cache
        to prevent stale entries from remaining.
        """
        try:
            # Clear all translation cache entries
            from loguru import logger
            logger.info("Attempting to clear translation cache")
            cursor = self.db.execute("DELETE FROM translation_cache")
            self.db.commit()
            logger.info(f"Cleared translation cache, {cursor.rowcount} rows deleted")
        except Exception as e:
            # Log the error but don't fail the operation
            from loguru import logger
            logger.warning(f"Failed to clear translation cache: {e}")
