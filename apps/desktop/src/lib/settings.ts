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
  'cash.autoCloseEnabled': boolean;
  'cash.autoCloseTime': string;
  'sales.commentsEnabled': boolean;
  'sync.apiBaseUrl': string;
  'sync.autoIntervalMinutes': number;
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
  'cash.autoCloseEnabled': true,
  'cash.autoCloseTime': '18:00',
  'sales.commentsEnabled': true,
  'sync.apiBaseUrl': 'http://localhost:3000/api/v1',
  'sync.autoIntervalMinutes': 5,
};

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...loadJson<Partial<AppSettings>>('settings', {}) };
}

export async function updateSettings(patch: Partial<AppSettings>) {
  const next = { ...getSettings(), ...patch };
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
