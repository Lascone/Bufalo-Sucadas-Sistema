import { useCallback, useEffect, useMemo, useState } from 'react';
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
  downloadOldDataArchivePdf,
  exportOldDataArchiveCsv,
} from '../lib/pdf';

type WipeArchive = {
  id: string;
  archivedDeviceId: string;
  archivedName: string;
  fromAt: string;
  toAt: string;
  note: string | null;
  createdAt: string;
};

type HistoryGroup = {
  deviceId: string;
  deviceName: string;
  fromAt: string;
  toAt: string;
  entityCount: number;
  hasWipeArchive: boolean;
  wipeArchiveId: string | null;
};

type ArchiveEntity = {
  id: string;
  deviceId: string | null;
  entityType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type Selection =
  | { kind: 'wipe'; archive: WipeArchive }
  | { kind: 'history'; group: HistoryGroup };

const TYPE_FILTERS: Array<{ id: string; label: string; types: string[] }> = [
  {
    id: 'all',
    label: 'Todos',
    types: [],
  },
  {
    id: 'caixa',
    label: 'Caixa',
    types: ['CashRegister', 'CashRegisterMovement', 'CashLoan'],
  },
  {
    id: 'vendas',
    label: 'Vendas',
    types: ['Sale', 'SaleComment'],
  },
  {
    id: 'compras',
    label: 'Compras',
    types: ['Purchase'],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    types: ['FinanceDay'],
  },
  {
    id: 'patio',
    label: 'Pátio',
    types: ['PatioMovement'],
  },
];

const ENTITY_LABELS: Record<string, string> = {
  CashRegister: 'Caixa',
  CashRegisterMovement: 'Mov. caixa',
  CashLoan: 'Empréstimo',
  Sale: 'Venda',
  SaleComment: 'Comentário venda',
  Purchase: 'Compra',
  PatioMovement: 'Pátio',
  FinanceDay: 'Dia financeiro',
  Material: 'Material',
  Contact: 'Contato',
};

function fmtDt(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function fmtDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function money(n: unknown) {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return `R$ ${v.toFixed(2)}`;
}

function summarizeEntity(e: ArchiveEntity): { summary: string; amount?: string } {
  const p = e.payload;
  switch (e.entityType) {
    case 'CashRegister':
      return {
        summary: `Caixa ${String(p.status ?? '—')} · ${String(p.openedBy ?? p.operatorName ?? '')}`,
        amount: money(p.expectedCash ?? p.closingExpected ?? p.openingFloat),
      };
    case 'CashRegisterMovement':
      return {
        summary: `${String(p.type ?? p.kind ?? 'mov')} · ${String(p.description ?? p.note ?? '')}`.trim(),
        amount: money(p.amount ?? p.value),
      };
    case 'Sale':
      return {
        summary: `Venda · ${String(p.buyerName ?? p.contactName ?? p.receiver ?? '')}`,
        amount: money(p.total ?? p.totalAmount),
      };
    case 'Purchase':
      return {
        summary: `Compra · ${String(p.supplierName ?? p.contactName ?? p.materialName ?? '')}`,
        amount: money(p.total ?? p.totalAmount),
      };
    case 'PatioMovement':
      return {
        summary: `${String(p.kind ?? p.type ?? 'pátio')} · ${String(p.materialName ?? '')} · ${Number(p.weightKg ?? p.weight ?? 0).toFixed(3)} kg`,
        amount: money(p.totalCost ?? p.value),
      };
    case 'FinanceDay':
      return {
        summary: `Dia ${String(p.date ?? p.day ?? '')}`,
        amount: money(p.net ?? p.balance ?? p.total),
      };
    case 'CashLoan':
      return {
        summary: `Empréstimo · ${String(p.personName ?? p.note ?? '')}`,
        amount: money(p.amount),
      };
    case 'Material':
      return { summary: String(p.name ?? p.slug ?? e.id) };
    case 'Contact':
      return { summary: String(p.name ?? p.displayName ?? e.id) };
    default:
      return {
        summary: String(p.name ?? p.description ?? p.note ?? e.id).slice(0, 120),
        amount: money(p.total ?? p.amount ?? p.value),
      };
  }
}

function selectionTitle(sel: Selection) {
  if (sel.kind === 'wipe') {
    const a = sel.archive;
    return `Wipe · ${a.archivedName}`;
  }
  return `Histórico · ${sel.group.deviceName}`;
}

function selectionSubtitle(sel: Selection) {
  if (sel.kind === 'wipe') {
    const a = sel.archive;
    return `${fmtDay(a.fromAt)} até ${fmtDay(a.toAt)}${a.note ? ` · ${a.note}` : ''}`;
  }
  const g = sel.group;
  return `${fmtDay(g.fromAt)} até ${fmtDay(g.toAt)} · ${g.entityCount} registros no servidor`;
}

export function OldDataPage() {
  const { menu, open: openCtx, close: closeCtx } = useContextMenu();
  const [archives, setArchives] = useState<WipeArchive[]>([]);
  const [groups, setGroups] = useState<HistoryGroup[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [entities, setEntities] = useState<ArchiveEntity[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<ArchiveEntity | null>(null);

  const loadLists = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!window.ferrogestor?.listWipeArchives) {
      setError('Disponível apenas no app Electron.');
      return;
    }
    const status = await window.ferrogestor.getSyncAuthStatus?.();
    if (!status?.configured) {
      setError('Conecte o PostgreSQL em Configurações → Banco online para ler o histórico.');
      setArchives([]);
      setGroups([]);
      return;
    }
    setBusy(true);
    try {
      const [wipes, hist] = await Promise.all([
        window.ferrogestor.listWipeArchives(),
        window.ferrogestor.listArchiveHistoryGroups(),
      ]);
      if (!wipes.ok) {
        setError(wipes.error);
        setArchives([]);
      } else {
        setArchives(wipes.archives);
      }
      if (!hist.ok) {
        setError((prev) => prev ?? hist.error);
        setGroups([]);
      } else {
        setGroups(hist.groups);
        setInfo(
          hist.groups.length
            ? `${hist.groups.length} dispositivo(s) com dados no servidor.`
            : 'Nenhum histórico encontrado no PostgreSQL.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const loadEntities = useCallback(
    async (sel: Selection) => {
      if (!window.ferrogestor?.queryArchiveEntities) return;
      setBusy(true);
      setError(null);
      const filter = TYPE_FILTERS.find((f) => f.id === typeFilter);
      const payload =
        sel.kind === 'wipe'
          ? {
              archiveId: sel.archive.id,
              from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
              to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
              entityTypes: filter?.types.length ? filter.types : undefined,
              limit: 800,
            }
          : {
              deviceId: sel.group.deviceId,
              from: fromDate
                ? new Date(`${fromDate}T00:00:00`).toISOString()
                : sel.group.fromAt,
              to: toDate
                ? new Date(`${toDate}T23:59:59`).toISOString()
                : sel.group.toAt,
              entityTypes: filter?.types.length ? filter.types : undefined,
              limit: 800,
            };
      try {
        const res = await window.ferrogestor.queryArchiveEntities(payload);
        if (!res.ok) {
          setError(res.error);
          setEntities([]);
        } else {
          setEntities(res.entities);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setEntities([]);
      }
      setBusy(false);
    },
    [fromDate, toDate, typeFilter],
  );

  useEffect(() => {
    if (!selected) {
      setEntities([]);
      return;
    }
    void loadEntities(selected);
  }, [selected, loadEntities]);

  const devices = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of archives) map.set(a.archivedDeviceId, a.archivedName);
    for (const g of groups) map.set(g.deviceId, g.deviceName);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [archives, groups]);

  const filteredArchives = useMemo(() => {
    if (!deviceFilter) return archives;
    return archives.filter((a) => a.archivedDeviceId === deviceFilter);
  }, [archives, deviceFilter]);

  const filteredGroups = useMemo(() => {
    let list = groups;
    if (deviceFilter) list = list.filter((g) => g.deviceId === deviceFilter);
    return list;
  }, [groups, deviceFilter]);

  const previewRows = useMemo(
    () =>
      entities.map((e) => {
        const { summary, amount } = summarizeEntity(e);
        return {
          entity: e,
          at: fmtDt(e.updatedAt || e.createdAt),
          entityType: ENTITY_LABELS[e.entityType] ?? e.entityType,
          summary,
          amount,
        };
      }),
    [entities],
  );

  const patioTotals = useMemo(() => {
    const map = new Map<
      string,
      { name: string; inKg: number; outKg: number; valueIn: number; valueOut: number; count: number }
    >();
    for (const e of entities) {
      if (e.entityType !== 'PatioMovement') continue;
      const p = e.payload;
      const name = String(p.materialName ?? p.name ?? 'Sem material');
      const kind = String(p.kind ?? p.type ?? '').toUpperCase();
      const weight = Number(p.weightKg ?? p.weight ?? 0) || 0;
      const unitCost = Number(p.unitCost ?? p.costPerKg ?? 0) || 0;
      const value = Number(p.totalCost ?? p.value ?? weight * unitCost) || 0;
      const cur = map.get(name) ?? {
        name,
        inKg: 0,
        outKg: 0,
        valueIn: 0,
        valueOut: 0,
        count: 0,
      };
      cur.count += 1;
      if (kind === 'OUT' || kind === 'SAIDA' || kind === 'SALE') {
        cur.outKg += weight;
        cur.valueOut += value;
      } else {
        cur.inKg += weight;
        cur.valueIn += value;
      }
      map.set(name, cur);
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        netKg: Math.round((r.inKg - r.outKg) * 1000) / 1000,
        totalValue: Math.round((r.valueIn - r.valueOut) * 100) / 100,
      }))
      .sort((a, b) => Math.abs(b.totalValue) - Math.abs(a.totalValue));
  }, [entities]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of previewRows) {
      const day = r.at.split(',')[0] ?? r.at;
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return [...map.entries()].slice(0, 14);
  }, [previewRows]);

  const rowsFromEntities = (list: ArchiveEntity[]) =>
    list.map((e) => {
      const { summary, amount } = summarizeEntity(e);
      return {
        at: fmtDt(e.updatedAt || e.createdAt),
        entityType: ENTITY_LABELS[e.entityType] ?? e.entityType,
        summary,
        amount,
      };
    });

  const exportPdfFrom = (sel: Selection, list: ArchiveEntity[]) => {
    downloadOldDataArchivePdf({
      title: selectionTitle(sel),
      subtitle: selectionSubtitle(sel),
      rows: rowsFromEntities(list),
    });
  };

  const exportPdf = () => {
    if (!selected) return;
    exportPdfFrom(selected, entities);
  };

  const exportPdfForSelection = async (sel: Selection) => {
    setSelected(sel);
    if (!window.ferrogestor?.queryArchiveEntities) return;
    setBusy(true);
    const filter = TYPE_FILTERS.find((f) => f.id === typeFilter);
    const payload =
      sel.kind === 'wipe'
        ? {
            archiveId: sel.archive.id,
            entityTypes: filter?.types.length ? filter.types : undefined,
            limit: 800,
          }
        : {
            deviceId: sel.group.deviceId,
            from: sel.group.fromAt,
            to: sel.group.toAt,
            entityTypes: filter?.types.length ? filter.types : undefined,
            limit: 800,
          };
    try {
      const res = await window.ferrogestor.queryArchiveEntities(payload);
      if (res.ok) {
        setEntities(res.entities);
        exportPdfFrom(sel, res.entities);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const exportCsv = () => {
    if (!selected) return;
    exportOldDataArchiveCsv({
      title: selectionTitle(selected),
      subtitle: selectionSubtitle(selected),
      rows: rowsFromEntities(entities),
    });
  };

  const copySummary = async () => {
    if (!selected) return;
    const text = [
      selectionTitle(selected),
      selectionSubtitle(selected),
      `${previewRows.length} registros`,
      ...previewRows.slice(0, 40).map(
        (r) => `${r.at} · ${r.entityType} · ${r.summary}${r.amount ? ` · ${r.amount}` : ''}`,
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setInfo('Resumo copiado.');
    } catch {
      setError('Não foi possível copiar para a área de transferência.');
    }
  };

  const registerRetro = async (group: HistoryGroup) => {
    if (!window.ferrogestor?.registerRetroWipeArchive) return;
    if (
      !window.confirm(
        `Registrar wipe retroativo para ${group.deviceName}?\n${fmtDay(group.fromAt)} → ${fmtDay(group.toAt)}`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await window.ferrogestor.registerRetroWipeArchive({
        deviceId: group.deviceId,
        fromAt: group.fromAt,
        toAt: group.toAt,
        note: 'Registro retroativo a partir do histórico no servidor',
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setInfo('Wipe retroativo registrado.');
        await loadLists();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const selectWipe = (archive: WipeArchive) => {
    setSelected({ kind: 'wipe', archive });
    setDetail(null);
  };

  const selectGroup = (group: HistoryGroup) => {
    setSelected({ kind: 'history', group });
    setDetail(null);
  };

  return (
    <div>
      <PageHeader
        title="Dados antigos"
        subtitle="Somente leitura do PostgreSQL: fechamentos de wipe e histórico já no servidor. Não remistura no caixa limpo."
        actions={
          <div className="flex flex-wrap gap-2">
            <GhostButton type="button" disabled={busy} onClick={() => void loadLists()}>
              Buscar no servidor
            </GhostButton>
            {selected && (
              <>
                <GhostButton type="button" disabled={busy || !previewRows.length} onClick={exportCsv}>
                  CSV
                </GhostButton>
                <PrimaryButton
                  type="button"
                  disabled={busy || !previewRows.length}
                  onClick={() => exportPdf()}
                >
                  PDF
                </PrimaryButton>
              </>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-3 rounded border border-moss-500/30 bg-moss-950/30 p-3 text-sm text-moss-200">
          {info}
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                typeFilter === f.id
                  ? 'border-brand-400 bg-brand-500/20 text-ink-50'
                  : 'border-white/10 text-ink-300 hover:border-white/25'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="De">
            <input
              type="date"
              className={fieldClass}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </Field>
          <Field label="Até">
            <input
              type="date"
              className={fieldClass}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </Field>
          <Field label="Dispositivo">
            <select
              className={fieldClass}
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-4">
          <PlaceholderCard>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-400">
              Fechamentos de wipe
            </h2>
            {filteredArchives.length === 0 ? (
              <p className="text-sm text-ink-300">
                Nenhum wipe registrado ainda. Use o histórico abaixo ou zere os dados com o
                PostgreSQL online.
              </p>
            ) : (
              <ul className="max-h-[18rem] space-y-1 overflow-y-auto">
                {filteredArchives.map((a) => {
                  const active =
                    selected?.kind === 'wipe' && selected.archive.id === a.id;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                          active
                            ? 'border-brand-400/60 bg-brand-500/15 text-ink-50'
                            : 'border-transparent bg-ink-900/50 text-ink-100 hover:border-white/15'
                        }`}
                        onClick={() => selectWipe(a)}
                        onContextMenu={(e) =>
                          openCtx(e, [
                            {
                              id: 'open',
                              label: 'Abrir preview',
                              onSelect: () => selectWipe(a),
                            },
                            {
                              id: 'pdf',
                              label: 'Exportar PDF do período',
                              onSelect: () =>
                                void exportPdfForSelection({ kind: 'wipe', archive: a }),
                            },
                          ])
                        }
                      >
                        <div className="font-medium">
                          Wipe de {fmtDay(a.fromAt)} até {fmtDay(a.toAt)}
                        </div>
                        <div className="text-xs text-ink-300">{a.archivedName}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PlaceholderCard>

          <PlaceholderCard>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-400">
              Histórico no servidor
            </h2>
            <p className="mb-2 text-xs text-ink-300">
              Inclui o que já estava no PostgreSQL mesmo sem wipe registrado (pré-wipe).
            </p>
            {filteredGroups.length === 0 ? (
              <p className="text-sm text-ink-300">Nenhum grupo encontrado.</p>
            ) : (
              <ul className="max-h-[22rem] space-y-1 overflow-y-auto">
                {filteredGroups.map((g) => {
                  const active =
                    selected?.kind === 'history' && selected.group.deviceId === g.deviceId;
                  return (
                    <li key={g.deviceId}>
                      <button
                        type="button"
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                          active
                            ? 'border-brand-400/60 bg-brand-500/15 text-ink-50'
                            : 'border-transparent bg-ink-900/50 text-ink-100 hover:border-white/15'
                        }`}
                        onClick={() => selectGroup(g)}
                        onContextMenu={(e) =>
                          openCtx(e, [
                            {
                              id: 'open',
                              label: 'Ver detalhe / preview',
                              onSelect: () => selectGroup(g),
                            },
                            {
                              id: 'pdf',
                              label: 'Exportar PDF do período',
                              onSelect: () =>
                                void exportPdfForSelection({ kind: 'history', group: g }),
                            },
                            {
                              id: 'retro',
                              label: 'Registrar wipe retroativo',
                              disabled: g.hasWipeArchive,
                              onSelect: () => void registerRetro(g),
                            },
                          ])
                        }
                      >
                        <div className="font-medium">{g.deviceName}</div>
                        <div className="text-xs text-ink-300">
                          {fmtDay(g.fromAt)} → {fmtDay(g.toAt)} · {g.entityCount} regs
                          {g.hasWipeArchive ? ' · com wipe' : ' · pré-wipe'}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PlaceholderCard>
        </div>

        <PlaceholderCard className="min-h-[24rem]">
          {!selected ? (
            <p className="text-sm text-ink-300">
              Selecione um fechamento de wipe ou um histórico no servidor para ver o preview.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-ink-50">
                    {selectionTitle(selected)}
                  </h2>
                  <p className="text-sm text-ink-300">{selectionSubtitle(selected)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GhostButton type="button" onClick={() => void copySummary()}>
                    Copiar resumo
                  </GhostButton>
                  {selected.kind === 'history' && !selected.group.hasWipeArchive && (
                    <GhostButton
                      type="button"
                      disabled={busy}
                      onClick={() => void registerRetro(selected.group)}
                    >
                      Registrar wipe retroativo
                    </GhostButton>
                  )}
                </div>
              </div>

              {patioTotals.length > 0 && (typeFilter === 'patio' || typeFilter === 'all') && (
                <div className="mb-3 overflow-auto rounded-lg border border-moss-500/30">
                  <div className="border-b border-white/10 bg-moss-950/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-moss-300">
                    Pátio · totais por material
                  </div>
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="bg-ink-900/80 text-[11px] uppercase text-ink-400">
                      <tr>
                        <th className="px-3 py-1.5">Material</th>
                        <th className="px-3 py-1.5">Entrada kg</th>
                        <th className="px-3 py-1.5">Saída kg</th>
                        <th className="px-3 py-1.5">Líquido kg</th>
                        <th className="px-3 py-1.5">Valor total</th>
                        <th className="px-3 py-1.5">Movs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patioTotals.map((r) => (
                        <tr key={r.name} className="border-t border-white/5">
                          <td className="px-3 py-1.5 font-medium">{r.name}</td>
                          <td className="px-3 py-1.5 text-emerald-300">
                            {r.inKg.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5 text-orange-300">
                            {r.outKg.toFixed(3)}
                          </td>
                          <td className="px-3 py-1.5">{r.netKg.toFixed(3)}</td>
                          <td className="px-3 py-1.5 font-semibold text-ink-50">
                            R$ {r.totalValue.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-ink-400">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {byDay.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {byDay.map(([day, count]) => (
                    <span
                      key={day}
                      className="rounded border border-white/10 bg-ink-900/70 px-2 py-1 text-xs text-ink-200"
                    >
                      {day}: {count}
                    </span>
                  ))}
                </div>
              )}

              <div className="max-h-[32rem] overflow-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="sticky top-0 bg-ink-900 text-xs uppercase tracking-wide text-ink-300">
                    <tr>
                      <th className="px-3 py-2">Quando</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Resumo</th>
                      <th className="px-3 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-ink-400">
                          {busy ? 'Carregando…' : 'Nenhum registro neste filtro.'}
                        </td>
                      </tr>
                    ) : (
                      previewRows.map((r) => (
                        <tr
                          key={r.entity.id}
                          className="border-t border-white/5 hover:bg-ink-900/60"
                          onContextMenu={(e) =>
                            openCtx(e, [
                              {
                                id: 'detail',
                                label: 'Ver detalhe',
                                onSelect: () => setDetail(r.entity),
                              },
                              {
                                id: 'pdf',
                                label: 'Exportar PDF do período',
                                onSelect: () => exportPdf(),
                              },
                              {
                                id: 'copy',
                                label: 'Copiar resumo',
                                onSelect: () => void copySummary(),
                              },
                            ])
                          }
                          onDoubleClick={() => setDetail(r.entity)}
                        >
                          <td className="whitespace-nowrap px-3 py-1.5 text-ink-300">
                            {r.at}
                          </td>
                          <td className="px-3 py-1.5">{r.entityType}</td>
                          <td className="px-3 py-1.5">{r.summary}</td>
                          <td className="whitespace-nowrap px-3 py-1.5">{r.amount ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </PlaceholderCard>
      </div>

      {detail && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-white/15 bg-ink-900 p-4 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-ink-50">
                {ENTITY_LABELS[detail.entityType] ?? detail.entityType}
              </h3>
              <GhostButton type="button" onClick={() => setDetail(null)}>
                Fechar
              </GhostButton>
            </div>
            <pre className="overflow-x-auto rounded bg-ink-950 p-3 text-xs text-ink-200">
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={closeCtx} />
    </div>
  );
}
