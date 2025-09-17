import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from loguru import logger
from ..services.doc_parse_service import DocParseService
from ..repositories.documents import DocumentsRepository
from ..repositories.tags import TagsRepository
from ..providers import get_llm_provider
import google.generativeai as genai
from ..config import settings
from ..services.storage_service import get_storage_service, SignedUpload

router = APIRouter(tags=["documents"])
doc_parse_service = DocParseService()
documents_repo = DocumentsRepository()
tags_repo = TagsRepository()


class DocumentResponse(BaseModel):
    id: str
    title: str
    mime: str
    created_at: str
    tags: List[str]
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    original_filename: Optional[str] = None


class SummaryResponse(BaseModel):
    summary: str
    outline: List[str]


class ClassifyResponse(BaseModel):
    tags: List[str]


class GeminiUploadResponse(BaseModel):
    success: bool
    message: str
    file_uri: Optional[str] = None
    summary: Optional[str] = None


class SignedUploadRequest(BaseModel):
    filename: str
    content_type: str
    workspace_id: Optional[str] = None


class SignedUploadResponse(BaseModel):
    doc_id: str
    object_name: str
    upload_url: str
    headers: dict[str, str]


class CompleteUploadRequest(BaseModel):
    doc_id: str
    object_name: str
    original_filename: str
    content_type: str
    size: int
    workspace_id: Optional[str] = None


def _link_workspace(doc_id: str, workspace_id: Optional[str]) -> None:
    if not workspace_id:
        return
    try:
        from ..repositories.workspaces import WorkspacesRepository
        wr = WorkspacesRepository()
        if wr.get(workspace_id):
            wr.add_document(workspace_id, doc_id)
    except Exception as exc:  # pragma: no cover
        logger.warning(f"Failed to link document {doc_id} to workspace {workspace_id}: {exc}")


@router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), workspace_id: Optional[str] = Form(default=None)):
    if settings.GCS_BUCKET:
        raise HTTPException(status_code=400, detail="Direct upload disabled; use signed upload endpoint")

    try:
        doc_id = str(uuid.uuid4())
        storage_dir = Path("storage/doc_files").resolve()
        storage_dir.mkdir(parents=True, exist_ok=True)

        file_extension = Path(file.filename).suffix if file.filename else ""
        stored_filename = f"{doc_id}{file_extension}"
        file_path = storage_dir / stored_filename

        content = await file.read()
        file_size = len(content)

        with open(file_path, "wb") as f:
            f.write(content)

        try:
            parsed = doc_parse_service.parse_document(str(file_path), file.content_type)
        except Exception:
            parsed = {"text": "", "pages": [{"page": 1, "text": ""}], "page_count": 1}

        title = file.filename or f"Document {doc_id[:8]}"
        documents_repo.create(
            doc_id,
            title,
            file.content_type,
            parsed['text'],
            file_path=str(file_path),
            file_size=file_size,
            original_filename=file.filename
        )

        _link_workspace(doc_id, workspace_id)

        logger.info(f"Document uploaded successfully: {file.filename} (ID: {doc_id}, Size: {file_size} bytes)")
        return {"doc_id": doc_id, "filename": file.filename, "size": file_size}
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        try:
            if 'file_path' in locals() and file_path.exists():
                file_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/signed-upload", response_model=SignedUploadResponse)
async def create_signed_upload(req: SignedUploadRequest):
    if not settings.GCS_BUCKET:
        raise HTTPException(status_code=400, detail="GCS bucket not configured")
    try:
        doc_id = str(uuid.uuid4())
        storage = get_storage_service()
        object_name = storage.build_object_name(doc_id, req.filename)
        signed: SignedUpload = storage.create_signed_upload(object_name, req.content_type)
        logger.info("Issued signed upload for %s", object_name)
        return SignedUploadResponse(
            doc_id=doc_id,
            object_name=signed.object_name,
            upload_url=signed.upload_url,
            headers=signed.required_headers,
        )
    except Exception as exc:
        logger.error(f"Failed to create signed upload: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create signed upload")


@router.post("/documents/complete-upload")
async def complete_signed_upload(req: CompleteUploadRequest):
    if not settings.GCS_BUCKET:
        raise HTTPException(status_code=400, detail="GCS bucket not configured")
    if req.size <= 0:
        raise HTTPException(status_code=400, detail="Invalid uploaded size")

    storage = get_storage_service()
    object_name = req.object_name
    temp_path = None
    try:
        temp_path = storage.download_to_tempfile(object_name)
    except Exception as exc:
        logger.error(f"Failed to download uploaded object {object_name}: {exc}")
        raise HTTPException(status_code=400, detail="Uploaded object not found or inaccessible")

    try:
        try:
            parsed = doc_parse_service.parse_document(temp_path, req.content_type)
        except Exception:
            parsed = {"text": "", "pages": [{"page": 1, "text": ""}], "page_count": 1}

        title = req.original_filename or f"Document {req.doc_id[:8]}"
        gcs_path = f"gs://{settings.GCS_BUCKET}/{object_name}"
        documents_repo.create(
            req.doc_id,
            title,
            req.content_type,
            parsed['text'],
            file_path=gcs_path,
            file_size=req.size,
            original_filename=req.original_filename,
        )

        _link_workspace(req.doc_id, req.workspace_id)

        logger.info("Completed signed upload for %s", req.doc_id)
        return {"doc_id": req.doc_id, "filename": req.original_filename, "size": req.size}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to finalize upload {req.doc_id}: {exc}")
        try:
            storage.delete_object(object_name)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to process uploaded document")
    finally:
        try:
            if temp_path:
                os.remove(temp_path)
        except Exception:
            pass


class CreateNoteRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    workspace_id: Optional[str] = None
    color: Optional[str] = None


@router.post("/documents/create-note")
async def create_note(req: CreateNoteRequest):
    """Create a markdown-only document and optionally link it to a workspace."""
    try:
      doc_id = str(uuid.uuid4())
      title = req.title or "Note"
      body = req.content or ""

      # Store document with markdown mime
      documents_repo.create(
          doc_id,
          title,
          "text/markdown",
          body,
          file_path=None,
          file_size=None,
          original_filename=None
      )

      # Optionally link to workspace
      if req.workspace_id:
          try:
              from ..repositories.workspaces import WorkspacesRepository
              wr = WorkspacesRepository()
              if wr.get(req.workspace_id):
                  wr.add_document(req.workspace_id, doc_id)
          except Exception as e:
              logger.warning(f"Failed to link note to workspace: {e}")

      # Optionally store color metadata
      if req.color:
          try:
              from .. import db
              db.execute(
                  "INSERT OR REPLACE INTO document_meta (doc_id, color) VALUES (?, ?)",
                  (doc_id, req.color)
              )
              db.CONN.commit()
          except Exception as e:
              logger.warning(f"Failed to set note color: {e}")

      return {"doc_id": doc_id, "title": title}
    except Exception as e:
      logger.error(f"Create note failed: {e}")
      raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    doc = documents_repo.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse(**doc)


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    try:
        # Get document info first
        doc = documents_repo.get(doc_id)
        
        # Track what we've successfully deleted
        document_file_deleted = False
        note_file_deleted = False
        database_record_deleted = False
        
        try:
            if doc:
                file_path_value = doc.get('file_path') or ""
                if file_path_value.startswith("gs://"):
                    document_file_deleted = True  # handled in repository delete
                elif doc.get('original_filename'):
                    file_extension = Path(doc['original_filename']).suffix if doc['original_filename'] else ""
                    stored_filename = f"{doc_id}{file_extension}"
                    storage_dir = Path("storage/doc_files").resolve()
                    file_path = storage_dir / stored_filename
                    if file_path.exists():
                        file_path.unlink()
                        document_file_deleted = True
            else:
                storage_dir = Path("storage/doc_files").resolve()
                for ext in ['.pdf', '.txt', '.md', '.doc', '.docx']:
                    file_path = storage_dir / f"{doc_id}{ext}"
                    if file_path.exists():
                        file_path.unlink()
                        document_file_deleted = True
                        break
        except Exception as e:
            logger.warning(f"Failed to delete document file for {doc_id}: {str(e)}")
        
        try:
            # Delete note file from note_files directory if exists
            note_files_dir = Path("storage/note_files").resolve()
            note_file_path = note_files_dir / f"{doc_id}.md"
            
            if note_file_path.exists():
                note_file_path.unlink()
                note_file_deleted = True
        except Exception as e:
            logger.warning(f"Failed to delete note file for {doc_id}: {str(e)}")
        
        # Delete from database if document exists
        if doc:
            try:
                documents_repo.delete(doc_id)
                database_record_deleted = True
                return {"message": "Document deleted successfully"}
            except Exception as e:
                logger.error(f"Failed to delete document from database {doc_id}: {str(e)}")
                # If we've already deleted files but database deletion fails, 
                # we should still report partial success
                if document_file_deleted or note_file_deleted:
                    return {"message": "Document files deleted but database record deletion failed", 
                            "document_file_deleted": document_file_deleted,
                            "note_file_deleted": note_file_deleted}
                else:
                    raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")
        else:
            # Document doesn't exist in database, but we still cleaned up files
            message = "Document files cleaned up successfully"
            if not document_file_deleted and not note_file_deleted:
                message = "No document files found to clean up"
            
            return {"message": message,
                    "document_file_deleted": document_file_deleted,
                    "note_file_deleted": note_file_deleted}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents")
async def list_documents(limit: int = 100, offset: int = 0, workspace_id: Optional[str] = None):
    try:
        if workspace_id:
            from ..repositories.workspaces import WorkspacesRepository
            wr = WorkspacesRepository()
            if not wr.get(workspace_id):
                raise HTTPException(status_code=404, detail="Workspace not found")
            docs = wr.list_documents(workspace_id, limit=limit, offset=offset)
        else:
            docs = documents_repo.list(limit=limit, offset=offset)
        return {"documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str):
    try:
        # Get document info
        doc = documents_repo.get(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Check if original filename exists
        if not doc.get('original_filename'):
            raise HTTPException(status_code=404, detail="File not found")
        
        # Construct the actual stored file path
        file_extension = Path(doc['original_filename']).suffix if doc['original_filename'] else ""
        stored_filename = f"{doc_id}{file_extension}"
        storage_dir = Path("storage/doc_files").resolve()
        file_path = storage_dir / stored_filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # Return file
        filename = doc.get('original_filename') or f"document_{doc_id}"
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type=doc.get('mime', 'application/octet-stream')
        )
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Error downloading document {doc_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/documents/{doc_id}/summarize", response_model=SummaryResponse)
async def summarize_document(doc_id: str):
    doc = documents_repo.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        llm_provider = get_llm_provider()
        summary = await llm_provider.summarize(doc['body'])
        # Simple outline extraction (could be enhanced)
        outline = [line.strip() for line in summary.split('.') if line.strip()]
        
        # Store summary
        from .. import db
        db.execute(
            "INSERT OR REPLACE INTO summaries (doc_id, summary, outline) VALUES (?, ?, ?)",
            (doc_id, summary, '\n'.join(outline))
        )
        db.CONN.commit()
        
        return SummaryResponse(summary=summary, outline=outline)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/{doc_id}/classify", response_model=ClassifyResponse)
async def classify_document(doc_id: str):
    doc = documents_repo.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Generate tags using LLM
        llm_provider = get_llm_provider()
        prompt = f"Generate 3-5 relevant tags for this document. Return only the tags, separated by commas:\n\n{doc['body'][:1000]}"
        response = await llm_provider.complete(prompt, max_tokens=100)
        
        # Clean and parse tags
        tags = [tag.strip().lower() for tag in response.split(',') if tag.strip()]
        tags = [tag for tag in tags if len(tag) > 1]  # Filter out single chars
        
        # Store tags
        tags_repo.add_to_document(doc_id, tags)
        
        return ClassifyResponse(tags=tags)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GeminiSummaryRequest(BaseModel):
    language: str = "Chinese"


class SaveNoteToFileRequest(BaseModel):
    content: str


@router.post("/documents/{doc_id}/save-note-to-file")
async def save_note_to_file(doc_id: str, request: SaveNoteToFileRequest):
    """Save document note to a markdown file in note_files directory"""
    try:
        from .. import db
        import os
        
        # Create note_files directory if it doesn't exist
        note_files_dir = Path("storage/note_files").resolve()
        note_files_dir.mkdir(parents=True, exist_ok=True)
        
        # Save note content to markdown file
        note_file_path = note_files_dir / f"{doc_id}.md"
        
        with open(note_file_path, "w", encoding="utf-8") as f:
            f.write(request.content)
        
        logger.info(f"Note saved to file for document {doc_id}: {note_file_path}")
        return {"message": "Note saved successfully", "file_path": str(note_file_path)}
        
    except Exception as e:
        logger.error(f"Failed to save note to file for document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save note to file: {str(e)}")


@router.post("/documents/{doc_id}/upload-to-gemini", response_model=GeminiUploadResponse)
async def upload_document_to_gemini(doc_id: str, request: GeminiSummaryRequest):
    """Upload document to Google Gemini for processing"""
    doc = documents_repo.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Check if Gemini API key is available
        if not settings.GEMINI_API_KEY:
            return GeminiUploadResponse(
                success=False,
                message="Gemini API key not configured"
            )
        
        # Configure Gemini
        genai.configure(api_key=settings.GEMINI_API_KEY)
        
        # Get document file path
        storage_dir = Path("storage/doc_files").resolve()
        file_path = storage_dir / f"{doc_id}.pdf"  # Assuming PDF for now
        
        if not file_path.exists():
            # Try other extensions
            for ext in [".txt", ".md"]:
                alt_path = storage_dir / f"{doc_id}{ext}"
                if alt_path.exists():
                    file_path = alt_path
                    break
            else:
                raise HTTPException(status_code=404, detail="Document file not found")
        
        # Upload file to Gemini
        uploaded_file = genai.upload_file(str(file_path))
        
        logger.info(f"Document {doc_id} uploaded to Gemini: {uploaded_file.uri}")
        
        # Generate summary using Gemini
        model = genai.GenerativeModel(settings.GEMINI_MODEL)
        
        # Create prompt for markdown summary in specified language
        prompt = f"""Please analyze the uploaded document and provide a comprehensive summary in {request.language}. 
        
Format your response as a well-structured document with the following sections:
        # Document Summary
        
        ## Main Topics
        - List the key topics covered
        
        ## Key Points
        - Highlight the most important points
        - Use bullet points for clarity
        
        ## Detailed Analysis
        Provide a detailed analysis of the content
        
        ## Conclusion
        Summarize the main takeaways
        
        Please ensure the output is in proper format and written in {request.language}."""
        
        response = model.generate_content([uploaded_file, prompt])
        summary = response.text
        
        logger.info(f"Generated summary for document {doc_id} in {request.language}")
        
        return GeminiUploadResponse(
            success=True,
            message=f"Document successfully processed and summarized in {request.language}",
            file_uri=uploaded_file.uri,
            summary=summary
        )
        
    except Exception as e:
        logger.error(f"Failed to upload document to Gemini: {e}")
        return GeminiUploadResponse(
            success=False,
            message=f"Failed to upload to Gemini: {str(e)}"
        )


class NoteResponse(BaseModel):
    doc_id: str
    content: str
    created_at: str


class NoteRequest(BaseModel):
    content: str


@router.get("/documents/{doc_id}/notes")
async def get_document_note(doc_id: str):
    """Get the note for a document"""
    try:
        from ..db import query_one
        note = query_one(
            "SELECT doc_id, content, created_at FROM notes WHERE doc_id = ?",
            [doc_id]
        )
        if not note:
            # Return empty note if none exists
            return {"doc_id": doc_id, "content": "", "created_at": ""}
        return note
    except Exception as e:
        logger.error(f"Failed to get note for document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve note")


@router.post("/documents/{doc_id}/notes")
async def create_document_note(doc_id: str, request: NoteRequest):
    """Create a new note for a document"""
    logger.info(f"Creating note for document {doc_id} with content: {request.content[:50]}...")
    try:
        from ..db import execute, query_one, transaction, CONN
        
        # Check if document exists
        logger.info(f"Checking if document {doc_id} exists")
        doc = query_one("SELECT id FROM documents WHERE id = ?", [doc_id])
        if not doc:
            logger.error(f"Document {doc_id} not found")
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Insert or update note
        logger.info(f"Inserting or updating note for document {doc_id}")
        with transaction():
            # Try to update first
            cursor = execute(
                "UPDATE notes SET content = ?, created_at = datetime('now') WHERE doc_id = ?",
                [request.content, doc_id]
            )
            
            # If no rows were affected, insert a new note
            if cursor.rowcount == 0:
                cursor = execute(
                    "INSERT INTO notes (doc_id, content) VALUES (?, ?)",
                    [doc_id, request.content]
                )
            
            logger.info(f"Note {'updated' if cursor.rowcount > 0 else 'inserted'} for document {doc_id}")
            
            # Fetch the note
            note = query_one(
                "SELECT doc_id, content, created_at FROM notes WHERE doc_id = ?",
                [doc_id]
            )
        
        if not note:
            logger.error(f"Failed to retrieve note for document {doc_id}")
            raise HTTPException(status_code=500, detail="Failed to retrieve note")
        
        logger.info(f"Successfully created/updated note for document {doc_id}")
        return note
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create note for document {doc_id}: {str(e)} - Type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create note: {str(e)}")


@router.put("/documents/{doc_id}/notes")
async def update_document_note(doc_id: str, request: NoteRequest):
    """Update the note for a document"""
    try:
        from ..db import execute, query_one
        
        # Check if document exists
        doc = query_one("SELECT id FROM documents WHERE id = ?", [doc_id])
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Update or insert note
        cursor = execute(
            "UPDATE notes SET content = ?, created_at = datetime('now') WHERE doc_id = ?",
            [request.content, doc_id]
        )
        
        # If no rows were affected, insert a new note
        if cursor.rowcount == 0:
            cursor = execute(
                "INSERT INTO notes (doc_id, content) VALUES (?, ?)",
                [doc_id, request.content]
            )
        
        # Get updated note
        updated_note = query_one(
            "SELECT doc_id, content, created_at FROM notes WHERE doc_id = ?",
            [doc_id]
        )
        
        if not updated_note:
            raise HTTPException(status_code=500, detail="Failed to retrieve updated note")
        
        logger.info(f"Updated note for document {doc_id}")
        return updated_note
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update note for document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update note")


@router.delete("/documents/{doc_id}/notes")
async def delete_document_note(doc_id: str):
    """Delete the note for a document"""
    try:
        from ..db import execute, query_one
        
        # Check if document exists
        doc = query_one("SELECT id FROM documents WHERE id = ?", [doc_id])
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete note
        execute("DELETE FROM notes WHERE doc_id = ?", [doc_id])
        
        logger.info(f"Deleted note for document {doc_id}")
        return {"message": "Note deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete note for document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete note")
class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = None


@router.patch("/documents/{doc_id}")
async def update_document(doc_id: str, req: DocumentUpdateRequest):
    doc = documents_repo.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        if req.title is not None:
            documents_repo.update(doc_id, title=req.title)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
