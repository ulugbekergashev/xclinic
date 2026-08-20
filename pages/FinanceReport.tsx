import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { todayISO } from '../utils/dateUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    LineChart, Line,
} from 'recharts';
import {
    TrendingUp, TrendingDown, Wallet, AlertCircle, RefreshCw, Users,
    Building2, Package, Percent, X, Activity, Download,
} from 'lucide-react';
import { Department } from '../types';
import { api } from '../services/api';
import { exportReportToExcel } from '../utils/reportExport';

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
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; };
const today = () => todayISO();

// Bo'limlar diagrammasi uchun ranglar — bo'limning o'z rangi bo'lmasa shulardan
const PALETTE = ['#0E5F55', '#2563EB', '#DC2626', '#7C3AED', '#0891B2', '#D97706', '#DB2777', '#059669'];


/** Svod qatori — bitta o'lchov, izohi bilan */
const LAB_STATUS: Record<string, string> = {
    Ordered: 'Buyurtma berildi', Collected: 'Proba olindi',
    InProgress: 'Bajarilmoqda', Completed: 'Tayyor', Cancelled: 'Bekor qilindi',
};

const Row: React.FC<{
    label: string; value: React.ReactNode; unit?: string; hint?: string;
    tone?: 'ok' | 'bad' | 'warn';
}> = ({ label, value, unit, hint, tone }) => (
    <div className="flex items-baseline gap-2 text-sm">
        <span className="text-gray-600 dark:text-gray-300">{label}</span>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
        <span className={`ml-auto font-semibold tabular-nums ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'bad' ? 'text-red-600 dark:text-red-400'
                : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-900 dark:text-white'}`}>
            {value}{unit ? <span className="text-[11px] font-normal text-gray-400 ml-1">{unit}</span> : null}
        </span>
    </div>
);

export const FinanceReport: React.FC<Props> = ({ departments = [], embedded }) => {
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
        } catch (e: any) { setError(e.message || 'Hisobot yuklanmadi'); }
        finally { setLoading(false); }
    }, [from, to]);

    useEffect(() => { load(); }, [load]);

    const colorOf = (name: string, i: number) =>
        departments.find(d => d.name === name)?.color || PALETTE[i % PALETTE.length];

    const t = data?.totals;

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
    const [view, setView] = useState<'summary' | 'doctors' | 'departments' | 'writeoffs' | 'labshift'>('summary');

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
        if (view === 'summary') return;
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
            setError(e?.message || 'Hisobot yuklanmadi');
        } finally {
            setExtraLoading(false);
        }
    }, [view, from, to]);

    useEffect(() => { loadExtra(); }, [loadExtra]);

    /** Jadval sarlavhasi — uch hisobotda bir xil ko'rinish */
    const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
        <th className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${right ? 'text-right' : 'text-left'}`}>
            {children}
        </th>
    );
    const Td: React.FC<{ children: React.ReactNode; right?: boolean; strong?: boolean; tone?: 'ok' | 'bad' }> =
        ({ children, right, strong, tone }) => (
            <td className={`px-3 py-2 text-sm ${right ? 'text-right tabular-nums' : ''} ${strong ? 'font-semibold' : ''} ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
                : tone === 'bad' ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-900 dark:text-white'}`}>
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
            exportReportToExcel({
                from, to,
                clinicName: departments?.clinicName || undefined,
                summary: data, doctors, departments, writeoffs, compare, labShift,
            });
        } catch (e: any) {
            setError(e?.message || 'Eksport qilinmadi');
        } finally {
            setExporting(false);
        }
    };

    const inputCls = 'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500';

    const Tile: React.FC<{
        label: string; value: string; unit?: string; hint?: string;
        icon: React.ElementType; tone?: 'ok' | 'bad' | 'warn';
    }> = ({ label, value, unit, hint, icon: Icon, tone }) => (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`w-4 h-4 ${tone === 'ok' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : tone === 'warn' ? 'text-amber-500' : 'text-gray-400'}`} />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
            </div>
            <p className={`text-xl font-bold tabular-nums ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {value}{unit && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}
            </p>
            {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Davr */}
            <div className="flex flex-wrap items-end gap-3">
                {!embedded && <h2 className="text-xl font-bold text-gray-900 dark:text-white mr-auto">Hisobot</h2>}
                <div className={embedded ? 'mr-auto flex items-end gap-3' : 'flex items-end gap-3'}>
                    <div>
                        <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Boshlanish</label>
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Tugash</label>
                        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                    </div>
                </div>
                <button onClick={exportAll} disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:border-primary-400 disabled:opacity-50"
                    title="Barcha kesimlar bitta faylda">
                    <Download className="w-4 h-4" /> {exporting ? '...' : 'Excel'}
                </button>
                <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Yangilash">
                    <RefreshCw className="w-5 h-5" />
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
            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                {([
                    ['summary', 'Umumiy'],
                    ['doctors', 'Shifokorlar'],
                    ['departments', "Bo'limlar"],
                    ['writeoffs', 'Chiqimlar'],
                    ['labshift', 'Smena svodi'],
                ] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setView(k)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${view === k
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── SHIFOKORLAR ───────────────────────────────────────────────── */}
            {view === 'doctors' && (
                extraLoading || !extra.doctors ? (
                    <p className="text-sm text-gray-400 py-16 text-center">Hisoblanmoqda...</p>
                ) : (extra.doctors.doctors || []).length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <Users className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-gray-500 dark:text-gray-400">Bu davrda yozuv yo'q</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Tile label="Yozilgan" value={fmt(extra.doctors.totals.revenue)} unit="UZS" icon={TrendingUp} />
                            <Tile label="To'langan" value={fmt(extra.doctors.totals.paid)} unit="UZS" icon={Wallet} tone="ok" />
                            <Tile label="Qarz" value={fmt(extra.doctors.totals.due)} unit="UZS" icon={AlertCircle} tone="bad" />
                            <Tile label="Hisoblangan ulush" value={fmt(extra.doctors.totals.accrued)} unit="UZS"
                                icon={Percent} hint="to'langan pul bo'yicha" />
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px]">
                                    <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                                        <tr>
                                            <Th>Shifokor</Th>
                                            <Th right>Yozilgan</Th>
                                            <Th right>To'langan</Th>
                                            <Th right>Qarz</Th>
                                            <Th right>Bemor</Th>
                                            <Th right>O'rtacha chek</Th>
                                            <Th right>Ulush</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {extra.doctors.doctors.map((d: any) => (
                                            <tr key={d.doctorId || d.name}>
                                                <Td strong>{d.name}</Td>
                                                <Td right>{fmt(d.revenue)}</Td>
                                                <Td right tone="ok">{fmt(d.paid)}</Td>
                                                <Td right tone={d.due > 0 ? 'bad' : undefined}>{d.due > 0 ? fmt(d.due) : '—'}</Td>
                                                <Td right>{d.patientCount}</Td>
                                                <Td right>{fmt(d.avgCheck)}</Td>
                                                <Td right strong>{fmt(d.accrued)}</Td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-700">
                                Ulush TO'LANGAN pul bo'yicha hisoblanadi: qarzga yozilgan ish uchun pul
                                hali kirmagan. Qaytarishlar ulushni kamaytiradi. Vedomostdagi raqam
                                aynan shu.
                            </p>
                        </div>
                    </>
                )
            )}

            {/* ── BO'LIMLAR ─────────────────────────────────────────────────── */}
            {view === 'departments' && (
                extraLoading || !extra.departments ? (
                    <p className="text-sm text-gray-400 py-16 text-center">Hisoblanmoqda...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <Tile label="Daromad" value={fmt(extra.departments.totals.revenue)} unit="UZS" icon={TrendingUp} />
                            <Tile label="Xarajat" value={fmt(extra.departments.totals.expense)} unit="UZS" icon={TrendingDown} tone="bad" />
                            <Tile label="Foyda" value={fmt(extra.departments.totals.profit)} unit="UZS" icon={Wallet}
                                tone={extra.departments.totals.profit >= 0 ? 'ok' : 'bad'} />
                            <Tile label="Koyka bandligi"
                                value={extra.departments.totals.occupancy != null ? `${extra.departments.totals.occupancy}` : '—'}
                                unit={extra.departments.totals.occupancy != null ? '%' : undefined}
                                icon={Building2}
                                hint={`${extra.departments.totals.bedDays} koyka-kun / ${extra.departments.totals.bedCount} koyka`} />
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px]">
                                    <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
                                        <tr>
                                            <Th>Bo'lim</Th>
                                            <Th right>Daromad</Th>
                                            <Th right>To'langan</Th>
                                            <Th right>Xarajat</Th>
                                            <Th right>Foyda</Th>
                                            <Th right>Koyka-kun</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {(extra.departments.departments || []).map((d: any, i: number) => (
                                            <tr key={d.departmentId || `none-${i}`}>
                                                <Td>
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full shrink-0"
                                                            style={{ backgroundColor: d.color || colorOf(d.name, i) }} />
                                                        {d.name}
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
                            <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-700">
                                "Bo'limsiz" — bo'limi ko'rsatilmagan xarajat va yozuvlar. Ularni
                                bo'limlarga majburan taqsimlamaymiz: taqsimlash qoidasini klinika
                                o'zi belgilaydi, aks holda raqam soxta aniq bo'lib qoladi.
                            </p>
                        </div>
                    </>
                )
            )}

            {/* ── CHIQIMLAR ─────────────────────────────────────────────────── */}
            {view === 'writeoffs' && (
                extraLoading || !extra.writeoffs ? (
                    <p className="text-sm text-gray-400 py-16 text-center">Hisoblanmoqda...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                            <Tile label="Behuda ketgan" value={fmt(extra.writeoffs.wasteCost)} unit="UZS"
                                icon={TrendingDown} tone="bad" hint="muddati o'tgan, buzilgan, kam chiqqan" />
                            <Tile label="Xizmatga ishlatilgan" value={fmt(extra.writeoffs.serviceCost)} unit="UZS"
                                icon={Package} hint="bu yo'qotish emas — daromad keltirgan" />
                            <Tile label="Jami chiqim" value={fmt(extra.writeoffs.totalCost)} unit="UZS" icon={Package}
                                hint={`${extra.writeoffs.movementCount} harakat`} />
                        </div>

                        {(extra.writeoffs.byReason || []).length === 0 ? (
                            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                <Package className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                                <p className="text-gray-500 dark:text-gray-400">Bu davrda chiqim yo'q</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <h3 className="px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700">
                                        Sabab bo'yicha
                                    </h3>
                                    <table className="w-full">
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {extra.writeoffs.byReason.map((r: any) => (
                                                <tr key={r.reason}>
                                                    <Td>{r.label}</Td>
                                                    <Td right>{r.count} ta</Td>
                                                    <Td right strong tone={r.reason === 'Service' ? undefined : 'bad'}>
                                                        {fmt(r.cost)}
                                                    </Td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <h3 className="px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700">
                                        Pozitsiya bo'yicha
                                    </h3>
                                    <div className="max-h-80 overflow-y-auto">
                                        <table className="w-full">
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                {extra.writeoffs.byItem.map((it: any) => (
                                                    <tr key={it.itemId}>
                                                        <Td>{it.name}</Td>
                                                        <Td right>{it.qty} {it.unit || ''}</Td>
                                                        <Td right strong>{fmt(it.cost)}</Td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        <p className="text-[11px] text-gray-400">
                            Summalar TANNARXDA: yo'qolgan tovarning qiymati — uni sotib olishga
                            ketgan pul, sotish narxi emas.
                        </p>
                    </>
                )
            )}

            {/* ── SMENA SVODI: laboratoriya va diagnostika ──────────────────
                Kun oxirida kassa yopiladi, lekin laborantning kunlik ishi
                hech qayerda ko'rinmasdi. */}
            {view === 'labshift' && (
                extraLoading || !extra.labshift ? (
                    <p className="text-sm text-gray-400 py-16 text-center">Hisoblanmoqda...</p>
                ) : (
                    <>
                        <p className="text-xs text-gray-400">
                            Sana: {extra.labshift.date} (davr oxiri bo'yicha). Svod bir kunlik.
                        </p>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Laboratoriya */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <h3 className="px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-gray-400" /> Laboratoriya
                                </h3>
                                <div className="p-4 space-y-2">
                                    <Row label="Buyurtma" value={extra.labshift.lab.total} />
                                    <Row label="Proba olindi" value={extra.labshift.lab.collected} tone="ok" />
                                    <Row label="Proba olinmadi" value={extra.labshift.lab.notCollected}
                                        tone={extra.labshift.lab.notCollected > 0 ? 'warn' : undefined}
                                        hint="bemor kelmagan yoki unutilgan" />
                                    {extra.labshift.lab.urgent > 0 && (
                                        <Row label="Shoshilinch" value={extra.labshift.lab.urgent} />
                                    )}
                                    <Row label="To'lanmagan" value={extra.labshift.lab.unpaidCount}
                                        tone={extra.labshift.lab.unpaidCount > 0 ? 'bad' : undefined}
                                        hint={extra.labshift.lab.unpaidSum > 0 ? `${fmt(extra.labshift.lab.unpaidSum)} UZS` : undefined} />
                                    <Row label="Tushum" value={fmt(extra.labshift.lab.revenue)} unit="UZS" />
                                    {extra.labshift.lab.avgTurnaroundHours != null && (
                                        <Row label="O'rtacha bajarish" value={extra.labshift.lab.avgTurnaroundHours} unit="soat"
                                            hint="probadan natijagacha" />
                                    )}

                                    {Object.keys(extra.labshift.lab.byStatus || {}).length > 0 && (
                                        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
                                            {Object.entries(extra.labshift.lab.byStatus).map(([k, v]: any) => (
                                                <span key={k} className="px-2 py-0.5 rounded text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
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
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <h3 className="px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-gray-400" /> Diagnostika
                                </h3>
                                <div className="p-4 space-y-2">
                                    <Row label="Tekshiruv" value={extra.labshift.studies.total} />
                                    <Row label="To'lanmagan" value={extra.labshift.studies.unpaidCount}
                                        tone={extra.labshift.studies.unpaidCount > 0 ? 'bad' : undefined}
                                        hint={extra.labshift.studies.unpaidSum > 0 ? `${fmt(extra.labshift.studies.unpaidSum)} UZS` : undefined} />
                                    <Row label="Tushum" value={fmt(extra.labshift.studies.revenue)} unit="UZS" />

                                    {Object.keys(extra.labshift.studies.byModality || {}).length > 0 && (
                                        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
                                            {Object.entries(extra.labshift.studies.byModality).map(([k, v]: any) => (
                                                <span key={k} className="px-2 py-0.5 rounded text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                    {k}: <b>{v}</b>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px] text-gray-400">
                            Brak va qayta bajarish hisobga OLINMAYDI: tizimda bunday tushuncha yo'q.
                            Uni qo'shish alohida qaror — probani bekor qilish sababi kerak bo'ladi.
                        </p>
                    </>
                )
            )}

            {view === 'summary' && (loading ? (
                <p className="text-sm text-gray-400 py-16 text-center">Hisoblanmoqda...</p>
            ) : !t ? null : (
                <>
                    {/* ── Oldingi davr bilan solishtirish ────────────────────
                        "Shu oy 40 mln" o'zi hech narsa aytmaydi: ko'pmi,
                        kammi? Javob oldingi shu uzunlikdagi davr yonida
                        turganda paydo bo'ladi. */}
                    {cmp && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                            <div className="flex flex-wrap items-baseline gap-2 mb-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Oldingi davrga nisbatan
                                </p>
                                <span className="text-[11px] text-gray-400">
                                    {cmp.previous.from} — {cmp.previous.to} ({cmp.previous.days} kun)
                                </span>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                                {([
                                    ['revenue', 'Tushum', true],
                                    ['collected', 'Olingan pul', true],
                                    ['expense', 'Xarajat', true],
                                    ['profit', 'Foyda', true],
                                    ['visits', 'Qabullar', false],
                                    ['avgCheck', "O'rtacha chek", true],
                                ] as const).map(([key, label, money]) => {
                                    const d = cmp.delta[key];
                                    const cur = cmp.current[key];
                                    const up = d.abs > 0;
                                    /* Xarajat o'sishi YAXSHI emas — rangni ma'noga
                                       qarab tanlaymiz, o'sish belgisiga emas. */
                                    const goodWhenUp = key !== 'expense';
                                    const tone = d.abs === 0 ? 'flat' : (up === goodWhenUp ? 'good' : 'bad');
                                    return (
                                        <div key={key}>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
                                            <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                                                {money ? fmt(cur) : cur}
                                            </p>
                                            <p className={`text-[11px] tabular-nums ${tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
                                                : tone === 'bad' ? 'text-red-600 dark:text-red-400'
                                                    : 'text-gray-400'}`}>
                                                {d.abs > 0 ? '+' : ''}{money ? fmt(d.abs) : d.abs}
                                                {d.pct != null
                                                    ? ` (${d.pct > 0 ? '+' : ''}${d.pct}%)`
                                                    /* Oldingi davr nol bo'lsa foiz yo'q:
                                                       "cheksiz o'sish" ma'nosiz raqam */
                                                    : (cur > 0 ? ' (yangi)' : '')}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Asosiy raqamlar */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                        <Tile label="Tushum" value={fmt(t.revenue)} unit="UZS" icon={TrendingUp}
                            hint={`olindi: ${fmt(t.collected)}`} />
                        <Tile label="Qarz" value={fmt(t.due)} unit="UZS" icon={AlertCircle}
                            tone={t.due > 0 ? 'warn' : undefined} hint="to'lanmagan" />
                        <Tile label="Material" value={fmt(t.materialCost)} unit="UZS" icon={Package}
                            hint="retsept bo'yicha" />
                        <Tile label="Yalpi foyda" value={fmt(t.grossProfit)} unit="UZS" icon={Percent}
                            hint="tushum − material" />
                        <Tile label="Shifokor ulushi" value={fmt(t.doctorShare)} unit="UZS" icon={Users} />
                        <Tile label="Sof foyda" value={fmt(t.netProfit)} unit="UZS"
                            icon={t.netProfit >= 0 ? TrendingUp : TrendingDown}
                            tone={t.netProfit >= 0 ? 'ok' : 'bad'}
                            hint="barcha xarajatlardan keyin" />
                    </div>

                    {/* Eski stomatologik laboratoriya xarajati qolgan bo'lsa */}
                    {t.legacyLabExpense > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                Eski <b>«Laboratoriya» xarajatlari: {fmt(t.legacyLabExpense)} UZS</b> topildi.
                                Bular stomatologiya davridan qolgan — o'sha paytda protez tashqi laboratoriyaga
                                buyurtma qilinardi. Endi laboratoriya o'z bo'limimiz va daromad keltiradi,
                                shuning uchun bu summa sof foydadan <b>chegirilmadi</b>.
                            </p>
                        </div>
                    )}

                    {/* Bo'limlar — asosiy kesim */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-4">
                            <Building2 className="w-4 h-4 text-gray-400" /> Bo'limlar bo'yicha
                        </h3>

                        {data.byDepartment.length === 0 ? (
                            <p className="text-sm text-gray-400 py-8 text-center">Bu davrda tushum yo'q</p>
                        ) : (
                            <>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={deptChart} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                                            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8"
                                                tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v)} />
                                            <Tooltip formatter={(v: any) => `${fmt(Number(v))} UZS`}
                                                contentStyle={{ background: 'rgba(17,24,39,.95)', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' }} />
                                            <Legend wrapperStyle={{ fontSize: 12 }} />
                                            {/* Rang seriya bo'yicha: yashil — daromad, qizil — tannarx.
                                                Bo'lim rangi quyidagi jadvaldagi nuqtada ko'rsatiladi. */}
                                            <Bar dataKey="Daromad" fill="#10B981" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Tannarx" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="overflow-x-auto mt-4">
                                    <table className="w-full text-sm min-w-[620px]">
                                        <thead>
                                            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                <th className="pb-2 pr-3 font-semibold">Bo'lim</th>
                                                <th className="pb-2 pr-3 font-semibold text-right">Tushum</th>
                                                <th className="pb-2 pr-3 font-semibold text-right">Olindi</th>
                                                <th className="pb-2 pr-3 font-semibold text-right">Qarz</th>
                                                <th className="pb-2 pr-3 font-semibold text-right">Material</th>
                                                <th className="pb-2 pr-3 font-semibold text-right">Marja</th>
                                                <th className="pb-2 font-semibold text-right">Xizmat</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                            {data.byDepartment.map((d, i) => (
                                                <tr key={d.departmentId || 'none'}>
                                                    <td className="py-2 pr-3">
                                                        <span className="inline-flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorOf(d.name, i) }} />
                                                            <span className="text-gray-900 dark:text-white">{d.name}</span>
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pr-3 text-right tabular-nums text-gray-900 dark:text-white">{fmt(d.revenue)}</td>
                                                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(d.collected)}</td>
                                                    <td className="py-2 pr-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{d.due ? fmt(d.due) : '—'}</td>
                                                    <td className="py-2 pr-3 text-right tabular-nums text-gray-500">{d.cost ? fmt(d.cost) : '—'}</td>
                                                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-gray-900 dark:text-white">
                                                        {fmt(d.margin)}
                                                        {d.cost > 0 && <span className="text-[11px] text-gray-400 ml-1">{d.marginPercent}%</span>}
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums text-gray-500">{d.count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[11px] text-gray-400 mt-2">
                                    Material — xizmat retsepti bo'yicha hisoblangan tannarx. Retsept yozilmagan
                                    xizmatlarda u nol bo'lib ko'rinadi.
                                </p>
                            </>
                        )}
                    </div>

                    {/* Manba va kunlik oqim */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Tushum manbasi</h3>
                            {data.bySource.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">Ma'lumot yo'q</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {data.bySource.map((s, i) => {
                                        const pct = t.revenue > 0 ? (s.revenue / t.revenue) * 100 : 0;
                                        return (
                                            <div key={s.source}>
                                                <div className="flex items-baseline gap-2 text-sm">
                                                    <span className="text-gray-900 dark:text-white">{s.label}</span>
                                                    <span className="text-[11px] text-gray-400">{s.count} ta</span>
                                                    <span className="ml-auto tabular-nums font-medium text-gray-900 dark:text-white">{fmt(s.revenue)}</span>
                                                    <span className="text-[11px] text-gray-400 w-9 text-right">{Math.round(pct)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Kunlik oqim</h3>
                            {data.daily.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">Ma'lumot yo'q</p>
                            ) : (
                                <div className="h-52 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={data.daily} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                                            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8"
                                                tickFormatter={(d) => String(d).slice(5)} />
                                            <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8"
                                                tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v)} />
                                            <Tooltip formatter={(v: any) => `${fmt(Number(v))} UZS`}
                                                contentStyle={{ background: 'rgba(17,24,39,.95)', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' }} />
                                            <Line type="monotone" dataKey="revenue" name="Tushum" stroke="#0E5F55" strokeWidth={2} dot={false} />
                                            <Line type="monotone" dataKey="collected" name="Olingan" stroke="#2563EB" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Shifokorlar va xarajatlar */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                <Users className="w-4 h-4 text-gray-400" /> Shifokorlar bo'yicha
                            </h3>
                            {data.byDoctor.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">Ma'lumot yo'q</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.byDoctor.slice(0, 10).map(d => (
                                        <div key={d.doctorName} className="flex items-center gap-3 text-sm">
                                            <span className="text-gray-900 dark:text-white truncate">{d.doctorName}</span>
                                            <span className="text-[11px] text-gray-400 shrink-0">{d.count} ta</span>
                                            <span className="ml-auto tabular-nums font-medium text-gray-900 dark:text-white shrink-0">{fmt(d.revenue)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                <Wallet className="w-4 h-4 text-gray-400" /> Xarajatlar
                            </h3>
                            {data.expenseByCategory.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">Xarajat yo'q</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.expenseByCategory.map(e => (
                                        <div key={e.category} className="flex items-center gap-3 text-sm">
                                            <span className="text-gray-900 dark:text-white">{e.category}</span>
                                            <span className="ml-auto tabular-nums font-medium text-red-600 dark:text-red-400">{fmt(e.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ))}
        </div>
    );
};
