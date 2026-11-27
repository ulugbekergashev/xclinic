/* ─────────────────────────────────────────────────────────────────────────────
   SAYTDAN KELGAN SO'ROVLAR — Kalendar asboblar qatorida (2026-11-26, 0046).

   2026-11-27: ilgari kalendar tepasida katta blok edi va jadvalni pastga
   surib, ekranning yarmini egallardi. Endi asboblar qatorida bitta kichik
   «So'rovlar N» tugmasi; bosilganda ro'yxat ochiladi. So'rovlar jadvalning
   o'zida ham o'z vaqtida (punktir blok) ko'rinadi.

   Saytdan va (sozlama yoqilgan bo'lsa) Telegram botdan yozilganlar shu yerda.
   Har qatorda: ism, telefon, shifokor, kun va vaqt, manba; «Tasdiqlash»,
   «Boshqa vaqt» (kun va vaqt tanlanadi va darhol tasdiqlanadi), rad etish.
   So'rov bo'lmasa — blok umuman chiqmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, Send, Check, X, Clock, ChevronDown } from 'lucide-react';
import { Appointment } from '../../types';
import { api } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatDate } from '../../utils/format';
import { toast } from '../../services/toast';
import { confirmAction } from '../../services/confirm';

interface Props {
    appointments: Appointment[];
}

const phoneOf = (a: Appointment) => /(\+?\d[\d\s]{8,})/.exec(String(a.notes || ''))?.[1]?.trim() || null;

export function BookingRequests({ appointments }: Props) {
    const { t } = useLanguage();
    const [busy, setBusy] = useState('');
    const [moving, setMoving] = useState<string>('');
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    /* Tashqariga bosilsa yoki Esc — yopiladi */
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const rows = useMemo(() => appointments
        .filter(a => a.status === 'Requested' && !handled.has(a.id))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [appointments, handled]);
    if (!rows.length) return null;

    const done = (id: string) => setHandled(prev => new Set([...prev, id]));

    const confirm = async (a: Appointment, change?: { date: string; time: string }) => {
        setBusy(a.id);
        try {
            const r = await api.appointments.confirmRequest(a.id, change);
            done(a.id);
            setMoving('');
            if (r.notified) toast.success(t('booking.confirmed'));
            else toast.info(t('booking.confirmedCall'));
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || t('ui.xatolik_yuz_berdi'));
        } finally { setBusy(''); }
    };
    const reject = async (a: Appointment) => {
        if (!await confirmAction({ title: fill(t('booking.rejectQ'), a.patientName), danger: true, confirmLabel: t('booking.reject') })) return;
        setBusy(a.id);
        try { await api.appointments.rejectRequest(a.id); done(a.id); }
        catch (e: any) { toast.error(e?.data?.error || e?.message || t('ui.xatolik_yuz_berdi')); }
        finally { setBusy(''); }
    };

    return (
        <div ref={boxRef} className="relative">
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[13px] font-semibold text-amber-800 dark:text-amber-300 transition-colors ${open
                    ? 'border-amber-500/60 bg-amber-500/20'
                    : 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'}`}>
                <Clock className="w-4 h-4" />
                {t('booking.button')}
                <span className="min-w-[20px] h-5 px-1.5 grid place-items-center rounded-full bg-amber-500 text-white text-[11px] font-bold tabular-nums">{rows.length}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
        <section role="dialog" aria-labelledby="booking-req-title"
            className="absolute right-0 top-full mt-2 z-40 w-[460px] max-w-[calc(100vw-2rem)] max-h-[min(70vh,560px)] overflow-y-auto rounded-2xl border border-line bg-surface shadow-xl p-4">
            <h2 id="booking-req-title" className="flex items-center gap-2 text-sm font-bold text-ink">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" /> {fill(t('booking.title'), rows.length)}
            </h2>
            <p className="text-xs text-muted mt-0.5">{t('booking.hint')}</p>
            <ul className="mt-3 divide-y divide-line">
                {rows.map(a => {
                    const phone = phoneOf(a);
                    const isMoving = moving === a.id;
                    return (
                        <li key={a.id} className="py-2.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-ink truncate">
                                        {a.patientName}
                                        {phone && <a href={`tel:${phone.replace(/\s/g, '')}`} className="ml-2 text-xs font-normal text-muted tabular-nums hover:underline">{phone}</a>}
                                    </p>
                                    <p className="text-[11px] text-faint">
                                        {a.doctorName} · {formatDate(a.date)} {a.time} · {' '}
                                        <span className="inline-flex items-center gap-0.5">
                                            {a.source === 'bot' ? <><Send className="w-3 h-3" /> {t('booking.fromBot')}</> : <><Globe className="w-3 h-3" /> {t('booking.fromSite')}</>}
                                        </span>
                                    </p>
                                </div>
                                <span className="flex items-center gap-1.5">
                                    <button type="button" disabled={!!busy} onClick={() => reject(a)} aria-label={fill(t('booking.rejectQ'), a.patientName)}
                                        className="h-8 w-8 grid place-items-center rounded-lg border border-line text-faint hover:text-red-600 hover:border-red-300 disabled:opacity-50">
                                        <X className="w-4 h-4" />
                                    </button>
                                    <button type="button" disabled={!!busy} onClick={() => { setMoving(isMoving ? '' : a.id); setNewDate(a.date); setNewTime(a.time); }}
                                        className="h-8 px-2.5 rounded-lg border border-line text-xs font-semibold text-ink hover:border-primary-400 disabled:opacity-50">
                                        {t('booking.otherTime')}
                                    </button>
                                    <button type="button" disabled={!!busy} onClick={() => confirm(a)}
                                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
                                        <Check className="w-3.5 h-3.5" /> {t('booking.confirm')}
                                    </button>
                                </span>
                            </div>
                            {isMoving && (
                                <div className="mt-2 flex flex-wrap items-end gap-2">
                                    <label className="text-xs text-muted">{t('ui.sana')}
                                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                                            className="block h-9 px-2 rounded-lg border border-line bg-surface text-ink text-sm" />
                                    </label>
                                    <label className="text-xs text-muted">{t('booking.time')}
                                        <input type="time" step={1800} value={newTime} onChange={e => setNewTime(e.target.value)}
                                            className="block h-9 px-2 rounded-lg border border-line bg-surface text-ink text-sm" />
                                    </label>
                                    <button type="button" disabled={!!busy || !newDate || !newTime}
                                        onClick={() => confirm(a, { date: newDate, time: newTime })}
                                        className="h-9 px-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold disabled:opacity-50">
                                        {t('booking.confirmMoved')}
                                    </button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
            )}
        </div>
    );
}
