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
    /** `/reports/services` — Xizmatlar varag'i */
    services?: any;
    writeoffs?: any;
    compare?: any;
    labShift?: any;
    /** `/reports/months` — Oylar bo'yicha varag'i */
    months?: any;
    /** `/reports/debtors` — Qarzdorlar varag'i */
    debtors?: any;
    /** Xarajat toifalari o'zbekcha (`EXPENSE_CATEGORY_LABELS`) */
    expenseLabels?: Record<string, string>;
    /** Shifokor id → davr oylari bo'yicha to'langan va qoldiq ulush */
    shares?: Record<string, { paid: number; payable: number }> | null;
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

    /* ── 1. Umumiy ── (ekrandagi to'rt plitka bilan BIR XIL yorliq va raqam:
       Xizmatlar · Olindi · Xarajat · Sof foyda — 2026-11-23, Moliya rejasi 8) */
    if (data.summary?.totals) {
        const t = data.summary.totals;
        const cur = data.compare?.current || {};
        const pick = (k: string, fallback: number) => (cur[k] != null ? Number(cur[k]) : fallback);
        const rows: Sheet = [
            ...head(tr('reportexport.umumiy_hisobot')),
            [tr('reportexport.korsatkich'), tr('ui.summa')],
            [tr('report.services'), pick('revenue', t.revenue)],
            [tr('report.collected'), pick('collected', t.collected)],
            [tr('ui.xarajat'), pick('expense', (t.doctorShare || 0) + (t.otherExpenses || 0))],
            [tr('finance.report.netProfit'), pick('profit', t.netProfit)],
            [],
            [tr('reportexport.qarz'), t.due],
        ];

        if (data.compare?.previous) {
            const p = data.compare.previous;
            const d = data.compare.delta || {};
            rows.push([], [tr('reportexport.oldingi_davr_bilan_solishtirish')]);
            rows.push([tr('reportexport.oldingi_davr'), fill(tr('reportexport.x_x_x_kun'), p.from, p.to, p.days)]);
            rows.push([tr('reportexport.korsatkich'), tr('reportexport.hozir'), tr('reportexport.oldin'), tr('ui.farq'), tr('reportexport.foiz')]);
            for (const [key, label] of [
                ['revenue', tr('report.services')], ['collected', tr('report.collected')],
                ['expense', tr('ui.xarajat')], ['profit', tr('finance.report.netProfit')],
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

        if (data.summary.expenseByCategory?.length) {
            rows.push([], [tr('finance.report.expenses')]);
            for (const e of data.summary.expenseByCategory) {
                rows.push([(data.expenseLabels || {})[e.category] || e.category, e.amount]);
            }
        }

        addSheet(wb, tr('ui.umumiy_tab'), rows, [1, 2, 3], [30, 16, 16, 16, 10]);
    }

    /* ── 1b. Oylar bo'yicha (Moliya rejasi 6) ── */
    if (data.months?.months?.length) {
        const m = data.months;
        const rows: Sheet = [
            ...head(fill(tr('report.byMonths'), m.year)),
            [tr('report.month'), tr('report.services'), tr('report.collected'), tr('ui.xarajat'), tr('finance.report.netProfit')],
            ...m.months.map((r: any) => [r.month, r.revenue, r.collected, r.expense, r.profit]),
            [],
            [tr('report.yearTotal'), m.totals.revenue, m.totals.collected, m.totals.expense, m.totals.profit],
        ];
        addSheet(wb, tr('report.monthsSheet'), rows, [1, 2, 3, 4], [14, 16, 16, 16, 16]);
    }

    /* ── 1c. Qarzdorlar — qarz yoshi bilan (Moliya rejasi 8) ── */
    if (data.debtors?.patients?.length) {
        const ageOf = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 864e5));
        const rows: Sheet = [
            ...head(fill(tr('report.debtorsTitle'), data.debtors.patients.length)),
            [tr('ui.bemor'), tr('reportexport.qarz'), tr('report.debtSince'), tr('report.debtDays'), tr('report.debtAge')],
            ...data.debtors.patients.map((p: any) => {
                const days = ageOf(p.oldestDate);
                return [p.patientName, p.due, p.oldestDate, days,
                    days > 60 ? tr('report.age60') : days > 30 ? tr('report.age30') : tr('report.age0')];
            }),
            [],
            [tr('cashbook.jami'), data.debtors.total],
        ];
        addSheet(wb, tr('report.debtorsSheet'), rows, [1], [28, 16, 14, 10, 12]);
    }

    /* ── 2. Bo'limlar ── */
    const deptRows = data.departments?.departments || data.summary?.byDepartment;
    if (deptRows?.length) {
        const rows: Sheet = [
            ...head(tr('reportexport.bolimlar')),
            [tr('ui.bolim_2'), tr('finance.report.patient'), tr('report.services'), tr('finance.report.avgCheck'), tr('ui.tolangan_2'), tr('ui.xarajat'), tr('finance.report.profit'), tr('finance.report.bedDays')],
            ...deptRows.map((d: any) => [
                d.name,
                d.patients ?? '',
                d.revenue ?? 0,
                d.avgCheck ?? '',
                d.paid ?? d.collected ?? 0,
                d.expense ?? 0,
                d.profit ?? (d.margin ?? 0),
                d.bedDays ?? 0,
            ]),
        ];
        if (data.departments?.totals) {
            const t = data.departments.totals;
            rows.push([], [tr('cashbook.jami'), t.patients ?? '', t.revenue, '', t.paid, t.expense, t.profit, t.bedDays]);
            if (t.occupancy != null) rows.push([tr('finance.report.bedOccupancy'), `${t.occupancy}%`]);
        }
        addSheet(wb, tr('settings.bolimlar'), rows, [2, 3, 4, 5, 6], [26, 10, 15, 15, 15, 15, 15, 12]);
    }

    /* ── 2a. Xizmatlar ── (ekrandagi ustunlar; bo'lim — alohida ustun,
       Excelda filtr bilan tanlanadi). Material kiritilmagan — bo'sh katak. */
    if (data.services?.services?.length) {
        const deptName = new Map<string, string>((data.services.departments || []).map((d: any) => [d.id, d.name]));
        const nameOf = (r: any) => (r.source === 'Medication' ? tr('report.svc.medication') : r.source === 'Bed' ? tr('report.svc.bed') : r.name);
        const list: any[] = data.services.services;
        const rows: Sheet = [
            ...head(tr('report.tabServices')),
            [tr('report.svc.service'), tr('ui.bolim_2'), tr('report.svc.count'), tr('report.svc.sum'), tr('report.svc.avgPrice'), tr('report.svc.listPriceCol'), tr('report.svc.discount'), tr('report.svc.material'), tr('report.svc.prevSum')],
            ...list.map(r => [
                nameOf(r),
                r.departmentId ? deptName.get(r.departmentId) || '' : tr('visit.noDept'),
                r.count,
                r.revenue,
                r.count > 0 ? Math.round(r.revenue / r.count) : 0,
                r.listPrice ?? '',
                r.discount,
                r.materialCost ?? '',
                r.prevRevenue,
            ]),
            [],
            /* Soni jami — dori dozasi va koyka-kunsiz (ekrandagi kabi) */
            [tr('cashbook.jami'), '', list.filter(r => r.source !== 'Medication' && r.source !== 'Bed').reduce((a, r) => a + r.count, 0), data.services.totals?.revenue ?? 0, '', '', data.services.totals?.discount ?? 0, '', data.services.totals?.prevRevenue ?? 0],
        ];
        if (data.services.unsold?.length) {
            rows.push([], [fill(tr('report.svc.unsoldTitle'), data.services.unsold.length)]);
            for (const u of data.services.unsold) rows.push([u.name, u.departmentId ? deptName.get(u.departmentId) || '' : '', '', '', '', u.listPrice]);
        }
        addSheet(wb, tr('report.tabServices'), rows, [3, 4, 5, 6, 7, 8], [34, 18, 8, 15, 14, 14, 13, 13, 15]);
    }

    /* ── 3. Shifokorlar ── */
    if (data.doctors?.doctors?.length) {
        const rows: Sheet = [
            ...head(tr('reportexport.shifokorlar')),
            [tr('ui.shifokor_2'), tr('report.services'), tr('ui.tolangan_2'), tr('reportexport.qarz'), tr('ui.bemor'), tr('finance.report.avgCheck'), tr('finance.report.accruedShare'), tr('report.sharePaid'), tr('report.shareLeft')],
            ...data.doctors.doctors.map((d: any) => {
                const s = d.doctorId && data.shares ? data.shares[d.doctorId] : undefined;
                /* Ulush yuklanmagan bo'lsa — bo'sh katak, soxta nol emas */
                const none = data.shares ? 0 : '';
                return [d.name, d.revenue, d.paid, d.due, d.patientCount, d.avgCheck, d.accrued, s?.paid ?? none, s?.payable ?? none];
            }),
        ];
        const t = data.doctors.totals;
        const shareSum = (k: 'paid' | 'payable') => Object.values(data.shares || {}).reduce((a, s) => a + (s[k] || 0), 0);
        if (t) rows.push([], [tr('cashbook.jami'), t.revenue, t.paid, t.due, '', '', t.accrued,
            data.shares ? shareSum('paid') : '', data.shares ? shareSum('payable') : '']);
        rows.push([], [tr('reportexport.ulush_tolangan_pul_boyicha')]);
        addSheet(wb, tr('ui.shifokorlar'), rows, [1, 2, 3, 5, 6, 7, 8], [26, 15, 15, 15, 10, 15, 18, 16, 16]);
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
            /* Chiqim omborda manfiy son bo'lib yotadi — hisobotda «qancha
               ketdi» deb o'qiladi, shuning uchun musbat */
            ...(w.byItem || []).map((i: any) => [i.name, Math.abs(i.qty || 0), i.unit || '', Math.abs(i.cost || 0)]),
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
