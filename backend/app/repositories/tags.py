from typing import List, Optional
from .. import db


class TagsRepository:
    def create(self, name: str) -> int:
        result = db.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))
        db.CONN.commit()
        if result.rowcount == 0:
            # Get existing tag id
            tag = db.query_one("SELECT id FROM tags WHERE name = ?", (name,))
            return tag['id']
        return result.lastrowid

    def get_by_name(self, name: str) -> Optional[dict]:
        return db.query_one("SELECT * FROM tags WHERE name = ?", (name,))

    def list_all(self) -> List[dict]:
        return db.query_all(
            "SELECT t.*, COUNT(dt.doc_id) as count FROM tags t LEFT JOIN document_tags dt ON t.id = dt.tag_id GROUP BY t.id ORDER BY count DESC"
        )

    def add_to_document(self, doc_id: str, tag_names: List[str]):
        with db.transaction():
            for name in tag_names:
                tag_id = self.create(name)
                db.execute(
                    "INSERT OR IGNORE INTO document_tags (doc_id, tag_id) VALUES (?, ?)",
                    (doc_id, tag_id)
                )

    def remove_from_document(self, doc_id: str, tag_names: List[str]):
        with db.transaction():
            for name in tag_names:
                tag = self.get_by_name(name)
                if tag:
                    db.execute(
                        "DELETE FROM document_tags WHERE doc_id = ? AND tag_id = ?",
                        (doc_id, tag['id'])
                    )

    def get_document_tags(self, doc_id: str) -> List[str]:
        tags = db.query_all(
            "SELECT t.name FROM tags t JOIN document_tags dt ON t.id = dt.tag_id WHERE dt.doc_id = ?",
            (doc_id,)
        )
        return [t['name'] for t in tags]

    def search_by_tags(self, tag_names: List[str], match: str = "AND") -> List[str]:
        if match == "AND":
            # All tags must be present
            placeholders = ",".join("?" * len(tag_names))
            query = f"""
                SELECT dt.doc_id FROM document_tags dt 
                JOIN tags t ON dt.tag_id = t.id 
                WHERE t.name IN ({placeholders})
                GROUP BY dt.doc_id 
                HAVING COUNT(DISTINCT t.name) = ?
            """
            params = tag_names + [len(tag_names)]
        else:  # OR
            placeholders = ",".join("?" * len(tag_names))
            query = f"""
                SELECT DISTINCT dt.doc_id FROM document_tags dt 
                JOIN tags t ON dt.tag_id = t.id 
                WHERE t.name IN ({placeholders})
            """
            params = tag_names

        results = db.query_all(query, params)
        return [r['doc_id'] for r in results]
