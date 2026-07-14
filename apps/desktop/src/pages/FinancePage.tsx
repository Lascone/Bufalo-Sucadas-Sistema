import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { ReportFilters } from '../components/ReportFilters';
import {
  deleteFinanceDay,
  getFinanceDay,
  listFinanceDays,
  syncFinanceFromClosedCash,
  updateFinanceDay,
} from '../lib/finance';
import { listCashRegisters } from '../lib/cash';
import { listPurchases, type PurchaseRecord } from '../lib/purchases';
import { listSales, type SaleRecord } from '../lib/sales';
import { formatItemsSummary, inStrictCashWindow } from '../lib/item-summary';
import {
  buildFinalSummary,
  collectAvailableDays,
  defaultReportFilter,
  describeFilter,
  filterPurchases,
  filterSales,
  sumPurchases,
  sumSales,
  type ReportFilterState,
} from '../lib/reports';
import {
  downloadFinanceDayPdf,
  downloadFinalReportPdf,
  downloadPurchasesReportPdf,
  downloadSalesReportPdf,
  exportFinanceDayCsv,
  exportFinalReportCsv,
  exportPurchasesReportCsv,
  exportSalesReportCsv,
  shareFinanceDayPdfWhatsApp,
  shareFinalReportPdfWhatsApp,
  sharePurchasesReportPdfWhatsApp,
  shareSalesReportPdfWhatsApp,
} from '../lib/pdf';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import {
  isCashIn,
  movementLabel,
  movementTone,
} from '../lib/movement-labels';
import { getPurchase } from '../lib/purchases';
import { cn } from '../lib/utils';

type FinTab = 'compras' | 'vendas' | 'final' | 'caixa';

function money(n: number) {
  return `R$ ${n.toFixed(2)}`;
}

function fmtDate(isoDate: string) {
  return isoDate.split('-').reverse().join('/');
}

function DiffBadge({ value }: { value: number }) {
  const ok = Math.abs(value) < 0.01;
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
        ok ? 'bg-moss-700/40 text-moss-400' : 'bg-amber-900/50 text-amber-200'
      }`}
    >
      {ok ? 'OK' : `≠ ${money(value)}`}
    </span>
  );
}

function SummaryStrip({
  count,
  total,
  average,
  tone,
}: {
  count: number;
  total: number;
  average: number;
  tone: 'buy' | 'sale';
}) {
  const color = tone === 'buy' ? 'text-orange-300' : 'text-emerald-300';
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="rounded-lg border border-white/10 px-2.5 py-2">
        <div className="text-[10px] uppercase text-ink-400">Lançamentos</div>
        <div className="font-semibold text-ink-50">{count}</div>
      </div>
      <div className="rounded-lg border border-white/10 px-2.5 py-2">
        <div className="text-[10px] uppercase text-ink-400">Total</div>
        <div className={`font-semibold ${color}`}>{money(total)}</div>
      </div>
      <div className="rounded-lg border border-white/10 px-2.5 py-2">
        <div className="text-[10px] uppercase text-ink-400">Média</div>
        <div className="font-semibold text-ink-50">{money(average)}</div>
      </div>
    </div>
  );
}

function PurchaseRows({ rows }: { rows: PurchaseRecord[] }) {
  return (
    <ul className="max-h-[28rem] space-y-1 overflow-auto">
      {rows.map((p) => (
        <li
          key={p.id}
          className="flex items-baseline justify-between gap-2 rounded border border-orange-500/15 bg-orange-500/5 px-2 py-1.5 text-xs"
        >
          <div className="min-w-0 truncate">
            <span className="text-ink-50">{p.documentNumber}</span>
            {' · '}
            {p.supplierName}
            {' · '}
            <span className="text-ink-300">{formatItemsSummary(p.items)}</span>
            <div className="text-[10px] text-ink-400">
              {new Date(p.purchasedAt).toLocaleString('pt-BR')}
              {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
            </div>
          </div>
          <span className="shrink-0 font-semibold text-orange-300">
            −{money(p.amountPaid)}
          </span>
        </li>
      ))}
      {rows.length === 0 && (
        <li className="py-6 text-center text-sm text-ink-400">
          Nenhuma compra no filtro.
        </li>
      )}
    </ul>
  );
}

function SaleRows({ rows }: { rows: SaleRecord[] }) {
  return (
    <ul className="max-h-[28rem] space-y-1 overflow-auto">
      {rows.map((s) => (
        <li
          key={s.id}
          className="flex items-baseline justify-between gap-2 rounded border border-emerald-500/15 bg-emerald-500/5 px-2 py-1.5 text-xs"
        >
          <div className="min-w-0 truncate">
            <span className="text-ink-50">
              {s.items.map((i) => i.materialName).join(', ') || 'Lote'}
            </span>
            {' · '}
            {s.customerName}
            <div className="text-[10px] text-ink-400">
              {new Date(s.soldAt).toLocaleString('pt-BR')} ·{' '}
              {s.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'}
              {s.receivedBy ? ` · ${s.receivedBy}` : ''}
            </div>
          </div>
          <span className="shrink-0 font-semibold text-emerald-300">
            +{money(s.amountReceived ?? s.netTotal)}
          </span>
        </li>
      ))}
      {rows.length === 0 && (
        <li className="py-6 text-center text-sm text-ink-400">
          Nenhuma venda no filtro.
        </li>
      )}
    </ul>
  );
}

export function FinancePage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<FinTab>('vendas');
  const [filter, setFilter] = useState<ReportFilterState>(() => defaultReportFilter());
  const [tick, setTick] = useState(0);
  const [days, setDays] = useState(() => listFinanceDays());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get('dia'),
  );
  const [ok, setOk] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editInformed, setEditInformed] = useState('');
  const [editReason, setEditReason] = useState('');
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();

  const refresh = () => {
    setDays(listFinanceDays());
    setTick((t) => t + 1);
  };

  useEffect(() => {
    void syncFinanceFromClosedCash(
      listCashRegisters().filter((c) => c.status === 'CLOSED'),
    ).then(() => {
      refresh();
      const fromQuery = searchParams.get('dia');
      if (fromQuery) {
        setSelectedId(fromQuery);
        setTab('caixa');
      }
      const section = searchParams.get('secao');
      if (section === 'vendas' || section === 'compras' || section === 'final') {
        setTab(section);
      }
    });
  }, [searchParams]);

  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  void tick;
  const allPurchases = listPurchases();
  const allSales = listSales();

  const availableDays = useMemo(
    () =>
      collectAvailableDays([
        ...allPurchases.map((p) => p.purchasedAt),
        ...allSales.map((s) => s.soldAt),
      ]),
    [tick],
  );

  const filteredPurchases = useMemo(
    () => filterPurchases(allPurchases, filter),
    [filter, tick],
  );
  const filteredSales = useMemo(
    () => filterSales(allSales, filter),
    [filter, tick],
  );

  const purchaseSummary = useMemo(
    () => sumPurchases(filteredPurchases),
    [filteredPurchases],
  );
  const salesSummary = useMemo(() => sumSales(filteredSales), [filteredSales]);
  const finalSummary = useMemo(
    () => buildFinalSummary(filteredPurchases, filteredSales),
    [filteredPurchases, filteredSales],
  );

  const selected = selectedId ? getFinanceDay(selectedId) : null;
  const selectedActive = selected && !selected.deletedAt ? selected : null;

  useEffect(() => {
    if (selectedActive) {
      setEditNotes(selectedActive.notes);
      setEditInformed(String(selectedActive.informedBalance));
      setEditReason(selectedActive.differenceReason);
    }
  }, [selectedActive?.id]);

  const dayPurchases = useMemo(() => {
    if (!selectedActive) return [];
    const byId = new Map<string, PurchaseRecord>();
    for (const m of selectedActive.movements) {
      if (m.movementType !== 'COMPRA_PAGA') continue;
      if (m.refType === 'PURCHASE' && m.refId) {
        const p = getPurchase(m.refId);
        if (p) byId.set(p.id, p);
        continue;
      }
      const match = /Compra\s+(C-\d+)/i.exec(m.description);
      if (match) {
        const found = listPurchases().find((p) => p.documentNumber === match[1]);
        if (found) byId.set(found.id, found);
      }
    }
    if (byId.size > 0) {
      return [...byId.values()].sort((a, b) =>
        b.purchasedAt.localeCompare(a.purchasedAt),
      );
    }
    return listPurchases().filter((p) =>
      inStrictCashWindow(
        p.purchasedAt,
        selectedActive.openedAt,
        selectedActive.closedAt,
      ),
    );
  }, [selectedActive?.id, selectedActive?.movements, tick]);

  const otherMovements = useMemo(() => {
    if (!selectedActive) return [];
    return selectedActive.movements.filter(
      (m) => m.movementType !== 'COMPRA_PAGA' && m.movementType !== 'VENDA_RECEBIDA',
    );
  }, [selectedActive?.id, selectedActive?.movements]);

  const navItems: Array<{ id: FinTab; label: string; hint: string }> = [
    { id: 'compras', label: 'Compras', hint: 'Relatório' },
    { id: 'vendas', label: 'Vendas', hint: 'Relatório' },
    { id: 'final', label: 'Relatório final', hint: 'Consolidado' },
    { id: 'caixa', label: 'Caixa', hint: 'Fechamentos' },
  ];

  const exportPurchases = () => {
    const rows = filteredPurchases.map((p) => ({
      at: new Date(p.purchasedAt).toLocaleString('pt-BR'),
      documentNumber: p.documentNumber,
      supplier: p.supplierName,
      materials: formatItemsSummary(p.items),
      amount: p.amountPaid,
      payment: p.paymentMethod,
    }));
    return {
      title: 'Relatório de compras',
      filterLabel: describeFilter(filter),
      total: purchaseSummary.total,
      count: purchaseSummary.count,
      rows,
    };
  };

  const exportSales = () => {
    const rows = filteredSales.map((s) => ({
      at: new Date(s.soldAt).toLocaleString('pt-BR'),
      documentNumber: s.documentNumber,
      customer: s.customerName,
      materials: s.items.map((i) => i.materialName).join(', '),
      amount: s.amountReceived ?? s.netTotal,
      payment: s.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro',
      receivedBy: s.receivedBy,
    }));
    return {
      title: 'Relatório de vendas',
      filterLabel: describeFilter(filter),
      total: salesSummary.total,
      count: salesSummary.count,
      rows,
    };
  };

  const shareHint = (hint: string) => setOk(hint);

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Compras e vendas com os mesmos filtros — período ou dias marcados. Relatório final consolida os dois."
        actions={
          <Link
            to="/vendas"
            className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/10"
          >
            Nova venda
          </Link>
        }
      />

      {ok && (
        <div className="mb-3 rounded border border-moss-500/40 bg-moss-700/30 px-3 py-2 text-sm text-moss-400">
          {ok}
        </div>
      )}

      <div className="flex gap-3">
        <aside className="w-40 shrink-0 space-y-1">
          {navItems.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setTab(n.id)}
              className={cn(
                'w-full rounded-lg border px-2.5 py-2 text-left text-sm transition',
                tab === n.id
                  ? 'border-brand-500 bg-brand-500/15 text-ink-50'
                  : 'border-white/10 text-ink-300 hover:border-white/25',
              )}
            >
              <div className="font-medium">{n.label}</div>
              <div className="text-[10px] text-ink-400">{n.hint}</div>
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          {(tab === 'compras' || tab === 'vendas' || tab === 'final') && (
            <ReportFilters
              filter={filter}
              onChange={setFilter}
              availableDays={availableDays}
            />
          )}

          {tab === 'compras' && (
            <PlaceholderCard className="!p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-orange-300">
                  Relatório de compras
                </h2>
                <div className="flex gap-1.5">
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() => downloadPurchasesReportPdf(exportPurchases())}
                  >
                    PDF
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      void sharePurchasesReportPdfWhatsApp(exportPurchases()).then(
                        (r) => shareHint(r.hint),
                      )
                    }
                  >
                    WhatsApp
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      exportPurchasesReportCsv(exportPurchases().rows)
                    }
                  >
                    CSV
                  </GhostButton>
                </div>
              </div>
              <p className="mb-2 text-xs text-ink-400">{describeFilter(filter)}</p>
              <SummaryStrip
                count={purchaseSummary.count}
                total={purchaseSummary.total}
                average={purchaseSummary.average}
                tone="buy"
              />
              {purchaseSummary.byMaterial.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-300">
                  {purchaseSummary.byMaterial.slice(0, 8).map((m) => (
                    <span
                      key={m.name}
                      className="rounded border border-white/10 px-1.5 py-0.5"
                    >
                      {m.name} {money(m.total)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <PurchaseRows rows={filteredPurchases} />
              </div>
            </PlaceholderCard>
          )}

          {tab === 'vendas' && (
            <PlaceholderCard className="!p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-emerald-300">
                  Relatório de vendas
                </h2>
                <div className="flex gap-1.5">
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() => downloadSalesReportPdf(exportSales())}
                  >
                    PDF
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      void shareSalesReportPdfWhatsApp(exportSales()).then((r) =>
                        shareHint(r.hint),
                      )
                    }
                  >
                    WhatsApp
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() => exportSalesReportCsv(exportSales().rows)}
                  >
                    CSV
                  </GhostButton>
                </div>
              </div>
              <p className="mb-2 text-xs text-ink-400">{describeFilter(filter)}</p>
              <SummaryStrip
                count={salesSummary.count}
                total={salesSummary.total}
                average={salesSummary.average}
                tone="sale"
              />
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-300">
                {salesSummary.byPayment.map((m) => (
                  <span
                    key={m.method}
                    className="rounded border border-emerald-500/20 px-1.5 py-0.5"
                  >
                    {m.method} {money(m.total)}
                  </span>
                ))}
                {salesSummary.byReceiver.map((m) => (
                  <span
                    key={m.name}
                    className="rounded border border-white/10 px-1.5 py-0.5"
                  >
                    {m.name} {money(m.total)}
                  </span>
                ))}
              </div>
              <div className="mt-3">
                <SaleRows rows={filteredSales} />
              </div>
            </PlaceholderCard>
          )}

          {tab === 'final' && (
            <PlaceholderCard className="!p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-ink-50">Relatório final</h2>
                <div className="flex gap-1.5">
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      downloadFinalReportPdf({
                        filterLabel: describeFilter(filter),
                        purchasesTotal: finalSummary.purchases.total,
                        salesTotal: finalSummary.sales.total,
                        balance: finalSummary.balance,
                        purchaseCount: finalSummary.purchases.count,
                        saleCount: finalSummary.sales.count,
                      })
                    }
                  >
                    PDF
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      void shareFinalReportPdfWhatsApp({
                        filterLabel: describeFilter(filter),
                        purchasesTotal: finalSummary.purchases.total,
                        salesTotal: finalSummary.sales.total,
                        balance: finalSummary.balance,
                        purchaseCount: finalSummary.purchases.count,
                        saleCount: finalSummary.sales.count,
                      }).then((r) => shareHint(r.hint))
                    }
                  >
                    WhatsApp
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      exportFinalReportCsv({
                        filterLabel: describeFilter(filter),
                        purchasesTotal: finalSummary.purchases.total,
                        salesTotal: finalSummary.sales.total,
                        balance: finalSummary.balance,
                        purchaseCount: finalSummary.purchases.count,
                        saleCount: finalSummary.sales.count,
                      })
                    }
                  >
                    CSV
                  </GhostButton>
                </div>
              </div>
              <p className="mb-2 text-xs text-ink-400">{describeFilter(filter)}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-orange-500/25 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">Compras</div>
                  <div className="text-lg font-semibold text-orange-300">
                    {money(finalSummary.purchases.total)}
                  </div>
                  <div className="text-[10px] text-ink-400">
                    {finalSummary.purchases.count} lançamentos
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-500/25 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">Vendas</div>
                  <div className="text-lg font-semibold text-emerald-300">
                    {money(finalSummary.sales.total)}
                  </div>
                  <div className="text-[10px] text-ink-400">
                    {finalSummary.sales.count} lançamentos
                  </div>
                </div>
                <div className="rounded-lg border border-white/15 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">
                    Saldo (V − C)
                  </div>
                  <div
                    className={`text-lg font-semibold ${
                      finalSummary.balance >= 0
                        ? 'text-emerald-300'
                        : 'text-orange-300'
                    }`}
                  >
                    {money(finalSummary.balance)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-orange-300">
                    Compras
                  </h3>
                  <PurchaseRows rows={filteredPurchases} />
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-emerald-300">
                    Vendas
                  </h3>
                  <SaleRows rows={filteredSales} />
                </div>
              </div>
            </PlaceholderCard>
          )}

          {tab === 'caixa' && (
            <>
              <PlaceholderCard className="!p-3">
                <h2 className="mb-2 text-sm font-semibold text-ink-50">
                  Fechamentos de caixa
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`shrink-0 cursor-context-menu rounded-lg border px-3 py-2 text-left ${
                        selectedId === d.id
                          ? 'border-brand-500 bg-brand-500/20'
                          : 'border-white/10'
                      }`}
                      onClick={() => setSelectedId(d.id)}
                      onContextMenu={(e) =>
                        openCtx(e, [
                          {
                            id: 'pdf',
                            label: 'PDF',
                            onSelect: () => downloadFinanceDayPdf(d),
                          },
                          {
                            id: 'wpp',
                            label: 'WhatsApp',
                            onSelect: () => {
                              void shareFinanceDayPdfWhatsApp(d).then((r) =>
                                shareHint(r.hint),
                              );
                            },
                          },
                          {
                            id: 'csv',
                            label: 'CSV',
                            onSelect: () => exportFinanceDayCsv(d),
                          },
                          {
                            id: 'del',
                            label: 'Excluir',
                            danger: true,
                            onSelect: () => {
                              if (!confirm('Excluir?')) return;
                              void deleteFinanceDay(d.id).then(() => {
                                if (selectedId === d.id) setSelectedId(null);
                                refresh();
                              });
                            },
                          },
                        ])
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {fmtDate(d.businessDate)}
                        </span>
                        <DiffBadge value={d.difference} />
                      </div>
                      <div className="text-[11px] text-orange-300">
                        C {money(d.totals.comprasPagas)}
                      </div>
                    </button>
                  ))}
                  {days.length === 0 && (
                    <p className="text-sm text-ink-400">Nenhum caixa fechado.</p>
                  )}
                </div>
              </PlaceholderCard>

              {selectedActive && (
                <>
                  <PlaceholderCard className="!p-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">
                          Caixa · {fmtDate(selectedActive.businessDate)}
                        </h3>
                        <p className="text-xs text-ink-400">
                          {new Date(selectedActive.openedAt).toLocaleString('pt-BR')} →{' '}
                          {new Date(selectedActive.closedAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <GhostButton
                          className="!py-1 text-xs"
                          onClick={() => downloadFinanceDayPdf(selectedActive)}
                        >
                          PDF
                        </GhostButton>
                        <GhostButton
                          className="!py-1 text-xs"
                          onClick={() =>
                            void shareFinanceDayPdfWhatsApp(selectedActive).then(
                              (r) => shareHint(r.hint),
                            )
                          }
                        >
                          WhatsApp
                        </GhostButton>
                        <GhostButton
                          className="!py-1 text-xs"
                          onClick={() => exportFinanceDayCsv(selectedActive)}
                        >
                          CSV
                        </GhostButton>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Inicial {money(selectedActive.openingBalance)}
                      </div>
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Esperado {money(selectedActive.expectedBalance)}
                      </div>
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Informado {money(selectedActive.informedBalance)}
                      </div>
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Diff {money(selectedActive.difference)}
                      </div>
                    </div>
                  </PlaceholderCard>
                  <PlaceholderCard className="!p-3">
                    <h3 className="mb-1 text-xs font-semibold text-orange-300">
                      Compras deste caixa ({dayPurchases.length})
                    </h3>
                    <PurchaseRows rows={dayPurchases} />
                  </PlaceholderCard>
                  <PlaceholderCard className="!p-3">
                    <h3 className="mb-1 text-xs font-semibold text-ink-50">
                      Outros ({otherMovements.length})
                    </h3>
                    <ul className="max-h-40 space-y-0.5 overflow-auto text-xs">
                      {otherMovements.map((m) => {
                        const tone = movementTone(m.movementType);
                        const income = isCashIn(m.movementType);
                        return (
                          <li
                            key={m.id}
                            className="flex justify-between gap-2 border-b border-white/5 py-1"
                          >
                            <span>
                              <span className={`mr-1 rounded px-1 ${tone.badge}`}>
                                {movementLabel(m.movementType)}
                              </span>
                              {m.description}
                            </span>
                            <span className={tone.amount}>
                              {income ? '+' : '−'}
                              {money(m.amount)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </PlaceholderCard>
                  <PlaceholderCard className="!p-3">
                    <h3 className="text-sm font-semibold">Ajustar</h3>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <Field label="Saldo informado">
                        <input
                          className={`${fieldClass} !py-1.5`}
                          value={editInformed}
                          onChange={(e) => setEditInformed(e.target.value)}
                        />
                      </Field>
                      <Field label="Justificativa">
                        <input
                          className={`${fieldClass} !py-1.5`}
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                        />
                      </Field>
                      <Field label="Obs.">
                        <input
                          className={`${fieldClass} !py-1.5`}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                        />
                      </Field>
                    </div>
                    <PrimaryButton
                      className="mt-2 !py-1.5"
                      onClick={() => {
                        void updateFinanceDay(selectedActive.id, {
                          informedBalance:
                            Number(editInformed.replace(',', '.')) || 0,
                          differenceReason: editReason,
                          notes: editNotes,
                        }).then(() => {
                          refresh();
                          setOk('Atualizado.');
                        });
                      }}
                    >
                      Salvar
                    </PrimaryButton>
                  </PlaceholderCard>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeCtx} />
    </div>
  );
}
