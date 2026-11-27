/* ─────────────────────────────────────────────────────────────────────────────
   SAYTDAN QABULGA YOZILISH — bemor sahifasi (`/book`, kirishsiz, 2026-11-26).

   Bemor uchun: shifokor → kun → bo'sh vaqt → ism va telefon → «Yozilish».
   Xodim ekrani EMAS: menyu, yon panel yo'q — telefon uchun bitta karta.
   Faqat ochiq ma'lumot ko'rinadi (shifokor ismi, mutaxassisligi, bo'sh
   vaqtlar). So'rov registratorga boradi; tasdiqlansa bemorga xabar keladi.
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, Loader2, CheckCircle2, Phone, MapPin } from 'lucide-react';
import { api, PublicBookingInfo } from '../services/api';
import { useLanguage, fill } from '../context/LanguageContext';

const WEEKDAYS_UZ = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Shan'];

export default function PublicBooking() {
    const { t } = useLanguage();
    const [params] = useSearchParams();
    const clinicParam = params.get('c') || undefined;
    const [info, setInfo] = useState<PublicBookingInfo | null>(null);
    const [failed, setFailed] = useState(false);
    const [doctorId, setDoctorId] = useState('');
    const [date, setDate] = useState('');
    const [times, setTimes] = useState<string[] | null>(null);
    const [time, setTime] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('+998 ');
    const [trap, setTrap] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState<null | { confirmed: boolean }>(null);

    useEffect(() => {
        api.publicBooking.info(clinicParam).then(setInfo).catch(() => setFailed(true));
    }, [clinicParam]);

    const doctor = useMemo(() => info?.doctors.find(d => d.id === doctorId), [info, doctorId]);

    useEffect(() => {
        setTimes(null); setTime('');
        if (!doctorId || !date) return;
        let alive = true;
        api.publicBooking.slots(doctorId, date, clinicParam)
            .then(r => { if (alive) setTimes(r.times); })
            .catch(() => { if (alive) setTimes([]); });
        return () => { alive = false; };
    }, [doctorId, date, clinicParam]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!doctorId || !date || !time) return;
        setBusy(true);
        try {
            const r = await api.publicBooking.create({ doctorId, date, time, name: name.trim(), phone, website: trap, c: clinicParam });
            setDone({ confirmed: r.confirmed });
        } catch (err: any) {
            setError(err?.data?.error || err?.message || t('book.failed'));
            if (err?.status === 409) { setTime(''); setDate(d => d); }
        } finally { setBusy(false); }
    };

    const dayLabel = (iso: string) => {
        const d = new Date(`${iso}T00:00:00`);
        return { wd: WEEKDAYS_UZ[d.getDay()], day: d.getDate() };
    };

    const shell = (children: React.ReactNode) => (
        <div className="min-h-screen bg-canvas flex justify-center px-4 py-6">
            <main className="w-full max-w-md">{children}</main>
        </div>
    );

    if (failed) return shell(
        <div className="card p-6 text-center">
            <p className="text-base font-semibold text-ink">{t('book.unavailable')}</p>
            <p className="text-sm text-muted mt-1">{t('book.unavailableHint')}</p>
        </div>,
    );
    if (!info) return shell(<div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-faint" /></div>);

    if (done) return shell(
        <div className="card p-6 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
            <h1 className="text-lg font-bold text-ink">{done.confirmed ? t('book.doneConfirmed') : t('book.doneRequested')}</h1>
            <p className="text-sm text-muted">{doctor?.name} · {date} · {time}</p>
            <p className="text-sm text-muted">{done.confirmed ? t('book.doneConfirmedHint') : t('book.doneRequestedHint')}</p>
            {info.clinic.phone && <a href={`tel:${info.clinic.phone}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300"><Phone className="w-4 h-4" /> {info.clinic.phone}</a>}
        </div>,
    );

    return shell(
        <form onSubmit={submit} className="card p-5 space-y-5">
            <header>
                <h1 className="text-xl font-black text-ink">{info.clinic.name}</h1>
                {(info.clinic.address || info.clinic.phone) && (
                    <p className="mt-1 text-sm text-muted flex flex-wrap gap-x-3 gap-y-1">
                        {info.clinic.address && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {info.clinic.address}</span>}
                        {info.clinic.phone && <a href={`tel:${info.clinic.phone}`} className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {info.clinic.phone}</a>}
                    </p>
                )}
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary-700 dark:text-primary-300">
                    <CalendarCheck className="w-4 h-4" /> {t('book.title')}
                </p>
            </header>

            <fieldset>
                <legend className="text-sm font-bold text-ink mb-2">{t('book.doctor')}</legend>
                <div className="space-y-2">
                    {info.doctors.map(d => (
                        <label key={d.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${doctorId === d.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-line'}`}>
                            <input type="radio" name="doctor" className="sr-only" checked={doctorId === d.id}
                                onChange={() => { setDoctorId(d.id); setDate(''); }} />
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-ink truncate">{d.name}</span>
                                {d.specialty && <span className="block text-xs text-muted truncate">{d.specialty}</span>}
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>

            {doctor && (
                <fieldset>
                    <legend className="text-sm font-bold text-ink mb-2">{t('book.day')}</legend>
                    {doctor.days.length === 0 ? <p className="text-sm text-muted">{t('book.noDays')}</p> : (
                        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                            {doctor.days.map(iso => {
                                const l = dayLabel(iso);
                                return (
                                    <button key={iso} type="button" onClick={() => setDate(iso)} aria-pressed={date === iso}
                                        className={`shrink-0 w-14 py-2 rounded-xl border text-center ${date === iso ? 'bg-primary-600 border-primary-600 text-white' : 'border-line text-ink'}`}>
                                        <span className="block text-[11px] opacity-80">{l.wd}</span>
                                        <span className="block text-base font-bold">{l.day}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </fieldset>
            )}

            {doctor && date && (
                <fieldset>
                    <legend className="text-sm font-bold text-ink mb-2">{t('book.time')}</legend>
                    {times === null ? <Loader2 className="w-5 h-5 animate-spin text-faint" />
                        : times.length === 0 ? <p className="text-sm text-muted">{t('book.noTimes')}</p> : (
                            <div className="grid grid-cols-4 gap-2">
                                {times.map(x => (
                                    <button key={x} type="button" onClick={() => setTime(x)} aria-pressed={time === x}
                                        className={`h-10 rounded-lg border text-sm font-semibold tabular-nums ${time === x ? 'bg-primary-600 border-primary-600 text-white' : 'border-line text-ink'}`}>
                                        {x}
                                    </button>
                                ))}
                            </div>
                        )}
                </fieldset>
            )}

            {time && (
                <div className="space-y-3">
                    <label className="block">
                        <span className="block text-sm font-bold text-ink mb-1">{t('book.name')}</span>
                        <input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name"
                            className="w-full h-11 px-3 rounded-lg border border-line bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500" />
                    </label>
                    <label className="block">
                        <span className="block text-sm font-bold text-ink mb-1">{t('book.phone')}</span>
                        <input value={phone} onChange={e => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel"
                            className="w-full h-11 px-3 rounded-lg border border-line bg-surface text-ink text-sm tabular-nums focus:ring-2 focus:ring-primary-500" />
                    </label>
                    {/* Odam ko'rmaydigan tuzoq maydon — botlar to'ldiradi */}
                    <input value={trap} onChange={e => setTrap(e.target.value)} name="website" tabIndex={-1} autoComplete="off"
                        aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0" />
                    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <button type="submit" disabled={busy}
                        className="w-full h-12 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-base font-bold disabled:opacity-60">
                        {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : fill(t('book.submit'), date, time)}
                    </button>
                </div>
            )}
        </form>,
    );
}
