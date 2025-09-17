from typing import Optional, List
from .. import db


class WorkspacesRepository:
    def create(self, workspace_id: str, name: Optional[str] = None) -> str:
        db.execute(
            "INSERT INTO workspaces (id, name) VALUES (?, ?)",
            (workspace_id, name)
        )
        db.CONN.commit()
        return workspace_id

    def get(self, workspace_id: str) -> Optional[dict]:
        return db.query_one("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))

    def list(self, limit: int = 100, offset: int = 0) -> List[dict]:
        return db.query_all(
            "SELECT * FROM workspaces ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )

    def delete(self, workspace_id: str):
        # First get all documents in this workspace
        docs = self.list_documents(workspace_id)
        
        # Delete each document (this will also clean up related data)
        if docs:
            from .documents import DocumentsRepository
            documents_repo = DocumentsRepository()
            for doc in docs:
                try:
                    documents_repo.delete(doc['id'])
                except Exception as e:
                    # Log but continue with other documents
                    print(f"Warning: Failed to delete document {doc['id']}: {e}")
        
        # Finally delete the workspace (ON DELETE CASCADE will remove workspace_documents entries)
        db.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
        db.CONN.commit()

    def update_name(self, workspace_id: str, name: str):
        db.execute("UPDATE workspaces SET name = ? WHERE id = ?", (name, workspace_id))
        db.CONN.commit()

    def add_document(self, workspace_id: str, doc_id: str):
        db.execute(
            "INSERT OR IGNORE INTO workspace_documents (workspace_id, doc_id) VALUES (?, ?)",
            (workspace_id, doc_id)
        )
        db.CONN.commit()

    def remove_document(self, workspace_id: str, doc_id: str):
        db.execute(
            "DELETE FROM workspace_documents WHERE workspace_id = ? AND doc_id = ?",
            (workspace_id, doc_id)
        )
        db.CONN.commit()

    def list_documents(self, workspace_id: str, limit: int = 100, offset: int = 0) -> List[dict]:
        return db.query_all(
            """
            SELECT d.*, dm.color
            FROM documents d
            JOIN workspace_documents wd ON wd.doc_id = d.id
            LEFT JOIN document_meta dm ON dm.doc_id = d.id
            WHERE wd.workspace_id = ?
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (workspace_id, limit, offset)
        )
