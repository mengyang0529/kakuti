import React from 'react'
import PropTypes from 'prop-types'
import { usePdfViewer } from '../context/PdfViewerContext'

const MagicWandLayer = ({ 
  drawnPaths, 
  currentPath, 
  isDrawing, 
  generatePathString, 
  onPathClick 
}) => {
  const { viewerRef } = usePdfViewer()
  // Read current scroll dimensions each render so the overlay stays in sync
  const el = viewerRef?.current
  const svgWidth = el ? el.scrollWidth : '100%'
  const svgHeight = el ? el.scrollHeight : '100%'
  
  if (!drawnPaths.length && !isDrawing) return null

  return (
    <svg 
      className="magic-wand-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        // Ensure the SVG spans the full scroll content
        width: typeof svgWidth === 'number' ? `${svgWidth}px` : svgWidth,
        height: typeof svgHeight === 'number' ? `${svgHeight}px` : svgHeight,
        pointerEvents: 'none',
        zIndex: 5
      }}
    >
      {/* Render completed paths */}
      {drawnPaths.map(path => {
        // Create a clipping path for this specific page
        const clipId = `page-clip-${path.pageIndex}-${path.id}`
        
        return (
          <g key={path.id}>
            {/* Define clipping area for this page */}
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <rect
                  x={path.pageRect?.left || 0}
                  y={path.pageRect?.top || 0}
                  width={path.pageRect?.width || '100%'}
                  height={path.pageRect?.height || '100%'}
                />
              </clipPath>
            </defs>
            {/* Group all visuals under the clipPath so nothing bleeds outside the page */}
            <g clipPath={`url(#${clipId})`}>
              {/* Glow effect */}
              <path
                d={generatePathString(path.points)}
                stroke={path.color}
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.2"
                filter="blur(2px)"
               />
               {/* Main path */}
               <path
                 d={generatePathString(path.points)}
                 stroke={path.color}
                 strokeWidth="2"
                 fill="none"
                 strokeLinecap="round"
                 strokeLinejoin="round"
                 opacity="0.6"
                 style={{
                   pointerEvents: 'stroke',
                   cursor: 'pointer'
                 }}
                 onClick={() => onPathClick && onPathClick(path.id)}
               />
               {/* Sparkle effects along the path */}
               {path.points.filter((_, index) => index % 10 === 0).map((point, index) => (
                 <g key={index}>
                   {/* Star sparkle */}
                   <path
                     d={`M ${point.x} ${point.y - 2} L ${point.x + 0.7} ${point.y - 0.7} L ${point.x + 2} ${point.y} L ${point.x + 0.7} ${point.y + 0.7} L ${point.x} ${point.y + 2} L ${point.x - 0.7} ${point.y + 0.7} L ${point.x - 2} ${point.y} L ${point.x - 0.7} ${point.y - 0.7} Z`}
                     fill={path.color}
                     opacity="0.4"
                   />
                   {/* Cross sparkle */}
                   <path
                     d={`M ${point.x - 1.5} ${point.y} L ${point.x + 1.5} ${point.y} M ${point.x} ${point.y - 1.5} L ${point.x} ${point.y + 1.5}`}
                     stroke={path.color}
                     strokeWidth="0.5"
                     opacity="0.3"
                   />
                 </g>
               ))}
            </g>
          </g>
        )
      })}
      
      {/* Render current drawing path */}
      {isDrawing && currentPath.length > 1 && (() => {
        const firstPoint = currentPath[0]
        const currentClipId = `current-page-clip-${firstPoint.pageIndex || 0}`
        
        return (
          <g>
            {/* Define clipping area for current path */}
            <defs>
              <clipPath id={currentClipId} clipPathUnits="userSpaceOnUse">
                <rect
                  x={firstPoint.pageRect?.left || 0}
                  y={firstPoint.pageRect?.top || 0}
                  width={firstPoint.pageRect?.width || '100%'}
                  height={firstPoint.pageRect?.height || '100%'}
                />
              </clipPath>
            </defs>
            <g clipPath={`url(#${currentClipId})`}>
              {/* Glow effect for current path */}
              <path
                d={generatePathString(currentPath)}
                stroke="#00FF7F"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.2"
                filter="blur(2px)"
              />
              {/* Main current path */}
              <path
                d={generatePathString(currentPath)}
                stroke="#00FF7F"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
              />
              {/* Live sparkles on current path */}
              {currentPath.filter((_, index) => index % 5 === 0).map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r="1.5"
                  fill="#00FF7F"
                  opacity="0.4"
                >
                  <animate
                    attributeName="opacity"
                    values="0.4;0.7;0.4"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </circle>
              ))}
            </g>
          </g>
        )
      })()}
    </svg>
  )
}

MagicWandLayer.propTypes = {
  drawnPaths: PropTypes.array.isRequired,
  currentPath: PropTypes.array.isRequired,
  isDrawing: PropTypes.bool.isRequired,
  generatePathString: PropTypes.func.isRequired,
  onPathClick: PropTypes.func
}

export default MagicWandLayer
