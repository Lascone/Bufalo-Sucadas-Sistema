import { useState } from 'react';
import {
  Field,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  GhostButton,
  fieldClass,
} from '../components/Page';
import {
  listMaterials,
  upsertMaterial,
  type MaterialRecord,
} from '../lib/materials';

const emptyForm = {
  name: '',
  unit: 'KG' as MaterialRecord['unit'],
  buyPrice: '',
  sellPrice: '',
  active: true,
};

export function MaterialsPage() {
  const [materials, setMaterials] = useState(() => listMaterials());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const refresh = () => setMaterials(listMaterials());

  const startEdit = (m: MaterialRecord) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      unit: m.unit,
      buyPrice: String(m.buyPrice),
      sellPrice: String(m.sellPrice),
      active: m.active,
    });
    setError(null);
    setOk(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const save = () => {
    setError(null);
    setOk(null);
    const name = form.name.trim();
    if (!name) {
      setError('Informe o nome do material.');
      return;
    }
    const buyPrice = Number(form.buyPrice);
    const sellPrice = Number(form.sellPrice);
    if (!Number.isFinite(buyPrice) || buyPrice < 0) {
      setError('Preço de compra inválido.');
      return;
    }
    if (!Number.isFinite(sellPrice) || sellPrice < 0) {
      setError('Preço de venda inválido.');
      return;
    }
    void upsertMaterial({
      id: editingId ?? undefined,
      name,
      unit: form.unit,
      buyPrice,
      sellPrice,
      active: form.active,
    })
      .then(() => {
        resetForm();
        refresh();
        setOk(editingId ? 'Material atualizado.' : 'Material cadastrado.');
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div>
      <PageHeader
        title="Materiais"
        subtitle="Cadastro com preço de compra e venda por kg — usados no cálculo automático das compras e vendas."
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-md border border-moss-500/40 bg-moss-950/40 p-3 text-sm text-moss-100">
          {ok}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">
            {editingId ? 'Editar material' : 'Novo material'}
          </h2>
          <div className="mt-3 grid gap-3">
            <Field label="Nome">
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Ferro pesado"
              />
            </Field>
            <Field label="Unidade">
              <select
                className={fieldClass}
                value={form.unit}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    unit: e.target.value as MaterialRecord['unit'],
                  }))
                }
              >
                <option value="KG">kg</option>
                <option value="TON">ton</option>
                <option value="UNIT">un</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preço compra (R$/kg)">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={form.buyPrice}
                  onChange={(e) => setForm((f) => ({ ...f, buyPrice: e.target.value }))}
                  placeholder="0,50"
                />
              </Field>
              <Field label="Preço venda (R$/kg)">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={form.sellPrice}
                  onChange={(e) => setForm((f) => ({ ...f, sellPrice: e.target.value }))}
                  placeholder="0,65"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-100">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Ativo (aparece nas compras e vendas)
            </label>
            <div className="flex gap-2">
              <PrimaryButton onClick={save}>
                {editingId ? 'Salvar alterações' : 'Cadastrar'}
              </PrimaryButton>
              {editingId && (
                <GhostButton onClick={resetForm}>Cancelar</GhostButton>
              )}
            </div>
          </div>
        </PlaceholderCard>

        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">Lista</h2>
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-auto text-sm">
            {materials.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-white/10 px-3 py-2.5 text-left transition hover:border-brand-400/40"
                  onClick={() => startEdit(m)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-50">{m.name}</span>
                    {!m.active && (
                      <span className="text-xs text-ink-300">inativo</span>
                    )}
                  </div>
                  <div className="mt-1 text-ink-300">
                    Compra R$ {m.buyPrice.toFixed(2)} · Venda R$ {m.sellPrice.toFixed(2)} /{' '}
                    {m.unit.toLowerCase()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </PlaceholderCard>
      </div>
    </div>
  );
}
