import React from 'react'
import PropTypes from 'prop-types'
import { Document, Page } from 'react-pdf'
import { configurePdfWorker } from './PDFViewer/config/workerConfig'
import './DocumentPreviewCard.css'

// Ensure PDF.js worker is configured
configurePdfWorker()

const DocumentPreviewCard = ({ file, title, onOpen, onDelete }) => {
  if (!file) return null

  return (
    <div
      className="doc-preview-card clickable"
      role="button"
      tabIndex={0}
      aria-label="Open document preview"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen && onOpen()
        }
      }}
    >
      {onDelete && (
        <button
          className="delete-btn"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      <div className="doc-preview-thumb">
        <Document file={file} loading={<div className="doc-preview-loading">Loading preview…</div>}>
          <Page
            pageNumber={1}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            width={160}
          />
        </Document>
      </div>
      {title && (
        <div className="doc-preview-meta" title={title}>
          {title}
        </div>
      )}
    </div>
  )
}

DocumentPreviewCard.propTypes = {
  file: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object,
    typeof File !== 'undefined' ? PropTypes.instanceOf(File) : PropTypes.any
  ]),
  title: PropTypes.string,
  onOpen: PropTypes.func,
  onDelete: PropTypes.func
}

export default DocumentPreviewCard
