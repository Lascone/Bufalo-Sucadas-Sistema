import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { initLocalStore } from './lib/local-store';
import './styles.css';

const queryClient = new QueryClient();

async function bootstrap() {
  await initLocalStore();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <HashRouter>
            <App />
          </HashRouter>
        </AppErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
