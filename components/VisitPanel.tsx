import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    FlaskConical, Scan, Pill, AlertCircle, ClipboardList,
    Printer, Stethoscope, Loader2, Plus, CalendarPlus,
} from 'lucide-react';
import {
    Visit, Department, EncounterTemplate, LabTest, Service, Doctor, Patient,
    MODALITY_LABELS, ICD10Code, VisitCharge, ChargeSummary, UserRole,
    Prescription, InventoryItem, Clinic,
} from '../types';
import { printVisitSummary } from '../utils/printVisitSummary';
import { api } from '../services/api';
import { useResourceSync } from '../hooks/useDataSync';
import { useVisitAutosave } from '../hooks/useVisitAutosave';
import { useLanguage, fill } from '../context/LanguageContext';
import { EncounterForm, EncounterSummary } from '../components/EncounterForm';
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
    /** «Tibbiy tarix» blokining boshi — allergiya va kasalliklar (karta beradi) */
    history?: React.ReactNode;
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

/** Ikki blok yonma-yon (DentaCRM dagidek), tor ekranda ustma-ust */
const gridCls = 'min-w-0 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start';
const boxCls = 'min-w-0 bg-surface border border-line rounded-2xl p-5 flex flex-col gap-4';

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
    onSchedule, history, clinic, addRequest,
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
    /** Ko'rik formasi ochilganmi (bo'sh qabulda u yopiq turadi) */
    const [examOpen, setExamOpen] = useState(false);
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

    useEffect(() => { setLoading(!!visitId); setPanel(null); setExamOpen(false); reload(); }, [reload, visitId]);

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
                complaints: draft.reason || visit.complaints,
                date: todayISO(),
                status: 'Waiting',
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

    /* «Tibbiy tarix» bloki — DentaCRM dagi o'ng blok. Allergiya va
       kasalliklar (`history`, karta beradi) har doim; shikoyat va ko'rik —
       ochiq qabul bo'lsa. */
    const historyBox = (body?: React.ReactNode) => (
        <section aria-labelledby="medhist-title" className={boxCls}>
            <h2 id="medhist-title" className="text-[17px] font-semibold text-ink leading-snug">{t('card.medHistory')}</h2>
            {history}
            {body}
        </section>
    );

    if (loading) return (
        <div className="bg-surface rounded-[20px] border border-line p-10 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
    );

    /* Ochiq qabul yo'q — «Bugungi qabul» o'rnida qabul ochish formasi */
    if (!visit) {
        return (
            <div className={gridCls}>
                <OpenVisitForm patient={patient} departments={departments} doctors={doctors} services={services}
                    loggedDoctorId={loggedDoctorId} error={error} addToast={addToast} onOpened={onVisitChanged} />
                {historyBox()}
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
    const itemCount = diagnoses.length + procedures.length + labOrders.length + studies.length + prescriptions.length;

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

    /* «+ Qo'shish» oynasidagi turlar. Tashxis — faqat shifokor va egada
       (registratorga server 403 beradi), qolgani ochiq qabulda hammaga. */
    /* Tartib — shifokor ishlaydigan tartibda (2026-11-22): avval tashxis,
       keyin nima tekshiriladi, nima ichiladi, oxirida xizmat. Ilgari doim
       «Xizmat» da ochilardi, tashxis esa beshinchi edi. Retsept faqat
       shifokor va egada (server registratorga 403). */
    const addKinds: { id: AddKind; label: string }[] = [
        ...(clinicalReadOnly ? [] : [{ id: 'dx' as const, label: t('visit.blockDx') }]),
        { id: 'lab', label: t('visit.sendLab') },
        { id: 'study', label: t('visit.sendStudy') },
        ...(clinicalReadOnly ? [] : [{ id: 'rx' as const, label: t('visit.addRx') }]),
        { id: 'service', label: t('visit.addSvcShort') },
        { id: 'consult', label: t('visit.sendConsult') },
    ];
    const panelShown = panel && addKinds.some(k => k.id === panel) ? panel : null;
    const closedToday = visit.status === 'Completed' && isToday && canAct;

    /* Ko'rik formasi yopiq turadi — har bemorda kerak emas (stomatolog
       ochmaydi ham). Yozilgani bo'lsa yoki shifokor ochsa — ochiq. */
    const examShown = examOpen || hasExamData(visit.examData);

    /* Shikoyat qabulxonada ham yoziladi, shuning uchun registratorga ochiq. */
    const complaintField = (
        <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">{t('visit.complaintLabel')}</span>
            <textarea rows={2} value={autosave.complaint} disabled={isDone}
                placeholder={isDone ? t('visit.noComplaint') : t('visit.complaintPh')}
                onChange={e => autosave.onComplaintChange(e.target.value)}
                onBlur={autosave.onComplaintBlur}
                className="w-full px-3 py-2.5 rounded-xl border border-line bg-canvas text-ink text-sm leading-relaxed resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:text-muted" />
        </label>
    );

    const examBlock = (
        <div className="flex flex-col gap-4 pt-4 border-t border-line">
            {clinicalReadOnly ? (
                /* Yoza olmaydigan odamga (yakunlangan qabul, registrator)
                   bo'sh maydonlar to'ri emas, YOZILGANI ko'rsatiladi. */
                hasExamData(visit.examData) && (
                    <div className="flex flex-col gap-2">
                        <SheetLabel>{t('ui.qabul_bayoni')}</SheetLabel>
                        <EncounterSummary template={templates.find(x => x.id === visit.templateId)} value={visit.examData} />
                    </div>
                )
            ) : examShown ? (
                /* Bemor jinsi va yoshi UZATILADI: mos kelmaydigan shablon
                   (masalan homiladorlik) erkak bemorga ochilmasin. */
                <EncounterForm
                    templates={templates.filter(x => x.departmentId === visit.departmentId)}
                    patientGender={patient.gender === 'Male' || patient.gender === 'Female' ? patient.gender : null}
                    patientAge={calcAge(patient.dob)}
                    departmentId={visit.departmentId || undefined}
                    templateId={visit.templateId || undefined}
                    /* `|| {}` YO'Q. Bo'sh qabulda u har renderda YANGI obyekt
                       berardi va forma o'zini har safar qayta to'ldirardi. Matn
                       (yoki `undefined`) esa o'zgarmaguncha bir xil qoladi. */
                    value={visit.examData}
                    onChange={autosave.onExamChange}
                />
            ) : (
                <button type="button" onClick={() => setExamOpen(true)}
                    className="self-start inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-elevated">
                    <Plus className="w-4 h-4" aria-hidden="true" /> {t('visit.examOpen')}
                </button>
            )}
        </div>
    );

    /* XULOSA VA TAVSIYALAR (2026-11-22). Klinika egasi: «shifokor o'tirib
       olib uzun qilib xulosa yozadiku — o'sha narsa yo'q». Ko'rik — o'lchovlar,
       bu esa shifokorning o'z so'zi: nima topildi, nima qilinadi, bemorga nima
       tavsiya. Qabul oxirida yoziladi — shuning uchun «Qabulni yakunlash»
       ustida. Qog'ozlarga ham tushadi. Serverda maydon (`treatmentPlan`) bor
       edi, ekranda yo'q edi. */
    const conclusionBlock = (
        <div className="pt-3 border-t border-line">
            {clinicalReadOnly ? (
                visit.treatmentPlan ? (
                    <div className="flex flex-col gap-1.5">
                        <SheetLabel>{t('visit.conclusionLabel')}</SheetLabel>
                        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{visit.treatmentPlan}</p>
                    </div>
                ) : null
            ) : (
                <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-muted">{t('visit.conclusionLabel')}</span>
                    <textarea rows={4} value={autosave.conclusion}
                        placeholder={t('visit.conclusionPh')}
                        onChange={e => autosave.onConclusionChange(e.target.value)}
                        onBlur={autosave.onConclusionBlur}
                        className="w-full px-3 py-2.5 rounded-xl border border-line bg-canvas text-ink text-sm leading-relaxed resize-y focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                </label>
            )}
        </div>
    );

    const printSummary = () => {
        const ok = printVisitSummary(visit, patient, {
            clinic, departmentName: dept?.name,
            template: templates.find(x => x.id === visit.templateId),
        });
        if (!ok) addToast('info', t('visit.printBlocked'));
    };

    return (
        <section aria-labelledby="visit-title" className={gridCls}>
            {/* ── BUGUNGI QABUL ─────────────────────────────────────────────── */}
            <div className={boxCls}>
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
                    onAdd={isDone ? undefined : () => setPanel(p => (p ? null : addKinds[0].id))}
                    addOpen={!!panel}
                    onStart={!isDone && notStarted ? start : undefined}
                    onPrintReferral={issueReferral}
                    onCancelVisit={!isDone && canCancelVisit ? cancelVisit : undefined}
                />

                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                )}

                {/* SHIKOYAT — VARAQNING BOSHIDA (2026-11-22). Ilgari u o'ngdagi
                    «Tibbiy tarix» ning sakkiz bo'limi ostida, ikki ekran pastda
                    edi — shifokor birinchi yozadigan narsa eng oxirida turardi. */}
                {complaintField}

                {/* Tayyor natijalar — ro'yxatning tepasida, ko'zga birinchi tushsin */}
                <VisitResults visit={visit} busy={busy} onMarkSeen={markSeen}
                    canMark={userRole === UserRole.DOCTOR || userRole === UserRole.CLINIC_ADMIN} />

                {itemCount === 0 ? (
                    <p className="py-2 text-sm text-faint">{isDone ? t('visit.emptyTodayDone') : t('visit.emptyToday')}</p>
                ) : (
                    <ul aria-label={t('visit.todayList')} className="flex flex-col">
                        {diagnoses.map(d => (
                            <ItemRow key={d.id} icon={ClipboardList}
                                main={`${d.code}${d.icd10?.name ? ` — ${d.icd10.name}` : ''}`}
                                kind={t('visit.blockDx')} sub={d.isChronic ? t('visit.chronic') : undefined}
                                deleteLabel={`${t('common.delete')}: ${d.code}`}
                                onDelete={clinicalReadOnly ? undefined : () => removeDiagnosis(d.id)} />
                        ))}
                        {procedures.map(p => (
                            <ItemRow key={p.id} icon={Stethoscope} main={p.procedureName}
                                kind={t('visit.addSvcShort')}
                                right={fill(t('ui.x_som'), fmt(p.finalPrice))}
                                charge={chargeOf('Service', p.id)}
                                /* To'langan xizmat o'chirilmaydi — server ham rad etadi */
                                onDelete={isDone || (chargeOf('Service', p.id)?.paidAmount || 0) > 0 ? undefined : () => removeProcedure(p.id)} />
                        ))}
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
                    </ul>
                )}

                {(!clinicalReadOnly || visit.treatmentPlan) && conclusionBlock}

                {/* YAKUNLANGACH — bemor qo'liga qog'oz va keyingi qabul. Ikkalasi
                    ham taklif: hech narsa o'zi chop etilmaydi. */}
                {closedToday && (
                    <div className="pt-3 border-t border-line flex flex-wrap gap-2">
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

            {/* ── TIBBIY TARIX va ko'rik formasi ───────────────────────────
                Ko'rik formasi uzun — u chapga qo'yilsa «Qabulni yakunlash»
                noutbuk ekranidan tushib ketadi. Shikoyat esa (2 qator) chapda. */}
            {historyBox(examBlock)}

            {/* ── «+ Qo'shish» oynasi: nima qo'shilishi tepada tanlanadi ──────── */}
            <Modal isOpen={!!panelShown && !isDone} onClose={() => setPanel(null)} title={t('visit.addTitle')} className="max-w-2xl">
                <div role="group" aria-label={t('visit.addWhat')} className="mb-4 flex flex-wrap gap-1 p-1 rounded-xl bg-elevated">
                    {addKinds.map(k => (
                        <button key={k.id} type="button" aria-pressed={panelShown === k.id} onClick={() => setPanel(k.id)}
                            className={`h-8 px-3.5 rounded-lg text-sm font-medium transition-colors ${panelShown === k.id
                                ? 'bg-surface text-ink shadow-sm'
                                : 'text-muted hover:text-ink'}`}>
                            {k.label}
                        </button>
                    ))}
                </div>
                {panelShown === 'dx' && (
                    <DiagnosisPicker diagnoses={diagnoses} recent={recentDx} busy={busy} onAdd={addDiagnosis} />
                )}
                {panelShown === 'rx' && <RxForm meds={meds} recent={recentRx} busy={busy} onSave={writePrescription} />}
                {panelShown === 'service' && <ServicePicker services={deptServices} busy={busy} onAdd={addService} />}
                {panelShown === 'lab' && <LabPicker tests={labTests} busy={busy} onSend={sendToLab} />}
                {panelShown === 'study' && <StudyPicker services={ownStudies} more={otherStudies} busy={busy} onSend={sendToDiagnostics} />}
                {panelShown === 'consult' && (
                    <ConsultPicker departments={bookableDepts.filter(d => d.id !== visit.departmentId)}
                        doctors={doctors} busy={busy} onSend={sendToConsult} />
                )}
                {/* Tashxis va xizmat bir bosishda qo'shiladi va oyna ochiq qoladi */}
                {(panelShown === 'dx' || panelShown === 'service') && (
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

