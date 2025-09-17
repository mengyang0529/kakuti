import { API_KEY, apiV1 } from './apiConfig.js'

const API_BASE_URL = apiV1()

class HighlightService {
  getHeaders() {
    return {
      'X-API-Key': API_KEY
    }
  }

  getHeadersWithContentType() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    }
  }
  /**
   * Create a new highlight
   * @param {Object} highlightData - The highlight data
   * @param {string} highlightData.doc_id - Document ID
   * @param {number} highlightData.page_number - Page number
   * @param {number} highlightData.start_offset - Start offset
   * @param {number} highlightData.end_offset - End offset
   * @param {string} highlightData.selected_text - Selected text
   * @param {string} highlightData.color - Highlight color (optional)
   * @param {string} highlightData.note - Note text (optional)
   * @param {Array} highlightData.rects_norm - Normalized rectangles (optional)
   * @param {string} highlightData.source - Source of highlight creation (optional)
   * @returns {Promise<Object>} Created highlight
   */
  async createHighlight(highlightData) {
    try {
      const response = await fetch(`${API_BASE_URL}/highlights`, {
        method: 'POST',
        headers: this.getHeadersWithContentType(),
        body: JSON.stringify(highlightData)
      })

      if (!response.ok) {
        throw new Error(`Failed to create highlight: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error creating highlight:', error)
      throw error
    }
  }

  /**
   * Get all highlights for a document
   * @param {string} docId - Document ID
   * @returns {Promise<Array>} Array of highlights
   */
  async getDocumentHighlights(docId) {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${docId}/highlights`, {
        headers: this.getHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`Failed to get highlights: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error getting document highlights:', error)
      throw error
    }
  }

  /**
   * Get highlights for a specific page
   * @param {string} docId - Document ID
   * @param {number} pageNumber - Page number
   * @returns {Promise<Array>} Array of highlights for the page
   */
  async getPageHighlights(docId, pageNumber) {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${docId}/highlights/page/${pageNumber}`, {
        headers: this.getHeaders()
      })
      
      if (!response.ok) {
        throw new Error(`Failed to get page highlights: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error getting page highlights:', error)
      throw error
    }
  }

  /**
   * Update a highlight
   * @param {string} highlightId - Highlight ID
   * @param {Object} updateData - Update data
   * @param {string} updateData.color - New color (optional)
   * @param {string} updateData.note - New note (optional)
   * @returns {Promise<Object>} Updated highlight
   */
  async updateHighlight(highlightId, updateData) {
    try {
      const response = await fetch(`${API_BASE_URL}/highlights/${highlightId}`, {
        method: 'PUT',
        headers: this.getHeadersWithContentType(),
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        throw new Error(`Failed to update highlight: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error updating highlight:', error)
      throw error
    }
  }

  /**
   * Delete a highlight
   * @param {string} highlightId - Highlight ID
   * @returns {Promise<Object>} Delete response
   */
  async deleteHighlight(highlightId) {
    try {
      const response = await fetch(`${API_BASE_URL}/highlights/${highlightId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      })

      if (!response.ok) {
        throw new Error(`Failed to delete highlight: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error deleting highlight:', error)
      throw error
    }
  }

  /**
   * Delete all highlights for a document
   * @param {string} docId - Document ID
   * @returns {Promise<Object>} Delete response
   */
  async deleteDocumentHighlights(docId) {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${docId}/highlights`, {
        method: 'DELETE',
        headers: this.getHeaders()
      })

      if (!response.ok) {
        throw new Error(`Failed to delete document highlights: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error deleting document highlights:', error)
      throw error
    }
  }
}

// Export a singleton instance
export default new HighlightService()
