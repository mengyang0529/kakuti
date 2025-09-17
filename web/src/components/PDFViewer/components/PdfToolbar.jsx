import React from 'react'
import PropTypes from 'prop-types'
import { usePdfViewer } from '../context/PdfViewerContext'
import { PDF_ACTIONS } from '../context/pdfViewerConstants'

const PdfToolbar = ({ onToggleSearchPanel }) => {
  const { toolMode, showSearchPanel, scale, currentPage, numPages, dispatch } = usePdfViewer()
  
  const handleToolModeChange = (mode) => {
    dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: mode })
  }
  
  const handleToggleSearchPanel = () => {
    if (onToggleSearchPanel) {
      onToggleSearchPanel()
    } else {
      dispatch({ type: PDF_ACTIONS.TOGGLE_SEARCH_PANEL })
    }
  }
  
  const handleZoomIn = () => {
    dispatch({ type: PDF_ACTIONS.SET_SCALE, payload: Math.min(2.0, scale + 0.2) })
  }
  
  const handleZoomOut = () => {
    dispatch({ type: PDF_ACTIONS.SET_SCALE, payload: Math.max(0.5, scale - 0.2) })
  }
  return (
    <>
      {/* Vertical Toolbar */}
      <div className="vertical-toolbar">
        <button 
          className={`toolbar-btn ${toolMode === 'screenshot' ? 'active' : ''}`}
          onClick={() => handleToolModeChange(toolMode === 'screenshot' ? 'normal' : 'screenshot')}
          title="Screenshot"
          aria-label="Toggle screenshot mode"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="0" y1="6" x2="20" y2="6"></line>
            <line x1="4" y1="18" x2="24" y2="18"></line>
            <line x1="4" y1="2" x2="4" y2="18"></line>
            <line x1="20" y1="6" x2="20" y2="22"></line>
          </svg>
        </button>
        
        <button 
          className={`toolbar-btn ${showSearchPanel ? 'active' : ''}`}
          onClick={handleToggleSearchPanel}
          title="Search"
          aria-label="Toggle search panel"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </button>
        
        <button 
          className={`toolbar-btn ${toolMode === 'highlight' ? 'active' : ''}`}
          onClick={() => handleToolModeChange(toolMode === 'highlight' ? 'normal' : 'highlight')}
          title="Highlight Text"
          aria-label="Toggle highlight mode"
        >
          {/* Marker/Highlighter icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Marker body (slanted rectangle) */}
            <path d="M14 3l7 7-8.5 8.5-7-7L14 3z" />
            {/* Marker tip highlight (small triangle at the end) */}
            <path d="M21 10l-2.5 2.5" />
            {/* Cap/handle (small parallelogram) */}
            <path d="M5 14l5 5-4 1-2-2 1-4z" />
          </svg>
        </button>
      </div>

      {/* Floating zoom controls */}
      <div className="floating-zoom-controls">
        {/* Contents (outline) button only */}
        <button
          className="icon-btn"
          type="button"
          title="Contents"
          aria-label="Open contents"
          onClick={() => dispatch({ type: PDF_ACTIONS.TOGGLE_OUTLINE })}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="4" cy="5" r="1.5" fill="#059669" />
            <rect x="8" y="4" width="10" height="2" rx="1" fill="#059669" />
            <circle cx="4" cy="10" r="1.5" fill="#059669" />
            <rect x="8" y="9" width="10" height="2" rx="1" fill="#059669" />
            <circle cx="4" cy="15" r="1.5" fill="#059669" />
            <rect x="8" y="14" width="10" height="2" rx="1" fill="#059669" />
          </svg>
        </button>
        <span className="page-indicator">{currentPage}/{numPages || 0}</span>
      </div>
    </>
  )
}

PdfToolbar.propTypes = {
  onToggleSearchPanel: PropTypes.func
}

export default PdfToolbar
