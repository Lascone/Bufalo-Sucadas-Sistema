import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Field,
  GhostButton,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import {
  defaultCashBuyMaterialId,
  getMaterial,
  lineTotal,
  listMaterials,
  weightFromTotal,
} from '../lib/materials';
import { MaterialThumb } from '../components/MaterialThumb';
import { createPurchase, deletePurchase, getPurchase } from '../lib/purchases';
import { MoreHorizontal } from 'lucide-react';
import {
  addQuickExpense,
  addTrocadoToOpenCash,
  appendMovementComment,
  calcExpected,
  closeCash,
  deleteCashMovement,
  getOpenCash,
  getSuggestedOpeningBalance,
  getTodayAutoCloseAt,
  openCash,
  reconcileCashSession,
  updateCashMovement,
  type CashMovement,
  type CashRegisterRecord,
} from '../lib/cash';
import {
  borrowCashLoan,
  cancelCashLoanByBorrowMovement,
  listOpenCashLoans,
  repayCashLoan,
  totalOpenCashLoans,
} from '../lib/cash-loans';
import { upsertFinanceDayFromCash } from '../lib/finance';
import { downloadCashClosePdf, shareCashClosePdfWhatsApp } from '../lib/pdf';
import { getSettings } from '../lib/settings';
import { CASH_SHORTCUT_HELP, useShortcuts } from '../lib/shortcuts';
import { useAppStore } from '../stores/app-store';
import { isCashIn, movementLabel, movementTone } from '../lib/movement-labels';
import { OperatorPicker } from '../components/OperatorPicker';
import { getOperator } from '../lib/operators';

type Tab = 'comprar' | 'gasto' | 'emprestado' | 'movimentos';

function toDatetimeLocalValue(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseMoney(s: string): number {
  const n = Number(String(s).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function businessDateLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sumMovements(
  movements: CashMovement[],
  types: CashMovement['movementType'][],
) {
  return movements
    .filter((m) => types.includes(m.movementType))
    .reduce((acc, m) => acc + m.amount, 0);
}

type DraftItem = {
  key: string;
  materialId: string;
  weight: string;
  unitPrice: string;
  lineTotal: string;
};

/** Aceita vírgula decimal; pode retornar NaN se inválido. */
function parseNum(s: string): number {
  return Number(String(s).trim().replace(/\s/g, '').replace(',', '.'));
}

function draftLineAmount(i: DraftItem): number {
  if (i.lineTotal !== '') {
    const t = parseNum(i.lineTotal);
    if (Number.isFinite(t)) return t;
  }
  const w = parseNum(i.weight);
  const p = parseNum(i.unitPrice);
  return lineTotal(Number.isFinite(w) ? w : 0, Number.isFinite(p) ? p : 0);
}

function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.currentTarget.blur();
}

/** Converte string canônica ("1.11" ou "1,11") em centavos inteiros. */
function moneyStringToCents(value: string): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsToMoneyString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatCentsBR(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MAX_MONEY_CENTS = 9_999_999_99;

type MoneyInputProps = {
  value: string;
  onValueChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  inputRef?:
    | React.RefObject<HTMLInputElement | null>
    | ((el: HTMLInputElement | null) => void);
  onEnterKey?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onKeyDownExtra?: (e: KeyboardEvent<HTMLInputElement>) => void;
  title?: string;
  'aria-label'?: string;
  onFocus?: () => void;
};

/**
 * Entrada em centavos da direita p/ esquerda:
 * 1 → 0,01 · 0 → 0,10 · 0 → 1,00
 */
function MoneyInput({
  value,
  onValueChange,
  className,
  placeholder = '0,00',
  inputRef,
  onEnterKey,
  onKeyDownExtra,
  title,
  'aria-label': ariaLabel,
  onFocus,
}: MoneyInputProps) {
  const cents = moneyStringToCents(value);
  const display = value === '' ? '' : formatCentsBR(cents);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDownExtra?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter') {
      if (onEnterKey) onEnterKey(e);
      else {
        e.preventDefault();
        e.currentTarget.blur();
      }
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const next = cents * 10 + Number(e.key);
      if (next > MAX_MONEY_CENTS) return;
      onValueChange(centsToMoneyString(next));
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = Math.floor(cents / 10);
      onValueChange(next === 0 ? '' : centsToMoneyString(next));
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      onValueChange('');
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits === '') {
      onValueChange('');
      return;
    }
    const clamped = Math.min(Number(digits.slice(-11)), MAX_MONEY_CENTS);
    onValueChange(centsToMoneyString(clamped));
  };

  return (
    <input
      ref={inputRef}
      className={className}
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onFocus={onFocus}
      title={title}
      aria-label={ariaLabel}
    />
  );
}

function newBuyItem(): DraftItem {
  const materialId = defaultCashBuyMaterialId();
  const mat = materialId ? getMaterial(materialId) : undefined;
  return {
    key: `b-${Date.now()}-${Math.random()}`,
    materialId: materialId,
    weight: '',
    unitPrice: mat ? String(mat.buyPrice) : '',
    lineTotal: '',
  };
}

const tabs: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'comprar', label: 'Comprar Material', hint: 'F2' },
  { id: 'gasto', label: 'Gasto', hint: 'F4' },
  { id: 'emprestado', label: 'Peguei emprestado', hint: 'F6' },
  { id: 'movimentos', label: 'Movimentos', hint: '' },
];

export function CashOpsPage() {
  const navigate = useNavigate();
  const username = useAppStore((s) => s.session.username);
  const operatorId = useAppStore((s) => s.session.operatorId);
  const setOperator = useAppStore((s) => s.setOperator);
  const operator = getOperator(operatorId);
  const settings = getSettings();
  const materials = listMaterials(true);
  const { menu, open: openMenu, openAt, close: closeMenu } = useContextMenu();

  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  void tick;

  const open = getOpenCash();
  const expected = open ? calcExpected(open) : 0;
  const suggested = getSuggestedOpeningBalance();
  const autoCloseAt = settings['cash.closeMode'] === 'auto'
    ? getTodayAutoCloseAt(settings['cash.autoCloseTime'])
    : null;

  const [tab, setTab] = useState<Tab>('comprar');
  const [showHelp, setShowHelp] = useState(false);
  const [showOperatorPicker, setShowOperatorPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [extraOpening, setExtraOpening] = useState('');
  const [openManualMode, setOpenManualMode] = useState(false);
  const [manualOpening, setManualOpening] = useState(() =>
    String(getSuggestedOpeningBalance().amount),
  );
  const [openAdjustNote, setOpenAdjustNote] = useState('');

  const openBaseAmount = suggested.amount;
  const openExtraAmount = parseMoney(extraOpening);
  const totalToOpen = openManualMode
    ? parseMoney(manualOpening)
    : Math.round((openBaseAmount + openExtraAmount) * 100) / 100;

  const [personName, setPersonName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('DINHEIRO');
  const [buyItems, setBuyItems] = useState<DraftItem[]>(() => [newBuyItem()]);
  const [amountPaid, setAmountPaid] = useState('');
  /** true = usuário editou Pago total à mão (parcial); não sobrescrever com a soma. */
  const [paidManual, setPaidManual] = useState(false);
  const [linesPanelOpen, setLinesPanelOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const amountPaidRef = useRef<HTMLInputElement>(null);
  const draftValorRef = useRef<HTMLInputElement>(null);
  const lineInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingValorFocusRef = useRef<number | null>(null);
  const [purchaseAtLocal, setPurchaseAtLocal] = useState(() =>
    toDatetimeLocalValue(),
  );

  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [loanPerson, setLoanPerson] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [informed, setInformed] = useState('');
  const [reason, setReason] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showTrocadoModal, setShowTrocadoModal] = useState(false);
  const [trocadoAmount, setTrocadoAmount] = useState('');
  const [trocadoNote, setTrocadoNote] = useState('');
  const trocadoFocusRef = useRef<HTMLInputElement>(null);
  const [editMov, setEditMov] = useState<CashMovement | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [commentMov, setCommentMov] = useState<CashMovement | null>(null);
  const [commentText, setCommentText] = useState('');

  const submitRef = useRef<() => void>(() => undefined);
  const closeFocusRef = useRef<HTMLInputElement>(null);
  const sessionMovements = open
    ? [...open.movements].reverse()
    : [];

  const dayPurchases = open
    ? sumMovements(open.movements, ['COMPRA_PAGA'])
    : 0;
  const dayExpenses = open ? sumMovements(open.movements, ['DESPESA']) : 0;
  const daySales = open
    ? sumMovements(open.movements, ['VENDA_RECEBIDA', 'TROCADO'])
    : 0;
  const daySupplies = open
    ? sumMovements(open.movements, ['SUPRIMENTO', 'ENTRADA'])
    : 0;
  const dayOutOther = open
    ? sumMovements(open.movements, ['SANGRIA', 'SAIDA'])
    : 0;
  const dayLoansIn = open ? sumMovements(open.movements, ['EMPRESTIMO']) : 0;
  const dayLoansOut = open
    ? sumMovements(open.movements, ['DEVOLUCAO_EMPRESTIMO'])
    : 0;
  const openLoans = listOpenCashLoans();
  const openLoansTotal = totalOpenCashLoans();

  const openCloseModal = () => {
    if (!getOpenCash()) return;
    setInformed('');
    setReason('');
    setShowCloseModal(true);
    setTimeout(() => closeFocusRef.current?.focus(), 80);
  };

  const openTrocadoModal = () => {
    if (!getOpenCash()) return;
    setTrocadoAmount('');
    setTrocadoNote('');
    setShowTrocadoModal(true);
    setTimeout(() => trocadoFocusRef.current?.focus(), 80);
  };

  const confirmAddTrocado = () => {
    void addTrocadoToOpenCash({
      amount: parseMoney(trocadoAmount),
      notes: trocadoNote,
    })
      .then(() => {
        setShowTrocadoModal(false);
        setInfo('Trocado adicionado ao caixa.');
        refresh();
      })
      .catch((e: Error) => setError(e.message));
  };

  const confirmCloseCash = () => {
    const cash = getOpenCash();
    if (!cash) return;
    const expectedNow = calcExpected(cash);
    void closeCash({
      cashId: cash.id,
      informedBalance:
        informed.trim() === ''
          ? expectedNow
          : Number(informed.replace(',', '.')) || 0,
      differenceReason: reason,
      requireReason: settings['cash.requireDifferenceReason'],
    })
      .then(async (closed) => {
        setShowCloseModal(false);
        const day = await upsertFinanceDayFromCash(closed);
        setInfo('Caixa fechado.');
        refresh();
        navigate(`/financeiro?dia=${day.id}`);
      })
      .catch((e: Error) => setError(e.message));
  };
  const buyTotal = useMemo(
    () =>
      Math.round(buyItems.reduce((a, i) => a + draftLineAmount(i), 0) * 100) /
      100,
    [buyItems],
  );

  const draftIndex = Math.min(
    Math.max(0, activeLineIndex),
    Math.max(0, buyItems.length - 1),
  );
  const draftItem = buyItems[draftIndex];
  /** Painel lateral só com 2+ itens (ou F10). Produto único = editor compacto. */
  const multiItens = buyItems.length >= 2;
  const showItens = multiItens || linesPanelOpen;
  /** Editor compacto só quando o painel de itens não está aberto. */
  const showDraftEditor = !showItens && !!draftItem;

  useEffect(() => {
    setActiveLineIndex((i) =>
      Math.min(Math.max(0, i), Math.max(0, buyItems.length - 1)),
    );
  }, [buyItems.length]);

  useEffect(() => {
    if (buyItems.length >= 2) setLinesPanelOpen(true);
    else setLinesPanelOpen(false);
  }, [buyItems.length]);

  useEffect(() => {
    if (!showItens || pendingValorFocusRef.current == null) return;
    const idx = pendingValorFocusRef.current;
    pendingValorFocusRef.current = null;
    requestAnimationFrame(() => {
      const el = lineInputRefs.current[idx];
      el?.focus();
      el?.select();
    });
  }, [showItens, buyItems.length, activeLineIndex]);

  const focusDraftValor = () => {
    requestAnimationFrame(() => {
      draftValorRef.current?.focus();
      draftValorRef.current?.select();
    });
  };

  /** Abre os itens e foca o valor da linha. */
  const openItens = (index = draftIndex) => {
    if (!buyItems.length) return;
    const next = Math.min(Math.max(0, index), buyItems.length - 1);
    setActiveLineIndex(next);
    pendingValorFocusRef.current = next;
    setLinesPanelOpen(true);
    if (showItens) {
      requestAnimationFrame(() => {
        const el = lineInputRefs.current[next];
        el?.focus();
        el?.select();
        pendingValorFocusRef.current = null;
      });
    }
  };

  const focusLine = (index: number) => {
    openItens(index);
  };

  /** Sai do text box para os atalhos de material (0–9 / A–Z) voltarem a funcionar. */
  const releaseShortcutFocus = () => {
    requestAnimationFrame(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
  };

  /** Enter no valor preenchido: confirma o item e libera atalhos. */
  const confirmItemValor = (index: number) => {
    const row = buyItems[index];
    if (!row) return;
    const t = parseNum(row.lineTotal);
    if (row.lineTotal === '' || !Number.isFinite(t) || t <= 0) return;
    setActiveLineIndex(index);
    releaseShortcutFocus();
  };

  const onLineMoneyKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusLine(index + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusLine(index - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = buyItems[index];
      const t = row ? parseNum(row.lineTotal) : NaN;
      if (!row || row.lineTotal === '' || !Number.isFinite(t) || t <= 0) return;
      if (index < buyItems.length - 1) {
        focusLine(index + 1);
        return;
      }
      setLinesPanelOpen(true);
      releaseShortcutFocus();
      return;
    }
    if (e.key === 'Delete') {
      // Impede limpar o valor; o atalho global Del exclui o item
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (paidManual) return;
    setAmountPaid(buyTotal > 0 ? String(buyTotal) : '');
  }, [buyTotal, paidManual, buyItems.length]);

  useEffect(() => {
    const handleReconcile = async (result: {
      closed: CashRegisterRecord | null;
      opened: CashRegisterRecord | null;
      staleClosed: boolean;
    }) => {
      if (result.closed) {
        const day = await upsertFinanceDayFromCash(result.closed);
        setInfo(
          result.staleClosed
            ? 'Caixa do dia anterior foi fechado automaticamente (PC havia sido desligado). Abra o caixa de hoje.'
            : 'Caixa fechado automaticamente.',
        );
        refresh();
        if (!result.opened) {
          navigate(`/financeiro?dia=${day.id}`);
        }
      }
      if (result.opened) {
        setInfo(
          (result.closed
            ? 'Dia anterior fechado. '
            : '') + 'Caixa de hoje aberto automaticamente.',
        );
        refresh();
      }
    };
    void reconcileCashSession({ openedBy: username || 'sistema' }).then(
      handleReconcile,
    );
    const id = setInterval(
      () =>
        void reconcileCashSession({ openedBy: username || 'sistema' }).then(
          handleReconcile,
        ),
      60_000,
    );
    return () => clearInterval(id);
  }, [navigate, username]);

  useEffect(() => {
    if (!open) {
      const suggestedNow = getSuggestedOpeningBalance().amount;
      setManualOpening(String(suggestedNow));
      setExtraOpening('');
      // Abertura manual por padrão (operador confere o valor)
      setOpenManualMode(true);
    }
  }, [open, tick]);

  const patchItem = (
    key: string,
    patch: Partial<DraftItem> & { editSource?: string },
  ) => {
    setBuyItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.editSource === 'material' && patch.materialId) {
          const mat = getMaterial(patch.materialId);
          if (mat) {
            next.unitPrice = String(mat.buyPrice);
            const w = parseNum(next.weight);
            next.lineTotal =
              Number.isFinite(w) && w > 0
                ? String(lineTotal(w, mat.buyPrice))
                : next.lineTotal;
          }
          return next;
        }
        const w = parseNum(next.weight);
        const p = parseNum(next.unitPrice);
        const t = parseNum(next.lineTotal);
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
      }),
    );
  };

  const selectMaterial = (materialId: string) => {
    const mat = getMaterial(materialId);
    if (!mat) return;
    setPaidManual(false);

    const replaceEmpty =
      buyItems.length === 1 &&
      !buyItems[0]!.weight &&
      !buyItems[0]!.lineTotal;

    if (replaceEmpty) {
      setBuyItems([
        {
          ...buyItems[0]!,
          materialId,
          unitPrice: String(mat.buyPrice),
        },
      ]);
      setActiveLineIndex(0);
      // Produto único: já foca o valor (evita digitar atalho de material)
      focusDraftValor();
      return;
    }

    const newIndex = buyItems.length;
    setBuyItems((prev) => [
      ...prev,
      {
        key: `b-${Date.now()}-${Math.random()}`,
        materialId,
        weight: '',
        unitPrice: String(mat.buyPrice),
        lineTotal: '',
      },
    ]);
    setActiveLineIndex(newIndex);
    // 2º+ material: abre itens e foca o valor da linha nova
    pendingValorFocusRef.current = newIndex;
    setLinesPanelOpen(true);
  };

  const addBuyLine = () => {
    setPaidManual(false);
    const newIndex = buyItems.length;
    setBuyItems((p) => [...p, newBuyItem()]);
    setActiveLineIndex(newIndex);
    pendingValorFocusRef.current = newIndex;
    setLinesPanelOpen(true);
  };

  const onPaidChange = (value: string) => {
    setAmountPaid(value);
    if (buyItems.length === 1) {
      setPaidManual(false);
      patchItem(buyItems[0]!.key, { lineTotal: value, editSource: 'total' });
    } else {
      setPaidManual(true);
    }
  };

  const removeBuyLine = (key: string) => {
    setPaidManual(false);
    setBuyItems((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      const next = prev.filter((r) => r.key !== key);
      const result = next.length ? next : [newBuyItem()];
      setActiveLineIndex(
        Math.min(Math.max(0, idx >= 0 ? idx : 0), result.length - 1),
      );
      return result;
    });
  };

  const removeActiveBuyLine = () => {
    if (tab !== 'comprar' || !showItens || buyItems.length === 0) return;
    const row = buyItems[draftIndex];
    if (!row) return;
    removeBuyLine(row.key);
    releaseShortcutFocus();
  };

  const submitBuy = () => {
    setError(null);
    setInfo(null);
    const mapped = buyItems
      .map((i) => {
        const mat = getMaterial(i.materialId);
        if (!mat) return null;
        const unitPrice = parseNum(i.unitPrice);
        let weight = parseNum(i.weight);
        const total = parseNum(i.lineTotal);
        if (
          (!Number.isFinite(weight) || weight <= 0) &&
          Number.isFinite(total) &&
          total > 0 &&
          Number.isFinite(unitPrice) &&
          unitPrice > 0
        ) {
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
    const paidRaw = amountPaid.trim();
    const paidParsed = paidRaw === '' ? NaN : parseNum(paidRaw);
    const paid =
      paidRaw === '' || !Number.isFinite(paidParsed) ? undefined : paidParsed;

    void createPurchase({
      supplierName: personName.trim() || 'Pessoa',
      documentId,
      paymentMethod,
      notes: '',
      items: mapped,
      amountPaid: paid,
      openedBy: username || 'Operador',
      createdBy: username || 'Operador',
      purchasedAt: purchaseAtLocal
        ? new Date(purchaseAtLocal).toISOString()
        : undefined,
    })
      .then(({ purchase, cashInfo }) => {
        setPersonName('');
        setDocumentId('');
        setAmountPaid('');
        setPaidManual(false);
        setLinesPanelOpen(false);
        setBuyItems([newBuyItem()]);
        setPurchaseAtLocal(toDatetimeLocalValue());
        refresh();
        setInfo(
          cashInfo ??
            `${purchase.documentNumber}: estoque + · caixa - R$ ${purchase.amountPaid.toFixed(2)}${
              purchase.createdBy ? ` · ${purchase.createdBy}` : ''
            }`,
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

  const submitBorrow = () => {
    setError(null);
    void borrowCashLoan({
      openedBy: username,
      person: loanPerson,
      amount: Number(loanAmount.replace(',', '.')),
      note: loanNote || undefined,
    })
      .then(({ created }) => {
        setLoanPerson('');
        setLoanAmount('');
        setLoanNote('');
        refresh();
        setInfo(
          created
            ? 'Caixa aberto e empréstimo registrado.'
            : 'Peguei emprestado registrado — lembrar de devolver.',
        );
      })
      .catch((e: Error) => setError(e.message));
  };

  const submitRepay = (loanId: string, person: string) => {
    if (!confirm(`Devolver o troco para ${person}? O valor sai do caixa.`)) {
      return;
    }
    setError(null);
    void repayCashLoan({ loanId, openedBy: username })
      .then(() => {
        refresh();
        setInfo(`Devolvido para ${person}.`);
      })
      .catch((e: Error) => setError(e.message));
  };

  submitRef.current = () => {
    if (tab === 'comprar') submitBuy();
    else if (tab === 'gasto') submitExpense();
    else if (tab === 'emprestado') submitBorrow();
  };

  useShortcuts([
    { key: 'F2', allowInInput: true, handler: () => setTab('comprar') },
    { key: 'F4', allowInInput: true, handler: () => setTab('gasto') },
    { key: 'F6', allowInInput: true, handler: () => setTab('emprestado') },
    { key: 'F5', allowInInput: true, handler: () => submitRef.current() },
    {
      key: 'F7',
      allowInInput: true,
      handler: () => {
        if (tab !== 'comprar') setTab('comprar');
        requestAnimationFrame(() => {
          amountPaidRef.current?.focus();
          amountPaidRef.current?.select();
        });
      },
    },
    {
      key: 'F10',
      allowInInput: true,
      handler: () => {
        if (tab !== 'comprar') setTab('comprar');
        openItens(draftIndex);
      },
    },
    {
      key: 'Delete',
      allowInInput: true,
      handler: () => {
        if (tab !== 'comprar' || !showItens) return;
        removeActiveBuyLine();
      },
    },
    // Sem allowInInput: senão bloqueiam digitar nos campos.
    // Só na aba comprar — teclas vêm dos atalhos cadastrados no material.
    ...(tab === 'comprar'
      ? materials
          .filter((m) => m.hotkey)
          .map((m) => ({
            key: m.hotkey!,
            handler: () => selectMaterial(m.id),
          }))
      : []),
    {
      key: 'Enter',
      // Fora de text box: foca o valor (compacto ou itens)
      allowInInput: false,
      handler: () => {
        if (tab !== 'comprar' || buyItems.length === 0) return;
        if (showItens || buyItems.length >= 2) {
          openItens(draftIndex);
        } else {
          focusDraftValor();
        }
      },
    },
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
        if (getOpenCash()) openCloseModal();
      },
    },
    {
      key: 'F9',
      allowInInput: true,
      handler: () => {
        if (getOpenCash()) openTrocadoModal();
      },
    },
    {
      key: '/',
      ctrl: true,
      allowInInput: true,
      handler: () => setShowHelp((v) => !v),
    },
    {
      key: 'ArrowDown',
      allowInInput: false,
      handler: () => {
        if (tab !== 'comprar' || buyItems.length === 0) return;
        setLinesPanelOpen(true);
        focusLine(activeLineIndex + 1);
      },
    },
    {
      key: 'ArrowUp',
      allowInInput: false,
      handler: () => {
        if (tab !== 'comprar' || buyItems.length === 0) return;
        setLinesPanelOpen(true);
        focusLine(activeLineIndex - 1);
      },
    },
    {
      key: 'Escape',
      allowInInput: true,
      handler: () => {
        setShowCloseModal(false);
        setShowTrocadoModal(false);
        setShowHelp(false);
        setEditMov(null);
        setCommentMov(null);
      },
    },
  ]);

  const headerActions = (showCloseBtn: boolean) => (
    <div className="flex flex-wrap items-center gap-2">
      {showCloseBtn ? (
        <>
          <button
            type="button"
            onClick={openTrocadoModal}
            className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 text-sm font-bold text-ink-950 shadow-[0_0_18px_rgba(16,185,129,0.45)] ring-2 ring-emerald-300/60 transition hover:brightness-110"
            title="Adicionar trocado ao caixa aberto (F9)"
          >
            Trocado
            <kbd className="rounded bg-ink-950/25 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-950">
              F9
            </kbd>
          </button>
          <button
            type="button"
            onClick={openCloseModal}
            className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-orange-400 px-3.5 py-2 text-sm font-bold text-ink-950 shadow-[0_0_22px_rgba(245,124,0,0.55),0_0_8px_rgba(245,124,0,0.85)] ring-2 ring-brand-300/70 transition hover:brightness-110 hover:shadow-[0_0_28px_rgba(245,124,0,0.75)]"
            title="Fechar o caixa do dia (F8)"
          >
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-white/20 opacity-0 transition group-hover:opacity-100" />
            Fechar caixa
            <kbd className="rounded bg-ink-950/25 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-950">
              F8
            </kbd>
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setShowOperatorPicker(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-ink-900/60 px-2.5 py-1.5 text-xs text-ink-100 hover:border-brand-400/40"
        title="Trocar quem está no caixa"
      >
        {operator ? (
          <img
            src={operator.avatar}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : null}
        <span>
          No caixa: <strong>{username || '—'}</strong>
        </span>
        <span className="text-brand-400">Trocar</span>
      </button>
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
  );

  const submitOpenCash = () => {
    const parts: string[] = [];
    if (openAdjustNote.trim()) parts.push(openAdjustNote.trim());
    if (!openManualMode && openExtraAmount > 0) {
      parts.push(
        `+ R$ ${formatMoney(openExtraAmount)} adicionados na abertura`,
      );
    }
    if (openManualMode) {
      parts.push(
        `Abertura com valor informado manualmente (sugerido era R$ ${formatMoney(openBaseAmount)})`,
      );
    }
    void openCash({
      openedBy: username,
      openingBalance: totalToOpen,
      notes: parts.length ? parts.join(' · ') : undefined,
      allowMultiple: settings['cash.allowMultipleOpen'],
    })
      .then(() => {
        setExtraOpening('');
        setOpenManualMode(false);
        setOpenAdjustNote('');
        refresh();
        setInfo('Caixa aberto.');
      })
      .catch((e: Error) => setError(e.message));
  };

  if (!open) {
    return (
      <div className="flex min-h-0 flex-col pb-1">
        <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl tracking-wide text-ink-50">
              Caixa
            </h1>
            <p className="mt-0.5 max-w-xl text-sm text-ink-300">
              Abra o caixa para começar a comprar.
            </p>
          </div>
          {headerActions(false)}
        </div>
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

        <PlaceholderCard className="mx-auto w-full max-w-lg !p-5">
          <div className="text-center">
            <p className="font-display text-3xl tracking-wide text-brand-400">
              Abra o caixa
            </p>
            <p className="mt-2 text-sm text-ink-200">
              {settings['cash.openMode'] === 'manual'
                ? 'Abertura manual: confira o dinheiro e abra o caixa do dia para comprar e lançar gastos.'
                : 'Para começar a comprar sucata e lançar gastos, abra o caixa do dia com o dinheiro que tem aí.'}
            </p>
          </div>

          <ol className="mt-5 space-y-4">
            <li className="rounded-xl border border-white/10 bg-ink-900/50 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-ink-950">
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-50">
                    {suggested.source === 'last_close'
                      ? 'Saldo que sobrou ontem'
                      : 'Saldo sugerido para começar'}
                  </p>
                  <p className="mt-1 font-display text-3xl tracking-wide text-brand-400">
                    R$ {formatMoney(openBaseAmount)}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    {suggested.source === 'last_close'
                      ? 'É o valor do último fechamento. Se não mexer em nada, o caixa abre com esse total.'
                      : 'Ainda não há fechamento anterior — usamos o valor padrão das configurações.'}
                  </p>
                </div>
              </div>
            </li>

            {!openManualMode ? (
              <>
                <li className="rounded-xl border border-white/10 bg-ink-900/40 p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-700 text-sm font-bold text-ink-100">
                      2
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-50">
                        Quer colocar mais dinheiro? (opcional)
                      </p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        Ex.: entrou com trocado novo. Deixe em branco se for só o
                        saldo de cima.
                      </p>
                      <MoneyInput
                        className={`${fieldClass} !mt-2 w-full max-w-[14rem] !py-2.5 text-base`}
                        value={extraOpening}
                        onValueChange={setExtraOpening}
                        aria-label="Adicionar mais ao caixa"
                      />
                    </div>
                  </div>
                </li>

                <li className="rounded-xl border border-brand-500/35 bg-brand-500/10 p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-ink-950">
                      3
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-50">
                        Total que vai entrar no caixa
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-50">
                        R$ {formatMoney(totalToOpen)}
                      </p>
                      <p className="mt-1 text-xs text-ink-300">
                        {openExtraAmount > 0
                          ? `R$ ${formatMoney(openBaseAmount)} de ontem + R$ ${formatMoney(openExtraAmount)} a mais`
                          : `Mesmo valor do passo 1 — sem adicional.`}
                      </p>
                      <button
                        type="button"
                        className="mt-2 text-xs text-ink-400 underline-offset-2 hover:text-brand-300 hover:underline"
                        onClick={() => {
                          setOpenManualMode(true);
                          setManualOpening(String(totalToOpen));
                        }}
                      >
                        O saldo está diferente? Informar outro valor
                      </button>
                    </div>
                  </div>
                </li>
              </>
            ) : (
              <li className="rounded-xl border border-white/10 bg-ink-900/40 p-3.5">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-700 text-sm font-bold text-ink-100">
                    2
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-50">
                      Digite o valor total que tem no caixa agora
                    </p>
                    <MoneyInput
                      className={`${fieldClass} !mt-2 w-full max-w-[14rem] !py-2.5 text-base`}
                      value={manualOpening}
                      onValueChange={setManualOpening}
                    />
                    <button
                      type="button"
                      className="mt-2 text-xs text-ink-400 underline-offset-2 hover:text-brand-300 hover:underline"
                      onClick={() => {
                        setOpenManualMode(false);
                        setExtraOpening('');
                      }}
                    >
                      Voltar: usar ontem + adicionar trocados
                    </button>
                  </div>
                </div>
              </li>
            )}
          </ol>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink-300">
              Observação (opcional)
            </span>
            <input
              className={`${fieldClass} !mt-1 !py-2`}
              value={openAdjustNote}
              onChange={(e) => setOpenAdjustNote(e.target.value)}
              placeholder="Ex.: coloquei R$ 50 de trocado"
            />
          </label>

          <PrimaryButton className="mt-4 w-full !py-3 text-base" onClick={submitOpenCash}>
            Abrir caixa e começar a comprar — R$ {formatMoney(totalToOpen)}
          </PrimaryButton>
          <p className="mt-2 text-center text-[11px] text-ink-500">
            Depois de abrir, você usa Comprar, Gasto e Fechar normalmente.
          </p>
        </PlaceholderCard>

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
                {CASH_SHORTCUT_HELP.map((row) => (
                  <li key={row.keys} className="flex justify-between gap-4">
                    <kbd className="text-brand-400">{row.keys}</kbd>
                    <span className="text-ink-200">{row.desc}</span>
                  </li>
                ))}
              </ul>
              <GhostButton className="mt-4" onClick={() => setShowHelp(false)}>
                Fechar
              </GhostButton>
            </div>
          </div>
        )}

        {showOperatorPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-ink-900 shadow-panel">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h3 className="font-semibold text-ink-50">
                  Trocar quem está no caixa
                </h3>
                <button
                  type="button"
                  className="text-sm text-ink-400 hover:text-ink-100"
                  onClick={() => setShowOperatorPicker(false)}
                >
                  Fechar
                </button>
              </div>
              <OperatorPicker
                compact
                title="Operador do caixa"
                subtitle="Manhã, tarde ou a qualquer momento — as compras ficam no nome de quem lançar."
                onSelect={(op) => {
                  setOperator(op.id);
                  setShowOperatorPicker(false);
                  setInfo(`Agora no caixa: ${op.name}`);
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col pb-1">
      <div className="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl tracking-wide text-ink-50">
            Caixa
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-300">
            Comprar material (sai dinheiro + entra no pátio). Venda é na aba Vendas.
          </p>
        </div>
        {headerActions(true)}
      </div>
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-moss-500/25 bg-moss-700/15 px-3 py-2 text-sm">
        <span className="font-semibold text-moss-400">Aberto</span>
        <span className="text-ink-300">
          {new Date(open.openedAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          · {open.openedBy}
        </span>
        <span className="font-medium text-ink-50">
          Esperado R$ {formatMoney(expected)}
        </span>
        <span className="text-ink-400">
          Inicial R$ {formatMoney(open.openingBalance)}
        </span>
        {openLoansTotal > 0 ? (
          <span className="font-medium text-violet-200">
            A devolver R$ {formatMoney(openLoansTotal)}
          </span>
        ) : null}
        {autoCloseAt && settings['cash.closeMode'] === 'auto' && (
          <span className="text-xs text-ink-400">
            Auto {settings['cash.autoCloseTime']}
          </span>
        )}
      </div>

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

      <div className="mt-2 min-h-0 flex-1">
        {tab === 'comprar' && (
          <>
          <PlaceholderCard className="flex max-h-[min(52rem,calc(100vh-12rem))] flex-col !p-0 overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              <p className="text-xs text-ink-300">
                Pessoa traz sucata → paga agora → material entra no pátio. Informe
                peso ou valor pago — o outro calcula sozinho.
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
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
                <label className="block">
                  <span className="sr-only">Data/hora da compra</span>
                  <input
                    type="datetime-local"
                    className={`${fieldClass} !mt-0 !py-1.5`}
                    value={purchaseAtLocal}
                    onChange={(e) => setPurchaseAtLocal(e.target.value)}
                    title="Data/hora da compra (pode ser antiga se lançar do papel)"
                  />
                </label>
              </div>
              <p className="text-[10px] text-ink-500">
                Data/hora: use agora ou a do papel se esqueceu de lançar no momento.
              </p>

              <p className="text-[10px] uppercase tracking-wide text-ink-400">
                Materiais — clique ou atalho cadastrado (0–9 / A–Z)
              </p>
              <div className="flex max-h-[min(14rem,36vh)] flex-wrap content-start gap-2 overflow-y-auto pr-1">
                {materials.map((m) => {
                  const selected = buyItems.some((r) => r.materialId === m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => selectMaterial(m.id)}
                      title={m.hotkey ? `${m.name} · atalho ${m.hotkey}` : m.name}
                      className={`relative flex h-[5.5rem] w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border p-1.5 text-center transition ${
                        selected
                          ? 'border-brand-500 bg-brand-500/20 ring-1 ring-brand-500/40'
                          : 'border-white/10 bg-ink-900/50 hover:border-brand-400/50 hover:bg-ink-800/80'
                      }`}
                    >
                      {m.hotkey ? (
                        <span className="absolute -right-1 -top-1 z-10 flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-500 px-1 font-display text-sm font-black leading-none uppercase text-ink-950 shadow-[0_0_10px_rgba(245,124,0,0.65)] ring-2 ring-ink-950">
                          {m.hotkey}
                        </span>
                      ) : null}
                      <MaterialThumb material={m} className="!h-11 !w-11" />
                      <span className="line-clamp-2 w-full px-0.5 text-[10px] font-semibold leading-tight text-ink-50">
                        {m.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {showDraftEditor ? (
                <div className="rounded-lg border border-white/10 bg-ink-900/40 p-2">
                  <div className="mb-1.5 flex items-center gap-2">
                    <MaterialThumb material={getMaterial(draftItem.materialId)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-50">
                        {getMaterial(draftItem.materialId)?.name ?? 'Material'}
                      </div>
                      <div className="text-[11px] text-ink-400">
                        R$ {parseNum(draftItem.unitPrice || '0').toFixed(2)}/kg
                        · digite o valor · Enter libera atalhos
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <kbd className="rounded-md bg-brand-500 px-1.5 py-0.5 font-display text-xs font-black leading-none text-ink-950 shadow-[0_0_10px_rgba(245,124,0,0.55)] ring-1 ring-brand-300/80">
                        Enter
                      </kbd>
                      <kbd className="rounded-md bg-brand-500 px-1.5 py-0.5 font-display text-xs font-black leading-none text-ink-950 shadow-[0_0_10px_rgba(245,124,0,0.55)] ring-1 ring-brand-300/80">
                        F10
                      </kbd>
                    </div>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <label className="block">
                      <span className="text-[10px] uppercase text-ink-400">Peso</span>
                      <input
                        className={`${fieldClass} !mt-0.5 !py-1.5`}
                        placeholder="0,000"
                        value={draftItem.weight}
                        onChange={(e) =>
                          patchItem(draftItem.key, {
                            weight: e.target.value,
                            editSource: 'weight',
                          })
                        }
                        onKeyDown={blurOnEnter}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase text-ink-400">R$/kg</span>
                      <input
                        className={`${fieldClass} !mt-0.5 !py-1.5`}
                        value={draftItem.unitPrice}
                        onChange={(e) =>
                          patchItem(draftItem.key, {
                            unitPrice: e.target.value,
                            editSource: 'unitPrice',
                          })
                        }
                        onKeyDown={blurOnEnter}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase text-ink-400">Valor</span>
                      <MoneyInput
                        inputRef={draftValorRef}
                        className={`${fieldClass} !mt-0.5 !py-1.5 border-brand-500/40`}
                        value={draftItem.lineTotal}
                        onValueChange={(v) =>
                          patchItem(draftItem.key, {
                            lineTotal: v,
                            editSource: 'total',
                          })
                        }
                        onEnterKey={(e) => {
                          e.preventDefault();
                          confirmItemValor(draftIndex);
                        }}
                      />
                    </label>
                    <div className="flex items-end">
                      <PrimaryButton
                        className="!py-1.5 !text-xs whitespace-nowrap"
                        onClick={() => confirmItemValor(draftIndex)}
                        title="Com valor preenchido: confirma e libera atalhos (Enter)"
                      >
                        Confirmar item (Enter)
                      </PrimaryButton>
                    </div>
                  </div>
                </div>
              ) : null}
              </div>

              {showItens ? (
                <aside
                  className="flex w-full shrink-0 flex-col border-t border-brand-500/35 bg-ink-950/90 lg:w-[22rem] lg:border-l lg:border-t-0"
                  style={{ maxHeight: 'calc(100vh - 14rem)' }}
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                    <div>
                      <span className="text-sm font-semibold text-ink-50">
                        Itens ({buyItems.length}) · R$ {formatMoney(buyTotal)}
                      </span>
                      <p className="text-[10px] text-ink-500">
                        Enter confirma · ↑ ↓ navega · Del exclui o selecionado
                      </p>
                    </div>
                    {!multiItens ? (
                      <button
                        type="button"
                        className="text-xs text-ink-400 hover:text-ink-100"
                        onClick={() => setLinesPanelOpen(false)}
                      >
                        Fechar
                      </button>
                    ) : null}
                  </div>
                  <ul className="min-h-0 divide-y divide-white/5 overflow-y-auto overscroll-contain">
                    {buyItems.map((row, idx) => {
                      const mat = getMaterial(row.materialId);
                      const active = idx === activeLineIndex;
                      return (
                        <li
                          key={row.key}
                          className={`px-2.5 py-1.5 transition ${
                            active
                              ? 'bg-brand-500/15'
                              : 'hover:bg-white/[0.04]'
                          }`}
                          onClick={() => focusLine(idx)}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span
                              className={`w-5 shrink-0 text-center text-[10px] font-semibold tabular-nums ${
                                active ? 'text-brand-400' : 'text-ink-500'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-100">
                              {mat?.name ?? 'Material'}
                            </span>
                            <span className="shrink-0 text-[10px] tabular-nums text-ink-500">
                              R$ {parseNum(row.unitPrice || '0').toFixed(2)}/kg
                            </span>
                            {active ? (
                              <button
                                type="button"
                                className="shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeBuyLine(row.key);
                                  releaseShortcutFocus();
                                }}
                                title="Excluir item selecionado (Del)"
                              >
                                <kbd className="rounded-md bg-red-500 px-1.5 py-0.5 font-display text-xs font-black leading-none text-white shadow-[0_0_10px_rgba(239,68,68,0.65)] ring-1 ring-red-300/80">
                                  Del
                                </kbd>
                              </button>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 pl-5">
                            <input
                              className={`${fieldClass} !mt-0 !px-1.5 !py-1 text-xs`}
                              placeholder="kg"
                              value={row.weight}
                              onChange={(e) =>
                                patchItem(row.key, {
                                  weight: e.target.value,
                                  editSource: 'weight',
                                })
                              }
                              onFocus={() => setActiveLineIndex(idx)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  focusLine(idx + 1);
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  focusLine(idx - 1);
                                } else if (e.key === 'Delete') {
                                  e.preventDefault();
                                } else {
                                  blurOnEnter(e);
                                }
                              }}
                              title="Peso (kg)"
                            />
                            <input
                              className={`${fieldClass} !mt-0 !px-1.5 !py-1 text-xs`}
                              placeholder="R$/kg"
                              value={row.unitPrice}
                              onChange={(e) =>
                                patchItem(row.key, {
                                  unitPrice: e.target.value,
                                  editSource: 'unitPrice',
                                })
                              }
                              onFocus={() => setActiveLineIndex(idx)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  focusLine(idx + 1);
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  focusLine(idx - 1);
                                } else if (e.key === 'Delete') {
                                  e.preventDefault();
                                } else {
                                  blurOnEnter(e);
                                }
                              }}
                              title="Preço R$/kg"
                            />
                            <MoneyInput
                              inputRef={(el) => {
                                lineInputRefs.current[idx] = el;
                              }}
                              className={`${fieldClass} !mt-0 !px-1.5 !py-1 text-xs border-brand-500/40`}
                              placeholder="R$"
                              value={row.lineTotal}
                              onValueChange={(v) =>
                                patchItem(row.key, {
                                  lineTotal: v,
                                  editSource: 'total',
                                })
                              }
                              onFocus={() => setActiveLineIndex(idx)}
                              onKeyDownExtra={(e) => onLineMoneyKeyDown(e, idx)}
                              title="Valor (R$)"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="shrink-0 border-t border-white/10 px-2 py-1.5">
                    <GhostButton className="!w-full !py-1 text-xs" onClick={addBuyLine}>
                      + linha
                    </GhostButton>
                  </div>
                </aside>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-ink-900/95 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <GhostButton className="!py-1 text-xs" onClick={addBuyLine}>
                  + linha
                </GhostButton>
                {!multiItens ? (
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() =>
                      showItens ? setLinesPanelOpen(false) : openItens(draftIndex)
                    }
                    title="Abrir/fechar itens da compra (F10)"
                  >
                    {showItens ? 'Ocultar itens' : 'Itens'}
                    <kbd className="ml-1 rounded-md bg-brand-500 px-1.5 py-0.5 font-display text-xs font-black leading-none text-ink-950 shadow-[0_0_10px_rgba(245,124,0,0.55)]">
                      F10
                    </kbd>
                  </GhostButton>
                ) : (
                  <GhostButton
                    className="!py-1 text-xs"
                    onClick={() => openItens(draftIndex)}
                    title="Ir para o valor do item (F10)"
                  >
                    Itens
                    <kbd className="ml-1 rounded-md bg-brand-500 px-1.5 py-0.5 font-display text-xs font-black leading-none text-ink-950 shadow-[0_0_10px_rgba(245,124,0,0.55)]">
                      F10
                    </kbd>
                  </GhostButton>
                )}
                <span className="font-semibold text-brand-400">
                  Total R$ {buyTotal.toFixed(2)}
                </span>
                <label className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-300">
                    Pago total
                    <kbd className="rounded-md bg-brand-500 px-1.5 py-0.5 font-display text-xs font-black leading-none text-ink-950 shadow-[0_0_10px_rgba(245,124,0,0.55)] ring-1 ring-brand-300/80">
                      F7
                    </kbd>
                  </span>
                  <MoneyInput
                    inputRef={amountPaidRef}
                    className={`${fieldClass} !mt-0 w-32 !py-1.5`}
                    value={amountPaid}
                    onValueChange={onPaidChange}
                    onEnterKey={(e) => {
                      e.preventDefault();
                      // Enter ≠ F5: confirma item e libera atalhos
                      confirmItemValor(draftIndex);
                    }}
                    title={
                      buyItems.length === 1
                        ? 'Com 1 material: altera o peso automaticamente (F7). Enter confirma e libera atalhos'
                        : 'Valor que saiu do caixa — soma das linhas (F7). Enter libera atalhos'
                    }
                  />
                </label>
                <PrimaryButton className="!py-2" onClick={submitBuy}>
                  Finalizar compra{' '}
                  <kbd className="ml-1 rounded bg-ink-950/25 px-1.5 py-0.5 font-display text-xs font-black tracking-wide text-ink-950">
                    F5
                  </kbd>
                </PrimaryButton>
              </div>
            </div>
          </PlaceholderCard>

          {open ? (
            <div className="mt-2 rounded-xl border border-white/10 bg-ink-900/50 px-3 py-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                Movimentos deste caixa
              </p>
              {sessionMovements.length > 0 ? (
                <ul className="max-h-36 space-y-0.5 overflow-auto">
                  {sessionMovements.map((m) => {
                    const tone = movementTone(m.movementType);
                    const income = isCashIn(m.movementType);
                    const label =
                      m.detail || m.description || movementLabel(m.movementType);
                    const cashDay = businessDateLocal(open.openedAt);
                    const purchase =
                      m.refType === 'PURCHASE' && m.refId
                        ? getPurchase(m.refId)
                        : undefined;
                    const remarcado =
                      !!purchase &&
                      businessDateLocal(purchase.purchasedAt) !== cashDay;
                    return (
                      <li
                        key={m.id}
                        className={`flex items-center justify-between gap-2 px-0.5 py-1 text-xs ${
                          remarcado
                            ? 'rounded border border-sky-400/35 bg-sky-500/10 px-1.5'
                            : ''
                        }`}
                      >
                        <span className="min-w-0 truncate text-ink-300">
                          <span
                            className={`mr-1 inline-block rounded px-1 py-0.5 text-[10px] font-medium ${tone.badge}`}
                          >
                            {movementLabel(m.movementType)}
                          </span>
                          {remarcado ? (
                            <span className="mr-1 inline-block rounded bg-sky-400/90 px-1 py-0.5 text-[9px] font-bold uppercase text-ink-950">
                              Remarcado
                            </span>
                          ) : null}
                          <span className="text-ink-100">{label}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span
                            className={`font-semibold tabular-nums ${tone.amount}`}
                          >
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
                                  : deleteCashMovement(open.id, m.id).then(
                                      async (cash) => {
                                        if (m.movementType === 'EMPRESTIMO') {
                                          await cancelCashLoanByBorrowMovement(
                                            m.id,
                                          );
                                        }
                                        return cash;
                                      },
                                    );
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
              ) : (
                <p className="text-[11px] text-ink-500">
                  Nenhum lançamento neste caixa ainda.
                </p>
              )}
            </div>
          ) : null}
          </>
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
              <MoneyInput
                className={`${fieldClass} !mt-0 w-28 !py-1.5`}
                placeholder="R$"
                value={expenseAmount}
                onValueChange={setExpenseAmount}
              />
              <PrimaryButton className="!py-1.5" onClick={submitExpense}>
                Lançar
              </PrimaryButton>
            </div>
          </PlaceholderCard>
        )}

        {tab === 'emprestado' && (
          <PlaceholderCard className="!p-3">
            <p className="mb-3 text-sm text-ink-300">
              Acabou o troco? Registre aqui o que pegou emprestado (ex.: vizinha).
              O dinheiro entra no caixa e fica na lista <strong>A devolver</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${fieldClass} !mt-0 min-w-[10rem] flex-1 !py-1.5`}
                placeholder="De quem? (ex.: vizinha)"
                value={loanPerson}
                onChange={(e) => setLoanPerson(e.target.value)}
              />
              <MoneyInput
                className={`${fieldClass} !mt-0 w-28 !py-1.5`}
                placeholder="R$"
                value={loanAmount}
                onValueChange={setLoanAmount}
              />
              <input
                className={`${fieldClass} !mt-0 min-w-[8rem] flex-1 !py-1.5`}
                placeholder="Obs. (opcional)"
                value={loanNote}
                onChange={(e) => setLoanNote(e.target.value)}
              />
              <PrimaryButton className="!py-1.5" onClick={submitBorrow}>
                Peguei emprestado (F5)
              </PrimaryButton>
            </div>

            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-violet-200">
                  A devolver
                </p>
                {openLoansTotal > 0 ? (
                  <p className="text-sm font-semibold tabular-nums text-violet-200">
                    Total R$ {formatMoney(openLoansTotal)}
                  </p>
                ) : null}
              </div>
              {openLoans.length === 0 ? (
                <p className="text-xs text-ink-500">
                  Nada pendente. Quando pegar emprestado, aparece aqui até
                  devolver.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {openLoans.map((loan) => (
                    <li
                      key={loan.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-50">
                          {loan.person}
                        </p>
                        <p className="text-xs text-ink-400">
                          R$ {formatMoney(loan.amount)} ·{' '}
                          {new Date(loan.borrowedAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {loan.note ? ` · ${loan.note}` : ''}
                        </p>
                      </div>
                      <PrimaryButton
                        className="!bg-violet-500 !py-1.5 text-xs"
                        onClick={() => submitRepay(loan.id, loan.person)}
                      >
                        Devolver
                      </PrimaryButton>
                    </li>
                  ))}
                </ul>
              )}
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
                        if (m.refType === 'PURCHASE' && m.refId) {
                          if (
                            !confirm(
                              'Excluir esta compra? Some do caixa e do pátio.',
                            )
                          ) {
                            return;
                          }
                          void deletePurchase(m.refId)
                            .then(() => {
                              refresh();
                              setInfo('Compra excluída (caixa + pátio).');
                            })
                            .catch((err: Error) => setError(err.message));
                          return;
                        }
                        if (!confirm('Excluir este lançamento?')) return;
                        void deleteCashMovement(open.id, m.id)
                          .then(async () => {
                            if (m.movementType === 'EMPRESTIMO') {
                              await cancelCashLoanByBorrowMovement(m.id);
                            }
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
      </div>

      {showTrocadoModal && open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowTrocadoModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-emerald-500/40 bg-ink-900 p-5 shadow-[0_0_40px_rgba(16,185,129,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-2xl tracking-wide text-emerald-400">
              Adicionar trocado
            </h3>
            <p className="mt-1 text-sm text-ink-300">
              Coloca dinheiro (trocado) no caixa aberto sem fechar a sessão.
            </p>
            <div className="mt-4 space-y-3">
              <Field label="Valor (R$)">
                <input
                  ref={trocadoFocusRef}
                  className={fieldClass}
                  value={trocadoAmount}
                  onChange={(e) => setTrocadoAmount(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmAddTrocado();
                    }
                  }}
                />
              </Field>
              <Field label="Observação (opcional)">
                <input
                  className={fieldClass}
                  value={trocadoNote}
                  onChange={(e) => setTrocadoNote(e.target.value)}
                  placeholder="Ex.: trocado do banco"
                />
              </Field>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <GhostButton type="button" onClick={() => setShowTrocadoModal(false)}>
                Cancelar
              </GhostButton>
              <PrimaryButton
                type="button"
                className="!bg-emerald-500 hover:!bg-emerald-400"
                onClick={confirmAddTrocado}
              >
                Confirmar trocado
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowCloseModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-brand-500/40 bg-ink-900 p-5 shadow-[0_0_40px_rgba(245,124,0,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl tracking-wide text-brand-400">
                  Fechar caixa
                </h3>
                <p className="mt-1 text-sm text-ink-300">
                  Resumo do dia antes de encerrar. Confira os valores e conte o
                  dinheiro.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-white/5 hover:text-ink-100"
                onClick={() => setShowCloseModal(false)}
              >
                Esc
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-ink-950/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-ink-500">
                  Saldo inicial
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink-50">
                  R$ {formatMoney(open.openingBalance)}
                </p>
              </div>
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-orange-200/80">
                  Material comprado
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-orange-200">
                  − R$ {formatMoney(dayPurchases)}
                </p>
              </div>
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-red-200/80">
                  Gastos / despesas
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-red-200">
                  − R$ {formatMoney(dayExpenses)}
                </p>
              </div>
              {(dayLoansIn > 0 || openLoansTotal > 0) && (
                <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-violet-200/80">
                    Peguei emprestado (hoje)
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-violet-200">
                    + R$ {formatMoney(dayLoansIn)}
                  </p>
                </div>
              )}
              {dayLoansOut > 0 && (
                <div className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-fuchsia-200/80">
                    Devoluções (hoje)
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-fuchsia-200">
                    − R$ {formatMoney(dayLoansOut)}
                  </p>
                </div>
              )}
              {openLoansTotal > 0 && (
                <div className="col-span-2 rounded-xl border border-violet-500/40 bg-violet-500/15 px-3 py-2.5 sm:col-span-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                    Ainda a devolver (pendente)
                  </p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-violet-100">
                    R$ {formatMoney(openLoansTotal)}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-300">
                    {openLoans.map((l) => (
                      <li key={l.id}>
                        {l.person} — R$ {formatMoney(l.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {daySales > 0 && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-200/80">
                    Trocado / vendas no caixa
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-200">
                    + R$ {formatMoney(daySales)}
                  </p>
                </div>
              )}
              {daySupplies > 0 && (
                <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-sky-200/80">
                    Entradas / suprimentos
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-sky-200">
                    + R$ {formatMoney(daySupplies)}
                  </p>
                </div>
              )}
              {dayOutOther > 0 && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-rose-200/80">
                    Sangrias / saídas
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-rose-200">
                    − R$ {formatMoney(dayOutOther)}
                  </p>
                </div>
              )}
              <div className="col-span-2 rounded-xl border border-brand-500/40 bg-brand-500/15 px-3 py-3 sm:col-span-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-200">
                  Saldo esperado no caixa agora
                </p>
                <p className="mt-0.5 font-display text-3xl tracking-wide text-brand-400">
                  R$ {formatMoney(expected)}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {open.movements.length} lançamento
                  {open.movements.length === 1 ? '' : 's'} · aberto às{' '}
                  {new Date(open.openedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  por {open.openedBy}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-ink-200">
                  Quanto tem no caixa agora? (contado)
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-500">
                  Em branco = usa o esperado (R$ {formatMoney(expected)}).
                </span>
                <MoneyInput
                  inputRef={closeFocusRef}
                  className={`${fieldClass} !mt-1.5 !py-2.5 text-base`}
                  placeholder={formatMoney(expected)}
                  value={informed}
                  onValueChange={setInformed}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-200">
                  Justificativa se der diferença
                  {settings['cash.requireDifferenceReason']
                    ? ' (obrigatória se diferir)'
                    : ' (opcional)'}
                </span>
                <input
                  className={`${fieldClass} !mt-1 !py-2`}
                  placeholder="Ex.: faltou R$ 5 de troco"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <GhostButton
                className="!py-2 text-xs"
                onClick={() => downloadCashClosePdf(open)}
              >
                PDF do caixa
              </GhostButton>
              <GhostButton
                className="!py-2 text-xs"
                onClick={() =>
                  void shareCashClosePdfWhatsApp(open)
                    .then((r) => setInfo(r.hint))
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Falha ao abrir WhatsApp',
                      ),
                    )
                }
              >
                WhatsApp
              </GhostButton>
              <div className="ml-auto flex flex-wrap gap-2">
                <GhostButton
                  className="!py-2"
                  onClick={() => setShowCloseModal(false)}
                >
                  Continuar trabalhando
                </GhostButton>
                <PrimaryButton
                  className="!bg-brand-500 !py-2.5 shadow-[0_0_18px_rgba(245,124,0,0.45)]"
                  onClick={confirmCloseCash}
                >
                  Confirmar fechamento
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {editMov && open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-ink-800 p-4">
            <h3 className="font-semibold">Editar lançamento</h3>
            <Field label="Valor">
              <MoneyInput
                className={fieldClass}
                value={editAmount}
                onValueChange={setEditAmount}
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

      {showOperatorPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-ink-900 shadow-panel">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="font-semibold text-ink-50">Trocar quem está no caixa</h3>
              <button
                type="button"
                className="text-sm text-ink-400 hover:text-ink-100"
                onClick={() => setShowOperatorPicker(false)}
              >
                Fechar
              </button>
            </div>
            <OperatorPicker
              compact
              title="Operador do caixa"
              subtitle="Manhã, tarde ou a qualquer momento — as compras ficam no nome de quem lançar."
              onSelect={(op) => {
                setOperator(op.id);
                setShowOperatorPicker(false);
                setInfo(`Agora no caixa: ${op.name}`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function SalesPage() {
  return <CashOpsPage />;
}
