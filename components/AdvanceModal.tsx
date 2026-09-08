import React, { useState, useEffect } from 'react';
import { Wallet, Loader2, Search, X } from 'lucide-react';
import { Modal, Button, Input } from './Common';
import { Patient } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatMoney } from '../utils/format';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { usePatientSearch } from '../hooks/usePatientSearch';
import { formatUzPhone } from '../shared/validation';

/* ─────────────────────────────────────────────────────────────────────────────
   AVANS TO'LDIRISH — YAGONA OYNA.

   Ilgari avans ikki joydan, ikki xil yo'l bilan kiritilardi: bemor
   kartasidagi katta to'lov oynasi (`service: 'Avans'` bilan) va kassadagi
   «To'lov» oynasi. Ikkalasi ham `POST /api/transactions` ga yozardi, ya'ni
   chekni yaratib, balansni ALOHIDA so'rov bilan oshirardi.

   Bu xizmat uchun to'lov EMAS: hisob qatori yo'q, shifokor ulushi ham yo'q.
   Pul bemor hisobida turadi va keyin qatorlarni to'lashda «Avansdan» usuli
   bilan sarflanadi.

   Xizmat uchun to'lov `ChargePaymentModal` da — u qatorlarni ko'radi va
   ulushni to'g'ri taqsimlaydi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Bemor oldindan ma'lum bo'lsa (bemor kartasi). `null` — oynaning
     *  o'zi qidirib topadi (kassa). */
    patient: Patient | null;
    receivedByName?: string;
    /** Balans o'zgardi — ota komponent bemorni qayta o'qiydi */
    onDone?: (newBalance: number) => void;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const AdvanceModal: React.FC<Props> = ({
    isOpen, onClose, patient, receivedByName, onDone, addToast,
}) => {
    const { t } = useLanguage();
    /* Bemor tanlash. Kassadan ochilganda oyna o'zi qidiradi — qidiruv
       SERVERDA (`usePatientSearch`), ya'ni karta raqami va JSHSHIR
       bo'yicha ham topiladi. */
    const [picked, setPicked] = useState<Patient | null>(null);
    const [search, setSearch] = useState('');
    const { results, loading: searching } = usePatientSearch(search, { enabled: isOpen && !patient });
    const target = patient || picked;

    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('Cash');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    /* Oyna yopilganda tanlov ham tozalanadi: keyingi safar boshqa
       bemorning qoldig'i ko'rinib qolmasin. */
    useEffect(() => { if (!isOpen) { setPicked(null); setSearch(''); } }, [isOpen]);

    const close = () => {
        setAmount(''); setMethod('Cash'); setNote(''); setError('');
        setPicked(null); setSearch('');
        onClose();
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!target) return;
        const sum = Number(String(amount).replace(/\s/g, ''));
        if (!(sum > 0)) { setError(t('advance.badAmount')); return; }

        setSaving(true); setError('');
        try {
            const r = await api.payments.advance({
                patientId: target.id, amount: sum, method,
                receivedByName, note: note.trim() || undefined,
            });
            addToast?.('success', `${t('advance.done')} ${formatMoney(sum)}`);
            onDone?.(r.balance);
            close();
        } catch (err: any) {
            setError(err?.data?.error || err?.message || t('advance.failed'));
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={close} title={t('advance.title')}>
            <form onSubmit={submit} className="space-y-4">
                {target ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                        <Wallet className="w-5 h-5 text-primary-600 dark:text-primary-300 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink truncate">
                                {target.lastName} {target.firstName}
                            </p>
                            <p className="text-xs text-muted">
                                {t('advance.current')}: {formatMoney(target.balance || 0)}
                            </p>
                        </div>
                        {!patient && (
                            <button type="button" onClick={() => { setPicked(null); setSearch(''); }}
                                aria-label={t('common.change')}
                                className="p-1 text-faint hover:text-muted">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <div>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                                placeholder={t('reception.searchPh')}
                                className="w-full pl-9 pr-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500" />
                        </div>
                        {searching && <p className="mt-2 text-xs text-faint">{t('common.loading')}</p>}
                        {results.length > 0 && (
                            <div className="mt-2 border border-line rounded-lg divide-y divide-line max-h-48 overflow-y-auto">
                                {results.map(p => (
                                    <button key={p.id} type="button" onClick={() => setPicked(p)}
                                        className="w-full text-left p-2.5 hover:bg-elevated">
                                        <span className="block text-sm text-ink truncate">
                                            {p.lastName} {p.firstName}
                                        </span>
                                        <span className="block text-xs text-muted">{formatUzPhone(p.phone)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Fokus BITTA joyda: bemor tanlanmagan bo'lsa qidiruvda,
                    tanlangach summada. Ikkalasida `autoFocus` bo'lsa brauzer
                    o'zi tanlaydi va kursor kutilmagan maydonga tushadi. */}
                <Input label={t('advance.amount')} type="number" value={amount} autoFocus={!!target}
                    onChange={(e: any) => setAmount(e.target.value)} />

                <div>
                    <label className="block text-sm font-medium text-muted mb-1.5">
                        {t('advance.method')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {/* «Avansdan» usuli ATAYLAB yo'q: avansni avansdan
                            to'ldirish o'z-o'ziga pul ko'chirish bo'lardi.
                            Server ham buni rad etadi. */}
                        {INCOMING_PAYMENT_METHODS.filter(m => m !== 'Balance').map(m => (
                            <button key={m} type="button" onClick={() => setMethod(m)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${method === m
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-surface border-line text-muted hover:border-primary-400'}`}>
                                {getPaymentMethodLabel(m)}
                            </button>
                        ))}
                    </div>
                </div>

                <Input label={t('advance.note')} value={note}
                    onChange={(e: any) => setNote(e.target.value)} />

                <p className="text-xs text-muted">{t('advance.hint')}</p>

                {error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={close}>{t('common.cancel')}</Button>
                    <Button type="submit" disabled={saving || !target}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {t('advance.submit')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
