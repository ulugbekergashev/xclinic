import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wallet, Loader2, Trash2, CheckCircle, Printer, Plus, UserPlus } from 'lucide-react';
import { Modal, Button } from './Common';
import { Patient } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatMoney } from '../utils/format';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { validatePatient } from '../shared/validation';
import { fmtDateTime, PrintClinic } from '../utils/printDocument';
import { printReceipt } from '../utils/printReceipt';
import { ServiceTiles, ServiceOption, serviceKey, rememberServiceUsage } from './payment/ServiceTiles';
import { QuickPatient, PatientDraft, EMPTY_DRAFT } from './payment/QuickPatient';

/* ─────────────────────────────────────────────────────────────────────────────
   TO'LOV — XIZMAT UCHUN, PROTSEDURADAN OLDIN HAM.

   NIMA UCHUN «AVANS» EMAS. Bu yerda ilgari `AdvanceModal` turardi: kassir
   summa kiritardi va pul bemorning BALANSIGA tushardi — qanday xizmat uchun
   ekani noma'lum. Keyin qatorlarni to'lashda o'sha balansdan yechilardi.

   Klinikada bunday pul yo'q. Odam kassaga «shunchaki pul qo'yish» uchun
   kelmaydi — u konsultatsiya, UZI yoki protsedura uchun to'laydi. Mavhum
   hamyon esa uchta narsani buzardi:

     · shifokor ulushi hisoblanmasdi (ulush XIZMAT QATORIGA bog'langan);
     · hisobotda «qaysi xizmat qancha keltirdi» degan savolga javob
       yo'qolardi — pul «Avans» degan qatorda turardi;
     · kassirda ikkita tugma bo'lardi va qaysi birini bosishni bilish uchun
       tizimning ichki tuzilishini bilish kerak edi.

   ENDI BITTA YO'L. Kassir xizmatni tanlaydi, qator SHU YERDA yaratiladi va
   darhol to'lanadi. Shifokor protsedurani keyin bajaradi — qator allaqachon
   to'langan bo'lib turadi. «To'lovni protseduradan oldin qilish» aynan shu.

   Qator serverda `POST /api/charges` bilan yaratiladi va `POST /api/payments`
   bilan to'lanadi — ikkalasi ham shifokor yaratgan qatorlar bilan BIR XIL
   yo'l. Yangi pul yo'li ochilmaydi: PLAN-HOMES da 12 ta «pul qabul qilish»
   tugmasi bittaga keltirilgan edi, uni yana bo'lish shart emas.

   ─── SODDALASHTIRISH (klinika so'rovi) ──────────────────────────────────────

   «Ambulator ukolga kelgan bemorga chek chiqarish murakkab: avval bemor
   ma'lumotlari, keyin to'lov qismidan xizmatlar, keyin to'lov. Kompyuterni
   yaxshi bilmaydigan hamshiralar qiynalyapti».

   Pul yo'li O'ZGARMADI — o'zgargani faqat ekran:

     · xizmatlar — katta tugmalar, yozmasdan bosiladi (`ServiceTiles`);
     · yangi bemor — shu oynada, uchta maydon (`QuickPatient`), to'lov
       bilan birga yaratiladi;
     · to'lovdan keyin oyna yopilmaydi: CHEK shu yerda, qatorma-qator.
       Ilgari chek uchun kassa jurnalidan o'sha to'lovni qidirish kerak edi.

   ─── BEMOR SHART EMAS (klinika ikkinchi marta so'radi) ──────────────────────

   «Xizmat tanlanadi va to'lov qilinadi. Bemorning ma'lumotlari kerak emas.»

   Birinchi variantda bemor MAJBURIY edi: «bemorsiz chek hech kimga
   bog'lanmagan pul bo'lib qoladi» degan mulohaza bilan. Bu klinikaning
   so'roviga zid edi — ukolga kelgan odamning familiyasini yozish ular uchun
   aynan ortiqcha ish. Server esa bemorsiz qatorni doim qabul qilgan
   (`VisitCharge.patientId` ixtiyoriy), to'siq faqat shu oynada edi.

   Endi: xizmat → to'lov → chek. Bemor — ixtiyoriy tugma ortida; kerak
   bo'lganda (tarix, qarz, qaytarish) ko'rsatiladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Bemor oldindan ma'lum bo'lsa (bemor kartasi). `null` — oyna o'zi qidiradi. */
    patient: Patient | null;
    services: ServiceOption[];
    receivedByName?: string;
    /** Chek shapkasi. `enableReceipts` yoqilgan bo'lsa chek o'zi bosishga ketadi. */
    clinic?: (PrintClinic & { enableReceipts?: boolean }) | null;
    onDone?: () => void;
    /** Oyna ichida yangi bemor yaratildi — ilova ro'yxati uni bilib qo'ysin */
    onPatientCreated?: (p: Patient) => void;
    /* Tanlangan bemorning to'lanmagan qarzi bor — uni to'lash oynasini ochadi.
       Bu oyna YANGI xizmat sotadi; navbatdagi bemorning qarzi bo'lsa, kassir
       uni bilmay ikkinchi marta yozib qo'ymasin (audit, 2026-11-22). */
    onPayDebt?: (p: Patient) => void;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type Line = { key: string; serviceId?: number; name: string; price: number; qty: number };

/** O'tgan to'lov — chek shundan chiziladi va bosiladi */
type PaidReceipt = {
    /** Bo'sh — to'lov bemorsiz qabul qilingan */
    patientName: string;
    lines: Line[];
    total: number;
    method: string;
    number: string;
    at: Date;
};

export const ServicePaymentModal: React.FC<Props> = ({
    isOpen, onClose, patient, services, receivedByName, clinic, onDone, onPatientCreated, onPayDebt, addToast,
}) => {
    const { t } = useLanguage();

    /* Bemor IXTIYORIY: bazadan tanlangan, shu yerda kiritilayotgan yangi
       yoki umuman ko'rsatilmagan. Bo'lim sukut bo'yicha YOPIQ. */
    const [showPatient, setShowPatient] = useState(false);
    const [picked, setPicked] = useState<Patient | null>(null);
    const [isNewPatient, setIsNewPatient] = useState(false);
    const [draft, setDraft] = useState<PatientDraft>(EMPTY_DRAFT);
    const [duplicates, setDuplicates] = useState<Patient[]>([]);
    const target = patient || picked;

    const [lines, setLines] = useState<Line[]>([]);
    const [method, setMethod] = useState('Cash');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState<PaidReceipt | null>(null);

    /* Tanlangan bemorning hozirgi qarzi — oynada ogohlantirish uchun */
    const [debt, setDebt] = useState(0);
    useEffect(() => {
        setDebt(0);
        if (!isOpen || !target?.id || !onPayDebt) return;
        let alive = true;
        api.charges.getAll({ patientId: target.id, status: 'Unpaid' })
            .then(cs => {
                if (!alive) return;
                setDebt((cs || []).reduce((s, c) => s + Math.max(0, c.total - (c.paidAmount || 0)), 0));
            })
            .catch(() => { /* ogohlantirishsiz ham ishlaydi */ });
        return () => { alive = false; };
    }, [isOpen, target?.id, onPayDebt]);

    /* SERVERDA YARATILGAN QATORLAR: satr kaliti → qator id.

       Qatorlar birma-bir yaratiladi, keyin to'lanadi. Ilgari to'lov (yoki
       uchinchi qatorni yaratish) yiqilsa va kassir «Qabul qilish» ni yana
       bossa, HAMMA qator QAYTADAN yaratilardi — bemorning qarziga ikki
       nusxa tushardi. Endi yaratilgani eslab qolinadi va qayta urinishda
       faqat yetishmagani yaratiladi, keyin mavjudlari to'lanadi.

       `useRef` — sikl ichida darhol o'qiladi (holat keyingi renderda
       yangilanadi). Son esa ekran uchun holatda ham turadi. */
    const createdRef = useRef<Record<string, string>>({});
    const [createdCount, setCreatedCount] = useState(0);
    /* Qator yaratilgach bemor va ro'yxat QULFLANADI: aks holda yaratilgan,
       lekin ro'yxatdan olib tashlangan qator to'lanmay qolib ketardi. */
    const locked = createdCount > 0;

    /* SO'ROV KETAYOTGANDA — IKKINCHISI YO'Q, YOPISH HAM YO'Q.

       `saving` holati keyingi renderda yangilanadi, ya'ni tez ikki bosish
       ikkalasi ham «bo'sh» deb ko'rardi: ikki bemor, ikki chek. `useRef`
       darhol o'qiladi.

       Yopish ham shu yerda to'xtatiladi. Oyna X yoki fon bosilib yopilsa,
       forma tozalanardi, yo'lda ketgan so'rov esa tugab, TOZA formaga
       eski bemorning qator id larini va chekini yozardi — keyingi bemor
       oldingisining qatorini to'lab qo'yishi mumkin edi. */
    const busyRef = useRef(false);
    const closeIfIdle = () => { if (!busyRef.current) onClose(); };

    const resetForm = () => {
        setShowPatient(false);
        setPicked(null); setIsNewPatient(false); setDraft(EMPTY_DRAFT); setDuplicates([]);
        setLines([]); setError(''); setReceipt(null);
        /* Usul ham: oldingi bemor karta bilan to'lagan bo'lsa, keyingisi
           jimgina «Karta» bo'lib ketmasin — kassa kitobi usul bo'yicha yig'adi. */
        setMethod('Cash');
        createdRef.current = {}; setCreatedCount(0);
    };

    /* Oyna yopilganda hammasi tozalanadi: keyingi safar oldingi bemorning
       tanlovi qolib ketmasin. To'lanmay qolgan qatorlar serverda turadi va
       kassaning «to'lanmagan» ro'yxatida ko'rinadi. */
    useEffect(() => {
        if (!isOpen) resetForm();
    }, [isOpen]);

    const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.qty, 0), [lines]);
    const quantities = useMemo(
        () => Object.fromEntries(lines.map(l => [l.key, l.qty])),
        [lines],
    );

    /* Bir xil xizmat ikkinchi marta bosilsa — yangi qator emas, MIQDOR
       oshadi. Aks holda chekda bir xil nom ikki marta turardi va kassir
       qaysi biri qaysiligini ajrata olmasdi. */
    const addLine = (s: ServiceOption) => {
        const key = serviceKey(s);
        setLines(prev => prev.some(l => l.key === key)
            ? prev.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
            : [...prev, { key, serviceId: s.id, name: s.name, price: s.price, qty: 1 }]);
    };
    const removeOne = (s: ServiceOption) => {
        const key = serviceKey(s);
        setLines(prev => prev
            .map(l => l.key === key ? { ...l, qty: l.qty - 1 } : l)
            .filter(l => l.qty > 0));
    };

    /** Kimga yoziladi.
     *  `undefined` — to'xtash kerak: sabab ekranda (`error` yoki takrorlar).
     *  `null` — bemor ko'rsatilmagan, to'lov bemorsiz o'tadi. */
    const resolvePatient = async (force: boolean): Promise<Patient | null | undefined> => {
        if (target) return target;
        if (!isNewPatient) return null;

        /* Qoida serverniki bilan bitta fayldan — xato so'rov yuborilmasdan chiqadi */
        const checked: any = validatePatient({
            firstName: draft.firstName, lastName: draft.lastName,
            gender: draft.gender, phone: draft.phone,
        });
        if (!checked.ok) { setError(checked.error); return undefined; }

        try {
            const created = await api.patients.create({
                firstName: draft.firstName.trim(), lastName: draft.lastName.trim(),
                phone: draft.phone.trim(), gender: draft.gender,
                ...(force ? { force: true } : {}),
            } as any);
            setPicked(created);
            setDuplicates([]);
            onPatientCreated?.(created);
            return created;
        } catch (e: any) {
            /* 409 — xato emas, savol: «shu odam emasmi?» Javobni odam beradi. */
            if (e?.status === 409 && e?.data?.code === 'DUPLICATE_PATIENT') {
                setDuplicates(e.data.matches || []);
                return undefined;
            }
            throw e;
        }
    };

    const showReceipt = (r: PaidReceipt) => {
        const printed = printReceipt({
            title: t('payment.receiptTitle'),
            clinic,
            meta: [
                { label: t('ui.sana'), value: fmtDateTime(r.at) },
                { label: t('receiptmodal.chek_raqami'), value: `#${r.number}` },
                ...(r.patientName ? [{ label: t('ui.bemor'), value: r.patientName }] : []),
                ...(receivedByName ? [{ label: t('payment.cashier'), value: receivedByName }] : []),
            ],
            lines: r.lines.map(l => ({ name: l.name, quantity: l.qty, total: l.price * l.qty })),
            summary: [
                { label: t('payment.total'), value: `${formatMoney(r.total)} ${t('ui.som')}`, strong: true },
                { label: t('ui.tolov_usuli'), value: getPaymentMethodLabel(r.method) },
            ],
            footer: t('receiptmodal.thanks'),
        });
        if (!printed) addToast?.('error', t('print.popupBlocked'));
    };

    const submit = async (force = false) => {
        if (busyRef.current) return;
        setError('');
        if (lines.length === 0) { setError(t('payment.pickService')); return; }

        busyRef.current = true;
        setSaving(true);
        try {
            const who = await resolvePatient(force);
            if (who === undefined) return;
            const patientName = who ? `${who.lastName} ${who.firstName}`.trim() : '';

            /* 1) Qatorlar yaratiladi. Ular shifokor yaratadigan qatorlar bilan
                  bir xil: `serviceId` saqlanadi, ya'ni shifokor ulushi va
                  xizmat bo'yicha hisobot ishlaydi. */
            const ids: string[] = [];
            for (const l of lines) {
                let id = createdRef.current[l.key];
                if (!id) {
                    const created: any = await api.charges.create({
                        /* Bemorsiz qatorda `patientId` yo'q; nom o'rnida —
                           kassa jurnalida bo'sh katak turmasligi uchun belgi. */
                        ...(who ? { patientId: who.id } : {}),
                        patientName: patientName || t('payment.walkIn'),
                        name: l.name,
                        unitPrice: l.price,
                        quantity: l.qty,
                        source: 'Service',
                        ...(l.serviceId ? { serviceId: l.serviceId } : {}),
                    } as any);
                    if (!created?.id) throw new Error(t('payment.chargeFailed'));
                    id = String(created.id);
                    createdRef.current[l.key] = id;
                    setCreatedCount(Object.keys(createdRef.current).length);
                }
                ids.push(id);
            }
            if (ids.length === 0) throw new Error(t('payment.chargeFailed'));

            /* 2) Va darhol to'lanadi — kassadagi oddiy to'lov bilan bir xil
                  chaqiruv. Qisman to'lov bu yerda yo'q: odam xizmatni tanlab
                  turib to'lamoqchi, ya'ni summa to'liq. */
            const paid: any = await api.payments.pay({ chargeIds: ids, method, receivedByName } as any);

            /* 3) Oyna YOPILMAYDI — chek shu yerda. Raqam kassa jurnalidagi
                  bilan bir xil ko'rinishda (`ReceiptModal`). */
            const done: PaidReceipt = {
                patientName, lines, total, method,
                number: String(paid?.transaction?.id || ids[0]).slice(0, 6).toUpperCase(),
                at: new Date(),
            };
            rememberServiceUsage(lines.map(l => l.name));
            setReceipt(done);
            /* Xabar yo'q — chek oynasining o'zi tasdiq (xabarlar yig'ilib qolardi) */
            onDone?.();
            /* «Chek chiqarish» sozlamasi yoqilgan klinikada bosish so'ralmaydi */
            if (clinic?.enableReceipts) showReceipt(done);
        } catch (e: any) {
            setError(e?.message || t('payment.failed'));
        } finally { busyRef.current = false; setSaving(false); }
    };

    /* ── To'lov o'tdi: chek ───────────────────────────────────────────────── */
    if (receipt) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title={t('payment.title')} className="max-w-md">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-9 h-9 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-base font-bold text-ink">{t('payment.done')}</p>
                            {receipt.patientName && (
                                <p className="text-sm text-muted truncate">{receipt.patientName}</p>
                            )}
                        </div>
                    </div>

                    <div className="border border-line rounded-xl divide-y divide-line">
                        {receipt.lines.map(l => (
                            <div key={l.key} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="text-sm text-ink flex-1 truncate">{l.name}</span>
                                {l.qty > 1 && <span className="text-xs text-faint">×{l.qty}</span>}
                                <span className="text-sm font-semibold tabular-nums text-ink">{formatMoney(l.price * l.qty)}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-3 px-3 py-3 bg-elevated">
                            <span className="text-sm font-bold text-ink flex-1">
                                {t('payment.total')} · {getPaymentMethodLabel(receipt.method)}
                            </span>
                            <span className="text-lg font-black tabular-nums text-primary">{formatMoney(receipt.total)}</span>
                        </div>
                    </div>

                    <Button onClick={() => showReceipt(receipt)} className="w-full h-12 text-base" autoFocus>
                        <Printer className="w-5 h-5" /> {t('payment.printReceipt')}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" onClick={resetForm}>
                            <Plus className="w-4 h-4" /> {t('payment.another')}
                        </Button>
                        <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
                    </div>
                </div>
            </Modal>
        );
    }

    /* Bitta shart: xizmat tanlangan. Bemor ixtiyoriy. */
    const canSubmit = lines.length > 0;

    return (
        <Modal isOpen={isOpen} onClose={closeIfIdle} title={t('payment.title')} className="max-w-2xl">
            <div className="space-y-4">
                {/* Bemor kartasidan ochilganda — KIMGA to'lanayotgani ko'rinib turadi. */}
                {patient && (
                    <p className="text-sm text-muted">
                        {t('ui.bemor')}: <b className="font-semibold text-ink">{patient.lastName} {patient.firstName}</b>
                    </p>
                )}

                {debt > 0 && target && onPayDebt && !locked && (
                    <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">
                            {t('payment.hasDebt')} <b className="tabular-nums">{formatMoney(debt)} {t('ui.som')}</b>
                        </p>
                        <button type="button" onClick={() => onPayDebt(target)}
                            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">
                            {t('payment.payDebt')}
                        </button>
                    </div>
                )}

                {/* ── Xizmat tanlash ───────────────────────────────────── */}
                <div>
                    <p className="text-xs font-semibold text-muted mb-1.5">{t('payment.service')}</p>
                    <ServiceTiles
                        services={services}
                        quantities={quantities}
                        onAdd={addLine}
                        onRemoveOne={removeOne}
                        disabled={locked || saving}
                    />
                </div>

                {/* ── Tanlangan qatorlar ───────────────────────────────── */}
                {lines.length > 0 && (
                    <div className="border border-line rounded-xl divide-y divide-line">
                        {lines.map(l => (
                            <div key={l.key} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="text-sm text-ink flex-1 truncate">{l.name}</span>
                                {l.qty > 1 && <span className="text-xs text-faint">×{l.qty}</span>}
                                <span className="text-sm font-semibold tabular-nums text-ink">{formatMoney(l.price * l.qty)}</span>
                                <button type="button" onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))}
                                    disabled={locked || saving} aria-label={t('common.delete')}
                                    className="p-1 text-faint hover:text-danger rounded-lg disabled:opacity-40">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── To'lov usuli ─────────────────────────────────────── */}
                <div>
                    <p className="text-xs font-semibold text-muted mb-1.5">{t('advance.method')}</p>
                    <div className="flex flex-wrap gap-2">
                        {/* «Balansdan» YO'Q: balans tushunchasi olib tashlandi. */}
                        {INCOMING_PAYMENT_METHODS.filter(m => m !== 'Balance').map(m => (
                            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
                                className={`px-3.5 h-11 rounded-xl text-sm font-semibold border transition-colors ${method === m
                                    ? 'bg-primary-500/12 text-primary border-primary-500/40'
                                    : 'bg-surface text-muted border-line hover:border-primary-400'}`}>
                                {getPaymentMethodLabel(m)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Bemor: IXTIYORIY, sukut bo'yicha yopiq ───────────────
                    Xizmat va to'lovdan KEYIN turadi: ukolga kelgan odam uchun
                    bu bo'limga umuman tegilmaydi. */}
                {!patient && !showPatient && (
                    <button type="button" onClick={() => setShowPatient(true)} disabled={locked || saving}
                        className="w-full h-11 rounded-xl border border-dashed border-line text-sm font-medium text-muted hover:border-primary-400 hover:text-ink disabled:opacity-40">
                        <UserPlus className="inline w-4 h-4 mr-1.5 -mt-0.5" aria-hidden="true" />
                        {t('payment.addPatient')} <span className="text-faint font-normal">· {t('payment.optional')}</span>
                    </button>
                )}
                {!patient && showPatient && (
                    <div>
                        <div className="flex items-center mb-1.5">
                            <p className="text-xs font-semibold text-muted flex-1">{t('ui.bemor')}</p>
                            {!locked && (
                                <button type="button" disabled={saving}
                                    onClick={() => {
                                        setShowPatient(false); setPicked(null); setIsNewPatient(false);
                                        setDraft(EMPTY_DRAFT); setDuplicates([]); setError('');
                                    }}
                                    className="text-xs font-medium text-primary hover:underline disabled:opacity-40">
                                    {t('payment.noPatient')}
                                </button>
                            )}
                        </div>
                        <QuickPatient
                            enabled={isOpen}
                            picked={picked}
                            onPick={(p) => { setPicked(p); setDuplicates([]); setError(''); }}
                            isNew={isNewPatient}
                            onToggleNew={(v) => { setIsNewPatient(v); setDuplicates([]); setError(''); }}
                            draft={draft}
                            onDraftChange={setDraft}
                            duplicates={duplicates}
                            onForceNew={() => submit(true)}
                            locked={locked}
                            busy={saving}
                        />
                    </div>
                )}

                {/* ── Yakun: jami va tugma — DOIM KO'RINADI ────────────────
                    Xizmatlar ro'yxati uzun: past ekranda (noutbuk, 768 px)
                    «Jami» va tugma oynaning tagida qolib, ularni ko'rish uchun
                    aylantirish kerak edi. Kompyuterga o'rganmagan odam uchun
                    ko'rinmagan tugma — yo'q tugma. Shuning uchun bu qator
                    oynaning pastiga yopishadi; ro'yxat uning ostidan o'tadi. */}
                <div className="sticky -bottom-6 -mx-5 sm:-mx-6 -mb-6 px-5 sm:px-6 py-3 bg-surface border-t border-line">
                    {error && <p role="alert" className="mb-2 text-sm font-medium text-danger">{error}</p>}
                    {locked && error && (
                        <p className="mb-2 text-xs text-muted">{t('payment.retryPaysOnly')}</p>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-muted">{t('payment.total')}</p>
                            <p className={`text-2xl font-black tabular-nums leading-tight ${total > 0 ? 'text-primary' : 'text-faint'}`}>
                                {formatMoney(total)}
                            </p>
                        </div>
                        <Button variant="secondary" onClick={closeIfIdle} disabled={saving}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={() => submit()} disabled={saving || !canSubmit} className="h-12 px-6 text-base">
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                            {t('payment.accept')}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
