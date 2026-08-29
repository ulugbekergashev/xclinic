import React, { useState, useMemo, useEffect } from 'react';
import {
    Banknote, Plus, X, Percent, Undo2, AlertCircle, Check, Loader2,
} from 'lucide-react';
import { Modal, Button, Input, Select } from './Common';
import { VisitCharge } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   BITTA BEMOR — KO'P QATOR — BITTA CHEK.

   MUAMMO. Ilgari kassir bemorning har bir buyurtmasini alohida "To'lash"
   tugmasi bilan, faqat NAQD va faqat TO'LIQ summa bilan yopardi. Real kassada
   esa: bemor 5 qatordan 3 tasini to'laydi, 200 mingni karta bilan, qolganini
   naqd, bitta qatorga chegirma so'raydi (GAP-ANALYSIS, Б4).

   BU OYNA nima qiladi:
     • qatorlarni belgilash — qaysi biri to'lanadi
     • har qatorga alohida summa — qisman to'lov
     • to'lovni usullarga bo'lish — naqd + karta bir chekda
     • chegirma (admin va registrator)
     • qaytarish (FAQAT klinika admini — pul yashikdan chiqadi)

   Server ham shu shartlarni qayta tekshiradi: bu oyna qulaylik, himoya emas.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    patientName: string;
    /** To'lanmagan qatorlar (ota-komponentdan, tirik ro'yxat) */
    charges: VisitCharge[];
    /** Berilsa — oyna bemorning TO'LANGAN qatorlarini ham o'zi yuklaydi.
     *  Ilovada faqat `status: Unpaid` qatorlar keshda turadi, qaytarish uchun
     *  esa to'langanlar kerak. */
    patientId?: string;
    /** Kim ishlayapti — chekka yoziladi */
    receivedByName?: string;
    role?: string;
    onDone?: () => void;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const num = (v: number) => Math.round(v || 0).toLocaleString('uz-UZ').replace(/,/g, ' ');
const remainingOf = (c: VisitCharge) => Math.round((c.total - (c.paidAmount || 0)) * 100) / 100;

export const ChargePaymentModal: React.FC<Props> = ({
    isOpen, onClose, patientName, charges, patientId, receivedByName, role, onDone, addToast,
}) => {
    const canDiscount = role === 'CLINIC_ADMIN' || role === 'RECEPTIONIST';
    const canRefund = role === 'CLINIC_ADMIN';

    // To'langan qatorlar — faqat qaytarish uchun, alohida so'rov bilan
    const [paidRows, setPaidRows] = useState<VisitCharge[]>([]);

    const unpaid = useMemo(
        () => charges.filter(c => c.status === 'Unpaid' && remainingOf(c) > 0),
        [charges],
    );
    const paid = useMemo(
        () => paidRows.filter(c => (c.paidAmount || 0) > 0),
        [paidRows],
    );

    const loadPaid = async () => {
        if (!patientId || !canRefund) return;
        try {
            const all = await api.charges.getAll({ patientId });
            setPaidRows((all || []).filter(c => (c.paidAmount || 0) > 0));
        } catch { /* qaytarish bo'limi ko'rinmaydi, qolgani ishlaydi */ }
    };

    /** Qator id → to'lanadigan summa. Yo'q bo'lsa — belgilanmagan. */
    const [plan, setPlan] = useState<Record<string, string>>({});
    const [splits, setSplits] = useState<{ method: string; amount: string }[]>([{ method: 'Cash', amount: '' }]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState('');
    const [discountFor, setDiscountFor] = useState<VisitCharge | null>(null);
    const [discountVal, setDiscountVal] = useState('');
    const [refundFor, setRefundFor] = useState<VisitCharge | null>(null);
    const [refundVal, setRefundVal] = useState('');
    const [refundReason, setRefundReason] = useState('');

    /* Oyna ochilganda — hamma to'lanmagan qator belgilangan, to'liq summa
       bilan: kassadagi eng ko'p uchraydigan holat shu.

       Imzo (`sig`) qatorlar RO'YXATI yoki SUMMASI o'zgarganda yangilanadi —
       chegirma yoki qaytarishdan keyin oynada eski raqam qolib ketmasin. */
    const sig = unpaid.map(c => `${c.id}:${c.total}:${c.paidAmount || 0}`).join('|');
    useEffect(() => {
        if (!isOpen) return;
        const init: Record<string, string> = {};
        for (const c of unpaid) init[c.id] = String(remainingOf(c));
        setPlan(init);
        setSplits([{ method: 'Cash', amount: '' }]);
        setError('');
        setDiscountFor(null);
        setRefundFor(null);
        loadPaid();
    }, [isOpen, sig]);

    const selectedTotal = useMemo(
        () => Object.values(plan).reduce((sum: number, v) => sum + (Number(v) || 0), 0),
        [plan],
    );
    const selectedCount = Object.values(plan).filter(v => (Number(v) || 0) > 0).length;

    const splitSum = useMemo(
        () => splits.reduce((s, p) => s + (Number(p.amount) || 0), 0),
        [splits],
    );
    const multiMethod = splits.length > 1;
    // Bitta usul bo'lsa summa avtomatik — kassir raqamni ikki marta kiritmasligi kerak
    const splitMismatch = multiMethod && Math.abs(splitSum - selectedTotal) > 0.01;

    const toggle = (c: VisitCharge) => {
        setPlan(p => {
            const next = { ...p };
            if (next[c.id] != null) delete next[c.id];
            else next[c.id] = String(remainingOf(c));
            return next;
        });
    };

    const setAmount = (c: VisitCharge, v: string) => {
        setPlan(p => ({ ...p, [c.id]: v }));
    };

    const submit = async () => {
        setError('');
        const perCharge: Record<string, number> = {};
        for (const [id, v] of Object.entries(plan)) {
            const n = Number(v) || 0;
            if (n > 0) perCharge[id] = n;
        }
        const ids = Object.keys(perCharge);
        if (ids.length === 0) { setError('Qator tanlanmagan'); return; }

        // Qator qarzidan ko'p kiritilmaganini oldindan tekshiramiz —
        // serverga bormasdan, kassir darhol tushunsin
        for (const id of ids) {
            const c = unpaid.find(x => x.id === id);
            if (c && perCharge[id] > remainingOf(c) + 0.001) {
                setError(`"${c.name}" uchun ${num(perCharge[id])} — qarzdan (${num(remainingOf(c))}) ko'p`);
                return;
            }
        }
        if (splitMismatch) {
            setError(`Usullar yig'indisi ${num(splitSum)}, umumiy summa ${num(selectedTotal)}`);
            return;
        }

        setSaving(true);
        try {
            await api.payments.pay({
                chargeIds: ids,
                perCharge,
                receivedByName,
                ...(multiMethod
                    ? { payments: splits.filter(p => (Number(p.amount) || 0) > 0).map(p => ({ method: p.method, amount: Number(p.amount) })) }
                    : { method: splits[0]?.method || 'Cash' }),
            });
            addToast?.('success', `${num(selectedTotal)} so'm qabul qilindi`);
            onDone?.();
            onClose();
        } catch (e: any) {
            setError(e?.message || "To'lov o'tmadi");
        } finally { setSaving(false); }
    };

    const applyDiscount = async () => {
        if (!discountFor) return;
        setBusyId(discountFor.id);
        try {
            await api.payments.discount(discountFor.id, Number(discountVal) || 0);
            addToast?.('success', 'Chegirma qo\'yildi');
            setDiscountFor(null);
            onDone?.();
        } catch (e: any) {
            addToast?.('error', e?.message || 'Chegirma o\'tmadi');
        } finally { setBusyId(''); }
    };

    const applyRefund = async () => {
        if (!refundFor) return;
        setBusyId(refundFor.id);
        try {
            await api.payments.refund(refundFor.id, {
                amount: Number(refundVal) || undefined,
                method: 'Cash',
                reason: refundReason.trim() || undefined,
            });
            addToast?.('success', 'Qaytarildi');
            setRefundFor(null);
            setRefundReason('');
            onDone?.();
            loadPaid();
        } catch (e: any) {
            addToast?.('error', e?.message || 'Qaytarish o\'tmadi');
        } finally { setBusyId(''); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`To'lov — ${patientName}`} className="max-w-2xl">
            <div className="space-y-4">

                {/* ── Qatorlar ─────────────────────────────────────────────── */}
                {unpaid.length === 0 ? (
                    <div className="py-6 text-center">
                        <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">To'lanmagan qator yo'q</p>
                    </div>
                ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
                        {unpaid.map(c => {
                            const on = plan[c.id] != null;
                            return (
                                <div key={c.id} className="p-3 flex items-center gap-3">
                                    <input type="checkbox" checked={on} onChange={() => toggle(c)}
                                        className="w-4 h-4 rounded accent-emerald-600 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                                        <p className="text-[11px] text-gray-400">
                                            {c.quantity > 1 && `${c.quantity} x ${num(c.unitPrice)} · `}
                                            qarz {num(remainingOf(c))}
                                            {(c.discount || 0) > 0 && ` · chegirma ${num(c.discount)}`}
                                            {(c.paidAmount || 0) > 0 && ` · to'langan ${num(c.paidAmount)}`}
                                        </p>
                                    </div>
                                    {canDiscount && (
                                        <button
                                            onClick={() => { setDiscountFor(c); setDiscountVal(String(c.discount || 0)); }}
                                            title="Chegirma"
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 shrink-0">
                                            <Percent className="w-4 h-4" />
                                        </button>
                                    )}
                                    <div className="w-28 shrink-0">
                                        <input type="number" value={plan[c.id] ?? ''} disabled={!on}
                                            onChange={(e) => setAmount(c, e.target.value)}
                                            onFocus={(e) => e.currentTarget.select()}
                                            className="w-full px-2 py-1.5 text-sm text-right tabular-nums border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white disabled:opacity-40" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── To'lov usullari ──────────────────────────────────────── */}
                {unpaid.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                To'lov usuli
                            </h4>
                            {splits.length < 3 && (
                                <button
                                    onClick={() => setSplits(s => [...s, {
                                        method: INCOMING_PAYMENT_METHODS.find(m => !s.some(x => x.method === m)) || 'Card',
                                        // Ikkinchi usul qo'shilganda birinchisiga qolgan summa yozilmaydi:
                                        // kassir ataylab kiritsin, aks holda xato summa jimgina o'tib ketadi
                                        amount: '',
                                    }])}
                                    className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> usul qo'shish
                                </button>
                            )}
                        </div>

                        <div className="space-y-2">
                            {splits.map((p, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Select value={p.method}
                                        onChange={(e) => setSplits(s => s.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}
                                        options={INCOMING_PAYMENT_METHODS.map(m => ({ value: m, label: getPaymentMethodLabel(m) }))}
                                    />
                                    {multiMethod && (
                                        <>
                                            <div className="w-32 shrink-0">
                                                <input type="number" value={p.amount} placeholder="summa"
                                                    onChange={(e) => setSplits(s => s.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                                                    className="w-full h-10 px-2 text-sm text-right tabular-nums border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                            </div>
                                            <button onClick={() => setSplits(s => s.filter((_, j) => j !== i))}
                                                className="p-2 text-gray-400 hover:text-red-600 shrink-0">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        {multiMethod && (
                            <p className={`mt-2 text-xs ${splitMismatch ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400'}`}>
                                Usullar: {num(splitSum)} / {num(selectedTotal)}
                                {splitMismatch && ` — farq ${num(Math.abs(selectedTotal - splitSum))}`}
                            </p>
                        )}
                    </div>
                )}

                {/* ── Yakun ────────────────────────────────────────────────── */}
                {unpaid.length > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-sm text-emerald-900 dark:text-emerald-200">
                            {selectedCount} qator
                        </span>
                        <span className="ml-auto text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                            {num(selectedTotal)} UZS
                        </span>
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                )}

                {/* ── To'langan qatorlar: qaytarish ────────────────────────── */}
                {canRefund && paid.length > 0 && (
                    <details className="border border-gray-200 dark:border-gray-700 rounded-xl">
                        <summary className="p-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 cursor-pointer">
                            To'langanlar ({paid.length}) — qaytarish
                        </summary>
                        <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                            {paid.map(c => (
                                <div key={c.id} className="p-3 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-900 dark:text-white truncate">{c.name}</p>
                                        <p className="text-[11px] text-gray-400">to'langan {num(c.paidAmount)}</p>
                                    </div>
                                    <button onClick={() => { setRefundFor(c); setRefundVal(String(c.paidAmount || 0)); }}
                                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100">
                                        <Undo2 className="w-3.5 h-3.5" /> Qaytarish
                                    </button>
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={onClose}>Bekor</Button>
                    <Button onClick={submit} disabled={saving || selectedTotal <= 0 || splitMismatch}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                        {num(selectedTotal)} qabul qilish
                    </Button>
                </div>
            </div>

            {/* ── Chegirma ───────────────────────────────────────────────── */}
            <Modal isOpen={!!discountFor} onClose={() => setDiscountFor(null)}
                title="Chegirma" className="max-w-sm">
                {discountFor && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {discountFor.name} — narxi <b className="tabular-nums">{num(discountFor.unitPrice * (discountFor.quantity || 1))}</b>
                        </p>
                        <Input type="number" label="Chegirma summasi" value={discountVal}
                            onChange={(e) => setDiscountVal(e.target.value)} autoFocus
                            helperText="Chegirma to'lovdan OLDIN hisobni kamaytiradi" />
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setDiscountFor(null)}>Bekor</Button>
                            <Button onClick={applyDiscount} disabled={busyId === discountFor.id}>Qo'yish</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Qaytarish ──────────────────────────────────────────────── */}
            <Modal isOpen={!!refundFor} onClose={() => setRefundFor(null)}
                title="Pulni qaytarish" className="max-w-sm">
                {refundFor && (
                    <div className="space-y-3">
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 dark:text-amber-200">
                                Yashiqdan naqd chiqadi va kassa kitobiga yoziladi. Amal jurnalda qoladi.
                            </p>
                        </div>
                        <Input type="number" label="Qaytariladigan summa" value={refundVal}
                            onChange={(e) => setRefundVal(e.target.value)} autoFocus
                            helperText={`To'langan: ${num(refundFor.paidAmount)}`} />
                        <Input label="Sabab" value={refundReason} onChange={(e) => setRefundReason(e.target.value)}
                            placeholder="Masalan: xizmat ko'rsatilmadi" />
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setRefundFor(null)}>Bekor</Button>
                            <Button variant="danger" onClick={applyRefund} disabled={busyId === refundFor.id}>
                                Qaytarish
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </Modal>
    );
};
