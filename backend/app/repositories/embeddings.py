import numpy as np
from typing import List, Tuple, Optional
from .. import db
from ..config import settings


class EmbeddingsRepository:
    def store_embedding(self, doc_id: str, embedding: np.ndarray):
        if settings.SQLITE_VEC_ENABLE:
            # Use sqlite-vec
            vec_bytes = embedding.astype(np.float32).tobytes()
            db.execute(
                "INSERT OR REPLACE INTO doc_vectors (rowid, embedding) VALUES (?, ?)",
                (hash(doc_id) % (2**63), vec_bytes)  # hash to int for rowid
            )
        else:
            # Fallback to BLOB storage
            vec_bytes = embedding.astype(np.float32).tobytes()
            db.execute(
                "INSERT OR REPLACE INTO doc_embeddings (doc_id, dim, vec) VALUES (?, ?, ?)",
                (doc_id, embedding.shape[0], vec_bytes)
            )
        db.CONN.commit()

    def get_embedding(self, doc_id: str) -> Optional[np.ndarray]:
        if settings.SQLITE_VEC_ENABLE:
            result = db.query_one(
                "SELECT embedding FROM doc_vectors WHERE rowid = ?",
                (hash(doc_id) % (2**63),)
            )
        else:
            result = db.query_one(
                "SELECT vec FROM doc_embeddings WHERE doc_id = ?",
                (doc_id,)
            )
        
        if result:
            vec_bytes = result['embedding'] if settings.SQLITE_VEC_ENABLE else result['vec']
            return np.frombuffer(vec_bytes, dtype=np.float32)
        return None

    def similarity_search(self, query_embedding: np.ndarray, k: int = 10, doc_ids: List[str] = None) -> List[Tuple[str, float]]:
        if settings.SQLITE_VEC_ENABLE:
            # Use sqlite-vec similarity search
            vec_bytes = query_embedding.astype(np.float32).tobytes()
            results = db.query_all(
                "SELECT rowid, distance FROM doc_vectors WHERE embedding <-> ? ORDER BY distance LIMIT ?",
                (vec_bytes, k)
            )
            # Convert rowid back to doc_id (this is a limitation - we'd need a mapping table)
            # For now, return empty results
            return []
        else:
            # Python fallback: read all embeddings and compute cosine similarity
            if doc_ids:
                # Filter by specific doc_ids
                placeholders = ",".join("?" * len(doc_ids))
                embeddings_data = db.query_all(
                    f"SELECT doc_id, vec FROM doc_embeddings WHERE doc_id IN ({placeholders})",
                    doc_ids
                )
            else:
                embeddings_data = db.query_all("SELECT doc_id, vec FROM doc_embeddings")

            similarities = []
            for row in embeddings_data:
                doc_embedding = np.frombuffer(row['vec'], dtype=np.float32)
                similarity = self._cosine_similarity(query_embedding, doc_embedding)
                similarities.append((row['doc_id'], similarity))

            # Sort by similarity (descending) and return top k
            similarities.sort(key=lambda x: x[1], reverse=True)
            return similarities[:k]

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
