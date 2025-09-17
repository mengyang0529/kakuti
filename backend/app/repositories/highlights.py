import uuid
from typing import Optional, List
from .. import db


class HighlightsRepository:
    def create(self, doc_id: str, page_number: int, start_offset: int, end_offset: int, 
               selected_text: str, color: str = '#ffff00', note: str = '') -> str:
        """Create a new highlight for a document"""
        highlight_id = str(uuid.uuid4())
        print(f"Creating highlight with ID: {highlight_id}")
        print(f"Data: {doc_id, page_number, start_offset, end_offset, selected_text, color, note}")
        with db.transaction():
            db.execute(
                "INSERT INTO highlights (id, doc_id, page_number, start_offset, end_offset, selected_text, color, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (highlight_id, doc_id, page_number, start_offset, end_offset, selected_text, color, note)
            )
        return highlight_id

    def get(self, highlight_id: str) -> Optional[dict]:
        """Get a specific highlight by ID"""
        return db.query_one(
            "SELECT * FROM highlights WHERE id = ?",
            (highlight_id,)
        )

    def get_by_document(self, doc_id: str) -> List[dict]:
        """Get all highlights for a specific document"""
        return db.query_all(
            "SELECT * FROM highlights WHERE doc_id = ? ORDER BY page_number, start_offset",
            (doc_id,)
        )

    def get_by_page(self, doc_id: str, page_number: int) -> List[dict]:
        """Get all highlights for a specific page of a document"""
        return db.query_all(
            "SELECT * FROM highlights WHERE doc_id = ? AND page_number = ? ORDER BY start_offset",
            (doc_id, page_number)
        )

    def update(self, highlight_id: str, color: Optional[str] = None, note: Optional[str] = None):
        """Update highlight color and/or note"""
        with db.transaction():
            if color is not None:
                db.execute(
                    "UPDATE highlights SET color = ?, updated_at = datetime('now') WHERE id = ?",
                    (color, highlight_id)
                )
            if note is not None:
                db.execute(
                    "UPDATE highlights SET note = ?, updated_at = datetime('now') WHERE id = ?",
                    (note, highlight_id)
            )

    def delete(self, highlight_id: str):
        """Delete a highlight"""
        with db.transaction():
            db.execute("DELETE FROM highlights WHERE id = ?", (highlight_id,))

    def delete_by_document(self, doc_id: str):
        """Delete all highlights for a document"""
        with db.transaction():
            db.execute("DELETE FROM highlights WHERE doc_id = ?", (doc_id,))