import { API_KEY, apiV1 } from './apiConfig.js'

const API_BASE_URL = apiV1()

class SimService {
  getHeadersWithContentType() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    }
  }

  async sendMessage({ source, message, workspaceId = null, documentId = null, context = null }) {
    const payload = {
      source,
      message,
      workspace_id: workspaceId,
      document_id: documentId,
      context
    }
    const response = await fetch(`${API_BASE_URL}/simulate`, {
      method: 'POST',
      headers: this.getHeadersWithContentType(),
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Failed to send message')
    }
    return await response.json()
  }
}

export default new SimService()
