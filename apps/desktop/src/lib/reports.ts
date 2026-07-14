import { localBusinessDate } from './item-summary';
import type { PurchaseRecord } from './purchases';
import type { SaleRecord } from './sales';

export type ReportFilterMode = 'range' | 'days';

export type ReportFilterState = {
  mode: ReportFilterMode;
  from: string;
  to: string;
  selectedDays: string[];
};

export function todayIsoDate(): string {
  return localBusinessDate(new Date().toISOString());
}

export function monthStartIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function defaultReportFilter(): ReportFilterState {
  const today = todayIsoDate();
  return {
    mode: 'range',
    from: today,
    to: today,
    selectedDays: [],
  };
}

export function matchesReportFilter(
  isoTimestamp: string,
  filter: ReportFilterState,
): boolean {
  const day = localBusinessDate(isoTimestamp);
  if (filter.mode === 'days') {
    if (filter.selectedDays.length === 0) return false;
    return filter.selectedDays.includes(day);
  }
  if (filter.from && day < filter.from) return false;
  if (filter.to && day > filter.to) return false;
  return true;
}

export function collectAvailableDays(
  timestamps: string[],
): string[] {
  const set = new Set(timestamps.map(localBusinessDate));
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function filterPurchases(
  all: PurchaseRecord[],
  filter: ReportFilterState,
): PurchaseRecord[] {
  return all.filter((p) => matchesReportFilter(p.purchasedAt, filter));
}

export function filterSales(
  all: SaleRecord[],
  filter: ReportFilterState,
): SaleRecord[] {
  return all.filter((s) => matchesReportFilter(s.soldAt, filter));
}

export type MaterialBucket = { name: string; total: number; count: number };

export type PurchaseReportSummary = {
  count: number;
  total: number;
  average: number;
  byMaterial: MaterialBucket[];
  byPayment: Array<{ method: string; total: number; count: number }>;
};

export type SalesReportSummary = {
  count: number;
  total: number;
  average: number;
  byMaterial: MaterialBucket[];
  byPayment: Array<{ method: string; total: number; count: number }>;
  byReceiver: Array<{ name: string; total: number; count: number }>;
};

export type FinalReportSummary = {
  purchases: PurchaseReportSummary;
  sales: SalesReportSummary;
  balance: number;
};

function bumpMaterial(
  map: Map<string, MaterialBucket>,
  name: string,
  amount: number,
) {
  const cur = map.get(name) ?? { name, total: 0, count: 0 };
  cur.total = Math.round((cur.total + amount) * 100) / 100;
  cur.count += 1;
  map.set(name, cur);
}

function bumpKey(
  map: Map<string, { key: string; total: number; count: number }>,
  key: string,
  amount: number,
) {
  const cur = map.get(key) ?? { key, total: 0, count: 0 };
  cur.total = Math.round((cur.total + amount) * 100) / 100;
  cur.count += 1;
  map.set(key, cur);
}

export function sumPurchases(rows: PurchaseRecord[]): PurchaseReportSummary {
  const byMat = new Map<string, MaterialBucket>();
  const byPay = new Map<string, { key: string; total: number; count: number }>();
  let total = 0;
  for (const p of rows) {
    total += p.amountPaid;
    bumpKey(byPay, p.paymentMethod || '—', p.amountPaid);
    if (p.items.length === 0) {
      bumpMaterial(byMat, '—', p.amountPaid);
    } else {
      const share = p.amountPaid / p.items.length;
      for (const i of p.items) {
        bumpMaterial(byMat, i.materialName, i.lineTotal || share);
      }
    }
  }
  total = Math.round(total * 100) / 100;
  return {
    count: rows.length,
    total,
    average: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0,
    byMaterial: [...byMat.values()].sort((a, b) => b.total - a.total),
    byPayment: [...byPay.values()]
      .map((x) => ({ method: x.key, total: x.total, count: x.count }))
      .sort((a, b) => b.total - a.total),
  };
}

export function sumSales(rows: SaleRecord[]): SalesReportSummary {
  const byMat = new Map<string, MaterialBucket>();
  const byPay = new Map<string, { key: string; total: number; count: number }>();
  const byRecv = new Map<string, { key: string; total: number; count: number }>();
  let total = 0;
  for (const s of rows) {
    const amount = s.amountReceived ?? s.netTotal;
    total += amount;
    bumpKey(byPay, s.paymentMethod || '—', amount);
    bumpKey(byRecv, s.receivedBy || '—', amount);
    if (s.items.length === 0) {
      bumpMaterial(byMat, '—', amount);
    } else {
      for (const i of s.items) {
        bumpMaterial(
          byMat,
          i.materialName,
          i.lineTotal || amount / s.items.length,
        );
      }
    }
  }
  total = Math.round(total * 100) / 100;
  return {
    count: rows.length,
    total,
    average: rows.length ? Math.round((total / rows.length) * 100) / 100 : 0,
    byMaterial: [...byMat.values()].sort((a, b) => b.total - a.total),
    byPayment: [...byPay.values()]
      .map((x) => ({ method: x.key, total: x.total, count: x.count }))
      .sort((a, b) => b.total - a.total),
    byReceiver: [...byRecv.values()]
      .map((x) => ({ name: x.key, total: x.total, count: x.count }))
      .sort((a, b) => b.total - a.total),
  };
}

export function buildFinalSummary(
  purchases: PurchaseRecord[],
  sales: SaleRecord[],
): FinalReportSummary {
  const p = sumPurchases(purchases);
  const s = sumSales(sales);
  return {
    purchases: p,
    sales: s,
    balance: Math.round((s.total - p.total) * 100) / 100,
  };
}

export function describeFilter(filter: ReportFilterState): string {
  if (filter.mode === 'days') {
    if (!filter.selectedDays.length) return 'Nenhum dia selecionado';
    return `Dias: ${filter.selectedDays
      .map((d) => d.split('-').reverse().join('/'))
      .join(', ')}`;
  }
  const from = filter.from.split('-').reverse().join('/');
  const to = filter.to.split('-').reverse().join('/');
  return `Período: ${from} → ${to}`;
}
