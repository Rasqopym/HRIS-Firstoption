import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 anim-fade-up">
          <div className="bg-red-50/80 border border-red-200 rounded-2xl p-6 max-w-xl mx-auto my-8 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-red-900 mb-1">
              {this.props.fallbackTitle || 'Something went wrong on this page'}
            </h3>
            <p className="text-xs text-red-700 mb-4 max-w-md mx-auto">
              {this.state.error?.message || 'An unexpected error occurred while displaying this page.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 transition"
              >
                Refresh App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
