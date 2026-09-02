import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Boxes,
  Building2,
  Banknote,
  Container,
  Wallet,
  RefreshCw,
  AlertTriangle,
  Settings,
} from 'lucide-react';
import { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { StatusFooter } from './StatusFooter';
import { cn } from '../lib/utils';
import { maybeAutoCloseCash } from '../lib/cash';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/contatos', label: 'Contatos', icon: Users },
  { to: '/materiais', label: 'Materiais', icon: Boxes },
  { to: '/caixa', label: 'Caixa', icon: Banknote },
  { to: '/vendas', label: 'Vendas', icon: Building2 },
  { to: '/patio', label: 'Pátio', icon: Container },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/sincronizacao', label: 'Sincronização', icon: RefreshCw },
  { to: '/conflitos', label: 'Conflitos', icon: AlertTriangle },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppShell() {
  const loadAppInfo = useAppStore((s) => s.loadAppInfo);
  const refreshSync = useAppStore((s) => s.refreshSync);
  const applyRemoteChanges = useAppStore((s) => s.applyRemoteChanges);
  const dataRevision = useAppStore((s) => s.dataRevision);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    void loadAppInfo();
    void refreshSync();
    void maybeAutoCloseCash().then(async (closed) => {
      if (closed) {
        const { upsertFinanceDayFromCash } = await import('../lib/finance');
        await upsertFinanceDayFromCash(closed);
      }
    });
    const id = setInterval(() => void refreshSync(), 15_000);
    const closeId = setInterval(() => {
      void maybeAutoCloseCash().then(async (closed) => {
        if (closed) {
          const { upsertFinanceDayFromCash } = await import('../lib/finance');
          await upsertFinanceDayFromCash(closed);
        }
      });
    }, 60_000);

    const unsubRemote = window.ferrogestor?.onRemoteChanges?.(() => {
      void applyRemoteChanges();
    });
    const unsubOutbox = window.ferrogestor?.onOutboxSnapshot?.((snap) => {
      useAppStore.setState((s) => ({
        sync: { ...s.sync, ...(snap as Record<string, unknown>) },
      }));
    });

    return () => {
      clearInterval(id);
      clearInterval(closeId);
      unsubRemote?.();
      unsubOutbox?.();
    };
  }, [loadAppInfo, refreshSync, applyRemoteChanges]);

  return (
    <div className="flex min-h-screen text-ink-50">
      <aside className="flex w-[17rem] flex-col border-r border-white/10 bg-ink-950/95">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/icon.png"
              alt="Búfalo Sucatas"
              className="h-12 w-12 rounded-xl border border-brand-500/40 object-cover shadow-panel"
            />
            <div className="min-w-0">
              <p className="font-display text-2xl leading-none tracking-wide text-brand-400">
                BÚFALO
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-moss-400">
                Sucatas
              </p>
              <p className="mt-1 truncate text-xs text-ink-300">
                Búfalo Sucata Gestor
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition',
                  isActive
                    ? 'bg-brand-500 text-ink-950 shadow-panel'
                    : 'text-ink-100 hover:bg-white/5 hover:text-brand-100',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <img
            src="/logo.png"
            alt="Logo Búfalo Sucatas"
            className="mx-auto max-h-24 w-auto rounded-lg opacity-95"
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto p-6 md:p-8">
          <Outlet key={dataRevision} />
        </main>
        <StatusFooter />
      </div>
    </div>
  );
}
