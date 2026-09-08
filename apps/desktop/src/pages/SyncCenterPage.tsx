import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Field,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  GhostButton,
  fieldClass,
} from '../components/Page';
import { useAppStore } from '../stores/app-store';
import { getSettings, updateSettings } from '../lib/settings';

export function SyncCenterPage() {
  const sync = useAppStore((s) => s.sync);
  const syncBusy = useAppStore((s) => s.syncBusy);
  const syncProgress = useAppStore((s) => s.syncProgress);
  const runSyncNow = useAppStore((s) => s.runSyncNow);
  const refreshSync = useAppStore((s) => s.refreshSync);
  const connectSyncServer = useAppStore((s) => s.connectSyncServer);
  const importFromDevice = useAppStore((s) => s.importFromDevice);

  const [deviceName, setDeviceName] = useState('Escritório');
  const [preferLocal, setPreferLocal] = useState(
    () => getSettings()['sync.preferLocal'] !== false,
  );
  const [authStatus, setAuthStatus] = useState<{
    configured: boolean;
    username: string;
    deviceId: string;
    companyName: string | null;
    pgHost: string;
    pgDatabase: string;
  } | null>(null);
  const [peerDevices, setPeerDevices] = useState<
    Array<{ deviceId: string; deviceName: string; entityCount: number }>
  >([]);
  const [importDeviceId, setImportDeviceId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [importPct, setImportPct] = useState<number | null>(null);

  const refreshAuth = async () => {
    if (!window.ferrogestor?.getSyncAuthStatus) return;
    const s = await window.ferrogestor.getSyncAuthStatus();
    setAuthStatus({
      configured: s.configured,
      username: s.username,
      deviceId: s.deviceId,
      companyName: s.companyName,
      pgHost: s.pgHost,
      pgDatabase: s.pgDatabase,
    });
    if (s.deviceName) setDeviceName(s.deviceName);
  };

  const loadPeers = async () => {
    if (!window.ferrogestor?.listArchiveHistoryGroups) return;
    const res = await window.ferrogestor.listArchiveHistoryGroups();
    if (!res.ok) return;
    const mine = authStatus?.deviceId;
    setPeerDevices(
      res.groups
        .filter((g) => g.deviceId !== mine)
        .map((g) => ({
          deviceId: g.deviceId,
          deviceName: g.deviceName,
          entityCount: g.entityCount,
        })),
    );
  };

  useEffect(() => {
    void refreshSync();
    void refreshAuth();
  }, [refreshSync]);

  useEffect(() => {
    if (authStatus?.configured) void loadPeers();
  }, [authStatus?.configured, authStatus?.deviceId]);

  const exportDiag = () => {
    const blob = new Blob([JSON.stringify(sync, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ferrogestor-sync-diag-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const connect = () => {
    setErr(null);
    setMsg(null);
    setConnecting(true);
    void connectSyncServer({ deviceName }).then((r) => {
      setConnecting(false);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setMsg('Conectado ao PostgreSQL. Pode sincronizar.');
      void refreshAuth();
    });
  };

  const togglePreferLocal = (next: boolean) => {
    setPreferLocal(next);
    updateSettings({ 'sync.preferLocal': next });
  };

  const doImport = () => {
    if (!importDeviceId) {
      setErr('Escolha o PC de origem.');
      return;
    }
    if (
      !window.confirm(
        'Importar dados desse PC para este? Itens locais mais novos não são sobrescritos. Configurações deste PC não mudam.',
      )
    ) {
      return;
    }
    setErr(null);
    setMsg(null);
    setImportPct(0);
    void importFromDevice(importDeviceId, (p) => {
      setImportPct(
        p.total > 0 ? Math.round((p.done / p.total) * 100) : 0,
      );
    }).then((r) => {
      setImportPct(null);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setMsg(
        `Importação ok: ${r.applied} aplicados, ${r.skipped} ignorados (de ${r.count} no servidor). A tela continua respondendo.`,
      );
    });
  };

  return (
    <div>
      <PageHeader
        title="Central de Sincronização"
        subtitle="A fila sobe aos poucos sozinha. Prioridade local mantém este PC como fonte da verdade."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refreshSync()}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-ink-100 hover:border-brand-400/40"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void runSyncNow()}
              disabled={syncBusy}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-400 disabled:opacity-50"
            >
              {syncBusy ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
            <button
              type="button"
              onClick={exportDiag}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-ink-100 hover:border-brand-400/40"
            >
              Exportar diagnóstico
            </button>
          </div>
        }
      />

      {(syncBusy || syncProgress || importPct != null) && (
        <PlaceholderCard className="mb-4 border-brand-500/40">
          <p className="text-sm font-medium text-brand-300">
            {syncProgress?.label ??
              (importPct != null ? `Importando… ${importPct}%` : 'Processando…')}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
              style={{
                width: `${
                  importPct != null
                    ? importPct
                    : syncProgress && syncProgress.total > 0
                      ? Math.round(
                          (syncProgress.done / syncProgress.total) * 100,
                        )
                      : 15
                }%`,
              }}
            />
          </div>
          {syncProgress && syncProgress.total > 0 && (
            <p className="mt-1 text-xs text-ink-400">
              {syncProgress.done} / {syncProgress.total}
            </p>
          )}
        </PlaceholderCard>
      )}

      <PlaceholderCard className="mb-4">
        <h2 className="font-semibold text-ink-50">Banco central</h2>
        <p className="mt-1 text-xs text-ink-400">
          Host e senha ficam em{' '}
          <Link to="/configuracoes" className="text-brand-300 underline">
            Configurações → Banco online
          </Link>
          . Não precisa instalar API separada.
        </p>
        {authStatus?.pgHost ? (
          <p className="mt-2 font-mono text-sm text-ink-100">
            {authStatus.pgHost}/{authStatus.pgDatabase}
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-400">PostgreSQL ainda não configurado.</p>
        )}
        {authStatus?.configured && (
          <p className="mt-2 text-sm text-moss-400">
            Conectado
            {authStatus.companyName ? (
              <>
                {' '}
                · <strong>{authStatus.companyName}</strong>
              </>
            ) : null}
            {authStatus.username ? <> · {authStatus.username}</> : null} · device{' '}
            {authStatus.deviceId.slice(0, 8)}…
          </p>
        )}
        {err && (
          <div className="mt-2 rounded border border-red-500/40 bg-red-950/40 p-2 text-sm text-red-200">
            {err}
          </div>
        )}
        {msg && (
          <div className="mt-2 rounded border border-moss-500/40 bg-moss-700/30 p-2 text-sm text-moss-400">
            {msg}
          </div>
        )}
        <div className="mt-3 max-w-md">
          <Field label="Nome deste PC">
            <input
              className={fieldClass}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-200">
          <input
            type="checkbox"
            checked={preferLocal}
            onChange={(e) => togglePreferLocal(e.target.checked)}
          />
          Priorizar este PC (reenvia em conflito com versão maior)
        </label>
        <div className="mt-3">
          <PrimaryButton type="button" onClick={connect} disabled={connecting}>
            {connecting ? 'Conectando…' : 'Conectar / registrar PC'}
          </PrimaryButton>
        </div>
      </PlaceholderCard>

      <PlaceholderCard className="mb-4">
        <h2 className="font-semibold text-ink-50">Importar de outro PC</h2>
        <p className="mt-1 text-xs text-ink-400">
          Se outro computador usa o mesmo banco, puxe os dados dele para cá.
          Registros locais mais novos não são sobrescritos.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Dispositivo">
            <select
              className={fieldClass}
              value={importDeviceId}
              onChange={(e) => setImportDeviceId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {peerDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.deviceName} ({d.entityCount} regs)
                </option>
              ))}
            </select>
          </Field>
          <GhostButton type="button" onClick={() => void loadPeers()}>
            Atualizar lista
          </GhostButton>
          <PrimaryButton
            type="button"
            disabled={syncBusy || !importDeviceId}
            onClick={doImport}
          >
            {syncBusy && importPct != null
              ? `Importando… ${importPct}%`
              : 'Importar / mesclar'}
          </PrimaryButton>
        </div>
      </PlaceholderCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Conexão</p>
          <p className="mt-1 text-xl font-semibold">
            {sync.online === null
              ? 'Desconhecido'
              : sync.online
                ? 'Online'
                : 'Offline'}
          </p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Última sincronização</p>
          <p className="mt-1 text-sm">
            {sync.lastSyncAt
              ? new Date(sync.lastSyncAt).toLocaleString('pt-BR')
              : 'Nunca'}
          </p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Pendentes</p>
          <p className="mt-1 text-xl font-semibold">{sync.pendingCount}</p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Erros / Conflitos</p>
          <p className="mt-1 text-xl font-semibold">
            {sync.errorCount} / {sync.conflictCount}
          </p>
        </PlaceholderCard>
      </div>

      {sync.lastError && (
        <div className="mt-4 rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {sync.lastError}
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 font-display text-2xl">Histórico recente</h2>
        <PlaceholderCard>
          {sync.history.length === 0 ? (
            <p className="text-sm text-ink-300">
              Nenhuma sincronização registrada ainda.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sync.history.map((h) => (
                <li
                  key={h.at}
                  className="flex flex-wrap gap-3 border-b border-white/10 py-2"
                >
                  <span>{new Date(h.at).toLocaleString('pt-BR')}</span>
                  <span>push {h.pushed}</span>
                  <span>pull {h.pulled}</span>
                  <span>conflitos {h.conflicts}</span>
                  <span>erros {h.errors}</span>
                  <span>{h.success ? 'OK' : 'Falha'}</span>
                </li>
              ))}
            </ul>
          )}
        </PlaceholderCard>
      </div>
    </div>
  );
}
