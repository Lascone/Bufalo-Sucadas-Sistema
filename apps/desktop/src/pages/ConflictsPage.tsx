import { useCallback, useEffect, useState } from 'react';
import {
  Field,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  GhostButton,
  fieldClass,
} from '../components/Page';

type ConflictRow = {
  id: string;
  entityType: string;
  entityId: string;
  localVersion: number;
  serverVersion: number;
  localPayload: unknown;
  serverPayload: unknown;
  createdAt: string;
};

export function ConflictsPage() {
  const [rows, setRows] = useState<ConflictRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [justification, setJustification] = useState('Resolução manual');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!window.ferrogestor?.listSyncConflicts) {
      setError('Disponível apenas no app Electron.');
      setRows([]);
      return;
    }
    const status = await window.ferrogestor.getSyncAuthStatus();
    if (!status.configured) {
      setError('Configure o PostgreSQL em Configurações → Banco online.');
      setRows([]);
      return;
    }
    try {
      const data = (await window.ferrogestor.listSyncConflicts()) as ConflictRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (
    id: string,
    resolution: 'KEEP_LOCAL' | 'KEEP_SERVER',
  ) => {
    setBusyId(id);
    setError(null);
    setInfo(null);
    if (!window.ferrogestor?.resolveSyncConflict) {
      setError('Disponível apenas no app Electron.');
      setBusyId(null);
      return;
    }
    try {
      const res = await window.ferrogestor.resolveSyncConflict({
        conflictId: id,
        resolution,
        justification: justification.trim() || 'Resolução manual',
      });
      if (!res.ok) {
        setError(res.error);
        setBusyId(null);
        return;
      }
      setInfo(`Conflito resolvido: ${resolution}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId(null);
  };

  return (
    <div>
      <PageHeader
        title="Resolução de conflitos"
        subtitle="Quando dois PCs alteram a mesma versão, escolha manter local ou servidor."
        actions={
          <GhostButton type="button" onClick={() => void load()}>
            Atualizar
          </GhostButton>
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

      <Field label="Justificativa">
        <input
          className={fieldClass}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
        />
      </Field>

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <PlaceholderCard>
            <p className="text-sm text-ink-300">Nenhum conflito pendente.</p>
          </PlaceholderCard>
        ) : (
          rows.map((c) => (
            <PlaceholderCard key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink-50">
                    {c.entityType} · {c.entityId.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-ink-400">
                    local v{c.localVersion} · servidor v{c.serverVersion} ·{' '}
                    {new Date(c.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <PrimaryButton
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void resolve(c.id, 'KEEP_LOCAL')}
                  >
                    Manter local
                  </PrimaryButton>
                  <GhostButton
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void resolve(c.id, 'KEEP_SERVER')}
                  >
                    Manter servidor
                  </GhostButton>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <pre className="max-h-40 overflow-auto rounded bg-ink-950/80 p-2 text-[10px] text-ink-300">
                  {JSON.stringify(c.localPayload, null, 2)}
                </pre>
                <pre className="max-h-40 overflow-auto rounded bg-ink-950/80 p-2 text-[10px] text-ink-300">
                  {JSON.stringify(c.serverPayload, null, 2)}
                </pre>
              </div>
            </PlaceholderCard>
          ))
        )}
      </div>
    </div>
  );
}
