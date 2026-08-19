import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { todayISO } from '../utils/dateUtils';
import { useNavigate } from 'react-router-dom';
import {
    UserPlus, Search, ArrowRight, Printer, Clock, Stethoscope,
    CheckCircle, AlertCircle, X, Phone, RefreshCw,
} from 'lucide-react';
import { Patient, Doctor, Department, Service, Visit, Clinic } from '../types';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   Registratura — bemorning klinikaga kirish nuqtasi.

   Butun tizimda bemor FAQAT shu yerda tanlanadi. Bir ekranda uch qadam:
     1. bemorni topish (yoki yangisini qo'shish)
     2. bo'lim va shifokorni tanlash
     3. qabulni ochish — navbat raqami beriladi, konsultatsiya xizmati qo'shiladi

   Shundan keyin bemor shifokorning navbatida paydo bo'ladi va qolgan hamma
   narsa (tahlil, diagnostika, retsept) shu qabul ichidan bajariladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    clinicId: string;
    patients: Patient[];
    doctors: Doctor[];
    departments: Department[];
    services: Service[];
    currentClinic?: Clinic | null;
    onPatientAdded: (p: Patient) => void;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(n);
const today = () => todayISO();

export const Reception: React.FC<Props> = ({
    clinicId, patients, doctors, departments, services, currentClinic, onPatientAdded, addToast,
}) => {
    const navigate = useNavigate();

    const [search, setSearch] = useState('');
    const [patient, setPatient] = useState<Patient | null>(null);
    const [departmentId, setDepartmentId] = useState('');
    const [doctorId, setDoctorId] = useState('');
    const [serviceId, setServiceId] = useState<number | ''>('');
    const [complaints, setComplaints] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [showNewPatient, setShowNewPatient] = useState(false);
    const [np, setNp] = useState({ firstName: '', lastName: '', phone: '', dob: '', gender: 'Male' });

    const [todayVisits, setTodayVisits] = useState<Visit[]>([]);
    const [lastTicket, setLastTicket] = useState<Visit | null>(null);

    const loadToday = useCallback(async () => {
        try { setTodayVisits(await api.visits.getAll({ date: today() })); }
        catch { /* navbat yuklanmasa ham qabul ochish ishlayveradi */ }
    }, []);
    useEffect(() => { loadToday(); }, [loadToday]);

    // Klinik bo'limlar — laboratoriya/dorixonaga bemor to'g'ridan yozilmaydi
    const clinicalDepts = useMemo(
        () => departments.filter(d => d.isActive && d.type === 'CLINICAL'),
        [departments],
    );

    const deptDoctors = useMemo(
        () => doctors.filter(d => d.status === 'Active' && (!departmentId || d.departmentId === departmentId)),
        [doctors, departmentId],
    );

    // Faqat tanlangan bo'lim xizmatlari. Bo'lim tanlanmaguncha ro'yxat BO'SH —
    // aks holda begona bo'lim xizmatini tanlab yuborish mumkin bo'lardi.
    const deptServices = useMemo(
        () => departmentId ? services.filter(s => s.departmentId === departmentId) : [],
        [services, departmentId],
    );

    const selectedService = useMemo(
        () => services.find(s => s.id === serviceId),
        [services, serviceId],
    );

    const found = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (q.length < 2) return [];
        return patients.filter(p =>
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
            (p.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))
        ).slice(0, 8);
    }, [patients, search]);

    // Bo'lim almashsa, unga tegishsiz tanlovlarni tozalaymiz
    useEffect(() => {
        setDoctorId('');
        const first = services.find(s => s.departmentId === departmentId);
        setServiceId(first ? first.id : '');
    }, [departmentId, services]);

    const reset = () => {
        setPatient(null); setSearch(''); setDepartmentId(''); setDoctorId('');
        setServiceId(''); setComplaints(''); setError('');
    };

    const createPatient = async () => {
        if (!np.firstName.trim() || !np.lastName.trim() || !np.phone.trim()) {
            setError('Ism, familiya va telefon majburiy');
            return;
        }
        setSaving(true); setError('');
        try {
            const created = await api.patients.create({
                firstName: np.firstName.trim(), lastName: np.lastName.trim(),
                phone: np.phone.trim(), dob: np.dob || '', gender: np.gender,
                clinicId, status: 'Active', medicalHistory: '', lastVisit: today(),
            } as any);
            onPatientAdded(created);
            setPatient(created);
            setShowNewPatient(false);
            setNp({ firstName: '', lastName: '', phone: '', dob: '', gender: 'Male' });
        } catch (e: any) { setError(e.message || 'Bemor qo\'shilmadi'); }
        finally { setSaving(false); }
    };

    const openVisit = async () => {
        if (!patient) { setError('Bemorni tanlang'); return; }
        if (!departmentId) { setError("Bo'limni tanlang"); return; }
        setSaving(true); setError('');
        try {
            const doc = doctors.find(d => d.id === doctorId);
            const visit = await api.visits.create({
                patientId: patient.id,
                departmentId,
                doctorId: doctorId || undefined,
                doctorName: doc ? `${doc.firstName} ${doc.lastName}` : undefined,
                complaints: complaints || undefined,
                date: today(),
                status: 'Waiting',
            });

            // Konsultatsiya narxi darhol qabulga yoziladi — kassa shundan ko'radi
            if (serviceId) {
                try { await api.visits.addProcedure(visit.id, { serviceId: Number(serviceId) }); }
                catch (e) { console.error('Xizmat qo\'shilmadi', e); }
            }

            setLastTicket({ ...visit, patient });
            addToast('success', `Qabul ochildi — navbat №${visit.queueNumber ?? '—'}`);
            reset();
            loadToday();
        } catch (e: any) {
            setError(e.message || 'Qabul ochilmadi');
        } finally { setSaving(false); }
    };

    const printTicket = (v: Visit) => {
        const dept = departments.find(d => d.id === v.departmentId);
        const w = window.open('', '_blank', 'width=380,height=520');
        if (!w) return;
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Talon</title>
<style>@page{size:80mm auto;margin:4mm}body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;margin:0;padding:8px}
.n{font-size:64px;font-weight:800;line-height:1;margin:10px 0}
.c{font-size:15px;font-weight:700}.d{font-size:13px;margin:3px 0}.s{border-top:1px dashed #000;margin:10px 0}
</style></head><body>
<div class="c">${currentClinic?.name || 'Klinika'}</div>
<div class="s"></div>
<div class="d">${dept?.name || ''}</div>
<div class="n">${v.queueNumber ?? '—'}</div>
<div class="d"><b>${v.patient?.lastName || ''} ${v.patient?.firstName || ''}</b></div>
${v.doctorName ? `<div class="d">${v.doctorName}</div>` : ''}
<div class="s"></div>
<div class="d">${new Date().toLocaleString('uz-UZ')}</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
        w.document.close();
    };

    const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
    const stepDone = 'bg-emerald-500 text-white';
    const stepNow = 'bg-primary-600 text-white';
    const stepIdle = 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400';

    const step = !patient ? 1 : !departmentId ? 2 : 3;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* ── Chap: qabul ochish ────────────────────────────────────────── */}
            <div className="xl:col-span-2 space-y-4">
                <div className="flex items-center gap-2">
                    <UserPlus className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Registratura</h2>
                </div>

                {/* Qadamlar */}
                <div className="flex items-center gap-2 text-sm">
                    {[['1', 'Bemor'], ['2', "Bo'lim"], ['3', 'Qabul']].map(([n, label], i) => {
                        const idx = i + 1;
                        const cls = step > idx ? stepDone : step === idx ? stepNow : stepIdle;
                        return (
                            <React.Fragment key={n}>
                                <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${cls}`}>
                                    {step > idx ? <CheckCircle className="w-3.5 h-3.5" /> : n}
                                </span>
                                <span className={step >= idx ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400'}>{label}</span>
                                {idx < 3 && <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 mx-1" />}
                            </React.Fragment>
                        );
                    })}
                </div>

                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                        <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* 1. Bemor */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">1. Bemor</h3>

                    {patient ? (
                        <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
                            <div className="w-10 h-10 rounded-full bg-primary-600 text-white grid place-items-center font-bold text-sm">
                                {patient.firstName[0]}{patient.lastName[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-gray-900 dark:text-white truncate">{patient.lastName} {patient.firstName}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> {patient.phone}
                                </p>
                            </div>
                            <button onClick={() => { setPatient(null); setSearch(''); }}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200">
                                O'zgartirish
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                                    placeholder="Ism yoki telefon raqami..." className={`${inputCls} pl-9`} />
                            </div>

                            {found.length > 0 && (
                                <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-56 overflow-y-auto">
                                    {found.map(p => (
                                        <button key={p.id} onClick={() => setPatient(p)}
                                            className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.lastName} {p.firstName}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{p.phone}</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-gray-300" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {search.trim().length >= 2 && found.length === 0 && (
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Topilmadi.</p>
                            )}

                            <button onClick={() => setShowNewPatient(true)}
                                className="mt-3 flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
                                <UserPlus className="w-4 h-4" /> Yangi bemor qo'shish
                            </button>
                        </>
                    )}
                </div>

                {/* 2. Bo'lim va shifokor */}
                <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${!patient ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">2. Bo'lim va shifokor</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Bo'lim</label>
                            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={inputCls}>
                                <option value="">Tanlang...</option>
                                {clinicalDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                                Shifokor {deptDoctors.length === 0 && departmentId ? '(bo\'limda shifokor yo\'q)' : ''}
                            </label>
                            <select value={doctorId} onChange={e => setDoctorId(e.target.value)} className={inputCls}>
                                <option value="">Belgilanmagan</option>
                                {deptDoctors.map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Xizmat (qabul turi)</label>
                            <select value={serviceId} onChange={e => setServiceId(e.target.value ? Number(e.target.value) : '')}
                                disabled={!departmentId} className={inputCls}>
                                <option value="">{departmentId ? 'Xizmatsiz' : "Avval bo'limni tanlang"}</option>
                                {deptServices.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Shikoyat (ixtiyoriy)</label>
                            <input value={complaints} onChange={e => setComplaints(e.target.value)} className={inputCls} placeholder="Bosh og'rig'i..." />
                        </div>
                    </div>
                </div>

                {/* 3. Qabulni ochish */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-4">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">To'lanadigan summa</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                            {fmt(selectedService?.price || 0)} <span className="text-base font-normal">so'm</span>
                        </p>
                    </div>
                    <button onClick={openVisit} disabled={!patient || !departmentId || saving}
                        className="ml-auto flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
                        {saving ? 'Ochilmoqda...' : 'Qabulni ochish'} <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Oxirgi talon */}
                {lastTicket && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
                        <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                                Navbat №{lastTicket.queueNumber} — {lastTicket.patient?.lastName} {lastTicket.patient?.firstName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Bemor shifokor navbatiga qo'shildi</p>
                        </div>
                        <button onClick={() => printTicket(lastTicket)}
                            className="ml-auto flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Printer className="w-4 h-4" /> Talon chiqarish
                        </button>
                    </div>
                )}
            </div>

            {/* ── O'ng: bugungi navbat ──────────────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Bugungi navbat</h3>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{todayVisits.length} ta</span>
                    <button onClick={loadToday} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Yangilash">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {todayVisits.length === 0 ? (
                    <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Bugun qabul yo'q</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                        {todayVisits.map(v => {
                            const done = v.status === 'Completed';
                            return (
                                <button key={v.id} onClick={() => navigate(`/visit/${v.id}`)}
                                    className="w-full text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3 hover:border-primary-400 transition-colors">
                                    <span className={`w-9 h-9 rounded-lg grid place-items-center font-bold text-sm shrink-0 ${done
                                        ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                                        : 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'}`}>
                                        {v.queueNumber ?? '—'}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {v.patient?.lastName} {v.patient?.firstName}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                            {v.department?.name || '—'}{v.doctorName ? ` · ${v.doctorName}` : ''}
                                        </p>
                                    </div>
                                    {done
                                        ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                        : <Stethoscope className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Yangi bemor */}
            {showNewPatient && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewPatient(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Yangi bemor</h3>
                            <button onClick={() => setShowNewPatient(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Familiya</label>
                                <input value={np.lastName} onChange={e => setNp(f => ({ ...f, lastName: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Ism</label>
                                <input value={np.firstName} onChange={e => setNp(f => ({ ...f, firstName: e.target.value }))} className={inputCls} />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Telefon</label>
                                <input value={np.phone} onChange={e => setNp(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="+998 90 123 45 67" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Tug'ilgan sana</label>
                                <input type="date" value={np.dob} onChange={e => setNp(f => ({ ...f, dob: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Jinsi</label>
                                <select value={np.gender} onChange={e => setNp(f => ({ ...f, gender: e.target.value }))} className={inputCls}>
                                    <option value="Male">Erkak</option>
                                    <option value="Female">Ayol</option>
                                </select>
                            </div>
                            <p className="col-span-2 text-xs text-gray-400 dark:text-gray-500">
                                Jins va tug'ilgan sana tahlil normalarini to'g'ri tanlash uchun kerak.
                            </p>
                        </div>
                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setShowNewPatient(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Bekor qilish</button>
                            <button onClick={createPatient} disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? '...' : 'Qo\'shish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
