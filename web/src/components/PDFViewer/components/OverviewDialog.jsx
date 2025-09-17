import React, { useState } from 'react'
import PropTypes from 'prop-types'
import './OverviewDialog.css'

const OverviewDialog = ({ isOpen, onClose, onConfirm }) => {
  const [selectedLanguage, setSelectedLanguage] = useState('zh')

  const languages = [
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' }
  ]

  const handleConfirm = () => {
    onConfirm(selectedLanguage)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="overview-overlay">
      <div className="overview-dialog">
        <div className="dialog-header">
          <h3>Overview Language</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        
        <div className="dialog-content">
          <div className="language-selector">
            <label>Select Language:</label>
            <div className="language-options">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  className={`lang-option ${selectedLanguage === lang.code ? 'active' : ''}`}
                  onClick={() => setSelectedLanguage(lang.code)}
                >
                  <span className="flag">{lang.flag}</span>
                  <span className="lang-name">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="dialog-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="confirm-btn" onClick={handleConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

OverviewDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  documentId: PropTypes.string
}

export default OverviewDialog