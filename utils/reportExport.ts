import * as XLSX from 'xlsx';

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
        [clinicName || 'Klinika'],
        [title],
        ['Davr', `${from} — ${to}`],
        ['Tuzilgan', new Date().toLocaleString('uz-UZ')],
        [],
    ];

    /* ── 1. Umumiy ── */
    if (data.summary?.totals) {
        const t = data.summary.totals;
        const rows: Sheet = [
            ...head('UMUMIY HISOBOT'),
            ['Ko\'rsatkich', 'Summa'],
            ['Tushum (yozilgan)', t.revenue],
            ['Olingan pul', t.collected],
            ['Qarz', t.due],
            ['Material tannarxi', t.materialCost],
            ['Yalpi foyda', t.grossProfit],
            ['Shifokor ulushi', t.doctorShare],
            ['Boshqa xarajatlar', t.otherExpenses],
            ['Sof foyda', t.netProfit],
        ];

        if (data.compare?.previous) {
            const p = data.compare.previous;
            const d = data.compare.delta || {};
            rows.push([], ['OLDINGI DAVR BILAN SOLISHTIRISH']);
            rows.push(['Oldingi davr', `${p.from} — ${p.to} (${p.days} kun)`]);
            rows.push(['Ko\'rsatkich', 'Hozir', 'Oldin', 'Farq', 'Foiz']);
            const cur = data.compare.current || {};
            for (const [key, label] of [
                ['revenue', 'Tushum'], ['collected', 'Olingan pul'],
                ['expense', 'Xarajat'], ['profit', 'Foyda'],
                ['visits', 'Qabullar'], ['avgCheck', "O'rtacha chek"],
            ] as const) {
                rows.push([
                    label, cur[key] ?? 0, p[key] ?? 0,
                    d[key]?.abs ?? 0,
                    // Nol bazada foiz yo'q — "cheksiz o'sish" ma'nosiz
                    d[key]?.pct != null ? `${d[key].pct}%` : '—',
                ]);
            }
        }

        addSheet(wb, 'Umumiy', rows, [1, 2, 3], [30, 16, 16, 16, 10]);
    }

    /* ── 2. Bo'limlar ── */
    const deptRows = data.departments?.departments || data.summary?.byDepartment;
    if (deptRows?.length) {
        const rows: Sheet = [
            ...head("BO'LIMLAR"),
            ["Bo'lim", 'Daromad', "To'langan", 'Xarajat', 'Foyda', 'Koyka-kun'],
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
            rows.push([], ['JAMI', t.revenue, t.paid, t.expense, t.profit, t.bedDays]);
            if (t.occupancy != null) rows.push(['Koyka bandligi', `${t.occupancy}%`]);
        }
        addSheet(wb, "Bo'limlar", rows, [1, 2, 3, 4], [26, 15, 15, 15, 15, 12]);
    }

    /* ── 3. Shifokorlar ── */
    if (data.doctors?.doctors?.length) {
        const rows: Sheet = [
            ...head('SHIFOKORLAR'),
            ['Shifokor', 'Yozilgan', "To'langan", 'Qarz', 'Bemor', "O'rtacha chek", 'Hisoblangan ulush'],
            ...data.doctors.doctors.map((d: any) => [
                d.name, d.revenue, d.paid, d.due, d.patientCount, d.avgCheck, d.accrued,
            ]),
        ];
        const t = data.doctors.totals;
        if (t) rows.push([], ['JAMI', t.revenue, t.paid, t.due, '', '', t.accrued]);
        rows.push([], ["Ulush TO'LANGAN pul bo'yicha hisoblanadi: qarzga yozilgan ish uchun pul hali kirmagan."]);
        addSheet(wb, 'Shifokorlar', rows, [1, 2, 3, 5, 6], [26, 15, 15, 15, 10, 15, 18]);
    }

    /* ── 4. Chiqimlar ── */
    if (data.writeoffs) {
        const w = data.writeoffs;
        const rows: Sheet = [
            ...head('CHIQIMLAR (tannarxda)'),
            ['Behuda ketgan', w.wasteCost],
            ['Xizmatga ishlatilgan', w.serviceCost],
            ['Jami', w.totalCost],
            ['Harakatlar soni', w.movementCount],
            [],
            ['SABAB BO\'YICHA'],
            ['Sabab', 'Soni', 'Summa'],
            ...(w.byReason || []).map((r: any) => [r.label || r.reason, r.count, r.cost]),
            [],
            ['POZITSIYA BO\'YICHA'],
            ['Nomi', 'Miqdor', 'Birlik', 'Summa'],
            ...(w.byItem || []).map((i: any) => [i.name, i.qty, i.unit || '', i.cost]),
        ];
        addSheet(wb, 'Chiqimlar', rows, [1, 2, 3], [30, 12, 12, 15]);
    }

    /* ── 5. Smena svodi ── */
    if (data.labShift) {
        const l = data.labShift.lab || {};
        const s = data.labShift.studies || {};
        const rows: Sheet = [
            ...head(`SMENA SVODI (${data.labShift.date})`),
            ['LABORATORIYA'],
            ['Buyurtma', l.total ?? 0],
            ['Proba olindi', l.collected ?? 0],
            ['Proba olinmadi', l.notCollected ?? 0],
            ['Shoshilinch', l.urgent ?? 0],
            ["To'lanmagan (soni)", l.unpaidCount ?? 0],
            ["To'lanmagan (summa)", l.unpaidSum ?? 0],
            ['Tushum', l.revenue ?? 0],
            ["O'rtacha bajarish (soat)", l.avgTurnaroundHours ?? '—'],
            [],
            ['DIAGNOSTIKA'],
            ['Tekshiruv', s.total ?? 0],
            ["To'lanmagan (soni)", s.unpaidCount ?? 0],
            ["To'lanmagan (summa)", s.unpaidSum ?? 0],
            ['Tushum', s.revenue ?? 0],
            [],
            ['Brak va qayta bajarish hisobga OLINMAYDI: tizimda bunday tushuncha yo\'q.'],
        ];
        addSheet(wb, 'Smena svodi', rows, [1], [28, 16]);
    }

    /* Hech qanday varaq bo'lmasa — bo'sh fayl bermaymiz */
    if (wb.SheetNames.length === 0) {
        addSheet(wb, 'Hisobot', [...head('HISOBOT'), ["Bu davr uchun ma'lumot yo'q"]]);
    }

    XLSX.writeFile(wb, `hisobot_${from}_${to}.xlsx`);
}
