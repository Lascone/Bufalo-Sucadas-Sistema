import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';

export type AppSettings = {
  'company.displayName': string;
  'company.cnpj': string;
  'company.address': string;
  'company.phone': string;
  'company.logoPath': string;
  'print.paper': string;
  'print.footerMessage': string;
  'print.showQrCode': boolean;
  'cash.requireDifferenceReason': boolean;
  'cash.allowMultipleOpen': boolean;
  'cash.defaultOpeningBalance': number;
  /** manual = operador abre na tela do caixa; auto = abre sozinho ao ligar / após fechar o dia */
  'cash.openMode': 'manual' | 'auto';
  /** auto = fecha no horário e fecha dia anterior ao religar; manual = só fecha na tela */
  'cash.closeMode': 'manual' | 'auto';
  /** @deprecated use cash.closeMode — mantido p/ compat */
  'cash.autoCloseEnabled': boolean;
  'cash.autoCloseTime': string;
  'sales.commentsEnabled': boolean;
  /** Nomes de quem pode receber nas vendas (recebedores) */
  'sales.partners': string[];
  'sync.apiBaseUrl': string;
  'sync.autoIntervalMinutes': number;
  /** Prioriza este PC: em conflito, reenvia com versão maior */
  'sync.preferLocal': boolean;
  /** auto = ajusta ao tamanho da janela; manual = usa ui.scale */
  'ui.scaleMode': 'auto' | 'manual';
  /** Fator de escala da interface (0.7–1.25). Usado quando scaleMode = manual. */
  'ui.scale': number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  'company.displayName': 'Bufalo Sucatas',
  'company.cnpj': '',
  'company.address': '',
  'company.phone': '',
  'company.logoPath': '',
  'print.paper': 'A4',
  'print.footerMessage': 'Obrigado pela preferência — Bufalo Sucatas',
  'print.showQrCode': false,
  'cash.requireDifferenceReason': true,
  'cash.allowMultipleOpen': false,
  'cash.defaultOpeningBalance': 0,
  'cash.openMode': 'manual',
  'cash.closeMode': 'auto',
  'cash.autoCloseEnabled': true,
  'cash.autoCloseTime': '18:00',
  'sales.commentsEnabled': true,
  'sales.partners': ['Keity', 'Steve'],
  'sync.apiBaseUrl': 'http://localhost:3000/api/v1',
  'sync.autoIntervalMinutes': 5,
  'sync.preferLocal': true,
  'ui.scaleMode': 'auto',
  'ui.scale': 1,
};

export function getSettings(): AppSettings {
  const loaded = loadJson<Partial<AppSettings>>('settings', {});
  let partners = Array.isArray(loaded['sales.partners'])
    ? loaded['sales.partners'].map((p) => String(p ?? ''))
    : [...DEFAULT_SETTINGS['sales.partners']];

  // Migração: slots vazios → Keity / Steve
  const allBlank = partners.every((p) => !p.trim());
  if (allBlank || partners.length === 0) {
    partners = [...DEFAULT_SETTINGS['sales.partners']];
  }

  const modeRaw = loaded['ui.scaleMode'];
  const scaleMode =
    modeRaw === 'manual' || modeRaw === 'auto'
      ? modeRaw
      : DEFAULT_SETTINGS['ui.scaleMode'];
  const scaleNum = Number(loaded['ui.scale']);
  const uiScale =
    Number.isFinite(scaleNum) && scaleNum > 0
      ? Math.min(1.25, Math.max(0.7, scaleNum))
      : DEFAULT_SETTINGS['ui.scale'];

  // Migrar autoCloseEnabled → closeMode; openMode padrão manual
  const closeModeRaw = loaded['cash.closeMode'];
  const closeMode: 'manual' | 'auto' =
    closeModeRaw === 'manual' || closeModeRaw === 'auto'
      ? closeModeRaw
      : loaded['cash.autoCloseEnabled'] === false
        ? 'manual'
        : 'auto';
  const openModeRaw = loaded['cash.openMode'];
  const openMode: 'manual' | 'auto' =
    openModeRaw === 'manual' || openModeRaw === 'auto'
      ? openModeRaw
      : DEFAULT_SETTINGS['cash.openMode'];

  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    'sales.partners': partners,
    'ui.scaleMode': scaleMode,
    'ui.scale': uiScale,
    'cash.openMode': openMode,
    'cash.closeMode': closeMode,
    'cash.autoCloseEnabled': closeMode === 'auto',
  };
}

/** Recebedores ativos (nomes preenchidos). */
export function listActivePartners(): string[] {
  return getSettings()
    ['sales.partners'].map((p) => p.trim())
    .filter(Boolean);
}

export async function updateSettings(patch: Partial<AppSettings>) {
  const current = getSettings();
  const next = { ...current, ...patch };
  // Manter closeMode e autoCloseEnabled alinhados
  if (patch['cash.closeMode'] != null) {
    next['cash.autoCloseEnabled'] = patch['cash.closeMode'] === 'auto';
  } else if (patch['cash.autoCloseEnabled'] != null) {
    next['cash.closeMode'] = patch['cash.autoCloseEnabled'] ? 'auto' : 'manual';
  }
  saveJson('settings', next);
  const id = loadJson('settings-entity-id', newId());
  saveJson('settings-entity-id', id);
  await enqueueSyncOp({
    entityType: 'ApplicationSetting',
    entityId: id,
    action: 'UPDATE',
    payload: next as unknown as Record<string, unknown>,
  });
  return next;
}
