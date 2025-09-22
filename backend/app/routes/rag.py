from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from loguru import logger

from ..services.rag_service import rag_service
from ..config import settings
from ..repositories.documents import DocumentsRepository

router = APIRouter(tags=["rag"])


class RAGQueryRequest(BaseModel):
    query: str
    document_id: Optional[str] = None  # Optional for workspace queries


class CitationItem(BaseModel):
    page_number: int
    similarity_score: float
    text: str
    document_title: Optional[str] = None
    document_id: Optional[str] = None

class RAGQueryResponse(BaseModel):
    answer: str
    citations: List[CitationItem]
    latency_ms: int
    fallback: bool
    tokens_in_est: Optional[int] = None
    contexts_used: Optional[int] = None
    status: Optional[str] = None
    error: Optional[str] = None


class RAGIndexResponse(BaseModel):
    chunks: int
    status: str
    latency_ms: int
    error: Optional[str] = None


async def query_workspace_rag(query: str) -> RAGQueryResponse:
    """
    Query all documents in the workspace using RAG.
    """
    import time
    start_time = time.time()
    
    try:
        # Create documents repository instance
        documents_repo = DocumentsRepository()
        
        # Get all documents in the workspace
        all_documents = documents_repo.list(limit=1000)
        
        if not all_documents:
            return RAGQueryResponse(
                answer="No documents found in the workspace.",
                citations=[],
                latency_ms=int((time.time() - start_time) * 1000),
                fallback=False,
                contexts_used=0
            )
        
        # Collect results from all indexed documents
        all_citations = []
        best_answer = ""
        best_score = 0
        total_contexts = 0
        
        for doc in all_documents:
            try:
                # Check if document is indexed
                from ..repositories.chunks import ChunksRepository
                chunks_repo = ChunksRepository()
                
                if not chunks_repo.exists(doc['id']):
                    continue
                
                # Query this document
                result = await rag_service.answer(query, doc['id'])
                
                if result and not result.get('fallback', True):
                    # Add document title to citations
                    doc_citations = result.get('citations', [])
                    for citation in doc_citations:
                        citation['document_title'] = doc.get('title', 'Untitled')
                        citation['document_id'] = doc['id']
                    
                    all_citations.extend(doc_citations)
                    total_contexts += result.get('contexts_used', 0)
                    
                    # Use the answer from the document with highest average similarity
                    if doc_citations:
                        avg_score = sum(c.get('similarity_score', 0) for c in doc_citations) / len(doc_citations)
                        if avg_score > best_score:
                            best_score = avg_score
                            best_answer = result['answer']
            
            except Exception as e:
                logger.warning(f"Failed to query document {doc['id']}: {str(e)}")
                continue
        
        # Sort citations by similarity score
        all_citations.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
        
        # Limit to top citations to avoid overwhelming response
        top_citations = all_citations[:10]
        
        if not best_answer:
            best_answer = "I couldn't find relevant information in the indexed documents to answer your question."
        
        return RAGQueryResponse(
            answer=best_answer,
            citations=top_citations,
            latency_ms=int((time.time() - start_time) * 1000),
            fallback=len(top_citations) == 0,
            contexts_used=total_contexts
        )
        
    except Exception as e:
        logger.error(f"Workspace RAG query failed: {str(e)}")
        return RAGQueryResponse(
            answer=f"An error occurred while searching the workspace: {str(e)}",
            citations=[],
            latency_ms=int((time.time() - start_time) * 1000),
            fallback=True,
            error=str(e)
        )


@router.post("/rag/query", response_model=RAGQueryResponse)
async def query_rag(request: RAGQueryRequest):
    """
    Query a document using RAG (Retrieval-Augmented Generation).
    
    Returns:
    - 200: Successful query with answer
    - 202: Document is being indexed, retry later
    - 400: Invalid request
    - 500: Internal server error
    """
    logger.info(
        f"RAG query request: document_id='{request.document_id}', "
        f"query='{request.query[:100]}{'...' if len(request.query) > 100 else ''}'"
    )
    
    try:
        # Validate request
        if not request.query or not request.query.strip():
            raise HTTPException(
                status_code=400, 
                detail="Query cannot be empty"
            )
        
        # Handle workspace-wide queries when document_id is not provided
        if not request.document_id:
            return await query_workspace_rag(request.query)
        
        if not request.document_id.strip():
            raise HTTPException(
                status_code=400, 
                detail="Document ID cannot be empty"
            )
        
        # Check if document needs indexing first
        index_result = rag_service.ensure_index(request.document_id)
        
        if index_result['status'] == 'indexing_in_progress':
            logger.info(f"Document {request.document_id} is being indexed by another process")
            raise HTTPException(
                status_code=202,
                detail="Document is being indexed. Please try again in a few moments.",
                headers={"Retry-After": "3"}  # Suggest retry after 3 seconds
            )
        
        if index_result['status'] in ['error', 'no_content', 'no_text_content', 'no_chunks_generated']:
            error_msg = {
                'error': 'Document indexing failed',
                'no_content': 'Document has no content to index',
                'no_text_content': 'Document has no readable text content',
                'no_chunks_generated': 'Failed to generate chunks from document content'
            }.get(index_result['status'], 'Document indexing failed')
            
            logger.error(f"Document {request.document_id} indexing failed: {index_result['status']}")
            raise HTTPException(
                status_code=400,
                detail=error_msg
            )
        
        # Perform RAG query
        result = await rag_service.answer(request.query, request.document_id)
        
        # Handle special statuses
        if result.get('status') == 'not_indexed':
            raise HTTPException(
                status_code=202,
                detail="Document is not indexed yet. Please wait for indexing to complete.",
                headers={"Retry-After": "5"}
            )
        
        logger.info(
            f"RAG query completed: document_id='{request.document_id}', "
            f"latency={result['latency_ms']}ms, fallback={result['fallback']}, "
            f"contexts_used={result.get('contexts_used', 0)}"
        )
        
        return RAGQueryResponse(
            answer=result['answer'],
            citations=result['citations'],
            latency_ms=result['latency_ms'],
            fallback=result['fallback'],
            tokens_in_est=result.get('tokens_in_est'),
            contexts_used=result.get('contexts_used'),
            status=result.get('status'),
            error=result.get('error')
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"RAG query failed: document_id='{request.document_id}', error={str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/rag/index", response_model=RAGIndexResponse)
async def index_document(document_id: str):
    """
    Preemptively index a document for RAG queries.
    This is an optional endpoint for warming up the index.
    
    Returns:
    - 200: Document indexed successfully or already indexed
    - 202: Document is being indexed by another process
    - 400: Invalid document or indexing failed
    - 500: Internal server error
    """
    logger.info(f"RAG index request: document_id='{document_id}'")
    
    try:
        if not document_id or not document_id.strip():
            raise HTTPException(
                status_code=400,
                detail="Document ID cannot be empty"
            )
        
        result = rag_service.ensure_index(document_id)
        
        if result['status'] == 'indexing_in_progress':
            logger.info(f"Document {document_id} is being indexed by another process")
            raise HTTPException(
                status_code=202,
                detail="Document is being indexed by another process. Please wait.",
                headers={"Retry-After": "3"}
            )
        
        if result['status'] in ['error', 'no_content', 'no_text_content', 'no_chunks_generated']:
            error_msg = {
                'error': f"Indexing failed: {result.get('error', 'Unknown error')}",
                'no_content': 'Document has no content to index',
                'no_text_content': 'Document has no readable text content',
                'no_chunks_generated': 'Failed to generate chunks from document content'
            }.get(result['status'], 'Document indexing failed')
            
            logger.error(f"Document {document_id} indexing failed: {result['status']}")
            raise HTTPException(
                status_code=400,
                detail=error_msg
            )
        
        logger.info(
            f"RAG index completed: document_id='{document_id}', "
            f"chunks={result['chunks']}, status='{result['status']}', "
            f"latency={result['latency_ms']}ms"
        )
        
        return RAGIndexResponse(
            chunks=result['chunks'],
            status=result['status'],
            latency_ms=result['latency_ms'],
            error=result.get('error')
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"RAG index failed: document_id='{document_id}', error={str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/rag/status/{document_id}")
async def get_rag_status(document_id: str):
    """
    Get the RAG indexing status for a document.
    
    Returns:
    - 200: Status information
    - 400: Invalid document ID
    - 500: Internal server error
    """
    try:
        if not document_id or not document_id.strip():
            raise HTTPException(
                status_code=400,
                detail="Document ID cannot be empty"
            )
        
        # Check if document is indexed
        from ..repositories.chunks import ChunksRepository
        chunks_repo = ChunksRepository()
        
        is_indexed = chunks_repo.exists(document_id)
        
        if is_indexed:
            # Get chunk count using count_by_document instead of topk_exact with zero vector
            try:
                chunk_count = chunks_repo.count_by_document(document_id)
            except Exception:
                chunk_count = 0
            
            return {
                "document_id": document_id,
                "indexed": True,
                "chunks": chunk_count,
                "status": "ready"
            }
        else:
            return {
                "document_id": document_id,
                "indexed": False,
                "chunks": 0,
                "status": "not_indexed"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RAG status check failed: document_id='{document_id}', error={str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
