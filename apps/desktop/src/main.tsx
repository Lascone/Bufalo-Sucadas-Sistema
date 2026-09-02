import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { OperatorPickerPage } from './pages/OperatorPickerPage';
import { initLocalStore } from './lib/local-store';
import { useAppStore } from './stores/app-store';
import './styles.css';

const queryClient = new QueryClient();

function Bootstrap() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const operatorReady = useAppStore((s) => s.operatorReady);
  const loadSession = useAppStore((s) => s.loadSession);

  useEffect(() => {
    void initLocalStore()
      .then(() => loadSession())
      .then(() => setReady(true))
      .catch((err) => {
        setBootError(err instanceof Error ? err.message : String(err));
      });
  }, [loadSession]);

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6 text-ink-100">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-brand-400">Erro ao iniciar</p>
          <p className="mt-2 text-sm text-ink-300">{bootError}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-100">
        <p className="text-sm">Carregando…</p>
      </div>
    );
  }

  if (!operatorReady) {
    return <OperatorPickerPage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
);
