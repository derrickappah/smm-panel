import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 text-center animate-fadeIn">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h2>

            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              An unexpected error occurred while loading this section. Please try refreshing or return to your dashboard.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-xl shadow-sm transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </Button>
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="flex items-center justify-center gap-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-all"
              >
                <Home className="w-4 h-4" />
                Go to Dashboard
              </Button>
            </div>

            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="mt-6 text-left p-3 bg-gray-900 text-gray-200 rounded-lg text-xs font-mono overflow-auto max-h-40">
                <p className="text-red-400 font-bold mb-1">{this.state.error.toString()}</p>
                <pre className="text-gray-400">{this.state.errorInfo?.componentStack}</pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
