from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from ..repositories.tags import TagsRepository

router = APIRouter(tags=["tags"])
tags_repo = TagsRepository()


class TagInfo(BaseModel):
    name: str
    count: int


class DocumentTagsRequest(BaseModel):
    add: Optional[List[str]] = None
    remove: Optional[List[str]] = None


@router.get("/tags", response_model=List[TagInfo])
async def list_tags():
    try:
        tags = tags_repo.list_all()
        return [TagInfo(name=tag['name'], count=tag['count']) for tag in tags]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/{doc_id}/tags")
async def manage_document_tags(doc_id: str, request: DocumentTagsRequest):
    try:
        if request.add:
            tags_repo.add_to_document(doc_id, request.add)
        
        if request.remove:
            tags_repo.remove_from_document(doc_id, request.remove)
        
        # Return current tags
        current_tags = tags_repo.get_document_tags(doc_id)
        return {"tags": current_tags}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
