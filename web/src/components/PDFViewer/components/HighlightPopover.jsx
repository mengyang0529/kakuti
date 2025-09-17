import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

const HighlightPopover = ({
  highlight,
  position,
  onDelete,
  onChangeColor,
  onChangeComment,
}) => {
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const copiedTimerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(highlight.text);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedFeedback(true);
      copiedTimerRef.current = setTimeout(() => setCopiedFeedback(false), 1000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const colors = [
    { name: 'green', color: 'rgba(34, 197, 94, 0.3)' },
    { name: 'yellow', color: 'rgba(234, 179, 8, 0.35)' },
    { name: 'blue', color: 'rgba(59, 130, 246, 0.3)' },
    { name: 'pink', color: 'rgba(236, 72, 153, 0.35)' },
  ];

  if (!highlight) return null;

  return (
    <div
      className="highlight-popover"
      role="dialog"
      aria-label="Highlight actions"
      style={{
        position: 'absolute',
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: '280px',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>Comment</label>
        <textarea
          rows={4}
          value={highlight.comment || ''}
          onChange={(e) => onChangeComment && onChangeComment(highlight.id, e.target.value)}
          placeholder="Add a note... (auto-saved)"
          style={{
            width: '100%',
            fontSize: '13px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            padding: '8px',
            outline: 'none',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
        {copiedFeedback && (
          <div className="copy-feedback" aria-live="polite">Copied</div>
        )}
        <button onClick={copyText} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Copy text" aria-label="Copy text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
        </button>
        <button onClick={() => { onDelete && onDelete(highlight.id) }} style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Delete highlight" aria-label="Delete highlight">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
        </button>
        <div style={{ marginLeft: '6px', position: 'relative', display: 'inline-flex' }}>
          <button className="highlight-color-trigger" onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }} title="Change highlight color" aria-label="Change highlight color" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 6px', background: '#fff', cursor: 'pointer' }}>
            <span aria-hidden style={{ width: '16px', height: '16px', borderRadius: '4px', background: highlight.color || 'rgba(34, 197, 94, 0.3)', border: '1px solid rgba(0,0,0,0.08)' }} />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          {menuOpen && (
            <div className="highlight-color-menu" onMouseDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '32px', left: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px', display: 'grid', gridTemplateColumns: 'repeat(4, 18px)', gap: '6px', zIndex: 1100 }}>
              {colors.map((opt) => (
                <button key={opt.name} className="highlight-color-swatch" title={opt.name} aria-label={`Select ${opt.name}`} onClick={() => { onChangeColor && onChangeColor(highlight.id, opt.color); setMenuOpen(false) }} style={{ width: '18px', height: '18px', borderRadius: '4px', background: opt.color, border: '1px solid rgba(0,0,0,0.08)', padding: 0, boxSizing: 'border-box', cursor: 'pointer', boxShadow: highlight.color === opt.color ? '0 0 0 2px rgba(59,130,246,0.6) inset' : 'none' }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

HighlightPopover.propTypes = {
  highlight: PropTypes.shape({
    id: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
    comment: PropTypes.string
  }).isRequired,
  position: PropTypes.shape({
    left: PropTypes.number.isRequired,
    top: PropTypes.number.isRequired
  }).isRequired,
  onDelete: PropTypes.func.isRequired,
  onChangeColor: PropTypes.func.isRequired,
  onChangeComment: PropTypes.func.isRequired
};

export default HighlightPopover;