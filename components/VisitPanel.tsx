import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FlaskConical, Scan, Pill, Plus, Trash2, CheckCircle, AlertCircle,
    Printer, Stethoscope, Loader2, Wallet, UserPlus, Clock, XCircle, Play,
} from 'lucide-react';
import {
    Visit, Department, EncounterTemplate, LabTest, Service, Doctor, Patient,
    Modality, MODALITY_LABELS, ICD10Code, VisitCharge, ChargeSummary, UserRole,
    Prescription, InventoryItem,
} from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { EncounterForm } from '../components/EncounterForm';
import { printReferral, printPrescription } from '../utils/printForms';
import { formatNumber } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { calcAge, todayISO } from '../utils/dateUtils';
import { pickableDoctors } from './DoctorPicker';

/* ─────────────────────────────────────────────────────────────────────────────
   JORIY QABUL — bemor kartasining o'ng ustuni.

   Ilgari bu alohida sahifa edi (`/visit/:id`) va bemor kartasidan unga
   yo'l YO'Q edi: tashxis faqat o'sha sahifada qo'yilardi, tarix esa faqat
   kartada ko'rinardi. Shifokor ikkalasini birga ko'ra olmasdi.

   Endi panel karta ichida turadi: chapda tarix, o'ngda shu qabul. Bemor
   baribir bir marta — registraturada yoki shu yerdagi «Qabul ochish»
   tugmasi bilan — tanlanadi, qolgan hamma narsa shu paneldan bajariladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patient: Patient;
    /** Panelda ochilgan qabul. `null` — bugun ochiq qabul yo'q. */
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
    onGoToCashier?: () => void;
}

const fmt = (n: number) => formatNumber(n);
const MODALITIES: Modality[] = ['UZI', 'EKG', 'RENTGEN', 'ENDOSKOPIYA', 'MRT', 'KT'];

const inputCls = 'w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

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

export const VisitPanel: React.FC<Props> = ({
    patient, visitId, departments, services, doctors, currentUserName, userRole,
    loggedDoctorId, addToast, onVisitChanged, onGoToCashier,
}) => {
    const { t } = useLanguage();

    const [visit, setVisit] = useState<Visit | null>(null);
    const [templates, setTemplates] = useState<EncounterTemplate[]>([]);
    const [labTests, setLabTests] = useState<LabTest[]>([]);
    const [charges, setCharges] = useState<VisitCharge[]>([]);
    const [money, setMoney] = useState<ChargeSummary>({ total: 0, paid: 0, due: 0, unpaidCount: 0 });
    const [loading, setLoading] = useState(!!visitId);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const [panel, setPanel] = useState<null | 'lab' | 'study' | 'rx' | 'service' | 'consult'>(null);

    const [labPick, setLabPick] = useState<string[]>([]);
    const [studyForm, setStudyForm] = useState({ modality: 'UZI' as Modality, name: '', price: '', serviceId: '' });
    const [rxItems, setRxItems] = useState([{ name: '', dosage: '', frequency: '', durationDays: '' }]);
    const [svcPick, setSvcPick] = useState<number | ''>('');
    const [consultForm, setConsultForm] = useState({ departmentId: '', doctorId: '', reason: '' });
    const [icdQuery, setIcdQuery] = useState('');
    const [icdResults, setIcdResults] = useState<ICD10Code[]>([]);
    const [icdChronic, setIcdChronic] = useState(false);

    // Shikoyatni joyida tahrirlash
    const [editingComplaint, setEditingComplaint] = useState(false);
    const [complaintDraft, setComplaintDraft] = useState('');

    // Yangi qabul ochish formasi
    const [openForm, setOpenForm] = useState({ departmentId: '', doctorId: '', serviceId: '', complaints: '' });
    const [openBusy, setOpenBusy] = useState(false);

    const [refBusy, setRefBusy] = useState(false);
    /* Retseptdagi dorilar ombordan taklif qilinadi. Erkin matn ham
       qoladi: omborda yo'q dorini yozish mumkin bo'lishi kerak. */
    const [meds, setMeds] = useState<InventoryItem[]>([]);

    const reload = useCallback(async () => {
        if (!visitId) { setVisit(null); setCharges([]); setMoney({ total: 0, paid: 0, due: 0, unpaidCount: 0 }); setLoading(false); return; }
        try {
            const [v, c] = await Promise.all([
                api.visits.getById(visitId),
                api.charges.byVisit(visitId).catch(() => ({
                    charges: [] as VisitCharge[], summary: { total: 0, paid: 0, due: 0, unpaidCount: 0 },
                })),
            ]);
            setVisit(v);
            setCharges(c.charges);
            setMoney(c.summary);
            setError('');
        } catch (e: any) {
            setError(e?.message || "Qabulni ochib bo'lmadi");
        } finally { setLoading(false); }
    }, [visitId]);

    useEffect(() => { setLoading(!!visitId); reload(); }, [reload, visitId]);

    useEffect(() => {
        api.encounterTemplates.getAll().then(setTemplates).catch(() => { });
        api.labTests.getAll().then(setLabTests).catch(() => { });
    }, []);

    /* Dorilar ro'yxati faqat retsept paneli ochilganda yuklanadi —
       har karta ochilishida ombor so'rovi yuborishning ma'nosi yo'q. */
    useEffect(() => {
        if (panel !== 'rx' || meds.length || !patient.clinicId) return;
        api.inventory.getAll(patient.clinicId)
            .then(items => setMeds(items.filter(i => i.isMedication)))
            .catch(() => { });
    }, [panel, patient.clinicId, meds.length]);

    /* Kirgan shifokor o'zi standart bo'lib turadi: o'z bemorini qabul
       qilayotgan odam har safar ro'yxatdan o'zini qidirib o'tirmasin. */
    useEffect(() => {
        if (visitId || !loggedDoctorId) return;
        const me = doctors.find(d => d.id === loggedDoctorId);
        if (!me || !me.departmentId) return;
        setOpenForm(f => (f.departmentId || f.doctorId)
            ? f
            : { ...f, doctorId: me.id, departmentId: me.departmentId as string });
    }, [visitId, loggedDoctorId, doctors]);

    /* Bo'limlar: qabul ochish uchun faqat KLINIK va DIAGNOSTIK bo'limlar.
       Laboratoriya va dorixona navbat olmaydi — ularga yo'llanma bilan
       boriladi (Registratura bilan bir xil qoida). */
    const bookableDepts = useMemo(
        () => departments.filter(d => d.isActive && (d.type === 'CLINICAL' || d.type === 'DIAGNOSTIC')),
        [departments],
    );
    const diagDeptIds = useMemo(
        () => new Set(departments.filter(d => d.type === 'DIAGNOSTIC').map(d => d.id)),
        [departments],
    );
    /* Diagnostika xizmatlari — tekshiruv narxi QO'LDA yozilmasin.
       Ilgari shifokor narxni o'zi kiritardi va u prayslistdan farq qilardi. */
    const diagServices = useMemo(
        () => services.filter(s => s.departmentId && diagDeptIds.has(s.departmentId)),
        [services, diagDeptIds],
    );

    const dept = useMemo(() => departments.find(d => d.id === visit?.departmentId), [departments, visit]);
    const age = calcAge(patient.dob);
    const isDone = visit?.status === 'Completed' || visit?.status === 'Cancelled';
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
        catch (e: any) { addToast('error', e?.message || 'Xatolik'); }
        finally { setBusy(false); }
    };

    const saveEncounter = (data: Record<string, any>, templateId?: string) =>
        guard(() => api.visits.update(visit!.id, {
            examData: JSON.stringify(data), templateId,
            status: visit!.status === 'Waiting' ? 'In Progress' : visit!.status,
        }), t('visit.encounterSaved'));

    const saveComplaint = () => guard(
        () => api.visits.update(visit!.id, { complaints: complaintDraft.trim() }),
        t('visit.complaintSaved'),
    ).then(() => setEditingComplaint(false));

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

    const sendToLab = () => guard(() => api.labOrders.create({
        patientId: visit!.patientId,
        patientName,
        visitId: visit!.id,
        doctorName: visit!.doctorName || currentUserName || '',
        testIds: labPick,
    }), t('visit.sentToLab')).then(() => setLabPick([]));

    const sendToDiagnostics = () => guard(() => api.studies.create({
        patientId: visit!.patientId,
        patientName,
        visitId: visit!.id,
        modality: studyForm.modality,
        name: studyForm.name.trim(),
        price: Number(studyForm.price) || 0,
        ...(studyForm.serviceId ? { serviceId: Number(studyForm.serviceId) } : {}),
        orderedByName: visit!.doctorName || currentUserName || null,
    }), t('visit.sentToDiag')).then(() => setStudyForm({ modality: 'UZI', name: '', price: '', serviceId: '' }));

    const writePrescription = () => guard(() => api.prescriptions.create({
        patientId: visit!.patientId,
        patientName,
        visitId: visit!.id,
        doctorName: visit!.doctorName || currentUserName || null,
        items: rxItems.filter(i => i.name.trim()).map(i => {
            /* Nom ombordagi dori bilan mos kelsa — bog'laymiz. Bunsiz
               retsept ombordan butunlay uzilgan matn bo'lib qolardi. */
            const hit = meds.find(m => m.name.trim().toLowerCase() === i.name.trim().toLowerCase());
            return {
                name: i.name.trim(), dosage: i.dosage || null, frequency: i.frequency || null,
                durationDays: i.durationDays ? Number(i.durationDays) : null,
                ...(hit ? { medicationId: hit.id } : {}),
            };
        }),
    }), t('visit.rxSaved')).then(() => setRxItems([{ name: '', dosage: '', frequency: '', durationDays: '' }]));

    const addService = () => guard(
        () => api.visits.addProcedure(visit!.id, { serviceId: Number(svcPick) }),
        t('visit.serviceAdded'),
    ).then(() => setSvcPick(''));

    /* BOSHQA SHIFOKORGA YUBORISH. Bemor o'sha bo'limning navbatiga tushadi
       va qo'lida yo'llanma qoladi — ilgari bu og'zaki edi. */
    const sendToConsult = async () => {
        if (!visit || !consultForm.departmentId) return;
        setBusy(true);
        try {
            const doc = doctors.find(d => d.id === consultForm.doctorId);
            await api.visits.create({
                patientId: visit.patientId,
                departmentId: consultForm.departmentId,
                doctorId: consultForm.doctorId || undefined,
                doctorName: doc ? `${doc.firstName} ${doc.lastName}`.trim() : undefined,
                complaints: consultForm.reason || visit.complaints,
                date: todayISO(),
                status: 'Waiting',
            } as any);
            try {
                const ref = await api.referrals.create({
                    patientId: visit.patientId,
                    visitId: visit.id,
                    kind: 'Consult',
                    targetDepartmentId: consultForm.departmentId,
                    items: [],
                } as any);
                const full = await api.referrals.get(ref.id);
                printReferral(full, full.clinic);
            } catch { /* yo'llanma ixtiyoriy — navbat allaqachon ochildi */ }
            addToast('success', t('visit.consultSent'));
            setPanel(null);
            setConsultForm({ departmentId: '', doctorId: '', reason: '' });
            onVisitChanged(visitId);
        } catch (e: any) {
            addToast('error', e?.data?.error || e?.message || 'Xatolik');
        } finally { setBusy(false); }
    };

    const addDiagnosis = (code: ICD10Code) => guard(() => api.diagnoses.add({
        patientId: visit!.patientId, code: code.code, date: visit!.date,
        notes: '', status: 'Active', clinicId: visit!.clinicId, visitId: visit!.id,
        isChronic: icdChronic,
    } as any), t('visit.diagnosisAdded')).then(() => setIcdChronic(false));

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

    /* QABULNI YAKUNLASH — NAZORAT BILAN.
       Server tashxis, qarz va kelmagan natijalarni tekshiradi; kamchilik
       bo'lsa 409 va sabablar. Taqiq emas, tanlov: shifokor BILIB yopadi va
       sabab qabul izohiga yozilib qoladi. */
    const complete = async () => {
        setBusy(true);
        try {
            await api.visits.update(visit!.id, { status: 'Completed' });
            /* Yakunlangan qabul PANELDA QOLADI. Ilgari u darhol tozalanardi
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
                    } catch (e2: any) { addToast('error', e2?.message || 'Xatolik'); }
                }
            } else { addToast('error', e?.message || 'Xatolik'); }
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
        } catch (e: any) { addToast('error', e?.message || 'Xatolik'); }
        finally { setBusy(false); }
    };

    const searchIcd = async (q: string) => {
        setIcdQuery(q);
        if (q.trim().length < 2) { setIcdResults([]); return; }
        try { setIcdResults(await api.diagnoses.searchCodes(q.trim())); } catch { setIcdResults([]); }
    };

    /* ── YANGI QABUL OCHISH ──────────────────────────────────────────────────
       Registraturaga bormasdan. Shifokor o'z bo'limida bemorni qabul qila
       oladi; navbat raqamini baribir server beradi, ya'ni tablo va navbat
       mantiqi buzilmaydi. */
    const openVisit = async () => {
        if (!openForm.departmentId) { addToast('error', t('visit.pickDept')); return; }
        setOpenBusy(true);
        try {
            const doc = doctors.find(d => d.id === openForm.doctorId);
            const created = await api.visits.create({
                patientId: patient.id,
                departmentId: openForm.departmentId,
                doctorId: openForm.doctorId || undefined,
                doctorName: doc ? `${doc.firstName} ${doc.lastName}`.trim() : undefined,
                complaints: openForm.complaints.trim() || undefined,
                date: todayISO(),
                status: 'Waiting',
            } as any);
            if (openForm.serviceId) {
                try { await api.visits.addProcedure(created.id, { serviceId: Number(openForm.serviceId) }); }
                catch (e: any) { addToast('info', t('visit.serviceNotAdded')); }
            }
            addToast('success', t('visit.opened'));
            setOpenForm({ departmentId: '', doctorId: '', serviceId: '', complaints: '' });
            onVisitChanged(created.id);
        } catch (e: any) {
            /* Bugun shu bo'limda qabul bor — yangisini ochish o'rniga
               mavjudini ochamiz. Ikki marta ro'yxatga tushish xato. */
            const existing = e?.data?.visitId;
            if (existing) { addToast('info', t('visit.alreadyOpen')); onVisitChanged(existing); }
            else addToast('error', e?.data?.error || e?.message || 'Xatolik');
        } finally { setOpenBusy(false); }
    };

    // ── Ko'rinish ───────────────────────────────────────────────────────────

    if (loading) return (
        <div className="bg-surface rounded-xl border border-line p-10 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
    );

    /* Ochiq qabul yo'q — panel o'rniga qabul ochish formasi */
    if (!visit) {
        /* Yagona qoida (`pickableDoctors`): faqat FAOL shifokorlar, kerak
           bo'lsa bo'lim bo'yicha. Ilgari bu yerda holat umuman
           tekshirilmasdi va ta'tildagi shifokorga qabul ochib bo'lardi. */
        const formDoctors = pickableDoctors(doctors, openForm.departmentId || null, openForm.doctorId);
        const formServices = services.filter(s => !openForm.departmentId || !s.departmentId || s.departmentId === openForm.departmentId);
        return (
            <div className="bg-surface rounded-xl border border-line p-5">
                <h3 className="flex items-center gap-2 font-semibold text-ink">
                    <Stethoscope className="w-5 h-5 text-primary-600" /> {t('visit.noOpen')}
                </h3>
                <p className="mt-1 text-sm text-muted">{t('visit.noOpenHint')}</p>
                {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="block text-xs font-medium text-muted mb-1">{t('visit.department')}</span>
                        <select className={inputCls} value={openForm.departmentId}
                            onChange={e => setOpenForm(f => ({ ...f, departmentId: e.target.value, doctorId: '', serviceId: '' }))}>
                            <option value="">{t('common.choose')}</option>
                            {bookableDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="block text-xs font-medium text-muted mb-1">{t('visit.doctor')}</span>
                        <select className={inputCls} value={openForm.doctorId} disabled={!openForm.departmentId}
                            onChange={e => setOpenForm(f => ({ ...f, doctorId: e.target.value }))}>
                            <option value="">{t('common.choose')}</option>
                            {formDoctors.map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="block text-xs font-medium text-muted mb-1">{t('visit.serviceOptional')}</span>
                        <select className={inputCls} value={openForm.serviceId} disabled={!openForm.departmentId}
                            onChange={e => setOpenForm(f => ({ ...f, serviceId: e.target.value }))}>
                            <option value="">{t('common.choose')}</option>
                            {formServices.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="block text-xs font-medium text-muted mb-1">{t('visit.complaintLabel')}</span>
                        <input className={inputCls} value={openForm.complaints}
                            onChange={e => setOpenForm(f => ({ ...f, complaints: e.target.value }))}
                            placeholder={t('visit.complaintPh')} />
                    </label>
                </div>
                <button onClick={openVisit} disabled={openBusy || !openForm.departmentId}
                    className="mt-4 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                    {openBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t('visit.openNew')}
                </button>
            </div>
        );
    }

    const deptServices = services.filter(s => !s.departmentId || s.departmentId === visit.departmentId);
    const canCancelVisit = userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.RECEPTIONIST;

    return (
        <div className="space-y-4">
            {/* ── Sarlavha ────────────────────────────────────────────────── */}
            <div className="bg-surface rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="w-10 h-10 rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 grid place-items-center font-bold shrink-0">
                        {visit.queueNumber ?? '—'}
                    </span>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-ink truncate">{t('visit.panelTitle')}</h3>
                        <p className="text-xs text-muted truncate">
                            {dept?.name || t('visit.noDept')}
                            {visit.doctorName ? ` · ${visit.doctorName}` : ''}
                            {visit.date ? ` · ${visit.date}` : ''}
                        </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${STATUS_TONE[visit.status] || STATUS_TONE['Waiting']}`}>
                        {t(VISIT_STATUS_KEY[visit.status] || 'visit.status.Waiting')}
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        {visit.status === 'AwaitingResults' && (
                            <button onClick={resume} disabled={busy}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 disabled:opacity-50">
                                <Play className="w-4 h-4" /> {t('visit.continue')}
                            </button>
                        )}
                        {!isDone && canCancelVisit && (
                            <button onClick={cancelVisit} disabled={busy} title={t('visit.cancelVisit')}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-line text-muted hover:border-red-400 hover:text-red-600 disabled:opacity-50">
                                <XCircle className="w-4 h-4" />
                            </button>
                        )}
                        {isDone ? (
                            <span className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${STATUS_TONE[visit.status]}`}>
                                <CheckCircle className="w-4 h-4" /> {t(VISIT_STATUS_KEY[visit.status] || 'visit.status.Completed')}
                            </span>
                        ) : (
                            <button onClick={complete} disabled={busy}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                                <CheckCircle className="w-4 h-4" /> {t('visit.complete')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Shikoyat — joyida tahrirlanadi. Ilgari faqat o'qish uchun edi
                    va registraturada xato yozilgan bo'lsa tuzatib bo'lmasdi. */}
                <div className="mt-3 pt-3 border-t border-line">
                    {editingComplaint ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <input autoFocus className={`${inputCls} flex-1 min-w-[200px]`} value={complaintDraft}
                                onChange={e => setComplaintDraft(e.target.value)}
                                placeholder={t('visit.complaintPh')} />
                            <button onClick={saveComplaint} disabled={busy}
                                className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                {t('common.save')}
                            </button>
                            <button onClick={() => setEditingComplaint(false)}
                                className="px-3 py-2 text-sm text-muted hover:text-muted">
                                {t('common.cancel')}
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-muted">
                            <span className="font-medium">{t('visit.complaint')}</span>{' '}
                            {visit.complaints || <span className="text-faint">{t('visit.noComplaint')}</span>}
                            {!isDone && (
                                <button onClick={() => { setComplaintDraft(visit.complaints || ''); setEditingComplaint(true); }}
                                    className="ml-2 text-xs text-primary-600 dark:text-primary-400 hover:underline">
                                    {t('common.edit')}
                                </button>
                            )}
                        </p>
                    )}
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {/* To'lanmagan buyurtma — ogohlantirish, blok emas */}
            {money.due > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <Wallet className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        <b>{fmt(money.due)} so'm</b> {t('visit.unpaidHint')}
                        {money.unpaidCount > 1 ? ` (${money.unpaidCount})` : ''}
                    </p>
                    <button onClick={issueReferral} disabled={refBusy}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50">
                        <Printer className="w-4 h-4" /> {t('visit.printReferral')}
                    </button>
                    {onGoToCashier && (
                        <button onClick={onGoToCashier} className="text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline">
                            {t('visit.goCashier')}
                        </button>
                    )}
                </div>
            )}

            {/* ── Amal tugmalari ──────────────────────────────────────────── */}
            {!isDone && (
                <div className="flex flex-wrap gap-2">
                    {([
                        ['lab', FlaskConical, t('visit.sendLab')],
                        ['study', Scan, t('visit.sendStudy')],
                        ['consult', UserPlus, t('visit.sendConsult')],
                        ['rx', Pill, t('visit.writeRx')],
                        ['service', Plus, t('visit.addSvc')],
                    ] as const).map(([key, Icon, label]) => (
                        <button key={key} onClick={() => setPanel(panel === key ? null : key)}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${panel === key
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-surface border-line text-muted hover:border-primary-400'}`}>
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Tahlil ──────────────────────────────────────────────────── */}
            {panel === 'lab' && (
                <div className="bg-surface rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h4 className="font-semibold text-ink mb-3">{t('visit.whichTests')}</h4>
                    {labTests.filter(x => x.isActive).length === 0 ? (
                        <p className="text-sm text-muted">{t('visit.labCatalogEmpty')}</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                {labTests.filter(x => x.isActive).map(x => {
                                    const on = labPick.includes(x.id);
                                    return (
                                        <label key={x.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer ${on
                                            ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                                            : 'border-line hover:bg-elevated'}`}>
                                            <input type="checkbox" checked={on} className="w-4 h-4 rounded text-primary-600"
                                                onChange={() => setLabPick(p => on ? p.filter(y => y !== x.id) : [...p, x.id])} />
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm text-ink truncate">{x.name}</span>
                                                <span className="block text-xs text-faint">{x.sampleType} · {x.turnaroundHours} {t('visit.hours')}</span>
                                            </span>
                                            <span className="text-sm tabular-nums text-muted">{fmt(x.price)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-line">
                                <span className="text-sm text-muted">
                                    {t('common.total')}: <b className="text-ink tabular-nums">
                                        {fmt(labTests.filter(x => labPick.includes(x.id)).reduce((s, x) => s + x.price, 0))} so'm
                                    </b>
                                </span>
                                <button onClick={sendToLab} disabled={busy || labPick.length === 0}
                                    className="ml-auto px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                    {t('visit.sendLabBtn')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Diagnostika ─────────────────────────────────────────────── */}
            {panel === 'study' && (
                <div className="bg-surface rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h4 className="font-semibold text-ink mb-3">{t('visit.whichStudy')}</h4>
                    {/* Prayslistdan tanlash — nom va narx o'zi to'ladi. Qo'lda
                        yozish ham qoldi: prayslistda yo'q tekshiruv bo'lishi mumkin. */}
                    {diagServices.length > 0 && (
                        <select className={`${inputCls} mb-3`} value={studyForm.serviceId}
                            onChange={e => {
                                const id = e.target.value;
                                const s = diagServices.find(x => String(x.id) === id);
                                setStudyForm(f => ({
                                    ...f, serviceId: id,
                                    name: s ? s.name : f.name,
                                    price: s ? String(s.price) : f.price,
                                }));
                            }}>
                            <option value="">{t('visit.pickFromPrice')}</option>
                            {diagServices.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                        </select>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select value={studyForm.modality} onChange={e => setStudyForm(f => ({ ...f, modality: e.target.value as Modality }))} className={inputCls}>
                            {MODALITIES.map(m => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
                        </select>
                        <input value={studyForm.name} onChange={e => setStudyForm(f => ({ ...f, name: e.target.value, serviceId: '' }))}
                            className={`${inputCls} sm:col-span-2`} placeholder={t('visit.studyNamePh')} />
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                        <input type="number" value={studyForm.price} onChange={e => setStudyForm(f => ({ ...f, price: e.target.value }))}
                            className={`${inputCls} max-w-[160px]`} placeholder={t('visit.price')} />
                        <button onClick={sendToDiagnostics} disabled={busy || !studyForm.name.trim()}
                            className="ml-auto px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                            {t('visit.sendStudyBtn')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Boshqa shifokorga ───────────────────────────────────────── */}
            {panel === 'consult' && (
                <div className="bg-surface rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h4 className="font-semibold text-ink mb-1">{t('visit.consultTitle')}</h4>
                    <p className="text-xs text-muted mb-3">{t('visit.consultHint')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select className={inputCls} value={consultForm.departmentId}
                            onChange={e => setConsultForm(f => ({ ...f, departmentId: e.target.value, doctorId: '' }))}>
                            <option value="">{t('visit.department')}</option>
                            {bookableDepts.filter(d => d.id !== visit.departmentId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <select className={inputCls} value={consultForm.doctorId} disabled={!consultForm.departmentId}
                            onChange={e => setConsultForm(f => ({ ...f, doctorId: e.target.value }))}>
                            <option value="">{t('visit.anyDoctor')}</option>
                            {pickableDoctors(doctors, consultForm.departmentId || null, consultForm.doctorId)
                                .map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                        <input className={inputCls} value={consultForm.reason}
                            onChange={e => setConsultForm(f => ({ ...f, reason: e.target.value }))}
                            placeholder={t('visit.consultReasonPh')} />
                        <button onClick={sendToConsult} disabled={busy || !consultForm.departmentId}
                            className="shrink-0 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                            {t('visit.sendConsultBtn')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Retsept ─────────────────────────────────────────────────── */}
            {panel === 'rx' && (
                <div className="bg-surface rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h4 className="font-semibold text-ink mb-3">{t('visit.prescription')}</h4>
                    <datalist id="xc-rx-meds">
                        {meds.map(m => <option key={m.id} value={m.name} />)}
                    </datalist>
                    <div className="space-y-2">
                        {rxItems.map((it, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2">
                                <input value={it.name} list="xc-rx-meds"
                                    onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                                    className={`${inputCls} col-span-12 sm:col-span-4`} placeholder={t('visit.medName')} />
                                <input value={it.dosage} onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))}
                                    className={`${inputCls} col-span-4 sm:col-span-3`} placeholder={t('visit.dose')} />
                                <input value={it.frequency} onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))}
                                    className={`${inputCls} col-span-5 sm:col-span-3`} placeholder={t('visit.frequencyPh')} />
                                <input type="number" value={it.durationDays} onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, durationDays: e.target.value } : x))}
                                    className={`${inputCls} col-span-3 sm:col-span-2`} placeholder={t('visit.days')} />
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                        <button onClick={() => setRxItems(r => [...r, { name: '', dosage: '', frequency: '', durationDays: '' }])}
                            className="text-sm text-primary-600 dark:text-primary-400 hover:underline">{t('visit.oneMoreMed')}</button>
                        <button onClick={writePrescription} disabled={busy || !rxItems.some(i => i.name.trim())}
                            className="ml-auto px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                            {t('visit.saveRx')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Xizmat ──────────────────────────────────────────────────── */}
            {panel === 'service' && (
                <div className="bg-surface rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h4 className="font-semibold text-ink mb-3">{t('visit.addService')}</h4>
                    <div className="flex flex-wrap gap-3">
                        <select value={svcPick} onChange={e => setSvcPick(e.target.value ? Number(e.target.value) : '')} className={`${inputCls} max-w-md`}>
                            <option value="">{t('common.choose')}</option>
                            {deptServices.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                        </select>
                        <button onClick={addService} disabled={busy || !svcPick}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                            {t('common.add')}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Qabul bayoni ────────────────────────────────────────────── */}
            {/* Bemor jinsi va yoshi UZATILADI: mos kelmaydigan shablon
                (masalan homiladorlik) erkak bemorga ochilmasin. Ilgari bu
                ekranda uzatilmasdi — faqat kartadagi nusxada bor edi. */}
            <EncounterForm
                departments={departments}
                templates={templates.filter(x => x.departmentId === visit.departmentId)}
                patientGender={patient.gender === 'Male' || patient.gender === 'Female' ? patient.gender : null}
                patientAge={age}
                departmentId={visit.departmentId || undefined}
                templateId={visit.templateId || undefined}
                value={visit.examData || {}}
                readOnly={isDone}
                onSave={saveEncounter}
            />

            {/* ── Tashxis ─────────────────────────────────────────────────── */}
            <div className="bg-surface rounded-xl border border-line p-4">
                <h4 className="font-semibold text-ink mb-3">{t('visit.diagnosisTitle')}</h4>
                {!!visit.diagnoses?.length && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {visit.diagnoses.map(d => (
                            <span key={d.id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-elevated text-sm text-ink">
                                <b>{d.code}</b>{d.icd10?.name ? ` — ${d.icd10.name}` : ''}
                                {d.isChronic && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold uppercase">
                                        {t('visit.chronic')}
                                    </span>
                                )}
                                {!isDone && (
                                    <button onClick={() => removeDiagnosis(d.id)} aria-label={t('common.delete')}
                                        className="p-0.5 text-faint hover:text-red-500 rounded">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </span>
                        ))}
                    </div>
                )}
                {!isDone && (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <input value={icdQuery} onChange={e => searchIcd(e.target.value)} className={`${inputCls} flex-1 min-w-[200px]`}
                                placeholder={t('visit.icdSearchPh')} />
                            <label className="flex items-center gap-2 text-sm text-muted whitespace-nowrap">
                                <input type="checkbox" checked={icdChronic} onChange={e => setIcdChronic(e.target.checked)}
                                    className="w-4 h-4 rounded text-primary-600" />
                                {t('visit.chronicMark')}
                            </label>
                        </div>
                        {icdResults.length > 0 && (
                            <div className="mt-2 border border-line rounded-lg divide-y divide-line max-h-48 overflow-y-auto">
                                {icdResults.slice(0, 12).map(c => (
                                    <button key={c.code} onClick={() => { addDiagnosis(c); setIcdQuery(''); setIcdResults([]); }}
                                        className="w-full text-left p-2.5 text-sm hover:bg-elevated">
                                        <b className="text-ink">{c.code}</b>
                                        <span className="text-muted"> — {c.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Qabulga biriktirilganlar ────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Section title={t('visit.tabServices')} icon={Stethoscope} empty={t('visit.noServices')}>
                    {(visit.procedures || []).map(p => (
                        <Row key={p.id} main={p.procedureName} right={`${fmt(p.finalPrice)} so'm`}
                            charge={chargeOf('Service', p.id)}
                            onDelete={isDone ? undefined : async () => {
                                try { await api.visits.removeProcedure(p.id); reload(); onVisitChanged(visitId); }
                                catch (e: any) { addToast('error', e?.message || 'Xatolik'); }
                            }} />
                    ))}
                </Section>

                <Section title={t('visit.tabLab')} icon={FlaskConical} empty={t('visit.noLabs')}>
                    {(visit.labOrders || []).map(o => {
                        const ch = chargeOf('Lab', o.id);
                        return (
                            <Row key={o.id} main={(o.items || []).map(i => i.testName).join(', ') || t('visit.tabLab')}
                                sub={o.status === 'Completed'
                                    ? (o.seenByDoctorAt ? t('visit.resultSeen') : t('visit.resultReady'))
                                    : t('visit.pending')}
                                right={`${fmt(o.totalPrice)} so'm`}
                                charge={ch}
                                tone={o.status === 'Completed' ? 'ok' : 'wait'}
                                onDelete={isDone || o.status === 'Completed' ? undefined
                                    : () => cancelOrder('lab', o.id, !!ch && ch.status === 'Paid')}
                                action={o.status === 'Completed' && !o.seenByDoctorAt ? (
                                    <button onClick={() => markSeen('lab', o.id)} disabled={busy}
                                        className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200">
                                        {t('visit.sawIt')}
                                    </button>
                                ) : undefined} />
                        );
                    })}
                </Section>

                <Section title={t('visit.tabDiag')} icon={Scan} empty={t('visit.noStudies')}>
                    {(visit.studies || []).map(s => {
                        const ch = chargeOf('Study', s.id);
                        return (
                            <Row key={s.id} main={`${MODALITY_LABELS[s.modality] || s.modality} — ${s.name}`}
                                sub={s.conclusion || (s.status === 'Completed'
                                    ? (s.seenByDoctorAt ? t('visit.resultSeen') : t('visit.resultReady'))
                                    : t('visit.pending'))}
                                right={`${fmt(s.price)} so'm`}
                                charge={ch}
                                tone={s.status === 'Completed' ? 'ok' : 'wait'}
                                onDelete={isDone || s.status === 'Completed' ? undefined
                                    : () => cancelOrder('study', s.id, !!ch && ch.status === 'Paid')}
                                action={s.status === 'Completed' && !s.seenByDoctorAt ? (
                                    <button onClick={() => markSeen('study', s.id)} disabled={busy}
                                        className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200">
                                        {t('visit.sawIt')}
                                    </button>
                                ) : undefined} />
                        );
                    })}
                </Section>

                <Section title={t('visit.tabRx')} icon={Pill} empty={t('visit.noRx')}>
                    {(visit.prescriptions || []).map(rx => (
                        <Row key={rx.id}
                            main={(rx.items || []).map(i => i.name).filter(Boolean).join(', ') || t('visit.prescription')}
                            sub={rx.date}
                            onDelete={isDone ? undefined : () => removePrescription(rx)}
                            action={
                                <button onClick={() => printPrescription({ ...rx, patient }, undefined)}
                                    title={t('common.print')} aria-label={t('common.print')}
                                    className="shrink-0 p-1 text-faint hover:text-primary-600 rounded">
                                    <Printer className="w-3.5 h-3.5" />
                                </button>
                            } />
                    ))}
                </Section>
            </div>

            {/* ── Pul yakuni ──────────────────────────────────────────────── */}
            <div className="bg-surface rounded-xl border border-line p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="text-sm text-muted">
                    {t('common.total')}: <b className="text-ink tabular-nums">{fmt(money.total)}</b>
                </span>
                <span className="text-sm text-muted">
                    {t('visit.paid')}: <b className="text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(money.paid)}</b>
                </span>
                <span className="text-sm text-muted">
                    {t('visit.due')}: <b className={`tabular-nums ${money.due > 0 ? 'text-red-600 dark:text-red-400' : 'text-ink'}`}>{fmt(money.due)}</b>
                </span>
                {visit.checkInTime && (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-faint">
                        <Clock className="w-3.5 h-3.5" /> {new Date(visit.checkInTime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
            </div>
        </div>
    );
};

/* ─── Kichik yordamchi komponentlar ─────────────────────────────────────── */

const Section: React.FC<{ title: string; icon: React.ElementType; empty: string; children: React.ReactNode }> =
    ({ title, icon: Icon, empty, children }) => {
        const has = React.Children.count(children) > 0;
        return (
            <div className="bg-surface rounded-xl border border-line p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-ink mb-3">
                    <Icon className="w-4 h-4 text-faint" /> {title}
                </h4>
                {has ? <div className="space-y-2">{children}</div>
                    : <p className="text-sm text-faint">{empty}</p>}
            </div>
        );
    };

const PaidBadge: React.FC<{ charge?: VisitCharge }> = ({ charge }) => {
    const { t } = useLanguage();
    if (!charge) return null;
    const paid = charge.status === 'Paid';
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${paid
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
            {paid ? t('visit.paidShort') : t('visit.unpaidShort')}
        </span>
    );
};

const Row: React.FC<{
    main: string; sub?: string; right?: string;
    tone?: 'ok' | 'wait'; onDelete?: () => void; charge?: VisitCharge;
    action?: React.ReactNode;
}> = ({ main, sub, right, tone, onDelete, charge, action }) => (
    <div className="flex items-center gap-3 text-sm">
        <div className="min-w-0 flex-1">
            <p className="text-ink truncate">{main}</p>
            {sub && (
                <p className={`text-xs truncate ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
                    : tone === 'wait' ? 'text-amber-600 dark:text-amber-400' : 'text-faint'}`}>
                    {sub}
                </p>
            )}
        </div>
        {action}
        <PaidBadge charge={charge} />
        {right && <span className="tabular-nums text-muted shrink-0">{right}</span>}
        {onDelete && (
            <button aria-label="O'chirish" onClick={onDelete} className="p-1 text-faint hover:text-red-500 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        )}
    </div>
);
