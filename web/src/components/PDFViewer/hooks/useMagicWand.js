import { useState, useCallback, useRef, useEffect } from 'react'

const useMagicWand = (viewerRef, toolMode, onWandSelect) => {
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState([])
  const [drawnPaths, setDrawnPaths] = useState([])
  const drawingRef = useRef(null)
  const lastPointRef = useRef(null)
  const onWandSelectRef = useRef(onWandSelect)
  
  // Update the callback ref when onWandSelect changes
  useEffect(() => {
    onWandSelectRef.current = onWandSelect
  }, [onWandSelect])

  const isMagicWandMode = toolMode === 'magicwand'

  const getRelativePosition = useCallback((e) => {
    if (!viewerRef.current) return null
    
    // Find the specific page that was clicked using elementFromPoint
    const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY)
    
    // Try to find the page container first, then the react-pdf page
    const targetPageContainer = elementAtPoint?.closest('.page-container')
    
    if (!targetPageContainer) {
      return null
    }
    
    // Find the actual react-pdf page within the container
    const targetPage = targetPageContainer.querySelector('.react-pdf__Page')
    
    if (!targetPage) {
      return null
    }
    
    // Find the page index using page containers
    const pageContainers = viewerRef.current.querySelectorAll('.page-container')
    
    let pageIndex = -1
    for (let i = 0; i < pageContainers.length; i++) {
      if (pageContainers[i] === targetPageContainer) {
        pageIndex = i
        break
      }
    }
    
    // Get position relative to the specific page
    const pageRect = targetPage.getBoundingClientRect()
    const containerRect = viewerRef.current.getBoundingClientRect()
    const scrollLeft = viewerRef.current.scrollLeft
    const scrollTop = viewerRef.current.scrollTop
    
    // Calculate position relative to the container (for SVG overlay)
    const containerX = e.clientX - containerRect.left + scrollLeft
    const containerY = e.clientY - containerRect.top + scrollTop
    
    // Calculate position relative to the specific page
    const pageX = e.clientX - pageRect.left
    const pageY = e.clientY - pageRect.top
    
    // Calculate page rect relative to the SVG container (for clipping)
    const calculatedPageRect = {
      left: pageRect.left - containerRect.left + scrollLeft,
      top: pageRect.top - containerRect.top + scrollTop,
      width: pageRect.width,
      height: pageRect.height
    }
    
    const result = {
      x: containerX,  // Position in container coordinates (for SVG)
      y: containerY,
      pageX,          // Position relative to page
      pageY,
      pageIndex,      // Which page was clicked
      pageRect: calculatedPageRect
    }
    
    return result
  }, [viewerRef])

  const handleMouseDown = useCallback((e) => {
    if (!isMagicWandMode) return
    
    e.preventDefault()
    const pos = getRelativePosition(e)
    if (!pos) return

    setIsDrawing(true)
    setCurrentPath([pos])
    lastPointRef.current = pos
  }, [isMagicWandMode, getRelativePosition, toolMode])

  const handleMouseMove = useCallback((e) => {
    if (!isMagicWandMode || !isDrawing) return
    
    e.preventDefault()
    const pos = getRelativePosition(e)
    if (!pos || !lastPointRef.current) return

    // Only add point if it's far enough from the last point (smooth drawing)
    const distance = Math.sqrt(
      Math.pow(pos.x - lastPointRef.current.x, 2) + 
      Math.pow(pos.y - lastPointRef.current.y, 2)
    )
    
    if (distance > 2) {
      setCurrentPath(prev => [...prev, pos])
      lastPointRef.current = pos
    }
  }, [isMagicWandMode, isDrawing, getRelativePosition])

  const handleMouseUp = useCallback((e) => {
    if (!isMagicWandMode || !isDrawing) return
    
    e.preventDefault()
    setIsDrawing(false)
    
    // Use functional update to get the latest currentPath
    setCurrentPath(prevCurrentPath => {
      if (prevCurrentPath.length > 1) {
        // Get page info from the first point of the path
        const firstPoint = prevCurrentPath[0]
        const lastPoint = prevCurrentPath[prevCurrentPath.length - 1]
        
        // Calculate bounding box for the path
        const minX = Math.min(...prevCurrentPath.map(p => p.pageX))
        const maxX = Math.max(...prevCurrentPath.map(p => p.pageX))
        const minY = Math.min(...prevCurrentPath.map(p => p.pageY))
        const maxY = Math.max(...prevCurrentPath.map(p => p.pageY))
        
        // Add the completed path to drawn paths
        const newPath = {
          id: Date.now() + Math.random(),
          points: [...prevCurrentPath],
          color: '#00FF7F', // Spring green for magic wand highlights
          timestamp: Date.now(),
          pageIndex: firstPoint.pageIndex || 0,
          pageRect: firstPoint.pageRect
        }
        setDrawnPaths(prev => [...prev, newPath])
        
        // Trigger wand selection callback if provided
        if (onWandSelectRef.current) {
          // Convert container coordinates to viewport coordinates for dialog positioning
          const containerRect = viewerRef.current.getBoundingClientRect()
          const viewportX = lastPoint.x - viewerRef.current.scrollLeft + containerRect.left
          const viewportY = lastPoint.y - viewerRef.current.scrollTop + containerRect.top
          
          const wandSelectData = {
            pageIndex: firstPoint.pageIndex || 0,
            minX,
            maxX,
            pathBounds: { minX, maxX, minY, maxY },
            anchor: {
              x: viewportX, // Viewport coordinates for dialog positioning
              y: viewportY,
              pageX: lastPoint.pageX, // Page coordinates
              pageY: lastPoint.pageY
            },
            pageRect: firstPoint.pageRect
          }
          onWandSelectRef.current(wandSelectData)
        }
      }
      
      return [] // Clear current path
    })
    
    lastPointRef.current = null
  }, [isMagicWandMode, isDrawing, onWandSelect, toolMode])

  const clearAllPaths = useCallback(() => {
    setDrawnPaths([])
    setCurrentPath([])
    setIsDrawing(false)
    lastPointRef.current = null
  }, [])

  const removePath = useCallback((pathId) => {
    setDrawnPaths(prev => prev.filter(path => path.id !== pathId))
  }, [])

  // Generate SVG path string from points
  const generatePathString = useCallback((points) => {
    if (points.length < 2) return ''
    
    let pathString = `M ${points[0].x} ${points[0].y}`
    
    for (let i = 1; i < points.length; i++) {
      pathString += ` L ${points[i].x} ${points[i].y}`
    }
    
    return pathString
  }, [])

  return {
    isMagicWandMode,
    isDrawing,
    currentPath,
    drawnPaths,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    clearAllPaths,
    removePath,
    generatePathString
  }
}

export default useMagicWand
