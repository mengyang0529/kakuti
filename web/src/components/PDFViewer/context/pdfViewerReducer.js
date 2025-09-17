
import { PDF_ACTIONS, initialState } from './pdfViewerConstants'

export function pdfViewerReducer(state, action) {
  switch (action.type) {
    case PDF_ACTIONS.SET_SCALE:
      return { ...state, scale: action.payload }
    
    case PDF_ACTIONS.SET_NUM_PAGES:
      return { ...state, numPages: action.payload, isLoading: false }
    
    case PDF_ACTIONS.SET_CURRENT_PAGE:
      return { ...state, currentPage: action.payload }
    
    case PDF_ACTIONS.SET_TOOL_MODE:
      return { ...state, toolMode: action.payload }
    
    case PDF_ACTIONS.TOGGLE_OUTLINE:
      return { ...state, showOutline: !state.showOutline }
    
    case PDF_ACTIONS.SET_SHOW_OUTLINE:
      return { ...state, showOutline: action.payload }
    
    case PDF_ACTIONS.TOGGLE_SEARCH_PANEL:
      return { ...state, showSearchPanel: !state.showSearchPanel }
    
    case PDF_ACTIONS.SET_SHOW_SEARCH_PANEL:
      return { ...state, showSearchPanel: action.payload }
    
    case PDF_ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, isLoading: false }
    
    case PDF_ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload }
    
    case PDF_ACTIONS.RESET_STATE:
      return { ...initialState }
    
    default:
      return state
  }
}
