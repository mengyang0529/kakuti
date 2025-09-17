/**
 * Enhanced Cache Manager for PDF Viewer Performance Optimization
 * 
 * This module provides comprehensive caching mechanisms for:
 * - Text span data and layout analysis
 * - Page dimensions and positioning
 * - Column detection results
 * - Highlight rendering data
 * - DOM element references
 * 
 * Features:
 * - LRU (Least Recently Used) cache eviction
 * - Memory usage monitoring
 * - Cache invalidation strategies
 * - Performance metrics tracking
 */

class LRUCache {
  constructor(maxSize = 50, maxMemoryMB = 10) {
    this.maxSize = maxSize
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024
    this.cache = new Map()
    this.accessOrder = new Map() // key -> timestamp
    this.memoryUsage = 0
    this.hits = 0
    this.misses = 0
  }

  get(key) {
    if (this.cache.has(key)) {
      this.accessOrder.set(key, Date.now())
      this.hits++
      return this.cache.get(key)
    }
    this.misses++
    return null
  }

  set(key, value) {
    const serializedSize = this._estimateSize(value)
    
    // Remove existing entry if updating
    if (this.cache.has(key)) {
      const oldSize = this.cache.get(key)._cacheSize || 0
      this.memoryUsage -= oldSize
    }

    // Evict entries if necessary
    while (this.cache.size >= this.maxSize || 
           this.memoryUsage + serializedSize > this.maxMemoryBytes) {
      this._evictLRU()
    }

    // Add cache metadata
    const cacheEntry = {
      ...value,
      _cacheSize: serializedSize,
      _cacheTime: Date.now()
    }

    this.cache.set(key, cacheEntry)
    this.accessOrder.set(key, Date.now())
    this.memoryUsage += serializedSize
  }

  delete(key) {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)
      this.memoryUsage -= entry._cacheSize || 0
      this.cache.delete(key)
      this.accessOrder.delete(key)
      return true
    }
    return false
  }

  clear() {
    this.cache.clear()
    this.accessOrder.clear()
    this.memoryUsage = 0
    this.hits = 0
    this.misses = 0
  }

  getStats() {
    const hitRate = this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0
    return {
      size: this.cache.size,
      memoryUsageMB: (this.memoryUsage / (1024 * 1024)).toFixed(2),
      hitRate: (hitRate * 100).toFixed(1) + '%',
      hits: this.hits,
      misses: this.misses
    }
  }

  _evictLRU() {
    if (this.accessOrder.size === 0) return

    // Find the least recently used entry
    let oldestKey = null
    let oldestTime = Infinity

    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.delete(oldestKey)
    }
  }

  _estimateSize(obj) {
    // Rough estimation of object size in bytes
    const jsonString = JSON.stringify(obj)
    return jsonString.length * 2 // UTF-16 encoding
  }
}

class PDFCacheManager {
  constructor() {
    // Initialize different cache types with different configurations
    this.caches = new Map()
    
    // Initialize cache types
    this.caches.set('spans', new LRUCache(100, 10)) // 100 entries, 10MB max
    this.caches.set('layout', new LRUCache(50, 5))   // 50 entries, 5MB max
    this.caches.set('highlights', new LRUCache(200, 8)) // 200 entries, 8MB max
    
    // Legacy cache references for backward compatibility
    this.spanDataCache = this.caches.get('spans')
    this.layoutCache = this.caches.get('layout')
    this.columnCache = new LRUCache(15, 2)   // 15 entries, 2MB max
    this.highlightCache = this.caches.get('highlights')
    this.domRefCache = new WeakMap()         // DOM references (auto-GC)
    
    // Performance tracking
    this.performanceMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      avgLookupTime: 0,
      totalLookups: 0,
      totalRequests: 0,
      avgResponseTime: 0
    }

    // Cache invalidation tracking
    this.invalidationReasons = new Map()
    
    // Bind methods
    this.getSpanData = this.getSpanData.bind(this)
    this.setSpanData = this.setSpanData.bind(this)
    this.getLayoutAnalysis = this.getLayoutAnalysis.bind(this)
    this.setLayoutAnalysis = this.setLayoutAnalysis.bind(this)
    
    // Auto-cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000) // Run cleanup every minute
  }

  /**
   * Generate cache key for span data
   */
  _generateSpanKey(pageIndex, scale, textLayerHash) {
    return `span_${pageIndex}_${scale.toFixed(2)}_${textLayerHash}`
  }

  /**
   * Generate cache key for layout analysis
   */
  _generateLayoutKey(pageIndex, scale, spanCount) {
    return `layout_${pageIndex}_${scale.toFixed(2)}_${spanCount}`
  }

  /**
   * Generate cache key for column detection
   */
  _generateColumnKey(pageIndex, scale, pageWidth) {
    return `column_${pageIndex}_${scale.toFixed(2)}_${Math.round(pageWidth)}`
  }

  /**
   * Generate cache key for highlight data
   */
  _generateHighlightKey(documentId, pageIndex, scale) {
    return `highlight_${documentId}_${pageIndex}_${scale.toFixed(2)}`
  }

  /**
   * Calculate hash for text layer content
   */
  _calculateTextLayerHash(textLayer) {
    if (!textLayer) return '0'
    
    const spans = textLayer.querySelectorAll('span')
    let hash = spans.length.toString()
    
    // Sample first, middle, and last spans for hash
    const sampleIndices = [0, Math.floor(spans.length / 2), spans.length - 1]
    
    for (const index of sampleIndices) {
      if (spans[index]) {
        const rect = spans[index].getBoundingClientRect()
        hash += `_${Math.round(rect.left)}_${Math.round(rect.top)}_${spans[index].textContent.length}`
      }
    }
    
    return hash
  }

  /**
   * Get cached span data
   */
  getSpanData(pageIndex, scale, textLayer) {
    const startTime = performance.now()
    const textLayerHash = this._calculateTextLayerHash(textLayer)
    const key = this._generateSpanKey(pageIndex, scale, textLayerHash)
    
    const result = this.spanDataCache.get(key)
    
    this._updatePerformanceMetrics(startTime, result !== null)
    
    if (result) {
      console.log(`Cache HIT for span data: page ${pageIndex}, scale ${scale}`)
      return result
    }
    
    console.log(`Cache MISS for span data: page ${pageIndex}, scale ${scale}`)
    return null
  }

  /**
   * Set cached span data
   */
  setSpanData(pageIndex, scale, textLayer, spanData) {
    const textLayerHash = this._calculateTextLayerHash(textLayer)
    const key = this._generateSpanKey(pageIndex, scale, textLayerHash)
    
    this.spanDataCache.set(key, {
      spanData,
      pageIndex,
      scale,
      timestamp: Date.now()
    })
    
    console.log(`Cached span data: page ${pageIndex}, scale ${scale}, ${spanData.length} spans`)
  }

  /**
   * Get cached layout analysis
   */
  getLayoutAnalysis(pageIndex, scale, spanCount) {
    const startTime = performance.now()
    const key = this._generateLayoutKey(pageIndex, scale, spanCount)
    
    const result = this.layoutCache.get(key)
    
    this._updatePerformanceMetrics(startTime, result !== null)
    
    if (result) {
      console.log(`Cache HIT for layout analysis: page ${pageIndex}`)
      return result
    }
    
    console.log(`Cache MISS for layout analysis: page ${pageIndex}`)
    return null
  }

  /**
   * Set cached layout analysis
   */
  setLayoutAnalysis(pageIndex, scale, spanCount, layoutData) {
    const key = this._generateLayoutKey(pageIndex, scale, spanCount)
    
    this.layoutCache.set(key, {
      layoutData,
      pageIndex,
      scale,
      spanCount,
      timestamp: Date.now()
    })
    
    console.log(`Cached layout analysis: page ${pageIndex}, columns: ${layoutData.columns?.length || 0}`)
  }

  /**
   * Get cached column detection
   */
  getColumnDetection(pageIndex, scale, pageWidth) {
    const startTime = performance.now()
    const key = this._generateColumnKey(pageIndex, scale, pageWidth)
    
    const result = this.columnCache.get(key)
    
    this._updatePerformanceMetrics(startTime, result !== null)
    
    return result
  }

  /**
   * Set cached column detection
   */
  setColumnDetection(pageIndex, scale, pageWidth, columnData) {
    const key = this._generateColumnKey(pageIndex, scale, pageWidth)
    
    this.columnCache.set(key, {
      columnData,
      pageIndex,
      scale,
      pageWidth,
      timestamp: Date.now()
    })
  }

  /**
   * Get cached highlight data
   */
  getHighlightData(documentId, pageIndex, scale) {
    const startTime = performance.now()
    const key = this._generateHighlightKey(documentId, pageIndex, scale)
    
    const result = this.highlightCache.get(key)
    
    this._updatePerformanceMetrics(startTime, result !== null)
    
    return result
  }

  /**
   * Set cached highlight data
   */
  setHighlightData(documentId, pageIndex, scale, highlightData) {
    const key = this._generateHighlightKey(documentId, pageIndex, scale)
    
    this.highlightCache.set(key, {
      highlightData,
      documentId,
      pageIndex,
      scale,
      timestamp: Date.now()
    })
  }

  /**
   * Store DOM element reference
   */
  setDOMRef(element, data) {
    if (element && typeof element === 'object') {
      this.domRefCache.set(element, data)
    }
  }

  /**
   * Get DOM element reference
   */
  getDOMRef(element) {
    return this.domRefCache.get(element) || null
  }

  /**
   * Invalidate cache entries based on criteria
   */
  invalidate(criteria) {
    const { pageIndex, scale, documentId, reason = 'manual' } = criteria
    
    let invalidatedCount = 0
    
    // Invalidate span data cache
    if (pageIndex !== undefined || scale !== undefined) {
      for (const key of this.spanDataCache.cache.keys()) {
        if (this._shouldInvalidateKey(key, criteria)) {
          this.spanDataCache.delete(key)
          invalidatedCount++
        }
      }
    }
    
    // Invalidate layout cache
    if (pageIndex !== undefined || scale !== undefined) {
      for (const key of this.layoutCache.cache.keys()) {
        if (this._shouldInvalidateKey(key, criteria)) {
          this.layoutCache.delete(key)
          invalidatedCount++
        }
      }
    }
    
    // Invalidate column cache
    if (pageIndex !== undefined || scale !== undefined) {
      for (const key of this.columnCache.cache.keys()) {
        if (this._shouldInvalidateKey(key, criteria)) {
          this.columnCache.delete(key)
          invalidatedCount++
        }
      }
    }
    
    // Invalidate highlight cache
    if (documentId !== undefined || pageIndex !== undefined || scale !== undefined) {
      for (const key of this.highlightCache.cache.keys()) {
        if (this._shouldInvalidateKey(key, criteria)) {
          this.highlightCache.delete(key)
          invalidatedCount++
        }
      }
    }
    
    // Track invalidation reason
    this.invalidationReasons.set(Date.now(), { reason, criteria, count: invalidatedCount })
    
    console.log(`Cache invalidation: ${invalidatedCount} entries removed (reason: ${reason})`)
    
    return invalidatedCount
  }

  /**
   * Check if a cache key should be invalidated based on criteria
   */
  _shouldInvalidateKey(key, criteria) {
    const { pageIndex, scale, documentId } = criteria
    
    if (pageIndex !== undefined && key.includes(`_${pageIndex}_`)) {
      return true
    }
    
    if (scale !== undefined && key.includes(`_${scale.toFixed(2)}_`)) {
      return true
    }
    
    if (documentId !== undefined && key.includes(`_${documentId}_`)) {
      return true
    }
    
    return false
  }

  /**
   * Update performance metrics
   */
  _updatePerformanceMetrics(startTime, wasHit) {
    const lookupTime = performance.now() - startTime
    
    this.performanceMetrics.totalLookups++
    
    if (wasHit) {
      this.performanceMetrics.cacheHits++
    } else {
      this.performanceMetrics.cacheMisses++
    }
    
    // Update average lookup time
    const totalTime = this.performanceMetrics.avgLookupTime * (this.performanceMetrics.totalLookups - 1) + lookupTime
    this.performanceMetrics.avgLookupTime = totalTime / this.performanceMetrics.totalLookups
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats() {
    return {
      spanData: this.spanDataCache.getStats(),
      layout: this.layoutCache.getStats(),
      column: this.columnCache.getStats(),
      highlight: this.highlightCache.getStats(),
      performance: {
        ...this.performanceMetrics,
        avgLookupTime: this.performanceMetrics.avgLookupTime.toFixed(3) + 'ms'
      },
      totalMemoryMB: (
        parseFloat(this.spanDataCache.getStats().memoryUsageMB) +
        parseFloat(this.layoutCache.getStats().memoryUsageMB) +
        parseFloat(this.columnCache.getStats().memoryUsageMB) +
        parseFloat(this.highlightCache.getStats().memoryUsageMB)
      ).toFixed(2)
    }
  }

  /**
   * Get cached data
   */
  get(type, key) {
    const startTime = performance.now()
    this.performanceMetrics.totalRequests++
    
    const cache = this.caches.get(type)
    if (!cache) {
      console.warn(`Unknown cache type: ${type}`)
      return null
    }
    
    const value = cache.get(key)
    const responseTime = performance.now() - startTime
    
    // Update performance metrics
    const totalTime = this.performanceMetrics.avgResponseTime * 
                     (this.performanceMetrics.totalRequests - 1) + responseTime
    this.performanceMetrics.avgResponseTime = totalTime / this.performanceMetrics.totalRequests
    
    if (value !== null) {
      this.performanceMetrics.cacheHits++
      console.log(`Cache HIT for ${type}:${key} (${responseTime.toFixed(2)}ms)`)
    } else {
      this.performanceMetrics.cacheMisses++
      console.log(`Cache MISS for ${type}:${key} (${responseTime.toFixed(2)}ms)`)
    }
    
    return value
  }

  /**
   * Set cached data
   */
  set(type, key, value, options = {}) {
    const cache = this.caches.get(type)
    if (!cache) {
      console.warn(`Unknown cache type: ${type}`)
      return false
    }
    
    cache.set(key, value)
    console.log(`Cached ${type}:${key} (size: ${this._getValueSize(value)})`)
    
    return true
  }

  /**
   * Check if key exists in cache
   */
  has(type, key) {
    const cache = this.caches.get(type)
    if (!cache) {
      return false
    }
    
    return cache.cache.has(key)
  }

  /**
   * Delete specific cache entry
   */
  delete(type, key) {
    const cache = this.caches.get(type)
    if (!cache) {
      return false
    }
    
    const success = cache.delete(key)
    if (success) {
      console.log(`Deleted cache entry ${type}:${key}`)
    }
    
    return success
  }

  /**
   * Get value size estimation
   */
  _getValueSize(value) {
    try {
      return JSON.stringify(value).length + ' bytes'
    } catch {
      return 'unknown size'
    }
  }

  /**
   * Clear all data from a specific cache type
   */
  clearCache(type) {
    const cache = this.caches.get(type)
    if (cache) {
      cache.clear()
      console.log(`Cleared ${type} cache`)
    } else {
      console.warn(`Unknown cache type: ${type}`)
    }
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.clearAll()
  }

  /**
   * Clear all caches (internal method)
   */
  clearAll() {
    // Clear legacy caches
    this.columnCache.clear()
    this.domRefCache = new WeakMap()
    
    // Clear all managed caches
    for (const [type, cache] of this.caches) {
      cache.clear()
      console.log(`Cleared ${type} cache`)
    }
    
    // Reset performance metrics
    this.performanceMetrics = {
      cacheHits: 0,
      cacheMisses: 0,
      avgLookupTime: 0,
      totalLookups: 0,
      totalRequests: 0,
      avgResponseTime: 0
    }
    
    this.invalidationReasons.clear()
    
    console.log('All caches cleared')
  }

  /**
   * Set document information for cache context
   */
  setDocumentInfo(info) {
    this.documentInfo = {
      ...this.documentInfo,
      ...info,
      timestamp: Date.now()
    }
    console.log('Document info updated:', this.documentInfo)
  }

  /**
   * Preload page data for performance optimization
   */
  async preloadPageData(pageIndex) {
    try {
      // Check if page data is already cached
      const spansCacheKey = `page_${pageIndex}_spans`
      const layoutCacheKey = `page_${pageIndex}_dimensions`
      
      const hasSpans = this.spanDataCache.cache.has(spansCacheKey)
      const hasLayout = this.layoutCache.cache.has(layoutCacheKey)
      
      if (hasSpans && hasLayout) {
        console.log(`Page ${pageIndex} data already cached`)
        return
      }
      
      // Find page container
      const pageContainer = document.querySelector(`[data-page-number="${pageIndex + 1}"]`)
      if (!pageContainer) {
        console.warn(`Page container not found for preload: ${pageIndex + 1}`)
        return
      }
      
      // Cache page dimensions if not present
      if (!hasLayout) {
        const pageRect = pageContainer.getBoundingClientRect()
        const pageDimensions = {
          width: pageRect.width,
          height: pageRect.height,
          rect: pageRect
        }
        this.layoutCache.set(layoutCacheKey, pageDimensions)
      }
      
      // Cache spans if not present
      if (!hasSpans) {
        const textLayer = pageContainer.querySelector('.react-pdf__Page__textContent')
        if (textLayer) {
          const spans = Array.from(textLayer.querySelectorAll('span'))
            .filter(span => {
              const text = span.textContent?.trim()
              return text && text.length > 0
            })
            .map(span => {
              const rect = span.getBoundingClientRect()
              const pageRect = pageContainer.getBoundingClientRect()
              
              return {
                element: span,
                text: span.textContent,
                rect: {
                  left: rect.left - pageRect.left,
                  top: rect.top - pageRect.top,
                  right: rect.right - pageRect.left,
                  bottom: rect.bottom - pageRect.top,
                  width: rect.width,
                  height: rect.height
                },
                absoluteRect: rect
              }
            })
          
          this.spanDataCache.set(spansCacheKey, spans)
          console.log(`Preloaded ${spans.length} spans for page ${pageIndex + 1}`)
        }
      }
      
    } catch (error) {
      console.error(`Error preloading page ${pageIndex} data:`, error)
    }
  }

  /**
   * Cleanup old cache entries based on age
   */
  cleanup(maxAgeMs = 5 * 60 * 1000) { // 5 minutes default
    const now = Date.now()
    let cleanedCount = 0
    
    const caches = [this.spanDataCache, this.layoutCache, this.columnCache, this.highlightCache]
    
    for (const cache of caches) {
      for (const [key, entry] of cache.cache) {
        if (entry._cacheTime && now - entry._cacheTime > maxAgeMs) {
          cache.delete(key)
          cleanedCount++
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cache cleanup: removed ${cleanedCount} expired entries`)
    }
    
    return cleanedCount
  }
}

// Create singleton instance
const cacheManager = new PDFCacheManager()

// Initialize document info
cacheManager.documentInfo = {
  numPages: 0,
  documentId: null,
  timestamp: Date.now()
}

// Export singleton and class for testing
export default cacheManager
export { PDFCacheManager, LRUCache }

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    cacheManager.cleanup()
  }, 5 * 60 * 1000)
}