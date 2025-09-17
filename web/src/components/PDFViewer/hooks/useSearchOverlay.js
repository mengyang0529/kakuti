import { useState, useRef, useCallback } from 'react'
import { usePdfViewer } from '../context/PdfViewerContext'

// Helpers defined at module scope to avoid TDZ issues
function normalizeForSearch(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '')
}

function buildSearchIndex(raw) {
  const unified = (raw || '')
    .toLowerCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')

  const map = []
  let out = ''
  for (let i = 0; i < unified.length; i++) {
    const code = unified.charCodeAt(i)
    // Skip zero-width and soft hyphen
    if (code === 0x200B || code === 0x200C || code === 0x200D || code === 0xFEFF || code === 0x00AD) continue
    out += unified[i]
    map.push(i)
  }
  return { search: out, map }
}

/**
 * Custom hook for managing PDF search functionality with overlay rendering
 * 
 * @param {React.RefObject} viewerRef - Reference to the PDF viewer container element
 * @returns {Object} Search state and control functions
 * @returns {string} returns.searchTerm - Current search term
 * @returns {Array<Object>} returns.searchResults - Array of search result objects with element and position info
 * @returns {number} returns.currentSearchIndex - Index of currently highlighted search result (-1 if none)
 * @returns {Function} returns.handleSearch - Function to perform search with debouncing
 * @returns {Function} returns.debouncedSearch - Debounced version of search function
 * @returns {Function} returns.scrollToSearchResult - Function to scroll to a specific search result
 * @returns {Function} returns.nextSearchResult - Function to navigate to next search result
 * @returns {Function} returns.prevSearchResult - Function to navigate to previous search result
 * @returns {Function} returns.clearSearch - Function to clear all search results and state
 * @returns {Function} returns.refreshSearch - Function to refresh search results (useful after scroll)
 */
const useSearchOverlay = (viewerRef) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1)
  
  const searchTimeoutRef = useRef(null)
  const { numPages, pdfDocRef } = usePdfViewer()
  const lastSearchTermRef = useRef('')
  const pendingTargetPageRef = useRef(null)
  const pageTextsRef = useRef([])
  const indexBuildingRef = useRef(false)

  // (removed unused helpers getCurrentPageForElement / getVisiblePages)

  /**
   * Build full-text index (lazy)
   */
  const ensureFullIndex = useCallback(async () => {
    if (!pdfDocRef?.current || !numPages) return
    if (indexBuildingRef.current) return
    const hasAll = pageTextsRef.current && pageTextsRef.current.length >= (numPages + 1) &&
      pageTextsRef.current.slice(1, numPages + 1).every(t => typeof t === 'string')
    if (hasAll) return
    indexBuildingRef.current = true
    try {
      pageTextsRef.current = []
      pageTextsRef.current.length = numPages + 1
      for (let p = 1; p <= numPages; p++) {
        try {
          const page = await pdfDocRef.current.getPage(p)
          const textContent = await page.getTextContent()
          // Use no separator to keep offsets consistent with DOM text layer
          const text = textContent.items.map(it => it.str).join('')
          pageTextsRef.current[p] = text
        } catch {
          pageTextsRef.current[p] = ''
        }
      }
    } finally {
      indexBuildingRef.current = false
    }
  }, [pdfDocRef, numPages])

  // Scroll to a specific search result by computing its range on the text layer
  const scrollToSearchResult = useCallback((index) => {
    if (index < 0 || index >= searchResults.length) return
    if (!viewerRef.current) return
    const container = viewerRef.current
    const result = searchResults[index]
    const pages = container.querySelectorAll('.page-container')
    const targetPageEl = pages[result.page - 1]
    if (!targetPageEl) return

    const tryComputeAndScroll = () => {
      const textLayer = targetPageEl.querySelector('.react-pdf__Page__textContent')
      if (!textLayer) return false
      // Build DOM text and map positions
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
      // Locate k-th occurrence on this page
      const qNorm = normalizeForSearch(result.query || '')
      const { search: fullSearch, map } = buildSearchIndex(full)
      const len = qNorm.length
      let idx = -1
      let from = 0
      const k = typeof result.order === 'number' ? result.order : 0
      for (let i = 0; i <= k; i++) {
        idx = fullSearch.indexOf(qNorm, from)
        if (idx === -1) return false
        from = idx + 1
      }
      const startPos = idx
      const endPos = idx + len
      const findNodeOffset = (pos) => {
        // Use exclusive end boundary to avoid mapping to previous line
        for (let i = 0; i < domNodes.length; i++) {
          const seg = domNodes[i]
          if (pos >= seg.start && pos < seg.end) {
            return { node: seg.node, offset: pos - seg.start }
          }
        }
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
      if (!s.node || !e.node) return false
      const range = document.createRange()
      try { range.setStart(s.node, s.offset); range.setEnd(e.node, e.offset) } catch { return false }
      const rects = Array.from(range.getClientRects())
      const first = rects[0] || range.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const segTop = first.top - containerRect.top + container.scrollTop
      const segBottom = segTop + first.height
      const viewTop = container.scrollTop
      const viewBottom = viewTop + container.clientHeight
      const margin = 16
      if (segTop >= viewTop + margin && segBottom <= viewBottom - margin) {
        // Already fully visible -> no scroll to avoid jitter
        return true
      }
      const targetTop = Math.max(0, segTop - (container.clientHeight / 2))
      container.scrollTo({ top: targetTop, behavior: 'smooth' })
      return true
    }

    // If target page is offscreen (text layer likely not rendered), first bring page into view
    const containerRect = container.getBoundingClientRect()
    const pageRect = targetPageEl.getBoundingClientRect()
    const pageInView = pageRect.bottom > containerRect.top && pageRect.top < containerRect.bottom
    if (!pageInView) {
      const targetTop = Math.max(0, targetPageEl.offsetTop - 24)
      container.scrollTo({ top: targetTop, behavior: 'smooth' })
    }
    let tries = 0
    const maxTries = 20
    const tick = () => {
      if (tryComputeAndScroll()) return
      tries++
      if (tries < maxTries) setTimeout(tick, 120)
    }
    setTimeout(tick, 150)
  }, [searchResults, viewerRef])

  /**
   * Perform full-document search using index
   */
  const handleSearch = useCallback(async (searchText) => {
    if (!searchText.trim()) {
      setSearchResults([])
      setCurrentSearchIndex(-1)
      return
    }

    try {
      const results = []
      const qNorm = normalizeForSearch(searchText.trim())
      const needleLen = qNorm.length
      await ensureFullIndex()
      for (let p = 1; p <= (numPages || 0); p++) {
        const raw = pageTextsRef.current[p] || ''
        const { search: pageSearch } = buildSearchIndex(raw)
        if (!pageSearch || pageSearch.indexOf(qNorm) === -1) continue
        let pos = 0
        let order = 0
        while (true) {
          const found = pageSearch.indexOf(qNorm, pos)
          if (found === -1) break
          // Store order (k-th occurrence) rather than raw offset to stay robust
          results.push({ id: `${p}-${order}` , page: p, order, query: searchText, length: needleLen })
          order += 1
          pos = found + 1 // allow overlapping matches
        }
      }
      
      // Preserve index on refresh; if targeting a specific page, prefer that page
      const normalized = qNorm
      let nextIndex
      const targetPage = pendingTargetPageRef.current
      if (targetPage != null) {
        const idxOnTarget = results.findIndex(r => r.page === targetPage)
        nextIndex = idxOnTarget >= 0 ? idxOnTarget : (results.length > 0 ? 0 : -1)
      } else if (lastSearchTermRef.current !== normalized) {
        // New keyword: start from the first result
        nextIndex = results.length > 0 ? 0 : -1
      } else {
        // Same keyword refresh: keep index within valid range
        if (results.length === 0) nextIndex = -1
        else if (currentSearchIndex < 0) nextIndex = 0
        else nextIndex = Math.min(currentSearchIndex, results.length - 1)
      }

      setSearchResults(results)
      setCurrentSearchIndex(nextIndex)
      lastSearchTermRef.current = normalized
      // Clear pending target-page flag (scroll handling happens below)
      pendingTargetPageRef.current = null
      
      if (results.length > 0) {
        const idx = nextIndex >= 0 ? nextIndex : 0
        setTimeout(() => scrollToSearchResult(idx), 100)
      }
    } catch (error) {
      console.error('Search failed:', error)
    }
  }, [ensureFullIndex, numPages, currentSearchIndex, scrollToSearchResult])

  const debouncedSearch = useCallback((searchText) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(searchText)
    }, 300) // 300ms debounce
  }, [handleSearch])

  // (moved scrollToSearchResult above to avoid TDZ issues)

  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    const newIndex = (currentSearchIndex + 1) % searchResults.length
    setCurrentSearchIndex(newIndex)
    scrollToSearchResult(newIndex)
  }, [searchResults, currentSearchIndex, scrollToSearchResult])

  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    const newIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1
    setCurrentSearchIndex(newIndex)
    scrollToSearchResult(newIndex)
  }, [searchResults, currentSearchIndex, scrollToSearchResult])

  const clearSearch = useCallback(() => {
    setSearchTerm('')
    setSearchResults([])
    setCurrentSearchIndex(-1)
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  

  return {
    searchTerm,
    setSearchTerm,
    searchResults,
    currentSearchIndex,
    debouncedSearch,
    nextSearchResult,
    prevSearchResult,
    clearSearch
  }
}

export default useSearchOverlay
