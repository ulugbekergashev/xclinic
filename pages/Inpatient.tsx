import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatDate, formatFullName } from '../utils/format';
import {
    BedDouble, Plus, X, AlertCircle, LogOut, Stethoscope,
    Pill, CalendarDays, Search, Check, Printer, ArrowRightLeft,
    Sparkles, Activity, Wallet, Loader2, ClipboardList,
} from 'lucide-react';
import { Ward, Bed, Admission, Patient, Department, InventoryItem } from '../types';
import { api } from '../services/api';
import { EmptyState } from '../components/Common';
import { useLanguage } from '../context/LanguageContext';
import { useLiveUpdates, LiveEventType } from '../hooks/useLiveUpdates';

const LIVE_EVENTS: LiveEventType[] = ['admission.changed', 'charge.paid'];
import { Clinic } from '../types';
import { printDischarge } from '../utils/printForms';
import { VitalsChart } from '../components/VitalsChart';
import { todayISO } from '../utils/dateUtils';

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
    /** Bosma epikriz shapkasi uchun */
    currentClinic?: Clinic | null;
    userRole?: string;
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));

/** Hisob qatorlarining manbasi — "nima uchun bunday summa" savoliga javob */
const SOURCE_LABEL: Record<string, string> = {
    Bed: 'Koyka', Medication: 'Dorilar', Service: 'Xizmatlar',
    Lab: 'Tahlillar', Study: 'Tekshiruvlar', Other: 'Boshqa',
};
const fmtDate = (iso?: string | null) => iso ? formatDate(iso) : '—';

/** Yotgan kunlar soni — kunlik hisobni ko'rsatish uchun */
const daysIn = (from: string, to?: string | null) => {
    const start = new Date(from).getTime();
    const end = to ? new Date(to).getTime() : Date.now();
    return Math.max(1, Math.ceil((end - start) / 864e5));
};

export const Inpatient: React.FC<Props> = ({
    clinicId, patients = [], departments = [], doctors = [], inventoryItems = [], currentUserName,
    currentClinic, userRole,
}) => {
    const { t } = useLanguage();
    const [wards, setWards] = useState<Ward[]>([]);
    const [admissions, setAdmissions] = useState<Admission[]>([]);
    const [tab, setTab] = useState<'beds' | 'active' | 'archive' | 'meds'>('beds');
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

    /* Statsionar ekrani ilgari UMUMAN yangilanmasdi: hamshira ko'chirishni
       yozsa, shifokorning ekranida eski palata turaverardi. */
    useLiveUpdates(LIVE_EVENTS, reload);

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
                patientName: p ? `${formatFullName(p)}` : '',
                bedId: admitBed.bed.id,
                departmentId: admitBed.ward.departmentId || inpatientDept?.id || null,
                doctorId: admitForm.doctorId || null,
                doctorName: doc ? `${formatFullName(doc)}` : null,
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

    /* ─── Reliz 4: dori varag'i, o'lchovlar, ko'chirish, epikriz ───────────── */

    const canGiveMeds = ['NURSE', 'DOCTOR', 'CLINIC_ADMIN'].includes(userRole || '');
    const canTransfer = ['DOCTOR', 'CLINIC_ADMIN'].includes(userRole || '');
    /* Palata ochish, yotqizish va chiqarish — hamshiraning ishi emas; server
       ham 403 beradi. Ro'yxat "kimga mumkin" emas, "kimga mumkin emas" bo'yicha:
       shunda qolgan rollarda hech narsa o'zgarmaydi. */
    const canManageStay = userRole !== 'NURSE';

    // Bitta bemorning kunlik dori varag'i
    const [mar, setMar] = useState<any>(null);
    const [marDate, setMarDate] = useState(todayISO());
    const [marBusy, setMarBusy] = useState('');
    const [skipFor, setSkipFor] = useState<any | null>(null);
    const [skipReason, setSkipReason] = useState('');

    // Koyka haqi: ekran ochilganda quvib yetadi
    const [bedDays, setBedDays] = useState<{ charged: number; total: number } | null>(null);

    /* Yotish hisobi: yozilgan, to'langan, qarz, avans. Depozit alohida
       sxema emas — u `Patient.balance` dagi avans (qaror В7). */
    const [billing, setBilling] = useState<any>(null);

    // Harorat varag'i
    const [vitals, setVitals] = useState<any[]>([]);

    // Ko'chirish
    const [transferFor, setTransferFor] = useState<Admission | null>(null);
    const [transferBed, setTransferBed] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [transferHistory, setTransferHistory] = useState<any[]>([]);

    // Chiqarish: epikrizning to'rt qismi
    const [dischargeFor, setDischargeFor] = useState<Admission | null>(null);
    const [dischargeForm, setDischargeForm] = useState({
        admissionDiagnosis: '', finalDiagnosis: '', treatmentGiven: '', recommendations: '',
    });

    // Bo'lim bo'yicha kunlik ro'yxat (hamshira ekrani)
    const [schedule, setSchedule] = useState<any>(null);
    const [schedDept, setSchedDept] = useState('');
    const [schedLoading, setSchedLoading] = useState(false);

    /* Bemor kartasi ochilganda uchta narsa yuklanadi. Koyka haqi ATAYLAB shu
       yerda hisoblanadi: hisob quvib yetuvchi va idempotent, ya'ni kartani
       ochish uni faqat aniqlashtiradi. Dastur kunlab o'chirilgan bo'lsa ham
       raqam to'g'ri chiqadi. */
    const loadDetailExtras = useCallback(async (adm: Admission) => {
        setMar(null); setVitals([]); setBedDays(null); setTransferHistory([]); setBilling(null);
        const date = todayISO();
        setMarDate(date);
        const [marRes, vitRes, bedRes, trRes] = await Promise.all([
            api.admissions.mar(adm.id, date).catch(() => null),
            api.inpatient.vitals(adm.patientId, { admissionId: adm.id }).catch(() => []),
            adm.status === 'Active'
                ? api.admissions.chargeBedDays(adm.id).catch(() => null)
                : Promise.resolve(null),
            api.admissions.transfers(adm.id).catch(() => []),
        ]);
        setMar(marRes);
        setVitals(vitRes || []);
        setBedDays(bedRes);
        setTransferHistory(trRes || []);
        // Hisob koyka haqidan KEYIN: yangi kunlar qo'shilgan bo'lsa ular ham kirsin
        setBilling(await api.admissions.billing(adm.id).catch(() => null));
        // Koyka haqi qator qo'shgan bo'lsa, "jami" o'zgargan — ro'yxatni yangilaymiz
        if (bedRes && bedRes.charged > 0) {
            const fresh = await api.admissions.getAll().catch(() => null);
            if (fresh) setAdmissions(fresh);
        }
    }, []);

    const openDetail = (adm: Admission | null) => {
        setDetail(adm);
        if (adm) loadDetailExtras(adm);
    };

    const reloadMar = async (date = marDate) => {
        if (!detail) return;
        setMar(await api.admissions.mar(detail.id, date).catch(() => null));
    };

    /** Dori berildi. Ombor chiqimi va hisob qatori serverda o'zi yuriladi. */
    const giveMed = async (orderId: string, dose?: string | null) => {
        setMarBusy(orderId); setError('');
        try {
            const res = await api.inpatient.administer(orderId, { dose: dose || undefined });
            await reloadMar();
            if (res?.charge) {
                // Bemor hisobiga qator tushdi — jami o'zgardi
                const fresh = await api.admissions.getAll().catch(() => null);
                if (fresh) {
                    setAdmissions(fresh);
                    setDetail(d => (d ? fresh.find(x => x.id === d.id) || d : d));
                }
            }
        } catch (e: any) {
            setError(e?.message || 'Belgilanmadi');
        } finally { setMarBusy(''); }
    };

    /** Berilmadi — SABAB majburiy: "belgi yo'q" bilan "bermadim" bir xil emas */
    const skipMed = async () => {
        if (!skipFor || !skipReason.trim()) return;
        setMarBusy(skipFor.id); setError('');
        try {
            await api.inpatient.administer(skipFor.id, {
                status: 'Refused', skipReason: skipReason.trim(),
            });
            setSkipFor(null); setSkipReason('');
            await reloadMar();
        } catch (e: any) {
            setError(e?.message || 'Belgilanmadi');
        } finally { setMarBusy(''); }
    };

    const openTransfer = (adm: Admission) => {
        setTransferFor(adm);
        setTransferBed('');
        setTransferReason('');
    };

    const doTransfer = async () => {
        if (!transferFor || !transferBed) return;
        setSaving(true); setError('');
        try {
            await api.admissions.transfer(transferFor.id, {
                toBedId: transferBed,
                reason: transferReason.trim() || undefined,
            });
            setTransferFor(null);
            await reload();
            const fresh = await api.admissions.getAll();
            setDetail(d => (d ? fresh.find(x => x.id === d.id) || null : null));
            if (detail) setTransferHistory(await api.admissions.transfers(detail.id).catch(() => []));
        } catch (e: any) {
            setError(e?.message || "Ko'chirilmadi");
        } finally { setSaving(false); }
    };

    const openDischarge = (adm: Admission) => {
        setDischargeFor(adm);
        setDischargeForm({
            // Kirishdagi tashxis yotqizishda yozilgan bo'lsa — o'shani olamiz
            admissionDiagnosis: (adm as any).admissionDiagnosis || adm.diagnosis || '',
            finalDiagnosis: (adm as any).finalDiagnosis || '',
            treatmentGiven: (adm as any).treatmentGiven || '',
            recommendations: (adm as any).recommendations || '',
        });
    };

    /* Qarz bilan chiqarish tasdig'i. Server 409 beradi, biz "baribir
       chiqarish" tugmasini ko'rsatamiz: bemorni pul uchun ushlab turish
       to'g'ri emas, lekin qarzni ko'rmasdan chiqarib yuborish ham. */
    const [debtConfirm, setDebtConfirm] = useState<{ due: number; count: number } | null>(null);

    const doDischarge = async (andPrint: boolean, confirmDebt = false) => {
        if (!dischargeFor) return;
        setSaving(true); setError('');
        try {
            /* Chiqarishdan OLDIN koyka haqi hisoblanadi: chiqarilgan kun ham
               hisobga kiradi, va keyin `status` Discharged bo'lgach quvib
               yetuvchi hisob boshqa chaqirilmaydi. */
            await api.admissions.chargeBedDays(dischargeFor.id).catch(() => null);
            const updated = await api.admissions.discharge(dischargeFor.id, { ...dischargeForm, confirmDebt });
            await reload();
            setDischargeFor(null);
            setDetail(null);
            if (andPrint) {
                const patient = patients.find(p => p.id === dischargeFor.patientId);
                printDischarge({ ...dischargeFor, ...updated, patient }, currentClinic || undefined);
            }
        } catch (e: any) {
            if (e?.status === 409 && e?.data?.needsConfirm) {
                setDebtConfirm({ due: e.data.due || 0, count: e.data.count || 0 });
            } else {
                setError(e?.message || "Chiqarib bo'lmadi");
            }
        } finally { setSaving(false); }
    };

    /** Koyka tozalandi — B53: ilgari koyka abadiy "tozalanmoqda" bo'lib qolardi */
    const markBedReady = async (bedId: string) => {
        setSaving(true); setError('');
        try {
            await api.inpatient.bedReady(bedId);
            await reload();
        } catch (e: any) {
            setError(e?.message || "Bo'shatilmadi");
        } finally { setSaving(false); }
    };

    const loadSchedule = useCallback(async () => {
        setSchedLoading(true); setError('');
        try {
            setSchedule(await api.inpatient.medSchedule({
                date: todayISO(),
                departmentId: schedDept || undefined,
            }));
        } catch (e: any) {
            setError(e?.message || "Ro'yxat yuklanmadi");
        } finally { setSchedLoading(false); }
    }, [schedDept]);

    useEffect(() => {
        if (tab === 'meds') loadSchedule();
    }, [tab, loadSchedule]);

    /** Bo'sh koykalar — ko'chirish oynasi uchun */
    const freeBeds = useMemo(() => {
        const out: { id: string; label: string }[] = [];
        for (const w of wards) {
            for (const b of (w.beds || [])) {
                if (b.status === 'Free') out.push({ id: b.id, label: `${w.name} / ${b.label}` });
            }
        }
        return out;
    }, [wards]);

    const addRound = async () => {
        if (!detail) return;
        setSaving(true); setError('');
        try {
            await api.admissions.addRound(detail.id, {
                doctorName: currentUserName || null,
                notes: roundForm.notes || null,
                plan: roundForm.plan || null,
                /* "120/80" satri grafikka tushmaydi — serverdagi moslashtirish
                   `bpSys`/`bpDia` kalitlarini kutadi. Shuning uchun bu yerda
                   ajratamiz. `bp` ham qoladi: eski ekranlar uni o'qiydi. */
                vitalSigns: (() => {
                    const [sys, dia] = String(roundForm.bp || '').split('/').map(x => x.trim());
                    return {
                        temperature: roundForm.temperature,
                        bp: roundForm.bp,
                        pulse: roundForm.pulse,
                        ...(sys ? { bpSys: sys } : {}),
                        ...(dia ? { bpDia: dia } : {}),
                    };
                })(),
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
            /* Nomni OMBORDAGI pozitsiya bilan bog'laymiz. Busiz `medicationId`
               bo'sh qolardi va dori berilganda ombordan chiqim ham, bemor
               hisobiga qator ham YOZILMASDI: server aynan shu maydonga
               qaraydi. Ro'yxatdan tanlanmagan nom bo'sh bog'lanish bilan
               ketadi — bu ham normal, shunchaki chiqim bo'lmaydi. */
            const typed = medForm.name.trim().toLowerCase();
            const item = inventoryItems.find(i => (i.name || '').trim().toLowerCase() === typed);

            await api.admissions.addMedication(detail.id, {
                name: medForm.name.trim(), dosage: medForm.dosage || null,
                route: medForm.route || null, frequency: medForm.frequency || null,
                medicationId: item?.id || null,
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
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('inp.title')}</h2>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t('inp.bedLabel')}<b className="text-gray-900 dark:text-white tabular-nums">{stats.total}</b></span>
                    <span className="text-emerald-600 dark:text-emerald-400">{t('inp.free')}<b className="tabular-nums">{stats.free}</b></span>
                    <span className="text-primary-600 dark:text-primary-400">{t('inp.occupied')}<b className="tabular-nums">{stats.occupied}</b></span>
                </div>
                {canManageStay && (
                    <button onClick={() => setShowWard(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                        <Plus className="w-4 h-4" /> Palata
                    </button>
                )}
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
                {([
                    ['beds', 'Palatalar'],
                    ['active', `Yotganlar (${active.length})`],
                    // Hamshiraning asosiy ekrani: "bugun kimga nima berilishi kerak"
                    ['meds', "Dori varag'i"],
                    ['archive', 'Arxiv'],
                ] as const).map(([k, label]) => (
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
                    <EmptyState
                    icon={<BedDouble className="w-12 h-12" />}
                    title={t('inp.noWards')}
                    hint={t('inp.noWardsHint')}
                />
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
                                            <div key={b.id}
                                                className={`p-3 rounded-lg border-2 transition-colors ${BED_UI[b.status] || BED_UI.Blocked}`}>
                                                <button
                                                    onClick={() => { if (b.status === 'Free') { if (canManageStay) setAdmitBed({ bed: b, ward: w }); } else if (occ) openDetail(admissions.find(a => a.id === occ.id) || null); }}
                                                    className="w-full text-left hover:opacity-80">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{b.label}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                                        {occ ? occ.patientName : BED_LABEL[b.status]}
                                                    </p>
                                                </button>
                                                {/* B53: ilgari koyka chiqarishdan keyin ABADIY "tozalanmoqda"
                                                    bo'lib qolardi va palata asta-sekin to'lib borardi. */}
                                                {b.status === 'Cleaning' && (
                                                    <button onClick={() => markBedReady(b.id)} disabled={saving}
                                                        className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-white/70 dark:bg-gray-900/40 text-amber-800 dark:text-amber-200 hover:bg-white disabled:opacity-50">
                                                        <Sparkles className="w-3 h-3" /> Koyka tayyor
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Yotganlar / arxiv */}
            {(tab === 'active' || tab === 'archive') && (
                <>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inp.searchPh')} className={`${inputCls} pl-9`} />
                    </div>
                    {listed.length === 0 ? (
                        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                            <p className="text-gray-500 dark:text-gray-400">{t('inp.noRecords')}</p>
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
                                                    <button onClick={() => openDetail(a)}
                                                        className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                                                        Ochish
                                                    </button>
                                                    {a.status === 'Active' && canManageStay && (
                                                        <button onClick={() => openDischarge(a)}
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
                                <h3 className="font-semibold text-gray-900 dark:text-white">{t('inp.admit')}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {admitBed.ward.name} / {admitBed.bed.label} · {fmt(admitBed.ward.dailyRate)} so'm/kun
                                </p>
                            </div>
                            <button onClick={() => setAdmitBed(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('common.patient2')}</label>
                                <select value={admitForm.patientId} onChange={e => setAdmitForm(f => ({ ...f, patientId: e.target.value }))} className={inputCls}>
                                    <option value="">{t('common.choose')}</option>
                                    {patients.map(p => <option key={p.id} value={p.id}>{formatFullName(p)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.attendingDoctor')}</label>
                                <select value={admitForm.doctorId} onChange={e => setAdmitForm(f => ({ ...f, doctorId: e.target.value }))} className={inputCls}>
                                    <option value="">—</option>
                                    {doctors.map((d: any) => <option key={d.id} value={d.id}>{formatFullName(d)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.admitReason')}</label>
                                <input value={admitForm.reason} onChange={e => setAdmitForm(f => ({ ...f, reason: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.diagnosis')}</label>
                                <input value={admitForm.diagnosis} onChange={e => setAdmitForm(f => ({ ...f, diagnosis: e.target.value }))} className={inputCls} />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setAdmitBed(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('common.cancel2')}</button>
                            <button onClick={admit} disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? '...' : 'Yotqizish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bemor kartasi (obxod + dorilar) ───────────────────────────── */}
            {/* ── Bo'lim bo'yicha kunlik dori varag'i ───────────────────────
                Hamshiraning asosiy ekrani: bitta ro'yxatda butun bo'lim.
                Ilgari har bemorni alohida ochish kerak edi, ya'ni dori berish
                paytida hamshira o'n marta oyna ochib yopardi. */}
            {tab === 'meds' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <select value={schedDept} onChange={e => setSchedDept(e.target.value)} className={inputCls + ' max-w-xs'}>
                            <option value="">{t('inp.allDepts')}</option>
                            {departments.filter(d => d.isActive).map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {schedule?.date || todayISO()}
                        </span>
                        <button onClick={loadSchedule} disabled={schedLoading}
                            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                            {schedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                            Yangilash
                        </button>
                    </div>

                    {schedLoading && !schedule ? (
                        <div className="space-y-2">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700/40 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : (schedule?.rows || []).length === 0 ? (
                        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                            <Pill className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">{t('inp.noMedsToday')}</p>
                            <p className="text-xs text-gray-400 mt-1">
                                Dori bemor kartasidan tayinlanadi: "Yotganlar" bo'limida bemorni ochib, "Dori tayinlash".
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {schedule.rows.map((row: any) => (
                                <div key={row.admissionId} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-gray-900 dark:text-white">{row.patientName}</p>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {[row.ward, row.bed].filter(Boolean).join(' / ') || 'koyka yo\'q'}
                                        </span>
                                        <button
                                            onClick={() => {
                                                const adm = admissions.find(a => a.id === row.admissionId);
                                                if (adm) openDetail(adm);
                                            }}
                                            className="ml-auto text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                                            Kartani ochish
                                        </button>
                                    </div>

                                    {(row.orders || []).length === 0 ? (
                                        <p className="px-4 py-3 text-sm text-gray-400">{t('inp.noOrdersToday')}</p>
                                    ) : (
                                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {row.orders.map((o: any) => {
                                                const given = (o.marks || []).filter((m: any) => m.status === 'Given').length;
                                                return (
                                                    <div key={o.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm text-gray-900 dark:text-white truncate">
                                                                {o.name}
                                                                {o.dosage ? <span className="text-gray-500"> · {o.dosage}</span> : null}
                                                            </p>
                                                            <p className="text-xs text-gray-400">
                                                                {[o.route, o.frequency].filter(Boolean).join(' · ')}
                                                            </p>
                                                        </div>

                                                        {(o.marks || []).length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {o.marks.map((m: any, i: number) => (
                                                                    <span key={i}
                                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.status === 'Given'
                                                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                                                        {new Date(m.givenAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {canGiveMeds && (
                                                            <button
                                                                onClick={async () => {
                                                                    setMarBusy(o.id);
                                                                    try {
                                                                        await api.inpatient.administer(o.id, { dose: o.dosage || undefined });
                                                                        await loadSchedule();
                                                                    } catch (e: any) {
                                                                        setError(e?.message || 'Belgilanmadi');
                                                                    } finally { setMarBusy(''); }
                                                                }}
                                                                disabled={marBusy === o.id}
                                                                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                                                                {marBusy === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                                Berildi{given > 0 ? ` (${given})` : ''}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
                                {detail.status === 'Active' && canTransfer && (
                                    <button onClick={() => openTransfer(detail)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <ArrowRightLeft className="w-3.5 h-3.5" /> Ko'chirish
                                    </button>
                                )}
                                {detail.status === 'Active' && canManageStay && (
                                    <button onClick={() => openDischarge(detail)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <LogOut className="w-3.5 h-3.5" /> Chiqarish
                                    </button>
                                )}
                                {/* Arxivdagi yotishni qayta bosib chiqarish — bemor
                                    varaqni yo'qotsa yoki nusxa kerak bo'lsa */}
                                {detail.status === 'Discharged' && (
                                    <button onClick={() => printDischarge(
                                        { ...detail, patient: patients.find(p => p.id === detail.patientId) },
                                        currentClinic || undefined,
                                    )}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <Printer className="w-3.5 h-3.5" /> Epikriz
                                    </button>
                                )}
                                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-6">
                            {/* ── Koyka haqi ─────────────────────────────────
                                Ilgari `dailyRate` bor edi, lekin hisoblaydigan
                                kod yo'q: bemor sakkiz kun yotib chiqar, hisobda
                                nol turardi (B44). Karta ochilganda hisob quvib
                                yetadi va takroriy qator yaratmaydi. */}
                            {/* ── Yotish hisobi ──────────────────────────────
                                Statsionar to'lovi tartibi yo'q edi: depozit,
                                oraliq hisob, chiqarishda yakuniy hisob — hech
                                narsa. Depozit alohida sxema emas: u avans
                                (`Patient.balance`), qaror В7. */}
                            {billing && (
                                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                        <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                                            <Wallet className="w-4 h-4 text-gray-400" />
                                            Yozilgan: <b className="tabular-nums">{fmt(billing.accrued)}</b>
                                        </span>
                                        <span className="text-sm text-emerald-600 dark:text-emerald-400">
                                            To'langan: <b className="tabular-nums">{fmt(billing.paid)}</b>
                                        </span>
                                        <span className={`text-sm ${billing.due > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400'}`}>
                                            Qarz: <b className="tabular-nums">{fmt(billing.due)}</b>
                                        </span>
                                        {billing.advance > 0 && (
                                            <span className="text-sm text-primary-600 dark:text-primary-400">
                                                Avansda: <b className="tabular-nums">{fmt(billing.advance)}</b>
                                            </span>
                                        )}
                                        {detail.status === 'Active' && detail.dailyRate > 0 && (
                                            <span className="text-xs text-gray-400 ml-auto">
                                                koyka {fmt(detail.dailyRate)}/kun
                                                {bedDays && bedDays.charged > 0 ? ` · +${bedDays.charged} kun yozildi` : ''}
                                            </span>
                                        )}
                                    </div>

                                    {/* Nima uchun bunday summa: koyka, dori, xizmat */}
                                    {Object.keys(billing.bySource || {}).length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                            {Object.entries(billing.bySource).map(([src, v]: any) => (
                                                <span key={src} className="text-[11px] text-gray-500 dark:text-gray-400">
                                                    {SOURCE_LABEL[src] || src}: <b className="tabular-nums">{fmt(v.total)}</b>
                                                    {v.paid > 0 && v.paid < v.total ? ` (to'landi ${fmt(v.paid)})` : ''}
                                                    {v.count > 1 ? ` · ${v.count} ta` : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {billing.due > 0 && billing.advance > 0 && (
                                        <p className="text-[11px] text-primary-700 dark:text-primary-300 mt-2">
                                            Bemorning avansi bor — kassada "Hisobdan (Avans)" usuli bilan yopish mumkin.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ── Bugungi obxod ─────────────────────────────
                                Kunlik obxod majburiy emas edi va "bugun yozuv
                                yo'q" degan ogohlantirish ham yo'q edi: bemor
                                bir necha kun yozuvsiz yotib qolishi mumkin
                                (GAP-ANALYSIS, 3-sahna, 6-band). Taqiq emas —
                                eslatma: yozuvni majburlab bo'lmaydi, lekin
                                uning yo'qligi ko'rinib turishi kerak. */}
                            {detail.status === 'Active' && !(detail.rounds || []).some(r => r.date === todayISO()) && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <CalendarDays className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                            Bugun obxod yozuvi yo'q
                                        </p>
                                        <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                                            {(() => {
                                                const last = (detail.rounds || [])[0];
                                                if (!last) return 'Yotgandan beri birorta obxod yozilmagan.';
                                                const days = Math.max(0, Math.round((Date.now() - new Date(last.date).getTime()) / 864e5));
                                                return `Oxirgi yozuv: ${last.date}${days > 0 ? ` (${days} kun oldin)` : ''}.`;
                                            })()}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* ── Harorat varag'i ───────────────────────────── */}
                            <div>
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                    <Activity className="w-4 h-4" /> Harorat varag'i
                                </h4>
                                <VitalsChart vitals={vitals} />
                            </div>

                            {/* ── Kunlik dori varag'i ───────────────────────── */}
                            {mar && (mar.orders || []).length > 0 && (
                                <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                            <ClipboardList className="w-4 h-4" /> Dori varag'i
                                        </h4>
                                        <input type="date" value={marDate}
                                            onChange={e => { setMarDate(e.target.value); reloadMar(e.target.value); }}
                                            className="ml-auto px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                    </div>

                                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                                        {mar.orders.map((o: any) => (
                                            <div key={o.id} className="p-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                            {o.name}
                                                            {o.dosage ? <span className="text-gray-500 font-normal"> · {o.dosage}</span> : null}
                                                        </p>
                                                        <p className="text-xs text-gray-400">
                                                            {[o.route, o.frequency].filter(Boolean).join(' · ') || 'Qabul tartibi ko\'rsatilmagan'}
                                                            {o.givenToday > 0 && (
                                                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> · bugun {o.givenToday} marta berildi</span>
                                                            )}
                                                        </p>
                                                    </div>

                                                    {canGiveMeds && detail.status === 'Active' && (
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <button onClick={() => giveMed(o.id, o.dosage)} disabled={marBusy === o.id}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                                                                {marBusy === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                                Berildi
                                                            </button>
                                                            <button onClick={() => { setSkipFor(o); setSkipReason(''); }}
                                                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                                                                Berilmadi
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Shu kundagi belgilar — kim va qachon */}
                                                {(o.administrations || []).length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {o.administrations.map((m: any) => (
                                                            <span key={m.id}
                                                                title={m.skipReason || m.note || ''}
                                                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${m.status === 'Given'
                                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                                                {new Date(m.givenAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                                                                {' · '}
                                                                {m.status === 'Given' ? 'berildi' : m.status === 'Refused' ? 'rad etdi' : "o'tkazildi"}
                                                                {m.givenByName ? ` · ${m.givenByName}` : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {!canGiveMeds && (
                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                            Belgi qo'yish hamshira, shifokor va adminda.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ── Ko'chirish tarixi ─────────────────────────── */}
                            {transferHistory.length > 0 && (
                                <div>
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                        <ArrowRightLeft className="w-4 h-4" /> Ko'chirishlar
                                    </h4>
                                    <div className="space-y-1">
                                        {transferHistory.map((t: any) => (
                                            <p key={t.id} className="text-xs text-gray-600 dark:text-gray-300">
                                                {fmtDate(t.movedAt)}
                                                {t.movedByName ? ` · ${t.movedByName}` : ''}
                                                {t.reason ? ` — ${t.reason}` : ''}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}


                            {/* Obxod qo'shish */}
                            {detail.status === 'Active' && (
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                        <Stethoscope className="w-4 h-4" /> Kunlik obxod
                                    </h4>
                                    <div className="grid grid-cols-3 gap-3 mb-3">
                                        <input value={roundForm.temperature} onChange={e => setRoundForm(f => ({ ...f, temperature: e.target.value }))} className={inputCls} placeholder={t('inp.tempPh')} />
                                        <input value={roundForm.bp} onChange={e => setRoundForm(f => ({ ...f, bp: e.target.value }))} className={inputCls} placeholder={t('inp.bpPh')} />
                                        <input value={roundForm.pulse} onChange={e => setRoundForm(f => ({ ...f, pulse: e.target.value }))} className={inputCls} placeholder={t('inp.pulsePh')} />
                                    </div>
                                    <textarea rows={2} value={roundForm.notes} onChange={e => setRoundForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} mb-2`} placeholder={t('inp.notesPh')} />
                                    <textarea rows={2} value={roundForm.plan} onChange={e => setRoundForm(f => ({ ...f, plan: e.target.value }))} className={`${inputCls} mb-3`} placeholder={t('inp.planPh')} />
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
                                        <input value={medForm.dosage} onChange={e => setMedForm(f => ({ ...f, dosage: e.target.value }))} className={inputCls} placeholder={t('inp.dosePh')} />
                                        <input value={medForm.route} onChange={e => setMedForm(f => ({ ...f, route: e.target.value }))} className={inputCls} placeholder={t('inp.routePh')} />
                                        <input value={medForm.frequency} onChange={e => setMedForm(f => ({ ...f, frequency: e.target.value }))} className={inputCls} placeholder="Kuniga 2 mahal" />
                                    </div>
                                    <button onClick={addMedication} disabled={saving} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50">
                                        Tayinlash
                                    </button>
                                </div>
                            )}

                            {!!detail.medicationOrders?.length && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('inp.medOrders')}</h4>
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

                            {/* Epikriz: to'rt qism. Eski yotishlarda faqat bitta
                                matn bor — u ham ko'rsatiladi. */}
                            {(() => {
                                const d: any = detail;
                                const parts: [string, string | null][] = [
                                    ['Kirishdagi tashxis', d.admissionDiagnosis],
                                    ['Yakuniy tashxis', d.finalDiagnosis],
                                    ["O'tkazilgan davolash", d.treatmentGiven],
                                    ['Tavsiyalar', d.recommendations],
                                    ["Qo'shimcha", d.dischargeSummary],
                                ];
                                const filled = parts.filter(([, v]) => v && String(v).trim());
                                if (filled.length === 0) return null;
                                return (
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('inp.dischargeEpicrisis')}</h4>
                                        <div className="space-y-2">
                                            {filled.map(([k, v]) => (
                                                <div key={k}>
                                                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{k}</p>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{v}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Yangi palata ──────────────────────────────────────────────── */}
            {showWard && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowWard(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{t('inp.newWard')}</h3>
                            <button onClick={() => setShowWard(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.name')}</label>
                                <input value={wardForm.name} onChange={e => setWardForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder={t('inp.wardNamePh')} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.kind')}</label>
                                <select value={wardForm.kind} onChange={e => setWardForm(f => ({ ...f, kind: e.target.value }))} className={inputCls}>
                                    {['Umumiy', 'Yarim lyuks', 'Lyuks', 'Reanimatsiya'].map(k => <option key={k}>{k}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.floor')}</label>
                                <input value={wardForm.floor} onChange={e => setWardForm(f => ({ ...f, floor: e.target.value }))} className={inputCls} placeholder="1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.dailyPrice')}</label>
                                <input type="number" value={wardForm.dailyRate} onChange={e => setWardForm(f => ({ ...f, dailyRate: e.target.value }))} className={inputCls} placeholder="150000" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.bedCount')}</label>
                                <input type="number" value={wardForm.bedCount} onChange={e => setWardForm(f => ({ ...f, bedCount: e.target.value }))} className={inputCls} />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setShowWard(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('common.cancel2')}</button>
                            <button onClick={createWard} disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? '...' : 'Yaratish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Qarz bilan chiqarish tasdig'i ────────────────────────────
                Taqiqlamaymiz: bemorni pul uchun ushlab turish tibbiy ham,
                huquqiy ham to'g'ri emas. Lekin jimgina ham o'tkazmaymiz. */}
            {debtConfirm && (
                <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={() => setDebtConfirm(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-3 mb-4">
                            <Wallet className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">{t('inp.hasDebt')}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {debtConfirm.count} qator, jami <b className="tabular-nums">{fmt(debtConfirm.due)}</b> so'm.
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            Chiqarish taqiqlanmaydi. Lekin qarz bemorning kartasida qoladi va
                            kassada ko'rinib turadi.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button onClick={() => { setDebtConfirm(null); }}
                                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                                Avval to'lash
                            </button>
                            <button onClick={() => { setDebtConfirm(null); doDischarge(true, true); }}
                                disabled={saving}
                                className="flex-1 px-4 py-2 border border-amber-400 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50">
                                Qarz bilan chiqarish
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dori berilmadi: SABAB majburiy ────────────────────────────
                "Belgi yo'q" bilan "bermadim, chunki bemor rad etdi" — bu ikki
                xil holat. Ikkinchisi tibbiy fakt va yozilishi kerak. */}
            {skipFor && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setSkipFor(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{t('inp.medNotGiven')}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{skipFor.name}</p>
                        <input value={skipReason} autoFocus
                            onChange={e => setSkipReason(e.target.value)}
                            placeholder={t('inp.notGivenPh')}
                            className={inputCls} />
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            Sabab yozuvda qoladi va o'chirilmaydi.
                        </p>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setSkipFor(null)}
                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                Bekor
                            </button>
                            <button onClick={skipMed} disabled={!skipReason.trim() || marBusy === skipFor.id}
                                className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                                Saqlash
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Ko'chirish ────────────────────────────────────────────────
                Band koyka ro'yxatda YO'Q: server ham rad etadi, lekin
                tanlanmaydigan variantni ko'rsatishning ma'nosi yo'q. */}
            {transferFor && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setTransferFor(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{t('inp.transferBed')}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            {transferFor.patientName} · hozir: {transferFor.bed ? `${transferFor.bed.ward?.name} / ${transferFor.bed.label}` : 'koyka biriktirilmagan'}
                        </p>

                        {freeBeds.length === 0 ? (
                            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    Bo'sh koyka yo'q. Tozalangan koykani "Koyka tayyor" bilan bo'shatish kerak.
                                </p>
                            </div>
                        ) : (
                            <>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('inp.newBed')}</label>
                                <select value={transferBed} onChange={e => setTransferBed(e.target.value)} className={inputCls}>
                                    <option value="">{t('common.chooseShort')}</option>
                                    {freeBeds.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                                </select>

                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 mt-3">{t('inp.reason')}</label>
                                <input value={transferReason} onChange={e => setTransferReason(e.target.value)}
                                    placeholder={t('inp.transferPh')} className={inputCls} />
                                <p className="text-[11px] text-gray-400 mt-1.5">
                                    Ko'chirish tarixda qoladi: bemor qayerda qancha yotgani ko'rinadi.
                                    Bo'shagan koyka tozalashga o'tadi.
                                </p>
                            </>
                        )}

                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setTransferFor(null)}
                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                Bekor
                            </button>
                            <button onClick={doTransfer} disabled={saving || !transferBed}
                                className="px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                                Ko'chirish
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Chiqarish: epikrizning to'rt qismi ────────────────────────
                Ilgari bu `prompt()` edi — bitta qatorli oyna, unda epikriz
                yozib bo'lmaydi. */}
            {dischargeFor && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setDischargeFor(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{t('inp.dischargeEpicrisis')}</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {dischargeFor.patientName} · {daysIn(dischargeFor.admittedAt, null)} kun yotdi
                            </p>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-3">
                            {([
                                ['admissionDiagnosis', 'Kirishdagi tashxis', 2],
                                ['finalDiagnosis', 'Yakuniy tashxis', 2],
                                ['treatmentGiven', "O'tkazilgan davolash", 4],
                                ['recommendations', 'Tavsiyalar', 3],
                            ] as const).map(([key, label, rows]) => (
                                <div key={key}>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
                                    <textarea rows={rows} value={(dischargeForm as any)[key]}
                                        onChange={e => setDischargeForm(f => ({ ...f, [key]: e.target.value }))}
                                        className={inputCls} />
                                </div>
                            ))}
                            <p className="text-[11px] text-gray-400">
                                Bo'sh qoldirilgan qism qog'ozda "Kiritilmagan" deb chiqadi. Chiqarishdan
                                oldin koyka haqi oxirgi kunga qadar hisoblanadi.
                            </p>
                        </div>

                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex flex-wrap justify-end gap-2">
                            <button onClick={() => setDischargeFor(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                Bekor qilish
                            </button>
                            <button onClick={() => doDischarge(false)} disabled={saving}
                                className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                                Chiqarish
                            </button>
                            <button onClick={() => doDischarge(true)} disabled={saving}
                                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                <Printer className="w-4 h-4" /> Chiqarish va bosish
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
