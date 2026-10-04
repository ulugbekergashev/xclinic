import React, { useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Card } from './Common';
import { useLanguage, fill } from '../context/LanguageContext';
import { initialsOf } from '../utils/flow';
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import type { CashBookTotals } from '../utils/cashbook';

/* ─────────────────────────────────────────────────────────────────────────────
   KASSA: TO'LOV NAVBATI → KASSA OYNASI.

   Kassirning savoli bitta: «oynamda kim turibdi va undan qancha olaman?».
   Ilgari javob sahifaning to'rt joyida edi: oltita yakun plitkasi, usullar
   qatori, «To'lanmagan» ro'yxati (qator-qator) va eng pastda «Hozir
   klinikada» bilan «To'lov kutmoqda» — ya'ni oynadagi odamni topish uchun
   sahifaning oxirigacha tushish kerak edi.

   Endi bu «Bugun» xaritasining tilida, bitta panelda:

     · chapda — navbat: to'lashi kerak bo'lganlar (ambulator) va statsionar
       hisoblari, har biri bitta qator, summasi bilan;
     · o'ngda — kassa oynasi: tanlangan odamning hisobi qog'oz chek
       ko'rinishida va bitta tugma;
     · ostida — kun yakuni: kassaga tushgan pul usullar bo'yicha.

   PUL BU YERDA OLINMAYDI. Tugma `ChargePaymentModal` ni ochadi — qisman
   to'lov, bir necha usul, chegirma va qarz o'sha oynada; bemor kartasidagi
   to'lov ham aynan shu oyna. Bu panel faqat «kim» va «qancha» ni ko'rsatadi.
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
    clinicName?: string;
    /** Boshqa kunlardan qolgan qarz — navbatda ko'rinmaydi, lekin yo'qolmasin */
    olderDue?: number;
    onPay: (g: PayGroup) => void;
}

const num = (v: number) => Math.round(v).toLocaleString('uz-UZ').replace(/,/g, ' ');

// Pol naqshi — `ClinicMap` dagi bilan bir xil usul
const FLOOR_WARM: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(217,119,6,0.14) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_PINK: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(181,55,122,0.11) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_COOL: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(0,94,184,0.11) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };

const TAB = 'absolute -top-2.5 left-5 inline-flex items-center gap-1.5 h-[18px] px-2 rounded-md bg-surface text-[10.5px] font-extrabold uppercase tracking-wider whitespace-nowrap';

/* Chek — QOG'OZ. Mavzu qorong'i bo'lsa ham u och qoladi: kassir ekrandagi
   hisobni bemorga beriladigan qog'oz bilan solishtiradi. */
const PAPER = '#f4f1ea';
const PAPER_INK = '#1c2434';
const PAPER_MUTED = '#5b6577';
const TEAR: React.CSSProperties = {
    height: 9,
    background: `linear-gradient(135deg, ${PAPER} 4.5px, transparent 0) 0 0 / 9px 9px repeat-x, linear-gradient(225deg, ${PAPER} 4.5px, transparent 0) 0 0 / 9px 9px repeat-x`,
};
const Rule: React.FC = () => <div aria-hidden="true" className="my-2.5 border-t-[1.5px] border-dashed" style={{ borderColor: '#b9b2a3' }} />;

export const PayQueue: React.FC<Props> = ({ groups, totals, drawer, clinicName, olderDue = 0, onPay }) => {
    const { t } = useLanguage();
    const [picked, setPicked] = useState<string | null>(null);
    const windowRef = useRef<HTMLDivElement>(null);

    /* Tor ekranda kassa oynasi navbatning OSTIDA turadi — uzun navbatda
       tanlangan odamning hisobi ekrandan tashqarida qolardi. Tanlanganda
       oynaga o'tiladi. Keng ekranda oyna yonma-yon va o'zi ergashadi. */
    const pick = (key: string) => {
        setPicked(key);
        if (window.matchMedia('(min-width: 1024px)').matches) return;
        requestAnimationFrame(() => windowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const due = (groups || []).filter(g => g.zone === 'due');
    const stays = (groups || []).filter(g => g.zone === 'stay');
    /* Tanlov yo'qolsa (to'landi, ro'yxatdan ketdi) — navbatning boshidagi
       odam: kassir oynasiga keyingisi keladi. */
    const sel = (groups || []).find(g => g.key === picked) || due[0] || stays[0] || null;

    const whereOf = (g: PayGroup) => (
        g.state === 'here' ? { text: t('pay.queue.here'), tone: 'text-muted' }
            : g.state === 'waiting' ? { text: t('pay.queue.leaving'), tone: 'text-red-600 dark:text-red-400' }
                : g.state === 'stay' ? { text: t('pay.queue.stay'), tone: 'text-pink-700 dark:text-pink-300' }
                    : { text: t('pay.queue.other'), tone: 'text-muted' }
    );

    const row = (g: PayGroup) => {
        const on = sel?.key === g.key;
        const where = whereOf(g);
        const ring = g.zone === 'stay' ? 'border-pink-400' : g.state === 'waiting' ? 'border-red-400' : 'border-amber-400';
        return (
            <li key={g.key}>
                <button type="button" onClick={() => pick(g.key)} aria-pressed={on}
                    className={`w-full flex items-center gap-3 pl-2.5 pr-3.5 py-2.5 rounded-2xl border-[1.5px] text-left transition-colors ${on
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                        : 'border-line bg-surface hover:border-primary-300 dark:hover:border-primary-700'}`}>
                    <span className={`shrink-0 w-10 h-10 rounded-full border-[2.5px] ${ring} bg-surface text-ink text-xs font-extrabold inline-flex items-center justify-center`}>
                        {g.queueNumber != null ? g.queueNumber : initialsOf(g.patientName)}
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col leading-snug">
                        <span className="text-sm font-extrabold text-ink truncate">{g.patientName}</span>
                        <span className="text-xs text-muted truncate">{g.items.map(i => i.name).join(' · ')}</span>
                        <span className={`text-[11px] font-extrabold truncate ${where.tone}`}>{where.text}</span>
                    </span>
                    <span className="shrink-0 flex flex-col items-end leading-tight">
                        <span className="text-lg font-black tracking-tight tabular-nums text-ink whitespace-nowrap">{num(g.due)}</span>
                        <span className="text-[10.5px] font-bold text-faint">{t('ui.som')}</span>
                    </span>
                </button>
            </li>
        );
    };

    const legendItem = (dot: string, text: string) => (
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${dot}`} />{text}</span>
    );

    // ── Kun yakuni: kassaga tushgan pul usullar bo'yicha ─────────────────────
    const methods = PAYMENT_METHODS.filter(m => m.isMoneyIn && (totals.byMethod[m.key] || 0) > 0);
    const strip = (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-2.5 ${groups ? 'mt-6' : 'mt-4'}`}>
            <span className="text-xs font-semibold text-muted whitespace-nowrap">
                {t('pay.queue.inTill')} <b className="text-base font-black text-ink tabular-nums">{num(totals.gross)}</b> {t('ui.som')}
            </span>
            {totals.gross > 0 && (
                <div aria-hidden="true" className="flex-1 basis-60 h-2.5 rounded-full overflow-hidden flex gap-0.5">
                    {methods.map(m => (
                        <span key={m.key} style={{ width: `${(totals.byMethod[m.key] / totals.gross) * 100}%`, backgroundColor: m.color }} />
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                {methods.map(m => (
                    <span key={m.key} className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                        {m.label} <b className="font-extrabold text-ink tabular-nums">{num(totals.byMethod[m.key])}</b>
                    </span>
                ))}
                {totals.fromBalance > 0 && (
                    <span>{t('finance.cash.fromAdvance')} <b className="font-extrabold text-ink tabular-nums">{num(totals.fromBalance)}</b></span>
                )}
                {totals.expenseTotal > 0 && (
                    <span className="text-red-600 dark:text-red-400">{t('finance.cash.expense')} <b className="font-extrabold tabular-nums">−{num(totals.expenseTotal)}</b></span>
                )}
            </div>
        </div>
    );

    const drawerLine = (
        <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11.5px] font-bold text-muted leading-snug">
                {t('pay.queue.drawer')}
                <span className="block font-semibold text-faint">
                    {fill(t('pay.queue.drawerNote'), num(totals.openingCash), `${totals.netCashFlow < 0 ? '−' : '+'}${num(Math.abs(totals.netCashFlow))}`)}
                </span>
            </span>
            <span className="text-lg font-black tracking-tight text-ink tabular-nums whitespace-nowrap">{num(drawer)}</span>
        </div>
    );

    return (
        <Card className="p-5 sm:p-6">
            <section aria-labelledby="pay-queue-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="pay-queue-title" className="text-lg font-black text-ink">
                        {groups ? t('pay.queue.title') : t('pay.queue.dayTitle')}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                        {groups && legendItem('bg-amber-500', fill(t('pay.queue.legendDue'), due.length))}
                        {groups && stays.length > 0 && legendItem('bg-pink-400', fill(t('pay.queue.legendStays'), stays.length))}
                        {legendItem('bg-emerald-500', fill(t('pay.queue.legendPaid'), totals.paymentCount))}
                    </div>
                </div>

                {groups && (
                    <div className="mt-7 grid grid-cols-1 gap-y-7 lg:grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,26rem)]">
                        <div className="flex flex-col gap-7 min-w-0">
                            <div className="relative rounded-[22px] border-[1.5px] border-amber-200/80 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 px-3 pt-[18px] pb-3"
                                style={FLOOR_WARM}>
                                <span className={`${TAB} text-amber-700 dark:text-amber-300`}>{fill(t('pay.queue.waiting'), due.length)}</span>
                                {due.length === 0 ? (
                                    <p className="px-2 py-5 text-sm font-semibold text-muted flex items-center gap-2">
                                        <Check className="w-4 h-4 text-emerald-500" />{t('pay.queue.empty')}
                                    </p>
                                ) : (
                                    <ul className="flex flex-col gap-2">{due.map(row)}</ul>
                                )}
                            </div>
                            {stays.length > 0 && (
                                <div className="relative rounded-[22px] border-[1.5px] border-pink-200 dark:border-pink-900/50 bg-pink-50/50 dark:bg-pink-950/15 px-3 pt-[18px] pb-3"
                                    style={FLOOR_PINK}>
                                    <span className={`${TAB} text-pink-700 dark:text-pink-300`}>{t('pay.queue.stays')}</span>
                                    <ul className="flex flex-col gap-2">{stays.map(row)}</ul>
                                </div>
                            )}
                            {olderDue > 0 && (
                                <p className="-mt-3 px-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                    {t('finance.cash.debtFromOtherDays')} <b className="tabular-nums">{num(olderDue)} {t('ui.som')}</b>
                                </p>
                            )}
                        </div>

                        <div aria-hidden="true" className="hidden lg:flex relative items-center justify-center">
                            <span className="absolute left-1/2 -translate-x-1/2 top-6 bottom-6 border-l-2 border-dashed border-line" />
                            <span className="relative w-6 h-6 rounded-full bg-surface border-[1.5px] border-line text-faint inline-flex items-center justify-center">
                                <ArrowRight className="w-3 h-3" />
                            </span>
                        </div>

                        <div ref={windowRef}
                            className="relative scroll-mt-24 self-start w-full lg:sticky lg:top-24 rounded-[22px] border-[1.5px] border-primary-200 dark:border-primary-800/60 bg-primary-50/60 dark:bg-primary-900/15 px-4 pt-6 pb-4 flex flex-col gap-3.5 min-w-0"
                            style={FLOOR_COOL}>
                            <span className={`${TAB} text-muted`}>
                                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{t('pay.queue.window')}
                            </span>

                            {sel ? (
                                <>
                                    <div style={{ filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.16))' }}>
                                        <div className="px-5 pt-4 pb-3.5 rounded-t-md font-mono text-[12.5px] leading-relaxed"
                                            style={{ background: PAPER, color: PAPER_INK }}>
                                            <div className="flex justify-between gap-3 text-[13px] font-bold tracking-wide uppercase">
                                                <span className="truncate">{clinicName || t('cashbook.kassa')}</span>
                                                <span className="shrink-0">{t('pay.queue.bill')}</span>
                                            </div>
                                            <Rule />
                                            <div className="font-bold">{sel.patientName}</div>
                                            <div style={{ color: PAPER_MUTED }}>
                                                {sel.queueNumber != null ? `${fill(t('pay.queue.ticket'), sel.queueNumber)} · ` : ''}{whereOf(sel).text}
                                            </div>
                                            <Rule />
                                            {sel.items.map(i => (
                                                <div key={i.id} className="flex justify-between gap-3">
                                                    <span className="min-w-0 break-words">{i.name}</span>
                                                    <span className="shrink-0 whitespace-nowrap tabular-nums">{num(i.amount)}</span>
                                                </div>
                                            ))}
                                            <Rule />
                                            <div className="flex justify-between items-baseline gap-3 font-bold">
                                                <span className="text-[13px] tracking-wide uppercase">{t('pay.queue.toPay')}</span>
                                                <span className="text-2xl tracking-tight tabular-nums whitespace-nowrap">{num(sel.due)}</span>
                                            </div>
                                        </div>
                                        <div aria-hidden="true" style={TEAR} />
                                    </div>
                                    <button type="button" onClick={() => onPay(sel)}
                                        className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold transition-colors active:scale-[0.99]">
                                        {fill(t('pay.queue.accept'), num(sel.due))}
                                    </button>
                                </>
                            ) : (
                                <p className="py-10 text-center text-sm font-semibold text-muted">{t('pay.queue.nobody')}</p>
                            )}

                            <div className="pt-3 border-t border-dashed border-primary-200 dark:border-primary-800/60">{drawerLine}</div>
                        </div>
                    </div>
                )}

                {strip}
                {!groups && <div className="mt-4 pt-3 border-t border-dashed border-line max-w-md">{drawerLine}</div>}
            </section>
        </Card>
    );
};

export default PayQueue;
