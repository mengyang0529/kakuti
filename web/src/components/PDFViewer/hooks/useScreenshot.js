import { useState } from 'react'

const useScreenshot = (viewerRef, onScreenshotComplete) => {
  const [isScreenshotMode, setIsScreenshotMode] = useState(false)
  const [screenshotArea, setScreenshotArea] = useState(null)

  const handleScreenshotStart = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const startX = e.clientX - rect.left
    const startY = e.clientY - rect.top
    
    setScreenshotArea({
      startX,
      startY,
      endX: startX,
      endY: startY,
      isSelecting: true
    })
    setIsScreenshotMode(true)
  }

  const handleScreenshotMove = (e) => {
    if (!isScreenshotMode || !screenshotArea) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const endY = e.clientY - rect.top
    
    setScreenshotArea(prev => ({
      ...prev,
      endX,
      endY
    }))
  }

  const handleScreenshotEnd = () => {
    if (!isScreenshotMode || !screenshotArea) return
    
    // Capture screenshot of selected area
    captureScreenshot()
    setIsScreenshotMode(false)
    setScreenshotArea(null)
  }

  const captureScreenshot = async () => {
    if (!screenshotArea) return
    
    try {
      const { startX, startY, endX, endY } = screenshotArea
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)
      
      if (width < 10 || height < 10) {
        alert('Selection area too small, please select again')
        return
      }
      
      // Get device pixel ratio for high-resolution capture
      const dpr = window.devicePixelRatio || 1
      const scaleFactor = Math.max(2, dpr) // At least 2x scaling
      
      // Create high-resolution output canvas
      const outputCanvas = document.createElement('canvas')
      const outputCtx = outputCanvas.getContext('2d')
      
      // Set canvas size with high resolution
      outputCanvas.width = width * scaleFactor
      outputCanvas.height = height * scaleFactor
      
      // Disable image smoothing for crisp rendering
      outputCtx.imageSmoothingEnabled = false
      outputCtx.webkitImageSmoothingEnabled = false
      outputCtx.mozImageSmoothingEnabled = false
      outputCtx.msImageSmoothingEnabled = false
      
      // Get all PDF canvas elements in the document container
      if (!viewerRef.current) {
        console.error('PDF viewer reference not available')
        return
      }
      
      // viewerRef.current is already the pdf-document-container
      const pdfContainer = viewerRef.current
      const pdfCanvases = pdfContainer.querySelectorAll('.react-pdf__Page__canvas')
      
      if (pdfCanvases.length === 0) {
        console.error('No PDF pages found for screenshot')
        return
      }
      
      // Calculate container offset
      const containerRect = pdfContainer.getBoundingClientRect()
      const containerScrollTop = pdfContainer.scrollTop
      const containerScrollLeft = pdfContainer.scrollLeft
      
      // Process each PDF canvas that intersects with the selection area
      for (const canvas of pdfCanvases) {
        const pageContainer = canvas.closest('.page-container')
        if (!pageContainer) continue
        
        const canvasRect = canvas.getBoundingClientRect()
        
        // Calculate absolute positions accounting for scroll
        const canvasAbsoluteTop = canvasRect.top - containerRect.top + containerScrollTop
        const canvasAbsoluteLeft = canvasRect.left - containerRect.left + containerScrollLeft
        
        // Check if this canvas intersects with the selection area
        const selectionLeft = Math.min(startX, endX)
        const selectionTop = Math.min(startY, endY)
        const selectionRight = selectionLeft + width
        const selectionBottom = selectionTop + height
        
        const canvasLeft = canvasAbsoluteLeft
        const canvasTop = canvasAbsoluteTop
        const canvasRight = canvasLeft + canvas.width
        const canvasBottom = canvasTop + canvas.height
        
        // Check intersection
        if (selectionRight > canvasLeft && selectionLeft < canvasRight &&
            selectionBottom > canvasTop && selectionTop < canvasBottom) {
          
          // Calculate intersection area
          const intersectLeft = Math.max(selectionLeft, canvasLeft)
          const intersectTop = Math.max(selectionTop, canvasTop)
          const intersectRight = Math.min(selectionRight, canvasRight)
          const intersectBottom = Math.min(selectionBottom, canvasBottom)
          
          const intersectWidth = intersectRight - intersectLeft
          const intersectHeight = intersectBottom - intersectTop
          
          if (intersectWidth > 0 && intersectHeight > 0) {
            // Calculate source coordinates on the original canvas
            const sourceX = (intersectLeft - canvasLeft) * (canvas.width / canvasRect.width)
            const sourceY = (intersectTop - canvasTop) * (canvas.height / canvasRect.height)
            const sourceWidth = intersectWidth * (canvas.width / canvasRect.width)
            const sourceHeight = intersectHeight * (canvas.height / canvasRect.height)
            
            // Calculate destination coordinates on output canvas
            const destX = (intersectLeft - selectionLeft) * scaleFactor
            const destY = (intersectTop - selectionTop) * scaleFactor
            const destWidth = intersectWidth * scaleFactor
            const destHeight = intersectHeight * scaleFactor
            
            // Copy the high-quality canvas data directly
            outputCtx.drawImage(
              canvas,
              sourceX, sourceY, sourceWidth, sourceHeight,
              destX, destY, destWidth, destHeight
            )
          }
        }
      }
      
      // Download the high-quality screenshot
      const link = document.createElement('a')
      link.download = `pdf-screenshot-${Date.now()}.png`
      link.href = outputCanvas.toDataURL('image/png', 1.0) // Maximum quality PNG
      link.click()
      
      // Auto-close screenshot mode after successful save
      setTimeout(() => {
        setIsScreenshotMode(false)
        setScreenshotArea(null)
        // Notify parent component that screenshot is complete
        if (onScreenshotComplete) {
          onScreenshotComplete()
        }
      }, 100) // Small delay to ensure download starts
      
    } catch (error) {
      console.error('Screenshot capture failed:', error)
      alert('Screenshot failed, please try again')
    }
  }

  const exitScreenshotMode = () => {
    setIsScreenshotMode(false)
    setScreenshotArea(null)
  }

  return {
    isScreenshotMode,
    screenshotArea,
    handleScreenshotStart,
    handleScreenshotMove,
    handleScreenshotEnd,
    setIsScreenshotMode,
    setScreenshotArea,
    exitScreenshotMode
  }
}

export default useScreenshot
