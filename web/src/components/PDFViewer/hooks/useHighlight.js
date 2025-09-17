import { useState, useCallback, useEffect } from 'react'
import highlightService from '../../../services/highlightService'
import cacheManager from '../utils/cacheManager'

const useHighlight = (viewerRef, toolMode, setToolMode, documentId) => {
  const [highlights, setHighlights] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const isHighlightMode = toolMode === 'highlight'
  const [isSelecting, setIsSelecting] = useState(false)

  // Enhanced offset-to-rect calculation with improved accuracy
  const calculateHighlightRects = useCallback(async (pageNumber, startOffset, endOffset, selectedText) => {
    const container = viewerRef.current
    if (!container) return []

    // Enhanced waiting strategy for page rendering
    const waitForPageRender = async (maxAttempts = 10) => {
      for (let i = 0; i < maxAttempts; i++) {
        const pageElement = container.querySelector(`[data-page-number="${pageNumber}"]`)
        const textLayer = pageElement?.querySelector('.textLayer')
        if (textLayer && textLayer.children.length > 0) {
          return { pageElement, textLayer }
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return { pageElement: null, textLayer: null }
    }

    const { pageElement, textLayer } = await waitForPageRender()
    if (!pageElement || !textLayer) {
      console.warn(`Page ${pageNumber} or text layer not found after waiting`)
      return []
    }

    // Enhanced text node collection with span awareness
    const collectTextNodesWithSpans = (element) => {
      const textNodes = []
      const spans = Array.from(element.querySelectorAll('span'))
      
      spans.forEach(span => {
        const walker = document.createTreeWalker(
          span,
          NodeFilter.SHOW_TEXT,
          null,
          false
        )
        let node
        while (node = walker.nextNode()) {
          if (node.textContent.trim()) { // Only include non-empty text nodes
            textNodes.push({
              node,
              span,
              text: node.textContent
            })
          }
        }
      })
      
      return textNodes
    }

    const textNodeData = collectTextNodesWithSpans(textLayer)
    if (textNodeData.length === 0) {
      console.warn('No text nodes found in text layer')
      return []
    }

    // Build cumulative text with enhanced offset tracking
    let cumulativeText = ''
    let startNodeInfo = null, endNodeInfo = null
    
    for (const nodeData of textNodeData) {
      const nodeText = nodeData.text
      const nodeStart = cumulativeText.length
      const nodeEnd = nodeStart + nodeText.length

      // Enhanced offset matching with boundary handling
      if (startOffset >= nodeStart && startOffset <= nodeEnd && !startNodeInfo) {
        startNodeInfo = {
          ...nodeData,
          offset: Math.max(0, Math.min(startOffset - nodeStart, nodeText.length))
        }
      }

      if (endOffset >= nodeStart && endOffset <= nodeEnd && !endNodeInfo) {
        endNodeInfo = {
          ...nodeData,
          offset: Math.max(0, Math.min(endOffset - nodeStart, nodeText.length))
        }
      }

      cumulativeText += nodeText

      if (startNodeInfo && endNodeInfo) break
    }

    // Fallback: if exact match not found, use closest nodes
    if (!startNodeInfo && textNodeData.length > 0) {
      startNodeInfo = { ...textNodeData[0], offset: 0 }
    }
    if (!endNodeInfo && textNodeData.length > 0) {
      const lastNode = textNodeData[textNodeData.length - 1]
      endNodeInfo = { ...lastNode, offset: lastNode.text.length }
    }

    if (!startNodeInfo || !endNodeInfo) {
      console.warn('Could not find start or end nodes for offsets', { startOffset, endOffset })
      return []
    }

    try {
      // Create range with enhanced error handling
      const range = document.createRange()
      
      // Validate and set range boundaries
      const startNode = startNodeInfo.node
      const endNode = endNodeInfo.node
      const startNodeOffset = Math.min(startNodeInfo.offset, startNode.textContent.length)
      const endNodeOffset = Math.min(endNodeInfo.offset, endNode.textContent.length)
      
      range.setStart(startNode, startNodeOffset)
      range.setEnd(endNode, endNodeOffset)

      // Validate range selection matches expected text
      const rangeText = range.toString()
      if (selectedText && rangeText !== selectedText) {
        console.warn('Range text mismatch:', {
          expected: selectedText,
          actual: rangeText,
          startOffset,
          endOffset
        })
      }

      const rects = Array.from(range.getClientRects())
      if (rects.length === 0) {
        console.warn('No client rects found for range')
        return []
      }

      const pageRect = pageElement.getBoundingClientRect()

      // Convert to normalized coordinates with validation
      const normalizedRects = rects
        .filter(rect => rect.width > 0 && rect.height > 0) // Filter out zero-size rects
        .map(rect => ({
          nLeft: Math.max(0, Math.min(1, (rect.left - pageRect.left) / pageRect.width)),
          nTop: Math.max(0, Math.min(1, (rect.top - pageRect.top) / pageRect.height)),
          nWidth: Math.max(0, Math.min(1, rect.width / pageRect.width)),
          nHeight: Math.max(0, Math.min(1, rect.height / pageRect.height))
        }))

      console.log(`Successfully calculated ${normalizedRects.length} rects for page ${pageNumber}`, {
        startOffset,
        endOffset,
        selectedText: selectedText?.substring(0, 50) + (selectedText?.length > 50 ? '...' : '')
      })

      return normalizedRects
    } catch (error) {
      console.error('Error calculating highlight rects:', error, {
        pageNumber,
        startOffset,
        endOffset,
        selectedText: selectedText?.substring(0, 50)
      })
      return []
    }
  }, [viewerRef])

  // Load highlights when document changes with caching
  useEffect(() => {
    if (!documentId) {
      setHighlights([]); // Clear highlights when there's no document
      return;
    }

    const loadAndRenderHighlights = async () => {
      setIsLoading(true);
      try {
        // Check cache first
        const cacheKey = `highlights_${documentId}`;
        let cachedHighlights = cacheManager.get('highlights', cacheKey);
        
        if (cachedHighlights) {
          console.log('Using cached highlights:', cachedHighlights.length);
          setHighlights(cachedHighlights);
          setIsLoading(false);
          return;
        }
        
        const serverHighlights = await highlightService.getDocumentHighlights(documentId);
        
        if (serverHighlights.length === 0) {
          setHighlights([]);
          return;
        }

        // Enhanced progressive loading with batching
        const processHighlightsBatch = async (highlights, batchSize = 5) => {
          const results = [];
          
          for (let i = 0; i < highlights.length; i += batchSize) {
            const batch = highlights.slice(i, i + batchSize);
            
            const batchResults = await Promise.allSettled(
              batch.map(async (h) => {
                try {
                  // Check if highlight rects are cached
                   const highlightCacheKey = `highlight_rects_${h.id}`
                   let rects = cacheManager.get('highlights', highlightCacheKey);
                  
                  if (!rects) {
                    rects = await calculateHighlightRects(
                      h.page_number,
                      h.start_offset,
                      h.end_offset,
                      h.selected_text
                    );
                    
                    // Cache the calculated rects
                    if (rects && rects.length > 0) {
                      cacheManager.set('highlights', highlightCacheKey, rects, { ttl: 300000 }); // 5min TTL
                    }
                  } else {
                    console.log(`Using cached rects for highlight ${h.id}`);
                  }
                  
                  return {
                    id: h.id,
                    text: h.selected_text,
                    page: h.page_number,
                    rects: rects,
                    range: { startOffset: h.start_offset, endOffset: h.end_offset },
                    timestamp: h.created_at,
                    comment: h.note || '',
                    color: h.color || 'rgba(34, 197, 94, 0.3)',
                    source: h.source || 'manual'
                  };
                } catch (error) {
                  console.warn(`Failed to process highlight ${h.id}:`, error);
                  return null;
                }
              })
            );
            
            // Filter successful results and add to collection
            const successfulResults = batchResults
              .filter(result => result.status === 'fulfilled' && result.value !== null)
              .map(result => result.value);
            
            results.push(...successfulResults);
            
            // Update UI progressively for better user experience
            if (results.length > 0) {
              setHighlights(prev => {
                const existingIds = new Set(prev.map(h => h.id));
                const newHighlights = results.filter(h => !existingIds.has(h.id));
                return [...prev, ...newHighlights];
              });
            }
            
            // Small delay between batches to prevent UI blocking
            if (i + batchSize < highlights.length) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          return results;
        };

        // Process highlights with enhanced error handling
        const processedHighlights = await processHighlightsBatch(serverHighlights);
        
        console.log(`Successfully loaded ${processedHighlights.length}/${serverHighlights.length} highlights`);
        
        // Final update with all processed highlights
        setHighlights(processedHighlights);
        
        // Cache all processed highlights
        if (processedHighlights.length > 0) {
          cacheManager.set('highlights', cacheKey, processedHighlights, { ttl: 300000 }); // 5min TTL
          console.log(`Cached ${processedHighlights.length} processed highlights`);
        }

      } catch (error) {
        console.error('Failed to load highlights:', error);
        setHighlights([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadAndRenderHighlights();
  }, [documentId, calculateHighlightRects]);

  // Clear all highlights
  const clearHighlights = useCallback(() => {
    // With overlay approach, we just clear the highlights array
    // The overlay elements will be removed when the component re-renders
    setHighlights([])
    // Clear highlight caches
    if (documentId) {
      const cacheKey = `highlights_${documentId}`;
      cacheManager.delete('highlights', cacheKey);
      console.log('Cleared highlight caches');
    }
  }, [documentId])

  // Calculate page-level text offsets from DOM Range
  const calculatePageTextOffsets = useCallback((range, pageElement) => {
    const textLayer = pageElement.querySelector('.textLayer')
    if (!textLayer) return { startOffset: 0, endOffset: 0 }

    // Get all text nodes in the page
    const walker = document.createTreeWalker(
      textLayer,
      NodeFilter.SHOW_TEXT,
      null,
      false
    )

    const textNodes = []
    let node
    while (node = walker.nextNode()) {
      textNodes.push(node)
    }

    // Build cumulative text content and find offsets
    let cumulativeText = ''
    let startOffset = 0
    let endOffset = 0
    let foundStart = false
    let foundEnd = false

    // Helper function to get the actual text node from a container
    const getTextNode = (container, offset) => {
      if (container.nodeType === Node.TEXT_NODE) {
        return { node: container, offset: offset }
      }
      // If container is an element, find the text node at the given offset
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
        false
      )
      let currentOffset = 0
      let textNode
      while (textNode = walker.nextNode()) {
        const nodeLength = textNode.textContent.length
        if (currentOffset + nodeLength >= offset) {
          return { node: textNode, offset: offset - currentOffset }
        }
        currentOffset += nodeLength
      }
      return null
    }

    // Get actual text nodes and offsets for start and end
    const startInfo = getTextNode(range.startContainer, range.startOffset)
    const endInfo = getTextNode(range.endContainer, range.endOffset)

    if (!startInfo || !endInfo) {
      console.warn('Could not find text nodes for range')
      return { startOffset: 0, endOffset: 0 }
    }

    for (const textNode of textNodes) {
      const nodeText = textNode.textContent
      const nodeStart = cumulativeText.length
      const nodeEnd = nodeStart + nodeText.length

      // Check if this is the start text node
      if (!foundStart && textNode === startInfo.node) {
        startOffset = nodeStart + startInfo.offset
        foundStart = true
      }

      // Check if this is the end text node
      if (!foundEnd && textNode === endInfo.node) {
        endOffset = nodeStart + endInfo.offset
        foundEnd = true
      }

      cumulativeText += nodeText

      if (foundStart && foundEnd) break
    }

    // Ensure end offset is not less than start offset
    if (endOffset < startOffset) {
      console.warn('End offset is less than start offset, swapping values')
      const temp = startOffset
      startOffset = endOffset
      endOffset = temp
    }

    console.log('Calculated offsets:', { startOffset, endOffset, selectedText: cumulativeText.substring(startOffset, endOffset) })
    return { startOffset, endOffset }
  }, [])

  // Apply highlight to selected text using overlay approach
  const applyHighlight = useCallback(async (selection) => {
    console.log('applyHighlight called with documentId:', documentId)
    if (!selection || selection.rangeCount === 0) {
      console.log('applyHighlight early return - selection:', !!selection, 'rangeCount:', selection?.rangeCount)
      return
    }

    const range = selection.getRangeAt(0)
    const selectedText = range.toString().trim()
    
    if (!selectedText) return

    try {
      // Get the bounding rectangles for the selection
      const rects = range.getClientRects()
      const container = viewerRef.current
      const containerRect = container?.getBoundingClientRect()
      
      if (!container || !containerRect || rects.length === 0) return
      
      // Determine the page container for this selection
      const rectsArray = Array.from(rects)
      let ancestor = range.commonAncestorContainer
      if (ancestor && ancestor.nodeType !== 1 && ancestor.parentNode) {
        ancestor = ancestor.parentNode
      }
      let pageElem = ancestor && ancestor.closest ? ancestor.closest('.page-container') : null
      if (!pageElem && rectsArray.length > 0) {
        // Fallback: hit-test using the first rect center point
        const testX = rectsArray[0].left + Math.min(4, rectsArray[0].width / 2)
        const testY = rectsArray[0].top + Math.min(4, rectsArray[0].height / 2)
        const el = document.elementFromPoint(testX, testY)
        if (el && el.closest) pageElem = el.closest('.page-container')
      }

      // If still not found, bail out
      if (!pageElem) return

      const pageRect = pageElem.getBoundingClientRect()
      const pages = container.querySelectorAll('.page-container')
      const pageIndex = Math.max(0, Array.from(pages).indexOf(pageElem)) + 1

      // Calculate correct page-level text offsets
      const { startOffset, endOffset } = calculatePageTextOffsets(range, pageElem)

      // Store normalized rects relative to the page element so they scale with zoom
      const highlightRects = rectsArray.map((rect) => ({
        nLeft: (rect.left - pageRect.left) / pageRect.width,
        nTop: (rect.top - pageRect.top) / pageRect.height,
        nWidth: rect.width / pageRect.width,
        nHeight: rect.height / pageRect.height
      }))
      
      // Store highlight data with position information
      const defaultColor = 'rgba(34, 197, 94, 0.3)'
      const tempId = Date.now() + Math.random()
      
      const highlightData = {
        id: tempId,
        text: selectedText,
        page: pageIndex,
        rects: highlightRects, // normalized rects
        range: {
          startOffset: startOffset,
          endOffset: endOffset
        },
        timestamp: new Date().toISOString(),
        comment: '',
        color: defaultColor
      }
      
      // Add to local state immediately for responsive UI
      setHighlights(prev => [...prev, highlightData])
      
      // Save to backend only if documentId is available
      if (documentId) {
        try {
          console.log('Attempting to save highlight with data:', {
            doc_id: documentId,
            page_number: pageIndex,
            start_offset: startOffset,
            end_offset: endOffset,
            selected_text: selectedText,
            color: defaultColor,
            note: ''
          })
          
          console.log('Creating highlight with data:', {
            doc_id: documentId,
            page_number: pageIndex,
            start_offset: startOffset,
            end_offset: endOffset,
            selected_text: selectedText,
            color: defaultColor,
            note: ''
          })
          
          const serverHighlight = await highlightService.createHighlight({
            doc_id: documentId,
            page_number: pageIndex,
            start_offset: startOffset,
            end_offset: endOffset,
            selected_text: selectedText,
            color: defaultColor,
            note: ''
          })
          
          console.log('Created highlight response:', serverHighlight)
          
          // Update local state with server ID
          setHighlights(prev => prev.map(h => 
            h.id === tempId ? { ...h, id: serverHighlight.id, serverData: serverHighlight } : h
          ))
          
          console.log('Highlight saved successfully:', serverHighlight.id)
        } catch (error) {
          console.error('Failed to save highlight to server:', error)
          console.error('Error details:', error.message, error.response?.data)
          // Remove from local state if server save failed
          setHighlights(prev => prev.filter(h => h.id !== tempId))
          alert('Failed to save highlight: ' + (error.message || 'Unknown error'))
        }
      } else {
        console.log('No documentId provided, highlight saved locally only')
      }
      
      // Clear selection
      selection.removeAllRanges()
      
    } catch (error) {
      console.error('Error applying highlight:', error)
    }
  }, [viewerRef, documentId])

  // Handle mouse down event
  const handleMouseDown = useCallback((e) => {
    if (!isHighlightMode) return
    
    // Only handle left mouse button
    if (e.button !== 0) return
    
    // Check if clicking on PDF text content
    const textElement = e.target.closest('.react-pdf__Page__textContent span')
    if (!textElement) return
    
    setIsSelecting(true)
    // start element not needed anymore
    
    // Don't prevent default - allow normal text selection
  }, [isHighlightMode])

  // Handle mouse up event
  const handleMouseUp = useCallback(() => {
    if (!isHighlightMode || !isSelecting) return
    
    setIsSelecting(false)
    
    // Get current selection
    const selection = window.getSelection()
    
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const selectedText = range.toString().trim()
      
      // Only apply highlight if there's actual text selected
      if (selectedText.length > 0) {
        applyHighlight(selection)
      }
      
      // Clear selection after highlighting
      selection.removeAllRanges()
    }
    
    // reset selection state only
  }, [isHighlightMode, isSelecting, applyHighlight])

  // Handle mouse move event (for visual feedback)
  const handleMouseMove = useCallback(() => {
    if (!isHighlightMode || !isSelecting) return
    
    // Update end element for potential selection
    // no-op for now; selection handled by browser
  }, [isHighlightMode, isSelecting])

  // Toggle highlight mode
  const toggleHighlightMode = useCallback(() => {
    setToolMode(prev => prev === 'highlight' ? 'normal' : 'highlight')
    setIsSelecting(false)
    
    // Clear any existing selection when toggling mode
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
  }, [setToolMode])

  // Remove specific highlight
  const removeHighlight = useCallback(async (highlightId) => {
    try {
      // Remove from local state immediately
      setHighlights(prev => prev.filter(h => h.id !== highlightId))
      
      // Remove from server
      await highlightService.deleteHighlight(highlightId)
      console.log('Highlight deleted successfully:', highlightId)
    } catch (error) {
      console.error('Failed to delete highlight:', error)
      // Could restore the highlight here if needed
    }
  }, [])

  // Update comment for a specific highlight
  const updateHighlightComment = useCallback(async (highlightId, comment) => {
    try {
      // Update local state immediately
      setHighlights(prev => prev.map(h => h.id === highlightId ? { ...h, comment } : h))
      
      // Update on server
      await highlightService.updateHighlight(highlightId, { note: comment })
      console.log('Highlight comment updated successfully:', highlightId)
    } catch (error) {
      console.error('Failed to update highlight comment:', error)
      // Could revert the local change here if needed
    }
  }, [])

  // Update color for a specific highlight
  const updateHighlightColor = useCallback(async (highlightId, color) => {
    try {
      // Update local state immediately
      setHighlights(prev => prev.map(h => h.id === highlightId ? { ...h, color } : h))
      
      // Update on server
      await highlightService.updateHighlight(highlightId, { color })
      console.log('Highlight color updated successfully:', highlightId)
    } catch (error) {
      console.error('Failed to update highlight color:', error)
      // Could revert the local change here if needed
    }
  }, [])

  // Get highlight overlay data for rendering with performance optimization
  const getHighlightOverlays = useCallback(() => {
    const container = viewerRef.current;
    if (!container) return [];
  
    const overlays = [];
    const pages = container.querySelectorAll('.page-container');
  
    for (const highlight of highlights) {
      const pageIdx = (highlight.page || 1) - 1;
      const pageElem = pages[pageIdx];
  
      if (pageElem && highlight.rects && highlight.rects.length > 0) {
        const pageRect = pageElem.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop;
        const scrollLeft = container.scrollLeft;
  
        const absRects = highlight.rects.map(r => ({
          left: (pageRect.left - containerRect.left) + scrollLeft + (r.nLeft * pageRect.width),
          top: (pageRect.top - containerRect.top) + scrollTop + (r.nTop * pageRect.height),
          width: r.nWidth * pageRect.width,
          height: r.nHeight * pageRect.height,
        }));
  
        // Render each rectangle individually without merging
        absRects.forEach((rect, i) => {
          overlays.push({
            key: `${highlight.id}-${i}`,
            rect: rect,
            id: highlight.id,
            color: highlight.color,
          });
        });
      }
    }
    return overlays;
  }, [highlights, viewerRef]);

  return {
    highlights,
    applyHighlight,
    isHighlightMode,
    isLoading,
    toggleHighlightMode,
    clearHighlights,
    removeHighlight,
    updateHighlightComment,
    updateHighlightColor,
    getHighlightOverlays,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove
  }
}

export default useHighlight
