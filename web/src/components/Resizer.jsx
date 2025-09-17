import { useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import './Resizer.css'

const Resizer = ({ onResize, onResizeComplete, leftWidth, rightWidth, minLeftWidth = 200, minRightWidth = 200 }) => {
  const resizerRef = useRef(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startLeftWidth = useRef(0)

  const handleMouseDown = (e) => {
    isDragging.current = true
    startX.current = e.clientX
    startLeftWidth.current = leftWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handleMouseMove = (e) => {
    if (!isDragging.current) return

    const deltaX = e.clientX - startX.current
    const newLeftWidth = Math.max(minLeftWidth, startLeftWidth.current + deltaX)
    const newRightWidth = Math.max(minRightWidth, window.innerWidth - newLeftWidth - 12) // 12px for resizer width

    onResize(newLeftWidth, newRightWidth)
  }

  const handleMouseUp = () => {
    if (isDragging.current && onResizeComplete) {
      // Call onResizeComplete with final dimensions when drag ends
      onResizeComplete(leftWidth, rightWidth)
    }
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [leftWidth, rightWidth])

  return (
    <div
      ref={resizerRef}
      className="resizer"
      onMouseDown={handleMouseDown}
    />
  )
}

Resizer.propTypes = {
  onResize: PropTypes.func.isRequired,
  onResizeComplete: PropTypes.func,
  leftWidth: PropTypes.number.isRequired,
  rightWidth: PropTypes.number.isRequired,
  minLeftWidth: PropTypes.number,
  minRightWidth: PropTypes.number
}

export default Resizer
