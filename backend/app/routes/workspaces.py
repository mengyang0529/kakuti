import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..repositories.workspaces import WorkspacesRepository
from ..repositories.documents import DocumentsRepository

router = APIRouter(tags=["workspaces"])
workspaces_repo = WorkspacesRepository()
documents_repo = DocumentsRepository()


class WorkspaceCreateRequest(BaseModel):
    name: Optional[str] = None


@router.post("/workspaces")
async def create_workspace(req: WorkspaceCreateRequest):
    ws_id = str(uuid.uuid4())
    workspaces_repo.create(ws_id, req.name)
    return {"workspace_id": ws_id, "name": req.name}


class WorkspaceUpdateRequest(BaseModel):
    name: Optional[str] = None


@router.patch("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: str, req: WorkspaceUpdateRequest):
    ws = workspaces_repo.get(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if req.name is not None:
        workspaces_repo.update_name(workspace_id, req.name)
    return {"ok": True}


@router.get("/workspaces")
async def list_workspaces(limit: int = 100, offset: int = 0):
    items = workspaces_repo.list(limit=limit, offset=offset)
    return {"workspaces": items}


@router.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: str):
    if not workspaces_repo.get(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspaces_repo.delete(workspace_id)
    return {"deleted": True}


@router.get("/workspaces/{workspace_id}/documents")
async def list_workspace_documents(workspace_id: str, limit: int = 100, offset: int = 0):
    if not workspaces_repo.get(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    docs = workspaces_repo.list_documents(workspace_id, limit=limit, offset=offset)
    return {"documents": docs}


@router.post("/workspaces/{workspace_id}/documents/{doc_id}")
async def add_document_to_workspace(workspace_id: str, doc_id: str):
    if not workspaces_repo.get(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    if not documents_repo.get(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    workspaces_repo.add_document(workspace_id, doc_id)
    return {"ok": True}


@router.delete("/workspaces/{workspace_id}/documents/{doc_id}")
async def remove_document_from_workspace(workspace_id: str, doc_id: str):
    if not workspaces_repo.get(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspaces_repo.remove_document(workspace_id, doc_id)
    return {"ok": True}
