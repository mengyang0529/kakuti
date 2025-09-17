/**
 * LLM Service for AI-powered text operations
 * Handles explain, highlight, and other AI features
 */

import { API_KEY, apiV1 } from './apiConfig.js'

const API_BASE_URL = apiV1()

/**
 * Explain selected text using AI
 * @param {string} text - The text to explain
 * @param {Object} context - Additional context (optional)
 * @param {string} context.documentId - Document ID for context
 * @param {number} context.pageIndex - Page index where text is located
 * @param {Array} context.rectsNorm - Normalized rectangles of selected text
 * @returns {Promise<Object>} Explanation result
 */
export const explainText = async (text, context = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/explain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        text: text.trim(),
        context: {
          document_id: context.documentId,
          page_index: context.pageIndex,
          rects_norm: context.rectsNorm,
          source: 'magic_wand'
        }
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    return {
      success: true,
      explanation: result.explanation,
      metadata: result.metadata || {}
    }
  } catch (error) {
    console.error('Explain text failed:', error)
    return {
      success: false,
      error: error.message || 'Failed to explain text'
    }
  }
}

/**
 * Highlight selected text using AI
 * @param {string} text - The text to highlight
 * @param {Object} context - Additional context (optional)
 * @param {string} context.documentId - Document ID for context
 * @param {number} context.pageIndex - Page index where text is located
 * @param {Array} context.rectsNorm - Normalized rectangles of selected text
 * @returns {Promise<Object>} Highlight result
 */
export const highlightText = async (text, context = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/highlight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        text: text.trim(),
        context: {
          document_id: context.documentId,
          page_index: context.pageIndex,
          rects_norm: context.rectsNorm,
          source: 'magic_wand'
        }
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    return {
      success: true,
      highlight: result.highlight,
      metadata: result.metadata || {}
    }
  } catch (error) {
    console.error('Highlight text failed:', error)
    return {
      success: false,
      error: error.message || 'Failed to highlight text'
    }
  }
}

/**
 * Get available AI models
 * @returns {Promise<Object>} Available models
 */
export const getAvailableModels = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    return {
      success: true,
      models: result.models || []
    }
  } catch (error) {
    console.error('Get available models failed:', error)
    return {
      success: false,
      error: error.message || 'Failed to get available models',
      models: []
    }
  }
}

export default {
  explainText,
  highlightText,
  getAvailableModels
}
