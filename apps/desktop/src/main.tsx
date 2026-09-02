import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initLocalStore } from './lib/local-store';
import { useAppStore } from './stores/app-store';
import './styles.css';

const queryClient = new QueryClient();

function Bootstrap() {
  const [ready, setReady] = useState(false);
  const loadSession = useAppStore((s) => s.loadSession);

  useEffect(() => {
    void initLocalStore()
      .then(() => loadSession())
      .then(() => setReady(true));
  }, [loadSession]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-100">
        <p className="text-sm">Carregando…</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
);
