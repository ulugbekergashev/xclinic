import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    FlaskConical, Scan, Pill, AlertCircle,
    Printer, Stethoscope, Loader2, Plus, CalendarPlus, Send,
} from 'lucide-react';
import {
    Visit, Department, EncounterTemplate, LabTest, Service, Doctor, Patient,
    MODALITY_LABELS, ICD10Code, VisitCharge, ChargeSummary, UserRole,
    Prescription, InventoryItem, Clinic, DiagnosisKind,
} from '../types';
import { printVisitSummary } from '../utils/printVisitSummary';
import { api } from '../services/api';
import { useResourceSync } from '../hooks/useDataSync';
import { useVisitAutosave } from '../hooks/useVisitAutosave';
import { useLanguage, fill } from '../context/LanguageContext';
import { EncounterForm, EncounterSummary, isVitalField, objectiveTemplateText } from '../components/EncounterForm';
import { printReferral, printPrescription } from '../utils/printForms';
import { formatDate, formatNumber, formatTime } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { calcAge, todayISO } from '../utils/dateUtils';
import {
    recentDiagnoses, recentPrescriptions, rememberDiagnosis, rememberPrescriptions,
} from '../utils/recentPicks';
import { OpenVisitForm } from './visit/OpenVisitForm';
import { VisitResults } from './visit/VisitResults';
import { ItemRow, SheetLabel } from './visit/sheetParts';
import { DiagnosisPicker } from './visit/DiagnosisBlock';
import { Modal } from './Common';
import { VisitActions, VisitHeader } from './visit/VisitFooter';
import {
    ConsultDraft, ConsultPicker, LabPicker, RxDraft, RxForm, ServicePicker, StudyDraft, StudyPicker,
} from './visit/VisitPickers';

/* ─────────────────────────────────────────────────────────────────────────────
   QABUL VARAG'I — bemor kartasining o'ng ustuni.

   Ilgari bu alohida sahifa edi (`/visit/:id`) va bemor kartasidan unga
   yo'l YO'Q edi: tashxis faqat o'sha sahifada qo'yilardi, tarix esa faqat
   kartada ko'rinardi. Keyin panel kartaga ko'chdi, lekin ichi «tugmalar
   to'plami» bo'lib qoldi: beshta amal tugmasi, har biri alohida quti ochadi,
   bayon alohida kartada o'zining «Saqlash» tugmasi bilan, yozilgan narsalar
   esa pastdagi to'rtta ro'yxatda.

   Endi bu BITTA VARAQ va u shifokor ishlaydigan tartibda o'qiladi.

   «+» TUGMALAR — O'Z BO'LIMINING SARLAVHASIDA (2026-11-20). Pastdagi
   «Yana: + Tahlil · + Diagnostika …» qatori olib tashlandi: «Qilingan ish»
   sarlavhasida «+ Xizmat», «+ Dori»; «Yo'llanma» sarlavhasida «+ Tahlil»,
   «+ Diagnostika», «+ Boshqa shifokor». Keyingi qabulga yozish — chapdagi
   bemor kartochkasidagi «Qabulga yozish» tugmasi.

   BITTA EKRAN (2026-11-20). Klinika egasi: «nimani qayerdan qidirishni odam
   bilmaydi», «hammasi bitta ekran ichida hal bo'lsa» — lekin «tiqib tashlash
   emas». Varaq endi:
     · tepada QABUL QATORI — kim, navbat, holat, qarz, «To'lash» va
       «Qabulni yakunlash»; u aylantirilmaydi;
     · ostida BITTA keng ustun, faqat har bemorda kerak bo'ladigani:
       Shikoyat va ko'rik → Tashxis → Qilingan ish (xizmat, dori);
     · oxirida «Yana: + Tahlil · + Diagnostika · + Boshqa shifokor ·
       + Keyingi tashrif». Bular har bemorda kerak emas, shuning uchun
       alohida blok bo'lib turmaydi: biror narsa qo'shilgandagina uning
       bloki chiqadi (natijalar ham o'sha yerda).
   Katta ekranda ustun o'z ichida aylanadi, sahifa esa joyida turadi.
   Matn o'zi saqlanadi.

   BLOKLAR (2026-11-21). Bosqichlar (Ko'rik · Tashxis · Retsept …) ikkinchi
   tab qatori bo'lib qoldi — tepadagi karta tablari bilan ustma-ust. Klinika
   egasi DentaCRM va boshqa CRM kartalarini ko'rsatdi: «bloklar bilan».
   Endi «Umumiy» tabida hammasi BIR EKRANDA, o'z kartochkasida:
     · chapda katta blok — Shikoyat va ko'rik (shifokor shu yerda yozadi);
     · o'ngda ixcham bloklar — Tashxis, Retsept, Xizmatlar, Yo'llanma;
       har birida yozilgani va bitta «+» tugma.
   «+» bosilganda tanlov OYNADA ochiladi: blok tor, tanlov esa keng.

   IKKI BLOK (2026-11-21, kechqurun). Klinika egasi DentaCRM kartasining
   boshini ko'rsatdi: «Umumiy» tabida bor-yo'g'i ikkita blok — «Bugungi
   qabul» (bitta «+ Protsedura qo'shish» va bugun qilinganlar) va «Tibbiy
   tarix». Bizda bir qarashda yettita narsa turardi. Endi:
     · «BUGUNGI QABUL» — bitta «+ Qo'shish» (xizmat, tahlil, diagnostika,
       dori, tashxis, boshqa shifokor — bitta oynada), bugun qo'shilgan
       hamma narsa BITTA ro'yxatda, pastda «Qabulni boshlash» →
       «Qabulni yakunlash»;
     · «TIBBIY TARIX» — allergiya, kasalliklar (karta beradi, `history`),
       shikoyat va ko'rik. Ko'rik formasi yopiq turadi va «Ko'rik yozish»
       bilan ochiladi: har bemorda kerak emas.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patient: Patient;
    /** Varaqda ochilgan qabul. `null` — bugun ochiq qabul yo'q. */
    visitId: string | null;
    departments: Department[];
    services: Service[];
    doctors: Doctor[];
    currentUserName?: string;
    userRole?: UserRole;
    /** Kirgan shifokor — yangi qabulda o'zi standart bo'lib tanlanadi */
    loggedDoctorId?: string;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
    /** Qabul ochildi/yakunlandi/bekor qilindi — karta ro'yxatini yangilaydi */
    onVisitChanged: (visitId: string | null) => void;
    /** Varaqdagi qabul va uning hisobi — karta sarlavhasidagi marshrut shundan chiziladi */
    onState?: (state: VisitSheetState) => void;
    /** Tarixdan eski qabul ochilgan — bugungisiga qaytish */
    onShowToday?: () => void;
    /** «Keyingi qabulga yozish» — yakunlangan qabul ostida */
    onSchedule?: () => void;
    /** Bemorning oldingi yakunlangan qabuli — «O'tgan safar» qatori */
    previousVisit?: Visit | null;
    /** Boshqa qabulni varaqda ochish (yo'naltirgan qabul, «O'tgan safar») */
    onOpenVisit?: (visitId: string) => void;
    /** Qog'ozlar shapkasi uchun */
    clinic?: Clinic;
    /* Karta tablaridagi «+ Tahlilga yuborish», «+ Retsept yozish» — shu
       qabulning «+ Qo'shish» oynasini o'sha bo'limda ochadi. `n` har bosishda
       oshadi: bir tugma ikki marta bosilsa ham oyna qayta ochilsin. */
    addRequest?: { kind: AddKind; n: number } | null;
}

export interface VisitSheetState { visit: Visit | null; money: ChargeSummary }

/** «+ Qo'shish» oynasida nima tanlangan. `null` — oyna yopiq. */
type Panel = null | 'dx' | 'rx' | 'service' | 'lab' | 'study' | 'consult';
export type AddKind = Exclude<Panel, null>;

/* Tish tekshiruvlari (OPG, 3D tomografiya …) faqat stomatologga birinchi
   chiqadi; boshqa shifokorga ular «Hammasi» ostida (audit, 2026-11-22:
   endokrinologga OPG taklif qilinardi). */
const DENTAL_STUDY = /(\bopg|ortopantomo|3d\s*tomo|kt\s*3d|cbct|\btish|dental|зуб)/i;
const DENTAL_DEPT = /(stomat|стомат|dent)/i;


/** Tekshiruv nomi: «UZI — Qalqonsimon bez UZI» kabi takror chiqmasin —
 *  nomda tur allaqachon bo'lsa, faqat nomning o'zi. */
const studyTitle = (kind: string, name: string): string =>
    name.toLowerCase().includes(kind.toLowerCase()) ? name : `${kind} — ${name}`;

/** Ko'rikda biror qiymat yozilganmi — yozilgan bo'lsa forma yopilmaydi */
const hasExamData = (raw?: string | null): boolean => {
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        return !!data && typeof data === 'object'
            && Object.values(data).some(v => v !== null && v !== undefined && String(v).trim() !== '' && v !== false);
    } catch { return false; }
};

const fmt = (n: number) => formatNumber(n);
const NO_MONEY: ChargeSummary = { total: 0, paid: 0, due: 0, unpaidCount: 0 };

/** Holat -> tarjima kaliti. Shablon satr (`visit.status.${x}`) yaramaydi:
    `t()` kalitlari qat'iy turlangan, «In Progress» dagi bo'shliq esa
    kalitda yo'q. Jadval ikkalasini bir joyda ushlab turadi. */
export const VISIT_STATUS_KEY = {
    'Waiting': 'visit.status.Waiting',
    'Called': 'visit.status.Called',
    'In Progress': 'visit.status.InProgress',
    'AwaitingResults': 'visit.status.AwaitingResults',
    'Completed': 'visit.status.Completed',
    'Cancelled': 'visit.status.Cancelled',
} as const;

/** Qabul holati — sarlavha ostidagi kichik rangli nuqta */
const STATUS_DOT: Record<string, string> = {
    'Waiting': 'bg-slate-400',
    'Called': 'bg-blue-500',
    'In Progress': 'bg-primary-600',
    'AwaitingResults': 'bg-amber-500',
    'Completed': 'bg-emerald-500',
    'Cancelled': 'bg-red-500',
};

/** Shu manzillarga yozilsa ochiq qabul varag'i eskiradi */
const VISIT_RESOURCES = [
    'visits', 'visit-procedures', 'lab-orders', 'studies', 'prescriptions',
    'diagnoses', 'referrals', 'payments', 'charges',
] as const;

export const VisitPanel: React.FC<Props> = ({
    patient, visitId, departments, services, doctors, currentUserName, userRole,
    loggedDoctorId, addToast, onVisitChanged, onState, onShowToday,
    onSchedule, previousVisit, onOpenVisit, clinic, addRequest,
}) => {
    const { t } = useLanguage();

    const [visit, setVisit] = useState<Visit | null>(null);
    const [templates, setTemplates] = useState<EncounterTemplate[]>([]);
    const [labTests, setLabTests] = useState<LabTest[]>([]);
    const [charges, setCharges] = useState<VisitCharge[]>([]);
    const [money, setMoney] = useState<ChargeSummary>(NO_MONEY);
    const [loading, setLoading] = useState(!!visitId);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [refBusy, setRefBusy] = useState(false);

    /** Qaysi «+» ochiq. Bir vaqtda bittasi: varaq uzayib ketmasin. */
    const [panel, setPanel] = useState<Panel>(null);
    /** Shifokor tanlagan ko'rik shabloni — server javobi kelguncha ham ko'rinsin */
    const [pickedTemplate, setPickedTemplate] = useState<{ visitId: string; id: string } | null>(null);
    /* Retseptdagi dorilar ombordan taklif qilinadi. Erkin matn ham
       qoladi: omborda yo'q dorini yozish mumkin bo'lishi kerak. */
    const [meds, setMeds] = useState<InventoryItem[]>([]);

    /* Tez tugmalar — shu kompyuterdagi shifokorning odati (`utils/recentPicks`).
       Shifokor bo'lmagan kirgan odam (klinika egasi) uchun umumiy ro'yxat. */
    const quickOwner = loggedDoctorId || 'any';
    const [recentRx, setRecentRx] = useState(() => recentPrescriptions(quickOwner));
    const [recentDx, setRecentDx] = useState(() => recentDiagnoses(quickOwner));

    /* Shikoyat va ko'rik o'zi saqlanadi — qoidalari `useVisitAutosave` da. */
    const autosave = useVisitAutosave({
        visit, visitId,
        onError: message => addToast('error', message || t('ui.saqlanmadi')),
    });
    const visitIdRef = useRef(visitId);
    visitIdRef.current = visitId;

    const reload = useCallback(async () => {
        if (!visitId) { setVisit(null); setCharges([]); setMoney(NO_MONEY); setLoading(false); return; }
        try {
            /* O'ZIMIZNING YOZUVDAN OLDINGI JAVOB — ESKIRGAN. So'rov ketgan,
               shu orada matn saqlangan bo'lsa, javobda eski matn keladi va u
               hozirgina yozilganining o'rniga tushardi. Bunday javob
               tashlanadi va qabul qayta o'qiladi. */
            for (let attempt = 0; attempt < 3; attempt++) {
                const epoch = autosave.writeEpoch.current;
                const [v, c] = await Promise.all([
                    api.visits.getById(visitId),
                    api.charges.byVisit(visitId).catch(() => ({ charges: [] as VisitCharge[], summary: NO_MONEY })),
                ]);
                // Javob kelguncha boshqa qabul ochilgan — bu javob endi kerak emas
                if (visitIdRef.current !== visitId) return;
                if (epoch !== autosave.writeEpoch.current && attempt < 2) continue;
                setVisit(v);
                setCharges(c.charges);
                setMoney(c.summary);
                setError('');
                break;
            }
        } catch (e: any) {
            if (visitIdRef.current === visitId) setError(e?.message || t('ui.qabulni_ochib_bolmadi'));
        } finally {
            /* Faqat O'Z qabuli uchun: eski so'rov kech tugab, yangi qabul hali
               yuklanmagan paytda yuklanish belgisini o'chirsa, varaq eski
               qabulni yangi manzil ostida ko'rsatib qo'yardi. */
            if (visitIdRef.current === visitId) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visitId]);

    useEffect(() => { setLoading(!!visitId); setPanel(null); reload(); }, [reload, visitId]);

    /* Kartaning tabidan kelgan «+» — oyna o'sha bo'limda ochiladi */
    useEffect(() => {
        if (addRequest) setPanel(addRequest.kind);
    }, [addRequest]);

    /* Karta ochiq turganda boshqa kompyuterda biror narsa o'zgarsa —
       kassir pulni oldi, laborant natija kiritdi, registrator xizmat
       qo'shdi — varaq o'zi yangilanadi. Yozilayotgan matn buzilmaydi:
       saqlanmagan qiymat serverdagidan ustun (pastda va `EncounterForm` da). */
    useResourceSync(VISIT_RESOURCES, reload, !!visitId);

    useEffect(() => { onState?.({ visit, money }); }, [visit, money, onState]);

    useEffect(() => {
        api.encounterTemplates.getAll().then(setTemplates).catch(() => { });
        api.labTests.getAll().then(setLabTests).catch(() => { });
    }, []);

    /* Dorilar ro'yxati faqat retsept formasi ochilganda yuklanadi —
       har karta ochilishida ombor so'rovi yuborishning ma'nosi yo'q. */
    useEffect(() => {
        if (panel !== 'rx' || meds.length || !patient.clinicId) return;
        api.inventory.getAll(patient.clinicId)
            .then(items => setMeds(items.filter(i => i.isMedication)))
            .catch(() => { });
    }, [panel, patient.clinicId, meds.length]);

    const bookableDepts = useMemo(
        () => departments.filter(d => d.isActive && (d.type === 'CLINICAL' || d.type === 'DIAGNOSTIC')),
        [departments],
    );
    /* Diagnostika xizmatlari — tekshiruv narxi QO'LDA yozilmasin.
       Ilgari shifokor narxni o'zi kiritardi va u prayslistdan farq qilardi. */
    const diagServices = useMemo(() => {
        const diagIds = new Set(departments.filter(d => d.type === 'DIAGNOSTIC').map(d => d.id));
        return services.filter(s => s.departmentId && diagIds.has(s.departmentId));
    }, [services, departments]);
    /* O'z bo'limiga mos tekshiruvlar oldinda, qolgani «Hammasi» ostida */
    const visitDeptName = departments.find(d => d.id === visit?.departmentId)?.name || '';
    const [ownStudies, otherStudies] = useMemo(() => {
        const dental = DENTAL_DEPT.test(visitDeptName);
        const own: Service[] = []; const other: Service[] = [];
        diagServices.forEach(s => ((dental || !DENTAL_STUDY.test(s.name)) ? own : other).push(s));
        return [own, other];
    }, [diagServices, visitDeptName]);

    const patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();

    const chargeOf = useCallback(
        (source: string, sourceId: string) =>
            charges.find(c => c.source === source && c.sourceId === sourceId && c.status !== 'Cancelled'),
        [charges],
    );

    // ── Amallar ─────────────────────────────────────────────────────────────
    /** Yozish + varaqni yangilash. `true` — yozildi (tez tugmalar shundagina eslab qolinadi).
     *  `keepOpen` — bir bosishda qo'shiladigan narsa (tashxis, xizmat): oyna
     *  ochiq qoladi, shifokor ketma-ket qo'shadi va «Tayyor» bilan yopadi. */
    const guard = async (fn: () => Promise<any>, okMsg: string, keepOpen = false): Promise<boolean> => {
        setBusy(true);
        try { await fn(); await reload(); onVisitChanged(visitId); addToast('success', okMsg); if (!keepOpen) setPanel(null); return true; }
        catch (e: any) { addToast('error', e?.message || t('ui.xatolik')); return false; }
        finally { setBusy(false); }
    };

    /* Natijani "ko'rdim" deb belgilash. Tugma, avtomatik emas: kim va qachon
       tanishgani jurnalda qolishi kerak.

       QO'SHIMCHA: oxirgi kutilgan natija ko'rilgach qabul «Natija kutilmoqda»
       holatidan CHIQADI. Ilgari bu o'tish hech qayerdan qilinmasdi va qabul
       yakunlangunicha o'sha holatda osilib turardi. */
    const markSeen = (kind: 'lab' | 'study', id: string) => guard(async () => {
        if (kind === 'lab') await api.clinical.markLabSeen(id);
        else await api.clinical.markStudySeen(id);

        const labsLeft = (visit?.labOrders || []).some(
            o => o.id !== id && o.status !== 'Cancelled' && (o.status !== 'Completed' || !o.seenByDoctorAt));
        const studiesLeft = (visit?.studies || []).some(
            s => s.id !== id && s.status !== 'Cancelled' && (s.status !== 'Completed' || !s.seenByDoctorAt));
        if (!labsLeft && !studiesLeft && visit?.status === 'AwaitingResults') {
            await api.visits.update(visit.id, { status: 'In Progress' });
        }
    }, t('visit.markedSeen'));

    /* QABUL TARTIBI (klinika egasi, 2026-11-21): «Kutmoqda» → «Qabulni
       boshlash» → «Qabulda» → «Qabulni yakunlash». Karta ochilishi qabulni
       boshlamaydi — boshlanmagan qabulda «Yakunlash» ko'rinmaydi. */
    const start = () => guard(
        () => api.visits.update(visit!.id, { status: 'In Progress' }),
        t('visit.started'),
    );

    /** «Natija kutilmoqda» dan qo'lda qaytish — bemor qaytib keldi */
    const resume = () => guard(
        () => api.visits.update(visit!.id, { status: 'In Progress' }),
        t('visit.resumed'),
    );

    const unpaidCharges = charges.filter(c => c.status === 'Unpaid');

    const issueReferral = async () => {
        if (!visit) return;
        setRefBusy(true);
        try {
            const created = await api.referrals.create({
                patientId: visit.patientId,
                visitId: visit.id,
                kind: 'Cashier',
                items: unpaidCharges.map(c => ({ name: c.name, price: c.unitPrice, quantity: c.quantity || 1 })),
            });
            const full = await api.referrals.get(created.id);
            const opened = printReferral(full, full.clinic);
            addToast(opened ? 'success' : 'info',
                opened ? `${t('visit.referralNo')} ${created.number}` : `${t('visit.referralNo')} ${created.number} — ${t('visit.printBlocked')}`);
        } catch (e: any) {
            addToast('error', e?.message || t('visit.referralFailed'));
        } finally { setRefBusy(false); }
    };

    const sendToLab = (testIds: string[]) => guard(() => api.labOrders.create({
        patientId: visit!.patientId,
        patientName,
        visitId: visit!.id,
        doctorName: visit!.doctorName || currentUserName || '',
        testIds,
    }), t('visit.sentToLab'));

    const sendToDiagnostics = (draft: StudyDraft) => guard(() => api.studies.create({
        patientId: visit!.patientId,
        patientName,
        visitId: visit!.id,
        modality: draft.modality,
        name: draft.name.trim(),
        price: Number(draft.price) || 0,
        ...(draft.serviceId ? { serviceId: Number(draft.serviceId) } : {}),
        orderedByName: visit!.doctorName || currentUserName || null,
    }), t('visit.sentToDiag'));

    const writePrescription = async (items: RxDraft[]) => {
        const ok = await savePrescription(items);
        if (!ok) return;
        rememberPrescriptions(quickOwner, items.filter(i => i.name.trim()));
        setRecentRx(recentPrescriptions(quickOwner));
    };

    const savePrescription = (items: RxDraft[]) => guard(() => api.prescriptions.create({
        patientId: visit!.patientId,
        patientName,
        visitId: visit!.id,
        doctorName: visit!.doctorName || currentUserName || null,
        items: items.filter(i => i.name.trim()).map(i => {
            /* Nom ombordagi dori bilan mos kelsa — bog'laymiz. Bunsiz
               retsept ombordan butunlay uzilgan matn bo'lib qolardi. */
            const hit = meds.find(m => m.name.trim().toLowerCase() === i.name.trim().toLowerCase());
            return {
                name: i.name.trim(), dosage: i.dosage || null, frequency: i.frequency || null,
                durationDays: i.durationDays ? Number(i.durationDays) : null,
                ...(hit ? { medicationId: hit.id } : {}),
            };
        }),
    }), t('visit.rxSaved'));

    const addService = (serviceId: number) => guard(
        () => api.visits.addProcedure(visit!.id, { serviceId }),
        t('visit.serviceAdded'), true,
    );

    /* BOSHQA SHIFOKORGA YUBORISH. Bemor o'sha bo'limning navbatiga tushadi
       va qo'lida yo'llanma qoladi — ilgari bu og'zaki edi. */
    const sendToConsult = async (draft: ConsultDraft) => {
        if (!visit || !draft.departmentId) return;
        setBusy(true);
        try {
            const doc = doctors.find(d => d.id === draft.doctorId);
            await api.visits.create({
                patientId: visit.patientId,
                departmentId: draft.departmentId,
                doctorId: draft.doctorId || undefined,
                doctorName: doc ? `${doc.firstName} ${doc.lastName}`.trim() : undefined,
                complaints: visit.complaints,
                date: todayISO(),
                status: 'Waiting',
                /* Qabul qiluvchi KIM va NIMA UCHUN yuborganini ko'radi, javob
                   esa shu qabulning «Tayinlovlar» ro'yxatiga qaytadi
                   (migratsiya 0040). */
                referralSource: 'Internal',
                referredFromVisitId: visit.id,
                referralReason: draft.reason?.trim() || null,
            } as any);
            /* Qog'oz O'ZI CHIQMAYDI (2026-11-22). Ilgari bo'sh «Konsultatsiyaga»
               varag'i so'ralmasdan ochilardi va unda «kassaga taqdim eting»
               deb yozilardi. Bemor boshqa shifokor navbatiga tushdi — shuning
               o'zi yetadi; yo'llanma yozuvi tarix uchun qoladi. */
            try {
                await api.referrals.create({
                    patientId: visit.patientId,
                    visitId: visit.id,
                    kind: 'Consult',
                    targetDepartmentId: draft.departmentId,
                    items: [],
                } as any);
            } catch { /* yo'llanma ixtiyoriy — navbat allaqachon ochildi */ }
            addToast('success', t('visit.consultSent'));
            setPanel(null);
            onVisitChanged(visitId);
        } catch (e: any) {
            addToast('error', e?.data?.error || e?.message || t('ui.xatolik'));
        } finally { setBusy(false); }
    };

    const addDiagnosis = async (code: ICD10Code, isChronic: boolean) => {
        const ok = await guard(() => api.diagnoses.add({
            patientId: visit!.patientId, code: code.code, date: visit!.date,
            notes: '', status: 'Active', clinicId: visit!.clinicId, visitId: visit!.id,
            isChronic,
        } as any), t('visit.diagnosisAdded'), true);
        if (!ok) return;
        rememberDiagnosis(quickOwner, code);
        setRecentDx(recentDiagnoses(quickOwner));
    };

    /* Tashxis turi: bosilsa asosiy → yondosh → asorat → asosiy. Server
       qabulda bitta asosiyni ushlab turadi (eskisi yondoshga tushadi). */
    const KIND_ORDER: DiagnosisKind[] = ['Main', 'Concomitant', 'Complication'];
    const cycleKind = (id: string, current: DiagnosisKind) => guard(
        () => api.diagnoses.setKind(id, KIND_ORDER[(KIND_ORDER.indexOf(current) + 1) % KIND_ORDER.length]),
        t('visit.dxKindChanged'), true,
    );

    /** «O'tgan safar» dagi dorilarni shu qabulga bir bosishda yozish */
    const repeatPrescriptions = (rxs: Prescription[]) => writePrescription(
        rxs.flatMap(rx => rx.items || []).map(i => ({
            name: i.name || '', dosage: i.dosage || '', frequency: i.frequency || '',
            durationDays: i.durationDays ? String(i.durationDays) : '',
        })),
    );

    const removeDiagnosis = async (id: string) => {
        if (!await confirmAction({ title: t('visit.diagnosisRemove'), body: t('visit.diagnosisRemoveBody'), confirmLabel: t('common.delete') })) return;
        guard(() => api.diagnoses.delete(id), t('visit.diagnosisRemoved'));
    };

    const cancelOrder = async (kind: 'lab' | 'study', id: string, paid: boolean) => {
        if (paid) { addToast('error', t('visit.cancelPaidBlocked')); return; }
        if (!await confirmAction({ title: t('visit.cancelOrder'), body: t('visit.cancelOrderBody'), confirmLabel: t('common.delete') })) return;
        guard(() => kind === 'lab' ? api.labOrders.delete(id) : api.studies.delete(id), t('visit.orderCancelled'));
    };

    const removePrescription = async (rx: Prescription) => {
        if (!await confirmAction({ title: t('visit.rxRemove'), body: t('visit.rxRemoveBody'), confirmLabel: t('common.delete') })) return;
        guard(() => api.prescriptions.delete(rx.id), t('visit.rxRemoved'));
    };

    const removeProcedure = async (procedureId: string) => {
        try { await api.visits.removeProcedure(procedureId); reload(); onVisitChanged(visitId); }
        catch (e: any) { addToast('error', e?.message || t('ui.xatolik')); }
    };

    /* QABULNI YAKUNLASH — NAZORAT BILAN.
       Server tashxis, qarz va kelmagan natijalarni tekshiradi; kamchilik
       bo'lsa 409 va sabablar. Taqiq emas, tanlov: shifokor BILIB yopadi va
       sabab qabul izohiga yozilib qoladi. */
    const complete = async () => {
        if (autosave.isExamInvalid()) { addToast('error', t('visit.invalidNotSaved')); return; }
        setBusy(true);
        try {
            /* Avval yozilgan matn ketadi: forma o'zi saqlanadi, lekin oxirgi
               harflar hali taymerda yoki yo'lda turgan bo'lishi mumkin.
               Saqlanmasa yakunlamaymiz — yopilgan qabulga yozib bo'lmaydi. */
            if (!(await autosave.flush())) return;
            await api.visits.update(visit!.id, { status: 'Completed' });
            /* Yakunlangan qabul VARAQDA QOLADI. Ilgari u darhol tozalanardi
               va o'rniga «Ochiq qabul yo'q» chiqardi — shifokor endigina
               nima yopganini ko'ra olmasdi va «bosildimi?» degan savol
               qolardi. Endi u faqat o'qish uchun ko'rinadi; keyingi bemor
               boshqa kartada ochiladi. */
            await reload(); onVisitChanged(visitId);
            addToast('success', t('visit.completedOk'));
            setPanel(null);
        } catch (e: any) {
            if (e?.data?.code === 'VISIT_INCOMPLETE') {
                const reasons: { code?: string; text: string }[] = e.data.reasons || [];
                const nl = String.fromCharCode(10);
                /* FAQAT TASHXIS TO'XTATADI (2026-11-22). Qarz — kassirning
                   ishi, kelmagan natija — laboratoriyaniki: ular deyarli har
                   qabulda chiqardi va shifokor oynani o'qimay «Baribir
                   yakunlash» ni bosadigan bo'lib qolgan edi. Endi ular faqat
                   xabar bo'lib ko'rinadi, savol esa tashxis yo'q bo'lsagina. */
                const blocking = reasons.some(r => r.code === 'NO_DIAGNOSIS');
                const proceed = !blocking || await confirmAction({
                    title: t('visit.incompleteTitle'),
                    body: `${reasons.map(r => '• ' + r.text).join(nl)}${nl}${nl}${t('visit.incompleteBody')}`,
                    confirmLabel: t('visit.completeAnyway'),
                });
                if (proceed) {
                    try {
                        await api.visits.update(visit!.id, {
                            status: 'Completed', force: true,
                            closeReason: t('visit.closedWith') + ' ' + reasons.map(r => r.text).join('; '),
                        } as any);
                        await reload(); onVisitChanged(visitId);
                        addToast('success', blocking ? t('visit.completedOk')
                            : `${t('visit.completedOk')} · ${reasons.map(r => r.text).join('; ')}`);
                        setPanel(null);
                    } catch (e2: any) { addToast('error', e2?.message || t('ui.xatolik')); }
                }
            } else { addToast('error', e?.message || t('ui.xatolik')); }
        } finally { setBusy(false); }
    };

    /* QABULNI BEKOR QILISH. `Cancelled` holati kodda hamma filtrda bor edi,
       lekin uni HECH QAYERDAN qo'yib bo'lmasdi: xato ochilgan qabul navbatda
       abadiy osilib turardi. Faqat pul o'tmagan qabul bekor qilinadi. */
    const cancelVisit = async () => {
        if (money.paid > 0) { addToast('error', t('visit.cancelPaidVisit')); return; }
        const ok = await confirmAction({
            title: t('visit.cancelVisit'), body: t('visit.cancelVisitBody'), confirmLabel: t('visit.cancelVisit'),
        });
        if (!ok) return;
        setBusy(true);
        try {
            await api.visits.update(visit!.id, { status: 'Cancelled' });
            await reload(); onVisitChanged(null);
            addToast('success', t('visit.visitCancelled'));
        } catch (e: any) { addToast('error', e?.message || t('ui.xatolik')); }
        finally { setBusy(false); }
    };

    // ── Ko'rinish ───────────────────────────────────────────────────────────

    if (loading) return (
        <div className="bg-surface rounded-[20px] border border-line p-10 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
    );

    /* Ochiq qabul yo'q — «Bugungi qabul» o'rnida qabul ochish formasi,
       ostida «O'tgan safar» (qayta kelgan bemorda vrach shundan boshlaydi) */
    if (!visit) {
        return (
            <div className="min-w-0 flex flex-col gap-4">
                <OpenVisitForm patient={patient} departments={departments} doctors={doctors} services={services}
                    loggedDoctorId={loggedDoctorId} error={error} addToast={addToast} onOpened={onVisitChanged} />
                {previousVisit && (
                    <div className="bg-surface border border-line rounded-2xl p-4">
                        <PreviousVisit visit={previousVisit} onOpen={onOpenVisit} />
                    </div>
                )}
            </div>
        );
    }

    const dept = departments.find(d => d.id === visit.departmentId);
    const room = doctors.find(d => d.id === visit.doctorId)?.room;
    const isClosed = visit.status === 'Completed' || visit.status === 'Cancelled';
    /* Qabulga faqat ega, shifokor va registrator yoza oladi
       (`backend/permissions.ts`). Hamshira va laborantga varaq yopiq qabul
       kabi ko'rinadi — tugmalar bosilsa server baribir 403 qaytarardi. */
    const canAct = userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.DOCTOR || userRole === UserRole.RECEPTIONIST;
    const isDone = isClosed || !canAct;
    const isToday = visit.date === todayISO();
    const deptServices = services.filter(s => !s.departmentId || s.departmentId === visit.departmentId);
    const canCancelVisit = userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.RECEPTIONIST;
    /* Bayon va tashxis — shifokorniki: server registratorga ularni 403 bilan rad etadi
       (backend/multiprofile.ts, CLINICAL_FIELDS_DENIED). Shikoyat esa qabulxonada ham yoziladi. */
    const clinicalReadOnly = isDone || userRole === UserRole.RECEPTIONIST;
    const startNewVisit = isClosed && isToday && canAct ? () => onVisitChanged(null) : undefined;
    const notStarted = visit.status === 'Waiting' || visit.status === 'Called';

    const diagnoses = visit.diagnoses || [];
    const prescriptions = visit.prescriptions || [];
    const procedures = visit.procedures || [];
    const labOrders = (visit.labOrders || []).filter(o => o.status !== 'Cancelled');
    const studies = (visit.studies || []).filter(s => s.status !== 'Cancelled');
    const referredOut = visit.referredVisits || [];
    const orderCount = procedures.length + labOrders.length + studies.length + prescriptions.length + referredOut.length;

    const title = isToday ? t('visit.panelTitle') : fill(t('visit.panelTitlePast'), formatDate(visit.date));
    const titleNote = [visit.doctorName || dept?.name || t('visit.noDept'), room ? fill(t('visit.room'), room) : ''].filter(Boolean).join(', ');

    const { save } = autosave;
    const saveLabel = isDone ? ''
        : autosave.examInvalid ? t('visit.invalidNotSaved')
            : save.state === 'saving' ? t('visit.saving')
                : save.state === 'saved' ? fill(t('visit.savedAt'), formatTime(save.at))
                    : save.state === 'error' ? t('visit.saveFailed')
                        : '';
    const saveTone = autosave.examInvalid || save.state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted';

    const orderStatus = (done: boolean, seen: boolean) =>
        done ? (seen ? t('visit.resultSeen') : t('visit.resultReady')) : t('visit.pending');

    /* TAYINLOVLAR — har biri o'z tugmasi bilan (2026-11-23, vrach ish joyi).
       Ilgari hammasi bitta «+ Qo'shish» oynasining ichki tablarida edi. Tanlov
       oynada ochiladi (u keng), lekin tab qatorisiz — qaysi tugma bosilgan
       bo'lsa, o'sha. Dori — faqat shifokor va egada (server registratorga 403). */
    const orderKinds: { id: AddKind; label: string }[] = [
        { id: 'lab', label: t('visit.sendLab') },
        { id: 'study', label: t('visit.sendStudy') },
        ...(clinicalReadOnly ? [] : [{ id: 'rx' as const, label: t('visit.addRx') }]),
        { id: 'service', label: t('visit.addSvcShort') },
        { id: 'consult', label: t('visit.referOut') },
    ];
    const panelShown = panel && orderKinds.some(k => k.id === panel) ? panel : null;
    const closedToday = visit.status === 'Completed' && isToday && canAct;

    /* Ko'rik shabloni: tanlangani yoki bo'limning standarti (bemor jinsiga mos) */
    const fitTemplates = templates.filter(x => x.departmentId === visit.departmentId
        && (!x.gender || !patient.gender || x.gender === patient.gender));
    const chosenTemplateId = pickedTemplate?.visitId === visit.id ? pickedTemplate.id : visit.templateId;
    const template = fitTemplates.find(x => x.id === chosenTemplateId)
        || fitTemplates.find(x => x.isDefault) || fitTemplates[0];
    /* Shablon almashsa — qabulga yoziladi (o'sha avtomatik saqlash yo'li bilan) */
    const pickTemplate = (id: string) => {
        setPickedTemplate({ visitId: visit.id, id });
        let data: Record<string, any> = {};
        try { data = JSON.parse(visit.examData || '{}') || {}; } catch { /* bo'sh */ }
        autosave.onExamChange(data, id, []);
    };
    const fillFromTemplate = () => {
        const text = objectiveTemplateText(template);
        if (text) autosave.onObjectiveChange(autosave.objective.trim() ? `${autosave.objective.trimEnd()}\n${text}` : text);
    };
    /* Eski shakldagi ko'rik (alohida maydonlar) — faqat o'qish uchun, yo'qolmasin */
    const legacyExam = hasExamData(visit.examData) && template
        && template.fields.some(f => !isVitalField(f) && (() => {
            try { const v = JSON.parse(visit.examData || '{}')[f.key]; return v !== undefined && v !== '' && v !== false; }
            catch { return false; }
        })());

    const textCls = 'w-full px-3 py-2.5 rounded-xl border border-line bg-canvas text-ink text-sm leading-relaxed resize-y focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:text-muted';
    const secCls = 'px-5 py-4 border-t border-line first:border-t-0 flex flex-col gap-2.5';
    const secHead = (label: string, right?: React.ReactNode, id?: string) => (
        <div className="flex flex-wrap items-center gap-2">
            <h3 id={id} className="text-[14px] font-semibold text-ink">{label}</h3>
            {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
        </div>
    );
    const smallBtn = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-primary-200 dark:border-primary-800 text-[13px] font-semibold text-primary-700 dark:text-primary-300 bg-primary-50/40 dark:bg-primary-900/10 hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-50';

    const printSummary = () => {
        const ok = printVisitSummary(visit, patient, {
            clinic, departmentName: dept?.name, template,
        });
        if (!ok) addToast('info', t('visit.printBlocked'));
    };

    return (
        <section aria-labelledby="visit-title" className="min-w-0 bg-surface border border-line rounded-2xl">
            <div className="px-5 py-4">
                <VisitHeader
                    visit={visit}
                    title={title}
                    titleNote={titleNote}
                    statusLabel={t(VISIT_STATUS_KEY[visit.status] || 'visit.status.Waiting')}
                    statusDot={STATUS_DOT[visit.status] || STATUS_DOT['Waiting']}
                    saveLabel={saveLabel && (
                        <span role="status" className={`whitespace-nowrap ${saveTone}`}>
                            · {saveLabel}
                            {save.state === 'error' && (
                                <button type="button" onClick={() => { void autosave.flush(); }}
                                    className="ml-1.5 font-semibold underline">{t('ui.qayta_urinish')}</button>
                            )}
                        </span>
                    )}
                    money={money}
                    busy={busy}
                    referralBusy={refBusy}
                    onStart={!isDone && notStarted ? start : undefined}
                    onPrintReferral={issueReferral}
                    onCancelVisit={!isDone && canCancelVisit ? cancelVisit : undefined}
                />
                {error && (
                    <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                )}
            </div>

            {/* KIM YO'NALTIRDI — qabul qiluvchi nima uchun kelganini birinchi ko'radi */}
            {visit.referralSource && (
                <p className="px-5 py-2.5 border-t border-line bg-primary-50/50 dark:bg-primary-900/10 text-sm text-ink">
                    <b>{t('visit.referredBy')}</b> {visit.referredByName || '—'}
                    {visit.referralReason && <> — «{visit.referralReason}»</>}
                    {visit.referredFrom && onOpenVisit && (
                        <button type="button" onClick={() => onOpenVisit(visit.referredFrom!.id)}
                            className="ml-2 font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                            {t('visit.referredFromOpen')} ›
                        </button>
                    )}
                </p>
            )}

            {previousVisit && !isClosed && (
                <div className="px-5 py-3 border-t border-line">
                    <PreviousVisit visit={previousVisit} onOpen={onOpenVisit}
                        onRepeatRx={clinicalReadOnly || busy ? undefined : repeatPrescriptions} />
                </div>
            )}

            <div className="border-t border-line">
                {/* 1. SHIKOYAT VA KASALLIK ANAMNEZI — qabulxonada ham yoziladi */}
                <div className={secCls}>
                    {secHead(t('visit.complaintAnamLabel'))}
                    <textarea rows={3} value={autosave.complaint} disabled={isDone} aria-label={t('visit.complaintAnamLabel')}
                        placeholder={isDone ? t('visit.noComplaint') : t('visit.complaintAnamPh')}
                        onChange={e => autosave.onComplaintChange(e.target.value)}
                        onBlur={autosave.onComplaintBlur}
                        className={textCls} />
                </div>

                {/* 2. KO'RIK — raqamlar qatorda, qolgani bitta matn */}
                {(!clinicalReadOnly || visit.objectiveText || hasExamData(visit.examData)) && (
                    <div className={secCls}>
                        {secHead(t('visit.examLabel'), !clinicalReadOnly && template && (
                            <>
                                {fitTemplates.length > 1 && (
                                    <select value={template.id} aria-label={t('ui.qabul_bayoni')}
                                        onChange={e => pickTemplate(e.target.value)}
                                        className="h-8 px-2.5 rounded-xl border border-line bg-surface text-[13px] font-semibold text-muted">
                                        {fitTemplates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                    </select>
                                )}
                                <button type="button" onClick={fillFromTemplate} className={smallBtn}>
                                    {t('visit.fillFromTemplate')}
                                </button>
                            </>
                        ))}
                        <EncounterForm
                            only="vitals"
                            templates={templates.filter(x => x.departmentId === visit.departmentId)}
                            patientGender={patient.gender === 'Male' || patient.gender === 'Female' ? patient.gender : null}
                            patientAge={calcAge(patient.dob)}
                            departmentId={visit.departmentId || undefined}
                            templateId={template?.id || visit.templateId || undefined}
                            /* `|| {}` YO'Q: bo'sh qabulda u har renderda YANGI
                               obyekt berardi va forma o'zini qayta to'ldirardi. */
                            value={visit.examData}
                            readOnly={clinicalReadOnly}
                            onChange={autosave.onExamChange}
                        />
                        {clinicalReadOnly ? (
                            visit.objectiveText && <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{visit.objectiveText}</p>
                        ) : (
                            <textarea rows={4} value={autosave.objective} aria-label={t('visit.examLabel')}
                                placeholder={t('visit.examPh')}
                                onChange={e => autosave.onObjectiveChange(e.target.value)}
                                onBlur={autosave.onObjectiveBlur}
                                className={textCls} />
                        )}
                        {legacyExam && (
                            <div className="flex flex-col gap-1.5">
                                <SheetLabel>{t('visit.oldExam')}</SheetLabel>
                                <EncounterSummary template={{ ...template!, fields: template!.fields.filter(f => !isVitalField(f)) }} value={visit.examData} />
                            </div>
                        )}
                    </div>
                )}

                {/* 3. TASHXIS — turi bilan; qidiruv shu yerning o'zida */}
                <div className={secCls}>
                    {secHead(t('visit.blockDx'))}
                    {diagnoses.length > 0 && (
                        <ul aria-label={t('visit.blockDx')} className="flex flex-col">
                            {diagnoses.map((d, i) => {
                                const kind: DiagnosisKind = d.kind || (i === 0 ? 'Main' : 'Concomitant');
                                return (
                                    <li key={d.id} className="flex items-center gap-3 py-2 text-sm border-t border-line first:border-t-0">
                                        <b className="w-14 shrink-0 text-ink">{d.code}</b>
                                        <span className="min-w-0 flex-1 text-ink">
                                            {d.icd10?.name || ''}
                                            {d.isChronic && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{t('visit.chronic')}</span>}
                                        </span>
                                        <button type="button" disabled={clinicalReadOnly || busy}
                                            onClick={() => cycleKind(d.id, kind)}
                                            title={clinicalReadOnly ? undefined : t('visit.dxKindHint')}
                                            className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold ${kind === 'Main'
                                                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                                                : kind === 'Complication' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                    : 'bg-elevated text-muted'} disabled:cursor-default`}>
                                            {t(`visit.dxKind.${kind}` as any)}
                                        </button>
                                        {!clinicalReadOnly && (
                                            <button type="button" onClick={() => removeDiagnosis(d.id)} aria-label={`${t('common.delete')}: ${d.code}`}
                                                className="shrink-0 w-7 h-7 grid place-items-center rounded-md text-faint hover:text-red-500">×</button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {!clinicalReadOnly ? (
                        <DiagnosisPicker diagnoses={diagnoses} recent={recentDx} busy={busy} onAdd={addDiagnosis} />
                    ) : diagnoses.length === 0 && (
                        <p className="text-sm text-faint">{t('visit.noDiagnosisYet')}</p>
                    )}
                </div>

                {/* 4. TAYINLOVLAR — ochiq tugmalar, ostida ro'yxat */}
                <div className={secCls}>
                    {secHead(t('visit.ordersLabel'), !isDone && orderKinds.map(k => (
                        <button key={k.id} type="button" onClick={() => setPanel(k.id)} className={smallBtn}>
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {k.label}
                        </button>
                    )))}

                    {/* Tayyor natijalar — ro'yxatning tepasida, ko'zga birinchi tushsin */}
                    <VisitResults visit={visit} busy={busy} onMarkSeen={markSeen}
                        canMark={userRole === UserRole.DOCTOR || userRole === UserRole.CLINIC_ADMIN} />

                    {orderCount === 0 ? (
                        <p className="text-sm text-faint">{isDone ? t('visit.emptyTodayDone') : t('visit.noOrders')}</p>
                    ) : (
                        <ul aria-label={t('visit.todayList')} className="flex flex-col">
                            {labOrders.map(o => {
                                const ch = chargeOf('Lab', o.id);
                                const done = o.status === 'Completed';
                                return (
                                    <ItemRow key={o.id} icon={FlaskConical}
                                        main={(o.items || []).map(i => i.testName).join(', ') || t('visit.tabLab')}
                                        kind={t('visit.sendLab')}
                                        sub={orderStatus(done, !!o.seenByDoctorAt)} tone={done ? 'ok' : 'wait'}
                                        right={fill(t('ui.x_som'), fmt(o.totalPrice))} charge={ch}
                                        onDelete={isDone || done ? undefined : () => cancelOrder('lab', o.id, !!ch && ch.status === 'Paid')} />
                                );
                            })}
                            {studies.map(s => {
                                const ch = chargeOf('Study', s.id);
                                const done = s.status === 'Completed';
                                return (
                                    <ItemRow key={s.id} icon={Scan}
                                        main={studyTitle(MODALITY_LABELS[s.modality] || s.modality, s.name)}
                                        kind={t('visit.sendStudy')}
                                        sub={orderStatus(done, !!s.seenByDoctorAt)} tone={done ? 'ok' : 'wait'}
                                        right={fill(t('ui.x_som'), fmt(s.price))} charge={ch}
                                        onDelete={isDone || done ? undefined : () => cancelOrder('study', s.id, !!ch && ch.status === 'Paid')} />
                                );
                            })}
                            {prescriptions.map(rx => (
                                <ItemRow key={rx.id} icon={Pill}
                                    main={(rx.items || []).map(i => i.name).join(', ')}
                                    kind={t('visit.prescription')}
                                    sub={(rx.items || []).map(i => [i.dosage, i.frequency, i.durationDays ? `${i.durationDays} ${t('visit.days')}` : '']
                                        .filter(Boolean).join(' ')).filter(Boolean).join('; ') || undefined}
                                    action={(
                                        <button type="button" onClick={() => printPrescription({ ...rx, patient }, clinic)}
                                            title={t('common.print')} aria-label={t('common.print')}
                                            className="w-7 h-7 grid place-items-center rounded-md text-faint hover:text-primary-600 hover:bg-elevated shrink-0">
                                            <Printer className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    onDelete={isDone ? undefined : () => removePrescription(rx)} />
                            ))}
                            {procedures.map(p => (
                                <ItemRow key={p.id} icon={Stethoscope} main={p.procedureName}
                                    kind={t('visit.addSvcShort')}
                                    right={fill(t('ui.x_som'), fmt(p.finalPrice))}
                                    charge={chargeOf('Service', p.id)}
                                    /* To'langan xizmat o'chirilmaydi — server ham rad etadi */
                                    onDelete={isDone || (chargeOf('Service', p.id)?.paidAmount || 0) > 0 ? undefined : () => removeProcedure(p.id)} />
                            ))}
                            {/* Yo'naltirilganlar — javobi shu yerga qaytadi */}
                            {referredOut.map(r => {
                                const seen = r.status === 'Completed';
                                const codes = (r.diagnoses || []).map(d => d.code).join(', ');
                                return (
                                    <ItemRow key={r.id} icon={Send}
                                        main={[r.department?.name, r.doctorName].filter(Boolean).join(' · ') || t('visit.referOut')}
                                        kind={t('visit.referOut')}
                                        sub={seen ? [t('visit.referSeen'), codes].filter(Boolean).join(': ') : t('visit.referWaiting')}
                                        tone={seen ? 'ok' : 'wait'}
                                        action={onOpenVisit ? (
                                            <button type="button" onClick={() => onOpenVisit(r.id)}
                                                className="shrink-0 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                                {seen ? t('visit.referOpenAnswer') : t('visit.referOpen')} ›
                                            </button>
                                        ) : undefined} />
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* 5. XULOSA VA TAVSIYALAR — bemorga qog'ozda beriladi */}
                {(!clinicalReadOnly || visit.treatmentPlan) && (
                    <div className={secCls}>
                        {secHead(t('visit.conclusionLabel'))}
                        {clinicalReadOnly ? (
                            <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{visit.treatmentPlan}</p>
                        ) : (
                            <textarea rows={3} value={autosave.conclusion} aria-label={t('visit.conclusionLabel')}
                                placeholder={t('visit.conclusionPh')}
                                onChange={e => autosave.onConclusionChange(e.target.value)}
                                onBlur={autosave.onConclusionBlur}
                                className={textCls} />
                        )}
                    </div>
                )}
            </div>

            <div className="sticky bottom-0 z-10 px-5 py-4 border-t border-line bg-surface rounded-b-2xl flex flex-col gap-3">
                {/* YAKUNLANGACH — bemor qo'liga qog'oz va keyingi qabul */}
                {closedToday && (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={printSummary}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-elevated">
                            <Printer className="w-4 h-4" aria-hidden="true" /> {t('visit.printSummary')}
                        </button>
                        {onSchedule && (
                            <button type="button" onClick={onSchedule}
                                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-elevated">
                                <CalendarPlus className="w-4 h-4" aria-hidden="true" /> {t('visit.bookNext')}
                            </button>
                        )}
                    </div>
                )}
                <VisitActions
                    visit={visit}
                    busy={busy}
                    canFinish={!isDone}
                    notStarted={notStarted}
                    onComplete={complete}
                    onResume={visit.status === 'AwaitingResults' ? resume : undefined}
                    onShowToday={!isToday ? onShowToday : undefined}
                    onNewVisit={startNewVisit}
                />
            </div>

            {/* Tayinlov tanlovi — bosilgan tugmaning o'zi, tab qatorisiz */}
            <Modal isOpen={!!panelShown && !isDone} onClose={() => setPanel(null)}
                title={orderKinds.find(k => k.id === panelShown)?.label || t('visit.addTitle')} className="max-w-2xl">
                {panelShown === 'rx' && <RxForm meds={meds} recent={recentRx} busy={busy} onSave={writePrescription} />}
                {panelShown === 'service' && <ServicePicker services={deptServices} busy={busy} onAdd={addService} />}
                {panelShown === 'lab' && <LabPicker tests={labTests} busy={busy} onSend={sendToLab} />}
                {panelShown === 'study' && <StudyPicker services={ownStudies} more={otherStudies} busy={busy} onSend={sendToDiagnostics} />}
                {panelShown === 'consult' && (
                    <ConsultPicker departments={bookableDepts.filter(d => d.id !== visit.departmentId)}
                        doctors={doctors} busy={busy} onSend={sendToConsult} />
                )}
                {/* Xizmat bir bosishda qo'shiladi va oyna ochiq qoladi */}
                {panelShown === 'service' && (
                    <div className="mt-4 pt-3 border-t border-line flex justify-end">
                        <button type="button" onClick={() => setPanel(null)}
                            className="h-9 px-4 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700">
                            {t('visit.addDone')}
                        </button>
                    </div>
                )}
            </Modal>
        </section>
    );
};

/* ── «O'TGAN SAFAR» — bitta qator, bosilsa shu yerda ochiladi ──────────────
   Qayta kelgan bemorda vrach birinchi shuni so'raydi: o'tgan safar nima
   topildi, nima buyurildi, tahlil nima chiqdi. Ilgari buning uchun «Tarix»
   va «Tahlillar» tablariga o'tish kerak edi. */
const PreviousVisit: React.FC<{
    visit: Visit;
    onOpen?: (visitId: string) => void;
    onRepeatRx?: (rxs: Prescription[]) => void;
}> = ({ visit, onOpen, onRepeatRx }) => {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const dx = (visit.diagnoses || []).map(d => d.code).join(', ');
    const rxs = visit.prescriptions || [];
    const labs = (visit.labOrders || []).filter(o => o.status !== 'Cancelled');
    const ready = labs.some(o => o.status === 'Completed');
    return (
        <div className="rounded-xl border border-line bg-canvas/60">
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
                className="w-full flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2.5 text-left text-sm">
                <b className="text-ink">{t('visit.prevVisit')}</b>
                <span className="text-muted">{formatDate(visit.date)}{dx ? ` · ${dx}` : ''}{visit.doctorName ? ` · ${visit.doctorName}` : ''}</span>
                {ready && <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{t('visit.prevLabReady')}</span>}
                <span className="ml-auto text-[13px] font-semibold text-primary-700 dark:text-primary-300">{open ? t('visit.prevHide') : t('visit.prevShow')}</span>
            </button>
            {open && (
                <div className="px-3.5 pb-3 grid gap-3 sm:grid-cols-2 text-sm">
                    <div className="flex flex-col gap-1.5">
                        <SheetLabel>{t('visit.conclusionLabel')}</SheetLabel>
                        <p className="text-ink whitespace-pre-wrap">{visit.treatmentPlan || '—'}</p>
                        {rxs.length > 0 && (
                            <p className="text-ink">
                                <span className="text-muted">{t('visit.prescription')}: </span>
                                {rxs.flatMap(r => r.items || []).map(i => i.name).join(', ')}
                                {onRepeatRx && (
                                    <button type="button" onClick={() => onRepeatRx(rxs)}
                                        className="ml-2 text-[13px] font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                        {t('visit.repeatRx')}
                                    </button>
                                )}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <SheetLabel>{t('visit.prevLabs')}</SheetLabel>
                        {labs.length === 0 ? <p className="text-faint">—</p> : labs.map(o => (
                            <p key={o.id} className="text-ink">
                                {(o.items || []).map(i => i.testName).join(', ')}
                                <span className="text-muted"> — {o.status === 'Completed' ? t('visit.resultReady') : t('visit.pending')}</span>
                            </p>
                        ))}
                        {onOpen && (
                            <button type="button" onClick={() => onOpen(visit.id)}
                                className="self-start text-[13px] font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                {t('visit.prevOpenFull')} ›
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
