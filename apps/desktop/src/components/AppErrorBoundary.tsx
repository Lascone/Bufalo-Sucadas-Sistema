import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GhostButton } from './Page';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 p-6 text-ink-50">
        <h1 className="font-display text-3xl text-brand-400">Algo travou a tela</h1>
        <p className="max-w-lg text-center text-sm text-ink-300">
          O app encontrou um erro (às vezes depois de importar muitos dados). Você
          pode recarregar sem perder o que já está salvo neste PC.
        </p>
        <pre className="max-h-40 max-w-xl overflow-auto rounded border border-white/10 bg-ink-900 p-3 text-xs text-red-200">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <GhostButton
            type="button"
            onClick={() => this.setState({ error: null })}
          >
            Tentar de novo
          </GhostButton>
          <button
            type="button"
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-ink-950"
            onClick={() => window.location.reload()}
          >
            Recarregar app
          </button>
        </div>
      </div>
    );
  }
}
