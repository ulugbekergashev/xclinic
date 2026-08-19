import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BedDouble, Plus, X, AlertCircle, LogOut, Stethoscope,
    Pill, CalendarDays, Search,
} from 'lucide-react';
import { Ward, Bed, Admission, Patient, Department, InventoryItem } from '../types';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   Statsionar — palata, koyka, yotqizish, obxod.

   Ambulator qabuldan asosiy farqi: bemor bir necha kun "ochiq" turadi va har
   kuni koyka haqi hisoblanadi. Koyka bandligi serverda tekshiriladi — ikki
   bemor bitta koykaga tushib qolmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

const BED_UI: Record<string, string> = {
    Free: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700',
    Occupied: 'bg-primary-50 border-primary-300 dark:bg-primary-900/20 dark:border-primary-700',
    Cleaning: 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700',
    Blocked: 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600',
};
const BED_LABEL: Record<string, string> = {
    Free: "Bo'sh", Occupied: 'Band', Cleaning: 'Tozalanmoqda', Blocked: 'Yopiq',
};

interface Props {
    clinicId: string;
    patients?: Patient[];
    departments?: Department[];
    doctors?: any[];
    inventoryItems?: InventoryItem[];
    currentUserName?: string;
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(n);
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('uz-UZ') : '—';

/** Yotgan kunlar soni — kunlik hisobni ko'rsatish uchun */
const daysIn = (from: string, to?: string | null) => {
    const start = new Date(from).getTime();
    const end = to ? new Date(to).getTime() : Date.now();
    return Math.max(1, Math.ceil((end - start) / 864e5));
};

export const Inpatient: React.FC<Props> = ({
    clinicId, patients = [], departments = [], doctors = [], inventoryItems = [], currentUserName,
}) => {
    const [wards, setWards] = useState<Ward[]>([]);
    const [admissions, setAdmissions] = useState<Admission[]>([]);
    const [tab, setTab] = useState<'beds' | 'active' | 'archive'>('beds');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const [admitBed, setAdmitBed] = useState<{ bed: Bed; ward: Ward } | null>(null);
    const [detail, setDetail] = useState<Admission | null>(null);
    const [showWard, setShowWard] = useState(false);

    const [admitForm, setAdmitForm] = useState({ patientId: '', doctorId: '', reason: '', diagnosis: '' });
    const [wardForm, setWardForm] = useState({ name: '', kind: 'Umumiy', floor: '', dailyRate: '', bedCount: '4', departmentId: '' });
    const [roundForm, setRoundForm] = useState({ notes: '', plan: '', temperature: '', bp: '', pulse: '' });
    const [medForm, setMedForm] = useState({ name: '', dosage: '', route: '', frequency: '' });

    const reload = useCallback(async () => {
        try {
            const [w, a] = await Promise.all([api.wards.getAll(), api.admissions.getAll()]);
            setWards(w); setAdmissions(a);
        } catch (e: any) { setError(e.message || 'Yuklab bo\'lmadi'); }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const inpatientDept = useMemo(() => departments.find(d => d.type === 'INPATIENT'), [departments]);

    const active = useMemo(() => admissions.filter(a => a.status === 'Active'), [admissions]);
    const archive = useMemo(() => admissions.filter(a => a.status === 'Discharged'), [admissions]);

    const listed = useMemo(() => {
        const src = tab === 'archive' ? archive : active;
        const q = search.trim().toLowerCase();
        return q ? src.filter(a => a.patientName.toLowerCase().includes(q)) : src;
    }, [tab, active, archive, search]);

    const stats = useMemo(() => {
        const beds = wards.flatMap(w => w.beds || []);
        return {
            total: beds.length,
            free: beds.filter(b => b.status === 'Free').length,
            occupied: beds.filter(b => b.status === 'Occupied').length,
        };
    }, [wards]);

    // ── Amallar ─────────────────────────────────────────────────────────────
    const admit = async () => {
        if (!admitBed || !admitForm.patientId) { setError('Bemorni tanlang'); return; }
        const p = patients.find(x => x.id === admitForm.patientId);
        const doc = doctors.find((d: any) => d.id === admitForm.doctorId);
        setSaving(true); setError('');
        try {
            await api.admissions.create({
                patientId: admitForm.patientId,
                patientName: p ? `${p.firstName} ${p.lastName}` : '',
                bedId: admitBed.bed.id,
                departmentId: admitBed.ward.departmentId || inpatientDept?.id || null,
                doctorId: admitForm.doctorId || null,
                doctorName: doc ? `${doc.firstName} ${doc.lastName}` : null,
                dailyRate: admitBed.ward.dailyRate,
                reason: admitForm.reason || null,
                diagnosis: admitForm.diagnosis || null,
            });
            await reload();
            setAdmitBed(null);
            setAdmitForm({ patientId: '', doctorId: '', reason: '', diagnosis: '' });
        } catch (e: any) { setError(e.message || 'Yotqizib bo\'lmadi'); }
        finally { setSaving(false); }
    };

    const discharge = async (a: Admission) => {
        const summary = prompt('Chiqarish xulosasi (ixtiyoriy):') ?? undefined;
        setSaving(true); setError('');
        try {
            await api.admissions.discharge(a.id, summary);
            await reload();
            setDetail(null);
        } catch (e: any) { setError(e.message || 'Chiqarib bo\'lmadi'); }
        finally { setSaving(false); }
    };

    const addRound = async () => {
        if (!detail) return;
        setSaving(true); setError('');
        try {
            await api.admissions.addRound(detail.id, {
                doctorName: currentUserName || null,
                notes: roundForm.notes || null,
                plan: roundForm.plan || null,
                vitalSigns: {
                    temperature: roundForm.temperature, bp: roundForm.bp, pulse: roundForm.pulse,
                },
            });
            const fresh = await api.admissions.getAll();
            setAdmissions(fresh);
            setDetail(fresh.find(x => x.id === detail.id) || null);
            setRoundForm({ notes: '', plan: '', temperature: '', bp: '', pulse: '' });
        } catch (e: any) { setError(e.message || 'Saqlanmadi'); }
        finally { setSaving(false); }
    };

    const addMedication = async () => {
        if (!detail || !medForm.name.trim()) { setError('Dori nomini kiriting'); return; }
        setSaving(true); setError('');
        try {
            await api.admissions.addMedication(detail.id, {
                name: medForm.name.trim(), dosage: medForm.dosage || null,
                route: medForm.route || null, frequency: medForm.frequency || null,
            });
            const fresh = await api.admissions.getAll();
            setAdmissions(fresh);
            setDetail(fresh.find(x => x.id === detail.id) || null);
            setMedForm({ name: '', dosage: '', route: '', frequency: '' });
        } catch (e: any) { setError(e.message || 'Saqlanmadi'); }
        finally { setSaving(false); }
    };

    const createWard = async () => {
        if (!wardForm.name.trim()) { setError('Palata nomi majburiy'); return; }
        setSaving(true); setError('');
        try {
            await api.wards.create({
                name: wardForm.name.trim(), kind: wardForm.kind, floor: wardForm.floor || null,
                dailyRate: Number(wardForm.dailyRate) || 0,
                departmentId: wardForm.departmentId || inpatientDept?.id || null,
                bedCount: Number(wardForm.bedCount) || 0,
            } as any);
            await reload();
            setShowWard(false);
            setWardForm({ name: '', kind: 'Umumiy', floor: '', dailyRate: '', bedCount: '4', departmentId: '' });
        } catch (e: any) { setError(e.message || 'Yaratilmadi'); }
        finally { setSaving(false); }
    };

    const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

    return (
        <div className="space-y-5">
            {/* Sarlavha va statistika */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <BedDouble className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Statsionar</h2>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Koyka: <b className="text-gray-900 dark:text-white tabular-nums">{stats.total}</b></span>
                    <span className="text-emerald-600 dark:text-emerald-400">Bo'sh: <b className="tabular-nums">{stats.free}</b></span>
                    <span className="text-primary-600 dark:text-primary-400">Band: <b className="tabular-nums">{stats.occupied}</b></span>
                </div>
                <button onClick={() => setShowWard(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                    <Plus className="w-4 h-4" /> Palata
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Bo'limlar */}
            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
                {([['beds', 'Palatalar'], ['active', `Yotganlar (${active.length})`], ['archive', 'Arxiv']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setTab(k as any)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Palatalar xaritasi */}
            {tab === 'beds' && (
                wards.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <BedDouble className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">Palatalar yo'q</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {wards.map(w => (
                            <div key={w.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                                <div className="flex flex-wrap items-baseline gap-2 mb-3">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">{w.name}</h3>
                                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{w.kind}</span>
                                    {w.floor && <span className="text-xs text-gray-400">{w.floor}-qavat</span>}
                                    <span className="ml-auto text-sm text-gray-500 dark:text-gray-400 tabular-nums">{fmt(w.dailyRate)} so'm/kun</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {(w.beds || []).map(b => {
                                        const occ = b.admissions?.[0];
                                        return (
                                            <button key={b.id}
                                                onClick={() => { if (b.status === 'Free') setAdmitBed({ bed: b, ward: w }); else if (occ) setDetail(admissions.find(a => a.id === occ.id) || null); }}
                                                className={`text-left p-3 rounded-lg border-2 transition-colors ${BED_UI[b.status] || BED_UI.Blocked} hover:opacity-80`}
                                            >
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">{b.label}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                                    {occ ? occ.patientName : BED_LABEL[b.status]}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Yotganlar / arxiv */}
            {tab !== 'beds' && (
                <>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bemor..." className={`${inputCls} pl-9`} />
                    </div>
                    {listed.length === 0 ? (
                        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">Yozuvlar yo'q</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {listed.map(a => {
                                const days = daysIn(a.admittedAt, a.dischargedAt);
                                return (
                                    <div key={a.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                                        <div className="flex flex-wrap items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-semibold text-gray-900 dark:text-white">{a.patientName}</h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {a.bed ? `${a.bed.ward?.name} / ${a.bed.label}` : 'Koyka biriktirilmagan'}
                                                    {a.doctorName ? ` · ${a.doctorName}` : ''}
                                                </p>
                                                {a.diagnosis && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{a.diagnosis}</p>}
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                                    {fmtDate(a.admittedAt)} — {a.dischargedAt ? fmtDate(a.dischargedAt) : 'hozirgacha'} · {days} kun
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(a.dailyRate * days)} so'm</p>
                                                <p className="text-xs text-gray-400">{fmt(a.dailyRate)} × {days} kun</p>
                                                <div className="flex gap-2 mt-2 justify-end">
                                                    <button onClick={() => setDetail(a)}
                                                        className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                                        Ochish
                                                    </button>
                                                    {a.status === 'Active' && (
                                                        <button onClick={() => discharge(a)}
                                                            className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                                                            Chiqarish
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ── Yotqizish ─────────────────────────────────────────────────── */}
            {admitBed && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAdmitBed(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">Yotqizish</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {admitBed.ward.name} / {admitBed.bed.label} · {fmt(admitBed.ward.dailyRate)} so'm/kun
                                </p>
                            </div>
                            <button onClick={() => setAdmitBed(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bemor</label>
                                <select value={admitForm.patientId} onChange={e => setAdmitForm(f => ({ ...f, patientId: e.target.value }))} className={inputCls}>
                                    <option value="">Tanlang...</option>
                                    {patients.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Davolovchi shifokor</label>
                                <select value={admitForm.doctorId} onChange={e => setAdmitForm(f => ({ ...f, doctorId: e.target.value }))} className={inputCls}>
                                    <option value="">—</option>
                                    {doctors.map((d: any) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Yotqizish sababi</label>
                                <input value={admitForm.reason} onChange={e => setAdmitForm(f => ({ ...f, reason: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tashxis</label>
                                <input value={admitForm.diagnosis} onChange={e => setAdmitForm(f => ({ ...f, diagnosis: e.target.value }))} className={inputCls} />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setAdmitBed(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Bekor qilish</button>
                            <button onClick={admit} disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? '...' : 'Yotqizish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bemor kartasi (obxod + dorilar) ───────────────────────────── */}
            {detail && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{detail.patientName}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {detail.bed ? `${detail.bed.ward?.name} / ${detail.bed.label}` : '—'} · {fmtDate(detail.admittedAt)} dan
                                    {' · '}{daysIn(detail.admittedAt, detail.dischargedAt)} kun
                                </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                {detail.status === 'Active' && (
                                    <button onClick={() => discharge(detail)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <LogOut className="w-3.5 h-3.5" /> Chiqarish
                                    </button>
                                )}
                                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-6">
                            {/* Obxod qo'shish */}
                            {detail.status === 'Active' && (
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                        <Stethoscope className="w-4 h-4" /> Kunlik obxod
                                    </h4>
                                    <div className="grid grid-cols-3 gap-3 mb-3">
                                        <input value={roundForm.temperature} onChange={e => setRoundForm(f => ({ ...f, temperature: e.target.value }))} className={inputCls} placeholder="Harorat °C" />
                                        <input value={roundForm.bp} onChange={e => setRoundForm(f => ({ ...f, bp: e.target.value }))} className={inputCls} placeholder="AB (120/80)" />
                                        <input value={roundForm.pulse} onChange={e => setRoundForm(f => ({ ...f, pulse: e.target.value }))} className={inputCls} placeholder="Puls" />
                                    </div>
                                    <textarea rows={2} value={roundForm.notes} onChange={e => setRoundForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} mb-2`} placeholder="Holati..." />
                                    <textarea rows={2} value={roundForm.plan} onChange={e => setRoundForm(f => ({ ...f, plan: e.target.value }))} className={`${inputCls} mb-3`} placeholder="Reja..." />
                                    <button onClick={addRound} disabled={saving} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50">
                                        Obxodni saqlash
                                    </button>
                                </div>
                            )}

                            {/* Obxodlar tarixi */}
                            {!!detail.rounds?.length && (
                                <div>
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                        <CalendarDays className="w-4 h-4" /> Obxodlar ({detail.rounds.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {detail.rounds.map(r => {
                                            let vs: any = {};
                                            try { vs = r.vitalSigns ? JSON.parse(r.vitalSigns) : {}; } catch { }
                                            return (
                                                <div key={r.id} className="text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-3 py-1">
                                                    <p className="text-xs text-gray-400">{r.date} {r.doctorName ? `· ${r.doctorName}` : ''}</p>
                                                    {(vs.temperature || vs.bp || vs.pulse) && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                                            {vs.temperature && `t ${vs.temperature}°C `}
                                                            {vs.bp && `· AB ${vs.bp} `}
                                                            {vs.pulse && `· puls ${vs.pulse}`}
                                                        </p>
                                                    )}
                                                    {r.notes && <p className="text-gray-700 dark:text-gray-300">{r.notes}</p>}
                                                    {r.plan && <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Reja: {r.plan}</p>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Dori tayinlash */}
                            {detail.status === 'Active' && (
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                        <Pill className="w-4 h-4" /> Dori tayinlash
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <input list="xc-meds" value={medForm.name} onChange={e => setMedForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Dori nomi" />
                                        <datalist id="xc-meds">
                                            {inventoryItems.filter(i => (i as any).isMedication).map(i => <option key={i.id} value={i.name} />)}
                                        </datalist>
                                        <input value={medForm.dosage} onChange={e => setMedForm(f => ({ ...f, dosage: e.target.value }))} className={inputCls} placeholder="Doza (500 mg)" />
                                        <input value={medForm.route} onChange={e => setMedForm(f => ({ ...f, route: e.target.value }))} className={inputCls} placeholder="Yo'li (ichish, v/i)" />
                                        <input value={medForm.frequency} onChange={e => setMedForm(f => ({ ...f, frequency: e.target.value }))} className={inputCls} placeholder="Kuniga 2 mahal" />
                                    </div>
                                    <button onClick={addMedication} disabled={saving} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50">
                                        Tayinlash
                                    </button>
                                </div>
                            )}

                            {!!detail.medicationOrders?.length && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Tayinlangan dorilar</h4>
                                    <div className="space-y-1.5">
                                        {detail.medicationOrders.map(m => (
                                            <div key={m.id} className="text-sm flex flex-wrap gap-x-2 text-gray-700 dark:text-gray-300">
                                                <span className="font-medium">{m.name}</span>
                                                {m.dosage && <span className="text-gray-500">{m.dosage}</span>}
                                                {m.route && <span className="text-gray-500">· {m.route}</span>}
                                                {m.frequency && <span className="text-gray-500">· {m.frequency}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {detail.dischargeSummary && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Chiqarish xulosasi</h4>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{detail.dischargeSummary}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Yangi palata ──────────────────────────────────────────────── */}
            {showWard && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowWard(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Yangi palata</h3>
                            <button onClick={() => setShowWard(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nomi</label>
                                <input value={wardForm.name} onChange={e => setWardForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="5-palata" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Turi</label>
                                <select value={wardForm.kind} onChange={e => setWardForm(f => ({ ...f, kind: e.target.value }))} className={inputCls}>
                                    {['Umumiy', 'Yarim lyuks', 'Lyuks', 'Reanimatsiya'].map(k => <option key={k}>{k}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Qavat</label>
                                <input value={wardForm.floor} onChange={e => setWardForm(f => ({ ...f, floor: e.target.value }))} className={inputCls} placeholder="1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kunlik narx</label>
                                <input type="number" value={wardForm.dailyRate} onChange={e => setWardForm(f => ({ ...f, dailyRate: e.target.value }))} className={inputCls} placeholder="150000" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Koyka soni</label>
                                <input type="number" value={wardForm.bedCount} onChange={e => setWardForm(f => ({ ...f, bedCount: e.target.value }))} className={inputCls} />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setShowWard(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Bekor qilish</button>
                            <button onClick={createWard} disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? '...' : 'Yaratish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
