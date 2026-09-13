import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Last-resort backstop for a render error that escapes the normal degraded-mode handling
 * (see sync.ts `fail`). Without this, an uncaught render error unmounts the whole root,
 * leaving a blank page with no explanation and no way to recover short of a manual refresh.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Unhandled render error", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="shell">
          <main className="main">
            <div className="banner banner-warn" role="alert">
              Storage is unavailable in this view. You can browse, but changes will not be saved.
            </div>
            <p>
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                Reload the page
              </button>
            </p>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}
