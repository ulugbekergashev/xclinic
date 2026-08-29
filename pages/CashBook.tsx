import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { formatFullName } from '../utils/format';
import {
    ChevronLeft, ChevronRight, Download, Wallet, Banknote, CreditCard,
    TrendingDown, Users, CalendarDays, AlertCircle, Coins, Lock, LockOpen, Check,
    Plus, Loader2, Printer, Trash2, ArrowDownToLine, Undo2, ListOrdered, Pencil, History, ChevronDown,
} from 'lucide-react';
import { Card, Button, Modal, Input, Select } from '../components/Common';
import { QuickPaymentModal } from '../components/QuickPaymentModal';
import { ChargePaymentModal } from '../components/ChargePaymentModal';
import {
    Transaction, Expense, ExpenseCategory, Doctor, Clinic, Patient, Appointment,
    CashRegisterDay, CashMovement, CashMovementType, CashAuditLog, PaymentMethod,
    EXPENSE_CATEGORY_LABELS, CASH_MOVEMENT_LABELS, VisitCharge, Department,
} from '../types';
import { ReceiptModal } from '../components/ReceiptModal';
import {
    buildCashBookDay,
    buildCashBookMonth,
    computeOpeningCash,
    getClosureStatus,
    getShiftWindows,
    formatDateLabel,
    formatMonthLabel,
    shiftDate,
    shiftMonth,
    CashBookTotals,
} from '../utils/cashbook';
import { exportCashBookDay, exportCashBookMonth } from '../utils/cashbookExport';
import { PAYMENT_METHODS, EXPENSE_PAYMENT_METHODS, INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { formatDateToISO } from '../utils/dateUtils';
import { calculateAppointmentTotal, isAppointmentPaid } from '../utils/financialCalculations';
import { api } from '../services/api';

// Kassada kundalik chiqimlar yoziladi. Oylik va shifokor ulushi ataylab yo'q —
// ular oyda bir marta, murakkab hisob-kitob bilan Hisobot tabida rasmiylashtiriladi.
const KASSA_EXPENSE_CATEGORIES: ExpenseCategory[] = ['Other', 'Inventory', 'Lab', 'Rent', 'Utilities'];

export interface CashCloseArgs {
    date: string;
    shift?: number;
    openingCash?: number;
    countedCash: number;
    expectedCash: number;
    countedCard?: number | null;
    expectedCard?: number | null;
    countedClick?: number | null;
    expectedClick?: number | null;
    note?: string;
}

interface CashBookProps {
    transactions: Transaction[];
    expenses: Expense[];
    doctors: Doctor[];
    currentClinic?: Clinic | null;
    onPatientClick?: (patientId: string) => void;
    closures?: CashRegisterDay[];
    /** Yopilgan kunni qayta ochish — faqat klinika admini */
    canReopen?: boolean;
    onCloseDay?: (payload: CashCloseArgs) => Promise<any>;
    onReopenDay?: (date: string, shift?: number) => Promise<void>;
    /** Moliya bo'limi ichida tab sifatida ochilganda — o'z sarlavhasini ko'rsatmaydi */
    embedded?: boolean;
    // Kassaga pul kiritish / chiqarish
    patients?: Patient[];
    appointments?: Appointment[];
    services?: { name: string; price: number; duration?: number }[];
    clinicId?: string;
    onAddTransaction?: (tx: Omit<Transaction, 'id' | 'clinicId'>) => Promise<any>;
    /** Buyurtma berilganda avtomatik yaratilgan to'lanmagan hisob qatorlari */
    charges?: VisitCharge[];
    onChargesChanged?: () => void;
    onAddExpense?: (expense: Omit<Expense, 'id'>) => Promise<any>;
    movements?: CashMovement[];
    onAddCashMovement?: (data: Omit<CashMovement, 'id' | 'clinicId' | 'createdAt' | 'createdByName'>) => Promise<any>;
    onDeleteCashMovement?: (id: string) => Promise<void>;
    onUpdateTransaction?: (id: string, data: Partial<Transaction>) => Promise<void>;
    onDeleteTransaction?: (id: string) => Promise<void>;
    /** Xarajatni bo'limga bog'lash uchun (hisobotda kesim shundan chiqadi) */
    departments?: Department[];
    /** Chegirma va qaytarish huquqi rolga bog'liq — server ham tekshiradi */
    userRole?: string;
    currentUserName?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const num = (v: number) => Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ');

// ── Yakun plitkasi ───────────────────────────────────────────────────────────
const Tile: React.FC<{
    label: string;
    value: number;
    icon: React.ElementType;
    tone?: 'default' | 'cash' | 'card' | 'expense' | 'drawer';
    hint?: string;
}> = ({ label, value, icon: Icon, tone = 'default', hint }) => {
    const tones: Record<string, string> = {
        default: 'text-gray-900 dark:text-white',
        cash: 'text-emerald-600 dark:text-emerald-400',
        card: 'text-blue-600 dark:text-blue-400',
        expense: 'text-red-600 dark:text-red-400',
        drawer: 'text-amber-600 dark:text-amber-400',
    };
    const bgs: Record<string, string> = {
        default: 'bg-gray-50 dark:bg-gray-700/40',
        cash: 'bg-emerald-50 dark:bg-emerald-900/20',
        card: 'bg-blue-50 dark:bg-blue-900/20',
        expense: 'bg-red-50 dark:bg-red-900/20',
        drawer: 'bg-amber-50 dark:bg-amber-900/20',
    };
    return (
        <Card className="p-4">
            <div className="flex items-start justify-between mb-2">
                <div className={`p-1.5 rounded-lg ${bgs[tone]}`}>
                    <Icon className={`w-4 h-4 ${tones[tone]}`} />
                </div>
            </div>
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
            <h2 className={`text-lg font-black mt-0.5 ${tones[tone]}`}>{num(value)}</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">{hint || 'UZS'}</p>
        </Card>
    );
};

const SummaryTiles: React.FC<{ totals: CashBookTotals }> = ({ totals }) => {
    const { t } = useLanguage();
    return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label={t('finance.cash.totalRevenue')} value={totals.gross} icon={Coins} hint={`${totals.paymentCount} ta to'lov`} />
        <Tile label={t('finance.cash.cash')} value={totals.cashIn} icon={Banknote} tone="cash" />
        <Tile label={t('finance.cash.cashless')} value={totals.nonCashIn} icon={CreditCard} tone="card" hint="Karta / Click / o'tkazma" />
        <Tile label={t('finance.cash.expense')} value={totals.expenseTotal} icon={TrendingDown} tone="expense" hint={`naqd: ${num(totals.cashExpense)}`} />
        <Tile label={t('finance.cash.leftInDrawer')} value={totals.drawer} icon={Wallet} tone="drawer" hint="naqd yashik" />
        <Tile label={t('finance.cash.creditGiven')} value={totals.unpaid} icon={AlertCircle} hint="to'lanmagan" />
    </div>
);
};

// ── To'lov usullari qatori ───────────────────────────────────────────────────
const MethodStrip: React.FC<{ totals: CashBookTotals }> = ({ totals }) => {
    const { t } = useLanguage();
    const shown = PAYMENT_METHODS.filter(m => (totals.byMethod[m.key] || 0) !== 0);
    if (shown.length === 0) return null;
    return (
        <Card className="p-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
                {shown.map(m => (
                    <div key={m.key} className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <div>
                            <p className="text-[11px] text-gray-400 leading-tight">{m.label}</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                                {num(totals.byMethod[m.key])}
                            </p>
                        </div>
                    </div>
                ))}
                {totals.fromBalance > 0 && (
                    <div className="flex items-center gap-2.5 pl-4 border-l border-dashed border-gray-300 dark:border-gray-600">
                        <div>
                            <p className="text-[11px] text-gray-400 leading-tight">{t('finance.cash.fromAdvance')}</p>
                            <p className="text-sm font-bold text-gray-500 dark:text-gray-400 leading-tight">
                                {num(totals.fromBalance)} <span className="text-[10px] font-normal">· kassaga kirmagan</span>
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

// ── Oylik jadvaldagi yopilish nishoni ────────────────────────────────────────
const ClosureChip: React.FC<{
    status?: ReturnType<typeof getClosureStatus>;
    hasActivity: boolean;
}> = ({ status, hasActivity }) => {
    const { t } = useLanguage();
    if (!status?.closed) {
        if (!hasActivity) return <span className="text-gray-200 dark:text-gray-700">·</span>;
        return <span className="text-[10px] font-bold text-gray-400 uppercase">ochiq</span>;
    }
    if (status.changedAfterClose) {
        return (
            <span title="Yopilgandan keyin o'zgargan" className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3 h-3" /> o'zgardi
            </span>
        );
    }
    const exact = Math.abs(status.closure?.difference || 0) < 1;
    return exact ? (
        <span title="Kassa to'g'ri keldi" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            <Check className="w-3 h-3" /> yopildi
        </span>
    ) : (
        <span title={t('finance.cash.closedWithDiff')} className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
            <Lock className="w-3 h-3" /> {(status.closure!.difference > 0 ? '+' : '')}{num(status.closure!.difference)}
        </span>
    );
};

// ── Naqd yashik hisobi: gorizontal oqim ──────────────────────────────────────
// Ilgari bu tor ustun edi va ekranning o'ng yarmi bo'sh turardi. Endi qadamlar
// yonma-yon, natija esa o'ngda alohida blokda — kengligi to'liq ishlatiladi.
const FlowStep: React.FC<{
    label: string;
    value: number;
    sign?: '+' | '−';
    tone?: 'neutral' | 'in' | 'out' | 'move';
    hint?: string;
}> = ({ label, value, sign, tone = 'neutral', hint }) => {
    const colors: Record<string, string> = {
        neutral: 'text-gray-900 dark:text-white',
        in: 'text-emerald-600 dark:text-emerald-400',
        out: 'text-red-600 dark:text-red-400',
        move: 'text-indigo-600 dark:text-indigo-400',
    };
    return (
        <div className="min-w-[120px]">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">{label}</p>
            <p className={`text-lg font-black tabular-nums leading-tight mt-0.5 ${colors[tone]}`}>
                {sign === '−' ? '−' : sign === '+' ? '+' : ''}{num(value)}
            </p>
            {hint && <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{hint}</p>}
        </div>
    );
};

const Operator: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="hidden lg:block text-xl font-light text-gray-300 dark:text-gray-600 select-none px-1">
        {children}
    </span>
);

const CashFlowPanel: React.FC<{
    day: ReturnType<typeof buildCashBookDay>;
    closure: ReturnType<typeof getClosureStatus>;
    onClose?: () => void;
}> = ({ day, closure, onClose }) => {
    /* `totals` deb nomlandi (S4.1): `t` — tarjima funksiyasining odatiy
       nomi va u bilan to'qnashardi. FinanceReport da aynan shu joy
       avtomatik ko'chirishda jimgina buzilgan edi. */
    const { t } = useLanguage();
    const totals = day.totals;
    // Nol qadamlar ko'rsatilmaydi — "−0" chirkin va ma'nosiz
    const steps: React.ReactNode[] = [];
    const push = (node: React.ReactNode, op: string) => {
        if (steps.length) steps.push(<Operator key={`op-${steps.length}`}>{op}</Operator>);
        steps.push(node);
    };

    push(
        <FlowStep
            key="opening"
            label={t('finance.cash.atDayStart')}
            value={totals.openingCash}
            hint={day.openingAnchorDate ? `${formatDateLabel(day.openingAnchorDate)} yopilishidan` : 'hali yopilmagan'}
        />, ''
    );
    if (totals.cashIn) push(<FlowStep key="in" label={t('finance.cash.cashIn')} value={totals.cashIn} sign="+" tone="in" />, '+');
    if (totals.cashInManual) push(<FlowStep key="manual" label={t('finance.cash.putIn')} value={totals.cashInManual} sign="+" tone="in" />, '+');
    if (totals.cashExpense) push(<FlowStep key="exp" label={t('finance.cash.cashOut')} value={totals.cashExpense} sign="−" tone="out" />, '−');
    if (totals.refundCash) push(<FlowStep key="ref" label={t('finance.cash.returned')} value={totals.refundCash} sign="−" tone="out" />, '−');
    if (totals.encashment) push(<FlowStep key="enc" label={t('finance.cash.collection')} value={totals.encashment} sign="−" tone="move" />, '−');

    const quiet = !totals.cashIn && !totals.cashExpense && !totals.encashment && !totals.refundCash && !totals.cashInManual;
    const diff = closure.currentDifference;
    const exact = Math.abs(diff) < 1;

    return (
        <Card className="p-5">
            <div className="flex flex-col xl:flex-row xl:items-stretch gap-5">
                {/* Chap: oqim */}
                <div className="flex-1 min-w-0">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{t('finance.cash.drawerCount')}</h2>
                    {quiet ? (
                        <div className="flex items-baseline gap-3">
                            <FlowStep
                                label={t('finance.cash.atDayStart')}
                                value={totals.openingCash}
                                hint={day.openingAnchorDate ? `${formatDateLabel(day.openingAnchorDate)} yopilishidan` : undefined}
                            />
                            <p className="text-sm text-gray-400">{t('finance.cash.noCashMoves')}</p>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-start gap-x-4 gap-y-4">
                            {steps}
                        </div>
                    )}

                    {(totals.nonCashIn > 0 || totals.nonCashExpense > 0) && (
                        <div className="mt-5 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                            <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <CreditCard className="w-3.5 h-3.5" />
                                Naqdsiz (hisob raqam) — yashikda emas
                            </p>
                            <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                                <FlowStep label={t('finance.cash.received')} value={totals.nonCashIn} sign="+" tone="in" />
                                {totals.nonCashExpense > 0 && (
                                    <>
                                        <Operator>−</Operator>
                                        <FlowStep label={t('finance.cash.issued')} value={totals.nonCashExpense} sign="−" tone="out" />
                                    </>
                                )}
                                <Operator>=</Operator>
                                <FlowStep label="Hisobga qo'shildi" value={totals.nonCashIn - totals.nonCashExpense} />
                            </div>
                        </div>
                    )}
                    {!day.openingAnchorDate && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                            Hali birorta kun yopilmagan — kun boshi 0 deb olindi. Birinchi marta
                            yopganingizdan keyin qoldiq har kuni o'zi ko'chib boradi.
                        </p>
                    )}
                </div>

                {/* O'ng: natija va amal */}
                <div className="xl:w-72 shrink-0 xl:border-l xl:pl-5 border-gray-200 dark:border-gray-700 flex flex-col justify-between gap-3">
                    <div>
                        <p className="text-[11px] text-gray-400 uppercase tracking-wide">{t('finance.cash.shouldBeInDrawer')}</p>
                        <p className="text-3xl font-black tabular-nums text-amber-600 dark:text-amber-400 leading-tight mt-1">
                            {num(totals.drawer)}
                        </p>
                        <p className="text-[10px] text-gray-400">UZS</p>

                        {closure.closed && closure.closure && (
                            <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 space-y-1">
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                    <span>{t('finance.cash.countedByCashier')}</span>
                                    <span className="font-semibold tabular-nums">{num(closure.closure.countedCash)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="font-bold text-gray-700 dark:text-gray-200">Farq</span>
                                    <span className={`font-black tabular-nums ${exact
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-red-600 dark:text-red-400'}`}>
                                        {diff > 0 ? '+' : ''}{num(diff)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {!closure.closed && onClose && (
                        <Button onClick={onClose} className="w-full">
                            <Lock className="w-4 h-4 mr-2" />{t('finance.cash.closeDay')}</Button>
                    )}
                    {closure.closed && (
                        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-500" />{t('finance.cash.dayClosed')}</p>
                    )}
                </div>
            </div>
        </Card>
    );
};

// ── Yopishda naqdsiz usulni solishtirish qatori ──────────────────────────────
const ReconRow: React.FC<{
    label: string;
    expected: number;
    value: string;
    onChange: (v: string) => void;
    counted: number | null;
}> = ({ label, expected, value, onChange, counted }) => {
    const diff = counted === null ? null : counted - expected;
    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{label}</p>
                <p className="text-[11px] text-gray-400">tizimda: {num(expected)}</p>
            </div>
            <input
                type="number"
                value={value}
                onChange={e => onChange(e.target.value)}
                onWheel={e => e.currentTarget.blur()}
                placeholder="—"
                className="w-32 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-right tabular-nums outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white"
            />
            <span className={`w-24 text-right text-sm font-bold tabular-nums ${diff === null ? 'text-gray-300 dark:text-gray-600'
                : Math.abs(diff) < 1 ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'}`}>
                {diff === null ? '—' : `${diff > 0 ? '+' : ''}${num(diff)}`}
            </span>
        </div>
    );
};

// ── Yopilgan kun banneri ─────────────────────────────────────────────────────
const ClosureBanner: React.FC<{
    status: ReturnType<typeof getClosureStatus>;
    currentDrawer: number;
    canReopen: boolean;
    onReopen: () => void;
    onRecount: () => void;
}> = ({ status, currentDrawer, canReopen, onReopen, onRecount }) => {
    const { t } = useLanguage();
    const c = status.closure!;
    const diff = status.changedAfterClose ? status.currentDifference : c.difference;
    const exact = Math.abs(diff) < 1;

    const tone = status.changedAfterClose
        ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
        : exact
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
            : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20';

    return (
        <div className={`rounded-2xl border p-4 ${tone}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                        {exact && !status.changedAfterClose
                            ? <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            : <AlertCircle className={`w-5 h-5 ${status.changedAfterClose ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} />}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {status.changedAfterClose
                                ? 'Kun yopilgan, lekin keyin o\'zgardi'
                                : exact ? 'Kun yopilgan — kassa to\'g\'ri keldi' : 'Kun yopilgan — farq bor'}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            Sanalgan <b>{num(c.countedCash)}</b>
                            <span className="mx-1.5">·</span>{t('finance.cash.byLedger')}<b>{num(status.changedAfterClose ? currentDrawer : c.expectedCash)}</b>
                            <span className="mx-1.5">·</span>
                            Farq <b className={exact ? '' : diff > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                                {diff > 0 ? '+' : ''}{num(diff)}
                            </b>
                        </p>
                        {status.changedAfterClose && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                Yopilgandan keyin bu kunga to'lov yoki xarajat qo'shilgan.
                                Naqdni qayta sanab, kunni yangilang.
                            </p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            {c.closedByName || 'Xodim'} · {new Date(c.closedAt).toLocaleString('uz-UZ')}
                            {c.note ? ` · ${c.note}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={onRecount}>
                        <Lock className="w-3.5 h-3.5 mr-1.5" />{t('finance.cash.recount')}</Button>
                    {canReopen && (
                        <Button variant="ghost" size="sm" onClick={onReopen}>
                            <LockOpen className="w-3.5 h-3.5 mr-1.5" />{t('finance.cash.reopen')}</Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const CashBook: React.FC<CashBookProps> = ({
    transactions, expenses, doctors, currentClinic, onPatientClick,
    closures = [], canReopen = false, onCloseDay, onReopenDay, embedded = false,
    patients = [], appointments = [], services = [], clinicId = '', onAddTransaction, onAddExpense,
    charges = [], onChargesChanged,
    movements = [], onAddCashMovement, onDeleteCashMovement,
    onUpdateTransaction, onDeleteTransaction,
    userRole, currentUserName, addToast, departments = [],
}) => {
    const { t } = useLanguage();
    const today = formatDateToISO(new Date());
    const [view, setView] = useState<'day' | 'month'>('day');
    const [date, setDate] = useState(today);
    const [month, setMonth] = useState(today.slice(0, 7));
    const [selectedShift, setSelectedShift] = useState<number | null>(null);
    const [isCloseOpen, setIsCloseOpen] = useState(false);
    const [countedInput, setCountedInput] = useState('');
    const [closeNote, setCloseNote] = useState('');
    const [closeSaving, setCloseSaving] = useState(false);

    // Kassaga to'lov qabul qilish / xarajat yozish
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isExpenseOpen, setIsExpenseOpen] = useState(false);
    const [expenseSaving, setExpenseSaving] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        category: 'Other' as ExpenseCategory,
        title: '',
        amount: '',
        method: 'Cash' as PaymentMethod,
        note: '',
        departmentId: '',
    });

    // Chek / o'chirish / kassa harakati
    const [receiptTx, setReceiptTx] = useState<Transaction | null>(null);
    const [deletingRow, setDeletingRow] = useState<{ id: string; patientName: string; amount: number } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [movementType, setMovementType] = useState<CashMovementType | null>(null);
    const [movementForm, setMovementForm] = useState({ amount: '', note: '', patientId: '' });
    const [movementSaving, setMovementSaving] = useState(false);

    // Yopish: terminal va Click ixtiyoriy
    const [countedCardInput, setCountedCardInput] = useState('');
    const [countedClickInput, setCountedClickInput] = useState('');

    /* HOZIR KLINIKADA turgan bemorlar. Kassir oynasida odam turadi, umumiy
       ro'yxatda esa butun klinikaning qarzi — o'tgan oyning qarzdorlari
       ham. Kassir odamni o'sha ro'yxatdan izlashi kerak edi (GAP-ANALYSIS,
       1-sahna, 2-band). Bu ro'yxat faqat bugungi ochiq qabullarni beradi. */
    const [hereNow, setHereNow] = useState<any[]>([]);
    const loadHereNow = useCallback(async () => {
        try { setHereNow(await api.charges.pending(true)); }
        catch { setHereNow([]); }
    }, []);
    useEffect(() => {
        if (view !== 'day' || date !== today) { setHereNow([]); return; }
        loadHereNow();
    }, [view, date, today, loadHereNow, charges]);

    // Bir bemorning bir necha qatorini bitta chek bilan to'lash
    const [payingPatient, setPayingPatient] = useState<{ name: string; patientId?: string } | null>(null);

    /* Kutilayotgan naqd — SERVER hisobi.
       Interfeys ham o'zi hisoblaydi (day.totals.drawer), lekin yopilishda
       yozib qoladigan raqam serverdan. Ikkisi farq qilsa — buni kassirga
       ko'rsatamiz, jimgina yashirmaymiz. */
    /* Tur `api.reports`/`api.cashRegister.expected` dagi bilan MOS
       bo'lishi kerak. Bu yerda uning NUSXASI yozilgan va u eskirib
       qolgan: server `openCharges` ni ham qaytaradi (kunning
       yopilmagan xizmat qatorlari) va u pastda ishlatiladi, lekin
       e'londa yo'q edi. Typecheck buni ko'rmasdi, chunki React
       turlari umuman o'rnatilmagan edi. */
    const [serverExpected, setServerExpected] = useState<{
        openingCash: number; expectedCash: number;
        expectedCard: number; expectedClick: number;
        openCharges?: { count: number; patients: number; due: number };
        sources: Record<string, any>;
    } | null>(null);
    const [expectedLoading, setExpectedLoading] = useState(false);
    const [expectedError, setExpectedError] = useState('');

    // To'lovni tuzatish
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [editForm, setEditForm] = useState({ amount: '', type: 'Cash' as PaymentMethod });
    const [editSaving, setEditSaving] = useState(false);

    // O'zgarishlar izi
    const [auditOpen, setAuditOpen] = useState(false);
    const [auditLogs, setAuditLogs] = useState<CashAuditLog[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);

    // Smena chegarasi yopish bilan aniqlanadi. Klinikada bitta smena bo'lsa
    // (sukut bo'yicha) oyna umuman ishlatilmaydi — kun butunligicha ko'rinadi.
    const shiftsPerDay = Math.max(1, currentClinic?.cashShiftsPerDay || 1);
    const multiShift = shiftsPerDay > 1;

    const shiftWindows = useMemo(
        () => getShiftWindows(date, closures, shiftsPerDay),
        [date, closures, shiftsPerDay]
    );

    // Sukut bo'yicha ochiq smena, hammasi yopilgan bo'lsa oxirgisi
    const defaultShift = (shiftWindows.find(w => w.isOpen) || shiftWindows[shiftWindows.length - 1])?.shift || 1;
    const activeShift = multiShift ? (selectedShift ?? defaultShift) : 1;
    const activeWindow = multiShift ? shiftWindows.find(w => w.shift === activeShift) : undefined;


    /* ─── OYNA TASHQARISIDAGI KUN (FIX-PLAN 10.3) ─────────────────────────
       `App.tsx` kirishda oxirgi 45 kunni yuklaydi. Kassa kitobida esa
       istalgan kun yoki oy tanlanadi — undan eskisi tanlansa propdagi
       ro'yxatda o'sha kun UMUMAN yo'q va kassa "o'sha kuni hech narsa
       bo'lmagan" deb ko'rsatardi. Bu jimgina yolg'on, eng yomon turi.

       Shuning uchun tanlov oyna tashqarisiga chiqsa — server so'raladi. */
    const WINDOW_START = React.useMemo(
        () => new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0], []);
    const [rangeTx, setRangeTx] = React.useState<Transaction[] | null>(null);

    React.useEffect(() => {
        const need = (view === 'month' ? month + '-01' : date) < WINDOW_START;
        if (!need || !currentClinic?.id) { setRangeTx(null); return; }
        let alive = true;
        const from = view === 'month' ? month + '-01' : date;
        const to = view === 'month' ? month + '-31' : date;
        api.transactions.getAll(currentClinic.id, { from, to })
            .then(tx => { if (alive) setRangeTx(tx); })
            .catch(() => { if (alive) setRangeTx(null); });
        return () => { alive = false; };
    }, [date, month, view, currentClinic?.id, WINDOW_START]);

    const effectiveTx = rangeTx ?? transactions;

    const day = useMemo(
        () => buildCashBookDay(date, effectiveTx, expenses, doctors, closures, movements, activeWindow),
        [date, effectiveTx, expenses, doctors, closures, movements, activeWindow]
    );

    const monthData = useMemo(
        () => buildCashBookMonth(month, effectiveTx, expenses, doctors, closures, movements),
        [month, effectiveTx, expenses, doctors, closures, movements]
    );

    const clinicName = currentClinic?.name;

    const closureStatus = useMemo(
        () => getClosureStatus(date, day.totals.drawer, closures, multiShift ? activeShift : undefined),
        [date, day.totals.drawer, closures, multiShift, activeShift]
    );

    // Oylik ko'rinishda har bir kunning yopilish holati
    const closureByDate = useMemo(() => {
        const map = new Map<string, ReturnType<typeof getClosureStatus>>();
        monthData.days.forEach(d => {
            // Oylik jadvalda drawer = kunning o'z oqimi. Yopilish esa ochilish qoldig'i
            // bilan solishtirilgan, shuning uchun to'liq qoldiqni qayta hisoblaymiz.
            const { opening } = computeOpeningCash(d.date, transactions, expenses, closures, movements);
            map.set(d.date, getClosureStatus(d.date, opening + d.totals.netCashFlow, closures));
        });
        return map;
    }, [monthData.days, closures]);

    const handleExport = () => {
        if (view === 'day') {
            exportCashBookDay(day, doctors, clinicName, closureStatus);
        } else {
            const days = monthData.days
                .filter(d => d.hasActivity)
                .map(d => buildCashBookDay(d.date, transactions, expenses, doctors, closures, movements));
            exportCashBookMonth(monthData, days, doctors, clinicName, closures);
        }
    };

    const openDay = (targetDate: string) => {
        setDate(targetDate);
        setSelectedShift(null);
        setView('day');
    };

    const changeDate = (next: string) => {
        setDate(next);
        setSelectedShift(null);
    };

    const openCloseModal = () => {
        // Qayta yopishda avvalgi sanalgan summalar boshlang'ich qiymat bo'ladi
        const c = closureStatus.closure;
        setCountedInput(c ? String(c.countedCash) : '');
        setCountedCardInput(c?.countedCard != null ? String(c.countedCard) : '');
        setCountedClickInput(c?.countedClick != null ? String(c.countedClick) : '');
        setCloseNote(c?.note || '');
        setIsCloseOpen(true);
        loadExpected();
    };

    /** Serverning kutilayotgan naqd hisobi. Yopish oynasi ochilganda olinadi. */
    const loadExpected = async () => {
        setExpectedLoading(true);
        setExpectedError('');
        try {
            setServerExpected(await api.cashShift.expected(date));
        } catch (e: any) {
            setServerExpected(null);
            setExpectedError(e?.message || 'Server hisobi olinmadi');
        } finally {
            setExpectedLoading(false);
        }
    };

    /* ── Smenani ochish ──────────────────────────────────────────────────────
       Ochilgan smena — yopilmagan qator (isClosed === false). Kun boshida
       kassir "smenani ochaman" deb bosadi: kim turgani va boshlang'ich naqd
       yoziladi. Majburiy emas — eski xatti-harakat saqlanadi. */
    const openedShift = useMemo(
        () => closures.find(c => (c.date || '').split('T')[0] === date
            && (c.shift || 1) === activeShift && c.isClosed === false),
        [closures, date, activeShift]
    );
    const [openingShift, setOpeningShift] = useState(false);

    const handleOpenShift = async () => {
        setOpeningShift(true);
        try {
            await api.cashShift.open({ date, shift: multiShift ? activeShift : 1 });
            addToast?.('success', 'Smena ochildi');
            onChargesChanged?.();
        } catch (e: any) {
            addToast?.('error', e?.message || "Smenani ochib bo'lmadi");
        } finally {
            setOpeningShift(false);
        }
    };

    // Naqdsiz kutilgan summalar ham serverdan (bo'lmasa — ekran hisobidan)
    const expectedCard = serverExpected ? serverExpected.expectedCard : (day.totals.byMethod.Card || 0);
    const expectedClick = serverExpected ? serverExpected.expectedClick : (day.totals.byMethod.Click || 0);
    const parseOptional = (v: string): number | null => {
        if (v.trim() === '') return null;
        const n = Number(v.replace(/\s/g, ''));
        return isFinite(n) ? n : null;
    };
    const countedCardValue = parseOptional(countedCardInput);
    const countedClickValue = parseOptional(countedClickInput);

    const countedValue = Number(countedInput.replace(/\s/g, ''));
    // Farq SERVER raqamiga nisbatan ko'rsatiladi — yopilganda ham shu yoziladi.
    // Server javob bermasa interfeys hisobiga qaytamiz (offline rejim buzilmasin).
    const expectedForClose = serverExpected ? serverExpected.expectedCash : day.totals.drawer;
    const previewDifference = isFinite(countedValue) ? countedValue - expectedForClose : 0;
    const expectedDrift = serverExpected ? Math.abs(serverExpected.expectedCash - day.totals.drawer) : 0;

    const handleCloseDay = async () => {
        if (!onCloseDay || !isFinite(countedValue) || countedInput.trim() === '') return;
        setCloseSaving(true);
        try {
            await onCloseDay({
                date,
                shift: activeShift,
                openingCash: day.totals.openingCash,
                countedCash: countedValue,
                // Serverda qayta hisoblanadi; bu yerda faqat eski shakl uchun
                expectedCash: expectedForClose,
                countedCard: countedCardValue,
                expectedCard: countedCardValue === null ? null : expectedCard,
                countedClick: countedClickValue,
                expectedClick: countedClickValue === null ? null : expectedClick,
                note: closeNote.trim() || undefined,
            });
            setIsCloseOpen(false);
        } catch {
            // xatolik toast orqali ko'rsatiladi
        } finally {
            setCloseSaving(false);
        }
    };

    const handleReopen = async () => {
        if (!onReopenDay) return;
        await onReopenDay(date, multiShift ? activeShift : undefined).catch(() => { });
    };

    const openMovement = (type: CashMovementType) => {
        setMovementForm({ amount: '', note: '', patientId: '' });
        setMovementType(type);
    };

    const movementAmount = Number(movementForm.amount);
    const canSaveMovement = isFinite(movementAmount) && movementAmount > 0;

    const handleSaveMovement = async () => {
        if (!onAddCashMovement || !movementType || !canSaveMovement) return;
        setMovementSaving(true);
        try {
            await onAddCashMovement({
                date,
                type: movementType,
                amount: movementAmount,
                method: 'Cash',
                note: movementForm.note.trim() || null,
                patientId: movementForm.patientId || null,
                transactionId: null,
            });
            setMovementType(null);
        } catch {
            // xatolik toast orqali
        } finally {
            setMovementSaving(false);
        }
    };

    const openEdit = (tx: Transaction) => {
        setEditForm({ amount: String(tx.amount), type: (tx.type || 'Cash') as PaymentMethod });
        setEditingTx(tx);
    };

    const editAmount = Number(editForm.amount);
    const canSaveEdit = isFinite(editAmount) && editAmount > 0;

    const handleSaveEdit = async () => {
        if (!onUpdateTransaction || !editingTx || !canSaveEdit) return;
        setEditSaving(true);
        try {
            await onUpdateTransaction(editingTx.id, { amount: editAmount, type: editForm.type });
            setEditingTx(null);
        } catch {
            // xatolik toast orqali
        } finally {
            setEditSaving(false);
        }
    };

    const loadAudit = async () => {
        if (!clinicId) return;
        setAuditLoading(true);
        try {
            const logs = await api.cashAudit.getAll(clinicId, date);
            setAuditLogs(logs);
        } catch {
            setAuditLogs([]);
        } finally {
            setAuditLoading(false);
        }
    };

    const toggleAudit = () => {
        const next = !auditOpen;
        setAuditOpen(next);
        if (next) loadAudit();
    };

    const handleDeleteRow = async () => {
        if (!onDeleteTransaction || !deletingRow) return;
        setDeleting(true);
        try {
            await onDeleteTransaction(deletingRow.id);
            setDeletingRow(null);
        } catch {
            // xatolik toast orqali
        } finally {
            setDeleting(false);
        }
    };

    // Kassirning kun oxiridagi asosiy savoli: kimdan pul olinmadi.
    // Ikki manba: qarzga yozilgan to'lovlar va to'lov yozilmagan yakunlangan qabullar.
    const unpaidItems = useMemo(() => {
        const pendingTx = transactions
            .filter(t => t && (t.date || '').split('T')[0] === date && t.status !== 'Paid')
            .map(t => ({
                kind: 'debt' as const,
                id: t.id,
                patientName: t.patientName,
                patientId: t.patientId,
                doctorName: t.doctorName || '',
                doctorId: t.doctorId,
                service: t.service || '',
                amount: t.amount || 0,
                tx: t,
            }));

        const unpaidAppts = appointments
            .filter(a => a && a.date === date && a.status === 'Completed' && !isAppointmentPaid(a, transactions))
            .map(a => {
                const { total } = calculateAppointmentTotal(a.notes || '', services as any);
                return {
                    kind: 'appointment' as const,
                    id: a.id,
                    patientName: a.patientName,
                    patientId: a.patientId,
                    doctorName: a.doctorName || '',
                    doctorId: a.doctorId,
                    service: a.type || '',
                    amount: total,
                    tx: undefined,
                };
            });

        // Shifokor tahlil yoki xizmat buyurganda avtomatik yaratilgan qatorlar.
        // Ilgari bular hech qayerda ko'rinmasdi — kassir ularni qo'lda kiritishi kerak edi.
        const unpaidCharges = charges
            .filter(c => c.status === 'Unpaid' && (c.visit?.date || c.createdAt.split('T')[0]) === date)
            .map(c => ({
                kind: 'charge' as const,
                id: c.id,
                patientName: c.patientName,
                patientId: c.patientId || undefined,
                doctorName: '',
                doctorId: undefined,
                service: c.name,
                amount: c.total - (c.paidAmount || 0),
                tx: undefined,
            }));

        return [...pendingTx, ...unpaidAppts, ...unpaidCharges];
    }, [transactions, appointments, services, date, charges]);

    const unpaidTotal = unpaidItems.reduce((sum, i) => sum + i.amount, 0);

    // Boshqa kunlardagi to'lanmagan qatorlar — bu ekran kunlik, lekin eski
    // qarz ko'zdan g'oyib bo'lmasligi kerak.
    const olderDue = useMemo(() => charges
        .filter(c => c.status === 'Unpaid' && (c.visit?.date || c.createdAt.split('T')[0]) !== date)
        .reduce((sum, c) => sum + (c.total - (c.paidAmount || 0)), 0), [charges, date]);

    /* Qatorni to'lash — endi oyna orqali: bemorning barcha qatorlari bir
       joyda, tanlab, qisman, bir necha usul bilan to'lanadi. Ilgari bu tugma
       to'g'ridan-to'g'ri hamma summani NAQD deb yozib qo'yardi. */
    // Qaytarishni faqat klinika admini qiladi — server ham shuni talab qiladi
    const canRefundCharges = userRole === 'CLINIC_ADMIN';

    const openChargePayment = (patientName: string, patientId?: string) => {
        setPayingPatient({ name: patientName, patientId });
    };

    /* Oynadagi qatorlar — SNAPSHOT emas, tirik ro'yxatdan. Chegirma yoki
       qaytarishdan keyin ota-komponent ro'yxatni yangilaydi va oyna darhol
       yangi summani ko'rsatadi.

       Bemorning boshqa kunlardagi qarzi ham shu yerda: kassa varag'i kunlik,
       lekin bemor bir marta keladi va hammasini birga to'laydi. */
    const payingCharges = useMemo(() => {
        if (!payingPatient) return [];
        return charges.filter(c => payingPatient.patientId
            ? c.patientId === payingPatient.patientId
            : c.patientName === payingPatient.name);
    }, [charges, payingPatient]);

    // Qarzni yopish — Dashboard'dagi mantiq bilan bir xil:
    // qisman to'lansa yangi Paid yozuv, qoldiq eskisida qoladi
    const [payingDebt, setPayingDebt] = useState<Transaction | null>(null);
    const [debtAmount, setDebtAmount] = useState('');
    const [debtMethod, setDebtMethod] = useState<PaymentMethod>('Cash');
    const [debtSaving, setDebtSaving] = useState(false);

    const openDebt = (tx: Transaction) => {
        setPayingDebt(tx);
        setDebtAmount(String(tx.amount));
        setDebtMethod('Cash');
    };

    const handlePayDebt = async () => {
        if (!payingDebt || !onUpdateTransaction) return;
        const paid = Math.min(Number(debtAmount) || 0, payingDebt.amount);
        if (paid <= 0) return;
        setDebtSaving(true);
        try {
            if (paid < payingDebt.amount) {
                if (!onAddTransaction) return;
                await onAddTransaction({
                    patientName: payingDebt.patientName,
                    patientId: payingDebt.patientId,
                    doctorId: payingDebt.doctorId,
                    doctorName: payingDebt.doctorName,
                    clinicId: payingDebt.clinicId,
                    amount: paid,
                    status: 'Paid',
                    type: debtMethod,
                    service: `${payingDebt.service} (Qarzdorlik yopildi)`,
                    date,
                } as Omit<Transaction, 'id' | 'clinicId'>);
                await onUpdateTransaction(payingDebt.id, { amount: payingDebt.amount - paid });
            } else {
                await onUpdateTransaction(payingDebt.id, { status: 'Paid', type: debtMethod, date });
            }
            setPayingDebt(null);
        } catch {
            // xatolik toast orqali
        } finally {
            setDebtSaving(false);
        }
    };

    // To'lanmagan qabul uchun — tayyor to'lov modali oldindan to'ldiriladi
    const [presetPayment, setPresetPayment] = useState<{ patientId?: string; doctorId?: string; service?: string; amount?: number } | null>(null);

    const openExpenseModal = () => {
        setExpenseForm({ category: 'Other', title: '', amount: '', method: 'Cash', note: '', departmentId: '' });
        setIsExpenseOpen(true);
    };

    const expenseAmount = Number(expenseForm.amount);
    const canSaveExpense = expenseForm.title.trim() !== '' && isFinite(expenseAmount) && expenseAmount > 0;

    const handleSaveExpense = async () => {
        if (!onAddExpense || !canSaveExpense) return;
        setExpenseSaving(true);
        try {
            await onAddExpense({
                // Xarajat ko'rilayotgan kunga yoziladi — kechagi kunni yopayotganda ham to'g'ri joyga tushadi
                date,
                amount: expenseAmount,
                category: expenseForm.category,
                title: expenseForm.title.trim(),
                method: expenseForm.method,
                note: expenseForm.note.trim() || undefined,
                /* Bo'lim — "qaysi bo'lim foydali" hisoboti aynan shundan
                   quriladi. Bo'sh qoldirilsa xarajat "umumiy" bo'lib
                   qoladi va hisobotda alohida qatorda ko'rinadi. */
                departmentId: expenseForm.departmentId || undefined,
                clinicId,
            } as Omit<Expense, 'id'>);
            setIsExpenseOpen(false);
        } catch {
            // xatolik toast orqali ko'rsatiladi
        } finally {
            setExpenseSaving(false);
        }
    };

    const doctorCols = view === 'day' ? day.doctorColumns : monthData.doctorColumns;
    const totals = view === 'day' ? day.totals : monthData.totals;

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <div className={`flex flex-col lg:flex-row items-start lg:items-center gap-4 ${embedded ? 'lg:justify-end' : 'justify-between'}`}>
                {!embedded && (
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Kassa</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('finance.cash.realMoneyHint')}</p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                    {/* Kassaga pul kirishi va chiqishi — kundalik amallar */}
                    {view === 'day' && (onAddTransaction || onAddExpense) && (
                        <div className="flex items-center gap-2">
                            {onAddTransaction && (
                                <button
                                    onClick={() => setIsPaymentOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    To'lov
                                </button>
                            )}
                            {onAddExpense && (
                                <button
                                    onClick={openExpenseModal}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
                                >
                                    <Banknote className="w-3.5 h-3.5" />{t('finance.cash.expense')}</button>
                            )}
                            {onAddCashMovement && (
                                <>
                                    <button
                                        onClick={() => openMovement('Encashment')}
                                        title={t('finance.cash.takenFromDrawer')}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
                                    >
                                        <ArrowDownToLine className="w-3.5 h-3.5" />{t('finance.cash.collection')}</button>
                                    <button
                                        onClick={() => openMovement('Refund')}
                                        title={t('finance.cash.refundToPatient')}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
                                    >
                                        <Undo2 className="w-3.5 h-3.5" />
                                        Qaytarish
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Kun / Oy */}
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        {(['day', 'month'] as const).map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === v
                                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                {v === 'day' ? 'Kun' : 'Oy'}
                            </button>
                        ))}
                    </div>

                    {/* Sana boshqaruvi */}
                    {view === 'day' ? (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => changeDate(shiftDate(date, -1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label={t('finance.cash.prevDay')}
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            <input
                                type="date"
                                value={date}
                                onChange={e => e.target.value && changeDate(e.target.value)}
                                className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={() => changeDate(shiftDate(date, 1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label={t('finance.cash.nextDay')}
                            >
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                            {date !== today && (
                                <Button variant="ghost" size="sm" onClick={() => changeDate(today)}>Bugun</Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setMonth(shiftMonth(month, -1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label={t('finance.cash.prevMonth')}
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-500" />
                            </button>
                            <input
                                type="month"
                                value={month}
                                onChange={e => e.target.value && setMonth(e.target.value)}
                                className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={() => setMonth(shiftMonth(month, 1))}
                                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                aria-label={t('finance.cash.nextMonth')}
                            >
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                    )}

                    <Button variant="secondary" onClick={handleExport} className="h-9">
                        <Download className="w-4 h-4 mr-2" /> Excel
                    </Button>

                    {view === 'day' && onCloseDay && !closureStatus.closed && (
                        <Button onClick={openCloseModal} className="h-9">
                            <Lock className="w-4 h-4 mr-2" />{t('finance.cash.closeDay')}</Button>
                    )}
                </div>
            </div>

            {/* Sarlavha: sana */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
                    <CalendarDays className="w-4 h-4 text-gray-400" />
                    {view === 'day' ? formatDateLabel(date) : formatMonthLabel(month)}
                </div>

                {view === 'day' && multiShift && (
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        {shiftWindows.map(w => {
                            const active = w.shift === activeShift;
                            return (
                                <button
                                    key={w.shift}
                                    onClick={() => setSelectedShift(w.shift)}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${active
                                        ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                >
                                    {w.shift}-smena
                                    {w.isOpen
                                        ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="ochiq" />
                                        : <Check className="w-3 h-3 text-emerald-500" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {view === 'day' && closureStatus.closed && closureStatus.closure && (
                <ClosureBanner
                    status={closureStatus}
                    currentDrawer={day.totals.drawer}
                    canReopen={canReopen && !!onReopenDay}
                    onReopen={handleReopen}
                    onRecount={openCloseModal}
                />
            )}

            <SummaryTiles totals={totals} />
            <MethodStrip totals={totals} />

            {view === 'day' ? (
                <>
                    {/* ── Kunlik matritsa: bemor × shifokor ── */}
                    <Card className="overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                                To'lovlar — shifokorlar bo'yicha
                            </h2>
                            <span className="text-xs text-gray-400">({day.rows.length} ta)</span>
                        </div>

                        {day.rows.length === 0 ? (
                            <div className="px-5 py-12 text-center">
                                <Wallet className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t('finance.cash.noPaymentsLogged')}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-700/40">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10 min-w-[180px]">
                                                Bemor
                                            </th>
                                            <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase w-20">Vaqt</th>
                                            {doctorCols.map(col => (
                                                <th key={col.id} className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap min-w-[110px]">
                                                    {col.name}
                                                </th>
                                            ))}
                                            <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap">Usul</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {day.rows.map(row => (
                                            <tr
                                                key={row.id}
                                                className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${!row.isMoneyIn ? 'opacity-60' : ''}`}
                                            >
                                                <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-gray-800 z-10">
                                                    {row.patientId && onPatientClick ? (
                                                        <button
                                                            onClick={() => onPatientClick(row.patientId!)}
                                                            className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 text-left"
                                                        >
                                                            {row.patientName}
                                                        </button>
                                                    ) : (
                                                        <span className="font-medium text-gray-900 dark:text-white">{row.patientName}</span>
                                                    )}
                                                    {row.service && (
                                                        <p className="text-[11px] text-gray-400 truncate max-w-[220px]">{row.service}</p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{row.time || '—'}</td>
                                                {doctorCols.map(col => (
                                                    <td key={col.id} className="px-3 py-2.5 text-right tabular-nums">
                                                        {col.id === row.doctorId ? (
                                                            <span className={row.isMoneyIn ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-400 line-through'}>
                                                                {num(row.amount)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-200 dark:text-gray-700">·</span>
                                                        )}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                    <span
                                                        className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"
                                                    >
                                                        <span
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ backgroundColor: PAYMENT_METHODS.find(m => m.key === row.method)?.color || '#9CA3AF' }}
                                                        />
                                                        {getPaymentMethodLabel(row.method)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50 dark:bg-gray-700/40 border-t-2 border-gray-200 dark:border-gray-600">
                                        <tr>
                                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-white sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10">
                                                JAMI
                                            </td>
                                            <td />
                                            {doctorCols.map(col => (
                                                <td key={col.id} className="px-3 py-3 text-right font-black text-gray-900 dark:text-white tabular-nums">
                                                    {col.total ? num(col.total) : '—'}
                                                </td>
                                            ))}
                                            <td className="px-3 py-3 text-right font-black text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                                                {num(day.totals.gross)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* Ro'yxatlar yonma-yon — kenglik bo'sh qolmaydi */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

                    {/* ── Kunlik to'lovlar ro'yxati (chek, o'chirish) ── */}
                    <Card className="overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                            <ListOrdered className="w-4 h-4 text-gray-400" />
                            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('finance.cash.dayPayments')}</h2>
                            <span className="text-xs text-gray-400">({day.rows.length} ta)</span>
                        </div>
                        {day.rows.length === 0 ? (
                            <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t('finance.cash.noPayments')}</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {day.rows.map(row => (
                                    <li key={row.id} className="px-5 py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                {row.time && <span className="text-gray-400 font-normal mr-2">{row.time}</span>}
                                                {row.patientName}
                                            </p>
                                            <p className="text-[11px] text-gray-400 truncate">
                                                {row.doctorName}
                                                {row.service && <><span className="mx-1.5">·</span>{row.service}</>}
                                                <span className="mx-1.5">·</span>
                                                {getPaymentMethodLabel(row.method)}
                                                {row.receivedByName && (
                                                    <><span className="mx-1.5">·</span>qabul qildi: {row.receivedByName}</>
                                                )}
                                            </p>
                                        </div>
                                        <span className={`text-sm font-bold tabular-nums shrink-0 ${row.isMoneyIn
                                            ? 'text-gray-900 dark:text-white'
                                            : 'text-gray-400 line-through'}`}>
                                            {num(row.amount)}
                                        </span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => setReceiptTx(transactions.find(t => t.id === row.id) || null)}
                                                title={t('finance.cash.receipt')}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                            >
                                                <Printer className="w-4 h-4" />
                                            </button>
                                            {/* Xizmat qatorlariga bog'langan chekni tuzatib yoki
                                                o'chirib bo'lmaydi: qatorning to'lov holati chekdan
                                                ajralib qolardi. Server bunday urinishni 409 bilan
                                                rad etadi, shuning uchun tugmani bosiladigan qilib
                                                qo'yish — foydalanuvchini xatoga yetaklash. To'g'ri
                                                yo'l yonidagi «Qaytarish» tugmasi. */}
                                            {onUpdateTransaction && (
                                                <button
                                                    onClick={() => {
                                                        const tx = transactions.find(t => t.id === row.id);
                                                        if (tx) openEdit(tx);
                                                    }}
                                                    disabled={transactions.find(t => t.id === row.id)?.linkedToCharges}
                                                    title={transactions.find(t => t.id === row.id)?.linkedToCharges
                                                        ? "Xizmat qatorlariga bog'langan chek — summasini «Qaytarish» orqali tuzating"
                                                        : 'Tuzatish'}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                            )}
                                            {/* Qaytarish — qator bo'yicha, jurnalga tushadi.
                                                Bu yo'l kerak, chunki hammasini to'lab bo'lgan
                                                bemorning "To'lanmagan" ro'yxatida qatori yo'q,
                                                ya'ni boshqa kirish nuqtasi qolmaydi. */}
                                            {canRefundCharges && row.patientId && row.method !== 'Refund' && (
                                                <button
                                                    onClick={() => openChargePayment(row.patientName, row.patientId)}
                                                    title="Qaytarish yoki qolgan qatorlarni to'lash"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                >
                                                    <Undo2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            {onDeleteTransaction && (
                                                <button
                                                    onClick={() => setDeletingRow(row)}
                                                    disabled={transactions.find(t => t.id === row.id)?.linkedToCharges}
                                                    title={transactions.find(t => t.id === row.id)?.linkedToCharges
                                                        ? "Xizmat qatorlariga bog'langan chek — o'chirib bo'lmaydi, «Qaytarish» dan foydalaning"
                                                        : "O'chirish"}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>


                    {/* ── To'lanmaganlar: kimdan pul olinmadi ── */}
                    <Card className="overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">{t('finance.cash.unpaid')}</h2>
                                <span className="text-xs text-gray-400">({unpaidItems.length} ta)</span>
                            </div>
                            <span className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                                {num(unpaidTotal)} UZS
                            </span>
                        </div>
                        {olderDue > 0 && (
                            <div className="px-5 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
                                <p className="text-[11px] text-amber-800 dark:text-amber-200">{t('finance.cash.debtFromOtherDays')}<b className="tabular-nums">{num(olderDue)} UZS</b>
                                </p>
                            </div>
                        )}
                        {unpaidItems.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t('finance.cash.allCollected')}</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {unpaidItems.map(item => (
                                    <li key={`${item.kind}-${item.id}`} className="px-5 py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                {item.patientName}
                                            </p>
                                            <p className="text-[11px] text-gray-400 truncate">
                                                {item.kind === 'debt'
                                                    ? <span className="text-amber-600 dark:text-amber-400 font-bold">{t('finance.cash.onCredit')}</span>
                                                    : item.kind === 'charge'
                                                        ? <span className="text-primary-600 dark:text-primary-400 font-bold">{t('finance.cash.orderedByDoctor')}</span>
                                                        : <span className="text-gray-500">{t('finance.cash.visitDoneUnpaid')}</span>}
                                                {item.doctorName && <><span className="mx-1.5">.</span>{item.doctorName}</>}
                                                {item.service && <><span className="mx-1.5">.</span>{item.service}</>}
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold tabular-nums shrink-0 text-amber-600 dark:text-amber-400">
                                            {item.amount ? num(item.amount) : '—'}
                                        </span>
                                        <button
                                            onClick={() => {
                                                if (item.kind === 'charge') openChargePayment(item.patientName, item.patientId);
                                                else if (item.kind === 'debt' && item.tx) openDebt(item.tx);
                                                else {
                                                    setPresetPayment({
                                                        patientId: item.patientId,
                                                        doctorId: item.doctorId,
                                                        service: item.service,
                                                        amount: item.amount || undefined,
                                                    });
                                                    setIsPaymentOpen(true);
                                                }
                                            }}
                                            className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                                        >{t('finance.cash.pay')}</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    {/* ── Kunlik xarajatlar ── */}
                    <Card className="overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TrendingDown className="w-4 h-4 text-gray-400" />
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Xarajatlar</h2>
                                <span className="text-xs text-gray-400">({day.expenses.length} ta)</span>
                            </div>
                            <span className="text-sm font-black text-red-600 dark:text-red-400 tabular-nums">
                                {num(day.totals.expenseTotal)} UZS
                            </span>
                        </div>
                        {day.expenses.length === 0 ? (
                            <div className="px-5 py-8 text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t('finance.cash.noExpenses')}</p>
                                {onAddExpense && (
                                    <button
                                        onClick={openExpenseModal}
                                        className="mt-2 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
                                    >
                                        Xarajat qo'shish →
                                    </button>
                                )}
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {day.expenses.map(e => (
                                    <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.title}</p>
                                            <p className="text-[11px] text-gray-400">
                                                {EXPENSE_CATEGORY_LABELS[e.category] || e.category}
                                                <span className="mx-1.5">·</span>
                                                {getPaymentMethodLabel(e.method)}
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums shrink-0">
                                            −{num(e.amount)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    {/* ── Kassa harakatlari ── */}
                    <Card className="overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                <ArrowDownToLine className="w-4 h-4 text-gray-400" />
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('finance.cash.cashMoves')}</h2>
                                <span className="text-xs text-gray-400">({day.movements.length} ta)</span>
                            </div>
                            {day.movements.length === 0 ? (
                                <div className="px-5 py-8 text-center">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('finance.cash.noCashInOut')}</p>
                                    {onAddCashMovement && (
                                        <div className="flex items-center justify-center gap-3 mt-3">
                                            <button
                                                onClick={() => openMovement('Encashment')}
                                                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                            >
                                                Inkassatsiya →
                                            </button>
                                            <button
                                                onClick={() => openMovement('Refund')}
                                                className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:underline"
                                            >
                                                Qaytarish →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {day.movements.map(m => {
                                    const isOut = m.type === 'Encashment' || m.type === 'Refund';
                                    return (
                                        <li key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {CASH_MOVEMENT_LABELS[m.type] || m.type}
                                                </p>
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    {getPaymentMethodLabel(m.method)}
                                                    {m.createdByName && <><span className="mx-1.5">·</span>{m.createdByName}</>}
                                                    {m.note && <><span className="mx-1.5">·</span>{m.note}</>}
                                                </p>
                                            </div>
                                            <span className={`text-sm font-bold tabular-nums shrink-0 ${isOut
                                                ? 'text-indigo-600 dark:text-indigo-400'
                                                : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                {isOut ? '−' : '+'}{num(m.amount)}
                                            </span>
                                            {onDeleteCashMovement && (
                                                <button
                                                    onClick={() => onDeleteCashMovement(m.id).catch(() => { })}
                                                    title="O'chirish"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                            )}
                    </Card>

                    </div>

                    {/* -- O'zgarishlar izi -- */}
                    <Card className="overflow-hidden">
                        <button
                            onClick={toggleAudit}
                            className="w-full px-5 py-4 flex items-center gap-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                        >
                            <History className="w-4 h-4 text-gray-400" />
                            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('finance.cash.auditTrail')}</h2>
                            <span className="text-xs text-gray-400">kim nimani o'chirgan yoki tuzatgan</span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${auditOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {auditOpen && (
                            <div className="border-t border-gray-100 dark:border-gray-700">
                                {auditLoading ? (
                                    <p className="px-5 py-6 text-center text-sm text-gray-400">Yuklanmoqda...</p>
                                ) : auditLogs.length === 0 ? (
                                    <p className="px-5 py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('finance.cash.noChanges')}</p>
                                ) : (
                                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {auditLogs.map(log => (
                                            <li key={log.id} className="px-5 py-3 flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm text-gray-900 dark:text-white">{log.summary}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        {log.byName || 'Xodim'}
                                                        <span className="mx-1.5">.</span>
                                                        {new Date(log.createdAt).toLocaleString('uz-UZ')}
                                                    </p>
                                                </div>
                                                {log.afterClose && (
                                                    <span className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                                                        yopilgandan keyin
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* ── Hozir klinikada: kim oynada turishi mumkin ────────
                        Kassir ro'yxatning boshiga qaraydi va oynadagi odamni
                        navbat raqami bo'yicha topadi. */}
                    {hereNow.length > 0 && (
                        <Card className="overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                <Users className="w-4 h-4 text-primary-500 shrink-0" />
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('finance.cash.nowInClinic')}</h2>
                                <span className="text-xs text-gray-400">({hereNow.length} ta to'lovsiz)</span>
                                <span className="ml-auto text-sm font-black text-primary-600 dark:text-primary-400 tabular-nums">
                                    {num(hereNow.reduce((s: number, g: any) => s + (g.due || 0), 0))} UZS
                                </span>
                            </div>
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                {hereNow.map((g: any) => (
                                    <li key={g.patientId || g.patientName} className="px-5 py-3 flex flex-wrap items-center gap-3">
                                        {g.queueNumber != null && (
                                            <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 grid place-items-center font-bold text-sm shrink-0">
                                                {g.queueNumber}
                                            </span>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.patientName}</p>
                                            <p className="text-[11px] text-gray-400">
                                                {(g.items || []).length} ta xizmat
                                                {(g.items || []).length > 0 ? ` · ${g.items.map((i: any) => i.name).join(', ').slice(0, 60)}` : ''}
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                                            {num(g.due)}
                                        </span>
                                        <button onClick={() => openChargePayment(g.patientName, g.patientId)}
                                            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700">{t('finance.cash.pay')}</button>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}

                    {/* ── Smena holati ──────────────────────────────────────
                        Kim kassada turgani. Majburiy emas: ochmasdan ham
                        ishlash mumkin, lekin ochilgan bo'lsa kunni yopishda
                        boshlang'ich naqd kimning so'zi ekani ma'lum bo'ladi. */}
                    {!closureStatus.closed && date === today && (
                        openedShift ? (
                            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                <LockOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="text-sm text-emerald-900 dark:text-emerald-200">
                                    Smena ochiq{openedShift.openedByName ? ` — ${openedShift.openedByName}` : ''}
                                    {openedShift.openedAt ? ` · ${new Date(openedShift.openedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </span>
                                <span className="text-xs text-emerald-700 dark:text-emerald-300 ml-auto tabular-nums">
                                    boshlang'ich naqd {num(openedShift.openingCash || 0)}
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                                <span className="text-sm text-gray-600 dark:text-gray-300">{t('finance.cash.shiftNotOpen')}</span>
                                <Button size="sm" variant="secondary" className="ml-auto"
                                    onClick={handleOpenShift} disabled={openingShift}>
                                    {openingShift ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <LockOpen className="w-3.5 h-3.5 mr-1.5" />}
                                    Smenani ochish
                                </Button>
                            </div>
                        )
                    )}

                    {/* ── Naqd yashik hisobi ── */}
                    <CashFlowPanel
                        day={day}
                        closure={closureStatus}
                        onClose={onCloseDay ? openCloseModal : undefined}
                    />
                </>
            ) : (
                /* ── Oylik daftar ── */
                <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-gray-400" />
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('finance.cash.dayBook')}</h2>
                        <span className="text-xs text-gray-400">kunni bosing — o'sha kun varag'i ochiladi</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700/40">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10">Kun</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">{t('finance.cash.cash')}</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">{t('finance.cash.cashless')}</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">Jami</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase">{t('finance.cash.expense')}</th>
                                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap">{t('finance.cash.leftInDrawer')}</th>
                                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap">Holat</th>
                                    {doctorCols.map(col => (
                                        <th key={col.id} className="px-3 py-3 text-right text-[11px] font-bold text-gray-400 uppercase whitespace-nowrap min-w-[100px]">
                                            {col.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {monthData.days.map(d => (
                                    <tr
                                        key={d.date}
                                        onClick={() => openDay(d.date)}
                                        className={`cursor-pointer transition-colors hover:bg-primary-50 dark:hover:bg-primary-900/10 ${!d.hasActivity ? 'opacity-40' : ''
                                            } ${d.date === today ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
                                    >
                                        <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10 whitespace-nowrap">
                                            {String(d.day).padStart(2, '0')}
                                            {d.date === today && <span className="ml-2 text-[10px] text-primary-600 font-bold">bugun</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                            {d.totals.cashIn ? num(d.totals.cashIn) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 dark:text-blue-400">
                                            {d.totals.nonCashIn ? num(d.totals.nonCashIn) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-gray-900 dark:text-white">
                                            {d.totals.gross ? num(d.totals.gross) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                                            {d.totals.expenseTotal ? `−${num(d.totals.expenseTotal)}` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                                            {d.totals.drawer ? num(d.totals.drawer) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <ClosureChip status={closureByDate.get(d.date)} hasActivity={d.hasActivity} />
                                        </td>
                                        {doctorCols.map(col => (
                                            <td key={col.id} className="px-3 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                                                {d.byDoctor[col.id] ? num(d.byDoctor[col.id]) : <span className="text-gray-200 dark:text-gray-700">·</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 dark:bg-gray-700/40 border-t-2 border-gray-200 dark:border-gray-600">
                                <tr>
                                    <td className="px-4 py-3 font-black text-gray-900 dark:text-white sticky left-0 bg-gray-50 dark:bg-gray-700/40 z-10">JAMI</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-emerald-600 dark:text-emerald-400">{num(monthData.totals.cashIn)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-blue-600 dark:text-blue-400">{num(monthData.totals.nonCashIn)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-gray-900 dark:text-white">{num(monthData.totals.gross)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-red-600 dark:text-red-400">−{num(monthData.totals.expenseTotal)}</td>
                                    <td className="px-3 py-3 text-right font-black tabular-nums text-amber-600 dark:text-amber-400">{num(monthData.totals.drawer)}</td>
                                    <td className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 whitespace-nowrap">
                                        {monthData.days.filter(d => closureByDate.get(d.date)?.closed).length}
                                        {' / '}
                                        {monthData.days.filter(d => d.hasActivity).length} yopilgan
                                    </td>
                                    {doctorCols.map(col => {
                                        const total = monthData.days.reduce((s, d) => s + (d.byDoctor[col.id] || 0), 0);
                                        return (
                                            <td key={col.id} className="px-3 py-3 text-right font-black tabular-nums text-gray-900 dark:text-white">
                                                {total ? num(total) : '—'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            {/* ── Bemorning qatorlarini to'lash ── */}
            {payingPatient && (
                <ChargePaymentModal
                    isOpen={!!payingPatient}
                    onClose={() => setPayingPatient(null)}
                    patientName={payingPatient.name}
                    charges={payingCharges}
                    patientId={payingPatient.patientId}
                    receivedByName={currentUserName}
                    role={userRole}
                    addToast={addToast}
                    onDone={() => { onChargesChanged?.(); loadHereNow(); }}
                />
            )}

            {/* ── To'lov qabul qilish ── */}
            {onAddTransaction && (
                <QuickPaymentModal
                    isOpen={isPaymentOpen}
                    onClose={() => { setIsPaymentOpen(false); setPresetPayment(null); }}
                    presetPatientId={presetPayment?.patientId}
                    presetDoctorId={presetPayment?.doctorId}
                    presetService={presetPayment?.service}
                    presetAmount={presetPayment?.amount}
                    patients={patients}
                    doctors={doctors}
                    services={services}
                    clinicId={clinicId}
                    onAddTransaction={onAddTransaction}
                    // Ko'rilayotgan kunga yoziladi, bugungi kunga emas
                    presetDate={date}
                />
            )}

            {/* ── Xarajat yozish ── */}
            <Modal
                isOpen={isExpenseOpen}
                onClose={() => setIsExpenseOpen(false)}
                title={`Xarajat — ${formatDateLabel(date)}`}
                className="max-w-md"
            >
                <div className="space-y-4">
                    <Select
                        label={t('finance.cash.category')}
                        value={expenseForm.category}
                        onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                        options={KASSA_EXPENSE_CATEGORIES.map(c => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))}
                    />

                    {/* Bo'lim ixtiyoriy: "qaysi bo'lim foydali" hisoboti
                        shundan quriladi. Bo'sh qolsa — "umumiy xarajat". */}
                    {departments.length > 0 && (
                        <div>
                            <Select
                                label="Bo'lim"
                                value={expenseForm.departmentId}
                                onChange={e => setExpenseForm(f => ({ ...f, departmentId: e.target.value }))}
                            >
                                <option value="">{t('finance.cash.noDepartment')}</option>
                                {departments.filter(d => d.isActive).map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </Select>
                            <p className="text-[11px] text-gray-400 mt-1">{t('finance.cash.deptExpenseHint')}</p>
                        </div>
                    )}

                    <Input
                        label="Nomi *"
                        value={expenseForm.title}
                        onChange={e => setExpenseForm(f => ({ ...f, title: e.target.value }))}
                        placeholder={t('finance.cash.expensePlaceholder')}
                        autoFocus
                    />

                    <Input
                        label={t('finance.cash.amountRequired')}
                        type="number"
                        value={expenseForm.amount}
                        onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                        onWheel={e => e.currentTarget.blur()}
                        placeholder="0"
                    />

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('finance.cash.paidFrom')}</label>
                        <div className="flex gap-2 flex-wrap">
                            {EXPENSE_PAYMENT_METHODS.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setExpenseForm(f => ({ ...f, method: m }))}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${expenseForm.method === m
                                        ? 'bg-red-500 text-white border-red-500'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-400'}`}
                                >
                                    {getPaymentMethodLabel(m)}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            Naqd tanlansa kassadagi pul kamayadi. Boshqasi hisob raqamdan chiqadi.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('finance.cash.noteOptional')}</label>
                        <textarea
                            value={expenseForm.note}
                            onChange={e => setExpenseForm(f => ({ ...f, note: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white placeholder-gray-400"
                        />
                    </div>

                    <p className="text-[11px] text-gray-400">
                        Oylik va shifokor ulushi bu yerda yo'q — ular Hisobot tabida rasmiylashtiriladi.
                    </p>

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setIsExpenseOpen(false)}>Bekor</Button>
                        <button
                            onClick={handleSaveExpense}
                            disabled={expenseSaving || !canSaveExpense}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed transition-all"
                        >
                            {expenseSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {expenseSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── Kassa harakati (inkassatsiya / qaytarish) ── */}
            <Modal
                isOpen={movementType !== null}
                onClose={() => setMovementType(null)}
                title={movementType ? `${CASH_MOVEMENT_LABELS[movementType]} — ${formatDateLabel(date)}` : ''}
                className="max-w-md"
            >
                <div className="space-y-4">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">{t('finance.cash.expectedNow')}</span>
                        <span className="font-black tabular-nums text-amber-600 dark:text-amber-400">
                            {num(day.totals.drawer)}
                        </span>
                    </div>

                    <Input
                        label={t('finance.cash.amountRequired')}
                        type="number"
                        value={movementForm.amount}
                        onChange={e => setMovementForm(f => ({ ...f, amount: e.target.value }))}
                        onWheel={e => e.currentTarget.blur()}
                        placeholder="0"
                        autoFocus
                    />

                    {movementType === 'Encashment' && (
                        <button
                            type="button"
                            onClick={() => setMovementForm(f => ({ ...f, amount: String(Math.max(0, Math.round(day.totals.drawer))) }))}
                            className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
                        >
                            Hammasini olish ({num(day.totals.drawer)})
                        </button>
                    )}

                    {movementType === 'Refund' && patients.length > 0 && (
                        <Select
                            label={t('finance.cash.patientOptional')}
                            value={movementForm.patientId}
                            onChange={e => setMovementForm(f => ({ ...f, patientId: e.target.value }))}
                            options={[
                                { value: '', label: 'Tanlanmagan' },
                                ...patients.map(pt => ({ value: pt.id, label: `${formatFullName(pt)}` })),
                            ]}
                        />
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('finance.cash.noteOptional')}</label>
                        <textarea
                            value={movementForm.note}
                            onChange={e => setMovementForm(f => ({ ...f, note: e.target.value }))}
                            rows={2}
                            placeholder={movementType === 'Encashment' ? 'Kimga topshirildi' : 'Nima uchun qaytarildi'}
                            className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white placeholder-gray-400"
                        />
                    </div>

                    <p className="text-[11px] text-gray-400">
                        Bu xarajat emas — kassadagi naqdni kamaytiradi, lekin klinikaning sof foydasiga ta'sir qilmaydi.
                    </p>

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setMovementType(null)}>Bekor</Button>
                        <button
                            onClick={handleSaveMovement}
                            disabled={movementSaving || !canSaveMovement}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed transition-all"
                        >
                            {movementSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {movementSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── To'lovni o'chirish tasdig'i ── */}
            <Modal
                isOpen={deletingRow !== null}
                onClose={() => setDeletingRow(null)}
                title="To'lovni o'chirish"
                className="max-w-md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                        <b>{deletingRow?.patientName}</b> — <b>{num(deletingRow?.amount || 0)} UZS</b> to'lovi o'chiriladi.
                    </p>
                    {closureStatus.closed && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3">
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Bu kun allaqachon yopilgan. O'chirsangiz kassa summasi o'zgaradi va
                                "yopilgandan keyin o'zgardi" belgisi chiqadi.
                            </p>
                        </div>
                    )}
                    <p className="text-[11px] text-gray-400">
                        O'chirish izda qoladi: kim, qachon va qaysi to'lovni o'chirgani yozib qo'yiladi.
                    </p>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setDeletingRow(null)}>Bekor</Button>
                        <button
                            onClick={handleDeleteRow}
                            disabled={deleting}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 transition-all"
                        >
                            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {deleting ? "O'chirilmoqda..." : "O'chirish"}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* -- Qarzni yopish -- */}
            <Modal
                isOpen={payingDebt !== null}
                onClose={() => setPayingDebt(null)}
                title={t('finance.cash.closeDebt')}
                className="max-w-md"
            >
                <div className="space-y-4">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{payingDebt?.patientName}</p>
                        <p className="text-[11px] text-gray-400">{payingDebt?.service}</p>
                        <p className="text-lg font-black tabular-nums text-amber-600 dark:text-amber-400 mt-1">
                            {num(payingDebt?.amount || 0)} UZS
                        </p>
                    </div>

                    <Input
                        label="To'lanayotgan summa (UZS)"
                        type="number"
                        value={debtAmount}
                        onChange={e => setDebtAmount(e.target.value)}
                        onWheel={e => e.currentTarget.blur()}
                        autoFocus
                    />
                    {Number(debtAmount) > 0 && Number(debtAmount) < (payingDebt?.amount || 0) && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            Qisman to'lov: {num((payingDebt?.amount || 0) - Number(debtAmount))} UZS qarz bo'lib qoladi.
                        </p>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('finance.cash.paymentMethod')}</label>
                        <div className="flex gap-2 flex-wrap">
                            {INCOMING_PAYMENT_METHODS.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setDebtMethod(m)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${debtMethod === m
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-400'}`}
                                >
                                    {getPaymentMethodLabel(m)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-400">
                        To'lov ko'rilayotgan kunga ({formatDateLabel(date)}) yoziladi.
                    </p>

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setPayingDebt(null)}>Bekor</Button>
                        <button
                            onClick={handlePayDebt}
                            disabled={debtSaving || !(Number(debtAmount) > 0)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 transition-all"
                        >
                            {debtSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {debtSaving ? 'Saqlanmoqda...' : 'To\'lovni qabul qilish'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* -- To'lovni tuzatish -- */}
            <Modal
                isOpen={editingTx !== null}
                onClose={() => setEditingTx(null)}
                title="To'lovni tuzatish"
                className="max-w-md"
            >
                <div className="space-y-4">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{editingTx?.patientName}</p>
                        <p className="text-[11px] text-gray-400">
                            {editingTx?.service}
                            <span className="mx-1.5">.</span>
                            {editingTx?.date}
                        </p>
                    </div>

                    <Input
                        label={t('finance.cash.amountRequired')}
                        type="number"
                        value={editForm.amount}
                        onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                        onWheel={e => e.currentTarget.blur()}
                        autoFocus
                    />

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('finance.cash.paymentMethod')}</label>
                        <div className="flex gap-2 flex-wrap">
                            {PAYMENT_METHODS.filter(m => m.key !== 'Balance').map(m => (
                                <button
                                    key={m.key}
                                    type="button"
                                    onClick={() => setEditForm(f => ({ ...f, type: m.key }))}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${editForm.type === m.key
                                        ? 'bg-primary-600 text-white border-primary-600'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {closureStatus.closed && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3">
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Bu kun yopilgan. O'zgartirsangiz kassa summasi o'zgaradi va izda qoladi.
                            </p>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setEditingTx(null)}>Bekor</Button>
                        <Button className="flex-1" onClick={handleSaveEdit} disabled={editSaving || !canSaveEdit}>
                            {editSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ── Chek ── */}
            <ReceiptModal
                isOpen={receiptTx !== null}
                onClose={() => setReceiptTx(null)}
                transaction={receiptTx}
                clinic={currentClinic || undefined}
            />

            {/* ── Kunni yopish modali ── */}
            <Modal
                isOpen={isCloseOpen}
                onClose={() => setIsCloseOpen(false)}
                title={`Kunni yopish — ${formatDateLabel(date)}`}
            >
                <div className="space-y-5">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                            <span>{t('finance.cash.openingBalance')}</span>
                            <span className="font-semibold tabular-nums">{num(day.totals.openingCash)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                            <span>{t('finance.cash.cashIn')}</span>
                            <span className="font-semibold tabular-nums">{num(day.totals.cashIn)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-300">
                            <span>{t('finance.cash.cashOut')}</span>
                            <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">−{num(day.totals.cashExpense)}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700 text-base">
                            <span className="font-bold text-gray-900 dark:text-white">{t('finance.cash.ledgerInDrawer')}</span>
                            <span className="font-black tabular-nums text-amber-600 dark:text-amber-400">
                                {expectedLoading ? '…' : num(expectedForClose)}
                            </span>
                        </div>
                        {serverExpected && (
                            <p className="text-[11px] text-gray-400 pt-1">
                                Server hisobi: {serverExpected.sources?.paymentCount ?? 0} to'lov,
                                boshlang'ich {num(serverExpected.openingCash)}
                                {serverExpected.sources?.openingFrom ? ` (${formatDateLabel(String(serverExpected.sources.openingFrom))} yopilishidan)` : ''}
                            </p>
                        )}
                        {expectedDrift > 1 && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">
                                Diqqat: ekrandagi hisob {num(day.totals.drawer)}, server hisobi {num(serverExpected!.expectedCash)}.
                                Yopilishda server raqami yoziladi. Sahifani yangilab ko'ring.
                            </p>
                        )}
                        {expectedError && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">
                                Server hisobi olinmadi ({expectedError}) — ekrandagi hisob bilan yopiladi.
                            </p>
                        )}
                    </div>

                    {/* YOPILMAGAN QATORLAR. Kassa sog' kelishi mumkin, lekin
                        kunning xizmatlari to'lanmagan bo'lib qolishi ham
                        mumkin: kassir hammasini to'g'ri sanaydi, bemorlarning
                        yarmi esa to'lamasdan ketgan. Ilgari kun yopilishida bu
                        savol umuman berilmasdi. Taqiq emas — ko'rinishi kerak. */}
                    {serverExpected?.openCharges && serverExpected.openCharges.count > 0 && (
                        <div className="rounded-xl p-4 border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                                        Bugun {serverExpected.openCharges.count} xizmat to'lanmagan
                                        — {num(serverExpected.openCharges.due)} UZS
                                    </p>
                                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                                        {serverExpected.openCharges.patients} bemor. Kassa to'g'ri kelishi
                                        mumkin, lekin bu pul olinmagan. Kunni yopish taqiqlanmaydi —
                                        bilib turishingiz uchun.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <Input
                            label={t('finance.cash.countedCashLabel')}
                            type="number"
                            value={countedInput}
                            onChange={e => setCountedInput(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="0"
                            autoFocus
                        />
                        {/* Ilgari bu yerda "hisob bo'yicha summani qo'yish"
                            tugmasi bor edi. U bir bosishda farqni nolga
                            aylantirardi — ya'ni sanashning o'zi ma'nosiz
                            bo'lib qolardi. Olib tashlandi (C6). */}
                        <p className="mt-2 text-[11px] text-gray-400">
                            Pulni sanab, haqiqiy summani kiriting. Farqni tizim o'zi chiqaradi.
                        </p>
                    </div>

                    {countedInput.trim() !== '' && isFinite(countedValue) && (
                        <div className={`rounded-xl p-4 border ${Math.abs(previewDifference) < 1
                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                            : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-900 dark:text-white">Farq</span>
                                <span className={`text-lg font-black tabular-nums ${Math.abs(previewDifference) < 1
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'}`}>
                                    {previewDifference > 0 ? '+' : ''}{num(previewDifference)}
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                {Math.abs(previewDifference) < 1
                                    ? "Kassa to'g'ri keldi."
                                    : previewDifference > 0
                                        ? "Kassada hisobdan ko'p pul bor — kiritilmagan to'lov bo'lishi mumkin."
                                        : "Kassada hisobdan kam pul bor — yozilmagan xarajat bo'lishi mumkin."}
                            </p>
                        </div>
                    )}

                    {/* Terminal va Click — ixtiyoriy, kiritilsa solishtiriladi */}
                    {(expectedCard > 0 || expectedClick > 0) && (
                        <div className="space-y-3 pt-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('finance.cash.compareCashless')}</p>
                            {expectedCard > 0 && (
                                <ReconRow
                                    label={t('finance.cash.terminalZ')}
                                    expected={expectedCard}
                                    value={countedCardInput}
                                    onChange={setCountedCardInput}
                                    counted={countedCardValue}
                                />
                            )}
                            {expectedClick > 0 && (
                                <ReconRow
                                    label={t('finance.cash.clickPayme')}
                                    expected={expectedClick}
                                    value={countedClickInput}
                                    onChange={setCountedClickInput}
                                    counted={countedClickValue}
                                />
                            )}
                            <p className="text-[11px] text-gray-400">{t('finance.cash.compareHint')}</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('finance.cash.noteOptional')}</label>
                        <textarea
                            value={closeNote}
                            onChange={e => setCloseNote(e.target.value)}
                            rows={2}
                            placeholder={t('finance.cash.notePlaceholder')}
                            className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white placeholder-gray-400"
                        />
                    </div>

                    <p className="text-[11px] text-gray-400">
                        Yopish kunni qulflamaydi — kechroq kelgan to'lov baribir yoziladi.
                        Shunda bu sahifada "yopilgandan keyin o'zgardi" belgisi chiqadi.
                    </p>

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setIsCloseOpen(false)}>Bekor</Button>
                        <Button
                            className="flex-1"
                            onClick={handleCloseDay}
                            disabled={closeSaving || countedInput.trim() === '' || !isFinite(countedValue)}
                        >
                            {closeSaving ? 'Saqlanmoqda...' : closureStatus.closed ? 'Yangilash' : 'Kunni yopish'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
