import { useMemo, useState } from 'react';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { getMaterial, lineTotal, listMaterials } from '../lib/materials';
import {
  createPurchase,
  listPurchases,
  type PurchaseRecord,
} from '../lib/purchases';
import { useAppStore } from '../stores/app-store';

type DraftItem = {
  key: string;
  materialId: string;
  weight: string;
  unitPrice: string;
};

function newDraftItem(): DraftItem {
  const first = listMaterials(true)[0];
  return {
    key: `${Date.now()}-${Math.random()}`,
    materialId: first?.id ?? '',
    weight: '',
    unitPrice: first ? String(first.buyPrice) : '',
  };
}

export function PurchasesPage() {
  const username = useAppStore((s) => s.session.username);
  const materials = listMaterials(true);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => listPurchases());
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [items, setItems] = useState<DraftItem[]>(() => [newDraftItem()]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selected = purchases.find((p) => p.id === selectedId) ?? null;

  const previewTotal = useMemo(
    () =>
      items.reduce(
        (acc, i) => acc + lineTotal(Number(i.weight) || 0, Number(i.unitPrice) || 0),
        0,
      ),
    [items],
  );

  const refresh = () => setPurchases(listPurchases());

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.materialId) {
          const mat = getMaterial(patch.materialId);
          if (mat) next.unitPrice = String(mat.buyPrice);
        }
        return next;
      }),
    );
  };

  const submit = () => {
    setError(null);
    setInfo(null);
    const mapped = items
      .map((i) => {
        const mat = getMaterial(i.materialId);
        if (!mat) return null;
        const weight = Number(i.weight);
        const unitPrice = Number(i.unitPrice);
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
      setError('Informe peso e preço válidos em pelo menos um material.');
      return;
    }

    const paidRaw = amountPaid.trim();
    const paid = paidRaw === '' ? undefined : Number(paidRaw.replace(',', '.'));

    void createPurchase({
      supplierName: supplierName.trim() || 'Pessoa',
      notes,
      items: mapped,
      amountPaid: paid,
      openedBy: username,
    })
      .then(({ purchase, cashInfo }) => {
        setSupplierName('');
        setNotes('');
        setAmountPaid('');
        setItems([newDraftItem()]);
        setSelectedId(purchase.id);
        refresh();
        setInfo(
          cashInfo ??
            `Compra ${purchase.documentNumber} baixou o caixa (COMPRA_PAGA).`,
        );
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div>
      <PageHeader
        title="Receber sucata"
        subtitle="Pessoa traz material — você paga. Dinheiro sai do caixa (entrada no pátio)."
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

      <div className="grid gap-4 xl:grid-cols-2">
        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">Receber agora</h2>
          <div className="mt-3 grid gap-3">
            <Field label="Pessoa / placa (opcional)">
              <input
                className={fieldClass}
                placeholder="Nome (opcional) — pessoa / placa"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
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
                  Cadastre materiais ativos em Materiais antes de comprar.
                </p>
              )}

              {items.map((row) => {
                const line = lineTotal(Number(row.weight) || 0, Number(row.unitPrice) || 0);
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
                          onChange={(e) => updateItem(row.key, { materialId: e.target.value })}
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
                          onChange={(e) => updateItem(row.key, { weight: e.target.value })}
                        />
                      </Field>
                      <Field label="Preço compra (R$/kg)">
                        <input
                          className={fieldClass}
                          inputMode="decimal"
                          value={row.unitPrice}
                          onChange={(e) => updateItem(row.key, { unitPrice: e.target.value })}
                        />
                      </Field>
                      <div className="flex flex-col justify-end">
                        <span className="text-xs text-ink-300">Total da linha</span>
                        <span className="text-lg font-semibold text-brand-400">
                          R$ {line.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-ink-300 underline hover:text-ink-100"
                        onClick={() => setItems((prev) => prev.filter((i) => i.key !== row.key))}
                      >
                        Remover linha
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2">
              <div className="text-sm text-ink-200">Total da compra</div>
              <div className="text-2xl font-semibold text-brand-400">
                R$ {previewTotal.toFixed(2)}
              </div>
            </div>

            <Field label="Valor pago (R$) — default = total">
              <input
                className={fieldClass}
                value={amountPaid}
                placeholder={previewTotal.toFixed(2)}
                onChange={(e) => setAmountPaid(e.target.value)}
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

            <PrimaryButton onClick={submit} disabled={!materials.length}>
              Finalizar recebimento
            </PrimaryButton>
          </div>
        </PlaceholderCard>

        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">Histórico de recebimentos</h2>
          <ul className="mt-3 max-h-[32rem] space-y-2 overflow-auto text-sm">
            {purchases.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    selectedId === p.id
                      ? 'border-brand-500 bg-brand-500/15'
                      : 'border-white/10 hover:border-brand-400/40'
                  }`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div className="font-medium text-ink-50">
                    {p.documentNumber} — {p.supplierName}
                  </div>
                  <div className="text-ink-300">
                    R$ {p.netTotal.toFixed(2)} · pago R${' '}
                    {(p.amountPaid ?? p.netTotal).toFixed(2)} ·{' '}
                    {new Date(p.purchasedAt).toLocaleString('pt-BR')}
                    {p.cashPosted ? ' · no caixa' : ''}
                  </div>
                </button>
              </li>
            ))}
            {purchases.length === 0 && (
              <li className="text-ink-300">Nenhuma compra registrada.</li>
            )}
          </ul>
        </PlaceholderCard>
      </div>

      {selected && (
        <div className="mt-4">
          <PlaceholderCard>
            <h2 className="font-semibold text-ink-50">
              {selected.documentNumber} — {selected.supplierName}
            </h2>
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
                  {selected.items.map((i) => (
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
              Total R$ {selected.netTotal.toFixed(2)} · Pago R${' '}
              {(selected.amountPaid ?? selected.netTotal).toFixed(2)}
            </p>
            {selected.notes && (
              <p className="mt-1 text-sm text-ink-300">Obs.: {selected.notes}</p>
            )}
          </PlaceholderCard>
        </div>
      )}
    </div>
  );
}
