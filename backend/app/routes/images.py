from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from ..services.ocr_service import OCRService

router = APIRouter(tags=["images"])
ocr_service = OCRService()


class ImageParseResponse(BaseModel):
    text: str
    blocks: List[dict]
    captions: Optional[str] = None


@router.post("/image/parse", response_model=ImageParseResponse)
async def parse_image(file: UploadFile = File(...)):
    try:
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        image_data = await file.read()
        result = ocr_service.parse_image(image_data)
        
        if 'error' in result:
            raise HTTPException(status_code=500, detail=result['error'])
        
        return ImageParseResponse(
            text=result['text'],
            blocks=result['blocks']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
