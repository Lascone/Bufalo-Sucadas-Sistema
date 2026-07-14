/** Resumo de itens para caixa / financeiro. */
export function formatItemsSummary(
  items: Array<{ materialName: string; weight: number }>,
): string {
  return items
    .map((i) => {
      const w = Number(i.weight);
      const formatted = Number.isFinite(w)
        ? (Math.round(w * 1000) / 1000).toString()
        : String(i.weight);
      return `${i.materialName} ${formatted} kg`;
    })
    .join(' · ');
}

/** Dia civil local (yyyy-mm-dd) a partir de ISO. */
export function localBusinessDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Compra/venda pertence a ESTE caixa?
 * Só pela janela openedAt→closedAt (não pelo dia civil — isso misturava tudo no mesmo dia).
 */
export function inStrictCashWindow(
  iso: string,
  openedAt: string,
  closedAt: string,
): boolean {
  return iso >= openedAt && iso <= closedAt;
}

/** @deprecated Prefer inStrictCashWindow for finance day logs. */
export function inCashWindow(
  iso: string,
  openedAt: string,
  closedAt?: string,
  businessDate?: string,
): boolean {
  if (closedAt) {
    return inStrictCashWindow(iso, openedAt, closedAt);
  }
  if (iso >= openedAt) return true;
  const day = localBusinessDate(iso);
  if (businessDate && day === businessDate) return true;
  if (day === localBusinessDate(openedAt)) return true;
  return false;
}
