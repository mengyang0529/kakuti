import { useRef, useState } from 'react'
import PropTypes from 'prop-types'
import documentService from '../services/documentService'
import './FileUpload.css'

const FileUpload = ({ onFileSelect, onUploadComplete, workspaceId = null }) => {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (event) => {
    const file = event.target.files[0]
    if (file) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        await uploadFile(file)
        // Allow selecting the same file again by resetting input value
        event.target.value = ''
      } else {
        alert('Please select a valid PDF file')
        // Reset invalid selection so the same file can be chosen again after correction
        event.target.value = ''
      }
    }
  }

  const uploadFile = async (file) => {
    try {
      setUploading(true)
      const result = await documentService.uploadDocument(file, workspaceId)
      
      // Check if this is a duplicate file (existing document)
      if (result.message && result.message.includes('already exists')) {
        // For duplicate files, use the download URL from the database
        const downloadUrl = documentService.getDownloadUrl(result.doc_id)
        onFileSelect(downloadUrl)
      } else {
        // For new files, create a file URL for react-pdf to read
        const fileUrl = URL.createObjectURL(file)
        onFileSelect(fileUrl)
      }
      
      // Notify parent component about successful upload (no UI message)
      if (onUploadComplete) onUploadComplete(result)
      
    } catch (error) {
      alert('Upload failed: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleClick = () => {
    // Ensure change event fires even if the same file is picked
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    fileInputRef.current.click()
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        await uploadFile(file)
        // Keep input clear to allow reselecting the same file later
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        alert('Please select a valid PDF file')
      }
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  return (
    <div className="file-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={uploading}
      />
      <button 
        className={`upload-btn ${uploading ? 'uploading' : ''}`}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        disabled={uploading}
        title={uploading ? 'Uploading…' : 'Upload PDF File'}
        aria-label={uploading ? 'Uploading…' : 'Upload PDF File'}
      >
        {uploading ? '⏳ Uploading...' : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 5 17 10" />
              <line x1="12" y1="5" x2="12" y2="16" />
            </svg>
            <span>Upload PDF File</span>
          </>
        )}
      </button>
      {/* No upload success/info status banner displayed */}
    </div>
  )
}

FileUpload.propTypes = {
  onFileSelect: PropTypes.func.isRequired,
  onUploadComplete: PropTypes.func,
  workspaceId: PropTypes.string
}

export default FileUpload
