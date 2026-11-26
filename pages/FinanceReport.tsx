import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { EXPENSE_CATEGORY_LABELS } from '../types';
import { api } from '../services/api';
import { useLiveUpdates, LiveEventType } from '../hooks/useLiveUpdates';
import { useLanguage } from '../context/LanguageContext';
import { todayISO, getCurrentMonthRange } from '../utils/dateUtils';
import { exportReportToExcel } from '../utils/reportExport';
import { monthLabel as calMonthLabel } from '../utils/calendarLabels';
import { AttendanceTab } from '../components/AttendanceReport';
import { PeriodBar } from '../components/report/PeriodBar';
import { SummaryView, Summary } from '../components/report/SummaryView';
import { DoctorsView } from '../components/report/DoctorsView';
import { DepartmentsView } from '../components/report/DepartmentsView';
import { WasteView } from '../components/report/WasteView';
import { PatientsView } from '../components/report/PatientsView';
import { ServicesView, DeptFilter } from '../components/report/ServicesView';
import { Calculating } from '../components/report/shared';
import { Department } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   HISOBOT — klinika egasining ekrani: tanlangan davr bo'yicha tahlil.

   DIZAYN (2026-11-26, olti maslahatchi: ega, namoyish, DentaCRM kodi,
   bozor, kodga ta'sir, raqamlar tanqidchisi):
   • Tepada BITTA davr — hamma tab uchun, Davomat ham. Katta sana —
     ekranning sarlavhasi.
   • Tablar — segment ko'rinishida, lekin `role=tab` (klaviatura: ← →).
   • Har tab bir xil bo'laklardan (`components/report/*`): KPI qatori,
     kartochka, jadval. Umumiyni takrorlaydigan plitkalar olib tashlandi.
   • Umumiyda kunma-kun grafik: xizmat va olingan pul.

   Bu fayl — faqat holat: davr, tab, yuklash, eksport, jonli yangilanish.
   ───────────────────────────────────────────────────────────────────────────── */

/* Hisobot raqamlarini o'zgartiradigan hodisalar: to'lov, yangi qabul,
   ombordan chiqim. `data.changed` esa har qanday yozuvda keladi — undan
   faqat pulga tegishli manzillar olinadi. */
const REPORT_EVENTS: LiveEventType[] = ['charge.paid', 'charge.changed', 'visit.created', 'stock.changed', 'data.changed'];
const MONEY_RESOURCES = new Set(['transactions', 'expenses', 'cash-movements', 'cash-register', 'installments', 'inventory', 'appointments']);

type View = 'summary' | 'patients' | 'doctors' | 'departments' | 'services' | 'writeoffs' | 'attendance';
type ExtraView = 'patients' | 'doctors' | 'departments' | 'services' | 'writeoffs';
type ShareMap = Record<string, { paid: number; payable: number }>;

/** Yuklanmadi — sabab tepadagi bannerda; bu yerda qayta urinish */
const Retry: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
    const { t } = useLanguage();
    return (
        <div className="card py-14 text-center">
            <p className="text-sm text-muted mb-3">{t('financereport.hisobot_yuklanmadi')}</p>
            <button type="button" onClick={onRetry}
                className="h-9 px-4 rounded-xl border border-line bg-surface text-sm font-semibold text-ink hover:bg-elevated">
                {t('report.retry')}
            </button>
        </div>
    );
};

const fetchExtra = (view: ExtraView, from: string, to: string) =>
    view === 'patients' ? api.reports.patients(from, to)
        : view === 'doctors' ? api.reports.doctors(from, to)
        : view === 'departments' ? api.reports.departmentsReport(from, to)
        : view === 'services' ? api.reports.services(from, to)
            : api.reports.writeoffs(from, to);

interface Props {
    departments?: Department[];
    /** Qaysi vkladka bilan ochiladi (`/dashboard?tab=davomat` → attendance) */
    initialView?: 'summary' | 'patients' | 'services' | 'attendance';
}

export const FinanceReport: React.FC<Props> = ({ initialView }) => {
    const { t, language } = useLanguage();
    /* Oy boshi MAHALLIY sana bo'yicha (`toISOString()` UTC beradi va
       Toshkentda o'tgan oyning oxirgi kunini ham qo'shib olardi). */
    const [from, setFrom] = useState(getCurrentMonthRange().startDate);
    const [to, setTo] = useState(todayISO());
    const [view, setView] = useState<View>(initialView || 'summary');
    /* Xizmatlar tabidagi bo'lim — Bo'limlar jadvalida bo'lim bosilsa shu yerga tushadi */
    const [svcDept, setSvcDept] = useState<DeptFilter>('all');
    /* Sahifa ochiq turganda `?tab=davomat` havolasi bosilsa ham tab almashsin */
    useEffect(() => { if (initialView) setView(initialView); }, [initialView]);
    const [error, setError] = useState('');
    /* Kech kelgan eski javob yangi davr ustidan yozilmasin */
    const periodKey = `${from}|${to}`;
    const periodRef = useRef(periodKey);
    periodRef.current = periodKey;
    const [retryTick, setRetryTick] = useState(0);

    /* ── Umumiy: hisob va solishtirish ──
       Xatoda eski davr raqamlari yangi sarlavha ostida QOLMAYDI. */
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [cmp, setCmp] = useState<any>(null);
    useEffect(() => {
        let stale = false;
        setLoading(true);
        Promise.all([api.reports.summary(from, to), api.reports.compare(from, to).catch(() => null)])
            .then(([summary, compare]) => { if (!stale) { setData(summary); setCmp(compare); setError(''); } })
            .catch((e: any) => { if (!stale) { setData(null); setCmp(null); setError(e?.message || t('financereport.hisobot_yuklanmadi')); } })
            .finally(() => { if (!stale) setLoading(false); });
        return () => { stale = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, retryTick]);

    /* ── Shifokorlar / Bo'limlar / Ombor isrofi — ochilganda yuklanadi ──
       Kalit davr bilan: davr o'zgarsa eski raqam yangi sarlavha ostida
       turmaydi. Tabga qaytilganda ham qayta so'raladi (kesh ko'rinib turadi):
       yopiq tab jonli yangilanmaydi, boshqa tabda to'lov bo'lgan bo'lishi mumkin. */
    const [extra, setExtra] = useState<Record<string, { key: string; data: any }>>({});
    const [extraFailed, setExtraFailed] = useState('');
    const extraOf = (v: ExtraView) => (extra[v]?.key === periodKey ? extra[v].data : null);
    useEffect(() => {
        if (view === 'summary' || view === 'attendance') return;
        let stale = false;
        setExtraFailed('');
        fetchExtra(view, from, to)
            .then(res => { if (!stale) setExtra(prev => ({ ...prev, [view]: { key: periodKey, data: res } })); })
            .catch((e: any) => {
                if (stale) return;
                if (!extraOf(view)) setExtraFailed(`${view}|${periodKey}`);
                setError(e?.message || t('financereport.hisobot_yuklanmadi'));
            });
        return () => { stale = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, periodKey, retryTick]);
    const failedHere = (v: ExtraView) => extraFailed === `${v}|${periodKey}`;

    /* ULUSH: TO'LANDI VA QOLDIQ. Ulush oyiga bir marta to'lanadi — raqam
       davrning OYLARI bo'yicha Xodimlar → Ulush jadvalidan (bitta manba).
       Umumiyda «to'lanmagan ulush» sifatida, Shifokorlarda ustun bo'lib. */
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
    const loadShares = useCallback(async (): Promise<ShareMap> => {
        const list = await Promise.all(shareMonths.map(p => api.hr.shares(p)));
        const acc: ShareMap = {};
        for (const res of list) for (const r of res?.rows || []) {
            const cur = acc[r.id] || { paid: 0, payable: 0 };
            acc[r.id] = { paid: cur.paid + (r.paid || 0) + (r.paidViaRuns || 0), payable: cur.payable + (r.payable || 0) };
        }
        return acc;
    }, [shareMonths]);
    const sharesKey = shareMonths.join(',');
    const [sharesState, setSharesState] = useState<{ key: string; map: ShareMap } | null>(null);
    const [sharesFailed, setSharesFailed] = useState(false);
    const [sharesTick, setSharesTick] = useState(0);
    const shares = sharesState?.key === sharesKey ? sharesState.map : null;
    useEffect(() => {
        if (view !== 'doctors' && view !== 'summary') return;
        let stale = false;
        setSharesFailed(false);
        loadShares()
            .then(map => { if (!stale) setSharesState({ key: sharesKey, map }); })
            /* Xato «—» (ulush yo'q) bo'lib ko'rinmasin — alohida yoziladi */
            .catch(() => { if (!stale) setSharesFailed(true); });
        return () => { stale = true; };
    }, [view, sharesKey, loadShares, sharesTick]);
    const sharesPayable = shares ? Object.values(shares).reduce((s, x) => s + (x.payable || 0), 0) : null;
    const shareMonthsText = shareMonths.map(p => {
        const [y, m] = p.split('-').map(Number);
        return calMonthLabel(new Date(y, m - 1, 1), language === 'ru' ? 'ru' : 'uz');
    }).join(', ');

    /* Hisobot O'ZI yangilanadi: pulga tegishli narsa o'zgarsa ochiq tab
       jimgina qayta so'raladi — skeleton chiqmaydi, raqamlar joyida
       almashadi. Jim yangilash xato bersa eski raqamlar qoladi. */
    const [attendanceTick, setAttendanceTick] = useState(0);
    const viewRef = useRef(view);
    viewRef.current = view;
    const refreshSilently = useCallback(async () => {
        const v = viewRef.current;
        const asked = `${from}|${to}`;
        if (v === 'attendance') { setAttendanceTick(n => n + 1); return; }
        try {
            if (v === 'summary') {
                const [summary, compare] = await Promise.all([api.reports.summary(from, to), api.reports.compare(from, to).catch(() => null)]);
                if (periodRef.current !== asked) return; // davr almashib ketgan
                setData(summary);
                setCmp(compare);
                setSharesTick(n => n + 1);
                return;
            }
            const res = await fetchExtra(v, from, to);
            setExtra(prev => ({ ...prev, [v]: { key: asked, data: res } }));
            if (v === 'doctors') setSharesTick(n => n + 1);
        } catch {
            /* tarmoq uzilgan bo'lishi mumkin — keyingi hodisada yana uriniladi */
        }
    }, [from, to]);
    useLiveUpdates(REPORT_EVENTS, (payload) => {
        if (payload?.resource && !MONEY_RESOURCES.has(payload.resource)) return;
        /* Yozuv o'zgarishi faqat Davomatga tegishli — pul hisobotini bezovta qilmaydi */
        if (payload?.resource === 'appointments' && viewRef.current !== 'attendance') return;
        refreshSilently();
    });

    /* Eksport HAMMA kesimni oladi, faqat ochiq turganini emas: egasi
       «yuklab olish» deganda butun hisobotni kutadi. */
    const [exporting, setExporting] = useState(false);
    const exportAll = async () => {
        setExporting(true);
        setError('');
        try {
            const year = Number(to.slice(0, 4)) || new Date().getFullYear();
            const [doctors, departmentsRep, servicesRep, writeoffs, compare, labShift, months, debtors, exportShares] = await Promise.all([
                extraOf('doctors') ?? api.reports.doctors(from, to).catch(() => null),
                extraOf('departments') ?? api.reports.departmentsReport(from, to).catch(() => null),
                extraOf('services') ?? api.reports.services(from, to).catch(() => null),
                extraOf('writeoffs') ?? api.reports.writeoffs(from, to).catch(() => null),
                api.reports.compare(from, to).catch(() => cmp),
                api.reports.labShift(to).catch(() => null),
                api.reports.months(year).catch(() => null),
                api.reports.debtors().catch(() => null),
                /* ulush ustunlari soxta nol bo'lib chiqmasin */
                shares ? Promise.resolve(shares) : loadShares().catch(() => null),
            ]);
            exportReportToExcel({
                from, to,
                clinicName: undefined,
                summary: data, doctors, departments: departmentsRep, services: servicesRep, writeoffs, compare, labShift,
                months, debtors, shares: exportShares,
                expenseLabels: EXPENSE_CATEGORY_LABELS as Record<string, string>,
            });
        } catch (e: any) {
            setError(e?.message || t('financereport.eksport_qilinmadi'));
        } finally {
            setExporting(false);
        }
    };

    /* ── Tablar ── */
    const tabs: { id: View; label: string }[] = [
        { id: 'summary', label: t('ui.umumiy_tab') },
        { id: 'patients', label: t('report.tabPatients') },
        { id: 'doctors', label: t('ui.shifokorlar') },
        { id: 'departments', label: t('settings.bolimlar') },
        { id: 'services', label: t('report.tabServices') },
        { id: 'writeoffs', label: t('report.tabWaste') },
        { id: 'attendance', label: t('finance.hub.attendance') },
    ];
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const onTabKey = (e: React.KeyboardEvent, i: number) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = (i + dir + tabs.length) % tabs.length;
        setView(tabs[next].id);
        tabRefs.current[next]?.focus();
    };

    return (
        <div className="space-y-4">
            <PeriodBar from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }}
                onExport={exportAll} exporting={exporting} exportDisabled={loading} />

            <div role="tablist" aria-label={t('nav.reports')} className="inline-flex max-w-full items-center gap-0.5 p-1 rounded-xl bg-elevated/70 overflow-x-auto">
                {tabs.map((tab, i) => {
                    const on = view === tab.id;
                    return (
                        <button key={tab.id} ref={el => { tabRefs.current[i] = el; }} type="button" role="tab"
                            id={`rep-tab-${tab.id}`} aria-selected={on} aria-controls="rep-panel" tabIndex={on ? 0 : -1}
                            onClick={() => setView(tab.id)} onKeyDown={e => onTabKey(e, i)}
                            className={`h-9 px-4 rounded-lg text-sm whitespace-nowrap transition-colors ${on
                                ? 'bg-surface shadow-sm text-ink font-semibold'
                                : 'text-muted hover:text-ink font-medium'}`}>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {error && (
                <div role="alert" className="flex items-start gap-2 p-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-500/30 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-danger-600 dark:text-danger-300 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-ink">{error}</p>
                    <button type="button" onClick={() => setError('')} aria-label={t('common.close')} className="ml-auto text-faint hover:text-ink"><X className="w-4 h-4" /></button>
                </div>
            )}

            <div id="rep-panel" role="tabpanel" aria-labelledby={`rep-tab-${view}`} tabIndex={0} className="outline-none">
                {view === 'summary' && (loading ? <Calculating /> : !data ? <Retry onRetry={() => setRetryTick(n => n + 1)} /> : (
                    <SummaryView data={data} cmp={cmp} from={from} to={to}
                        sharesPayable={sharesPayable} shareMonthsText={shareMonthsText} onOpenDoctors={() => setView('doctors')} />
                ))}
                {view !== 'summary' && view !== 'attendance' && failedHere(view) && !extraOf(view)
                    ? <Retry onRetry={() => setRetryTick(n => n + 1)} />
                    : <>
                        {view === 'doctors' && (
                            <DoctorsView report={extraOf('doctors')} loading={!extraOf('doctors')}
                                shares={shares} sharesFailed={sharesFailed} shareMonthsText={shareMonthsText} />
                        )}
                        {view === 'departments' && (
                            <DepartmentsView report={extraOf('departments')} loading={!extraOf('departments')}
                                onOpenServices={id => { setSvcDept(id || 'none'); setView('services'); }} />
                        )}
                        {view === 'services' && (
                            <ServicesView report={extraOf('services')} loading={!extraOf('services')} dept={svcDept} onDept={setSvcDept} />
                        )}
                        {view === 'patients' && <PatientsView report={extraOf('patients')} loading={!extraOf('patients')} />}
                        {view === 'writeoffs' && <WasteView report={extraOf('writeoffs')} loading={!extraOf('writeoffs')} />}
                    </>}
                {view === 'attendance' && <AttendanceTab from={from} to={to} refreshKey={attendanceTick} />}
            </div>
        </div>
    );
};
