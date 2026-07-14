import { useEffect, useState } from 'react';
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
import { downloadFinanceDayPdf, exportFinanceDayCsv } from '../lib/pdf';

function money(n: number) {
  return `R$ ${n.toFixed(2)}`;
}

export function FinancePage() {
  const [days, setDays] = useState<FinanceDayRecord[]>(() => listFinanceDays());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editInformed, setEditInformed] = useState('');
  const [editReason, setEditReason] = useState('');

  const refresh = () => setDays(listFinanceDays());

  useEffect(() => {
    void syncFinanceFromClosedCash(
      listCashRegisters().filter((c) => c.status === 'CLOSED'),
    ).then(() => refresh());
  }, []);

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

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Resumo de cada dia após o fechamento do caixa — conferir, exportar, imprimir, editar ou excluir."
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

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <PlaceholderCard>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Filtrar por data">
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

          <ul className="mt-3 max-h-[36rem] space-y-2 overflow-auto text-sm">
            {filtered.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                    selectedId === d.id
                      ? 'border-brand-500 bg-brand-500/15'
                      : 'border-white/10 hover:border-brand-400/40'
                  }`}
                  onClick={() => {
                    setSelectedId(d.id);
                    setOk(null);
                    setError(null);
                  }}
                >
                  <div className="font-medium text-ink-50">
                    {d.businessDate.split('-').reverse().join('/')}
                  </div>
                  <div className="text-ink-300">
                    Fechado {new Date(d.closedAt).toLocaleString('pt-BR')}
                  </div>
                  <div className="mt-1 text-ink-100">
                    Informado {money(d.informedBalance)} · Diff{' '}
                    {money(d.difference)}
                  </div>
                  <div className="text-xs text-ink-300">
                    Vendas {money(d.totals.vendasRecebidas)} · Despesas{' '}
                    {money(d.totals.despesas)}
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-ink-300">
                Nenhum dia no financeiro ainda. Feche o caixa em Vendas e Caixa
                para gerar o resumo.
              </li>
            )}
          </ul>
        </PlaceholderCard>

        <div className="space-y-4">
          {!selectedActive ? (
            <PlaceholderCard>
              <p className="text-ink-300">
                Selecione um dia à esquerda para ver o detalhe, exportar ou
                editar.
              </p>
            </PlaceholderCard>
          ) : (
            <>
              <PlaceholderCard>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-ink-50">
                      Dia {selectedActive.businessDate.split('-').reverse().join('/')}
                    </h2>
                    <p className="mt-1 text-sm text-ink-300">
                      Aberto {new Date(selectedActive.openedAt).toLocaleString('pt-BR')}
                      {' · '}
                      Fechado {new Date(selectedActive.closedAt).toLocaleString('pt-BR')}
                      {' · '}
                      {selectedActive.openedBy}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GhostButton
                      onClick={() => downloadFinanceDayPdf(selectedActive)}
                    >
                      Imprimir PDF
                    </GhostButton>
                    <GhostButton
                      onClick={() => exportFinanceDayCsv(selectedActive)}
                    >
                      Exportar CSV
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

                <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
                  <div className="rounded-lg border border-white/10 px-3 py-2">
                    <div className="text-ink-300">Saldo inicial</div>
                    <div className="text-lg text-ink-50">
                      {money(selectedActive.openingBalance)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 px-3 py-2">
                    <div className="text-ink-300">Vendas recebidas</div>
                    <div className="text-lg text-moss-400">
                      {money(selectedActive.totals.vendasRecebidas)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 px-3 py-2">
                    <div className="text-ink-300">Despesas</div>
                    <div className="text-lg text-brand-400">
                      {money(selectedActive.totals.despesas)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 px-3 py-2">
                    <div className="text-ink-300">Sangrias</div>
                    <div className="text-lg text-ink-50">
                      {money(selectedActive.totals.sangrias)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 px-3 py-2">
                    <div className="text-ink-300">Saldo esperado</div>
                    <div className="text-lg text-ink-50">
                      {money(selectedActive.expectedBalance)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 px-3 py-2">
                    <div className="text-ink-300">Saldo informado / Diferença</div>
                    <div className="text-lg text-ink-50">
                      {money(selectedActive.informedBalance)} ·{' '}
                      {money(selectedActive.difference)}
                    </div>
                  </div>
                </div>

                <h3 className="mt-4 font-semibold text-ink-50">Como foi o dia</h3>
                <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
                  {selectedActive.movements.map((m) => (
                    <li key={m.id} className="border-b border-white/10 py-1.5">
                      <span className="text-ink-300">
                        {new Date(m.movedAt).toLocaleTimeString('pt-BR')} ·{' '}
                        {m.movementType}
                      </span>{' '}
                      — {money(m.amount)} — {m.description}
                    </li>
                  ))}
                  {selectedActive.movements.length === 0 && (
                    <li className="text-ink-300">Sem movimentos.</li>
                  )}
                </ul>
              </PlaceholderCard>

              <PlaceholderCard>
                <h3 className="font-semibold text-ink-50">Editar resumo</h3>
                <p className="mt-1 text-xs text-ink-300">
                  Ajuste saldo informado, justificativa ou observações do dia.
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
                        informedBalance: Number(editInformed.replace(',', '.')) || 0,
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
    </div>
  );
}
