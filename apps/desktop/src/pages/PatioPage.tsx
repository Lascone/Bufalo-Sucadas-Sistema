import { useMemo, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { ReportFilters } from '../components/ReportFilters';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { MaterialThumb } from '../components/MaterialThumb';
import { getMaterial } from '../lib/materials';
import { getPurchase, reducePurchaseStock, reduceMaterialStockFifo, zeroMaterialPurchaseLots, availableFifoKg, undoPurchaseStockAdjustment } from '../lib/purchases';
import {
  getPatioBalances,
  getMaterialBalance,
  listPatioMovements,
  listPurchaseLotsByMaterial,
  sumPatioMovements,
  type PatioMovement,
} from '../lib/patio';
import {
  collectAvailableDays,
  defaultReportFilter,
  describeFilter,
  matchesReportFilter,
  type ReportFilterState,
} from '../lib/reports';
import {
  downloadPatioReportPdf,
  exportPatioReportCsv,
  sharePatioReportPdfWhatsApp,
} from '../lib/pdf';
import { useAppStore } from '../stores/app-store';

function money(n: number) {
  return `R$ ${n.toFixed(2)}`;
}

const REASONS = [
  'Perda / sobra',
  'Devolução',
  'Correção de peso',
  'Outro',
] as const;

export function PatioPage() {
  const operatorName = useAppStore((s) => s.session.username);
  const [filter, setFilter] = useState<ReportFilterState>(() =>
    defaultReportFilter(),
  );
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [materialId, setMaterialId] = useState('');
  const [purchaseId, setPurchaseId] = useState('');
  const [kg, setKg] = useState('');
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [purchaseModalId, setPurchaseModalId] = useState<string | null>(null);
  const [fifoModal, setFifoModal] = useState<{
    materialId: string;
    materialName: string;
    availableKg: number;
  } | null>(null);
  const [fifoKg, setFifoKg] = useState('');
  const [fifoBusy, setFifoBusy] = useState(false);
  const { menu, open: openMenu, openAt, close: closeMenu } = useContextMenu();

  void tick;
  const refresh = () => setTick((t) => t + 1);

  const balances = getPatioBalances();
  const allMovements = listPatioMovements();

  const availableDays = useMemo(
    () => collectAvailableDays(allMovements.map((m) => m.at)),
    [allMovements.length, tick],
  );

  const filtered = useMemo(
    () => allMovements.filter((m) => matchesReportFilter(m.at, filter)),
    [allMovements, filter, tick],
  );

  const summary = useMemo(() => sumPatioMovements(filtered), [filtered]);

  const lots = useMemo(
    () => (materialId ? listPurchaseLotsByMaterial(materialId) : []),
    [materialId, tick],
  );

  const selectedLot =
    lots.find((l) => l.purchaseId === purchaseId) ?? lots[0] ?? null;

  const selectMaterial = (id: string) => {
    setMaterialId(id);
    const nextLots = listPurchaseLotsByMaterial(id);
    setPurchaseId(nextLots[0]?.purchaseId ?? '');
    setKg('');
    setError(null);
  };

  const submitBaixa = () => {
    setError(null);
    setInfo(null);
    const lot = selectedLot;
    if (!lot) {
      setError('Escolha um material com saldo e a compra de origem.');
      return;
    }
    const weight = Number(String(kg).replace(',', '.'));
    const reasonText =
      reason === 'Outro' ? customReason.trim() || 'Outro' : reason;
    void reducePurchaseStock({
      purchaseId: lot.purchaseId,
      materialId: lot.materialId,
      weight,
      reason: reasonText,
      operator: operatorName || undefined,
    })
      .then((r) => {
        setInfo(
          r.deleted
            ? `Baixa de ${r.reducedKg.toFixed(3)} kg — compra zerada e excluída (−${money(r.refundValue)}).`
            : `Baixa de ${r.reducedKg.toFixed(3)} kg na compra (−${money(r.refundValue)}). Pátio e compra atualizados.`,
        );
        setKg('');
        refresh();
        const still = listPurchaseLotsByMaterial(lot.materialId);
        if (still.length === 0) {
          setMaterialId('');
          setPurchaseId('');
        } else {
          setPurchaseId(still[0]!.purchaseId);
        }
      })
      .catch((e: Error) => setError(e.message));
  };

  const reportPayload = () => ({
    filterLabel: describeFilter(filter),
    inKg: summary.inKg,
    outKg: summary.outKg,
    inValue: summary.inValue,
    outValue: summary.outValue,
    count: summary.count,
    byMaterial: summary.byMaterial.map((m) => ({
      materialName: m.materialName,
      inKg: m.inKg,
      outKg: m.outKg,
      netKg: m.netKg,
    })),
    rows: filtered.map((m: PatioMovement) => ({
      at: new Date(m.at).toLocaleString('pt-BR'),
      kind: m.kind === 'IN' ? 'ENTRADA' : 'SAÍDA',
      material: m.materialName,
      weight: m.weight,
      unitCost: m.unitCost,
      source: m.sourceType,
    })),
  });

  const openFifoModal = (materialIdSel: string) => {
    const bal = getMaterialBalance(materialIdSel);
    const available = availableFifoKg(materialIdSel);
    if (available <= 0.0005) {
      setError('Não há kg disponível para baixa neste material.');
      return;
    }
    setError(null);
    setFifoKg('');
    setFifoModal({
      materialId: materialIdSel,
      materialName: bal?.materialName ?? 'Material',
      availableKg: available,
    });
  };

  const submitFifoBaixa = () => {
    if (!fifoModal) return;
    setError(null);
    setInfo(null);
    const weight = Number(String(fifoKg).replace(',', '.'));
    if (!(weight > 0)) {
      setError('Informe quantos kg quer baixar.');
      return;
    }
    setFifoBusy(true);
    void reduceMaterialStockFifo({
      materialId: fifoModal.materialId,
      weight,
      reason: `Baixa FIFO ${weight.toFixed(3)} kg`,
      operator: operatorName || undefined,
    })
      .then((r) => {
        const near =
          Math.abs(r.reducedKg - r.targetKg) > 0.0005
            ? ` (pedido ${r.targetKg.toFixed(3)} kg · disponível ${r.availableKg.toFixed(3)} kg)`
            : '';
        setInfo(
          `Baixa FIFO: −${r.reducedKg.toFixed(3)} kg de ${fifoModal.materialName} em ${r.lotsTouched.length} lote(s) (−${money(r.refundValue)})${near}.`,
        );
        setFifoModal(null);
        setFifoKg('');
        refresh();
        if (materialId === fifoModal.materialId) {
          const still = listPurchaseLotsByMaterial(fifoModal.materialId);
          if (still.length === 0) {
            setMaterialId('');
            setPurchaseId('');
          } else {
            setPurchaseId(still[0]!.purchaseId);
          }
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setFifoBusy(false));
  };

  const confirmZeroMaterial = (materialIdSel: string) => {
    const bal = getMaterialBalance(materialIdSel);
    const available = availableFifoKg(materialIdSel);
    const name = bal?.materialName ?? 'Material';
    if (available <= 0.0005) {
      setError('Material já está zerado no pátio.');
      return;
    }
    if (
      !confirm(
        `Zerar ${name}?\n\nVai baixar ${available.toFixed(3)} kg (FIFO do mais antigo) e ajustar as compras/caixa.\nEsta ação não desfaz de uma vez — dá para desfazer baixas no relatório.`,
      )
    ) {
      return;
    }
    setError(null);
    setInfo(null);
    void zeroMaterialPurchaseLots({
      materialId: materialIdSel,
      reason: 'Zerar material no pátio',
      operator: operatorName || undefined,
    })
      .then((r) => {
        setInfo(
          `Zerado: ${name} −${r.reducedKg.toFixed(3)} kg em ${r.lotsTouched.length} lote(s) (−${money(r.refundValue)}).`,
        );
        refresh();
        if (materialId === materialIdSel) {
          setMaterialId('');
          setPurchaseId('');
          setKg('');
        }
      })
      .catch((e: Error) => setError(e.message));
  };

  const balanceMenu = (materialIdSel: string) => [
    {
      id: 'baixa',
      label: 'Dar baixa (escolher lote)',
      onSelect: () => selectMaterial(materialIdSel),
    },
    {
      id: 'fifo',
      label: 'Baixa por quantidade (FIFO)…',
      onSelect: () => openFifoModal(materialIdSel),
    },
    {
      id: 'zero',
      label: 'Zerar material',
      danger: true,
      onSelect: () => confirmZeroMaterial(materialIdSel),
    },
  ];

  const movementMenu = (m: PatioMovement) => {
    const items = [];
    if (m.sourceType === 'PURCHASE' || m.sourceType === 'ADJUSTMENT') {
      items.push({
        id: 'compra',
        label: 'Ver compra',
        onSelect: () => setPurchaseModalId(m.sourceId),
      });
    }
    if (m.kind === 'IN' && m.sourceType === 'PURCHASE') {
      items.push({
        id: 'baixa',
        label: 'Dar baixa neste lote',
        onSelect: () => {
          selectMaterial(m.materialId);
          setPurchaseId(m.sourceId);
        },
      });
    }
    if (m.kind === 'OUT' && m.sourceType === 'ADJUSTMENT') {
      items.push({
        id: 'del',
        label: 'Desfazer baixa',
        danger: true,
        onSelect: () => {
          if (
            !confirm(
              'Desfazer esta baixa? O peso volta ao pátio e à compra (caixa aberto também é ajustado).',
            )
          ) {
            return;
          }
          void undoPurchaseStockAdjustment(m.id)
            .then(() => {
              setInfo('Baixa desfeita — kg devolvido à compra e ao pátio.');
              refresh();
            })
            .catch((e: Error) => setError(e.message));
        },
      });
    }
    return items;
  };

  const purchaseModal = purchaseModalId
    ? getPurchase(purchaseModalId)
    : undefined;

  return (
    <div>
      <PageHeader
        title="Pátio"
        subtitle="Saldo, baixa por lote ou por quantidade (FIFO), zerar material e relatório."
      />

      {error && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-3 rounded border border-moss-500/40 bg-moss-700/30 px-3 py-2 text-sm text-moss-400">
          {info}
        </div>
      )}

      <PlaceholderCard className="!p-3">
        <h2 className="mb-2 text-sm font-semibold text-ink-50">Saldo atual</h2>
        {balances.length === 0 ? (
          <p className="text-sm text-ink-300">
            Pátio vazio. Compre sucata no Caixa para entrar material.
          </p>
        ) : (
          <ul className="flex max-h-40 flex-wrap gap-2 overflow-auto">
            {balances.map((b) => {
              const mat = getMaterial(b.materialId);
              const selected = materialId === b.materialId;
              return (
                <li key={b.materialId}>
                  <button
                    type="button"
                    onClick={() => selectMaterial(b.materialId)}
                    onContextMenu={(e) => openMenu(e, balanceMenu(b.materialId))}
                    className={`flex cursor-context-menu items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                      selected
                        ? 'border-brand-500 bg-brand-500/20 ring-1 ring-brand-500/40'
                        : 'border-white/10 hover:border-brand-400/40'
                    }`}
                  >
                    <MaterialThumb material={mat} className="!h-7 !w-7" />
                    <span className="font-medium text-ink-50">
                      {b.materialName}
                    </span>
                    <span className="text-ink-300">
                      {b.weight.toFixed(3)} kg
                    </span>
                    <span className="text-ink-400">{money(b.stockValue)}</span>
                    <span
                      role="presentation"
                      className="rounded p-0.5 text-ink-400 hover:bg-white/10 hover:text-ink-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        openAt(r.right, r.bottom, balanceMenu(b.materialId));
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PlaceholderCard>

      <PlaceholderCard className="mt-3 !p-3">
        <h2 className="mb-1 text-sm font-semibold text-ink-50">
          Gerir estoque — dar baixa
        </h2>
        <p className="mb-3 text-xs text-ink-400">
          A baixa tira kg do pátio e da compra de origem (e ajusta o caixa se
          ainda estiver aberto). FIFO: a compra mais antiga vem selecionada.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Material">
            <select
              className={fieldClass}
              value={materialId}
              onChange={(e) => selectMaterial(e.target.value)}
            >
              <option value="">Selecione…</option>
              {balances.map((b) => (
                <option key={b.materialId} value={b.materialId}>
                  {b.materialName} ({b.weight.toFixed(3)} kg)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Compra de origem (FIFO)">
            <select
              className={fieldClass}
              value={selectedLot?.purchaseId ?? ''}
              onChange={(e) => setPurchaseId(e.target.value)}
              disabled={!materialId || lots.length === 0}
            >
              {lots.length === 0 && (
                <option value="">Nenhum lote disponível</option>
              )}
              {lots.map((l) => (
                <option key={l.purchaseId} value={l.purchaseId}>
                  {l.documentNumber} · {l.remainingKg.toFixed(3)} kg ·{' '}
                  {l.supplierName}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Peso (kg)${
              selectedLot
                ? ` — máx. ${selectedLot.remainingKg.toFixed(3)}`
                : ''
            }`}
          >
            <input
              className={fieldClass}
              inputMode="decimal"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              placeholder="0.000"
            />
          </Field>
          <Field label="Motivo">
            <select
              className={fieldClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {reason === 'Outro' && (
          <Field label="Descreva o motivo">
            <input
              className={fieldClass}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
            />
          </Field>
        )}
        {selectedLot && (
          <p className="mt-2 text-xs text-ink-400">
            Lote: {selectedLot.documentNumber} ·{' '}
            {new Date(selectedLot.purchasedAt).toLocaleString('pt-BR')} ·{' '}
            {money(selectedLot.unitCost)}/kg
            <button
              type="button"
              className="ml-2 text-brand-300 hover:underline"
              onClick={() => setPurchaseModalId(selectedLot.purchaseId)}
            >
              Ver compra
            </button>
          </p>
        )}
        <div className="mt-3">
          <PrimaryButton
            type="button"
            onClick={submitBaixa}
            disabled={!selectedLot}
          >
            Dar baixa
          </PrimaryButton>
        </div>
      </PlaceholderCard>

      <div className="mt-4 space-y-3">
        <ReportFilters
          filter={filter}
          onChange={setFilter}
          availableDays={availableDays}
        />

        <PlaceholderCard className="!p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-ink-50">Relatório do pátio</h2>
            <div className="flex gap-1.5">
              <GhostButton
                className="!py-1 text-xs"
                onClick={() => downloadPatioReportPdf(reportPayload())}
              >
                PDF
              </GhostButton>
              <GhostButton
                className="!py-1 text-xs"
                onClick={() =>
                  void sharePatioReportPdfWhatsApp(reportPayload())
                    .then((r) => setInfo(r.hint))
                    .catch((e) =>
                      setInfo(
                        e instanceof Error
                          ? e.message
                          : 'Falha ao abrir WhatsApp',
                      ),
                    )
                }
              >
                WhatsApp
              </GhostButton>
              <GhostButton
                className="!py-1 text-xs"
                onClick={() => exportPatioReportCsv(reportPayload())}
              >
                CSV
              </GhostButton>
            </div>
          </div>
          <p className="mb-2 text-xs text-ink-400">{describeFilter(filter)}</p>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 px-2.5 py-2">
              <div className="text-[10px] uppercase text-ink-400">Movimentos</div>
              <div className="font-semibold">{summary.count}</div>
            </div>
            <div className="rounded-lg border border-white/10 px-2.5 py-2">
              <div className="text-[10px] uppercase text-ink-400">Entradas</div>
              <div className="font-semibold text-moss-400">
                {summary.inKg.toFixed(3)} kg
              </div>
              <div className="text-[10px] text-ink-400">
                {money(summary.inValue)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 px-2.5 py-2">
              <div className="text-[10px] uppercase text-ink-400">Saídas</div>
              <div className="font-semibold text-brand-400">
                {summary.outKg.toFixed(3)} kg
              </div>
              <div className="text-[10px] text-ink-400">
                {money(summary.outValue)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 px-2.5 py-2">
              <div className="text-[10px] uppercase text-ink-400">Saldo kg</div>
              <div className="font-semibold text-ink-50">
                {(summary.inKg - summary.outKg).toFixed(3)} kg
              </div>
            </div>
          </div>

          {summary.byMaterial.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 text-xs font-semibold text-ink-300">
                Por material no período
              </h3>
              <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                {summary.byMaterial.map((m) => (
                  <li
                    key={m.materialId}
                    className="flex justify-between gap-2 border-b border-white/5 py-1"
                  >
                    <span className="text-ink-100">{m.materialName}</span>
                    <span className="shrink-0 text-ink-300">
                      +{m.inKg.toFixed(3)} / −{m.outKg.toFixed(3)} →{' '}
                      <span className="text-ink-50">{m.netKg.toFixed(3)} kg</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="mt-3 max-h-[28rem] space-y-1 overflow-auto text-sm">
            {filtered.map((m) => (
              <li
                key={m.id}
                className="group flex cursor-context-menu flex-wrap items-baseline justify-between gap-2 border-b border-white/10 py-1.5 text-ink-200 hover:bg-white/[0.03]"
                onContextMenu={(e) => openMenu(e, movementMenu(m))}
              >
                <span>
                  <span
                    className={
                      m.kind === 'IN' ? 'text-moss-400' : 'text-brand-400'
                    }
                  >
                    {m.kind === 'IN' ? 'ENTRADA' : 'SAÍDA'}
                  </span>{' '}
                  · {m.materialName} · {m.weight.toFixed(3)} kg ·{' '}
                  {money(m.unitCost)}/kg
                  <span className="text-[10px] text-ink-500">
                    {' '}
                    · {m.sourceType}
                    {m.notes ? ` · ${m.notes}` : ''}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-ink-400">
                  {new Date(m.at).toLocaleString('pt-BR')}
                  <button
                    type="button"
                    className="rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100"
                    onClick={(e) => {
                      const r = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      openAt(r.right, r.bottom, movementMenu(m));
                    }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-6 text-center text-ink-400">
                Nenhum movimento no filtro.
              </li>
            )}
          </ul>
        </PlaceholderCard>
      </div>

      {purchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-white/15 bg-ink-900 p-4 shadow-panel">
            <h3 className="font-display text-xl text-ink-50">
              {purchaseModal.documentNumber}
            </h3>
            <p className="mt-1 text-sm text-ink-300">
              {purchaseModal.supplierName} ·{' '}
              {new Date(purchaseModal.purchasedAt).toLocaleString('pt-BR')}
            </p>
            <p className="mt-1 text-sm text-ink-200">
              Total {money(purchaseModal.netTotal)} · pago{' '}
              {money(purchaseModal.amountPaid)}
              {purchaseModal.createdBy
                ? ` · por ${purchaseModal.createdBy}`
                : ''}
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {purchaseModal.items.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between gap-2 border-b border-white/10 py-1"
                >
                  <span>
                    {i.materialName} · {i.weight.toFixed(3)} kg
                  </span>
                  <span>{money(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {purchaseModal.notes && (
              <p className="mt-2 whitespace-pre-wrap text-xs text-ink-400">
                {purchaseModal.notes}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <GhostButton type="button" onClick={() => setPurchaseModalId(null)}>
                Fechar
              </GhostButton>
            </div>
          </div>
        </div>
      )}

      {fifoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-ink-900 p-4 shadow-panel">
            <h3 className="font-display text-xl text-ink-50">
              Baixa por quantidade
            </h3>
            <p className="mt-1 text-sm text-ink-300">
              {fifoModal.materialName} · disponível{' '}
              <strong className="text-ink-100">
                {fifoModal.availableKg.toFixed(3)} kg
              </strong>
            </p>
            <p className="mt-2 text-xs text-ink-400">
              Subtrai do lote mais antigo até o valor que você colocar (ou o
              máximo disponível). Ex.: 400 kg de latinhas.
            </p>
            <Field
              label={`Peso a baixar (kg) — máx. ${fifoModal.availableKg.toFixed(3)}`}
            >
              <input
                className={fieldClass}
                inputMode="decimal"
                autoFocus
                value={fifoKg}
                onChange={(e) => setFifoKg(e.target.value)}
                placeholder="Ex.: 400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitFifoBaixa();
                  }
                }}
              />
            </Field>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <GhostButton
                type="button"
                disabled={fifoBusy}
                onClick={() => {
                  setFifoModal(null);
                  setFifoKg('');
                }}
              >
                Cancelar
              </GhostButton>
              <GhostButton
                type="button"
                disabled={fifoBusy}
                onClick={() =>
                  setFifoKg(String(fifoModal.availableKg).replace('.', ','))
                }
              >
                Usar tudo
              </GhostButton>
              <PrimaryButton
                type="button"
                disabled={fifoBusy}
                onClick={submitFifoBaixa}
              >
                {fifoBusy ? 'Baixando…' : 'Confirmar baixa'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}
