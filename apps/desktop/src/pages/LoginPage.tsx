import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrimaryButton, fieldClass } from '../components/Page';
import { getSettings } from '../lib/settings';
import { useAppStore } from '../stores/app-store';

export function LoginPage() {
  const navigate = useNavigate();
  const loadSession = useAppStore((s) => s.loadSession);
  const [apiBaseUrl, setApiBaseUrl] = useState(
    () => getSettings()['sync.apiBaseUrl'] ?? 'http://localhost:3000/api/v1',
  );
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('Escritório');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!window.ferrogestor?.login) {
        throw new Error('Login disponível apenas no app instalado (Electron).');
      }
      await window.ferrogestor.login({
        apiBaseUrl: apiBaseUrl.trim(),
        username: username.trim(),
        password,
        deviceName: deviceName.trim() || 'PC Sucata',
      });
      await loadSession();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-panel"
      >
        <h1 className="font-display text-3xl text-brand-400">BÚFALO SUCATAS</h1>
        <p className="mt-2 text-sm text-ink-300">
          Entre para enviar os dados ao PostgreSQL em tempo real. Offline continua
          funcionando — a fila envia quando voltar a internet.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <label className="mt-6 block text-sm text-ink-200">
          URL da API
          <input
            className={`${fieldClass} mt-1`}
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="https://seu-servidor/api/v1"
          />
        </label>
        <label className="mt-4 block text-sm text-ink-200">
          Usuário
          <input
            className={`${fieldClass} mt-1`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="mt-4 block text-sm text-ink-200">
          Senha
          <input
            type="password"
            className={`${fieldClass} mt-1`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="mt-4 block text-sm text-ink-200">
          Nome deste PC
          <input
            className={`${fieldClass} mt-1`}
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
        </label>

        <PrimaryButton type="submit" disabled={loading} className="mt-6 w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </PrimaryButton>
      </form>
    </div>
  );
}
