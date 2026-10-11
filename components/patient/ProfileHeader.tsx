import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, Edit, Footprints, MoreHorizontal, Printer, Send, UserPlus } from 'lucide-react';
import { MODALITY_LABELS, Patient, Visit } from '../../types';
import { getFileUrl } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import { formatDobDDMMYYYY, calcAge, todayISO } from '../../utils/dateUtils';
import { formatNumber, formatTime } from '../../utils/format';
import { maskPhone } from '../../utils/accessControl';
import { profileRoute, ProfileStop } from '../../utils/visitRoute';
import type { VisitSheetState } from '../VisitPanel';

/* ─────────────────────────────────────────────────────────────────────────────
   BEMOR KARTASINING SARLAVHASI.

   Ilgari bu uch qavat edi: «Bemor profili» qatori, katta avatarli karta va
   uning ichida uchta ustun; tahrirlash, xabar va shifokorni o'zgartirish —
   kuniga bir marta kerak bo'ladigan amallar — eng ko'rinarli joyda turardi.
   Shifokorga kerak narsa esa (allergiya, surunkali kasallik) pastda,
   yopiq panel ichida edi.

   Endi bitta qator: kim, nimaga e'tibor berish kerak, bugun qayerda.
   Kam ishlatiladigan amallar «⋯» ostida.

   MARSHRUT — bugungi qabulning bekatlari (`utils/visitRoute.ts`): bemor
   qayerda bo'lgan, hozir qayerda, yana qayerga borishi kerak.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patient: Patient;
    showPhone: boolean;
    visitCount: number;
    allergies: { id: string; substance: string }[];
    chronic: { id: string; code: string; name: string }[];
    /** Allergiya ma'lumoti yuklanmadi — «yo'q» emas, «bilmaymiz» */
    allergiesUnknown?: boolean;
    /** Bemorning jami to'lanmagan qarzi */
    due: number;
    /** Varaqdagi qabul va uning hisobi — marshrut va soat shundan */
    sheet: VisitSheetState | null;
    /** Shu qabul shifokorining kabineti */
    room?: string | null;
    onBack: () => void;
    onOpenPayments: () => void;
    onEdit: () => void;
    onMessage: () => void;
    onAssignDoctor: () => void;
    onPrintCard: () => void;
    onUploadPhoto: (file: File) => void;
}

const chip = 'inline-flex items-center h-5 px-1.5 rounded-md text-[10.5px] font-bold whitespace-nowrap';
const MINUTE = 60_000;

const minutesSince = (iso: string | null | undefined, now: number): number => {
    if (!iso) return 0;
    const from = new Date(iso).getTime();
    return Number.isFinite(from) ? Math.max(0, Math.round((now - from) / MINUTE)) : 0;
};

type Translate = (key: TranslationKey) => string;

/** O'ng burchakdagi katta yozuv: bemor hozir qaysi holatda va qancha vaqtdan beri */
const clockOf = (v: Visit, now: number, t: Translate): { big: string; note: string; live: boolean } | null => {
    const queue = `№ ${v.queueNumber ?? '—'}`;
    switch (v.status) {
        case 'In Progress': {
            const since = v.startedAt || v.checkInTime;
            return { big: formatTime(since), note: fill(t('card.clock.inVisit'), minutesSince(since, now)), live: true };
        }
        case 'Called': return { big: queue, note: t('card.clock.called'), live: true };
        case 'Waiting': return { big: queue, note: fill(t('card.clock.waiting'), minutesSince(v.checkInTime, now)), live: false };
        case 'AwaitingResults': return { big: queue, note: t('card.clock.awaiting'), live: false };
        case 'Completed': return { big: formatTime(v.checkOutTime) || '✓', note: t('card.clock.done'), live: false };
        default: return null;
    }
};

export const ProfileHeader: React.FC<Props> = ({
    patient, showPhone, visitCount, allergies, chronic, allergiesUnknown = false, due, sheet, room,
    onBack, onOpenPayments, onEdit, onMessage, onAssignDoctor, onPrintCard, onUploadPhoto,
}) => {
    const { t } = useLanguage();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const menuButtonRef = useRef<HTMLButtonElement | null>(null);
    const photoInputRef = useRef<HTMLInputElement | null>(null);

    /* «N daqiqa» o'zi yuradi — sahifa qayta yuklanmasa ham */
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), MINUTE / 2);
        return () => clearInterval(id);
    }, []);

    const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);

    useEffect(() => {
        if (!menuOpen) return;
        // Ochilganda birinchi band — klaviaturadan darhol yurish mumkin
        menuItems()[0]?.focus();
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [menuOpen]);

    /* Menyu klaviaturadan: strelkalar — bandlar bo'ylab, Esc — yopadi va
       diqqatni «⋯» tugmasiga qaytaradi. */
    const onMenuKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            setMenuOpen(false);
            menuButtonRef.current?.focus();
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const items = menuItems();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'Home' ? 0
            : e.key === 'End' ? items.length - 1
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
    };

    const visit = sheet?.visit && sheet.visit.date === todayISO() ? sheet.visit : null;
    const stops = visit ? profileRoute(visit, sheet?.money) : [];
    const clock = visit ? clockOf(visit, now, t) : null;

    const age = calcAge(patient.dob);
    const phone = (value?: string) => (showPhone ? value : maskPhone(value));
    const meta = [
        age !== null ? `${age} ${t('patients.details.age')}` : '',
        patient.gender === 'Male' ? t('patients.modal.male') : t('patients.modal.female'),
        phone(patient.phone),
        patient.secondaryPhone ? `${phone(patient.secondaryPhone)} ${t('patientdetails.qoshimcha')}` : '',
        patient.cardNumber ? fill(t('card.cardNo'), patient.cardNumber) : '',
        visitCount > 0 ? fill(t('card.visitsCount'), visitCount) : '',
    ].filter(Boolean).join(' · ');

    const stopName = (s: ProfileStop): string =>
        s.kind === 'cashier' ? t('nav.finance')
            : s.kind === 'lab' ? t('nav.lab')
                : s.kind === 'study' ? (s.modality ? MODALITY_LABELS[s.modality] : t('nav.diagnostics'))
                    : `${visit?.doctorName || visit?.department?.name || t('common.doctor')}${room ? ` · ${room}` : ''}`;

    const stopNote = (s: ProfileStop): string => {
        const at = s.at ? ` · ${formatTime(s.at)}` : '';
        if (s.kind === 'cashier') {
            return s.state === 'done' ? fill(t('card.stop.paid'), formatNumber(s.total)) : fill(t('card.stop.due'), formatNumber(s.due));
        }
        if (s.kind === 'lab') {
            if (s.state === 'done') return `${t('card.stop.ready')}${at}`;
            return s.at ? `${t('card.stop.sampled')}${at}` : s.services.join(', ');
        }
        if (s.kind === 'study') return s.state === 'done' ? `${t('card.stop.performed')}${at}` : s.services.join(', ');
        if (s.state === 'done') return t('card.stop.finished');
        if (visit?.status === 'In Progress') return `${t('card.stop.now')}${at}`;
        if (visit?.status === 'Called') return t('card.clock.called');
        return visit?.queueNumber ? fill(t('card.stop.queue'), visit.queueNumber) : t('card.stop.later');
    };

    const menuItem = 'w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm font-semibold text-ink text-left hover:bg-elevated cursor-pointer';
    const run = (fn: () => void) => () => { setMenuOpen(false); fn(); };

    return (
        <>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                <button type="button" onClick={onBack}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />{t('common.back')}
                </button>
                <h1 className="text-xl font-bold text-ink">{t('patients.details.title')}</h1>
            </div>

            <section aria-labelledby="pt-name" className="bg-surface border border-line rounded-[28px] p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
                    <span className="shrink-0 w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full bg-surface border-[3px] border-primary-500 grid place-items-center overflow-hidden text-lg sm:text-[22px] font-bold text-ink">
                        {patient.avatarUrl
                            ? <img src={getFileUrl('patient-avatar', patient.id)} alt="" className="w-full h-full object-cover" />
                            : `${patient.lastName?.[0] || ''}${patient.firstName?.[0] || ''}`.toUpperCase()}
                    </span>

                    <div className="flex-1 basis-48 sm:basis-80 min-w-0 flex flex-col gap-1.5">
                        <h2 id="pt-name" className="text-xl sm:text-2xl leading-tight font-bold tracking-tight text-ink">
                            {patient.lastName} {patient.firstName}
                        </h2>
                        <p className="text-[13px] text-muted" title={patient.dob ? formatDobDDMMYYYY(patient.dob) : undefined}>{meta}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {allergies.length > 0 && (
                                <span className={`${chip} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`}>
                                    {fill(t('card.allergy'), allergies.map(a => a.substance).join(', '))}
                                </span>
                            )}
                            {allergiesUnknown && (
                                <span role="alert" className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}>
                                    {t('card.allergyUnknown')}
                                </span>
                            )}
                            {chronic.map(c => (
                                <span key={c.id} title={c.code} className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}>
                                    {c.name}
                                </span>
                            ))}
                            {patient.status === 'Archived' && (
                                <span className={`${chip} bg-elevated text-muted`}>{t('patients.filter.archived')}</span>
                            )}
                            {patient.doctorName && (
                                <span className={`${chip} bg-elevated text-muted`}>{fill(t('card.doctorChip'), patient.doctorName)}</span>
                            )}
                            {due > 0 ? (
                                <button type="button" onClick={onOpenPayments}
                                    className={`${chip} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60`}>
                                    {fill(t('card.debt'), formatNumber(due))}
                                </button>
                            ) : (
                                <span className={`${chip} bg-elevated text-muted`}>{t('card.noDebt')}</span>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 ml-auto flex items-center gap-4">
                        {clock && (
                            <p className="flex flex-col items-end leading-tight">
                                <span className={`text-3xl font-bold tracking-tight tabular-nums ${clock.live ? 'text-primary-700 dark:text-primary-300' : 'text-ink'}`}>{clock.big}</span>
                                <span className={`text-[11px] font-bold ${clock.live ? 'text-primary-700 dark:text-primary-300' : 'text-muted'}`}>{clock.note}</span>
                            </p>
                        )}
                        <div ref={menuRef} className="relative">
                            <button type="button" ref={menuButtonRef} onClick={() => setMenuOpen(o => !o)}
                                aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t('card.menu')} title={t('card.menu')}
                                className="w-10 h-10 grid place-items-center rounded-xl border border-line text-muted hover:text-ink hover:bg-elevated">
                                <MoreHorizontal className="w-5 h-5" />
                            </button>
                            {menuOpen && (
                                <div role="menu" aria-label={t('card.menu')} onKeyDown={onMenuKey}
                                    className="absolute right-0 top-12 z-30 w-64 p-1.5 rounded-2xl border border-line bg-surface shadow-xl">
                                    <button type="button" role="menuitem" className={menuItem} onClick={run(onEdit)}>
                                        <Edit className="w-4 h-4 text-muted" />{t('patients.details.editProfile')}
                                    </button>
                                    <button type="button" role="menuitem" className={menuItem} onClick={run(onMessage)}>
                                        <Send className="w-4 h-4 text-muted" />{t('patients.details.sendMessage')}
                                    </button>
                                    <button type="button" role="menuitem" className={menuItem} onClick={run(onAssignDoctor)}>
                                        <UserPlus className="w-4 h-4 text-muted" />
                                        {patient.doctorId ? t('patients.details.changeDoctor') : t('patients.details.assignDoctor')}
                                    </button>
                                    <button type="button" role="menuitem" className={menuItem} onClick={run(onPrintCard)}>
                                        <Printer className="w-4 h-4 text-muted" />{t('patientdetails.karta_vipiska')}
                                    </button>
                                    {/* Tugma, `<label>` emas: yashirin fayl maydoni klaviaturadan
                                        topilmaydi. Maydonning o'zi menyudan tashqarida — menyu
                                        yopilgach ham tanlangan faylni qabul qila olsin. */}
                                    <button type="button" role="menuitem" className={menuItem}
                                        onClick={run(() => photoInputRef.current?.click())}>
                                        <Camera className="w-4 h-4 text-muted" />{t('card.menuPhoto')}
                                    </button>
                                </div>
                            )}
                            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file) onUploadPhoto(file);
                                }} />
                        </div>
                    </div>
                </div>

                {/* Bitta bekatli qabul marshrut emas — yo'l chizilmaydi */}
                {stops.length > 1 && (
                    <div className="mt-5 flex flex-col lg:flex-row lg:items-stretch gap-x-4 gap-y-3">
                        <p className="lg:w-32 shrink-0 flex lg:flex-col lg:justify-center items-center lg:items-start gap-x-2 gap-y-0.5">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                                <Footprints className="w-4 h-4" aria-hidden="true" />{t('route.ticket')}
                            </span>
                            <span className="text-xs font-semibold text-muted">{fill(t('card.routeToday'), stops.length)}</span>
                        </p>
                        <ol aria-label={t('route.ticket')} className="flex-1 min-w-0 flex gap-2 overflow-x-auto pt-1.5 pb-1">
                            {stops.map((s, index) => {
                                const isLast = index === stops.length - 1;
                                return (
                                    <li key={`${s.kind}-${index}`} aria-current={s.state === 'now' ? 'step' : undefined}
                                        className="relative flex-1 basis-0 min-w-[112px] flex flex-col items-center text-center">
                                        {!isLast && (
                                            <span aria-hidden="true"
                                                className={`absolute top-[21px] left-1/2 w-[calc(100%+0.5rem)] border-t-2 ${s.state === 'done' ? 'border-emerald-300 dark:border-emerald-800' : 'border-dashed border-line'}`} />
                                        )}
                                        <span className={`relative w-11 h-11 rounded-full bg-surface grid place-items-center text-sm font-bold ${s.state === 'done'
                                            ? 'border-[2.5px] border-emerald-600 text-emerald-700 dark:text-emerald-400'
                                            : s.state === 'now' ? 'border-[3px] border-primary-600 text-ink'
                                                : 'border-2 border-dashed border-line text-muted'}`}>
                                            {s.state === 'done' ? <Check className="w-5 h-5" aria-hidden="true" /> : index + 1}
                                            {s.state === 'now' && (
                                                <span aria-hidden="true" className="absolute -inset-1.5 rounded-full border-2 border-primary-500 animate-pulse" />
                                            )}
                                        </span>
                                        <span className={`mt-1.5 max-w-full px-1 text-[12.5px] font-bold truncate ${s.state === 'next' ? 'text-muted' : 'text-ink'}`}>
                                            {stopName(s)}
                                        </span>
                                        <span className={`max-w-full px-1 text-[11px] font-semibold truncate ${s.state === 'now'
                                            ? (s.kind === 'cashier' ? 'text-amber-700 dark:text-amber-400' : 'text-primary-700 dark:text-primary-300')
                                            : 'text-muted'}`}>
                                            {stopNote(s)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                )}
            </section>
        </>
    );
};
