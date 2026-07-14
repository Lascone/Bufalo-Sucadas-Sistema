/// <reference path="./pdf-shims.d.ts" />
import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { getSettings } from './settings';
import type { CashRegisterRecord } from './cash';
import type { SaleRecord } from './sales';
import { calcExpected } from './cash';

const pdf = pdfMake as typeof pdfMake & {
  vfs: unknown;
  createPdf: (doc: unknown) => { download: (name: string) => void };
};

const fontModule = pdfFonts as { pdfMake?: { vfs: unknown }; default?: { pdfMake?: { vfs: unknown } } };
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
  heading: { fontSize: 14, bold: true, margin: [0, 10, 0, 6] as [number, number, number, number] },
  meta: { fontSize: 10, color: '#3a4650' },
  tableHeader: { bold: true, fillColor: '#e4ebe3' },
};

export function downloadSalePdf(sale: SaleRecord) {
  const items = sale.items ?? [];
  const amountReceived = sale.amountReceived ?? sale.netTotal;
  const grossTotal = sale.grossTotal ?? sale.netTotal;
  const methodLabel = sale.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro';
  const doc = {
    pageSize: getSettings()['print.paper'] || 'A4',
    content: [
      ...companyHeader(),
      { text: 'Comprovante de Venda', style: 'heading' },
      { text: `Nº ${sale.documentNumber}` },
      { text: `Data: ${new Date(sale.soldAt).toLocaleString('pt-BR')}` },
      { text: `Cliente: ${sale.customerName || '—'}` },
      { text: `Forma: ${methodLabel}` },
      { text: `Recebido por: ${sale.receivedBy || '—'}` },
      items.length
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
      { text: `Subtotal: R$ ${grossTotal.toFixed(2)}` },
      sale.discountAmount > 0
        ? {
            text: `Desconto: R$ ${sale.discountAmount.toFixed(2)}${
              sale.discountReason ? ` (${sale.discountReason})` : ''
            }`,
          }
        : null,
      { text: `Total: R$ ${sale.netTotal.toFixed(2)}` },
      { text: `Valor recebido: R$ ${amountReceived.toFixed(2)}` },
      {
        text: `Lucro bruto: R$ ${(sale.grossProfit ?? 0).toFixed(2)}`,
        margin: [0, 0, 0, 8] as [number, number, number, number],
      },
      sale.notes ? { text: `Observações: ${sale.notes}` } : null,
      (sale.comments?.length ?? 0) ? { text: 'Comentários', style: 'heading' } : null,
      ...(sale.comments ?? []).map((c) => ({
        text: `${new Date(c.createdAt).toLocaleString('pt-BR')} — ${c.authorName}: ${c.body}`,
        style: 'meta',
        margin: [0, 2, 0, 2] as [number, number, number, number],
      })),
      { text: footer(), style: 'meta', margin: [0, 24, 0, 0] as [number, number, number, number] },
    ].filter(Boolean),
    styles,
  };
  pdf.createPdf(doc).download(`venda-${sale.documentNumber}.pdf`);
}

export function downloadCashClosePdf(cash: CashRegisterRecord) {
  const expected = cash.expectedBalance ?? calcExpected(cash);
  const doc = {
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
      cash.differenceReason ? { text: `Justificativa: ${cash.differenceReason}` } : null,
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
  pdf.createPdf(doc).download(`caixa-${cash.id.slice(0, 8)}.pdf`);
}

export function downloadFinanceDayPdf(day: {
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
}) {
  const doc = {
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
      day.differenceReason ? { text: `Justificativa: ${day.differenceReason}`, margin: [0, 8, 0, 0] } : null,
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
  pdf.createPdf(doc).download(`financeiro-${day.businessDate}.pdf`);
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
