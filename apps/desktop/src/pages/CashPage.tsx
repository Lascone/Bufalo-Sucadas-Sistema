import { useState } from 'react';
import { PageHeader, PlaceholderCard } from '../components/Page';
import {
  addCashMovement,
  calcExpected,
  closeCash,
  getOpenCash,
  listCashRegisters,
  openCash,
  type CashRegisterRecord,
} from '../lib/cash';
import { getSettings } from '../lib/settings';
import { downloadCashClosePdf, shareCashClosePdfWhatsApp } from '../lib/pdf';
import { useAppStore } from '../stores/app-store';

export function CashPage() {
  const username = useAppStore((s) => s.session.username);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  void tick;

  const settings = getSettings();
  const open = getOpenCash();
  const history = listCashRegisters().filter((c) => c.status === 'CLOSED').slice(0, 10);

  const [openingBalance, setOpeningBalance] = useState('0');
  const [openNotes, setOpenNotes] = useState('');
  const [movType, setMovType] = useState<'ENTRADA' | 'SAIDA' | 'SANGRIA' | 'SUPRIMENTO' | 'VENDA_RECEBIDA' | 'DESPESA'>('ENTRADA');
  const [movAmount, setMovAmount] = useState('');
  const [movDesc, setMovDesc] = useState('');
  const [informed, setInformed] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const expected = open ? calcExpected(open) : 0;

  return (
    <div>
      <PageHeader
        title="Caixa"
        subtitle="Dinheiro físico do dia (abrir/fechar, sangria, despesa). Vendas de material ficam em Vendas — ao finalizar, entram aqui como VENDA_RECEBIDA se o caixa estiver aberto."
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!open ? (
        <PlaceholderCard>
          <h2 className="mb-3 font-semibold">Abrir caixa</h2>
          <div className="grid max-w-lg gap-3">
            <label className="text-sm">
              Saldo inicial (R$)
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Observação
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-md bg-brand-500 px-4 py-2 text-ink-950"
              onClick={() => {
                setError(null);
                void openCash({
                  openedBy: username,
                  openingBalance: Number(openingBalance) || 0,
                  notes: openNotes,
                  allowMultiple: settings['cash.allowMultipleOpen'],
                })
                  .then(refresh)
                  .catch((e: Error) => setError(e.message));
              }}
            >
              Abrir caixa
            </button>
          </div>
        </PlaceholderCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <PlaceholderCard>
            <h2 className="font-semibold">Caixa aberto</h2>
            <p className="mt-1 text-sm text-ink-300">
              Desde {new Date(open.openedAt).toLocaleString('pt-BR')} — {open.openedBy}
            </p>
            <p className="mt-2">Saldo inicial: R$ {open.openingBalance.toFixed(2)}</p>
            <p>Saldo esperado: R$ {expected.toFixed(2)}</p>

            <h3 className="mt-4 font-semibold">Novo movimento</h3>
            <div className="mt-2 grid gap-2">
              <select
                className="rounded border px-3 py-2"
                value={movType}
                onChange={(e) => setMovType(e.target.value as typeof movType)}
              >
                <option value="ENTRADA">Entrada</option>
                <option value="SAIDA">Saída</option>
                <option value="SANGRIA">Sangria</option>
                <option value="SUPRIMENTO">Suprimento</option>
                <option value="VENDA_RECEBIDA">Venda recebida</option>
                <option value="DESPESA">Despesa</option>
              </select>
              <input
                className="rounded border px-3 py-2"
                placeholder="Valor"
                value={movAmount}
                onChange={(e) => setMovAmount(e.target.value)}
              />
              <input
                className="rounded border px-3 py-2"
                placeholder="Descrição"
                value={movDesc}
                onChange={(e) => setMovDesc(e.target.value)}
              />
              <button
                type="button"
                className="rounded-md bg-brand-500 px-4 py-2 text-ink-950"
                onClick={() => {
                  setError(null);
                  void addCashMovement(open.id, {
                    movementType: movType,
                    amount: Number(movAmount) || 0,
                    description: movDesc || movType,
                  })
                    .then(() => {
                      setMovAmount('');
                      setMovDesc('');
                      refresh();
                    })
                    .catch((e: Error) => setError(e.message));
                }}
              >
                Registrar movimento
              </button>
            </div>

            <ul className="mt-4 max-h-48 space-y-1 overflow-auto text-sm">
              {open.movements.map((m) => (
                <li key={m.id} className="border-b border-white/10 py-1">
                  {m.movementType} — R$ {m.amount.toFixed(2)} — {m.description}
                </li>
              ))}
            </ul>
          </PlaceholderCard>

          <PlaceholderCard>
            <h2 className="font-semibold">Fechar caixa</h2>
            <label className="mt-3 block text-sm">
              Saldo informado (R$)
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                value={informed}
                onChange={(e) => setInformed(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm">
              Justificativa da diferença
              <textarea
                className="mt-1 w-full rounded border px-3 py-2"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-ink-950"
              onClick={() => {
                setError(null);
                void closeCash({
                  cashId: open.id,
                  informedBalance: Number(informed) || 0,
                  differenceReason: reason,
                  requireReason: settings['cash.requireDifferenceReason'],
                })
                  .then((closed) => {
                    downloadCashClosePdf(closed);
                    refresh();
                  })
                  .catch((e: Error) => setError(e.message));
              }}
            >
              Fechar e gerar PDF A4
            </button>
          </PlaceholderCard>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 font-display text-2xl">Histórico</h2>
        <PlaceholderCard>
          {history.length === 0 ? (
            <p className="text-sm text-ink-300">Nenhum caixa fechado ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((c: CashRegisterRecord) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 border-b py-2">
                  <span>{new Date(c.openedAt).toLocaleDateString('pt-BR')}</span>
                  <span>Diferença R$ {(c.difference ?? 0).toFixed(2)}</span>
                  <button
                    type="button"
                    className="text-brand-400 underline"
                    onClick={() => downloadCashClosePdf(c)}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    className="text-emerald-300 underline"
                    onClick={() =>
                      void shareCashClosePdfWhatsApp(c).then(() => undefined)
                    }
                  >
                    WhatsApp
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PlaceholderCard>
      </div>
    </div>
  );
}
