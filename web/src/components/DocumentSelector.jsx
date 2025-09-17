import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import './DocumentSelector.css'

const DocumentSelector = ({ documents, isVisible, onSelect, onClose, position }) => {
  const [filteredDocs, setFilteredDocs] = useState(documents)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectorRef = useRef(null)

  useEffect(() => {
    setFilteredDocs(documents)
    setSelectedIndex(0)
  }, [documents])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isVisible) return
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => 
            prev < filteredDocs.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredDocs.length - 1
          )
          break
        case 'Enter':
          e.preventDefault()
          if (filteredDocs[selectedIndex]) {
            onSelect(filteredDocs[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, filteredDocs, selectedIndex, onSelect, onClose])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target)) {
        onClose()
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isVisible, onClose])

  if (!isVisible || filteredDocs.length === 0) {
    return null
  }

  const getDocumentIcon = (mime) => {
    if (mime && mime.startsWith('application/pdf')) {
      return '📄'
    }
    return '📝'
  }

  return (
    <div 
      ref={selectorRef}
      className="document-selector mention-picker"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 30000
      }}
    >
      <div className="document-selector-header">
        <span className="selector-title">Select Document</span>
        <span className="selector-count">{filteredDocs.length} documents</span>
      </div>
      <div className="document-list">
        {filteredDocs.map((doc, index) => (
          <div
            key={doc.id}
            className={`document-item ${index === selectedIndex ? 'selected' : ''}`}
            onMouseDown={() => onSelect(doc)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="document-icon">{getDocumentIcon(doc.mime)}</span>
            <span className="document-title">{doc.title}</span>
          </div>
        ))}
      </div>
      <div className="document-selector-footer">
        <span className="selector-hint">↑↓ to navigate • Enter to select • Esc to close</span>
      </div>
    </div>
  )
}

DocumentSelector.propTypes = {
  documents: PropTypes.array.isRequired,
  isVisible: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }).isRequired
}

export default DocumentSelector