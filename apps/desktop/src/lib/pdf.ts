/// <reference path="./pdf-shims.d.ts" />
import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { getSettings } from './settings';
import type { CashRegisterRecord } from './cash';
import type { SaleRecord } from './sales';
import { calcExpected } from './cash';

const pdf = pdfMake as typeof pdfMake & {
  vfs: unknown;
  createPdf: (doc: unknown) => {
    download: (name: string) => void;
    getBase64: (cb: (data: string) => void) => void;
  };
};

const fontModule = pdfFonts as {
  pdfMake?: { vfs: unknown };
  default?: { pdfMake?: { vfs: unknown } };
};
pdf.vfs = fontModule.pdfMake?.vfs ?? fontModule.default?.pdfMake?.vfs ?? {};

function companyHeader() {
  const s = getSettings();
  return [
    { text: s['company.displayName'], style: 'title' },
    s['company.cnpj'] ? { text: `CNPJ: ${s['company.cnpj']}`, style: 'meta' } : null,
    s['company.address'] ? { text: s['company.address'], style: 'meta' } : null,
    s['company.phone'] ? { text: `Tel: ${s['company.phone']}`, style: 'meta' } : null,
    { text: ' ', margin: [0, 8, 0, 8] },
  ].filter(Boolean);
}

function footer() {
  return getSettings()['print.footerMessage'] || '';
}

const styles = {
  title: { fontSize: 18, bold: true, color: '#2a4a30' },
  heading: {
    fontSize: 14,
    bold: true,
    margin: [0, 10, 0, 6] as [number, number, number, number],
  },
  meta: { fontSize: 10, color: '#3a4650' },
  tableHeader: { bold: true, fillColor: '#e4ebe3' },
};

export type WhatsAppShareResult = {
  ok: true;
  fullPath: string;
  whatsapp: 'desktop' | 'protocol' | 'web';
  hint: string;
};

function pdfBase64(doc: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      pdf.createPdf(doc).getBase64((data: string) => resolve(data));
    } catch (e) {
      reject(e);
    }
  });
}

async function sharePdfDoc(
  doc: unknown,
  fileName: string,
  caption?: string,
): Promise<WhatsAppShareResult> {
  const base64 = await pdfBase64(doc);
  if (window.ferrogestor?.sharePdfWhatsApp) {
    return window.ferrogestor.sharePdfWhatsApp({ fileName, base64, caption });
  }
  pdf.createPdf(doc).download(fileName);
  window.open('https://web.whatsapp.com/', '_blank', 'noopener,noreferrer');
  return {
    ok: true,
    fullPath: fileName,
    whatsapp: 'web',
    hint: 'PDF baixado. Anexe na conversa do WhatsApp Web.',
  };
}

function buildSaleDoc(sale: SaleRecord) {
  const items = sale.items ?? [];
  const amountReceived = sale.amountReceived ?? sale.netTotal;
  const methodLabel = sale.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro';
  const materialNames = items.map((i) => i.materialName).join(', ') || '—';
  const lotSale = sale.lotSale ?? items.every((i) => !i.weight);
  return {
    pageSize: getSettings()['print.paper'] || 'A4',
    content: [
      ...companyHeader(),
      { text: 'Comprovante de Venda', style: 'heading' },
      { text: `Nº ${sale.documentNumber}` },
      { text: `Data: ${new Date(sale.soldAt).toLocaleString('pt-BR')}` },
      { text: `Empresa: ${sale.customerName || '—'}` },
      { text: `Material: ${materialNames}` },
      { text: `Forma: ${methodLabel}` },
      { text: `Recebido por: ${sale.receivedBy || '—'}` },
      !lotSale && items.length
        ? {
            table: {
              widths: ['*', 'auto', 'auto', 'auto'],
              body: [
                [
                  { text: 'Material', style: 'tableHeader' },
                  { text: 'Peso (kg)', style: 'tableHeader' },
                  { text: 'R$/kg', style: 'tableHeader' },
                  { text: 'Total', style: 'tableHeader' },
                ],
                ...items.map((i) => [
                  i.materialName,
                  String(i.weight),
                  i.unitPrice.toFixed(2),
                  `R$ ${i.lineTotal.toFixed(2)}`,
                ]),
              ],
            },
            margin: [0, 10, 0, 8] as [number, number, number, number],
          }
        : null,
      sale.discountAmount > 0
        ? {
            text: `Desconto: R$ ${sale.discountAmount.toFixed(2)}${
              sale.discountReason ? ` (${sale.discountReason})` : ''
            }`,
          }
        : null,
      {
        text: `Valor recebido: R$ ${amountReceived.toFixed(2)}`,
        margin: [0, 8, 0, 8] as [number, number, number, number],
      },
      sale.notes ? { text: `Observações: ${sale.notes}` } : null,
      (sale.comments?.length ?? 0) ? { text: 'Comentários', style: 'heading' } : null,
      ...(sale.comments ?? []).map((c) => ({
        text: `${new Date(c.createdAt).toLocaleString('pt-BR')} — ${c.authorName}: ${c.body}`,
        style: 'meta',
        margin: [0, 2, 0, 2] as [number, number, number, number],
      })),
      {
        text: footer(),
        style: 'meta',
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ].filter(Boolean),
    styles,
  };
}

export function downloadSalePdf(sale: SaleRecord) {
  pdf
    .createPdf(buildSaleDoc(sale))
    .download(`venda-${sale.documentNumber}.pdf`);
}

export function shareSalePdfWhatsApp(sale: SaleRecord) {
  return sharePdfDoc(
    buildSaleDoc(sale),
    `venda-${sale.documentNumber}.pdf`,
    `Venda ${sale.documentNumber} — R$ ${(sale.amountReceived ?? sale.netTotal).toFixed(2)}`,
  );
}

function buildCashCloseDoc(cash: CashRegisterRecord) {
  const expected = cash.expectedBalance ?? calcExpected(cash);
  return {
    pageSize: getSettings()['print.paper'] || 'A4',
    content: [
      ...companyHeader(),
      { text: 'Fechamento de Caixa', style: 'heading' },
      { text: `Aberto em: ${new Date(cash.openedAt).toLocaleString('pt-BR')}` },
      {
        text: `Fechado em: ${cash.closedAt ? new Date(cash.closedAt).toLocaleString('pt-BR') : '—'}`,
      },
      { text: `Operador: ${cash.openedBy}` },
      { text: `Saldo inicial: R$ ${cash.openingBalance.toFixed(2)}` },
      { text: `Saldo esperado: R$ ${expected.toFixed(2)}` },
      { text: `Saldo informado: R$ ${(cash.informedBalance ?? 0).toFixed(2)}` },
      { text: `Diferença: R$ ${(cash.difference ?? 0).toFixed(2)}` },
      cash.differenceReason
        ? { text: `Justificativa: ${cash.differenceReason}` }
        : null,
      { text: 'Movimentos', style: 'heading' },
      {
        table: {
          widths: ['*', '*', 'auto', '*'],
          body: [
            [
              { text: 'Data', style: 'tableHeader' },
              { text: 'Tipo', style: 'tableHeader' },
              { text: 'Valor', style: 'tableHeader' },
              { text: 'Descrição', style: 'tableHeader' },
            ],
            ...cash.movements.map((m) => [
              new Date(m.movedAt).toLocaleString('pt-BR'),
              m.movementType,
              `R$ ${m.amount.toFixed(2)}`,
              m.description,
            ]),
          ],
        },
      },
      { text: footer(), style: 'meta', margin: [0, 24, 0, 0] },
    ].filter(Boolean),
    styles,
  };
}

export function downloadCashClosePdf(cash: CashRegisterRecord) {
  pdf
    .createPdf(buildCashCloseDoc(cash))
    .download(`caixa-${cash.id.slice(0, 8)}.pdf`);
}

export function shareCashClosePdfWhatsApp(cash: CashRegisterRecord) {
  return sharePdfDoc(
    buildCashCloseDoc(cash),
    `caixa-${cash.id.slice(0, 8)}.pdf`,
    'Fechamento de caixa',
  );
}

type FinanceDayPdfInput = {
  businessDate: string;
  openedAt: string;
  closedAt: string;
  openedBy: string;
  openingBalance: number;
  expectedBalance: number;
  informedBalance: number;
  difference: number;
  differenceReason: string;
  notes: string;
  totals: {
    vendasRecebidas: number;
    despesas: number;
    sangrias: number;
    suprimentos: number;
    entradas: number;
    saidas: number;
    comprasPagas: number;
  };
  movements: Array<{
    movedAt: string;
    movementType: string;
    amount: number;
    description: string;
  }>;
};

function buildFinanceDayDoc(day: FinanceDayPdfInput) {
  return {
    pageSize: getSettings()['print.paper'] || 'A4',
    content: [
      ...companyHeader(),
      { text: 'Resumo Financeiro do Dia', style: 'heading' },
      { text: `Data: ${day.businessDate}` },
      {
        text: `Aberto: ${new Date(day.openedAt).toLocaleString('pt-BR')} — Fechado: ${new Date(day.closedAt).toLocaleString('pt-BR')}`,
      },
      { text: `Operador: ${day.openedBy}` },
      { text: 'Totais', style: 'heading' },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: 'Saldo inicial', style: 'tableHeader' },
              `R$ ${day.openingBalance.toFixed(2)}`,
            ],
            ['Vendas (entrou)', `R$ ${day.totals.vendasRecebidas.toFixed(2)}`],
            ['Despesas', `R$ ${day.totals.despesas.toFixed(2)}`],
            ['Sangrias', `R$ ${day.totals.sangrias.toFixed(2)}`],
            ['Suprimentos', `R$ ${day.totals.suprimentos.toFixed(2)}`],
            ['Entradas', `R$ ${day.totals.entradas.toFixed(2)}`],
            ['Saídas', `R$ ${day.totals.saidas.toFixed(2)}`],
            ['Compras (saiu)', `R$ ${day.totals.comprasPagas.toFixed(2)}`],
            ['Saldo esperado', `R$ ${day.expectedBalance.toFixed(2)}`],
            ['Saldo informado', `R$ ${day.informedBalance.toFixed(2)}`],
            ['Diferença', `R$ ${day.difference.toFixed(2)}`],
          ],
        },
      },
      day.differenceReason
        ? { text: `Justificativa: ${day.differenceReason}`, margin: [0, 8, 0, 0] }
        : null,
      day.notes ? { text: `Observações: ${day.notes}` } : null,
      { text: 'Movimentos', style: 'heading' },
      {
        table: {
          widths: ['*', '*', 'auto', '*'],
          body: [
            [
              { text: 'Data/hora', style: 'tableHeader' },
              { text: 'Tipo', style: 'tableHeader' },
              { text: 'Valor', style: 'tableHeader' },
              { text: 'Descrição', style: 'tableHeader' },
            ],
            ...day.movements.map((m) => [
              new Date(m.movedAt).toLocaleString('pt-BR'),
              m.movementType,
              `R$ ${m.amount.toFixed(2)}`,
              m.description,
            ]),
          ],
        },
      },
      { text: footer(), style: 'meta', margin: [0, 24, 0, 0] },
    ].filter(Boolean),
    styles,
  };
}

export function downloadFinanceDayPdf(day: FinanceDayPdfInput) {
  pdf
    .createPdf(buildFinanceDayDoc(day))
    .download(`financeiro-${day.businessDate}.pdf`);
}

export function shareFinanceDayPdfWhatsApp(day: FinanceDayPdfInput) {
  return sharePdfDoc(
    buildFinanceDayDoc(day),
    `financeiro-${day.businessDate}.pdf`,
    `Financeiro ${day.businessDate}`,
  );
}

export function exportFinanceDayCsv(day: {
  businessDate: string;
  movements: Array<{
    movedAt: string;
    movementType: string;
    amount: number;
    description: string;
  }>;
  openingBalance: number;
  expectedBalance: number;
  informedBalance: number;
  difference: number;
}) {
  const lines = [
    'campo;valor',
    `data;${day.businessDate}`,
    `saldo_inicial;${day.openingBalance.toFixed(2)}`,
    `saldo_esperado;${day.expectedBalance.toFixed(2)}`,
    `saldo_informado;${day.informedBalance.toFixed(2)}`,
    `diferenca;${day.difference.toFixed(2)}`,
    '',
    'data_hora;tipo;valor;descricao',
    ...day.movements.map(
      (m) =>
        `${new Date(m.movedAt).toLocaleString('pt-BR')};${m.movementType};${m.amount.toFixed(2)};"${m.description.replace(/"/g, '""')}"`,
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financeiro-${day.businessDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type PurchasesReportInput = {
  title: string;
  filterLabel: string;
  total: number;
  count: number;
  rows: Array<{
    at: string;
    documentNumber: string;
    supplier: string;
    materials: string;
    amount: number;
    payment: string;
  }>;
};

function buildPurchasesReportDoc(input: PurchasesReportInput) {
  return {
    pageSize: getSettings()['print.paper'] || 'A4',
    content: [
      ...companyHeader(),
      { text: input.title, style: 'heading' },
      { text: input.filterLabel, style: 'meta' },
      {
        text: `Lançamentos: ${input.count} · Total: R$ ${input.total.toFixed(2)}`,
        margin: [0, 8, 0, 8] as [number, number, number, number],
      },
      {
        table: {
          widths: ['auto', 'auto', '*', 'auto', 'auto'],
          body: [
            [
              { text: 'Quando', style: 'tableHeader' },
              { text: 'Doc', style: 'tableHeader' },
              { text: 'Pessoa / Materiais', style: 'tableHeader' },
              { text: 'Pago', style: 'tableHeader' },
              { text: 'Forma', style: 'tableHeader' },
            ],
            ...input.rows.map((r) => [
              r.at,
              r.documentNumber,
              `${r.supplier}\n${r.materials}`,
              `R$ ${r.amount.toFixed(2)}`,
              r.payment,
            ]),
          ],
        },
      },
      {
        text: footer(),
        style: 'meta',
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ],
    styles,
  };
}

export function downloadPurchasesReportPdf(input: PurchasesReportInput) {
  pdf.createPdf(buildPurchasesReportDoc(input)).download(`relatorio-compras.pdf`);
}

export function sharePurchasesReportPdfWhatsApp(input: PurchasesReportInput) {
  return sharePdfDoc(
    buildPurchasesReportDoc(input),
    'relatorio-compras.pdf',
    `Relatório de compras · ${input.filterLabel}`,
  );
}

type SalesReportInput = {
  title: string;
  filterLabel: string;
  total: number;
  count: number;
  rows: Array<{
    at: string;
    documentNumber: string;
    customer: string;
    materials: string;
    amount: number;
    payment: string;
    receivedBy: string;
  }>;
};

function buildSalesReportDoc(input: SalesReportInput) {
  return {
    pageSize: getSettings()['print.paper'] || 'A4',
    content: [
      ...companyHeader(),
      { text: input.title, style: 'heading' },
      { text: input.filterLabel, style: 'meta' },
      {
        text: `Lançamentos: ${input.count} · Total: R$ ${input.total.toFixed(2)}`,
        margin: [0, 8, 0, 8] as [number, number, number, number],
      },
      {
        table: {
          widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Quando', style: 'tableHeader' },
              { text: 'Doc', style: 'tableHeader' },
              { text: 'Empresa / Materiais', style: 'tableHeader' },
              { text: 'Valor', style: 'tableHeader' },
              { text: 'Forma', style: 'tableHeader' },
              { text: 'Recebedor', style: 'tableHeader' },
            ],
            ...input.rows.map((r) => [
              r.at,
              r.documentNumber,
              `${r.customer}\n${r.materials}`,
              `R$ ${r.amount.toFixed(2)}`,
              r.payment,
              r.receivedBy,
            ]),
          ],
        },
      },
      {
        text: footer(),
        style: 'meta',
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ],
    styles,
  };
}

export function downloadSalesReportPdf(input: SalesReportInput) {
  pdf.createPdf(buildSalesReportDoc(input)).download(`relatorio-vendas.pdf`);
}

export function shareSalesReportPdfWhatsApp(input: SalesReportInput) {
  return sharePdfDoc(
    buildSalesReportDoc(input),
    'relatorio-vendas.pdf',
    `Relatório de vendas · ${input.filterLabel}`,
  );
}

type FinalReportInput = {
  filterLabel: string;
  purchasesTotal: number;
  salesTotal: number;
  balance: number;
  purchaseCount: number;
  saleCount: number;
};

function buildFinalReportDoc(input: FinalReportInput) {
  return {
    pageSize: getSettings()['print.paper'] || 'A4',
    content: [
      ...companyHeader(),
      { text: 'Relatório final — Compras × Vendas', style: 'heading' },
      { text: input.filterLabel, style: 'meta' },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: 'Item', style: 'tableHeader' },
              { text: 'Valor', style: 'tableHeader' },
            ],
            [`Compras (${input.purchaseCount})`, `R$ ${input.purchasesTotal.toFixed(2)}`],
            [`Vendas (${input.saleCount})`, `R$ ${input.salesTotal.toFixed(2)}`],
            [
              { text: 'Saldo operacional (vendas − compras)', bold: true },
              `R$ ${input.balance.toFixed(2)}`,
            ],
          ],
        },
        margin: [0, 12, 0, 0] as [number, number, number, number],
      },
      {
        text: footer(),
        style: 'meta',
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ],
    styles,
  };
}

export function downloadFinalReportPdf(input: FinalReportInput) {
  pdf.createPdf(buildFinalReportDoc(input)).download(`relatorio-final.pdf`);
}

export function shareFinalReportPdfWhatsApp(input: FinalReportInput) {
  return sharePdfDoc(
    buildFinalReportDoc(input),
    'relatorio-final.pdf',
    `Relatório final · ${input.filterLabel}`,
  );
}

export function exportPurchasesReportCsv(
  rows: Array<{
    at: string;
    documentNumber: string;
    supplier: string;
    materials: string;
    amount: number;
    payment: string;
  }>,
) {
  const lines = [
    'quando;documento;pessoa;materiais;valor;forma',
    ...rows.map(
      (r) =>
        `${r.at};${r.documentNumber};"${r.supplier.replace(/"/g, '""')}";"${r.materials.replace(/"/g, '""')}";${r.amount.toFixed(2)};${r.payment}`,
    ),
  ];
  downloadBlob('relatorio-compras.csv', lines.join('\n'), 'text/csv;charset=utf-8;');
}

export function exportSalesReportCsv(
  rows: Array<{
    at: string;
    documentNumber: string;
    customer: string;
    materials: string;
    amount: number;
    payment: string;
    receivedBy: string;
  }>,
) {
  const lines = [
    'quando;documento;empresa;materiais;valor;forma;recebedor',
    ...rows.map(
      (r) =>
        `${r.at};${r.documentNumber};"${r.customer.replace(/"/g, '""')}";"${r.materials.replace(/"/g, '""')}";${r.amount.toFixed(2)};${r.payment};"${r.receivedBy.replace(/"/g, '""')}"`,
    ),
  ];
  downloadBlob('relatorio-vendas.csv', lines.join('\n'), 'text/csv;charset=utf-8;');
}

export function exportFinalReportCsv(input: {
  filterLabel: string;
  purchasesTotal: number;
  salesTotal: number;
  balance: number;
  purchaseCount: number;
  saleCount: number;
}) {
  const lines = [
    'campo;valor',
    `filtro;${input.filterLabel}`,
    `compras_qtd;${input.purchaseCount}`,
    `compras_total;${input.purchasesTotal.toFixed(2)}`,
    `vendas_qtd;${input.saleCount}`,
    `vendas_total;${input.salesTotal.toFixed(2)}`,
    `saldo_operacional;${input.balance.toFixed(2)}`,
  ];
  downloadBlob('relatorio-final.csv', lines.join('\n'), 'text/csv;charset=utf-8;');
}
