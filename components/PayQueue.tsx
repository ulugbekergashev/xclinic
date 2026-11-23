import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Card } from './Common';
import { useLanguage, fill } from '../context/LanguageContext';
import { initialsOf } from '../utils/flow';
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import type { CashBookTotals } from '../utils/cashbook';

/* ─────────────────────────────────────────────────────────────────────────────
   KASSA: KIM TO'LASHI KERAK.

   Kassirning savoli bitta: «kimdan qancha olaman?». Har bemor — bitta
   qator: ismi, nima qilingani, summasi va o'z «To'lash» tugmasi.

   2026-11-19 gacha bu ikki qadam edi: avval chapdagi ro'yxatdan odamni
   tanlash, keyin o'ngdagi «kassa oynasi» (qog'oz chek ko'rinishi) ostidagi
   tugmani bosish. Klinika «samolyot kabinasi» dedi — oynaning o'zi
   ro'yxatdagi ma'lumotni takrorlardi, xolos. Endi bir bosish.

   PUL BU YERDA OLINMAYDI. Tugma `ChargePaymentModal` ni ochadi — qisman
   to'lov, bir necha usul, chegirma va qarz o'sha oynada.
   ───────────────────────────────────────────────────────────────────────────── */

export interface PayGroup {
    key: string;
    zone: 'due' | 'stay';
    patientId?: string;
    patientName: string;
    due: number;
    /** here — qabuli ochiq; waiting — qabul yopildi, pul olinmagan; other — bugungi boshqa hisob */
    state: 'here' | 'waiting' | 'other' | 'stay';
    queueNumber?: number | null;
    items: { id: string; name: string; amount: number }[];
}

interface Props {
    /** `null` — navbat ko'rsatilmaydi (o'tgan kun): faqat kun yakuni */
    groups: PayGroup[] | null;
    totals: CashBookTotals;
    /** Yashikda hozir turishi kerak bo'lgan naqd */
    drawer: number;
    /** Boshqa kunlardan qolgan qarz — navbatda ko'rinmaydi, lekin yo'qolmasin */
    olderDue?: number;
    /** O'sha qarz — bemor bo'yicha, har biri o'z «To'lash» tugmasi bilan */
    olderGroups?: PayGroup[];
    onPay: (g: PayGroup) => void;
    /** Kassa tabi ichida — sarlavhasiz va qutisiz, faqat ro'yxat */
    bare?: boolean;
    /* Ism bo'yicha qidiruv (2026-11-23, Moliya rejasi 1-vazifa). Kassir eski
       qarzni ilgari Bemorlar → qidiruv → karta orqali olardi. Qidiruvda eski
       qarzlar ham ochiq ko'rinadi. */
    query?: string;
}

const num = (v: number) => Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ');

export const PayQueue: React.FC<Props> = ({ groups, totals, drawer, olderDue = 0, olderGroups: allOlder = [], onPay, bare = false, query = '' }) => {
    const { t } = useLanguage();
    /* Eski qarzlar ro'yxati sukut bo'yicha yopiq — bugungi navbat ko'zdan
       tushib qolmasin (DentaCRM: ikkinchi darajali blok soni bilan yopiq). */
    const [showOlderState, setShowOlder] = useState(false);

    const q = query.trim().toLowerCase();
    const match = (g: PayGroup) => !q || g.patientName.toLowerCase().includes(q);
    const due = (groups || []).filter(g => g.zone === 'due' && match(g));
    const stays = (groups || []).filter(g => g.zone === 'stay' && match(g));
    const olderGroups = allOlder.filter(match);
    const showOlder = showOlderState || !!q;
    const nothingFound = !!q && due.length + stays.length + olderGroups.length === 0;

    /* Qabul yopilib, pul olinmagan odam — ketib qolishi mumkin: faqat
       shu holat qizil bilan yoziladi, qolganlari izohsiz. */
    const row = (g: PayGroup) => (
        <li key={g.key} className="flex items-center gap-3 py-3">
            <span aria-hidden="true"
                className="shrink-0 w-9 h-9 rounded-full bg-elevated text-ink text-xs font-extrabold inline-flex items-center justify-center">
                {g.queueNumber != null ? g.queueNumber : initialsOf(g.patientName)}
            </span>
            <span className="min-w-0 flex-1 flex flex-col leading-snug">
                <span className="text-sm font-bold text-ink truncate">{g.patientName}</span>
                <span className="text-xs text-muted truncate">{g.items.map(i => i.name).join(' · ')}</span>
                {g.state === 'waiting' && (
                    <span className="text-[11px] font-bold text-red-600 dark:text-red-400">{t('pay.queue.leaving')}</span>
                )}
            </span>
            <span className="shrink-0 text-base font-black tabular-nums text-ink whitespace-nowrap">{num(g.due)}</span>
            <button type="button" onClick={() => onPay(g)}
                aria-label={`${t('finance.cash.pay')}: ${g.patientName}, ${num(g.due)} ${t('ui.som')}`}
                className="shrink-0 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors active:scale-[0.98]">
                {t('finance.cash.pay')}
            </button>
        </li>
    );

    // ── Kun yakuni: kassaga tushgan pul usullar bo'yicha ─────────────────────
    const methods = PAYMENT_METHODS.filter(m => m.isMoneyIn && (totals.byMethod[m.key] || 0) > 0);

    /* Navbat ro'yxatining o'zi — oddiy ko'rinishda ham, kassa tabida ham bir xil */
    const list = groups && (
                    <div className="mt-4">
                        {nothingFound ? (
                            <p className="py-4 text-sm font-semibold text-muted">{fill(t('pay.queue.notFound'), query.trim())}</p>
                        ) : due.length === 0 && q ? null : due.length === 0 ? (
                            <p className="py-4 text-sm font-semibold text-muted flex items-center gap-2">
                                <Check className="w-4 h-4 text-emerald-500" />{t('pay.queue.empty')}
                            </p>
                        ) : (
                            <ul className="divide-y divide-line border-t border-line">{due.map(row)}</ul>
                        )}

                        {stays.length > 0 && (
                            <>
                                <h3 className="mt-5 text-sm font-bold text-ink">{t('pay.queue.stays')}</h3>
                                <ul className="divide-y divide-line border-t border-line mt-2">{stays.map(row)}</ul>
                            </>
                        )}

                        {olderDue > 0 && olderGroups.length + (q ? 0 : 1) > 0 && (
                            <div className="mt-4">
                                <button type="button" onClick={() => setShowOlder(s => !s)} aria-expanded={showOlder}
                                    disabled={olderGroups.length === 0}
                                    className="w-full flex items-center gap-2 text-left text-sm font-semibold text-amber-700 dark:text-amber-400">
                                    <span className="flex-1">
                                        {t('finance.cash.debtFromOtherDays')} <b className="tabular-nums">{num(q ? olderGroups.reduce((s, g) => s + g.due, 0) : olderDue)} {t('ui.som')}</b>
                                    </span>
                                    {olderGroups.length > 0 && (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold">
                                            {showOlder ? t('pay.queue.hide') : fill(t('pay.queue.showN'), olderGroups.length)}
                                            <ChevronDown className={`w-4 h-4 transition-transform ${showOlder ? 'rotate-180' : ''}`} aria-hidden="true" />
                                        </span>
                                    )}
                                </button>
                                {showOlder && (
                                    <ul className="divide-y divide-line border-t border-line mt-2">{olderGroups.map(row)}</ul>
                                )}
                            </div>
                        )}
                    </div>
    );

    /* KASSA TABI ICHIDA (2026-11-22): sarlavha va kun raqamlari tab va
       tepadagi plitkalarda turadi — bu yerda faqat ro'yxat. Sarlavha ekran
       o'quvchi uchun qoladi (sinovlar ham bo'limni shu nom bilan topadi). */
    if (bare) {
        return (
            <section aria-labelledby="pay-queue-title" className="px-5 pb-3 [&>div]:mt-0 [&>div>ul:first-child]:border-t-0">
                <h2 id="pay-queue-title" className="sr-only">{fill(t('pay.queue.waiting'), due.length)}</h2>
                {list}
            </section>
        );
    }

    return (
        <Card className="p-5 sm:p-6">
            <section aria-labelledby="pay-queue-title">
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                    <h2 id="pay-queue-title" className="text-lg font-black text-ink">
                        {groups ? fill(t('pay.queue.waiting'), due.length) : t('pay.queue.dayTitle')}
                    </h2>
                    {/* Bugun kassaga qancha tushdi va yashikda qancha naqd */}
                    <dl className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
                        <div>
                            <dt className="text-xs font-semibold text-muted">{t('pay.queue.inTill')}</dt>
                            <dd className="text-lg font-black text-ink">{num(totals.gross)} <span className="text-xs font-bold text-faint">{t('ui.som')}</span></dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold text-muted">{t('pay.queue.drawer')}</dt>
                            <dd className="text-lg font-black text-ink">{num(drawer)} <span className="text-xs font-bold text-faint">{t('ui.som')}</span></dd>
                        </div>
                    </dl>
                </div>

                {methods.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                        {methods.map(m => (
                            <span key={m.key} className="inline-flex items-center gap-1.5">
                                <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                                {m.label} <b className="font-extrabold text-ink tabular-nums">{num(totals.byMethod[m.key])}</b>
                            </span>
                        ))}
                        {totals.expenseTotal > 0 && (
                            <span className="text-red-600 dark:text-red-400">{t('finance.cash.expense')} <b className="font-extrabold tabular-nums">−{num(totals.expenseTotal)}</b></span>
                        )}
                    </p>
                )}

                {list}
            </section>
        </Card>
    );
};

export default PayQueue;
