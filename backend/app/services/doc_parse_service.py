import fitz  # PyMuPDF
import os
from typing import Dict, Optional
from loguru import logger


class DocParseService:
    def parse_document(self, file_path: str, mime_type: str) -> Dict:
        try:
            if mime_type == "application/pdf":
                return self._parse_pdf(file_path)
            elif mime_type in ["text/plain", "text/markdown"]:
                return self._parse_text(file_path)
            else:
                logger.warning(f"Unsupported MIME type: {mime_type}, treating as text")
                return self._parse_text(file_path)
        except Exception as e:
            logger.error(f"Document parsing failed: {e}")
            # Return empty content instead of error to allow upload to proceed
            return {
                "text": "",
                "pages": [{"page": 1, "text": ""}],
                "page_count": 1
            }

    def _parse_pdf(self, file_path: str) -> Dict:
        try:
            doc = fitz.open(file_path)
            text = ""
            pages = []
            page_count = len(doc)
            
            for page_num in range(page_count):
                page = doc.load_page(page_num)
                page_text = page.get_text()
                text += page_text + "\n"
                pages.append({
                    "page": page_num + 1,
                    "text": page_text
                })
            
            doc.close()
            
            return {
                "text": text.strip(),
                "pages": pages,
                "page_count": page_count
            }
        except Exception as e:
            logger.error(f"Failed to parse PDF {file_path}: {e}")
            # For invalid PDFs, return empty content instead of failing
            return {
                "text": "",
                "pages": [{"page": 1, "text": ""}],
                "page_count": 1
            }

    def _parse_text(self, file_path: str) -> Dict:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "text": content,
            "pages": [{"page": 1, "text": content}],
            "page_count": 1
        }
