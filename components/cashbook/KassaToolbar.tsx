import React from 'react';
import { ArrowDownToLine, Banknote, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatDateLabel } from '../../utils/cashbook';

/* ─────────────────────────────────────────────────────────────────────────────
   KASSA TEPASI — bitta kunning amallari va sana.

   2026-11-22, olti maslahatchi (kassir, ega, DentaCRM tahlilchisi, bozor,
   raqamlar, soddalik tanqidchisi) muhokamasidan keyin:
     · CHAPDA — kunda ko'p bosiladigan uchta amal, rangi ma'nosi bilan:
       yashil «To'lov qo'shish», qizil «Xarajat», binafsha «Inkassatsiya»;
     · O'NGDA — sana ‹ Bugun, 22.11.2026 ›; egaga — «Excel».
   Yo'q narsalar va nega:
     · «⋯» menyu — u «Boshqa amallar» ning kichraygan nusxasi edi;
       «Qaytarish» to'langan qatorning o'zida turadi (chekka bog'langan),
       «Smenani ochish» kerak emas — smena birinchi to'lov bilan ochiladi;
     · «Kun | Oy» — oylik ko'rinish «Hisobot» modulining nusxasi edi va
       registratorga shifokorlar daromadini ko'rsatardi. Kassa — bitta kun;
     · «Kunni yopish» — yashik hisobining yonida, bitta joyda.
   ───────────────────────────────────────────────────────────────────────────── */

type Props = {
    date: string;
    today: string;
    onPay?: () => void;
    onExpense?: () => void;
    onEncashment?: () => void;
    /** Faqat egaga */
    onExport?: () => void;
    onDate: (d: string) => void;
    onShiftDate: (step: -1 | 1) => void;
};

export function KassaToolbar(p: Props) {
    const { t } = useLanguage();
    const isToday = p.date === p.today;

    const action = 'inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-bold transition-colors active:scale-[0.98]';
    const arrow = 'w-9 h-9 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-surface transition-colors disabled:opacity-30 disabled:hover:bg-transparent';

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Amallar — faqat bugun: o'tgan kunga pul yozilmaydi */}
            {isToday && p.onPay && (
                <button type="button" onClick={p.onPay} className={`${action} bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm`}>
                    <Plus className="w-4 h-4" aria-hidden="true" />{t('payment.title')}
                </button>
            )}
            {isToday && p.onExpense && (
                <button type="button" onClick={p.onExpense}
                    className={`${action} border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                    <Banknote className="w-4 h-4" aria-hidden="true" />{t('finance.cash.expense')}
                </button>
            )}
            {isToday && p.onEncashment && (
                <button type="button" onClick={p.onEncashment}
                    className={`${action} border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20`}>
                    <ArrowDownToLine className="w-4 h-4" aria-hidden="true" />{t('finance.cash.collection')}
                </button>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 p-1 rounded-xl bg-elevated">
                    <button type="button" className={arrow} onClick={() => p.onShiftDate(-1)} aria-label={t('finance.cash.prevDay')}>
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <label className="relative h-9 px-3 grid place-items-center rounded-lg text-sm font-bold text-ink tabular-nums cursor-pointer hover:bg-surface">
                        {isToday ? `${t('card.today')}, ${formatDateLabel(p.date)}` : formatDateLabel(p.date)}
                        {/* Sana yozuvini bosish — kalendar ochiladi */}
                        <input type="date" value={p.date} max={p.today} aria-label={t('cashbook.otherDay')}
                            onChange={e => e.target.value && p.onDate(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                    <button type="button" className={arrow} onClick={() => p.onShiftDate(1)} disabled={isToday} aria-label={t('finance.cash.nextDay')}>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
                {!isToday && (
                    <button type="button" onClick={() => p.onDate(p.today)}
                        className="h-11 px-3 rounded-xl border border-line text-sm font-bold text-primary-700 dark:text-primary-300 hover:bg-elevated">
                        {t('cashbook.backToToday')}
                    </button>
                )}
                {p.onExport && (
                    <button type="button" onClick={p.onExport} title={t('finance.cash.exportDay')}
                        className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl border border-line text-sm font-semibold text-muted hover:text-ink hover:bg-elevated">
                        <Download className="w-4 h-4" aria-hidden="true" />Excel
                    </button>
                )}
            </div>
        </div>
    );
}
