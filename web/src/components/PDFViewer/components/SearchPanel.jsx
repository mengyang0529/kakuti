import React, { useRef, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { usePdfViewer } from '../context/PdfViewerContext'
import { PDF_ACTIONS } from '../context/pdfViewerConstants'

const SearchPanel = ({ 
  searchTerm,
  onSearchTermChange,
  onDebouncedSearch,
  searchResults,
  currentSearchIndex,
  onNextResult,
  onPrevResult,
  onClose
}) => {
  const { showSearchPanel, dispatch } = usePdfViewer()
  const searchPanelRef = useRef(null)
  const searchInputRef = useRef(null)
  // Debounce is handled in useSearch hook; keep inputs simple
  const [focusableElements, setFocusableElements] = useState([])

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [isDragged, setIsDragged] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragOffsetRef = useRef({ dx: 0, dy: 0 })

  // Focus management and keyboard navigation
  useEffect(() => {
    if (showSearchPanel && searchPanelRef.current) {
      // Focus the search input when panel opens
      if (searchInputRef.current) {
        searchInputRef.current.focus()
      }
      
      // Get all focusable elements for focus trap
      const focusable = searchPanelRef.current.querySelectorAll(
        'input, button, [tabindex]:not([tabindex="-1"])'
      )
      setFocusableElements(Array.from(focusable))
    }
  }, [showSearchPanel])

  // Reset drag state when panel closes
  useEffect(() => {
    if (!showSearchPanel) {
      setIsDragging(false)
      setIsDragged(false)
    }
  }, [showSearchPanel])

  // Click outside to close search panel and clear search results
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSearchPanel && 
          searchPanelRef.current && 
          !searchPanelRef.current.contains(event.target) &&
          !event.target.closest('.toolbar-btn') &&
          !event.target.closest('.search-panel')) {
        onClose()
      }
    }

    const handleKeyDown = (event) => {
      if (!showSearchPanel) return
      
      // Only handle keyboard events if the search panel or its elements have focus
      const isSearchPanelFocused = searchPanelRef.current && 
        (searchPanelRef.current.contains(document.activeElement) || 
         document.activeElement === document.body)
      
      // Close on Escape key (always handle this)
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      
      // Only handle other keys if search panel area is focused
      if (!isSearchPanelFocused) return
      
      // Focus trap - Tab navigation
      if (event.key === 'Tab' && focusableElements.length > 0) {
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]
        
        if (event.shiftKey) {
          // Shift + Tab - move to previous element
          if (document.activeElement === firstElement) {
            event.preventDefault()
            lastElement.focus()
          }
        } else {
          // Tab - move to next element
          if (document.activeElement === lastElement) {
            event.preventDefault()
            firstElement.focus()
          }
        }
      }
      
      // Arrow key navigation for search results (only when search input is focused)
      if (searchResults.length > 0 && document.activeElement === searchInputRef.current) {
        if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'g')) {
          event.preventDefault()
          onNextResult()
        } else if (event.key === 'ArrowUp' || (event.ctrlKey && event.shiftKey && event.key === 'G')) {
          event.preventDefault()
          onPrevResult()
        }
      }
      
      // Global Ctrl+G shortcuts (handle even when not focused on search input)
      if (searchResults.length > 0) {
        if (event.ctrlKey && event.key === 'g' && !event.shiftKey) {
          event.preventDefault()
          onNextResult()
        } else if (event.ctrlKey && event.shiftKey && event.key === 'G') {
          event.preventDefault()
          onPrevResult()
        }
      }
    }

    if (showSearchPanel) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [showSearchPanel, dispatch, focusableElements, searchResults, onNextResult, onPrevResult, onClose])

  // Drag handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return
      const x = e.clientX - dragOffsetRef.current.dx
      const y = e.clientY - dragOffsetRef.current.dy
      // Clamp within viewport with 8px padding
      const pad = 8
      const panel = searchPanelRef.current
      const width = panel ? panel.offsetWidth : 200
      const height = panel ? panel.offsetHeight : 120
      const maxX = window.innerWidth - width - pad
      const maxY = window.innerHeight - height - pad
      const clampedX = Math.max(pad, Math.min(x, maxX))
      const clampedY = Math.max(pad, Math.min(y, maxY))
      setPosition({ x: clampedX, y: clampedY })
      setIsDragged(true)
    }
    const handleMouseUp = () => setIsDragging(false)
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging])

  const startDrag = (e) => {
    if (!searchPanelRef.current) return
    const rect = searchPanelRef.current.getBoundingClientRect()
    dragOffsetRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    setPosition({ x: rect.left, y: rect.top })
    setIsDragging(true)
    e.preventDefault()
    e.stopPropagation()
  }

  // No local timers to cleanup

  if (!showSearchPanel) return null

  // Inline style to elevate above toolbar and allow dragging
  const panelStyle = isDragged
    ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', transform: 'none', position: 'fixed', zIndex: 10050 }
    : { zIndex: 10050 }

  return (
    <div 
      className="search-panel" 
      ref={searchPanelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search PDF content"
      aria-describedby="search-instructions"
      style={panelStyle}
    >
      <div 
        className="search-panel-header" 
        onMouseDown={startDrag}
        role="button"
        tabIndex={0}
        aria-label="Drag search panel"
        title="Drag to move"
      >
        Search
      </div>
      <div className="search-input-container">
        <label htmlFor="search-input" className="sr-only">
          Search PDF content
        </label>
        <input
          id="search-input"
          ref={searchInputRef}
          type="text"
          placeholder="Search text..."
          value={searchTerm}
          onChange={(e) => {
            const newValue = e.target.value
            onSearchTermChange(newValue)
            onDebouncedSearch(newValue)
          }}
          onKeyDown={(e) => {
            // Prevent Enter key from triggering additional search
            if (e.key === 'Enter') {
              e.preventDefault()
            }
          }}
          className="search-input"
          aria-describedby="search-instructions search-results-info"
        />
        <div id="search-instructions" className="sr-only">
          Use arrow keys or Ctrl+G to navigate results. Press Escape to close.
        </div>
      </div>
      
      {searchResults.length > 0 && (
        <div className="search-results" role="region" aria-label="Search results">
          <div className="search-info" id="search-results-info" aria-live="polite">
            {searchResults.length > 0 ? (
              <span>
                Found {searchResults.length} results - Viewing {currentSearchIndex + 1}/{searchResults.length}
              </span>
            ) : (
              searchTerm && <span>No results found</span>
            )}
          </div>
          <div className="search-navigation" role="group" aria-label="Navigate search results">
            <button 
              onClick={onPrevResult} 
              disabled={searchResults.length === 0}
              aria-label="Previous result"
              title="Previous result (↑ or Ctrl+Shift+G)"
            >
              ↑
            </button>
            <button 
              onClick={onNextResult} 
              disabled={searchResults.length === 0}
              aria-label="Next result"
              title="Next result (↓ or Ctrl+G)"
            >
              ↓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

SearchPanel.propTypes = {
  searchTerm: PropTypes.string.isRequired,
  onSearchTermChange: PropTypes.func.isRequired,
  onDebouncedSearch: PropTypes.func.isRequired,
  searchResults: PropTypes.arrayOf(PropTypes.object).isRequired,
  currentSearchIndex: PropTypes.number.isRequired,
  onNextResult: PropTypes.func.isRequired,
  onPrevResult: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default SearchPanel
