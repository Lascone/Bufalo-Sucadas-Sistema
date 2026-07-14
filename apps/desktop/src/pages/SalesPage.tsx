import { useEffect, useMemo, useState } from 'react';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import {
  getMaterial,
  lineTotal,
  listMaterials,
  weightFromTotal,
} from '../lib/materials';
import { addSaleComment, createSale, listSales, type SaleRecord } from '../lib/sales';
import {
  addQuickExpense,
  calcExpected,
  closeCash,
  getOpenCash,
  getSuggestedOpeningBalance,
  getTodayAutoCloseAt,
  listCashRegisters,
  maybeAutoCloseCash,
  openCash,
  type CashRegisterRecord,
} from '../lib/cash';
import { upsertFinanceDayFromCash } from '../lib/finance';
import { getSettings } from '../lib/settings';
import { downloadCashClosePdf, downloadSalePdf } from '../lib/pdf';
import { useAppStore } from '../stores/app-store';

type DraftItem = {
  key: string;
  materialId: string;
  weight: string;
  unitPrice: string;
  lineTotal: string;
};

function newDraftItem(): DraftItem {
  const first = listMaterials(true)[0];
  return {
    key: `${Date.now()}-${Math.random()}`,
    materialId: first?.id ?? '',
    weight: '',
    unitPrice: first ? String(first.sellPrice) : '',
    lineTotal: '',
  };
}

export function SalesPage() {
  const username = useAppStore((s) => s.session.username);
  const settings = getSettings();
  const commentsEnabled = settings['sales.commentsEnabled'];
  const materials = listMaterials(true);

  const [tick, setTick] = useState(0);
  const refreshCash = () => setTick((t) => t + 1);
  void tick;

  const open = getOpenCash();
  const expected = open ? calcExpected(open) : 0;
  const history = listCashRegisters().filter((c) => c.status === 'CLOSED').slice(0, 8);
  const autoCloseAt = settings['cash.autoCloseEnabled']
    ? getTodayAutoCloseAt(settings['cash.autoCloseTime'])
    : null;

  const [sales, setSales] = useState<SaleRecord[]>(() => listSales());
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>(() => [newDraftItem()]);
  const [amountReceived, setAmountReceived] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [openingBalance, setOpeningBalance] = useState(() =>
    String(getSuggestedOpeningBalance().amount),
  );
  const [openAdjustNote, setOpenAdjustNote] = useState('');
  const [informed, setInformed] = useState('');
  const [reason, setReason] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  const selected = sales.find((s) => s.id === selectedId) ?? null;
  const suggested = getSuggestedOpeningBalance();

  const previewTotal = useMemo(
    () =>
      items.reduce((acc, i) => {
        const fromFields = lineTotal(Number(i.weight) || 0, Number(i.unitPrice) || 0);
        const explicit = Number(i.lineTotal);
        return acc + (Number.isFinite(explicit) && i.lineTotal !== '' ? explicit : fromFields);
      }, 0),
    [items],
  );

  const refreshSales = () => setSales(listSales());

  useEffect(() => {
    const handleClosed = async (closed: CashRegisterRecord | null) => {
      if (!closed) return;
      await upsertFinanceDayFromCash(closed);
      setInfo('Caixa fechado automaticamente pelo horário configurado.');
      setOpeningBalance(String(closed.informedBalance ?? calcExpected(closed)));
      refreshCash();
    };
    void maybeAutoCloseCash().then(handleClosed);
    const id = setInterval(() => {
      void maybeAutoCloseCash().then(handleClosed);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) {
      setOpeningBalance(String(getSuggestedOpeningBalance().amount));
    }
  }, [open, tick]);

  const updateItem = (
    key: string,
    patch: Partial<DraftItem> & { editSource?: 'weight' | 'unitPrice' | 'total' | 'material' },
  ) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        const source = patch.editSource;

        if (source === 'material' && patch.materialId) {
          const mat = getMaterial(patch.materialId);
          if (mat) {
            next.unitPrice = String(mat.sellPrice);
            const w = Number(next.weight) || 0;
            next.lineTotal = w > 0 ? String(lineTotal(w, mat.sellPrice)) : '';
          }
          return next;
        }

        const weight = Number(next.weight);
        const unitPrice = Number(next.unitPrice);
        const total = Number(next.lineTotal);

        if (source === 'weight' || source === 'unitPrice') {
          if (Number.isFinite(weight) && Number.isFinite(unitPrice) && unitPrice >= 0) {
            next.lineTotal =
              next.weight === '' ? '' : String(lineTotal(weight || 0, unitPrice || 0));
          }
        } else if (source === 'total') {
          if (
            Number.isFinite(total) &&
            Number.isFinite(unitPrice) &&
            unitPrice > 0 &&
            next.lineTotal !== ''
          ) {
            next.weight = String(weightFromTotal(total, unitPrice));
          }
        }

        return next;
      }),
    );
  };

  const submitSale = () => {
    setError(null);
    setInfo(null);
    const mapped = items
      .map((i) => {
        const mat = getMaterial(i.materialId);
        if (!mat) return null;
        const unitPrice = Number(i.unitPrice);
        let weight = Number(i.weight);
        const total = Number(i.lineTotal);
        if ((!Number.isFinite(weight) || weight <= 0) && Number.isFinite(total) && total > 0) {
          weight = weightFromTotal(total, unitPrice);
        }
        if (!Number.isFinite(weight) || weight <= 0) return null;
        if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;
        return {
          materialId: mat.id,
          materialName: mat.name,
          weight,
          unitPrice,
          buyPriceRef: mat.buyPrice,
        };
      })
      .filter(Boolean) as Array<{
      materialId: string;
      materialName: string;
      weight: number;
      unitPrice: number;
      buyPriceRef: number;
    }>;

    if (!mapped.length) {
      setError('Informe peso ou total válido em pelo menos um material.');
      return;
    }

    const receivedRaw = amountReceived.trim();
    const received =
      receivedRaw === '' ? undefined : Number(receivedRaw.replace(',', '.'));

    void createSale({
      customerName: customerName || 'Cliente',
      notes,
      items: mapped,
      amountReceived: received,
      openedBy: username,
    })
      .then(({ sale, cashInfo }) => {
        setCustomerName('');
        setNotes('');
        setAmountReceived('');
        setItems([newDraftItem()]);
        setSelectedId(sale.id);
        refreshSales();
        refreshCash();
        if (cashInfo) setInfo(cashInfo);
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div>
      <PageHeader
        title="Vendas e Caixa"
        subtitle="Venda de materiais e dinheiro do dia na mesma tela. Peso e total se calculam juntos; gastos extras e fechamento também ficam aqui."
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-4 rounded-md border border-moss-500/40 bg-moss-700/30 p-3 text-sm text-moss-400">
          {info}
        </div>
      )}

      <PlaceholderCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink-50">
              {open ? 'Caixa aberto' : 'Caixa fechado'}
            </h2>
            {open ? (
              <p className="mt-1 text-sm text-ink-300">
                Desde {new Date(open.openedAt).toLocaleString('pt-BR')} — {open.openedBy}
                {' · '}Saldo esperado R$ {expected.toFixed(2)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-300">
                Ao finalizar uma venda ou gasto, o caixa abre sozinho (saldo padrão da
                configuração).
              </p>
            )}
            {settings['cash.autoCloseEnabled'] && autoCloseAt && (
              <p className="mt-1 text-xs text-ink-400">
                Fechamento automático hoje às {settings['cash.autoCloseTime']}
              </p>
            )}
          </div>
          {!open && (
            <div className="mt-3 w-full max-w-xl space-y-3 border-t border-white/10 pt-3">
              {suggested.source === 'last_close' && suggested.fromCash && (
                <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm">
                  <p className="text-ink-100">
                    No último fechamento (
                    {new Date(suggested.fromCash.closedAt!).toLocaleString('pt-BR')}
                    ) sobrou{' '}
                    <strong className="text-brand-400">
                      R$ {suggested.amount.toFixed(2)}
                    </strong>
                    .
                  </p>
                  <p className="mt-1 text-xs text-ink-300">
                    Quer abrir com o mesmo valor de ontem, ou ajustou (adicionou /
                    gastou) fora do sistema?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PrimaryButton
                      className="!py-1.5 text-xs"
                      onClick={() => {
                        setOpeningBalance(String(suggested.amount));
                        setOpenAdjustNote('');
                      }}
                    >
                      Usar R$ {suggested.amount.toFixed(2)}
                    </PrimaryButton>
                    <GhostButton
                      className="!py-1.5 text-xs"
                      onClick={() => {
                        setOpeningBalance('');
                        setOpenAdjustNote('Ajustei o valor em relação ao fechamento anterior');
                      }}
                    >
                      Quero ajustar o valor
                    </GhostButton>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Saldo inicial (R$)">
                  <input
                    className={`${fieldClass} w-36`}
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder={String(suggested.amount)}
                  />
                </Field>
                <Field label="Obs. (se ajustou)">
                  <input
                    className={`${fieldClass} min-w-[12rem]`}
                    value={openAdjustNote}
                    onChange={(e) => setOpenAdjustNote(e.target.value)}
                    placeholder="Ex.: gastei R$50 no caminho"
                  />
                </Field>
                <PrimaryButton
                  onClick={() => {
                    setError(null);
                    const amount = Number(openingBalance.replace(',', '.'));
                    void openCash({
                      openedBy: username,
                      openingBalance: Number.isFinite(amount) ? amount : 0,
                      notes: openAdjustNote || undefined,
                      allowMultiple: settings['cash.allowMultipleOpen'],
                    })
                      .then(() => {
                        setOpenAdjustNote('');
                        refreshCash();
                      })
                      .catch((e: Error) => setError(e.message));
                  }}
                >
                  Abrir caixa
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      </PlaceholderCard>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">Nova venda</h2>
          <div className="mt-3 grid gap-3">
            <Field label="Cliente / comprador">
              <input
                className={fieldClass}
                placeholder="Nome ou empresa"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-100">Itens</span>
                <GhostButton
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => setItems((prev) => [...prev, newDraftItem()])}
                  disabled={!materials.length}
                >
                  + Material
                </GhostButton>
              </div>

              {!materials.length && (
                <p className="text-sm text-amber-200">
                  Cadastre materiais ativos em Materiais antes de vender.
                </p>
              )}

              {items.map((row) => {
                const mat = getMaterial(row.materialId);
                return (
                  <div
                    key={row.key}
                    className="rounded-lg border border-white/10 bg-ink-900/50 p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Material">
                        <select
                          className={fieldClass}
                          value={row.materialId}
                          onChange={(e) =>
                            updateItem(row.key, {
                              materialId: e.target.value,
                              editSource: 'material',
                            })
                          }
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Peso (kg)">
                        <input
                          className={fieldClass}
                          inputMode="decimal"
                          placeholder="1"
                          value={row.weight}
                          onChange={(e) =>
                            updateItem(row.key, {
                              weight: e.target.value,
                              editSource: 'weight',
                            })
                          }
                        />
                      </Field>
                      <Field label="Preço venda (R$/kg)">
                        <input
                          className={fieldClass}
                          inputMode="decimal"
                          value={row.unitPrice}
                          onChange={(e) =>
                            updateItem(row.key, {
                              unitPrice: e.target.value,
                              editSource: 'unitPrice',
                            })
                          }
                        />
                      </Field>
                      <Field label="Total da linha (R$)">
                        <input
                          className={fieldClass}
                          inputMode="decimal"
                          placeholder="0,00"
                          value={row.lineTotal}
                          onChange={(e) =>
                            updateItem(row.key, {
                              lineTotal: e.target.value,
                              editSource: 'total',
                            })
                          }
                        />
                      </Field>
                    </div>
                    {mat && (
                      <p className="mt-2 text-xs text-ink-300">
                        Digite peso ou total — o outro se calcula. Ref. compra: R${' '}
                        {mat.buyPrice.toFixed(2)}/kg
                      </p>
                    )}
                    {items.length > 1 && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-ink-300 underline hover:text-ink-100"
                        onClick={() =>
                          setItems((prev) => prev.filter((i) => i.key !== row.key))
                        }
                      >
                        Remover linha
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2">
              <div className="text-sm text-ink-200">Total da venda</div>
              <div className="text-2xl font-semibold text-brand-400">
                R$ {previewTotal.toFixed(2)}
              </div>
            </div>

            <Field label="Valor recebido (R$) — default = total">
              <input
                className={fieldClass}
                inputMode="decimal"
                placeholder={previewTotal.toFixed(2)}
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
              />
            </Field>

            <Field label="Observações">
              <textarea
                className={fieldClass}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            <PrimaryButton onClick={submitSale} disabled={!materials.length}>
              Finalizar venda
            </PrimaryButton>
          </div>

          <div className="mt-6 border-t border-white/10 pt-4">
            <h3 className="font-semibold text-ink-50">Gasto rápido do dia</h3>
            <p className="mt-1 text-xs text-ink-300">
              Ex.: comprei uma coca — descreva o que foi e o valor. Sai do caixa como
              despesa.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <input
                className={fieldClass}
                placeholder="O que foi comprado / gasto"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
              />
              <input
                className={fieldClass}
                inputMode="decimal"
                placeholder="R$"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
              <PrimaryButton
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  void addQuickExpense({
                    openedBy: username,
                    description: expenseDesc,
                    amount: Number(expenseAmount.replace(',', '.')),
                  })
                    .then(({ created }) => {
                      setExpenseDesc('');
                      setExpenseAmount('');
                      refreshCash();
                      if (created) setInfo('Caixa aberto automaticamente para o gasto.');
                    })
                    .catch((e: Error) => setError(e.message));
                }}
              >
                Lançar
              </PrimaryButton>
            </div>
          </div>
        </PlaceholderCard>

        <div className="space-y-4">
          <PlaceholderCard>
            <h2 className="font-semibold text-ink-50">Vendas recentes</h2>
            <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
              {sales.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-left ${
                      selectedId === s.id
                        ? 'border-brand-500 bg-brand-500/15'
                        : 'border-white/10 hover:border-brand-400/40'
                    }`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="font-medium text-ink-50">
                      {s.documentNumber} — {s.customerName}
                    </div>
                    <div className="text-ink-300">
                      R$ {s.netTotal.toFixed(2)} ·{' '}
                      {new Date(s.soldAt).toLocaleString('pt-BR')}
                    </div>
                  </button>
                </li>
              ))}
              {sales.length === 0 && (
                <li className="text-ink-300">Nenhuma venda registrada.</li>
              )}
            </ul>
          </PlaceholderCard>

          {open && (
            <PlaceholderCard>
              <h2 className="font-semibold text-ink-50">Movimentos do caixa</h2>
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
                {[...open.movements].reverse().map((m) => (
                  <li key={m.id} className="border-b border-white/10 py-1.5 text-ink-100">
                    <span className="text-ink-300">{m.movementType}</span> — R${' '}
                    {m.amount.toFixed(2)} — {m.description}
                  </li>
                ))}
                {open.movements.length === 0 && (
                  <li className="text-ink-300">Sem movimentos ainda.</li>
                )}
              </ul>

              <h3 className="mt-4 font-semibold text-ink-50">Fechar caixa</h3>
              <div className="mt-2 grid gap-2">
                <Field label="Saldo informado (R$)">
                  <input
                    className={fieldClass}
                    placeholder={expected.toFixed(2)}
                    value={informed}
                    onChange={(e) => setInformed(e.target.value)}
                  />
                </Field>
                <Field label="Justificativa da diferença">
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <PrimaryButton
                  onClick={() => {
                    setError(null);
                    void closeCash({
                      cashId: open.id,
                      informedBalance:
                        informed.trim() === ''
                          ? expected
                          : Number(informed.replace(',', '.')) || 0,
                      differenceReason: reason,
                      requireReason: settings['cash.requireDifferenceReason'],
                    })
                      .then(async (closed) => {
                        await upsertFinanceDayFromCash(closed);
                        downloadCashClosePdf(closed);
                        setInformed('');
                        setReason('');
                        setOpeningBalance(
                          String(closed.informedBalance ?? calcExpected(closed)),
                        );
                        setInfo(
                          'Caixa fechado. Resumo enviado para a aba Financeiro.',
                        );
                        refreshCash();
                      })
                      .catch((e: Error) => setError(e.message));
                  }}
                >
                  Fechar e gerar PDF
                </PrimaryButton>
              </div>
            </PlaceholderCard>
          )}

          {history.length > 0 && (
            <PlaceholderCard>
              <h2 className="font-semibold text-ink-50">Últimos fechamentos</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {history.map((c: CashRegisterRecord) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-3 border-b border-white/10 py-2"
                  >
                    <span>{new Date(c.openedAt).toLocaleDateString('pt-BR')}</span>
                    <span className="text-ink-300">
                      Diff R$ {(c.difference ?? 0).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="text-brand-400 underline"
                      onClick={() => downloadCashClosePdf(c)}
                    >
                      PDF
                    </button>
                  </li>
                ))}
              </ul>
            </PlaceholderCard>
          )}
        </div>
      </div>

      {selected && (
        <div className="mt-4">
          <PlaceholderCard>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ink-50">
                {selected.documentNumber} — {selected.customerName}
              </h2>
              <GhostButton onClick={() => downloadSalePdf(selected)}>
                Gerar PDF A4
              </GhostButton>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-ink-300">
                  <tr>
                    <th className="py-1 pr-2">Material</th>
                    <th className="py-1 pr-2">Peso</th>
                    <th className="py-1 pr-2">R$/kg</th>
                    <th className="py-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.items ?? []).map((i) => (
                    <tr key={i.id} className="border-t border-white/10 text-ink-100">
                      <td className="py-1.5 pr-2">{i.materialName}</td>
                      <td className="py-1.5 pr-2">{i.weight} kg</td>
                      <td className="py-1.5 pr-2">{i.unitPrice.toFixed(2)}</td>
                      <td className="py-1.5">R$ {i.lineTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm text-ink-200">
              Total R$ {selected.netTotal.toFixed(2)} · Recebido R${' '}
              {(selected.amountReceived ?? selected.netTotal).toFixed(2)}
            </p>
            {selected.notes && (
              <p className="mt-1 text-sm text-ink-300">Obs.: {selected.notes}</p>
            )}

            {commentsEnabled && (
              <>
                <h3 className="mt-4 font-semibold text-ink-50">Comentários</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {selected.comments.map((c) => (
                    <li key={c.id} className="rounded border border-white/10 p-2">
                      <div className="text-xs text-ink-300">
                        {c.authorName} · {new Date(c.createdAt).toLocaleString('pt-BR')}
                      </div>
                      <div>{c.body}</div>
                    </li>
                  ))}
                  {selected.comments.length === 0 && (
                    <li className="text-ink-300">Sem comentários.</li>
                  )}
                </ul>
                <div className="mt-3 flex gap-2">
                  <input
                    className={`flex-1 ${fieldClass}`}
                    placeholder="Novo comentário"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <PrimaryButton
                    onClick={() => {
                      if (!comment.trim()) return;
                      setError(null);
                      void addSaleComment(selected.id, comment.trim(), username)
                        .then(() => {
                          setComment('');
                          refreshSales();
                        })
                        .catch((e: Error) => setError(e.message));
                    }}
                  >
                    Comentar
                  </PrimaryButton>
                </div>
              </>
            )}
          </PlaceholderCard>
        </div>
      )}
    </div>
  );
}
