import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import DraggableModal from './DraggableModal'
import './ActionInputDialog.css'

export default function ActionInputDialog({
  isOpen,
  initialPosition,
  selectedText,
  onClose,
  onCopy,
  onTranslate,
  onQuery,
  onSend,
}) {
  const [message, setMessage] = useState(selectedText || '')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef(null)

  // Autofocus and sync content when opened or selectedText changes
  useEffect(() => {
    if (!isOpen) return
    setMessage(selectedText || '')
    // Focus and move caret to end
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    })
  }, [isOpen, selectedText])

  if (!isOpen) return null

  return (
    <DraggableModal
      isOpen={isOpen}
      initialPosition={initialPosition}
      onClose={onClose}
      className="action-input-dialog"
      draggableHandle=".aid-header" /* header hidden; dragging disabled */
    >
      <div className="aid-header" aria-hidden="true"></div>

      <div className="aid-body">
        <div className="aid-input-wrap">
        <div
          ref={inputRef}
          className="aid-input"
          contentEditable
          role="textbox"
          aria-label="Message input"
          data-placeholder="Ask me anything..."
          suppressContentEditableWarning
          onInput={(e) => {
            setMessage(e.currentTarget.textContent || '')
          }}
          onKeyDown={(e) => {
            // Keep single line and support Enter to send
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.stopPropagation()
              if (!isSending && message.trim()) {
                setIsSending(true)
                Promise.resolve(onSend?.(message.trim(), selectedText))
                  .catch(() => {})
                  .finally(() => {
                    setIsSending(false)
                    setMessage('')
                    if (inputRef.current) inputRef.current.textContent = ''
                  })
              }
              return
            }
            if (e.key === 'Enter') {
              // Block multiline
              e.preventDefault()
              e.stopPropagation()
              return
            }
            e.stopPropagation()
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = (e.clipboardData.getData('text') || '').replace(/\s+/g, ' ')
            if (document.queryCommandSupported('insertText')) {
              document.execCommand('insertText', false, text)
            } else {
              // Fallback: append at end
              const el = inputRef.current
              if (el) {
                el.textContent = (el.textContent || '') + text
              }
            }
            setMessage(inputRef.current?.textContent || '')
          }}
          onMouseDown={(e) => { e.stopPropagation() }}
        />
        <button
          className="aid-send-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (!isSending && message.trim()) {
              setIsSending(true)
              Promise.resolve(onSend?.(message.trim(), selectedText))
                .catch(() => {})
                .finally(() => {
                  setIsSending(false)
                  setMessage('')
                  if (inputRef.current) {
                    inputRef.current.textContent = ''
                  }
                })
            }
          }}
          aria-label="Send"
          title="Send"
          disabled={isSending || !message.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false" style={{ display: 'block' }}>
            {/* tail line */}
            <path d="M22 2L11 13" fill="none" stroke="currentColor" strokeWidth="1.6" />
            {/* body triangle */}
            <path d="M22 2l-7 20-4-9-9-4 20-7z" fill="currentColor" />
          </svg>
        </button>
        </div>
        {/* selected hint removed per request */}
      </div>

      <div className="aid-footer">
        <button
          className="aid-icon-btn"
          onClick={onCopy}
          aria-label="Copy"
          title="Copy"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
          </svg>
        </button>
        <button
          className="aid-icon-btn"
          onClick={() => onTranslate && onTranslate(selectedText || message)}
          aria-label="Translate"
          title="翻译"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M2 12h20"></path>
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></path>
          </svg>
        </button>
        <button
          className="aid-icon-btn"
          onClick={onQuery}
          aria-label="Search"
          title="查询"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
      </div>
    </DraggableModal>
  )
}

ActionInputDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  initialPosition: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
  selectedText: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onCopy: PropTypes.func.isRequired,
  onTranslate: PropTypes.func.isRequired,
  onQuery: PropTypes.func.isRequired,
  onSend: PropTypes.func,
}

ActionInputDialog.defaultProps = {
  selectedText: '',
  initialPosition: { x: 120, y: 120 },
}
