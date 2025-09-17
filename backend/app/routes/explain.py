from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from loguru import logger
from ..services.explain_service import ExplainService

router = APIRouter(tags=["explain"])
explain_service = ExplainService()

class ExplainContext(BaseModel):
    document_id: Optional[str] = None
    page_index: Optional[int] = None
    rects_norm: Optional[List[Dict[str, float]]] = None
    source: Optional[str] = None

class ExplainRequest(BaseModel):
    text: str
    context: Optional[ExplainContext] = None

class ExplainResponse(BaseModel):
    explanation: str
    metadata: Optional[Dict[str, Any]] = None

class HighlightRequest(BaseModel):
    text: str
    context: Optional[ExplainContext] = None

class HighlightResponse(BaseModel):
    highlight: str
    metadata: Optional[Dict[str, Any]] = None

@router.post("/explain", response_model=ExplainResponse)
async def explain_text(request: ExplainRequest):
    """
    Explain selected text using AI.
    Provides detailed explanation of the text content, concepts, and context.
    """
    logger.info("Explain request received: text='{}', context={}", 
                request.text[:100] + "..." if len(request.text) > 100 else request.text, 
                request.context.dict() if request.context else None)
    try:
        result = await explain_service.explain_text(
            text=request.text,
            context=request.context.dict() if request.context else None
        )
        
        logger.info("Explanation completed successfully")
        return ExplainResponse(
            explanation=result["explanation"],
            metadata=result.get("metadata", {})
        )
    except Exception as e:
        logger.error("Explanation failed with error: {}", str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/highlight", response_model=HighlightResponse)
async def highlight_text(request: HighlightRequest):
    """
    Highlight selected text using AI.
    Provides highlights, summaries, and key insights about the text.
    """
    logger.info("Highlight request received: text='{}', context={}", 
                request.text[:100] + "..." if len(request.text) > 100 else request.text, 
                request.context.dict() if request.context else None)
    try:
        result = await explain_service.highlight_text(
            text=request.text,
            context=request.context.dict() if request.context else None
        )
        
        logger.info("Highlight completed successfully")
        return HighlightResponse(
            highlight=result["highlight"],
            metadata=result.get("metadata", {})
        )
    except Exception as e:
        logger.error("Highlight failed with error: {}", str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models")
async def get_available_models():
    """
    Get available AI models for explanation and annotation.
    """
    try:
        models = await explain_service.get_available_models()
        return {"models": models}
    except Exception as e:
        logger.error("Failed to get available models: {}", str(e))
        raise HTTPException(status_code=500, detail=str(e))