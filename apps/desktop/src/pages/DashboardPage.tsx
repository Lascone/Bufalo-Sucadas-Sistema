import { Link } from 'react-router-dom';
import { Banknote } from 'lucide-react';
import { PlaceholderCard } from '../components/Page';
import { useAppStore } from '../stores/app-store';
import { listPurchases } from '../lib/purchases';
import { listSales } from '../lib/sales';
import { getPatioBalances } from '../lib/patio';
import { todayIsoDate } from '../lib/reports';
import { localBusinessDate } from '../lib/item-summary';
import { calcExpected, getOpenCash } from '../lib/cash';

function money(n: number) {
  return `R$ ${n.toFixed(2)}`;
}

export function DashboardPage() {
  const sync = useAppStore((s) => s.sync);
  const today = todayIsoDate();

  const purchasesToday = listPurchases().filter(
    (p) => localBusinessDate(p.purchasedAt) === today,
  );
  const salesToday = listSales().filter(
    (s) => localBusinessDate(s.soldAt) === today,
  );
  const purchasesTotal = purchasesToday.reduce((a, p) => a + p.amountPaid, 0);
  const salesTotal = salesToday.reduce(
    (a, s) => a + (s.amountReceived ?? s.netTotal),
    0,
  );
  const patioValue = getPatioBalances().reduce((a, b) => a + b.stockValue, 0);
  const open = getOpenCash();
  const cashExpected = open ? calcExpected(open) : null;

  const cards = [
    [
      'Compras hoje',
      money(purchasesTotal),
      `${purchasesToday.length} lançamento${purchasesToday.length === 1 ? '' : 's'}`,
    ],
    [
      'Vendas hoje',
      money(salesTotal),
      `${salesToday.length} lançamento${salesToday.length === 1 ? '' : 's'}`,
    ],
    ['No pátio', money(patioValue), 'valor em estoque'],
    [
      'Pendências sync',
      String(sync.pendingCount),
      sync.pendingCount === 0 ? 'tudo enviado' : 'aguardando envio',
    ],
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
              Búfalo Sucata Gestor
            </h1>
            <p className="mt-2 max-w-xl text-ink-200">
              Compra, venda e caixa do ferro-velho — funciona offline e sincroniza
              quando houver internet.
            </p>
            <Link
              to="/caixa"
              className="mt-5 inline-flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-brand-500 px-6 py-4 text-lg font-bold text-ink-950 shadow-panel transition hover:bg-brand-400 sm:w-auto"
            >
              <Banknote className="h-6 w-6" />
              Ir para o Caixa
            </Link>
            {cashExpected !== null && (
              <p className="mt-2 text-sm text-ink-300">
                Caixa aberto · esperado {money(cashExpected)}
              </p>
            )}
          </div>
          <img
            src="/logo.png"
            alt="Logo Búfalo Sucatas"
            className="mx-auto max-h-44 w-auto object-contain drop-shadow-xl"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <PlaceholderCard key={label}>
            <p className="text-sm text-ink-300">{label}</p>
            <p className="mt-2 font-display text-3xl text-brand-400">{value}</p>
            <p className="mt-1 text-xs text-ink-400">{hint}</p>
          </PlaceholderCard>
        ))}
      </div>
    </div>
  );
}
