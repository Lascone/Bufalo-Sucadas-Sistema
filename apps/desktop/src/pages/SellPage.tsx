import { useMemo, useState } from 'react';
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
import {
  addSaleComment,
  createSale,
  listSales,
  type SalePaymentMethod,
  type SaleRecord,
} from '../lib/sales';
import { downloadSalePdf } from '../lib/pdf';
import { getSettings, listActivePartners } from '../lib/settings';
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

export function SellPage() {
  const username = useAppStore((s) => s.session.username);
  const commentsEnabled = getSettings()['sales.commentsEnabled'];
  const partners = listActivePartners();
  const materials = listMaterials(true);
  const { menu, open, close } = useContextMenu();

  const [sales, setSales] = useState<SaleRecord[]>(() => listSales());
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>(() => [newDraftItem()]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('DINHEIRO');
  const [receiverPick, setReceiverPick] = useState(() =>
    partners[0] ? partners[0] : '__other__',
  );
  const [receiverOther, setReceiverOther] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selected = sales.find((s) => s.id === selectedId) ?? null;
  const previewTotal = useMemo(
    () =>
      items.reduce((acc, i) => {
        const explicit = Number(i.lineTotal);
        if (i.lineTotal !== '' && Number.isFinite(explicit)) return acc + explicit;
        return acc + lineTotal(Number(i.weight) || 0, Number(i.unitPrice) || 0);
      }, 0),
    [items],
  );
  const discountNum = Number(discountAmount.replace(',', '.')) || 0;
  const previewNet = Math.max(0, previewTotal - Math.min(discountNum, previewTotal));

  const updateItem = (
    key: string,
    patch: Partial<DraftItem> & { editSource?: string },
  ) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.editSource === 'material' && patch.materialId) {
          const mat = getMaterial(patch.materialId);
          if (mat) {
            next.unitPrice = String(mat.sellPrice);
            const w = Number(next.weight) || 0;
            next.lineTotal = w > 0 ? String(lineTotal(w, mat.sellPrice)) : '';
          }
          return next;
        }
        const w = Number(next.weight);
        const p = Number(next.unitPrice);
        const t = Number(next.lineTotal);
        if (patch.editSource === 'weight' || patch.editSource === 'unitPrice') {
          next.lineTotal =
            next.weight === '' ? '' : String(lineTotal(w || 0, p || 0));
        } else if (patch.editSource === 'total' && p > 0 && next.lineTotal !== '') {
          next.weight = String(weightFromTotal(t, p));
        }
        return next;
      }),
    );
  };

  const resolveReceiver = () => {
    if (receiverPick === '__other__') return receiverOther.trim();
    return receiverPick.trim();
  };

  const submit = () => {
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
      setError('Informe peso ou total válido.');
      return;
    }

    const received =
      amountReceived.trim() === ''
        ? undefined
        : Number(amountReceived.replace(',', '.'));

    void createSale({
      customerName: customerName.trim() || 'Empresa',
      notes,
      items: mapped,
      paymentMethod,
      receivedBy: resolveReceiver(),
      discountAmount: discountNum,
      discountReason,
      amountReceived: received,
      openedBy: username,
    })
      .then(({ sale, cashInfo, stockWarnings }) => {
        setCustomerName('');
        setNotes('');
        setAmountReceived('');
        setDiscountAmount('');
        setDiscountReason('');
        setItems([newDraftItem()]);
        setSelectedId(sale.id);
        setSales(listSales());
        const warn =
          stockWarnings.length > 0 ? ` Aviso: ${stockWarnings.join(' ')}` : '';
        setInfo(
          (cashInfo ??
            `Venda ${sale.documentNumber} · ${sale.paymentMethod} · ${sale.receivedBy} · lucro R$ ${sale.grossProfit.toFixed(2)}.`) +
            warn,
        );
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div>
      <PageHeader
        title="Vendas"
        subtitle="Venda de estoque do pátio para empresas. Registre PIX/dinheiro, quem recebeu e descontos."
      />

      {error && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-3 rounded border border-moss-500/40 bg-moss-700/30 p-3 text-sm text-moss-400">
          {info}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <PlaceholderCard>
          <h2 className="font-semibold">Nova venda</h2>
          <div className="mt-3 grid gap-2">
            <Field label="Empresa compradora">
              <input
                className={fieldClass}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome da empresa"
              />
            </Field>
            {items.map((row) => {
              const mat = getMaterial(row.materialId);
              return (
                <div
                  key={row.key}
                  className="rounded-lg border border-white/10 p-2"
                >
                  <div className="mb-1 flex items-center gap-2 text-brand-400">
                    <MaterialThumb material={mat} className="!h-5 !w-5" />
                    <span className="text-xs text-ink-300">{mat?.name}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
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
                    <input
                      className={fieldClass}
                      placeholder="Peso kg"
                      value={row.weight}
                      onChange={(e) =>
                        updateItem(row.key, {
                          weight: e.target.value,
                          editSource: 'weight',
                        })
                      }
                    />
                    <input
                      className={fieldClass}
                      placeholder="R$/kg venda"
                      value={row.unitPrice}
                      onChange={(e) =>
                        updateItem(row.key, {
                          unitPrice: e.target.value,
                          editSource: 'unitPrice',
                        })
                      }
                    />
                    <input
                      className={fieldClass}
                      placeholder="Total R$"
                      value={row.lineTotal}
                      onChange={(e) =>
                        updateItem(row.key, {
                          lineTotal: e.target.value,
                          editSource: 'total',
                        })
                      }
                    />
                  </div>
                </div>
              );
            })}
            <GhostButton onClick={() => setItems((p) => [...p, newDraftItem()])}>
              + Material
            </GhostButton>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Forma de recebimento">
                <div className="flex gap-2">
                  {(['DINHEIRO', 'PIX'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                        paymentMethod === m
                          ? 'border-brand-500 bg-brand-500/20 text-brand-300'
                          : 'border-white/15 text-ink-300'
                      }`}
                    >
                      {m === 'PIX' ? 'PIX' : 'Dinheiro'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Quem recebeu">
                <select
                  className={fieldClass}
                  value={receiverPick}
                  onChange={(e) => setReceiverPick(e.target.value)}
                >
                  {partners.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="__other__">Outro…</option>
                </select>
                {receiverPick === '__other__' && (
                  <input
                    className={`${fieldClass} mt-2`}
                    value={receiverOther}
                    onChange={(e) => setReceiverOther(e.target.value)}
                    placeholder="Nome de quem recebeu"
                  />
                )}
                {partners.length === 0 && receiverPick !== '__other__' && (
                  <p className="mt-1 text-xs text-amber-300">
                    Cadastre os sócios em Configurações → Vendas.
                  </p>
                )}
              </Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Desconto (R$)">
                <input
                  className={fieldClass}
                  value={discountAmount}
                  placeholder="0"
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
              </Field>
              <Field label="Motivo do desconto">
                <input
                  className={fieldClass}
                  value={discountReason}
                  placeholder="Ex.: umidade, qualidade, frete"
                  onChange={(e) => setDiscountReason(e.target.value)}
                  disabled={!discountAmount || Number(discountAmount) <= 0}
                />
              </Field>
            </div>

            <div className="rounded-lg border border-white/10 px-3 py-2 text-sm">
              <div className="flex justify-between text-ink-300">
                <span>Subtotal</span>
                <span>R$ {previewTotal.toFixed(2)}</span>
              </div>
              {discountNum > 0 && (
                <div className="flex justify-between text-brand-400">
                  <span>Desconto</span>
                  <span>− R$ {Math.min(discountNum, previewTotal).toFixed(2)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between text-lg font-semibold text-moss-400">
                <span>Total</span>
                <span>R$ {previewNet.toFixed(2)}</span>
              </div>
            </div>

            <Field label="Valor recebido">
              <input
                className={fieldClass}
                value={amountReceived}
                placeholder={previewNet.toFixed(2)}
                onChange={(e) => setAmountReceived(e.target.value)}
              />
            </Field>
            <Field label="Obs.">
              <textarea
                className={fieldClass}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <PrimaryButton onClick={submit}>Finalizar venda</PrimaryButton>
          </div>
        </PlaceholderCard>

        <PlaceholderCard>
          <h2 className="font-semibold">Vendas recentes</h2>
          <ul className="mt-2 max-h-[32rem] space-y-1 overflow-auto text-sm">
            {sales.map((s) => (
              <li
                key={s.id}
                className={`cursor-context-menu rounded border px-3 py-2 ${
                  selectedId === s.id
                    ? 'border-brand-500 bg-brand-500/15'
                    : 'border-white/10'
                }`}
                onClick={() => setSelectedId(s.id)}
                onContextMenu={(e) =>
                  open(e, [
                    {
                      id: 'view',
                      label: 'Ver',
                      onSelect: () => setSelectedId(s.id),
                    },
                    {
                      id: 'pdf',
                      label: 'PDF',
                      onSelect: () => downloadSalePdf(s),
                    },
                  ])
                }
              >
                <div>
                  {s.documentNumber} — {s.customerName} — R$ {s.netTotal.toFixed(2)}
                </div>
                <div className="text-xs text-ink-300">
                  {s.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'}
                  {s.receivedBy ? ` · ${s.receivedBy}` : ''}
                  {typeof s.grossProfit === 'number' ? (
                    <span className="text-moss-400">
                      {' '}
                      · lucro R$ {s.grossProfit.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
            {sales.length === 0 && (
              <li className="text-ink-300">Nenhuma venda ainda.</li>
            )}
          </ul>
        </PlaceholderCard>
      </div>

      {selected && (
        <div className="mt-4">
          <PlaceholderCard>
            <div className="flex justify-between gap-2">
              <h2 className="font-semibold">
                {selected.documentNumber} — {selected.customerName}
              </h2>
              <GhostButton onClick={() => downloadSalePdf(selected)}>PDF</GhostButton>
            </div>
            <p className="mt-1 text-sm text-ink-300">
              {selected.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'} · recebeu:{' '}
              {selected.receivedBy || '—'}
              {selected.discountAmount > 0
                ? ` · desconto R$ ${selected.discountAmount.toFixed(2)}${
                    selected.discountReason ? ` (${selected.discountReason})` : ''
                  }`
                : ''}
            </p>
            <ul className="mt-2 text-sm">
              {(selected.items ?? []).map((i) => (
                <li key={i.id}>
                  {i.materialName} · {i.weight} kg · R$ {i.lineTotal.toFixed(2)}
                  {typeof i.avgCostAtSale === 'number' ? (
                    <span className="text-ink-300">
                      {' '}
                      · custo méd. R$ {i.avgCostAtSale.toFixed(2)}/kg
                      {typeof i.grossProfit === 'number'
                        ? ` · lucro R$ ${i.grossProfit.toFixed(2)}`
                        : ''}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-moss-400">
              Lucro bruto: R$ {(selected.grossProfit ?? 0).toFixed(2)}
            </p>
            {(selected.stockWarnings?.length ?? 0) > 0 && (
              <p className="mt-1 text-sm text-amber-300">
                {selected.stockWarnings.join(' ')}
              </p>
            )}

            <div className="mt-4 border-t border-white/10 pt-3">
              <h3 className="text-sm font-semibold text-ink-50">Comentários</h3>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                {(selected.comments ?? []).map((c) => (
                  <li key={c.id} className="rounded border border-white/10 px-2 py-1.5">
                    <div className="text-xs text-ink-300">
                      {new Date(c.createdAt).toLocaleString('pt-BR')} · {c.authorName}
                    </div>
                    <div className="text-ink-100">{c.body}</div>
                  </li>
                ))}
                {(selected.comments ?? []).length === 0 && (
                  <li className="text-ink-300">Nenhum comentário.</li>
                )}
              </ul>
              {commentsEnabled && (
                <div className="mt-3 flex gap-2">
                  <input
                    className={`flex-1 ${fieldClass}`}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Novo comentário"
                  />
                  <PrimaryButton
                    onClick={() => {
                      if (!comment.trim()) return;
                      void addSaleComment(selected.id, comment.trim(), username).then(
                        () => {
                          setComment('');
                          setSales(listSales());
                        },
                      );
                    }}
                  >
                    Comentar
                  </PrimaryButton>
                </div>
              )}
            </div>
          </PlaceholderCard>
        </div>
      )}

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
