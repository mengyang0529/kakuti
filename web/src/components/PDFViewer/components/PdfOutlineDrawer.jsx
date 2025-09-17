import React, { useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { usePdfViewer } from '../context/PdfViewerContext'
import { PDF_ACTIONS } from '../context/pdfViewerConstants'

const PdfOutlineDrawer = ({ outline }) => {
  const { showOutline, dispatch, pdfDocRef, viewerRef } = usePdfViewer()
  const outlineCloseTimerRef = useRef(null)

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (outlineCloseTimerRef.current) {
        clearTimeout(outlineCloseTimerRef.current)
      }
    }
  }, [])

  const handleOutlineItemClick = async (item) => {
    try {
      if (!pdfDocRef.current) return
      let destArr = null
      if (typeof item.dest === 'string') {
        destArr = await pdfDocRef.current.getDestination(item.dest)
      } else if (Array.isArray(item.dest)) {
        destArr = item.dest
      }
      if (destArr && destArr[0]) {
        const pageIndex = await pdfDocRef.current.getPageIndex(destArr[0])
        const container = viewerRef.current
        const pages = container?.querySelectorAll('.page-container')
        if (container && pages && pages[pageIndex]) {
          container.scrollTo({ top: pages[pageIndex].offsetTop, behavior: 'smooth' })
          dispatch({ type: PDF_ACTIONS.SET_SHOW_OUTLINE, payload: false })
        }
      }
    } catch (error) {
      console.error('Error navigating to outline item:', error)
    }
  }

  const handleMouseEnter = () => {
    if (outlineCloseTimerRef.current) {
      clearTimeout(outlineCloseTimerRef.current)
      outlineCloseTimerRef.current = null
    }
  }

  const handleMouseLeave = () => {
    if (outlineCloseTimerRef.current) clearTimeout(outlineCloseTimerRef.current)
    outlineCloseTimerRef.current = setTimeout(() => dispatch({ type: PDF_ACTIONS.SET_SHOW_OUTLINE, payload: false }), 500)
  }

  const renderOutlineItems = (items) => {
    return (
      <ul className="outline-list">
        {items.map((item, idx) => (
          <li key={idx} className="outline-item">
            <button 
              className="outline-link" 
              onClick={() => handleOutlineItemClick(item)}
            >
              {item.title}
            </button>
            {item.items && item.items.length > 0 && (
              <div className="outline-sublist">
                {renderOutlineItems(item.items)}
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (!showOutline) return null

  return (
    <div className="outline-overlay" onClick={() => dispatch({ type: PDF_ACTIONS.SET_SHOW_OUTLINE, payload: false })}>
      <div
        className="outline-sheet"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="outline-sheet-body">
          {(!outline || outline.length === 0) ? (
            <div className="loading">No contents found</div>
          ) : (
            renderOutlineItems(outline)
          )}
        </div>
      </div>
    </div>
  )
}

PdfOutlineDrawer.propTypes = {
  outline: PropTypes.array.isRequired
}

export default PdfOutlineDrawer
