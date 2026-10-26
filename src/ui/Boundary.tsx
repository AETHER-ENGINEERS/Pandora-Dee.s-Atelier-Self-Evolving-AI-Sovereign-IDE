import { Component, type ReactNode } from "react";

/** Keeps one broken window from taking the whole desktop down. */
export class Boundary extends Component<{ name: string; children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown) {
    console.error(`${this.props.name} stopped:`, e);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <p>{this.props.name} ran into a problem and stopped.</p>
        <p className="small faint mono">{this.state.error}</p>
        <button className="btn" onClick={() => this.setState({ error: "" })}>
          Try again
        </button>
      </div>
    );
  }
}
