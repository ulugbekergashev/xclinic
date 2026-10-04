import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Printer } from 'lucide-react';
import { Card } from './Common';
import { LabOrder, LabTest } from '../types';
import { useLanguage, fill } from '../context/LanguageContext';
import { initialsOf } from '../utils/flow';
import { formatNumber } from '../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   LABORATORIYA LINIYASI: proba olish → ishlanmoqda → tayyor.

   Sahifa ilgari yo'llanmalarning bitta ro'yxati edi — holati nishon bilan,
   eng yangisi tepada. Laborantning uchta savoli esa o'sha ro'yxatda
   aralashib turardi: «kimdan proba olaman?», «qaysi natijani kiritaman?»,
   «bugun nima tayyor bo'ldi?». Javobni topish uchun holat filtrini uch marta
   almashtirish kerak edi.

   Endi yo'llanma liniya bo'ylab chapdan o'ngga yuradi — «Bugun» xaritasidagi
   laboratoriya zonasining o'zi, faqat to'liq:

     1. Proba olish  — odamlar: proba hali olinmagan. «Olindi» — shu yerda.
     2. Ishlanmoqda  — probirkalar, namuna turi bo'yicha shtativlarda. Har
        probirka — bitta tahlil; bosilsa natija kiritish ochiladi. Muddati
        o'tgani qizil nuqta bilan (muddat = proba olingan vaqt + tahlilning
        bajarilish muddati).
     3. Tayyor       — bugun chiqqan natijalar; shifokor hali ko'rmagani
        sariq bilan.

   Natija kiritish oynasi va jurnal (qidiruv, eski yo'llanmalar) sahifaning
   o'zida qoladi — bu komponent faqat liniyani chizadi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    orders: LabOrder[];
    tests: LabTest[];
    busy?: boolean;
    onCollect: (order: LabOrder) => void;
    /** Natijalar oynasi — kiritish ham, ko'rish va chop etish ham shu */
    onOpen: (order: LabOrder) => void;
}

type Paid = { paid?: boolean | null; due?: number | null };

const FLOOR_WARM: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(217,119,6,0.14) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_SKY: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(0,164,153,0.13) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_GREEN: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(0,150,57,0.11) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };

const TAB = 'absolute -top-2.5 left-5 inline-flex items-center gap-1.5 h-[18px] px-2 rounded-md bg-surface text-[10.5px] font-extrabold uppercase tracking-wider whitespace-nowrap';

/* Probirka qopqog'ining rangi — NAMUNA TURI (tahlil katalogidagi maydon).
   Laboratoriyada ham shunday: qopqoq rangi ichida nima borligini bildiradi. */
const CAP: Record<string, string> = {
    Qon: 'bg-red-500',
    Siydik: 'bg-amber-400',
    Najas: 'bg-amber-700',
    Surtma: 'bg-purple-500',
};
const capOf = (sample: string) => CAP[sample] || 'bg-gray-400';

const dayKey = (iso?: string | null) => (iso ? new Date(iso).toDateString() : '');

const Step: React.FC = () => (
    <div aria-hidden="true" className="hidden xl:flex relative items-center justify-center">
        <span className="absolute left-1/2 -translate-x-1/2 top-6 bottom-6 border-l-2 border-dashed border-line" />
        <span className="relative w-6 h-6 rounded-full bg-surface border-[1.5px] border-line text-faint inline-flex items-center justify-center">
            <ArrowRight className="w-3 h-3" />
        </span>
    </div>
);

export const LabLine: React.FC<Props> = ({ orders, tests, busy, onCollect, onOpen }) => {
    const { t } = useLanguage();

    // «12 daq», «40 daq qoldi» — daqiqada bir yangilanadi
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const testById = useMemo(() => new Map(tests.map(x => [x.id, x])), [tests]);

    const span = (min: number) => (
        min < 60 ? fill(t('labline.min'), Math.max(1, Math.round(min)))
            : min < 60 * 24 ? fill(t('labline.hours'), Math.round(min / 60))
                : fill(t('labline.days'), Math.round(min / 60 / 24))
    );

    const live = orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled');
    /* 1. Proba olinmaganlar — eng uzoq kutgani tepada: u birinchi kelgan.

       BIR KUNDAN ORTIQ kutayotganlari alohida va yig'iq. Bemor yo'llanma
       olib, kelmay ketadi — bunday yozuvlar oylar davomida to'planadi va
       bugun navbatda turgan uch kishi ellikta eski satr ostida qolib
       ketardi. Ular yo'qolmaydi (soni ko'rinadi, bosilsa ochiladi), lekin
       bugungi ishni to'smaydi. Chegara «Bugun» dagi zona bilan bir xil. */
    const DAY = 24 * 3_600_000;
    const notTaken = live.filter(o => !o.sampleCollectedAt)
        .sort((a, b) => +new Date(a.orderedAt) - +new Date(b.orderedAt));
    const waiting = notTaken.filter(o => now - +new Date(o.orderedAt) <= DAY);
    const stale = notTaken.filter(o => now - +new Date(o.orderedAt) > DAY);
    const [showStale, setShowStale] = useState(false);
    /* 2. Ishlanmoqda — probirka = tahlil. Shtativ = namuna turi. */
    const racks = useMemo(() => {
        const bySample = new Map<string, { sample: string; tubes: { key: string; order: LabOrder; name: string; done: boolean; left: number }[] }>();
        for (const o of live) {
            if (!o.sampleCollectedAt) continue;
            for (const item of o.items || []) {
                const test = testById.get(item.testId);
                const sample = test?.sampleType || t('labline.otherSample');
                const deadline = +new Date(o.sampleCollectedAt) + (test?.turnaroundHours ?? 24) * 3_600_000;
                const rack = bySample.get(sample) || { sample, tubes: [] };
                rack.tubes.push({ key: item.id, order: o, name: item.testName, done: item.status === 'Completed', left: (deadline - now) / 60_000 });
                bySample.set(sample, rack);
            }
        }
        // Shtativ ichida: muddati eng yaqini (yoki o'tgani) birinchi
        return [...bySample.values()].map(r => ({ ...r, tubes: r.tubes.sort((a, b) => a.left - b.left) }));
    }, [live, testById, now, t]);
    const tubeCount = racks.reduce((n, r) => n + r.tubes.filter(x => !x.done).length, 0);
    const lateCount = racks.reduce((n, r) => n + r.tubes.filter(x => !x.done && x.left < 0).length, 0);
    /* 3. Bugun tayyor bo'lganlar — ko'rilmagani tepada. */
    const today = new Date().toDateString();
    const ready = orders.filter(o => o.status === 'Completed' && dayKey(o.completedAt) === today)
        .sort((a, b) => Number(!!a.seenByDoctorAt) - Number(!!b.seenByDoctorAt) || +new Date(b.completedAt || 0) - +new Date(a.completedAt || 0));
    const unseen = ready.filter(o => !o.seenByDoctorAt).length;

    const testsOf = (o: LabOrder) => (o.items || []).map(i => i.testName).join(' · ') || '—';
    const legendItem = (dot: string, text: string) => (
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${dot}`} />{text}</span>
    );

    return (
        <Card className="p-5 sm:p-6">
            <section aria-labelledby="lab-line-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="lab-line-title" className="text-lg font-black text-ink">{t('labline.title')}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                        {legendItem('bg-amber-500', fill(t('labline.legendWaiting'), waiting.length))}
                        {legendItem('bg-sky-500', fill(t('labline.legendWorking'), tubeCount))}
                        {lateCount > 0 && <span className="text-red-600 dark:text-red-400">{legendItem('bg-red-500', fill(t('labline.legendLate'), lateCount))}</span>}
                        {legendItem('bg-emerald-500', fill(t('labline.legendReady'), ready.length))}
                    </div>
                </div>

                <div className="mt-7 grid grid-cols-1 gap-y-7 xl:grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1.15fr)_2.75rem_minmax(0,1fr)]">
                    {/* ── 1. Proba olish ── */}
                    <div className="relative min-w-0 rounded-[22px] border-[1.5px] border-amber-200/80 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 px-3 pt-[18px] pb-3"
                        style={FLOOR_WARM}>
                        <span className={`${TAB} text-amber-700 dark:text-amber-300`}>{fill(t('labline.sample'), waiting.length)}</span>
                        {waiting.length === 0 && (
                            <p className="px-2 py-5 text-sm font-semibold text-muted">{t('labline.sampleNone')}</p>
                        )}
                        {(waiting.length > 0 || (showStale && stale.length > 0)) && (
                            <ul className="flex flex-col gap-2">
                                {[...waiting, ...(showStale ? stale : [])].map(o => {
                                    const pay = o as LabOrder & Paid;
                                    const waited = (now - +new Date(o.orderedAt)) / 60_000;
                                    const stale = waited > 60 * 24;
                                    return (
                                        <li key={o.id} className="flex items-center gap-3 pl-2.5 pr-2.5 py-2.5 rounded-2xl border-[1.5px] border-line bg-surface">
                                            <span className={`shrink-0 w-10 h-10 rounded-full border-[2.5px] ${o.priority === 'Urgent' ? 'border-red-400' : 'border-amber-400'} bg-surface text-ink text-xs font-extrabold inline-flex items-center justify-center`}>
                                                {initialsOf(o.patientName)}
                                            </span>
                                            <span className="min-w-0 flex-1 flex flex-col leading-snug">
                                                <span className="text-sm font-extrabold text-ink truncate">{o.patientName}</span>
                                                <span className="flex items-center gap-1.5 min-w-0">
                                                    <span aria-hidden="true" className="shrink-0 flex gap-0.5">
                                                        {[...new Set((o.items || []).map(i => testById.get(i.testId)?.sampleType || ''))].map(s => (
                                                            <span key={s} className={`w-2 h-2 rounded-full ${capOf(s)}`} />
                                                        ))}
                                                    </span>
                                                    <span className="text-xs text-muted truncate">{testsOf(o)}</span>
                                                </span>
                                                <span className="text-[11px] font-extrabold truncate">
                                                    <span className={stale ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}>{fill(t('labline.waited'), span(waited))}</span>
                                                    {o.priority === 'Urgent' && <span className="text-red-600 dark:text-red-400"> · {t('lab.urgent')}</span>}
                                                    {pay.paid === false && (
                                                        <span className="text-amber-700 dark:text-amber-400"> · {t('ui.tolanmagan')}{pay.due ? ` ${formatNumber(pay.due)}` : ''}</span>
                                                    )}
                                                </span>
                                            </span>
                                            <button type="button" onClick={() => onCollect(o)} disabled={busy}
                                                aria-label={`${o.patientName}: ${t('labline.taken')}`}
                                                className="shrink-0 h-9 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-extrabold transition-colors disabled:opacity-50">
                                                {t('labline.taken')}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {stale.length > 0 && (
                            <button type="button" onClick={() => setShowStale(v => !v)} aria-expanded={showStale}
                                className="mt-2 px-1 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline">
                                {fill(t('zones.lab.stale'), stale.length)} — {showStale ? t('labline.hide') : t('labline.show')}
                            </button>
                        )}
                    </div>

                    <Step />

                    {/* ── 2. Ishlanmoqda ── */}
                    <div className="relative min-w-0 rounded-[22px] border-[1.5px] border-sky-200 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/20 px-3 pt-[18px] pb-3 flex flex-col gap-2"
                        style={FLOOR_SKY}>
                        <span className={`${TAB} text-sky-700 dark:text-sky-300`}>{fill(t('labline.working'), tubeCount)}</span>
                        {racks.length === 0 ? (
                            <p className="px-2 py-5 text-sm font-semibold text-muted">{t('labline.workingNone')}</p>
                        ) : racks.map(r => {
                            const late = r.tubes.filter(x => !x.done && x.left < 0).length;
                            return (
                                <div key={r.sample} className="rounded-2xl border-[1.5px] border-line bg-surface px-3 pt-2.5 pb-3">
                                    <p className="flex items-center gap-2 text-xs font-extrabold text-ink">
                                        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${capOf(r.sample)}`} />
                                        {r.sample}
                                        <span className="font-semibold text-muted">{fill(t('labline.tubes'), r.tubes.filter(x => !x.done).length)}</span>
                                        {late > 0 && <span className="ml-auto text-red-600 dark:text-red-400">{fill(t('labline.late'), late)}</span>}
                                    </p>
                                    <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-3">
                                        {r.tubes.map(x => {
                                            const isLate = !x.done && x.left < 0;
                                            /* To'lovsiz natija saqlanmaydi (server 402 qaytaradi) —
                                               laborant buni oynani ochmasdan oldin ko'rsin. */
                                            const unpaid = !x.done && (x.order as LabOrder & Paid).paid === false;
                                            const state = x.done ? t('labline.entered') : unpaid ? t('labline.unpaid') : isLate ? t('labline.overdue') : fill(t('labline.left'), span(x.left));
                                            const label = `${x.order.patientName} — ${x.name}: ${state}`;
                                            return (
                                                <button key={x.key} type="button" onClick={() => onOpen(x.order)} title={label} aria-label={label}
                                                    className="group w-[96px] flex flex-col items-center gap-1 rounded-lg py-1 hover:bg-elevated transition-colors">
                                                    <span aria-hidden="true" className="flex flex-col items-center">
                                                        <span className={`w-1.5 h-1.5 mb-0.5 rounded-full ${isLate ? 'bg-red-500' : x.done ? 'bg-emerald-500' : 'bg-transparent'}`} />
                                                        <span className={`w-[15px] h-[6px] rounded-sm ${capOf(r.sample)}`} />
                                                        <span className={`w-[11px] h-9 rounded-b-[6px] border-[1.5px] border-t-0 ${x.done
                                                            ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-400/40'
                                                            : isLate ? 'border-red-300 dark:border-red-800 bg-red-400/50' : 'border-sky-300 dark:border-sky-700 bg-sky-400/40'}`} />
                                                    </span>
                                                    <span className="w-full text-center text-[10.5px] leading-tight font-extrabold text-ink truncate">{initialsOf(x.order.patientName)} · {x.name}</span>
                                                    <span className={`w-full text-center text-[10px] leading-tight font-bold truncate ${unpaid ? 'text-amber-700 dark:text-amber-400' : isLate ? 'text-red-600 dark:text-red-400' : x.done ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'}`}>{state}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <Step />

                    {/* ── 3. Tayyor ── */}
                    <div className="relative min-w-0 rounded-[22px] border-[1.5px] border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 pt-[18px] pb-3"
                        style={FLOOR_GREEN}>
                        <span className={`${TAB} text-emerald-700 dark:text-emerald-300`}>{fill(t('labline.ready'), ready.length)}</span>
                        {ready.length === 0 ? (
                            <p className="px-2 py-5 text-sm font-semibold text-muted">{t('labline.readyNone')}</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {ready.map(o => (
                                    <li key={o.id}>
                                        <button type="button" onClick={() => onOpen(o)}
                                            className="w-full flex items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-2xl border-[1.5px] border-line bg-surface hover:border-emerald-300 dark:hover:border-emerald-700 text-left transition-colors">
                                            <span aria-hidden="true" className={`shrink-0 w-7 h-9 rounded border-[1.5px] inline-flex items-center justify-center ${o.seenByDoctorAt
                                                ? 'border-emerald-400/70 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                                : 'border-amber-400 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                                                <Check className="w-3.5 h-3.5" strokeWidth={3.2} />
                                            </span>
                                            <span className="min-w-0 flex-1 flex flex-col leading-snug">
                                                <span className="text-sm font-extrabold text-ink truncate">{o.patientName}</span>
                                                <span className="text-xs text-muted truncate">{testsOf(o)}</span>
                                                <span className={`text-[11px] font-extrabold truncate ${o.seenByDoctorAt ? 'text-muted' : 'text-amber-700 dark:text-amber-400'}`}>
                                                    {o.seenByDoctorAt ? t('labline.seen') : t('labline.unseen')}{o.doctorName ? ` · ${o.doctorName}` : ''}
                                                </span>
                                            </span>
                                            <Printer aria-hidden="true" className="shrink-0 w-4 h-4 text-faint" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {unseen > 0 && <p className="mt-2 px-1 text-xs font-semibold text-amber-700 dark:text-amber-400">{fill(t('labline.unseenCount'), unseen)}</p>}
                    </div>
                </div>
            </section>
        </Card>
    );
};

export default LabLine;
