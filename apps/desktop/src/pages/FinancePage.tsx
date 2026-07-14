import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import {
  deleteFinanceDay,
  getFinanceDay,
  listFinanceDays,
  syncFinanceFromClosedCash,
  updateFinanceDay,
  type FinanceDayRecord,
} from '../lib/finance';
import { listCashRegisters } from '../lib/cash';
import { listPurchases } from '../lib/purchases';
import { listSales } from '../lib/sales';
import { inCashWindow } from '../lib/item-summary';
import { downloadFinanceDayPdf, exportFinanceDayCsv } from '../lib/pdf';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import {
  isCashIn,
  movementLabel,
  movementTone,
} from '../lib/movement-labels';

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
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
        ok
          ? 'bg-moss-700/40 text-moss-400'
          : 'bg-amber-900/50 text-amber-200'
      }`}
    >
      {ok ? 'Conferido' : `Diff ${money(value)}`}
    </span>
  );
}

function TotalCell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'in' | 'out' | 'sale' | 'buy' | 'neutral';
}) {
  const color =
    tone === 'sale'
      ? 'text-emerald-300'
      : tone === 'buy'
        ? 'text-orange-300'
        : tone === 'in'
          ? 'text-moss-400'
          : tone === 'out'
            ? 'text-brand-400'
            : 'text-ink-50';
  const border =
    tone === 'sale'
      ? 'border-emerald-500/30'
      : tone === 'buy'
        ? 'border-orange-500/30'
        : 'border-white/10';
  return (
    <div className={`rounded-lg border bg-ink-900/30 px-3 py-2.5 ${border}`}>
      <div className="text-xs text-ink-300">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${color}`}>{money(value)}</div>
    </div>
  );
}

export function FinancePage() {
  const [searchParams] = useSearchParams();
  const [days, setDays] = useState<FinanceDayRecord[]>(() => listFinanceDays());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get('dia'),
  );
  const [filterDate, setFilterDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editInformed, setEditInformed] = useState('');
  const [editReason, setEditReason] = useState('');
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();

  const refresh = () => setDays(listFinanceDays());

  useEffect(() => {
    void syncFinanceFromClosedCash(
      listCashRegisters().filter((c) => c.status === 'CLOSED'),
    ).then(() => {
      refresh();
      const fromQuery = searchParams.get('dia');
      if (fromQuery) setSelectedId(fromQuery);
    });
  }, [searchParams]);

  const filtered = filterDate
    ? days.filter((d) => d.businessDate === filterDate)
    : days;

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
    return listPurchases().filter((p) =>
      inCashWindow(p.purchasedAt, selectedActive.openedAt, selectedActive.closedAt),
    );
  }, [selectedActive?.id, selectedActive?.openedAt, selectedActive?.closedAt, days]);

  const daySales = useMemo(() => {
    if (!selectedActive) return [];
    return listSales().filter((s) =>
      inCashWindow(s.soldAt, selectedActive.openedAt, selectedActive.closedAt),
    );
  }, [selectedActive?.id, selectedActive?.openedAt, selectedActive?.closedAt, days]);

  const otherMovements = useMemo(() => {
    if (!selectedActive) return [];
    return selectedActive.movements.filter(
      (m) => m.movementType !== 'COMPRA_PAGA' && m.movementType !== 'VENDA_RECEBIDA',
    );
  }, [selectedActive?.id, selectedActive?.movements]);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Resumo de cada dia após fechar o caixa — totais claros, movimentos e exportação."
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-md border border-moss-500/40 bg-moss-700/30 p-3 text-sm text-moss-400">
          {ok}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <PlaceholderCard>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Filtrar data">
              <input
                className={fieldClass}
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </Field>
            {filterDate && (
              <GhostButton onClick={() => setFilterDate('')}>Limpar</GhostButton>
            )}
          </div>

          <ul className="mt-4 max-h-[38rem] space-y-2 overflow-auto">
            {filtered.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`w-full cursor-context-menu rounded-xl border px-3 py-3 text-left transition ${
                    selectedId === d.id
                      ? 'border-brand-500 bg-brand-500/15'
                      : 'border-white/10 hover:border-brand-400/40'
                  }`}
                  onClick={() => {
                    setSelectedId(d.id);
                    setOk(null);
                    setError(null);
                  }}
                  onContextMenu={(e) =>
                    openCtx(e, [
                      {
                        id: 'view',
                        label: 'Ver',
                        onSelect: () => setSelectedId(d.id),
                      },
                      {
                        id: 'pdf',
                        label: 'Imprimir PDF',
                        onSelect: () => downloadFinanceDayPdf(d),
                      },
                      {
                        id: 'csv',
                        label: 'Exportar CSV',
                        onSelect: () => exportFinanceDayCsv(d),
                      },
                      {
                        id: 'del',
                        label: 'Excluir',
                        danger: true,
                        onSelect: () => {
                          if (!confirm('Excluir este resumo?')) return;
                          void deleteFinanceDay(d.id).then(() => {
                            if (selectedId === d.id) setSelectedId(null);
                            refresh();
                            setOk('Resumo excluído.');
                          });
                        },
                      },
                    ])
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-ink-50">
                      {fmtDate(d.businessDate)}
                    </div>
                    <DiffBadge value={d.difference} />
                  </div>
                  <div className="mt-1 text-sm text-ink-100">
                    Saldo {money(d.informedBalance)}
                  </div>
                  <div className="mt-1.5 text-xs text-ink-300">
                    <span className="text-orange-300">
                      Compras {money(d.totals.comprasPagas)}
                    </span>
                    {' · '}
                    <span className="text-emerald-300">
                      Vendas {money(d.totals.vendasRecebidas)}
                    </span>
                    {' · '}
                    Despesas {money(d.totals.despesas)}
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-sm text-ink-300">
                Nenhum dia ainda. Feche o caixa para gerar o resumo.
              </li>
            )}
          </ul>
        </PlaceholderCard>

        <div className="space-y-4">
          {!selectedActive ? (
            <PlaceholderCard>
              <p className="text-ink-300">
                Selecione um dia à esquerda para ver o resumo completo.
              </p>
            </PlaceholderCard>
          ) : (
            <>
              <PlaceholderCard>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-ink-50">
                      {fmtDate(selectedActive.businessDate)}
                    </h2>
                    <p className="mt-1 text-sm text-ink-300">
                      {new Date(selectedActive.openedAt).toLocaleString('pt-BR')} →{' '}
                      {new Date(selectedActive.closedAt).toLocaleString('pt-BR')}
                      {' · '}
                      {selectedActive.openedBy}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GhostButton
                      onClick={() => downloadFinanceDayPdf(selectedActive)}
                    >
                      PDF
                    </GhostButton>
                    <GhostButton
                      onClick={() => exportFinanceDayCsv(selectedActive)}
                    >
                      CSV
                    </GhostButton>
                    <GhostButton
                      onClick={() => {
                        if (
                          !confirm(
                            'Excluir este resumo do financeiro? O histórico do caixa permanece.',
                          )
                        ) {
                          return;
                        }
                        void deleteFinanceDay(selectedActive.id)
                          .then(() => {
                            setSelectedId(null);
                            refresh();
                            setOk('Resumo excluído.');
                          })
                          .catch((e: Error) => setError(e.message));
                      }}
                    >
                      Excluir
                    </GhostButton>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-ink-300">
                      Saldo inicial
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-ink-50">
                      {money(selectedActive.openingBalance)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-ink-300">
                      Esperado
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-ink-50">
                      {money(selectedActive.expectedBalance)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-wide text-ink-300">
                        Informado
                      </div>
                      <DiffBadge value={selectedActive.difference} />
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-ink-50">
                      {money(selectedActive.informedBalance)}
                    </div>
                  </div>
                </div>
              </PlaceholderCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <PlaceholderCard>
                  <h3 className="font-semibold text-ink-50">Saídas</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <TotalCell
                      label="Compras"
                      value={selectedActive.totals.comprasPagas}
                      tone="buy"
                    />
                    <TotalCell
                      label="Despesas"
                      value={selectedActive.totals.despesas}
                      tone="out"
                    />
                    <TotalCell
                      label="Sangrias"
                      value={selectedActive.totals.sangrias}
                      tone="out"
                    />
                    <TotalCell
                      label="Outras saídas"
                      value={selectedActive.totals.saidas}
                      tone="out"
                    />
                  </div>
                </PlaceholderCard>
                <PlaceholderCard>
                  <h3 className="font-semibold text-ink-50">Entradas</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <TotalCell
                      label="Vendas"
                      value={selectedActive.totals.vendasRecebidas}
                      tone="sale"
                    />
                    <TotalCell
                      label="Suprimentos"
                      value={selectedActive.totals.suprimentos}
                      tone="in"
                    />
                    <TotalCell
                      label="Outras entradas"
                      value={selectedActive.totals.entradas}
                      tone="in"
                    />
                  </div>
                </PlaceholderCard>
              </div>

              <PlaceholderCard>
                <h3 className="font-semibold text-orange-300">Compras do dia</h3>
                <p className="mt-0.5 text-xs text-ink-400">
                  Sucata recebida — material, peso e valor.
                </p>
                <ul className="mt-3 max-h-80 space-y-2 overflow-auto">
                  {dayPurchases.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-orange-500/25 bg-orange-500/5 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-ink-50">
                            {p.documentNumber} · {p.supplierName}
                          </div>
                          <div className="text-xs text-ink-400">
                            {new Date(p.purchasedAt).toLocaleString('pt-BR')}
                            {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-orange-300">
                          −{money(p.amountPaid)}
                        </div>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-sm text-ink-200">
                        {p.items.map((i) => (
                          <li key={i.id}>
                            {i.materialName} · {i.weight} kg · {money(i.lineTotal)}
                            <span className="text-ink-400">
                              {' '}
                              ({money(i.unitPrice)}/kg)
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                  {dayPurchases.length === 0 && (
                    <li className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-sm text-ink-300">
                      Nenhuma compra neste dia.
                    </li>
                  )}
                </ul>
              </PlaceholderCard>

              <PlaceholderCard>
                <h3 className="font-semibold text-emerald-300">Vendas do dia</h3>
                <p className="mt-0.5 text-xs text-ink-400">
                  Lotes vendidos — separado das compras.
                </p>
                <ul className="mt-3 max-h-80 space-y-2 overflow-auto">
                  {daySales.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-ink-50">
                            {s.documentNumber} · {s.customerName}
                          </div>
                          <div className="text-xs text-ink-400">
                            {new Date(s.soldAt).toLocaleString('pt-BR')}
                            {' · '}
                            {s.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'}
                            {s.receivedBy ? ` · ${s.receivedBy}` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-emerald-300">
                            +{money(s.amountReceived ?? s.netTotal)}
                          </div>
                          {typeof s.grossProfit === 'number' && (
                            <div className="text-xs text-moss-400">
                              lucro {money(s.grossProfit)}
                            </div>
                          )}
                        </div>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-sm text-ink-200">
                        {s.items.map((i) => (
                          <li key={i.id}>
                            {i.materialName} · {i.weight} kg · {money(i.lineTotal)}
                          </li>
                        ))}
                      </ul>
                      {s.discountAmount > 0 && (
                        <div className="mt-1 text-xs text-brand-400">
                          Desconto {money(s.discountAmount)}
                          {s.discountReason ? ` (${s.discountReason})` : ''}
                        </div>
                      )}
                    </li>
                  ))}
                  {daySales.length === 0 && (
                    <li className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-sm text-ink-300">
                      Nenhuma venda neste dia.
                    </li>
                  )}
                </ul>
              </PlaceholderCard>

              <PlaceholderCard>
                <h3 className="font-semibold text-ink-50">Outros lançamentos</h3>
                <p className="mt-0.5 text-xs text-ink-400">
                  Despesas, sangrias e ajustes (sem compras/vendas).
                </p>
                <ul className="mt-3 max-h-56 space-y-2 overflow-auto">
                  {otherMovements.map((m) => {
                    const tone = movementTone(m.movementType);
                    const income = isCashIn(m.movementType);
                    return (
                      <li
                        key={m.id}
                        className={`rounded-xl border border-white/10 bg-ink-900/30 px-3 py-3 ${tone.row ?? ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone.badge}`}
                              >
                                {movementLabel(m.movementType)}
                              </span>
                              <span className="text-xs text-ink-400">
                                {new Date(m.movedAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-ink-100">
                              {m.description}
                            </div>
                          </div>
                          <div className={`shrink-0 font-medium ${tone.amount}`}>
                            {income ? '+' : '−'}
                            {money(m.amount)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {otherMovements.length === 0 && (
                    <li className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-sm text-ink-300">
                      Sem outros lançamentos.
                    </li>
                  )}
                </ul>
              </PlaceholderCard>

              <PlaceholderCard>
                <h3 className="font-semibold text-ink-50">Ajustar / anotações</h3>
                <p className="mt-1 text-xs text-ink-300">
                  Corrija saldo informado, justificativa da diferença ou notas do dia.
                </p>
                <div className="mt-3 grid gap-3">
                  <Field label="Saldo informado (R$)">
                    <input
                      className={fieldClass}
                      value={editInformed}
                      onChange={(e) => setEditInformed(e.target.value)}
                    />
                  </Field>
                  <Field label="Justificativa da diferença">
                    <input
                      className={fieldClass}
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                    />
                  </Field>
                  <Field label="Observações">
                    <textarea
                      className={fieldClass}
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  </Field>
                  <PrimaryButton
                    onClick={() => {
                      setError(null);
                      void updateFinanceDay(selectedActive.id, {
                        informedBalance:
                          Number(editInformed.replace(',', '.')) || 0,
                        differenceReason: editReason,
                        notes: editNotes,
                      })
                        .then(() => {
                          refresh();
                          setOk('Resumo atualizado.');
                        })
                        .catch((e: Error) => setError(e.message));
                    }}
                  >
                    Salvar edição
                  </PrimaryButton>
                </div>
              </PlaceholderCard>
            </>
          )}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeCtx} />
    </div>
  );
}
