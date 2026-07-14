import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import {
  getMaterial,
  lineTotal,
  listMaterials,
  weightFromTotal,
} from '../lib/materials';
import { MaterialThumb } from '../components/MaterialThumb';
import { createPurchase, deletePurchase } from '../lib/purchases';
import { MoreHorizontal } from 'lucide-react';
import {
  addQuickExpense,
  appendMovementComment,
  calcExpected,
  closeCash,
  deleteCashMovement,
  getOpenCash,
  getSuggestedOpeningBalance,
  getTodayAutoCloseAt,
  maybeAutoCloseCash,
  openCash,
  updateCashMovement,
  type CashMovement,
  type CashRegisterRecord,
} from '../lib/cash';
import { upsertFinanceDayFromCash } from '../lib/finance';
import { downloadCashClosePdf, shareCashClosePdfWhatsApp } from '../lib/pdf';
import { getSettings } from '../lib/settings';
import { CASH_SHORTCUT_HELP, useShortcuts } from '../lib/shortcuts';
import { useAppStore } from '../stores/app-store';
import { isCashIn, movementLabel, movementTone } from '../lib/movement-labels';

type Tab = 'comprar' | 'gasto' | 'movimentos' | 'fechar';

type DraftItem = {
  key: string;
  materialId: string;
  weight: string;
  unitPrice: string;
  lineTotal: string;
};

function newBuyItem(): DraftItem {
  const first = listMaterials(true)[0];
  return {
    key: `b-${Date.now()}-${Math.random()}`,
    materialId: first?.id ?? '',
    weight: '',
    unitPrice: first ? String(first.buyPrice) : '',
    lineTotal: '',
  };
}

const tabs: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'comprar', label: 'Comprar', hint: 'F2' },
  { id: 'gasto', label: 'Gasto', hint: 'F4' },
  { id: 'movimentos', label: 'Movimentos', hint: '' },
  { id: 'fechar', label: 'Fechar', hint: 'F8' },
];

export function CashOpsPage() {
  const navigate = useNavigate();
  const username = useAppStore((s) => s.session.username);
  const settings = getSettings();
  const materials = listMaterials(true);
  const { menu, open: openMenu, openAt, close: closeMenu } = useContextMenu();

  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  void tick;

  const open = getOpenCash();
  const expected = open ? calcExpected(open) : 0;
  const suggested = getSuggestedOpeningBalance();
  const autoCloseAt = settings['cash.autoCloseEnabled']
    ? getTodayAutoCloseAt(settings['cash.autoCloseTime'])
    : null;

  const [tab, setTab] = useState<Tab>('comprar');
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [openingBalance, setOpeningBalance] = useState(() =>
    String(getSuggestedOpeningBalance().amount),
  );
  const [openAdjustNote, setOpenAdjustNote] = useState('');

  const [personName, setPersonName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('DINHEIRO');
  const [buyItems, setBuyItems] = useState<DraftItem[]>(() => [newBuyItem()]);
  const [amountPaid, setAmountPaid] = useState('');

  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [informed, setInformed] = useState('');
  const [reason, setReason] = useState('');
  const [editMov, setEditMov] = useState<CashMovement | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [commentMov, setCommentMov] = useState<CashMovement | null>(null);
  const [commentText, setCommentText] = useState('');

  const submitRef = useRef<() => void>(() => undefined);
  const closeFocusRef = useRef<HTMLInputElement>(null);
  /** Mesma base da aba Movimentos: só o caixa aberto. */
  const sessionMovements = open
    ? [...open.movements].reverse()
    : [];

  const buyTotal = useMemo(
    () =>
      buyItems.reduce((a, i) => {
        const ex = Number(i.lineTotal);
        if (i.lineTotal !== '' && Number.isFinite(ex)) return a + ex;
        return a + lineTotal(Number(i.weight) || 0, Number(i.unitPrice) || 0);
      }, 0),
    [buyItems],
  );

  useEffect(() => {
    const handleClosed = async (closed: CashRegisterRecord | null) => {
      if (!closed) return;
      const day = await upsertFinanceDayFromCash(closed);
      setInfo('Caixa fechado automaticamente.');
      refresh();
      navigate(`/financeiro?dia=${day.id}`);
    };
    void maybeAutoCloseCash().then(handleClosed);
    const id = setInterval(() => void maybeAutoCloseCash().then(handleClosed), 60_000);
    return () => clearInterval(id);
  }, [navigate]);

  useEffect(() => {
    if (!open) setOpeningBalance(String(getSuggestedOpeningBalance().amount));
  }, [open, tick]);

  const patchItem = (
    key: string,
    patch: Partial<DraftItem> & { editSource?: string },
    opts?: { syncPaid?: boolean },
  ) => {
    setBuyItems((prev) => {
      const nextItems = prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.editSource === 'material' && patch.materialId) {
          const mat = getMaterial(patch.materialId);
          if (mat) {
            next.unitPrice = String(mat.buyPrice);
            const w = Number(String(next.weight).replace(',', '.')) || 0;
            next.lineTotal =
              w > 0 ? String(lineTotal(w, mat.buyPrice)) : next.lineTotal;
          }
          return next;
        }
        const w = Number(String(next.weight).replace(',', '.'));
        const p = Number(String(next.unitPrice).replace(',', '.'));
        const t = Number(String(next.lineTotal).replace(',', '.'));
        if (patch.editSource === 'weight' || patch.editSource === 'unitPrice') {
          if (next.weight === '') {
            next.lineTotal = '';
          } else if (Number.isFinite(w) && Number.isFinite(p) && p >= 0) {
            next.lineTotal = String(lineTotal(w, p));
          }
        } else if (patch.editSource === 'total') {
          if (next.lineTotal === '') {
            next.weight = '';
          } else if (Number.isFinite(t) && Number.isFinite(p) && p > 0) {
            next.weight = String(weightFromTotal(t, p));
          }
        }
        return next;
      });
      if (opts?.syncPaid !== false && nextItems.length === 1) {
        const only = nextItems[0]!;
        const tot =
          only.lineTotal !== '' &&
          Number.isFinite(Number(only.lineTotal.replace(',', '.')))
            ? Number(only.lineTotal.replace(',', '.'))
            : lineTotal(
                Number(only.weight.replace(',', '.')) || 0,
                Number(only.unitPrice.replace(',', '.')) || 0,
              );
        setAmountPaid(tot > 0 ? String(tot) : '');
      }
      return nextItems;
    });
  };

  const selectMaterial = (materialId: string) => {
    const mat = getMaterial(materialId);
    if (!mat) return;
    setBuyItems((prev) => {
      if (prev.length === 1 && !prev[0]!.weight && !prev[0]!.lineTotal) {
        return [
          {
            ...prev[0]!,
            materialId,
            unitPrice: String(mat.buyPrice),
          },
        ];
      }
      return [
        ...prev,
        {
          key: `b-${Date.now()}-${Math.random()}`,
          materialId,
          weight: '',
          unitPrice: String(mat.buyPrice),
          lineTotal: '',
        },
      ];
    });
  };

  const onPaidChange = (value: string) => {
    setAmountPaid(value);
    if (buyItems.length === 1) {
      patchItem(
        buyItems[0]!.key,
        { lineTotal: value, editSource: 'total' },
        { syncPaid: false },
      );
    }
  };

  const removeBuyLine = (key: string) => {
    setBuyItems((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length ? next : [newBuyItem()];
    });
  };

  const submitBuy = () => {
    setError(null);
    setInfo(null);
    const mapped = buyItems
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
        };
      })
      .filter(Boolean) as Array<{
      materialId: string;
      materialName: string;
      weight: number;
      unitPrice: number;
    }>;

    if (!mapped.length) {
      setError('Informe peso ou total em pelo menos um material.');
      return;
    }
    const paid =
      amountPaid.trim() === ''
        ? undefined
        : Number(amountPaid.replace(',', '.'));

    void createPurchase({
      supplierName: personName.trim() || 'Pessoa',
      documentId,
      paymentMethod,
      notes: '',
      items: mapped,
      amountPaid: paid,
      openedBy: username,
    })
      .then(({ purchase, cashInfo }) => {
        setPersonName('');
        setDocumentId('');
        setAmountPaid('');
        setBuyItems([newBuyItem()]);
        refresh();
        setInfo(
          cashInfo ??
            `${purchase.documentNumber}: estoque + · caixa - R$ ${purchase.amountPaid.toFixed(2)}`,
        );
      })
      .catch((e: Error) => setError(e.message));
  };

  const submitExpense = () => {
    setError(null);
    void addQuickExpense({
      openedBy: username,
      description: expenseDesc,
      amount: Number(expenseAmount.replace(',', '.')),
    })
      .then(({ created }) => {
        setExpenseDesc('');
        setExpenseAmount('');
        refresh();
        setInfo(created ? 'Caixa aberto p/ gasto.' : 'Gasto lançado.');
      })
      .catch((e: Error) => setError(e.message));
  };

  submitRef.current = () => {
    if (tab === 'comprar') submitBuy();
    else if (tab === 'gasto') submitExpense();
  };

  useShortcuts([
    { key: 'F2', allowInInput: true, handler: () => setTab('comprar') },
    { key: 'F4', allowInInput: true, handler: () => setTab('gasto') },
    { key: 'F5', allowInInput: true, handler: () => submitRef.current() },
    {
      key: 'Enter',
      ctrl: true,
      allowInInput: true,
      handler: () => submitRef.current(),
    },
    {
      key: 'F8',
      allowInInput: true,
      handler: () => {
        setTab('fechar');
        setTimeout(() => closeFocusRef.current?.focus(), 50);
      },
    },
    {
      key: '/',
      ctrl: true,
      allowInInput: true,
      handler: () => setShowHelp((v) => !v),
    },
    {
      key: 'Escape',
      allowInInput: true,
      handler: () => {
        setShowHelp(false);
        setEditMov(null);
        setCommentMov(null);
      },
    },
  ]);

  return (
    <div>
      <PageHeader
        title="Caixa"
        subtitle="Comprar sucata de quem chega (sai dinheiro + entra no pátio). Venda de estoque é na aba Vendas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/vendas"
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-brand-400 hover:border-brand-400/40"
            >
              Ir para Vendas
            </Link>
            <button
              type="button"
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-ink-300"
              onClick={() => setShowHelp(true)}
            >
              Atalhos Ctrl+/
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-2 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-2 rounded border border-moss-500/40 bg-moss-700/30 px-3 py-2 text-sm text-moss-400">
          {info}
        </div>
      )}

      <PlaceholderCard className="!p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className={open ? 'text-moss-400' : 'text-ink-300'}>
            {open ? 'Aberto' : 'Fechado'}
          </span>
          {open && (
            <>
              <span className="text-ink-300">
                {new Date(open.openedAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {open.openedBy}
              </span>
              <span className="font-medium text-ink-50">
                Esperado R$ {expected.toFixed(2)}
              </span>
            </>
          )}
          {autoCloseAt && settings['cash.autoCloseEnabled'] && (
            <span className="text-xs text-ink-400">
              Auto {settings['cash.autoCloseTime']}
            </span>
          )}
        </div>

        {!open && (
          <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-white/10 pt-2">
            {suggested.source === 'last_close' && (
              <PrimaryButton
                className="!py-1.5 text-xs"
                onClick={() => setOpeningBalance(String(suggested.amount))}
              >
                Usar R$ {suggested.amount.toFixed(2)} de ontem
              </PrimaryButton>
            )}
            <input
              className={`${fieldClass} !mt-0 w-28 !py-1.5`}
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="Saldo"
            />
            <input
              className={`${fieldClass} !mt-0 min-w-[10rem] flex-1 !py-1.5`}
              value={openAdjustNote}
              onChange={(e) => setOpenAdjustNote(e.target.value)}
              placeholder="Obs. se ajustou"
            />
            <PrimaryButton
              className="!py-1.5"
              onClick={() => {
                void openCash({
                  openedBy: username,
                  openingBalance: Number(openingBalance.replace(',', '.')) || 0,
                  notes: openAdjustNote || undefined,
                  allowMultiple: settings['cash.allowMultipleOpen'],
                })
                  .then(refresh)
                  .catch((e: Error) => setError(e.message));
              }}
            >
              Abrir
            </PrimaryButton>
          </div>
        )}
      </PlaceholderCard>

      <div className="mt-3 flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id
                ? 'bg-brand-500 text-ink-950'
                : 'bg-ink-800 text-ink-200 hover:bg-ink-700'
            }`}
          >
            {t.label}
            {t.hint ? (
              <span className="ml-1 text-[10px] opacity-70">{t.hint}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === 'comprar' && (
          <PlaceholderCard className="!p-3">
            <p className="mb-2 text-xs text-ink-300">
              Pessoa traz sucata → paga agora → material entra no pátio. Informe
              peso ou valor pago — o outro calcula sozinho.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-3">
              <input
                className={`${fieldClass} !mt-0 !py-1.5`}
                placeholder="Nome (opcional)"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
              <input
                className={`${fieldClass} !mt-0 !py-1.5`}
                placeholder="CPF/RG (opcional)"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
              />
              <select
                className={`${fieldClass} !mt-0 !py-1.5`}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="DINHEIRO">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="TRANSFERENCIA">Transferência</option>
              </select>
            </div>

            <p className="mb-1.5 mt-3 text-[10px] uppercase tracking-wide text-ink-400">
              Materiais — clique para selecionar
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {materials.map((m) => {
                const selected = buyItems.some((r) => r.materialId === m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectMaterial(m.id)}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left transition ${
                      selected
                        ? 'border-brand-500 bg-brand-500/20 ring-1 ring-brand-500/40'
                        : 'border-white/10 bg-ink-900/50 hover:border-brand-400/50 hover:bg-ink-800/80'
                    }`}
                  >
                    <MaterialThumb material={m} className="!h-9 !w-9" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-50">
                        {m.name}
                      </span>
                      <span className="block text-xs text-ink-300">
                        R$ {m.buyPrice.toFixed(2)}/kg
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-2">
              {buyItems.map((row) => {
                const mat = getMaterial(row.materialId);
                return (
                  <div
                    key={row.key}
                    className="rounded-xl border border-white/10 bg-ink-900/40 p-2.5"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <MaterialThumb material={mat} />
                        <div>
                          <div className="text-sm font-medium text-ink-50">
                            {mat?.name ?? 'Material'}
                          </div>
                          <div className="text-xs text-ink-300">
                            R$ {Number(row.unitPrice || 0).toFixed(2)}/kg
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-ink-400 hover:text-brand-400"
                        onClick={() => removeBuyLine(row.key)}
                      >
                        Remover
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-[10px] uppercase text-ink-400">
                          Peso (kg)
                        </span>
                        <input
                          className={`${fieldClass} !mt-0.5 !py-1.5`}
                          placeholder="0,000"
                          value={row.weight}
                          onChange={(e) =>
                            patchItem(row.key, {
                              weight: e.target.value,
                              editSource: 'weight',
                            })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] uppercase text-ink-400">
                          R$/kg
                        </span>
                        <input
                          className={`${fieldClass} !mt-0.5 !py-1.5`}
                          value={row.unitPrice}
                          onChange={(e) =>
                            patchItem(row.key, {
                              unitPrice: e.target.value,
                              editSource: 'unitPrice',
                            })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] uppercase text-ink-400">
                          Valor / Pago (R$)
                        </span>
                        <input
                          className={`${fieldClass} !mt-0.5 !py-1.5 border-brand-500/40`}
                          placeholder="0,00"
                          value={row.lineTotal}
                          onChange={(e) =>
                            patchItem(row.key, {
                              lineTotal: e.target.value,
                              editSource: 'total',
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <GhostButton
                className="!py-1 text-xs"
                onClick={() => setBuyItems((p) => [...p, newBuyItem()])}
              >
                + linha
              </GhostButton>
              <span className="font-semibold text-brand-400">
                Total R$ {buyTotal.toFixed(2)}
              </span>
              <input
                className={`${fieldClass} !mt-0 w-32 !py-1.5`}
                placeholder="Pago total"
                value={amountPaid}
                onChange={(e) => onPaidChange(e.target.value)}
                title={
                  buyItems.length === 1
                    ? 'Com 1 material: altera o peso automaticamente'
                    : 'Valor que saiu do caixa'
                }
              />
              <PrimaryButton className="!py-1.5" onClick={submitBuy}>
                Finalizar compra (F5)
              </PrimaryButton>
            </div>
            {open && sessionMovements.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto border-t border-white/10 pt-2">
                {sessionMovements.map((m) => {
                  const tone = movementTone(m.movementType);
                  const income = isCashIn(m.movementType);
                  const label =
                    m.detail || m.description || movementLabel(m.movementType);
                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2 px-0.5 py-1 text-xs"
                    >
                      <span className="min-w-0 truncate text-ink-300">
                        <span
                          className={`mr-1 inline-block rounded px-1 py-0.5 text-[10px] font-medium ${tone.badge}`}
                        >
                          {movementLabel(m.movementType)}
                        </span>
                        <span className="text-ink-100">{label}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`font-semibold tabular-nums ${tone.amount}`}>
                          {income ? '+' : '−'}
                          {m.amount.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          className="rounded border border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium text-red-300 hover:bg-red-500/15"
                          onClick={() => {
                            const title =
                              m.refType === 'PURCHASE' && m.refId
                                ? 'Excluir esta compra? Some do caixa e do pátio.'
                                : 'Excluir este lançamento do caixa?';
                            if (!confirm(title)) return;
                            const run =
                              m.refType === 'PURCHASE' && m.refId
                                ? deletePurchase(m.refId)
                                : deleteCashMovement(open.id, m.id);
                            void run
                              .then(() => {
                                refresh();
                                setInfo('Lançamento excluído.');
                              })
                              .catch((err: Error) => setError(err.message));
                          }}
                        >
                          Excluir
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {open && sessionMovements.length === 0 && (
              <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-ink-500">
                Nenhum lançamento neste caixa ainda.
              </p>
            )}
          </PlaceholderCard>
        )}

        {tab === 'gasto' && (
          <PlaceholderCard className="!p-3">
            <div className="flex flex-wrap gap-2">
              <input
                className={`${fieldClass} !mt-0 min-w-[12rem] flex-1 !py-1.5`}
                placeholder="O que gastou (ex.: coca)"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
              />
              <input
                className={`${fieldClass} !mt-0 w-28 !py-1.5`}
                placeholder="R$"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
              <PrimaryButton className="!py-1.5" onClick={submitExpense}>
                Lançar
              </PrimaryButton>
            </div>
          </PlaceholderCard>
        )}

        {tab === 'movimentos' && (
          <PlaceholderCard className="!p-2">
            {!open ? (
              <p className="py-4 text-center text-xs text-ink-300">
                Caixa fechado.
              </p>
            ) : open.movements.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-300">
                Nenhum lançamento neste caixa.
              </p>
            ) : (
              <ul className="max-h-[36rem] divide-y divide-white/5 overflow-auto">
                {[...open.movements].reverse().map((m) => {
                  const tone = movementTone(m.movementType);
                  const income = isCashIn(m.movementType);
                  const actions = [
                    {
                      id: 'edit',
                      label: 'Editar',
                      onSelect: () => {
                        setEditMov(m);
                        setEditAmount(String(m.amount));
                        setEditDesc(m.description);
                      },
                    },
                    {
                      id: 'comment',
                      label: 'Comentário',
                      onSelect: () => {
                        setCommentMov(m);
                        setCommentText('');
                      },
                    },
                    {
                      id: 'del',
                      label: 'Excluir',
                      danger: true,
                      onSelect: () => {
                        if (!confirm('Excluir este lançamento?')) return;
                        void deleteCashMovement(open.id, m.id)
                          .then(() => {
                            refresh();
                            setInfo('Movimento excluído.');
                          })
                          .catch((err: Error) => setError(err.message));
                      },
                    },
                  ];
                  const time = new Date(m.movedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <li
                      key={m.id}
                      className={`group flex cursor-context-menu items-center gap-2 px-1.5 py-1 hover:bg-white/[0.04] ${tone.row ?? ''}`}
                      onContextMenu={(e) => openMenu(e, actions)}
                    >
                      <span
                        className={`w-[4.25rem] shrink-0 truncate rounded px-1 py-0.5 text-center text-[10px] font-medium ${tone.badge}`}
                        title={movementLabel(m.movementType)}
                      >
                        {movementLabel(m.movementType)}
                      </span>
                      <div className="min-w-0 flex-1 truncate text-xs text-ink-200">
                        <span className="text-ink-100">
                          {m.detail || m.description}
                        </span>
                        {m.notes ? (
                          <span className="text-ink-400"> · {m.notes}</span>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] text-ink-500">
                        {time}
                      </span>
                      <span
                        className={`w-20 shrink-0 text-right text-xs font-semibold tabular-nums ${tone.amount}`}
                      >
                        {income ? '+' : '−'}
                        {m.amount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 text-ink-400 opacity-70 hover:bg-white/10 hover:text-ink-50 group-hover:opacity-100"
                        title="Menu (editar, comentário, excluir)"
                        aria-label="Menu do movimento"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = (
                            e.currentTarget as HTMLButtonElement
                          ).getBoundingClientRect();
                          openAt(rect.right - 160, rect.bottom + 2, actions);
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {open && open.movements.length > 0 && (
              <p className="mt-1.5 px-1 text-[10px] text-ink-500">
                ⋯ ou clique direito · editar · comentário · excluir
              </p>
            )}
          </PlaceholderCard>
        )}

        {tab === 'fechar' && open && (
          <PlaceholderCard className="!p-3">
            <p className="mb-2 text-xs text-ink-300">
              Fecha o caixa. Pode gerar PDF / WhatsApp do dia antes ou depois.
            </p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <GhostButton
                className="!py-1 text-xs"
                onClick={() => downloadCashClosePdf(open)}
              >
                PDF do caixa
              </GhostButton>
              <GhostButton
                className="!py-1 text-xs"
                onClick={() =>
                  void shareCashClosePdfWhatsApp(open).then((r) =>
                    setInfo(r.hint),
                  )
                }
              >
                WhatsApp
              </GhostButton>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={closeFocusRef}
                className={`${fieldClass} !mt-0 w-36 !py-1.5`}
                placeholder={expected.toFixed(2)}
                value={informed}
                onChange={(e) => setInformed(e.target.value)}
              />
              <input
                className={`${fieldClass} !mt-0 min-w-[12rem] flex-1 !py-1.5`}
                placeholder="Justificativa da diferença"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <PrimaryButton
                className="!py-1.5"
                onClick={() => {
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
                      const day = await upsertFinanceDayFromCash(closed);
                      setInfo('Caixa fechado.');
                      refresh();
                      navigate(`/financeiro?dia=${day.id}`);
                    })
                    .catch((e: Error) => setError(e.message));
                }}
              >
                Fechar e ir ao Financeiro
              </PrimaryButton>
            </div>
          </PlaceholderCard>
        )}

        {tab === 'fechar' && !open && (
          <PlaceholderCard className="!p-3">
            <p className="text-sm text-ink-300">Abra o caixa primeiro.</p>
          </PlaceholderCard>
        )}
      </div>

      {editMov && open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-ink-800 p-4">
            <h3 className="font-semibold">Editar lançamento</h3>
            <Field label="Valor">
              <input
                className={fieldClass}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </Field>
            <Field label="Descrição">
              <input
                className={fieldClass}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </Field>
            <div className="mt-3 flex gap-2">
              <PrimaryButton
                onClick={() => {
                  void updateCashMovement(open.id, editMov.id, {
                    amount: Number(editAmount.replace(',', '.')) || 0,
                    description: editDesc,
                  })
                    .then(() => {
                      setEditMov(null);
                      refresh();
                    })
                    .catch((e: Error) => setError(e.message));
                }}
              >
                Salvar
              </PrimaryButton>
              <GhostButton onClick={() => setEditMov(null)}>Cancelar</GhostButton>
            </div>
          </div>
        </div>
      )}

      {commentMov && open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-ink-800 p-4">
            <h3 className="font-semibold">Comentário</h3>
            <textarea
              className={fieldClass}
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <PrimaryButton
                onClick={() => {
                  void appendMovementComment(open.id, commentMov.id, commentText)
                    .then(() => {
                      setCommentMov(null);
                      refresh();
                    })
                    .catch((e: Error) => setError(e.message));
                }}
              >
                Salvar
              </PrimaryButton>
              <GhostButton onClick={() => setCommentMov(null)}>Cancelar</GhostButton>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-white/15 bg-ink-800 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">Atalhos do Caixa</h3>
            <ul className="mt-3 space-y-1 text-sm">
              {CASH_SHORTCUT_HELP.map(
                (row) => (
                  <li key={row.keys} className="flex justify-between gap-4">
                    <kbd className="text-brand-400">{row.keys}</kbd>
                    <span className="text-ink-200">{row.desc}</span>
                  </li>
                ),
              )}
            </ul>
            <GhostButton className="mt-4" onClick={() => setShowHelp(false)}>
              Fechar
            </GhostButton>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}

export function SalesPage() {
  return <CashOpsPage />;
}
