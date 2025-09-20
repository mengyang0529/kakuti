import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import DraggableModal from './DraggableModal'
import './MagicActionDialog.css'

const MagicActionDialog = ({
  isOpen,
  selectedText,
  initialPosition,
  needsManualDrop,
  onTranslate,
  onExplain,
  onAnnotate,
  onClose,
  // 新增对话功能props
  onSendMessage,
  documentId,
  isMultiTurn = false
}) => {

  
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState('')
  
  // 对话功能状态
  const [conversationMode, setConversationMode] = useState(false) // 是否进入对话模式
  const [inputMessage, setInputMessage] = useState('')
  const [conversationHistory, setConversationHistory] = useState([])
  
  

  

  
  const handleTranslate = useCallback(async () => {
    if (!selectedText.trim()) return
    
    setIsLoading(true)
    setLoadingAction('translate')
    
    try {
      await onTranslate(selectedText, 'ja') // Default to Japanese
    } catch (error) {
      console.error('Translation failed:', error)
    } finally {
      setIsLoading(false)
      setLoadingAction('')
    }
  }, [selectedText, onTranslate])

  const handleExplain = useCallback(async () => {
    if (!selectedText.trim()) return
    
    // 进入对话模式
    setConversationMode(true)
    setInputMessage(`请解释这段文字：${selectedText}`)
    
    // 添加初始消息到对话历史
    setConversationHistory([
      {
        id: `user_${Date.now()}`,
        role: 'user',
        content: `请解释这段文字：${selectedText}`,
        timestamp: new Date().toISOString()
      }
    ])
  }, [selectedText])

  const handleAnnotate = useCallback(async () => {
    if (!selectedText.trim()) return
    
    // 进入对话模式
    setConversationMode(true)
    setInputMessage(`请为这段文字添加注释：${selectedText}`)
    
    // 添加初始消息到对话历史
    setConversationHistory([
      {
        id: `user_${Date.now()}`,
        role: 'user',
        content: `请为这段文字添加注释：${selectedText}`,
        timestamp: new Date().toISOString()
      }
    ])
  }, [selectedText])
  
  const handleManualDrop = useCallback(() => {
    // TODO: Implement manual drop functionality
    console.log('Manual drop requested')
  }, [])
  
  // 发送消息处理函数
  const handleSendMessage = useCallback(async (message) => {
    if (!message?.trim() || !onSendMessage) return
    
    const msg = message.trim()
    
    // 添加用户消息到历史
    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString()
    }
    
    // 添加AI思考中的消息
    const thinkingMessage = {
      id: `assistant_${Date.now() + 1}`,
      role: 'assistant',
      content: '思考中…',
      loading: true,
      timestamp: new Date().toISOString()
    }
    
    setConversationHistory(prev => [...prev, userMessage, thinkingMessage])
    
    try {
      // 调用父组件的发送消息函数
      const response = await onSendMessage(msg, selectedText)
      
      // 更新AI消息
      setConversationHistory(prev => {
        const newHistory = [...prev]
        const lastMessage = newHistory[newHistory.length - 1]
        if (lastMessage.loading) {
          newHistory[newHistory.length - 1] = {
            ...lastMessage,
            content: response?.answer || '（无回答）',
            loading: false,
          }
        }
        return newHistory
      })
      
    } catch (error) {
      const message = error?.message || '请求失败，请稍后重试'
      setConversationHistory(prev => {
        const newHistory = [...prev]
        const lastMessage = newHistory[newHistory.length - 1]
        if (lastMessage.loading) {
          newHistory[newHistory.length - 1] = {
            ...lastMessage,
            content: message,
            loading: false,
            error: true,
          }
        }
        return newHistory
      })
    }
  }, [onSendMessage, selectedText])
  
  if (!isOpen) return null
  
  const hasText = selectedText && selectedText.trim().length > 0
  const textLength = selectedText ? selectedText.length : 0
  const isTextTruncated = textLength > 500
  const displayText = isTextTruncated ? selectedText.substring(0, 500) + '...' : selectedText
  
  return (
    <DraggableModal
      isOpen={isOpen}
      initialPosition={initialPosition}
      onClose={onClose}
      className="magic-action-dialog"
      draggableHandle=".magic-dialog-header"
    >
      {/* Header with selected text */}
      <div className="magic-dialog-header">
        <button
          className="magic-dialog-collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand text preview' : 'Collapse text preview'}
        >
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
        </button>
        <h3 id="magic-dialog-title" className="magic-dialog-title">
          {hasText ? 'Selected Text' : 'No Text Found'}
        </h3>
        <button
          className="magic-dialog-close-btn"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
          aria-label="Close dialog"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      {/* Text preview */}
      {!isCollapsed && (
        <div className="magic-dialog-text-preview">
          {hasText ? (
            <>
              <div className="magic-dialog-text-content">
                {displayText}
              </div>
              <div className="magic-dialog-text-info">
                {isTextTruncated && (
                  <span className="magic-dialog-truncation-notice">
                    Text truncated to first 500 characters (original {textLength} characters)
                  </span>
                )}
                <span className="magic-dialog-text-stats">
                  {selectedText.split('\n').length} lines, {textLength} characters
                </span>
              </div>
            </>
          ) : (
            <div className="magic-dialog-no-text">
              <p>No text was found below the drawn line.</p>
              {needsManualDrop && (
                <button 
                  className="magic-dialog-manual-drop-btn"
                  onClick={handleManualDrop}
                >
                  Try dropping selection down
                </button>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Action buttons */}
      <div className="magic-dialog-actions">

        
        <button
          className="magic-dialog-action-btn magic-dialog-translate-btn"
          onClick={handleTranslate}
          disabled={!hasText || isLoading}
          aria-label="Translate selected text (T)"
        >
          {isLoading && loadingAction === 'translate' ? (
            <div className="magic-dialog-loading-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M2 12h20"></path>
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></path>
            </svg>
          )}
          Translate
        </button>
        
        <button
          className="magic-dialog-action-btn magic-dialog-explain-btn"
          onClick={handleExplain}
          disabled={!hasText || isLoading}
          aria-label="Explain selected text (E)"
        >
          {isLoading && loadingAction === 'explain' ? (
            <div className="magic-dialog-loading-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          )}
          Explain
        </button>
        
        <button
          className="magic-dialog-action-btn magic-dialog-highlight-btn"
          onClick={handleAnnotate}
          disabled={!hasText || isLoading}
          aria-label="Highlight selected text (A)"
        >
          {isLoading && loadingAction === 'annotate' ? (
            <div className="magic-dialog-loading-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 16.5L14 6l4 4L7.5 20.5H4v-3.5z" />
              <polygon points="14 6 16.5 3.5 21 8 18 10" />
              <line x1="6.5" y1="17.5" x2="9" y2="20" />
            </svg>
          )}
          Highlight
        </button>
      </div>
      
      {/* Keyboard shortcuts hint */}
      <div className="magic-dialog-shortcuts">

      </div>
      
      {/* 对话模式UI */}
      {conversationMode && (
        <div className="magic-dialog-conversation">
          {/* 对话历史显示 */}
          <div className="magic-dialog-messages">
            {conversationHistory.map((message) => (
              <div key={message.id} className={`magic-dialog-message ${message.role}`}>
                <div className="magic-dialog-message-content">
                  {message.loading ? (
                    <span className="magic-dialog-loading">思考中…</span>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* 输入框 */}
          <div className="magic-dialog-input">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="输入你的问题..."
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage(inputMessage)
                  setInputMessage('')
                }
              }}
            />
            <button
              onClick={() => {
                handleSendMessage(inputMessage)
                setInputMessage('')
              }}
              disabled={!inputMessage.trim()}
            >
              发送
            </button>
          </div>
        </div>
      )}
    </DraggableModal>
  )
}

MagicActionDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  selectedText: PropTypes.string,
  initialPosition: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }),
  needsManualDrop: PropTypes.bool,

  onTranslate: PropTypes.func.isRequired,
  onExplain: PropTypes.func.isRequired,
  onAnnotate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  
  // 新增对话功能props
  onSendMessage: PropTypes.func,
  documentId: PropTypes.string,
  isMultiTurn: PropTypes.bool
}

MagicActionDialog.defaultProps = {
  selectedText: '',
  initialPosition: null,
  needsManualDrop: false,
  onSendMessage: null,
  documentId: null,
  isMultiTurn: false
}

export default MagicActionDialog