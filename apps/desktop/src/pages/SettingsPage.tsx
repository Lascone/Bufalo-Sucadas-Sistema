import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { getSettings, updateSettings, type AppSettings } from '../lib/settings';
import { wipeLocalData } from '../lib/wipe-local-data';
import { exportDataPack, importDataPack } from '../lib/data-pack';
import { importFromLocalStorage, reloadFromDisk } from '../lib/local-store';
import { EMPTY_CENTRAL_CONNECTION, type CentralConnectionConfig } from '../lib/central-config';
import { useAppStore } from '../stores/app-store';
import { syncUiScaleFromSettings } from '../lib/ui-scale';

type TabId = 'empresa' | 'operacao' | 'banco' | 'dados' | 'sistema';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'operacao', label: 'OperaÃ§Ã£o' },
  { id: 'banco', label: 'Banco online' },
  { id: 'dados', label: 'Dados' },
  { id: 'sistema', label: 'Sistema' },
];

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <PlaceholderCard>
      <h3 className="font-display text-2xl tracking-wide text-ink-50">{title}</h3>
      <p className="mt-1 text-sm text-ink-300">{hint}</p>
      <div className="mt-4 grid gap-3">{children}</div>
    </PlaceholderCard>
  );
}

function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-ink-900/40 px-3 py-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-ink-50">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-300">{hint}</span>}
      </span>
    </label>
  );
}

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'dev';

export function SettingsPage() {
  const navigate = useNavigate();
  const appInfo = useAppStore((s) => s.appInfo);
  const [tab, setTab] = useState<TabId>('empresa');
  const [form, setForm] = useState<AppSettings>(() => getSettings());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle');
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [preserveSettingsOnWipe, setPreserveSettingsOnWipe] = useState(true);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeMsg, setWipeMsg] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState<'export' | 'import' | null>(null);
  const [packMsg, setPackMsg] = useState<string | null>(null);
  const [packMsgTone, setPackMsgTone] = useState<'ok' | 'err'>('ok');
  const [importConfirm, setImportConfirm] = useState('');
  const [recoverMsg, setRecoverMsg] = useState<string | null>(null);
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [dataDiag, setDataDiag] = useState<{
    currentStats: { total: number };
    warnings: string[];
    candidates: Array<{
      id: string;
      label: string;
      path: string;
      totalRecords: number;
      hint: string;
    }>;
    backupDir: string;
    dataBackups: Array<{ name: string; path: string; totalRecords: number }>;
  } | null>(null);
  const [db, setDb] = useState<CentralConnectionConfig>({ ...EMPTY_CENTRAL_CONNECTION });
  const [dbSaving, setDbSaving] = useState(false);
  const [dbMsg, setDbMsg] = useState<string | null>(null);
  const [dbMsgTone, setDbMsgTone] = useState<'ok' | 'err'>('ok');
  const [dbBusy, setDbBusy] = useState<'pg' | null>(null);
  const clearOperator = useAppStore((s) => s.clearOperator);

  useEffect(() => {
    void window.ferrogestor?.getCentralConnection?.().then((c) => {
      if (c) setDb(c);
    });
  }, []);

  useEffect(() => {
    const api = window.ferrogestor;
    if (!api?.onUpdaterEvent) return;
    const offs = [
      api.onUpdaterEvent('updater:available', (info) => {
        const v =
          info && typeof info === 'object' && 'version' in info
            ? String((info as { version: string }).version)
            : '';
        setUpdatePhase('available');
        setUpdateMsg(v ? `Nova versÃ£o ${v} disponÃ­vel.` : 'Nova versÃ£o disponÃ­vel.');
      }),
      api.onUpdaterEvent('updater:not-available', () => {
        setUpdatePhase('not-available');
        setUpdateMsg('VocÃª jÃ¡ estÃ¡ na versÃ£o mais recente.');
      }),
      api.onUpdaterEvent('updater:progress', (p) => {
        setUpdatePhase('downloading');
        const pct =
          p && typeof p === 'object' && 'percent' in p
            ? Number((p as { percent: number }).percent)
            : 0;
        setDownloadPct(Math.round(pct));
        setUpdateMsg(`Baixandoâ€¦ ${Math.round(pct)}%`);
      }),
      api.onUpdaterEvent('updater:downloaded', (info) => {
        const v =
          info && typeof info === 'object' && 'version' in info
            ? String((info as { version: string }).version)
            : '';
        setUpdatePhase('ready');
        setUpdateMsg(
          v
            ? `VersÃ£o ${v} baixada. Clique em Instalar e reiniciar.`
            : 'Update baixado. Clique em Instalar e reiniciar.',
        );
      }),
      api.onUpdaterEvent('updater:error', (err) => {
        setUpdatePhase('error');
        setUpdateMsg(typeof err === 'string' ? err : 'Falha ao atualizar.');
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const setField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const setDbField = <K extends keyof CentralConnectionConfig>(
    key: K,
    value: CentralConnectionConfig[K],
  ) => {
    setDb((d) => ({ ...d, [key]: value }));
    setDbMsg(null);
  };

  const save = () => {
    setSaving(true);
    void updateSettings(form)
      .then(() => {
        syncUiScaleFromSettings();
        setSaved(true);
        setSaving(false);
      })
      .catch(() => setSaving(false));
  };

  const saveDb = async () => {
    if (!window.ferrogestor?.saveCentralConnection) {
      setDbMsgTone('err');
      setDbMsg('DisponÃ­vel apenas no app Electron.');
      return;
    }
    setDbSaving(true);
    setDbMsg(null);
    try {
      const result = await window.ferrogestor.saveCentralConnection({
        ...db,
        deviceName: db.deviceName || 'EscritÃ³rio',
      });
      setDb(result.connection);
      await updateSettings({
        'sync.autoIntervalMinutes': form['sync.autoIntervalMinutes'],
        'sync.preferLocal': form['sync.preferLocal'] !== false,
      });
      setDbMsgTone(result.connect.ok ? 'ok' : 'err');
      setDbMsg(
        result.connect.ok
          ? 'Salvo e conectado ao PostgreSQL. Este PC foi registrado.'
          : `Salvo, mas conexÃ£o: ${result.connect.error}`,
      );
    } catch (e) {
      setDbMsgTone('err');
      setDbMsg(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setDbSaving(false);
    }
  };

  const testPg = async () => {
    if (!window.ferrogestor?.testCentralPostgres) return;
    setDbBusy('pg');
    setDbMsg(null);
    const r = await window.ferrogestor.testCentralPostgres(db);
    setDbBusy(null);
    setDbMsgTone(r.ok ? 'ok' : 'err');
    setDbMsg(r.ok ? r.detail : r.error);
  };

  const runWipe = () => {
    if (wipeConfirm.trim().toUpperCase() !== 'ZERAR') return;
    setWiping(true);
    setWipeMsg(null);
    void wipeLocalData({ preserveSettings: preserveSettingsOnWipe })
      .then((r) => {
        const archiveBit = r.archive
          ? ` HistÃ³rico arquivado como ${r.archive.archivedName} (veja Dados antigos).`
          : r.archiveOfflineMessage
            ? ` ${r.archiveOfflineMessage}`
            : '';
        setWipeMsg(
          `Dados apagados (${r.removedKeys.length} chaves` +
            (r.diskCleared.length
              ? `, disco: ${r.diskCleared.join(', ')}`
              : '') +
            ').' +
            archiveBit +
            ' Reiniciandoâ€¦',
        );
        clearOperator();
        setTimeout(() => {
          window.location.reload();
        }, 900);
      })
      .catch((e) => {
        setWiping(false);
        setWipeMsg(
          e instanceof Error ? e.message : 'Falha ao zerar dados locais.',
        );
      });
  };

  const runExportPack = () => {
    setPackBusy('export');
    setPackMsg(null);
    void exportDataPack()
      .then((r) => {
        setPackBusy(null);
        if ('cancelled' in r && r.cancelled) {
          setPackMsgTone('ok');
          setPackMsg('ExportaÃ§Ã£o cancelada.');
          return;
        }
        if (!r.ok) {
          setPackMsgTone('err');
          setPackMsg('error' in r ? r.error : 'Falha ao exportar.');
          return;
        }
        setPackMsgTone('ok');
        setPackMsg(
          `Exportado: ${r.keyCount} tabelas, ${r.mediaCount} arquivo(s) de mÃ­dia.\n${r.path}`,
        );
      })
      .catch((e) => {
        setPackBusy(null);
        setPackMsgTone('err');
        setPackMsg(e instanceof Error ? e.message : 'Falha ao exportar.');
      });
  };

  const runImportPack = () => {
    if (importConfirm.trim().toUpperCase() !== 'IMPORTAR') return;
    setPackBusy('import');
    setPackMsg(null);
    void importDataPack()
      .then((r) => {
        if ('cancelled' in r && r.cancelled) {
          setPackBusy(null);
          setPackMsgTone('ok');
          setPackMsg('ImportaÃ§Ã£o cancelada.');
          return;
        }
        if (!r.ok) {
          setPackBusy(null);
          setPackMsgTone('err');
          setPackMsg('error' in r ? r.error : 'Falha ao importar.');
          return;
        }
        setPackMsgTone('ok');
        setPackMsg(
          `Importado: ${r.writtenKeys.length} chaves, ${r.mediaCount} mÃ­dia(s). Reiniciandoâ€¦`,
        );
        clearOperator();
        setTimeout(() => {
          window.location.reload();
        }, 700);
      })
      .catch((e) => {
        setPackBusy(null);
        setPackMsgTone('err');
        setPackMsg(e instanceof Error ? e.message : 'Falha ao importar.');
      });
  };

  const checkUpdates = () => {
    setUpdatePhase('checking');
    setUpdateMsg('Verificandoâ€¦');
    setDownloadPct(null);
    void window.ferrogestor?.checkForUpdates()?.then((res) => {
      if (res && typeof res === 'object' && 'skipped' in res) {
        setUpdatePhase('dev');
        setUpdateMsg(
          'Modo desenvolvimento: update sÃ³ funciona no app instalado (.exe), nÃ£o no pnpm dev.',
        );
      }
    });
  };

  return (
    <div>
      <PageHeader
        title="ConfiguraÃ§Ãµes"
        subtitle="Organize por abas. Banco online: sÃ³ PostgreSQL â€” o app sincroniza direto, sem API."
        actions={
          tab !== 'banco' ? (
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-moss-400">Salvo</span>}
              <PrimaryButton onClick={save} disabled={saving}>
                {saving ? 'Salvandoâ€¦' : 'Salvar'}
              </PrimaryButton>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={() => void saveDb()} disabled={dbSaving}>
                {dbSaving ? 'Salvandoâ€¦' : 'Testar e salvar'}
              </PrimaryButton>
            </div>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-white/10 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-brand-500 text-ink-950'
                : 'text-ink-200 hover:bg-white/5 hover:text-ink-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'empresa' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Dados da empresa"
            hint="Aparecem nos PDFs de venda e fechamento de caixa."
          >
            <Field label="Nome de exibiÃ§Ã£o">
              <input
                className={fieldClass}
                value={form['company.displayName']}
                onChange={(e) => setField('company.displayName', e.target.value)}
              />
            </Field>
            <Field label="CNPJ">
              <input
                className={fieldClass}
                value={form['company.cnpj']}
                onChange={(e) => setField('company.cnpj', e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </Field>
            <Field label="EndereÃ§o">
              <input
                className={fieldClass}
                value={form['company.address']}
                onChange={(e) => setField('company.address', e.target.value)}
              />
            </Field>
            <Field label="Telefone">
              <input
                className={fieldClass}
                value={form['company.phone']}
                onChange={(e) => setField('company.phone', e.target.value)}
              />
            </Field>
            <Field label="Caminho do logo (opcional)">
              <input
                className={fieldClass}
                value={form['company.logoPath']}
                onChange={(e) => setField('company.logoPath', e.target.value)}
                placeholder="C:\\caminho\\logo.png"
              />
            </Field>
          </Section>
          <Section title="ImpressÃ£o" hint="Formato dos comprovantes em PDF.">
            <Field label="Papel">
              <select
                className={fieldClass}
                value={form['print.paper']}
                onChange={(e) => setField('print.paper', e.target.value)}
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </select>
            </Field>
            <Field label="Mensagem de rodapÃ©">
              <input
                className={fieldClass}
                value={form['print.footerMessage']}
                onChange={(e) => setField('print.footerMessage', e.target.value)}
              />
            </Field>
            <Switch
              label="Mostrar QR Code no PDF"
              checked={form['print.showQrCode']}
              onChange={(v) => setField('print.showQrCode', v)}
            />
          </Section>
        </div>
      )}

      {tab === 'operacao' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Caixa do dia"
            hint="Abertura/fechamento automÃ¡tico ou manual, saldo padrÃ£o e regras."
          >
            <Field label="Abertura do caixa">
              <select
                className={fieldClass}
                value={form['cash.openMode']}
                onChange={(e) =>
                  setField(
                    'cash.openMode',
                    e.target.value === 'auto' ? 'auto' : 'manual',
                  )
                }
              >
                <option value="manual">
                  Manual (padrÃ£o) â€” operador abre na tela do Caixa
                </option>
                <option value="auto">
                  AutomÃ¡tica â€” abre sozinho ao ligar / apÃ³s fechar o dia
                </option>
              </select>
            </Field>
            <Field label="Fechamento do caixa">
              <select
                className={fieldClass}
                value={form['cash.closeMode']}
                onChange={(e) =>
                  setField(
                    'cash.closeMode',
                    e.target.value === 'auto' ? 'auto' : 'manual',
                  )
                }
              >
                <option value="auto">
                  AutomÃ¡tico â€” no horÃ¡rio e ao religar (fecha dia anterior)
                </option>
                <option value="manual">
                  Manual â€” sÃ³ fecha na tela (ainda fecha dia anterior ao religar)
                </option>
              </select>
            </Field>
            <Field label="Saldo inicial padrÃ£o (R$)">
              <input
                className={fieldClass}
                inputMode="decimal"
                value={String(form['cash.defaultOpeningBalance'])}
                onChange={(e) =>
                  setField('cash.defaultOpeningBalance', Number(e.target.value) || 0)
                }
              />
            </Field>
            <Field label="HorÃ¡rio de fechamento automÃ¡tico">
              <input
                className={fieldClass}
                type="time"
                value={form['cash.autoCloseTime']}
                onChange={(e) => setField('cash.autoCloseTime', e.target.value || '18:00')}
                disabled={form['cash.closeMode'] !== 'auto'}
              />
            </Field>
            <p className="text-[11px] text-ink-400">
              Se o PC desligar sem fechar, ao religar o app fecha o caixa do dia
              anterior (saldo esperado) e, se a abertura for automÃ¡tica, abre o
              de hoje.
            </p>
            <Switch
              label="Exigir justificativa se houver diferenÃ§a"
              checked={form['cash.requireDifferenceReason']}
              onChange={(v) => setField('cash.requireDifferenceReason', v)}
            />
            <Switch
              label="Permitir vÃ¡rios caixas abertos"
              checked={form['cash.allowMultipleOpen']}
              onChange={(v) => setField('cash.allowMultipleOpen', v)}
            />
          </Section>
          <Section title="Recebedores" hint="SÃ³cios que recebem nas vendas. Caixa (trocado no gaveteiro) jÃ¡ vem fixo na tela de Vendas.">
            <Field label="Nomes">
              <div className="grid gap-2">
                {(form['sales.partners'] ?? ['Keity', 'Steve']).map((name, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      className={`flex-1 ${fieldClass}`}
                      value={name}
                      placeholder={`Recebedor ${idx + 1}`}
                      onChange={(e) => {
                        const next = [...(form['sales.partners'] ?? [])];
                        next[idx] = e.target.value;
                        setField('sales.partners', next);
                      }}
                    />
                    {(form['sales.partners']?.length ?? 0) > 1 && (
                      <GhostButton
                        type="button"
                        className="!px-2 !py-1.5 text-xs"
                        onClick={() => {
                          const next = (form['sales.partners'] ?? []).filter(
                            (_, i) => i !== idx,
                          );
                          setField(
                            'sales.partners',
                            next.length ? next : ['Keity', 'Steve'],
                          );
                        }}
                      >
                        Remover
                      </GhostButton>
                    )}
                  </div>
                ))}
                <GhostButton
                  type="button"
                  className="!py-1.5 text-xs"
                  onClick={() =>
                    setField('sales.partners', [
                      ...(form['sales.partners'] ?? ['Keity', 'Steve']),
                      '',
                    ])
                  }
                >
                  + Adicionar
                </GhostButton>
              </div>
            </Field>
            <Switch
              label="ComentÃ¡rios nas vendas"
              checked={form['sales.commentsEnabled']}
              onChange={(v) => setField('sales.commentsEnabled', v)}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <GhostButton type="button" className="!py-1.5 text-xs" onClick={() => navigate('/financeiro')}>
                Financeiro
              </GhostButton>
              <GhostButton type="button" className="!py-1.5 text-xs" onClick={() => navigate('/patio')}>
                PÃ¡tio
              </GhostButton>
            </div>
          </Section>
        </div>
      )}

      {tab === 'banco' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="PostgreSQL (central)"
            hint="Preencha uma vez. O app sincroniza direto com o banco â€” sem API separada."
          >
            <Field label="IP ou host">
              <input
                className={fieldClass}
                value={db.host}
                onChange={(e) => setDbField('host', e.target.value)}
                placeholder="ex.: db.seudominio.com"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Porta">
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={String(db.port)}
                  onChange={(e) => setDbField('port', Number(e.target.value) || 5432)}
                />
              </Field>
              <Field label="Database">
                <input
                  className={fieldClass}
                  value={db.database}
                  onChange={(e) => setDbField('database', e.target.value)}
                  placeholder="bufalo_gestor"
                />
              </Field>
            </div>
            <Field label="UsuÃ¡rio">
              <input
                className={fieldClass}
                value={db.user}
                onChange={(e) => setDbField('user', e.target.value)}
                placeholder="bufalo_app"
                autoComplete="off"
              />
            </Field>
            <Field label="Senha">
              <input
                className={fieldClass}
                type="password"
                value={db.password}
                onChange={(e) => setDbField('password', e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Nome deste PC">
              <input
                className={fieldClass}
                value={db.deviceName ?? 'EscritÃ³rio'}
                onChange={(e) => setDbField('deviceName', e.target.value)}
                placeholder="EscritÃ³rio"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                type="button"
                disabled={dbBusy === 'pg'}
                onClick={() => void testPg()}
              >
                {dbBusy === 'pg' ? 'Testandoâ€¦' : 'Testar PostgreSQL'}
              </PrimaryButton>
              <PrimaryButton type="button" disabled={dbSaving} onClick={() => void saveDb()}>
                {dbSaving ? 'Salvandoâ€¦' : 'Testar e salvar'}
              </PrimaryButton>
            </div>
          </Section>

          <Section
            title="SincronizaÃ§Ã£o"
            hint="O app abre offline. Com o banco salvo, a fila sobe sozinha."
          >
            <Field label="Intervalo de sync automÃ¡tico (minutos)">
              <input
                className={fieldClass}
                inputMode="numeric"
                value={String(form['sync.autoIntervalMinutes'])}
                onChange={(e) =>
                  setField('sync.autoIntervalMinutes', Number(e.target.value) || 1)
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={form['sync.preferLocal'] !== false}
                onChange={(e) => setField('sync.preferLocal', e.target.checked)}
              />
              Priorizar este PC na sync (local-first)
            </label>
            <GhostButton type="button" onClick={() => navigate('/sincronizacao')}>
              Abrir Central de Sync
            </GhostButton>
            <p className="text-xs text-ink-400">
              Em outro PC: instale, abra e preencha o mesmo PostgreSQL. O histÃ³rico
              Ã© baixado automaticamente.
            </p>
          </Section>

          {dbMsg && (
            <div
              className={`lg:col-span-2 rounded-lg border px-3 py-2 text-sm ${
                dbMsgTone === 'err'
                  ? 'border-red-500/40 bg-red-950/40 text-red-200'
                  : 'border-moss-500/30 bg-moss-700/20 text-moss-300'
              }`}
            >
              {dbMsg}
            </div>
          )}
        </div>
      )}

      {tab === 'dados' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Transferir (pendrive)"
            hint="Exporta/importa o pacote completo entre PCs sem depender da internet."
          >
            <ol className="list-decimal space-y-0.5 pl-4 text-xs text-ink-300">
              <li>Exportar â†’ salve o .bfgpack no pendrive.</li>
              <li>No outro PC: Importar â†’ digite IMPORTAR.</li>
            </ol>
            <PrimaryButton
              type="button"
              disabled={packBusy != null}
              onClick={runExportPack}
            >
              {packBusy === 'export' ? 'Exportandoâ€¦' : 'Exportar dados'}
            </PrimaryButton>
            <Field label='Digite IMPORTAR para habilitar'>
              <input
                className={fieldClass}
                value={importConfirm}
                onChange={(e) => setImportConfirm(e.target.value)}
                placeholder="IMPORTAR"
                autoComplete="off"
                disabled={packBusy != null}
              />
            </Field>
            <button
              type="button"
              disabled={
                packBusy != null ||
                importConfirm.trim().toUpperCase() !== 'IMPORTAR'
              }
              className="rounded-lg border border-red-500/50 bg-red-900/50 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-800/60 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={runImportPack}
            >
              {packBusy === 'import' ? 'Importandoâ€¦' : 'Importar dadosâ€¦'}
            </button>
            {packMsg && (
              <p
                className={`whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm ${
                  packMsgTone === 'err'
                    ? 'border-red-500/40 bg-red-950/40 text-red-200'
                    : 'border-moss-500/30 bg-moss-700/20 text-moss-300'
                }`}
              >
                {packMsg}
              </p>
            )}
          </Section>

          <Section
            title="Recuperar dados"
            hint="Se o notebook desligou e voltou vazio, tente recuperar antes de zerar."
          >
            <p className="text-xs text-ink-400">
              Backups automáticos a cada 12 horas (máx. 10). Pasta:{' '}
              {dataDiag?.backupDir ?? '%APPDATA%\\Bufalo Sucata Gestor\\backups'}
            </p>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                type="button"
                disabled={recoverBusy}
                onClick={() => {
                  setRecoverBusy(true);
                  setRecoverMsg(null);
                  void window.ferrogestor
                    ?.runDataDiagnostic?.()
                    .then((d) => {
                      setDataDiag(d as typeof dataDiag);
                      const diag = d as typeof dataDiag;
                      setRecoverMsg(
                        diag?.warnings?.length
                          ? diag.warnings.join(' ')
                          : `Cadastros atuais: ${diag?.currentStats?.total ?? 0}`,
                      );
                    })
                    .catch((e) =>
                      setRecoverMsg(e instanceof Error ? e.message : String(e)),
                    )
                    .finally(() => setRecoverBusy(false));
                }}
              >
                {recoverBusy ? 'Analisando…' : 'Diagnosticar este PC'}
              </PrimaryButton>
              <GhostButton
                type="button"
                disabled={recoverBusy}
                onClick={() => {
                  setRecoverBusy(true);
                  void importFromLocalStorage()
                    .then((n) => {
                      setRecoverMsg(
                        n > 0
                          ? `Importados ${n} registros do navegador interno.`
                          : 'Nada encontrado no navegador interno.',
                      );
                      window.location.reload();
                    })
                    .finally(() => setRecoverBusy(false));
                }}
              >
                Importar do navegador interno
              </GhostButton>
              <GhostButton
                type="button"
                disabled={recoverBusy}
                onClick={() => void window.ferrogestor?.openDataFolder('backups')}
              >
                Abrir pasta de backups
              </GhostButton>
            </div>
            {recoverMsg && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
                {recoverMsg}
              </p>
            )}
            {dataDiag?.candidates && dataDiag.candidates.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                {dataDiag.candidates.slice(0, 12).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded border border-white/10 px-2 py-1"
                  >
                    <span className="min-w-0 truncate">
                      {c.label} · {c.hint} ({c.totalRecords || '—'} reg.)
                    </span>
                    {c.totalRecords > 0 && c.path.endsWith('.json') ? (
                      <GhostButton
                        type="button"
                        className="!px-2 !py-1 text-[10px]"
                        onClick={() => {
                          setRecoverBusy(true);
                          void window.ferrogestor
                            ?.restoreDataFile?.(c.path)
                            .then(() => reloadFromDisk())
                            .then((n) => {
                              setRecoverMsg(`Restaurado: ${n} registros.`);
                              window.location.reload();
                            })
                            .catch((e) =>
                              setRecoverMsg(
                                e instanceof Error ? e.message : String(e),
                              ),
                            )
                            .finally(() => setRecoverBusy(false));
                        }}
                      >
                        Restaurar
                      </GhostButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Zerar dados locais"
            hint="Com PostgreSQL online: arquiva o período, renomeia o PC antigo (ex. Escritório_01) e limpa o local. O histórico fica em Dados antigos."
          >
            <p className="text-[11px] text-ink-400">
              Use quando quiser comeÃ§ar limpo neste PC. Compras/vendas/caixa
              antigos continuam no servidor e podem ser consultados na aba{' '}
              <strong className="text-ink-200">Dados antigos</strong> (sÃ³
              leitura + PDF).
            </p>
            <Switch
              label="Manter configuraÃ§Ãµes da empresa"
              checked={preserveSettingsOnWipe}
              onChange={setPreserveSettingsOnWipe}
            />
            <Field label='Digite ZERAR para confirmar'>
              <input
                className={fieldClass}
                value={wipeConfirm}
                onChange={(e) => setWipeConfirm(e.target.value)}
                placeholder="ZERAR"
                autoComplete="off"
                disabled={wiping}
              />
            </Field>
            {wipeMsg && (
              <p className="rounded-lg border border-white/10 bg-ink-900/50 px-3 py-2 text-sm text-ink-100">
                {wipeMsg}
              </p>
            )}
            <button
              type="button"
              disabled={wiping || wipeConfirm.trim().toUpperCase() !== 'ZERAR'}
              className="rounded-lg border border-red-500/50 bg-red-900/50 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-800/60 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={runWipe}
            >
              {wiping ? 'Zerandoâ€¦' : 'Zerar todos os dados locais'}
            </button>
          </Section>
        </div>
      )}

      {tab === 'sistema' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Tela / escala"
            hint="Em monitores pequenos reduz a interface."
          >
            <Field label="Modo">
              <select
                className={fieldClass}
                value={form['ui.scaleMode']}
                onChange={(e) =>
                  setField(
                    'ui.scaleMode',
                    e.target.value === 'manual' ? 'manual' : 'auto',
                  )
                }
              >
                <option value="auto">AutomÃ¡tico (recomendado)</option>
                <option value="manual">Manual</option>
              </select>
            </Field>
            <Field label="Escala">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="range"
                  min={70}
                  max={125}
                  step={5}
                  disabled={form['ui.scaleMode'] === 'auto'}
                  className="min-w-[12rem] flex-1 accent-brand-500 disabled:opacity-40"
                  value={Math.round(form['ui.scale'] * 100)}
                  onChange={(e) => setField('ui.scale', Number(e.target.value) / 100)}
                />
                <span className="w-12 text-sm font-medium text-ink-50">
                  {Math.round(form['ui.scale'] * 100)}%
                </span>
              </div>
            </Field>
          </Section>

          <Section title="Aplicativo" hint="VersÃ£o, atualizaÃ§Ã£o e backup tÃ©cnico.">
            <div className="rounded-lg border border-white/10 bg-ink-900/40 px-3 py-3 text-sm">
              <p>
                <span className="text-ink-300">Nome:</span> {appInfo?.name}
              </p>
              <p className="mt-1">
                <span className="text-ink-300">VersÃ£o:</span> {appInfo?.version}
              </p>
              <p className="mt-1 break-all text-xs">
                <span className="text-ink-300">SQLite:</span> {appInfo?.dbPath ?? 'â€”'}
              </p>
            </div>
            {updateMsg && (
              <p
                className={`rounded-lg border px-3 py-2 text-sm ${
                  updatePhase === 'error'
                    ? 'border-red-500/40 bg-red-950/40 text-red-200'
                    : 'border-moss-500/30 bg-moss-700/20 text-moss-300'
                }`}
              >
                {updateMsg}
                {updatePhase === 'downloading' && downloadPct != null
                  ? ` (${downloadPct}%)`
                  : ''}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="button" onClick={checkUpdates}>
                Verificar atualizaÃ§Ãµes
              </PrimaryButton>
              {updatePhase === 'available' && (
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    setUpdatePhase('downloading');
                    setUpdateMsg('Iniciando downloadâ€¦');
                    void window.ferrogestor?.downloadUpdate();
                  }}
                >
                  Baixar update
                </PrimaryButton>
              )}
              {updatePhase === 'ready' && (
                <PrimaryButton
                  type="button"
                  onClick={() => void window.ferrogestor?.installUpdate()}
                >
                  Instalar e reiniciar
                </PrimaryButton>
              )}
              <GhostButton
                type="button"
                onClick={() => void window.ferrogestor?.createBackup('manual')}
              >
                Backup manual
              </GhostButton>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
