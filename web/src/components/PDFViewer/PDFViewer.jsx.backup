import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
// PDF page CSS imports kept for proper annotations/text layering
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

import SearchPanel from './components/SearchPanel'
import HighlightLayer from './components/HighlightLayer'
import HighlightPopover from './components/HighlightPopover'
import PdfToolbar from './components/PdfToolbar'
import PdfOutlineDrawer from './components/PdfOutlineDrawer'
import PdfDocument from './components/PdfDocument'
import PdfOverlays from './components/PdfOverlays'
import VerticalToolbar from './components/VerticalToolbar'
import TranslationDialog from './components/TranslationDialog'
import OverviewDialog from './components/OverviewDialog'
import MagicWandLayer from './components/MagicWandLayer'
import ActionInputDialog from './dialogs/ActionInputDialog'
import ActionResponseDialog from './dialogs/ActionResponseDialog'
import MagicActionDialog from './dialogs/MagicActionDialog'
import documentService from '../../services/documentService'
import { calculateCorridorSelection } from './utils/textSelection'
import cacheManager from './utils/cacheManager'
import observerManager from './utils/observerManager'

import { PdfViewerProvider, usePdfViewer } from './context/PdfViewerContext'
import { PDF_ACTIONS } from './context/pdfViewerConstants'
import ErrorBoundary from './components/ErrorBoundary'

import useTextSelection from './hooks/useTextSelection'
import useSearchOverlay from './hooks/useSearchOverlay'
import useScreenshot from './hooks/useScreenshot'
import useHighlight from './hooks/useHighlight'
import useMagicWand from './hooks/useMagicWand'
import { translateText } from "../../services/translationService"
import { explainText, highlightText } from "../../services/llmService"

import { configurePdfWorker } from './config/workerConfig'

import './styles/PDFViewer.css'

// Configure PDF.js worker with optimized strategy
configurePdfWorker()

// Internal component that uses the context
const PDFViewerContent = ({ file, documentId, onMarkdownUpdate }) => {
  const {
    scale,
    numPages,
    toolMode,
    showSearchPanel,
    dispatch,
    viewerRef,
    pdfDocRef
  } = usePdfViewer()
  
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [outline, setOutline] = useState([])
  const [translationDialog, setTranslationDialog] = useState({
    isOpen: false,
    selectedText: ''
  })
  const [actionResponseDialog, setActionResponseDialog] = useState({
    isOpen: false,
    type: 'chat',
    entries: [],
    frame: { left: 240, bottom: 260 },
    isMultiTurn: false, // 是否为多轮对话模式
  })
  const [lastActionAnchor, setLastActionAnchor] = useState({ x: 240, y: 220 })
  const [actionResponseHeight, setActionResponseHeight] = useState(0)
  const [overviewDialog, setOverviewDialog] = useState({
    isOpen: false
  })
  
  const [magicSelection, setMagicSelection] = useState({
    text: '',
    pageIndex: -1,
    rectsNorm: [],
    anchor: null,
    isOpen: false
  })
  
  

  // Custom hooks - must be called before useEffects that depend on them
  const {
    contextMenu,
    handleCopyText,
    handleTranslateText: originalHandleTranslateText,
    setContextMenu
  } = useTextSelection(viewerRef)

  useEffect(() => {
    if (contextMenu.show) {
      setLastActionAnchor({ x: contextMenu.x, y: contextMenu.y })
    }
  }, [contextMenu.show, contextMenu.x, contextMenu.y])

  // 监听ActionInputDialog位置变化，动态调整ActionResponseDialog位置
  useEffect(() => {
    if (!actionResponseDialog.isOpen || !actionResponseDialog.isMultiTurn) return

    const updatePosition = () => {
      const actionInputDialog = document.querySelector('.action-input-dialog')
      if (actionInputDialog) {
        const rect = actionInputDialog.getBoundingClientRect()
        const newFrame = {
          left: rect.left,
          bottom: window.innerHeight - rect.top + 4, // 紧贴ActionInputDialog上方
        }
        
        setActionResponseDialog(prev => ({
          ...prev,
          frame: newFrame
        }))
      }
    }

    // 初始位置更新
    updatePosition()

    // 监听窗口大小变化
    const handleResize = () => {
      setTimeout(updatePosition, 100) // 延迟更新，等待布局稳定
    }

    // 监听ActionInputDialog位置变化
    const observer = new MutationObserver(() => {
      setTimeout(updatePosition, 50)
    })

    const actionInputDialog = document.querySelector('.action-input-dialog')
    if (actionInputDialog) {
      observer.observe(actionInputDialog, {
        attributes: true,
        attributeFilter: ['style', 'class']
      })
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [actionResponseDialog.isOpen, actionResponseDialog.isMultiTurn])

  // 点击外部区域关闭ActionResponseDialog
  useEffect(() => {
    const handleClickOutside = (event) => {
      // 检查是否点击在ActionResponseDialog内部
      const actionResponseDialogElement = document.querySelector('.action-response-dialog')
      
      const isClickInsideResponse = actionResponseDialogElement && actionResponseDialogElement.contains(event.target)
      
      // 如果点击在ActionResponseDialog外部，关闭它
      if (!isClickInsideResponse) {
        setActionResponseDialog(prev => ({
          ...prev,
          isOpen: false,
          entries: []
        }))
      }
    }

    // 只有在ActionResponseDialog打开时才添加监听器
    if (actionResponseDialog.isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [actionResponseDialog.isOpen])

  
  // Override the translate handler to open our dialog
  const handleTranslateText = () => {
    if (contextMenu.show && contextMenu.selectedText) {
      setTranslationDialog({
        isOpen: true,
        selectedText: contextMenu.selectedText
      })
      // Close context menu after action
      setContextMenu({ show: false, x: 0, y: 0, selectedText: '' })
    }
  }

  const computeResponseFrame = useCallback((anchor) => {
    const width = 340
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720
    const left = Math.min(Math.max(anchor.x, 12), vw - width - 12)
    const bottom = Math.min(Math.max(anchor.y - 8, 24), vh - 12)
    return { left, bottom }
  }, [])

  const handleQuickTranslate = async (textArg) => {
    const payload = textArg || contextMenu.selectedText || ''
    if (!payload.trim()) return
    const anchor = contextMenu.show
      ? { x: contextMenu.x, y: contextMenu.y }
      : lastActionAnchor
    setLastActionAnchor(anchor)
    const position = computeResponsePosition(anchor, actionResponseHeight)
    setActionResponseDialog(prev => {
      const history = prev.isOpen && prev.type === 'translate' ? [...prev.entries] : []
      return {
        isOpen: true,
        position,
        type: 'translate',
        entries: [
          ...history,
          { role: 'user', label: '原文', content: payload },
          { role: 'assistant', label: '翻译', content: '翻译中…', loading: true },
        ],
      }
    })

    try {
      const result = await translateText(payload, 'zh')
      setActionResponseDialog(prev => {
        const entries = [...prev.entries]
        if (entries.length > 0) {
          entries[entries.length - 1] = {
            role: 'assistant',
            label: '翻译',
            content: result?.text || '(空)',
          }
        }
        return { ...prev, position, entries }
      })
    } catch (error) {
      const message = error?.message || '翻译失败，请稍后再试'
      setActionResponseDialog(prev => {
        const entries = [...prev.entries]
        if (entries.length > 0) {
          entries[entries.length - 1] = {
            role: 'assistant',
            label: '错误',
            content: message,
          }
        }
        return { ...prev, position, entries }
      })
    }
  }

  // Search for selected text via the same vertical toolbar behavior
  const handleSearchSelectedText = () => {
    if (contextMenu.show && contextMenu.selectedText) {
      // Open search panel
      dispatch({ type: PDF_ACTIONS.SET_SHOW_SEARCH_PANEL, payload: true })
      // Set term and run debounced search
      const term = contextMenu.selectedText
      setSearchTerm(term)
      debouncedSearch(term)
      // Close context menu after action
      setContextMenu({ show: false, x: 0, y: 0, selectedText: '' })
    }
  }

  const handleCloseTranslationDialog = () => {
    setTranslationDialog({
      isOpen: false,
      selectedText: ''
    })
  }

  const handleTranslate = async (text, targetLang) => {
    return await translateText(text, targetLang)
  }

  const handleSendMessage = async (msg, selected) => {
    if (!msg?.trim()) return
    const anchor = contextMenu.show
      ? { x: contextMenu.x, y: contextMenu.y }
      : lastActionAnchor
    setLastActionAnchor(anchor)
    // 计算位置：ActionResponseDialog直接定位在ActionInputDialog上方
    const frame = {
      left: anchor.x,
      bottom: window.innerHeight - anchor.y + 4, // 紧贴ActionInputDialog上方
    }

    setActionResponseDialog(prev => {
      const history = prev.isOpen && prev.type === 'chat' && prev.isMultiTurn ? [...prev.entries] : []
      return {
        isOpen: true,
        frame,
        type: 'chat',
        isMultiTurn: true, // 启用多轮对话模式
        entries: [
          ...history,
          { 
            id: `user_${Date.now()}`, 
            role: 'user', 
            content: msg.trim(),
            timestamp: new Date().toISOString()
          },
          { 
            id: `assistant_${Date.now() + 1}`, 
            role: 'assistant', 
            content: '思考中…', 
            loading: true,
            timestamp: new Date().toISOString()
          },
        ],
      }
    })

    // 延迟更新位置，确保在第二轮对话时位置正确
    setTimeout(() => {
      const actionInputDialog = document.querySelector('.action-input-dialog')
      if (actionInputDialog) {
        const rect = actionInputDialog.getBoundingClientRect()
        const newFrame = {
          left: rect.left,
          bottom: window.innerHeight - rect.top + 4,
        }
        
        setActionResponseDialog(prev => ({
          ...prev,
          frame: newFrame
        }))
      }
    }, 100)

    try {
      const sim = (await import('../../services/simService.js')).default
      const response = await sim.sendMessage({
        source: 'pdf',
        message: msg,
        documentId,
        context: selected || contextMenu.selectedText || '',
      })

      setActionResponseDialog(prev => {
        const entries = [...prev.entries]
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1]
          if (lastEntry.loading) {
            entries[entries.length - 1] = {
              ...lastEntry,
              content: response?.answer || '（无回答）',
              loading: false,
            }
          }
        }
        return { ...prev, entries }
      })

      return response
    } catch (err) {
      const message = err?.message || '请求失败，请稍后重试'
      setActionResponseDialog(prev => {
        const entries = [...prev.entries]
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1]
          if (lastEntry.loading) {
            entries[entries.length - 1] = {
              ...lastEntry,
              content: message,
              loading: false,
              error: true,
            }
          }
        }
        return { ...prev, entries }
      })
      throw err
    }
  }

  const {
    searchTerm,
    setSearchTerm,
    searchResults,
    currentSearchIndex,
    debouncedSearch,
    nextSearchResult,
    prevSearchResult,
    clearSearch
  } = useSearchOverlay(viewerRef)

  // Track current page using IntersectionObserver for better performance
  useEffect(() => {
    if (!numPages || !viewerRef.current) return
    
    const container = viewerRef.current
    if (!container) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the page with the highest intersection ratio
        let mostVisiblePage = 1
        let maxRatio = 0
        
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio
            const pageElement = entry.target
            const pageIndex = Array.from(pageElement.parentNode.children).indexOf(pageElement)
            mostVisiblePage = pageIndex + 1
          }
        })
        
        if (maxRatio > 0) {
          dispatch({ type: PDF_ACTIONS.SET_CURRENT_PAGE, payload: mostVisiblePage })
        }
      },
      {
        root: container,
        rootMargin: '0px',
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
      }
    )
    
    // Observe all page elements
    const observePages = () => {
      const pages = container.querySelectorAll('.page-container')
      pages.forEach(page => observer.observe(page))
    }
    
    // Initial observation
    observePages()
    
    // Re-observe when pages are added (for dynamic loading)
    const mutationObserver = new MutationObserver(() => {
      observePages()
    })
    
    mutationObserver.observe(container, { childList: true, subtree: true })
    
    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [numPages, dispatch, viewerRef])

  // Custom hooks moved to top
  
  const handleScreenshotComplete = () => {
    dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: null })
  }

  const {
    isScreenshotMode,
    screenshotArea,
    handleScreenshotStart,
    handleScreenshotMove,
    handleScreenshotEnd,
    exitScreenshotMode
  } = useScreenshot(viewerRef, handleScreenshotComplete)
  
  const {
    highlights,
    applyHighlight,
    removeHighlight,
    updateHighlightComment,
    updateHighlightColor,
    getHighlightOverlays,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    isLoading
  } = useHighlight(
    viewerRef,
    toolMode,
    (next) => {
      const value = typeof next === 'function' ? next(toolMode) : next
      dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: value })
    },
    documentId
  )

  // Handle magic wand selection callback
  const handleWandSelect = useCallback(({ pageIndex, minX, maxX, pathBounds, anchor, pageRect }) => {
    const pageElement = viewerRef.current?.querySelector(`[data-page-number="${pageIndex + 1}"]`)
    const textLayer = pageElement?.querySelector('.react-pdf__Page__textContent')
    
    if (!pageElement || !textLayer) {
      console.warn('Page element or text layer not found for magic wand selection')
      return
    }
    
    // Calculate text selection using corridor algorithm
    const selection = calculateCorridorSelection({
      pageElement,
      textLayer,
      minX,
      maxX,
      minY: pathBounds.minY,
      maxY: pathBounds.maxY
    })
    
    if (!selection.isEmpty) {
      // 触发MagicActionDialog
      setMagicSelection({
        text: selection.selectedText,
        pageIndex: pageIndex,
        rectsNorm: selection.rectsNorm,
        anchor: anchor,
        isOpen: true
      })
    } else {
      // 即使没有选中文本，也触发MagicActionDialog
      setMagicSelection({
        text: '',
        pageIndex: pageIndex,
        rectsNorm: [],
        anchor: anchor,
        isOpen: true
      })
    }
  }, [viewerRef])
  
  // Magic wand functionality
  const {
    drawnPaths,
    currentPath,
    isDrawing,
    generatePathString,
    handleMouseDown: handleMagicWandMouseDown,
    handleMouseMove: handleMagicWandMouseMove,
    handleMouseUp: handleMagicWandMouseUp,
    clearAllPaths,
    removePath: deletePath
  } = useMagicWand(viewerRef, toolMode, handleWandSelect)
  
  // Clear paths after selection is processed
  useEffect(() => {
    if (magicSelection.isOpen) {
      // Clear the drawn path after the dialog is shown
      const timer = setTimeout(() => {
        clearAllPaths()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [magicSelection.isOpen, clearAllPaths])
  


  // Popover for highlight info and comment
  const [highlightPopover, setHighlightPopover] = useState({ show: false, id: null, left: 0, top: 0 })
  // Popover-only state moved to HighlightPopover component

  const openHighlightPopover = (overlay) => {
    setHighlightPopover({
      show: true,
      id: overlay.id,
      left: overlay.rect.left,
      top: overlay.rect.top + overlay.rect.height + 6,
    })
  }

  // Close popover when clicking outside of overlay/popover
  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!highlightPopover.show) return
      const popover = document.querySelector('.highlight-popover')
      const isInPopover = popover && popover.contains(e.target)
      const isInOverlay = e.target.classList && e.target.classList.contains('highlight-overlay')
      if (!isInPopover && !isInOverlay) {
        setHighlightPopover({ show: false, id: null, left: 0, top: 0 })
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [highlightPopover.show])

  // Handle outline loading when PDF is loaded
  useEffect(() => {
    const loadOutline = async () => {
      if (pdfDocRef.current) {
        try {
          const toc = await pdfDocRef.current.getOutline()
          setOutline(Array.isArray(toc) ? toc : [])
        } catch {
          setOutline([])
        }
      }
    }
    
    if (numPages) {
      loadOutline()
    }
  }, [numPages, pdfDocRef])

  // After scale changes or page layout changes, schedule a post-layout re-render
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLayoutVersion(v => v + 1))
    return () => cancelAnimationFrame(raf)
  }, [scale, numPages])

  // Handle document switching cleanup and cache management
  useEffect(() => {
    // Reset states when document changes
    setOutline([])
    setHighlightPopover({ show: false, id: null, left: 0, top: 0 })
    setTranslationDialog({ isOpen: false, selectedText: '' })
    setOverviewDialog({ isOpen: false })
    setMagicSelection({ text: '', pageIndex: -1, rectsNorm: [], anchor: null, isOpen: false })
    
    // Reset PDF viewer state
    dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: null })
    dispatch({ type: PDF_ACTIONS.SET_SEARCH_PANEL, payload: false })
    
    // Clear all caches when document changes
    cacheManager.clearAllCaches()
    
    // Initialize cache for new document
    if (numPages) {
      cacheManager.setDocumentInfo({
        numPages,
        documentId: documentId || `doc_${Date.now()}`
      })
      
      console.log('PDF document loaded, cache initialized for', numPages, 'pages')
    }
  }, [file, documentId, dispatch, numPages])

  // Enhanced observer setup for PDF viewer
  useEffect(() => {
    const container = viewerRef.current
    if (!container) return

    // Pass a ref-like object as expected by observerManager
    const observerIds = observerManager.setupPDFViewerObservers({ current: container }, {
      onResize: (resizeData) => {
        // Force re-render of overlays when container size changes
        requestAnimationFrame(() => setLayoutVersion(v => v + 1))
        
        // Clear layout cache on significant size changes
        const significantChange = resizeData.some(data => 
          Math.abs(data.contentRect.width - (data.element._lastWidth || 0)) > 50 ||
          Math.abs(data.contentRect.height - (data.element._lastHeight || 0)) > 50
        )
        
        if (significantChange) {
          cacheManager.clearCache('layout')
          resizeData.forEach(data => {
            data.element._lastWidth = data.contentRect.width
            data.element._lastHeight = data.contentRect.height
          })
        }
      },
      
      onMutation: (mutations) => {
        // Handle text layer changes
        const hasTextLayerChanges = mutations.some(mutation => 
          mutation.addedNodes.some(node => 
            node.classList && (
              node.classList.contains('react-pdf__Page__textContent') ||
              node.classList.contains('textLayer')
            )
          )
        )
        
        if (hasTextLayerChanges) {
          // Clear span data cache when text layers change
          cacheManager.clearCache('spans')
          requestAnimationFrame(() => setLayoutVersion(v => v + 1))
        }
      },
      
      onPageVisibility: (intersectionData) => {
        // Preload cache for visible pages
        intersectionData.forEach(data => {
          if (data.isIntersecting && data.intersectionRatio > 0.1) {
            const pageElement = data.element
            const pageNumber = pageElement.getAttribute('data-page-number')
            if (pageNumber) {
              const pageIndex = parseInt(pageNumber) - 1
              // Trigger preload for visible pages
              setTimeout(() => {
                cacheManager.preloadPageData(pageIndex)
              }, 100)
            }
          }
        })
      },
      
      onScroll: () => {
        // Update overlay positions on scroll
        requestAnimationFrame(() => setLayoutVersion(v => v + 1))
      },
      
      debounceDelays: {
        resize: 100,
        mutation: 200,
        intersection: 150,
        scroll: 50
      }
    })

    return () => {
      // Cleanup all observers
      Object.values(observerIds).forEach(id => {
        observerManager.disconnect(id)
      })
    }
  }, [numPages, viewerRef])

  // Memoize highlight overlays to avoid recalculation on every render
  const highlightOverlays = useMemo(() => {
    return getHighlightOverlays()
  }, [getHighlightOverlays, layoutVersion, highlights])

  // Reposition open highlight popover on layout changes
    // Reposition open highlight popover on layout changes
  useEffect(() => {
    if (!highlightPopover.show) return;

    const overlay = highlightOverlays.find(o => o.id === highlightPopover.id);
    if (!overlay) return;

    const newLeft = overlay.rect.left;
    const newTop = overlay.rect.top + overlay.rect.height + 6;

    // Only update state if the position has actually changed to avoid render loops
    if (highlightPopover.left !== newLeft || highlightPopover.top !== newTop) {
      setHighlightPopover(prev => ({
        ...prev,
        left: newLeft,
        top: newTop,
      }));
    }
  }, [highlightOverlays, highlightPopover.show, highlightPopover.id, highlightPopover.left, highlightPopover.top]);

  // Listen for app-level go-to-page events
  useEffect(() => {
    const handler = (e) => {
      const targetPage = Number(e.detail) || 1
      // Scroll container to top and set current page
      if (viewerRef.current) {
        viewerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
      dispatch({ type: PDF_ACTIONS.SET_CURRENT_PAGE, payload: targetPage })
    }
    window.addEventListener('pdf:goToPage', handler)
    return () => window.removeEventListener('pdf:goToPage', handler)
  }, [dispatch, viewerRef])

  // Listen for auto-scale events from resizer
  useEffect(() => {
    const handler = (e) => {
      const newScale = Number(e.detail)
      if (newScale && newScale >= 0.5 && newScale <= 2.0) {
        dispatch({ type: PDF_ACTIONS.SET_SCALE, payload: newScale })
      }
    }
    window.addEventListener('pdf:setScale', handler)
    return () => window.removeEventListener('pdf:setScale', handler)
  }, [dispatch])

  // (no timers here; handled within HighlightPopover)

  const handleCloseSearchPanel = useCallback(() => {
    dispatch({ type: PDF_ACTIONS.SET_SHOW_SEARCH_PANEL, payload: false })
    clearSearch()
    
    // Force clear the search input DOM element as a fallback
    setTimeout(() => {
      const searchInput = document.getElementById('search-input')
      if (searchInput) {
        searchInput.value = ''
      }
    }, 0)
  }, [clearSearch, dispatch])

  const handleToggleSearchPanel = useCallback(() => {
    if (showSearchPanel) {
      // If panel is open, close it and clear search
      handleCloseSearchPanel()
    } else {
      // If panel is closed, just open it
      dispatch({ type: PDF_ACTIONS.SET_SHOW_SEARCH_PANEL, payload: true })
    }
  }, [showSearchPanel, handleCloseSearchPanel, dispatch])

  const handleOverview = useCallback(() => {
    // Open overview language selection dialog
    setOverviewDialog({ isOpen: true })
  }, [])

  const handleCloseOverviewDialog = () => {
    setOverviewDialog({ isOpen: false })
  }

  const handleConfirmOverview = async (selectedLanguage) => {
    if (!documentId) {
      setOverviewDialog({ isOpen: false })
      return
    }
    
    try {
      const result = await documentService.uploadToGemini(documentId, {
        language: selectedLanguage,
        format: 'markdown'
      })
      
      if (result.success) {
        // Update markdown editor with the summary
        if (result.summary && onMarkdownUpdate) {
          onMarkdownUpdate(result.summary)
        }
      }
    } catch (error) {
      // Handle error silently or show user-friendly message
    }
    
    setOverviewDialog({ isOpen: false })
  }

  // Global Escape to exit tools (screenshot, highlight) and close search panel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        let handled = false
        if (toolMode === 'screenshot') {
          exitScreenshotMode()
          dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: null })
          handled = true
        } else if (toolMode === 'highlight') {
          dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: null })
          handled = true
        }
        if (showSearchPanel) {
          handleCloseSearchPanel()
          handled = true
        }
        if (highlightPopover.show) {
          setHighlightPopover({ show: false, id: null, left: 0, top: 0 })
          handled = true
        }
        if (handled) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toolMode, showSearchPanel, exitScreenshotMode, handleCloseSearchPanel, highlightPopover.show, dispatch])

  // SearchPanel handles outside-click; useTextSelection handles contextmenu suppression
  // Keep other global listeners minimal to avoid duplication

  // A+B: throttled + debounced zoom on Ctrl/Cmd + wheel
  const zoomThrottleRef = useRef({ last: 0, pending: null, debounceId: null })
  const zoomContainerRef = useRef(null)

  const handleWheelZoom = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const step = 0.2
    let target = scale + (e.deltaY < 0 ? step : -step)
    target = Math.max(0.5, Math.min(2.0, parseFloat(target.toFixed(2))))

    const now = performance.now()
    const st = zoomThrottleRef.current
    st.pending = target

    // throttle: only dispatch at most once per 60ms
    if (now - st.last >= 120) {
      dispatch({ type: PDF_ACTIONS.SET_SCALE, payload: st.pending })
      st.last = now
      st.pending = null
    }

    // debounce final commit after 150ms of inactivity
    if (st.debounceId) clearTimeout(st.debounceId)
    st.debounceId = setTimeout(() => {
      const pend = zoomThrottleRef.current.pending
      if (pend != null && pend !== scale) {
        dispatch({ type: PDF_ACTIONS.SET_SCALE, payload: pend })
        zoomThrottleRef.current.last = performance.now()
        zoomThrottleRef.current.pending = null
      }
    }, 220)
  }, [scale, dispatch])

  return (
    <div className="pdf-viewer">
      {/* PDF Toolbar */}
      <PdfToolbar onToggleSearchPanel={handleToggleSearchPanel} />

      {/* Search Panel */}
      <SearchPanel
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onDebouncedSearch={debouncedSearch}
        searchResults={searchResults}
        currentSearchIndex={currentSearchIndex}
        onNextResult={nextSearchResult}
        onPrevResult={prevSearchResult}
        onClose={handleCloseSearchPanel}
      />
      


      {/* Action Input Dialog replacing context menu */}
      {contextMenu.show && contextMenu.rects && contextMenu.rects.length > 0 && (
        <div className="active-selection-overlay" style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9998 }}>
          {contextMenu.rects.map((r, idx) => (
            <div key={idx} style={{
              position: 'fixed',
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              background: 'rgba(59,130,246,0.25)'
            }} />
          ))}
        </div>
      )}
      <ActionInputDialog
        isOpen={contextMenu.show}
        initialPosition={{ x: contextMenu.x, y: contextMenu.y }}
        selectedText={contextMenu.selectedText}
        onClose={() => setContextMenu({ show: false, x: 0, y: 0, selectedText: '' })}
        onCopy={() => { handleCopyText() }}
        onTranslate={(text) => {
          handleQuickTranslate(text)
        }}
        onQuery={() => { handleSearchSelectedText() }}
        onSend={handleSendMessage}
        isMultiTurn={actionResponseDialog.isMultiTurn}
      />
      <ActionResponseDialog
        isOpen={actionResponseDialog.isOpen}
        frame={actionResponseDialog.frame}
        entries={actionResponseDialog.entries}
        onHeightChange={setActionResponseHeight}
        isMultiTurn={actionResponseDialog.isMultiTurn}
      />
      
      {/* Magic Action Dialog */}
      <MagicActionDialog
        isOpen={magicSelection.isOpen}
        selectedText={magicSelection.text}
        initialPosition={magicSelection.anchor}
        onClose={() => setMagicSelection({ text: '', pageIndex: -1, rectsNorm: [], anchor: null, isOpen: false })}
        onTranslate={(text) => {
          // 触发翻译功能
          setTranslationDialog({
            isOpen: true,
            selectedText: text || magicSelection.text
          })
          setMagicSelection({ text: '', pageIndex: -1, rectsNorm: [], anchor: null, isOpen: false })
        }}
        onExplain={() => {
          // 在MagicActionDialog中直接开始解释对话
          console.log('Starting explain conversation in MagicActionDialog')
        }}
        onAnnotate={() => {
          // 在MagicActionDialog中直接开始注释对话
          console.log('Starting annotate conversation in MagicActionDialog')
        }}
        // 新增对话功能props
        onSendMessage={handleSendMessage}
        documentId={documentId}
        isMultiTurn={actionResponseDialog.isMultiTurn}
      />

      {/* PDF Document with overlays and interactions inside the scroll container */}
      <div className="pdf-zoom-preview" ref={zoomContainerRef} onWheel={handleWheelZoom}>
      <PdfDocument
        file={file}
        toolMode={toolMode}
        isScreenshotMode={isScreenshotMode}
        screenshotArea={screenshotArea}
        onScreenshotStart={handleScreenshotStart}
        onScreenshotMove={handleScreenshotMove}
        onScreenshotEnd={handleScreenshotEnd}
        isHighlightMode={toolMode === 'highlight'}
        onHighlightMouseDown={handleMouseDown}
        onHighlightMouseMove={handleMouseMove}
        onHighlightMouseUp={handleMouseUp}
        isMagicWandMode={toolMode === 'magicwand'}
        onMagicWandMouseDown={handleMagicWandMouseDown}
        onMagicWandMouseMove={handleMagicWandMouseMove}
        onMagicWandMouseUp={handleMagicWandMouseUp}
        magicSelection={magicSelection}
      >
        {/* PDF Overlays */}
        <PdfOverlays 
          searchResults={searchResults}
          currentSearchIndex={currentSearchIndex}
          viewerRef={viewerRef}
        />
        {/* Highlight overlays */}
        <HighlightLayer
          overlays={highlightOverlays}
          onOverlayClick={openHighlightPopover}
        />
        {/* Magic wand layer */}
        <MagicWandLayer
          drawnPaths={drawnPaths}
          currentPath={currentPath}
          isDrawing={isDrawing}
          generatePathString={generatePathString}
          onPathClick={deletePath}
        />
        {highlightPopover.show && (() => {
          const h = highlights.find(x => x.id === highlightPopover.id)
          if (!h) return null
          return (
            <HighlightPopover
              highlight={h}
              position={{ left: highlightPopover.left, top: highlightPopover.top }}
              onDelete={(id) => { removeHighlight(id); setHighlightPopover({ show: false, id: null, left: 0, top: 0 }) }}
              onChangeColor={updateHighlightColor}
              onChangeComment={updateHighlightComment}
              onRequestClose={() => setHighlightPopover({ show: false, id: null, left: 0, top: 0 })}
            />
          )
        })()}
      </PdfDocument>
      </div>
      
      {/* Floating middle vertical toolbar */}
      <VerticalToolbar 
        onSearch={handleToggleSearchPanel}
        onScreenshot={() => dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: 'screenshot' })}
        onToggleHighlight={() => {
          const newMode = toolMode === 'highlight' ? null : 'highlight'
          dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: newMode })
        }}
        isHighlightActive={toolMode === 'highlight'}
        onOverview={handleOverview}
        onMagicWand={() => {
          const newMode = toolMode === 'magicwand' ? null : 'magicwand'
          dispatch({ type: PDF_ACTIONS.SET_TOOL_MODE, payload: newMode })
        }}
        isMagicWandActive={toolMode === 'magicwand'}
      />
      
      {/* PDF Outline Drawer */}
      <PdfOutlineDrawer outline={outline} />

      {/* Translation Dialog */}
      <TranslationDialog
        isOpen={translationDialog.isOpen}
        selectedText={translationDialog.selectedText}
        onClose={handleCloseTranslationDialog}
        onTranslate={handleTranslate}
      />

      {/* Overview Dialog */}
      <OverviewDialog
        isOpen={overviewDialog.isOpen}
        onClose={handleCloseOverviewDialog}
        onConfirm={handleConfirmOverview}
        documentId={documentId}
      />
      
    </div>
  )
}

PDFViewerContent.propTypes = {
  file: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object,
    PropTypes.instanceOf(File)
  ]).isRequired,
  documentId: PropTypes.string,
  onMarkdownUpdate: PropTypes.func
}

// Main PDFViewer component with Context Provider
const PDFViewer = ({ file, documentId, onMarkdownUpdate }) => {
  const viewerRef = useRef(null)
  const pdfDocRef = useRef(null)
  
  return (
    <PdfViewerProvider viewerRef={viewerRef} pdfDocRef={pdfDocRef}>
      <ErrorBoundary>
        <PDFViewerContent file={file} documentId={documentId} onMarkdownUpdate={onMarkdownUpdate} />
      </ErrorBoundary>
    </PdfViewerProvider>
  )
}

PDFViewer.propTypes = {
  file: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object,
    PropTypes.instanceOf(File)
  ]).isRequired,
  documentId: PropTypes.string,
  onMarkdownUpdate: PropTypes.func
}

export default PDFViewer
