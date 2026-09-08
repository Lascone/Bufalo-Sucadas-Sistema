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
  Archive,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/app-store';
import { StatusFooter } from './StatusFooter';
import { cn } from '../lib/utils';
import { reconcileCashSession } from '../lib/cash';
import { getSettings } from '../lib/settings';

const SIDEBAR_KEY = 'ferrogestor:ui.sidebarCollapsed';

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
  { to: '/dados-antigos', label: 'Dados antigos', icon: Archive },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppShell() {
  const loadAppInfo = useAppStore((s) => s.loadAppInfo);
  const refreshSync = useAppStore((s) => s.refreshSync);
  const username = useAppStore((s) => s.session.username);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    void loadAppInfo();
    void refreshSync();

    const runReconcile = () =>
      void reconcileCashSession({ openedBy: username || 'sistema' }).then(
        async ({ closed }) => {
          if (!closed) return;
          const { upsertFinanceDayFromCash } = await import('../lib/finance');
          await upsertFinanceDayFromCash(closed);
        },
      );

    runReconcile();
    const id = setInterval(() => void refreshSync(), 15_000);
    const closeId = setInterval(runReconcile, 60_000);

    const minutes = Math.max(1, Number(getSettings()['sync.autoIntervalMinutes']) || 5);
    const syncId = setInterval(
      () => {
        const st = useAppStore.getState();
        if (st.syncBusy) return;
        void st.runSyncNow();
      },
      minutes * 60_000,
    );
    const firstSync = window.setTimeout(() => {
      const st = useAppStore.getState();
      if (st.syncBusy) return;
      void st.runSyncNow();
    }, 20_000);

    return () => {
      clearInterval(id);
      clearInterval(closeId);
      clearInterval(syncId);
      window.clearTimeout(firstSync);
    };
  }, [loadAppInfo, refreshSync, username]);

  return (
    <div className="flex h-full max-h-full overflow-hidden text-ink-50">
      <aside
        className={cn(
          'flex h-full shrink-0 flex-col border-r border-white/10 bg-ink-950/95 transition-[width] duration-200',
          sidebarCollapsed ? 'w-[4.25rem]' : 'w-[15.5rem]',
        )}
      >
        <div
          className={cn(
            'border-b border-white/10',
            sidebarCollapsed ? 'px-1.5 py-2' : 'px-3 py-3',
          )}
        >
          <div
            className={cn(
              'flex items-center',
              sidebarCollapsed ? 'flex-col gap-2' : 'gap-2.5',
            )}
          >
            <img
              src="./icon.png"
              alt="Búfalo Sucatas"
              className="h-10 w-10 shrink-0 rounded-xl border border-brand-500/40 object-cover shadow-panel"
            />
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl leading-none tracking-wide text-brand-400">
                  BÚFALO
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-moss-400">
                  Sucatas
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
              className={cn(
                'shrink-0 rounded-lg border-2 p-2 transition',
                'border-brand-400 bg-brand-500 text-ink-950',
                'shadow-[0_0_14px_rgba(245,124,0,0.55)]',
                'hover:brightness-110 hover:shadow-[0_0_20px_rgba(245,124,0,0.75)]',
                'active:scale-95',
              )}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <PanelLeftClose className="h-5 w-5" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={sidebarCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg text-[14px] font-medium transition',
                  sidebarCollapsed
                    ? 'justify-center px-2 py-2.5'
                    : 'gap-2.5 px-2.5 py-2',
                  isActive
                    ? 'bg-brand-500 text-ink-950 shadow-panel'
                    : 'text-ink-100 hover:bg-white/5 hover:text-brand-100',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && item.label}
            </NavLink>
          ))}
        </nav>

        {!sidebarCollapsed && (
          <div className="border-t border-white/10 p-2">
            <img
              src="./logo.png"
              alt="Logo Búfalo Sucatas"
              className="mx-auto max-h-14 w-auto rounded-lg opacity-95"
            />
          </div>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:p-4">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2">
            <Outlet />
          </div>
        </main>
        <StatusFooter />
      </div>
    </div>
  );
}
