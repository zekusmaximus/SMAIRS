import React from "react";

type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{ label?: string }>, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown, info: unknown) {
    console.error("ErrorBoundary:", err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" aria-live="assertive" className="p-3 text-sm text-red-700 bg-red-50 rounded border border-red-200">
          <div className="font-semibold mb-1">Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}.</div>
          <div className="opacity-80">{this.state.message}</div>
          <button className="mt-2 text-xs underline" onClick={() => this.setState({ hasError: false, message: undefined })}>Try again</button>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;
