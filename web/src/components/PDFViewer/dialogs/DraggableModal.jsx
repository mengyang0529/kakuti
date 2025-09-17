import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import './DraggableModal.css'

const DraggableModal = ({
  isOpen,
  initialPosition,
  onClose,
  children,
  className = '',
  draggableHandle = '.draggable-modal-header'
}) => {
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const modalRef = useRef(null)
  const dragStartPos = useRef({ x: 0, y: 0 })

  // Set initial position only when modal first opens
  useEffect(() => {
    if (isOpen && initialPosition) {
      setPosition(initialPosition)
    }
  }, [isOpen]) // Only depend on isOpen, not initialPosition

  // Clamp position to viewport boundaries
  const clampToViewport = useCallback((x, y) => {
    if (!modalRef.current) return { x, y }
    
    const modal = modalRef.current
    const rect = modal.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
    const clampedX = Math.max(0, Math.min(x, viewportWidth - rect.width))
    const clampedY = Math.max(0, Math.min(y, viewportHeight - rect.height))
    
    return { x: clampedX, y: clampedY }
  }, [])

  // Handle pointer down on draggable handle
  const handlePointerDown = useCallback((e) => {
    // Check if the target matches the draggable handle selector
    const handle = e.currentTarget.querySelector(draggableHandle)
    if (!handle || !handle.contains(e.target)) return
    
    // Don't prevent default for buttons or other interactive elements
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    
    const rect = modalRef.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    
    setIsDragging(true)
    setDragOffset({ x: offsetX, y: offsetY })
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    
    // Capture pointer events
    e.currentTarget.setPointerCapture(e.pointerId)
    
    // Prevent text selection during drag
    document.body.style.userSelect = 'none'
  }, [draggableHandle])

  // Handle pointer move
  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return
    
    e.preventDefault()
    
    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y
    
    const clampedPosition = clampToViewport(newX, newY)
    setPosition(clampedPosition)
  }, [isDragging, dragOffset, clampToViewport])

  // Handle pointer up
  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return
    
    setIsDragging(false)
    
    // Release pointer capture
    e.currentTarget.releasePointerCapture(e.pointerId)
    
    // Restore text selection
    document.body.style.userSelect = ''
  }, [isDragging])

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return
    
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose?.()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const modalContent = (
    <div
      ref={modalRef}
      className={`draggable-modal ${className} ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 11000 // above toolbars (9999) and search panel (10050 fallback)
      }}
      onMouseDown={(e) => { e.stopPropagation() }}
      onClick={(e) => { e.stopPropagation() }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  )

  // Use portal to render at document.body level
  return createPortal(modalContent, document.body)
}

DraggableModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  initialPosition: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }),
  onClose: PropTypes.func,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  draggableHandle: PropTypes.string
}

DraggableModal.defaultProps = {
  initialPosition: { x: 100, y: 100 },
  onClose: null,
  className: '',
  draggableHandle: '.draggable-modal-header'
}

export default DraggableModal
