import { useEffect, useMemo, useRef, useState } from 'react';
import './BottomInputBar.css';

// Helper function to render text with doc mentions
const renderTextWithMentions = (text) => {
  // Simple regex to find document mentions and render them as HTML
  // Make mentions non-editable and add a guard space after each
  return text.replace(/\[\[doc:([^\]|]+)\|([^\]]+)\]\]/g, (_, docId, docTitle) => {
    // Escape HTML to prevent XSS
    const escapedTitle = docTitle.replace(/[&<>"']/g, (match) => {
      const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return escapeMap[match];
    });
    return `<span class="doc-mention" data-doc-id="${docId}" contenteditable="false">${escapedTitle}</span><span class="mention-guard">&nbsp;</span>`;
  });
};

export default function BottomInputBar({
  placeholder = '',
  documents = [],
  onSend,
  disabled = false
}) {
  const [value, setValue] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [shouldUpdateHTML, setShouldUpdateHTML] = useState(false);
  const [isComposing, setIsComposing] = useState(false); // IME composition state
  const [lastCompositionText, setLastCompositionText] = useState(''); // Track composition text
  const textareaRef = useRef(null);

  // Parse the nearest @token to the left of cursor
  const mentionState = useMemo(() => {
    const el = textareaRef.current;
    if (!el) return { hasTrigger: false };
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return { hasTrigger: false };
    
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(el);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const caretPos = preCaretRange.toString().length;
    
    const textContent = el.textContent || '';
    const left = textContent.slice(0, caretPos);
    
    // Find the nearest @ or ＠ after whitespace/line start
    const m = left.match(/(^|\s)[@＠]([^\s@＠]*)$/);
    if (!m) return { hasTrigger: false };
    return { 
      hasTrigger: true, 
      raw: m[0], 
      prefix: m[1] ?? '', 
      q: m[2] ?? '', 
      start: caretPos - (m[2]?.length ?? 0) - 1 
    };
  }, [value, isComposing]);

  useEffect(() => {
    if (mentionState.hasTrigger) {
      setShowPicker(true);
      setQuery(mentionState.q);
      setActiveIdx(0);
    } else {
      setShowPicker(false);
      setQuery('');
      setActiveIdx(0);
    }
  }, [mentionState.hasTrigger, mentionState.q]);

  // Control HTML updates to avoid conflicts with user input
  useEffect(() => {
    if (shouldUpdateHTML && textareaRef.current) {
      const div = textareaRef.current;
      if (value) {
        div.innerHTML = renderTextWithMentions(value);
      } else {
        div.innerHTML = `<span class="placeholder">${placeholder}</span>`;
      }
      setShouldUpdateHTML(false);
    }
  }, [shouldUpdateHTML, value, placeholder]);

  // Initialize placeholder on mount
  useEffect(() => {
    if (textareaRef.current && !value) {
      textareaRef.current.innerHTML = `<span class="placeholder">${placeholder}</span>`;
    }
  }, []);

  const filtered = useMemo(() => {
    const list = (documents || []).filter(d => d && (d.title || d.id));
    if (!query) return list.slice(0, 8);
    const q = query.toLowerCase();
    return list.filter(d =>
      (d.title || '').toLowerCase().includes(q) ||
      String(d.id).toLowerCase().includes(q)
    ).slice(0, 8);
  }, [documents, query]);

  const insertDocToken = (doc) => {
    const title = doc.title || 'Document';
    const displayTitle = title.length > 5 ? title.substring(0, 5) : title;
    const token = `[[doc:${doc.id}|${displayTitle}]]`;
    const div = textareaRef.current;
    if (!div) return;

    // Get current text and replace the @query trigger
    const currentText = div.textContent || '';
    
    // Find and replace the @query part
    if (mentionState.hasTrigger) {
      const beforeTrigger = currentText.substring(0, mentionState.start);
      const afterQuery = currentText.substring(mentionState.start + 1 + mentionState.q.length);
      const newText = beforeTrigger + token + ' ' + afterQuery;
      
      setValue(newText);
      setShouldUpdateHTML(true);
      
      // Set cursor position after the token and guard space
      setTimeout(() => {
        if (div) {
          div.focus();
          
          // Find the guard space after the inserted mention and position cursor there
          const mentionGuards = div.querySelectorAll('.mention-guard');
          if (mentionGuards.length > 0) {
            const lastGuard = mentionGuards[mentionGuards.length - 1];
            const range = document.createRange();
            const selection = window.getSelection();
            
            // Position cursor at the end of the guard space
            range.setStart(lastGuard, 1);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }, 50);
    }

    setShowPicker(false);
  };

  const handleSend = async () => {
    const msg = value.trim();
    if (!msg || isSending || disabled) return;
    console.log('BottomInputBar - Sending message:', msg);
    console.log('BottomInputBar - Message length:', msg.length);
    console.log('BottomInputBar - Message characters:', [...msg].map((char, i) => `${i}: '${char}' (${char.charCodeAt(0)})`));
    try {
      setIsSending(true);
      await onSend?.(msg);
      setValue('');
      setShowPicker(false);
      setShouldUpdateHTML(true);
    } catch (e) {
      alert(e.message || 'Failed to send');
    } finally {
      setIsSending(false);
    }
  };

  const onKeyDown = (e) => {
    console.log('onKeyDown:', { key: e.key, isComposing, showPicker, value: value.trim() });
    
    // Always prevent Enter during IME composition
    if (e.key === 'Enter' && isComposing) {
      console.log('Preventing Enter during IME composition');
      e.preventDefault();
      return;
    }

    if (showPicker && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertDocToken(filtered[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowPicker(false);
        return;
      }
    }

    // Check if we're in the middle of typing @mention
    if (e.key === 'Enter' && !e.shiftKey && !showPicker && !isComposing) {
      // Check if the current text ends with @ (might be starting a mention)
      const currentText = value.trim();
      // Check for both half-width @ and full-width ＠
      const endsWithAt = currentText.endsWith('@') || currentText.endsWith('＠');
      const containsAt = currentText.includes('@') || currentText.includes('＠');
      
      console.log('Checking for @ mention:', { 
        currentText, 
        endsWithAt, 
        containsAt,
        endsWithHalfWidth: currentText.endsWith('@'),
        endsWithFullWidth: currentText.endsWith('＠')
      });
      
      if (endsWithAt) {
        console.log('Preventing send because text ends with @ or ＠');
        e.preventDefault();
        // Don't send, just let the user continue typing
        return;
      }
      
      // Additional check: if the text is very short and contains @, don't send
      if (currentText.length <= 3 && containsAt) {
        console.log('Preventing send because text is short and contains @ or ＠');
        e.preventDefault();
        return;
      }
      
      console.log('Sending message');
      e.preventDefault();
      handleSend();
    }
  };

  // Save cursor position before render
  const saveCursorPosition = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(textareaRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  };

  // Restore cursor position after render
  const restoreCursorPosition = (caretPos) => {
    if (caretPos === null) return;
    
    const div = textareaRef.current;
    if (!div) return;
    
    const selection = window.getSelection();
    const range = document.createRange();
    
    const walker = document.createTreeWalker(
      div,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let charCount = 0;
    let found = false;
    let node;
    
    while (node = walker.nextNode()) {
      const nodeLength = node.textContent.length;
      if (!found && charCount + nodeLength >= caretPos) {
        range.setStart(node, caretPos - charCount);
        found = true;
        break;
      }
      charCount += nodeLength;
    }
    
    // If we didn't find the exact position, set it at the end
    if (!found) {
      range.selectNodeContents(div);
      range.collapse(false);
    }
    
    selection.removeAllRanges();
    selection.addRange(range);
  };

  return (
    <div className="bottom-input-bar">
      <div className="bottom-bar-inner">
        <div
          ref={textareaRef}
          className="bottom-input"
          contentEditable
          suppressContentEditableWarning={true}
          onInput={(e) => {
            // For contentEditable, we need to extract the text content properly
            // But we also need to preserve the document mentions
            const div = e.target;
            
            // Extract text content while preserving document mentions
            let text = '';
            
            // Walk through all child nodes
            for (let i = 0; i < div.childNodes.length; i++) {
              const node = div.childNodes[i];
              
              if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.classList && node.classList.contains('doc-mention')) {
                  const docId = node.getAttribute('data-doc-id');
                  const docTitle = node.textContent;
                  text += `[[doc:${docId}|${docTitle}]]`;
                } else {
                  // For other elements, get their text content recursively
                  text += node.textContent || '';
                }
              }
            }
            
            setValue(text);
          }}
          onFocus={(e) => {
            // Clear placeholder on focus if no content
            if (!value) {
              e.target.innerHTML = '';
              setValue('');
            }
          }}
          onBlur={(e) => {
            // Restore placeholder if no content
            if (!value) {
              setShouldUpdateHTML(true);
            }
          }}
          onClick={(e) => {
            // Handle click on placeholder
            if (!value && e.target.querySelector('.placeholder')) {
              e.target.innerHTML = '';
              e.target.focus();
            }
          }}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            console.log('Composition start');
            setIsComposing(true)
            setLastCompositionText('')
          }}
          onCompositionUpdate={(e) => {
            console.log('Composition update:', e.data);
            setLastCompositionText(e.data || '')
          }}
          onCompositionEnd={() => {
            console.log('Composition end, final text:', lastCompositionText);
            setIsComposing(false)
            // Check if the composition ended with @ or ＠
            if (lastCompositionText.includes('@') || lastCompositionText.includes('＠')) {
              console.log('Composition ended with @ or ＠, should show picker');
              // Force a re-evaluation of mention state
              setTimeout(() => {
                const el = textareaRef.current;
                if (el) {
                  const event = new Event('input', { bubbles: true });
                  el.dispatchEvent(event);
                }
              }, 10);
            }
            setLastCompositionText('')
          }}
          style={{
            minHeight: '40px',
            maxHeight: '120px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap'
          }}
        />
        <button
          className="bottom-send"
          onClick={handleSend}
          disabled={isSending || disabled}
          aria-label="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ opacity: isSending ? 0.6 : 1 }}>
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>

      {showPicker && (
        <div className="mention-picker">
          {filtered.length > 0 ? (
            filtered.map((d, i) => (
              <div
                key={d.id}
                className={`mention-item ${i === activeIdx ? 'active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => { e.preventDefault(); insertDocToken(d); }}
              >
                <div className="mi-title">{d.title || 'Untitled'}</div>
                <div className="mi-meta">{d.mime || ''} · {d.id}</div>
              </div>
            ))
          ) : (
            <div className="mention-item no-results">
              <div className="mi-title">No documents found</div>
              <div className="mi-meta">Try uploading some documents first</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
