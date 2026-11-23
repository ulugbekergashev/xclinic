import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, MoreHorizontal, Play, Plus, Printer, Undo2, XCircle } from 'lucide-react';
import { ChargeSummary, Visit } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { formatNumber, formatTime } from '../../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   «BUGUNGI QABUL» BLOKINING TEPASI VA PASTI (2026-11-21, DentaCRM namunasida).

   Klinika egasi DentaCRM kartasini ko'rsatdi: «Umumiy» tabida ikkita blok —
   «Bugungi qabul» (bitta «+ Protsedura qo'shish» tugmasi va bugun
   qilinganlar ro'yxati) va «Tibbiy tarix». Bizda o'sha joyda yettita narsa
   turardi: qabul qatori, katta ko'rik formasi va to'rtta blok.

   Endi «Bugungi qabul» bloki:
     · TEPADA (`VisitHeader`) — sarlavha, ostida bitta kulrang qator
       (navbat, holat, shu qabulning puli), o'ngda «+ Qo'shish» va «⋯»;
     · O'RTADA — bugun qo'shilgan hamma narsa bitta ro'yxatda (VisitPanel);
     · PASTDA (`VisitActions`) — «Qabulni yakunlash». Boshlanmagan qabulda
       u ko'rinmaydi.

   «Qabulni boshlash» TEPADA, holat qatorining ostida turadi. Avval u pastda
   edi va natijalari ko'p bemorda ekrandan tushib ketardi — klinika egasi
   «boshlash qayerda o'zi?» deb so'radi (2026-11-21). Kutayotgan bemorning
   kartasini ochgan shifokor birinchi ko'radigan narsa — shu tugma.
   ───────────────────────────────────────────────────────────────────────────── */

const barBtn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold whitespace-nowrap disabled:opacity-50';
const lightBtn = `${barBtn} border border-line text-ink hover:bg-elevated`;
const primaryBtn = `${barBtn} bg-primary-600 hover:bg-primary-700 text-white`;

interface HeaderProps {
    visit: Visit;
    /** «Bugungi qabul» */
    title: string;
    /** Kim qabul qilyapti: «Dr. … , 3-kabinet» — sarlavhaning davomi */
    titleNote?: string;
    statusLabel: string;
    /** Holat nuqtasining rangi */
    statusDot: string;
    /** «saqlandi · 12:21» — `role="status"` bilan */
    saveLabel?: React.ReactNode;
    money: ChargeSummary;
    busy: boolean;
    referralBusy: boolean;
    /** «+ Qo'shish» — xizmat, tahlil, diagnostika, dori, tashxis, boshqa shifokor */
    onAdd?: () => void;
    addOpen?: boolean;
    /** Qabul hali boshlanmagan («Kutmoqda»/«Chaqirildi») — «Qabulni boshlash» */
    onStart?: () => void;
    onPrintReferral: () => void;
    onCancelVisit?: () => void;
}

export const VisitHeader: React.FC<HeaderProps> = ({
    visit, title, titleNote, statusLabel, statusDot, saveLabel, money, busy, referralBusy,
    onAdd, addOpen = false, onStart, onPrintReferral, onCancelVisit,
}) => {
    const { t } = useLanguage();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menuOpen) return;
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const closed = visit.status === 'Completed' || visit.status === 'Cancelled';
    const doneAt = visit.status === 'Completed' && visit.checkOutTime ? ` · ${formatTime(visit.checkOutTime)}` : '';
    // Yopilgan qabulda yo'llanma berilmaydi — menyudan ham yo'qoladi
    const showPrint = money.due > 0 && !closed;
    const hasMenu = showPrint || !!onCancelVisit;
    const run = (fn: () => void) => () => { setMenuOpen(false); fn(); };
    const menuItem = 'w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm font-medium text-left hover:bg-elevated disabled:opacity-50';

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="grow basis-0 min-w-[10rem]">
                {/* Sarlavha qisqa — «Bugungi qabul». Kim qabul qilyapti — ostidagi
                    kulrang qatorda: shifokor ismi sarlavhada ikki qatorga bo'linib
                    ketardi (2026-11-21). */}
                <h2 id="visit-title" className="text-[17px] font-semibold text-ink leading-snug">{title}</h2>
            </div>

            <div className="ml-auto shrink-0 flex items-center gap-1.5">
                {onAdd && (
                    <button type="button" onClick={onAdd} aria-expanded={addOpen}
                        className={`${barBtn} border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30`}>
                        <Plus className="w-4 h-4" aria-hidden="true" /> {t('common.add')}
                    </button>
                )}
                {hasMenu && (
                    <div ref={menuRef} className="relative">
                        <button type="button" onClick={() => setMenuOpen(o => !o)}
                            aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t('visit.menu')} title={t('visit.menu')}
                            className="w-9 h-9 grid place-items-center rounded-xl text-muted hover:text-ink hover:bg-elevated">
                            <MoreHorizontal className="w-5 h-5" />
                        </button>
                        {menuOpen && (
                            <div role="menu" aria-label={t('visit.menu')}
                                className="absolute right-0 top-11 z-30 w-64 p-1.5 rounded-2xl border border-line bg-surface shadow-xl">
                                {showPrint && (
                                    <button type="button" role="menuitem" disabled={referralBusy}
                                        className={`${menuItem} text-ink`} onClick={run(onPrintReferral)}>
                                        <Printer className="w-4 h-4 text-muted" /> {t('visit.printReferral')}
                                    </button>
                                )}
                                {onCancelVisit && (
                                    <button type="button" role="menuitem" disabled={busy}
                                        className={`${menuItem} text-red-700 dark:text-red-400`} onClick={run(onCancelVisit)}>
                                        <XCircle className="w-4 h-4" /> {t('visit.cancelVisit')}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Holat va pul — blokning TO'LIQ kengligida: tugmalar yonida siqilib
                ikki qatorga bo'linib ketardi. */}
            <div className="basis-full -mt-1">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted">
                    <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                    {titleNote && <span>{titleNote} ·</span>}
                    <span className="whitespace-nowrap">
                        {visit.queueNumber != null && !closed ? `№ ${visit.queueNumber} · ` : ''}{statusLabel}{doneAt}
                    </span>
                    {saveLabel}
                </p>
                {money.total > 0 && (
                    /* «Bu qabul» — chapdagi «Qarz» bemorning HAMMA qarzi, bu
                       yerda faqat shu qabulniki. */
                    <p className="mt-0.5 text-[13px] text-muted">
                        {money.due > 0 ? (
                            <>
                                {t('visit.thisVisit')}{' '}
                                <b className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">{formatNumber(money.due)} {t('ui.som')}</b>
                                {' '}{t('visit.unpaidShortBar')}
                            </>
                        ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">{t('visit.paidInFull')}</span>
                        )}
                    </p>
                )}
                {onStart && !closed && (
                    <button type="button" onClick={onStart} disabled={busy} className={`${primaryBtn} mt-3 h-10 px-5`}>
                        <Play className="w-4 h-4" /> {t('flow.startVisit')}
                    </button>
                )}
            </div>

            {visit.status === 'Cancelled' && (
                <p role="status" className="basis-full text-sm font-medium text-muted">{t('visit.cancelledBanner')}</p>
            )}
        </div>
    );
};

interface ActionsProps {
    visit: Visit;
    busy: boolean;
    /** Qabul ochiq va yozish huquqi bor */
    canFinish: boolean;
    /** Qabul hali boshlanmagan — «Yakunlash» ko'rinmaydi («Boshlash» tepada, `VisitHeader`) */
    notStarted: boolean;
    onComplete: () => void;
    onResume?: () => void;
    onShowToday?: () => void;
    /** Yakunlangan qabuldan keyin shu kunning o'zida yana bittasini ochish */
    onNewVisit?: () => void;
}

/** Blok pastidagi qabul tartibi tugmalari. Hech biri bo'lmasa — chiziq ham chizilmaydi. */
export const VisitActions: React.FC<ActionsProps> = ({
    visit, busy, canFinish, notStarted, onComplete, onResume, onShowToday, onNewVisit,
}) => {
    const { t } = useLanguage();
    const closed = visit.status === 'Completed' || visit.status === 'Cancelled';
    const showFinish = canFinish && !notStarted && !closed;
    const showNew = closed && !!onNewVisit;
    if (!onResume && !onShowToday && !showFinish && !showNew) return null;

    return (
        <div className="pt-4 border-t border-line flex flex-wrap items-center justify-end gap-2">
            {onResume && (
                <button type="button" onClick={onResume} disabled={busy} className={lightBtn}>
                    <Play className="w-4 h-4" /> {t('visit.continue')}
                </button>
            )}
            {onShowToday && (
                <button type="button" onClick={onShowToday} className={lightBtn}>
                    <Undo2 className="w-4 h-4" /> {t('visit.showToday')}
                </button>
            )}
            {showFinish && (
                <button type="button" onClick={onComplete} disabled={busy} className={primaryBtn}>
                    {t('visit.complete')} <ArrowRight className="w-4 h-4" />
                </button>
            )}
            {showNew && (
                <button type="button" onClick={onNewVisit} className={primaryBtn}>
                    <Plus className="w-4 h-4" /> {t('visit.newVisit')}
                </button>
            )}
        </div>
    );
};

/** Keyingi tashrif — yozilgan bo'lsa «Bugungi qabul» ro'yxatining ostida */
export const NextVisitRow: React.FC<{
    nextAppointment?: { date: string; time: string; doctorName?: string } | null;
    formatDate: (d: string) => string;
}> = ({ nextAppointment, formatDate }) => {
    if (!nextAppointment) return null;
    return (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>
                <b className="font-semibold text-ink">{formatDate(nextAppointment.date)}, {nextAppointment.time}</b>
                {nextAppointment.doctorName ? ` · ${nextAppointment.doctorName}` : ''}
            </span>
        </div>
    );
};
