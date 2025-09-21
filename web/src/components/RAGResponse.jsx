import { useState, useEffect, useRef } from 'react'
import './RAGResponse.css'

export default function RAGResponse({ response, onClose }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const modalRef = useRef(null)

  // Load chat history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('ragChatHistory')
    if (savedHistory) {
      try {
        setChatHistory(JSON.parse(savedHistory))
      } catch (error) {
        console.error('Failed to parse chat history:', error)
        setChatHistory([])
      }
    }
  }, [])

  // Save new conversation to history when response changes
  useEffect(() => {
    if (response && response.query && response.answer) {
      const newConversation = {
        id: Date.now(),
        query: response.query,
        answer: response.answer,
        citations: response.citations || [],
        processing_time: response.processing_time,
        timestamp: new Date().toISOString()
      }
      
      const updatedHistory = [newConversation, ...chatHistory].slice(0, 50) // Keep last 50 conversations
      setChatHistory(updatedHistory)
      localStorage.setItem('ragChatHistory', JSON.stringify(updatedHistory))
    }
  }, [response])

  // Handle click outside to close dialog (exclude input bar)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        // Check if click is on input bar - don't close if it is
        const inputBar = document.querySelector('.bottom-input-bar')
        if (inputBar && inputBar.contains(event.target)) {
          return // Don't close when clicking input bar
        }
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  if (!response) return null

  const { answer, citations = [], query, processing_time, method, fallback } = response

  return (
    <div className="rag-response-overlay">
      <div className="rag-response-modal" ref={modalRef}>

        
        <div className="rag-response-content">
          <div className="chat-container">
            {/* Chat History */}
            {chatHistory.length > 1 && (
              <div className="chat-history">
                <div className="history-header">
                  <span>Previous Conversations</span>
                </div>
                {chatHistory.slice(1, 4).map((conversation) => (
                  <div key={conversation.id} className="history-conversation">
                    <div className="user-message">
                      <div className="message-bubble user-bubble history-bubble">
                        {conversation.query}
                      </div>
                    </div>
                    <div className="ai-message">
                      <div className="message-bubble ai-bubble history-bubble">
                        {conversation.answer}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="history-divider"></div>
              </div>
            )}
            
            {/* Current User question - right aligned */}
            <div className="user-message">
              <div className="message-bubble user-bubble">
                {query}
              </div>
            </div>
            
            {/* Current AI answer - left aligned */}
            <div className="ai-message">
              <div className="message-bubble ai-bubble">
                {answer}
              </div>
              
              {/* Citations attached to AI answer */}
              {citations && citations.length > 0 && (
                <div className="rag-citations">
                  <button 
                    className="cites-btn"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    cites {citations.length}
                  </button>
                  
                  {isExpanded && (
                    <div className="citations-list">
                      {citations.map((citation, index) => (
                        <div key={index} className="citation-item">
                          <div className="citation-header">
                            <span className="citation-number">[{index + 1}]</span>
                            {citation.document_title && (
                              <span className="citation-document">{citation.document_title}</span>
                            )}
                            <span className="citation-page">Page {citation.page_number || 'N/A'}</span>
                            {citation.similarity_score && (
                              <span className="citation-score">
                                {Math.round(citation.similarity_score * 100)}% match
                              </span>
                            )}
                          </div>
                          <div className="citation-text">
                            {citation.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="rag-meta">
            {processing_time && (
              <small>Processed in {Math.round(processing_time * 1000)}ms</small>
            )}
            {method === 'gemini_direct' && (
              <small className="method-indicator">
                • Answered using full document analysis
              </small>
            )}
            {fallback && method !== 'gemini_direct' && (
              <small className="fallback-indicator">
                • Fallback response
              </small>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}