import * as XLSX from 'xlsx';
import { tr, fill } from '../context/LanguageContext';

/* ─────────────────────────────────────────────────────────────────────────────
   Hisobotni Excelga chiqarish.

   MUAMMO. Hisobot ekranda ko'rinadi va shu yerda qoladi. Klinika egasi uni
   buxgalterga yubora olmaydi, o'z jadvalida hisoblay olmaydi, arxivga
   qo'ya olmaydi (GAP-ANALYSIS, 5-sahna, 10-band). Kassa uchun eksport bor
   (`cashbookExport.ts`), hisobot uchun yo'q edi.

   NIMA UCHUN BITTA FAYL, KO'P VARAQ. Egasi bir marta bosadi va hamma
   kesimni oladi: umumiy, shifokorlar, bo'limlar, chiqimlar. Har vkladka
   uchun alohida fayl — bu to'rt marta bosish va to'rtta fayl, ular
   keyin bir-biridan uzoqlashadi.

   RAQAMLAR MATN EMAS, SON bo'lib chiqadi: aks holda Excelda ular bilan
   hisob-kitob qilib bo'lmaydi va butun eksportning ma'nosi yo'qoladi.
   ───────────────────────────────────────────────────────────────────────────── */

type Cell = string | number | null;
type Sheet = Cell[][];

const MONEY_FMT = '#,##0';

/** Pul ustunlariga ming ajratgichli format */
function applyMoneyFormat(ws: XLSX.WorkSheet, moneyColumns: number[]) {
    const ref = ws['!ref'];
    if (!ref || moneyColumns.length === 0) return;
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
        for (const c of moneyColumns) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (cell && typeof cell.v === 'number') cell.z = MONEY_FMT;
        }
    }
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: Sheet, moneyColumns: number[] = [], widths?: number[]) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applyMoneyFormat(ws, moneyColumns);
    if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
    // Excel varaq nomi 31 belgidan oshmasligi kerak — aks holda fayl ochilmaydi
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

export interface ReportExportInput {
    from: string;
    to: string;
    clinicName?: string | null;
    summary?: any;
    doctors?: any;
    departments?: any;
    writeoffs?: any;
    compare?: any;
    labShift?: any;
}

export function exportReportToExcel(data: ReportExportInput): void {
    const { from, to, clinicName } = data;
    const wb = XLSX.utils.book_new();
    const head = (title: string): Sheet => [
        [clinicName || tr('ui.klinika')],
        [title],
        [tr('common.period'), `${from} — ${to}`],
        ['Tuzilgan', new Date().toLocaleString('uz-UZ')],
        [],
    ];

    /* ── 1. Umumiy ── */
    if (data.summary?.totals) {
        const t = data.summary.totals;
        const rows: Sheet = [
            ...head(tr('reportexport.umumiy_hisobot')),
            [tr('reportexport.korsatkich'), tr('ui.summa')],
            [tr('reportexport.tushum_yozilgan'), t.revenue],
            [tr('ui.olingan_pul'), t.collected],
            [tr('reportexport.qarz'), t.due],
            [tr('reportexport.material_tannarxi'), t.materialCost],
            [tr('finance.report.grossProfit'), t.grossProfit],
            [tr('ui.shifokor_ulushi_2'), t.doctorShare],
            [tr('reportexport.boshqa_xarajatlar'), t.otherExpenses],
            [tr('finance.report.netProfit'), t.netProfit],
        ];

        if (data.compare?.previous) {
            const p = data.compare.previous;
            const d = data.compare.delta || {};
            rows.push([], [tr('reportexport.oldingi_davr_bilan_solishtirish')]);
            rows.push([tr('reportexport.oldingi_davr'), fill(tr('reportexport.x_x_x_kun'), p.from, p.to, p.days)]);
            rows.push([tr('reportexport.korsatkich'), tr('reportexport.hozir'), tr('reportexport.oldin'), tr('ui.farq'), tr('reportexport.foiz')]);
            const cur = data.compare.current || {};
            for (const [key, label] of [
                ['revenue', tr('ui.tushum')], ['collected', tr('ui.olingan_pul')],
                ['expense', tr('ui.xarajat')], ['profit', tr('finance.report.profit')],
                ['visits', tr('ui.qabullar')], ['avgCheck', tr('finance.report.avgCheck')],
            ] as const) {
                rows.push([
                    label, cur[key] ?? 0, p[key] ?? 0,
                    d[key]?.abs ?? 0,
                    // Nol bazada foiz yo'q — "cheksiz o'sish" ma'nosiz
                    d[key]?.pct != null ? `${d[key].pct}%` : '—',
                ]);
            }
        }

        addSheet(wb, tr('ui.umumiy_tab'), rows, [1, 2, 3], [30, 16, 16, 16, 10]);
    }

    /* ── 2. Bo'limlar ── */
    const deptRows = data.departments?.departments || data.summary?.byDepartment;
    if (deptRows?.length) {
        const rows: Sheet = [
            ...head(tr('reportexport.bolimlar')),
            [tr('ui.bolim_2'), tr('reportexport.daromad'), tr('ui.tolangan_2'), tr('ui.xarajat'), tr('finance.report.profit'), tr('finance.report.bedDays')],
            ...deptRows.map((d: any) => [
                d.name,
                d.revenue ?? 0,
                d.paid ?? d.collected ?? 0,
                d.expense ?? 0,
                d.profit ?? (d.margin ?? 0),
                d.bedDays ?? 0,
            ]),
        ];
        if (data.departments?.totals) {
            const t = data.departments.totals;
            rows.push([], [tr('cashbook.jami'), t.revenue, t.paid, t.expense, t.profit, t.bedDays]);
            if (t.occupancy != null) rows.push([tr('finance.report.bedOccupancy'), `${t.occupancy}%`]);
        }
        addSheet(wb, tr('settings.bolimlar'), rows, [1, 2, 3, 4], [26, 15, 15, 15, 15, 12]);
    }

    /* ── 3. Shifokorlar ── */
    if (data.doctors?.doctors?.length) {
        const rows: Sheet = [
            ...head(tr('reportexport.shifokorlar')),
            [tr('ui.shifokor_2'), tr('ui.yozilgan'), tr('ui.tolangan_2'), tr('reportexport.qarz'), tr('ui.bemor'), tr('finance.report.avgCheck'), tr('finance.report.accruedShare')],
            ...data.doctors.doctors.map((d: any) => [
                d.name, d.revenue, d.paid, d.due, d.patientCount, d.avgCheck, d.accrued,
            ]),
        ];
        const t = data.doctors.totals;
        if (t) rows.push([], [tr('cashbook.jami'), t.revenue, t.paid, t.due, '', '', t.accrued]);
        rows.push([], [tr('reportexport.ulush_tolangan_pul_boyicha')]);
        addSheet(wb, tr('ui.shifokorlar'), rows, [1, 2, 3, 5, 6], [26, 15, 15, 15, 10, 15, 18]);
    }

    /* ── 4. Chiqimlar ── */
    if (data.writeoffs) {
        const w = data.writeoffs;
        const rows: Sheet = [
            ...head(tr('reportexport.chiqimlar_tannarxda')),
            [tr('finance.report.wasted'), w.wasteCost],
            [tr('finance.report.usedForService'), w.serviceCost],
            [tr('ui.jami'), w.totalCost],
            [tr('reportexport.harakatlar_soni'), w.movementCount],
            [],
            [tr('reportexport.sabab_boyicha')],
            ['Sabab', tr('reportexport.soni'), tr('ui.summa')],
            ...(w.byReason || []).map((r: any) => [r.label || r.reason, r.count, r.cost]),
            [],
            [tr('reportexport.pozitsiya_boyicha')],
            [tr('ui.nomi'), tr('reportexport.miqdor'), tr('lab.unit'), tr('ui.summa')],
            ...(w.byItem || []).map((i: any) => [i.name, i.qty, i.unit || '', i.cost]),
        ];
        addSheet(wb, tr('ui.chiqimlar'), rows, [1, 2, 3], [30, 12, 12, 15]);
    }

    /* ── 5. Smena svodi ── */
    if (data.labShift) {
        const l = data.labShift.lab || {};
        const s = data.labShift.studies || {};
        const rows: Sheet = [
            ...head(fill(tr('reportexport.smena_svodi_x'), data.labShift.date)),
            [tr('reportexport.laboratoriya')],
            [tr('finance.report.order'), l.total ?? 0],
            [tr('finance.report.sampleTaken'), l.collected ?? 0],
            [tr('finance.report.sampleNotTaken'), l.notCollected ?? 0],
            [tr('reportexport.shoshilinch'), l.urgent ?? 0],
            [tr('reportexport.tolanmagan_soni'), l.unpaidCount ?? 0],
            [tr('reportexport.tolanmagan_summa'), l.unpaidSum ?? 0],
            [tr('ui.tushum'), l.revenue ?? 0],
            [tr('reportexport.ortacha_bajarish_soat'), l.avgTurnaroundHours ?? '—'],
            [],
            [tr('reportexport.diagnostika')],
            [tr('finance.report.study'), s.total ?? 0],
            [tr('reportexport.tolanmagan_soni'), s.unpaidCount ?? 0],
            [tr('reportexport.tolanmagan_summa'), s.unpaidSum ?? 0],
            [tr('ui.tushum'), s.revenue ?? 0],
            [],
            [tr('reportexport.brak_va_qayta_bajarish')],
        ];
        addSheet(wb, tr('ui.smena_svodi'), rows, [1], [28, 16]);
    }

    /* Hech qanday varaq bo'lmasa — bo'sh fayl bermaymiz */
    if (wb.SheetNames.length === 0) {
        addSheet(wb, tr('reportexport.hisobot'), [...head(tr('reportexport.hisobot_2')), [tr('reportexport.bu_davr_uchun_malumot')]]);
    }

    XLSX.writeFile(wb, `hisobot_${from}_${to}.xlsx`);
}
