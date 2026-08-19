import * as XLSX from 'xlsx';
import { Expense, Doctor, CashRegisterDay, CashMovement, EXPENSE_CATEGORY_LABELS, CASH_MOVEMENT_LABELS } from '../types';
import {
    CashBookDay,
    CashBookMonth,
    CashBookTotals,
    CashClosureStatus,
    formatDateLabel,
    formatMonthLabel,
} from './cashbook';
import { PAYMENT_METHODS, getPaymentMethodLabel } from './paymentMethods';

type Cell = string | number | null;
type Sheet = Cell[][];

const MONEY_FMT = '#,##0';

/** Raqamli kataklarga ming ajratgichli format beradi — Excelda o'qish oson bo'lsin */
function applyMoneyFormat(ws: XLSX.WorkSheet, skipColumns: number[] = []) {
    const ref = ws['!ref'];
    if (!ref) return;
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
            if (skipColumns.includes(c)) continue;
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (cell && cell.t === 'n') cell.z = MONEY_FMT;
        }
    }
}

function sheetFrom(rows: Sheet, widths: number[], opts: { skipMoneyCols?: number[]; autoFilterRef?: string } = {}) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(wch => ({ wch }));
    applyMoneyFormat(ws, opts.skipMoneyCols ?? [0]);
    if (opts.autoFilterRef) ws['!autofilter'] = { ref: opts.autoFilterRef };
    return ws;
}

function methodBreakdownRows(totals: CashBookTotals): Sheet {
    return PAYMENT_METHODS
        .filter(m => (totals.byMethod[m.key] || 0) !== 0)
        .map(m => [`  ${m.label}`, totals.byMethod[m.key] || 0] as Cell[]);
}

/** Har ikkala eksportda takrorlanadigan «kassa yakuni» bloki */
function summaryBlock(totals: CashBookTotals): Sheet {
    const rows: Sheet = [
        ['KASSAGA TUSHDI'],
        ['Jami tushum', totals.gross],
        ...methodBreakdownRows(totals),
        [],
        ['KASSADAN CHIQDI'],
        ['Jami xarajat', totals.expenseTotal],
        ['  Naqd bilan', totals.cashExpense],
        ['  Naqdsiz (karta/hisob)', totals.nonCashExpense],
        [],
        ['NAQD YASHIK'],
        ['Kun boshida qoldiq', totals.openingCash],
        ['+ Naqd tushum', totals.cashIn],
        ['− Naqd xarajat', -totals.cashExpense],
    ];

    if (totals.cashInManual) rows.push(['+ Kassaga solindi', totals.cashInManual]);
    if (totals.refundCash) rows.push(['− Bemorga qaytarildi', -totals.refundCash]);
    if (totals.encashment) rows.push(['− Inkassatsiya', -totals.encashment]);
    rows.push(['= YASHIKDA BO\'LISHI KERAK', totals.drawer]);
    rows.push([]);
    rows.push(['NAQDSIZ']);
    rows.push(['Karta / Click / O\'tkazma / Sug\'urta', totals.nonCashIn]);

    if (totals.fromBalance > 0) {
        rows.push([], ['MA\'LUMOT UCHUN'], ['Avansdan yechilgan (kassaga kirmagan)', totals.fromBalance]);
    }
    if (totals.unpaid > 0) {
        if (totals.fromBalance <= 0) rows.push([], ['MA\'LUMOT UCHUN']);
        rows.push(['Qarzga yozilgan (to\'lanmagan)', totals.unpaid]);
    }

    return rows;
}

/** Kunlik hisobotdagi «kun yopildi» bloki */
function closureBlock(status?: CashClosureStatus): Sheet {
    if (!status?.closed || !status.closure) {
        return [[], ['KUN YOPILMAGAN']];
    }
    const c = status.closure;
    const rows: Sheet = [
        [],
        ['KUN YOPILDI'],
        ['Smena', c.shift || 1],
        ['Smena boshidagi qoldiq', c.openingCash || 0],
        ['Kassir sanagan naqd', c.countedCash],
        ['Hisob bo\'yicha naqd', c.expectedCash],
        ['Naqd farqi', c.difference],
    ];
    if (c.countedCard != null) {
        rows.push(['Terminal — sanalgan', c.countedCard]);
        rows.push(['Terminal — tizimda', c.expectedCard ?? 0]);
        rows.push(['Terminal farqi', c.countedCard - (c.expectedCard ?? 0)]);
    }
    if (c.countedClick != null) {
        rows.push(['Click — sanalgan', c.countedClick]);
        rows.push(['Click — tizimda', c.expectedClick ?? 0]);
        rows.push(['Click farqi', c.countedClick - (c.expectedClick ?? 0)]);
    }
    rows.push(['Yopgan xodim', c.closedByName || '-']);
    rows.push(['Yopilgan vaqt', new Date(c.closedAt).toLocaleString('uz-UZ')]);
    if (c.note) rows.push(['Izoh', c.note]);
    if (status.changedAfterClose) {
        rows.push(['DIQQAT', 'Yopilgandan keyin bu kunga yangi yozuv qo\'shilgan']);
        rows.push(['Hozirgi hisob bo\'yicha farq', status.currentDifference]);
    }
    return rows;
}

/** Inkassatsiya / qaytarish / kassaga solish varag'i */
function movementSheet(movements: CashMovement[]): { rows: Sheet; widths: number[] } {
    const rows: Sheet = [['Sana', 'Turi', 'Usul', 'Summa (UZS)', 'Kim', 'Izoh']];
    movements.forEach(m => {
        rows.push([
            formatDateLabel((m.date || '').split('T')[0]),
            CASH_MOVEMENT_LABELS[m.type] || m.type,
            getPaymentMethodLabel(m.method),
            m.amount || 0,
            m.createdByName || '',
            m.note || '',
        ]);
    });
    return { rows, widths: [12, 30, 16, 16, 22, 30] };
}

function expenseSheet(expenses: Expense[], doctors: Doctor[]): { rows: Sheet; widths: number[] } {
    const rows: Sheet = [['Sana', 'Kategoriya', 'Nomi', 'Shifokor', 'Usul', 'Summa (UZS)', 'Izoh']];
    expenses.forEach(e => {
        const doctor = e.doctorId ? doctors.find(d => d.id === e.doctorId) : undefined;
        rows.push([
            formatDateLabel((e.date || '').split('T')[0]),
            EXPENSE_CATEGORY_LABELS[e.category] || e.category,
            e.title || '',
            doctor ? `${doctor.lastName} ${doctor.firstName}` : '-',
            getPaymentMethodLabel(e.method),
            e.amount || 0,
            e.note || '',
        ]);
    });
    if (expenses.length > 0) {
        rows.push([]);
        rows.push(['JAMI', '', '', '', '', expenses.reduce((s, e) => s + (e.amount || 0), 0), '']);
    }
    return { rows, widths: [12, 18, 30, 24, 18, 16, 28] };
}

// ─────────────────────────────────────────────────────────────────────────────
// KUNLIK EKSPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bir kunlik kassa varag'i: 3 varaq — Yakun / Matritsa (bemor × shifokor) / Xarajatlar.
 */
export function exportCashBookDay(
    day: CashBookDay,
    doctors: Doctor[],
    clinicName?: string,
    closure?: CashClosureStatus
) {
    const wb = XLSX.utils.book_new();
    const dateLabel = formatDateLabel(day.date);

    // --- 1. Yakun ---
    const summary: Sheet = [
        ['KASSA HISOBOTI'],
        [clinicName || '', ''],
        ['Sana', dateLabel],
        ['Tuzilgan', new Date().toLocaleString('uz-UZ')],
        [],
        ...summaryBlock(day.totals),
        ...closureBlock(closure),
        [],
        ['SHIFOKORLAR BO\'YICHA'],
        ['Shifokor', 'Jami', 'Naqd', 'Naqdsiz'],
        ...day.doctorColumns
            .filter(c => c.total !== 0)
            .map(c => [c.name, c.total, c.cash, c.nonCash] as Cell[]),
        ['JAMI', day.totals.gross, day.totals.cashIn, day.totals.nonCashIn],
    ];
    XLSX.utils.book_append_sheet(wb, sheetFrom(summary, [40, 16, 16, 16]), 'Yakun');

    // --- 2. Matritsa: bemor × shifokor (klient Exceli ko'rinishi) ---
    const doctorCols = day.doctorColumns;
    const matrix: Sheet = [
        [dateLabel, 'Vaqt', ...doctorCols.map(c => c.name), 'Usul', 'Xizmat', 'Jami'],
    ];

    day.rows.forEach(row => {
        const cells: Cell[] = [row.patientName, row.time || ''];
        doctorCols.forEach(col => {
            cells.push(col.id === row.doctorId && row.isMoneyIn ? row.amount : null);
        });
        cells.push(getPaymentMethodLabel(row.method));
        cells.push(row.service || '');
        cells.push(row.isMoneyIn ? row.amount : 0);
        matrix.push(cells);
    });

    matrix.push([]);
    matrix.push(['JAMI', '', ...doctorCols.map(c => c.total), '', '', day.totals.gross]);
    matrix.push([]);

    // Excel varag'idagi tanish yakun qatorlari
    const tail: [string, number][] = [
        ['Jami tushum', day.totals.gross],
        ['Xarajat', day.totals.expenseTotal],
    ];
    PAYMENT_METHODS.filter(m => m.key !== 'Cash' && (day.totals.byMethod[m.key] || 0) !== 0)
        .forEach(m => tail.push([m.label, day.totals.byMethod[m.key]]));
    tail.push(['KASSADA QOLDI (naqd)', day.totals.drawer]);

    tail.forEach(([label, value]) => {
        const row: Cell[] = [label];
        while (row.length < doctorCols.length + 1) row.push(null);
        row.push(value);
        matrix.push(row);
    });

    const matrixWidths = [30, 8, ...doctorCols.map(() => 14), 18, 26, 14];
    XLSX.utils.book_append_sheet(wb, sheetFrom(matrix, matrixWidths, { skipMoneyCols: [0, 1] }), 'Kunlik varaq');

    // --- 3. Xarajatlar ---
    const { rows: expRows, widths: expWidths } = expenseSheet(day.expenses, doctors);
    XLSX.utils.book_append_sheet(wb, sheetFrom(expRows, expWidths), 'Xarajatlar');

    // --- 4. Kassa harakatlari (inkassatsiya / qaytarish) ---
    if (day.movements.length > 0) {
        const { rows: mvRows, widths: mvWidths } = movementSheet(day.movements);
        XLSX.utils.book_append_sheet(wb, sheetFrom(mvRows, mvWidths), 'Kassa harakatlari');
    }

    XLSX.writeFile(wb, `kassa_${day.date}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// OYLIK EKSPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Oylik kassa daftari: 5 varaq —
 * Yakun / Kunlik daftar / Shifokorlar (kun × shifokor) / To'lovlar / Xarajatlar.
 */
export function exportCashBookMonth(
    month: CashBookMonth,
    allDays: CashBookDay[],
    doctors: Doctor[],
    clinicName?: string,
    closures: CashRegisterDay[] = []
) {
    const wb = XLSX.utils.book_new();
    const monthLabel = formatMonthLabel(month.month);
    const doctorCols = month.doctorColumns;
    const closureByDate = new Map(closures.map(c => [(c.date || '').split('T')[0], c]));

    // --- 1. Yakun ---
    const doctorTotals = new Map<string, number>();
    month.days.forEach(d => {
        Object.entries(d.byDoctor).forEach(([id, amount]) => {
            doctorTotals.set(id, (doctorTotals.get(id) || 0) + amount);
        });
    });

    const activeDays = month.days.filter(d => d.totals.gross > 0).length;
    const summary: Sheet = [
        ['OYLIK KASSA HISOBOTI'],
        [clinicName || '', ''],
        ['Oy', monthLabel],
        ['Tuzilgan', new Date().toLocaleString('uz-UZ')],
        [],
        ...summaryBlock(month.totals),
        [],
        ['KO\'RSATKICHLAR'],
        ['To\'lovlar soni', month.totals.paymentCount],
        ['Ishlangan kunlar', activeDays],
        ['O\'rtacha kunlik tushum', activeDays ? Math.round(month.totals.gross / activeDays) : 0],
        ['O\'rtacha chek', month.totals.paymentCount ? Math.round(month.totals.gross / month.totals.paymentCount) : 0],
        ['Yopilgan kunlar', month.days.filter(d => closureByDate.has(d.date)).length],
        ['Kassa farqi (yopilgan kunlar bo\'yicha)',
            month.days.reduce((s, d) => s + (closureByDate.get(d.date)?.difference || 0), 0)],
        [],
        ['SHIFOKORLAR BO\'YICHA'],
        ['Shifokor', 'Jami', 'Ulushi (%)'],
        ...doctorCols
            .filter(c => (doctorTotals.get(c.id) || 0) !== 0)
            .map(c => {
                const total = doctorTotals.get(c.id) || 0;
                const pct = month.totals.gross ? Math.round((total / month.totals.gross) * 1000) / 10 : 0;
                return [c.name, total, pct] as Cell[];
            }),
        ['JAMI', month.totals.gross, 100],
    ];
    XLSX.utils.book_append_sheet(wb, sheetFrom(summary, [40, 18, 14]), 'Yakun');

    // --- 2. Kunlik daftar ---
    const methodKeys = PAYMENT_METHODS.filter(m => m.key !== 'Balance');
    const ledger: Sheet = [
        [
            'Kun', 'Sana', ...methodKeys.map(m => m.label),
            'Jami tushum', 'Xarajat', 'Kassada qoldi',
            'Sanalgan', 'Farq', 'Holat',
        ],
    ];
    month.days.forEach(d => {
        const c = closureByDate.get(d.date);
        const changed = c ? Math.abs((c.expectedCash || 0) - d.totals.drawer) > 1 : false;
        ledger.push([
            d.day,
            formatDateLabel(d.date),
            ...methodKeys.map(m => d.totals.byMethod[m.key] || 0),
            d.totals.gross,
            d.totals.expenseTotal,
            d.totals.drawer,
            c ? c.countedCash : null,
            c ? (changed ? c.countedCash - d.totals.drawer : c.difference) : null,
            c ? (changed ? "Yopilgan (keyin o'zgargan)" : 'Yopilgan') : (d.hasActivity ? 'Ochiq' : null),
        ]);
    });
    ledger.push([]);
    const closedCount = month.days.filter(d => closureByDate.has(d.date)).length;
    const activeCount = month.days.filter(d => d.hasActivity).length;
    ledger.push([
        'JAMI',
        '',
        ...methodKeys.map(m => month.totals.byMethod[m.key] || 0),
        month.totals.gross,
        month.totals.expenseTotal,
        month.totals.drawer,
        null,
        null,
        `${closedCount} / ${activeCount} yopilgan`,
    ]);
    const ledgerWidths = [6, 13, ...methodKeys.map(() => 16), 16, 14, 16, 16, 14, 26];
    XLSX.utils.book_append_sheet(wb, sheetFrom(ledger, ledgerWidths, { skipMoneyCols: [1] }), 'Kunlik daftar');

    // --- 3. Shifokorlar: kun × shifokor matritsasi ---
    const doctorSheet: Sheet = [
        ['Kun', 'Sana', ...doctorCols.map(c => c.name), 'Jami'],
    ];
    month.days.forEach(d => {
        doctorSheet.push([
            d.day,
            formatDateLabel(d.date),
            ...doctorCols.map(c => d.byDoctor[c.id] || 0),
            d.totals.gross,
        ]);
    });
    doctorSheet.push([]);
    doctorSheet.push([
        'JAMI',
        '',
        ...doctorCols.map(c => doctorTotals.get(c.id) || 0),
        month.totals.gross,
    ]);
    XLSX.utils.book_append_sheet(
        wb,
        sheetFrom(doctorSheet, [6, 13, ...doctorCols.map(() => 16), 16], { skipMoneyCols: [1] }),
        'Shifokorlar'
    );

    // --- 4. To'lovlar (batafsil) ---
    const payments: Sheet = [
        ['Sana', 'Vaqt', 'Bemor', 'Shifokor', 'Xizmat', 'Usul', 'Summa (UZS)', 'Kassaga kirdi', 'Qabul qildi'],
    ];
    allDays.forEach(day => {
        day.rows.forEach(row => {
            payments.push([
                formatDateLabel(day.date),
                row.time || '',
                row.patientName,
                row.doctorName,
                row.service,
                getPaymentMethodLabel(row.method),
                row.amount,
                row.isMoneyIn ? 'Ha' : "Yo'q (avansdan)",
                row.receivedByName || '',
            ]);
        });
    });
    const paymentCount = payments.length - 1;
    if (paymentCount > 0) {
        payments.push([]);
        payments.push(['JAMI', '', '', '', '', '', month.totals.gross + month.totals.fromBalance, '', '']);
    }
    XLSX.utils.book_append_sheet(
        wb,
        sheetFrom(payments, [12, 8, 28, 24, 28, 18, 16, 18, 20], {
            skipMoneyCols: [0, 1],
            autoFilterRef: paymentCount > 0 ? `A1:I${paymentCount + 1}` : undefined,
        }),
        "To'lovlar"
    );

    // --- 5. Xarajatlar ---
    const monthExpenses = allDays.flatMap(d => d.expenses);
    const { rows: expRows, widths: expWidths } = expenseSheet(monthExpenses, doctors);
    XLSX.utils.book_append_sheet(wb, sheetFrom(expRows, expWidths), 'Xarajatlar');

    // --- 6. Kassa harakatlari ---
    const monthMovements = allDays.flatMap(d => d.movements);
    if (monthMovements.length > 0) {
        const { rows: mvRows, widths: mvWidths } = movementSheet(monthMovements);
        XLSX.utils.book_append_sheet(wb, sheetFrom(mvRows, mvWidths), 'Kassa harakatlari');
    }

    XLSX.writeFile(wb, `kassa_${month.month}.xlsx`);
}
