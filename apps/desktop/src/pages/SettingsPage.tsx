import { useState, type ReactNode } from 'react';
import {
  Field,
  GhostButton,
  PageHeader,
  PlaceholderCard,
  PrimaryButton,
  fieldClass,
} from '../components/Page';
import { getSettings, updateSettings, type AppSettings } from '../lib/settings';
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

export function SettingsPage() {
  const appInfo = useAppStore((s) => s.appInfo);
  const [form, setForm] = useState<AppSettings>(() => getSettings());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

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
          title="Vendas"
          hint="Sócios que recebem nas vendas e opções de comentários."
        >
          <Field label="Sócios (quem pode receber)">
            <div className="grid gap-2">
              {(form['sales.partners'] ?? ['', '']).map((name, idx) => (
                <input
                  key={idx}
                  className={fieldClass}
                  value={name}
                  placeholder={idx === 0 ? 'Sócio 1' : idx === 1 ? 'Sócio 2' : `Sócio ${idx + 1}`}
                  onChange={(e) => {
                    const next = [...(form['sales.partners'] ?? ['', ''])];
                    next[idx] = e.target.value;
                    setField('sales.partners', next);
                  }}
                />
              ))}
              <GhostButton
                type="button"
                className="!py-1.5 text-xs"
                onClick={() =>
                  setField('sales.partners', [
                    ...(form['sales.partners'] ?? ['', '']),
                    '',
                  ])
                }
              >
                + Outro nome
              </GhostButton>
            </div>
          </Field>
          <Switch
            label="Comentários nas vendas"
            hint="Permite anotar conversas/observações depois de finalizar."
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
          title="Sincronização"
          hint="Ligação com o servidor central (quando online)."
        >
          <Field label="URL da API">
            <input
              className={fieldClass}
              value={form['sync.apiBaseUrl']}
              onChange={(e) => setField('sync.apiBaseUrl', e.target.value)}
            />
          </Field>
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
            <p className="mt-1 break-all">
              <span className="text-ink-300">SQLite:</span> {appInfo?.dbPath ?? '—'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              type="button"
              onClick={() => void window.ferrogestor?.checkForUpdates()}
            >
              Verificar atualizações
            </PrimaryButton>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-ink-900/60 px-4 py-2.5 text-sm font-medium text-ink-50 transition hover:border-brand-400/50"
              onClick={() => void window.ferrogestor?.createBackup('manual')}
            >
              Backup manual
            </button>
          </div>
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
