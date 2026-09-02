import { useEffect, useState, type ReactNode } from 'react';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { getSettings, updateSettings, type AppSettings } from '../lib/settings';
import { importFromLocalStorage, reloadLocalStore } from '../lib/local-store';
import {
  clearPartnerPhoto,
  partnerInitials,
  resolvePartnerPhotoSrc,
  savePartnerPhoto,
} from '../lib/partner-photos';
import { useAppStore } from '../stores/app-store';

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

function PartnerPhotoRow({
  name,
  onNameChange,
  onRemove,
}: {
  name: string;
  onNameChange: (value: string) => void;
  onRemove?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void resolvePartnerPhotoSrc(name).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [name]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-ink-900/40 p-3">
      <label className="cursor-pointer">
        {src ? (
          <img
            src={src}
            alt={name}
            className="h-12 w-12 rounded-full border border-brand-500/40 object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-500/40 bg-ink-800 text-sm font-bold text-brand-300">
            {partnerInitials(name || '?')}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy || !name.trim()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || !name.trim()) return;
            setBusy(true);
            void savePartnerPhoto(name, file)
              .then(() => resolvePartnerPhotoSrc(name))
              .then((url) => setSrc(url))
              .finally(() => setBusy(false));
          }}
        />
      </label>
      <input
        className={`min-w-0 flex-1 ${fieldClass}`}
        value={name}
        placeholder="Nome do recebedor"
        onChange={(e) => onNameChange(e.target.value)}
      />
      {src && (
        <GhostButton
          type="button"
          className="!px-2 !py-1.5 text-xs"
          onClick={() => {
            setBusy(true);
            void clearPartnerPhoto(name)
              .then(() => setSrc(null))
              .finally(() => setBusy(false));
          }}
        >
          Sem foto
        </GhostButton>
      )}
      {onRemove && (
        <GhostButton type="button" className="!px-2 !py-1.5 text-xs" onClick={onRemove}>
          Remover
        </GhostButton>
      )}
    </div>
  );
}

function ServerLoginPanel({ apiBaseUrl }: { apiBaseUrl: string }) {
  const serverLoggedIn = useAppStore((s) => s.serverLoggedIn);
  const serverSession = useAppStore((s) => s.serverSession);
  const loginServer = useAppStore((s) => s.loginServer);
  const logout = useAppStore((s) => s.logout);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('Escritório');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (serverLoggedIn && serverSession) {
    return (
      <div className="rounded-lg border border-moss-500/30 bg-moss-700/10 px-3 py-3 text-sm">
        <p className="text-moss-300">
          Conectado ao servidor como <strong>{serverSession.username}</strong> (
          {serverSession.deviceName})
        </p>
        <GhostButton type="button" className="mt-2 !py-1.5 text-xs" onClick={() => void logout()}>
          Sair do servidor
        </GhostButton>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/40 px-3 py-3">
      <p className="text-xs text-ink-300">
        Login opcional — só necessário para enviar dados ao PostgreSQL.
      </p>
      {error && (
        <p className="mt-2 rounded border border-red-500/40 bg-red-950/40 px-2 py-1 text-xs text-red-200">
          {error}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          className={fieldClass}
          placeholder="Usuário"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className={fieldClass}
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className={`sm:col-span-2 ${fieldClass}`}
          placeholder="Nome deste PC"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
        />
      </div>
      <PrimaryButton
        type="button"
        disabled={loading}
        className="mt-3"
        onClick={() => {
          setError(null);
          setLoading(true);
          void loginServer({
            apiBaseUrl: apiBaseUrl.trim() || 'http://localhost:3000/api/v1',
            username: username.trim(),
            password,
            deviceName: deviceName.trim() || 'PC Sucata',
          })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
        }}
      >
        {loading ? 'Conectando…' : 'Conectar ao servidor'}
      </PrimaryButton>
    </div>
  );
}

export function SettingsPage() {
  const appInfo = useAppStore((s) => s.appInfo);
  const [form, setForm] = useState<AppSettings>(() => getSettings());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle');
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [dataMsg, setDataMsg] = useState<string | null>(null);
  const [dataDiag, setDataDiag] = useState<Awaited<
    ReturnType<NonNullable<typeof window.ferrogestor>['runDataDiagnostic']>
  > | null>(null);
  const [dataBusy, setDataBusy] = useState(false);

  const refreshDataDiag = async () => {
    if (!window.ferrogestor?.runDataDiagnostic) return;
    setDataBusy(true);
    try {
      const diag = await window.ferrogestor.runDataDiagnostic();
      setDataDiag(diag);
    } finally {
      setDataBusy(false);
    }
  };

  useEffect(() => {
    void refreshDataDiag();
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
        setUpdateMsg(v ? `Nova versão ${v} disponível.` : 'Nova versão disponível.');
      }),
      api.onUpdaterEvent('updater:not-available', () => {
        setUpdatePhase('not-available');
        setUpdateMsg('Você já está na versão mais recente.');
      }),
      api.onUpdaterEvent('updater:progress', (p) => {
        setUpdatePhase('downloading');
        const pct =
          p && typeof p === 'object' && 'percent' in p
            ? Number((p as { percent: number }).percent)
            : 0;
        setDownloadPct(Math.round(pct));
        setUpdateMsg(`Baixando… ${Math.round(pct)}%`);
      }),
      api.onUpdaterEvent('updater:downloaded', (info) => {
        const v =
          info && typeof info === 'object' && 'version' in info
            ? String((info as { version: string }).version)
            : '';
        setUpdatePhase('ready');
        setUpdateMsg(
          v
            ? `Versão ${v} baixada. Clique em Instalar e reiniciar.`
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

  const save = () => {
    setSaving(true);
    void updateSettings(form)
      .then(() => {
        setSaved(true);
        setSaving(false);
      })
      .catch(() => setSaving(false));
  };

  const checkUpdates = () => {
    setUpdatePhase('checking');
    setUpdateMsg('Verificando…');
    setDownloadPct(null);
    void window.ferrogestor?.checkForUpdates()?.then((res) => {
      if (res && typeof res === 'object' && 'skipped' in res) {
        setUpdatePhase('dev');
        setUpdateMsg(
          'Modo desenvolvimento: update só funciona no app instalado (.exe), não no pnpm dev.',
        );
      }
    });
  };

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Ajuste empresa, caixa do dia, vendas, impressão e sync. Mudanças entram em vigor na hora."
        actions={
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-moss-400">Salvo</span>}
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar tudo'}
            </PrimaryButton>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Empresa"
          hint="Dados que aparecem nos PDFs de venda e fechamento de caixa."
        >
          <Field label="Nome de exibição">
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
          <Field label="Endereço">
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

        <Section
          title="Caixa do dia"
          hint="Saldo padrão ao abrir, fechamento automático e regras de conferência."
        >
          <Field label="Saldo inicial padrão (R$)">
            <input
              className={fieldClass}
              inputMode="decimal"
              value={String(form['cash.defaultOpeningBalance'])}
              onChange={(e) =>
                setField('cash.defaultOpeningBalance', Number(e.target.value) || 0)
              }
            />
          </Field>
          <Switch
            label="Fechamento automático por horário"
            hint="Se o PC estiver desligado, o fechamento acontece na próxima abertura do sistema."
            checked={form['cash.autoCloseEnabled']}
            onChange={(v) => setField('cash.autoCloseEnabled', v)}
          />
          <Field label="Horário de fechamento automático">
            <input
              className={fieldClass}
              type="time"
              value={form['cash.autoCloseTime']}
              onChange={(e) => setField('cash.autoCloseTime', e.target.value || '18:00')}
              disabled={!form['cash.autoCloseEnabled']}
            />
          </Field>
          <Switch
            label="Exigir justificativa se houver diferença"
            hint="No fechamento manual, obriga explicar quando o saldo contado ≠ esperado."
            checked={form['cash.requireDifferenceReason']}
            onChange={(v) => setField('cash.requireDifferenceReason', v)}
          />
          <Switch
            label="Permitir vários caixas abertos"
            hint="Na operação normalmente fica desligado (um caixa por vez)."
            checked={form['cash.allowMultipleOpen']}
            onChange={(v) => setField('cash.allowMultipleOpen', v)}
          />
        </Section>

        <Section
          title="Recebedores"
          hint="Quem pode receber nas vendas (PIX/dinheiro). Padrão: Keity e Steve — edite, foto de perfil ou adicione mais."
        >
          <Field label="Nomes e fotos dos recebedores">
            <div className="grid gap-3">
              {(form['sales.partners'] ?? ['Keity', 'Steve']).map((name, idx) => (
                <PartnerPhotoRow
                  key={idx}
                  name={name}
                  onNameChange={(value) => {
                    const next = [...(form['sales.partners'] ?? [])];
                    next[idx] = value;
                    setField('sales.partners', next);
                  }}
                  onRemove={
                    (form['sales.partners']?.length ?? 0) > 1
                      ? () => {
                          const next = (form['sales.partners'] ?? []).filter(
                            (_, i) => i !== idx,
                          );
                          setField(
                            'sales.partners',
                            next.length ? next : ['Keity', 'Steve'],
                          );
                        }
                      : undefined
                  }
                />
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
                + Adicionar recebedor
              </GhostButton>
            </div>
          </Field>
          <Switch
            label="Comentários nas vendas"
            hint="Permite anotar observações depois de finalizar."
            checked={form['sales.commentsEnabled']}
            onChange={(v) => setField('sales.commentsEnabled', v)}
          />
        </Section>

        <Section
          title="Financeiro (em breve)"
          hint="Contas a pagar e a receber — estrutura futura. Hoje use o resumo do dia na aba Financeiro."
        >
          <p className="text-sm text-ink-300">
            Compra no caixa vira estoque. Lucro só aparece na venda.
          </p>
        </Section>

        <Section title="Impressão" hint="Formato dos comprovantes em PDF.">
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
          <Field label="Mensagem de rodapé">
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

        <Section
          title="Sincronização com servidor"
          hint="Opcional. O app funciona 100% local; configure só se quiser enviar ao PostgreSQL."
        >
          <Field label="URL da API">
            <input
              className={fieldClass}
              value={form['sync.apiBaseUrl']}
              onChange={(e) => setField('sync.apiBaseUrl', e.target.value)}
            />
          </Field>
          <ServerLoginPanel apiBaseUrl={form['sync.apiBaseUrl'] ?? ''} />
          <Field label="Intervalo de sync automático (minutos)">
            <input
              className={fieldClass}
              inputMode="numeric"
              value={String(form['sync.autoIntervalMinutes'])}
              onChange={(e) =>
                setField('sync.autoIntervalMinutes', Number(e.target.value) || 1)
              }
            />
          </Field>
        </Section>

        <Section
          title="Aplicativo"
          hint="Informações locais, atualização e backup."
        >
          <div className="rounded-lg border border-white/10 bg-ink-900/40 px-3 py-3 text-sm">
            <p>
              <span className="text-ink-300">Nome:</span> {appInfo?.name}
            </p>
            <p className="mt-1">
              <span className="text-ink-300">Versão:</span> {appInfo?.version}
            </p>
            <p className="mt-1 text-xs text-moss-400">
              0.1.4 — dados salvos em arquivo + recuperação automática e diagnóstico.
            </p>
            <p className="mt-1 break-all">
              <span className="text-ink-300">Dados (JSON):</span>{' '}
              {(appInfo as { dataPath?: string })?.dataPath ??
                dataDiag?.storePath ??
                '—'}
            </p>
            <p className="mt-1 break-all">
              <span className="text-ink-300">SQLite (sync):</span> {appInfo?.dbPath ?? '—'}
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
              Verificar atualizações
            </PrimaryButton>
            {updatePhase === 'available' && (
              <PrimaryButton
                type="button"
                onClick={() => {
                  setUpdatePhase('downloading');
                  setUpdateMsg('Iniciando download…');
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
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-ink-900/60 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-400/50"
              onClick={() => void window.ferrogestor?.createBackup('manual')}
            >
              Backup manual
            </button>
          </div>
        </Section>

        <Section
          title="Dados locais e recuperação"
          hint="Se sumiu venda/compra após queda de luz ou reinício, use o diagnóstico abaixo."
        >
          {dataDiag && (
            <div className="rounded-lg border border-white/10 bg-ink-900/40 px-3 py-3 text-sm">
              <p>
                <span className="text-ink-300">Registros ativos:</span>{' '}
                <span className="font-semibold text-brand-300">
                  {dataDiag.currentStats.total}
                </span>
                {dataDiag.currentStats.total === 0 && (
                  <span className="ml-2 text-amber-300">— vazio, tente recuperar abaixo</span>
                )}
              </p>
              <p className="mt-2 break-all text-xs text-ink-400">
                Pasta do app: {dataDiag.userDataDir}
              </p>
              <p className="mt-1 break-all text-xs text-ink-400">
                Backups: {dataDiag.backupDir}
              </p>
            </div>
          )}

          {dataDiag?.warnings.map((w) => (
            <p
              key={w}
              className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
            >
              {w}
            </p>
          ))}

          {dataMsg && (
            <p className="rounded-lg border border-moss-500/30 bg-moss-700/20 px-3 py-2 text-sm text-moss-200">
              {dataMsg}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="button" disabled={dataBusy} onClick={() => void refreshDataDiag()}>
              {dataBusy ? 'Analisando…' : 'Buscar dados perdidos'}
            </PrimaryButton>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-ink-900/60 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-400/50"
              onClick={() => {
                void importFromLocalStorage().then((n) => {
                  setDataMsg(
                    n > 0
                      ? `Importados ${n} registros do navegador interno. Recarregue a página (F5).`
                      : 'Nada encontrado no navegador interno desta instalação.',
                  );
                  void refreshDataDiag();
                });
              }}
            >
              Importar do navegador interno
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-ink-900/60 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-400/50"
              onClick={() =>
                void window.ferrogestor?.backupDataNow()?.then((r) => {
                  setDataMsg(r?.path ? `Backup salvo: ${r.path}` : 'Backup criado.');
                  void refreshDataDiag();
                })
              }
            >
              Backup dos cadastros (JSON)
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-ink-900/60 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-400/50"
              onClick={() => void window.ferrogestor?.openDataFolder('userData')}
            >
              Abrir pasta do app
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-ink-900/60 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-400/50"
              onClick={() => void window.ferrogestor?.openDataFolder('backups')}
            >
              Abrir pasta de backups
            </button>
          </div>

          {dataDiag && dataDiag.candidates.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-ink-900/80 text-ink-300">
                  <tr>
                    <th className="px-2 py-2">Origem</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Registros</th>
                    <th className="px-2 py-2">Tamanho</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {dataDiag.candidates.slice(0, 12).map((c) => (
                    <tr key={c.id} className="border-t border-white/5">
                      <td className="max-w-[12rem] truncate px-2 py-2" title={c.path}>
                        {c.label}
                      </td>
                      <td className="px-2 py-2">{c.kind}</td>
                      <td className="px-2 py-2">{c.totalRecords || '—'}</td>
                      <td className="px-2 py-2">
                        {c.sizeBytes > 0 ? `${Math.round(c.sizeBytes / 1024)} KB` : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {c.kind === 'data-backup' || c.kind === 'app-data' ? (
                          <button
                            type="button"
                            className="text-brand-300 hover:underline"
                            onClick={() => {
                              if (
                                !confirm(
                                  'Restaurar este arquivo substitui os dados atuais. Continuar?',
                                )
                              ) {
                                return;
                              }
                              void window.ferrogestor
                                ?.restoreDataFile(c.path)
                                ?.then((r) => {
                                  if (r?.data) reloadLocalStore(r.data);
                                  setDataMsg(`Restaurado de ${c.path}. Pressione F5.`);
                                  void refreshDataDiag();
                                });
                            }}
                          >
                            Restaurar
                          </button>
                        ) : (
                          <span className="text-ink-500" title={c.hint}>
                            {c.hint.slice(0, 24)}…
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {dataDiag?.tips && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-ink-400">
              {dataDiag.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-6 flex justify-end">
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar tudo'}
        </PrimaryButton>
      </div>
    </div>
  );
}
