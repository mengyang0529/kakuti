import cv2
import pytesseract
import numpy as np
from PIL import Image
from typing import Dict, List
from loguru import logger


class OCRService:
    def __init__(self):
        # Configure tesseract path if needed
        # pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'
        pass

    def parse_image(self, image_data: bytes) -> Dict:
        try:
            # Convert bytes to numpy array
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            # Preprocess image
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # OCR
            text = pytesseract.image_to_string(gray)
            
            # Get bounding boxes for text blocks
            data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
            
            blocks = []
            for i in range(len(data['text'])):
                if data['conf'][i] > 30:  # Confidence threshold
                    blocks.append({
                        'text': data['text'][i],
                        'confidence': data['conf'][i],
                        'bbox': {
                            'x': data['left'][i],
                            'y': data['top'][i],
                            'width': data['width'][i],
                            'height': data['height'][i]
                        }
                    })
            
            return {
                'text': text.strip(),
                'blocks': blocks
            }
            
        except Exception as e:
            logger.error(f"OCR failed: {e}")
            return {
                'text': '',
                'blocks': [],
                'error': str(e)
            }
