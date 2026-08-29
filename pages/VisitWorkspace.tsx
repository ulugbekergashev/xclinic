import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUzPhone } from '../shared/validation';
import { formatNumber } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, FlaskConical, Scan, Pill, Plus, Trash2, CheckCircle,
    AlertCircle, X, Printer, Stethoscope, Loader2, Wallet,
} from 'lucide-react';
import {
    Visit, Department, EncounterTemplate, LabTest, Service, Doctor,
    Modality, MODALITY_LABELS, ICD10Code, VisitCharge, ChargeSummary,
} from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { EncounterForm } from '../components/EncounterForm';
import { PatientHistoryPanel } from '../components/PatientHistoryPanel';
import { printReferral } from '../utils/printForms';

/* ─────────────────────────────────────────────────────────────────────────────
   Qabul ish stoli — shifokorning asosiy ekrani.

   Muhim qoida: bu yerda bemor TANLANMAYDI. Bemor registraturada bir marta
   tanlangan va qabul ochilgan; shifokor faqat shu qabul ustida ishlaydi.
   Tahlil, diagnostika, retsept, xizmat — hammasi shu qabulga bog'lanadi va
   narxi bitta kassaga tushadi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    departments: Department[];
    services: Service[];
    doctors: Doctor[];
    currentUserName?: string;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

/* Raqam formati BITTA joydan — `utils/format.ts`. Ilgari bu yerda
   `Intl.NumberFormat('uz-UZ')` turardi: Chrome da `uz` lokali to'liq
   emas va u vergul qo'yadi («160,000»), Moliya bo'limi esa bo'shliq
   qo'yardi («160 000») — bitta ilovada ikki xil ko'rinish. */
const fmt = (n: number) => formatNumber(n);
const MODALITIES: Modality[] = ['UZI', 'EKG', 'RENTGEN', 'ENDOSKOPIYA', 'MRT', 'KT'];

const calcAge = (dob?: string) => {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
};

export const VisitWorkspace: React.FC<Props> = ({ departments, services, doctors, currentUserName, addToast }) => {
    const { t } = useLanguage();
    const { visitId } = useParams<{ visitId: string }>();
    const navigate = useNavigate();

    const [visit, setVisit] = useState<Visit | null>(null);
    const [templates, setTemplates] = useState<EncounterTemplate[]>([]);
    const [labTests, setLabTests] = useState<LabTest[]>([]);
    // To'lov holati — har bir buyurtma yonida ko'rsatiladi
    const [charges, setCharges] = useState<VisitCharge[]>([]);
    const [money, setMoney] = useState<ChargeSummary>({ total: 0, paid: 0, due: 0, unpaidCount: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Ochiladigan panellar
    const [panel, setPanel] = useState<null | 'lab' | 'study' | 'rx' | 'service'>(null);

    const [labPick, setLabPick] = useState<string[]>([]);
    const [studyForm, setStudyForm] = useState({ modality: 'UZI' as Modality, name: '', price: '' });
    const [rxItems, setRxItems] = useState([{ name: '', dosage: '', frequency: '', durationDays: '' }]);
    const [svcPick, setSvcPick] = useState<number | ''>('');
    const [icdQuery, setIcdQuery] = useState('');
    const [icdResults, setIcdResults] = useState<ICD10Code[]>([]);

    const reload = useCallback(async () => {
        if (!visitId) return;
        try {
            const [v, c] = await Promise.all([
                api.visits.getById(visitId),
                api.charges.byVisit(visitId).catch(() => ({
                    charges: [], summary: { total: 0, paid: 0, due: 0, unpaidCount: 0 },
                })),
            ]);
            setVisit(v);
            setCharges(c.charges);
            setMoney(c.summary);
            setError('');
        } catch (e: any) {
            setError(e.message || 'Qabulni ochib bo\'lmadi');
        } finally { setLoading(false); }
    }, [visitId]);

    useEffect(() => { reload(); }, [reload]);
    useEffect(() => {
        api.encounterTemplates.getAll().then(setTemplates).catch(() => { });
        api.labTests.getAll().then(setLabTests).catch(() => { });
    }, []);

    const dept = useMemo(() => departments.find(d => d.id === visit?.departmentId), [departments, visit]);
    const age = calcAge(visit?.patient?.dob);

    /** Manba yozuvining to'lov holati — qator yonidagi belgi shundan olinadi */
    const chargeOf = useCallback(
        (source: string, sourceId: string) =>
            charges.find(c => c.source === source && c.sourceId === sourceId && c.status !== 'Cancelled'),
        [charges],
    );

    const isDone = visit?.status === 'Completed';

    // ── Amallar ─────────────────────────────────────────────────────────────
    const guard = async (fn: () => Promise<any>, okMsg: string) => {
        setBusy(true);
        try { await fn(); await reload(); addToast('success', okMsg); setPanel(null); }
        catch (e: any) { addToast('error', e.message || 'Xatolik'); }
        finally { setBusy(false); }
    };

    const saveEncounter = (data: Record<string, any>, templateId?: string) =>
        guard(() => api.visits.update(visit!.id, {
            examData: JSON.stringify(data), templateId,
            status: visit!.status === 'Waiting' ? 'In Progress' : visit!.status,
        }), 'Bayon saqlandi');

    /* Natijani "ko'rdim" deb belgilash.
       Nima uchun tugma, avtomatik emas: ro'yxatdan chiqishi shifokorning
       ataylab qilgan ishi bo'lishi kerak — kim va qachon tanishgani jurnalda
       qoladi. Qabulni ochish o'zi "o'qidim" degani emas. */
    const markSeen = (kind: 'lab' | 'study', id: string) => guard(async () => {
        if (kind === 'lab') await api.clinical.markLabSeen(id);
        else await api.clinical.markStudySeen(id);
    }, "Ko'rilgan deb belgilandi");

    /* YO'LLANMA. Bemor qo'lida qog'oz bo'lishi kerak: kassir undan nima
       to'lanishini o'qiydi, bemor esa nima uchun to'layotganini biladi.
       Ilgari bu og'zaki edi — "kassaga boring, UZI uchun to'lang"
       (GAP-ANALYSIS B7).

       Ro'yxat TO'LANMAGAN qatorlardan olinadi: to'langanini yana kassaga
       yuborishning ma'nosi yo'q. */
    const [refBusy, setRefBusy] = useState(false);

    const unpaidCharges = charges.filter(c => c.status === 'Unpaid');

    const issueReferral = async () => {
        if (!visit) return;
        setRefBusy(true);
        try {
            const created = await api.referrals.create({
                patientId: visit.patientId,
                visitId: visit.id,
                kind: 'Cashier',
                items: unpaidCharges.map(c => ({
                    name: c.name,
                    price: c.unitPrice,
                    quantity: c.quantity || 1,
                })),
            });
            // Bosma varaq uchun klinika shapkasi kerak — alohida so'rov
            const full = await api.referrals.get(created.id);
            const opened = printReferral(full, full.clinic);
            addToast(opened ? 'success' : 'info',
                opened ? `Yo'llanma № ${created.number}` : `Yo'llanma № ${created.number} yaratildi, lekin bosma oyna bloklandi`);
        } catch (e: any) {
            addToast('error', e?.message || "Yo'llanma chiqarilmadi");
        } finally {
            setRefBusy(false);
        }
    };

    const sendToLab = () => guard(() => api.labOrders.create({
        patientId: visit!.patientId,
        patientName: `${visit!.patient?.lastName || ''} ${visit!.patient?.firstName || ''}`.trim(),
        visitId: visit!.id,
        doctorName: visit!.doctorName || currentUserName || '',
        testIds: labPick,
    }), 'Tahlilga yuborildi');

    const sendToDiagnostics = () => guard(() => api.studies.create({
        patientId: visit!.patientId,
        patientName: `${visit!.patient?.lastName || ''} ${visit!.patient?.firstName || ''}`.trim(),
        visitId: visit!.id,
        modality: studyForm.modality,
        name: studyForm.name.trim(),
        price: Number(studyForm.price) || 0,
        orderedByName: visit!.doctorName || currentUserName || null,
    }), 'Diagnostikaga yuborildi');

    const writePrescription = () => guard(() => api.prescriptions.create({
        patientId: visit!.patientId,
        patientName: `${visit!.patient?.lastName || ''} ${visit!.patient?.firstName || ''}`.trim(),
        visitId: visit!.id,
        doctorName: visit!.doctorName || currentUserName || null,
        items: rxItems.filter(i => i.name.trim()).map(i => ({
            name: i.name.trim(), dosage: i.dosage || null, frequency: i.frequency || null,
            durationDays: i.durationDays ? Number(i.durationDays) : null,
        })),
    }), 'Retsept yozildi');

    const addService = () => guard(
        () => api.visits.addProcedure(visit!.id, { serviceId: Number(svcPick) }),
        "Xizmat qo'shildi",
    );

    const addDiagnosis = (code: ICD10Code) => guard(() => api.diagnoses.add({
        patientId: visit!.patientId, code: code.code, date: visit!.date,
        notes: '', status: 'Active', clinicId: visit!.clinicId, visitId: visit!.id,
    } as any), 'Tashxis qo\'shildi');

    /* QABULNI YAKUNLASH — NAZORAT BILAN (S3.7, audit B-12).

       Server yopishdan oldin tekshiradi: tashxis bormi, to'lov
       qolganmi, tahlil natijasi kelganmi. Kamchilik bo'lsa 409 va
       sabablar ro'yxati qaytadi.

       TAQIQ EMAS, TANLOV: bemor qarzga qolishi mumkin, natija ertaga
       kelishi mumkin. Lekin shifokor buni BILIB yopishi kerak, va sabab
       yozib qolishi kerak — «nega tashxissiz yopilgan?» degan savol
       keyin ham javobsiz qolmasin. */
    const complete = async () => {
        setBusy(true);
        try {
            await api.visits.update(visit!.id, { status: 'Completed' });
            await reload();
            addToast('success', 'Qabul yakunlandi');
            setPanel(null);
        } catch (e: any) {
            if (e?.data?.code === 'VISIT_INCOMPLETE') {
                const reasons: { text: string }[] = e.data.reasons || [];
                const list = reasons.map(r => '• ' + r.text).join(String.fromCharCode(10));
                const proceed = await confirmAction({
                    title: "Qabul to'liq emas",
                    body: `${list}${String.fromCharCode(10)}${String.fromCharCode(10)}Baribir yakunlansinmi? Sabab qabul izohiga yoziladi.`,
                    confirmLabel: 'Baribir yakunlash',
                });
                if (proceed) {
                    try {
                        await api.visits.update(visit!.id, {
                            status: 'Completed',
                            force: true,
                            closeReason: 'Yakunlandi: ' + reasons.map(r => r.text).join('; '),
                        } as any);
                        await reload();
                        addToast('success', 'Qabul yakunlandi');
                        setPanel(null);
                    } catch (e2: any) {
                        addToast('error', e2.message || 'Xatolik');
                    }
                }
            } else {
                addToast('error', e.message || 'Xatolik');
            }
        } finally {
            setBusy(false);
        }
    };

    const searchIcd = async (q: string) => {
        setIcdQuery(q);
        if (q.trim().length < 2) { setIcdResults([]); return; }
        try { setIcdResults(await api.diagnoses.searchCodes(q.trim())); } catch { setIcdResults([]); }
    };

    const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
    );

    if (!visit) return (
        <div className="text-center py-20">
            <p className="text-gray-500 dark:text-gray-400">{error || 'Qabul topilmadi'}</p>
            <button onClick={() => navigate('/reception')} className="mt-3 text-primary-600 hover:underline">{t('visit.backToReception')}</button>
        </div>
    );

    // Qabul bo'limiga tegishli xizmatlar. Bo'limi ko'rsatilmagan eski xizmatlar ham
    // ko'rinadi, lekin BOSHQA bo'limnikilar hech qachon chiqmaydi.
    const deptServices = services.filter(s => !s.departmentId || s.departmentId === visit.departmentId);

    return (
        <div className="space-y-5">
            {/* ── Bemor sarlavhasi ──────────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="w-11 h-11 rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 grid place-items-center font-bold">
                        {visit.queueNumber ?? '—'}
                    </span>
                    <div className="min-w-0">
                        {/* BEMOR KARTASIGA O'TISH.

                            Bu havola YO'Q edi. Qabul ekraniga navbatdan
                            kirilgan bo'lsa, undan bemor kartasiga qaytish
                            yo'li umuman yo'q edi: orqaga qaytib, Bemorlar
                            ro'yxatini ochib, ismni qidirish kerak edi.

                            Karta esa aynan «bu bemorda nima bo'lgan?»
                            degan savolga javob beradi — qabullar tarixi,
                            tahlillar, to'lovlar, materiallar. */}
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                            <button
                                type="button"
                                onClick={() => navigate(`/patients/${visit.patientId}`)}
                                title="Bemor kartasini ochish — butun tarixi"
                                className="hover:text-primary-600 dark:hover:text-primary-400 hover:underline text-left"
                            >
                                {visit.patient?.lastName} {visit.patient?.firstName}
                            </button>
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {age != null ? `${age} yosh · ` : ''}
                            {visit.patient?.gender === 'Male' ? 'Erkak' : visit.patient?.gender === 'Female' ? 'Ayol' : ''}
                            {visit.patient?.phone ? ` · ${formatUzPhone(visit.patient.phone)}` : ''}
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-xs text-gray-500 dark:text-gray-400">{dept?.name || "Bo'limsiz"}</p>
                            <p className="font-bold text-gray-900 dark:text-white tabular-nums">{fmt(money.total)} so'm</p>
                            {money.due > 0 && (
                                <p className="text-xs font-medium text-red-600 dark:text-red-400 tabular-nums">
                                    qarz: {fmt(money.due)}
                                </p>
                            )}
                        </div>
                        {isDone ? (
                            <span className="flex items-center gap-1.5 px-3 py-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg text-sm font-medium">
                                <CheckCircle className="w-4 h-4" /> Yakunlangan
                            </span>
                        ) : (
                            <button onClick={complete} disabled={busy}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                                <CheckCircle className="w-4 h-4" /> Qabulni yakunlash
                            </button>
                        )}
                    </div>
                </div>
                {visit.complaints && (
                    <p className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-medium">{t('visit.complaint')}</span> {visit.complaints}
                    </p>
                )}
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {/* "Avval nima bo'lgan" — bemor kartasidan KEYIN, buyurtma
                tugmalaridan OLDIN. Sabab: dori yoki tahlil buyurishdan avval
                shifokor allergiyani ko'rishi kerak. Ilgari bu ma'lumot ish
                stolida umuman yo'q edi (GAP-ANALYSIS, 2-sahna). */}
            {visit.patientId && (
                <PatientHistoryPanel
                    patientId={visit.patientId}
                    canEdit={true}
                    addToast={addToast}
                />
            )}

            {/* To'lanmagan buyurtma bo'lsa eslatma. Shifokorni ATAYLAB bloklamaymiz:
                shoshilinch holatda bemorni kassa uchun kutdirib bo'lmaydi, qarz qolib
                ketaveradi. Laboratoriya esa to'lovsiz natija bermaydi — u yerda blok bor. */}
            {money.due > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <Wallet className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        <b>{fmt(money.due)} so'm</b> to'lanmagan — bemorni kassaga yo'naltiring.
                        {money.unpaidCount > 1 ? ` (${money.unpaidCount} ta xizmat)` : ''}
                    </p>
                    <button onClick={issueReferral} disabled={refBusy}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50">
                        <Printer className="w-4 h-4" /> Yo'llanma chiqarish
                    </button>
                    <button onClick={() => navigate('/finance')}
                        className="text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline">
                        Kassaga o'tish
                    </button>
                </div>
            )}

            {/* ── Amal tugmalari ────────────────────────────────────────────── */}
            {!isDone && (
                <div className="flex flex-wrap gap-2">
                    {([
                        ['lab', FlaskConical, 'Tahlilga yuborish'],
                        ['study', Scan, 'Diagnostikaga yuborish'],
                        ['rx', Pill, 'Retsept yozish'],
                        ['service', Plus, "Xizmat qo'shish"],
                    ] as const).map(([key, Icon, label]) => (
                        <button key={key} onClick={() => setPanel(panel === key ? null : key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${panel === key
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary-400'}`}>
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Panellar ──────────────────────────────────────────────────── */}
            {panel === 'lab' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('visit.whichTests')}</h3>
                    {labTests.filter(t => t.isActive).length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('visit.labCatalogEmpty')}</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                                {labTests.filter(t => t.isActive).map(t => {
                                    const on = labPick.includes(t.id);
                                    return (
                                        <label key={t.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer ${on
                                            ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                                            <input type="checkbox" checked={on} className="w-4 h-4 rounded text-primary-600"
                                                onChange={() => setLabPick(p => on ? p.filter(x => x !== t.id) : [...p, t.id])} />
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm text-gray-900 dark:text-white truncate">{t.name}</span>
                                                <span className="block text-xs text-gray-400">{t.sampleType} · {t.turnaroundHours} soat</span>
                                            </span>
                                            <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">{fmt(t.price)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    Jami: <b className="text-gray-900 dark:text-white tabular-nums">
                                        {fmt(labTests.filter(t => labPick.includes(t.id)).reduce((s, t) => s + t.price, 0))} so'm
                                    </b>
                                </span>
                                <button onClick={sendToLab} disabled={busy || labPick.length === 0}
                                    className="ml-auto px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                                    Laboratoriyaga yuborish
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {panel === 'study' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('visit.whichStudy')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select value={studyForm.modality} onChange={e => setStudyForm(f => ({ ...f, modality: e.target.value as Modality }))} className={inputCls}>
                            {MODALITIES.map(m => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
                        </select>
                        <input value={studyForm.name} onChange={e => setStudyForm(f => ({ ...f, name: e.target.value }))}
                            className={`${inputCls} sm:col-span-2`} placeholder="Masalan: Qorin bo'shlig'i UZI" />
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                        <input type="number" value={studyForm.price} onChange={e => setStudyForm(f => ({ ...f, price: e.target.value }))}
                            className={`${inputCls} max-w-[160px]`} placeholder="Narx" />
                        <button onClick={sendToDiagnostics} disabled={busy || !studyForm.name.trim()}
                            className="ml-auto px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                            Diagnostikaga yuborish
                        </button>
                    </div>
                </div>
            )}

            {panel === 'rx' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('visit.prescription')}</h3>
                    <div className="space-y-2">
                        {rxItems.map((it, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2">
                                <input value={it.name} onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                                    className={`${inputCls} col-span-4`} placeholder={t('visit.medName')} />
                                <input value={it.dosage} onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))}
                                    className={`${inputCls} col-span-3`} placeholder={t('visit.dose')} />
                                <input value={it.frequency} onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))}
                                    className={`${inputCls} col-span-3`} placeholder={t('visit.frequencyPh')} />
                                <input type="number" value={it.durationDays} onChange={e => setRxItems(r => r.map((x, j) => j === i ? { ...x, durationDays: e.target.value } : x))}
                                    className={`${inputCls} col-span-2`} placeholder="kun" />
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                        <button onClick={() => setRxItems(r => [...r, { name: '', dosage: '', frequency: '', durationDays: '' }])}
                            className="text-sm text-primary-600 dark:text-primary-400 hover:underline">+ Yana dori</button>
                        <button onClick={writePrescription} disabled={busy || !rxItems.some(i => i.name.trim())}
                            className="ml-auto px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                            Retseptni saqlash
                        </button>
                    </div>
                </div>
            )}

            {panel === 'service' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-primary-300 dark:border-primary-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('visit.addService')}</h3>
                    <div className="flex flex-wrap gap-3">
                        <select value={svcPick} onChange={e => setSvcPick(e.target.value ? Number(e.target.value) : '')} className={`${inputCls} max-w-md`}>
                            <option value="">{t('common.choose')}</option>
                            {deptServices.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                        </select>
                        <button onClick={addService} disabled={busy || !svcPick}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                            Qo'shish
                        </button>
                    </div>
                </div>
            )}

            {/* ── Qabul bayoni ──────────────────────────────────────────────── */}
            <EncounterForm
                departments={departments}
                templates={templates.filter(t => t.departmentId === visit.departmentId)}
                departmentId={visit.departmentId || undefined}
                templateId={visit.templateId || undefined}
                value={visit.examData || {}}
                readOnly={isDone}
                onSave={saveEncounter}
            />

            {/* ── Tashxis ───────────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Tashxis (MKB-10)</h3>
                {!!visit.diagnoses?.length && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {visit.diagnoses.map(d => (
                            <span key={d.id} className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200">
                                <b>{d.code}</b>{d.icd10?.name ? ` — ${d.icd10.name}` : ''}
                            </span>
                        ))}
                    </div>
                )}
                {!isDone && (
                    <>
                        <input value={icdQuery} onChange={e => searchIcd(e.target.value)} className={inputCls}
                            placeholder={t('visit.icdSearchPh')} />
                        {icdResults.length > 0 && (
                            <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-48 overflow-y-auto">
                                {icdResults.slice(0, 12).map(c => (
                                    <button key={c.code} onClick={() => { addDiagnosis(c); setIcdQuery(''); setIcdResults([]); }}
                                        className="w-full text-left p-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <b className="text-gray-900 dark:text-white">{c.code}</b>
                                        <span className="text-gray-600 dark:text-gray-300"> — {c.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Qabulga biriktirilganlar ──────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title={t('visit.tabServices')} icon={Stethoscope} empty="Xizmat qo'shilmagan">
                    {(visit.procedures || []).map(p => (
                        <Row key={p.id} main={p.procedureName} right={`${fmt(p.finalPrice)} so'm`}
                            charge={chargeOf('Service', p.id)}
                            onDelete={isDone ? undefined : async () => {
                                try { await api.visits.removeProcedure(p.id); reload(); } catch (e: any) { addToast('error', e.message); }
                            }} />
                    ))}
                </Section>

                <Section title={t('visit.tabLab')} icon={FlaskConical} empty="Tahlil yuborilmagan">
                    {(visit.labOrders || []).map(o => (
                        <Row key={o.id} main={(o.items || []).map(i => i.testName).join(', ') || 'Tahlil'}
                            sub={o.status === 'Completed'
                                ? (o.seenByDoctorAt ? "Natija tayyor - ko'rildi" : 'Natija tayyor')
                                : 'Kutilmoqda'}
                            right={`${fmt(o.totalPrice)} so'm`}
                            charge={chargeOf('Lab', o.id)}
                            tone={o.status === 'Completed' ? 'ok' : 'wait'}
                            action={o.status === 'Completed' && !o.seenByDoctorAt ? (
                                <button onClick={() => markSeen('lab', o.id)} disabled={busy}
                                    className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200">
                                    Ko'rdim
                                </button>
                            ) : undefined} />
                    ))}
                </Section>

                <Section title={t('visit.tabDiag')} icon={Scan} empty="Tekshiruv yuborilmagan">
                    {(visit.studies || []).map(s => (
                        <Row key={s.id} main={`${MODALITY_LABELS[s.modality] || s.modality} — ${s.name}`}
                            sub={s.conclusion || (s.status === 'Completed'
                                ? (s.seenByDoctorAt ? "Tayyor - ko'rildi" : 'Tayyor')
                                : 'Kutilmoqda')}
                            right={`${fmt(s.price)} so'm`}
                            charge={chargeOf('Study', s.id)}
                            tone={s.status === 'Completed' ? 'ok' : 'wait'}
                            action={s.status === 'Completed' && !s.seenByDoctorAt ? (
                                <button onClick={() => markSeen('study', s.id)} disabled={busy}
                                    className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200">
                                    Ko'rdim
                                </button>
                            ) : undefined} />
                    ))}
                </Section>

                <Section title={t('visit.tabRx')} icon={Pill} empty="Retsept yozilmagan">
                    {(visit.prescriptions || []).map(rx => (
                        <Row key={rx.id} main={(rx.items || []).map(i => i.name).join(', ') || 'Retsept'} sub={rx.date} />
                    ))}
                </Section>
            </div>
        </div>
    );
};

/* ─── Kichik yordamchi komponentlar ─────────────────────────────────────── */

const Section: React.FC<{ title: string; icon: React.ElementType; empty: string; children: React.ReactNode }> =
    ({ title, icon: Icon, empty, children }) => {
        const has = React.Children.count(children) > 0;
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    <Icon className="w-4 h-4 text-gray-400" /> {title}
                </h3>
                {has ? <div className="space-y-2">{children}</div>
                    : <p className="text-sm text-gray-400 dark:text-gray-500">{empty}</p>}
            </div>
        );
    };

/** To'langan / to'lanmagan belgisi — shifokor buyurtma yonida darhol ko'radi */
const PaidBadge: React.FC<{ charge?: VisitCharge }> = ({ charge }) => {
    if (!charge) return null;
    const paid = charge.status === 'Paid';
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${paid
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
            {paid ? "to'langan" : "to'lanmagan"}
        </span>
    );
};

const Row: React.FC<{
    main: string; sub?: string; right?: string;
    tone?: 'ok' | 'wait'; onDelete?: () => void; charge?: VisitCharge;
    /** Qator ichidagi qo'shimcha amal — masalan "Ko'rdim" */
    action?: React.ReactNode;
}> = ({ main, sub, right, tone, onDelete, charge, action }) => (
    <div className="flex items-center gap-3 text-sm">
        <div className="min-w-0 flex-1">
            <p className="text-gray-900 dark:text-white truncate">{main}</p>
            {sub && (
                <p className={`text-xs truncate ${tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
                    : tone === 'wait' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                    {sub}
                </p>
            )}
        </div>
        {action}
        <PaidBadge charge={charge} />
        {right && <span className="tabular-nums text-gray-600 dark:text-gray-300 shrink-0">{right}</span>}
        {onDelete && (
            <button aria-label="O'chirish" onClick={onDelete} className="p-1 text-gray-300 hover:text-red-500 shrink-0" title="O'chirish">
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        )}
    </div>
);
