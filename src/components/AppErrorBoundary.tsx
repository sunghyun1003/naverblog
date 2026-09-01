import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorId: string | null;
}

/**
 * A render error must never turn the whole dashboard into a blank page.
 * The boundary is intentionally placed above auth and routing so it also
 * catches errors during a route transition or an auth state update.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, errorId: null };

  componentDidMount() {
    window.addEventListener("hashchange", this.handleLocationChange);
    window.addEventListener("popstate", this.handleLocationChange);
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.handleLocationChange);
    window.removeEventListener("popstate", this.handleLocationChange);
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const errorId = error instanceof Error && error.name ? error.name : "RENDER_ERROR";
    return { hasError: true, errorId };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the diagnostic in the browser console for support without
    // exposing implementation details to the operator-facing screen.
    console.error("Dashboard render error", error, info.componentStack);
  }

  private handleLocationChange = () => {
    if (this.state.hasError) this.setState({ hasError: false, errorId: null });
  };

  private reload = () => {
    window.location.reload();
  };

  private goHome = () => {
    if (window.location.hash) window.location.hash = "#/home";
    else window.history.pushState({}, "", "/");
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error-screen" role="alert" aria-live="assertive">
        <section className="app-error-screen__panel">
          <BrandMark />
          <div className="app-error-screen__copy">
            <p className="app-error-screen__eyebrow">블로그 운영센터</p>
            <h1>화면을 불러오지 못했습니다</h1>
            <p>잠시 후 다시 시도하거나 홈으로 이동해 주세요.</p>
            {this.state.errorId ? <small>오류 코드: {this.state.errorId}</small> : null}
          </div>
          <div className="app-error-screen__actions">
            <button type="button" className="button button--outline" onClick={this.reload}>다시 불러오기</button>
            <button type="button" className="button button--brand" onClick={this.goHome}>홈으로 이동</button>
          </div>
        </section>
      </main>
    );
  }
}
