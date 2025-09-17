import React, { useState, useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import './DocumentPreviewCard.css'

const NotePreviewCard = ({ title, onOpen, onDelete, onRename, noteId, color }) => {
  const [menuOpen, setMenuOpen] = useState(false)

  // Pick a stable color per note using a simple hash over noteId or title
  const iconColor = useMemo(() => {
    if (color) return color
    const palette = [
      '#059669', // emerald
      '#2563EB', // blue
      '#DB2777', // pink
      '#7C3AED', // violet
      '#EA580C', // orange
      '#16A34A', // green
      '#0891B2', // cyan
      '#9333EA', // purple
      '#D97706', // amber
      '#DC2626', // red
    ]
    const seedSource = (noteId || title || 'note') + ''
    let h = 0
    for (let i = 0; i < seedSource.length; i++) {
      h = (h * 31 + seedSource.charCodeAt(i)) >>> 0
    }
    return palette[h % palette.length]
  }, [noteId, title, color])

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!menuOpen) return
      const target = e.target
      const inMenu = target.closest && target.closest('.note-menu-popup')
      const inButton = target.closest && target.closest('.note-menu-btn')
      if (!inMenu && !inButton) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [menuOpen])

  return (
    <div
      className="doc-preview-card clickable"
      role="button"
      tabIndex={0}
      aria-label="Open note"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen && onOpen()
        }
      }}
    >
      {(onDelete || onRename) && (
        <>
          <button
            className="note-menu-btn"
            title="Options"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
          {menuOpen && (
            <div className="note-menu-popup" onClick={(e) => e.stopPropagation()}>
              {onRename && (
                <button className="ws-menu-item" onClick={() => { setMenuOpen(false); onRename() }}>Rename</button>
              )}
              {onDelete && (
                <button className="ws-menu-item" onClick={() => { setMenuOpen(false); onDelete() }}>Delete</button>
              )}
            </div>
          )}
        </>
      )}
      <div className="doc-preview-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 4h11l5 5v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M14 4v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      </div>
      {title && (
        <div className="doc-preview-meta" title={title}>
          {title}
        </div>
      )}
    </div>
  )
}

NotePreviewCard.propTypes = {
  title: PropTypes.string,
  onOpen: PropTypes.func,
  onDelete: PropTypes.func,
  onRename: PropTypes.func,
  noteId: PropTypes.string,
  color: PropTypes.string
}

export default NotePreviewCard
