from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from ..repositories.documents import DocumentsRepository
from ..repositories.tags import TagsRepository
from ..repositories.embeddings import EmbeddingsRepository
from ..providers import get_embedding_provider

router = APIRouter(tags=["search"])
documents_repo = DocumentsRepository()
tags_repo = TagsRepository()
embeddings_repo = EmbeddingsRepository()
embedding_provider = get_embedding_provider()


class SearchResult(BaseModel):
    doc_id: str
    title: str
    score: float


class TextSearchRequest(BaseModel):
    q: str
    tags: Optional[List[str]] = None
    match: str = "OR"  # AND or OR


class VectorSearchRequest(BaseModel):
    q: str
    tags: Optional[List[str]] = None
    k: int = 10


@router.post("/search/text")
async def text_search(request: TextSearchRequest):
    try:
        # Get FTS results
        results = documents_repo.search_fts(request.q)
        
        # Filter by tags if specified
        if request.tags:
            tag_filtered_ids = tags_repo.search_by_tags(request.tags, request.match)
            results = [r for r in results if r['id'] in tag_filtered_ids]
        
        # Format response
        search_results = [
            SearchResult(
                doc_id=r['id'],
                title=r['title'],
                score=r.get('rank', 0)
            )
            for r in results
        ]
        
        return {"results": search_results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search/vector")
async def vector_search(request: VectorSearchRequest):
    try:
        # Generate query embedding
        query_embedding = await embedding_provider.embed_texts([request.q])
        
        # Get candidate doc_ids if tags specified
        candidate_ids = None
        if request.tags:
            candidate_ids = tags_repo.search_by_tags(request.tags, "OR")
        
        # Perform similarity search
        similarities = embeddings_repo.similarity_search(
            query_embedding[0], 
            k=request.k, 
            doc_ids=candidate_ids
        )
        
        # Get document details
        results = []
        for doc_id, score in similarities:
            doc = documents_repo.get(doc_id)
            if doc:
                results.append(SearchResult(
                    doc_id=doc_id,
                    title=doc['title'],
                    score=score
                ))
        
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
