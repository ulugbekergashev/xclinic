import React, { useState, useEffect, useMemo } from 'react';
import { Wallet, Loader2, Search, X, Plus, Trash2 } from 'lucide-react';
import { Modal, Button } from './Common';
import { Patient } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatMoney } from '../utils/format';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { usePatientSearch } from '../hooks/usePatientSearch';
import { formatUzPhone } from '../shared/validation';

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
   ───────────────────────────────────────────────────────────────────────────── */

type ServiceOption = { id?: number; name: string; price: number };

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Bemor oldindan ma'lum bo'lsa (bemor kartasi). `null` — oyna o'zi qidiradi. */
    patient: Patient | null;
    services: ServiceOption[];
    receivedByName?: string;
    onDone?: () => void;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type Line = { key: string; serviceId?: number; name: string; price: number; qty: number };

export const ServicePaymentModal: React.FC<Props> = ({
    isOpen, onClose, patient, services, receivedByName, onDone, addToast,
}) => {
    const { t } = useLanguage();

    /* Bemor tanlash — qidiruv SERVERDA (`usePatientSearch`), ya'ni karta
       raqami va JSHSHIR bo'yicha ham topiladi. */
    const [picked, setPicked] = useState<Patient | null>(null);
    const [search, setSearch] = useState('');
    const { results, loading: searching } = usePatientSearch(search, { enabled: isOpen && !patient });
    const target = patient || picked;

    const [lines, setLines] = useState<Line[]>([]);
    const [serviceQuery, setServiceQuery] = useState('');
    const [method, setMethod] = useState('Cash');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    /* Oyna yopilganda hammasi tozalanadi: keyingi safar oldingi bemorning
       tanlovi qolib ketmasin. */
    useEffect(() => {
        if (!isOpen) { setPicked(null); setSearch(''); setLines([]); setServiceQuery(''); setError(''); }
    }, [isOpen]);

    const matches = useMemo(() => {
        const q = serviceQuery.trim().toLowerCase();
        const list = q ? services.filter(s => s.name.toLowerCase().includes(q)) : services;
        return list.slice(0, 8);
    }, [services, serviceQuery]);

    const total = useMemo(
        () => lines.reduce((s, l) => s + l.price * l.qty, 0),
        [lines],
    );

    const addLine = (s: ServiceOption) => {
        setLines(prev => {
            /* Bir xil xizmat ikkinchi marta tanlansa — yangi qator emas,
               MIQDOR oshadi. Aks holda chekda bir xil nom ikki marta
               turardi va kassir qaysi biri qaysiligini ajrata olmasdi. */
            const i = prev.findIndex(l => l.name === s.name && l.price === s.price);
            if (i >= 0) {
                const next = [...prev];
                next[i] = { ...next[i], qty: next[i].qty + 1 };
                return next;
            }
            return [...prev, {
                key: `${s.name}-${Date.now()}`,
                serviceId: s.id, name: s.name, price: s.price, qty: 1,
            }];
        });
        setServiceQuery('');
    };

    const submit = async () => {
        setError('');
        if (!target) { setError(t('advance.pickPatient')); return; }
        if (lines.length === 0) { setError(t('payment.pickService')); return; }

        setSaving(true);
        try {
            /* 1) Qatorlar yaratiladi. Ular shifokor yaratadigan qatorlar bilan
                  bir xil: `serviceId` saqlanadi, ya'ni shifokor ulushi va
                  xizmat bo'yicha hisobot ishlaydi. */
            const ids: string[] = [];
            for (const l of lines) {
                const created: any = await api.charges.create({
                    patientId: target.id,
                    patientName: `${target.lastName} ${target.firstName}`.trim(),
                    name: l.name,
                    unitPrice: l.price,
                    quantity: l.qty,
                    source: 'Service',
                    ...(l.serviceId ? { serviceId: l.serviceId } : {}),
                } as any);
                if (created?.id) ids.push(created.id);
            }
            if (ids.length === 0) throw new Error(t('payment.chargeFailed'));

            /* 2) Va darhol to'lanadi — kassadagi oddiy to'lov bilan bir xil
                  chaqiruv. Qisman to'lov bu yerda yo'q: odam xizmatni tanlab
                  turib to'lamoqchi, ya'ni summa to'liq. */
            await api.payments.pay({ chargeIds: ids, method, receivedByName } as any);

            addToast?.('success', `${formatMoney(total)} ${t('payment.accepted')}`);
            onDone?.();
            onClose();
        } catch (e: any) {
            setError(e?.message || t('payment.failed'));
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('payment.title')} className="max-w-2xl">
            <div className="space-y-4">
                {/* ── Bemor ────────────────────────────────────────────── */}
                {!patient && (
                    target ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-line bg-elevated">
                            <div className="w-9 h-9 rounded-full bg-primary-500/12 text-primary grid place-items-center font-bold text-xs">
                                {target.firstName?.[0]}{target.lastName?.[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-ink truncate">
                                    {target.lastName} {target.firstName}
                                </p>
                                <p className="text-xs text-faint">{formatUzPhone(target.phone || '')}</p>
                            </div>
                            <button onClick={() => setPicked(null)}
                                className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-surface">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={t('advance.searchPatient')}
                                    className="w-full h-11 pl-10 pr-3 rounded-xl border border-line bg-elevated text-sm text-ink placeholder:text-faint outline-none focus:border-primary-500/50"
                                />
                            </div>
                            {searching && <p className="text-xs text-faint mt-2">…</p>}
                            {results.length > 0 && (
                                <div className="mt-2 border border-line rounded-xl divide-y divide-line max-h-48 overflow-y-auto">
                                    {results.map(p => (
                                        <button key={p.id} onClick={() => { setPicked(p); setSearch(''); }}
                                            className="w-full text-left px-3 py-2.5 hover:bg-elevated">
                                            <p className="text-sm font-medium text-ink">{p.lastName} {p.firstName}</p>
                                            <p className="text-xs text-faint">{formatUzPhone(p.phone || '')}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                )}

                {/* ── Xizmat tanlash ───────────────────────────────────── */}
                <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">{t('payment.service')}</label>
                    <div className="relative">
                        <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                        <input
                            value={serviceQuery}
                            onChange={e => setServiceQuery(e.target.value)}
                            placeholder={t('payment.searchService')}
                            className="w-full h-11 pl-10 pr-3 rounded-xl border border-line bg-elevated text-sm text-ink placeholder:text-faint outline-none focus:border-primary-500/50"
                        />
                    </div>
                    {matches.length > 0 && (
                        <div className="mt-2 border border-line rounded-xl divide-y divide-line max-h-44 overflow-y-auto">
                            {matches.map(s => (
                                <button key={`${s.id ?? s.name}`} onClick={() => addLine(s)}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-elevated text-left">
                                    <span className="text-sm text-ink flex-1 truncate">{s.name}</span>
                                    <span className="text-sm font-semibold tabular-nums text-muted">{formatMoney(s.price)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Tanlangan qatorlar ───────────────────────────────── */}
                {lines.length > 0 && (
                    <div className="border border-line rounded-xl divide-y divide-line">
                        {lines.map(l => (
                            <div key={l.key} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="text-sm text-ink flex-1 truncate">{l.name}</span>
                                {l.qty > 1 && <span className="text-xs text-faint">×{l.qty}</span>}
                                <span className="text-sm font-semibold tabular-nums text-ink">{formatMoney(l.price * l.qty)}</span>
                                <button onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))}
                                    className="p-1 text-faint hover:text-danger rounded-lg">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        <div className="flex items-center gap-3 px-3 py-3 bg-elevated">
                            <span className="text-sm font-bold text-ink flex-1">{t('payment.total')}</span>
                            <span className="text-lg font-black tabular-nums text-primary">{formatMoney(total)}</span>
                        </div>
                    </div>
                )}

                {/* ── To'lov usuli ─────────────────────────────────────── */}
                <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">{t('advance.method')}</label>
                    <div className="flex flex-wrap gap-2">
                        {/* «Balansdan» YO'Q: balans tushunchasi olib tashlandi. */}
                        {INCOMING_PAYMENT_METHODS.filter(m => m !== 'Balance').map(m => (
                            <button key={m} onClick={() => setMethod(m)}
                                className={`px-3.5 h-10 rounded-xl text-sm font-semibold border transition-colors ${method === m
                                    ? 'bg-primary-500/12 text-primary border-primary-500/40'
                                    : 'bg-surface text-muted border-line hover:border-primary-400'}`}>
                                {getPaymentMethodLabel(m)}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <p className="text-sm font-medium text-danger">{error}</p>}

                <div className="flex items-center gap-3 pt-1">
                    <Button onClick={submit} disabled={saving || !target || lines.length === 0}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                        {t('payment.accept')}
                    </Button>
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
