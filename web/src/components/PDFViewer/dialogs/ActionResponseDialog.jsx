import React, { useLayoutEffect, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import './ActionResponseDialog.css'

const ActionResponseDialog = ({
  isOpen,
  frame,
  entries,
  onHeightChange,
  isMultiTurn = false, // 新增：是否为多轮对话模式
}) => {
  if (!isOpen) return null

  const style = {
    left: frame?.left ?? 0,
    bottom: frame?.bottom ?? 0,
  }

  const containerRef = useRef(null)
  const bodyRef = useRef(null)

  // 自动滚动到底部
  useEffect(() => {
    if (isMultiTurn && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [entries, isMultiTurn])

  useLayoutEffect(() => {
    if (!isOpen) return
    const el = containerRef.current
    if (!el) return
    const height = el.offsetHeight
    if (typeof onHeightChange === 'function') {
      onHeightChange(height)
    }
  }, [isOpen, entries, onHeightChange])

  return (
    <div className={`action-response-dialog ${isMultiTurn ? 'ard-multi-turn' : ''}`} style={style} ref={containerRef}>
      <div className="ard-body" ref={bodyRef}>
        {entries.length === 0 && isMultiTurn ? (
          <div className="ard-empty-state">
            <div className="ard-empty-icon">💬</div>
            <div className="ard-empty-text">开始对话...</div>
          </div>
        ) : (
          entries.map((entry, idx) => (
            <div key={entry.id || idx} className={`ard-bubble ${entry.role} ${entry.error ? 'ard-bubble-error' : ''}`}>
              <div className="ard-content">
                {entry.loading ? <span className="ard-loading">思考中…</span> : entry.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

ActionResponseDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  frame: PropTypes.shape({
    left: PropTypes.number.isRequired,
    bottom: PropTypes.number.isRequired,
  }).isRequired,
  entries: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    role: PropTypes.oneOf(['user', 'assistant']).isRequired,
    content: PropTypes.string,
    loading: PropTypes.bool,
    error: PropTypes.bool,
  })).isRequired,
  onHeightChange: PropTypes.func,
  isMultiTurn: PropTypes.bool,
}

export default ActionResponseDialog
