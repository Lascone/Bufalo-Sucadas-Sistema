import { getSettings, updateSettings, type AppSettings } from './settings';

export const UI_SCALE_MIN = 0.65;
export const UI_SCALE_MAX = 1.15;
export const UI_SCALE_STEP = 0.05;

/** Layout pensado para ~820px de altura útil (abaixo disso auto encolhe). */
const REF_WIDTH = 1280;
const REF_HEIGHT = 820;

let appliedScale = 1;
const listeners = new Set<(scale: number, mode: AppSettings['ui.scaleMode']) => void>();

export function getAppliedScale(): number {
  return appliedScale;
}

export function clampUiScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, n));
}

export function roundUiScale(n: number): number {
  return Math.round(clampUiScale(n) * 100) / 100;
}

export function formatUiScalePct(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

/** Altura/largura da janela em CSS px equivalentes a 100% (antes do zoom). */
function viewportAt100() {
  const factor = appliedScale || 1;
  const vv = window.visualViewport;
  const h = ((vv?.height ?? window.innerHeight) || REF_HEIGHT) * factor;
  const w = ((vv?.width ?? window.innerWidth) || REF_WIDTH) * factor;
  return { w, h };
}

/**
 * Auto: encolhe em monitores baixos para caber Caixa + rodapé.
 * Nunca passa de 100% no modo auto (crescer estoura a tela).
 */
export function computeAutoScale(): number {
  const { w, h } = viewportAt100();
  const byH = h / REF_HEIGHT;
  const byW = w / REF_WIDTH;
  // Folga para barra do Windows + StatusFooter + Finalizar
  const raw = Math.min(byH, byW) * 0.9;
  return roundUiScale(Math.min(1, raw));
}

export function resolveUiScale(
  mode: AppSettings['ui.scaleMode'],
  manual: number,
): number {
  if (mode === 'auto') return computeAutoScale();
  return roundUiScale(manual);
}

function clearCssZoomArtifacts() {
  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById('root');
  html.style.removeProperty('zoom');
  html.style.removeProperty('width');
  html.style.removeProperty('height');
  if (body) {
    body.style.removeProperty('width');
    body.style.removeProperty('height');
    body.style.removeProperty('zoom');
  }
  if (root) {
    root.style.removeProperty('width');
    root.style.removeProperty('height');
    root.style.removeProperty('zoom');
    root.style.removeProperty('transform');
    root.style.removeProperty('transform-origin');
  }
}

/**
 * Preferência: zoom nativo do Electron (não corta o rodapé).
 * Fallback no browser: CSS zoom com compensação de tamanho.
 */
export function applyUiScale(factor: number): number {
  const s = roundUiScale(factor);
  appliedScale = s;
  const html = document.documentElement;
  html.style.setProperty('--ui-scale', String(s));

  const api = window.ferrogestor;
  if (api?.setZoomFactor) {
    clearCssZoomArtifacts();
    api.setZoomFactor(s);
  } else {
    // Dev no browser sem Electron: compensa o clip do CSS zoom
    (html.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(s);
    if (Math.abs(s - 1) < 0.001) {
      html.style.removeProperty('width');
      html.style.removeProperty('height');
    } else {
      const inv = `${(100 / s).toFixed(4)}%`;
      html.style.width = inv;
      html.style.height = inv;
    }
  }

  const mode = getSettings()['ui.scaleMode'];
  listeners.forEach((fn) => fn(s, mode));
  return s;
}

export function syncUiScaleFromSettings(): number {
  const s = getSettings();
  return applyUiScale(resolveUiScale(s['ui.scaleMode'], s['ui.scale']));
}

export function subscribeUiScale(
  fn: (scale: number, mode: AppSettings['ui.scaleMode']) => void,
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function setUiScaleMode(mode: AppSettings['ui.scaleMode']) {
  const current = getSettings();
  const next = await updateSettings({
    'ui.scaleMode': mode,
    'ui.scale':
      mode === 'manual'
        ? roundUiScale(current['ui.scale'] || appliedScale)
        : current['ui.scale'],
  });
  applyUiScale(resolveUiScale(next['ui.scaleMode'], next['ui.scale']));
  return next;
}

export async function setUiScaleManual(scale: number) {
  const s = roundUiScale(scale);
  const next = await updateSettings({
    'ui.scaleMode': 'manual',
    'ui.scale': s,
  });
  applyUiScale(s);
  return next;
}

export async function nudgeUiScale(delta: number) {
  const base =
    getSettings()['ui.scaleMode'] === 'manual'
      ? getSettings()['ui.scale']
      : appliedScale;
  return setUiScaleManual(base + delta);
}

export function startUiScaleWatcher(): () => void {
  syncUiScaleFromSettings();
  // Reaplica apos layout (status bar / DPI)
  requestAnimationFrame(() => syncUiScaleFromSettings());
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (getSettings()['ui.scaleMode'] === 'auto') {
        syncUiScaleFromSettings();
      }
    }, 80);
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    if (timer) clearTimeout(timer);
  };
}
