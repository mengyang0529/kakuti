import { useState, useEffect } from 'react'

const useTextSelection = (viewerRef) => {
  const [selectedText, setSelectedText] = useState('')
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, selectedText: '', rects: [] })

  useEffect(() => {
    const handleMouseUp = (e) => {
      // Ignore clicks inside the action input dialog
      if (e.target.closest && e.target.closest('.action-input-dialog')) {
        return
      }
      const selection = window.getSelection()
      
      if (selection && selection.toString().trim()) {
        const selectedTextContent = selection.toString().trim()
        const range = selection.getRangeAt(0)
        const rects = range.getClientRects()
        // Fallback to union box if per-line rects unavailable
        const unionRect = range.getBoundingClientRect()
        let baseRect = unionRect
        if (rects && rects.length > 0) {
          const arr = Array.from(rects)
          const maxBottom = Math.max(...arr.map(r => r.bottom))
          // Pick rects that belong to the bottom-most line (within 2px tolerance)
          const bottomRects = arr.filter(r => Math.abs(r.bottom - maxBottom) <= 2)
          // Among bottom line rects, use the smallest left (leftmost) to align dialog to the left edge
          const leftmost = bottomRects.reduce((min, r) => (r.left < min.left ? r : min), bottomRects[0])
          baseRect = leftmost || arr[0]
        }
        
        // Check if selection is within PDF viewer
        const pdfContainer = viewerRef.current
        if (pdfContainer && pdfContainer.contains(range.commonAncestorContainer)) {
          
          // Calculate position ensuring menu stays within viewport
          const viewportWidth = window.innerWidth
          const viewportHeight = window.innerHeight
          const menuWidth = 420 // Approximate dialog width (slender)
          const menuHeight = 72 // Approximate dialog height

          // Prefer aligning dialog left edge to bottom line left, with small padding
          let x = baseRect.left
          let y = baseRect.bottom + 8

          // If overflow right, shift left to fit; if still overflow left, clamp to 8px
          if (x + menuWidth > viewportWidth - 8) {
            x = Math.max(8, viewportWidth - menuWidth - 8)
          }
          if (x < 8) x = 8

          // If bottom overflows viewport, place above the top of selection
          if (y + menuHeight > viewportHeight - 8) {
            y = Math.max(8, (baseRect.top - menuHeight - 8))
          }
          
          setSelectedText(selectedTextContent)
          // Capture viewport rects for persistent overlay highlight
          const rectList = Array.from(rects || []).map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }))
          setContextMenu({
            show: true,
            x,
            y,
            selectedText: selectedTextContent,
            rects: rectList
          })
          
          // Keep selection active; avoid blurring to preserve custom selection color
        }
      } else {
        setContextMenu({ show: false, x: 0, y: 0, selectedText: '', rects: [] })
        setSelectedText('')
      }
    }

    const handleMouseDown = (e) => {
      // Don't close if clicking on legacy context menu or new action dialog
      if ((e.target.closest && e.target.closest('.context-menu')) ||
          (e.target.closest && e.target.closest('.action-input-dialog'))) {
        return
      }
      setContextMenu({ show: false, x: 0, y: 0, selectedText: '', rects: [] })
      setSelectedText('')
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    
    // Additional Edge/Chromium specific events
    document.addEventListener('selectstart', (e) => {
      // Allow text selection but prevent context menu side effects
      const pdfViewer = viewerRef.current
      if (pdfViewer && pdfViewer.contains(e.target)) {
        e.stopPropagation()
      }
    })

    // Avoid blurring active element on selection change to keep selection "active"

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [viewerRef])

  const handleCopyText = async () => {
    if (!selectedText || selectedText.trim() === '') {
      return
    }

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(selectedText)
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea')
        textArea.value = selectedText
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        textArea.setSelectionRange(0, selectedText.length)
        
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (!successful) {
          throw new Error('Copy command was unsuccessful')
        }
      }
    } catch (err) {
      console.error('Failed to copy text:', err)
      // Silently fail - no user notification
    }
    
    // Close context menu and clear selection
    setContextMenu({ show: false, x: 0, y: 0 })
    // Don't clear selection immediately to allow manual copy if automatic failed
    setTimeout(() => {
      window.getSelection()?.removeAllRanges()
    }, 100)
  }

  const handleTranslateText = () => {
    // Just close context menu, translation will be handled by the dialog
    setContextMenu({ show: false, x: 0, y: 0, selectedText: '' })
    // Don't clear selection immediately to allow the dialog to access it
  }

  return {
    selectedText,
    contextMenu,
    handleCopyText,
    handleTranslateText,
    setContextMenu
  }
}

export default useTextSelection
