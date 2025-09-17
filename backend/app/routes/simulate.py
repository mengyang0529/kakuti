from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from ..services.chat_service import ChatService

router = APIRouter(tags=["simulate"])
chat_service = ChatService()


class SimulateRequest(BaseModel):
    source: str
    message: str
    workspace_id: Optional[str] = None
    document_id: Optional[str] = None
    context: Optional[str] = None


class SimulateResponse(BaseModel):
    ok: bool
    answer: str
    source: str
    metadata: Dict[str, Any]


@router.post("/simulate", response_model=SimulateResponse)
async def simulate(req: SimulateRequest):
    message = (req.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        result = await chat_service.ask(
            question=message,
            context=req.context,
            metadata={
                "client_source": req.source,
                "workspace_id": req.workspace_id,
                "document_id": req.document_id,
            },
        )
        logger.info("Chat response generated successfully")
        return SimulateResponse(
            ok=True,
            answer=result.answer,
            source=result.source,
            metadata=result.metadata,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.error("Chat request failed: {}", exc)
        fallback = chat_service._fallback(message, req.context, error=exc)  # pylint: disable=protected-access
        return SimulateResponse(
            ok=True,
            answer=fallback.answer,
            source=fallback.source,
            metadata=fallback.metadata,
        )
