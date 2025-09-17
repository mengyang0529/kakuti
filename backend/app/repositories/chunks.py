from typing import List, Dict, Any, Optional
import numpy as np
from loguru import logger

from ..config import settings
from .. import db


class ChunksRepository:
    """Repository for managing document chunks and vector operations."""
    
    def exists(self, document_id: str) -> bool:
        """Check if chunks exist for a document."""
        try:
            if settings.DB_TYPE == "postgresql":
                sql = "SELECT COUNT(*) as count FROM document_chunks WHERE document_id = %s"
            else:
                sql = "SELECT COUNT(*) as count FROM document_chunks WHERE document_id = ?"
            
            result = db.db_query_one(sql, [document_id])
            return result and result.get('count', 0) > 0
        except Exception as e:
            logger.error(f"Error checking chunks existence for document {document_id}: {e}")
            return False
    
    def delete_by_document(self, document_id: str) -> int:
        """Delete all chunks for a document. Returns number of deleted chunks."""
        try:
            # First count existing chunks
            if settings.DB_TYPE == "postgresql":
                count_sql = "SELECT COUNT(*) as count FROM document_chunks WHERE document_id = %s"
                delete_sql = "DELETE FROM document_chunks WHERE document_id = %s"
            else:
                count_sql = "SELECT COUNT(*) as count FROM document_chunks WHERE document_id = ?"
                delete_sql = "DELETE FROM document_chunks WHERE document_id = ?"
            
            result = db.db_query_one(count_sql, [document_id])
            count = result.get('count', 0) if result else 0
            
            if count > 0:
                db.db_execute(delete_sql, [document_id])
                logger.info(f"Deleted {count} chunks for document {document_id}")
            
            return count
        except Exception as e:
            logger.error(f"Error deleting chunks for document {document_id}: {e}")
            raise e

    def count_by_document(self, document_id: str) -> int:
        """Return number of chunks for a document."""
        try:
            if settings.DB_TYPE == "postgresql":
                sql = "SELECT COUNT(*) as count FROM document_chunks WHERE document_id = %s"
            else:
                sql = "SELECT COUNT(*) as count FROM document_chunks WHERE document_id = ?"
            result = db.db_query_one(sql, [document_id])
            return result.get('count', 0) if result else 0
        except Exception as e:
            logger.error(f"Error counting chunks for document {document_id}: {e}")
            return 0
    
    def bulk_upsert(self, document_id: str, items: List[Dict[str, Any]]) -> int:
        """Bulk upsert chunks for a document. Returns number of upserted chunks.
        
        Args:
            document_id: The document ID
            items: List of chunk items with keys: chunk_index, content, page_start, page_end, embedding
        """
        if not items:
            return 0
        
        try:
            with db.transaction() as conn:
                upserted_count = 0
                
                for item in items:
                    chunk_index = item['chunk_index']
                    content = item['content']
                    page_start = item.get('page_start')
                    page_end = item.get('page_end')
                    embedding = item['embedding']  # List[float]
                    
                    if settings.DB_TYPE == "postgresql":
                        # PostgreSQL upsert with ON CONFLICT
                        sql = """
                        INSERT INTO document_chunks (document_id, chunk_index, content, page_start, page_end, embedding)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (document_id, chunk_index)
                        DO UPDATE SET
                            content = EXCLUDED.content,
                            page_start = EXCLUDED.page_start,
                            page_end = EXCLUDED.page_end,
                            embedding = EXCLUDED.embedding
                        """
                        params = [document_id, chunk_index, content, page_start, page_end, embedding]
                        
                        if hasattr(conn, 'cursor'):  # PostgreSQL connection
                            from ..db_postgres import execute_with_connection
                            execute_with_connection(conn, sql, params)
                        else:  # Fallback
                            db.db_execute(sql, params)
                    else:
                        # SQLite upsert with INSERT OR REPLACE
                        # Note: SQLite doesn't have vector type, so we'll store as JSON for compatibility
                        import json
                        embedding_json = json.dumps(embedding)
                        
                        sql = """
                        INSERT OR REPLACE INTO document_chunks 
                        (document_id, chunk_index, content, page_start, page_end, embedding)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """
                        params = [document_id, chunk_index, content, page_start, page_end, embedding_json]
                        db.db_execute(sql, params)
                    
                    upserted_count += 1
                
                # For SQLite, explicitly commit the transaction
                if settings.DB_TYPE != "postgresql" and upserted_count > 0:
                    db.CONN.commit()
                
                # Run ANALYZE for PostgreSQL to update statistics
                if settings.DB_TYPE == "postgresql" and upserted_count > 0:
                    analyze_sql = "ANALYZE document_chunks"
                    if hasattr(conn, 'cursor'):
                        from ..db_postgres import execute_with_connection
                        execute_with_connection(conn, analyze_sql)
                
                logger.info(f"Upserted {upserted_count} chunks for document {document_id}")
                return upserted_count
                
        except Exception as e:
            logger.error(f"Error upserting chunks for document {document_id}: {e}")
            raise e
    
    def topk_exact(self, document_id: str, query_vec: List[float], candidate_k: int, 
                   return_embeddings: bool = False) -> List[Dict[str, Any]]:
        """Get top-k most similar chunks using exact cosine similarity search.
        
        Args:
            document_id: The document ID to search within
            query_vec: Query vector (normalized)
            candidate_k: Number of candidates to return
            return_embeddings: Whether to include embeddings in results
        
        Returns:
            List of chunks with keys: chunk_index, content, page_start, page_end, score, embedding?
        """
        try:
            if settings.DB_TYPE == "postgresql":
                # PostgreSQL with pgvector cosine similarity
                select_fields = "chunk_index, content, page_start, page_end"
                if return_embeddings:
                    select_fields += ", embedding"
                
                sql = f"""
                SELECT {select_fields},
                       1 - (embedding <=> %s::vector) as score
                FROM document_chunks
                WHERE document_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """
                params = [query_vec, document_id, query_vec, candidate_k]
                
                results = db.db_query_all(sql, params)
                
                # Convert results to expected format
                formatted_results = []
                for row in results:
                    result_item = {
                        'chunk_index': row['chunk_index'],
                        'content': row['content'],
                        'page_start': row['page_start'],
                        'page_end': row['page_end'],
                        'score': float(row['score'])
                    }
                    if return_embeddings and 'embedding' in row:
                        result_item['embedding'] = list(row['embedding'])
                    formatted_results.append(result_item)
                
                return formatted_results
            
            else:
                # SQLite fallback with manual cosine similarity calculation
                import json
                
                sql = "SELECT chunk_index, content, page_start, page_end, embedding FROM document_chunks WHERE document_id = ?"
                rows = db.db_query_all(sql, [document_id])
                
                if not rows:
                    return []
                
                # Calculate cosine similarities
                query_vec_np = np.array(query_vec, dtype=np.float32)
                results = []
                
                for row in rows:
                    try:
                        embedding_data = json.loads(row['embedding'])
                        embedding_np = np.array(embedding_data, dtype=np.float32)
                        
                        # Ensure both vectors are 1D for dot product
                        if embedding_np.ndim > 1:
                            embedding_np = embedding_np.flatten()
                        if query_vec_np.ndim > 1:
                            query_vec_np = query_vec_np.flatten()
                        
                        # Cosine similarity
                        similarity = np.dot(query_vec_np, embedding_np) / (
                            np.linalg.norm(query_vec_np) * np.linalg.norm(embedding_np)
                        )
                        
                        result_item = {
                            'chunk_index': row['chunk_index'],
                            'content': row['content'],
                            'page_start': row['page_start'],
                            'page_end': row['page_end'],
                            'score': float(similarity)
                        }
                        
                        if return_embeddings:
                            result_item['embedding'] = embedding_data
                        
                        results.append(result_item)
                    except Exception as e:
                        logger.warning(f"Error processing chunk {row['chunk_index']}: {e}")
                        continue
                
                # Sort by similarity score (descending) and take top-k
                results.sort(key=lambda x: x['score'], reverse=True)
                return results[:candidate_k]
                
        except Exception as e:
            logger.error(f"Error in topk_exact search for document {document_id}: {e}")
            raise e


# Global instance
chunks_repository = ChunksRepository()
