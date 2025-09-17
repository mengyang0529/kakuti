import { API_ROOT, API_KEY, apiV1 } from './apiConfig.js'

const API_BASE_URL = apiV1()

class DocumentService {
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
  async uploadDocument(file, workspaceId = null) {
    const formData = new FormData()
    formData.append('file', file)
    if (workspaceId) {
      formData.append('workspace_id', workspaceId)
    }

    const response = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Upload failed')
    }

    return await response.json()
  }

  async createWorkspace(name = null) {
    const response = await fetch(`${API_BASE_URL}/workspaces`, {
      method: 'POST',
      headers: this.getHeadersWithContentType(),
      body: JSON.stringify({ name })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to create workspace')
    }
    return await response.json()
  }

  async getWorkspaceDocuments(workspaceId, limit = 100, offset = 0) {
    const response = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/documents?limit=${limit}&offset=${offset}`, {
      headers: this.getHeaders()
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch workspace documents')
    }
    return await response.json()
  }

  async listWorkspaces(limit = 100, offset = 0) {
    const response = await fetch(`${API_BASE_URL}/workspaces?limit=${limit}&offset=${offset}`, {
      headers: this.getHeaders()
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch workspaces')
    }
    return await response.json()
  }

  async updateWorkspaceName(workspaceId, name) {
    const response = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: this.getHeadersWithContentType(),
      body: JSON.stringify({ name })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to update workspace')
    }
    return await response.json()
  }

  async deleteWorkspace(workspaceId) {
    const response = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to delete workspace')
    }
    return await response.json()
  }

  async getDocuments(limit = 100, offset = 0) {
    const response = await fetch(`${API_BASE_URL}/documents?limit=${limit}&offset=${offset}`, {
      headers: this.getHeaders()
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch documents')
    }

    return await response.json()
  }

  async getDocument(docId) {
    const response = await fetch(`${API_BASE_URL}/documents/${docId}`, {
      headers: this.getHeaders()
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to fetch document')
    }

    return await response.json()
  }

  async deleteDocument(docId) {
    const response = await fetch(`${API_BASE_URL}/documents/${docId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to delete document')
    }

    return await response.json()
  }

  async updateDocument(docId, data = {}) {
    const response = await fetch(`${API_BASE_URL}/documents/${docId}`, {
      method: 'PATCH',
      headers: this.getHeadersWithContentType(),
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to update document')
    }
    return await response.json()
  }

  async downloadDocument(docId) {
    const response = await fetch(`${API_BASE_URL}/documents/${docId}/download`, {
      headers: this.getHeaders()
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to download document')
    }

    return response.blob()
  }

  getDownloadUrl(docId) {
    // For direct download links, we need to include the API key as a query parameter
    // since we can't set headers for direct browser navigation
    return `${API_BASE_URL}/documents/${docId}/download?api_key=${API_KEY}`
  }

  async uploadToGemini(documentId, options = {}) {
    try {
      const { language = 'Chinese', format = 'markdown' } = options
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/upload-to-gemini`, {
        method: 'POST',
        headers: this.getHeadersWithContentType(),
        body: JSON.stringify({ 
          language: language,
          format: format
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      return result
    } catch (error) {
      console.error('Error uploading to Gemini:', error)
      throw error
    }
  }

  async createNote({ title = null, content = '', workspaceId = null, color = null } = {}) {
    const payload = {
      title,
      content,
      workspace_id: workspaceId,
      color,
    }
    const response = await fetch(`${API_BASE_URL}/documents/create-note`, {
      method: 'POST',
      headers: this.getHeadersWithContentType(),
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to create note')
    }
    return await response.json()
  }
}

export default new DocumentService()
