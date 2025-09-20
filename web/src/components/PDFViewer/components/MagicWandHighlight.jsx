import React from 'react'
import PropTypes from 'prop-types'

const MagicWandHighlight = ({ magicSelection }) => {
  if (!magicSelection || !magicSelection.isOpen || !magicSelection.rectsNorm || magicSelection.rectsNorm.length === 0 || magicSelection.pageIndex < 0) {
    return null
  }

  return (
    <>
      {magicSelection.rectsNorm.map((rect, index) => (
        <div
          key={`magic-selection-${index}`}
          className="magic-selection-highlight"
          style={{
            position: 'absolute',
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
            backgroundColor: 'rgba(59, 130, 246, 0.4)', // 蓝色高亮
            border: '1px solid rgba(59, 130, 246, 0.6)',
            pointerEvents: 'none',
            zIndex: 99,
            borderRadius: '2px',
            animation: 'magicHighlightPulse 0.3s ease-in-out',
            boxShadow: '0 0 4px rgba(59, 130, 246, 0.3)',
          }}
        />
      ))}
    </>
  )
}

MagicWandHighlight.propTypes = {
  magicSelection: PropTypes.shape({
    isOpen: PropTypes.bool,
    pageIndex: PropTypes.number,
    rectsNorm: PropTypes.arrayOf(PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number,
      w: PropTypes.number,
      h: PropTypes.number
    }))
  })
}

export default MagicWandHighlight
