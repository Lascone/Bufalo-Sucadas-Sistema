import { useRef, useState } from 'react';
import {
  Field,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  GhostButton,
  fieldClass,
} from '../components/Page';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { MaterialThumb } from '../components/MaterialThumb';
import {
  listMaterials,
  MATERIAL_ICON_OPTIONS,
  clearMaterialPhoto,
  deleteMaterial,
  saveMaterialPhoto,
  upsertMaterial,
  type MaterialIconSlug,
  type MaterialRecord,
} from '../lib/materials';

const emptyForm = {
  name: '',
  unit: 'KG' as MaterialRecord['unit'],
  buyPrice: '',
  sellPrice: '',
  active: true,
  icon: 'default' as MaterialIconSlug,
};

export function MaterialsPage() {
  const [materials, setMaterials] = useState(() => listMaterials());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { menu, open, close } = useContextMenu();

  const refresh = () => setMaterials(listMaterials());
  const editing = editingId ? materials.find((m) => m.id === editingId) : null;

  const startEdit = (m: MaterialRecord) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      unit: m.unit,
      buyPrice: String(m.buyPrice),
      sellPrice: String(m.sellPrice),
      active: m.active,
      icon: m.icon ?? 'default',
    });
    setPendingPhoto(null);
    setError(null);
    setOk(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPendingPhoto(null);
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
      setError('Preço de recebimento inválido.');
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
      icon: form.icon,
      photoPath: editing?.photoPath,
    })
      .then(async (saved) => {
        if (pendingPhoto) {
          await saveMaterialPhoto(saved.id, pendingPhoto);
        }
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
        subtitle="Preço ao receber / vender, ícone Lucide e foto opcional."
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

            <Field label="Foto / ícone">
              <div className="flex flex-wrap items-center gap-3">
                {pendingPhoto ? (
                  <img
                    src={URL.createObjectURL(pendingPhoto)}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <MaterialThumb
                    material={
                      editing
                        ? editing
                        : { id: 'new', icon: form.icon, photoPath: undefined }
                    }
                    className="!h-14 !w-14"
                    iconClassName="!h-6 !w-6"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <GhostButton
                    type="button"
                    className="!py-1.5 text-xs"
                    onClick={() => fileRef.current?.click()}
                  >
                    Enviar imagem
                  </GhostButton>
                  {(editing?.photoPath || pendingPhoto) && (
                    <GhostButton
                      type="button"
                      className="!py-1.5 text-xs"
                      onClick={() => {
                        setPendingPhoto(null);
                        if (editingId) {
                          void clearMaterialPhoto(editingId).then(() => {
                            refresh();
                            setOk('Foto removida.');
                          });
                        }
                      }}
                    >
                      Remover foto
                    </GhostButton>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPendingPhoto(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {MATERIAL_ICON_OPTIONS.map((opt) => {
                  const Icon = opt.Icon;
                  const on = form.icon === opt.slug;
                  return (
                    <button
                      key={opt.slug}
                      type="button"
                      title={opt.label}
                      onClick={() => setForm((f) => ({ ...f, icon: opt.slug }))}
                      className={`rounded-lg border p-2 ${
                        on
                          ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                          : 'border-white/15 text-ink-300'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-ink-400">
                A foto tem prioridade sobre o ícone na listagem.
              </p>
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
              <Field label="Preço receber (R$/kg)">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={form.buyPrice}
                  onChange={(e) => setForm((f) => ({ ...f, buyPrice: e.target.value }))}
                />
              </Field>
              <Field label="Preço vender (R$/kg)">
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={form.sellPrice}
                  onChange={(e) => setForm((f) => ({ ...f, sellPrice: e.target.value }))}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-100">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Ativo
            </label>
            <div className="flex gap-2">
              <PrimaryButton onClick={save}>
                {editingId ? 'Salvar' : 'Cadastrar'}
              </PrimaryButton>
              {editingId && <GhostButton onClick={resetForm}>Cancelar</GhostButton>}
            </div>
          </div>
        </PlaceholderCard>

        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">Lista</h2>
          <p className="text-xs text-ink-400">Clique direito para gerenciar</p>
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-auto text-sm">
            {materials.map((m) => (
              <li
                key={m.id}
                className="cursor-context-menu rounded-lg border border-white/10 px-3 py-2.5 transition hover:border-brand-400/40"
                onClick={() => startEdit(m)}
                onContextMenu={(e) =>
                  open(e, [
                    {
                      id: 'edit',
                      label: 'Editar',
                      onSelect: () => startEdit(m),
                    },
                    {
                      id: 'toggle',
                      label: m.active ? 'Desativar' : 'Ativar',
                      onSelect: () => {
                        void upsertMaterial({ ...m, active: !m.active }).then(() => {
                          refresh();
                          setOk(m.active ? 'Desativado.' : 'Ativado.');
                        });
                      },
                    },
                    {
                      id: 'del',
                      label: 'Excluir',
                      danger: true,
                      onSelect: () => {
                        if (!confirm(`Excluir material "${m.name}"?`)) return;
                        void deleteMaterial(m.id)
                          .then(() => {
                            if (editingId === m.id) resetForm();
                            refresh();
                            setOk('Material excluído.');
                          })
                          .catch((err: Error) => setError(err.message));
                      },
                    },
                  ])
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-ink-50">
                    <MaterialThumb material={m} className="!h-7 !w-7" />
                    {m.name}
                  </span>
                  {!m.active && (
                    <span className="text-xs text-ink-300">inativo</span>
                  )}
                </div>
                <div className="mt-1 text-ink-300">
                  Receber R$ {m.buyPrice.toFixed(2)} · Vender R${' '}
                  {m.sellPrice.toFixed(2)} / {m.unit.toLowerCase()}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <GhostButton
                    className="!px-2 !py-1 text-xs"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      startEdit(m);
                    }}
                  >
                    Editar
                  </GhostButton>
                  <GhostButton
                    className="!px-2 !py-1 text-xs"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void upsertMaterial({ ...m, active: !m.active }).then(refresh);
                    }}
                  >
                    {m.active ? 'Desativar' : 'Ativar'}
                  </GhostButton>
                  <GhostButton
                    className="!px-2 !py-1 text-xs"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (!confirm(`Excluir "${m.name}"?`)) return;
                      void deleteMaterial(m.id).then(() => {
                        if (editingId === m.id) resetForm();
                        refresh();
                      });
                    }}
                  >
                    Excluir
                  </GhostButton>
                </div>
              </li>
            ))}
          </ul>
        </PlaceholderCard>
      </div>

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
