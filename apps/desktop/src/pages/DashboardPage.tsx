import { PlaceholderCard } from '../components/Page';
import { useAppStore } from '../stores/app-store';

export function DashboardPage() {
  const sync = useAppStore((s) => s.sync);

  const cards = [
    ['Compras hoje', '—'],
    ['Vendas hoje', '—'],
    ['No pátio', '—'],
    ['Pendências sync', String(sync.pendingCount)],
  ] as const;

  return (
    <div>
      <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/70 shadow-panel">
        <div className="grid items-center gap-4 p-5 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-moss-400">
              Búfalo Sucatas
            </p>
            <h1 className="mt-2 font-display text-5xl tracking-wide text-brand-400">
              FerroGestor
            </h1>
            <p className="mt-2 max-w-xl text-ink-200">
              Compra, venda e caixa do ferro-velho — funciona offline e sincroniza quando houver
              internet.
            </p>
          </div>
          <img
            src="/logo.png"
            alt="Logo Búfalo Sucatas"
            className="mx-auto max-h-44 w-auto object-contain drop-shadow-xl"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <PlaceholderCard key={label}>
            <p className="text-sm text-ink-300">{label}</p>
            <p className="mt-2 font-display text-3xl text-brand-400">{value}</p>
          </PlaceholderCard>
        ))}
      </div>
    </div>
  );
}
