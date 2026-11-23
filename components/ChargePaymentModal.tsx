import React, { useState, useMemo, useEffect } from 'react';
import {
    Plus, X, Percent, Undo2, AlertCircle, Check, Loader2, CheckCircle, Printer, Wallet,
} from 'lucide-react';
import { Modal, Button, Input } from './Common';
import { VisitCharge } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { api } from '../services/api';
import { fmtDateTime, PrintClinic } from '../utils/printDocument';
import { printReceipt } from '../utils/printReceipt';

import { useLanguage, fill } from '../context/LanguageContext';
/* ─────────────────────────────────────────────────────────────────────────────
   QARZNI TO'LASH — BITTA BEMOR, BITTA CHEK.

   Kassadagi navbat, boshqa kunlardan qolgan qarz va bemor kartasi — hammasi
   shu oynani ochadi.

   2026-11-22 QAYTA (klinika egasi: «oson, tez, qulay — DentaCRM ni ko'r»).
   Ilgari: har qatorga alohida summa katagi (qisman to'lash uchun «200000»
   ni qo'lda qayta yozish), usul — ochiladigan ro'yxat, ko'k tugma va
   to'lovdan keyin chek yo'q. Endi DentaCRM dagi «Qarzni to'lash» kabi:
     · BITTA summa — oldindan to'liq qarz, yonida «Yarmi» / «Hammasi»;
       qatorlarga eskisidan boshlab o'zi taqsimlanadi;
     · ostida natija so'z bilan: «Qarz to'liq yopiladi» / «Qoldiq qarz: X»;
     · usul — katta tugmalar, odatda Naqd; ikkinchi usul «Boshqa usul
       qo'shish» ortida va qolgani birinchi usulga o'zi tushadi;
     · yashil «X so'm qabul qilish»; to'lovdan keyin chek SHU YERDA
       («Chek chiqarish» sozlamasi yoqilgan bo'lsa — o'zi bosiladi).
   Chegirma va qaytarish — faqat egada (server ham shunday, `permissions.ts`).
   Ilgari chegirma tugmasi registratorga ham ko'rinar va bosilsa 403 berardi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    patientName: string;
    /** To'lanmagan qatorlar (ota-komponentdan, tirik ro'yxat) */
    charges: VisitCharge[];
    /** Berilsa — oyna bemorning TO'LANGAN qatorlarini ham o'zi yuklaydi (qaytarish uchun) */
    patientId?: string;
    /** Kim ishlayapti — chekka yoziladi */
    receivedByName?: string;
    role?: string;
    /** Chek shapkasi; `enableReceipts` yoqilgan bo'lsa chek o'zi bosiladi */
    clinic?: (PrintClinic & { enableReceipts?: boolean }) | null;
    onDone?: () => void;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type Split = { method: string; amount: string };
type Paid = { lines: { name: string; amount: number }[]; total: number; methods: { method: string; amount: number }[]; left: number; number: string; at: Date };

const num = (v: number) => Math.round(v || 0).toLocaleString('uz-UZ').replace(/,/g, ' ');
const round2 = (v: number) => Math.round(v * 100) / 100;
const remainingOf = (c: VisitCharge) => round2(c.total - (c.paidAmount || 0));
/** «200 000» → 200000 — kassir bo'sh joy bilan ham yozadi */
const parseSum = (v: string) => Number(String(v).replace(/[^\d.]/g, '')) || 0;
const METHODS = INCOMING_PAYMENT_METHODS.filter(m => m !== 'Balance');

export const ChargePaymentModal: React.FC<Props> = ({
    isOpen, onClose, patientName, charges, patientId, receivedByName, role, clinic, onDone, addToast,
}) => {
    const { t } = useLanguage();
    const canDiscount = role === 'CLINIC_ADMIN';
    const canRefund = role === 'CLINIC_ADMIN';

    // To'langan qatorlar — faqat qaytarish uchun, alohida so'rov bilan
    const [paidRows, setPaidRows] = useState<VisitCharge[]>([]);

    /* Eskisi birinchi: qisman to'lovda avval eski qarz yopiladi */
    const unpaid = useMemo(
        () => charges.filter(c => c.status === 'Unpaid' && remainingOf(c) > 0)
            .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
        [charges],
    );
    const paidList = useMemo(() => paidRows.filter(c => (c.paidAmount || 0) > 0), [paidRows]);

    const loadPaid = async () => {
        if (!patientId || !canRefund) return;
        try {
            const all = await api.charges.getAll({ patientId });
            setPaidRows((all || []).filter(c => (c.paidAmount || 0) > 0));
        } catch { /* qaytarish bo'limi ko'rinmaydi, qolgani ishlaydi */ }
    };

    /** Belgilangan qatorlar (id). Sukut bo'yicha — hammasi. */
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('Cash');
    /** Qo'shimcha usullar — «Boshqa usul qo'shish». Asosiy usulga qolgani tushadi. */
    const [extra, setExtra] = useState<Split[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState<Paid | null>(null);
    const [busyId, setBusyId] = useState('');
    const [discountFor, setDiscountFor] = useState<VisitCharge | null>(null);
    const [discountVal, setDiscountVal] = useState('');
    const [refundFor, setRefundFor] = useState<VisitCharge | null>(null);
    const [refundVal, setRefundVal] = useState('');
    const [refundReason, setRefundReason] = useState('');
    const [refundError, setRefundError] = useState('');

    /* Imzo (`sig`) qatorlar RO'YXATI yoki SUMMASI o'zgarganda yangilanadi —
       chegirma yoki qaytarishdan keyin oynada eski raqam qolib ketmasin. */
    const sig = unpaid.map(c => `${c.id}:${c.total}:${c.paidAmount || 0}`).join('|');
    const pickedTotal = useMemo(
        () => round2(unpaid.filter(c => picked.has(c.id)).reduce((s, c) => s + remainingOf(c), 0)),
        [unpaid, picked],
    );

    useEffect(() => {
        if (!isOpen) { setDone(null); return; }
        const all = new Set(unpaid.map(c => c.id));
        setPicked(all);
        setAmount(String(round2(unpaid.reduce((s, c) => s + remainingOf(c), 0))));
        setMethod('Cash');
        setExtra([]);
        setError('');
        setDiscountFor(null);
        setRefundFor(null);
        loadPaid();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, sig]);

    const toggle = (c: VisitCharge) => {
        const next = new Set(picked);
        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
        setPicked(next);
        /* Summa belgilanganlar jamisiga teng bo'lib turadi */
        setAmount(String(round2(unpaid.filter(x => next.has(x.id)).reduce((s, x) => s + remainingOf(x), 0))));
    };

    const sum = parseSum(amount);
    const extraSum = round2(extra.reduce((s, p) => s + parseSum(p.amount), 0));
    const mainSum = round2(sum - extraSum);
    const left = round2(pickedTotal - sum);
    const over = sum > pickedTotal + 0.001;

    /** Summa belgilangan qatorlarga eskisidan boshlab taqsimlanadi */
    const allocate = (total: number): Record<string, number> => {
        const out: Record<string, number> = {};
        let rest = total;
        for (const c of unpaid) {
            if (!picked.has(c.id) || rest <= 0.001) continue;
            const part = round2(Math.min(rest, remainingOf(c)));
            if (part > 0) out[c.id] = part;
            rest = round2(rest - part);
        }
        return out;
    };

    const submit = async () => {
        setError('');
        if (sum <= 0) { setError(t('cpay.enterAmount')); return; }
        if (over) { setError(fill(t('cpay.over'), num(pickedTotal))); return; }
        if (extra.length && mainSum <= 0) { setError(fill(t('cpay.splitTooBig'), num(sum))); return; }
        const perCharge = allocate(sum);
        const ids = Object.keys(perCharge);
        if (ids.length === 0) { setError(t('chargepaymentmodal.qator_tanlanmagan')); return; }
        const methods = [{ method, amount: mainSum }, ...extra.map(p => ({ method: p.method, amount: parseSum(p.amount) }))]
            .filter(p => p.amount > 0);

        setSaving(true);
        try {
            const res: any = await api.payments.pay({
                chargeIds: ids,
                perCharge,
                receivedByName,
                ...(methods.length > 1 ? { payments: methods } : { method }),
            });
            const paid: Paid = {
                lines: ids.map(id => ({ name: unpaid.find(c => c.id === id)?.name || '', amount: perCharge[id] })),
                total: sum, methods, left: Math.max(0, left),
                number: String(res?.transaction?.id || ids[0]).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase(),
                at: new Date(),
            };
            /* Xabar chiqarilmaydi: chek oynasining o'zi tasdiq. Ilgari har to'lovda
               xabar chiqib, o'ngda yig'ilib, summalar ustunini yopib qo'yardi. */
            onDone?.();
            setDone(paid);
            if (clinic?.enableReceipts) printPaid(paid);
        } catch (e: any) {
            setError(e?.message || t('payment.failed'));
        } finally { setSaving(false); }
    };

    const printPaid = (p: Paid) => {
        const ok = printReceipt({
            title: t('payment.receiptTitle'),
            clinic,
            meta: [
                { label: t('ui.sana'), value: fmtDateTime(p.at) },
                { label: t('receiptmodal.chek_raqami'), value: `#${p.number}` },
                { label: t('ui.bemor'), value: patientName },
                ...(receivedByName ? [{ label: t('payment.cashier'), value: receivedByName }] : []),
            ],
            lines: p.lines.map(l => ({ name: l.name, quantity: 1, total: l.amount })),
            summary: [
                { label: t('payment.total'), value: `${num(p.total)} ${t('ui.som')}`, strong: true },
                ...p.methods.map(m => ({ label: getPaymentMethodLabel(m.method), value: num(m.amount) })),
                ...(p.left > 0 ? [{ label: t('cpay.leftLabel'), value: `${num(p.left)} ${t('ui.som')}` }] : []),
            ],
            footer: t('receiptmodal.thanks'),
        });
        if (!ok) addToast?.('error', t('print.popupBlocked'));
    };

    const applyDiscount = async () => {
        if (!discountFor) return;
        setBusyId(discountFor.id);
        try {
            await api.payments.discount(discountFor.id, Number(discountVal) || 0);
            addToast?.('success', t('chargepaymentmodal.chegirma_qoyildi'));
            setDiscountFor(null);
            onDone?.();
        } catch (e: any) {
            addToast?.('error', e?.message || t('chargepaymentmodal.chegirma_otmadi'));
        } finally { setBusyId(''); }
    };

    const applyRefund = async () => {
        if (!refundFor) return;
        setRefundError('');
        /* SUMMA HAR DOIM ANIQ YUBORILADI. Server summasiz so'rovda TO'LANGAN
           SUMMANING HAMMASINI qaytaradi — «0» yozilsa yashikdan butun pul
           chiqib ketardi. */
        const value = round2(Number(refundVal) || 0);
        const paidAmount = refundFor.paidAmount || 0;
        if (!Number.isFinite(value) || value <= 0 || value > paidAmount + 0.001) {
            setRefundError(fill(t('chargepaymentmodal.refundInvalid'), num(paidAmount)));
            return;
        }
        setBusyId(refundFor.id);
        try {
            await api.payments.refund(refundFor.id, { amount: value, method: 'Cash', reason: refundReason.trim() || undefined });
            addToast?.('success', t('finance.cash.returned'));
            setRefundFor(null);
            setRefundReason('');
            onDone?.();
            loadPaid();
        } catch (e: any) {
            addToast?.('error', e?.message || t('chargepaymentmodal.qaytarish_otmadi'));
        } finally { setBusyId(''); }
    };

    const chip = (on: boolean) => `px-3.5 h-11 rounded-xl text-sm font-semibold border transition-colors ${on
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-surface text-muted border-line hover:border-emerald-500'}`;

    /* ── To'lov o'tdi: chek ─────────────────────────────────────────────── */
    if (done) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title={fill(t('chargepaymentmodal.tolov_x'), patientName)} className="max-w-md">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-9 h-9 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-base font-bold text-ink">{t('payment.done')}</p>
                            <p className="text-sm text-muted">
                                {done.left > 0 ? fill(t('cpay.leftAfter'), num(done.left)) : t('cpay.closedAll')}
                            </p>
                        </div>
                    </div>
                    <div className="border border-line rounded-xl divide-y divide-line">
                        {done.lines.map((l, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="text-sm text-ink flex-1 truncate">{l.name}</span>
                                <span className="text-sm font-semibold tabular-nums text-ink">{num(l.amount)}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-3 px-3 py-3 bg-elevated">
                            <span className="text-sm font-bold text-ink flex-1">
                                {t('payment.total')} · {done.methods.map(m => getPaymentMethodLabel(m.method)).join(' + ')}
                            </span>
                            <span className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">{num(done.total)}</span>
                        </div>
                    </div>
                    <Button onClick={() => printPaid(done)} className="w-full h-12 text-base" autoFocus>
                        <Printer className="w-5 h-5" /> {t('payment.printReceipt')}
                    </Button>
                    <Button variant="secondary" onClick={onClose} className="w-full">{t('common.close')}</Button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={fill(t('chargepaymentmodal.tolov_x'), patientName)} className="max-w-xl">
            <div className="space-y-4">

                {/* ── Nima uchun: qatorlar ─────────────────────────────────── */}
                {unpaid.length === 0 ? (
                    <div className="py-6 text-center">
                        <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-sm text-muted">{t('chargepaymentmodal.tolanmagan_qator_yoq')}</p>
                    </div>
                ) : (
                    <div className="border border-line rounded-xl divide-y divide-line max-h-56 overflow-y-auto">
                        {unpaid.map(c => {
                            const on = picked.has(c.id);
                            return (
                                <label key={c.id} className="p-3 flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={on} onChange={() => toggle(c)}
                                        className="w-4 h-4 rounded accent-emerald-600 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className={`block text-sm font-medium truncate ${on ? 'text-ink' : 'text-faint'}`}>{c.name}</span>
                                        {((c.discount || 0) > 0 || (c.paidAmount || 0) > 0) && (
                                            <span className="block text-[11px] text-faint">
                                                {(c.discount || 0) > 0 && fill(t('chargepaymentmodal.chegirma_x'), num(c.discount))}
                                                {(c.paidAmount || 0) > 0 && fill(t('chargepaymentmodal.tolangan_x'), num(c.paidAmount))}
                                            </span>
                                        )}
                                    </span>
                                    {canDiscount && (
                                        <button type="button"
                                            onClick={(e) => { e.preventDefault(); setDiscountFor(c); setDiscountVal(String(c.discount || 0)); }}
                                            title={t('finance.table.discount')} aria-label={`${t('finance.table.discount')}: ${c.name}`}
                                            className="p-1.5 rounded-lg text-faint hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 shrink-0">
                                            <Percent className="w-4 h-4" />
                                        </button>
                                    )}
                                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${on ? 'text-ink' : 'text-faint'}`}>{num(remainingOf(c))}</span>
                                </label>
                            );
                        })}
                    </div>
                )}

                {unpaid.length > 0 && (
                    <>
                        {/* ── Qancha: bitta summa ─────────────────────────────── */}
                        <div>
                            <label htmlFor="cpay-amount" className="block text-xs font-semibold text-muted mb-1.5">{t('cpay.amountLabel')}</label>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Raqam bo'sh joy bilan ko'rinadi: «145 000», «145000» emas */}
                                <input id="cpay-amount" inputMode="numeric" value={amount ? num(parseSum(amount)) : ''}
                                    onChange={e => { setAmount(e.target.value.replace(/\D/g, '')); setError(''); }}
                                    onFocus={e => e.currentTarget.select()}
                                    className="w-44 h-12 px-3 text-xl font-black text-right tabular-nums border border-line rounded-xl bg-surface text-ink focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                                <button type="button" onClick={() => setAmount(String(Math.round(pickedTotal / 2)))} className={chip(false)}>{t('cpay.half')}</button>
                                <button type="button" onClick={() => setAmount(String(pickedTotal))} className={chip(false)}>{t('cpay.all')}</button>
                            </div>
                            {/* Natija so'z bilan — kassir nima bo'lishini oldindan ko'radi */}
                            <p className={`mt-1.5 text-sm font-semibold ${over ? 'text-red-600 dark:text-red-400' : left > 0.001 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                                {over ? fill(t('cpay.over'), num(pickedTotal))
                                    : left > 0.001 ? fill(t('cpay.leftAfter'), num(left))
                                        : t('cpay.closedAll')}
                            </p>
                        </div>

                        {/* ── Qanday: usul ────────────────────────────────────── */}
                        <div>
                            <p className="text-xs font-semibold text-muted mb-1.5">{t('advance.method')}</p>
                            <div role="group" aria-label={t('advance.method')} className="flex flex-wrap gap-2">
                                {METHODS.map(m => (
                                    <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className={chip(method === m)}>
                                        {getPaymentMethodLabel(m)}
                                    </button>
                                ))}
                            </div>
                            {extra.map((p, i) => (
                                <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                                    <select value={p.method} aria-label={t('advance.method')}
                                        onChange={e => setExtra(s => s.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}
                                        className="h-10 px-2 rounded-xl border border-line bg-surface text-sm text-ink">
                                        {METHODS.filter(m => m !== method).map(m => <option key={m} value={m}>{getPaymentMethodLabel(m)}</option>)}
                                    </select>
                                    <input inputMode="numeric" value={p.amount} placeholder={t('chargepaymentmodal.summa')} aria-label={t('chargepaymentmodal.summa')}
                                        onChange={e => setExtra(s => s.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                                        className="w-36 h-10 px-2 text-sm text-right tabular-nums border border-line rounded-xl bg-surface text-ink" />
                                    <button type="button" onClick={() => setExtra(s => s.filter((_, j) => j !== i))} aria-label={t('common.delete')}
                                        className="p-2 text-faint hover:text-red-600"><X className="w-4 h-4" /></button>
                                </div>
                            ))}
                            {extra.length > 0 && (
                                <p className={`mt-1.5 text-xs ${mainSum > 0 ? 'text-muted' : 'text-red-600 dark:text-red-400 font-semibold'}`}>
                                    {fill(t('cpay.mainGets'), getPaymentMethodLabel(method), num(Math.max(0, mainSum)))}
                                </p>
                            )}
                            {extra.length < 2 && (
                                <button type="button"
                                    onClick={() => setExtra(s => [...s, { method: METHODS.find(m => m !== method && !s.some(x => x.method === m)) || 'Card', amount: '' }])}
                                    className="mt-2 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> {t('cpay.addMethod')}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {error && (
                    <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                )}

                {/* ── To'langan qatorlar: qaytarish (faqat ega) ────────────── */}
                {canRefund && paidList.length > 0 && (
                    <details className="border border-line rounded-xl">
                        <summary className="p-3 text-xs font-bold uppercase tracking-wide text-muted cursor-pointer">
                            {fill(t('cpay.paidList'), paidList.length)}
                        </summary>
                        <div className="border-t border-line divide-y divide-line">
                            {paidList.map(c => (
                                <div key={c.id} className="p-3 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-ink truncate">{c.name}</p>
                                        <p className="text-[11px] text-faint">{t('visit.paidShort')} {num(c.paidAmount)}</p>
                                    </div>
                                    <button type="button" onClick={() => { setRefundFor(c); setRefundVal(String(c.paidAmount || 0)); setRefundError(''); }}
                                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100">
                                        <Undo2 className="w-3.5 h-3.5" /> {t('finance.cash.refund')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    {unpaid.length > 0 && (
                        <button type="button" onClick={submit} disabled={saving || sum <= 0 || over}
                            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold disabled:opacity-50">
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                            {fill(t('cpay.accept'), num(sum))}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Chegirma ───────────────────────────────────────────────── */}
            <Modal isOpen={!!discountFor} onClose={() => setDiscountFor(null)}
                title={t('finance.table.discount')} className="max-w-sm">
                {discountFor && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted">
                            {discountFor.name} — {t('chargepaymentmodal.narxi')} <b className="tabular-nums">{num(discountFor.unitPrice * (discountFor.quantity || 1))}</b>
                        </p>
                        <Input type="number" label={t('chargepaymentmodal.chegirma_summasi')} value={discountVal}
                            onChange={(e) => setDiscountVal(e.target.value)} autoFocus
                            helperText={t('chargepaymentmodal.chegirma_tolovdan_oldin_hisobni')} />
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setDiscountFor(null)}>{t('common.cancel')}</Button>
                            <Button onClick={applyDiscount} disabled={busyId === discountFor.id}>{t('chargepaymentmodal.qoyish')}</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Qaytarish ──────────────────────────────────────────────── */}
            <Modal isOpen={!!refundFor} onClose={() => setRefundFor(null)}
                title={t('chargepaymentmodal.pulni_qaytarish')} className="max-w-sm">
                {refundFor && (
                    <div className="space-y-3">
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 dark:text-amber-200">{t('chargepaymentmodal.yashiqdan_naqd_chiqadi_va')}</p>
                        </div>
                        <Input type="number" label={t('chargepaymentmodal.qaytariladigan_summa')} value={refundVal}
                            onChange={(e) => { setRefundVal(e.target.value); setRefundError(''); }} autoFocus
                            min={0} max={refundFor.paidAmount || 0}
                            error={refundError || undefined}
                            helperText={fill(t('chargepaymentmodal.tolangan_x_2'), num(refundFor.paidAmount))} />
                        <Input label={t('chargepaymentmodal.sabab')} value={refundReason} onChange={(e) => setRefundReason(e.target.value)}
                            placeholder={t('chargepaymentmodal.masalan_xizmat_korsatilmadi')} />
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setRefundFor(null)}>{t('common.cancel')}</Button>
                            <Button variant="danger" onClick={applyRefund} disabled={busyId === refundFor.id}>
                                {t('finance.cash.refund')}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </Modal>
    );
};
