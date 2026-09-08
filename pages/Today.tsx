import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { formatUzPhone } from '../shared/validation';
import { formatFullName, formatNumber, formatDateLong } from '../utils/format';
import { todayISO } from '../utils/dateUtils';
import { useNavigate } from 'react-router-dom';
import {
    UserPlus, Search, ArrowRight, Printer, Clock, Stethoscope,
    CheckCircle, AlertCircle, X, Phone, RefreshCw, Calendar as CalendarIcon,
    Volume2, FlaskConical, BellRing, CalendarClock, Tv,
} from 'lucide-react';
import { Patient, Doctor, Department, Service, Visit, Clinic, UserRole } from '../types';
import { api } from '../services/api';
import { markAppointmentArrived } from '../utils/arrival';
import { maskPhone } from '../utils/accessControl';
import { useLanguage } from '../context/LanguageContext';
import { usePatientSearch } from '../hooks/usePatientSearch';
import { useHotkeys, useScannerInput } from '../hooks/useHotkeys';
import { useLiveUpdates, LiveEventType } from '../hooks/useLiveUpdates';
import { PatientFormModal } from '../components/PatientFormModal';
import { OwnerHome } from '../components/OwnerHome';

/* Modul darajasida — har renderda qayta obuna bo'lmasin */
const LIVE_EVENTS: LiveEventType[] = ['visit.created', 'visit.status', 'charge.paid'];

/* ─────────────────────────────────────────────────────────────────────────────
   BUGUN — klinikaning kunlik ish ekrani. Rolga qarab boshqacha ko'rinadi.

   Ilgari bu UCHTA ekran edi va ular bir xil `Visit` jadvalini ko'rsatardi:
   «Registratura» (o'ng ustunda bugungi navbat), «Mening navbatim» (o'sha
   navbat, boshqacha guruhlangan) va «Boshqaruv paneli» (bugungi yozuvlar
   jadvali). Registrator kelgan bemorni belgilash uchun Registraturaga,
   shifokor esa o'z navbatini ko'rish uchun boshqa ekranga borardi.

   ENDI BITTA:
     · registrator va ega — yangi qabul ochish mastero + butun klinika
       navbati + bugunga yozilganlar;
     · shifokor — natijasi tayyor bo'lganlar, o'z navbati, natija
       kutayotganlar va bugun yakunlanganlar.

   Bemor baribir bir marta tanlanadi, qolgan hamma narsa bemor kartasidan
   bajariladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    clinicId: string;
    patients: Patient[];
    doctors: Doctor[];
    departments: Department[];
    services: Service[];
    currentClinic?: Clinic | null;
    userRole: UserRole;
    /** Kirgan shifokor — navbat faqat unga tegishli bo'ladi */
    doctorId?: string;
    /* Ruxsatlar: telefon raqamini ko'rsatish. Ilgari bu bayroq FAQAT
       «Bemorlar» va bemor kartasiga uzatilardi — Registraturada esa
       raqam ochiq turardi, ya'ni cheklov aylanib o'tilardi. */
    showPatientPhone?: boolean;
    /* Bemor yaratish — App dagi yagona yo'l orqali (`addPatient`).
       Ilgari bu ekran `api.patients.create` ga TO'G'RIDAN-TO'G'RI yozardi
       va shu sababli takror tekshiruvi (409) ham, maydon tekshiruvi ham
       ishlamasdi: «abcdefg!!!» telefon sifatida o'tib ketardi. */
    onCreatePatient: (data: Omit<Patient, 'id' | 'clinicId'>) => Promise<Patient | void>;
    onPatientAdded: (p: Patient) => void;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
    /** Salomlashish uchun — eganing tasmasida ko'rinadi */
    userName?: string;
}

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);
const today = () => todayISO();

export const Today: React.FC<Props> = ({
    clinicId, patients, doctors, departments, services, currentClinic,
    userRole, doctorId: myDoctorId, showPatientPhone = true,
    onCreatePatient, onPatientAdded, addToast, userName,
}) => {
    const showPhone = (v?: string) => showPatientPhone ? formatUzPhone(v || '') : maskPhone(v);
    const navigate = useNavigate();
    const { t, language } = useLanguage();

    /* Kim nima ko'radi. Ega ikkalasini ham ko'radi: kichik klinikada u
       ham registrator, ham shifokor bo'lishi mumkin. */
    const canRegister = userRole === UserRole.RECEPTIONIST || userRole === UserRole.CLINIC_ADMIN;
    const isDoctorView = userRole === UserRole.DOCTOR || userRole === UserRole.CLINIC_ADMIN
        || userRole === UserRole.NURSE;

    const [search, setSearch] = useState('');
    const [patient, setPatient] = useState<Patient | null>(null);
    const [departmentId, setDepartmentId] = useState('');
    const [doctorId, setDoctorId] = useState('');
    const [serviceId, setServiceId] = useState<number | ''>('');
    const [complaints, setComplaints] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [showNewPatient, setShowNewPatient] = useState(false);

    const [todayVisits, setTodayVisits] = useState<Visit[]>([]);
    const [lastTicket, setLastTicket] = useState<Visit | null>(null);

    /* «Natija tayyor, lekin ko'rilmagan» — ALOHIDA so'rov.
       Sabab: bu ekran BUGUNGI sanani so'raydi, tahlil esa ertaga tayyor
       bo'lishi mumkin — o'sha qabul kechagi kunda qolib, shifokor
       ko'zidan butunlay g'oyib bo'lardi (GAP-ANALYSIS, B22). */
    const [pending, setPending] = useState<any[]>([]);
    const [busyVisit, setBusyVisit] = useState<string | null>(null);

    const loadToday = useCallback(async () => {
        try {
            const [vs, pr] = await Promise.all([
                api.visits.getAll({ date: today() }),
                api.clinical.pendingResults().catch(() => [] as any[]),
            ]);
            setTodayVisits(vs);
            setPending(pr || []);
        }
        catch { /* navbat yuklanmasa ham qabul ochish ishlayveradi */ }
    }, []);
    useEffect(() => { loadToday(); }, [loadToday]);

    /* Shifokor FAQAT o'z bemorlarini ko'radi. Ega va registrator —
       butun klinikani. */
    const myVisits = useMemo(
        () => userRole === UserRole.DOCTOR && myDoctorId
            ? todayVisits.filter(v => v.doctorId === myDoctorId)
            : todayVisits,
        [todayVisits, userRole, myDoctorId],
    );

    const groups = useMemo(() => ({
        active: myVisits.filter(v => ['Waiting', 'Called', 'In Progress'].includes(v.status)),
        done: myVisits.filter(v => v.status === 'Completed').slice(0, 10),
    }), [myVisits]);

    /** Natijasi tayyor va hali ko'rilmaganlar — eng tepada turadi */
    const readyUnseen = useMemo(() => pending.filter(r => (r.unseenCount || 0) > 0), [pending]);
    const stillWaiting = useMemo(() => pending.filter(r => !(r.unseenCount || 0)), [pending]);

    /** Navbatga chaqirish — tablo shu holatni ko'rsatadi */
    const callVisit = async (v: Visit) => {
        setBusyVisit(v.id);
        try { await api.visits.call(v.id); await loadToday(); addToast('success', `№${v.queueNumber ?? '—'} chaqirildi`); }
        catch (e: any) { addToast('error', e?.message || 'Xatolik'); }
        finally { setBusyVisit(null); }
    };

    /** Qabulni ochish — bemor kartasiga o'tadi va holat «Qabulda» bo'ladi */
    const openVisitCard = async (v: Visit) => {
        if (v.status === 'Waiting' || v.status === 'Called') {
            try { await api.visits.update(v.id, { status: 'In Progress' }); } catch { /* ochilaversin */ }
        }
        navigate(`/patients/${v.patientId}?visit=${v.id}`);
    };

    /** Necha daqiqadan beri kutyapti */
    const waitedMin = (v: Visit) => {
        const from = v.checkInTime ? new Date(v.checkInTime).getTime() : 0;
        if (!from) return null;
        return Math.max(0, Math.round((Date.now() - from) / 60000));
    };

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

    const inputCls = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
    const stepDone = 'bg-emerald-500 text-white';
    const stepNow = 'bg-primary-600 text-white';
    const stepIdle = 'bg-elevated text-muted';

    const step = !patient ? 1 : !departmentId ? 2 : 3;

    return (
        <>
        {/* ── EGANING TASMASI ────────────────────────────────────────────────
            Faqat klinika egasiga. Registrator va shifokorda ekran
            o'zgarmaydi: ularga oylik fondi ham, vedomost ham kerak emas va
            server bu marshrutlarga 403 qaytaradi. */}
        {userRole === UserRole.CLINIC_ADMIN && <OwnerHome userName={userName} />}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* ── Chap: qabul ochish ────────────────────────────────────────── */}
            <div className="xl:col-span-2 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <Stethoscope className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                    <h2 className="text-xl font-bold text-ink">{t('today.title')}</h2>
                    {/* Sana loyihaning O'Z formatlagichidan. `toLocaleDateString('uz-UZ')`
                        Chrome da «M09 6, Sun» beradi — `uz` lokali to'liq emas. Xuddi
                        shu sabab bilan raqamlar ham `formatNumber` orqali chiqadi. */}
                    <span className="text-sm text-muted">
                        {formatDateLong(new Date(), language === 'ru' ? 'ru' : 'uz')}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={loadToday} aria-label={t('reception.refresh')} title={t('reception.refresh')}
                            className="p-2 text-faint hover:text-muted rounded-lg">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        {canRegister && (
                            <button onClick={() => navigate('/board')}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-line text-muted hover:border-primary-400">
                                <Tv className="w-4 h-4" /> {t('today.board')}
                            </button>
                        )}
                    </div>
                </div>


                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                        <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* ── SHIFOKOR BO'LIMLARI ─────────────────────────────────
                    Ilgari bular alohida ekran edi («Mening navbatim») va
                    shifokor navbatni ko'rish uchun boshqa sahifaga o'tardi. */}
                {isDoctorView && readyUnseen.length > 0 && (
                    <div className="bg-surface rounded-xl border border-purple-300 dark:border-purple-700 p-4">
                        <h3 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
                            <BellRing className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            {t('today.resultsReady')}
                            <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                {readyUnseen.length}
                            </span>
                        </h3>
                        <div className="space-y-2">
                            {readyUnseen.map(r => (
                                <button key={r.visitId}
                                    onClick={() => navigate(`/patients/${r.patientId}?visit=${r.visitId}`)}
                                    className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-900/20 hover:border-purple-400 transition-colors">
                                    <FlaskConical className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-ink truncate">{r.patientName}</p>
                                        <p className="text-xs text-muted truncate">
                                            {r.department || '—'}
                                            {r.date && r.date !== today() ? ` · ${r.date}` : ''}
                                        </p>
                                    </div>
                                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-600 text-white">
                                        {r.unseenCount} {t('today.newResult')}
                                    </span>
                                    <ArrowRight className="w-4 h-4 text-purple-300 shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isDoctorView && stillWaiting.length > 0 && (
                    <div className="bg-surface rounded-xl border border-line p-4">
                        <h3 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
                            <CalendarClock className="w-4 h-4 text-amber-500" />
                            {t('today.awaitingResults')}
                            <span className="px-2 py-0.5 text-xs rounded-full bg-elevated text-muted">
                                {stillWaiting.length}
                            </span>
                        </h3>
                        <div className="space-y-2">
                            {stillWaiting.map(r => (
                                <button key={r.visitId}
                                    onClick={() => navigate(`/patients/${r.patientId}?visit=${r.visitId}`)}
                                    className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg border border-line hover:border-primary-400 transition-colors">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-ink truncate">{r.patientName}</p>
                                        <p className="text-xs text-muted truncate">
                                            {r.department || '—'}
                                            {/* `0 ta kutilmoqda` hech narsa aytmaydi. Bunday
                                                qabul aslida OSILIB QOLGAN: natija ham
                                                kutilmayapti, ko'rilmagan natija ham yo'q. */}
                                            {r.stillPending > 0
                                                ? ` · ${r.stillPending} ${t('today.pendingShort')}`
                                                : ` · ${t('today.stuck')}`}
                                        </p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-faint shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isDoctorView && groups.done.length > 0 && (
                    <div className="bg-surface rounded-xl border border-line p-4">
                        <h3 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            {t('today.finished')}
                            <span className="px-2 py-0.5 text-xs rounded-full bg-elevated text-muted">
                                {groups.done.length}
                            </span>
                        </h3>
                        <div className="space-y-1.5">
                            {groups.done.map(v => (
                                <button key={v.id} onClick={() => navigate(`/patients/${v.patientId}?visit=${v.id}`)}
                                    className="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-elevated">
                                    <span className="text-xs tabular-nums text-faint w-6 shrink-0">{v.queueNumber ?? '—'}</span>
                                    <span className="text-sm text-muted truncate flex-1">
                                        {v.patient?.lastName} {v.patient?.firstName}
                                    </span>
                                    <span className="text-xs text-faint truncate">{v.department?.name || ''}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {/* ── Bugun yozilganlar ──────────────────────────────────
                    Kalendardan kelgan ro'yxat. Pastdagi qo'lda ochish
                    yo'li yo'qolmaydi — kim yozilmasdan kelsa, o'sha
                    orqali kiritiladi. */}
                {waitingAppts.length > 0 && (
                    <div className="bg-surface rounded-xl border border-line p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                Bugunga yozilganlar
                                <span className="px-2 py-0.5 text-xs rounded-full bg-elevated text-muted">
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
                                    className="flex items-center gap-3 p-2.5 rounded-lg border border-line bg-canvas/40">
                                    <span className="text-sm font-semibold tabular-nums text-muted w-12 shrink-0">
                                        {a.time || '—'}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-ink truncate">{a.patientName}</p>
                                        <p className="text-xs text-muted truncate">
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

                {/* ── QABUL OCHISH MASTERO — faqat registrator va ega ────
                    Qadam ko'rsatkichi masteroning YONIDA: ilgari u ekran
                    tepasida turardi va shifokor bo'limlari orasida
                    ma'nosiz osilib qolardi. */}
                {canRegister && (<>
                <div className="flex items-center gap-2 text-sm pt-2">
                    {[['1', 'Bemor'], ['2', "Bo'lim"], ['3', 'Qabul']].map(([n, label], i) => {
                        const idx = i + 1;
                        const cls = step > idx ? stepDone : step === idx ? stepNow : stepIdle;
                        return (
                            <React.Fragment key={n}>
                                <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${cls}`}>
                                    {step > idx ? <CheckCircle className="w-3.5 h-3.5" /> : n}
                                </span>
                                <span className={step >= idx ? 'text-ink font-medium' : 'text-faint'}>{label}</span>
                                {idx < 3 && <ArrowRight className="w-4 h-4 text-faint mx-1" />}
                            </React.Fragment>
                        );
                    })}
                </div>
                {/* 1. Bemor */}
                <div className="bg-surface rounded-xl border border-line p-4">
                    <h3 className="text-sm font-semibold text-ink mb-3">1. Bemor</h3>

                    {patient ? (
                        <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
                            <div className="w-10 h-10 rounded-full bg-primary-600 text-white grid place-items-center font-bold text-sm">
                                {patient.firstName[0]}{patient.lastName[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-ink truncate">{formatFullName(patient)}</p>
                                <p className="text-xs text-muted flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> {showPhone(patient.phone)}
                                </p>
                            </div>
                            <button onClick={() => { setPatient(null); setSearch(''); }}
                                className="text-sm text-muted hover:text-muted">
                                O'zgartirish
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
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
                                <div className="mt-2 border border-line rounded-lg divide-y divide-line max-h-56 overflow-y-auto">
                                    {found.map(p => (
                                        <button key={p.id} onClick={() => setPatient(p)}
                                            className="w-full text-left p-3 hover:bg-elevated flex items-center gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-ink truncate">{formatFullName(p)}</p>
                                                <p className="text-xs text-muted">{showPhone(p.phone)}</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-faint" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {search.trim().length >= 2 && searching && (
                                <p className="mt-2 text-sm text-faint">{t('reception.searching')}</p>
                            )}
                            {searchError && (
                                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{searchError}</p>
                            )}
                            {search.trim().length >= 2 && !searching && !searchError && found.length === 0 && (
                                <p className="mt-2 text-sm text-muted">{t('reception.notFound')}</p>
                            )}

                            <button onClick={() => setShowNewPatient(true)}
                                className="mt-3 flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
                                <UserPlus className="w-4 h-4" /> Yangi bemor qo'shish
                            </button>
                        </>
                    )}
                </div>

                {/* 2. Bo'lim va shifokor */}
                <div className={`bg-surface rounded-xl border border-line p-4 ${!patient ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h3 className="text-sm font-semibold text-ink mb-3">2. Bo'lim va shifokor</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Yorliqlar `htmlFor` orqali maydonga ulanadi: ekran
                            o'quvchi dasturda maydon nomsiz o'qilmasin va
                            yorliqni bosganda fokus maydonga tushsin. */}
                        <div>
                            <label htmlFor="rc-dept" className="block text-xs font-medium text-muted mb-1.5">{t('reception.department')}</label>
                            <select id="rc-dept" ref={deptRef} value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={inputCls}>
                                <option value="">{t('reception.choose')}</option>
                                {clinicalDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {/* Ro'yxatda hamma bo'lim yo'q — buni AYTIB qo'yamiz.
                                Ilgari laboratoriya yoki dorixona bo'limini
                                yaratgan odam uni bu yerda topolmay, dastur
                                buzuq deb o'ylardi (audit XC-05). */}
                            {hiddenDepts.length > 0 && (
                                <p className="mt-1 text-[11px] text-faint">
                                    {hiddenDepts.map(d => d.name).join(', ')} — bu yerda yo'q: ular shifokor buyurtmasi bilan ochiladi.
                                </p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="rc-doctor" className="block text-xs font-medium text-muted mb-1.5">
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
                            <label htmlFor="rc-service" className="block text-xs font-medium text-muted mb-1.5">Xizmat (qabul turi)</label>
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
                            <label htmlFor="rc-complaints" className="block text-xs font-medium text-muted mb-1.5">Shikoyat (ixtiyoriy)</label>
                            <input id="rc-complaints" value={complaints} onChange={e => setComplaints(e.target.value)} className={inputCls} placeholder={t('reception.complaintsPh')} />
                        </div>
                    </div>
                </div>

                {/* 3. Qabulni ochish */}
                <div className="bg-surface rounded-xl border border-line p-4 flex flex-wrap items-center gap-4">
                    <div>
                        <p className="text-sm text-muted">{t('reception.toPay')}</p>
                        <p className="text-2xl font-bold text-ink tabular-nums">
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
                            <p className="font-medium text-ink">
                                Navbat №{lastTicket.queueNumber} — {lastTicket.patient?.lastName} {lastTicket.patient?.firstName}
                            </p>
                            <p className="text-xs text-muted">{t('reception.queued')}</p>
                        </div>
                        <button onClick={() => printTicket(lastTicket)}
                            className="ml-auto flex items-center gap-2 px-4 py-2 bg-surface border border-line rounded-lg text-sm font-medium hover:bg-elevated">
                            <Printer className="w-4 h-4" /> Talon chiqarish
                        </button>
                    </div>
                )}
                </>)}
            </div>

            {/* ── O'ng: bugungi navbat ──────────────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-faint" />
                    <h3 className="font-semibold text-ink">
                        {userRole === UserRole.DOCTOR ? t('today.myQueue') : t('reception.todayQueue')}
                    </h3>
                    <span className="text-sm text-muted">{groups.active.length} ta</span>
                    <button aria-label={t('reception.refresh')} onClick={loadToday} className="ml-auto p-1.5 text-faint hover:text-muted" title={t('reception.refresh')}>
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {groups.active.length === 0 ? (
                    <div className="text-center py-10 bg-surface rounded-xl border border-line">
                        <p className="text-sm text-muted">{t('reception.noVisits')}</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                        {groups.active.map(v => {
                            const waited = waitedMin(v);
                            return (
                                <div key={v.id}
                                    className="w-full bg-surface rounded-lg border border-line p-3 flex items-center gap-3 hover:border-primary-400 transition-colors">
                                    <span className="w-9 h-9 rounded-lg grid place-items-center font-bold text-sm shrink-0 bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                                        {v.queueNumber ?? '—'}
                                    </span>
                                    <button onClick={() => openVisitCard(v)} className="min-w-0 flex-1 text-left">
                                        <p className="text-sm font-medium text-ink truncate">
                                            {v.patient?.lastName} {v.patient?.firstName}
                                        </p>
                                        <p className="text-xs text-muted truncate">
                                            {v.department?.name || '—'}{v.doctorName ? ` · ${v.doctorName}` : ''}
                                            {waited != null && v.status === 'Waiting' ? ` · ${waited} ${t('common.min')}` : ''}
                                        </p>
                                    </button>
                                    {/* Chaqirish — tablo va ovoz shu holatdan ishlaydi */}
                                    {v.status === 'Waiting' && (
                                        <button onClick={() => callVisit(v)} disabled={busyVisit === v.id}
                                            aria-label={t('today.call')} title={t('today.call')}
                                            className="shrink-0 p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-50">
                                            <Volume2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button onClick={() => openVisitCard(v)}
                                        className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold inline-flex items-center gap-1">
                                        {t('today.open')} <ArrowRight className="w-3 h-3" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Yangi bemor — YAGONA forma (`PatientFormModal`).

                Ilgari bu yerda o'zining qisqa formasi turardi: tekshiruv
                yo'q, JSHSHIR yo'q, karta raqami yo'q va takror bemor
                haqidagi savol ham yo'q edi. Registratura kunning eng
                shoshilinch nuqtasi — aynan shu yerdan bazaga
                «abcdefg!!!» telefonli va ikkinchi nusxa kartalar
                tushardi.

                `compact` — avval faqat familiya, ism va telefon
                ko'rinadi; qolgani tugma bilan ochiladi. */}
            <PatientFormModal
                isOpen={showNewPatient}
                onClose={() => setShowNewPatient(false)}
                onCreate={onCreatePatient}
                doctors={doctors}
                userRole={userRole}
                doctorId={myDoctorId}
                compact
                onSaved={(p) => {
                    onPatientAdded(p);
                    /* Takrordan mavjud bemor tanlansa ham shu yerga
                       tushadi — qabul o'sha bemorga ochiladi. */
                    setPatient(p);
                    setShowNewPatient(false);
                }}
            />
            {/* ── Takroriy qabul ────────────────────────────────────────────
                Ilgari server tekshirmasdi: registratura ikki marta bosса,
                o'sha bemorga o'sha bo'limda ikkinchi navbat raqami va ikkinchi
                konsultatsiya ochilardi — bemor ikki marta to'lardi.

                Qaror odamda: mavjudini ochish yoki ataylab yangisini yaratish
                (ertalab va kechqurun alohida murojaat bo'lishi mumkin). */}
            {duplicate && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDuplicate(null)}>
                    <div className="bg-surface rounded-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-3 mb-4">
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-ink">
                                    Bu bemorga bugun qabul ochilgan
                                </h3>
                                <p className="text-sm text-muted mt-1">
                                    Shu bo'limda navbat №{duplicate.queueNumber ?? '—'}
                                    {duplicate.status ? `, holati: ${duplicate.status}` : ''}.
                                </p>
                            </div>
                        </div>

                        <p className="text-xs text-muted mb-4">
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
                            className="w-full mt-2 px-4 py-2 text-sm text-muted hover:bg-elevated rounded-lg">
                            Bekor qilish
                        </button>
                    </div>
                </div>
            )}

        </div>
        </>
    );
};
