import React, { useRef, useState } from 'react';
import { Wallet, Plus, Printer, X, Loader2, FileText } from 'lucide-react';
import { Admission } from '../types';
import { api } from '../services/api';
import { useLanguage, fill, tr, TranslationKey } from '../context/LanguageContext';
import { formatDate, formatMoney, formatNumber } from '../utils/format';
import { fmtDateTime, PrintClinic } from '../utils/printDocument';
import { printReceipt, printReceiptA4, receiptA4Labels, mergeReceiptLines, ReceiptLine } from '../utils/printReceipt';

/* ─────────────────────────────────────────────────────────────────────────────
   YOTISH HISOBI — yozilgan, to'langan, qarz; qo'lda qator; hisob cheki.

   Statsionar to'lovi tartibi yo'q edi: depozit, oraliq hisob, chiqarishda
   yakuniy hisob — hech narsa. Depozit alohida sxema emas: u avans
   (`Patient.balance`), qaror В7. Bu blok ilgari `pages/Inpatient.tsx`
   ichida turardi va faqat UCH RAQAMNI ko'rsatardi.

   KLINIKA SO'RAGANI (ikki narsa yetishmasdi):

     1. «Berilgan dorilar summasini kiritish». Hisobga qator faqat dori
        varag'i orqali tushardi — u tayinlov, ombor partiyasi va narxni
        talab qiladi. Endi shu yerda: nima (dori / muolaja / boshqa) va
        qancha. Ombordan hech narsa yechilmaydi.

     2. «Ketayotgan kuni shu summalarni chek qilib chiqarish». Chiqarishda
        faqat epikriz bosilardi — unda pul yo'q. «Hisob cheki» hamma qatorni
        lentaga chiqaradi: nima uchun, qancha, to'langani va qolgani.

   PUL BU YERDA OLINMAYDI — bu blok hisobni yuritadi. Pul chiqarish oynasida
   olinadi (`DischargeBill`): klinika summani aynan bemorni chiqarayotganda
   ko'rishni kutadi. Kassadagi yagona oyna ham ishlayveradi.
   ───────────────────────────────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<string, string> = {
    Bed: tr('inp.bed'), Medication: tr('inpatient.dorilar'), Service: tr('inpatient.xizmatlar'),
    Lab: tr('inpatient.tahlillar'), Study: tr('patienthistorypanel.tekshiruvlar'), Other: tr('inpatient.boshqa'),
};

type ManualKind = 'Medication' | 'Service' | 'Other';
const KINDS: ManualKind[] = ['Medication', 'Service', 'Other'];

export type AdmissionBilling = {
    accrued: number;
    paid: number;
    due: number;
    advance: number;
    bySource: Record<string, { count: number; total: number; paid: number }>;
    charges: any[];
};

type Props = {
    admission: Admission;
    billing: AdmissionBilling;
    /** Karta ochilganda quvib yetgan koyka kunlari */
    bedDays?: { charged: number; total: number } | null;
    clinic?: PrintClinic | null;
    /** Qator qo'shish — laborantga berilmaydi (serverda ham yopiq) */
    canAdd: boolean;
    /** Qatorni olib tashlash — hamshiraga berilmaydi (serverda ham yopiq) */
    canRemove: boolean;
    /** Hisob o'zgardi — ota-komponent uni qayta yuklaydi */
    onChanged: () => Promise<void> | void;
};

const paidOf = (c: any): number => Number(c.paidAmount ?? c.paid ?? 0);
/** Qo'lda yozilgan va puli olinmagan qatorgina olib tashlanadi: koyka va
 *  dori varag'i qatorlari o'z manbasiga bog'langan (`sourceId`). */
const isRemovable = (c: any): boolean => !c.sourceId && c.status === 'Unpaid' && paidOf(c) <= 0;

/** Chek qatorlari: koyka kunlari bitta satrga, qolgani nomi bo'yicha yig'iladi */
export function receiptLines(charges: any[], bedLabel: string): ReceiptLine[] {
    const beds = charges.filter(c => c.source === 'Bed');
    const rest = charges.filter(c => c.source !== 'Bed');
    const bedLine: ReceiptLine[] = beds.length
        ? [{ name: bedLabel, quantity: beds.length, total: beds.reduce((s, c) => s + (c.total || 0), 0) }]
        : [];
    return [
        ...bedLine,
        ...mergeReceiptLines(rest.map(c => ({ name: c.name, quantity: c.quantity || 1, total: c.total || 0 }))),
    ];
}

/** «Hisob cheki» — yotish hisobining hamma qatori, jami, to'langani va qolgani.
 *  Ikki joydan bosiladi: yotish kartasidan va chiqarish oynasidan
 *  (`DischargeBill`). `false` — brauzer bosma oynani ochmadi.
 *  `a4` — o'sha hisob A4 varaqda: sug'urta va ishxona shuni so'raydi. */
export function printAdmissionBill(
    admission: Admission, billing: AdmissionBilling,
    clinic: PrintClinic | null | undefined, t: (key: TranslationKey) => string,
    a4 = false,
): boolean {
    const data = {
        title: t('inp.bill.title'),
        clinic,
        meta: [
            { label: t('ui.sana'), value: fmtDateTime(new Date()) },
            { label: t('ui.bemor'), value: admission.patientName },
            {
                label: t('inp.bill.stay'),
                value: `${formatDate(admission.admittedAt)} — ${formatDate(admission.dischargedAt || new Date().toISOString())}`,
            },
        ],
        lines: receiptLines(billing.charges || [], t('inp.bed')),
        summary: [
            { label: t('payment.total'), value: `${formatMoney(billing.accrued)} ${t('ui.som')}`, strong: true },
            { label: t('ui.tolangan'), value: `${formatMoney(billing.paid)} ${t('ui.som')}` },
            { label: t('inp.bill.due'), value: `${formatMoney(billing.due)} ${t('ui.som')}`, strong: true },
        ],
    };
    return a4 ? printReceiptA4(data, receiptA4Labels(t)) : printReceipt(data);
}

export function AdmissionBill({ admission, billing, bedDays, clinic, canAdd, canRemove, onChanged }: Props) {
    const { t } = useLanguage();
    const isActive = admission.status === 'Active';
    const canAddNow = isActive && canAdd;

    const [isAdding, setIsAdding] = useState(false);
    const [kind, setKind] = useState<ManualKind>('Medication');
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    /* Enter ni ikki marta bosish (yoki bosib turish) ikkita qator yozmasin.
       `busy` holati keyingi renderda yangilanadi — `useRef` darhol. */
    const busyRef = useRef(false);

    /** Hisobni qayta yuklash. Yiqilsa — ANIQ aytiladi: qator yozilgan, faqat
     *  ekran eski. Aks holda odam «saqlanmadi» deb o'ylab, qayta kiritardi. */
    const refresh = async () => {
        try { await onChanged(); }
        catch { setError(t('inp.bill.staleView')); }
    };

    const kindLabel: Record<ManualKind, string> = {
        Medication: t('inpatient.dorilar'), Service: t('inp.bill.kindProc'), Other: t('inpatient.boshqa'),
    };
    const sum = Math.round(Number(amount) || 0);

    const addCharge = async () => {
        setError('');
        /* Dori va muolajada nom yozish shart emas — tur nomining o'zi yetadi.
           «Boshqa» esa chekda hech narsa aytmaydi, shuning uchun nom so'raladi. */
        const finalName = name.trim() || (kind === 'Other' ? '' : kindLabel[kind]);
        if (!finalName || sum <= 0) { setError(t('inp.bill.invalid')); return; }
        if (busyRef.current) return;

        busyRef.current = true;
        setBusy('add');
        try {
            await api.admissions.addCharge(admission.id, { name: finalName, amount: sum, source: kind });
            setName(''); setAmount(''); setIsAdding(false);
            await refresh();
        } catch (e: any) {
            setError(e?.message || t('ui.saqlanmadi'));
        } finally { busyRef.current = false; setBusy(''); }
    };

    const removeCharge = async (id: string) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setError(''); setBusy(id);
        try {
            await api.charges.cancel(id);
            await refresh();
        } catch (e: any) {
            setError(e?.message || t('ui.xatolik'));
        } finally { busyRef.current = false; setBusy(''); }
    };

    const printBill = (a4 = false) => {
        if (!printAdmissionBill(admission, billing, clinic, t, a4)) setError(t('print.popupBlocked'));
    };

    const charges = billing.charges || [];

    return (
        <div className="p-3 rounded-lg bg-canvas/40 border border-line">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="flex items-center gap-1.5 text-sm text-muted">
                    <Wallet className="w-4 h-4 text-faint" />
                    {t('inpatient.yozilgan')} <b className="tabular-nums">{formatNumber(billing.accrued)}</b>
                </span>
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                    {t('inpatient.tolangan')} <b className="tabular-nums">{formatNumber(billing.paid)}</b>
                </span>
                <span className={`text-sm ${billing.due > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-faint'}`}>
                    {t('inpatient.qarz')} <b className="tabular-nums">{formatNumber(billing.due)}</b>
                </span>
                {billing.advance > 0 && (
                    <span className="text-sm text-primary-600 dark:text-primary-400">
                        Avansda: <b className="tabular-nums">{formatNumber(billing.advance)}</b>
                    </span>
                )}
                {isActive && admission.dailyRate > 0 && (
                    <span className="text-xs text-faint ml-auto">
                        {t('inpatient.koyka')} {formatNumber(admission.dailyRate)}/kun
                        {bedDays && bedDays.charged > 0 ? fill(t('inpatient.x_kun_yozildi'), bedDays.charged) : ''}
                    </span>
                )}
            </div>

            {/* Nima uchun bunday summa: koyka, dori, xizmat */}
            {Object.keys(billing.bySource || {}).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-line">
                    {Object.entries(billing.bySource).map(([src, v]) => (
                        <span key={src} className="text-[11px] text-muted">
                            {SOURCE_LABEL[src] || src}: <b className="tabular-nums">{formatNumber(v.total)}</b>
                            {v.paid > 0 && v.paid < v.total ? fill(t('inpatient.tolandi_x'), formatNumber(v.paid)) : ''}
                            {v.count > 1 ? fill(t('inpatient.x_ta'), v.count) : ''}
                        </span>
                    ))}
                </div>
            )}

            {billing.due > 0 && billing.advance > 0 && (
                <p className="text-[11px] text-primary-700 dark:text-primary-300 mt-2">
                    {t('inpatient.bemorning_avansi_bor_kassada')}
                </p>
            )}

            {/* ── Amallar: qator qo'shish va chek ─────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
                {canAddNow && !isAdding && (
                    <button type="button" onClick={() => { setIsAdding(true); setError(''); }}
                        className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700">
                        <Plus className="w-4 h-4" /> {t('inp.bill.add')}
                    </button>
                )}
                {charges.length > 0 && (
                    <>
                        <button type="button" onClick={() => printBill()}
                            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:border-primary-400">
                            <Printer className="w-4 h-4" /> {t('inp.bill.print')}
                        </button>
                        <button type="button" onClick={() => printBill(true)} title={t('print.a4Title')}
                            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:border-primary-400">
                            <FileText className="w-4 h-4" /> {t('print.a4')}
                        </button>
                    </>
                )}
            </div>

            {canAddNow && isAdding && (
                <div className="mt-3 p-3 rounded-lg border border-primary-500/30 bg-primary-500/5 space-y-2.5">
                    <div role="group" aria-label={t('inp.bill.add')} className="flex flex-wrap gap-1.5">
                        {KINDS.map(k => (
                            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                                className={`h-10 px-3.5 rounded-lg border text-sm font-semibold transition-colors ${kind === k
                                    ? 'border-primary-600 bg-primary-600 text-white'
                                    : 'border-line bg-surface text-muted hover:border-primary-400'}`}>
                                {kindLabel[k]}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-2">
                        <input value={name} onChange={e => setName(e.target.value)} maxLength={200}
                            placeholder={kind === 'Other' ? t('ui.nomi') : fill(t('inp.bill.namePh'), kindLabel[kind])}
                            aria-label={t('ui.nomi')}
                            className="w-full h-11 px-3 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-faint" />
                        <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                            inputMode="numeric" autoFocus maxLength={11} placeholder={t('ui.summa')} aria-label={t('ui.summa')}
                            onKeyDown={e => { if (e.key === 'Enter') addCharge(); }}
                            className="w-full h-11 px-3 rounded-lg border border-line bg-surface text-base font-semibold text-right tabular-nums text-ink placeholder:text-faint placeholder:font-normal" />
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={addCharge} disabled={busy === 'add'}
                            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50">
                            {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            {t('common.add')}
                        </button>
                        <button type="button" onClick={() => { setIsAdding(false); setError(''); }}
                            className="h-10 px-3 rounded-lg text-sm font-medium text-muted hover:bg-elevated">
                            {t('common.cancel')}
                        </button>
                        {/* Terilgan raqam bo'shliqlar bilan: «1500000» bilan «150000» ni
                            ko'z ajratmaydi, «1 500 000» ni ajratadi. */}
                        {sum > 0 && (
                            <span className="ml-auto text-sm font-bold tabular-nums text-ink">
                                {formatMoney(sum)} {t('ui.som')}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {error && <p role="alert" className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

            {/* ── Qatorlar: chekda nima chiqishi oldindan ko'rinadi ───────── */}
            {charges.length > 0 && (
                <details className="mt-3 border-t border-line pt-2">
                    <summary className="text-xs font-semibold text-muted cursor-pointer">
                        {fill(t('inp.bill.items'), charges.length)}
                    </summary>
                    <ul className="mt-2 divide-y divide-line">
                        {charges.map(c => (
                            <li key={c.id} className="flex items-center gap-3 py-1.5">
                                <span className="min-w-0 flex-1 text-sm text-ink truncate">
                                    {c.name}
                                    {c.createdAt && <span className="ml-2 text-[11px] text-faint">{formatDate(c.createdAt)}</span>}
                                </span>
                                {paidOf(c) >= (c.total || 0) && (c.total || 0) > 0 && (
                                    <span className="shrink-0 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                                        {t('ui.tolangan')}
                                    </span>
                                )}
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatNumber(c.total)}</span>
                                {canRemove && isActive && isRemovable(c) && (
                                    <button type="button" onClick={() => removeCharge(c.id)} disabled={busy === c.id}
                                        aria-label={t('inp.bill.remove')} title={t('inp.bill.remove')}
                                        className="shrink-0 p-1 rounded text-faint hover:text-red-600 disabled:opacity-40">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
