import { API_KEY, apiV1 } from './apiConfig.js'

const API_BASE_URL = apiV1()

class RAGService {
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
   * Query a document using RAG
   * @param {string} query - The user's question
   * @param {string} documentId - The document ID to query (optional for workspace queries)
   * @returns {Promise<Object>} RAG response with answer and citations
   */
  async queryRAG(query, documentId = null) {
    if (!query || !query.trim()) {
      throw new Error('Query cannot be empty')
    }

    const requestBody = {
      query: query.trim()
    }
    
    // Add document_id only if provided (for workspace queries, it's omitted)
    if (documentId && documentId.trim()) {
      requestBody.document_id = documentId.trim()
    }

    const response = await fetch(`${API_BASE_URL}/rag/query`, {
      method: 'POST',
      headers: this.getHeadersWithContentType(),
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.json()
      
      // Handle specific error cases
      if (response.status === 202) {
        // Document is being indexed
        throw new Error(error.detail || 'Document is being indexed. Please try again in a few moments.')
      }
      
      throw new Error(error.detail || 'RAG query failed')
    }

    return await response.json()
  }

  /**
   * Query the entire workspace using RAG
   * @param {string} query - The user's question
   * @returns {Promise<Object>} RAG response with answer and citations from all documents
   */
  async queryWorkspace(query) {
    return await this.queryRAG(query, null)
  }

  /**
   * Preemptively index a document for RAG queries
   * @param {string} documentId - The document ID to index
   * @returns {Promise<Object>} Index response with status and chunk count
   */
  async indexDocument(documentId) {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be empty')
    }

    const response = await fetch(`${API_BASE_URL}/rag/index?document_id=${encodeURIComponent(documentId)}`, {
      method: 'POST',
      headers: this.getHeaders()
    })

    if (!response.ok) {
      const error = await response.json()
      
      if (response.status === 202) {
        // Document is being indexed by another process
        throw new Error(error.detail || 'Document is being indexed by another process. Please wait.')
      }
      
      throw new Error(error.detail || 'Document indexing failed')
    }

    return await response.json()
  }

  /**
   * Get the RAG indexing status for a document
   * @param {string} documentId - The document ID to check
   * @returns {Promise<Object>} Status information
   */
  async getRAGStatus(documentId) {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be empty')
    }

    const response = await fetch(`${API_BASE_URL}/rag/status/${encodeURIComponent(documentId)}`, {
      method: 'GET',
      headers: this.getHeaders()
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to get RAG status')
    }

    return await response.json()
  }

  /**
   * Query with automatic retry for indexing
   * @param {string} query - The user's question
   * @param {string} documentId - The document ID to query
   * @param {Object} options - Options for retry behavior
   * @returns {Promise<Object>} RAG response
   */
  async queryWithRetry(query, documentId, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 3000, // 3 seconds
      onRetry = null // Callback for retry events
    } = options

    let lastError = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.queryRAG(query, documentId)
      } catch (error) {
        lastError = error
        
        // Check if it's a retryable error (document being indexed)
        if (error.message.includes('being indexed') && attempt < maxRetries) {
          if (onRetry) {
            onRetry(attempt + 1, maxRetries, error.message)
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          continue
        }
        
        // Non-retryable error or max retries reached
        throw error
      }
    }

    throw lastError
  }

  /**
   * Ensure document is indexed and then query
   * @param {string} query - The user's question
   * @param {string} documentId - The document ID to query
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} RAG response
   */
  async ensureIndexAndQuery(query, documentId, onProgress = null) {
    try {
      // First check if document is already indexed
      if (onProgress) onProgress('Checking document status...')
      
      const status = await this.getRAGStatus(documentId)
      
      if (!status.indexed) {
        // Document needs indexing
        if (onProgress) onProgress('Indexing document...')
        
        try {
          await this.indexDocument(documentId)
          if (onProgress) onProgress('Document indexed successfully')
        } catch (indexError) {
          if (indexError.message.includes('being indexed')) {
            // Another process is indexing, wait and retry
            if (onProgress) onProgress('Document is being indexed by another process, waiting...')
          } else {
            throw indexError
          }
        }
      }
      
      // Query with retry
      if (onProgress) onProgress('Querying document...')
      
      return await this.queryWithRetry(query, documentId, {
        onRetry: (attempt, maxRetries, message) => {
          if (onProgress) {
            onProgress(`Retrying query (${attempt}/${maxRetries}): ${message}`)
          }
        }
      })
      
    } catch (error) {
      if (onProgress) onProgress(`Error: ${error.message}`)
      throw error
    }
  }
}

export default new RAGService()
