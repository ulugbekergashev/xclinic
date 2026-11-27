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

   2026-11-27 (ko'rinish): uch xil rangli ramka tartibsiz ko'rinardi. Endi
   faqat «To'lov qo'shish» to'q yashil; «Xarajat» va «Inkassatsiya» oq,
   ma'nosi ikonka rangida. Hamma tugma va sana bloki bir xil — 40px.
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

    const action = 'inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-colors active:scale-[0.98]';
    const quiet = `${action} border border-line bg-surface text-ink hover:bg-elevated shadow-sm`;
    const arrow = 'w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-elevated transition-colors disabled:opacity-30 disabled:hover:bg-transparent';

    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Amallar — faqat bugun: o'tgan kunga pul yozilmaydi */}
            {isToday && p.onPay && (
                <button type="button" onClick={p.onPay} className={`${action} bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm`}>
                    <Plus className="w-4 h-4" aria-hidden="true" />{t('payment.title')}
                </button>
            )}
            {isToday && p.onExpense && (
                <button type="button" onClick={p.onExpense} className={quiet}>
                    <Banknote className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />{t('finance.cash.expense')}
                </button>
            )}
            {isToday && p.onEncashment && (
                <button type="button" onClick={p.onEncashment} className={quiet}>
                    <ArrowDownToLine className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />{t('finance.cash.collection')}
                </button>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 h-10 px-1 rounded-xl border border-line bg-surface shadow-sm">
                    <button type="button" className={arrow} onClick={() => p.onShiftDate(-1)} aria-label={t('finance.cash.prevDay')}>
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <label className="relative h-8 px-2.5 grid place-items-center rounded-lg text-sm font-semibold text-ink tabular-nums cursor-pointer hover:bg-elevated">
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
                        className="h-10 px-3 rounded-xl border border-line bg-surface text-sm font-semibold text-primary-700 dark:text-primary-300 hover:bg-elevated shadow-sm">
                        {t('cashbook.backToToday')}
                    </button>
                )}
                {p.onExport && (
                    <button type="button" onClick={p.onExport} title={t('finance.cash.exportDay')}
                        className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-line bg-surface text-sm font-semibold text-muted hover:text-ink hover:bg-elevated shadow-sm">
                        <Download className="w-4 h-4" aria-hidden="true" />Excel
                    </button>
                )}
            </div>
        </div>
    );
}
