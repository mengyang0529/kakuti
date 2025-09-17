const API_ROOT = (import.meta.env.VITE_API_BASE || 'http://localhost:8001').replace(/\/$/, '')
const API_KEY = import.meta.env.VITE_API_KEY || 'test-key'

export { API_ROOT, API_KEY }

export const apiV1 = (path = '') => `${API_ROOT}/api/v1${path}`
