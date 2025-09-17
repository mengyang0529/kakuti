import React from 'react'
import PropTypes from 'prop-types'

const VerticalToolbar = ({ onSearch, onScreenshot, onToggleHighlight, isHighlightActive, onOverview, onMagicWand, isMagicWandActive }) => {
  return (
    <div className="vertical-toolbar">
      <button className={"toolbar-btn" + (isMagicWandActive ? " active" : "")} title="Magic Wand" onClick={onMagicWand}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Magic wand with halo stars">
          <defs>
            <path id="star" d="M0,-1.5 L0.44,-0.46 L1.43,-0.46 L0.61,0.18 L0.88,1.21 L0,0.68 L-0.88,1.21 L-0.61,0.18 L-1.43,-0.46 L-0.44,-0.46 Z" fill="currentColor"/>
          </defs>
          <g transform="translate(7.5,7.5) rotate(45)">
            <rect x="0" y="-1.0" width="15" height="2.0" rx="1.0" fill="currentColor"/>
            <rect x="-1.5" y="-1.0" width="3.5" height="2.0" rx="1.0" fill="currentColor"/>
          </g>
          <g transform="translate(7.5,7.5)">
            <use href="#star" transform="translate(0,-4.2) scale(1.40)"/>
            <use href="#star" transform="translate(3.75,-1.2) scale(1.25)"/>
            <use href="#star" transform="translate(2.7,6.6) scale(1.15)"/>
            <use href="#star" transform="translate(-2.4,3.9) scale(1.30)"/>
            <use href="#star" transform="translate(-4.2,-1.2) scale(1.20)"/>
          </g>
        </svg>
      </button>

      <button className="toolbar-btn" title="Search" onClick={onSearch}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>

      <button className="toolbar-btn" title="Screenshot" onClick={onScreenshot}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9V6a2 2 0 0 1 2-2h3" />
          <path d="M20 9V6a2 2 0 0 0-2-2h-3" />
          <path d="M4 15v3a2 2 0 0 0 2 2h3" />
          <path d="M20 15v3a2 2 0 0 1-2 2h-3" />
        </svg>
      </button>

      <button className={"toolbar-btn" + (isHighlightActive ? " highlight-active" : "")} title="Highlight" onClick={onToggleHighlight}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 16.5L14 6l4 4L7.5 20.5H4v-3.5z" />
          <polygon points="14 6 16.5 3.5 21 8 18 10" />
          <line x1="6.5" y1="17.5" x2="9" y2="20" />
        </svg>
      </button>

      <button className="toolbar-btn" title="Overview" onClick={onOverview}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </button>
    </div>
  )
}

VerticalToolbar.propTypes = {
  onSearch: PropTypes.func.isRequired,
  onScreenshot: PropTypes.func.isRequired,
  onToggleHighlight: PropTypes.func.isRequired,
  isHighlightActive: PropTypes.bool,
  onOverview: PropTypes.func.isRequired,
  onMagicWand: PropTypes.func.isRequired,
  isMagicWandActive: PropTypes.bool
}

export default VerticalToolbar
