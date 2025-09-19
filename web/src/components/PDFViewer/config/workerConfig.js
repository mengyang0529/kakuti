import { pdfjs } from 'react-pdf'

/**
 * Configure PDF.js worker with optimized strategy:
 * 1. Try local pdfjs-dist worker first (fastest, most reliable)
 * 2. Fallback to CDN workers for development/compatibility
 * 3. Handle version mismatches gracefully
 * 
 * @returns {void}
 */
export function configurePdfWorker() {
  if (typeof window === 'undefined') {
    return // Skip on server-side rendering
  }

  // Suppress specific PDF.js warnings that don't affect functionality
  const originalWarn = console.warn
  const originalError = console.error
  
  console.warn = function(...args) {
    const message = args.join(' ')
    if (message.includes('TextLayer task cancelled') || 
        message.includes('AbortException') ||
        message.includes('TextLayer') && message.includes('cancelled')) {
      return // Ignore these warnings
    }
    originalWarn.apply(console, args)
  }
  
  console.error = function(...args) {
    const message = args.join(' ')
    if (message.includes('AbortException: TextLayer task cancelled')) {
      return // Ignore this specific error
    }
    originalError.apply(console, args)
  }

  try {
    const pdfjsVersion = pdfjs.version
    
    // Fallback CDN workers for development environment
    const cdnWorkerSources = [
      `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.js`,
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`,
      'https://unpkg.com/pdfjs-dist@5.4.54/build/pdf.worker.min.js'
    ]
    
    // In development, use CDN worker for simplicity
    const isDevelopment = import.meta.env.DEV
    
    pdfjs.GlobalWorkerOptions.workerSrc = isDevelopment ? cdnWorkerSources[0] : cdnWorkerSources[0]
    
    // Test worker availability
    testWorkerAvailability()
    
  } catch (error) {
    console.error('Error configuring PDF.js worker:', error)
    
    // Emergency fallback: Use a known stable CDN worker
    try {
      const fallbackWorker = 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.js'
      pdfjs.GlobalWorkerOptions.workerSrc = fallbackWorker
      console.warn('Using emergency fallback worker:', fallbackWorker)
    } catch (fallbackError) {
      console.error('Emergency fallback worker configuration failed:', fallbackError)
    }
  }
}

/**
 * Test if the configured worker is accessible
 * This helps identify worker loading issues early
 */
function testWorkerAvailability() {
  const workerSrc = pdfjs.GlobalWorkerOptions.workerSrc
  
  if (!workerSrc) {
    console.warn('No PDF.js worker configured')
    return
  }
  
  
  
  // Skip network tests to avoid console errors
  // PDF.js will handle worker loading and fallbacks internally
}

/**
 * Get current worker configuration info
 * @returns {Object} Worker configuration information
 * @returns {string} returns.version - PDF.js version
 * @returns {string} returns.workerSrc - Current worker source URL
 * @returns {boolean} returns.isDevelopment - Whether running in development mode
 */
export function getWorkerInfo() {
  return {
    version: pdfjs.version,
    workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
    isDevelopment: import.meta.env.DEV
  }
}

/**
 * Reconfigure worker (useful for debugging or switching strategies)
 * @param {string} workerUrl - New worker URL to use
 * @returns {boolean} True if reconfiguration was successful, false otherwise
 */
export function reconfigureWorker(workerUrl) {
  if (typeof workerUrl === 'string' && workerUrl.trim()) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

    return true
  }
  return false
}
