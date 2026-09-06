import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { formatUzPhone } from '../shared/validation';
import { formatFullName, formatNumber } from '../utils/format';
import { todayISO } from '../utils/dateUtils';
import { useNavigate } from 'react-router-dom';
import {
    UserPlus, Search, ArrowRight, Printer, Clock, Stethoscope,
    CheckCircle, AlertCircle, X, Phone, RefreshCw, Calendar as CalendarIcon,
} from 'lucide-react';
import { Patient, Doctor, Department, Service, Visit, Clinic } from '../types';
import { api } from '../services/api';
import { markAppointmentArrived } from '../utils/arrival';
import { useLanguage } from '../context/LanguageContext';
import { usePatientSearch } from '../hooks/usePatientSearch';
import { useHotkeys, useScannerInput } from '../hooks/useHotkeys';
import { useLiveUpdates, LiveEventType } from '../hooks/useLiveUpdates';

/* Modul darajasida — har renderda qayta obuna bo'lmasin */
const LIVE_EVENTS: LiveEventType[] = ['visit.created', 'visit.status'];

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

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);
const today = () => todayISO();

export const Reception: React.FC<Props> = ({
    clinicId, patients, doctors, departments, services, currentClinic, onPatientAdded, addToast,
}) => {
    const navigate = useNavigate();
    const { t } = useLanguage();

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

    /* Ikkinchi registrator qabul ochsa — bugungi navbat DARHOL yangilanadi.
       Ilgari ekran umuman yangilanmasdi va ikki registrator bir-birining
       ishini ko'rmasdi. */
    useLiveUpdates(LIVE_EVENTS, loadToday);

    /* Registratura orqali yozish MUMKIN bo'lgan bo'limlar (S5.2, audit B-20).

       Bu yerda ilgari faqat `CLINICAL` turdagi bo'limlar qolardi, izohi
       esa «laboratoriya/dorixonaga bemor to'g'ridan yozilmaydi» edi.

       LAB va PHARMACY uchun bu to'g'ri: tahlil va dori SHIFOKOR
       buyurtmasi bilan beriladi, registratura ularni o'zi ocholmaydi.

       DIAGNOSTIKA esa boshqacha — UZI, rentgen va EKG ga bemor
       to'g'ridan-to'g'ri keladi. Audit shuni topgan: «UZI ni faqat
       kalendar orqali yozish mumkin — ikki yo'l ikki xil xizmat
       ro'yxatini ko'rsatadi». */
    const BOOKABLE_TYPES = ['CLINICAL', 'DIAGNOSTIC'];
    const clinicalDepts = useMemo(
        () => departments.filter(d => d.isActive && BOOKABLE_TYPES.includes(d.type)),
        [departments],
    );

    /* Ro'yxatga TUSHMAGAN faol bo'limlar. Ular ekranda nomma-nom
       ko'rsatiladi: cheklov ataylab qo'yilgan bo'lsa ham, sababini
       aytmasdan yashirish «bo'lim yo'qoldi» degan taassurot beradi. */
    const hiddenDepts = useMemo(
        () => departments.filter(d => d.isActive && !BOOKABLE_TYPES.includes(d.type)),
        [departments],
    );

    /* Tanlangan bo'lim diagnostikami — shifokor talabini shu hal qiladi. */
    const isDiagnosticDept = useMemo(
        () => departments.find(d => d.id === departmentId)?.type === 'DIAGNOSTIC',
        [departments, departmentId],
    );

    /* Bo'lim tanlanmaguncha shifokor ro'yxati ham BO'SH.

       Ilgari bu yerda `!departmentId ||` turardi, ya'ni boshlang'ich
       holatda hamma shifokor ko'rinardi. Registrator avval shifokorni,
       keyin bo'limni tanlasa — bir-biriga mos kelmaydigan juftlik
       yaratardi va tanlov jimgina eskirib qolardi (audit XC-08).

       BO'LIMSIZ shifokor ham qoladi: eski o'rnatmalarda `departmentId`
       to'ldirilmagan yozuvlar bor va ular ro'yxatdan butunlay tushib
       ketmasligi kerak. */
    const deptDoctors = useMemo(
        () => !departmentId ? [] : doctors.filter(d =>
            d.status === 'Active' && (d.departmentId === departmentId || !d.departmentId)),
        [doctors, departmentId],
    );

    /* Faqat tanlangan bo'lim xizmatlari. Bo'lim tanlanmaguncha ro'yxat
       BO'SH — aks holda begona bo'lim xizmatini tanlab yuborish mumkin.

       BO'LIMSIZ xizmat ham chiqadi. `departmentId` xizmatlarga keyin
       qo'shilgan: undan oldin yaratilgan hamma xizmatda u bo'sh va
       qat'iy tenglik ularni Registraturadan BUTUNLAY yo'q qilardi —
       ya'ni ishlab turgan klinikada narxlar ro'yxati bir kunda
       ko'rinmay qolardi (audit XC-06). */
    const deptServices = useMemo(
        () => !departmentId ? [] : services.filter(s =>
            s.departmentId === departmentId || !s.departmentId),
        [services, departmentId],
    );

    /** Qabulni ochishga nima to'sqinlik qilyapti. `null` — hammasi tayyor. */
    const blockingReason = useMemo(() => {
        if (!patient) return 'Avval bemorni tanlang yoki yangisini qo\'shing.';
        if (!departmentId) return "Bo'limni tanlang.";
        if (!isDiagnosticDept && !doctorId && deptDoctors.length > 0) return 'Shifokorni tanlang.';
        return null;
    }, [patient, departmentId, isDiagnosticDept, doctorId, deptDoctors]);

    const selectedService = useMemo(
        () => services.find(s => s.id === serviceId),
        [services, serviceId],
    );

    /* Qidiruv SERVERDA. Ilgari bu yerda brauzerdagi massiv filtrlanardi va
       faqat ism + telefon bo'yicha — ya'ni KARTA RAQAMI bo'yicha bemorni
       topib bo'lmasdi, garchi server buni qila olsa ham. Endi server
       qidiruvi ishlatiladi: ism, familiya, telefon, karta raqami, JSHSHIR. */
    const { results: found, loading: searching, error: searchError } = usePatientSearch(search);

    /* ─── Klaviatura oqimi (FIX-PLAN 8.2) ────────────────────────────────
       Maqsad: yangi bemorni qabulga yozish sichqonga TEGMASDAN bajarilsin. */
    const searchRef = React.useRef<HTMLInputElement>(null);
    const deptRef = React.useRef<HTMLSelectElement>(null);

    useHotkeys(React.useMemo(() => ({
        // Qidiruvga qaytish — bemor tanlangan bo'lsa ham
        F3: () => { setPatient(null); setSearch(''); setTimeout(() => searchRef.current?.focus(), 0); },
        Escape: () => {
            // Avval qidiruvni tozalaydi, bo'sh bo'lsa tanlovni bekor qiladi
            if (search) setSearch('');
            else if (patient) setPatient(null);
        },
    }), [search, patient]));

    /* Skaner klaviatura sifatida ishlaydi: kodni tez "yozadi" va Enter bosadi.
       Uni qidiruvga yuboramiz — karta raqami server qidiruviga tushadi. */
    useScannerInput(React.useCallback((code: string) => {
        setPatient(null);
        setSearch(code);
    }, []), !patient);

    /* Bemor tanlangach fokus O'ZI bo'limga o'tadi — registrator sichqonga
       qo'l uzatmaydi. Xuddi shu sabab bilan bo'lim tanlangach shifokorga
       o'tish ham kerak edi, lekin u `select` avtomatik birinchi qiymatni
       oladi va qo'shimcha sakrash chalkashtiradi. */
    React.useEffect(() => {
        if (patient) setTimeout(() => deptRef.current?.focus(), 0);
    }, [patient]);

    // Bo'lim almashsa, unga tegishsiz tanlovlarni tozalaymiz
    useEffect(() => {
        setDoctorId('');
        const first = services.find(s => s.departmentId === departmentId);
        setServiceId(first?.id ?? '');
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

    /* ─────────────────────────────────────────────────────────────
       BUGUN YOZILGANLAR — Registratura bilan Kalendar orasidagi ko'prik.

       Bu bo'g'in YO'Q edi. `Reception.tsx` da `appointment` so'zi
       umuman uchramasdi, ya'ni:

         · registrator ertalab ochsa, bugunga kim yozilganini ko'rmasdi
         · yozilgan bemor kelganda uni NOLDAN qidirib, bo'lim, shifokor
           va xizmatni qaytadan tanlashi kerak edi — holbuki bularning
           hammasi yozilish paytida allaqachon tanlangan
         · kalendardagi yozuv hech qachon yopilmasdi va «Confirmed»
           holatida abadiy qolib ketardi, ya'ni «kim kelmadi?» degan
           savolga javob berib bo'lmasdi

       Baza va API buni ALLAQACHON qo'llab-quvvatlardi: `Visit`
       modelida `appointmentId` bor va qabul yaratish marshruti uni
       qabul qilib saqlaydi. Faqat ekranda tugmasi yo'q edi. */
    const [todayAppts, setTodayAppts] = useState<any[]>([]);
    const [arriving, setArriving] = useState<string | null>(null);

    const loadTodayAppts = React.useCallback(async () => {
        try {
            const d = today();
            const list = await api.appointments.getAll(clinicId, { from: d, to: d });
            setTodayAppts(Array.isArray(list) ? list : []);
        } catch {
            /* Panel qo'shimcha — u yuklanmasa ham registratura ishlayveradi. */
            setTodayAppts([]);
        }
    }, [clinicId]);

    useEffect(() => { loadTodayAppts(); }, [loadTodayAppts]);

    /* Hali kelmaganlar. Yakunlangan va bekor qilinganlar ko'rsatilmaydi —
       ular bilan qiladigan ish qolmagan. */
    const waitingAppts = useMemo(
        () => todayAppts
            .filter(a => !['Completed', 'Cancelled', 'No-Show', 'Checked-In'].includes(a.status))
            .sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))),
        [todayAppts],
    );

    /* «Keldi» — kalendardagi yozuv bilan navbat orasidagi ko'prik.
       Mantiq `utils/arrival.ts` da: kalendar ham xuddi shu funksiyani
       chaqiradi, ya'ni qoida bitta joyda turadi. */
    const markArrived = async (appt: any) => {
        setArriving(appt.id);
        setError('');
        try {
            const r = await markAppointmentArrived(appt, { doctors, services });
            if (r.appointmentNotClosed) {
                addToast('info', "Qabul ochildi, lekin kalendardagi yozuv holati yangilanmadi");
            }
            setLastTicket({ ...r.visit, patient: appt.patient || null });
            addToast('success', `${appt.patientName} — navbat №${r.visit.queueNumber ?? '—'}`);
            loadToday();
            loadTodayAppts();
        } catch (e: any) {
            const f = e?.failure;
            if (f?.code === 'EXISTS') {
                addToast('info', e.message);
                navigate(`/patients/${appt.patientId}?visit=${f.visitId}`);
                return;
            }
            setError(e?.message || "Qabulni ochib bo'lmadi");
        } finally {
            setArriving(null);
        }
    };

    const openVisit = async () => {
        if (!patient) { setError('Bemorni tanlang'); return; }
        if (!departmentId) { setError("Bo'limni tanlang"); return; }

        /* SHIFOKORSIZ QABUL (audit B-21).

           Audit: «Shifokor "Belgilanmagan" bo'lsa ham qabul yaratiladi va
           "Bemor shifokor navbatiga qo'shildi" deb yoziladi. Bunday yozuv
           hech kimning "Mening navbatim" ida ko'rinmaydi» — ya'ni bemor
           navbatga tushdi deb o'ylaydi, lekin uni hech kim ko'rmaydi.

           DIAGNOSTIKADA shifokor shart emas: tekshiruvni laborant yoki
           texnik bajaradi va u navbat ro'yxatiga bog'lanmaydi. */
        if (!isDiagnosticDept && !doctorId) {
            setError("Shifokorni tanlang — aks holda qabul hech kimning navbatida ko'rinmaydi");
            return;
        }
        setSaving(true); setError('');
        try {
            const doc = doctors.find(d => d.id === doctorId);
            const visit = await api.visits.create({
                patientId: patient.id,
                departmentId,
                doctorId: doctorId || undefined,
                doctorName: doc ? `${formatFullName(doc)}` : undefined,
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
            /* 409 — bugun shu bo'limda qabul allaqachon ochilgan. Bu XATO
               emas, holat: registratura ikki marta bosgan yoki bemor
               qaytib kelgan. Ilgari server tekshirmasdi va ikkinchi navbat
               raqami bilan ikkinchi konsultatsiya ochilardi — bemor ikki
               marta to'lardi (GAP-ANALYSIS, 1-sahna, 9-band).

               Jimgina biriktirib qo'ymaymiz ham: qarorni odam qabul qiladi. */
            if (e?.status === 409 && e?.data?.visitId) {
                setDuplicate({
                    visitId: e.data.visitId,
                    queueNumber: e.data.queueNumber ?? null,
                    status: e.data.status || '',
                });
            } else {
                setError(e.message || 'Qabul ochilmadi');
            }
        } finally { setSaving(false); }
    };

    /* Takroriy qabul: mavjudini ochish yoki ataylab yangisini yaratish */
    const [duplicate, setDuplicate] = useState<{ visitId: string; queueNumber: number | null; status: string } | null>(null);

    const openExisting = () => {
        if (!duplicate) return;
        const id = duplicate.visitId;
        setDuplicate(null);
        navigate(`/patients/${patient?.id}?visit=${id}`);
    };

    const forceNew = async () => {
        setDuplicate(null);
        setSaving(true); setError('');
        try {
            const doc = doctors.find(d => d.id === doctorId);
            const visit = await api.visits.create({
                patientId: patient!.id,
                departmentId,
                doctorId: doctorId || undefined,
                doctorName: doc ? `${formatFullName(doc)}` : undefined,
                complaints: complaints || undefined,
                date: today(),
                status: 'Waiting',
                force: true,
            });
            if (serviceId) {
                try { await api.visits.addProcedure(visit.id, { serviceId: Number(serviceId) }); }
                catch (err) { console.error("Xizmat qo'shilmadi", err); }
            }
            setLastTicket({ ...visit, patient: patient! });
            addToast('success', `Ikkinchi qabul ochildi — navbat №${visit.queueNumber ?? '—'}`);
            reset();
            loadToday();
        } catch (e: any) {
            setError(e.message || 'Qabul ochilmadi');
        } finally { setSaving(false); }
    };

    const printTicket = (v: Visit) => {
        const dept = departments.find(d => d.id === v.departmentId);
        // Kabinet raqami — bemor qaysi xonaga borishini bilishi kerak
        const room = doctors.find(d => d.id === v.doctorId)?.room || '';
        const w = window.open('', '_blank', 'width=380,height=520');
        if (!w) return;
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>{t('reception.ticket')}</title>
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
${room ? `<div class="d"><b>Kabinet: ${room}</b></div>` : ''}
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
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('reception.title')}</h2>
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

                {/* ── Bugun yozilganlar ──────────────────────────────────
                    Kalendardan kelgan ro'yxat. Pastdagi qo'lda ochish
                    yo'li yo'qolmaydi — kim yozilmasdan kelsa, o'sha
                    orqali kiritiladi. */}
                {waitingAppts.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                Bugunga yozilganlar
                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                    {waitingAppts.length}
                                </span>
                            </h3>
                            <button type="button" onClick={() => navigate('/calendar')}
                                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                                Kalendar →
                            </button>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {waitingAppts.map(a => (
                                <div key={a.id}
                                    className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                                    <span className="text-sm font-semibold tabular-nums text-gray-500 dark:text-gray-400 w-12 shrink-0">
                                        {a.time || '—'}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.patientName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                            {a.type || 'Qabul'}{a.doctorName ? ` · ${a.doctorName}` : ''}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => markArrived(a)}
                                        disabled={arriving === a.id}
                                        title="Qabulni ochish — bo'lim, shifokor va xizmat yozuvdan olinadi"
                                        className="shrink-0 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                                    >
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        {arriving === a.id ? 'Ochilmoqda...' : 'Keldi'}
                                    </button>
                                </div>
                            ))}
                        </div>
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
                                <p className="font-medium text-gray-900 dark:text-white truncate">{formatFullName(patient)}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> {formatUzPhone(patient.phone)}
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
                                <input ref={searchRef} autoFocus value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => {
                                        /* Enter: yagona natija bo'lsa uni tanlaydi. Ro'yxatdan
                                           sichqon bilan tanlash o'rniga — bir tugma. */
                                        if (e.key === 'Enter' && found.length === 1) {
                                            e.preventDefault();
                                            setPatient(found[0]);
                                        }
                                    }}
                                    placeholder={t('reception.searchPh')} className={`${inputCls} pl-9`} />
                            </div>

                            {found.length > 0 && (
                                <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-56 overflow-y-auto">
                                    {found.map(p => (
                                        <button key={p.id} onClick={() => setPatient(p)}
                                            className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{formatFullName(p)}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{formatUzPhone(p.phone)}</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-gray-300" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {search.trim().length >= 2 && searching && (
                                <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">{t('reception.searching')}</p>
                            )}
                            {searchError && (
                                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{searchError}</p>
                            )}
                            {search.trim().length >= 2 && !searching && !searchError && found.length === 0 && (
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('reception.notFound')}</p>
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
                        {/* Yorliqlar `htmlFor` orqali maydonga ulanadi: ekran
                            o'quvchi dasturda maydon nomsiz o'qilmasin va
                            yorliqni bosganda fokus maydonga tushsin. */}
                        <div>
                            <label htmlFor="rc-dept" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('reception.department')}</label>
                            <select id="rc-dept" ref={deptRef} value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={inputCls}>
                                <option value="">{t('reception.choose')}</option>
                                {clinicalDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {/* Ro'yxatda hamma bo'lim yo'q — buni AYTIB qo'yamiz.
                                Ilgari laboratoriya yoki dorixona bo'limini
                                yaratgan odam uni bu yerda topolmay, dastur
                                buzuq deb o'ylardi (audit XC-05). */}
                            {hiddenDepts.length > 0 && (
                                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                                    {hiddenDepts.map(d => d.name).join(', ')} — bu yerda yo'q: ular shifokor buyurtmasi bilan ochiladi.
                                </p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="rc-doctor" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                                Shifokor{isDiagnosticDept ? '' : ' *'}
                                {deptDoctors.length === 0 && departmentId ? " (bo'limda shifokor yo'q)" : ''}
                            </label>
                            <select id="rc-doctor" value={doctorId} onChange={e => setDoctorId(e.target.value)}
                                disabled={!departmentId} className={inputCls}>
                                <option value="">
                                    {!departmentId ? "Avval bo'limni tanlang"
                                        : isDiagnosticDept ? t('reception.unassigned') : 'Shifokorni tanlang'}
                                </option>
                                {deptDoctors.map(d => <option key={d.id} value={d.id}>{formatFullName(d)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="rc-service" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Xizmat (qabul turi)</label>
                            <select id="rc-service" value={serviceId} onChange={e => setServiceId(e.target.value ? Number(e.target.value) : '')}
                                disabled={!departmentId} className={inputCls}>
                                <option value="">{departmentId ? 'Xizmatsiz' : "Avval bo'limni tanlang"}</option>
                                {deptServices.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                            </select>
                            {departmentId && deptServices.length === 0 && (
                                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                    Bu bo'limga xizmat biriktirilmagan — Sozlamalar &gt; Xizmatlar bo'limida belgilang.
                                </p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="rc-complaints" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Shikoyat (ixtiyoriy)</label>
                            <input id="rc-complaints" value={complaints} onChange={e => setComplaints(e.target.value)} className={inputCls} placeholder={t('reception.complaintsPh')} />
                        </div>
                    </div>
                </div>

                {/* 3. Qabulni ochish */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-4">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('reception.toPay')}</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                            {fmt(selectedService?.price || 0)} <span className="text-base font-normal">so'm</span>
                        </p>
                    </div>
                    {/* NIMA YETISHMAYOTGANI aytiladi. Ilgari tugma jimgina
                        o'chiq turardi va registrator uchun u shunchaki
                        «ishlamayapti» bo'lib ko'rinardi (audit XC-09).

                        `aria-label` ham tuzatildi: u «Oldinga» deb turardi,
                        ya'ni ekran o'quvchi dastur tugmaning nima
                        qilishini noto'g'ri o'qirdi. */}
                    <div className="ml-auto flex items-center gap-3">
                        {blockingReason && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 max-w-[16rem] text-right">{blockingReason}</p>
                        )}
                        <button aria-label="Qabulni ochish" onClick={openVisit} disabled={!!blockingReason || saving}
                            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            {saving ? 'Ochilmoqda...' : 'Qabulni ochish'} <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Oxirgi talon */}
                {lastTicket && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
                        <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                                Navbat №{lastTicket.queueNumber} — {lastTicket.patient?.lastName} {lastTicket.patient?.firstName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('reception.queued')}</p>
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
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t('reception.todayQueue')}</h3>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{todayVisits.length} ta</span>
                    <button aria-label={t('reception.refresh')} onClick={loadToday} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title={t('reception.refresh')}>
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {todayVisits.length === 0 ? (
                    <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('reception.noVisits')}</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                        {todayVisits.map(v => {
                            const done = v.status === 'Completed';
                            return (
                                <button key={v.id} onClick={() => navigate(`/patients/${v.patientId}?visit=${v.id}`)}
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
                            <h3 className="font-semibold text-gray-900 dark:text-white">{t('reception.newPatient')}</h3>
                            <button onClick={() => setShowNewPatient(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('reception.lastName')}</label>
                                <input value={np.lastName} onChange={e => setNp(f => ({ ...f, lastName: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Ism</label>
                                <input value={np.firstName} onChange={e => setNp(f => ({ ...f, firstName: e.target.value }))} className={inputCls} />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('reception.phone')}</label>
                                <input value={np.phone} onChange={e => setNp(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="+998 90 123 45 67" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('reception.dob')}</label>
                                <input type="date" value={np.dob} onChange={e => setNp(f => ({ ...f, dob: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('reception.gender')}</label>
                                <select value={np.gender} onChange={e => setNp(f => ({ ...f, gender: e.target.value }))} className={inputCls}>
                                    <option value="Male">{t('reception.male')}</option>
                                    <option value="Female">{t('reception.female')}</option>
                                </select>
                            </div>
                            <p className="col-span-2 text-xs text-gray-400 dark:text-gray-500">
                                Jins va tug'ilgan sana tahlil normalarini to'g'ri tanlash uchun kerak.
                            </p>
                        </div>
                        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button onClick={() => setShowNewPatient(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">{t('reception.cancel')}</button>
                            <button onClick={createPatient} disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {saving ? '...' : 'Qo\'shish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Takroriy qabul ────────────────────────────────────────────
                Ilgari server tekshirmasdi: registratura ikki marta bosса,
                o'sha bemorga o'sha bo'limda ikkinchi navbat raqami va ikkinchi
                konsultatsiya ochilardi — bemor ikki marta to'lardi.

                Qaror odamda: mavjudini ochish yoki ataylab yangisini yaratish
                (ertalab va kechqurun alohida murojaat bo'lishi mumkin). */}
            {duplicate && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDuplicate(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-3 mb-4">
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                    Bu bemorga bugun qabul ochilgan
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Shu bo'limda navbat №{duplicate.queueNumber ?? '—'}
                                    {duplicate.status ? `, holati: ${duplicate.status}` : ''}.
                                </p>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            Yangi qabul ochilsa, konsultatsiya narxi IKKINCHI marta
                            hisobga tushadi. Bemor qaytib kelgan bo'lsa — mavjud qabulni ochish kerak.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-2">
                            <button onClick={openExisting}
                                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                                Mavjud qabulni ochish
                            </button>
                            <button onClick={forceNew} disabled={saving}
                                className="flex-1 px-4 py-2 border border-amber-400 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50">
                                Baribir yangisini ochish
                            </button>
                        </div>
                        <button onClick={() => setDuplicate(null)}
                            className="w-full mt-2 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            Bekor qilish
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};
