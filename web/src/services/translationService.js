import { API_ROOT, API_KEY } from './apiConfig.js'

const API_BASE_URL = API_ROOT

export const translateText = async (text, targetLang) => {
  console.log('translateText called with:', { text, targetLang })
  try {
    const url = `${API_BASE_URL}/api/v1/translate`
    console.log('Making translation API request to:', url)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        text: text,
        target_langs: [targetLang]
      })
    })
    
    console.log('Translation API response status:', response.status)

    if (!response.ok) {
      let detail = ''
      try {
        const ct = response.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const j = await response.json()
          detail = j?.detail || j?.error || JSON.stringify(j)
        } else {
          detail = await response.text()
        }
      } catch {}
      const err = new Error(`Translation failed: ${response.status} ${response.statusText || ''}${detail ? ` — ${detail}` : ''}`)
      err.status = response.status
      err.detail = detail
      throw err
    }

    const data = await response.json()
    console.log('Translation API response data:', data)
    
    // Normalize various possible response shapes
    // 1) { translations: { [lang]: { text, source } } }
    if (data?.translations && data.translations[targetLang]) {
      const result = data.translations[targetLang]
      return { text: String(result.text || ''), source: String(result.source || '') }
    }
    // 2) { translation: { text, source } } or { text, source }
    if (data?.translation?.text || data?.text) {
      const t = data.translation || data
      return { text: String(t.text || ''), source: String(t.source || '') }
    }
    // 3) Array of translations
    if (Array.isArray(data?.translations) && data.translations.length > 0) {
      const best = data.translations.find(t => t.lang === targetLang) || data.translations[0]
      return { text: String(best.text || ''), source: String(best.source || '') }
    }

    console.log('Translation result not found in response:', data)
    throw new Error('Translation result not found')
  } catch (error) {
    console.error('Translation service error:', error)
    
    // Check if it's a network error or connection issue
    if (error instanceof TypeError && error.message.includes('fetch')) {
      // Network error - provide a mock translation
      const mockTranslation = `[Mock translation to ${targetLang}: ${text}]`
      return { text: mockTranslation, source: 'Network Error - Mock Translation' }
    }
    
    // For 500 errors (server issues), provide a mock translation
    if (error.status >= 500) {
      const mockTranslation = `[Mock translation to ${targetLang}: ${text}]`
      return { text: mockTranslation, source: 'Server Error - Mock Translation' }
    }
    
    // Re-throw other errors
    throw error
  }
}
