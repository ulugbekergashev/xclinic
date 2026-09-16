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
import { tr } from '../context/LanguageContext';

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
        [tr('cashbookexport.kassaga_tushdi')],
        [tr('finance.cash.totalRevenue'), totals.gross],
        ...methodBreakdownRows(totals),
        [],
        [tr('cashbookexport.kassadan_chiqdi')],
        [tr('cashbookexport.jami_xarajat'), totals.expenseTotal],
        [tr('cashbookexport.naqd_bilan'), totals.cashExpense],
        [tr('cashbookexport.naqdsiz_karta_hisob'), totals.nonCashExpense],
        [],
        [tr('cashbookexport.naqd_yashik')],
        [tr('finance.cash.openingBalance'), totals.openingCash],
        [tr('cashbookexport.naqd_tushum'), totals.cashIn],
        [tr('cashbookexport.naqd_xarajat'), -totals.cashExpense],
    ];

    if (totals.cashInManual) rows.push([tr('cashbookexport.kassaga_solindi'), totals.cashInManual]);
    if (totals.refundCash) rows.push([tr('cashbookexport.bemorga_qaytarildi'), -totals.refundCash]);
    if (totals.encashment) rows.push([tr('cashbookexport.inkassatsiya'), -totals.encashment]);
    rows.push(['= YASHIKDA BO\'LISHI KERAK', totals.drawer]);
    rows.push([]);
    rows.push([tr('cashbookexport.naqdsiz')]);
    rows.push([tr('cashbookexport.karta_click_otkazma_sugurta'), totals.nonCashIn]);

    if (totals.fromBalance > 0) {
        rows.push([], [tr('cashbookexport.malumot_uchun')], [tr('cashbookexport.avansdan_yechilgan_kassaga_kirmagan'), totals.fromBalance]);
    }
    if (totals.unpaid > 0) {
        if (totals.fromBalance <= 0) rows.push([], [tr('cashbookexport.malumot_uchun')]);
        rows.push([tr('cashbookexport.qarzga_yozilgan_tolanmagan'), totals.unpaid]);
    }

    return rows;
}

/** Kunlik hisobotdagi «kun yopildi» bloki */
function closureBlock(status?: CashClosureStatus): Sheet {
    if (!status?.closed || !status.closure) {
        return [[], [tr('cashbookexport.kun_yopilmagan')]];
    }
    const c = status.closure;
    const rows: Sheet = [
        [],
        [tr('cashbookexport.kun_yopildi')],
        [tr('cashbookexport.smena'), c.shift || 1],
        [tr('cashbookexport.smena_boshidagi_qoldiq'), c.openingCash || 0],
        [tr('cashbookexport.kassir_sanagan_naqd'), c.countedCash],
        [tr('cashbookexport.hisob_boyicha_naqd'), c.expectedCash],
        [tr('cashbookexport.naqd_farqi'), c.difference],
    ];
    if (c.countedCard != null) {
        rows.push([tr('cashbookexport.terminal_sanalgan'), c.countedCard]);
        rows.push([tr('cashbookexport.terminal_tizimda'), c.expectedCard ?? 0]);
        rows.push([tr('cashbookexport.terminal_farqi'), c.countedCard - (c.expectedCard ?? 0)]);
    }
    if (c.countedClick != null) {
        rows.push([tr('cashbookexport.click_sanalgan'), c.countedClick]);
        rows.push(['Click — tizimda', c.expectedClick ?? 0]);
        rows.push([tr('cashbookexport.click_farqi'), c.countedClick - (c.expectedClick ?? 0)]);
    }
    rows.push([tr('cashbookexport.yopgan_xodim'), c.closedByName || '-']);
    rows.push([tr('cashbookexport.yopilgan_vaqt'), new Date(c.closedAt).toLocaleString('uz-UZ')]);
    if (c.note) rows.push([tr('cashbookexport.izoh'), c.note]);
    if (status.changedAfterClose) {
        rows.push(['DIQQAT', tr('cashbookexport.yopilgandan_keyin_bu_kunga')]);
        rows.push([tr('cashbookexport.hozirgi_hisob_boyicha_farq'), status.currentDifference]);
    }
    return rows;
}

/** Inkassatsiya / qaytarish / kassaga solish varag'i */
function movementSheet(movements: CashMovement[]): { rows: Sheet; widths: number[] } {
    const rows: Sheet = [[tr('ui.sana'), tr('inp.kind'), tr('finance.table.method'), tr('cashbookexport.summa_uzs'), tr('ui.kim'), tr('cashbookexport.izoh')]];
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
    const rows: Sheet = [[tr('ui.sana'), tr('ui.kategoriya'), tr('ui.nomi'), tr('ui.shifokor_2'), tr('finance.table.method'), tr('cashbookexport.summa_uzs'), tr('cashbookexport.izoh')]];
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
        rows.push([tr('cashbook.jami'), '', '', '', '', expenses.reduce((s, e) => s + (e.amount || 0), 0), '']);
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
        [tr('cashbookexport.kassa_hisoboti')],
        [clinicName || '', ''],
        [tr('ui.sana'), dateLabel],
        ['Tuzilgan', new Date().toLocaleString('uz-UZ')],
        [],
        ...summaryBlock(day.totals),
        ...closureBlock(closure),
        [],
        [tr('cashbookexport.shifokorlar_boyicha')],
        [tr('ui.shifokor_2'), tr('ui.jami'), tr('ui.naqd'), tr('finance.cash.cashless')],
        ...day.doctorColumns
            .filter(c => c.total !== 0)
            .map(c => [c.name, c.total, c.cash, c.nonCash] as Cell[]),
        [tr('cashbook.jami'), day.totals.gross, day.totals.cashIn, day.totals.nonCashIn],
    ];
    XLSX.utils.book_append_sheet(wb, sheetFrom(summary, [40, 16, 16, 16]), 'Yakun');

    // --- 2. Matritsa: bemor × shifokor (klient Exceli ko'rinishi) ---
    const doctorCols = day.doctorColumns;
    const matrix: Sheet = [
        [dateLabel, tr('ui.vaqt'), ...doctorCols.map(c => c.name), tr('finance.table.method'), tr('ui.xizmat'), tr('ui.jami')],
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
    matrix.push([tr('cashbook.jami'), '', ...doctorCols.map(c => c.total), '', '', day.totals.gross]);
    matrix.push([]);

    // Excel varag'idagi tanish yakun qatorlari
    const tail: [string, number][] = [
        [tr('finance.cash.totalRevenue'), day.totals.gross],
        [tr('ui.xarajat'), day.totals.expenseTotal],
    ];
    PAYMENT_METHODS.filter(m => m.key !== 'Cash' && (day.totals.byMethod[m.key] || 0) !== 0)
        .forEach(m => tail.push([m.label, day.totals.byMethod[m.key]]));
    tail.push([tr('cashbookexport.kassada_qoldi_naqd'), day.totals.drawer]);

    tail.forEach(([label, value]) => {
        const row: Cell[] = [label];
        while (row.length < doctorCols.length + 1) row.push(null);
        row.push(value);
        matrix.push(row);
    });

    const matrixWidths = [30, 8, ...doctorCols.map(() => 14), 18, 26, 14];
    XLSX.utils.book_append_sheet(wb, sheetFrom(matrix, matrixWidths, { skipMoneyCols: [0, 1] }), tr('cashbookexport.kunlik_varaq'));

    // --- 3. Xarajatlar ---
    const { rows: expRows, widths: expWidths } = expenseSheet(day.expenses, doctors);
    XLSX.utils.book_append_sheet(wb, sheetFrom(expRows, expWidths), tr('cashbookexport.xarajatlar'));

    // --- 4. Kassa harakatlari (inkassatsiya / qaytarish) ---
    if (day.movements.length > 0) {
        const { rows: mvRows, widths: mvWidths } = movementSheet(day.movements);
        XLSX.utils.book_append_sheet(wb, sheetFrom(mvRows, mvWidths), tr('finance.cash.cashMoves'));
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
        [tr('cashbookexport.oylik_kassa_hisoboti')],
        [clinicName || '', ''],
        ['Oy', monthLabel],
        ['Tuzilgan', new Date().toLocaleString('uz-UZ')],
        [],
        ...summaryBlock(month.totals),
        [],
        [tr('cashbookexport.korsatkichlar')],
        [tr('cashbookexport.tolovlar_soni'), month.totals.paymentCount],
        [tr('cashbookexport.ishlangan_kunlar'), activeDays],
        [tr('cashbookexport.ortacha_kunlik_tushum'), activeDays ? Math.round(month.totals.gross / activeDays) : 0],
        [tr('finance.report.avgCheck'), month.totals.paymentCount ? Math.round(month.totals.gross / month.totals.paymentCount) : 0],
        [tr('cashbookexport.yopilgan_kunlar'), month.days.filter(d => closureByDate.has(d.date)).length],
        [tr('cashbookexport.kassa_farqi_yopilgan_kunlar'),
            month.days.reduce((s, d) => s + (closureByDate.get(d.date)?.difference || 0), 0)],
        [],
        [tr('cashbookexport.shifokorlar_boyicha')],
        ['Shifokor', tr('ui.jami'), tr('cashbookexport.ulushi')],
        ...doctorCols
            .filter(c => (doctorTotals.get(c.id) || 0) !== 0)
            .map(c => {
                const total = doctorTotals.get(c.id) || 0;
                const pct = month.totals.gross ? Math.round((total / month.totals.gross) * 1000) / 10 : 0;
                return [c.name, total, pct] as Cell[];
            }),
        [tr('cashbook.jami'), month.totals.gross, 100],
    ];
    XLSX.utils.book_append_sheet(wb, sheetFrom(summary, [40, 18, 14]), 'Yakun');

    // --- 2. Kunlik daftar ---
    const methodKeys = PAYMENT_METHODS.filter(m => m.key !== 'Balance');
    const ledger: Sheet = [
        [
            tr('cashbookexport.kun'), tr('ui.sana'), ...methodKeys.map(m => m.label),
            tr('finance.cash.totalRevenue'), tr('ui.xarajat'), tr('finance.cash.leftInDrawer'),
            tr('ui.sanalgan'), tr('ui.farq'), tr('inventory.thStatus'),
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
            c ? (changed ? tr('cashbookexport.yopilgan_keyin_ozgargan') : tr('cashbookexport.yopilgan')) : (d.hasActivity ? tr('cashbookexport.ochiq') : null),
        ]);
    });
    ledger.push([]);
    const closedCount = month.days.filter(d => closureByDate.has(d.date)).length;
    const activeCount = month.days.filter(d => d.hasActivity).length;
    ledger.push([
        tr('cashbook.jami'),
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
    XLSX.utils.book_append_sheet(wb, sheetFrom(ledger, ledgerWidths, { skipMoneyCols: [1] }), tr('finance.cash.dayBook'));

    // --- 3. Shifokorlar: kun × shifokor matritsasi ---
    const doctorSheet: Sheet = [
        [tr('cashbookexport.kun'), tr('ui.sana'), ...doctorCols.map(c => c.name), tr('ui.jami')],
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
        tr('cashbook.jami'),
        '',
        ...doctorCols.map(c => doctorTotals.get(c.id) || 0),
        month.totals.gross,
    ]);
    XLSX.utils.book_append_sheet(
        wb,
        sheetFrom(doctorSheet, [6, 13, ...doctorCols.map(() => 16), 16], { skipMoneyCols: [1] }),
        tr('ui.shifokorlar')
    );

    // --- 4. To'lovlar (batafsil) ---
    const payments: Sheet = [
        [tr('ui.sana'), tr('ui.vaqt'), tr('ui.bemor'), tr('ui.shifokor_2'), tr('ui.xizmat'), tr('finance.table.method'), tr('cashbookexport.summa_uzs'), tr('cashbookexport.kassaga_kirdi'), tr('patients.details.payments.receivedBy')],
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
                row.isMoneyIn ? 'Ha' : tr('cashbookexport.yoq_avansdan'),
                row.receivedByName || '',
            ]);
        });
    });
    const paymentCount = payments.length - 1;
    if (paymentCount > 0) {
        payments.push([]);
        payments.push([tr('cashbook.jami'), '', '', '', '', '', month.totals.gross + month.totals.fromBalance, '', '']);
    }
    XLSX.utils.book_append_sheet(
        wb,
        sheetFrom(payments, [12, 8, 28, 24, 28, 18, 16, 18, 20], {
            skipMoneyCols: [0, 1],
            autoFilterRef: paymentCount > 0 ? `A1:I${paymentCount + 1}` : undefined,
        }),
        tr('cashbookexport.tolovlar')
    );

    // --- 5. Xarajatlar ---
    const monthExpenses = allDays.flatMap(d => d.expenses);
    const { rows: expRows, widths: expWidths } = expenseSheet(monthExpenses, doctors);
    XLSX.utils.book_append_sheet(wb, sheetFrom(expRows, expWidths), tr('cashbookexport.xarajatlar'));

    // --- 6. Kassa harakatlari ---
    const monthMovements = allDays.flatMap(d => d.movements);
    if (monthMovements.length > 0) {
        const { rows: mvRows, widths: mvWidths } = movementSheet(monthMovements);
        XLSX.utils.book_append_sheet(wb, sheetFrom(mvRows, mvWidths), tr('finance.cash.cashMoves'));
    }

    XLSX.writeFile(wb, `kassa_${month.month}.xlsx`);
}
