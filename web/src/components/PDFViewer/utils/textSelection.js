/**
 * Text Selection Utilities for PDF Viewer
 * 
 * This module provides utilities for selecting and extracting text from PDF pages
 * using a "corridor" approach that handles multi-column layouts intelligently.
 * 
 * Features:
 * - Intelligent span data caching for performance
 * - Multi-column layout detection and handling
 * - Enhanced corridor selection with endpoint column priority
 * - Optimized text extraction and normalization
 */

import cacheManager from './cacheManager'

/**
 * Calculate text selection based on corridor parameters
 * @param {Object} params - Selection parameters
 * @param {HTMLElement} params.pageElement - PDF page container element
 * @param {HTMLElement} params.textLayer - PDF text layer element
 * @param {number} params.minX - Left boundary of corridor (page coordinates)
 * @param {number} params.maxX - Right boundary of corridor (page coordinates)
 * @param {number} params.yThreshold - Y coordinate threshold (page coordinates)
 * @param {number} params.autoDropThreshold - Auto drop distance for fallback (default: 20px)
 * @returns {Object} Selection result
 */
export function calculateCorridorSelection({
  pageElement,
  textLayer,
  minX,
  maxX,
  minY,
  maxY,
  autoDropThreshold = 20
}) {
  console.log('=== Enhanced Magic Wand Text Selection Debug ===')
  console.log('Input parameters:', { minX, maxX, minY, maxY, autoDropThreshold })
  
  if (!pageElement || !textLayer) {
    console.log('Missing pageElement or textLayer')
    return {
      selectedText: '',
      rectsNorm: [],
      spansUsed: [],
      lines: [],
      isEmpty: true
    }
  }

  // Get page container dimensions for normalization with caching
  const pageElementId = pageElement.dataset.pageNumber || 'unknown'
  const cacheKey = `page_${pageElementId}_dimensions`
  let pageDimensions = cacheManager.get('layout', cacheKey)
  
  if (!pageDimensions) {
    const pageRect = pageElement.getBoundingClientRect()
    pageDimensions = {
      width: pageRect.width,
      height: pageRect.height,
      rect: pageRect
    }
    cacheManager.set('layout', cacheKey, pageDimensions, { ttl: 30000 }) // 30s TTL
  }
  
  const { width: pageWidth, height: pageHeight, rect: pageRect } = pageDimensions
  console.log('Page dimensions:', { pageWidth, pageHeight })
  console.log('Page rect:', pageRect)

  // Find all text spans in the text layer with caching
  const spansCacheKey = `page_${pageElementId}_spans`
  let spanData = cacheManager.get('spans', spansCacheKey)
  
  if (!spanData || !Array.isArray(spanData)) {
    const spans = Array.from(textLayer.querySelectorAll('span'))
    console.log(`Found ${spans.length} text spans in text layer`)
    
    // Cache span rectangles and text content with enhanced metadata
    spanData = spans.map((span, index) => {
      const rect = span.getBoundingClientRect()
      const pageRelativeRect = {
        left: rect.left - pageRect.left,
        top: rect.top - pageRect.top,
        right: rect.right - pageRect.left,
        bottom: rect.bottom - pageRect.top,
        width: rect.width,
        height: rect.height
      }
      
      const data = {
        span,
        rect: pageRelativeRect,
        text: span.textContent || '',
        centerX: pageRelativeRect.left + pageRelativeRect.width / 2,
        centerY: pageRelativeRect.top + pageRelativeRect.height / 2,
        index
      }
      
      // Log first few spans for debugging
      if (index < 5) {
        console.log(`Span ${index}:`, {
          text: data.text.substring(0, 20) + (data.text.length > 20 ? '...' : ''),
          rect: pageRelativeRect
        })
      }
      
      return data
    })
    
    // Cache spans data with 60s TTL
    cacheManager.set('spans', spansCacheKey, spanData, { ttl: 60000 })
    console.log(`Cached ${spanData.length} spans for page ${pageElementId}`)
  } else {
    console.log(`Using cached spans for page ${pageElementId}: ${spanData.length} spans`)
  }

  console.log('Selection corridor:', { minX, maxX, yRange: [minY, maxY] })
  
  // Enhanced multi-column detection and selection
  const multiColumnResult = detectAndSelectMultiColumn(spanData, minX, maxX, minY, maxY, pageWidth)
  
  if (multiColumnResult.isMultiColumn) {
    console.log('Multi-column layout detected, using column-aware selection')
    return processMultiColumnSelection(multiColumnResult, pageWidth, pageHeight)
  }
  
  // Fallback to original single-column logic
  console.log('Single-column layout detected, using standard selection')
  let selectedSpans = selectSpansInCorridor(spanData, minX, maxX, minY, maxY)
  console.log(`First attempt: found ${selectedSpans.length} spans`)
  
  // If no spans found, try expanding the Y range downward
  if (selectedSpans.length === 0) {
    console.log(`No spans found, trying expanded range [${minY}, ${maxY + autoDropThreshold}]`)
    selectedSpans = selectSpansInCorridor(spanData, minX, maxX, minY, maxY + autoDropThreshold)
    console.log(`Expanded range attempt: found ${selectedSpans.length} spans`)
  }

  if (selectedSpans.length === 0) {
    console.log('No spans selected, returning empty result')
    return {
      selectedText: '',
      rectsNorm: [],
      spansUsed: [],
      lines: [],
      isEmpty: true,
      needsManualDrop: true
    }
  }

  return processSingleColumnSelection(selectedSpans, pageWidth, pageHeight)
}

/**
 * Detect multi-column layout and perform column-aware selection
 * @param {Array} spanData - Array of span data objects
 * @param {number} minX - Left boundary
 * @param {number} maxX - Right boundary
 * @param {number} minY - Top boundary
 * @param {number} maxY - Bottom boundary
 * @param {number} pageWidth - Page width for normalization
 * @returns {Object} Multi-column selection result
 */
function detectAndSelectMultiColumn(spanData, minX, maxX, minY, maxY, pageWidth) {
  // Validate spanData is an array
  if (!Array.isArray(spanData)) {
    console.warn('spanData is not an array, returning empty result')
    return {
      selectedSpans: [],
      isMultiColumn: false,
      columns: [],
      layoutAnalysis: { isMultiColumn: false, columns: [] }
    }
  }
  
  // Analyze text layout to detect columns
  const layoutAnalysis = analyzeTextLayout(spanData, pageWidth)
  
  if (!layoutAnalysis.isMultiColumn) {
    return { isMultiColumn: false }
  }
  
  console.log(`Detected ${layoutAnalysis.columns.length} columns:`, 
    layoutAnalysis.columns.map(col => `[${Math.round(col.left)}-${Math.round(col.right)}]`).join(', '))
  
  // Determine which columns intersect with the selection corridor
  const intersectingColumns = layoutAnalysis.columns.filter(column => {
    return !(maxX < column.left || minX > column.right)
  })
  
  if (intersectingColumns.length === 0) {
    return { isMultiColumn: true, selectedSpans: [] }
  }
  
  // Apply endpoint column priority strategy
  const prioritizedColumns = applyEndpointColumnPriority(intersectingColumns, minX, maxX)
  
  console.log('Column priority order:', prioritizedColumns.map(col => 
    `[${Math.round(col.left)}-${Math.round(col.right)}] (priority: ${col.priority})`).join(', '))
  
  // Select spans from prioritized columns
  let selectedSpans = []
  
  for (const column of prioritizedColumns) {
    const columnSpans = selectSpansInColumnCorridor(
      spanData, 
      Math.max(minX, column.left), 
      Math.min(maxX, column.right), 
      minY, 
      maxY
    )
    
    if (columnSpans.length > 0) {
      selectedSpans.push(...columnSpans)
      console.log(`Selected ${columnSpans.length} spans from column [${Math.round(column.left)}-${Math.round(column.right)}]`)
      
      // For endpoint priority, we might want to stop after finding text in the priority column
      if (column.priority === 'high' && columnSpans.length > 0) {
        break
      }
    }
  }
  
  return {
    isMultiColumn: true,
    selectedSpans,
    columns: layoutAnalysis.columns,
    prioritizedColumns
  }
}

/**
 * Analyze text layout to detect column structure
 * @param {Array} spanData - Array of span data objects
 * @param {number} pageWidth - Page width
 * @returns {Object} Layout analysis result
 */
function analyzeTextLayout(spanData, pageWidth) {
  if (!Array.isArray(spanData) || spanData.length < 10) {
    return { isMultiColumn: false, columns: [] }
  }
  
  // Group spans by approximate Y position to find text lines
  const lineGroups = new Map()
  const lineThreshold = 5 // pixels
  
  spanData.forEach(span => {
    const lineKey = Math.round(span.rect.top / lineThreshold) * lineThreshold
    if (!lineGroups.has(lineKey)) {
      lineGroups.set(lineKey, [])
    }
    lineGroups.get(lineKey).push(span)
  })
  
  // Analyze horizontal distribution of text lines
  const lines = Array.from(lineGroups.values())
    .filter(line => line.length > 0)
    .map(line => {
      line.sort((a, b) => a.rect.left - b.rect.left)
      return {
        spans: line,
        left: line[0].rect.left,
        right: line[line.length - 1].rect.right,
        top: Math.min(...line.map(s => s.rect.top)),
        width: line[line.length - 1].rect.right - line[0].rect.left
      }
    })
  
  // Detect column boundaries by analyzing gaps in text distribution
  const columnBoundaries = detectColumnBoundaries(lines, pageWidth)
  
  if (columnBoundaries.length < 2) {
    return { isMultiColumn: false, columns: [] }
  }
  
  // Create column definitions
  const columns = []
  for (let i = 0; i < columnBoundaries.length - 1; i++) {
    columns.push({
      left: columnBoundaries[i],
      right: columnBoundaries[i + 1],
      index: i
    })
  }
  
  return {
    isMultiColumn: columns.length > 1,
    columns,
    lines
  }
}

/**
 * Detect column boundaries based on text distribution gaps
 * @param {Array} lines - Array of text line objects
 * @param {number} pageWidth - Page width
 * @returns {Array} Array of column boundary x-coordinates
 */
function detectColumnBoundaries(lines, pageWidth) {
  const minGapWidth = pageWidth * 0.05 // Minimum 5% of page width for column gap
  const boundaries = [0] // Start with left edge
  
  // Create a histogram of text coverage across the page width
  const resolution = Math.max(1, Math.floor(pageWidth / 100)) // 100 buckets
  const coverage = new Array(Math.ceil(pageWidth / resolution)).fill(0)
  
  lines.forEach(line => {
    const startBucket = Math.floor(line.left / resolution)
    const endBucket = Math.floor(line.right / resolution)
    
    for (let i = startBucket; i <= endBucket && i < coverage.length; i++) {
      coverage[i]++
    }
  })
  
  // Find gaps in coverage that could indicate column boundaries
  let inGap = false
  let gapStart = 0
  
  for (let i = 0; i < coverage.length; i++) {
    const x = i * resolution
    
    if (coverage[i] === 0 && !inGap) {
      // Start of a gap
      inGap = true
      gapStart = x
    } else if (coverage[i] > 0 && inGap) {
      // End of a gap
      const gapWidth = x - gapStart
      if (gapWidth >= minGapWidth) {
        // This is a significant gap, add column boundary
        boundaries.push(gapStart + gapWidth / 2)
      }
      inGap = false
    }
  }
  
  boundaries.push(pageWidth) // End with right edge
  return boundaries.sort((a, b) => a - b)
}

/**
 * Apply endpoint column priority strategy
 * @param {Array} columns - Array of column objects
 * @param {number} minX - Selection start X
 * @param {number} maxX - Selection end X
 * @returns {Array} Prioritized columns
 */
function applyEndpointColumnPriority(columns, minX, maxX) {
  const selectionMidpoint = (minX + maxX) / 2
  
  return columns.map(column => {
    const columnMidpoint = (column.left + column.right) / 2
    const distanceFromEnd = Math.abs(columnMidpoint - maxX)
    const distanceFromStart = Math.abs(columnMidpoint - minX)
    
    // Prioritize columns closer to the endpoint (maxX)
    let priority = 'low'
    if (distanceFromEnd < distanceFromStart) {
      priority = 'high' // Endpoint column gets highest priority
    } else if (Math.abs(columnMidpoint - selectionMidpoint) < (maxX - minX) * 0.3) {
      priority = 'medium' // Columns near selection center get medium priority
    }
    
    return {
      ...column,
      priority,
      distanceFromEnd,
      distanceFromStart
    }
  }).sort((a, b) => {
    // Sort by priority: high > medium > low
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
    
    if (priorityDiff !== 0) return priorityDiff
    
    // Within same priority, prefer columns closer to endpoint
    return a.distanceFromEnd - b.distanceFromEnd
  })
}

/**
 * Select spans within a specific column corridor
 * @param {Array} spanData - Array of span data objects
 * @param {number} minX - Left boundary
 * @param {number} maxX - Right boundary
 * @param {number} minY - Top boundary
 * @param {number} maxY - Bottom boundary
 * @returns {Array} Selected spans
 */
function selectSpansInColumnCorridor(spanData, minX, maxX, minY, maxY) {
  if (!Array.isArray(spanData)) {
    return []
  }
  
  return spanData.filter(spanData => {
    const rect = spanData.rect
    const spanLeft = rect.left
    const spanRight = rect.right
    const spanTop = rect.top
    const spanBottom = rect.bottom
    
    // Check horizontal overlap with column
    const horizontalOverlap = !(spanRight < minX || spanLeft > maxX)
    
    // Check vertical overlap with selection area
    const verticalOverlap = !(spanBottom < minY || spanTop > maxY)
    
    return horizontalOverlap && verticalOverlap
  })
}

/**
 * Process multi-column selection results
 * @param {Object} multiColumnResult - Multi-column selection result
 * @param {number} pageWidth - Page width
 * @param {number} pageHeight - Page height
 * @returns {Object} Processed selection result
 */
function processMultiColumnSelection(multiColumnResult, pageWidth, pageHeight) {
  const { selectedSpans } = multiColumnResult
  
  if (selectedSpans.length === 0) {
    return {
      selectedText: '',
      rectsNorm: [],
      spansUsed: [],
      lines: [],
      isEmpty: true,
      isMultiColumn: true
    }
  }
  
  return processSingleColumnSelection(selectedSpans, pageWidth, pageHeight, true)
}

/**
 * Process single-column selection results
 * @param {Array} selectedSpans - Selected span data
 * @param {number} pageWidth - Page width
 * @param {number} pageHeight - Page height
 * @param {boolean} isMultiColumn - Whether this is from multi-column processing
 * @returns {Object} Processed selection result
 */
function processSingleColumnSelection(selectedSpans, pageWidth, pageHeight, isMultiColumn = false) {
  // Log selected spans
  console.log('Selected spans:')
  selectedSpans.forEach((spanData, index) => {
    console.log(`  ${index}: "${spanData.text}" at (${Math.round(spanData.rect.left)}, ${Math.round(spanData.rect.top)})`)
  })

  // Sort spans by position (top to bottom, left to right)
  selectedSpans.sort((a, b) => {
    const yDiff = a.rect.top - b.rect.top
    if (Math.abs(yDiff) < 5) { // Same line threshold
      return a.rect.left - b.rect.left
    }
    return yDiff
  })

  // Group spans into lines
  const lines = groupSpansIntoLines(selectedSpans)
  console.log(`Grouped into ${lines.length} lines`)
  
  // Extract text with proper line breaks and word joining
  const selectedText = extractTextFromLines(lines)
  console.log('Final selected text:', selectedText)
  console.log('=== End Debug ===')
  
  // Calculate normalized rectangles
  const rectsNorm = selectedSpans.map(spanData => ({
    x: spanData.rect.left / pageWidth,
    y: spanData.rect.top / pageHeight,
    w: spanData.rect.width / pageWidth,
    h: spanData.rect.height / pageHeight
  }))

  return {
    selectedText,
    rectsNorm,
    spansUsed: selectedSpans.map(s => s.span),
    lines,
    isEmpty: false,
    isMultiColumn
  }
}

/**
 * Select spans within the corridor boundaries
 * @param {Array} spanData - Array of span data objects
 * @param {number} minX - Left boundary
 * @param {number} maxX - Right boundary
 * @param {number} yThreshold - Y threshold
 * @returns {Array} Selected span data objects
 */
function selectSpansInCorridor(spanData, minX, maxX, yStart, yEnd) {
  if (!Array.isArray(spanData)) {
    console.warn('spanData is not an array in selectSpansInCorridor')
    return []
  }
  
  // Add tolerance to Y range to catch text that might be slightly above the drawn line
  const yTolerance = 10
  const adjustedYStart = yStart - yTolerance
  const adjustedYEnd = yEnd + yTolerance
  
  console.log(`\n--- Filtering spans with corridor (${minX}, ${maxX}) and Y range ${yStart} to ${yEnd} (adjusted: ${adjustedYStart} to ${adjustedYEnd}) ---`)
  
  const filteredSpans = spanData.filter((spanData, index) => {
    const { rect, text } = spanData
    
    // Check if span is within the Y range (with tolerance)
    const withinYRange = rect.top >= adjustedYStart && rect.top <= adjustedYEnd
    if (!withinYRange) {
      if (index < 10) { // Log first 10 rejections
        console.log(`  Span ${index} REJECTED (outside Y range): "${text.substring(0, 15)}..." top=${Math.round(rect.top)} not in [${adjustedYStart}, ${adjustedYEnd}]`)
      }
      return false
    }
    
    // Check if span overlaps with corridor horizontally
    const spanLeft = rect.left
    const spanRight = rect.right
    
    // Span overlaps if it's not completely outside the corridor
    const overlaps = !(spanRight < minX || spanLeft > maxX)
    
    if (overlaps) {
      console.log(`  Span ${index} SELECTED: "${text.substring(0, 20)}..." at (${Math.round(spanLeft)}-${Math.round(spanRight)}, ${Math.round(rect.top)})`)
    } else {
      if (index < 10) { // Log first 10 rejections
        console.log(`  Span ${index} REJECTED (outside corridor): "${text.substring(0, 15)}..." x=${Math.round(spanLeft)}-${Math.round(spanRight)} vs corridor ${minX}-${maxX}`)
      }
    }
    
    return overlaps
  })
  
  console.log(`--- End filtering: ${filteredSpans.length} spans selected ---\n`)
  return filteredSpans
}

/**
 * Group spans into lines based on vertical proximity
 * @param {Array} spans - Sorted span data objects
 * @returns {Array} Array of line objects
 */
function groupSpansIntoLines(spans) {
  if (spans.length === 0) return []
  
  const lines = []
  let currentLine = [spans[0]]
  
  for (let i = 1; i < spans.length; i++) {
    const currentSpan = spans[i]
    const lastSpanInLine = currentLine[currentLine.length - 1]
    
    // Check if spans are on the same line (within 5px vertically)
    const yDiff = Math.abs(currentSpan.rect.top - lastSpanInLine.rect.top)
    
    if (yDiff < 5) {
      currentLine.push(currentSpan)
    } else {
      lines.push(currentLine)
      currentLine = [currentSpan]
    }
  }
  
  lines.push(currentLine)
  return lines
}

/**
 * Extract text from grouped lines with proper formatting
 * @param {Array} lines - Array of line objects (each containing spans)
 * @returns {string} Formatted text
 */
function extractTextFromLines(lines) {
  return lines.map(line => {
    // Sort spans in line by horizontal position
    line.sort((a, b) => a.rect.left - b.rect.left)
    
    // Join spans in line with appropriate spacing
    let lineText = ''
    for (let i = 0; i < line.length; i++) {
      const span = line[i]
      let text = span.text
      
      // Handle hyphenation for English words
      if (text.endsWith('-') && i < line.length - 1) {
        const nextSpan = line[i + 1]
        const nextText = nextSpan.text
        
        // Check if it's likely a hyphenated word (next word starts with lowercase)
        if (nextText && nextText[0] && nextText[0] === nextText[0].toLowerCase()) {
          text = text.slice(0, -1) // Remove hyphen
          // Don't add space, will be handled in next iteration
        }
      }
      
      if (i > 0) {
        const prevSpan = line[i - 1]
        const gap = span.rect.left - prevSpan.rect.right
        
        // Add space if there's a significant gap between spans
        if (gap > 2) {
          lineText += ' '
        }
      }
      
      lineText += text
    }
    
    return lineText.trim()
  }).join('\n')
}

/**
 * Create normalized rectangles for highlighting
 * @param {Array} spans - Array of DOM span elements
 * @param {HTMLElement} pageElement - Page container element
 * @returns {Array} Array of normalized rectangle objects
 */
export function createNormalizedRects(spans, pageElement) {
  if (!spans || !pageElement) return []
  
  const pageRect = pageElement.getBoundingClientRect()
  const pageWidth = pageRect.width
  const pageHeight = pageRect.height
  
  return spans.map(span => {
    const rect = span.getBoundingClientRect()
    return {
      x: (rect.left - pageRect.left) / pageWidth,
      y: (rect.top - pageRect.top) / pageHeight,
      w: rect.width / pageWidth,
      h: rect.height / pageHeight
    }
  })
}

/**
 * Convert normalized rectangles back to page coordinates
 * @param {Array} rectsNorm - Array of normalized rectangles
 * @param {HTMLElement} pageElement - Page container element
 * @returns {Array} Array of page coordinate rectangles
 */
export function denormalizeRects(rectsNorm, pageElement) {
  if (!rectsNorm || !pageElement) return []
  
  const pageRect = pageElement.getBoundingClientRect()
  const pageWidth = pageRect.width
  const pageHeight = pageRect.height
  
  return rectsNorm.map(rect => ({
    left: rect.x * pageWidth,
    top: rect.y * pageHeight,
    width: rect.w * pageWidth,
    height: rect.h * pageHeight,
    right: (rect.x + rect.w) * pageWidth,
    bottom: (rect.y + rect.h) * pageHeight
  }))
}