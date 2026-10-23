import PDFDocument from 'pdfkit';
import type { CostReportItem, CostReportMonth } from '@juma/shared';
import { buildWorkbook, sheet } from '../../lib/excel';
import { monthLabel } from './payroll.service';

/**
 * PDFKit's built-in fonts have no ₹ glyph, and embedding a font file just for
 * one symbol is not worth it: the PDF says "Rs." with Indian digit grouping.
 */
const rs = (v: string | number) =>
  `Rs. ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (ratio: string | null) =>
  ratio === null ? '-' : `${(Number(ratio) * 100).toFixed(2)}%`;

/** One salesman's monthly statement (SPEC 4.7: "Export PDF, one per salesman"). */
export function costReportPdf(r: CostReportItem): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: `${r.salesman.name} ${r.month}` },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );

  const green = '#1a6b4f';
  doc.fillColor(green).fontSize(18).font('Helvetica-Bold').text('Juma Food Products');
  doc.fillColor('#555').fontSize(10).font('Helvetica').text('Field staff monthly cost statement');
  doc.moveDown(1.2);

  doc.fillColor('#000').fontSize(13).font('Helvetica-Bold').text(r.salesman.name);
  doc.fontSize(10).font('Helvetica').fillColor('#333');
  doc.text(`Month: ${monthLabel(r.month)}`);
  doc.text(
    `Status: ${r.status}${r.paidAt ? ` (paid ${r.paidAt.slice(0, 10).split('-').reverse().join('-')})` : ''}`,
  );
  doc.text(`Working days: ${r.workingDays}    Leave days: ${r.leaves}`);
  doc.moveDown();

  const left = 50;
  const right = 545;
  const line = (label: string, value: string, opts: { bold?: boolean; indent?: boolean } = {}) => {
    const y = doc.y;
    doc
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(11)
      .fillColor('#000');
    doc.text(label, left + (opts.indent ? 16 : 0), y, { width: 330 });
    doc.text(value, left + 330, y, { width: right - left - 330, align: 'right' });
    doc.moveDown(0.35);
  };
  const rule = () => {
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.4);
  };

  doc.fillColor(green).font('Helvetica-Bold').fontSize(12).text('Cost', left);
  doc.moveDown(0.3);
  rule();
  line('Salary (basic + HRA + fixed allowance)', rs(r.salary));
  line('Travel allowance (TA), approved', rs(r.taTotal));
  line('Daily allowance (DA), approved', rs(r.daTotal));
  line('Other expenses, approved', rs(r.otherExpenses));
  line('Incentives', rs(r.incentives));
  line(`Less deductions${r.deductionNote ? ` (${r.deductionNote})` : ''}`, `- ${rs(r.deductions)}`);
  rule();
  line('Total', rs(r.grandTotal), { bold: true });
  doc.moveDown();

  doc.fillColor(green).font('Helvetica-Bold').fontSize(12).text('Performance', left);
  doc.moveDown(0.3);
  rule();
  line('Shop visits', String(r.visitsCount));
  line('Orders taken', String(r.ordersCount));
  line('Order value', rs(r.orderValue));
  line('New shops added', String(r.newRetailers));
  line('Cost to sales', pct(r.costToSalesRatio), { bold: true });
  rule();

  doc.moveDown(2);
  doc
    .fontSize(8)
    .fillColor('#777')
    .font('Helvetica')
    .text(
      'Only expenses approved by the company before this statement was finalised are included. Claims for this month approved later are not added automatically; ask the office.',
      left,
      doc.y,
      { width: right - left },
    );
  doc.end();
  return done;
}

/** All salesmen for a month in one sheet (SPEC 4.7: "Excel, all salesmen in one sheet"). */
export function costReportWorkbook(m: CostReportMonth): Promise<Buffer> {
  return buildWorkbook([
    sheet({
      name: m.month,
      title: `Monthly cost report: ${monthLabel(m.month)}`,
      subtitle: 'Approved expenses only. Amounts in rupees.',
      totals: true,
      rows: m.items,
      columns: [
        { header: 'Salesman', width: 24, value: (r: CostReportItem) => r.salesman.name },
        { header: 'Status', width: 10, value: (r: CostReportItem) => r.status },
        { header: 'Working days', sum: true, value: (r: CostReportItem) => r.workingDays },
        { header: 'Leaves', sum: true, value: (r: CostReportItem) => r.leaves },
        { header: 'Salary', money: true, width: 14, value: (r: CostReportItem) => r.salary },
        { header: 'TA', money: true, width: 12, value: (r: CostReportItem) => r.taTotal },
        { header: 'DA', money: true, width: 12, value: (r: CostReportItem) => r.daTotal },
        {
          header: 'Other expenses',
          money: true,
          width: 14,
          value: (r: CostReportItem) => r.otherExpenses,
        },
        {
          header: 'Incentives',
          money: true,
          width: 12,
          value: (r: CostReportItem) => r.incentives,
        },
        {
          header: 'Deductions',
          money: true,
          width: 12,
          value: (r: CostReportItem) => r.deductions,
        },
        { header: 'Total', money: true, width: 14, value: (r: CostReportItem) => r.grandTotal },
        { header: 'Visits', sum: true, value: (r: CostReportItem) => r.visitsCount },
        { header: 'Orders', sum: true, value: (r: CostReportItem) => r.ordersCount },
        {
          header: 'Order value',
          money: true,
          width: 14,
          value: (r: CostReportItem) => r.orderValue,
        },
        { header: 'New shops', sum: true, value: (r: CostReportItem) => r.newRetailers },
        {
          header: 'Cost to sales %',
          width: 14,
          value: (r: CostReportItem) =>
            r.costToSalesRatio === null
              ? null
              : Math.round(Number(r.costToSalesRatio) * 10000) / 100,
        },
      ],
    }),
  ]);
}
