import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ChevronDown, Phone } from 'lucide-react';
import { useLanguage, fill } from '../../context/LanguageContext';
import { api } from '../../services/api';
import { EXPENSE_CATEGORY_LABELS } from '../../types';
import { todayISO } from '../../utils/dateUtils';
import { formatUzPhone } from '../../shared/validation';
import { monthLabel as calMonthLabel } from '../../utils/calendarLabels';
import {
    fmt, fmtDay, compactMoney, useIsDark, chartTheme, ChartTip, DeltaChip, KpiStrip, KpiItem,
    CardHead, Th, Td, ShareBar,
} from './shared';

/* ─────────────────────────────────────────────────────────────────────────────
   UMUMIY — egasining birinchi savoli: «shu davrda pul qanday bo'ldi?»

   Tartib (2026-11-26, olti maslahatchi):
     1. To'rt raqam bitta qatorda, har birida o'tgan davrga nisbatan o'zgarish.
     2. Kunma-kun grafik: ko'rsatilgan xizmat va olingan pul. Ikki chiziq
        orasidagi farq — qarzga ketgan pul; egasi uni bir qarashda ko'radi.
        Ma'lumot ilgari ham kelardi (`daily`), lekin ekranda grafik yo'q edi.
     3. Qarzdorlar va xarajatlar yonma-yon.
     4. Oylar bo'yicha — yopiq.
   ───────────────────────────────────────────────────────────────────────────── */

export interface Summary {
    period: { from: string; to: string };
    totals: {
        revenue: number; collected: number; due: number;
        materialCost: number; grossProfit: number;
        doctorShare: number; otherExpenses: number; netProfit: number;
        legacyLabExpense: number;
    };
    byDepartment: { departmentId: string | null; name: string; revenue: number }[];
    expenseByCategory: { category: string; amount: number }[];
    daily: { date: string; revenue: number; collected: number }[];
}

type Debtor = { patientId?: string; patientName: string; phone?: string | null; due: number; count: number; oldestDate: string };

const DAY_MS = 864e5;
const parseDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - parseDay(d).getTime()) / DAY_MS));

/* Grafik nuqtalari: davr ichidagi HAR kun, uzun davrda oylar bo'yicha —
   va O'SIB BORUVCHI JAMI. Kunlik summa klinikada juda sakraydi (bir kun
   implant 2 mln, ertasiga 50 ming): silliq chiziq yo'q cho'qqilar chizardi.
   Jamida ikki chiziq doim tepaga boradi va ular orasidagi ochiq joy —
   davrda qarzga yozilgan pul — bir qarashda ko'rinadi. */
function buildSeries(daily: Summary['daily'], from: string, to: string, lang: 'uz' | 'ru') {
    const raw = buildRaw(daily, from, to, lang);
    let rev = 0, col = 0;
    return raw.map(r => {
        rev += r.revenue; col += r.collected;
        return { ...r, dayRevenue: r.revenue, dayCollected: r.collected, revenue: rev, collected: col };
    });
}

function buildRaw(daily: Summary['daily'], from: string, to: string, lang: 'uz' | 'ru') {
    const a = parseDay(from), b = parseDay(to);
    const span = Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;
    if (!(span >= 2)) return [];
    const byDay = new Map(daily.map(d => [d.date.slice(0, 10), d]));
    if (span <= 62) {
        const out = [];
        for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
            const key = isoOf(d);
            const row = byDay.get(key);
            out.push({ key, label: `${key.slice(8, 10)}.${key.slice(5, 7)}`, revenue: row?.revenue || 0, collected: row?.collected || 0 });
        }
        return out;
    }
    const months = new Map<string, { key: string; label: string; revenue: number; collected: number }>();
    const multiYear = a.getFullYear() !== b.getFullYear();
    for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d.setMonth(d.getMonth() + 1)) {
        const key = isoOf(d).slice(0, 7);
        const short = calMonthLabel(d, lang).replace(/\s*\d{4}$/, '').slice(0, 3);
        /* Yil almashsa «Noy» ikki marta chiqmasin — «Noy 25», «Noy 26» */
        months.set(key, { key, label: multiYear ? `${short} ${String(d.getFullYear()).slice(2)}` : short, revenue: 0, collected: 0 });
    }
    for (const r of daily) {
        const m = months.get(r.date.slice(0, 7));
        if (m) { m.revenue += r.revenue || 0; m.collected += r.collected || 0; }
    }
    return [...months.values()];
}

interface Props {
    data: Summary;
    cmp: any;
    from: string;
    to: string;
    /** Davr oylarida shifokorlarga hali to'lanmagan ulush (Xodimlar → Ulush) */
    sharesPayable: number | null;
    /** Ulush qaysi oylar bo'yicha — ulush oyiga bir marta hisoblanadi, davr esa «Bugun» ham bo'lishi mumkin */
    shareMonthsText: string;
    onOpenDoctors: () => void;
}

export const SummaryView: React.FC<Props> = ({ data, cmp, from, to, sharesPayable, shareMonthsText, onOpenDoctors }) => {
    const { t, language } = useLanguage();
    const lang = language === 'ru' ? 'ru' : 'uz';
    const dark = useIsDark();
    const c = chartTheme(dark);
    const totals = data.totals;

    /* ── Qarzdorlar va bo'lib to'lash — faqat shu tabda ko'rinadi ── */
    /* `undefined` — yuklanmoqda, `null` — xato. Ikkalasi ham «qarzdor yo'q»
       EMAS: tarmoq uzilganda ega «qarz yo'q» deb o'ylamasin. */
    const [debtors, setDebtors] = useState<{ total: number; patients: Debtor[] } | null | undefined>(undefined);
    const [debtorsOpen, setDebtorsOpen] = useState(false);
    useEffect(() => {
        let stale = false;
        api.reports.debtors().then(r => { if (!stale) setDebtors(r); }).catch(() => { if (!stale) setDebtors(prev => prev || null); });
        return () => { stale = true; };
    }, [data]);

    /* BO'LIB TO'LASH — shu oy qancha kelishi kerak. Qarzning bir qismi
       rejaga solingan: u «qotib qolgan» emas, jadval bo'yicha keladi. */
    const [installmentsDue, setInstallmentsDue] = useState<{ month: number; overdue: number } | null>(null);
    useEffect(() => {
        let stale = false;
        api.installments.getAll()
            .then((plans: any[]) => {
                if (stale) return;
                const now = todayISO();
                const ym = now.slice(0, 7);
                let month = 0, overdue = 0;
                for (const p of plans || []) {
                    if (p.status !== 'Active') continue;
                    for (const it of p.items || []) {
                        if (it.status === 'Paid') continue;
                        const d = String(it.expectedDate || '').slice(0, 10);
                        if (d.slice(0, 7) === ym) month += it.amount || 0;
                        else if (d && d < now) overdue += it.amount || 0;
                    }
                }
                setInstallmentsDue({ month, overdue });
            })
            .catch(() => { if (!stale) setInstallmentsDue(null); });
        return () => { stale = true; };
    }, [data]);

    /* ── Oylar bo'yicha — ochilganda yuklanadi (yil = davr oxiri yili) ── */
    const monthsYear = Number(to.slice(0, 4)) || new Date().getFullYear();
    const [monthsOpen, setMonthsOpen] = useState(false);
    type MonthRow = { month: string; revenue: number; collected: number; expense: number; profit: number };
    const [monthsLoaded, setMonthsLoaded] = useState<{ year: number; months: MonthRow[]; totals: Omit<MonthRow, 'month'> } | null>(null);
    const [monthsFailed, setMonthsFailed] = useState(false);
    const monthsData = monthsLoaded?.year === monthsYear ? monthsLoaded : null;
    useEffect(() => {
        if (!monthsOpen) return;
        let stale = false;
        setMonthsFailed(false);
        api.reports.months(monthsYear)
            .then(r => { if (!stale) setMonthsLoaded(r); })
            .catch(() => { if (!stale) setMonthsFailed(true); });
        return () => { stale = true; };
    }, [monthsOpen, monthsYear, data]);
    const monthName = (p: string) => {
        const [y, m] = p.split('-').map(Number);
        return calMonthLabel(new Date(y, m - 1, 1), lang).replace(/\s*\d{4}$/, '');
    };

    const series = useMemo(() => buildSeries(data.daily || [], from, to, lang), [data, from, to, lang]);
    const monthly = series.length > 0 && series[0].key.length === 7;

    /* ── To'rt raqam ──────────────────────────────────────────────────
       Raqamlar BITTA manbadan — solishtirish javobidagi «joriy» qismdan
       (o'zgarish ham o'sha yerdan), bo'lmasa umumiy hisobdan. */
    const cur = cmp?.current;
    const pick = (k: string, fallback: number) => (cur && cur[k] != null ? Number(cur[k]) : fallback);
    const prev = (k: string) => Number(cmp?.previous?.[k] ?? 0);
    const profit = pick('profit', totals.netProfit);
    const items: KpiItem[] = [
        {
            key: 'revenue', label: t('report.services'), value: pick('revenue', totals.revenue), unit: 'UZS',
            delta: <DeltaChip delta={cmp?.delta?.revenue} previous={prev('revenue')} goodUp />, hint: t('report.servicesHint'),
        },
        {
            key: 'collected', label: t('report.collected'), value: pick('collected', totals.collected), unit: 'UZS',
            delta: <DeltaChip delta={cmp?.delta?.collected} previous={prev('collected')} goodUp />, hint: t('report.collectedHint'),
        },
        {
            key: 'expense', label: t('ui.xarajat'), value: pick('expense', totals.doctorShare + totals.otherExpenses), unit: 'UZS',
            delta: <DeltaChip delta={cmp?.delta?.expense} previous={prev('expense')} goodUp={false} />, hint: t('report.expenseHint'),
        },
        {
            key: 'profit', label: t('finance.report.netProfit'), value: profit, unit: 'UZS', tone: profit < 0 ? 'bad' : 'ok',
            delta: <DeltaChip delta={cmp?.delta?.profit} previous={prev('profit')} goodUp />,
            /* Foyda qoidasi egasiniki (2026-11-14): xizmatlar − xarajat. Ulush
               to'langanda xarajatga tushadi — to'lanmagani shu yerda ochiq
               yoziladi, aks holda foyda kattaroq ko'rinadi. */
            hint: sharesPayable && sharesPayable > 0 ? (
                <button type="button" onClick={onOpenDoctors} className="text-left hover:text-ink hover:underline">
                    {fill(t('report.sharesUnpaid'), fmt(sharesPayable), shareMonthsText)}
                </button>
            ) : t('report.profitHint'),
        },
    ];

    const expenses = data.expenseByCategory || [];
    const expTotal = expenses.reduce((s, e) => s + e.amount, 0);
    const expMax = Math.max(0, ...expenses.map(e => e.amount));

    return (
        <div className="space-y-4">
            <KpiStrip items={items}
                footer={cmp?.previous?.from ? fill(t('report.vsPeriod'), fmtDay(cmp.previous.from), fmtDay(cmp.previous.to)) : undefined} />

            {/* Eski stomatologik laboratoriya xarajati qolgan bo'lsa */}
            {totals.legacyLabExpense > 0 && (
                <div className="flex items-start gap-2 p-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-500/30 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-ink">{t('finance.report.old')}<b>{t('financereport.laboratoriya_xarajatlari')}: {fmt(totals.legacyLabExpense)} UZS</b> {t('financereport.topildi_bular_stomatologiya_davridan')} <b>{t('report.notDeducted')}</b>.</p>
                </div>
            )}

            {/* ── KUNMA-KUN ─────────────────────────────────────────────── */}
            {series.length > 0 && (
                <section className="card" aria-labelledby="rep-trend">
                    <CardHead id="rep-trend" title={monthly ? t('report.trendMonthly') : t('report.trendDaily')}
                        hint={fill(t('report.trendHint'), fmt(series[series.length - 1].revenue - series[series.length - 1].collected))}
                        right={
                            <div className="flex items-center gap-4 text-[12px] text-muted" aria-hidden="true">
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c.primary }} />{t('report.services')}</span>
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c.success }} />{t('report.ofThemPaid')}</span>
                            </div>
                        } />
                    <div className="px-2 pb-3">
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={series} margin={{ top: 6, right: 16, left: 4, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="repRevFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={c.primary} stopOpacity={dark ? 0.35 : 0.18} />
                                        <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={c.grid} vertical={false} />
                                <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false}
                                    interval="preserveStartEnd" minTickGap={24} />
                                <YAxis tick={{ fill: c.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={72}
                                    tickFormatter={compactMoney} />
                                <Tooltip content={<ChartTip labelFormatter={(l: string) => {
                                    const row = series.find(s => s.label === l);
                                    return row && row.key.length === 10 ? fmtDay(row.key) : l;
                                }} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
                                <Area type="linear" dataKey="revenue" name={t('report.services')} stroke={c.primary} strokeWidth={2}
                                    fill="url(#repRevFill)" dot={false} activeDot={{ r: 4 }} />
                                {/* «Olindi» EMAS: KPI dagi «Olindi» — davrda kassaga tushgan pul
                                    (eski qarz to'lovi ham), bu chiziq esa SHU davr xizmatlaridan
                                    to'langani (qabul sanasi bo'yicha). Nomi boshqa — raqami ham. */}
                                <Area type="linear" dataKey="collected" name={t('report.ofThemPaid')} stroke={c.success} strokeWidth={2}
                                    fill="none" dot={false} activeDot={{ r: 4 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
                {/* ── QARZDORLAR — kim, qancha, necha kundan beri ─────────── */}
                {debtors && debtors.patients.length > 0 ? (
                    <DebtorsCard debtors={debtors} open={debtorsOpen} onToggle={() => setDebtorsOpen(o => !o)} installmentsDue={installmentsDue} />
                ) : (
                    <div role={debtors === null ? 'alert' : undefined}
                        className={`card lg:col-span-3 px-5 py-6 text-sm ${debtors === null ? 'text-danger-600 dark:text-danger-300' : 'text-muted'}`}>
                        {debtors === undefined ? t('finance.report.calculating')
                            : debtors === null ? t('financereport.hisobot_yuklanmadi')
                                : t('report.noDebtors')}
                    </div>
                )}

                {/* ── XARAJATLAR — toifa bo'yicha (bu ma'lumot faqat shu yerda) ── */}
                <section className="card lg:col-span-2" aria-labelledby="rep-expenses">
                    <CardHead id="rep-expenses" title={t('finance.report.expenses')}
                        right={expTotal > 0 ? <span className="text-sm font-semibold tabular-nums text-ink">{fmt(expTotal)}</span> : undefined} />
                    {expenses.length === 0 ? (
                        <p className="px-5 pb-6 text-sm text-faint">{t('finance.report.noExpense')}</p>
                    ) : (
                        <ul className="px-5 pb-4 space-y-3">
                            {expenses.map(e => (
                                <li key={e.category}>
                                    <div className="flex items-baseline gap-3 text-sm mb-1">
                                        {/* Toifa o'zbekcha — ilgari «Rent», «Salary» chiqardi */}
                                        <span className="text-ink">{(EXPENSE_CATEGORY_LABELS as Record<string, string>)[e.category] || e.category}</span>
                                        <span className="ml-auto tabular-nums font-medium text-ink">{fmt(e.amount)}</span>
                                    </div>
                                    <ShareBar value={e.amount} max={expMax} color={c.muted} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            {/* ── OYLAR BO'YICHA — bir yil, sukut bo'yicha yopiq ───────── */}
            <section className="card">
                <button type="button" onClick={() => setMonthsOpen(o => !o)} aria-expanded={monthsOpen}
                    className="w-full flex items-center gap-2 px-5 py-4 text-left text-[15px] font-semibold text-ink rounded-2xl hover:bg-elevated/40 transition-colors">
                    <span className="flex-1">{fill(t('report.byMonths'), monthsYear)}</span>
                    <ChevronDown className={`w-4 h-4 text-faint transition-transform ${monthsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {monthsOpen && (
                    !monthsData ? (
                        monthsFailed
                            ? <p role="alert" className="px-5 pb-4 text-sm font-medium text-danger">{t('financereport.hisobot_yuklanmadi')}</p>
                            : <p className="px-5 pb-4 text-sm text-faint">{t('finance.report.calculating')}</p>
                    ) : (
                        <div className="overflow-x-auto border-t border-line-soft">
                            <table className="w-full min-w-[560px]">
                                <thead className="border-b border-line-soft">
                                    <tr>
                                        <Th>{t('report.month')}</Th>
                                        <Th right>{t('report.services')}</Th>
                                        <Th right>{t('report.collected')}</Th>
                                        <Th right>{t('ui.xarajat')}</Th>
                                        <Th right>{t('finance.report.netProfit')}</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line-soft">
                                    {monthsData.months.filter(m => m.month <= todayISO().slice(0, 7)).map(m => (
                                        <tr key={m.month}>
                                            <Td strong>{monthName(m.month)}</Td>
                                            <Td right tone={m.revenue ? undefined : 'muted'}>{m.revenue ? fmt(m.revenue) : '—'}</Td>
                                            <Td right tone={m.collected ? undefined : 'muted'}>{m.collected ? fmt(m.collected) : '—'}</Td>
                                            <Td right tone={m.expense ? undefined : 'muted'}>{m.expense ? fmt(m.expense) : '—'}</Td>
                                            <Td right strong tone={m.profit < 0 ? 'bad' : m.revenue || m.expense ? undefined : 'muted'}>{m.revenue || m.expense ? fmt(m.profit) : '—'}</Td>
                                        </tr>
                                    ))}
                                    <tr className="bg-elevated/50">
                                        <Td strong>{t('report.yearTotal')}</Td>
                                        <Td right strong>{fmt(monthsData.totals.revenue)}</Td>
                                        <Td right strong>{fmt(monthsData.totals.collected)}</Td>
                                        <Td right strong>{fmt(monthsData.totals.expense)}</Td>
                                        <Td right strong tone={monthsData.totals.profit < 0 ? 'bad' : 'ok'}>{fmt(monthsData.totals.profit)}</Td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </section>
        </div>
    );
};

/* ─── Qarzdorlar kartochkasi ────────────────────────────────────────────
   Qarz yoshi — bitta chiziq (0–30 / 31–60 / 60+): eski qarz yig'ilishi
   qiyin, egasi «qaysi qarz qotib qoldi» deb so'raydi. Sarlavhaning bobosi —
   kartochkaning o'zi (e2e: qo'ng'iroq havolasi shu ichida). */
const DebtorsCard: React.FC<{
    debtors: { total: number; patients: Debtor[] };
    open: boolean; onToggle: () => void;
    installmentsDue: { month: number; overdue: number } | null;
}> = ({ debtors, open, onToggle, installmentsDue }) => {
    const { t } = useLanguage();
    const buckets = [
        { label: t('report.age0'), sum: 0, cls: 'bg-primary-300 dark:bg-primary-500/70' },
        { label: t('report.age30'), sum: 0, cls: 'bg-warning-500' },
        { label: t('report.age60'), sum: 0, cls: 'bg-danger-500' },
    ];
    for (const p of debtors.patients) {
        const d = daysSince(p.oldestDate);
        buckets[d > 60 ? 2 : d > 30 ? 1 : 0].sum += p.due;
    }
    const total = buckets.reduce((s, b) => s + b.sum, 0) || 1;
    const shown = open ? debtors.patients : debtors.patients.slice(0, 5);

    return (
        <section className="card lg:col-span-3 px-5 pt-4 pb-3" aria-labelledby="rep-debtors">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 id="rep-debtors" className="text-[15px] font-semibold text-ink">{fill(t('report.debtorsTitle'), debtors.patients.length)}</h3>
                {/* Qarzdorlar — AYNI DAMDAGI qarz; Shifokorlar «Qarz» i esa shu davrniki.
                    Ega ikkalasini solishtirib «mos kelmaydi» demasin. */}
                <span className="text-[12px] text-faint">{t('report.debtorsNow')}</span>
                <span className="ml-auto text-[15px] font-semibold tabular-nums text-danger-600 dark:text-danger-300">{fmt(debtors.total)} <span className="text-[12px] font-medium text-faint">UZS</span></span>
            </div>

            <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-elevated" aria-hidden="true">
                {buckets.map((b, i) => b.sum > 0 && <div key={i} className={b.cls} style={{ width: `${(b.sum / total) * 100}%` }} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                {buckets.map((b, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${b.cls}`} aria-hidden="true" />
                        {b.label}: <b className={`tabular-nums ${i === 2 && b.sum > 0 ? 'text-danger-600 dark:text-danger-300' : 'text-ink'}`}>{fmt(b.sum)}</b>
                    </span>
                ))}
            </div>

            <ul className="mt-3 divide-y divide-line-soft border-t border-line-soft">
                {shown.map(p => {
                    const d = daysSince(p.oldestDate);
                    return (
                        <li key={p.patientId || p.patientName} className="h-11 flex items-center gap-3 text-sm">
                            {p.patientId
                                ? <a href={`#/patients/${p.patientId}`} className="text-ink font-medium hover:underline truncate">{p.patientName}</a>
                                : <span className="text-ink font-medium truncate">{p.patientName}</span>}
                            <span className={`text-[12px] shrink-0 ${d > 60 ? 'text-danger-600 dark:text-danger-300 font-semibold' : d > 30 ? 'text-warning-700 dark:text-warning-300' : 'text-faint'}`}>
                                {d === 0 ? t('card.today') : fill(t('report.daysAgo'), d)}
                            </span>
                            {p.phone && (
                                <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}
                                    className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink tabular-nums shrink-0">
                                    <Phone className="w-3.5 h-3.5" aria-hidden="true" />{formatUzPhone(p.phone)}
                                </a>
                            )}
                            <span className={`${p.phone ? '' : 'ml-auto '}tabular-nums font-semibold text-ink shrink-0 w-24 text-right`}>{fmt(p.due)}</span>
                        </li>
                    );
                })}
            </ul>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-line-soft text-[12px] text-muted">
                {debtors.patients.length > 5 && (
                    <button type="button" onClick={onToggle} aria-expanded={open}
                        className="h-8 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                        {open ? t('pay.queue.hide') : fill(t('pay.queue.showN'), debtors.patients.length - 5)}
                    </button>
                )}
                {installmentsDue && installmentsDue.month + installmentsDue.overdue > 0 && (
                    <span className="ml-auto">
                        {t('report.installmentsMonth')} <b className="text-ink tabular-nums">{fmt(installmentsDue.month)}</b>
                        {installmentsDue.overdue > 0 && (
                            <> · {t('report.installmentsOverdue')} <b className="text-danger-600 dark:text-danger-300 tabular-nums">{fmt(installmentsDue.overdue)}</b></>
                        )}
                    </span>
                )}
            </div>
        </section>
    );
};
