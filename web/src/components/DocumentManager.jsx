import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import documentService from '../services/documentService'
import './DocumentManager.css'

const DocumentManager = ({ onDocumentSelect }) => {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await documentService.getDocuments()
      console.log('DocumentManager: API response:', response)
      console.log('DocumentManager: Documents loaded:', response.documents)
      setDocuments(response.documents || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (docId, event) => {
    event.stopPropagation()
    if (!confirm('Are you sure you want to delete this document?')) {
      return
    }

    try {
      await documentService.deleteDocument(docId)
      setDocuments(documents.filter(doc => doc.id !== docId))
    } catch (err) {
      alert('Failed to delete document: ' + err.message)
    }
  }

  const handleDocumentClick = (doc) => {
    console.log('DocumentManager: Document clicked:', doc)
    console.log('DocumentManager: Document ID:', doc.id)
    if (onDocumentSelect) {
      // For PDF files, create a download URL
      if (doc.mime === 'application/pdf') {
        const downloadUrl = documentService.getDownloadUrl(doc.id)
        console.log('DocumentManager: Calling onDocumentSelect with:', { downloadUrl, docId: doc.id })
        onDocumentSelect(downloadUrl, doc.id)
      }
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString()
  }

  const sanitizeTitle = (title) => {
    if (!title) return 'Untitled Document';
    const sanitized = title
      .replace(/\.(pdf|bmp|txt|md|jpg|jpeg|png|gif|doc|docx)$/i, '') // Remove extensions
      .replace(/[^a-zA-Z\s]/g, ' ') // Replace symbols with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim(); // Trim leading/trailing spaces
    return sanitized || 'Untitled Document';
  }

  if (loading) {
    return <div className="document-manager loading">Loading documents...</div>
  }

  if (error) {
    return (
      <div className="document-manager error">
        <p>Error: {error}</p>
        <button onClick={loadDocuments}>Retry</button>
      </div>
    )
  }

  return (
    <div className="document-manager">
      
      
      {documents.length === 0 ? (
        <div className="no-documents">
          <p>No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="document-list">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="document-card"
              onClick={() => handleDocumentClick(doc)}
            >
              <button
                onClick={(e) => handleDelete(doc.id, e)}
                className="delete-btn"
                title="Delete"
              >
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="card-content">
                <h4 className="card-title">{sanitizeTitle(doc.title)}</h4>
                <div className="card-meta">
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>{formatDate(doc.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

DocumentManager.propTypes = {
  onDocumentSelect: PropTypes.func
}

export default DocumentManager