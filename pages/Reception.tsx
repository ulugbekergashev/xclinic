import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { formatUzPhone } from '../shared/validation';
import { formatFullName, formatNumber, formatDateLong } from '../utils/format';
import { todayISO } from '../utils/dateUtils';
import { esc } from '../utils/printDocument';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    UserPlus, Search, ArrowRight, Printer, Clock, Plus,
    CheckCircle, AlertCircle, X, Phone, RefreshCw, Calendar as CalendarIcon,
    Volume2, FlaskConical, BellRing, CalendarClock, Tv, Wallet,
} from 'lucide-react';
import { Patient, Doctor, Department, Service, Visit, Clinic, UserRole, Appointment } from '../types';
import { api } from '../services/api';
import { markAppointmentArrived } from '../utils/arrival';
import { maskPhone } from '../utils/accessControl';
import { useLanguage, fill } from '../context/LanguageContext';
import { usePatientSearch } from '../hooks/usePatientSearch';
import { useHotkeys, useScannerInput } from '../hooks/useHotkeys';
import { useLiveUpdates, useLiveHealthy, LiveEventType } from '../hooks/useLiveUpdates';
import { PatientFormModal } from '../components/PatientFormModal';
import { Modal } from '../components/Common';
import { ClinicMap } from '../components/ClinicMap';
import { AttentionList, AttentionItem } from '../components/AttentionList';

/* Modul darajasida — har renderda qayta obuna bo'lmasin */
const LIVE_EVENTS: LiveEventType[] = ['visit.created', 'visit.status', 'charge.paid'];

/* ─────────────────────────────────────────────────────────────────────────────
   BUGUN — klinikaning kunlik ish ekrani, hamma rol uchun bitta sahifa:

     · registrator va ega — jonli xarita (yo'l → kutish zali → kabinetlar):
       «Keldi», «Chaqirish», «Kirdi» shu yerda; qabul «Yangi qabul» oynasida
       ochiladi; sarlavhada kunning puli;
     · ega qo'shimcha — «Bugun hal qilinsin» ro'yxati;
     · shifokor — natijasi tayyor bo'lganlar, o'z navbati, natija
       kutayotganlar va bugun yakunlanganlar;
     · hamshira — navbat va bemor kartasi.

   TARIX. Bu ekran TO'RT marta shakl o'zgartirdi:

     1. «Registratura» va «Mening navbatim» — ikki alohida sahifa, bir
        xil `Visit` jadvalini boshqacha guruhlab ko'rsatardi.
     2. «Bugun» (2026-09-07) — ikkalasi bitta ekranga qo'shildi, tepasiga
        eganing yig'iladigan tasmasi (raqamlar, «hal qilinsin») qo'yildi.
     3. Yana «Registratura» (2026-09-16) — tasma alohida «Bosh panel»
        sahifasiga ketdi: yig'iq turgani uchun ega uni ochmasdi.
     4. Yana «Bugun» (2026-10-03) — Bosh panel jonli xaritani takrorlab
        qo'ygan edi, Registraturaning o'zida esa xarita yonida o'sha
        bemorlarning ro'yxati va doimiy ochiq qabul masterosi turardi:
        «Chaqirish» va «Ochish» ikki joyda. Qoida: bitta ish — bitta joy.
        Xarita yagona navbat; mastero — oyna; eganing ro'yxati tasma emas,
        sahifaning ochiq qismi; raqamli plitkalar o'rniga sarlavhada bitta
        qator. Davr bo'yicha tahlil «Hisobot» da qoldi (`pages/Dashboard.tsx`).

   Manzil `/reception` — chop etilgan talonlarda va xatcho'plarda shu
   turadi; `/today` va `/myqueue` shu yerga yo'naltiriladi. Fayl nomi va
   tarjima kalitlari (`today.*`, `reception.*`) o'zgarmadi: ularni qayta
   nomlash yuz qatorlik bezak o'zgarishi bo'lardi.

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
}

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);
const today = () => todayISO();

export const Reception: React.FC<Props> = ({
    clinicId, patients, doctors, departments, services, currentClinic,
    userRole, doctorId: myDoctorId, showPatientPhone = true,
    onCreatePatient, onPatientAdded, addToast,
}) => {
    const showPhone = (v?: string) => showPatientPhone ? formatUzPhone(v || '') : maskPhone(v);
    const navigate = useNavigate();
    const location = useLocation();
    const { t, language } = useLanguage();

    /* Kim nima ko'radi. Ega ikkalasini ham ko'radi: kichik klinikada u
       ham registrator, ham shifokor bo'lishi mumkin. */
    const canRegister = userRole === UserRole.RECEPTIONIST || userRole === UserRole.CLINIC_ADMIN;
    const isDoctorView = userRole === UserRole.DOCTOR || userRole === UserRole.CLINIC_ADMIN
        || userRole === UserRole.NURSE;
    const isOwner = userRole === UserRole.CLINIC_ADMIN;

    const [search, setSearch] = useState('');
    const [patient, setPatient] = useState<Patient | null>(null);
    const [departmentId, setDepartmentId] = useState('');
    const [doctorId, setDoctorId] = useState('');
    const [serviceId, setServiceId] = useState<number | ''>('');
    const [complaints, setComplaints] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [showNewPatient, setShowNewPatient] = useState(false);
    const [showIntake, setShowIntake] = useState(false);
    /* Takroriy qabul: mavjudini ochish yoki ataylab yangisini yaratish */
    const [duplicate, setDuplicate] = useState<{ visitId: string; queueNumber: number | null; status: string } | null>(null);

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

    /* ─── PUL «BUGUN» EKRANIDA ────────────────────────────────────────────

       Bu ekranda pul haqida BIRON NARSA yo'q edi. Registrator kun bo'yi shu
       yerda o'tiradi va navbatni ko'radi, lekin kim to'lashi kerakligini
       ko'rmasdi — buning uchun Moliyaga o'tish kerak edi, ya'ni ataylab
       qidirish kerak edi. Natijada bemor to'lamasdan chiqib ketardi va
       ertaga qarzdorlar ro'yxatida paydo bo'lardi.

       MANBA KASSANIKI BILAN BITTA: `charges.pending(true)`. Brauzerda hech
       narsa hisoblanmaydi — aks holda kassada bir raqam, bu yerda boshqasi
       bo'lardi (PLAN-HOMES da qarzning 13 xil hisobi shundan chiqqan edi).

       FAQAT PUL OLADIGANLARGA. Shifokor summani qabul kartasida ko'radi;
       unga navbat yonida ham ko'rsatish moliyaviy ma'lumotni kerak
       bo'lmagan joyga olib chiqish bo'lardi. */
    const [dueByPatient, setDueByPatient] = useState<Map<string, { due: number; state: string }>>(new Map());
    const loadDue = useCallback(async () => {
        if (!canRegister) return;
        try {
            const rows = await api.charges.pending(true);
            const m = new Map<string, { due: number; state: string }>();
            for (const g of rows) {
                if (!g.patientId || !(g.due > 0)) continue;
                m.set(g.patientId, { due: g.due, state: g.state || (g.here ? 'here' : 'old') });
            }
            setDueByPatient(m);
        } catch { /* pul kelmasa ham navbat ishlayveradi */ }
    }, [canRegister]);
    useEffect(() => { loadDue(); }, [loadDue, todayVisits]);

    /* Kunning yig'indisi — sarlavhada bitta qator. «Nechta odam va qancha»
       degan savolga javob ro'yxatni sanamasdan turib beriladi. */
    const dueTotal = useMemo(() => {
        let sum = 0;
        dueByPatient.forEach(v => { sum += v.due; });
        return { people: dueByPatient.size, sum };
    }, [dueByPatient]);

    /* ─── EGANING QISMI ───────────────────────────────────────────────────
       Bugun kassaga tushgan pul (sarlavhadagi qator) va «Bugun hal qilinsin».
       Ikkalasi ham SERVERDAN: brauzerda sanalsa, Kassadagi raqam bilan ikki
       xil javob chiqardi. Registratorga so'ralmaydi — `attention` unga 403. */
    const [ownerCash, setOwnerCash] = useState<number | null>(null);
    const [attention, setAttention] = useState<AttentionItem[] | null>(null);
    const loadOwner = useCallback(async () => {
        if (!isOwner) return;
        const [d, a] = await Promise.all([
            api.reports.dashboard().catch(() => null),
            api.reports.attention().catch(() => null),
        ]);
        setOwnerCash(d ? d.today.revenue : null);
        setAttention(a ? (a.items || []) : null);
    }, [isOwner]);
    useEffect(() => { loadOwner(); }, [loadOwner, todayVisits]);

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
        try { await api.visits.call(v.id); await loadToday(); addToast('success', fill(t('flow.toast.called'), v.queueNumber ?? '—')); }
        catch (e: any) { addToast('error', e?.message || t('ui.xatolik')); }
        finally { setBusyVisit(null); }
    };

    /* ─── XARITADAGI AMALLAR ──────────────────────────────────────────────
       «Kirdi» kartani OCHMAYDI — registrator xaritada qoladi. Pastdagi
       `openVisitCard` esa holatni o'zgartirib, kartaga olib o'tadi: u
       shifokorning yo'li. Ikkalasi ham bitta holatga yozadi, shuning uchun
       shifokor kartani ochganda xaritada bemor o'zi kabinetga o'tadi. */
    const setVisitStatus = async (v: Visit, status: Visit['status'], doneKey: 'flow.toast.entered' | 'flow.toast.returned') => {
        try {
            await api.visits.update(v.id, { status });
            await loadToday();
            addToast('success', fill(t(doneKey), `${v.patient?.lastName || ''} ${v.patient?.firstName || ''}`.trim() || `№${v.queueNumber ?? '—'}`));
        } catch (e: any) { addToast('error', e?.message || t('ui.xatolik')); }
    };
    const enterVisit = (v: Visit) => setVisitStatus(v, 'In Progress', 'flow.toast.entered');
    const undoEnter = (v: Visit) => setVisitStatus(v, 'Waiting', 'flow.toast.returned');

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
        if (!patient) return t('today.avval_bemorni_tanlang_yoki');
        if (!departmentId) return t('ui.bolimni_tanlang');
        if (!isDiagnosticDept && !doctorId && deptDoctors.length > 0) return t('today.shifokorni_tanlang');
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

    const reset = () => {
        setPatient(null); setSearch(''); setDepartmentId(''); setDoctorId('');
        setServiceId(''); setComplaints(''); setError('');
    };

    /* ─── «YANGI QABUL» OYNASI ────────────────────────────────────────────
       Qabul ochish sahifaning doimiy qismi edi; endi u oyna. Tugma, F2 va
       skaner — uchalasi ham shuni ochadi, fokus darhol qidiruvga tushadi.
       Yopish — bekor qilish: tanlov tozalanadi, aks holda keyingi bemorga
       oldingisining yarim to'ldirilgan formasi chiqardi. */
    const openIntake = () => {
        setError('');   // xaritadagi «Keldi» xatosi oynaga ko'chib o'tmasin
        setShowIntake(true);
        setTimeout(() => searchRef.current?.focus(), 0);
    };
    const closeIntake = () => { setShowIntake(false); reset(); };

    /* F2 — «yangi qabul», ISTALGAN sahifadan. Tugmani `App.tsx` ushlaydi va
       shu yerga `state` bilan olib keladi: master sahifada doim ochiq
       turganda F2 dan keyin darhol bemor ismini yozish mumkin edi — oyna
       bilan ham shunday qoladi. Bemor tanlangan bo'lsa ham qidiruvga qaytadi.

       Belgi darhol olib tashlanadi: sahifa yangilanganda yoki «orqaga»
       bosilganda oyna o'zidan-o'zi qayta ochilmasin. */
    const newVisitRequested = !!(location.state as { newVisit?: boolean } | null)?.newVisit;
    useEffect(() => {
        if (!newVisitRequested) return;
        navigate(location.pathname + location.search, { replace: true, state: null });
        if (!canRegister) return;
        setPatient(null); setSearch('');
        openIntake();
    }, [newVisitRequested]);

    useHotkeys(React.useMemo(() => ({
        Escape: () => {
            /* Ustidagi oynalar (yangi bemor, takroriy qabul) o'zi yopiladi —
               bu yerda ularning ostidagi «Yangi qabul» ga tegilmaydi. */
            if (!showIntake || showNewPatient || duplicate) return;
            // Avval qidiruvni tozalaydi, keyin tanlovni bekor qiladi, oxirida oynani yopadi
            if (search) setSearch('');
            else if (patient) setPatient(null);
            else closeIntake();
        },
    }), [search, patient, showIntake, showNewPatient, duplicate]));

    /* Skaner klaviatura sifatida ishlaydi: kodni tez "yozadi" va Enter bosadi.
       Uni qidiruvga yuboramiz — karta raqami server qidiruviga tushadi. */
    useScannerInput(React.useCallback((code: string) => {
        setPatient(null);
        setSearch(code);
        setShowIntake(true);
    }, []), canRegister && !patient);

    /* Bemor tanlangach fokus O'ZI bo'limga o'tadi — registrator sichqonga
       qo'l uzatmaydi. Xuddi shu sabab bilan bo'lim tanlangach shifokorga
       o'tish ham kerak edi, lekin u `select` avtomatik birinchi qiymatni
       oladi va qo'shimcha sakrash chalkashtiradi. */
    React.useEffect(() => {
        if (patient) setTimeout(() => deptRef.current?.focus(), 0);
    }, [patient]);

    /* Bo'lim almashsa, unga tegishsiz tanlovlarni tozalaymiz.

       FAQAT bo'lim almashganda. Ilgari effekt `services` ga ham bog'liq
       edi: xizmatlar ro'yxati yangilansa (ega boshqa kompyuterda narxni
       tuzatdi) registrator tanlab bo'lgan shifokor jimgina tozalanib
       ketardi. Ro'yxat `ref` orqali o'qiladi — u effektni ishga
       tushirmaydi. */
    const servicesRef = React.useRef(services);
    servicesRef.current = services;
    useEffect(() => {
        setDoctorId('');
        const first = servicesRef.current.find(s => s.departmentId === departmentId);
        setServiceId(first?.id ?? '');
    }, [departmentId]);

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

    /* Xarita ikki manbadan chiziladi: qabullar va bugungi yozuvlar. Qabul
       o'zgarsa yozuv ham o'zgargan bo'ladi («Keldi» ikkalasiga yozadi) —
       shuning uchun yozuvlar ham o'sha hodisalarda yangilanadi. */
    useLiveUpdates(LIVE_EVENTS, loadTodayAppts);

    /* Boshqa kompyuterda bugunga yozilgan yangi bemor uchun alohida hodisa
       yo'q — daqiqada bir so'raladi. Oqim uzilgan bo'lsa navbat ham shu
       yerda yangilanadi: `useLiveUpdates` dagi 4-qaror shuni va'da qiladi,
       lekin bu ekranda so'rov yo'q edi va navbat qotib qolardi. */
    const liveOk = useLiveHealthy();
    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            loadTodayAppts();
            if (!liveOk) loadToday();
        }, liveOk ? 60000 : 30000);
        return () => clearInterval(id);
    }, [liveOk, loadToday, loadTodayAppts]);

    /** «Kelmadi» — vaqti o'tgan yozuv yopiladi. Server bemorga xabar ham yuboradi */
    const markNoShow = async (appt: Appointment) => {
        try {
            await api.appointments.update(appt.id, { status: 'No-Show' });
            addToast('info', fill(t('flow.toast.noShow'), appt.patientName));
            await loadTodayAppts();
        } catch (e: any) { addToast('error', e?.message || t('ui.xatolik')); }
    };

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
                addToast('info', t('today.qabul_ochildi_lekin_kalendardagi'));
            }
            /* Talonda ISM bo'lishi kerak. Yozuv bilan bemor obyekti kelmaydi —
               umumiy ro'yxatdan olinadi; u yerda ham bo'lmasa (ro'yxat qisman
               yuklanadi) yozuvdagi ismning o'zi. Ilgari bu yerda `null` qolardi
               va talon «Navbat №1 — » bo'lib, ismsiz chiqardi. */
            const who = appt.patient
                || patients.find(p => p.id === appt.patientId)
                || { lastName: appt.patientName || '', firstName: '' };
            setLastTicket({ ...r.visit, patient: who });
            addToast('success', fill(t('today.x_navbat_x'), appt.patientName, r.visit.queueNumber ?? '—'));
            loadToday();
            loadTodayAppts();
        } catch (e: any) {
            const f = e?.failure;
            if (f?.code === 'EXISTS') {
                addToast('info', e.message);
                navigate(`/patients/${appt.patientId}?visit=${f.visitId}`);
                return;
            }
            setError(e?.message || t('ui.qabulni_ochib_bolmadi'));
        } finally {
            setArriving(null);
        }
    };

    const openVisit = async () => {
        if (!patient) { setError(t('ui.bemorni_tanlang')); return; }
        if (!departmentId) { setError(t('encounterform.bolimni_tanlang')); return; }

        /* SHIFOKORSIZ QABUL (audit B-21).

           Audit: «Shifokor "Belgilanmagan" bo'lsa ham qabul yaratiladi va
           "Bemor shifokor navbatiga qo'shildi" deb yoziladi. Bunday yozuv
           hech kimning "Mening navbatim" ida ko'rinmaydi» — ya'ni bemor
           navbatga tushdi deb o'ylaydi, lekin uni hech kim ko'rmaydi.

           DIAGNOSTIKADA shifokor shart emas: tekshiruvni laborant yoki
           texnik bajaradi va u navbat ro'yxatiga bog'lanmaydi. */
        if (!isDiagnosticDept && !doctorId) {
            setError(t('today.shifokorni_tanlang_aks_holda'));
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
            addToast('success', fill(t('today.qabul_ochildi_navbat_x'), visit.queueNumber ?? '—'));
            reset();
            setShowIntake(false);
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
                setError(e.message || t('today.qabul_ochilmadi'));
            }
        } finally { setSaving(false); }
    };

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
            addToast('success', fill(t('today.ikkinchi_qabul_ochildi_navbat'), visit.queueNumber ?? '—'));
            reset();
            setShowIntake(false);
            loadToday();
        } catch (e: any) {
            setError(e.message || t('today.qabul_ochilmadi'));
        } finally { setSaving(false); }
    };

    const printTicket = (v: Visit) => {
        const dept = departments.find(d => d.id === v.departmentId);
        // Kabinet raqami — bemor qaysi xonaga borishini bilishi kerak
        const room = doctors.find(d => d.id === v.doctorId)?.room || '';
        const w = window.open('', '_blank', 'width=380,height=520');
        if (!w) { addToast('error', t('print.popupBlocked')); return; }
        /* Ism, bo'lim, shifokor — foydalanuvchi kiritgan matn. Hammasi `esc()`
           dan o'tadi, aks holda bemor ismidagi `<script>` talonda ishga tushadi. */
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('reception.ticket'))}</title>
<style>@page{size:80mm auto;margin:4mm}body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;margin:0;padding:8px}
.n{font-size:64px;font-weight:800;line-height:1;margin:10px 0}
.c{font-size:15px;font-weight:700}.d{font-size:13px;margin:3px 0}.s{border-top:1px dashed #000;margin:10px 0}
</style></head><body>
<div class="c">${esc(currentClinic?.name || t('ui.klinika'))}</div>
<div class="s"></div>
<div class="d">${esc(dept?.name || '')}</div>
<div class="n">${esc(v.queueNumber ?? '—')}</div>
<div class="d"><b>${esc(v.patient?.lastName || '')} ${esc(v.patient?.firstName || '')}</b></div>
${v.doctorName ? `<div class="d">${esc(v.doctorName)}</div>` : ''}
${room ? `<div class="d"><b>${esc(fill(t('reception.ticketRoom'), room))}</b></div>` : ''}
<div class="s"></div>
<div class="d">${esc(new Date().toLocaleString('uz-UZ'))}</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
        w.document.close();
    };

    const inputCls = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
    const stepDone = 'bg-emerald-500 text-white';
    const stepNow = 'bg-primary-600 text-white';
    const stepIdle = 'bg-elevated text-muted';

    const step = !patient ? 1 : !departmentId ? 2 : 3;

    const errorBanner = error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => setError('')} aria-label={t('common.close')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
    );

    /* ── SHIFOKOR BO'LIMLARI ─────────────────────────────────────────────
       Ilgari bular alohida ekran edi («Mening navbatim») va shifokor
       navbatni ko'rish uchun boshqa sahifaga o'tardi. Ega ham ko'radi:
       kichik klinikada u o'zi shifokor. */
    const hasDoctorSections = isDoctorView
        && (readyUnseen.length > 0 || stillWaiting.length > 0 || groups.done.length > 0);
    const doctorSections = isDoctorView && (
        <>
            {readyUnseen.length > 0 && (
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

            {stillWaiting.length > 0 && (
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

            {groups.done.length > 0 && (
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
                                {/* YAKUNLANGAN, LEKIN TO'LANMAGAN — eng muhim
                                    holat. Odam hali binoda; ertaga u
                                    qarzdorlar ro'yxatiga tushadi va
                                    qo'ng'iroq qilish kerak bo'ladi. */}
                                {canRegister && v.patientId && dueByPatient.has(v.patientId) && (
                                    <span title={t('today.toPay')}
                                        className="shrink-0 px-2 py-0.5 rounded-lg text-[11px] font-bold tabular-nums
                                                   bg-amber-500/12 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                                        {formatNumber(dueByPatient.get(v.patientId)!.due)}
                                    </span>
                                )}
                                <span className="text-xs text-faint truncate">{v.department?.name || ''}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    );

    return (
        <>
        <div className="space-y-5">
            {/* ── SARLAVHA ─────────────────────────────────────────────────
                Nom hamma rol uchun bitta — menyudagi bilan bir xil
                (`utils/navigation.ts`). Pul sarlavhaning yonida, sokin
                qatorda: plitka emas, chunki bu raqamning ishi Kassada. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-xl font-bold text-ink">{t('nav.today')}</h1>
                {/* Sana loyihaning O'Z formatlagichidan. `toLocaleDateString('uz-UZ')`
                    Chrome da «M09 6, Sun» beradi — `uz` lokali to'liq emas. Xuddi
                    shu sabab bilan raqamlar ham `formatNumber` orqali chiqadi. */}
                <span className="text-sm text-muted">
                    {formatDateLong(new Date(), language === 'ru' ? 'ru' : 'uz')}
                </span>
                {/* KUNNING PULI — bitta qator. Egaga bugun kassaga tushgani,
                    pul oladiganlarning hammasiga — kim to'lashi kerakligi.
                    Bosilganda kassaga olib boradi: o'sha odamlar u yerda
                    «To'lov kutmoqda» guruhida turadi. */}
                {canRegister && (ownerCash != null || dueTotal.people > 0) && (
                    <button type="button" onClick={() => navigate('/finance')}
                        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors">
                        <Wallet className="w-4 h-4 text-faint shrink-0" />
                        <span>
                            {ownerCash != null && (
                                <>{t('ownerhome.bugun_kassaga')} <b className="font-bold text-ink tabular-nums">{formatNumber(ownerCash)}</b> {t('ui.som')}</>
                            )}
                            {ownerCash != null && dueTotal.people > 0 && ' · '}
                            {dueTotal.people > 0 && (
                                <>{t('today.toPay')}: <b className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                                    {dueTotal.people} {t('patients.badges.patientsCount')} · {formatNumber(dueTotal.sum)}
                                </b></>
                            )}
                        </span>
                    </button>
                )}
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
                    {/* YANGI QABUL — bitta tugma, bitta oyna. Ilgari mastero
                        sahifaning yarmini doim egallab turardi va xarita bilan
                        yonma-yon navbat ro'yxatini ham takrorlardi. F2 ham,
                        skaner ham shu oynani ochadi. */}
                    {canRegister && (
                        <button type="button" onClick={openIntake} title="F2"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700">
                            <Plus className="w-4 h-4" /> {t('today.newVisit')}
                        </button>
                    )}
                </div>
            </div>

            {/* Oxirgi talon — oyna yopilgandan keyin ham ko'rinib turadi */}
            {canRegister && lastTicket && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
                    <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    <div>
                        <p className="font-medium text-ink">
                            {t('today.navbat')}{lastTicket.queueNumber} — {lastTicket.patient?.lastName} {lastTicket.patient?.firstName}
                        </p>
                        <p className="text-xs text-muted">{t('reception.queued')}</p>
                    </div>
                    <button onClick={() => printTicket(lastTicket)}
                        className="ml-auto flex items-center gap-2 px-4 py-2 bg-surface border border-line rounded-lg text-sm font-medium hover:bg-elevated">
                        <Printer className="w-4 h-4" /> {t('today.talon_chiqarish')}
                    </button>
                    <button onClick={() => setLastTicket(null)} aria-label={t('common.close')}
                        className="p-2 text-faint hover:text-muted rounded-lg">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Xaritadagi «Keldi» xatosi sahifada ko'rinadi; oyna ochiq bo'lsa — uning ichida */}
            {!showIntake && errorBanner}

        {/* ── BUGUN KLINIKADA — jonli xarita ─────────────────────────────
            Yo'l (bugunga yozilganlar), kutish zali va kabinetlar bitta
            ko'rinishda. Faqat navbatni yuritadiganlarga: shifokor o'z
            navbatini pastdagi ro'yxatda ko'radi, butun klinika unga kerak
            emas.

            Ma'lumot shu ekranniki (`todayVisits`, `todayAppts`) — xarita
            o'zi hech narsa yuklamaydi.

            NAVBAT RO'YXATI YO'Q. Ilgari xaritaning yonida o'sha bemorlar
            ro'yxat bo'lib ham turardi — «Chaqirish» va «Ochish» ikki joyda
            edi. Registrator va ega uchun navbat endi faqat xaritada;
            ro'yxatdagi qarz belgisi ham xaritaga ko'chdi (`dueOf`). */}
        {canRegister && (
            <ClinicMap
                visits={todayVisits}
                appointments={todayAppts}
                doctors={doctors}
                departments={departments}
                services={services}
                /* Yig'ish faqat egaga: unda xaritaning ostida o'z ro'yxatlari
                   bor. Registratorda sahifa — shu xaritaning o'zi; yig'ilsa
                   (ayniqsa eski tartibdan eslab qolingan holat bilan) navbat
                   butunlay ko'rinmay qolardi. */
                collapsible={isOwner}
                dueOf={(id) => dueByPatient.get(id)?.due || 0}
                onPatientClick={(id) => navigate(`/patients/${id}`)}
                onOpenVisit={(v) => navigate(`/patients/${v.patientId}?visit=${v.id}`)}
                onArrived={markArrived}
                onNoShow={markNoShow}
                onCall={callVisit}
                onEnter={enterVisit}
                onUndoEnter={undoEnter}
                onSeeAll={() => navigate('/calendar')}
            />
        )}

        {canRegister ? (
            /* EGANING QISMI — xaritaning ostida, yonma-yon: chapda «Bugun hal
               qilinsin», o'ngda natijalar (kichik klinikada ega o'zi shifokor).
               «Hal qilinsin» birinchi: u eganing savoli, natijalar ro'yxati esa
               uzun bo'lib, uni sahifaning tubiga surib yuborardi.

               Registratorda xaritadan keyin hech narsa yo'q: ro'yxatdagi
               bandlarning yarmi (vedomost, oylik, xarajat) unga yopiq —
               server ham 403 qaytaradi. */
            isOwner && (attention || hasDoctorSections) && (
                <div className={`grid grid-cols-1 gap-4 items-start ${attention && hasDoctorSections ? 'xl:grid-cols-2' : ''}`}>
                    {attention && <AttentionList items={attention} />}
                    {hasDoctorSections && <div className="space-y-4 min-w-0">{doctorSections}</div>}
                </div>
            )
        ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* ── Chap: natijalar va bugungi yozuvlar ───────────────────────── */}
            <div className="xl:col-span-2 space-y-4">
                {doctorSections}
                {/* ── Bugun yozilganlar ──────────────────────────────────
                    Kalendardan kelgan ro'yxat. Registrator va egada bu
                    ro'yxat xaritaning «yo'l» qismida turadi («Keldi» ham
                    o'sha yerda) — ikki marta ko'rsatilmaydi. */}
                {waitingAppts.length > 0 && (
                    <div className="bg-surface rounded-xl border border-line p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                {t('today.bugunga_yozilganlar')}
                                <span className="px-2 py-0.5 text-xs rounded-full bg-elevated text-muted">
                                    {waitingAppts.length}
                                </span>
                            </h3>
                            <button type="button" onClick={() => navigate('/calendar')}
                                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                                {t('today.kalendar')}
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
                                            {a.type || t('nav.visit')}{a.doctorName ? ` · ${a.doctorName}` : ''}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => markArrived(a)}
                                        disabled={arriving === a.id}
                                        title={t('today.qabulni_ochish_bolim_shifokor')}
                                        className="shrink-0 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                                    >
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        {arriving === a.id ? t('today.opening') : t('ui.keldi')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── O'ng: bugungi navbat — shifokor va hamshiraga ───────────── */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-faint" />
                    <h3 className="font-semibold text-ink">
                        {userRole === UserRole.DOCTOR ? t('today.myQueue') : t('reception.todayQueue')}
                    </h3>
                    <span className="text-sm text-muted">{groups.active.length} {t('ui.ta')}</span>
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
        </div>
        )}
        </div>

        {/* ── «YANGI QABUL» OYNASI — faqat registrator va ega ────────────────
            Uch qadam: bemor → bo'lim va shifokor → qabulni ochish. Mantiq
            o'zgarmadi, faqat joyi: sahifaning doimiy qismi emas, oyna —
            ilovaning umumiy `Modal` i, yangi bemor formasi bilan bir xil. */}
        {canRegister && (
            <Modal isOpen={showIntake} onClose={closeIntake} title={t('today.newVisit')} className="max-w-3xl">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                        {[['1', t('ui.bemor')], ['2', t('ui.bolim_2')], ['3', t('nav.visit')]].map(([n, label], i) => {
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

                    {errorBanner}

                    {/* 1. Bemor */}
                    <div className="bg-surface rounded-xl border border-line p-4">
                        <h3 className="text-sm font-semibold text-ink mb-3">{t('today.1_bemor')}</h3>

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
                                    {t('common.change')}
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
                                    <UserPlus className="w-4 h-4" /> {t('today.yangi_bemor_qoshish')}
                                </button>
                            </>
                        )}
                    </div>

                    {/* 2. Bo'lim va shifokor */}
                    <div className={`bg-surface rounded-xl border border-line p-4 ${!patient ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="text-sm font-semibold text-ink mb-3">{t('today.2_bolim_va_shifokor')}</h3>
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
                                        {hiddenDepts.map(d => d.name).join(', ')} — {t('today.bu_yerda_yoq_ular')}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="rc-doctor" className="block text-xs font-medium text-muted mb-1.5">
                                    {t('ui.shifokor_2')}{isDiagnosticDept ? '' : ' *'}
                                    {deptDoctors.length === 0 && departmentId ? t('today.bolimda_shifokor_yoq') : ''}
                                </label>
                                <select id="rc-doctor" value={doctorId} onChange={e => setDoctorId(e.target.value)}
                                    disabled={!departmentId} className={inputCls}>
                                    <option value="">
                                        {!departmentId ? t('visit.pickDept')
                                            : isDiagnosticDept ? t('reception.unassigned') : t('today.shifokorni_tanlang_2')}
                                    </option>
                                    {deptDoctors.map(d => <option key={d.id} value={d.id}>{formatFullName(d)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="rc-service" className="block text-xs font-medium text-muted mb-1.5">{t('today.xizmat_qabul_turi')}</label>
                                <select id="rc-service" value={serviceId} onChange={e => setServiceId(e.target.value ? Number(e.target.value) : '')}
                                    disabled={!departmentId} className={inputCls}>
                                    <option value="">{departmentId ? t('today.noService') : t('visit.pickDept')}</option>
                                    {deptServices.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                                </select>
                                {departmentId && deptServices.length === 0 && (
                                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                        {t('today.bu_bolimga_xizmat_biriktirilmagan')}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="rc-complaints" className="block text-xs font-medium text-muted mb-1.5">{t('today.shikoyat_ixtiyoriy')}</label>
                                <input id="rc-complaints" value={complaints} onChange={e => setComplaints(e.target.value)} className={inputCls} placeholder={t('reception.complaintsPh')} />
                            </div>
                        </div>
                    </div>

                    {/* 3. Qabulni ochish */}
                    <div className="bg-surface rounded-xl border border-line p-4 flex flex-wrap items-center gap-4">
                        <div>
                            <p className="text-sm text-muted">{t('reception.toPay')}</p>
                            <p className="text-2xl font-bold text-ink tabular-nums">
                                {fmt(selectedService?.price || 0)} <span className="text-base font-normal">{t('ui.som')}</span>
                            </p>
                        </div>
                        {/* NIMA YETISHMAYOTGANI aytiladi. Ilgari tugma jimgina
                            o'chiq turardi va registrator uchun u shunchaki
                            «ishlamayapti» bo'lib ko'rinardi (audit XC-09). */}
                        <div className="ml-auto flex items-center gap-3">
                            {blockingReason && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 max-w-[16rem] text-right">{blockingReason}</p>
                            )}
                            <button aria-label={t('today.qabulni_ochish')} onClick={openVisit} disabled={!!blockingReason || saving}
                                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                {saving ? t('today.opening') : t('today.qabulni_ochish')} <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>
        )}

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
                                {t('today.bu_bemorga_bugun_qabul')}
                            </h3>
                            <p className="text-sm text-muted mt-1">
                                {t('today.shu_bolimda_navbat')}{duplicate.queueNumber ?? '—'}
                                {duplicate.status ? fill(t('today.holati_x'), duplicate.status) : ''}.
                            </p>
                        </div>
                    </div>

                    <p className="text-xs text-muted mb-4">
                        {t('today.yangi_qabul_ochilsa_konsultatsiya')}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <button onClick={openExisting}
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                            {t('today.mavjud_qabulni_ochish')}
                        </button>
                        <button onClick={forceNew} disabled={saving}
                            className="flex-1 px-4 py-2 border border-amber-400 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50">
                            {t('today.baribir_yangisini_ochish')}
                        </button>
                    </div>
                    <button onClick={() => setDuplicate(null)}
                        className="w-full mt-2 px-4 py-2 text-sm text-muted hover:bg-elevated rounded-lg">
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        )}
        </>
    );
};
