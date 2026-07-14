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

/** Filtra registros cujo timestamp cai no período do caixa (ou mesmo dia civil). */
export function inCashWindow(
  iso: string,
  openedAt: string,
  closedAt?: string,
): boolean {
  if (iso >= openedAt && (!closedAt || iso <= closedAt)) return true;
  const day = (s: string) => s.slice(0, 10);
  if (closedAt && day(iso) === day(closedAt)) return true;
  if (!closedAt && day(iso) === day(openedAt)) return true;
  return false;
}
