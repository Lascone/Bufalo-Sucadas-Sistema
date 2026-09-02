/// <reference path="./pdf-shims.d.ts" />
import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { getSettings } from './settings';
import type { CashRegisterRecord } from './cash';
import type { SaleRecord } from './sales';
import { calcExpected } from './cash';
import { movementLabel } from './movement-labels';

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

type PdfContent = unknown;

function money(n: number) {
  return `R$ ${Number(n || 0).toFixed(2)}`;
}

function dt(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function pageSize() {
  return getSettings()['print.paper'] || 'A4';
}

function footerMsg() {
  return getSettings()['print.footerMessage'] || 'Obrigado — Bufalo Sucatas';
}

const PDF_COLORS = {
  sale: '#15803d',
  saleBg: '#dcfce7',
  buy: '#b91c1c',
  buyBg: '#fee2e2',
  expense: '#991b1b',
  supply: '#0369a1',
  supplyBg: '#e0f2fe',
  muted: '#6b7280',
  cut: '#92400e',
  cutBg: '#fef3c7',
};

function reportFileName(prefix: string, slug?: string) {
  const safe = (slug || '').replace(/[^\w\-]+/g, '_').replace(/^_|_$/g, '');
  return safe ? `${prefix}-${safe}.pdf` : `${prefix}.pdf`;
}

const styles = {
  brand: { fontSize: 16, bold: true, color: '#1b4332' },
  docTitle: {
    fontSize: 15,
    bold: true,
    color: '#1b4332',
    margin: [0, 4, 0, 2] as [number, number, number, number],
  },
  section: {
    fontSize: 11,
    bold: true,
    color: '#1b4332',
    margin: [0, 14, 0, 6] as [number, number, number, number],
  },
  meta: { fontSize: 9, color: '#5c6b73' },
  body: { fontSize: 10, color: '#1a1a1a' },
  tableHeader: {
    bold: true,
    fillColor: '#e8f0e9',
    color: '#1b4332',
    fontSize: 9,
  },
  highlight: {
    fontSize: 11,
    bold: true,
    color: '#1b4332',
  },
  muted: { fontSize: 9, color: '#6b7280', italics: true },
};

function th(text: string) {
  return { text, style: 'tableHeader' };
}

function kv(rows: Array<[string, string]>): PdfContent {
  return {
    table: {
      widths: [120, '*'],
      body: rows.map(([k, v]) => [
        { text: k, style: 'meta', bold: true },
        { text: v || '—', style: 'body' },
      ]),
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0,
      hLineColor: () => '#e5e7eb',
      paddingLeft: () => 0,
      paddingRight: () => 4,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 2, 0, 4] as [number, number, number, number],
  };
}

function companyHeader(docTitle: string): PdfContent[] {
  const s = getSettings();
  const lines = [
    s['company.cnpj'] ? `CNPJ ${s['company.cnpj']}` : '',
    s['company.address'] || '',
    s['company.phone'] ? `Tel. ${s['company.phone']}` : '',
  ].filter(Boolean);

  return [
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: s['company.displayName'] || 'Bufalo Sucatas', style: 'brand' },
            ...(lines.length
              ? [{ text: lines.join(' · '), style: 'meta', margin: [0, 2, 0, 0] }]
              : []),
          ],
        },
        {
          width: 'auto',
          stack: [
            { text: docTitle, style: 'docTitle', alignment: 'right' },
            {
              text: `Emitido em ${new Date().toLocaleString('pt-BR')}`,
              style: 'meta',
              alignment: 'right',
            },
          ],
        },
      ],
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 1.2,
          lineColor: '#2d6a4f',
        },
      ],
      margin: [0, 8, 0, 10] as [number, number, number, number],
    },
  ];
}

function docFooter(): PdfContent {
  return {
    text: footerMsg(),
    style: 'muted',
    margin: [0, 22, 0, 0] as [number, number, number, number],
  };
}

function emptyTableNote(msg: string): PdfContent {
  return { text: msg, style: 'muted', margin: [0, 4, 0, 0] };
}

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
    try {
      return await window.ferrogestor.sharePdfWhatsApp({
        fileName,
        base64,
        caption,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Falha ao abrir WhatsApp: ${msg}`);
    }
  }
  pdf.createPdf(doc).download(fileName);
  const text = caption?.trim() ? encodeURIComponent(caption.trim()) : '';
  const url = text
    ? `https://web.whatsapp.com/send?text=${text}`
    : 'https://web.whatsapp.com/';
  window.open(url, '_blank', 'noopener,noreferrer');
  return {
    ok: true,
    fullPath: fileName,
    whatsapp: 'web',
    hint: 'PDF baixado. Anexe na conversa do WhatsApp Web.',
  };
}

function movTypeLabel(type: string) {
  try {
    return movementLabel(type as Parameters<typeof movementLabel>[0]);
  } catch {
    return type;
  }
}

/* ─── Venda (comprovante) ─────────────────────────────────────────── */

function buildSaleDoc(sale: SaleRecord) {
  const items = sale.items ?? [];
  const amountReceived = sale.amountReceived ?? sale.netTotal;
  const methodLabel = sale.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro';
  const lotSale = sale.lotSale ?? items.every((i) => !i.weight);
  const gross = sale.grossTotal ?? amountReceived + (sale.discountAmount || 0);

  const content: PdfContent[] = [
    ...companyHeader('Comprovante de venda'),
    { text: 'Dados da venda', style: 'section' },
    kv([
      ['Documento', sale.documentNumber],
      ['Data / hora', dt(sale.soldAt)],
      ['Cliente / empresa', sale.customerName || '—'],
      ['Forma de pagamento', methodLabel],
      ['Recebido por', sale.receivedBy || '—'],
      ['Tipo', lotSale ? 'Venda por lote (valor negociado)' : 'Venda com peso'],
    ]),
    { text: 'Materiais', style: 'section' },
  ];

  if (!items.length) {
    content.push(emptyTableNote('Nenhum material listado.'));
  } else if (lotSale) {
    content.push({
      table: {
        widths: ['*', 'auto'],
        headerRows: 1,
        body: [
          [th('Material incluído no lote'), th('Ref. custo médio*')],
          ...items.map((i) => [
            { text: i.materialName, style: 'body' },
            {
              text:
                (i.avgCostAtSale ?? i.buyPriceRef ?? 0) > 0
                  ? `${money(i.avgCostAtSale ?? i.buyPriceRef ?? 0)}/kg`
                  : '—',
              style: 'body',
              alignment: 'right',
            },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
    content.push({
      text: '* Referência do estoque na data; nesta venda o valor foi negociado no total.',
      style: 'muted',
      margin: [0, 4, 0, 0],
    });
  } else {
    content.push({
      table: {
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        headerRows: 1,
        body: [
          [
            th('Material'),
            th('Peso (kg)'),
            th('R$/kg'),
            th('Subtotal'),
            th('Lucro est.'),
          ],
          ...items.map((i) => [
            { text: i.materialName, style: 'body' },
            { text: Number(i.weight).toFixed(3), style: 'body', alignment: 'right' },
            {
              text: Number(i.unitPrice).toFixed(2),
              style: 'body',
              alignment: 'right',
            },
            {
              text: money(i.lineTotal),
              style: 'body',
              alignment: 'right',
            },
            {
              text: money(i.grossProfit ?? 0),
              style: 'body',
              alignment: 'right',
            },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push({ text: 'Valores', style: 'section' });
  const valueRows: Array<[string, string]> = [
    ['Valor bruto', money(gross)],
  ];
  if ((sale.discountAmount ?? 0) > 0) {
    valueRows.push([
      'Desconto',
      `${money(sale.discountAmount)}${
        sale.discountReason ? ` (${sale.discountReason})` : ''
      }`,
    ]);
  }
  valueRows.push(
    ['Valor líquido', money(sale.netTotal)],
    ['Valor recebido', money(amountReceived)],
  );
  if (!lotSale && (sale.grossProfit ?? 0) !== 0) {
    valueRows.push(['Lucro estimado (itens)', money(sale.grossProfit)]);
  }
  content.push(kv(valueRows));
  content.push({
    text: `Total confirmado: ${money(amountReceived)} · ${methodLabel}`,
    style: 'highlight',
    margin: [0, 8, 0, 0],
  });

  if (sale.notes?.trim()) {
    content.push({ text: 'Observações', style: 'section' });
    content.push({ text: sale.notes, style: 'body' });
  }

  if (sale.comments?.length) {
    content.push({ text: 'Comentários', style: 'section' });
    for (const c of sale.comments) {
      content.push({
        text: `${dt(c.createdAt)} — ${c.authorName}: ${c.body}`,
        style: 'meta',
        margin: [0, 2, 0, 2],
      });
    }
  }

  if (sale.stockWarnings?.length) {
    content.push({ text: 'Avisos de estoque', style: 'section' });
    for (const w of sale.stockWarnings) {
      content.push({ text: `• ${w}`, style: 'muted' });
    }
  }

  content.push(docFooter());

  return { pageSize: pageSize(), content, styles, defaultStyle: { fontSize: 10 } };
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
    `Venda ${sale.documentNumber} — ${money(sale.amountReceived ?? sale.netTotal)}`,
  );
}

/* ─── Fechamento de caixa ─────────────────────────────────────────── */

function buildCashCloseDoc(cash: CashRegisterRecord) {
  const expected = cash.expectedBalance ?? calcExpected(cash);
  const content: PdfContent[] = [
    ...companyHeader('Fechamento de caixa'),
    { text: 'Resumo do dia', style: 'section' },
    kv([
      ['Aberto em', dt(cash.openedAt)],
      ['Fechado em', cash.closedAt ? dt(cash.closedAt) : '—'],
      ['Operador', cash.openedBy || '—'],
      ['Saldo inicial', money(cash.openingBalance)],
      ['Saldo esperado', money(expected)],
      ['Saldo contado', money(cash.informedBalance ?? 0)],
      ['Diferença', money(cash.difference ?? 0)],
    ]),
  ];

  if (cash.differenceReason) {
    content.push({
      text: `Justificativa da diferença: ${cash.differenceReason}`,
      style: 'body',
      margin: [0, 4, 0, 0],
    });
  }
  if (cash.notes) {
    content.push({
      text: `Observações da abertura / caixa: ${cash.notes}`,
      style: 'body',
      margin: [0, 2, 0, 0],
    });
  }

  content.push({ text: 'Movimentos', style: 'section' });
  if (!cash.movements.length) {
    content.push(emptyTableNote('Nenhum movimento neste caixa.'));
  } else {
    content.push({
      table: {
        widths: ['auto', 'auto', 'auto', '*'],
        headerRows: 1,
        body: [
          [th('Quando'), th('Tipo'), th('Valor'), th('Descrição')],
          ...cash.movements.map((m) => [
            { text: dt(m.movedAt), style: 'meta' },
            { text: movTypeLabel(m.movementType), style: 'body' },
            { text: money(m.amount), style: 'body', alignment: 'right' },
            {
              text: [m.description, m.detail].filter(Boolean).join(' · '),
              style: 'body',
            },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push(docFooter());
  return { pageSize: pageSize(), content, styles, defaultStyle: { fontSize: 10 } };
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
    'Fechamento de caixa — Bufalo Sucatas',
  );
}

/* ─── Financeiro do dia ───────────────────────────────────────────── */

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
  sessionCount?: number;
  totals: {
    vendasRecebidas: number;
    despesas: number;
    sangrias: number;
    suprimentos: number;
    entradas: number;
    saidas: number;
    comprasPagas: number;
    emprestimos?: number;
    devolucoesEmprestimo?: number;
  };
  movements: Array<{
    movedAt: string;
    movementType: string;
    amount: number;
    description: string;
    detail?: string;
    isCut?: boolean;
  }>;
};

function buildFinanceDayDoc(day: FinanceDayPdfInput) {
  const content: PdfContent[] = [
    ...companyHeader('Resumo financeiro do dia'),
    { text: 'Período', style: 'section' },
    kv([
      ['Data do negócio', day.businessDate],
      ['Aberto', dt(day.openedAt)],
      ['Fechado', dt(day.closedAt)],
      ['Operador', day.openedBy || '—'],
      ...(day.sessionCount && day.sessionCount > 1
        ? [['Sessões no dia', String(day.sessionCount)] as [string, string]]
        : []),
    ]),
    { text: 'Totais', style: 'section' },
    {
      table: {
        widths: ['*', 'auto'],
        headerRows: 1,
        body: [
          [th('Rubrica'), th('Valor')],
          ['Saldo inicial', money(day.openingBalance)],
          ['Vendas recebidas', money(day.totals.vendasRecebidas)],
          ['Material comprado', money(day.totals.comprasPagas)],
          ['Peguei emprestado', money(day.totals.emprestimos ?? 0)],
          ['Devolução de empréstimo', money(day.totals.devolucoesEmprestimo ?? 0)],
          ['Despesas', money(day.totals.despesas)],
          ['Sangrias', money(day.totals.sangrias)],
          ['Suprimentos', money(day.totals.suprimentos)],
          ['Outras entradas', money(day.totals.entradas)],
          ['Outras saídas', money(day.totals.saidas)],
          [
            { text: 'Saldo esperado', bold: true },
            { text: money(day.expectedBalance), bold: true, alignment: 'right' },
          ],
          ['Saldo informado', money(day.informedBalance)],
          [
            { text: 'Diferença', bold: true },
            { text: money(day.difference), bold: true, alignment: 'right' },
          ],
        ].map((row, i) =>
          i === 0
            ? row
            : [
                typeof row[0] === 'string'
                  ? { text: row[0], style: 'body' }
                  : row[0],
                typeof row[1] === 'string'
                  ? { text: row[1], style: 'body', alignment: 'right' }
                  : row[1],
              ],
        ),
      },
      layout: 'lightHorizontalLines',
    },
  ];

  if (day.differenceReason) {
    content.push({
      text: `Justificativa: ${day.differenceReason}`,
      style: 'body',
      margin: [0, 8, 0, 0],
    });
  }
  if (day.notes) {
    content.push({
      text: `Observações: ${day.notes}`,
      style: 'body',
      margin: [0, 2, 0, 0],
    });
  }

  content.push({ text: 'Movimentos do dia', style: 'section' });
  if (!day.movements.length) {
    content.push(emptyTableNote('Sem movimentos.'));
  } else {
    content.push({
      table: {
        widths: ['auto', 'auto', 'auto', '*'],
        headerRows: 1,
        body: [
          [th('Quando'), th('Tipo'), th('Valor'), th('Descrição')],
          ...day.movements.map((m) =>
            m.isCut
              ? [
                  {
                    text: m.description,
                    colSpan: 4,
                    alignment: 'center',
                    bold: true,
                    color: PDF_COLORS.cut,
                    fillColor: PDF_COLORS.cutBg,
                    fontSize: 9,
                    margin: [0, 4, 0, 4],
                  },
                  {},
                  {},
                  {},
                ]
              : [
                  { text: dt(m.movedAt), style: 'meta' },
                  {
                    text: movTypeLabel(m.movementType),
                    style: 'body',
                    color:
                      m.movementType === 'DESPESA' ||
                      m.movementType === 'COMPRA_PAGA'
                        ? PDF_COLORS.buy
                        : m.movementType === 'VENDA_RECEBIDA' ||
                            m.movementType === 'TROCADO'
                          ? PDF_COLORS.sale
                          : m.movementType === 'SUPRIMENTO' ||
                              m.movementType === 'ENTRADA'
                            ? PDF_COLORS.supply
                            : undefined,
                  },
                  { text: money(m.amount), style: 'body', alignment: 'right' },
                  {
                    text: [m.description, m.detail].filter(Boolean).join(' · '),
                    style: 'body',
                  },
                ],
          ),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push(docFooter());
  return { pageSize: pageSize(), content, styles, defaultStyle: { fontSize: 10 } };
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
    `Financeiro ${day.businessDate} — Bufalo Sucatas`,
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
        `${dt(m.movedAt)};${movTypeLabel(m.movementType)};${m.amount.toFixed(2)};"${m.description.replace(/"/g, '""')}"`,
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

/* ─── Relatórios ──────────────────────────────────────────────────── */

type PurchasesReportInput = {
  title: string;
  filterLabel: string;
  fileSlug?: string;
  total: number;
  count: number;
  rows: Array<{
    at: string;
    documentNumber: string;
    supplier: string;
    materials: string;
    amount: number;
    payment: string;
    source?: string;
  }>;
};

function buildPurchasesReportDoc(input: PurchasesReportInput) {
  const avg = input.count > 0 ? input.total / input.count : 0;
  const content: PdfContent[] = [
    ...companyHeader(input.title),
    {
      text: 'Saídas · compras e gastos',
      color: PDF_COLORS.buy,
      bold: true,
      fontSize: 12,
      margin: [0, 0, 0, 6],
    },
    kv([
      ['Filtro', input.filterLabel],
      ['Lançamentos', String(input.count)],
      ['Total pago', money(input.total)],
      ['Média', money(avg)],
    ]),
    { text: 'Detalhamento', style: 'section', color: PDF_COLORS.buy },
  ];

  if (!input.rows.length) {
    content.push(emptyTableNote('Nenhuma compra/gasto no período.'));
  } else {
    content.push({
      table: {
        widths: ['auto', 'auto', '*', 'auto', 'auto'],
        headerRows: 1,
        body: [
          [
            th('Quando'),
            th('Doc'),
            th('Pessoa / materiais'),
            th('Pago'),
            th('Forma'),
          ],
          ...input.rows.map((r) => [
            { text: r.at, style: 'meta' },
            {
              text: r.documentNumber,
              style: 'body',
              color: r.source === 'caixa' ? PDF_COLORS.expense : PDF_COLORS.buy,
            },
            {
              stack: [
                { text: r.supplier, style: 'body', bold: true },
                {
                  text: r.materials,
                  style: 'meta',
                  color: r.source === 'caixa' ? PDF_COLORS.expense : undefined,
                },
              ],
            },
            {
              text: money(r.amount),
              style: 'body',
              alignment: 'right',
              color: PDF_COLORS.buy,
            },
            { text: r.payment, style: 'body' },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push(docFooter());
  return { pageSize: pageSize(), content, styles, defaultStyle: { fontSize: 10 } };
}

export function downloadPurchasesReportPdf(input: PurchasesReportInput) {
  pdf
    .createPdf(buildPurchasesReportDoc(input))
    .download(reportFileName('relatorio-compras', input.fileSlug));
}

export function sharePurchasesReportPdfWhatsApp(input: PurchasesReportInput) {
  return sharePdfDoc(
    buildPurchasesReportDoc(input),
    reportFileName('relatorio-compras', input.fileSlug),
    `Relatório de compras · ${input.filterLabel}`,
  );
}

type SalesReportInput = {
  title: string;
  filterLabel: string;
  fileSlug?: string;
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
    saleType?: string;
    discount?: number;
    source?: string;
  }>;
};

function buildSalesReportDoc(input: SalesReportInput) {
  const avg = input.count > 0 ? input.total / input.count : 0;
  const content: PdfContent[] = [
    ...companyHeader(input.title),
    {
      text: 'Entradas · vendas e trocado',
      color: PDF_COLORS.sale,
      bold: true,
      fontSize: 12,
      margin: [0, 0, 0, 6],
    },
    kv([
      ['Filtro', input.filterLabel],
      ['Lançamentos', String(input.count)],
      ['Total recebido', money(input.total)],
      ['Média', money(avg)],
    ]),
    {
      text: 'Detalhamento das vendas',
      style: 'section',
      color: PDF_COLORS.sale,
    },
  ];

  if (!input.rows.length) {
    content.push(emptyTableNote('Nenhuma venda no período.'));
  } else {
    content.push({
      table: {
        widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto'],
        headerRows: 1,
        body: [
          [
            th('Quando'),
            th('Doc'),
            th('Empresa / materiais'),
            th('Valor'),
            th('Forma'),
            th('Recebedor'),
          ],
          ...input.rows.map((r) => [
            { text: r.at, style: 'meta' },
            { text: r.documentNumber, style: 'body' },
            {
              stack: [
                { text: r.customer, style: 'body', bold: true },
                {
                  text: [
                    r.saleType,
                    r.materials,
                    (r.discount ?? 0) > 0
                      ? `desconto ${money(r.discount!)}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  style: 'meta',
                },
              ],
            },
            { text: money(r.amount), style: 'body', alignment: 'right' },
            { text: r.payment, style: 'body' },
            { text: r.receivedBy || '—', style: 'body' },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push(docFooter());
  return { pageSize: pageSize(), content, styles, defaultStyle: { fontSize: 10 } };
}

export function downloadSalesReportPdf(input: SalesReportInput) {
  pdf
    .createPdf(buildSalesReportDoc(input))
    .download(reportFileName('relatorio-vendas', input.fileSlug));
}

export function shareSalesReportPdfWhatsApp(input: SalesReportInput) {
  return sharePdfDoc(
    buildSalesReportDoc(input),
    reportFileName('relatorio-vendas', input.fileSlug),
    `Relatório de vendas · ${input.filterLabel}`,
  );
}

type FinalReportInput = {
  filterLabel: string;
  fileSlug?: string;
  purchasesTotal: number;
  salesTotal: number;
  expensesTotal: number;
  suppliesTotal: number;
  balance: number;
  purchaseCount: number;
  saleCount: number;
  expenseCount: number;
  purchaseRows?: PurchasesReportInput['rows'];
  saleRows?: SalesReportInput['rows'];
};

function buildFinalReportDoc(input: FinalReportInput) {
  const content: PdfContent[] = [
    ...companyHeader('Relatório final'),
    kv([['Filtro', input.filterLabel]]),
    { text: 'Resumo consolidado', style: 'section' },
    {
      table: {
        widths: ['*', 'auto', 'auto'],
        headerRows: 1,
        body: [
          [th('Indicador'), th('Qtd'), th('Valor')],
          [
            {
              text: 'Compras + gastos (saídas)',
              style: 'body',
              color: PDF_COLORS.buy,
            },
            { text: String(input.purchaseCount), alignment: 'right' },
            {
              text: money(input.purchasesTotal),
              alignment: 'right',
              color: PDF_COLORS.buy,
            },
          ],
          [
            {
              text: 'Gastos avulsos (caixa)',
              style: 'body',
              color: PDF_COLORS.expense,
            },
            { text: String(input.expenseCount), alignment: 'right' },
            {
              text: money(input.expensesTotal),
              alignment: 'right',
              color: PDF_COLORS.expense,
            },
          ],
          [
            {
              text: 'Vendas + trocado (entradas)',
              style: 'body',
              color: PDF_COLORS.sale,
            },
            { text: String(input.saleCount), alignment: 'right' },
            {
              text: money(input.salesTotal),
              alignment: 'right',
              color: PDF_COLORS.sale,
            },
          ],
          [
            {
              text: 'Suprimentos / trocado colocado',
              style: 'body',
              color: PDF_COLORS.supply,
            },
            { text: '—', alignment: 'right' },
            {
              text: money(input.suppliesTotal),
              alignment: 'right',
              color: PDF_COLORS.supply,
            },
          ],
          [
            {
              text: 'Saldo operacional (entradas − saídas)',
              bold: true,
              style: 'body',
            },
            { text: '—', alignment: 'right' },
            {
              text: money(input.balance),
              bold: true,
              alignment: 'right',
            },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];

  if (input.saleRows?.length) {
    content.push({
      text: 'Vendas e entradas do caixa',
      style: 'section',
      color: PDF_COLORS.sale,
    });
    content.push({
      table: {
        widths: ['auto', '*', 'auto'],
        headerRows: 1,
        body: [
          [th('Quando'), th('Descrição'), th('Valor')],
          ...input.saleRows.map((r) => [
            { text: r.at, style: 'meta' },
            {
              text: `${r.customer} · ${r.materials}`,
              style: 'body',
            },
            {
              text: money(r.amount),
              alignment: 'right',
              color: PDF_COLORS.sale,
            },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  if (input.purchaseRows?.length) {
    content.push({
      text: 'Compras e gastos',
      style: 'section',
      color: PDF_COLORS.buy,
    });
    content.push({
      table: {
        widths: ['auto', '*', 'auto'],
        headerRows: 1,
        body: [
          [th('Quando'), th('Descrição'), th('Valor')],
          ...input.purchaseRows.map((r) => [
            { text: r.at, style: 'meta' },
            {
              text: `${r.supplier} · ${r.materials}`,
              style: 'body',
            },
            {
              text: money(r.amount),
              alignment: 'right',
              color: PDF_COLORS.buy,
            },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push(docFooter());
  return { pageSize: pageSize(), content, styles, defaultStyle: { fontSize: 10 } };
}

export function downloadFinalReportPdf(input: FinalReportInput) {
  pdf
    .createPdf(buildFinalReportDoc(input))
    .download(reportFileName('relatorio-final', input.fileSlug));
}

export function shareFinalReportPdfWhatsApp(input: FinalReportInput) {
  return sharePdfDoc(
    buildFinalReportDoc(input),
    reportFileName('relatorio-final', input.fileSlug),
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

/* ─── Pátio ───────────────────────────────────────────────────────── */

type PatioReportInput = {
  filterLabel: string;
  inKg: number;
  outKg: number;
  inValue: number;
  outValue: number;
  count: number;
  byMaterial: Array<{
    materialName: string;
    inKg: number;
    outKg: number;
    netKg: number;
  }>;
  rows: Array<{
    at: string;
    kind: string;
    material: string;
    weight: number;
    unitCost: number;
    source: string;
  }>;
};

function sourceLabel(source: string) {
  if (source === 'PURCHASE') return 'Material comprado';
  if (source === 'SALE') return 'Venda';
  if (source === 'ADJUSTMENT') return 'Baixa / ajuste';
  return source;
}

function buildPatioReportDoc(input: PatioReportInput) {
  const content: PdfContent[] = [
    ...companyHeader('Relatório do pátio'),
    kv([
      ['Filtro', input.filterLabel],
      ['Movimentos', String(input.count)],
      [
        'Entradas',
        `${input.inKg.toFixed(3)} kg · ${money(input.inValue)}`,
      ],
      [
        'Saídas',
        `${input.outKg.toFixed(3)} kg · ${money(input.outValue)}`,
      ],
      [
        'Saldo do período',
        `${(input.inKg - input.outKg).toFixed(3)} kg`,
      ],
    ]),
    { text: 'Por material', style: 'section' },
  ];

  if (!input.byMaterial.length) {
    content.push(emptyTableNote('Sem movimentação por material.'));
  } else {
    content.push({
      table: {
        widths: ['*', 'auto', 'auto', 'auto'],
        headerRows: 1,
        body: [
          [th('Material'), th('Entrou kg'), th('Saiu kg'), th('Saldo kg')],
          ...input.byMaterial.map((m) => [
            { text: m.materialName, style: 'body' },
            { text: m.inKg.toFixed(3), alignment: 'right' },
            { text: m.outKg.toFixed(3), alignment: 'right' },
            { text: m.netKg.toFixed(3), alignment: 'right', bold: true },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push({ text: 'Movimentos', style: 'section' });
  if (!input.rows.length) {
    content.push(emptyTableNote('Nenhum movimento no filtro.'));
  } else {
    content.push({
      table: {
        widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto'],
        headerRows: 1,
        body: [
          [
            th('Quando'),
            th('Tipo'),
            th('Material'),
            th('Peso'),
            th('R$/kg'),
            th('Origem'),
          ],
          ...input.rows.map((r) => [
            { text: r.at, style: 'meta' },
            { text: r.kind, style: 'body' },
            { text: r.material, style: 'body' },
            {
              text: `${r.weight.toFixed(3)} kg`,
              style: 'body',
              alignment: 'right',
            },
            {
              text: r.unitCost.toFixed(2),
              style: 'body',
              alignment: 'right',
            },
            { text: sourceLabel(r.source), style: 'meta' },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push(docFooter());
  return { pageSize: pageSize(), content, styles, defaultStyle: { fontSize: 10 } };
}

export function downloadPatioReportPdf(input: PatioReportInput) {
  pdf.createPdf(buildPatioReportDoc(input)).download('relatorio-patio.pdf');
}

export function sharePatioReportPdfWhatsApp(input: PatioReportInput) {
  return sharePdfDoc(
    buildPatioReportDoc(input),
    'relatorio-patio.pdf',
    `Relatório do pátio · ${input.filterLabel}`,
  );
}

export function exportPatioReportCsv(input: PatioReportInput) {
  const lines = [
    'campo;valor',
    `filtro;${input.filterLabel}`,
    `movimentos;${input.count}`,
    `entrada_kg;${input.inKg.toFixed(3)}`,
    `saida_kg;${input.outKg.toFixed(3)}`,
    `entrada_valor;${input.inValue.toFixed(2)}`,
    `saida_valor;${input.outValue.toFixed(2)}`,
    '',
    'material;entrou_kg;saiu_kg;saldo_kg',
    ...input.byMaterial.map(
      (m) =>
        `"${m.materialName.replace(/"/g, '""')}";${m.inKg.toFixed(3)};${m.outKg.toFixed(3)};${m.netKg.toFixed(3)}`,
    ),
    '',
    'quando;tipo;material;peso_kg;custo_kg;origem',
    ...input.rows.map(
      (r) =>
        `${r.at};${r.kind};"${r.material.replace(/"/g, '""')}";${r.weight.toFixed(3)};${r.unitCost.toFixed(2)};${sourceLabel(r.source)}`,
    ),
  ];
  downloadBlob('relatorio-patio.csv', lines.join('\n'), 'text/csv;charset=utf-8;');
}

export type OldDataArchivePdfInput = {
  title: string;
  subtitle: string;
  rows: Array<{
    at: string;
    entityType: string;
    summary: string;
    amount?: string;
  }>;
};

function buildOldDataArchiveDoc(input: OldDataArchivePdfInput) {
  const content: PdfContent[] = [
    ...companyHeader('Dados antigos'),
    { text: input.title, style: 'section', margin: [0, 0, 0, 4] },
    { text: input.subtitle, style: 'muted', margin: [0, 0, 0, 12] },
    input.rows.length
      ? {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', 'auto'],
            body: [
              [th('Quando'), th('Tipo'), th('Resumo'), th('Valor')],
              ...input.rows.map((r) => [
                { text: r.at, style: 'body', fontSize: 8 },
                { text: r.entityType, style: 'body', fontSize: 8 },
                { text: r.summary, style: 'body', fontSize: 8 },
                { text: r.amount ?? '—', style: 'body', fontSize: 8 },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        }
      : emptyTableNote('Nenhum registro no período.'),
    docFooter(),
  ];
  return {
    pageSize: pageSize(),
    content,
    styles,
    defaultStyle: { fontSize: 9 },
  };
}

export function downloadOldDataArchivePdf(input: OldDataArchivePdfInput) {
  const safe = input.title.replace(/[^\w\-]+/g, '_').slice(0, 40);
  pdf
    .createPdf(buildOldDataArchiveDoc(input))
    .download(`dados-antigos-${safe || 'arquivo'}.pdf`);
}

export function exportOldDataArchiveCsv(input: OldDataArchivePdfInput) {
  const lines = [
    'quando;tipo;resumo;valor',
    ...input.rows.map(
      (r) =>
        `${r.at};${r.entityType};"${r.summary.replace(/"/g, '""')}";${r.amount ?? ''}`,
    ),
  ];
  downloadBlob('dados-antigos.csv', lines.join('\n'), 'text/csv;charset=utf-8;');
}

