export const PDF_ACTIONS = {
  SET_SCALE: 'SET_SCALE',
  SET_NUM_PAGES: 'SET_NUM_PAGES',
  SET_CURRENT_PAGE: 'SET_CURRENT_PAGE',
  SET_TOOL_MODE: 'SET_TOOL_MODE',
  TOGGLE_OUTLINE: 'TOGGLE_OUTLINE',
  SET_SHOW_OUTLINE: 'SET_SHOW_OUTLINE',
  TOGGLE_SEARCH_PANEL: 'TOGGLE_SEARCH_PANEL',
  SET_SHOW_SEARCH_PANEL: 'SET_SHOW_SEARCH_PANEL',
  SET_ERROR: 'SET_ERROR',
  SET_LOADING: 'SET_LOADING',
  RESET_STATE: 'RESET_STATE'
}

export const initialState = {
  scale: 1.2,
  numPages: null,
  currentPage: 1,
  toolMode: null, // 'screenshot', 'highlight', null
  showOutline: false,
  showSearchPanel: false,
  error: null,
  isLoading: true
}
