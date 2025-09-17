import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import noteService from '../../services/noteService'
import './MarkdownEditor.css'

const ToolbarButton = ({ title, onClick, children, disabled }) => (
  <button className="md-btn" type="button" title={title} onClick={onClick} disabled={disabled}>
    {children}
  </button>
)

ToolbarButton.propTypes = {
  title: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  disabled: PropTypes.bool
}

ToolbarButton.defaultProps = {
  disabled: false
}

function MarkdownEditor({ externalContent, onContentChange, documentId }) {
  const [value, setValue] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [currentNoteId, setCurrentNoteId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const STORAGE_KEY = 'markdown-editor-content'

  // Function to save content to database
  const saveContentToDatabase = async (contentToSave, forceCreate = false) => {
    if (!documentId || isLoading) return
    
    try {
      console.log('MarkdownEditor: Saving content to database for documentId:', documentId, 'currentNoteId:', currentNoteId, 'content length:', contentToSave.length, 'forceCreate:', forceCreate)
      
      // For single note per document, we always update or create
      if (contentToSave.trim()) {
        // Create or update note
        console.log('MarkdownEditor: Creating or updating note')
        const note = await noteService.createNote(documentId, contentToSave)
        setCurrentNoteId(note.id)
        console.log('MarkdownEditor: Created/updated note:', note)
        // Clear localStorage fallback since we successfully saved to database
        localStorage.removeItem(STORAGE_KEY)
      } else {
        console.log('MarkdownEditor: Skipping save, no content to save')
      }
    } catch (error) {
      console.error('Failed to save note to database:', error)
      // Fallback to localStorage
      console.log('MarkdownEditor: Falling back to localStorage')
      localStorage.setItem(STORAGE_KEY, contentToSave)
    }
  }

  // Load notes when documentId changes
  useEffect(() => {
    console.log('MarkdownEditor: documentId changed to:', documentId)
    if (documentId) {
      loadNotes()
    } else {
      // Fallback to localStorage if no documentId
      console.log('MarkdownEditor: No documentId, loading from localStorage')
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        console.log('MarkdownEditor: Loaded content from localStorage, length:', saved.length)
        setValue(saved)
      } else {
        console.log('MarkdownEditor: No content in localStorage')
      }
    }
  }, [documentId])

  const loadNotes = async () => {
    if (!documentId) return
    
    console.log('MarkdownEditor: Loading note for documentId:', documentId)
    setIsLoading(true)
    try {
      const notes = await noteService.getNotes(documentId)
      console.log('MarkdownEditor: Loaded note:', notes)
      if (notes && notes.length > 0) {
        // Load the note
        const note = notes[0]
        setValue(note.content)
        setCurrentNoteId(note.id)
        console.log('MarkdownEditor: Set note content and ID:', note.id)
        // Clear localStorage fallback since we successfully loaded from database
        localStorage.removeItem(STORAGE_KEY)
      } else {
        // No note exists, start with empty content
        setValue('')
        setCurrentNoteId(null)
        console.log('MarkdownEditor: No note found, starting with empty content')
        // Check if there's content in localStorage that we should import
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          console.log('MarkdownEditor: Found content in localStorage, importing it')
          setValue(saved)
          // Don't clear localStorage yet, let the auto-save handle that
        }
      }
    } catch (error) {
      console.error('Failed to load note:', error)
      // Fallback to localStorage
      console.log('MarkdownEditor: Falling back to localStorage due to error')
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        console.log('MarkdownEditor: Loaded content from localStorage after error, length:', saved.length)
        setValue(saved)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Handle external content updates
  useEffect(() => {
    if (externalContent) {
      console.log('MarkdownEditor: Received external content:', externalContent.substring(0, 100) + '...')
      setValue(externalContent)
      setIsPreview(true) // Show preview when external content is loaded
      setPreviewHtml(renderMarkdownV2(externalContent))
    }
  }, [externalContent])

  // Save external content when documentId becomes available
  useEffect(() => {
    console.log('MarkdownEditor: Checking if should save external content:', { 
      hasExternalContent: !!externalContent, 
      documentId, 
      isLoading,
      currentNoteId
    })
    if (externalContent && documentId && !isLoading) {
      console.log('MarkdownEditor: Saving external content to database')
      // Save external content immediately
      setTimeout(() => {
        // For external content, always create a new note
        saveContentToDatabase(externalContent, true)
      }, 100)
    }
  }, [externalContent, documentId, isLoading])

  // Auto-save notes with debouncing (for user edits)
  useEffect(() => {
    console.log('MarkdownEditor: Auto-save useEffect triggered', { 
      valueLength: value.length, 
      externalContentLength: externalContent?.length,
      documentId,
      isLoading
    })
    
    if (!documentId || isLoading) {
      console.log('MarkdownEditor: Skipping auto-save, no documentId or still loading')
      return
    }
    
    // Don't auto-save if content is the same as external content
    if (value === externalContent) {
      console.log('MarkdownEditor: Skipping auto-save, content matches externalContent')
      return
    }
    
    console.log('MarkdownEditor: Setting up auto-save timeout')
    const id = setTimeout(async () => {
      console.log('MarkdownEditor: Auto-save timeout triggered, saving content')
      try {
        await saveContentToDatabase(value, false)
        console.log('MarkdownEditor: Auto-save completed successfully')
      } catch (error) {
        console.error('MarkdownEditor: Auto-save failed:', error)
      }
      
      // Always notify parent of content changes
      if (onContentChange) {
        console.log('MarkdownEditor: Notifying parent of content change')
        onContentChange(value)
      }
    }, 1000) // Increased debounce time for API calls
    
    return () => {
      console.log('MarkdownEditor: Clearing auto-save timeout')
      clearTimeout(id)
    }
  }, [value, documentId, isLoading, externalContent])

  // Toolbar helpers for textarea markdown editing
  const applyWrap = (left = '', right = left, placeholder = '') => {
    // Simple insertion at end if selection API is not used here
    setValue(v => `${v}${left}${placeholder}${right}`)
  }

  const applyLinePrefix = (prefix = '') => {
    setValue(v => v ? `${prefix} ${v}` : `${prefix} `)
  }

  const insertHeading = (level = 1) => applyLinePrefix('#'.repeat(level))
  const insertBold = () => applyWrap('**')
  const insertItalic = () => applyWrap('*')
  const insertStrike = () => applyWrap('~~')
  const insertBulletList = () => applyLinePrefix('-')
  const insertOrderedList = () => applyLinePrefix('1.')
  const insertQuote = () => applyLinePrefix('>')
  const insertCodeBlock = () => applyWrap('\n```\n', '\n```\n', 'code')
  const insertInlineCode = () => applyWrap('`', '`', 'code')
  const insertLink = () => {
    const url = prompt('Link URL:')
    if (!url) return
    applyWrap('[', `](${url})`, 'text')
  }
  const insertTable = () => {
    applyWrap('\n| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n', '', '')
  }
  const insertHr = () => {
    applyWrap('\n---\n', '', '')
  }

  const escapeHtml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Renderer that handles headings/lists per line
  const renderMarkdownV2 = (src) => {
    if (!src) return ''
    let text = escapeHtml(src)

    const codeBlocks = []
    text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
      const idx = codeBlocks.length
      codeBlocks.push(`<pre class=\"md-code-block\"><code>${code}</code></pre>`)
      return `§§CODEBLOCK_${idx}§§`
    })

    const blocks = text.split(/\n\s*\n/)
    const htmlBlocks = blocks.map(block => {
      const lines = block.split(/\n/)
      const out = []
      const flushList = (buffer, ordered = false) => {
        if (!buffer.length) return
        const items = buffer.map(li => `<li>${li}</li>`).join('')
        out.push(ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`)
        buffer.length = 0
      }
      let ulBuf = []
      let olBuf = []
      const inline = (s) => s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>')

      for (const line of lines) {
        if (/^---+$/.test(line.trim())) { flushList(ulBuf); flushList(olBuf, true); out.push('<hr />'); continue }
        const hm = line.match(/^(#{1,6})\s+(.+)$/)
        if (hm) { flushList(ulBuf); flushList(olBuf, true); out.push(`<h${hm[1].length}>${hm[2]}</h${hm[1].length}>`); continue }
        if (/^>\s?/.test(line)) { flushList(ulBuf); flushList(olBuf, true); out.push(`<blockquote>${line.replace(/^>\s?/, '')}</blockquote>`); continue }
        const ulm = line.match(/^\s*[-*]\s+(.+)/)
        if (ulm) { ulBuf.push(inline(ulm[1].trim())); continue } else if (ulBuf.length) { flushList(ulBuf) }
        const olm = line.match(/^\s*\d+\.\s+(.+)/)
        if (olm) { olBuf.push(inline(olm[1].trim())); continue } else if (olBuf.length) { flushList(olBuf, true) }
        if (!line.trim()) continue
        out.push(`<p>${inline(line)}</p>`)
      }
      flushList(ulBuf); flushList(olBuf, true)
      return out.join('')
    })

    let html = htmlBlocks.join('\n')
    html = html.replace(/§§CODEBLOCK_(\d+)§§/g, (_, i) => codeBlocks[Number(i)] || '')
    return html
  }

  // Preview toggle: compute preview HTML only on click
  const togglePreview = () => {
    if (!isPreview) {
      setPreviewHtml(renderMarkdownV2(value))
      setIsPreview(true)
    } else {
      setIsPreview(false)
    }
  }

  return (
    <div className="md-editor" role="region" aria-label="Markdown editor">
      <div className="md-toolbar">
        <div className="md-group">
          <ToolbarButton title="Heading 1" onClick={() => insertHeading(1)}>H1</ToolbarButton>
          <ToolbarButton title="Heading 2" onClick={() => insertHeading(2)}>H2</ToolbarButton>
          <ToolbarButton title="Heading 3" onClick={() => insertHeading(3)}>H3</ToolbarButton>
        </div>
        <div className="md-divider" />
        <div className="md-group">
          <ToolbarButton title="Bold" onClick={insertBold}><b>B</b></ToolbarButton>
          <ToolbarButton title="Italic" onClick={insertItalic}><i>I</i></ToolbarButton>
          <ToolbarButton title="Strike" onClick={insertStrike}><s>S</s></ToolbarButton>
          <ToolbarButton title="Inline code" onClick={insertInlineCode}>{'<>'}</ToolbarButton>
        </div>
        <div className="md-divider" />
        <div className="md-group">
          <ToolbarButton title="Bullet list" onClick={insertBulletList}>• List</ToolbarButton>
          <ToolbarButton title="Ordered list" onClick={insertOrderedList}>1. List</ToolbarButton>
        </div>
        <div className="md-divider" />
        <div className="md-group">
          <ToolbarButton title="Quote" onClick={insertQuote}>“”</ToolbarButton>
          <ToolbarButton title="Link" onClick={insertLink}>Link</ToolbarButton>
          <ToolbarButton title="Table" onClick={insertTable}>Tbl</ToolbarButton>
          <ToolbarButton title="Code block" onClick={insertCodeBlock}>Code</ToolbarButton>
          <ToolbarButton title="Horizontal rule" onClick={insertHr}>—</ToolbarButton>
        </div>
        <div className="md-divider" />
        <div className="md-group">
          <ToolbarButton title={isPreview ? 'Back to edit' : 'Preview'} onClick={togglePreview}>
            {/* Use eye icon instead of Preview/Edit text */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isPreview ? (
                // Edit icon (pencil)
                <>
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  <path d="m15 5 4 4"/>
                </>
              ) : (
                // Eye icon
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </>
              )}
            </svg>
          </ToolbarButton>
        </div>
      </div>
      <div className="md-content">
        {isPreview ? (
          <div className="md-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : (
          <textarea
            className="md-textarea"
            value={value}
            onChange={(e) => {
              console.log('MarkdownEditor: Textarea value changed, new length:', e.target.value.length)
              setValue(e.target.value)
            }}
            spellCheck={true}
            placeholder="Write markdown here..."
          />
        )}
      </div>
    </div>
  )
}

MarkdownEditor.propTypes = {
  externalContent: PropTypes.string,
  onContentChange: PropTypes.func,
  documentId: PropTypes.string
}

MarkdownEditor.defaultProps = {
  externalContent: null,
  onContentChange: null,
  documentId: null
}

export default MarkdownEditor
