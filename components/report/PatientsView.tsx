import React, { useState } from 'react';
import { Phone, Send, UserX, CalendarCheck } from 'lucide-react';
import { useLanguage, fill } from '../../context/LanguageContext';
import type { PatientReport } from '../../services/api';
import { formatUzPhone } from '../../shared/validation';
import { fmtDay, KpiStrip, DeltaChip, CardHead, Calculating, ShareBar } from './shared';

/* ─────────────────────────────────────────────────────────────────────────────
   BEMORLAR — egasining savoli: «bemorlarim ko'payyaptimi, qaytib
   kelyaptimi, kimni yo'qotdim?» (2026-11-26, olti maslahatchi).

   TA'RIFLAR BITTA (`backend/patientVisits.ts`):
   • Kelgan — davrda qabul ochilgan har xil bemor (har biri bir marta).
   • Yangi — kartasi ham, birinchi qabuli ham shu davrda.
   • Qaytib kelgan — davrda kelgan, ilgari ham bo'lgan.
   • Yo'qolgan — faol, 6 oydan beri kelmagan. BUGUNGI holat, davrga bog'liq
     emas — va Xabarlardagi «6 oydan beri kelmagan» segmenti bilan aynan bir
     xil: «Eslatma yuborish» o'sha ro'yxatni ochadi, son ham bir xil.
   «Jami to'lagan» ustuni ataylab yo'q: bemor kartasida o'z formulasi bor,
   ikkinchi formula ikki xil son beradi.
   ───────────────────────────────────────────────────────────────────────────── */

const LOST_SHOWN = 8;

const monthsSince = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const now = new Date();
    let months = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1));
    if (now.getDate() < d) months--;
    return Math.max(0, months);
};

export const PatientsView: React.FC<{ report: PatientReport | null; loading: boolean }> = ({ report, loading }) => {
    const { t } = useLanguage();
    const [allLost, setAllLost] = useState(false);
    if (loading || !report) return <Calculating />;

    const { current: cur, prev, lost } = report;
    const delta = (a: number, b: number) => ({ abs: a - b, pct: b > 0 ? Math.round(((a - b) / b) * 100) : null });
    const shown = allLost ? lost.patients : lost.patients.slice(0, LOST_SHOWN);
    const docs = report.newByDoctor || [];

    return (
        <div className="space-y-4">
            <KpiStrip
                footer={fill(t('report.vsPeriod'), fmtDay(report.previous.from), fmtDay(report.previous.to))}
                items={[
                    { key: 'visited', label: t('report.pat.visited'), value: cur.visited, hint: t('report.pat.visitedHint'),
                        delta: <DeltaChip delta={delta(cur.visited, prev.visited)} previous={prev.visited} goodUp /> },
                    { key: 'new', label: t('report.pat.new'), value: cur.new, hint: t('report.pat.newHint'),
                        delta: <DeltaChip delta={delta(cur.new, prev.new)} previous={prev.new} goodUp /> },
                    { key: 'returning', label: t('report.pat.returning'), value: cur.returning, hint: t('report.pat.returningHint'),
                        delta: <DeltaChip delta={delta(cur.returning, prev.returning)} previous={prev.returning} goodUp /> },
                    { key: 'lost', label: t('report.pat.lost'), value: lost.total, tone: lost.total > 0 ? 'warn' : undefined,
                        hint: fill(t('report.pat.lostHint'), lost.months) },
                ]} />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
                {/* ── YO'QOLGAN BEMORLAR — qo'ng'iroq yoki eslatma ─────────── */}
                <section className="card lg:col-span-3" aria-labelledby="rep-lost">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 pt-4 pb-3">
                        <div className="min-w-0">
                            <h3 id="rep-lost" className="text-[15px] font-semibold text-ink">{fill(t('report.pat.lostTitle'), lost.total)}</h3>
                            <p className="text-[12px] text-faint mt-0.5">{fill(t('report.pat.lostSub'), lost.months)}</p>
                        </div>
                        {lost.total > 0 && (
                            <a href="#/messages?audience=inactive6"
                                className="ml-auto h-9 px-3.5 inline-flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors">
                                <Send className="w-4 h-4" aria-hidden="true" />{t('report.pat.remind')}
                            </a>
                        )}
                    </div>
                    {lost.total === 0 ? (
                        <div className="px-5 pb-6 flex items-center gap-2 text-sm text-muted">
                            <UserX className="w-4 h-4 text-faint" aria-hidden="true" />{t('report.pat.noLost')}
                        </div>
                    ) : (
                        <>
                            {lost.withTelegram > 0 && (
                                <p className="px-5 pb-2 text-[12px] text-muted">{fill(t('report.pat.viaTelegram'), lost.withTelegram, lost.total - lost.withTelegram)}</p>
                            )}
                            <ul className="divide-y divide-line-soft border-t border-line-soft">
                                {shown.map(p => {
                                    const m = monthsSince(p.lastVisit);
                                    return (
                                        <li key={p.patientId} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                                            <div className="min-w-0 flex-1">
                                                <a href={`#/patients/${p.patientId}`} className="font-medium text-ink hover:underline truncate block">{p.patientName}</a>
                                                <p className="text-[12px] text-faint truncate">
                                                    {fill(t('report.pat.lastVisit'), fmtDay(p.lastVisit), m)}{p.lastDoctor ? ` · ${p.lastDoctor}` : ''}
                                                </p>
                                            </div>
                                            {p.nextAppointment && (
                                                <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-300 text-[12px] font-medium">
                                                    <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />{fill(t('report.pat.booked'), fmtDay(p.nextAppointment))}
                                                </span>
                                            )}
                                            {p.phone && (
                                                <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}
                                                    className="shrink-0 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink tabular-nums">
                                                    <Phone className="w-3.5 h-3.5" aria-hidden="true" />{formatUzPhone(p.phone)}
                                                </a>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                            {lost.patients.length > LOST_SHOWN && (
                                <div className="px-5 py-2 border-t border-line-soft">
                                    <button type="button" onClick={() => setAllLost(o => !o)} aria-expanded={allLost}
                                        className="h-8 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                        {allLost ? t('pay.queue.hide') : fill(t('pay.queue.showN'), lost.patients.length - LOST_SHOWN)}
                                    </button>
                                </div>
                            )}
                            {/* Server ro'yxatni cheklaydi; to'liq ro'yxat — Xabarlarda (o'sha segment) */}
                            {allLost && lost.total > lost.patients.length && (
                                <p className="px-5 pb-3 text-[12px] text-faint">{fill(t('report.pat.truncated'), lost.patients.length, lost.total)}</p>
                            )}
                        </>
                    )}
                </section>

                {/* ── YANGI BEMORLAR QAYTDIMI — shifokor bo'yicha ─────────── */}
                <section className="card lg:col-span-2" aria-labelledby="rep-newback">
                    <CardHead id="rep-newback" title={t('report.pat.newBackTitle')} hint={t('report.pat.newBackHint')} />
                    {docs.length === 0 ? (
                        <p className="px-5 pb-6 text-sm text-faint">{t('report.pat.noNew')}</p>
                    ) : (
                        <ul className="px-5 pb-4 space-y-3">
                            {docs.map(d => {
                                const rate = d.newPatients ? Math.round((d.cameBack / d.newPatients) * 100) : 0;
                                return (
                                    <li key={d.doctorId || d.doctorName}>
                                        <div className="flex items-baseline gap-3 text-sm mb-1">
                                            <span className="text-ink truncate">{d.doctorName === 'Belgilanmagan' ? t('report.noDoctor') : d.doctorName}</span>
                                            <span className="ml-auto tabular-nums text-muted shrink-0">{fill(t('report.pat.backOf'), d.cameBack, d.newPatients)}</span>
                                            <span className="w-10 text-right tabular-nums font-semibold text-ink shrink-0">{rate}%</span>
                                        </div>
                                        <ShareBar value={d.cameBack} max={d.newPatients} color="var(--color-success-500)" />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

