import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    LineChart, Line,
} from 'recharts';
import {
    TrendingUp, TrendingDown, Wallet, AlertCircle, RefreshCw, Users,
    Building2, Package, Percent, X,
} from 'lucide-react';
import { Department } from '../types';
import { api } from '../services/api';

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
const today = () => new Date().toISOString().split('T')[0];

// Bo'limlar diagrammasi uchun ranglar — bo'limning o'z rangi bo'lmasa shulardan
const PALETTE = ['#0E5F55', '#2563EB', '#DC2626', '#7C3AED', '#0891B2', '#D97706', '#DB2777', '#059669'];

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

            {loading ? (
                <p className="text-sm text-gray-400 py-16 text-center">Hisoblanmoqda...</p>
            ) : !t ? null : (
                <>
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
            )}
        </div>
    );
};
