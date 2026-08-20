import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FlaskConical, Plus, Search, Clock, CheckCircle, X, Trash2,
    AlertCircle, Beaker, Printer, ArrowUp, ArrowDown, Minus, Settings2,
} from 'lucide-react';
import { LabOrder, LabTest, LabOrderItem, LabResultRow, Patient, Department, Clinic } from '../types';
import { api } from '../services/api';
import { printLabResult } from '../utils/printForms';

/* ─────────────────────────────────────────────────────────────────────────────
   Laboratoriya — tahlillar.

   denta7 da bu sahifa stomatologik protez buyurtmalari edi (koronka, veneer,
   metallkeramika). Endi klinik laboratoriya: yo'llanma → namuna → natija.

   Eng muhim jihati: norma bemorning jinsi va yoshiga bog'liq. Normani server
   tanlaydi va bahoni (norma/yuqori/past) o'sha yerda hisoblab saqlaydi —
   shunda norma keyin o'zgarsa ham eski natija o'z bahosini yo'qotmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    Ordered: { label: "Yo'llandi", color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
    Collected: { label: 'Namuna olindi', color: 'bg-primary-100 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-400', icon: Beaker },
    InProgress: { label: 'Bajarilmoqda', color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400', icon: FlaskConical },
    Completed: { label: 'Tayyor', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle },
    Cancelled: { label: 'Bekor qilindi', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400', icon: X },
};

const FLAG_UI: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
    High: { label: 'Yuqori', cls: 'text-red-600 dark:text-red-400', Icon: ArrowUp },
    Low: { label: 'Past', cls: 'text-blue-600 dark:text-blue-400', Icon: ArrowDown },
    Normal: { label: 'Norma', cls: 'text-gray-400 dark:text-gray-500', Icon: Minus },
};

interface Props {
    clinicId: string;
    labOrders: LabOrder[];
    setLabOrders: (orders: LabOrder[]) => void;
    doctors: any[];
    patients?: Patient[];
    departments?: Department[];
    onExpensesChanged?: () => void;
    defaultDoctorName?: string;
    currentUserName?: string;
    /** Bosma blank shapkasi uchun: nom, litsenziya, manzil */
    currentClinic?: Clinic | null;
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(n);
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('uz-UZ') : '—';

/** Norma matni: "120–150" yoki matnli norma */
const refText = (p: LabResultRow) => {
    if (p.refText) return p.refText;
    if (p.refLow != null && p.refHigh != null) return `${p.refLow}–${p.refHigh}`;
    if (p.refHigh != null) return `< ${p.refHigh}`;
    if (p.refLow != null) return `> ${p.refLow}`;
    return '—';
};

export const LabOrders: React.FC<Props> = ({
    clinicId, labOrders, setLabOrders, doctors, patients = [],
    onExpensesChanged, defaultDoctorName, currentUserName, currentClinic,
}) => {
    const [tests, setTests] = useState<LabTest[]>([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [showNew, setShowNew] = useState(false);
    const [resultsOrder, setResultsOrder] = useState<(LabOrder & { items: LabOrderItem[]; patientSex?: string | null; patientAge?: number | null }) | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Yangi yo'llanma formasi
    const [form, setForm] = useState({ patientId: '', patientName: '', doctorName: defaultDoctorName || '', testIds: [] as string[], priority: 'Normal' });

    useEffect(() => { api.labTests.getAll().then(setTests).catch(console.error); }, []);

    const reload = useCallback(async () => {
        try { setLabOrders(await api.labOrders.getAll(clinicId)); } catch (e) { console.error(e); }
    }, [clinicId, setLabOrders]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return labOrders.filter(o =>
            (filterStatus === 'all' || o.status === filterStatus) &&
            (!q || o.patientName?.toLowerCase().includes(q) || o.doctorName?.toLowerCase().includes(q))
        );
    }, [labOrders, search, filterStatus]);

    const activeTests = useMemo(() => tests.filter(t => t.isActive), [tests]);
    const selectedTotal = useMemo(
        () => activeTests.filter(t => form.testIds.includes(t.id)).reduce((s, t) => s + t.price, 0),
        [activeTests, form.testIds],
    );

    // ── Yo'llanma yaratish ──────────────────────────────────────────────────
    const createOrder = async () => {
        if (!form.patientName.trim() || form.testIds.length === 0) {
            setError("Bemor va kamida bitta tahlil tanlanishi kerak");
            return;
        }
        setSaving(true); setError('');
        try {
            await api.labOrders.create({
                patientId: form.patientId || undefined,
                patientName: form.patientName.trim(),
                doctorName: form.doctorName,
                testIds: form.testIds,
                priority: form.priority,
            });
            await reload();
            setShowNew(false);
            setForm({ patientId: '', patientName: '', doctorName: defaultDoctorName || '', testIds: [], priority: 'Normal' });
        } catch (e: any) {
            setError(e.message || 'Yo\'llanma yaratilmadi');
        } finally { setSaving(false); }
    };

    // ── Natijalar ───────────────────────────────────────────────────────────
    const openResults = async (order: LabOrder) => {
        setError('');
        try {
            const full = await api.labResults.get(order.id);
            setResultsOrder(full);
            const d: Record<string, string> = {};
            full.items.forEach(item => (item.parameters || []).forEach(p => {
                d[`${item.id}:${p.parameterId}`] = p.value || '';
            }));
            setDraft(d);
        } catch (e: any) { setError(e.message || 'Natijalarni ochib bo\'lmadi'); }
    };

    const saveResults = async () => {
        if (!resultsOrder) return;
        setSaving(true); setError('');
        try {
            const payload = Object.entries(draft)
                .filter(([, v]) => String(v ?? '').trim() !== '')
                .map(([key, value]) => {
                    const [orderItemId, parameterId] = key.split(':');
                    return { orderItemId, parameterId, value: String(value) };
                });
            await api.labResults.save(resultsOrder.id, payload, currentUserName);
            await openResults(resultsOrder);   // bahoni server hisoblagan holda qaytadan olamiz
            await reload();
            onExpensesChanged?.();
        } catch (e: any) {
            setError(e.message || 'Saqlanmadi');
        } finally { setSaving(false); }
    };

    const removeOrder = async (id: string) => {
        if (!confirm("Yo'llanma va uning natijalari o'chiriladi. Davom etasizmi?")) return;
        try { await api.labOrders.delete(id); await reload(); onExpensesChanged?.(); }
        catch (e: any) { setError(e.message || 'O\'chirilmadi'); }
    };

    /* Ilgari bu `window.print()` edi — ya'ni DASTUR OYNASI bosilardi:
       yon menyu, tugmalar, filtrlar bilan. Bemorga beriladigan hujjat esa
       alohida blank bo'lishi kerak: klinika shapkasi, litsenziya, normalar
       va imzo joyi (GAP-ANALYSIS B26). */
    const printResults = () => {
        if (!resultsOrder) return;
        const patient = patients.find(p => p.id === resultsOrder.patientId);
        const opened = printLabResult(
            { ...resultsOrder, patient },
            currentClinic || undefined,
        );
        if (!opened) setError("Bosma oyna bloklandi — brauzer sozlamalarini tekshiring");
    };

    const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

    return (
        <div className="space-y-5">
            {/* Sarlavha */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <FlaskConical className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Laboratoriya</h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} ta yo'llanma</span>
                </div>
                {/* Yo'llanmalar odatda shifokordan keladi (Qabul → Tahlilga yuborish).
                    Bu tugma faqat to'g'ridan-to'g'ri kelgan bemor uchun. */}
                <button onClick={() => setShowNew(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Plus className="w-4 h-4" /> Tashqi yo'llanma
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
            )}

            {activeTests.length === 0 && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <Settings2 className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">Tahlillar katalogi bo'sh</p>
                        <p className="mt-0.5 opacity-90">Yo'llanma yaratishdan oldin tahlillarni qo'shing (Sozlamalar → Laboratoriya).</p>
                    </div>
                </div>
            )}

            {/* Filtrlar */}
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Bemor yoki shifokor..." className={`${inputCls} pl-9`} />
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`${inputCls} max-w-[200px]`}>
                    <option value="all">Barcha holatlar</option>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
            </div>

            {/* Yo'llanmalar */}
            {filtered.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <FlaskConical className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">Yo'llanmalar yo'q</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {filtered.map(order => {
                        const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.Ordered;
                        const StIcon = st.icon;
                        return (
                            <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                                <div className="flex flex-wrap items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{order.patientName}</h3>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                                                <StIcon className="w-3 h-3" /> {st.label}
                                            </span>
                                            {order.priority === 'Urgent' && (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Shoshilinch</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {(order.items || []).map(i => i.testName).join(', ') || '—'}
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            {order.doctorName || 'Shifokor ko\'rsatilmagan'} · {fmtDate(order.orderedAt)}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(order.totalPrice || 0)} so'm</p>
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => openResults(order)}
                                                className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                                Natijalar
                                            </button>
                                            <button onClick={() => removeOrder(order.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg" title="O'chirish">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Yangi yo'llanma ───────────────────────────────────────────── */}
            {showNew && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Yangi yo'llanma</h3>
                            <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bemor</label>
                                    <select
                                        value={form.patientId}
                                        onChange={e => {
                                            const p = patients.find(x => x.id === e.target.value);
                                            setForm(f => ({ ...f, patientId: e.target.value, patientName: p ? `${p.firstName} ${p.lastName}` : f.patientName }));
                                        }}
                                        className={inputCls}
                                    >
                                        <option value="">Ro'yxatdan tanlang...</option>
                                        {patients.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                    </select>
                                    {/* Normani jins/yoshga qarab tanlash uchun bemor bog'lanishi muhim */}
                                    {!form.patientId && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                            Bemor tanlanmasa, norma jins bo'yicha aniqlanmaydi
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Shifokor</label>
                                    <select value={form.doctorName} onChange={e => setForm(f => ({ ...f, doctorName: e.target.value }))} className={inputCls}>
                                        <option value="">—</option>
                                        {doctors.map((d: any) => (
                                            <option key={d.id} value={`${d.firstName} ${d.lastName}`}>{d.firstName} {d.lastName}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tahlillar</label>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto">
                                    {activeTests.map(t => {
                                        const checked = form.testIds.includes(t.id);
                                        return (
                                            <label key={t.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <input type="checkbox" checked={checked}
                                                    onChange={() => setForm(f => ({
                                                        ...f,
                                                        testIds: checked ? f.testIds.filter(x => x !== t.id) : [...f.testIds, t.id],
                                                    }))}
                                                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{t.name}</span>
                                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                        {t.code} · {t.sampleType} · {t.turnaroundHours} soat
                                                    </span>
                                                </span>
                                                <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{fmt(t.price)}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={`${inputCls} max-w-[180px]`}>
                                    <option value="Normal">Oddiy</option>
                                    <option value="Urgent">Shoshilinch</option>
                                </select>
                                <div className="ml-auto text-right">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Jami: </span>
                                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(selectedTotal)} so'm</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                Bekor qilish
                            </button>
                            <button onClick={createOrder} disabled={saving}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? 'Saqlanmoqda...' : 'Yaratish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Natijalar ─────────────────────────────────────────────────── */}
            {resultsOrder && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setResultsOrder(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{resultsOrder.patientName}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {resultsOrder.patientSex === 'Male' ? 'Erkak' : resultsOrder.patientSex === 'Female' ? 'Ayol' : 'Jins ko\'rsatilmagan'}
                                    {resultsOrder.patientAge != null ? ` · ${resultsOrder.patientAge} yosh` : ''}
                                    {' · Normalar shu bemorga moslangan'}
                                </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <button onClick={printResults} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Chop etish">
                                    <Printer className="w-5 h-5" />
                                </button>
                                <button onClick={() => setResultsOrder(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-6">
                            {resultsOrder.items.map(item => (
                                <div key={item.id}>
                                    <h4 className="font-medium text-gray-900 dark:text-white mb-3">{item.testName}</h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                    <th className="pb-2 pr-3 font-medium">Ko'rsatkich</th>
                                                    <th className="pb-2 pr-3 font-medium w-32">Natija</th>
                                                    <th className="pb-2 pr-3 font-medium w-20">Birlik</th>
                                                    <th className="pb-2 pr-3 font-medium w-28">Norma</th>
                                                    <th className="pb-2 font-medium w-24">Baho</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                                {(item.parameters || []).map(p => {
                                                    const key = `${item.id}:${p.parameterId}`;
                                                    const fl = p.flag ? FLAG_UI[p.flag] : null;
                                                    return (
                                                        <tr key={p.parameterId}>
                                                            <td className="py-2 pr-3 text-gray-900 dark:text-white">{p.name}</td>
                                                            <td className="py-2 pr-3">
                                                                <input
                                                                    value={draft[key] ?? ''}
                                                                    onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                                                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm tabular-nums focus:ring-2 focus:ring-primary-500"
                                                                />
                                                            </td>
                                                            <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{p.unit || '—'}</td>
                                                            <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 tabular-nums">{refText(p)}</td>
                                                            <td className="py-2">
                                                                {fl && p.value ? (
                                                                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${fl.cls}`}>
                                                                        <fl.Icon className="w-3.5 h-3.5" /> {fl.label}
                                                                    </span>
                                                                ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setResultsOrder(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                Yopish
                            </button>
                            <button onClick={saveResults} disabled={saving}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? 'Saqlanmoqda...' : 'Natijalarni saqlash'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
