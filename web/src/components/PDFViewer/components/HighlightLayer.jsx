import React from 'react'
import PropTypes from 'prop-types'

const HighlightLayer = ({ overlays, onOverlayClick }) => {
  if (!overlays || overlays.length === 0) return null
  return (
    <>
      {overlays.map((overlay) => (
        <div
          key={overlay.key}
          className="highlight-overlay"
          style={{
            position: 'absolute',
            left: `${overlay.rect.left}px`,
            top: `${overlay.rect.top}px`,
            width: `${overlay.rect.width}px`,
            height: `${overlay.rect.height}px`,
            backgroundColor: overlay.color || 'rgba(34, 197, 94, 0.3)',
            pointerEvents: 'auto',
            zIndex: 100,
          }}
          
          onClick={(e) => {
            e.stopPropagation()
            onOverlayClick && onOverlayClick(overlay)
          }}
        />
      ))}
    </>
  )
}

HighlightLayer.propTypes = {
  overlays: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    rect: PropTypes.shape({
      left: PropTypes.number.isRequired,
      top: PropTypes.number.isRequired,
      width: PropTypes.number.isRequired,
      height: PropTypes.number.isRequired
    }).isRequired,
    color: PropTypes.string,
    id: PropTypes.string
  })),
  onOverlayClick: PropTypes.func.isRequired
}

export default HighlightLayer

