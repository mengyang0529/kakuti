import React, { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { Document, Page } from 'react-pdf'
import { usePdfViewer } from '../context/PdfViewerContext'
import { PDF_ACTIONS } from '../context/pdfViewerConstants'

const PdfDocument = ({
  file,
  // Interaction props (from ScreenshotTool behavior)
  toolMode,
  isScreenshotMode,
  screenshotArea,
  onScreenshotStart,
  onScreenshotMove,
  onScreenshotEnd,
  isHighlightMode,
  onHighlightMouseDown,
  onHighlightMouseMove,
  onHighlightMouseUp,
  // Magic wand props
  isMagicWandMode,
  onMagicWandMouseDown,
  onMagicWandMouseMove,
  onMagicWandMouseUp,
  children
}) => {
  const { scale, numPages, error, dispatch, viewerRef, pdfDocRef } = usePdfViewer()
  const currentFileRef = useRef(file)

  // Handle document cleanup when file changes
  useEffect(() => {
    if (currentFileRef.current !== file) {
      // Reset state when switching documents
      dispatch({ type: PDF_ACTIONS.SET_NUM_PAGES, payload: 0 })
      dispatch({ type: PDF_ACTIONS.SET_ERROR, payload: null })
      
      // Clear previous PDF reference
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy()
        } catch (e) {
          // Ignore cleanup errors
        }
        pdfDocRef.current = null
      }
      
      currentFileRef.current = file
    }
  }, [file, dispatch, pdfDocRef])

  const onDocumentLoadSuccess = async (pdf) => {
    try {
      dispatch({ type: PDF_ACTIONS.SET_NUM_PAGES, payload: pdf.numPages })
      dispatch({ type: PDF_ACTIONS.SET_ERROR, payload: null })
      pdfDocRef.current = pdf
    } catch {
      dispatch({ type: PDF_ACTIONS.SET_ERROR, payload: 'Unable to initialize PDF document' })
    }
  }

  const onDocumentLoadError = (error) => {
    dispatch({ type: PDF_ACTIONS.SET_ERROR, payload: `Unable to load PDF file: ${error.message || 'Unknown error'}` })
  }

  if (error) {
    return (
      <div className="error">
        <div>
          <h3>Loading Failed</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      </div>
    )
  }

  const getContainerStyle = () => ({
    cursor: toolMode === 'screenshot' ? 'crosshair' : 'default',
    touchAction: toolMode === 'screenshot' ? 'manipulation' : 'auto',
    msContentZooming: 'none',
    msUserSelect: 'text',
    WebkitUserSelect: 'text'
  })

  return (
    <Document
      file={file}
      onLoadSuccess={onDocumentLoadSuccess}
      onLoadError={onDocumentLoadError}
      loading={<div className="loading">Loading PDF document...</div>}
      error={<div className="error">Unable to load PDF file, please check if the file is corrupted</div>}
    >
      <div
        className="pdf-document-container"
        ref={viewerRef}
        data-tool-mode={toolMode || ''}
        onMouseDown={(e) => {
          if (toolMode === 'screenshot' && onScreenshotStart) onScreenshotStart(e)
          if (isHighlightMode && onHighlightMouseDown) onHighlightMouseDown(e)
          if (isMagicWandMode && onMagicWandMouseDown) onMagicWandMouseDown(e)
        }}
        onMouseMove={(e) => {
          if (toolMode === 'screenshot' && onScreenshotMove) onScreenshotMove(e)
          if (isHighlightMode && onHighlightMouseMove) onHighlightMouseMove(e)
          if (isMagicWandMode && onMagicWandMouseMove) onMagicWandMouseMove(e)
        }}
        onMouseUp={(e) => {
          if (toolMode === 'screenshot' && onScreenshotEnd) onScreenshotEnd(e)
          if (isHighlightMode && onHighlightMouseUp) onHighlightMouseUp(e)
          if (isMagicWandMode && onMagicWandMouseUp) onMagicWandMouseUp(e)
        }}
        style={getContainerStyle()}
      >
        {/* Screenshot overlay inside scroll container */}
        {isScreenshotMode && screenshotArea && (
          <div
            className="screenshot-overlay"
            style={{
              position: 'absolute',
              left: Math.min(screenshotArea.startX, screenshotArea.endX),
              top: Math.min(screenshotArea.startY, screenshotArea.endY),
              width: Math.abs(screenshotArea.endX - screenshotArea.startX),
              height: Math.abs(screenshotArea.endY - screenshotArea.startY),
              border: '2px dashed #059669',
              backgroundColor: 'rgba(5, 150, 105, 0.1)',
              zIndex: 1000,
              pointerEvents: 'none'
            }}
          />
        )}

        {/* Overlays/highlights slot (ensures overlays scroll with container) */}
        {children}
        <div className="all-pages-container">
          {Array.from(new Array(numPages), (el, index) => (
            <div key={`page_${index + 1}`} className="page-container">
              <Page
                pageNumber={index + 1}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                loading={<div className="loading">Loading page {index + 1}...</div>}
                error={<div className="error">Unable to load page {index + 1}</div>}
                className="pdf-page"
                onLoadSuccess={() => {
                  // Page loaded successfully, no action needed
                }}
                onLoadError={(error) => {
                  console.warn(`Page ${index + 1} load error:`, error)
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </Document>
  )
}

PdfDocument.propTypes = {
  file: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object,
    PropTypes.instanceOf(File)
  ]).isRequired,
  toolMode: PropTypes.string,
  isScreenshotMode: PropTypes.bool,
  screenshotArea: PropTypes.object,
  onScreenshotStart: PropTypes.func,
  onScreenshotMove: PropTypes.func,
  onScreenshotEnd: PropTypes.func,
  isHighlightMode: PropTypes.bool,
  onHighlightMouseDown: PropTypes.func,
  onHighlightMouseMove: PropTypes.func,
  onHighlightMouseUp: PropTypes.func,
  isMagicWandMode: PropTypes.bool,
  onMagicWandMouseDown: PropTypes.func,
  onMagicWandMouseMove: PropTypes.func,
  onMagicWandMouseUp: PropTypes.func,
  children: PropTypes.node
}

export default PdfDocument
