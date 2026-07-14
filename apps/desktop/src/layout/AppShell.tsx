import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Boxes,
  ShoppingCart,
  Store,
  Warehouse,
  Wallet,
  RefreshCw,
  AlertTriangle,
  Settings,
  Moon,
  Sun,
} from 'lucide-react';
import { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { StatusFooter } from './StatusFooter';
import { cn } from '../lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/contatos', label: 'Contatos', icon: Users },
  { to: '/materiais', label: 'Materiais', icon: Boxes },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
  { to: '/vendas', label: 'Vendas', icon: Store },
  { to: '/estoque', label: 'Estoque', icon: Warehouse },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/sincronizacao', label: 'Sincronização', icon: RefreshCw },
  { to: '/conflitos', label: 'Conflitos', icon: AlertTriangle },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppShell() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const loadAppInfo = useAppStore((s) => s.loadAppInfo);
  const refreshSync = useAppStore((s) => s.refreshSync);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    void loadAppInfo();
    void refreshSync();
    const id = setInterval(() => void refreshSync(), 15_000);
    return () => clearInterval(id);
  }, [loadAppInfo, refreshSync]);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-steel-400/30 bg-brand-900 text-brand-50">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="font-display text-3xl tracking-wide text-white">Bufalo Sucatas</p>
          <p className="mt-1 text-sm text-brand-100/80">FerroGestor</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] transition',
                  isActive
                    ? 'bg-brand-500 text-white'
                    : 'text-brand-100/85 hover:bg-white/10',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={toggleTheme}
          className="m-3 flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-brand-100 hover:bg-white/10"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          Tema {theme === 'dark' ? 'claro' : 'escuro'}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
        <StatusFooter />
      </div>
    </div>
  );
}
