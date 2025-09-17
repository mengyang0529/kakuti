import React, { createContext, useContext, useReducer } from 'react'
import PropTypes from 'prop-types'
import { initialState } from './pdfViewerConstants'
import { pdfViewerReducer } from './pdfViewerReducer'


// Create contexts
const PdfViewerStateContext = createContext()
const PdfViewerDispatchContext = createContext()
const PdfViewerRefsContext = createContext()

// Provider component
export function PdfViewerProvider({ children, viewerRef, pdfDocRef }) {
  const [state, dispatch] = useReducer(pdfViewerReducer, initialState)
  
  // Refs context value
  const refsValue = {
    viewerRef,
    pdfDocRef
  }
  
  return (
    <PdfViewerStateContext.Provider value={state}>
      <PdfViewerDispatchContext.Provider value={dispatch}>
        <PdfViewerRefsContext.Provider value={refsValue}>
          {children}
        </PdfViewerRefsContext.Provider>
      </PdfViewerDispatchContext.Provider>
    </PdfViewerStateContext.Provider>
  )
}

PdfViewerProvider.propTypes = {
  children: PropTypes.node.isRequired,
  viewerRef: PropTypes.object.isRequired,
  pdfDocRef: PropTypes.object.isRequired
}

// Custom hooks to use the contexts
export function usePdfViewerState() {
  const context = useContext(PdfViewerStateContext)
  if (context === undefined) {
    throw new Error('usePdfViewerState must be used within a PdfViewerProvider')
  }
  return context
}

export function usePdfViewerDispatch() {
  const context = useContext(PdfViewerDispatchContext)
  if (context === undefined) {
    throw new Error('usePdfViewerDispatch must be used within a PdfViewerProvider')
  }
  return context
}

export function usePdfViewerRefs() {
  const context = useContext(PdfViewerRefsContext)
  if (context === undefined) {
    throw new Error('usePdfViewerRefs must be used within a PdfViewerProvider')
  }
  return context
}

// Convenience hook that combines state and dispatch
export function usePdfViewer() {
  const state = usePdfViewerState()
  const dispatch = usePdfViewerDispatch()
  const refs = usePdfViewerRefs()
  return { ...state, dispatch, ...refs }
}
