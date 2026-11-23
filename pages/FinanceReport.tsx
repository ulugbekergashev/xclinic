import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatNumber } from '../utils/format';
import { todayISO, getCurrentMonthRange } from '../utils/dateUtils';
import { SkeletonList } from '../components/Common';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    LineChart, Line,
} from 'recharts';
import {
    TrendingUp, TrendingDown, Wallet, AlertCircle, Users,
    Building2, Package, Percent, X, Activity, Download, ChevronDown,
} from 'lucide-react';
import { Department, EXPENSE_CATEGORY_LABELS } from '../types';
import { api } from '../services/api';
import { useLiveUpdates, LiveEventType } from '../hooks/useLiveUpdates';
import { useLanguage, tr, fill, TranslationKey } from '../context/LanguageContext';
/* SERVER NOMLARI. Hisobot manba turini («Xizmatlar», «Dorilar» …) va
   bo'limsiz qatorni («Bo'limsiz») o'zbekcha nom bilan qaytaradi. Ekranda
   ular tildagi yorliqqa almashadi; noma'lum nom o'zicha qoladi. */
const SOURCE_KEYS: Record<string, TranslationKey> = {
    Service: 'inpatient.xizmatlar',
    Lab: 'settings.laboratoriya',
    Study: 'settings.diagnostika_2',
    Medication: 'inpatient.dorilar',
    Bed: 'ui.statsionar',
    Other: 'inpatient.boshqa',
};
const sourceLabel = (reason: string, fallback: string) => (SOURCE_KEYS[reason] ? tr(SOURCE_KEYS[reason]) : fallback);
const deptName = (n: string) => (n === "Bo'limsiz" ? tr('visit.noDept') : n);

import { exportReportToExcel } from '../utils/reportExport';
import { formatUzPhone } from '../shared/validation';
import { monthLabel as calMonthLabel } from '../utils/calendarLabels';
import { AttendanceTab } from '../components/AttendanceReport';

/* Hisobot raqamlarini o'zgartiradigan hodisalar: to'lov, yangi qabul,
   ombordan chiqim. `data.changed` esa har qanday yozuvda keladi — undan
   faqat pulga tegishli manzillar olinadi. */
const REPORT_EVENTS: LiveEventType[] = ['charge.paid', 'charge.changed', 'visit.created', 'stock.changed', 'data.changed'];
const MONEY_RESOURCES = new Set(['transactions', 'expenses', 'cash-movements', 'cash-register', 'installments', 'inventory']);

/* ─────────────────────────────────────────────────────────────────────────────
   Moliyaviy hisobot — ko'p profilli klinika uchun.

   denta7 dagi hisobot bitta o'lchovda edi: shifokorlar. Ko'p profilli klinikada
   asosiy savol boshqa — QAYSI BO'LIM qancha keltiradi va qanchasi foyda.
   Bitta shifokor yaxshi ishlashi mumkin, lekin butun bo'lim zarar bo'lishi ham.

   Daromad `VisitCharge` dan olinadi (haqiqiy tushum daftari), tannarx esa
   xizmat retseptidan — shuning uchun foyda marjasi haqiqiy raqam.
   ───────────────────────────────────────────────────────────────────────────── */

interface Summary {
    period: { from: string; to: string };
    /** Ayni damdagi umumiy qarz — davrga bog'liq EMAS.
     *  `totals.due` esa shu DAVR ichida qolgan qarz. Ikkalasi turli narsa
     *  va ilgari ikkalasi ham «Qarz» deb yozilardi — audit shu sababdan
     *  «raqamlar mos kelmaydi» degan edi. Manba bitta: `snapshot.ts`. */
    openDebt?: { amount: number; charges: number; patients: number };
    totals: {
        revenue: number; collected: number; due: number;
        materialCost: number; grossProfit: number;
        doctorShare: number; otherExpenses: number; netProfit: number;
        legacyLabExpense: number;
    };
    byDepartment: {
        departmentId: string | null; name: string;
        revenue: number; collected: number; due: number;
        cost: number; margin: number; marginPercent: number; count: number;
    }[];
    bySource: { source: string; label: string; revenue: number; count: number }[];
    byDoctor: { doctorName: string; revenue: number; count: number }[];
    expenseByCategory: { category: string; amount: number }[];
    daily: { date: string; revenue: number; collected: number }[];
}

interface Props {
    departments?: Department[];
    embedded?: boolean;
    /** Qaysi vkladka bilan ochiladi (`/dashboard?tab=davomat` → attendance) */
    initialView?: 'summary' | 'attendance';
}

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);
/* Oy boshi MAHALLIY sana bo'yicha. `toISOString()` UTC beradi: Toshkentda
   (UTC+5) mahalliy 1-sananing yarim tuni UTC da oldingi oyning oxirgi kuni —
   hisobot jimgina o'tgan oyning oxirgi kunini ham qo'shib olardi. */
const monthStart = () => getCurrentMonthRange().startDate;
const today = () => todayISO();
/** 2026-10-01 → 01.10.2026 */
const fmtDay = (iso: string) => { const [y, m, d] = String(iso).split('-'); return d ? `${d}.${m}.${y}` : iso; };

// Bo'limlar diagrammasi uchun ranglar — bo'limning o'z rangi bo'lmasa shulardan
const PALETTE = ['#0E5F55', '#005EB8', '#D5281B', '#6F4FA3', '#0891B2', '#C96F00', '#B5377A', '#009639'];


/** Svod qatori — bitta o'lchov, izohi bilan */
const LAB_STATUS: Record<string, string> = {
    Ordered: tr('financereport.buyurtma_berildi'), Collected: tr('finance.report.sampleTaken'),
    InProgress: 'Bajarilmoqda', Completed: tr('ui.tayyor'), Cancelled: tr('ui.bekor_qilindi'),
};

const Row: React.FC<{
    label: string; value: React.ReactNode; unit?: string; hint?: string;
    tone?: 'ok' | 'bad' | 'warn';
}> = ({ label, value, unit, hint, tone }) => (
    <div className="flex items-baseline gap-2 text-sm">
        <span className="text-muted">{label}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
        <span className={`ml-auto font-semibold tabular-nums ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'bad' ? 'text-red-600 dark:text-red-400'
                : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
                    : 'text-ink'}`}>
            {value}{unit ? <span className="text-[11px] font-normal text-faint ml-1">{unit}</span> : null}
        </span>
    </div>
);

export const FinanceReport: React.FC<Props> = ({ departments = [], embedded, initialView }) => {
    const { t, language } = useLanguage();
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await api.reports.summary(from, to));
            setError('');
        } catch (e: any) { setError(e.message || t('financereport.hisobot_yuklanmadi')); }
        finally { setLoading(false); }
    }, [from, to]);

    useEffect(() => { load(); }, [load]);

    /* TAYYOR DAVRLAR (2026-11-22, DentaCRM dagi hisobotdan). Egasi deyarli
       har safar bir xil savolni beradi: bugun, shu hafta, shu oy, o'tgan oy.
       Ikki sanani har safar qo'lda terish o'rniga — bitta bosish. */
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const presets = (() => {
        const now = new Date();
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        return [
            { key: 'today', label: t('card.today'), from: today(), to: today() },
            { key: 'week', label: t('report.week'), from: iso(weekStart), to: today() },
            { key: 'month', label: t('cashbook.month'), from: monthStart(), to: today() },
            { key: 'prev', label: t('report.prevMonth'), from: iso(prevStart), to: iso(prevEnd) },
        ];
    })();

    /* Qarzdorlar — kim, qancha, necha kundan beri (DentaCRM da bor; qarz
       yoshi bo'yicha guruh — yo'q, egasi «qaysi qarz qotib qoldi» deb so'raydi) */
    const [debtors, setDebtors] = useState<{ total: number; patients: { patientId?: string; patientName: string; phone?: string | null; due: number; count: number; oldestDate: string }[] } | null>(null);
    const [debtorsOpen, setDebtorsOpen] = useState(false);
    useEffect(() => { api.reports.debtors().then(setDebtors).catch(() => setDebtors(null)); }, [data]);

    /* BO'LIB TO'LASH — shu oy qancha kelishi kerak (Moliya rejasi 7). Qarzning
       bir qismi rejaga solingan: u «qotib qolgan» emas, jadval bo'yicha
       keladi. Egasi buni qarzdorlar yonida ko'rishi kerak. */
    const [installmentsDue, setInstallmentsDue] = useState<{ month: number; overdue: number } | null>(null);
    useEffect(() => {
        let stale = false;
        api.installments.getAll()
            .then((plans: any[]) => {
                if (stale) return;
                const now = today();
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
    const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 864e5));

    const colorOf = (name: string, i: number) =>
        departments.find(d => d.name === name)?.color || PALETTE[i % PALETTE.length];

    /* `totals` deb nomlandi (S4.1). Ilgari u `t` edi va tarjima
       funksiyasining odatiy nomi bilan to'qnashardi — avtomatik
       ko'chirishda aynan shu joy jimgina buzilgan edi. */
    const totals = data?.totals;

    const deptChart = useMemo(
        () => (data?.byDepartment || []).slice(0, 8).map(d => ({
            name: d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name,
            Daromad: d.revenue,
            Tannarx: d.cost,
        })),
        [data],
    );

    /* ─── Reliz 5: uch qo'shimcha kesim ─────────────────────────────────────
       Nima uchun bo'lim (tab), alohida ekran emas: uchtasi ham BIR XIL davr
       bilan ishlaydi va bir-birini tushuntiradi. "Bo'lim zarar" degan
       raqamdan keyin darhol "chunki 4 mln behuda ketgan" degan raqamga
       o'tish kerak. */
    const [view, setView] = useState<'summary' | 'doctors' | 'departments' | 'writeoffs' | 'labshift' | 'attendance'>(initialView || 'summary');

    /* Solishtirish: bitta raqam ("shu oy 40 mln") o'zi hech narsa aytmaydi.
       Javob faqat oldingi davr yonida turganda paydo bo'ladi. */
    const [cmp, setCmp] = useState<any>(null);
    const [extra, setExtra] = useState<Record<string, any>>({});
    const [extraLoading, setExtraLoading] = useState(false);

    /* Solishtirish umumiy ko'rinishda: davr o'zgarganda qayta hisoblanadi */
    useEffect(() => {
        if (view !== 'summary') return;
        api.reports.compare(from, to).then(setCmp).catch(() => setCmp(null));
    }, [view, from, to]);

    const loadExtra = useCallback(async () => {
        if (view === 'summary' || view === 'attendance') return;
        if (view === 'labshift') {
            setExtraLoading(true);
            try {
                const res = await api.reports.labShift(to);
                setExtra(prev => ({ ...prev, labshift: res }));
            }
            catch (e: any) { setError(e?.message || 'Svod yuklanmadi'); }
            finally { setExtraLoading(false); }
            return;
        }
        setExtraLoading(true);
        setError('');
        try {
            const fn = view === 'doctors' ? api.reports.doctors
                : view === 'departments' ? api.reports.departmentsReport
                    : api.reports.writeoffs;
            setExtra(prev => ({ ...prev, [view]: null }));
            const res = await fn(from, to);
            setExtra(prev => ({ ...prev, [view]: res }));
        } catch (e: any) {
            setError(e?.message || t('financereport.hisobot_yuklanmadi'));
        } finally {
            setExtraLoading(false);
        }
    }, [view, from, to]);

    useEffect(() => { loadExtra(); }, [loadExtra]);

    /* ULUSH: TO'LANDI VA QOLDIQ (2026-11-23, Moliya rejasi 3-vazifa). Egasi
       «kimga qancha berdim, kimga qancha qoldi» ni shu yerda ko'radi. Ulush
       oyiga bir marta to'lanadi — shuning uchun raqam davrning OYLARI
       bo'yicha Xodimlar → Ulush jadvalidan olinadi (bitta manba). Pul o'sha
       yerda to'lanadi; bu yerda faqat havola. */
    const shareMonths = useMemo(() => {
        const out: string[] = [];
        const [fy, fm] = from.split('-').map(Number);
        const [ty, tm] = to.split('-').map(Number);
        if (!fy || !ty) return out;
        for (let y = fy, m = fm; (y < ty || (y === ty && m <= tm)) && out.length < 24; m === 12 ? (y++, m = 1) : m++) {
            out.push(`${y}-${String(m).padStart(2, '0')}`);
        }
        return out;
    }, [from, to]);
    type ShareMap = Record<string, { paid: number; payable: number }>;
    const loadShares = useCallback(async (): Promise<ShareMap> => {
        const list = await Promise.all(shareMonths.map(p => api.hr.shares(p)));
        const acc: ShareMap = {};
        for (const res of list) for (const r of res?.rows || []) {
            const cur = acc[r.id] || { paid: 0, payable: 0 };
            acc[r.id] = { paid: cur.paid + (r.paid || 0) + (r.paidViaRuns || 0), payable: cur.payable + (r.payable || 0) };
        }
        return acc;
    }, [shareMonths]);
    /* `key` — qaysi oylar uchun yuklangani: davr o'zgarsa eski raqam ko'rinmaydi */
    const [sharesState, setSharesState] = useState<{ key: string; map: ShareMap } | null>(null);
    const [sharesFailed, setSharesFailed] = useState(false);
    const sharesKey = shareMonths.join(',');
    const shares = sharesState?.key === sharesKey ? sharesState.map : null;
    useEffect(() => {
        if (view !== 'doctors' || !extra.doctors) return;
        let stale = false;
        setSharesFailed(false);
        loadShares()
            .then(map => { if (!stale) setSharesState({ key: sharesKey, map }); })
            /* Xato «—» (ulush yo'q) bo'lib ko'rinmasin — alohida yoziladi */
            .catch(() => { if (!stale) setSharesFailed(true); });
        return () => { stale = true; };
    }, [view, sharesKey, loadShares, extra.doctors]);
    /* Oylar bo'yicha jadval — ochilganda yuklanadi (yil = davr oxiri yili) */
    const monthsYear = Number(to.slice(0, 4)) || new Date().getFullYear();
    const [monthsOpen, setMonthsOpen] = useState(false);
    type MonthRow = { month: string; revenue: number; collected: number; expense: number; profit: number };
    const [monthsLoaded, setMonthsLoaded] = useState<{ year: number; months: MonthRow[]; totals: Omit<MonthRow, 'month'> } | null>(null);
    const [monthsFailed, setMonthsFailed] = useState(false);
    /* Boshqa yil tanlansa eski yil raqamlari yangi sarlavha ostida turmasin */
    const monthsData = monthsLoaded?.year === monthsYear ? monthsLoaded : null;
    useEffect(() => {
        if (!monthsOpen || view !== 'summary') return;
        let stale = false;
        setMonthsFailed(false);
        api.reports.months(monthsYear)
            .then(r => { if (!stale) setMonthsLoaded(r); })
            .catch(() => { if (!stale) setMonthsFailed(true); });
        return () => { stale = true; };
    }, [monthsOpen, monthsYear, view, data]);
    /* Brauzerda «uz-UZ» oy nomlari yo'q («2026 M11» chiqardi) — nomlar
       `calendarLabels` dagi o'z ro'yxatidan */
    const monthLabel = (p: string) => {
        const [y, m] = p.split('-').map(Number);
        return calMonthLabel(new Date(y, m - 1, 1), language === 'ru' ? 'ru' : 'uz');
    };
    const monthName = (p: string) => monthLabel(p).replace(/\s*\d{4}$/, '');

    /* Hisobot O'ZI yangilanadi: pulga tegishli narsa o'zgarsa, ochiq vkladka
       jimgina qayta so'raladi — skeleton chiqmaydi, raqamlar joyida almashadi.
       Ilgari buning uchun «Yangilash» tugmasi turardi. Jim yangilash xato
       bersa, eski raqamlar qoladi: xato faqat qo'lda ochilganda ko'rsatiladi. */
    const refreshSilently = useCallback(async () => {
        if (view === 'attendance') return;
        try {
            if (view === 'summary') {
                const [summary, compare] = await Promise.all([
                    api.reports.summary(from, to),
                    api.reports.compare(from, to).catch(() => null),
                ]);
                setData(summary);
                setCmp(compare);
                return;
            }
            if (view === 'labshift') {
                const res = await api.reports.labShift(to);
                setExtra(prev => ({ ...prev, labshift: res }));
                return;
            }
            const fn = view === 'doctors' ? api.reports.doctors
                : view === 'departments' ? api.reports.departmentsReport
                    : api.reports.writeoffs;
            const res = await fn(from, to);
            setExtra(prev => ({ ...prev, [view]: res }));
        } catch {
            /* tarmoq uzilgan bo'lishi mumkin — keyingi hodisada yana uriniladi */
        }
    }, [view, from, to]);

    useLiveUpdates(REPORT_EVENTS, (payload) => {
        if (payload?.resource && !MONEY_RESOURCES.has(payload.resource)) return;
        refreshSilently();
    });

    /** Jadval sarlavhasi — uch hisobotda bir xil ko'rinish */
    const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
        <th className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted ${right ? 'text-right' : 'text-left'}`}>
            {children}
        </th>
    );
    const Td: React.FC<{ children: React.ReactNode; right?: boolean; strong?: boolean; tone?: 'ok' | 'bad' }> =
        ({ children, right, strong, tone }) => (
            <td className={`px-3 py-2 text-sm ${right ? 'text-right tabular-nums' : ''} ${strong ? 'font-semibold' : ''} ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
                : tone === 'bad' ? 'text-red-600 dark:text-red-400'
                    : 'text-ink'}`}>
                {children}
            </td>
        );

    const [exporting, setExporting] = useState(false);

    /* Eksport HAMMA kesimni oladi, faqat ochiq turganini emas: egasi
       "yuklab olish" deganda butun hisobotni kutadi, to'rt marta vkladka
       bosib emas. Yuklanmagan kesimlar shu yerda so'raladi. */
    const exportAll = async () => {
        setExporting(true);
        setError('');
        try {
            const [doctors, departments, writeoffs, compare, labShift] = await Promise.all([
                extra.doctors ? Promise.resolve(extra.doctors) : api.reports.doctors(from, to).catch(() => null),
                extra.departments ? Promise.resolve(extra.departments) : api.reports.departmentsReport(from, to).catch(() => null),
                extra.writeoffs ? Promise.resolve(extra.writeoffs) : api.reports.writeoffs(from, to).catch(() => null),
                cmp ? Promise.resolve(cmp) : api.reports.compare(from, to).catch(() => null),
                extra.labshift ? Promise.resolve(extra.labshift) : api.reports.labShift(to).catch(() => null),
            ]);
            /* Shu ochiq turgan tab qaysi bo'lishidan qat'i nazar — eksport
               o'zi yuklaydi: ulush ustunlari soxta nol bo'lib chiqmasin. */
            const [months, exportShares, freshCompare] = await Promise.all([
                monthsData ? Promise.resolve(monthsData) : api.reports.months(monthsYear).catch(() => null),
                shares ? Promise.resolve(shares) : loadShares().catch(() => null),
                api.reports.compare(from, to).catch(() => compare),
            ]);
            exportReportToExcel({
                from, to,
                clinicName: departments?.clinicName || undefined,
                summary: data, doctors, departments, writeoffs, compare: freshCompare, labShift,
                months, debtors, shares: exportShares,
                expenseLabels: EXPENSE_CATEGORY_LABELS as Record<string, string>,
            });
        } catch (e: any) {
            setError(e?.message || t('financereport.eksport_qilinmadi'));
        } finally {
            setExporting(false);
        }
    };

    const inputCls = 'px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500';

    const Tile: React.FC<{
        label: string; value: string; unit?: string; hint?: string;
        icon: React.ElementType; tone?: 'ok' | 'bad' | 'warn';
    }> = ({ label, value, unit, hint, icon: Icon, tone }) => (
        <div className="bg-surface rounded-xl border border-line p-4">
            <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`w-4 h-4 ${tone === 'ok' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : tone === 'warn' ? 'text-amber-500' : 'text-faint'}`} />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
            </div>
            <p className={`text-xl font-bold tabular-nums ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-ink'}`}>
                {value}{unit && <span className="text-xs font-normal text-faint ml-1">{unit}</span>}
            </p>
            {hint && <p className="text-[11px] text-faint mt-0.5">{hint}</p>}
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Davr */}
            <div className={`flex flex-wrap items-end gap-3 ${view === 'attendance' ? 'hidden' : ''}`}>
                {!embedded && <h2 className="text-xl font-bold text-ink mr-auto">{t('finance.report.report')}</h2>}
                <div role="group" aria-label={t('finance.report.from')} className="flex items-center gap-0.5 p-1 rounded-xl bg-elevated">
                    {presets.map(p => {
                        const on = from === p.from && to === p.to;
                        return (
                            <button key={p.key} type="button" aria-pressed={on} onClick={() => { setFrom(p.from); setTo(p.to); }}
                                className={`h-9 px-3.5 rounded-lg text-sm font-semibold transition-colors ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                                {p.label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-end gap-3">
                    <div>
                        <label className="block text-[11px] text-muted mb-1">{t('finance.report.from')}</label>
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-[11px] text-muted mb-1">{t('finance.report.to')}</label>
                        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                    </div>
                </div>
                <button aria-label={t('finance.report.exportHint')} onClick={exportAll} disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-line rounded-lg text-muted hover:border-primary-400 disabled:opacity-50"
                    title={t('finance.report.exportHint')}>
                    <Download className="w-4 h-4" /> {exporting ? '...' : 'Excel'}
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* ── Kesim tanlash ─────────────────────────────────────────────── */}
            {/* Chiziq tashqi qutida, aylantirish ichkisida: `overflow-x-auto`
                bitta qutida bo'lsa, `-mb-px` tufayli 1px tik aylantirgich
                paydo bo'lardi — vkladkalar o'ng chetidagi kulrang tayoqcha. */}
            <div className="border-b border-line">
            <div className="flex gap-1 overflow-x-auto overflow-y-hidden -mb-px">
                {([
                    ['summary', t('ui.umumiy_tab')],
                    ['doctors', t('ui.shifokorlar')],
                    ['departments', t('settings.bolimlar')],
                    ['writeoffs', t('report.tabWaste')],
                    /* Davomat — shu qatorda (2026-11-22): ilgari tepada ikkinchi tab qatori
                       edi. «Smena svodi» (laboratoriyaning bir kunlik ishi) pul
                       hisobotiga tegishli emas — u bu qatordan olib tashlandi. */
                    ['attendance', t('finance.hub.attendance')],
                ] as const).map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${view === k
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-muted hover:text-muted'}`}>
                        {label}
                    </button>
                ))}
            </div>
            </div>

            {view === 'attendance' && <AttendanceTab />}

            {/* ── SHIFOKORLAR ───────────────────────────────────────────────── */}
            {view === 'doctors' && (
                extraLoading || !extra.doctors ? (
                    <SkeletonList rows={5} />
                ) : (extra.doctors.doctors || []).length === 0 ? (
                    <div className="text-center py-16 bg-surface rounded-xl border border-line">
                        <Users className="w-10 h-10 mx-auto text-faint mb-2" />
                        <p className="text-muted">{t('finance.report.noRows')}</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Tile label={t('report.services')} value={fmt(extra.doctors.totals.revenue)} unit="UZS" icon={TrendingUp} />
                            <Tile label={t('ui.tolangan')} value={fmt(extra.doctors.totals.paid)} unit="UZS" icon={Wallet} tone="ok" />
                            <Tile label={t('finance.report.debt')} value={fmt(extra.doctors.totals.due)} unit="UZS" icon={AlertCircle} tone="bad" />
                            <Tile label={t('finance.report.accruedShare')} value={fmt(extra.doctors.totals.accrued)} unit="UZS"
                                icon={Percent} hint={t('financereport.tolangan_pul_boyicha')} />
                        </div>

                        <div className="bg-surface rounded-xl border border-line overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px]">
                                    <thead className="bg-canvas/40 border-b border-line">
                                        <tr>
                                            <Th>{t('finance.report.doctor')}</Th>
                                            <Th right>{t('report.services')}</Th>
                                            <Th right>{t('finance.report.paid')}</Th>
                                            <Th right>{t('finance.report.debt')}</Th>
                                            <Th right>{t('finance.report.patient')}</Th>
                                            <Th right>{t('finance.report.avgCheck')}</Th>
                                            <Th right>{t('finance.report.share')}</Th>
                                            <Th right>{t('report.sharePaid')}</Th>
                                            <Th right>{t('report.shareLeft')}</Th>
                                            <Th right><span className="sr-only">{t('report.payShare')}</span></Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line">
                                        {extra.doctors.doctors.map((d: any) => (
                                            <tr key={d.doctorId || d.name}>
                                                <Td strong>{deptName(d.name)}</Td>
                                                <Td right>{fmt(d.revenue)}</Td>
                                                <Td right tone="ok">{fmt(d.paid)}</Td>
                                                <Td right tone={d.due > 0 ? 'bad' : undefined}>{d.due > 0 ? fmt(d.due) : '—'}</Td>
                                                <Td right>{d.patientCount}</Td>
                                                <Td right>{fmt(d.avgCheck)}</Td>
                                                <Td right strong>{fmt(d.accrued)}</Td>
                                                {(() => {
                                                    const s = d.doctorId && shares ? shares[d.doctorId] : undefined;
                                                    return (
                                                        <>
                                                            <Td right tone={s && s.paid > 0 ? 'ok' : undefined}>{!shares ? (sharesFailed ? '?' : '…') : s && s.paid > 0 ? fmt(s.paid) : '—'}</Td>
                                                            <Td right strong tone={s && s.payable > 0 ? 'bad' : undefined}>{!shares ? (sharesFailed ? '?' : '…') : s && s.payable > 0 ? fmt(s.payable) : '—'}</Td>
                                                            <Td right>
                                                                {s && s.payable > 0 ? (
                                                                    <a href="#/staff?tab=payroll"
                                                                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                                                                        {t('report.payShare')} →
                                                                    </a>
                                                                ) : null}
                                                            </Td>
                                                        </>
                                                    );
                                                })()}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="px-3 py-2 text-[11px] text-faint border-t border-line-soft">
                                {t('financereport.ulush_tolangan_pul_boyicha')}{' '}
                                {fill(t('report.shareMonthsNote'), shareMonths.map(monthLabel).join(', '))}
                            </p>
                        </div>
                    </>
                )
            )}

            {/* ── BO'LIMLAR ─────────────────────────────────────────────────── */}
            {view === 'departments' && (
                extraLoading || !extra.departments ? (
                    <p className="text-sm text-faint py-16 text-center">{t('finance.report.calculating')}</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Tile label={t('report.services')} value={fmt(extra.departments.totals.revenue)} unit="UZS" icon={TrendingUp} />
                            <Tile label={t('finance.report.expense')} value={fmt(extra.departments.totals.expense)} unit="UZS" icon={TrendingDown} tone="bad" />
                            <Tile label={t('finance.report.netProfit')} value={fmt(extra.departments.totals.profit)} unit="UZS" icon={Wallet}
                                tone={extra.departments.totals.profit >= 0 ? 'ok' : 'bad'} />
                            <Tile label={t('finance.report.bedOccupancy')}
                                value={extra.departments.totals.occupancy != null ? `${extra.departments.totals.occupancy}` : '—'}
                                unit={extra.departments.totals.occupancy != null ? '%' : undefined}
                                icon={Building2}
                                hint={`${extra.departments.totals.bedDays} koyka-kun / ${extra.departments.totals.bedCount} koyka`} />
                        </div>

                        <div className="bg-surface rounded-xl border border-line overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px]">
                                    <thead className="bg-canvas/40 border-b border-line">
                                        <tr>
                                            <Th>{t('finance.report.department')}</Th>
                                            <Th right>{t('report.services')}</Th>
                                            <Th right>{t('finance.report.paid')}</Th>
                                            <Th right>{t('finance.report.expense')}</Th>
                                            <Th right>{t('finance.report.profit')}</Th>
                                            <Th right>{t('finance.report.bedDays')}</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line">
                                        {(extra.departments.departments || []).map((d: any, i: number) => (
                                            <tr key={d.departmentId || `none-${i}`}>
                                                <Td>
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full shrink-0"
                                                            style={{ backgroundColor: d.color || colorOf(d.name, i) }} />
                                                        {deptName(d.name)}
                                                    </span>
                                                </Td>
                                                <Td right>{fmt(d.revenue)}</Td>
                                                <Td right tone="ok">{fmt(d.paid)}</Td>
                                                <Td right tone={d.expense > 0 ? 'bad' : undefined}>{d.expense > 0 ? fmt(d.expense) : '—'}</Td>
                                                <Td right strong tone={d.profit >= 0 ? 'ok' : 'bad'}>{fmt(d.profit)}</Td>
                                                <Td right>{d.bedDays || '—'}</Td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="px-3 py-2 text-[11px] text-faint border-t border-line-soft">
                                {t('financereport.bolimsiz_bolimi_korsatilmagan_xarajat')}
                            </p>
                        </div>
                    </>
                )
            )}

            {/* ── CHIQIMLAR ─────────────────────────────────────────────────── */}
            {view === 'writeoffs' && (
                extraLoading || !extra.writeoffs ? (
                    <p className="text-sm text-faint py-16 text-center">{t('finance.report.calculating')}</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                            <Tile label={t('finance.report.wasted')} value={fmt(extra.writeoffs.wasteCost)} unit="UZS"
                                icon={TrendingDown} tone="bad" hint={t('financereport.muddati_otgan_buzilgan_kam')} />
                            <Tile label={t('finance.report.usedForService')} value={fmt(extra.writeoffs.serviceCost)} unit="UZS"
                                icon={Package} hint={t('financereport.bu_yoqotish_emas_daromad')} />
                            <Tile label={t('finance.report.totalOut')} value={fmt(extra.writeoffs.totalCost)} unit="UZS" icon={Package}
                                hint={fill(t('financereport.x_harakat'), extra.writeoffs.movementCount)} />
                        </div>

                        {(extra.writeoffs.byReason || []).length === 0 ? (
                            <div className="text-center py-16 bg-surface rounded-xl border border-line">
                                <Package className="w-10 h-10 mx-auto text-faint mb-2" />
                                <p className="text-muted">{t('finance.report.noExpenses')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="bg-surface rounded-xl border border-line overflow-hidden">
                                    <h3 className="px-3 py-2.5 text-sm font-bold text-ink border-b border-line-soft">{t('finance.report.byReason')}</h3>
                                    <table className="w-full">
                                        <tbody className="divide-y divide-line">
                                            {extra.writeoffs.byReason.map((r: any) => (
                                                <tr key={r.reason}>
                                                    <Td>{sourceLabel(r.reason, r.label)}</Td>
                                                    <Td right>{r.count} {t('ui.ta')}</Td>
                                                    <Td right strong tone={r.reason === 'Service' ? undefined : 'bad'}>
                                                        {fmt(r.cost)}
                                                    </Td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="bg-surface rounded-xl border border-line overflow-hidden">
                                    <h3 className="px-3 py-2.5 text-sm font-bold text-ink border-b border-line-soft">{t('finance.report.byItem')}</h3>
                                    <div className="max-h-80 overflow-y-auto">
                                        <table className="w-full">
                                            <tbody className="divide-y divide-line">
                                                {extra.writeoffs.byItem.map((it: any) => (
                                                    <tr key={it.itemId}>
                                                        <Td>{it.name}</Td>
                                                        {/* Chiqim omborda manfiy son — bu yerda «qancha ketdi» */}
                                                        <Td right>{Math.abs(it.qty || 0)} {it.unit || ''}</Td>
                                                        <Td right strong>{fmt(Math.abs(it.cost || 0))}</Td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        <p className="text-[11px] text-faint">
                            {t('financereport.summalar_tannarxda_yoqolgan_tovarning')}
                        </p>
                    </>
                )
            )}

            {/* ── SMENA SVODI: laboratoriya va diagnostika ──────────────────
                Kun oxirida kassa yopiladi, lekin laborantning kunlik ishi
                hech qayerda ko'rinmasdi. */}
            {view === 'labshift' && (
                extraLoading || !extra.labshift ? (
                    <p className="text-sm text-faint py-16 text-center">{t('finance.report.calculating')}</p>
                ) : (
                    <>
                        <p className="text-xs text-faint">
                            {t('ui.sana')}: {extra.labshift.date} {t('financereport.davr_oxiri_boyicha_svod')}
                        </p>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Laboratoriya */}
                            <div className="bg-surface rounded-xl border border-line overflow-hidden">
                                <h3 className="px-4 py-2.5 text-sm font-bold text-ink border-b border-line-soft flex items-center gap-2">
                                    <Package className="w-4 h-4 text-faint" />{t('finance.report.lab')}</h3>
                                <div className="p-4 space-y-2">
                                    <Row label={t('finance.report.order')} value={extra.labshift.lab.total} />
                                    <Row label={t('finance.report.sampleTaken')} value={extra.labshift.lab.collected} tone="ok" />
                                    <Row label={t('finance.report.sampleNotTaken')} value={extra.labshift.lab.notCollected}
                                        tone={extra.labshift.lab.notCollected > 0 ? 'warn' : undefined}
                                        hint={t('financereport.bemor_kelmagan_yoki_unutilgan')} />
                                    {extra.labshift.lab.urgent > 0 && (
                                        <Row label={t('finance.report.urgent')} value={extra.labshift.lab.urgent} />
                                    )}
                                    <Row label={t('financereport.tolanmagan')} value={extra.labshift.lab.unpaidCount}
                                        tone={extra.labshift.lab.unpaidCount > 0 ? 'bad' : undefined}
                                        hint={extra.labshift.lab.unpaidSum > 0 ? `${fmt(extra.labshift.lab.unpaidSum)} UZS` : undefined} />
                                    <Row label={t('finance.report.revenue')} value={fmt(extra.labshift.lab.revenue)} unit="UZS" />
                                    {extra.labshift.lab.avgTurnaroundHours != null && (
                                        <Row label={t('financereport.ortacha_bajarish')} value={extra.labshift.lab.avgTurnaroundHours} unit={t('visit.hours')}
                                            hint="probadan natijagacha" />
                                    )}

                                    {Object.keys(extra.labshift.lab.byStatus || {}).length > 0 && (
                                        <div className="pt-2 mt-2 border-t border-line-soft flex flex-wrap gap-2">
                                            {Object.entries(extra.labshift.lab.byStatus).map(([k, v]: any) => (
                                                <span key={k} className="px-2 py-0.5 rounded text-[11px] bg-elevated text-muted">
                                                    {LAB_STATUS[k] || k}: <b>{v}</b>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {Object.keys(extra.labshift.lab.byTechnician || {}).length > 0 && (
                                        <div className="pt-2 flex flex-wrap gap-2">
                                            {Object.entries(extra.labshift.lab.byTechnician).map(([k, v]: any) => (
                                                <span key={k} className="px-2 py-0.5 rounded text-[11px] bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                                                    {k}: <b>{v}</b>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Diagnostika */}
                            <div className="bg-surface rounded-xl border border-line overflow-hidden">
                                <h3 className="px-4 py-2.5 text-sm font-bold text-ink border-b border-line-soft flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-faint" />{t('finance.report.diagnostics')}</h3>
                                <div className="p-4 space-y-2">
                                    <Row label={t('finance.report.study')} value={extra.labshift.studies.total} />
                                    <Row label={t('financereport.tolanmagan')} value={extra.labshift.studies.unpaidCount}
                                        tone={extra.labshift.studies.unpaidCount > 0 ? 'bad' : undefined}
                                        hint={extra.labshift.studies.unpaidSum > 0 ? `${fmt(extra.labshift.studies.unpaidSum)} UZS` : undefined} />
                                    <Row label={t('finance.report.revenue')} value={fmt(extra.labshift.studies.revenue)} unit="UZS" />

                                    {Object.keys(extra.labshift.studies.byModality || {}).length > 0 && (
                                        <div className="pt-2 mt-2 border-t border-line-soft flex flex-wrap gap-2">
                                            {Object.entries(extra.labshift.studies.byModality).map(([k, v]: any) => (
                                                <span key={k} className="px-2 py-0.5 rounded text-[11px] bg-elevated text-muted">
                                                    {k}: <b>{v}</b>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px] text-faint">
                            {t('financereport.brak_va_qayta_bajarish')}
                        </p>
                    </>
                )
            )}

            {view === 'summary' && (loading ? (
                <p className="text-sm text-faint py-16 text-center">{t('finance.report.calculating')}</p>
            ) : !totals ? null : (
                <>
                    {/* ── UMUMIY: TO'RT RAQAM (2026-11-22, olti maslahatchi) ─────────
                        Ilgari: «Oldingi davrga nisbatan» qatori va ostida yana 5–7
                        plitka — Tushum va Sof foyda 150px ichida ikki marta, «Davr
                        qarzi», «Umumiy qarz», «Shifokor ulushi 0» bir-biriga zid.
                        Endi to'rtta raqam, har birining ostida o'tgan davrga
                        nisbatan o'zgarish. Raqamlar BITTA manbadan — solishtirish
                        javobidagi «joriy» qismdan (o'zgarish ham o'sha yerdan),
                        bo'lmasa umumiy hisobdan. Qarz — pastdagi «Qarzdorlar» da. */}
                    {(() => {
                        const cur = cmp?.current;
                        const pick = (k: string, fallback: number) => (cur && cur[k] != null ? Number(cur[k]) : fallback);
                        const tiles = [
                            { key: 'revenue', label: t('report.services'), value: pick('revenue', totals.revenue), hint: t('report.servicesHint'), goodUp: true, icon: TrendingUp },
                            { key: 'collected', label: t('report.collected'), value: pick('collected', totals.collected), hint: t('report.collectedHint'), goodUp: true, icon: Wallet },
                            { key: 'expense', label: t('ui.xarajat'), value: pick('expense', totals.doctorShare + totals.otherExpenses), hint: t('report.expenseHint'), goodUp: false, icon: TrendingDown },
                            { key: 'profit', label: t('finance.report.netProfit'), value: pick('profit', totals.netProfit), hint: t('report.profitHint'), goodUp: true, icon: Percent },
                        ];
                        return (
                            <div>
                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                    {tiles.map(tl => {
                                        const d = cmp?.delta?.[tl.key];
                                        const tone = !d || d.abs === 0 ? 'flat' : ((d.abs > 0) === tl.goodUp ? 'good' : 'bad');
                                        const negative = tl.key === 'profit' && tl.value < 0;
                                        return (
                                            <div key={tl.key} className="bg-surface rounded-xl border border-line p-4">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <tl.icon className="w-4 h-4 text-faint" />
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tl.label}</p>
                                                </div>
                                                <p className={`text-xl font-bold tabular-nums ${negative ? 'text-red-600 dark:text-red-400' : tl.key === 'profit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink'}`}>
                                                    {fmt(tl.value)}<span className="text-xs font-normal text-faint ml-1">UZS</span>
                                                </p>
                                                {d && (
                                                    <p className={`text-[12px] font-semibold tabular-nums ${tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-faint'}`}>
                                                        {/* Foiz faqat oldingi davr MUSBAT bo'lsa: noldan — «yangi»,
                                                            manfiydan (zarardan foydaga) — foiz ma'nosiz, faqat farq */}
                                                        {d.abs > 0 ? '+' : ''}{fmt(d.abs)}{d.pct != null
                                                            ? ` (${d.pct > 0 ? '+' : ''}${d.pct}%)`
                                                            : Number(cmp?.previous?.[tl.key] ?? 0) === 0 && d.abs !== 0 ? ` (${t('report.deltaNew')})` : ''}
                                                    </p>
                                                )}
                                                <p className="text-[11px] text-faint mt-0.5">{tl.hint}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                                {cmp?.previous?.from && (
                                    <p className="mt-2 text-[12px] text-faint">
                                        {fill(t('report.vsPeriod'), fmtDay(cmp.previous.from), fmtDay(cmp.previous.to))}
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    {/* Eski stomatologik laboratoriya xarajati qolgan bo'lsa */}
                    {totals.legacyLabExpense > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-800 dark:text-amber-200">{t('finance.report.old')}<b>{t('financereport.laboratoriya_xarajatlari')}: {fmt(totals.legacyLabExpense)} UZS</b> {t('financereport.topildi_bular_stomatologiya_davridan')} <b>chegirilmadi</b>.
                            </p>
                        </div>
                    )}

                    {/* ── QARZDORLAR — kim, qancha, necha kundan beri ─────────── */}
                    {debtors && debtors.patients.length > 0 && (() => {
                        const buckets = [
                            { label: t('report.age0'), sum: 0 }, { label: t('report.age30'), sum: 0 }, { label: t('report.age60'), sum: 0 },
                        ];
                        for (const p of debtors.patients) {
                            const d = daysSince(p.oldestDate);
                            buckets[d > 60 ? 2 : d > 30 ? 1 : 0].sum += p.due;
                        }
                        const shown = debtorsOpen ? debtors.patients : debtors.patients.slice(0, 5);
                        return (
                            <div className="bg-surface rounded-xl border border-line p-4">
                                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                                        <AlertCircle className="w-4 h-4 text-amber-500" />{fill(t('report.debtorsTitle'), debtors.patients.length)}
                                    </h3>
                                    <span className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">{fmt(debtors.total)} UZS</span>
                                    {/* Qarz yoshi: qaysi qarz qotib qolgani — eski qarz yig'ilishi qiyin */}
                                    <span className="ml-auto flex flex-wrap gap-x-4 text-[12px] text-muted">
                                        {buckets.map((b, i) => (
                                            <span key={i}>{b.label}: <b className={`tabular-nums ${i === 2 && b.sum > 0 ? 'text-red-600 dark:text-red-400' : 'text-ink'}`}>{fmt(b.sum)}</b></span>
                                        ))}
                                    </span>
                                </div>
                                <ul className="divide-y divide-line">
                                    {shown.map(p => {
                                        const d = daysSince(p.oldestDate);
                                        return (
                                            <li key={p.patientId || p.patientName} className="py-2 flex items-center gap-3 text-sm">
                                                {p.patientId
                                                    ? <a href={`#/patients/${p.patientId}`} className="text-ink font-medium hover:underline truncate">{p.patientName}</a>
                                                    : <span className="text-ink font-medium truncate">{p.patientName}</span>}
                                                <span className={`text-[11px] shrink-0 ${d > 60 ? 'text-red-600 dark:text-red-400 font-semibold' : d > 30 ? 'text-amber-600 dark:text-amber-400' : 'text-faint'}`}>
                                                    {d === 0 ? t('card.today') : fill(t('report.daysAgo'), d)}
                                                </span>
                                                {p.phone && (
                                                    <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}
                                                        className="ml-auto text-[12px] text-muted hover:text-ink hover:underline tabular-nums shrink-0">
                                                        {formatUzPhone(p.phone)}
                                                    </a>
                                                )}
                                                <span className={`${p.phone ? '' : 'ml-auto '}tabular-nums font-semibold text-ink shrink-0 w-28 text-right`}>{fmt(p.due)}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {installmentsDue && installmentsDue.month + installmentsDue.overdue > 0 && (
                                    <p className="mt-2 pt-2 border-t border-line text-[12px] text-muted">
                                        {t('report.installmentsMonth')} <b className="text-ink tabular-nums">{fmt(installmentsDue.month)} UZS</b>
                                        {installmentsDue.overdue > 0 && (
                                            <> · {t('report.installmentsOverdue')} <b className="text-red-600 dark:text-red-400 tabular-nums">{fmt(installmentsDue.overdue)} UZS</b></>
                                        )}
                                    </p>
                                )}
                                {debtors.patients.length > 5 && (
                                    <button type="button" onClick={() => setDebtorsOpen(o => !o)}
                                        className="mt-2 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                        {debtorsOpen ? t('pay.queue.hide') : fill(t('pay.queue.showN'), debtors.patients.length - 5)}
                                    </button>
                                )}
                            </div>
                        );
                    })()}

                    {/* Xarajatlar — toifa bo'yicha (bu ma'lumot faqat shu yerda) */}
                    <div className="bg-surface rounded-xl border border-line p-4">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink mb-3">
                                <Wallet className="w-4 h-4 text-faint" />{t('finance.report.expenses')}</h3>
                            {data.expenseByCategory.length === 0 ? (
                                <p className="text-sm text-faint py-6 text-center">{t('finance.report.noExpense')}</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.expenseByCategory.map(e => (
                                        <div key={e.category} className="flex items-center gap-3 text-sm">
                                            {/* Toifa o'zbekcha — ilgari «Rent», «Salary» chiqardi */}
                                            <span className="text-ink">{(EXPENSE_CATEGORY_LABELS as Record<string, string>)[e.category] || e.category}</span>
                                            <span className="ml-auto tabular-nums font-medium text-red-600 dark:text-red-400">{fmt(e.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>

                    {/* ── OYLAR BO'YICHA — bir yil, sukut bo'yicha yopiq ───────── */}
                    <div className="bg-surface rounded-xl border border-line">
                        <button type="button" onClick={() => setMonthsOpen(o => !o)} aria-expanded={monthsOpen}
                            className="w-full flex items-center gap-2 p-4 text-left text-sm font-semibold text-ink">
                            <TrendingUp className="w-4 h-4 text-faint" />
                            <span className="flex-1">{fill(t('report.byMonths'), monthsYear)}</span>
                            <ChevronDown className={`w-4 h-4 text-faint transition-transform ${monthsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                        {monthsOpen && (
                            !monthsData ? (
                                monthsFailed
                                    ? <p role="alert" className="px-4 pb-4 text-sm font-medium text-danger">{t('financereport.hisobot_yuklanmadi')}</p>
                                    : <p className="px-4 pb-4 text-sm text-faint">{t('finance.report.calculating')}</p>
                            ) : (
                                <div className="overflow-x-auto border-t border-line">
                                    <table className="w-full min-w-[560px]">
                                        <thead className="bg-canvas/40 border-b border-line">
                                            <tr>
                                                <Th>{t('report.month')}</Th>
                                                <Th right>{t('report.services')}</Th>
                                                <Th right>{t('report.collected')}</Th>
                                                <Th right>{t('ui.xarajat')}</Th>
                                                <Th right>{t('finance.report.netProfit')}</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {monthsData.months.filter(m => m.month <= today().slice(0, 7)).map(m => (
                                                <tr key={m.month}>
                                                    <Td strong>{monthName(m.month)}</Td>
                                                    <Td right>{m.revenue ? fmt(m.revenue) : '—'}</Td>
                                                    <Td right tone={m.collected ? 'ok' : undefined}>{m.collected ? fmt(m.collected) : '—'}</Td>
                                                    <Td right tone={m.expense ? 'bad' : undefined}>{m.expense ? fmt(m.expense) : '—'}</Td>
                                                    <Td right strong tone={m.profit < 0 ? 'bad' : m.profit > 0 ? 'ok' : undefined}>{m.revenue || m.expense ? fmt(m.profit) : '—'}</Td>
                                                </tr>
                                            ))}
                                            <tr className="bg-canvas/40">
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
                    </div>
                </>
            ))}
        </div>
    );
};
