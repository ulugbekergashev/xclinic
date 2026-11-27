import React, { useCallback, useEffect, useState } from 'react';
import { Phone, CalendarClock } from 'lucide-react';
import { api, FollowUpRow } from '../services/api';
import { useLanguage, fill } from '../context/LanguageContext';
import { useResourceSync } from '../hooks/useDataSync';
import { formatUzPhone } from '../shared/validation';
import { formatDate } from '../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   QAYTA KO'RIKKA CHAQIRISH — registratura «Bugun» ekranida (2026-11-26).

   Shifokor qabulda «3 haftadan keyin» deb belgilagan bemorlar: bugun,
   kechikkanlar (30 kungacha) va yaqin kunlar. Qaytib kelgan bemor o'zi
   ro'yxatdan chiqadi (`backend/followUps.ts`). Ro'yxat bo'sh bo'lsa — blok
   umuman ko'rinmaydi: ekran «Bugun» egasi istagandek qoladi.
   ───────────────────────────────────────────────────────────────────────────── */

const SHOWN = 6;

const dayDiff = (a: string, b: string) =>
    Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);

export const FollowUpList: React.FC<{ onOpenPatient: (id: string, book?: boolean) => void }> = ({ onOpenPatient }) => {
    const { t } = useLanguage();
    const [data, setData] = useState<{ today: string; rows: FollowUpRow[] } | null>(null);
    const [filter, setFilter] = useState<'all' | 'open' | 'booked'>('all');
    const [showAll, setShowAll] = useState(false);

    const load = useCallback(() => { api.followUps.list().then(setData).catch(() => { }); }, []);
    useEffect(() => { load(); }, [load]);
    /* Kalendarga yozildi yoki qabul ochildi — ro'yxat o'zi yangilanadi */
    useResourceSync(['appointments', 'visits'], load, true);

    if (!data || data.rows.length === 0) return null;
    const open = data.rows.filter(r => !r.booked);
    const booked = data.rows.filter(r => r.booked);
    const rows = filter === 'open' ? open : filter === 'booked' ? booked : data.rows;
    const shown = showAll ? rows : rows.slice(0, SHOWN);

    const when = (r: FollowUpRow) => {
        const d = dayDiff(r.followUpDate, data.today);
        if (d === 0) return { text: t('fu.today'), tone: 'text-primary-700 dark:text-primary-300' };
        if (d < 0) return { text: fill(t('fu.late'), -d), tone: 'text-amber-700 dark:text-amber-300' };
        return { text: d === 1 ? t('fu.tomorrow') : fill(t('fu.inDays'), d), tone: 'text-muted' };
    };
    const tabs: { id: typeof filter; label: string }[] = [
        { id: 'all', label: fill(t('fu.all'), data.rows.length) },
        { id: 'open', label: fill(t('fu.open'), open.length) },
        { id: 'booked', label: fill(t('fu.booked'), booked.length) },
    ];

    return (
        <section aria-labelledby="fu-title" className="card overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <h2 id="fu-title" className="text-[15px] font-semibold text-ink flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-muted" aria-hidden="true" />
                        {fill(t('fu.title'), data.rows.length)}
                    </h2>
                    <p className="text-[12px] text-muted mt-0.5">{t('fu.sub')}</p>
                </div>
                <div role="group" aria-label={t('fu.filter')} className="ml-auto inline-flex p-1 rounded-xl bg-elevated/70 gap-0.5">
                    {tabs.map(x => (
                        <button key={x.id} type="button" aria-pressed={filter === x.id} onClick={() => { setFilter(x.id); setShowAll(false); }}
                            className={`h-8 px-3 rounded-lg text-[13px] ${filter === x.id ? 'bg-surface shadow-sm font-semibold text-ink' : 'font-medium text-muted hover:text-ink'}`}>
                            {x.label}
                        </button>
                    ))}
                </div>
            </div>
            <ul className="divide-y divide-line-soft border-t border-line-soft">
                {shown.map(r => {
                    const w = when(r);
                    return (
                        <li key={r.visitId} className="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                            <div className="min-w-[200px] flex-1">
                                <button type="button" onClick={() => onOpenPatient(r.patientId)} className="font-semibold text-ink hover:underline text-left">
                                    {r.patientName}
                                </button>
                                <p className="text-[12px] text-muted truncate">
                                    {[r.diagnosis, r.doctorName, fill(t('fu.from'), formatDate(r.visitDate))].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                            <span className={`shrink-0 text-[12.5px] font-semibold ${w.tone}`}>{formatDate(r.followUpDate)} · {w.text}</span>
                            {r.booked ? (
                                <span className="shrink-0 h-7 px-2.5 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 text-[12.5px] font-semibold inline-flex items-center">
                                    {fill(t('fu.bookedAt'), formatDate(r.booked.date), r.booked.time)}
                                </span>
                            ) : (
                                <span className="shrink-0 flex items-center gap-2">
                                    {r.phone && (
                                        <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                                            className="h-8 px-3 rounded-lg border border-line text-[12.5px] font-semibold text-ink hover:bg-elevated inline-flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5" aria-hidden="true" />{formatUzPhone(r.phone)}
                                        </a>
                                    )}
                                    <button type="button" onClick={() => onOpenPatient(r.patientId, true)}
                                        className="h-8 px-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-[12.5px] font-semibold">
                                        {t('fu.book')}
                                    </button>
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
            {rows.length > SHOWN && (
                <div className="px-5 py-2 border-t border-line-soft">
                    <button type="button" onClick={() => setShowAll(o => !o)} aria-expanded={showAll}
                        className="h-8 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                        {showAll ? t('pay.queue.hide') : fill(t('pay.queue.showN'), rows.length - SHOWN)}
                    </button>
                </div>
            )}
        </section>
    );
};
