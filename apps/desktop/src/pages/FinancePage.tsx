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
  groupFinanceDaysByBusinessDate,
  listFinanceDays,
  syncFinanceFromClosedCash,
  updateFinanceDay,
  type FinanceDayGroup,
} from '../lib/finance';
import { listCashRegisters, setCashMovementVoided, type CashMovement } from '../lib/cash';
import { listPurchases, setPurchaseVoided, type PurchaseRecord } from '../lib/purchases';
import { listSales, setSaleVoided, type SaleRecord } from '../lib/sales';
import { formatItemsSummary, inStrictCashWindow } from '../lib/item-summary';
import {
  collectAvailableDays,
  defaultReportFilter,
  describeFilter,
  filterFileSlug,
  filterPurchases,
  filterSales,
  matchesReportFilter,
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
import { useAppStore } from '../stores/app-store';

type FinTab = 'compras' | 'vendas' | 'trocado' | 'final' | 'caixa';

const VOID_ROW =
  'border-violet-500 bg-violet-600/40 ring-2 ring-violet-300/80 text-violet-50';
const VOID_BADGE =
  'rounded bg-violet-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-950';

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

function businessDateLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type VoidTarget =
  | { kind: 'purchase'; id: string; label: string; voided: boolean }
  | { kind: 'sale'; id: string; label: string; voided: boolean }
  | { kind: 'movement'; id: string; label: string; voided: boolean };

function VoidDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: VoidTarget;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const reinstate = target.voided;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-xl border border-violet-400/50 bg-ink-900 p-5 shadow-xl">
        <h3 className="text-base font-semibold text-ink-50">
          {reinstate ? 'Reativar registro' : 'Anular registro'}
        </h3>
        <p className="mt-1 text-sm text-ink-300">{target.label}</p>
        {!reinstate ? (
          <>
            <p className="mt-3 text-xs text-ink-400">
              Continua visível com destaque roxo, mas sai de todos os totais e
              cálculos. Motivo é opcional — pode só confirmar.
            </p>
            <label className="mt-3 block text-xs font-medium text-ink-300">
              Motivo (opcional)
              <textarea
                className={`${fieldClass} mt-1 !py-2`}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: lançamento duplicado, erro de valor…"
              />
            </label>
          </>
        ) : (
          <p className="mt-3 text-xs text-ink-400">
            O registro volta a entrar nos totais e cálculos.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <GhostButton className="!py-1.5 text-xs" onClick={onClose} disabled={busy}>
            Cancelar
          </GhostButton>
          <button
            type="button"
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60',
              reinstate
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-violet-700 hover:bg-violet-600 ring-2 ring-violet-300/70',
            )}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm(reason.trim())
                .catch(() => undefined)
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Salvando…' : reinstate ? 'Reativar' : 'Anular'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchaseRows({
  rows,
  cashBusinessDate,
  onVoidRequest,
}: {
  rows: PurchaseRecord[];
  /** Se a data da compra ≠ data do caixa, marca REMARCADO. */
  cashBusinessDate?: string;
  onVoidRequest?: (target: VoidTarget) => void;
}) {
  return (
    <ul className="max-h-[28rem] space-y-1 overflow-auto">
      {rows.map((p) => {
        const purchaseDay = businessDateLocal(p.purchasedAt);
        const remarcado =
          !!cashBusinessDate && purchaseDay !== cashBusinessDate;
        const voided = Boolean(p.voidedAt);
        return (
          <li
            key={p.id}
            className={cn(
              'flex items-baseline justify-between gap-2 rounded border px-2 py-1.5 text-xs',
              voided
                ? VOID_ROW
                : remarcado
                  ? 'border-sky-400/40 bg-sky-500/15 ring-1 ring-sky-400/30'
                  : 'border-orange-500/15 bg-orange-500/5',
            )}
            onContextMenu={
              onVoidRequest
                ? (e) => {
                    e.preventDefault();
                    onVoidRequest({
                      kind: 'purchase',
                      id: p.id,
                      label: `${p.documentNumber} · ${p.supplierName}`,
                      voided,
                    });
                  }
                : undefined
            }
          >
            <div className="min-w-0 truncate">
              <span className={cn(voided && 'line-through opacity-80')}>
                {p.documentNumber}
              </span>
              {voided ? (
                <span className={cn('ml-1.5 inline-block', VOID_BADGE)}>
                  Anulado
                </span>
              ) : remarcado ? (
                <span className="ml-1.5 inline-block rounded bg-sky-400/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-950">
                  Remarcado
                </span>
              ) : null}
              {' · '}
              {p.supplierName}
              {' · '}
              <span className={voided ? 'text-violet-100/80' : 'text-ink-300'}>
                {formatItemsSummary(p.items)}
              </span>
              <div
                className={cn(
                  'text-[10px]',
                  voided
                    ? 'text-violet-100/70'
                    : remarcado
                      ? 'text-sky-200/90'
                      : 'text-ink-400',
                )}
              >
                {new Date(p.purchasedAt).toLocaleString('pt-BR')}
                {remarcado && !voided
                  ? ` · data da compra ≠ dia do caixa (${cashBusinessDate})`
                  : ''}
                {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
                {p.createdBy ? ` · ${p.createdBy}` : ''}
                {voided && p.voidReason ? ` · Motivo: ${p.voidReason}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'font-semibold',
                  voided && 'line-through opacity-80',
                  !voided && (remarcado ? 'text-sky-200' : 'text-orange-300'),
                )}
              >
                −{money(p.amountPaid)}
              </span>
              {onVoidRequest ? (
                <button
                  type="button"
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                    voided
                      ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      : 'bg-violet-500/25 text-violet-100 hover:bg-violet-500/40',
                  )}
                  onClick={() =>
                    onVoidRequest({
                      kind: 'purchase',
                      id: p.id,
                      label: `${p.documentNumber} · ${p.supplierName}`,
                      voided,
                    })
                  }
                >
                  {voided ? 'Reativar' : 'Anular'}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
      {rows.length === 0 && (
        <li className="py-6 text-center text-sm text-ink-400">
          Nenhum material comprado no filtro.
        </li>
      )}
    </ul>
  );
}

function SaleRows({
  rows,
  onVoidRequest,
}: {
  rows: SaleRecord[];
  onVoidRequest?: (target: VoidTarget) => void;
}) {
  return (
    <ul className="max-h-[28rem] space-y-1 overflow-auto">
      {rows.map((s) => {
        const voided = Boolean(s.voidedAt);
        return (
          <li
            key={s.id}
            className={cn(
              'flex items-baseline justify-between gap-2 rounded border px-2 py-1.5 text-xs',
              voided
                ? VOID_ROW
                : 'border-emerald-500/15 bg-emerald-500/5',
            )}
            onContextMenu={
              onVoidRequest
                ? (e) => {
                    e.preventDefault();
                    onVoidRequest({
                      kind: 'sale',
                      id: s.id,
                      label: `${s.documentNumber} · ${s.customerName}`,
                      voided,
                    });
                  }
                : undefined
            }
          >
            <div className="min-w-0 truncate">
              <span className={cn(voided && 'line-through opacity-80')}>
                {s.items.map((i) => i.materialName).join(', ') || 'Lote'}
              </span>
              {voided ? (
                <span className={cn('ml-1.5 inline-block', VOID_BADGE)}>
                  Anulado
                </span>
              ) : null}
              {' · '}
              {s.customerName}
              <div
                className={cn(
                  'text-[10px]',
                  voided ? 'text-violet-100/70' : 'text-ink-400',
                )}
              >
                {new Date(s.soldAt).toLocaleString('pt-BR')} ·{' '}
                {s.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'}
                {s.receivedBy ? ` · ${s.receivedBy}` : ''}
                {voided && s.voidReason ? ` · Motivo: ${s.voidReason}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'font-semibold',
                  voided
                    ? 'line-through opacity-80'
                    : 'text-emerald-300',
                )}
              >
                +{money(s.amountReceived ?? s.netTotal)}
              </span>
              {onVoidRequest ? (
                <button
                  type="button"
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                    voided
                      ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      : 'bg-violet-500/25 text-violet-100 hover:bg-violet-500/40',
                  )}
                  onClick={() =>
                    onVoidRequest({
                      kind: 'sale',
                      id: s.id,
                      label: `${s.documentNumber} · ${s.customerName}`,
                      voided,
                    })
                  }
                >
                  {voided ? 'Reativar' : 'Anular'}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
      {rows.length === 0 && (
        <li className="py-6 text-center text-sm text-ink-400">
          Nenhuma venda no filtro.
        </li>
      )}
    </ul>
  );
}

function MovementRows({
  rows,
  emptyLabel,
  onVoidRequest,
}: {
  rows: CashMovement[];
  emptyLabel: string;
  onVoidRequest?: (target: VoidTarget) => void;
}) {
  return (
    <ul className="max-h-[28rem] space-y-1 overflow-auto">
      {rows.map((m) => {
        const voided = Boolean(m.voidedAt);
        const income = isCashIn(m.movementType);
        const tone = movementTone(m.movementType);
        return (
          <li
            key={m.id}
            className={cn(
              'flex items-baseline justify-between gap-2 rounded border px-2 py-1.5 text-xs',
              voided ? VOID_ROW : 'border-white/10 bg-white/[0.03]',
            )}
            onContextMenu={
              onVoidRequest
                ? (e) => {
                    e.preventDefault();
                    onVoidRequest({
                      kind: 'movement',
                      id: m.id,
                      label: `${movementLabel(m.movementType)} · ${m.description || '—'}`,
                      voided,
                    });
                  }
                : undefined
            }
          >
            <div className="min-w-0 truncate">
              <span
                className={cn(
                  'mr-1 rounded px-1',
                  voided ? 'bg-violet-950/50 text-violet-100' : tone.badge,
                )}
              >
                {movementLabel(m.movementType)}
              </span>
              {voided ? (
                <span className={cn('mr-1 inline-block', VOID_BADGE)}>
                  Anulado
                </span>
              ) : null}
              <span className={cn(voided && 'line-through opacity-80')}>
                {m.description || '—'}
              </span>
              <div
                className={cn(
                  'text-[10px]',
                  voided ? 'text-violet-100/70' : 'text-ink-400',
                )}
              >
                {new Date(m.movedAt).toLocaleString('pt-BR')}
                {m.paymentMethod ? ` · ${m.paymentMethod}` : ''}
                {voided && m.voidReason ? ` · Motivo: ${m.voidReason}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'font-semibold',
                  voided && 'line-through opacity-80',
                  !voided && tone.amount,
                )}
              >
                {income ? '+' : '−'}
                {money(m.amount)}
              </span>
              {onVoidRequest ? (
                <button
                  type="button"
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                    voided
                      ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      : 'bg-violet-500/25 text-violet-100 hover:bg-violet-500/40',
                  )}
                  onClick={() =>
                    onVoidRequest({
                      kind: 'movement',
                      id: m.id,
                      label: `${movementLabel(m.movementType)} · ${m.description || '—'}`,
                      voided,
                    })
                  }
                >
                  {voided ? 'Reativar' : 'Anular'}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
      {rows.length === 0 && (
        <li className="py-6 text-center text-sm text-ink-400">{emptyLabel}</li>
      )}
    </ul>
  );
}

function collectCashMovements(filter: ReportFilterState): CashMovement[] {
  const out: CashMovement[] = [];
  for (const cash of listCashRegisters()) {
    for (const m of cash.movements) {
      if (matchesReportFilter(m.movedAt, filter)) out.push(m);
    }
  }
  return out.sort((a, b) => b.movedAt.localeCompare(a.movedAt));
}

function groupToPdfInput(g: FinanceDayGroup) {
  return {
    businessDate: g.businessDate,
    openedAt: g.openedAt,
    closedAt: g.closedAt,
    openedBy: g.openedBy,
    openingBalance: g.openingBalance,
    expectedBalance: g.expectedBalance,
    informedBalance: g.informedBalance,
    difference: g.difference,
    differenceReason: g.sessions
      .map((s) => s.differenceReason)
      .filter(Boolean)
      .join(' · '),
    notes: g.notes,
    sessionCount: g.sessions.length,
    totals: g.totals,
    movements: g.timeline.map((item) =>
      item.kind === 'cut'
        ? {
            movedAt: item.at,
            movementType: 'SESSION_CUT',
            amount: 0,
            description: `── ${item.label} ──`,
            isCut: true,
          }
        : {
            movedAt: item.movement.movedAt,
            movementType: item.movement.movementType,
            amount: item.movement.amount,
            description: item.movement.description,
            detail: item.movement.detail,
          },
    ),
  };
}

export function FinancePage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<FinTab>('vendas');
  const [filter, setFilter] = useState<ReportFilterState>(() => defaultReportFilter());
  const [tick, setTick] = useState(0);
  const [days, setDays] = useState(() => listFinanceDays());
  const [selectedBusinessDate, setSelectedBusinessDate] = useState<string | null>(
    null,
  );
  const [ok, setOk] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editInformed, setEditInformed] = useState('');
  const [editReason, setEditReason] = useState('');
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();
  const operatorName = useAppStore((s) => s.session.username);

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
        const day = getFinanceDay(fromQuery);
        if (day) {
          setSelectedBusinessDate(day.businessDate);
          setTab('caixa');
        }
      }
      const section = searchParams.get('secao');
      if (
        section === 'vendas' ||
        section === 'compras' ||
        section === 'trocado' ||
        section === 'final' ||
        section === 'caixa'
      ) {
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
  const dayGroups = useMemo(
    () => groupFinanceDaysByBusinessDate(days),
    [days, tick],
  );
  const selectedGroup = selectedBusinessDate
    ? dayGroups.find((g) => g.businessDate === selectedBusinessDate) ?? null
    : null;
  const selectedActive = selectedGroup?.sessions[selectedGroup.sessions.length - 1] ?? null;

  const availableDays = useMemo(
    () =>
      collectAvailableDays([
        ...allPurchases.map((p) => p.purchasedAt),
        ...allSales.map((s) => s.soldAt),
        ...listCashRegisters().flatMap((c) => c.movements.map((m) => m.movedAt)),
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
  const cashMovs = useMemo(() => collectCashMovements(filter), [filter, tick]);

  const cashExpenses = useMemo(
    () => cashMovs.filter((m) => m.movementType === 'DESPESA'),
    [cashMovs],
  );
  /** Trocado: venda p/ Caixa + suprimento (F9). Não entra em Vendas. */
  const cashTrocados = useMemo(
    () =>
      cashMovs.filter(
        (m) => m.movementType === 'TROCADO' || m.movementType === 'SUPRIMENTO',
      ),
    [cashMovs],
  );
  const cashEntradas = useMemo(
    () => cashMovs.filter((m) => m.movementType === 'ENTRADA'),
    [cashMovs],
  );
  /** Vendas só no caixa sem venda vinculada (sem TROCADO). */
  const cashOnlySales = useMemo(() => {
    const saleIds = new Set(filteredSales.map((s) => s.id));
    return cashMovs.filter((m) => {
      if (m.movementType !== 'VENDA_RECEBIDA') return false;
      if (m.refType === 'SALE' && m.refId && saleIds.has(m.refId)) return false;
      return true;
    });
  }, [cashMovs, filteredSales]);

  const activeExpenses = useMemo(
    () => cashExpenses.filter((m) => !m.voidedAt),
    [cashExpenses],
  );
  const activeTrocados = useMemo(
    () => cashTrocados.filter((m) => !m.voidedAt),
    [cashTrocados],
  );
  const activeCashOnlySales = useMemo(
    () => cashOnlySales.filter((m) => !m.voidedAt),
    [cashOnlySales],
  );
  const activeEntradas = useMemo(
    () => cashEntradas.filter((m) => !m.voidedAt),
    [cashEntradas],
  );

  const purchaseSummary = useMemo(
    () => sumPurchases(filteredPurchases),
    [filteredPurchases],
  );
  const salesSummary = useMemo(() => sumSales(filteredSales), [filteredSales]);

  const purchasesTotalWithCash =
    Math.round(
      (purchaseSummary.total +
        activeExpenses.reduce((a, m) => a + m.amount, 0)) *
        100,
    ) / 100;
  const salesTotalWithCash =
    Math.round(
      (salesSummary.total +
        activeCashOnlySales.reduce((a, m) => a + m.amount, 0)) *
        100,
    ) / 100;
  const expensesTotal =
    Math.round(activeExpenses.reduce((a, m) => a + m.amount, 0) * 100) / 100;
  const trocadoTotal =
    Math.round(activeTrocados.reduce((a, m) => a + m.amount, 0) * 100) / 100;
  const suppliesTotal =
    Math.round(
      (trocadoTotal + activeEntradas.reduce((a, m) => a + m.amount, 0)) * 100,
    ) / 100;

  useEffect(() => {
    if (selectedActive) {
      setEditNotes(selectedGroup?.notes ?? selectedActive.notes);
      setEditInformed(String(selectedGroup?.informedBalance ?? selectedActive.informedBalance));
      setEditReason(selectedActive.differenceReason);
    }
  }, [selectedGroup?.businessDate, selectedActive?.id]);

  const dayPurchases = useMemo(() => {
    if (!selectedGroup) return [];
    const byId = new Map<string, PurchaseRecord>();
    for (const m of selectedGroup.movements) {
      if (m.movementType !== 'COMPRA_PAGA') continue;
      if (m.refType === 'PURCHASE' && m.refId) {
        const p = getPurchase(m.refId);
        if (p) byId.set(p.id, p);
        continue;
      }
      const match =
        /(?:Material comprado|Compra)\s+(C-\d+)/i.exec(m.description);
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
        selectedGroup.openedAt,
        selectedGroup.closedAt,
      ),
    );
  }, [selectedGroup?.businessDate, selectedGroup?.movements, tick]);

  const otherMovements = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.timeline;
  }, [selectedGroup?.businessDate, selectedGroup?.timeline]);

  const navItems: Array<{ id: FinTab; label: string; hint: string }> = [
    { id: 'compras', label: 'Compras', hint: 'Relatório' },
    { id: 'vendas', label: 'Vendas', hint: 'Relatório' },
    { id: 'trocado', label: 'Trocado', hint: 'Caixa / F9' },
    { id: 'final', label: 'Relatório final', hint: 'Consolidado' },
    { id: 'caixa', label: 'Caixa', hint: 'Fechamentos' },
  ];

  const confirmVoid = async (reason: string) => {
    if (!voidTarget) return;
    const voided = !voidTarget.voided;
    const by = operatorName || undefined;
    if (voidTarget.kind === 'purchase') {
      await setPurchaseVoided({
        purchaseId: voidTarget.id,
        voided,
        reason: voided ? reason : undefined,
        voidedBy: by,
      });
    } else if (voidTarget.kind === 'sale') {
      await setSaleVoided({
        saleId: voidTarget.id,
        voided,
        reason: voided ? reason : undefined,
        voidedBy: by,
      });
    } else {
      await setCashMovementVoided({
        movementId: voidTarget.id,
        voided,
        reason: voided ? reason : undefined,
        voidedBy: by,
      });
    }
    await syncFinanceFromClosedCash(
      listCashRegisters().filter((c) => c.status === 'CLOSED'),
    );
    setVoidTarget(null);
    refresh();
    setOk(voided ? 'Registro anulado.' : 'Registro reativado.');
  };

  const exportPurchases = () => {
    const rows = [
      ...filteredPurchases
        .filter((p) => !p.voidedAt)
        .map((p) => ({
        at: new Date(p.purchasedAt).toLocaleString('pt-BR'),
        documentNumber: p.documentNumber,
        supplier: p.createdBy
          ? `${p.supplierName} · ${p.createdBy}`
          : p.supplierName,
        materials: formatItemsSummary(p.items),
        amount: p.amountPaid,
        payment: p.paymentMethod,
        source: 'compra' as const,
      })),
      ...activeExpenses.map((m) => ({
        at: new Date(m.movedAt).toLocaleString('pt-BR'),
        documentNumber: 'GASTO',
        supplier: 'Caixa · gasto',
        materials: m.description || 'Despesa',
        amount: m.amount,
        payment: m.paymentMethod || 'DINHEIRO',
        source: 'caixa' as const,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      title: 'Relatório de compras e gastos',
      filterLabel: describeFilter(filter),
      fileSlug: filterFileSlug(filter),
      total: purchasesTotalWithCash,
      count: rows.length,
      rows,
    };
  };

  const exportSales = () => {
    const rows = [
      ...filteredSales
        .filter((s) => !s.voidedAt)
        .map((s) => {
        const lot = s.lotSale ?? s.items.every((i) => !i.weight);
        return {
          at: new Date(s.soldAt).toLocaleString('pt-BR'),
          documentNumber: s.documentNumber,
          customer: s.customerName,
          materials: lot
            ? s.items.map((i) => i.materialName).join(', ')
            : formatItemsSummary(s.items),
          amount: s.amountReceived ?? s.netTotal,
          payment: s.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro',
          receivedBy: s.receivedBy || '—',
          saleType: lot ? 'Lote' : 'Por peso',
          discount: s.discountAmount ?? 0,
          source: 'venda' as const,
        };
      }),
      ...activeCashOnlySales.map((m) => ({
        at: new Date(m.movedAt).toLocaleString('pt-BR'),
        documentNumber: 'CAIXA',
        customer: 'Caixa · venda',
        materials: m.description || movementLabel(m.movementType),
        amount: m.amount,
        payment: m.paymentMethod || 'Dinheiro',
        receivedBy: 'Caixa',
        saleType: 'Caixa',
        discount: 0,
        source: 'caixa' as const,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      title: 'Relatório de vendas',
      filterLabel: describeFilter(filter),
      fileSlug: filterFileSlug(filter),
      total: salesTotalWithCash,
      count: rows.length,
      rows,
    };
  };

  const exportFinalPayload = () => {
    const purchaseRows = exportPurchases().rows;
    const saleRows = exportSales().rows;
    return {
      filterLabel: describeFilter(filter),
      fileSlug: filterFileSlug(filter),
      purchasesTotal: purchasesTotalWithCash,
      salesTotal: salesTotalWithCash,
      expensesTotal,
      suppliesTotal,
      balance:
        Math.round((salesTotalWithCash - purchasesTotalWithCash) * 100) / 100,
      purchaseCount: purchaseRows.length,
      saleCount: saleRows.length,
      expenseCount: cashExpenses.length,
      purchaseRows,
      saleRows,
    };
  };

  const shareHint = (hint: string) => setOk(hint);
  const shareFail = (e: unknown) =>
    setOk(
      e instanceof Error ? e.message : 'Falha ao abrir WhatsApp',
    );

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
          {(tab === 'compras' ||
            tab === 'vendas' ||
            tab === 'trocado' ||
            tab === 'final') && (
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
                      void sharePurchasesReportPdfWhatsApp(exportPurchases())
                        .then((r) => shareHint(r.hint))
                        .catch(shareFail)
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
                count={purchaseSummary.count + activeExpenses.length}
                total={purchasesTotalWithCash}
                average={
                  purchaseSummary.count + activeExpenses.length > 0
                    ? purchasesTotalWithCash /
                      (purchaseSummary.count + activeExpenses.length)
                    : 0
                }
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
                <PurchaseRows
                  rows={filteredPurchases}
                  onVoidRequest={setVoidTarget}
                />
                {cashExpenses.length > 0 && (
                  <div className="mt-3">
                    <h3 className="mb-1 text-xs font-semibold text-red-300">
                      Gastos avulsos do caixa
                    </h3>
                    <MovementRows
                      rows={cashExpenses}
                      emptyLabel="Nenhum gasto."
                      onVoidRequest={setVoidTarget}
                    />
                  </div>
                )}
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
                      void shareSalesReportPdfWhatsApp(exportSales())
                        .then((r) => shareHint(r.hint))
                        .catch(shareFail)
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
                count={salesSummary.count + activeCashOnlySales.length}
                total={salesTotalWithCash}
                average={
                  salesSummary.count + activeCashOnlySales.length > 0
                    ? salesTotalWithCash /
                      (salesSummary.count + activeCashOnlySales.length)
                    : 0
                }
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
                <SaleRows rows={filteredSales} onVoidRequest={setVoidTarget} />
                {cashOnlySales.length > 0 && (
                  <div className="mt-3">
                    <h3 className="mb-1 text-xs font-semibold text-emerald-300">
                      Vendas só no caixa
                    </h3>
                    <MovementRows
                      rows={cashOnlySales}
                      emptyLabel="Nenhuma."
                      onVoidRequest={setVoidTarget}
                    />
                  </div>
                )}
              </div>
            </PlaceholderCard>
          )}

          {tab === 'trocado' && (
            <PlaceholderCard className="!p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-sky-300">
                  Relatório de trocado
                </h2>
              </div>
              <p className="mb-2 text-xs text-ink-400">
                {describeFilter(filter)} · Vendas com recebedor Caixa e
                suprimentos (F9 Adicionar trocado). Não entram no relatório de
                vendas.
              </p>
              <SummaryStrip
                count={activeTrocados.length}
                total={trocadoTotal}
                average={
                  activeTrocados.length > 0
                    ? trocadoTotal / activeTrocados.length
                    : 0
                }
                tone="sale"
              />
              <div className="mt-3">
                <MovementRows
                  rows={cashTrocados}
                  emptyLabel="Nenhum trocado no filtro."
                  onVoidRequest={setVoidTarget}
                />
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
                    onClick={() => downloadFinalReportPdf(exportFinalPayload())}
                  >
                    PDF
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      void shareFinalReportPdfWhatsApp(exportFinalPayload())
                        .then((r) => shareHint(r.hint))
                        .catch(shareFail)
                    }
                  >
                    WhatsApp
                  </GhostButton>
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() => {
                      const p = exportFinalPayload();
                      exportFinalReportCsv({
                        filterLabel: p.filterLabel,
                        purchasesTotal: p.purchasesTotal,
                        salesTotal: p.salesTotal,
                        balance: p.balance,
                        purchaseCount: p.purchaseCount,
                        saleCount: p.saleCount,
                      });
                    }}
                  >
                    CSV
                  </GhostButton>
                </div>
              </div>
              <p className="mb-2 text-xs text-ink-400">{describeFilter(filter)}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border border-orange-500/25 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">
                    Compras + gastos
                  </div>
                  <div className="text-lg font-semibold text-orange-300">
                    {money(purchasesTotalWithCash)}
                  </div>
                  <div className="text-[10px] text-ink-400">
                    {purchaseSummary.count + activeExpenses.length} lançamentos
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-500/25 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">
                    Vendas
                  </div>
                  <div className="text-lg font-semibold text-emerald-300">
                    {money(salesTotalWithCash)}
                  </div>
                  <div className="text-[10px] text-ink-400">
                    {salesSummary.count + activeCashOnlySales.length} lançamentos
                  </div>
                </div>
                <div className="rounded-lg border border-sky-500/25 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">
                    Trocado
                  </div>
                  <div className="text-lg font-semibold text-sky-300">
                    {money(trocadoTotal)}
                  </div>
                  <div className="text-[10px] text-ink-400">
                    {activeTrocados.length} lançamentos
                  </div>
                </div>
                <div className="rounded-lg border border-red-500/25 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">
                    Gastos avulsos
                  </div>
                  <div className="text-lg font-semibold text-red-300">
                    {money(expensesTotal)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/15 px-3 py-2">
                  <div className="text-[10px] uppercase text-ink-400">
                    Saldo (E − S)
                  </div>
                  <div
                    className={`text-lg font-semibold ${
                      salesTotalWithCash - purchasesTotalWithCash >= 0
                        ? 'text-emerald-300'
                        : 'text-orange-300'
                    }`}
                  >
                    {money(
                      Math.round(
                        (salesTotalWithCash - purchasesTotalWithCash) * 100,
                      ) / 100,
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-orange-300">
                    Compras e gastos
                  </h3>
                  <PurchaseRows
                    rows={filteredPurchases}
                    onVoidRequest={setVoidTarget}
                  />
                  {cashExpenses.length > 0 && (
                    <div className="mt-2">
                      <MovementRows
                        rows={cashExpenses}
                        emptyLabel="Nenhum gasto."
                        onVoidRequest={setVoidTarget}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-emerald-300">
                    Vendas
                  </h3>
                  <SaleRows
                    rows={filteredSales}
                    onVoidRequest={setVoidTarget}
                  />
                  {cashOnlySales.length > 0 && (
                    <div className="mt-2">
                      <MovementRows
                        rows={cashOnlySales}
                        emptyLabel="Nenhuma."
                        onVoidRequest={setVoidTarget}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-sky-300">
                    Trocado
                  </h3>
                  <MovementRows
                    rows={cashTrocados}
                    emptyLabel="Nenhum trocado."
                    onVoidRequest={setVoidTarget}
                  />
                </div>
              </div>
            </PlaceholderCard>
          )}

          {tab === 'caixa' && (
            <>
              <PlaceholderCard className="!p-3">
                <h2 className="mb-2 text-sm font-semibold text-ink-50">
                  Caixa por dia
                </h2>
                <p className="mb-2 text-[11px] text-ink-400">
                  Vários abre/fecha no mesmo dia aparecem juntos, com linhas de
                  corte entre sessões.
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dayGroups.map((g) => (
                    <button
                      key={g.businessDate}
                      type="button"
                      className={`shrink-0 cursor-context-menu rounded-lg border px-3 py-2 text-left ${
                        selectedBusinessDate === g.businessDate
                          ? 'border-brand-500 bg-brand-500/20'
                          : 'border-white/10'
                      }`}
                      onClick={() => setSelectedBusinessDate(g.businessDate)}
                      onContextMenu={(e) =>
                        openCtx(e, [
                          {
                            id: 'pdf',
                            label: 'PDF do dia',
                            onSelect: () =>
                              downloadFinanceDayPdf(groupToPdfInput(g)),
                          },
                          {
                            id: 'wpp',
                            label: 'WhatsApp',
                            onSelect: () => {
                              void shareFinanceDayPdfWhatsApp(groupToPdfInput(g))
                                .then((r) => shareHint(r.hint))
                                .catch(shareFail);
                            },
                          },
                          {
                            id: 'csv',
                            label: 'CSV',
                            onSelect: () =>
                              exportFinanceDayCsv(groupToPdfInput(g)),
                          },
                          {
                            id: 'del',
                            label: 'Excluir todas as sessões do dia',
                            danger: true,
                            onSelect: () => {
                              if (
                                !confirm(
                                  `Excluir ${g.sessions.length} fechamento(s) do dia ${fmtDate(g.businessDate)}?`,
                                )
                              ) {
                                return;
                              }
                              void Promise.all(
                                g.sessions.map((s) => deleteFinanceDay(s.id)),
                              ).then(() => {
                                if (selectedBusinessDate === g.businessDate) {
                                  setSelectedBusinessDate(null);
                                }
                                refresh();
                              });
                            },
                          },
                        ])
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {fmtDate(g.businessDate)}
                        </span>
                        <DiffBadge value={g.difference} />
                      </div>
                      <div className="text-[11px] text-orange-300">
                        C {money(g.totals.comprasPagas)}
                        {g.sessions.length > 1
                          ? ` · ${g.sessions.length} sessões`
                          : ''}
                      </div>
                    </button>
                  ))}
                  {dayGroups.length === 0 && (
                    <p className="text-sm text-ink-400">Nenhum caixa fechado.</p>
                  )}
                </div>
              </PlaceholderCard>

              {selectedGroup && selectedActive && (
                <>
                  <PlaceholderCard className="!p-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">
                          Caixa · {fmtDate(selectedGroup.businessDate)}
                        </h3>
                        <p className="text-xs text-ink-400">
                          {new Date(selectedGroup.openedAt).toLocaleString('pt-BR')}{' '}
                          →{' '}
                          {new Date(selectedGroup.closedAt).toLocaleString('pt-BR')}
                          {selectedGroup.sessions.length > 1
                            ? ` · ${selectedGroup.sessions.length} aberturas`
                            : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <GhostButton
                          className="!py-1 text-xs"
                          onClick={() =>
                            downloadFinanceDayPdf(groupToPdfInput(selectedGroup))
                          }
                        >
                          PDF
                        </GhostButton>
                        <GhostButton
                          className="!py-1 text-xs"
                          onClick={() =>
                            void shareFinanceDayPdfWhatsApp(
                              groupToPdfInput(selectedGroup),
                            )
                              .then((r) => shareHint(r.hint))
                              .catch(shareFail)
                          }
                        >
                          WhatsApp
                        </GhostButton>
                        <GhostButton
                          className="!py-1 text-xs"
                          onClick={() =>
                            exportFinanceDayCsv(groupToPdfInput(selectedGroup))
                          }
                        >
                          CSV
                        </GhostButton>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Inicial {money(selectedGroup.openingBalance)}
                      </div>
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Esperado {money(selectedGroup.expectedBalance)}
                      </div>
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Informado {money(selectedGroup.informedBalance)}
                      </div>
                      <div className="rounded border border-white/10 px-2 py-1.5">
                        Diff {money(selectedGroup.difference)}
                      </div>
                    </div>
                  </PlaceholderCard>
                  <PlaceholderCard className="!p-3">
                    <h3 className="text-sm font-semibold">
                      Ajustar última sessão
                    </h3>
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
                  <PlaceholderCard className="!p-3">
                    <h3 className="mb-1 text-xs font-semibold text-orange-300">
                      Material comprado neste dia ({dayPurchases.length})
                    </h3>
                    <PurchaseRows
                      rows={dayPurchases}
                      cashBusinessDate={selectedGroup.businessDate}
                      onVoidRequest={setVoidTarget}
                    />
                  </PlaceholderCard>
                  <PlaceholderCard className="!p-3">
                    <h3 className="mb-1 text-xs font-semibold text-ink-50">
                      Movimentos do dia ({otherMovements.length})
                    </h3>
                    <ul className="max-h-64 space-y-0.5 overflow-auto text-xs">
                      {otherMovements.map((item, idx) => {
                        if (item.kind === 'cut') {
                          return (
                            <li
                              key={`cut-${idx}-${item.at}`}
                              className="my-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-center text-[11px] font-semibold text-amber-200"
                            >
                              ── {item.label} ──
                            </li>
                          );
                        }
                        const m = item.movement;
                        const voided = Boolean(m.voidedAt);
                        const tone = movementTone(m.movementType);
                        const income = isCashIn(m.movementType);
                        return (
                          <li
                            key={m.id}
                            className={cn(
                              'flex justify-between gap-2 border-b border-white/5 py-1',
                              voided &&
                                'rounded border border-violet-500 bg-violet-600/40 px-1.5 ring-1 ring-violet-300/70',
                            )}
                            onContextMenu={(e) =>
                              openCtx(e, [
                                {
                                  id: 'void',
                                  label: voided ? 'Reativar' : 'Anular',
                                  onSelect: () =>
                                    setVoidTarget({
                                      kind: 'movement',
                                      id: m.id,
                                      label: `${movementLabel(m.movementType)} · ${m.description || '—'}`,
                                      voided,
                                    }),
                                },
                              ])
                            }
                          >
                            <span>
                              <span
                                className={cn(
                                  'mr-1 rounded px-1',
                                  voided
                                    ? 'bg-violet-950/50 text-violet-100'
                                    : tone.badge,
                                )}
                              >
                                {movementLabel(m.movementType)}
                              </span>
                              {voided ? (
                                <span className={cn('mr-1', VOID_BADGE)}>
                                  Anulado
                                </span>
                              ) : null}
                              <span
                                className={cn(
                                  voided && 'line-through opacity-80',
                                )}
                              >
                                {m.description}
                              </span>
                              {voided && m.voidReason ? (
                                <span className="text-violet-100/70">
                                  {' '}
                                  · {m.voidReason}
                                </span>
                              ) : null}
                            </span>
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  voided
                                    ? 'line-through opacity-80'
                                    : tone.amount,
                                )}
                              >
                                {income ? '+' : '−'}
                                {money(m.amount)}
                              </span>
                              <button
                                type="button"
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                  voided
                                    ? 'bg-emerald-500/20 text-emerald-200'
                                    : 'bg-violet-500/25 text-violet-100',
                                )}
                                onClick={() =>
                                  setVoidTarget({
                                    kind: 'movement',
                                    id: m.id,
                                    label: `${movementLabel(m.movementType)} · ${m.description || '—'}`,
                                    voided,
                                  })
                                }
                              >
                                {voided ? 'Reativar' : 'Anular'}
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </PlaceholderCard>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeCtx} />
      {voidTarget ? (
        <VoidDialog
          target={voidTarget}
          onClose={() => setVoidTarget(null)}
          onConfirm={confirmVoid}
        />
      ) : null}
    </div>
  );
}
