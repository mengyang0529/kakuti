import { useEffect, useState } from 'react'
import PDFViewer from './components/PDFViewer/PDFViewer'
import MarkdownEditor from './components/MarkdownEditor/MarkdownEditor'
import FileUpload from './components/FileUpload'
import DocumentPreviewCard from './components/DocumentPreviewCard'
import BottomInputBar from './components/BottomInputBar'
import NotePreviewCard from './components/NotePreviewCard'
import RAGResponse from './components/RAGResponse'
import Resizer from './components/Resizer'
import documentService from './services/documentService'
import ragService from './services/ragService'
import './App.css'
import { API_KEY, apiV1 } from './services/apiConfig'

// Add note service function to save note to file
const saveNoteToFile = async (documentId, content) => {
  if (!documentId || !content) return;
  
  const base = apiV1(`/documents/${documentId}/save-note-to-file`)

  try {
    const response = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({ content }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Note saved to file:', result);
  } catch (error) {
    console.error('Failed to save note to file:', error);
  }
};

// Collapse repeated underscores, hyphens, and spaces for display labels
const sanitizeLabel = (s) => {
  if (!s) return ''
  return String(s)
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [currentDocumentId, setCurrentDocumentId] = useState(null)
  const [leftWidth, setLeftWidth] = useState(0)
  const [rightWidth, setRightWidth] = useState(0)
  const [refreshDocuments, setRefreshDocuments] = useState(0)
  const [markdownContent, setMarkdownContent] = useState('')
  const [ragResponse, setRagResponse] = useState(null)
  const [ragLoading, setRagLoading] = useState(false)
  const [ragProgress, setRagProgress] = useState('')
  const [isWorkspace, setIsWorkspace] = useState(false)
  const [workspaceCreatedAt, setWorkspaceCreatedAt] = useState(null)
  const [showViewer, setShowViewer] = useState(false)
  const [workspaceDocs, setWorkspaceDocs] = useState([])
  const [workspaceId, setWorkspaceId] = useState(null)
  const [workspaceName, setWorkspaceName] = useState('Workspace')
  const [workspaces, setWorkspaces] = useState([])
  const [wsMenuOpenId, setWsMenuOpenId] = useState(null)
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const [isEditingWsName, setIsEditingWsName] = useState(false)
  const [wsNameDraft, setWsNameDraft] = useState('')
  const [showActionResponse, setShowActionResponse] = useState(false)

  // Show ActionResponse demo when enabled
  useEffect(() => {
    if (showActionResponse) {
      const timer = setTimeout(() => {
        setShowActionResponse(false)
      }, 30000) // Auto-close after 30 seconds
      return () => clearTimeout(timer)
    }
  }, [showActionResponse])

  // Close PDF overlay on ESC
  useEffect(() => {
    if (!showViewer) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowViewer(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showViewer])

  // Initialize panel widths on mount and window resize
  useEffect(() => {
    const updatePanelWidths = () => {
      const totalWidth = window.innerWidth - 4 - 12 // Account for app-main padding (2px * 2) and resizer width (12px)
      
      // Place resizer in the middle of the screen
      const defaultLeftWidth = Math.max(200, totalWidth / 2)
      const defaultRightWidth = Math.max(200, totalWidth - defaultLeftWidth)
      
      setLeftWidth(defaultLeftWidth)
      setRightWidth(defaultRightWidth)
    }

    updatePanelWidths()
    window.addEventListener('resize', updatePanelWidths)
    
    return () => window.removeEventListener('resize', updatePanelWidths)
  }, [])

  // Trigger initial scale calculation when pdfFile changes
  useEffect(() => {
    if (pdfFile && ((isWorkspace && showViewer) || (!isWorkspace && leftWidth > 0))) {
      // Delay to ensure PDFViewer is fully loaded and listening
      const timer = setTimeout(() => {
        // Force default zoom to 120%
        const clampedScale = 1.2
        
        // Console debug info
        console.log('=== Layout Debug Info ===')
        console.log('Window Width:', window.innerWidth)
        console.log('Resizer Position (Left Panel Width):', leftWidth)
        console.log('PDFViewer Width:', isWorkspace ? 'workspace auto' : leftWidth)
        console.log('MarkdownEditor Width:', rightWidth)
        console.log('Calculated Scale:', clampedScale)
        console.log('=========================')
        
        // Dispatch initial scale event
        window.dispatchEvent(new CustomEvent('pdf:setScale', {
          detail: clampedScale
        }))
      }, 100) // Small delay to ensure PDFViewer is ready
      
      return () => clearTimeout(timer)
    }
  }, [pdfFile, leftWidth, isWorkspace, showViewer])

  // Load workspace documents when entering workspace
  useEffect(() => {
    let cancelled = false
    async function loadWorkspaceDocs() {
      if (!isWorkspace || !workspaceId) return
      try {
    const res = await documentService.getWorkspaceDocuments(workspaceId)
    if (cancelled) return
    const items = Array.isArray(res.documents) ? res.documents : []
    setWorkspaceDocs(items.map(d => ({
      id: d.id,
      mime: d.mime,
      title: d.title,
      color: d.color || null,
      created_at: d.created_at,
      url: d.mime && d.mime.startsWith('application/pdf') ? documentService.getDownloadUrl(d.id) : null
    })))
      } catch (e) {
        // Silent failure; keep current state
        console.warn('Failed to load workspace documents', e)
      }
    }
    loadWorkspaceDocs()
    return () => { cancelled = true }
  }, [isWorkspace, workspaceId])

  // Load workspace list on home view
  useEffect(() => {
    let cancelled = false
    async function loadWorkspaces() {
      if (isWorkspace) return
      try {
        const res = await documentService.listWorkspaces()
        if (cancelled) return
        const items = Array.isArray(res.workspaces) ? res.workspaces : []
        setWorkspaces(items)
      } catch (e) {
        console.warn('Failed to load workspaces', e)
      }
    }
    loadWorkspaces()
    return () => { cancelled = true }
  }, [isWorkspace])

  // Close workspace menu when clicking outside the menu/button
  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!wsMenuOpenId) return
      const target = e.target
      const inMenu = target.closest && target.closest('.ws-menu-popup')
      const inButton = target.closest && target.closest('.ws-menu-btn')
      if (!inMenu && !inButton) {
        setWsMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [wsMenuOpenId])

  const handleFileSelect = (file) => {
    // Save current note before switching documents
    if (currentDocumentId && markdownContent) {
      saveNoteToFile(currentDocumentId, markdownContent);
    }
    
    // Revoke previous object URL to avoid memory leaks
    if (pdfFile) {
      URL.revokeObjectURL(pdfFile)
    }
    
    // Reset markdown content when switching documents
    setMarkdownContent('')
    
    // In Workspace: don't auto-open viewer; previews are managed via onUploadComplete
    if (!isWorkspace) {
      setPdfFile(file)
      setShowViewer(false)
    }
  }

  const handleUploadComplete = async (result) => {
    // Set the current document ID for both new and existing documents
    if (result.doc_id) {
      setCurrentDocumentId(result.doc_id)
    }
    // Trigger document list refresh
    setRefreshDocuments(prev => prev + 1)

    // In Workspace, add a preview card for the uploaded doc
    if (isWorkspace && result.doc_id) {
      const url = documentService.getDownloadUrl(result.doc_id)
      setWorkspaceDocs(prev => {
        // de-duplicate by id
        const exists = prev.some(d => d.id === result.doc_id)
        if (exists) return prev
        const safeTitle = sanitizeLabel(result.filename || 'PDF')
        // Insert newest first with a provisional created_at (now)
        const newItem = { id: result.doc_id, mime: 'application/pdf', title: safeTitle, url, created_at: new Date().toISOString() }
        return [newItem, ...prev]
      })
    }

    // Auto-index document for RAG queries to save time during Q&A
    if (result.doc_id) {
      try {
        console.log(`Starting auto-indexing for document ${result.doc_id}...`)
        await ragService.indexDocument(result.doc_id)
        console.log(`Document ${result.doc_id} indexed successfully`)
      } catch (error) {
        // Don't show error to user as this is background processing
        // The system will still work with lazy indexing during queries
        console.warn(`Auto-indexing failed for document ${result.doc_id}:`, error.message)
      }
    }
  }

  const handleDocumentSelect = (fileUrl, documentId) => {
    console.log('handleDocumentSelect called with:', { fileUrl, documentId })
    
    // Save current note before switching documents
    if (currentDocumentId && markdownContent) {
      saveNoteToFile(currentDocumentId, markdownContent);
    }
    
    // Clear previous document state before loading new one
    if (pdfFile && pdfFile !== fileUrl) {
      URL.revokeObjectURL(pdfFile)
      setMarkdownContent('')
    }
    
    handleFileSelect(fileUrl)
    setCurrentDocumentId(documentId)
  }

  const handleResize = (newLeftWidth, newRightWidth) => {
    setLeftWidth(newLeftWidth)
    setRightWidth(newRightWidth)
  }

  const handleResizeComplete = (finalLeftWidth, finalRightWidth) => {
    // Auto-adjust PDF zoom based on final width after resize is complete
    if (pdfFile) {
      // Calculate scale to maintain 6px margin from resizer
      const pdfAvailableWidth = finalLeftWidth - 6 // 6px margin from resizer
      const standardPdfWidth = 595 // Standard A4 PDF width in points
      const newScale = pdfAvailableWidth / standardPdfWidth
      const clampedScale = Math.max(0.5, Math.min(2.0, newScale))
      
      // Console debug info for resize
      console.log('=== Resize Debug Info ===')
      console.log('Window Width:', window.innerWidth)
      console.log('New Resizer Position (Left Panel Width):', finalLeftWidth)
      console.log('New PDFViewer Width:', finalLeftWidth)
      console.log('New MarkdownEditor Width:', finalRightWidth)
      console.log('PDF Available Width (minus 6px margin):', pdfAvailableWidth)
      console.log('New Calculated Scale:', clampedScale)
      console.log('=========================')
      
      // Dispatch custom event to notify PDF viewer of scale change
      window.dispatchEvent(new CustomEvent('pdf:setScale', {
        detail: clampedScale
      }))
    }
  }

  // Cleanup URL on unmount and save note
  useEffect(() => {
    return () => {
      // Save note before cleanup
      if (currentDocumentId && markdownContent) {
        saveNoteToFile(currentDocumentId, markdownContent);
      }
      
      if (pdfFile) URL.revokeObjectURL(pdfFile)
    }
  }, [pdfFile, currentDocumentId, markdownContent])

  // Determine if there are any markdown notes in current workspace
  const hasNotes = workspaceDocs.some(d => d.mime && d.mime.startsWith('text/'))

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => {
          if (isWorkspace && showNoteEditor && workspaceId) {
            // In note editor: clicking workspace name returns to workspace home (preview grid)
            setShowNoteEditor(false)
          } else if (isWorkspace && showViewer) {
            // In PDF viewer: clicking Kakuti returns to workspace home (preview grid)
            setShowViewer(false)
          } else {
            // Otherwise: go to app home (list of workspaces)
            setIsWorkspace(false)
            setShowViewer(false)
          }
        }}>
          {(isWorkspace && showNoteEditor && workspaceId) ? (workspaceName || 'Workspace') : (
            <svg width="200" height="50" viewBox="0 0 1000 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kakuti logo - aligned icon and cards">
              <defs>
                <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f3f4f6"/>
                  <stop offset="100%" stopColor="#ffffff"/>
                </linearGradient>
                <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.12)"/>
                </filter>
              </defs>
              <style>
                {`.teal { fill:#0F766E; }
                .hexStroke { fill:none; stroke:#0F766E; stroke-width:7; stroke-linejoin:round; }
                .cardFill { fill:url(#cardGrad); }
                .glyph { fill:#0F766E; font:700 100px "Inter","Poppins","Helvetica Neue",Arial,sans-serif; }`}
              </style>
              <g transform="translate(70,64)">
                <path className="hexStroke" d="M40,0 L80,23 L80,69 L40,92 L0,69 L0,23 Z"/>
                <circle className="teal" cx="40" cy="46" r="8"/>
              </g>
              <g transform="translate(180,45)">
                <g transform="translate(0,0)">
                  <rect x="0" y="0" rx="12" ry="12" width="100" height="130" className="cardFill" filter="url(#softShadow)"/>
                  <text className="glyph" x="50" y="95" textAnchor="middle">K</text>
                </g>
                <g transform="translate(124,0)">
                  <rect x="0" y="0" rx="12" ry="12" width="100" height="130" className="cardFill" filter="url(#softShadow)"/>
                  <text className="glyph" x="50" y="95" textAnchor="middle">A</text>
                </g>
                <g transform="translate(248,0)">
                  <rect x="0" y="0" rx="12" ry="12" width="100" height="130" className="cardFill" filter="url(#softShadow)"/>
                  <text className="glyph" x="50" y="95" textAnchor="middle">K</text>
                </g>
                <g transform="translate(372,0)">
                  <rect x="0" y="0" rx="12" ry="12" width="100" height="130" className="cardFill" filter="url(#softShadow)"/>
                  <text className="glyph" x="50" y="95" textAnchor="middle">U</text>
                </g>
                <g transform="translate(496,0)">
                  <rect x="0" y="0" rx="12" ry="12" width="100" height="130" className="cardFill" filter="url(#softShadow)"/>
                  <text className="glyph" x="50" y="95" textAnchor="middle">T</text>
                </g>
                <g transform="translate(620,0)">
                  <rect x="0" y="0" rx="12" ry="12" width="100" height="130" className="cardFill" filter="url(#softShadow)"/>
                  <text className="glyph" x="50" y="95" textAnchor="middle">I</text>
                </g>
              </g>
            </svg>
          )}
        </h1>
        <div className="header-center">
          {isWorkspace && workspaceId ? (
            isEditingWsName ? (
              <input
                className="ws-name-input"
                value={wsNameDraft}
                onChange={(e) => setWsNameDraft(e.target.value)}
                autoFocus
                onBlur={async () => {
                  const name = wsNameDraft.trim()
                  setIsEditingWsName(false)
                  if (!name || name === workspaceName) return
                  try {
                    await documentService.updateWorkspaceName(workspaceId, name)
                    setWorkspaceName(name)
                    setWorkspaces(prev => prev.map(w => w.id === workspaceId ? { ...w, name } : w))
                  } catch (e) {
                    alert('Rename failed: ' + e.message)
                  }
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setIsEditingWsName(false)
                  }
                }}
              />
            ) : (
              <span
                className="ws-name-display"
                title="Click to rename workspace"
                onClick={() => { setIsEditingWsName(true); setWsNameDraft(workspaceName || 'Workspace') }}
              >
                {workspaceName || 'Workspace'}
              </span>
            )
          ) : (
            <span className="slogan">Focus to Know</span>
          )}
        </div>
        <div className="header-controls">
          {isWorkspace && !showNoteEditor && (
            <FileUpload 
              onFileSelect={handleFileSelect} 
              onUploadComplete={handleUploadComplete}
              workspaceId={workspaceId}
            />
          )}
        </div>
      </header>
      
      <main className="app-main workspace">
        {isWorkspace ? (
          <div className="workspace-container" style={{ height: '100%', width: '100%' }}>
            <section className="pane pane-left" style={{ width: '100%', minWidth: '200px', position: 'relative', height: '100%' }}>
              {showNoteEditor && currentDocumentId ? (
                <MarkdownEditor 
                  externalContent={markdownContent}
                  onContentChange={setMarkdownContent}
                  documentId={currentDocumentId}
                />
              ) : (
                <div className="workspace-content">
                   <div className="preview-columns" style={{ gridTemplateColumns: hasNotes ? '220px 1fr' : '1fr' }}>
                      {hasNotes && (
                      <div className="notes-column">
                        {workspaceDocs
                          .filter(d => d.mime && d.mime.startsWith('text/'))
                          .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
                          .map(doc => (
                          <NotePreviewCard
                            key={doc.id}
                            title={sanitizeLabel(doc.title || 'Note')}
                            noteId={doc.id}
                            color={doc.color}
                            onOpen={async () => {
                              try {
                                const detail = await documentService.getDocument(doc.id)
                                setCurrentDocumentId(doc.id)
                                setMarkdownContent(detail?.body || '')
                                setShowViewer(false)
                                setShowNoteEditor(true)
                              } catch (e) {
                                alert('Failed to open note: ' + e.message)
                              }
                            }}
                            onDelete={async () => {
                              if (!confirm('Are you sure you want to delete this note?')) return
                              try {
                                await documentService.deleteDocument(doc.id)
                                setWorkspaceDocs(prev => prev.filter(d => d.id !== doc.id))
                                if (currentDocumentId === doc.id) {
                                  setCurrentDocumentId(null)
                                  setMarkdownContent('')
                                  setShowNoteEditor(false)
                                }
                              } catch (err) {
                                alert('Failed to delete note: ' + err.message)
                              }
                            }}
                            onRename={async () => {
                              const name = prompt('New note name', sanitizeLabel(doc.title || 'Note'))
                              if (!name || !name.trim()) return
                              try {
                                await documentService.updateDocument(doc.id, { title: name.trim() })
                                setWorkspaceDocs(prev => prev.map(d => d.id === doc.id ? { ...d, title: name.trim() } : d))
                              } catch (e) {
                                alert('Rename failed: ' + e.message)
                              }
                          }}
                          />
                        ))}
                      </div>
                      )}
                      <div className="pdfs-grid">
                        {workspaceDocs
                          .filter(d => d.mime && d.mime.startsWith('application/pdf'))
                          .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
                          .map(doc => (
                          <DocumentPreviewCard
                            key={doc.id}
                            file={doc.url}
                            title={sanitizeLabel(doc.title || 'PDF')}
                            onOpen={() => { setPdfFile(doc.url); setCurrentDocumentId(doc.id); setShowViewer(true); setShowNoteEditor(false) }}
                            onDelete={async () => {
                              if (!confirm('Are you sure you want to delete this document?')) return
                              try {
                                await documentService.deleteDocument(doc.id)
                                setWorkspaceDocs(prev => prev.filter(d => d.id !== doc.id))
                                if (pdfFile === doc.url) {
                                  setPdfFile(null)
                                  setCurrentDocumentId(null)
                                  setShowViewer(false)
                                  setShowNoteEditor(false)
                                }
                              } catch (err) {
                                alert('Failed to delete document: ' + err.message)
                              }
                            }}
                          />
                        ))}
                      </div>
                    </div>
                   {showViewer && pdfFile && (
                     <div className="pdf-overlay">
                       <div className="pdf-overlay-backdrop" onClick={() => {
                         setShowViewer(false)
                         setPdfFile(null)
                         setCurrentDocumentId(null)
                       }}></div>
                       <div className="pdf-overlay-container">
                         <PDFViewer 
                           file={pdfFile} 
                           documentId={currentDocumentId}
                           onMarkdownUpdate={setMarkdownContent}
                         />
                       </div>
                     </div>
                   )}
                 </div>
              )}
            </section>
            {showNoteEditor && (
              <BottomInputBar
                placeholder={'Ask a question about this document…'}
                documents={workspaceDocs}
                onSend={async (msg) => {
                  // Check if message contains document references for RAG
                  const docMentionRegex = /\[\[doc:([^\]|]+)\|([^\]]+)\]\]/g
                  const mentions = [...msg.matchAll(docMentionRegex)]
                  
                  if (mentions.length > 0 && currentDocumentId) {
                    // Use RAG for document-specific queries
                    try {
                      setRagLoading(true)
                       setRagProgress('Starting RAG query...')
                       
                       const cleanQuery = msg.replace(docMentionRegex, '').trim() // Remove mentions from query
                       
                       // Check if there's an actual question after removing document mentions
                       if (!cleanQuery) {
                         setRagLoading(false)
                         setRagProgress('')
                         alert('Please enter a question after selecting the document.')
                         return
                       }
                       
                       const response = await ragService.ensureIndexAndQuery(
                         cleanQuery,
                         currentDocumentId,
                         (progress) => {
                           setRagProgress(progress)
                         }
                       )
                       
                       // Display RAG response with clean query (without document mentions)
                       setRagResponse({...response, query: cleanQuery})
                       setRagLoading(false)
                       setRagProgress('')
                      
                    } catch (error) {
                       console.error('RAG Error:', error)
                       setRagLoading(false)
                       setRagProgress('')
                       alert(`RAG query failed: ${error.message}`)
                     }
                  } else {
                    // Fallback to existing sim service (keep RAG response visible)
                    console.log('Using sim service for non-RAG query:', msg)
                    const sim = (await import('./services/simService.js')).default
                    await sim.sendMessage({
                      source: 'note',
                      message: msg,
                      workspaceId,
                      documentId: currentDocumentId
                    })
                  }
                }}
              />
            )}
            {!showViewer && !showNoteEditor && (
              <BottomInputBar
                // placeholder={'Ask questions about your documents…'}
                documents={workspaceDocs}
                onSend={async (msg) => {
                  // Check if message contains document references for RAG
                  const docMentionRegex = /\[\[doc:([^\]|]+)\|([^\]]+)\]\]/g
                  const mentions = [...msg.matchAll(docMentionRegex)]
                  
                  if (mentions.length > 0) {
                    // Use RAG for document-specific queries
                    const documentId = mentions[0][1] // Use first mentioned document
                    try {
                      setRagLoading(true)
                       setRagProgress('Starting RAG query...')
                       
                       const cleanQuery = msg.replace(docMentionRegex, '').trim() // Remove mentions from query
                       
                       // Check if there's an actual question after removing document mentions
                       if (!cleanQuery) {
                         setRagLoading(false)
                         setRagProgress('')
                         alert('Please enter a question after selecting the document.')
                         return
                       }
                       
                       const response = await ragService.ensureIndexAndQuery(
                         cleanQuery,
                         documentId,
                         (progress) => {
                           setRagProgress(progress)
                         }
                       )
                       
                       // Display RAG response with clean query (without document mentions)
                       setRagResponse({...response, query: cleanQuery})
                       setRagLoading(false)
                       setRagProgress('')
                      
                    } catch (error) {
                       console.error('RAG Error:', error)
                       setRagLoading(false)
                       setRagProgress('')
                       alert(`RAG query failed: ${error.message}`)
                     }
                  } else {
                    // Use workspace RAG query when no specific document is mentioned
                    try {
                      setRagLoading(true)
                      setRagProgress('Starting workspace RAG query...')
                      
                      const response = await ragService.queryWorkspace(msg)
                      
                      // Display RAG response
                      setRagResponse({...response, query: msg})
                      setRagLoading(false)
                      setRagProgress('')
                      
                    } catch (error) {
                      console.error('Workspace RAG Error:', error)
                      setRagLoading(false)
                      setRagProgress('')
                      
                      // Fallback to existing sim service if workspace RAG fails (keep RAG response visible)
                       console.log('Falling back to sim service for query:', msg)
                       const sim = (await import('./services/simService.js')).default
                       await sim.sendMessage({
                         source: 'workspace',
                         message: msg,
                         workspaceId,
                       })
                     }
                   }
                }}
              />
            )}
          </div>
        ) : (
          <div className="welcome-screen" style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="welcome-content" style={{ width: '100%', flex: '1 1 auto', minHeight: 0 }}>
              <div className="workspace-grid">
                {/* Create Workspace card at top-left */}
                <div
                  className="workspace-card create-workspace-card"
                  role="button"
                  tabIndex={0}
                  onClick={async () => {
                    try {
                      const res = await documentService.createWorkspace()
                      setWorkspaceId(res.workspace_id)
                      setWorkspaceName(res.name || 'WorkSpace')
                      setIsWorkspace(true)
                      setPdfFile(null)
                      setCurrentDocumentId(null)
                      setShowViewer(false)
                      setWorkspaceCreatedAt(prev => prev || new Date().toISOString())
                    } catch (e) {
                      alert('Failed to create workspace: ' + e.message)
                    }
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      try {
                        const res = await documentService.createWorkspace()
                        setWorkspaceId(res.workspace_id)
                        setWorkspaceName(res.name || 'WorkSpace')
                        setIsWorkspace(true)
                        setPdfFile(null)
                        setCurrentDocumentId(null)
                        setShowViewer(false)
                        setWorkspaceCreatedAt(prev => prev || new Date().toISOString())
                      } catch (err) {
                        alert('Failed to create workspace: ' + err.message)
                      }
                    }
                  }}
                  title="Create Workspace"
                >
                  <div className="create-workspace-plus" aria-hidden>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" fill="none" />
                      <path d="M12 7v10M7 12h10" />
                    </svg>
                  </div>
                  <div className="create-workspace-label">Create WorkSpace</div>
                </div>
                {workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className="workspace-card"
                    role="button"
                    tabIndex={0}
                  onClick={() => {
                      setWorkspaceId(ws.id)
                      setWorkspaceName(ws.name || 'WorkSpace')
                      setIsWorkspace(true)
                      setPdfFile(null)
                      setCurrentDocumentId(null)
                      setShowViewer(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setWorkspaceId(ws.id)
                        setWorkspaceName(ws.name || 'WorkSpace')
                        setIsWorkspace(true)
                        setPdfFile(null)
                        setCurrentDocumentId(null)
                        setShowViewer(false)
                      }
                    }}
                  >
                    {/* Kebab menu button */}
                    <button
                      className="ws-menu-btn"
                      title="Workspace options"
                      onClick={(e) => { e.stopPropagation(); setWsMenuOpenId(id => id === ws.id ? null : ws.id) }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <g fill="currentColor">
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </g>
                      </svg>
                    </button>
                    {wsMenuOpenId === ws.id && (
                      <div className="ws-menu-popup" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="ws-menu-item"
                          onClick={async () => {
                            const name = prompt('New name for workspace', ws.name || 'Workspace')
                            if (name && name.trim()) {
                              try {
                                await documentService.updateWorkspaceName(ws.id, name.trim())
                                setWorkspaces(prev => prev.map(x => x.id === ws.id ? { ...x, name: name.trim() } : x))
                              } catch (e) {
                                alert('RENAME FAILED:' + e.message)
                              }
                            }
                            setWsMenuOpenId(null)
                          }}
                        >Rename</button>
                        <button
                          className="ws-menu-item"
                          onClick={async () => {
                            if (!confirm('Delete this workspace and all its documents?')) return
                            try {
                              await documentService.deleteWorkspace(ws.id)
                              setWorkspaces(prev => prev.filter(x => x.id !== ws.id))
                              // Refresh global document list to remove deleted workspace documents
                              setRefreshDocuments(prev => prev + 1)
                              if (workspaceId === ws.id) {
                                setIsWorkspace(false)
                                setWorkspaceId(null)
                                setWorkspaceDocs([])
                                setPdfFile(null)
                                setShowViewer(false)
                              }
                            } catch (e) {
                              alert('Delete failed: ' + e.message)
                            }
                            setWsMenuOpenId(null)
                          }}
                        >Delete</button>
                      </div>
                    )}
                    <span className="workspace-title">{ws.name || 'WorkSpace'}</span>
                    {ws.created_at && (
                      <span className="workspace-meta">{new Date(ws.created_at).toLocaleString()}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* Removed KAKUTI (home) bottom input per requirement; workspace only */}
          </div>
        )}
      </main>
      
      {/* RAG Response Modal */}
      {ragResponse && (
        <RAGResponse 
          response={ragResponse} 
          onClose={() => setRagResponse(null)} 
        />
      )}
      
      {/* RAG Loading Indicator */}
      {ragLoading && (
        <div className="rag-loading-overlay">
          <div className="rag-loading-modal">
            <div className="rag-loading-spinner"></div>
            <div className="rag-loading-text">{ragProgress}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
