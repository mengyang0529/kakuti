/**
 * Enhanced Observer Manager for PDF Viewer
 * 
 * This module provides comprehensive DOM observation capabilities:
 * - ResizeObserver for layout changes
 * - MutationObserver for DOM structure changes
 * - IntersectionObserver for viewport visibility
 * - Custom event observers for application events
 * 
 * Features:
 * - Debounced callbacks to prevent excessive updates
 * - Observer lifecycle management
 * - Performance monitoring
 * - Memory leak prevention
 */

import cacheManager from './cacheManager'

class ObserverManager {
  constructor() {
    this.observers = new Map()
    this.callbacks = new Map()
    this.debounceTimers = new Map()
    this.performanceMetrics = {
      totalObservations: 0,
      avgProcessingTime: 0,
      observerCount: 0
    }
    
    // Bind methods
    this.createResizeObserver = this.createResizeObserver.bind(this)
    this.createMutationObserver = this.createMutationObserver.bind(this)
    this.createIntersectionObserver = this.createIntersectionObserver.bind(this)
  }

  /**
   * Create a debounced callback wrapper
   */
  _createDebouncedCallback(callback, delay = 100, immediate = false) {
    return (...args) => {
      const callbackId = callback.toString()
      
      if (this.debounceTimers.has(callbackId)) {
        clearTimeout(this.debounceTimers.get(callbackId))
      }
      
      const executeCallback = () => {
        const startTime = performance.now()
        
        try {
          callback(...args)
          
          // Update performance metrics
          const processingTime = performance.now() - startTime
          this.performanceMetrics.totalObservations++
          
          const totalTime = this.performanceMetrics.avgProcessingTime * 
                           (this.performanceMetrics.totalObservations - 1) + processingTime
          this.performanceMetrics.avgProcessingTime = totalTime / this.performanceMetrics.totalObservations
          
        } catch (error) {
          console.error('Observer callback error:', error)
        }
        
        this.debounceTimers.delete(callbackId)
      }
      
      if (immediate && !this.debounceTimers.has(callbackId)) {
        executeCallback()
      } else {
        const timerId = setTimeout(executeCallback, delay)
        this.debounceTimers.set(callbackId, timerId)
      }
    }
  }

  /**
   * Create ResizeObserver for monitoring element size changes
   */
  createResizeObserver({
    elements,
    callback,
    debounceDelay = 100,
    immediate = false,
    observerId = null
  }) {
    const id = observerId || `resize_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    if (this.observers.has(id)) {
      console.warn(`Observer with id '${id}' already exists`)
      return id
    }
    
    const debouncedCallback = this._createDebouncedCallback(
      (entries) => {
        const resizeData = entries.map(entry => ({
          element: entry.target,
          contentRect: entry.contentRect,
          borderBoxSize: entry.borderBoxSize,
          contentBoxSize: entry.contentBoxSize,
          devicePixelContentBoxSize: entry.devicePixelContentBoxSize
        }))
        
        // Invalidate relevant caches on resize
        const pageElements = resizeData
          .map(data => data.element)
          .filter(el => el.classList.contains('page-container'))
        
        if (pageElements.length > 0) {
          // Extract page indices and invalidate cache
          pageElements.forEach(pageEl => {
            const pageNumber = pageEl.getAttribute('data-page-number')
            if (pageNumber) {
              const pageIndex = parseInt(pageNumber) - 1
              cacheManager.invalidate({ 
                pageIndex, 
                reason: 'page_resize' 
              })
            }
          })
        }
        
        callback(resizeData)
      },
      debounceDelay,
      immediate
    )
    
    const observer = new ResizeObserver(debouncedCallback)
    
    // Observe elements
    const elementsArray = Array.isArray(elements) ? elements : [elements]
    elementsArray.forEach(element => {
      if (element && element.nodeType === Node.ELEMENT_NODE) {
        observer.observe(element)
      }
    })
    
    this.observers.set(id, observer)
    this.callbacks.set(id, callback)
    this.performanceMetrics.observerCount++
    
    console.log(`Created ResizeObserver '${id}' for ${elementsArray.length} elements`)
    
    return id
  }

  /**
   * Create MutationObserver for monitoring DOM changes
   */
  createMutationObserver({
    element,
    callback,
    options = {},
    debounceDelay = 150,
    immediate = false,
    observerId = null
  }) {
    const id = observerId || `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    if (this.observers.has(id)) {
      console.warn(`Observer with id '${id}' already exists`)
      return id
    }
    
    const defaultOptions = {
      childList: true,
      subtree: true,
      attributes: false,
      attributeOldValue: false,
      characterData: false,
      characterDataOldValue: false
    }
    
    const observerOptions = { ...defaultOptions, ...options }
    
    const debouncedCallback = this._createDebouncedCallback(
      (mutations) => {
        const mutationData = mutations.map(mutation => ({
          type: mutation.type,
          target: mutation.target,
          addedNodes: Array.from(mutation.addedNodes),
          removedNodes: Array.from(mutation.removedNodes),
          attributeName: mutation.attributeName,
          oldValue: mutation.oldValue
        }))
        
        // Check for text layer changes that might affect caching
        const hasTextLayerChanges = mutationData.some(mutation => 
          mutation.addedNodes.some(node => 
            node.classList && node.classList.contains('react-pdf__Page__textContent')
          ) ||
          mutation.removedNodes.some(node => 
            node.classList && node.classList.contains('react-pdf__Page__textContent')
          )
        )
        
        if (hasTextLayerChanges) {
          // Invalidate span data cache for affected pages
          cacheManager.invalidate({ reason: 'text_layer_mutation' })
        }
        
        callback(mutationData)
      },
      debounceDelay,
      immediate
    )
    
    const observer = new MutationObserver(debouncedCallback)
    
    if (element && element.nodeType === Node.ELEMENT_NODE) {
      observer.observe(element, observerOptions)
    }
    
    this.observers.set(id, observer)
    this.callbacks.set(id, callback)
    this.performanceMetrics.observerCount++
    
    console.log(`Created MutationObserver '${id}' for element:`, element)
    
    return id
  }

  /**
   * Create IntersectionObserver for monitoring element visibility
   */
  createIntersectionObserver({
    elements,
    callback,
    options = {},
    debounceDelay = 50,
    immediate = true,
    observerId = null
  }) {
    const id = observerId || `intersection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    if (this.observers.has(id)) {
      console.warn(`Observer with id '${id}' already exists`)
      return id
    }
    
    const defaultOptions = {
      root: null,
      rootMargin: '0px',
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0]
    }
    
    const observerOptions = { ...defaultOptions, ...options }
    
    const debouncedCallback = this._createDebouncedCallback(
      (entries) => {
        const intersectionData = entries.map(entry => ({
          element: entry.target,
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          intersectionRect: entry.intersectionRect,
          boundingClientRect: entry.boundingClientRect,
          rootBounds: entry.rootBounds,
          time: entry.time
        }))
        
        callback(intersectionData)
      },
      debounceDelay,
      immediate
    )
    
    const observer = new IntersectionObserver(debouncedCallback, observerOptions)
    
    // Observe elements
    const elementsArray = Array.isArray(elements) ? elements : [elements]
    elementsArray.forEach(element => {
      if (element && element.nodeType === Node.ELEMENT_NODE) {
        observer.observe(element)
      }
    })
    
    this.observers.set(id, observer)
    this.callbacks.set(id, callback)
    this.performanceMetrics.observerCount++
    
    console.log(`Created IntersectionObserver '${id}' for ${elementsArray.length} elements`)
    
    return id
  }

  /**
   * Create custom event observer
   */
  createEventObserver({
    element = window,
    eventType,
    callback,
    options = {},
    debounceDelay = 100,
    immediate = false,
    observerId = null
  }) {
    const id = observerId || `event_${eventType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    if (this.observers.has(id)) {
      console.warn(`Observer with id '${id}' already exists`)
      return id
    }
    
    const debouncedCallback = this._createDebouncedCallback(
      callback,
      debounceDelay,
      immediate
    )
    
    element.addEventListener(eventType, debouncedCallback, options)
    
    // Store event listener info for cleanup
    const observerInfo = {
      type: 'event',
      element,
      eventType,
      callback: debouncedCallback,
      options,
      cleanup: () => element.removeEventListener(eventType, debouncedCallback, options)
    }
    
    this.observers.set(id, observerInfo)
    this.callbacks.set(id, callback)
    this.performanceMetrics.observerCount++
    
    console.log(`Created EventObserver '${id}' for '${eventType}' on:`, element)
    
    return id
  }

  /**
   * Add elements to existing observer
   */
  addElements(observerId, elements) {
    const observer = this.observers.get(observerId)
    if (!observer) {
      console.warn(`Observer '${observerId}' not found`)
      return false
    }
    
    if (observer.type === 'event') {
      console.warn(`Cannot add elements to event observer '${observerId}'`)
      return false
    }
    
    const elementsArray = Array.isArray(elements) ? elements : [elements]
    
    elementsArray.forEach(element => {
      if (element && element.nodeType === Node.ELEMENT_NODE) {
        observer.observe(element)
      }
    })
    
    console.log(`Added ${elementsArray.length} elements to observer '${observerId}'`)
    return true
  }

  /**
   * Remove elements from existing observer
   */
  removeElements(observerId, elements) {
    const observer = this.observers.get(observerId)
    if (!observer) {
      console.warn(`Observer '${observerId}' not found`)
      return false
    }
    
    if (observer.type === 'event') {
      console.warn(`Cannot remove elements from event observer '${observerId}'`)
      return false
    }
    
    const elementsArray = Array.isArray(elements) ? elements : [elements]
    
    elementsArray.forEach(element => {
      if (element && element.nodeType === Node.ELEMENT_NODE) {
        observer.unobserve(element)
      }
    })
    
    console.log(`Removed ${elementsArray.length} elements from observer '${observerId}'`)
    return true
  }

  /**
   * Disconnect specific observer
   */
  disconnect(observerId) {
    const observer = this.observers.get(observerId)
    if (!observer) {
      console.warn(`Observer '${observerId}' not found`)
      return false
    }
    
    // Clear any pending debounce timers
    const callback = this.callbacks.get(observerId)
    if (callback) {
      const callbackId = callback.toString()
      if (this.debounceTimers.has(callbackId)) {
        clearTimeout(this.debounceTimers.get(callbackId))
        this.debounceTimers.delete(callbackId)
      }
    }
    
    // Disconnect observer
    if (observer.type === 'event') {
      observer.cleanup()
    } else {
      observer.disconnect()
    }
    
    this.observers.delete(observerId)
    this.callbacks.delete(observerId)
    this.performanceMetrics.observerCount--
    
    console.log(`Disconnected observer '${observerId}'`)
    return true
  }

  /**
   * Disconnect all observers
   */
  disconnectAll() {
    const observerIds = Array.from(this.observers.keys())
    
    observerIds.forEach(id => {
      this.disconnect(id)
    })
    
    // Clear all debounce timers
    for (const timerId of this.debounceTimers.values()) {
      clearTimeout(timerId)
    }
    this.debounceTimers.clear()
    
    console.log(`Disconnected all ${observerIds.length} observers`)
  }

  /**
   * Get observer information
   */
  getObserverInfo(observerId) {
    const observer = this.observers.get(observerId)
    const callback = this.callbacks.get(observerId)
    
    if (!observer) {
      return null
    }
    
    return {
      id: observerId,
      type: observer.type || observer.constructor.name,
      hasCallback: !!callback,
      isActive: true
    }
  }

  /**
   * List all active observers
   */
  listObservers() {
    const observers = []
    
    for (const [id, observer] of this.observers) {
      observers.push({
        id,
        type: observer.type || observer.constructor.name,
        hasCallback: this.callbacks.has(id)
      })
    }
    
    return observers
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.performanceMetrics,
      avgProcessingTime: this.performanceMetrics.avgProcessingTime.toFixed(3) + 'ms',
      activeObservers: this.observers.size,
      pendingCallbacks: this.debounceTimers.size
    }
  }

  /**
   * Create a comprehensive PDF viewer observer setup
   */
  setupPDFViewerObservers(viewerRef, options = {}) {
    const {
      onResize = () => {},
      onMutation = () => {},
      onPageVisibility = () => {},
      onScroll = () => {},
      debounceDelays = {}
    } = options
    
    const defaultDebounceDelays = {
      resize: 100,
      mutation: 150,
      intersection: 50,
      scroll: 50
    }
    
    const delays = { ...defaultDebounceDelays, ...debounceDelays }
    
    const observerIds = {}
    
    if (!viewerRef.current) {
      console.warn('Viewer ref not available for observer setup')
      return observerIds
    }
    
    // Setup resize observer for container and pages
    observerIds.resize = this.createResizeObserver({
      elements: [viewerRef.current],
      callback: (resizeData) => {
        console.log('PDF viewer resize detected')
        onResize(resizeData)
      },
      debounceDelay: delays.resize,
      observerId: 'pdf_viewer_resize'
    })
    
    // Setup mutation observer for DOM changes
    observerIds.mutation = this.createMutationObserver({
      element: viewerRef.current,
      callback: (mutations) => {
        console.log('PDF viewer DOM mutation detected')
        onMutation(mutations)
      },
      options: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-page-number', 'class']
      },
      debounceDelay: delays.mutation,
      observerId: 'pdf_viewer_mutation'
    })
    
    // Setup intersection observer for page visibility
    const pages = viewerRef.current.querySelectorAll('.page-container')
    if (pages.length > 0) {
      observerIds.intersection = this.createIntersectionObserver({
        elements: Array.from(pages),
        callback: (intersectionData) => {
          console.log('PDF page visibility changed')
          onPageVisibility(intersectionData)
        },
        options: {
          root: viewerRef.current,
          rootMargin: '50px',
          threshold: [0, 0.1, 0.5, 0.9]
        },
        debounceDelay: delays.intersection,
        observerId: 'pdf_page_visibility'
      })
    }
    
    // Setup scroll event observer
    observerIds.scroll = this.createEventObserver({
      element: viewerRef.current,
      eventType: 'scroll',
      callback: (event) => {
        console.log('PDF viewer scroll detected')
        onScroll(event)
      },
      options: { passive: true },
      debounceDelay: delays.scroll,
      observerId: 'pdf_viewer_scroll'
    })
    
    console.log('PDF viewer observers setup complete:', observerIds)
    
    return observerIds
  }
}

// Create singleton instance
const observerManager = new ObserverManager()

// Export singleton and class
export default observerManager
export { ObserverManager }

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    observerManager.disconnectAll()
  })
}