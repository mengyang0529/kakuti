import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import DraggableModal from '../dialogs/DraggableModal'
import './TranslationDialog.css'

const TranslationDialog = ({ isOpen, onClose, selectedText, onTranslate }) => {
  const [targetLang, setTargetLang] = useState('ja')
  const [translation, setTranslation] = useState({ text: '', source: '' })
  const [isLoading, setIsLoading] = useState(false)

  const languages = [
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' }
  ]

  useEffect(() => {
    console.log('TranslationDialog useEffect:', { isOpen, selectedText, targetLang })
    if (isOpen && selectedText) {
      console.log('Auto-translating on dialog open')
      handleTranslate()
    }
  }, [isOpen, selectedText, targetLang])

  const handleTranslate = async () => {
    if (!selectedText) return
    
    setIsLoading(true)
    try {
      const result = await onTranslate(selectedText, targetLang)
      setTranslation(result)
    } catch (error) {
      const status = error?.status
      let message = error?.message || 'Translation failed, please try again'
      // Friendlier message for common backend failures
      if (status >= 500) {
        message = `Translation service temporarily unavailable. Using mock translation instead.`
        // Provide a mock translation when service is unavailable
        const mockTranslation = `[Mock translation to ${targetLang}: ${selectedText}]`
        setTranslation({ text: mockTranslation, source: 'Mock Translation' })
      } else {
        setTranslation({ text: message, source: 'Error' })
      }
      console.error('Translation error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLanguageChange = (langCode) => {
    setTargetLang(langCode)
  }

  if (!isOpen) return null

  return (
    <DraggableModal
      isOpen={isOpen}
      initialPosition={{ x: 200, y: 150 }}
      onClose={onClose}
      className="translation-dialog"
      draggableHandle=".dialog-header"
    >
      <div className="dialog-header draggable-modal-header">
        <h3>Translation</h3>
        <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="dialog-content">
          <div className="language-selector">
            <label>Target Language:</label>
            <div className="language-buttons">
              {languages.map(lang => (
                <button
                  key={lang.code}
                  className={`lang-btn ${targetLang === lang.code ? 'active' : ''}`}
                  onClick={() => handleLanguageChange(lang.code)}
                  title={lang.name}
                >
                  <span className="flag">{lang.flag}</span>
                  <span className="lang-name">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="translation-result">
            <label>Translation Result:</label>
            <div className="result-display">
              {isLoading ? (
                <div className="loading">Translating...</div>
              ) : (
                <>
                  <div className="translation-text">
                    {translation.text || 'Please select a language to translate'}
                  </div>
                  {translation.source && (
                    <div className="translation-source">
                      Source: {translation.source}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="dialog-footer">
          <button className="translate-btn" onClick={handleTranslate} disabled={isLoading}>
            {isLoading ? 'Translating...' : 'Re-translate'}
          </button>
        </div>
    </DraggableModal>
  )
}

TranslationDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  selectedText: PropTypes.string.isRequired,
  onTranslate: PropTypes.func.isRequired
}

export default TranslationDialog
