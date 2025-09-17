import React from 'react'
import PropTypes from 'prop-types'

/**
 * @typedef {Object} SearchResult
 * @property {string} id - Unique identifier for the search result
 * @property {HTMLElement} element - DOM element containing the matched text
 * @property {number} page - Page number where the result was found (1-indexed)
 */

/**
 * Component that renders absolutely positioned search highlight overlays
 * 
 * @param {Object} props - Component props
 * @param {SearchResult[]} props.searchResults - Array of search results to highlight
 * @param {number} props.currentSearchIndex - Index of currently active search result (-1 if none)
 * @param {React.RefObject} props.viewerRef - Reference to the PDF viewer container
 * @returns {JSX.Element|null} Overlay elements or null if no results
 */
const PdfOverlays = ({ searchResults, currentSearchIndex, viewerRef }) => {
  if (!searchResults || searchResults.length === 0 || !viewerRef?.current) {
    return null
  }

  /**
   * Calculate position of a text match within an element relative to the viewer container
   * @param {HTMLElement} element - Element containing the text
   * @param {Object} match - Match object with start, end, text properties
   * @returns {Object|null} Position object with left, top, width, height or null if invalid
   */
  const getMatchPosition = (element, match) => {
    if (!element || !viewerRef.current || !match) return null
    
    try {
      // Create a range for the specific match within the element
      const range = document.createRange()
      const textNode = element.firstChild || element
      
      // If element has text content directly
      if (textNode.nodeType === Node.TEXT_NODE) {
        range.setStart(textNode, match.start)
        range.setEnd(textNode, match.end)
      } else {
        // If element contains other nodes, find the text node
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        )
        
        let currentOffset = 0
        let targetNode = null
        let startOffset = 0
        let endOffset = 0
        
        while (walker.nextNode()) {
          const node = walker.currentNode
          const nodeLength = node.textContent.length
          
          if (currentOffset + nodeLength > match.start) {
            targetNode = node
            startOffset = match.start - currentOffset
            endOffset = Math.min(match.end - currentOffset, nodeLength)
            break
          }
          
          currentOffset += nodeLength
        }
        
        if (!targetNode) return null
        
        range.setStart(targetNode, startOffset)
        range.setEnd(targetNode, endOffset)
      }
      
      const rangeRect = range.getBoundingClientRect()
      const viewerRect = viewerRef.current.getBoundingClientRect()
      
      // Calculate position relative to the scrollable container
      return {
        left: rangeRect.left - viewerRect.left + viewerRef.current.scrollLeft,
        top: rangeRect.top - viewerRect.top + viewerRef.current.scrollTop,
        width: rangeRect.width,
        height: rangeRect.height
      }
    } catch (error) {
      console.warn('Error calculating match position:', error)
      // Fallback to element position
      const elementRect = element.getBoundingClientRect()
      const viewerRect = viewerRef.current.getBoundingClientRect()
      
      return {
        left: elementRect.left - viewerRect.left + viewerRef.current.scrollLeft,
        top: elementRect.top - viewerRect.top + viewerRef.current.scrollTop,
        width: elementRect.width,
        height: elementRect.height
      }
    }
  }

  /**
   * Calculate position by page occurrence index (k-th match on the page)
   * Falls back to offset if provided, but prefers occurrence-order for robustness.
   */
  const normalizeForSearch = (s) =>
    s
      .toLowerCase()
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
      .replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '')

  const buildSearchIndex = (raw) => {
    const unified = raw
      .toLowerCase()
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
    const map = []
    let out = ''
    for (let i = 0; i < unified.length; i++) {
      const ch = unified[i]
      if (ch === '\u200b' || ch === '\u200c' || ch === '\u200d' || ch === '\ufeff') continue
      if (unified.charCodeAt(i) === 0x00ad) continue
      out += ch
      map.push(i)
    }
    return { search: out, map }
  }

  const getPositionByPageOccurrence = (page, { order, query, length, offset }) => {
    if (!viewerRef.current) return null
    const container = viewerRef.current
    const pages = container.querySelectorAll('.page-container')
    const pageEl = pages[page - 1]
    if (!pageEl) return null
    const textLayer = pageEl.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return null
    const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT)
    const domNodes = []
    let full = ''
    while (walker.nextNode()) {
      const node = walker.currentNode
      const start = full.length
      const text = node.textContent || ''
      full += text
      domNodes.push({ node, start, end: start + text.length })
    }
    const qNorm = normalizeForSearch(query || '')
    const { search: fullSearch, map } = buildSearchIndex(full)
    const lenMatch = length || qNorm.length
    let startPos = -1
    if (typeof order === 'number') {
      let from = 0
      for (let i = 0; i <= order; i++) {
        startPos = fullSearch.indexOf(qNorm, from)
        if (startPos === -1) return null
        from = startPos + 1
      }
    } else if (typeof offset === 'number') {
      startPos = offset
    } else {
      return null
    }
    const endPos = startPos + lenMatch
    const findNodeOffset = (pos) => {
      // Treat segment end as exclusive so pos equal to end maps to next segment
      for (let i = 0; i < domNodes.length; i++) {
        const seg = domNodes[i]
        if (pos >= seg.start && pos < seg.end) {
          return { node: seg.node, offset: pos - seg.start }
        }
      }
      // If position equals the very end, clamp to last node end
      const last = domNodes[domNodes.length - 1]
      return { node: last?.node, offset: Math.max(0, (last?.end || 0) - (last?.start || 0)) }
    }
    const toRaw = (pos) => {
      const clamped = Math.min(Math.max(0, pos), map.length - 1)
      return map[clamped]
    }
    const rawStart = toRaw(startPos)
    const rawEndExclusive = toRaw(endPos - 1) + 1
    const s = findNodeOffset(rawStart)
    const e = findNodeOffset(rawEndExclusive)
    if (!s.node || !e.node) return null
    const range = document.createRange()
    try { range.setStart(s.node, s.offset); range.setEnd(e.node, e.offset) } catch { return null }
    const rectList = Array.from(range.getClientRects())
    const viewerRect = viewerRef.current.getBoundingClientRect()
    // Map to container coordinates and normalize
    const mapped = rectList.map(r => ({
      left: r.left - viewerRect.left + viewerRef.current.scrollLeft,
      top: r.top - viewerRect.top + viewerRef.current.scrollTop,
      width: r.width,
      height: r.height
    }))
    if (!mapped.length) return null
    return mapped
  }

  /**
   * Get set of currently visible page numbers
   * @returns {Set<number>} Set of visible page numbers (1-indexed)
   */
  const getVisiblePages = () => {
    if (!viewerRef.current) return new Set()
    
    // viewerRef.current is already the pdf-document-container
    const container = viewerRef.current
    const containerRect = container.getBoundingClientRect()
    const pageContainers = container.querySelectorAll('.page-container')
    const visiblePages = new Set()
    
    pageContainers.forEach((pageContainer, index) => {
      const pageRect = pageContainer.getBoundingClientRect()
      
      // Check if page is visible in viewport
      if (pageRect.bottom > containerRect.top && pageRect.top < containerRect.bottom) {
        visiblePages.add(index + 1) // Page numbers are 1-indexed
      }
    })
    
    return visiblePages
  }

  const visiblePages = getVisiblePages()
  
  // Filter search results to only show highlights for visible pages
  const visibleResults = searchResults.filter(result => 
    visiblePages.has(result.page)
  )

  return (
    <div className="pdf-overlays" style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      zIndex: 10
    }}>
      {visibleResults.map((result) => {
        let segments = null
        if (result.element && result.match) {
          const pos = getMatchPosition(result.element, result.match)
          segments = pos ? [pos] : null
        } else if (typeof result.page === 'number') {
          segments = getPositionByPageOccurrence(result.page, result)
        }
        if (!segments || segments.length === 0) return null
        
        const isCurrent = searchResults.indexOf(result) === currentSearchIndex
        return segments.map((position, segIdx) => (
          <div
            key={`${result.id}-${segIdx}`}
            className={`search-highlight-overlay ${isCurrent ? 'current' : ''}`}
            style={{
              position: 'absolute',
              left: position.left,
              top: position.top,
              width: position.width,
              height: position.height,
              backgroundColor: isCurrent ? 'rgba(76, 175, 80, 0.45)' : 'rgba(139, 195, 74, 0.35)',
              border: isCurrent ? '1.5px solid #4caf50' : '1px solid #8bc34a',
              borderRadius: '2px',
              pointerEvents: 'none',
              transition: 'all 0.12s ease'
            }}
          />
        ))
      })}
    </div>
  )
}

PdfOverlays.propTypes = {
  searchResults: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    element: PropTypes.object.isRequired,
    page: PropTypes.number.isRequired
  })).isRequired,
  currentSearchIndex: PropTypes.number.isRequired,
  viewerRef: PropTypes.object.isRequired
}

export default PdfOverlays