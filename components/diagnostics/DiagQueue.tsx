import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Volume2, Play, ArrowRight, Loader2 } from 'lucide-react';
import { DiagnosticStudy, MODALITY_LABELS } from '../../types';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatNumber } from '../../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   DIAGNOSTIKA NAVBATI — jurnal tepasida (2026-11-27, migratsiya 0049).

   Ega so'radi: «bularda hech qanday navbat degan narsalar bo'lmaydimi?».
   Ilgari sahifa faqat jurnal edi: UZI shifokori eshik oldida kim, kim
   birinchi kelgani va kimni chaqirishni ko'rmasdi.

   · Navbatda — bugungi yo'llanmalar (oxirgi 24 soat, laboratoriyadagi bilan
     bitta chegara), kelish tartibida: birinchi kelgan tepada. Yangi «Keldi»
     qadami yo'q.
   · Raqam — bemorning qabuldagi talonining o'zi (T-05). Yangi raqam yo'q.
   · «Chaqirish» va «Boshlash» — ikkalasi ixtiyoriy. Chaqirilsa tablo ovoz
     bilan «T-05, UZI xonasiga» deydi; boshlansa holat «Bajarilmoqda» bo'ladi
     va qator «Hozir xonada» ga o'tadi, u yerda «Xulosa».
   · Xona bo'yicha chiplar — UZI shifokori faqat o'z xonasini ko'radi.
   ───────────────────────────────────────────────────────────────────────────── */

type Row = DiagnosticStudy & { paid?: boolean | null; due?: number | null };

interface Props {
    studies: Row[];
    busyId: string;
    onCall: (s: Row) => void;
    onStart: (s: Row) => void;
    onOpen: (s: Row) => void;
}

const DAY_MS = 24 * 3_600_000;

export const DiagQueue: React.FC<Props> = ({ studies, busyId, onCall, onStart, onOpen }) => {
    const { t } = useLanguage();
    const [room, setRoom] = useState<string>('all');

    // «12 daq kutmoqda» — daqiqada bir yangilanadi
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    /* «Hozir xonada» — kun chegarasisiz (boshlangan ish yo'qolmasin).
       Navbat — oxirgi 24 soat; eskisi alohida va yig'iq (laboratoriyadagidek). */
    const [showStale, setShowStale] = useState(false);
    const live = useMemo(() => studies.filter(s =>
        s.status === 'InProgress' || (s.status === 'Ordered' && now - +new Date(s.orderedAt) <= DAY_MS),
    ), [studies, now]);
    const stale = useMemo(() => studies.filter(s =>
        s.status === 'Ordered' && now - +new Date(s.orderedAt) > DAY_MS,
    ).sort((a, b) => +new Date(a.orderedAt) - +new Date(b.orderedAt)), [studies, now]);

    const rooms = useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of live) counts.set(s.modality, (counts.get(s.modality) || 0) + 1);
        return [...counts.entries()];
    }, [live]);
    /* Tanlangan xona bo'shab qolsa — «Hammasi» (chiplar yashirinadi, filtr yopishib qolmasin) */
    const effRoom = rooms.some(([k]) => k === room) ? room : 'all';
    const byRoom = (list: Row[]) => effRoom === 'all' ? list : list.filter(s => s.modality === effRoom);
    const shown = byRoom(live);
    const inRoom = shown.filter(s => s.status === 'InProgress');
    const waiting = [...shown.filter(s => s.status === 'Ordered'), ...(showStale ? byRoom(stale) : [])]
        .sort((a, b) => +new Date(a.orderedAt) - +new Date(b.orderedAt));
    /* O'rin raqami — HAR XONA ichida: UZI va EKG — alohida eshiklar */
    const position = new Map<string, number>();
    {
        const seen = new Map<string, number>();
        for (const s of waiting) {
            const n = (seen.get(s.modality) || 0) + 1;
            seen.set(s.modality, n);
            position.set(s.id, n);
        }
    }
    const waitingNow = shown.filter(s => s.status === 'Ordered').length;

    const span = (min: number) => (min < 60
        ? fill(t('labline.min'), Math.max(1, Math.round(min)))
        : fill(t('labline.hours'), Math.round(min / 60)));
    const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false });
    const label = (s: Row) => MODALITY_LABELS[s.modality] || s.modality;

    const ticketChip = (s: Row) => s.ticket ? (
        <span className="shrink-0 h-6 px-2 rounded-md bg-ink text-surface text-[12px] font-black tabular-nums leading-6">{s.ticket}</span>
    ) : null;

    const callButton = (s: Row) => {
        const again = !!s.calledAt;
        const text = again ? t('flow.recall') : t('flow.call');
        return (
            <button type="button" onClick={() => onCall(s)} disabled={!!busyId}
                title={s.ticket ? text : `${text} — ${t('roomq.noTicket')}`}
                aria-label={`${s.patientName}: ${text}`}
                className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line bg-surface text-xs font-bold text-ink hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50 transition-colors">
                {busyId === `call:${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{again ? t('flow.recallShort') : t('flow.call')}</span>
            </button>
        );
    };

    return (
        <section aria-labelledby="diag-queue-title" className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 id="diag-queue-title" className="flex items-center gap-2 text-[15px] font-bold text-ink">
                    <Activity className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    {fill(t('roomq.title'), waitingNow)}
                </h3>
                {rooms.length > 1 && (
                    <div role="group" aria-label={t('roomq.rooms')} className="flex flex-wrap gap-1.5">
                        {[['all', live.length] as [string, number], ...rooms].map(([key, n]) => (
                            <button key={key} type="button" onClick={() => setRoom(key)} aria-pressed={effRoom === key}
                                className={`h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors ${effRoom === key
                                    ? 'border-primary-500/40 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                                    : 'border-line text-muted hover:text-ink'}`}>
                                {key === 'all' ? t('roomq.all') : (MODALITY_LABELS[key as keyof typeof MODALITY_LABELS] || key)} <span className="tabular-nums opacity-70">{n}</span>
                            </button>
                        ))}
                    </div>
                )}
                <p className="w-full text-xs text-faint">{t('roomq.hint')}</p>
            </div>

            {inRoom.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2" aria-label={t('roomq.now')}>
                    {inRoom.map(s => (
                        <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl border border-primary-200 dark:border-primary-800/60 bg-primary-50/60 dark:bg-primary-900/15">
                            <span className="shrink-0 text-[10.5px] font-extrabold uppercase tracking-wider text-primary-700 dark:text-primary-300">{t('roomq.now')}</span>
                            {ticketChip(s)}
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-ink truncate">{s.patientName}</span>
                                <span className="block text-xs text-muted truncate">{label(s)} · {s.name}</span>
                            </span>
                            <button type="button" onClick={() => onOpen(s)}
                                className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold">
                                {t('roomq.conclusion')} <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {waiting.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t('roomq.empty')}</p>
            ) : (
                <ol className="mt-3 divide-y divide-line-soft">
                    {waiting.map(s => {
                        const waited = (now - +new Date(s.orderedAt)) / 60_000;
                        const old = waited > DAY_MS / 60_000;
                        const pos = position.get(s.id) || 0;
                        const first = pos === 1 && !old;
                        return (
                            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                                <span aria-hidden="true" className={`shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-black tabular-nums ${first
                                    ? 'bg-primary-600 text-white' : 'bg-elevated text-muted'}`}>{old ? '·' : pos}</span>
                                {ticketChip(s)}
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm font-bold text-ink truncate">{s.patientName}</span>
                                        {first && <span className="shrink-0 text-[10.5px] font-extrabold uppercase tracking-wider text-primary-700 dark:text-primary-300">{t('roomq.next')}</span>}
                                    </span>
                                    <span className="block text-xs truncate">
                                        <span className="text-muted">{label(s)} · {s.name}</span>
                                        <span className={waited >= 30 ? 'text-red-600 dark:text-red-400 font-semibold' : waited >= 15 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-faint'}>
                                            {' · '}{fill(t('labline.waited'), span(waited))}
                                        </span>
                                        {s.calledAt && <span className="text-primary-700 dark:text-primary-300 font-semibold"> · {fill(t('roomq.called'), hhmm(s.calledAt))}</span>}
                                        {s.paid === false && <span className="text-amber-700 dark:text-amber-400"> · {t('ui.tolanmagan')}{s.due ? ` ${formatNumber(s.due)}` : ''}</span>}
                                    </span>
                                </span>
                                {callButton(s)}
                                <button type="button" onClick={() => onStart(s)} disabled={!!busyId}
                                    aria-label={`${s.patientName}: ${t('roomq.start')}`}
                                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold disabled:opacity-50 transition-colors">
                                    {busyId === `start:${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                    {t('roomq.start')}
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
            {byRoom(stale).length > 0 && (
                <button type="button" onClick={() => setShowStale(v => !v)} aria-expanded={showStale}
                    className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline">
                    {fill(t('zones.lab.stale'), byRoom(stale).length)} — {showStale ? t('labline.hide') : t('labline.show')}
                </button>
            )}
        </section>
    );
};
