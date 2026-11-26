import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred in GlimmerFall IDLE.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('GlimmerFall ErrorBoundary caught error:', error, info);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#09110E] text-[#E9EFEA] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl bg-[#101B17] border border-[#2A4238] p-6 space-y-4">
            <h1 className="font-display text-xl font-bold text-[#F5F1E6]">
              Sanctuary Connection Interrupted
            </h1>
            <p className="text-xs text-[#A5B7AC] leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] text-xs font-bold"
            >
              Restore Realm
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
