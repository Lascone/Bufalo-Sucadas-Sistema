import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { ContextMenu, useContextMenu } from '../components/ContextMenu';
import { getMaterial, listMaterials } from '../lib/materials';
import { MaterialThumb } from '../components/MaterialThumb';
import {
  addSaleComment,
  createSale,
  listSales,
  type SalePaymentMethod,
  type SaleRecord,
} from '../lib/sales';
import { downloadSalePdf, shareSalePdfWhatsApp } from '../lib/pdf';
import { getSettings, listActivePartners } from '../lib/settings';
import { useAppStore } from '../stores/app-store';
import { cn } from '../lib/utils';

type SellTab = 'nova' | 'historico';

export function SellPage() {
  const username = useAppStore((s) => s.session.username);
  const commentsEnabled = getSettings()['sales.commentsEnabled'];
  const partners = listActivePartners();
  const materials = listMaterials(true);
  const { menu, open, close } = useContextMenu();

  const [tab, setTab] = useState<SellTab>('nova');
  const [sales, setSales] = useState<SaleRecord[]>(() => listSales());
  const [customerName, setCustomerName] = useState('');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('PIX');
  const [receiverPick, setReceiverPick] = useState(() =>
    partners[0] ? partners[0] : '__other__',
  );
  const [receiverOther, setReceiverOther] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selected = sales.find((s) => s.id === selectedId) ?? null;

  const toggleMaterial = (id: string) => {
    setSelectedMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const resolveReceiver = () => {
    if (receiverPick === '__other__') return receiverOther.trim();
    return receiverPick.trim();
  };

  const submit = () => {
    setError(null);
    setInfo(null);

    const mats = selectedMaterialIds
      .map((id) => getMaterial(id))
      .filter(Boolean)
      .map((m) => ({
        materialId: m!.id,
        materialName: m!.name,
        buyPriceRef: m!.buyPrice,
      }));

    if (!mats.length) {
      setError('Escolha ao menos um material (pode marcar vários).');
      return;
    }

    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Informe o valor da venda (ex.: 1000).');
      return;
    }

    void createSale({
      customerName: customerName.trim() || 'Empresa',
      materials: mats,
      amount: value,
      paymentMethod,
      receivedBy: resolveReceiver(),
      notes,
      openedBy: username,
    })
      .then(({ sale, cashInfo }) => {
        setCustomerName('');
        setSelectedMaterialIds([]);
        setAmount('');
        setNotes('');
        setSelectedId(sale.id);
        setSales(listSales());
        setTab('historico');
        const matsLabel = sale.items.map((i) => i.materialName).join(', ');
        setInfo(
          cashInfo ??
            `Vendeu ${matsLabel} · ${sale.customerName} · R$ ${sale.amountReceived.toFixed(2)} · ${sale.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'} · ${sale.receivedBy}. Já no relatório de vendas.`,
        );
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div>
      <PageHeader
        title="Vendas"
        subtitle="Registre o lote aqui. Relatórios por período ficam em Financeiro → Vendas."
        actions={
          <Link
            to="/financeiro?secao=vendas"
            className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/10"
          >
            Relatório de vendas
          </Link>
        }
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

      <div className="flex gap-3">
        <aside className="w-36 shrink-0 space-y-1">
          {(
            [
              { id: 'nova' as const, label: 'Nova venda', hint: 'Registrar' },
              { id: 'historico' as const, label: 'Histórico', hint: 'Lista local' },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setTab(n.id)}
              className={cn(
                'w-full rounded-lg border px-2.5 py-2 text-left text-sm transition',
                tab === n.id
                  ? 'border-brand-500 bg-brand-500/15 text-ink-50'
                  : 'border-white/10 text-ink-300 hover:border-white/25',
              )}
            >
              <div className="font-medium">{n.label}</div>
              <div className="text-[10px] text-ink-400">{n.hint}</div>
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          {tab === 'nova' && (
            <PlaceholderCard>
              <h2 className="font-semibold">Nova venda</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Empresa compradora">
                  <input
                    className={fieldClass}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex.: Brasil Metais"
                  />
                </Field>

                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-ink-400">
                      Materiais do lote (multi-seleção)
                    </p>
                    {selectedMaterialIds.length > 0 && (
                      <button
                        type="button"
                        className="text-xs text-ink-400 hover:text-ink-200"
                        onClick={() => setSelectedMaterialIds([])}
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {materials.map((m) => {
                      const on = selectedMaterialIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMaterial(m.id)}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left transition ${
                            on
                              ? 'border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500/40'
                              : 'border-white/10 bg-ink-900/50 hover:border-emerald-400/40'
                          }`}
                        >
                          <MaterialThumb material={m} className="!h-8 !w-8" />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-50">
                            {m.name}
                          </span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                              on
                                ? 'border-emerald-400 bg-emerald-500/30 text-emerald-200'
                                : 'border-white/20 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="Valor recebido (R$)">
                  <input
                    className={fieldClass}
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ex.: 1000"
                  />
                </Field>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Forma">
                    <div className="flex gap-2">
                      {(['PIX', 'DINHEIRO'] as const).map((m) => (
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
                  <Field label="Recebedor">
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
                        placeholder="Ex.: Keity"
                      />
                    )}
                  </Field>
                </div>

                <Field label="Obs. (opcional)">
                  <input
                    className={fieldClass}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Nota rápida"
                  />
                </Field>

                <PrimaryButton onClick={submit}>Registrar venda</PrimaryButton>
              </div>
            </PlaceholderCard>
          )}

          {tab === 'historico' && (
            <div className="grid gap-3 xl:grid-cols-[1fr_1.1fr]">
              <PlaceholderCard className="!p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Histórico</h2>
                  <Link
                    to="/financeiro?secao=vendas"
                    className="text-xs text-emerald-300 hover:underline"
                  >
                    Abrir relatório →
                  </Link>
                </div>
                <ul className="max-h-[36rem] space-y-1 overflow-auto text-sm">
                  {sales.map((s) => (
                    <li
                      key={s.id}
                      className={`cursor-context-menu rounded-lg border px-2.5 py-2 ${
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
                          {
                            id: 'wpp',
                            label: 'WhatsApp',
                            onSelect: () => {
                              void shareSalePdfWhatsApp(s).then((r) =>
                                setInfo(r.hint),
                              );
                            },
                          },
                        ])
                      }
                    >
                      <div className="font-medium text-ink-50">
                        {s.items.map((i) => i.materialName).join(', ') || 'Lote'} ·{' '}
                        {s.customerName}
                      </div>
                      <div className="text-xs text-emerald-300">
                        R$ {s.amountReceived.toFixed(2)} ·{' '}
                        {s.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'} ·{' '}
                        {s.receivedBy || '—'}
                      </div>
                      <div className="text-[10px] text-ink-400">
                        {s.documentNumber} ·{' '}
                        {new Date(s.soldAt).toLocaleString('pt-BR')}
                      </div>
                    </li>
                  ))}
                  {sales.length === 0 && (
                    <li className="text-ink-300">Nenhuma venda ainda.</li>
                  )}
                </ul>
              </PlaceholderCard>

              <PlaceholderCard className="!p-3">
                {!selected ? (
                  <p className="text-sm text-ink-300">
                    Selecione uma venda à esquerda.
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <h2 className="font-semibold">
                        {selected.documentNumber} — {selected.customerName}
                      </h2>
                      <GhostButton onClick={() => downloadSalePdf(selected)}>
                        PDF
                      </GhostButton>
                      <GhostButton
                        onClick={() =>
                          void shareSalePdfWhatsApp(selected).then((r) =>
                            setInfo(r.hint),
                          )
                        }
                      >
                        WhatsApp
                      </GhostButton>
                    </div>
                    <p className="mt-2 text-sm text-ink-100">
                      {selected.items.map((i) => i.materialName).join(', ')} · R${' '}
                      {selected.amountReceived.toFixed(2)} ·{' '}
                      {selected.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro'} ·{' '}
                      {selected.receivedBy}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {new Date(selected.soldAt).toLocaleString('pt-BR')}
                    </p>
                    {selected.notes && (
                      <p className="mt-2 text-sm text-ink-300">{selected.notes}</p>
                    )}
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <h3 className="text-sm font-semibold">Comentários</h3>
                      <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-sm">
                        {(selected.comments ?? []).map((c) => (
                          <li
                            key={c.id}
                            className="rounded border border-white/10 px-2 py-1"
                          >
                            <div className="text-[10px] text-ink-400">
                              {c.authorName} ·{' '}
                              {new Date(c.createdAt).toLocaleString('pt-BR')}
                            </div>
                            {c.body}
                          </li>
                        ))}
                      </ul>
                      {commentsEnabled && (
                        <div className="mt-2 flex gap-2">
                          <input
                            className={`flex-1 ${fieldClass} !py-1.5`}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Comentário"
                          />
                          <PrimaryButton
                            className="!py-1.5"
                            onClick={() => {
                              if (!comment.trim()) return;
                              void addSaleComment(
                                selected.id,
                                comment.trim(),
                                username,
                              ).then(() => {
                                setComment('');
                                setSales(listSales());
                              });
                            }}
                          >
                            OK
                          </PrimaryButton>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </PlaceholderCard>
            </div>
          )}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
