import { API_KEY, apiV1 } from './apiConfig.js'

const API_BASE_URL = apiV1()

class NoteService {
  async getNotes(documentId) {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/notes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const note = await response.json();
      // Return as array to maintain compatibility with existing code
      return note.content ? [note] : [];
    } catch (error) {
      console.error('Error fetching note:', error);
      throw error;
    }
  }

  async createNote(documentId, content) {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const note = await response.json();
      // Return with id field to maintain compatibility
      return { ...note, id: note.doc_id };
    } catch (error) {
      console.error('Error creating note:', error);
      throw error;
    }
  }

  async updateNote(documentId, noteId, content) {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const note = await response.json();
      // Return with id field to maintain compatibility
      return { ...note, id: note.doc_id };
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  }

  async deleteNote(documentId, noteId) {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/notes`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  }
}

export default new NoteService();
