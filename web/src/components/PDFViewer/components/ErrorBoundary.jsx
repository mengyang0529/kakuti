import React from 'react'
import PropTypes from 'prop-types'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('PDFViewer error boundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error" role="alert" style={{ margin: '1rem' }}>
          <div>
            <h3>Something went wrong</h3>
            <p>{this.state.error?.message || 'Unknown error'}</p>
            <button onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired
}

export default ErrorBoundary

