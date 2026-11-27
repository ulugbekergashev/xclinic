import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, Printer, Wallet, FileText } from 'lucide-react';
import { Admission, VisitCharge } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatMoney } from '../utils/format';
import { PrintClinic } from '../utils/printDocument';
import { AdmissionBilling, printAdmissionBill, receiptLines } from './AdmissionBill';
import { ChargePaymentModal } from './ChargePaymentModal';

/* ─────────────────────────────────────────────────────────────────────────────
   CHIQARISHDAGI HISOB — summa, to'lov va chek bemor chiqarilayotgan oynada.

   KLINIKA AYTGANI: «Bemorni chiqarganimda ham to'lov summasi chiqmayapti».

   Sabab: «Chiqarish» oynasi faqat epikrizni so'rardi — to'rtta matn maydoni,
   pul haqida bir so'z yo'q. Hisob yotish kartasining ichida, alohida blokda
   turardi, pul esa «Kassa» bo'limida olinardi. Ya'ni bemor ketayotgan
   paytda kerak bo'lgan uch narsa — qancha, to'lash, chek — uch joyda edi.

   ENDI shu oynaning tepasida:
     · TO'LASH KERAK — yirik raqam; ostida nima uchun (qatorlar);
     · to'lov usuli va «To'lovni qabul qilish» — kassaga o'tmasdan;
     · «Hisob cheki».

   Pul yo'li yangi EMAS: o'sha `POST /api/payments`, yotishning to'lanmagan
   qatorlari bilan. Kassir bo'lmagan rol (shifokor) to'lovni ololmaydi —
   server ham 403 beradi — unga summa va chek ko'rsatiladi.

   TO'LOV OYNASI — KASSADAGI BILAN BITTA (2026-11-23, Moliya rejasi 9).
   Ilgari bu yerda o'zining usul tugmalari va «hammasini to'lash» turardi:
   qisman to'lov, ikki usul (naqd + karta), chegirma va to'lov cheki
   yo'q edi. Statsionar — klinikaning eng katta hisobi, va aynan shu yerda
   «yarmini hozir, qolganini ertaga» eng ko'p kerak bo'ladi. Endi tugma
   `ChargePaymentModal` ni ochadi — Kassa va bemor kartasidagi o'sha oyna.
   ───────────────────────────────────────────────────────────────────────────── */

type Props = {
    admission: Admission;
    clinic?: (PrintClinic & { enableReceipts?: boolean }) | null;
    /** To'lov qabul qila oladigan rol (`POST /api/payments`: ega va registrator) */
    canPay: boolean;
    receivedByName?: string;
    /** Chegirma va qaytarish to'lov oynasida faqat egaga */
    role?: string;
    /** To'lov o'tdi — ochiq turgan yotish kartasi hisobni yangilasin */
    onPaid?: () => void;
};

const dueOf = (c: any): number => Math.max(0, (c.total || 0) - Number(c.paidAmount ?? 0));

export function DischargeBill({ admission, clinic, canPay, receivedByName, role, onPaid }: Props) {
    const { t } = useLanguage();
    const [billing, setBilling] = useState<AdmissionBilling | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [payOpen, setPayOpen] = useState(false);
    const [justPaid, setJustPaid] = useState(0);

    useEffect(() => {
        let isCurrent = true;
        (async () => {
            setIsLoading(true); setError('');
            /* Avval koyka haqi quvib yetadi — bugungi kun ham summaga kirsin.
               Shifokorda bunga ruxsat yo'q (403): u holda bor hisob ko'rsatiladi,
               chiqarishning o'zi koykani baribir hisoblaydi. */
            await api.admissions.chargeBedDays(admission.id).catch(() => null);
            try {
                const fresh = await api.admissions.billing(admission.id);
                if (isCurrent) setBilling(fresh as AdmissionBilling);
            } catch (e: any) {
                if (isCurrent) setError(e?.message || t('inp.dis.loadFailed'));
            } finally {
                if (isCurrent) setIsLoading(false);
            }
        })();
        return () => { isCurrent = false; };
    }, [admission.id]);

    const print = (b: AdmissionBilling, a4 = false) => {
        if (!printAdmissionBill(admission, b, clinic, t, a4)) setError(t('print.popupBlocked'));
    };

    /* To'lov oynasidan keyin: hisob qayta o'qiladi. «Qabul qilindi» —
       TO'LANGAN summaning o'sishi, qarzning kamayishi emas: chegirma ham
       qarzni kamaytiradi, lekin pul olinmagan; qaytarishdan keyin summa
       kamayadi. Taqqoslash oxirgi o'qilgan hisob bilan (ref) — ketma-ket
       chaqiruvlar bir xil eski qiymatdan ikki marta sanamasin. */
    const lastPaidRef = useRef<number | null>(null);
    useEffect(() => {
        if (billing && lastPaidRef.current == null) lastPaidRef.current = billing.paid || 0;
    }, [billing]);
    const reload = async () => {
        try {
            const fresh = await api.admissions.billing(admission.id) as AdmissionBilling;
            const before = lastPaidRef.current ?? 0;
            lastPaidRef.current = fresh.paid || 0;
            setBilling(fresh);
            const diff = Math.round((fresh.paid || 0) - before);
            if (diff !== 0) setJustPaid(p => Math.max(0, p + diff));
            onPaid?.();
        } catch (e: any) {
            setError(e?.message || t('inp.dis.loadFailed'));
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 p-4 rounded-xl border border-line bg-elevated text-sm text-muted">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('inp.dis.loading')}
            </div>
        );
    }
    if (!billing) {
        return <p role="alert" className="p-4 rounded-xl border border-line text-sm font-medium text-danger">{error || t('inp.dis.loadFailed')}</p>;
    }

    const lines = receiptLines(billing.charges || [], t('inp.bed'));
    const hasDue = billing.due > 0;

    return (
        <section aria-label={t('inp.bill.title')} className="rounded-xl border border-line overflow-hidden">
            {/* ── Asosiy raqam: QANCHA TO'LASH KERAK ─────────────────────── */}
            <div className={`flex flex-wrap items-end gap-x-6 gap-y-2 p-4 ${hasDue ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted">{t('inp.bill.due')}</p>
                    <p className={`text-3xl font-black tabular-nums leading-tight ${hasDue ? 'text-ink' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatMoney(billing.due)} <span className="text-base font-bold">{t('ui.som')}</span>
                    </p>
                </div>
                <p className="text-sm text-muted tabular-nums">
                    {t('payment.total')}: <b className="text-ink">{formatMoney(billing.accrued)}</b>
                    {' · '}{t('ui.tolangan')}: <b className="text-ink">{formatMoney(billing.paid)}</b>
                </p>
            </div>

            {/* ── Nima uchun: chekda chiqadigan qatorlar ─────────────────── */}
            {lines.length > 0 ? (
                <ul className="divide-y divide-line max-h-40 overflow-y-auto">
                    {lines.map(l => (
                        <li key={l.name} className="flex items-center gap-3 px-4 py-2">
                            <span className="min-w-0 flex-1 text-sm text-ink truncate">{l.name}</span>
                            {(l.quantity || 1) > 1 && <span className="text-xs text-faint">×{l.quantity}</span>}
                            <span className="text-sm font-semibold tabular-nums text-ink">{formatMoney(l.total)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="px-4 py-3 text-sm text-muted">{t('inp.dis.noCharges')}</p>
            )}

            {/* ── To'lov va chek ─────────────────────────────────────────── */}
            <div className="p-4 border-t border-line space-y-3">
                {justPaid > 0 && (
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="w-5 h-5" /> {formatMoney(justPaid)} {t('payment.accepted')}
                    </p>
                )}

                {hasDue && !canPay && (
                    <p className="text-sm text-muted">{t('inp.dis.atCashier')}</p>
                )}

                <div className="flex flex-wrap gap-2">
                    {hasDue && canPay && (
                        <button type="button" onClick={() => { setError(''); setPayOpen(true); }}
                            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
                            <Wallet className="w-4 h-4" />
                            {t('payment.accept')}
                        </button>
                    )}
                    {lines.length > 0 && (
                        <button type="button" onClick={() => print(billing)}
                            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-line bg-surface text-sm font-semibold text-ink hover:border-primary-400 disabled:opacity-50">
                            <Printer className="w-4 h-4" /> {t('inp.bill.print')}
                        </button>
                    )}
                    {lines.length > 0 && (
                        <button type="button" onClick={() => print(billing, true)} title={t('print.a4Title')}
                            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-line bg-surface text-sm font-semibold text-ink hover:border-primary-400">
                            <FileText className="w-4 h-4" /> {t('print.a4')}
                        </button>
                    )}
                </div>

                {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
            </div>

            {canPay && (
                <ChargePaymentModal
                    isOpen={payOpen}
                    onClose={() => setPayOpen(false)}
                    patientName={admission.patientName}
                    charges={(billing.charges || []).filter(c => c.status === 'Unpaid' && dueOf(c) > 0) as unknown as VisitCharge[]}
                    receivedByName={receivedByName}
                    role={role}
                    clinic={clinic}
                    onDone={reload}
                />
            )}
        </section>
    );
}
