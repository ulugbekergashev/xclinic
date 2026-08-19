import { Transaction, Expense, Doctor, PaymentMethod, CashRegisterDay, CashMovement } from '../types';
import { findDoctorForTransaction } from './financialCalculations';
import {
    PAYMENT_METHODS,
    isCashDrawerMethod,
    isMoneyInMethod,
} from './paymentMethods';

// ─────────────────────────────────────────────────────────────────────────────
// KASSA KITOBI — faqat haqiqiy pul harakati.
//
// Moliya sahifasidan farqi: u hisoblangan daromadni (accrual) ko'rsatadi, bu esa
// kassaga nima kirib, nima chiqqanini. Ikkalasi ataylab boshqa raqam beradi:
//   • 'Balance' turi — bemor avansidan yechilgan, bugun kassaga yangi pul KIRMAYDI.
//   • 'Avans' xizmati — pul bugun kirdi, garchi xizmat keyinroq bajarilsa ham.
//   • Qarzga yozilgan (Pending) to'lovlar kassaga umuman kirmaydi.
//
// "Kassada qoldi" = naqd tushum − naqd xarajat. Klient Excelidagi «Остаток» formulasi
// (Jami − Rasxod − Terminal − Click) shu bilan bir xil natija beradi.
// ─────────────────────────────────────────────────────────────────────────────

export const UNASSIGNED_DOCTOR_ID = '__unassigned__';
export const ADVANCE_COLUMN_ID = '__advance__';

export interface CashBookRow {
    id: string;
    /** "14:32" — eski yozuvlarda vaqt saqlanmagan, shunda null */
    time: string | null;
    /** Tartiblash uchun daqiqa (vaqti yo'q qatorlar oxirida turadi) */
    sortKey: number;
    patientName: string;
    patientId?: string;
    service: string;
    method: PaymentMethod;
    amount: number;
    doctorId: string;
    doctorName: string;
    /** Pulni kim qabul qildi (eski yozuvlarda yo'q) */
    receivedByName: string | null;
    /** Avans depoziti — shifokorning ishi emas, alohida ustunda turadi */
    isAdvance: boolean;
    /** Kassaga pul kirdimi ('Balance' — yo'q) */
    isMoneyIn: boolean;
    isCash: boolean;
}

export interface CashBookDoctorColumn {
    id: string;
    name: string;
    total: number;
    cash: number;
    nonCash: number;
}

export interface CashBookTotals {
    /** Kassaga tushgan jami (Excel «Общая») — avansdan yechilganlarsiz */
    gross: number;
    byMethod: Record<string, number>;
    cashIn: number;
    nonCashIn: number;
    expenseTotal: number;
    cashExpense: number;
    nonCashExpense: number;
    /** Smena boshidagi naqd qoldiq (oldingi yopilishdan) */
    openingCash: number;
    /** Kassadan olib ketilgan naqd (inkassatsiya) */
    encashment: number;
    /** Bemorga qaytarilgan naqd */
    refundCash: number;
    /** Kassaga qo'lda solingan naqd */
    cashInManual: number;
    /** Shu kun ichida naqd yashik o'zgarishi: cashIn − cashExpense − encashment − refund + cashIn */
    netCashFlow: number;
    /** Yashikda hozir turishi kerak bo'lgan naqd: openingCash + netCashFlow */
    drawer: number;
    /** Avansdan yechilgan — kassaga kirmaydi, ma'lumot uchun */
    fromBalance: number;
    /** Shu kunda qarzga yozilgani (status Pending/Overdue) */
    unpaid: number;
    paymentCount: number;
}

export interface CashBookDay {
    date: string;
    /** Qaysi smena ko'rsatilyapti (smena ajratilmagan bo'lsa undefined) */
    shift?: number;
    shiftWindow?: ShiftWindow;
    rows: CashBookRow[];
    doctorColumns: CashBookDoctorColumn[];
    expenses: Expense[];
    movements: CashMovement[];
    /** Ochilish qoldig'i qaysi yopilishdan olingani (null — hali yopilmagan) */
    openingAnchorDate: string | null;
    totals: CashBookTotals;
}

const EMPTY_BY_METHOD = (): Record<string, number> => {
    const acc: Record<string, number> = {};
    PAYMENT_METHODS.forEach(m => { acc[m.key] = 0; });
    return acc;
};

const emptyTotals = (): CashBookTotals => ({
    gross: 0,
    byMethod: EMPTY_BY_METHOD(),
    cashIn: 0,
    nonCashIn: 0,
    expenseTotal: 0,
    cashExpense: 0,
    nonCashExpense: 0,
    openingCash: 0,
    encashment: 0,
    refundCash: 0,
    cashInManual: 0,
    netCashFlow: 0,
    drawer: 0,
    fromBalance: 0,
    unpaid: 0,
    paymentCount: 0,
});

/** ISO sanani (yoki DateTime satrini) 'YYYY-MM-DD' ga keltiradi */
const dayOf = (value?: string | null): string => (value || '').split('T')[0];

/** createdAt DateTime satridan lokal "HH:MM" chiqaradi */
function extractTime(createdAt?: string | null): { label: string | null; minutes: number } {
    if (!createdAt) return { label: null, minutes: Number.MAX_SAFE_INTEGER };
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return { label: null, minutes: Number.MAX_SAFE_INTEGER };
    const h = d.getHours();
    const m = d.getMinutes();
    return {
        label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        minutes: h * 60 + m,
    };
}

function doctorLabel(doctor: Doctor): string {
    return `${doctor.lastName} ${doctor.firstName}`.trim();
}

/**
 * Ustunlar ro'yxati — shifokorlar barcha kunlarda bir xil tartibda turishi uchun
 * doctors ro'yxatidan quriladi. "Belgilanmagan" ustuni faqat kerak bo'lganda qo'shiladi.
 */
function buildDoctorColumns(doctors: Doctor[], rows: CashBookRow[]): CashBookDoctorColumn[] {
    const columns = new Map<string, CashBookDoctorColumn>();

    doctors.forEach(d => {
        columns.set(d.id, { id: d.id, name: doctorLabel(d), total: 0, cash: 0, nonCash: 0 });
    });

    rows.forEach(row => {
        if (!row.isMoneyIn) return;
        let col = columns.get(row.doctorId);
        if (!col) {
            // O'chirilgan shifokor yoki biriktirilmagan to'lov — summalar yo'qolmasligi uchun ustun qo'shamiz
            col = { id: row.doctorId, name: row.doctorName, total: 0, cash: 0, nonCash: 0 };
            columns.set(row.doctorId, col);
        }
        col.total += row.amount;
        if (row.isCash) col.cash += row.amount;
        else col.nonCash += row.amount;
    });

    const list = Array.from(columns.values());
    // Avans va "Belgilanmagan" har doim oxirida
    const rank = (id: string) => (id === ADVANCE_COLUMN_ID ? 2 : id === UNASSIGNED_DOCTOR_ID ? 1 : 0);
    return list.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'uz'));
}

function toRow(tx: Transaction, doctors: Doctor[]): CashBookRow {
    const doctor = findDoctorForTransaction(tx, doctors);
    const { label, minutes } = extractTime(tx.createdAt);
    const method = (tx.type || 'Cash') as PaymentMethod;
    const moneyIn = isMoneyInMethod(method);
    // Avans — bemor oldindan pul qo'ygan, hech bir shifokor uni ishlab topmagan.
    // Shifokor ustuniga qo'shilsa, uning tushumi soxta ko'payib ketadi.
    const isAdvance = (tx.service || '').trim().toLowerCase() === 'avans';

    return {
        id: tx.id,
        time: label,
        sortKey: minutes,
        patientName: tx.patientName || '—',
        patientId: tx.patientId,
        service: tx.service || '',
        method,
        amount: tx.amount || 0,
        doctorId: isAdvance ? ADVANCE_COLUMN_ID : (doctor?.id ?? UNASSIGNED_DOCTOR_ID),
        doctorName: isAdvance ? 'Avans' : (doctor ? doctorLabel(doctor) : (tx.doctorName?.trim() || 'Belgilanmagan')),
        receivedByName: tx.receivedByName || null,
        isAdvance,
        isMoneyIn: moneyIn,
        isCash: moneyIn && isCashDrawerMethod(method),
    };
}

function accumulate(totals: CashBookTotals, row: CashBookRow) {
    if (!row.isMoneyIn) {
        totals.fromBalance += row.amount;
        totals.byMethod[row.method] = (totals.byMethod[row.method] || 0) + row.amount;
        return;
    }
    totals.gross += row.amount;
    totals.paymentCount += 1;
    totals.byMethod[row.method] = (totals.byMethod[row.method] || 0) + row.amount;
    if (row.isCash) totals.cashIn += row.amount;
    else totals.nonCashIn += row.amount;
}

function accumulateExpense(totals: CashBookTotals, expense: Expense) {
    const amount = expense.amount || 0;
    totals.expenseTotal += amount;
    if (isCashDrawerMethod(expense.method)) totals.cashExpense += amount;
    else totals.nonCashExpense += amount;
}

/** Inkassatsiya / qaytarish / kassaga solish — faqat naqd yashikka ta'sir qiladi */
function accumulateMovement(totals: CashBookTotals, m: CashMovement) {
    if (!isCashDrawerMethod(m.method)) return;
    const amount = m.amount || 0;
    if (m.type === 'Encashment') totals.encashment += amount;
    else if (m.type === 'Refund') totals.refundCash += amount;
    else if (m.type === 'CashIn') totals.cashInManual += amount;
}

/** Kun ichidagi naqd oqimi va yakuniy qoldiqni hisoblaydi */
function finalizeCash(totals: CashBookTotals) {
    totals.netCashFlow =
        totals.cashIn - totals.cashExpense - totals.encashment - totals.refundCash + totals.cashInManual;
    totals.drawer = totals.openingCash + totals.netCashFlow;
}

/**
 * Smena boshidagi naqd qoldiq.
 *
 * Ancher — oxirgi YOPILGAN smena: kassir o'sha paytda pulni haqiqatan sanagan,
 * shuning uchun tarixni boshidan yig'ishdan ko'ra o'sha raqamdan boshlagan ishonchli.
 * Hech qachon yopilmagan bo'lsa 0 dan boshlanadi — ya'ni birinchi yopilishgacha
 * "Kassada qoldi" faqat shu kunning harakati bo'ladi (avvalgi xatti-harakat).
 */
export function computeOpeningCash(
    date: string,
    transactions: Transaction[],
    expenses: Expense[],
    closures: CashRegisterDay[],
    movements: CashMovement[]
): { opening: number; anchorDate: string | null } {
    const past = closures
        .filter(c => dayOf(c.date) < date)
        .sort((a, b) => (dayOf(b.date).localeCompare(dayOf(a.date)) || (b.shift || 1) - (a.shift || 1)));

    const anchor = past[0];
    if (!anchor) return { opening: 0, anchorDate: null };

    const anchorDate = dayOf(anchor.date);
    let opening = anchor.countedCash || 0;

    // Anker kunidan KEYIN va so'ralgan kundan OLDIN bo'lgan naqd harakati
    const between = (d?: string | null) => {
        const day = dayOf(d);
        return day > anchorDate && day < date;
    };

    transactions.forEach(t => {
        if (t.status !== 'Paid' || !between(t.date)) return;
        const method = (t.type || 'Cash') as PaymentMethod;
        if (isMoneyInMethod(method) && isCashDrawerMethod(method)) opening += t.amount || 0;
    });
    expenses.forEach(e => {
        if (!between(e.date)) return;
        if (isCashDrawerMethod(e.method)) opening -= e.amount || 0;
    });
    movements.forEach(m => {
        if (!between(m.date) || !isCashDrawerMethod(m.method)) return;
        if (m.type === 'Encashment' || m.type === 'Refund') opening -= m.amount || 0;
        else if (m.type === 'CashIn') opening += m.amount || 0;
    });

    return { opening, anchorDate };
}

/**
 * Bir kunlik kassa varag'i: bemor × shifokor matritsasi + kunlik yakun.
 */
export function buildCashBookDay(
    date: string,
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[],
    closures: CashRegisterDay[] = [],
    movements: CashMovement[] = [],
    /** Berilsa — faqat shu smena oynasidagi yozuvlar hisoblanadi */
    shiftWindow?: ShiftWindow
): CashBookDay {
    const totals = emptyTotals();
    const keep = (ts?: string | null) => !shiftWindow || inWindow(ts, shiftWindow);

    const dayTransactions = transactions.filter(t => t && dayOf(t.date) === date && keep(t.createdAt));

    const rows = dayTransactions
        .filter(t => t.status === 'Paid')
        .map(t => toRow(t, doctors))
        .sort((a, b) => a.sortKey - b.sortKey || a.patientName.localeCompare(b.patientName, 'uz'));

    rows.forEach(row => accumulate(totals, row));

    dayTransactions
        .filter(t => t.status !== 'Paid')
        .forEach(t => { totals.unpaid += t.amount || 0; });

    const dayExpenses = expenses
        .filter(e => e && dayOf(e.date) === date && keep(e.createdAt))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    dayExpenses.forEach(e => accumulateExpense(totals, e));

    const dayMovements = movements
        .filter(m => m && dayOf(m.date) === date && keep(m.createdAt))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    dayMovements.forEach(m => accumulateMovement(totals, m));

    // 2-smena kun boshidan emas, 1-smena topshirgan naqddan boshlanadi
    let opening: number;
    let anchorDate: string | null;
    const prevShiftClosure = shiftWindow && shiftWindow.shift > 1
        ? closures.find(c => dayOf(c.date) === date && (c.shift || 1) === shiftWindow.shift - 1)
        : undefined;

    if (prevShiftClosure) {
        opening = prevShiftClosure.countedCash || 0;
        anchorDate = date;
    } else {
        const computed = computeOpeningCash(date, transactions, expenses, closures, movements);
        opening = computed.opening;
        anchorDate = computed.anchorDate;
    }

    totals.openingCash = opening;
    finalizeCash(totals);

    return {
        date,
        shift: shiftWindow?.shift,
        shiftWindow,
        rows,
        doctorColumns: buildDoctorColumns(doctors, rows),
        expenses: dayExpenses,
        movements: dayMovements,
        openingAnchorDate: anchorDate,
        totals,
    };
}

export interface CashBookMonthDay {
    date: string;
    day: number;
    totals: CashBookTotals;
    /** shifokor id → shu kundagi tushumi */
    byDoctor: Record<string, number>;
    hasActivity: boolean;
}

export interface CashBookMonth {
    /** 'YYYY-MM' */
    month: string;
    days: CashBookMonthDay[];
    doctorColumns: CashBookDoctorColumn[];
    totals: CashBookTotals;
    /** Oy davomida naqd yashikdagi o'zgarishlar yig'indisi */
    runningDrawer: number;
}

/** 'YYYY-MM' oyidagi kunlar sonini qaytaradi */
export function daysInMonth(month: string): number {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return 0;
    return new Date(y, m, 0).getDate();
}

/**
 * Oylik daftar: har bir kun bitta qator, oxirida oy yakuni.
 */
export function buildCashBookMonth(
    month: string,
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[],
    closures: CashRegisterDay[] = [],
    movements: CashMovement[] = []
): CashBookMonth {
    const count = daysInMonth(month);
    const monthTotals = emptyTotals();

    // Oy ichidagi yozuvlarni bir marta filtrlab, kunlarga bo'lib olamiz —
    // har kun uchun butun ro'yxatni qayta aylanmaslik uchun.
    const txByDay = new Map<string, Transaction[]>();
    transactions.forEach(t => {
        const d = dayOf(t?.date);
        if (!d.startsWith(month)) return;
        const list = txByDay.get(d);
        if (list) list.push(t); else txByDay.set(d, [t]);
    });

    const expByDay = new Map<string, Expense[]>();
    expenses.forEach(e => {
        const d = dayOf(e?.date);
        if (!d.startsWith(month)) return;
        const list = expByDay.get(d);
        if (list) list.push(e); else expByDay.set(d, [e]);
    });

    const movByDay = new Map<string, CashMovement[]>();
    movements.forEach(m => {
        const d = dayOf(m?.date);
        if (!d.startsWith(month)) return;
        const list = movByDay.get(d);
        if (list) list.push(m); else movByDay.set(d, [m]);
    });

    const allRows: CashBookRow[] = [];
    const days: CashBookMonthDay[] = [];

    for (let i = 1; i <= count; i++) {
        const date = `${month}-${String(i).padStart(2, '0')}`;
        const dayTx = txByDay.get(date) || [];
        const dayExp = expByDay.get(date) || [];
        const dayMov = movByDay.get(date) || [];
        const totals = emptyTotals();
        const byDoctor: Record<string, number> = {};

        dayTx.forEach(t => {
            if (t.status !== 'Paid') {
                totals.unpaid += t.amount || 0;
                return;
            }
            const row = toRow(t, doctors);
            allRows.push(row);
            accumulate(totals, row);
            if (row.isMoneyIn) {
                byDoctor[row.doctorId] = (byDoctor[row.doctorId] || 0) + row.amount;
            }
        });

        dayExp.forEach(e => accumulateExpense(totals, e));
        dayMov.forEach(m => accumulateMovement(totals, m));
        // Oylik jadvalda har bir kunning O'Z oqimi ko'rsatiladi (ochilish qoldig'isiz),
        // aks holda ustun bo'ylab bir xil raqam takrorlanib, kunlik harakat ko'rinmay qolardi.
        finalizeCash(totals);
        totals.drawer = totals.netCashFlow;

        days.push({
            date,
            day: i,
            totals,
            byDoctor,
            hasActivity: dayTx.length > 0 || dayExp.length > 0,
        });

        // Oy yakuniga qo'shish
        monthTotals.gross += totals.gross;
        monthTotals.cashIn += totals.cashIn;
        monthTotals.nonCashIn += totals.nonCashIn;
        monthTotals.expenseTotal += totals.expenseTotal;
        monthTotals.cashExpense += totals.cashExpense;
        monthTotals.nonCashExpense += totals.nonCashExpense;
        monthTotals.fromBalance += totals.fromBalance;
        monthTotals.unpaid += totals.unpaid;
        monthTotals.paymentCount += totals.paymentCount;
        monthTotals.encashment += totals.encashment;
        monthTotals.refundCash += totals.refundCash;
        monthTotals.cashInManual += totals.cashInManual;
        Object.keys(totals.byMethod).forEach(k => {
            monthTotals.byMethod[k] = (monthTotals.byMethod[k] || 0) + totals.byMethod[k];
        });
    }

    // Oy yakunida: oy boshidagi qoldiq + oy davomidagi oqim
    const { opening: monthOpening } = computeOpeningCash(
        `${month}-01`, transactions, expenses, closures, movements
    );
    monthTotals.openingCash = monthOpening;
    finalizeCash(monthTotals);

    return {
        month,
        days,
        doctorColumns: buildDoctorColumns(doctors, allRows),
        totals: monthTotals,
        runningDrawer: monthTotals.drawer,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMENA
//
// Smena chegarasi VAQT bilan emas, YOPISH bilan aniqlanadi: kassir "yopish"
// bosgan daqiqa smenaning oxiri. Bu real kassaga mos — smena kassir pulni
// topshirganda tugaydi, soat 14:00 bo'lgani uchun emas.
//
// Vaqti saqlanmagan eski yozuvlar 1-smenaga tegishli deb qabul qilinadi.
// ─────────────────────────────────────────────────────────────────────────────

export interface ShiftWindow {
    shift: number;
    /** ISO vaqt; null — kun boshidan */
    startsAt: string | null;
    /** ISO vaqt; null — hali yopilmagan */
    endsAt: string | null;
    closure?: CashRegisterDay;
    isOpen: boolean;
}

/**
 * Kun uchun smena oynalari. Yopilgan smenalar o'z yopilish vaqti bilan
 * chegaralanadi, ochiq smena esa oxirgi bo'lib turadi.
 */
export function getShiftWindows(
    date: string,
    closures: CashRegisterDay[],
    shiftsPerDay = 1
): ShiftWindow[] {
    const dayClosures = closures
        .filter(c => dayOf(c.date) === date)
        .sort((a, b) => (a.shift || 1) - (b.shift || 1));

    const windows: ShiftWindow[] = [];
    const maxShift = Math.max(shiftsPerDay, dayClosures.length, 1);
    let prevEnd: string | null = null;

    for (let i = 1; i <= maxShift; i++) {
        const closure = dayClosures.find(c => (c.shift || 1) === i);
        windows.push({
            shift: i,
            startsAt: prevEnd,
            endsAt: closure ? closure.closedAt : null,
            closure,
            isOpen: !closure,
        });
        if (!closure) break; // ochiq smenadan keyin boshqasi bo'lmaydi
        prevEnd = closure.closedAt;
    }

    return windows;
}

/** Yozuv shu smena oynasiga tushadimi. Vaqti yo'q yozuv — 1-smenada. */
function inWindow(timestamp: string | null | undefined, w: ShiftWindow): boolean {
    if (!timestamp) return w.shift === 1;
    if (w.startsAt && timestamp < w.startsAt) return false;
    if (w.endsAt && timestamp >= w.endsAt) return false;
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// KUNNI YOPISH
// ─────────────────────────────────────────────────────────────────────────────

export interface CashClosureStatus {
    closed: boolean;
    closure?: CashRegisterDay;
    /**
     * Kun yopilgandan keyin kassa summasi o'zgardimi.
     * Yopish kunni qulflamaydi, shuning uchun kechroq kelgan to'lov shu bayroq bilan ko'rinadi.
     */
    changedAfterClose: boolean;
    /** Sanalgan naqd − hozirgi hisob bo'yicha naqd (yopilgandan keyin o'zgargan bo'lsa yangilanadi) */
    currentDifference: number;
}

/** 1 so'mgacha farqni yaxlitlash xatosi deb hisoblaymiz */
const EPSILON = 1;

export function getClosureStatus(
    date: string,
    currentDrawer: number,
    closures: CashRegisterDay[],
    shift?: number
): CashClosureStatus {
    const forDay = closures.filter(c => dayOf(c.date) === date);
    const closure = shift
        ? forDay.find(c => (c.shift || 1) === shift)
        // Smena ko'rsatilmasa — kunning oxirgi yopilishi
        : forDay.sort((a, b) => (b.shift || 1) - (a.shift || 1))[0];
    if (!closure) {
        return { closed: false, changedAfterClose: false, currentDifference: 0 };
    }
    const drift = Math.abs((closure.expectedCash || 0) - currentDrawer);
    return {
        closed: true,
        closure,
        changedAfterClose: drift > EPSILON,
        currentDifference: (closure.countedCash || 0) - currentDrawer,
    };
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' */
export function formatDateLabel(date: string): string {
    const [y, m, d] = date.split('-');
    if (!y || !m || !d) return date;
    return `${d}.${m}.${y}`;
}

const MONTH_NAMES = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

/** 'YYYY-MM' → 'Avgust 2026' */
export function formatMonthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return month;
    return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Sanani kun bo'yicha siljitadi (satr → satr, zona siljishisiz) */
export function shiftDate(date: string, deltaDays: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Oyni siljitadi: '2026-08' → '2026-09' */
export function shiftMonth(month: string, deltaMonths: number): string {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(y, m - 1 + deltaMonths, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
