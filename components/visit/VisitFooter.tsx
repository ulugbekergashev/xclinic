import React from 'react';
import { ArrowRight, CheckCircle, Plus, Printer, XCircle } from 'lucide-react';
import { ChargeSummary, Visit } from '../../types';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatDate, formatNumber, formatTime } from '../../utils/format';
import { AddButton } from './sheetParts';

/* Varaqning pastki ikki qatori: qabulni yopish va hisob. */

export const lightBtn = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-surface text-primary-700 dark:text-primary-300 text-xs font-bold whitespace-nowrap hover:border-primary-400 disabled:opacity-50';

/** Ochiq qabulda — keyingi tashrif va «Yakunlash»; yopilganida — nima bo'lgani */
export const VisitFinishRow: React.FC<{
    visit: Visit;
    /** Yozib bo'lmaydi: qabul yopilgan yoki foydalanuvchining huquqi yo'q */
    locked: boolean;
    busy: boolean;
    nextAppointment?: { date: string; time: string; doctorName?: string } | null;
    onSchedule?: () => void;
    /** Retsept yozilgan bo'lsa — uni chop etish */
    onPrintRx?: () => void;
    onComplete: () => void;
    /** Yakunlangan qabuldan keyin shu kunning o'zida yana bittasini ochish */
    onNewVisit?: () => void;
}> = ({ visit, locked, busy, nextAppointment, onSchedule, onPrintRx, onComplete, onNewVisit }) => {
    const { t } = useLanguage();
    const printRx = onPrintRx && (
        <button type="button" onClick={onPrintRx} className={`${lightBtn} h-9`}>
            <Printer className="w-3.5 h-3.5" /> {t('visit.writeRx')}
        </button>
    );

    const closed = visit.status === 'Completed' || visit.status === 'Cancelled';
    // Ochiq qabul, lekin yozish huquqi yo'q — yakunlash tugmasi ham yo'q
    if (!closed && locked) return null;
    if (!closed) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-4 border-t border-dashed border-line">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                    {nextAppointment && (
                        <span>
                            {t('visit.nextVisit')}: <b className="font-bold text-ink">{formatDate(nextAppointment.date)}, {nextAppointment.time}</b>
                            {nextAppointment.doctorName ? ` · ${nextAppointment.doctorName}` : ''}
                        </span>
                    )}
                    {onSchedule && <AddButton label={t('visit.nextVisitAdd')} onClick={onSchedule} />}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {printRx}
                    <button type="button" onClick={onComplete} disabled={busy}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-[12.5px] font-bold whitespace-nowrap shadow-lg shadow-primary-900/15 disabled:opacity-50">
                        {t('visit.complete')} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    const completed = visit.status === 'Completed';
    return (
        <div role="status" className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border-[1.5px] ${completed
            ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/20'
            : 'border-line bg-canvas'}`}>
            <span aria-hidden="true" className={`shrink-0 w-8 h-8 rounded-full grid place-items-center ${completed
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-elevated text-muted'}`}>
                {completed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </span>
            <p className="min-w-0 flex-1 text-[13px] font-bold text-ink">
                {completed
                    ? (visit.checkOutTime ? fill(t('visit.doneAt'), formatTime(visit.checkOutTime)) : t('visit.completedOk'))
                    : t('visit.cancelledBanner')}
            </p>
            {printRx}
            {onNewVisit && (
                <button type="button" onClick={onNewVisit} className={`${lightBtn} h-9`}>
                    <Plus className="w-3.5 h-3.5" /> {t('visit.newVisit')}
                </button>
            )}
        </div>
    );
};

/** Hisob — bitta qator. To'lanmagan buyurtma — ogohlantirish, blok emas. */
export const VisitBill: React.FC<{
    money: ChargeSummary;
    referralBusy: boolean;
    onPrintReferral: () => void;
    /** To'lov oynasi — kassadagi bilan bir xil. Shifokorda bu tugma yo'q. */
    onTakePayment?: () => void;
}> = ({ money, referralBusy, onPrintReferral, onTakePayment }) => {
    const { t } = useLanguage();
    if (money.total <= 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 rounded-2xl border border-line bg-canvas text-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t('visit.billTitle')}</span>
            <span className="text-muted">{t('common.total')} <b className="text-ink tabular-nums">{formatNumber(money.total)}</b></span>
            <span className="text-muted">{t('visit.paid')} <b className="text-emerald-700 dark:text-emerald-400 tabular-nums">{formatNumber(money.paid)}</b></span>
            {money.due > 0 ? (
                <span className="text-amber-800 dark:text-amber-300">
                    <b className="tabular-nums">{formatNumber(money.due)} {t('ui.som')}</b> {t('visit.unpaidHint')}
                </span>
            ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-[11px] font-bold">
                    {t('visit.paidInFull')}
                </span>
            )}
            {money.due > 0 && (
                <span className="ml-auto flex flex-wrap items-center gap-2">
                    <button type="button" onClick={onPrintReferral} disabled={referralBusy} className={lightBtn}>
                        <Printer className="w-3.5 h-3.5" /> {t('visit.printReferral')}
                    </button>
                    {onTakePayment && (
                        <button type="button" onClick={onTakePayment}
                            className="inline-flex items-center h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold whitespace-nowrap">
                            {t('card.takePayment')}
                        </button>
                    )}
                </span>
            )}
        </div>
    );
};
