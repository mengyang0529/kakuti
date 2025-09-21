import time
import hashlib
from typing import Dict, List, Any, Optional
from loguru import logger
import google.generativeai as genai

from ..config import settings
from ..repositories.documents import DocumentsRepository
from ..repositories.chunks import ChunksRepository
from ..services.doc_parse_service import DocParseService
from ..services.chunk_service import ChunkService
from ..services.rag_embedding_service import rag_embedding_service
from ..services.mmr_service import mmr_service
from ..services.prompt_packer import prompt_packer
from ..services.gemini_direct_service import gemini_direct_service
from .. import db


class RAGService:
    """Service for orchestrating RAG (Retrieval-Augmented Generation) operations."""
    
    def __init__(self):
        self.documents_repo = DocumentsRepository()
        self.chunks_repo = ChunksRepository()
        self.doc_parse_service = DocParseService()
        self.chunk_service = ChunkService()
        
        # RAG configuration
        self.top_k = settings.RAG_TOP_K  # 6
        self.candidate_k = 40  # Retrieve more candidates for MMR
        self.mmr_lambda = settings.RAG_MMR_LAMBDA  # 0.5
        self.similarity_threshold = settings.RAG_SIMILARITY_THRESHOLD  # 0.3
        self.generation_model = settings.RAG_GENERATION_MODEL  # gemini-1.5-flash
        
        # Configure Google AI for generation (optional)
        api_key = settings.GOOGLE_API_KEY or settings.GEMINI_API_KEY
        self._generation_enabled = bool(api_key)
        if self._generation_enabled:
            try:
                genai.configure(api_key=api_key)
            except Exception as e:
                logger.warning(f"Failed to configure Google generation, will use fallback answers: {e}")
                self._generation_enabled = False
    
    def _get_advisory_lock_id(self, document_id: str) -> int:
        """Generate a consistent advisory lock ID for a document.
        
        Args:
            document_id: Document identifier
        
        Returns:
            int: Advisory lock ID
        """
        # Create a hash of the document ID and convert to int
        hash_obj = hashlib.md5(f"rag_index_{document_id}".encode())
        # Use first 8 bytes of hash as int (PostgreSQL advisory lock uses bigint)
        return int.from_bytes(hash_obj.digest()[:8], byteorder='big', signed=True)
    
    def _format_citations_for_frontend(self, contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Format citations for frontend consumption.
        
        Args:
            contexts: List of context dictionaries with page info and content
            
        Returns:
            List of citation objects with page_number, similarity_score, and text
        """
        citations = []
        for context in contexts:
            citation = {
                'page_number': context.get('page_start', 1),
                'similarity_score': context.get('score', 0.0),
                'text': context.get('content', '')[:200] + ('...' if len(context.get('content', '')) > 200 else '')
            }
            citations.append(citation)
        return citations
    
    def _try_acquire_lock(self, document_id: str) -> bool:
        """
        Try to acquire an advisory lock for document indexing.
        
        Args:
            document_id: Document identifier
        
        Returns:
            bool: True if lock acquired, False otherwise
        """
        try:
            # For SQLite, we'll use a simple table-based locking mechanism
            # Check if document is already being processed
            existing_lock = db.db_query_one(
                "SELECT document_id FROM processing_locks WHERE document_id = ?",
                (document_id,)
            )
            
            if existing_lock:
                logger.info(f"Document {document_id} is already being processed")
                return False
            
            # Try to insert a lock record
            try:
                db.db_execute(
                    "INSERT INTO processing_locks (document_id, created_at) VALUES (?, datetime('now'))",
                    (document_id,)
                )
                logger.info(f"Acquired processing lock for document {document_id}")
                return True
            except Exception:
                # Lock already exists (race condition)
                logger.info(f"Failed to acquire lock for document {document_id} (race condition)")
                return False
                
        except Exception as e:
            logger.error(f"Error acquiring advisory lock for {document_id}: {e}")
            return False
    
    def _release_lock(self, document_id: str) -> None:
        """Release the advisory lock for document indexing.
        
        Args:
            document_id: Document identifier
        """
        try:
            # Remove the lock record from processing_locks table
            db.db_execute(
                "DELETE FROM processing_locks WHERE document_id = ?",
                (document_id,)
            )
            logger.info(f"Released processing lock for document {document_id}")
                
        except Exception as e:
            logger.error(f"Error releasing advisory lock for {document_id}: {e}")
    
    def ensure_index(self, document_id: str) -> Dict[str, Any]:
        """Ensure document is indexed for RAG queries.
        
        Args:
            document_id: Document identifier
        
        Returns:
            Dict with 'chunks' count and indexing status
        """
        start_time = time.time()
        
        try:
            # Check if already indexed
            if self.chunks_repo.exists(document_id):
                # Use count_by_document instead of topk_exact with zero vector
                chunk_count = self.chunks_repo.count_by_document(document_id)
                
                logger.info(f"Document {document_id} already indexed with {chunk_count} chunks")
                return {
                    'chunks': chunk_count,
                    'status': 'already_indexed',
                    'latency_ms': int((time.time() - start_time) * 1000)
                }
            
            # Try to acquire lock for indexing
            if not self._try_acquire_lock(document_id):
                logger.info(f"Document {document_id} is being indexed by another process")
                return {
                    'chunks': 0,
                    'status': 'indexing_in_progress',
                    'latency_ms': int((time.time() - start_time) * 1000)
                }
            
            try:
                # Double-check after acquiring lock
                if self.chunks_repo.exists(document_id):
                    chunk_count = self.chunks_repo.count_by_document(document_id)
                    return {
                        'chunks': chunk_count,
                        'status': 'already_indexed',
                        'latency_ms': int((time.time() - start_time) * 1000)
                    }
                
                # Get document
                document = self.documents_repo.get(document_id)
                if not document:
                    raise ValueError(f"Document {document_id} not found")
                
                # Parse document if needed
                if document.get('file_path'):
                    # Construct full file path from stored relative path
                    from pathlib import Path
                    file_path = document['file_path']
                    
                    # If file_path is just a filename, construct the full path
                    if not Path(file_path).is_absolute():
                        storage_dir = Path("storage/doc_files").resolve()
                        # Extract file extension from original filename
                        original_filename = document.get('original_filename', '')
                        if original_filename:
                            file_extension = Path(original_filename).suffix
                            full_file_path = storage_dir / f"{document_id}{file_extension}"
                        else:
                            # Fallback: try to find the file with common extensions
                            full_file_path = None
                            for ext in ['.pdf', '.txt', '.md', '.doc', '.docx']:
                                candidate_path = storage_dir / f"{document_id}{ext}"
                                if candidate_path.exists():
                                    full_file_path = candidate_path
                                    break
                            if not full_file_path:
                                raise ValueError(f"Document file not found for {document_id}")
                    else:
                        full_file_path = Path(file_path)
                    
                    # Parse from file
                    parse_result = self.doc_parse_service.parse_document(
                        str(full_file_path), 
                        document['mime']
                    )
                    pages = parse_result.get('pages', [])
                else:
                    # Use document body
                    body = document.get('body', '')
                    pages = [{'page_num': 1, 'text': body}] if body else []
                
                if not pages:
                    logger.warning(f"No content found for document {document_id}")
                    return {
                        'chunks': 0,
                        'status': 'no_content',
                        'latency_ms': int((time.time() - start_time) * 1000)
                    }
                
                # Normalize page format
                normalized_pages = []
                for page in pages:
                    page_num = page.get('page_num') or page.get('page', 1)
                    text = page.get('text', '').strip()
                    if text:
                        normalized_pages.append({
                            'page_num': page_num,
                            'text': text
                        })
                
                if not normalized_pages:
                    logger.warning(f"No text content found for document {document_id}")
                    return {
                        'chunks': 0,
                        'status': 'no_text_content',
                        'latency_ms': int((time.time() - start_time) * 1000)
                    }
                
                # Generate chunks
                logger.info(f"Generating chunks for document {document_id} ({len(normalized_pages)} pages)")
                chunks = self.chunk_service.make_chunks(document_id, normalized_pages)
                
                if not chunks:
                    logger.warning(f"No chunks generated for document {document_id}")
                    return {
                        'chunks': 0,
                        'status': 'no_chunks_generated',
                        'latency_ms': int((time.time() - start_time) * 1000)
                    }
                
                # Generate embeddings
                logger.info(f"Generating embeddings for {len(chunks)} chunks")
                chunk_texts = [chunk['content'] for chunk in chunks]
                embeddings = rag_embedding_service.embed_texts(chunk_texts)
                
                # Prepare chunks with embeddings
                chunks_with_embeddings = []
                for i, chunk in enumerate(chunks):
                    chunks_with_embeddings.append({
                        'chunk_index': chunk['chunk_index'],
                        'content': chunk['content'],
                        'page_start': chunk['page_start'],
                        'page_end': chunk['page_end'],
                        'embedding': embeddings[i].tolist()
                    })
                
                # Store in database
                logger.info(f"Storing {len(chunks_with_embeddings)} chunks in database")
                stored_count = self.chunks_repo.bulk_upsert(document_id, chunks_with_embeddings)
                
                # Run ANALYZE for better query performance (PostgreSQL)
                try:
                    if hasattr(db, 'db_execute'):
                        db.db_execute("ANALYZE document_chunks")
                except Exception as e:
                    logger.warning(f"Failed to run ANALYZE: {e}")
                
                logger.info(
                    f"Successfully indexed document {document_id}: {stored_count} chunks, "
                    f"{int((time.time() - start_time) * 1000)}ms"
                )
                
                return {
                    'chunks': stored_count,
                    'status': 'indexed',
                    'latency_ms': int((time.time() - start_time) * 1000)
                }
                
            finally:
                # Always release the lock
                self._release_lock(document_id)
                
        except Exception as e:
            logger.error(f"Error indexing document {document_id}: {e}")
            return {
                'chunks': 0,
                'status': 'error',
                'error': str(e),
                'latency_ms': int((time.time() - start_time) * 1000)
            }
    
    def _generate_answer(self, prompt: str) -> str:
        """Generate answer using Google's generative model.
        
        Args:
            prompt: Input prompt
        
        Returns:
            str: Generated answer
        """
        try:
            model = genai.GenerativeModel(self.generation_model)
            
            # Configure generation parameters
            generation_config = genai.types.GenerationConfig(
                max_output_tokens=500,  # Limit response length
                temperature=0.1,  # Low temperature for factual responses
                top_p=0.8,
                top_k=40
            )
            
            response = model.generate_content(
                prompt,
                generation_config=generation_config
            )
            
            if response and response.text:
                return response.text.strip()
            else:
                raise ValueError("Empty response from generation model")
                
        except Exception as e:
            logger.error(f"Error generating answer: {e}")
            raise e
    
    def _create_fallback_answer(self, contexts: List[Dict[str, Any]], 
                               citations: List[str]) -> str:
        """Create a fallback answer from top contexts.
        
        Args:
            contexts: List of context chunks
            citations: List of citation strings
        
        Returns:
            str: Fallback answer
        """
        if not contexts:
            return "No relevant information found in the document."
        
        # Create bullet points from top contexts
        points = []
        for i, context in enumerate(contexts[:5]):  # Max 5 points
            content = context['content'][:200]  # Truncate to 200 chars
            if len(context['content']) > 200:
                content += "..."
            points.append(f"• {content}")
        
        fallback = "Based on the document content:\n\n" + "\n\n".join(points)
        
        if citations:
            fallback += "\n\nReferences:\n" + "\n".join(citations[:3])  # Max 3 citations
        
        return fallback
    
    def answer(self, query: str, document_id: str) -> Dict[str, Any]:
        """Answer a query using RAG on the specified document.
        
        Args:
            query: User query
            document_id: Document identifier
        
        Returns:
            Dict with 'answer', 'citations', 'latency_ms', 'fallback' fields
        """
        start_time = time.time()
        
        try:
            if not query or not query.strip():
                return {
                    'answer': 'Please provide a valid question.',
                    'citations': [],
                    'latency_ms': int((time.time() - start_time) * 1000),
                    'fallback': False
                }
            
            # Check if document is indexed
            if not self.chunks_repo.exists(document_id):
                logger.warning(f"Document {document_id} not indexed")
                return {
                    'answer': 'Document is not indexed yet. Please wait for indexing to complete.',
                    'citations': [],
                    'latency_ms': int((time.time() - start_time) * 1000),
                    'fallback': False,
                    'status': 'not_indexed'
                }
            
            # Generate query embedding
            logger.debug(f"Generating query embedding for: {query[:100]}...")
            query_embedding = rag_embedding_service.embed_query(query)
            
            # Retrieve candidate chunks
            candidates = self.chunks_repo.topk_exact(
                document_id, 
                query_embedding, 
                candidate_k=self.candidate_k,
                return_embeddings=True
            )
            
            if not candidates:
                logger.info(f"No candidates found for query, trying Gemini direct query for document {document_id}")
                return gemini_direct_service.query_with_full_document(query, document_id)
            
            # Filter candidates by similarity threshold
            filtered_candidates = [
                candidate for candidate in candidates 
                if candidate.get('score', 0.0) >= self.similarity_threshold
            ]
            
            logger.debug(
                f"Filtered {len(candidates)} candidates to {len(filtered_candidates)} "
                f"above threshold {self.similarity_threshold}"
            )
            
            if not filtered_candidates:
                logger.info(f"No candidates above threshold {self.similarity_threshold}, trying Gemini direct query for document {document_id}")
                return gemini_direct_service.query_with_full_document(query, document_id)
            
            # Apply MMR for diversity on filtered candidates
            selected_indices = mmr_service.mmr(filtered_candidates, self.top_k, self.mmr_lambda)
            selected_contexts = [filtered_candidates[i] for i in selected_indices]
            
            # Pack prompt
            logger.debug("Packing prompt with contexts")
            pack_result = prompt_packer.pack(query, selected_contexts)
            
            prompt = pack_result['prompt']
            citations = pack_result['citations']
            tokens_in_est = pack_result['tokens_in_est']
            
            logger.debug(
                f"Prompt packed: {tokens_in_est} tokens, {pack_result['contexts_used']} contexts"
            )
            
            # Generate answer
            if self._generation_enabled:
                try:
                    logger.debug("Generating answer")
                    answer = self._generate_answer(prompt)
                    
                    # Convert citations to proper format
                    formatted_citations = self._format_citations_for_frontend(selected_contexts)
                    
                    result = {
                        'answer': answer,
                        'citations': formatted_citations,
                        'latency_ms': int((time.time() - start_time) * 1000),
                        'fallback': False,
                        'tokens_in_est': tokens_in_est,
                        'contexts_used': pack_result['contexts_used']
                    }
                    
                    logger.info(
                        f"RAG query completed: {result['latency_ms']}ms, "
                        f"{result['contexts_used']} contexts, {tokens_in_est} tokens"
                    )
                    
                    return result
                except Exception as gen_error:
                    logger.error(f"Generation failed, using fallback: {gen_error}")

            # Fallback path (no generation configured or generation failed)
            fallback_answer = self._create_fallback_answer(selected_contexts, citations)
            formatted_citations = self._format_citations_for_frontend(selected_contexts)
            return {
                'answer': fallback_answer,
                'citations': formatted_citations,
                'latency_ms': int((time.time() - start_time) * 1000),
                'fallback': True
            }
                
        except Exception as e:
            logger.error(f"Error in RAG answer for document {document_id}: {e}")
            
            return {
                'answer': 'An error occurred while processing your question. Please try again.',
                'citations': [],
                'latency_ms': int((time.time() - start_time) * 1000),
                'fallback': True,
                'error': str(e)
            }


# Global instance
rag_service = RAGService()
