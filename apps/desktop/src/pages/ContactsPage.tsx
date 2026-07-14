import { useMemo, useState } from 'react';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import {
  CONTACT_TYPE_OPTIONS,
  deleteContact,
  emptyContactForm,
  searchContacts,
  setContactActive,
  upsertContact,
  type ContactRecord,
  type ContactTypeCode,
} from '../lib/contacts';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';

export function ContactsPage() {
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyContactForm);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  void tick;
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();

  const contacts = useMemo(
    () => searchContacts(query, !showInactive),
    [query, showInactive, tick],
  );

  const refresh = () => setTick((t) => t + 1);

  const startNew = () => {
    setEditingId(null);
    setForm(emptyContactForm());
    setMode('form');
    setError(null);
    setOk(null);
  };

  const startEdit = (c: ContactRecord) => {
    setEditingId(c.id);
    setForm({
      personType: c.personType,
      legalName: c.legalName,
      tradeName: c.tradeName,
      types: [...c.types],
      cpf: c.cpf,
      cnpj: c.cnpj,
      rg: c.rg,
      phonePrimary: c.phonePrimary,
      phoneSecondary: c.phoneSecondary,
      whatsapp: c.whatsapp,
      email: c.email,
      zipCode: c.zipCode,
      street: c.street,
      number: c.number,
      complement: c.complement,
      district: c.district,
      city: c.city,
      state: c.state,
      notes: c.notes,
      pixKey: c.pixKey,
      contactPersonName: c.contactPersonName,
      active: c.active,
    });
    setMode('form');
    setError(null);
    setOk(null);
  };

  const backToList = () => {
    setMode('list');
    setEditingId(null);
    setForm(emptyContactForm());
  };

  const toggleType = (code: ContactTypeCode) => {
    setForm((f) => ({
      ...f,
      types: f.types.includes(code)
        ? f.types.filter((t) => t !== code)
        : [...f.types, code],
    }));
  };

  const save = () => {
    setError(null);
    setOk(null);
    void upsertContact({ ...form, id: editingId ?? undefined })
      .then(() => {
        refresh();
        setOk(editingId ? 'Contato atualizado.' : 'Contato cadastrado.');
        backToList();
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div>
      <PageHeader
        title="Contatos"
        subtitle="Gerencie clientes, fornecedores e parceiros — busca por nome, documento, telefone ou cidade."
        actions={
          <div className="flex flex-wrap gap-2">
            {mode === 'form' ? (
              <GhostButton onClick={backToList}>Voltar à lista</GhostButton>
            ) : null}
            <PrimaryButton onClick={startNew}>Novo contato</PrimaryButton>
          </div>
        }
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

      {mode === 'form' ? (
        <PlaceholderCard>
          <h2 className="font-semibold text-ink-50">
            {editingId ? 'Editar / gerenciar contato' : 'Novo contato'}
          </h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Tipo de pessoa">
              <select
                className={fieldClass}
                value={form.personType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    personType: e.target.value as ContactRecord['personType'],
                  }))
                }
              >
                <option value="INDIVIDUAL">Pessoa física</option>
                <option value="COMPANY">Pessoa jurídica</option>
              </select>
            </Field>
            <Field label="Nome / razão social *">
              <input
                className={fieldClass}
                value={form.legalName}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
              />
            </Field>
            <Field label="Nome fantasia">
              <input
                className={fieldClass}
                value={form.tradeName}
                onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))}
              />
            </Field>
            <Field label="Pessoa de contato">
              <input
                className={fieldClass}
                value={form.contactPersonName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contactPersonName: e.target.value }))
                }
              />
            </Field>
          </div>

          <div className="mt-3">
            <p className="mb-2 text-sm font-medium text-ink-100">Tipos *</p>
            <div className="flex flex-wrap gap-2">
              {CONTACT_TYPE_OPTIONS.map((t) => {
                const on = form.types.includes(t.code);
                return (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => toggleType(t.code)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? 'border-brand-500 bg-brand-500/20 text-brand-400'
                        : 'border-white/15 text-ink-200 hover:border-brand-400/40'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="CPF">
              <input
                className={fieldClass}
                value={form.cpf}
                onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))}
              />
            </Field>
            <Field label="CNPJ">
              <input
                className={fieldClass}
                value={form.cnpj}
                onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
              />
            </Field>
            <Field label="RG">
              <input
                className={fieldClass}
                value={form.rg}
                onChange={(e) => setForm((f) => ({ ...f, rg: e.target.value }))}
              />
            </Field>
            <Field label="E-mail">
              <input
                className={fieldClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Telefone">
              <input
                className={fieldClass}
                value={form.phonePrimary}
                onChange={(e) => setForm((f) => ({ ...f, phonePrimary: e.target.value }))}
              />
            </Field>
            <Field label="Telefone 2">
              <input
                className={fieldClass}
                value={form.phoneSecondary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phoneSecondary: e.target.value }))
                }
              />
            </Field>
            <Field label="WhatsApp">
              <input
                className={fieldClass}
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
              />
            </Field>
            <Field label="Chave PIX">
              <input
                className={fieldClass}
                value={form.pixKey}
                onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))}
              />
            </Field>
            <Field label="CEP">
              <input
                className={fieldClass}
                value={form.zipCode}
                onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
              />
            </Field>
            <Field label="Cidade">
              <input
                className={fieldClass}
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </Field>
            <Field label="UF">
              <input
                className={fieldClass}
                value={form.state}
                maxLength={2}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              />
            </Field>
            <Field label="Bairro">
              <input
                className={fieldClass}
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
              />
            </Field>
            <Field label="Rua">
              <input
                className={fieldClass}
                value={form.street}
                onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
              />
            </Field>
            <Field label="Número">
              <input
                className={fieldClass}
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              />
            </Field>
            <Field label="Complemento">
              <input
                className={fieldClass}
                value={form.complement}
                onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Observações">
            <textarea
              className={fieldClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>

          <label className="mt-2 flex items-center gap-2 text-sm text-ink-100">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Contato ativo
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <PrimaryButton onClick={save}>
              {editingId ? 'Salvar alterações' : 'Cadastrar contato'}
            </PrimaryButton>
            <GhostButton onClick={backToList}>Cancelar</GhostButton>
          </div>
        </PlaceholderCard>
      ) : (
        <PlaceholderCard>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <Field label="Buscar contatos">
                <input
                  className={fieldClass}
                  placeholder="Nome, CPF, CNPJ, telefone, cidade…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field>
            </div>
            <label className="mb-1 flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Mostrar inativos
            </label>
            <PrimaryButton className="mb-0.5" onClick={startNew}>
              Novo contato
            </PrimaryButton>
          </div>

          <ul className="mt-4 max-h-[40rem] space-y-3 overflow-auto">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="cursor-context-menu rounded-lg border border-white/10 bg-ink-900/40 p-4"
                onContextMenu={(e) =>
                  openCtx(e, [
                    {
                      id: 'edit',
                      label: 'Gerenciar / Editar',
                      onSelect: () => startEdit(c),
                    },
                    {
                      id: 'toggle',
                      label: c.active ? 'Desativar' : 'Reativar',
                      onSelect: () => {
                        void setContactActive(c.id, !c.active)
                          .then(() => {
                            refresh();
                            setOk(c.active ? 'Contato desativado.' : 'Contato reativado.');
                          })
                          .catch((err: Error) => setError(err.message));
                      },
                    },
                    {
                      id: 'del',
                      label: 'Excluir',
                      danger: true,
                      onSelect: () => {
                        if (!confirm(`Excluir contato "${c.legalName}"?`)) return;
                        void deleteContact(c.id)
                          .then(() => {
                            refresh();
                            setOk('Contato excluído.');
                          })
                          .catch((err: Error) => setError(err.message));
                      },
                    },
                  ])
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-medium text-ink-50">
                        {c.legalName}
                      </span>
                      {!c.active && (
                        <span className="text-xs text-ink-300">inativo</span>
                      )}
                    </div>
                    {c.tradeName && (
                      <div className="text-sm text-ink-300">{c.tradeName}</div>
                    )}
                    <div className="mt-1 text-xs text-ink-300">
                      {c.types
                        .map(
                          (t) =>
                            CONTACT_TYPE_OPTIONS.find((o) => o.code === t)?.label ?? t,
                        )
                        .join(' · ')}
                    </div>
                    <div className="mt-1 text-sm text-ink-200">
                      {[c.phonePrimary || c.whatsapp, c.city, c.cpf || c.cnpj]
                        .filter(Boolean)
                        .join(' · ') || 'Sem telefone/documento'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton
                      className="!px-3 !py-2 text-sm"
                      onClick={() => startEdit(c)}
                    >
                      Gerenciar / Editar
                    </PrimaryButton>
                    <GhostButton
                      className="!px-3 !py-2 text-sm"
                      onClick={() => {
                        void setContactActive(c.id, !c.active)
                          .then(() => {
                            refresh();
                            setOk(c.active ? 'Contato desativado.' : 'Contato reativado.');
                          })
                          .catch((e: Error) => setError(e.message));
                      }}
                    >
                      {c.active ? 'Desativar' : 'Reativar'}
                    </GhostButton>
                    <GhostButton
                      className="!px-3 !py-2 text-sm"
                      onClick={() => {
                        if (!confirm(`Excluir contato "${c.legalName}"?`)) return;
                        void deleteContact(c.id)
                          .then(() => {
                            refresh();
                            setOk('Contato excluído.');
                          })
                          .catch((e: Error) => setError(e.message));
                      }}
                    >
                      Excluir
                    </GhostButton>
                  </div>
                </div>
              </li>
            ))}
            {contacts.length === 0 && (
              <li className="rounded-lg border border-dashed border-white/20 px-4 py-8 text-center">
                <p className="text-ink-200">Nenhum contato encontrado.</p>
                <p className="mt-1 text-sm text-ink-300">
                  Clique em <strong className="text-brand-400">Novo contato</strong> para
                  cadastrar.
                </p>
                <PrimaryButton className="mt-4" onClick={startNew}>
                  Novo contato
                </PrimaryButton>
              </li>
            )}
          </ul>
        </PlaceholderCard>
      )}

      <ContextMenu menu={menu} onClose={closeCtx} />
    </div>
  );
}
