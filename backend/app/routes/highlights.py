from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger
from ..repositories.highlights import HighlightsRepository

router = APIRouter(tags=["highlights"])
highlights_repo = HighlightsRepository()


class CreateHighlightRequest(BaseModel):
    doc_id: str
    page_number: int
    start_offset: int
    end_offset: int
    selected_text: str
    color: str = '#ffff00'
    note: str = ''


class UpdateHighlightRequest(BaseModel):
    color: Optional[str] = None
    note: Optional[str] = None


class HighlightResponse(BaseModel):
    id: str
    doc_id: str
    page_number: int
    start_offset: int
    end_offset: int
    selected_text: str
    color: str
    note: str
    created_at: str
    updated_at: str


@router.post("/highlights", response_model=HighlightResponse)
async def create_highlight(request: CreateHighlightRequest):
    """Create a new highlight for a document"""
    try:
        logger.info(f"Creating highlight with request: {request.dict()}")
        
        highlight_id = highlights_repo.create(
            doc_id=request.doc_id,
            page_number=request.page_number,
            start_offset=request.start_offset,
            end_offset=request.end_offset,
            selected_text=request.selected_text,
            color=request.color,
            note=request.note
        )
        
        logger.info(f"Highlight created with ID: {highlight_id}")
        
        highlight = highlights_repo.get(highlight_id)
        if not highlight:
            raise HTTPException(status_code=500, detail="Failed to create highlight")
        
        logger.info(f"Highlight created: {highlight_id} for document {request.doc_id}")
        return HighlightResponse(**highlight)
    
    except Exception as e:
        logger.error(f"Failed to create highlight: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/highlights/{highlight_id}", response_model=HighlightResponse)
async def get_highlight(highlight_id: str):
    """Get a specific highlight by ID"""
    highlight = highlights_repo.get(highlight_id)
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")
    
    return HighlightResponse(**highlight)


@router.get("/documents/{doc_id}/highlights", response_model=List[HighlightResponse])
async def get_document_highlights(doc_id: str):
    """Get all highlights for a specific document"""
    highlights = highlights_repo.get_by_document(doc_id)
    return [HighlightResponse(**highlight) for highlight in highlights]


@router.get("/documents/{doc_id}/highlights/page/{page_number}", response_model=List[HighlightResponse])
async def get_page_highlights(doc_id: str, page_number: int):
    """Get all highlights for a specific page of a document"""
    highlights = highlights_repo.get_by_page(doc_id, page_number)
    return [HighlightResponse(**highlight) for highlight in highlights]


@router.put("/highlights/{highlight_id}", response_model=HighlightResponse)
async def update_highlight(highlight_id: str, request: UpdateHighlightRequest):
    """Update a highlight's color and/or note"""
    # Check if highlight exists
    existing_highlight = highlights_repo.get(highlight_id)
    if not existing_highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")
    
    try:
        highlights_repo.update(
            highlight_id=highlight_id,
            color=request.color,
            note=request.note
        )
        
        updated_highlight = highlights_repo.get(highlight_id)
        logger.info(f"Highlight updated: {highlight_id}")
        return HighlightResponse(**updated_highlight)
    
    except Exception as e:
        logger.error(f"Failed to update highlight {highlight_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/highlights/{highlight_id}")
async def delete_highlight(highlight_id: str):
    """Delete a highlight"""
    # Check if highlight exists
    existing_highlight = highlights_repo.get(highlight_id)
    if not existing_highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")
    
    try:
        highlights_repo.delete(highlight_id)
        logger.info(f"Highlight deleted: {highlight_id}")
        return {"message": "Highlight deleted successfully"}
    
    except Exception as e:
        logger.error(f"Failed to delete highlight {highlight_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{doc_id}/highlights")
async def delete_document_highlights(doc_id: str):
    """Delete all highlights for a document"""
    try:
        highlights_repo.delete_by_document(doc_id)
        logger.info(f"All highlights deleted for document: {doc_id}")
        return {"message": "All highlights deleted successfully"}
    
    except Exception as e:
        logger.error(f"Failed to delete highlights for document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))