import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    FlaskConical, Scan, Pill, Trash2, AlertCircle,
    Printer, Stethoscope, Loader2, XCircle, Play, Undo2,
} from 'lucide-react';
import {
    Visit, Department, EncounterTemplate, LabTest, Service, Doctor, Patient,
    MODALITY_LABELS, ICD10Code, VisitCharge, ChargeSummary, UserRole,
    Prescription, InventoryItem,
} from '../types';
import { api } from '../services/api';
import { useResourceSync } from '../hooks/useDataSync';
import { useVisitAutosave } from '../hooks/useVisitAutosave';
import { useLanguage, fill } from '../context/LanguageContext';
import { EncounterForm, EncounterSummary } from '../components/EncounterForm';
import { printReferral, printPrescription } from '../utils/printForms';
import { formatDate, formatNumber, formatTime } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { calcAge, todayISO } from '../utils/dateUtils';
import { OpenVisitForm } from './visit/OpenVisitForm';
import { VisitResults } from './visit/VisitResults';
import { AddButton, ItemRow, SheetLabel } from './visit/sheetParts';
import { DiagnosisBlock } from './visit/DiagnosisBlock';
import { VisitBill, VisitFinishRow, lightBtn } from './visit/VisitFooter';
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

   Endi bu BITTA VARAQ va u shifokor ishlaydigan tartibda o'qiladi:
   natijalar → shikoyat → ko'rik → tashxis → tayinlov → xizmat → yo'llanma →
   keyingi tashrif. Har bo'limda yozilgani ham, «+ qo'shish» ham o'z joyida.
   Matn o'zi saqlanadi.
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
    /** Bemorning eng yaqin kelajakdagi yozuvi */
    nextAppointment?: { date: string; time: string; doctorName?: string } | null;
    onSchedule?: () => void;
    /** To'lov oynasi — kassadagi bilan bir xil */
    onTakePayment?: () => void;
}

export interface VisitSheetState { visit: Visit | null; money: ChargeSummary }

type Panel = null | 'dx' | 'rx' | 'service' | 'lab' | 'study' | 'consult';

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

/** Qabul holati — rangi bilan birga */
const STATUS_TONE: Record<string, string> = {
    'Waiting': 'bg-elevated text-muted',
    'Called': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'In Progress': 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
    'AwaitingResults': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'Completed': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Cancelled': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

/** Shu manzillarga yozilsa ochiq qabul varag'i eskiradi */
const VISIT_RESOURCES = [
    'visits', 'visit-procedures', 'lab-orders', 'studies', 'prescriptions',
    'diagnoses', 'referrals', 'payments', 'charges',
] as const;

export const VisitPanel: React.FC<Props> = ({
    patient, visitId, departments, services, doctors, currentUserName, userRole,
    loggedDoctorId, addToast, onVisitChanged, onState, onShowToday,
    nextAppointment, onSchedule, onTakePayment,
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
    /* Retseptdagi dorilar ombordan taklif qilinadi. Erkin matn ham
       qoladi: omborda yo'q dorini yozish mumkin bo'lishi kerak. */
    const [meds, setMeds] = useState<InventoryItem[]>([]);

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

    const patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();

    const chargeOf = useCallback(
        (source: string, sourceId: string) =>
            charges.find(c => c.source === source && c.sourceId === sourceId && c.status !== 'Cancelled'),
        [charges],
    );

    // ── Amallar ─────────────────────────────────────────────────────────────
    const guard = async (fn: () => Promise<any>, okMsg: string) => {
        setBusy(true);
        try { await fn(); await reload(); onVisitChanged(visitId); addToast('success', okMsg); setPanel(null); }
        catch (e: any) { addToast('error', e?.message || t('ui.xatolik')); }
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

    const writePrescription = (items: RxDraft[]) => guard(() => api.prescriptions.create({
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
        t('visit.serviceAdded'),
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
            try {
                const ref = await api.referrals.create({
                    patientId: visit.patientId,
                    visitId: visit.id,
                    kind: 'Consult',
                    targetDepartmentId: draft.departmentId,
                    items: [],
                } as any);
                const full = await api.referrals.get(ref.id);
                printReferral(full, full.clinic);
            } catch { /* yo'llanma ixtiyoriy — navbat allaqachon ochildi */ }
            addToast('success', t('visit.consultSent'));
            setPanel(null);
            onVisitChanged(visitId);
        } catch (e: any) {
            addToast('error', e?.data?.error || e?.message || t('ui.xatolik'));
        } finally { setBusy(false); }
    };

    const addDiagnosis = (code: ICD10Code, isChronic: boolean) => guard(() => api.diagnoses.add({
        patientId: visit!.patientId, code: code.code, date: visit!.date,
        notes: '', status: 'Active', clinicId: visit!.clinicId, visitId: visit!.id,
        isChronic,
    } as any), t('visit.diagnosisAdded'));

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
                const reasons: { text: string }[] = e.data.reasons || [];
                const nl = String.fromCharCode(10);
                const proceed = await confirmAction({
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
                        addToast('success', t('visit.completedOk'));
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

    /* Ochiq qabul yo'q — varaq o'rniga qabul ochish formasi */
    if (!visit) {
        return (
            <OpenVisitForm patient={patient} departments={departments} doctors={doctors} services={services}
                loggedDoctorId={loggedDoctorId} error={error} addToast={addToast} onOpened={onVisitChanged} />
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

    const diagnoses = visit.diagnoses || [];
    const prescriptions = visit.prescriptions || [];
    const procedures = visit.procedures || [];
    const labOrders = (visit.labOrders || []).filter(o => o.status !== 'Cancelled');
    const studies = (visit.studies || []).filter(s => s.status !== 'Cancelled');
    const toggle = (key: Exclude<Panel, null>) => setPanel(p => (p === key ? null : key));

    const title = [
        isToday ? t('visit.panelTitle') : fill(t('visit.panelTitlePast'), formatDate(visit.date)),
        [visit.doctorName || dept?.name || t('visit.noDept'), room ? fill(t('visit.room'), room) : ''].filter(Boolean).join(', '),
    ].join(' · ');

    const { save } = autosave;
    const saveLabel = isDone ? ''
        : autosave.examInvalid ? t('visit.invalidNotSaved')
            : save.state === 'saving' ? t('visit.saving')
                : save.state === 'saved' ? fill(t('visit.savedAt'), formatTime(save.at))
                    : save.state === 'error' ? t('visit.saveFailed')
                        : t('visit.autosave');
    const saveTone = autosave.examInvalid || save.state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted';

    const orderStatus = (done: boolean, seen: boolean) =>
        done ? (seen ? t('visit.resultSeen') : t('visit.resultReady')) : t('visit.pending');

    return (
        <section aria-labelledby="visit-title"
            className="bg-surface rounded-[20px] border border-line p-4 sm:p-5 flex flex-col gap-[22px] min-w-0">

            {/* ── Sarlavha ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 id="visit-title" className="min-w-0 text-base font-bold text-ink">{title}</h2>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${STATUS_TONE[visit.status] || STATUS_TONE['Waiting']}`}>
                    {t(VISIT_STATUS_KEY[visit.status] || 'visit.status.Waiting')}
                </span>
                <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {saveLabel && (
                        <span role="status" className={`text-xs font-semibold ${saveTone}`}>
                            {saveLabel}
                            {save.state === 'error' && (
                                <button type="button" onClick={() => { void autosave.flush(); }}
                                    className="ml-1.5 font-bold underline">{t('ui.qayta_urinish')}</button>
                            )}
                        </span>
                    )}
                    {visit.status === 'AwaitingResults' && (
                        <button type="button" onClick={resume} disabled={busy}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 disabled:opacity-50">
                            <Play className="w-3.5 h-3.5" /> {t('visit.continue')}
                        </button>
                    )}
                    {!isToday && onShowToday && (
                        <button type="button" onClick={onShowToday} className={lightBtn}>
                            <Undo2 className="w-3.5 h-3.5" /> {t('visit.showToday')}
                        </button>
                    )}
                    {!isDone && canCancelVisit && (
                        <button type="button" onClick={cancelVisit} disabled={busy}
                            title={t('visit.cancelVisit')} aria-label={t('visit.cancelVisit')}
                            className="w-8 h-8 grid place-items-center rounded-lg border border-line text-muted hover:border-red-400 hover:text-red-600 disabled:opacity-50">
                            <XCircle className="w-4 h-4" />
                        </button>
                    )}
                </span>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            <VisitResults visit={visit} busy={busy} onMarkSeen={markSeen}
                canMark={userRole === UserRole.DOCTOR || userRole === UserRole.CLINIC_ADMIN} />

            {/* ── Shikoyat ────────────────────────────────────────────────── */}
            {/* Qabulxonada ham yoziladi, shuning uchun registratorga ochiq. */}
            <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t('visit.complaintLabel')}</span>
                <textarea rows={2} value={autosave.complaint} disabled={isDone}
                    placeholder={isDone ? t('visit.noComplaint') : t('visit.complaintPh')}
                    onChange={e => autosave.onComplaintChange(e.target.value)}
                    onBlur={autosave.onComplaintBlur}
                    className="w-full px-3 py-2.5 rounded-xl border border-line bg-canvas text-ink text-sm leading-relaxed resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:text-muted" />
            </label>

            {/* ── Ko'rik ──────────────────────────────────────────────────── */}
            {clinicalReadOnly ? (
                /* Yoza olmaydigan odamga (yakunlangan qabul, registrator)
                   bo'sh maydonlar to'ri emas, YOZILGANI ko'rsatiladi. */
                <div className="flex flex-col gap-2">
                    <SheetLabel>{t('ui.qabul_bayoni')}</SheetLabel>
                    <EncounterSummary template={templates.find(x => x.id === visit.templateId)} value={visit.examData} />
                </div>
            ) : (
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
            )}

            <DiagnosisBlock diagnoses={diagnoses} readOnly={clinicalReadOnly} busy={busy}
                pickerOpen={panel === 'dx'} onTogglePicker={() => toggle('dx')}
                onAdd={addDiagnosis} onRemove={removeDiagnosis} />

            {/* ── Tayinlov ────────────────────────────────────────────────── */}
            {(prescriptions.length > 0 || !isDone) && (
                <div className="flex flex-col gap-2">
                    <SheetLabel>{t('visit.rxTitle')}</SheetLabel>
                    {prescriptions.length > 0 && (
                        <ul className="flex flex-col gap-1.5">
                            {prescriptions.map(rx => (
                                <li key={rx.id} className="flex items-start gap-3 pl-3 pr-2 py-2.5 rounded-xl border border-line bg-canvas">
                                    <Pill className="w-4 h-4 mt-0.5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                                    <ul className="min-w-0 flex-1 flex flex-col gap-1">
                                        {(rx.items || []).map((item, index) => (
                                            <li key={item.id || index} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                                                <b className="text-[13.5px] font-bold text-ink">{item.name}</b>
                                                <span className="text-[12.5px] text-muted">{[item.dosage, item.frequency].filter(Boolean).join(' · ')}</span>
                                                {item.durationDays ? (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-elevated text-[10.5px] font-bold text-muted">
                                                        {item.durationDays} {t('visit.days')}
                                                    </span>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                    <button type="button" onClick={() => printPrescription({ ...rx, patient }, undefined)}
                                        title={t('common.print')} aria-label={t('common.print')}
                                        className="w-7 h-7 grid place-items-center rounded-md text-faint hover:text-primary-600 hover:bg-surface shrink-0">
                                        <Printer className="w-3.5 h-3.5" />
                                    </button>
                                    {!isDone && (
                                        <button type="button" onClick={() => removePrescription(rx)} aria-label={t('ui.ochirish')}
                                            className="w-7 h-7 grid place-items-center rounded-md text-faint hover:text-red-600 hover:bg-surface shrink-0">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {!isDone && (
                        <div><AddButton label={t('visit.addRx')} open={panel === 'rx'} onClick={() => toggle('rx')} /></div>
                    )}
                    {!isDone && panel === 'rx' && <RxForm meds={meds} busy={busy} onSave={writePrescription} />}
                </div>
            )}

            {/* ── Xizmatlar ───────────────────────────────────────────────── */}
            {(procedures.length > 0 || !isDone) && (
                <div className="flex flex-col gap-2">
                    <SheetLabel>{t('visit.tabServices')}</SheetLabel>
                    {procedures.length > 0 && (
                        <ul className="flex flex-col gap-1.5">
                            {procedures.map(p => (
                                <ItemRow key={p.id} icon={Stethoscope} main={p.procedureName}
                                    right={fill(t('ui.x_som'), fmt(p.finalPrice))}
                                    charge={chargeOf('Service', p.id)}
                                    onDelete={isDone ? undefined : () => removeProcedure(p.id)} />
                            ))}
                        </ul>
                    )}
                    {!isDone && (
                        <div><AddButton label={t('visit.addSvcShort')} open={panel === 'service'} onClick={() => toggle('service')} /></div>
                    )}
                    {!isDone && panel === 'service' && <ServicePicker services={deptServices} busy={busy} onAdd={addService} />}
                </div>
            )}

            {/* ── Yo'llanma ───────────────────────────────────────────────── */}
            {(labOrders.length > 0 || studies.length > 0 || !isDone) && (
                <div className="flex flex-col gap-2">
                    <SheetLabel hint={isDone ? undefined : t('visit.referHint')}>{t('visit.referTitle')}</SheetLabel>
                    {!isDone && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <AddButton solid label={t('visit.sendLab')} open={panel === 'lab'} onClick={() => toggle('lab')} />
                            <AddButton solid label={t('visit.sendStudy')} open={panel === 'study'} onClick={() => toggle('study')} />
                            <AddButton solid label={t('visit.sendConsult')} open={panel === 'consult'} onClick={() => toggle('consult')} />
                        </div>
                    )}
                    {!isDone && panel === 'lab' && <LabPicker tests={labTests} busy={busy} onSend={sendToLab} />}
                    {!isDone && panel === 'study' && <StudyPicker services={diagServices} busy={busy} onSend={sendToDiagnostics} />}
                    {!isDone && panel === 'consult' && (
                        <ConsultPicker departments={bookableDepts.filter(d => d.id !== visit.departmentId)}
                            doctors={doctors} busy={busy} onSend={sendToConsult} />
                    )}
                    {(labOrders.length > 0 || studies.length > 0) && (
                        <ul className="flex flex-col gap-1.5">
                            {labOrders.map(o => {
                                const ch = chargeOf('Lab', o.id);
                                const done = o.status === 'Completed';
                                return (
                                    <ItemRow key={o.id} icon={FlaskConical}
                                        main={(o.items || []).map(i => i.testName).join(', ') || t('visit.tabLab')}
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
                                        main={`${MODALITY_LABELS[s.modality] || s.modality} — ${s.name}`}
                                        sub={orderStatus(done, !!s.seenByDoctorAt)} tone={done ? 'ok' : 'wait'}
                                        right={fill(t('ui.x_som'), fmt(s.price))} charge={ch}
                                        onDelete={isDone || done ? undefined : () => cancelOrder('study', s.id, !!ch && ch.status === 'Paid')} />
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            <VisitFinishRow visit={visit} locked={isDone} busy={busy} nextAppointment={nextAppointment} onSchedule={onSchedule}
                onNewVisit={startNewVisit}
                onPrintRx={prescriptions.length > 0 ? () => printPrescription({ ...prescriptions[0], patient }, undefined) : undefined}
                onComplete={complete} />

            <VisitBill money={money} referralBusy={refBusy} onPrintReferral={issueReferral} onTakePayment={onTakePayment} />
        </section>
    );
};
