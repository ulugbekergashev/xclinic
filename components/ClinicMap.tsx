import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { Armchair, ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, Clock, Footprints, Loader2, Undo2, UserX, Volume2 } from 'lucide-react';
import { Appointment, Department, Doctor, Service, Visit } from '../types';
import { Card } from './Common';
import { LiveTimer } from './LiveTimer';
import { useLanguage, fill } from '../context/LanguageContext';
import { formatDateToISO } from '../utils/dateUtils';
import { formatNumber } from '../utils/format';
import { confirmAction } from '../services/confirm';
import {
    buildClinicFlow, FlowLane, flowIdOfAppointment, flowIdOfVisit, initialsOf, minutesOf,
    shortName, spreadPositions, visitLabel, visitName, waitedMinutes,
} from '../utils/flow';
import { routeProgress } from '../utils/visitRoute';

/* ─────────────────────────────────────────────────────────────────────────────
   «BUGUN KLINIKADA» — klinikaning jonli xaritasi: yo'l → kutish zali →
   kabinet. Har bemor ekranda bitta joyda turadi va holati o'zgarganda
   belgisi o'sha joydan yangisiga «uchib» o'tadi.

   denta7 dagi xaritadan ko'chirilgan; hisob `utils/flow.ts` da va u bu
   loyihaning o'z modeliga (`Visit` holatlari) tayanadi.

   KOMPONENT MA'LUMOT YUKLAMAYDI. Qabullar va yozuvlar tashqaridan keladi —
   «Bugun» ekrani ularni allaqachon yuklaydi va jonli yangilaydi; ikkinchi
   nusxa ikki xil raqam degani bo'lardi.

   TUGMALAR IXTIYORIY. Ishlovchi berilmasa tugma chizilmaydi — xarita faqat
   ko'rsatadi. «Bugun» ekranida u navbatni boshqaradi.

   IKKI KO'RINISH, BITTA KOMPONENT. Registrator va egada — butun klinika.
   Shifokorda — faqat o'z qatori (`pinDoctorId`, «Mening kabinetim»): unga
   o'z yozuvlari, o'z navbati va o'z kabineti beriladi, bo'sh bo'lsa ham
   qator chiziladi.

   YAKUNLASH TUGMASI YO'Q (denta7 da bor). Bu yerda qabulni yopish —
   shifokorning ishi: tashxis, to'lov va tahlil natijasi tekshiriladi
   (`PUT /api/visits/:id`, 409 VISIT_INCOMPLETE). Xaritadan «Ochish» bemor
   kartasiga olib boradi.
   ───────────────────────────────────────────────────────────────────────────── */

interface ClinicMapProps {
    /** Sarlavha. Berilmasa — «Bugun klinikada» */
    title?: string;
    /** Shu shifokorning qatori bemorsiz ham chiziladi — shifokorning o'z ekrani */
    pinDoctorId?: string;
    visits: Visit[];
    appointments: Appointment[];
    doctors: Doctor[];
    departments: Department[];
    services: Service[];
    /** Bemor kartasi (yo'ldagi bemor uchun — hali qabuli yo'q) */
    onPatientClick?: (patientId: string) => void;
    /** Qabul kartasi — navbatdagi va kabinetdagi bemor uchun */
    onOpenVisit?: (v: Visit) => void;
    /** «Keldi» — yozilgan bemor keldi: qabul ochiladi va navbatga tushadi */
    onArrived?: (a: Appointment) => Promise<void>;
    /** «Kelmadi» — vaqti o'tgan yozuv yopiladi, shifokor vaqti bo'shaydi */
    onNoShow?: (a: Appointment) => Promise<void>;
    /** «Chaqirish» — navbat tablosi va ovoz shu holatdan ishlaydi */
    onCall?: (v: Visit) => Promise<void>;
    /** «Kirdi» — bemor kabinetga kirdi */
    onEnter?: (v: Visit) => Promise<void>;
    /** Bo'sh kabinetdagi asosiy tugma yozuvi. Berilmasa — «Kirdi» (registratorning amali);
     *  shifokorda — «Qabulni boshlash»: u kartani ham ochadi */
    enterLabel?: string;
    /** Adashib bosilgan «Kirdi» — bemor navbatga qaytadi */
    onUndoEnter?: (v: Visit) => Promise<void>;
    /** Pastdagi «Barcha qabullar — Kalendar» havolasi */
    onSeeAll?: () => void;
    /** Sarlavhada yig'ish tugmasi. Holat shu brauzerda eslab qolinadi */
    collapsible?: boolean;
    /** Bemorning to'lanmagan summasi — belgi yonida ko'rinadi. Faqat pul oladiganlarga beriladi */
    dueOf?: (patientId: string) => number;
    /** Qatorlardan keyin, o'sha panel ichida chiziladigan qism — laboratoriya va
     *  statsionar zonalari (`TodayZones`). Bugun qabul bo'lmasa ham ko'rinadi */
    footer?: React.ReactNode;
}

/** Yo'l chizig'ida ko'rinadigan oyna — keyingi 3 soat */
const ROAD_WINDOW_MIN = 180;
/** Yo'ldagi bitta belgi kengligi (px): vaqt va «12 daq kech» belgisi, doira, ism, «Keldi» */
const ROAD_SLOT = 112;
/** Yo'l boshidagi «hozir» yozuvi uchun joy. Vaqti o'tgan yozuvlar aynan shu yerga to'planadi */
const ROAD_INSET = 26;
/** Navbat tufayli kechikish shu daqiqadan oshsa ogohlantiriladi */
const DELAY_WARN_MIN = 10;
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.9 };
// Pol naqshi (xarita ko'rinishi) — ikkala mavzuda ham yumshoq ko'rinadigan shaffof nuqtalar
const FLOOR_WARM: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(217,119,6,0.14) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_COOL: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(0,94,184,0.11) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const OPEN_KEY = 'xclinic_clinic_map_open';

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmmOf = (ms: number) => {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const hhmmOfMin = (min: number) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;

function useNow(ms: number): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), ms);
        return () => clearInterval(id);
    }, [ms]);
    return now;
}

function useMedia(query: string): boolean {
    const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    const [match, setMatch] = useState(get);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia(query);
        const on = () => setMatch(mq.matches);
        on();
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, [query]);
    return match;
}

const readOpen = (): boolean => {
    try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; }
};

/**
 * Bemor belgisi. layoutId orqali bir joydan boshqasiga «uchib» o'tadi:
 * yo'l → kutish zali → kabinet. Har bemor ekranda bitta joyda turadi.
 */
const Token: React.FC<{
    flowId: string;
    name: string;
    size: number;
    color: string;
    variant?: 'ring' | 'ghost';
    className?: string;
    title?: string;
    children?: React.ReactNode;
}> = ({ flowId, name, size, color, variant = 'ring', className = '', title, children }) => {
    const look = variant === 'ghost'
        ? 'border-[1.5px] border-dashed bg-surface text-muted'
        : 'border-[2.5px] bg-surface text-ink shadow-[0_8px_16px_-10px_rgba(17,24,39,0.45)]';
    return (
        <motion.span
            layoutId={`flow-${flowId}`}
            transition={SPRING}
            title={title}
            className={`relative shrink-0 inline-flex items-center justify-center rounded-full font-extrabold ${look} ${className}`}
            style={{ width: size, height: size, borderColor: color, fontSize: Math.round(size * 0.3) }}
        >
            {initialsOf(name)}
            {children}
        </motion.span>
    );
};

/** Bemor ismi — ishlovchi berilgan bo'lsa kartani ochadi */
const Name: React.FC<{ name: string; onOpen?: () => void; className?: string; short?: boolean }> = ({ name, onOpen, className = '', short }) => {
    const text = short ? shortName(name) : name;
    if (!onOpen) return <span className={`block truncate ${className}`}>{text}</span>;
    return (
        <button type="button" onClick={onOpen} title={name} className={`block max-w-full truncate text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${className}`}>
            {text}
        </button>
    );
};

export const ClinicMap: React.FC<ClinicMapProps> = ({
    title, pinDoctorId, visits, appointments, doctors, departments, services,
    onPatientClick, onOpenVisit, onArrived, onNoShow, onCall, onEnter, enterLabel, onUndoEnter, onSeeAll, collapsible, dueOf, footer,
}) => {
    const { t } = useLanguage();
    const now = useNow(30000);
    const wide = useMedia('(min-width: 1024px)');
    const xl = useMedia('(min-width: 1280px)');
    const xxl = useMedia('(min-width: 1536px)');
    const today = formatDateToISO(now);
    const nowMs = now.getTime();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const flow = useMemo(
        () => buildClinicFlow(visits, appointments, doctors, departments, services, today, nowMs, pinDoctorId),
        [visits, appointments, doctors, departments, services, today, nowMs, pinDoctorId]);
    const [hover, setHover] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    /** To'liq ochilgan navbat (kutish zalidagi bitta qator) — «+N» bosilganda */
    const [openLane, setOpenLane] = useState<string | null>(null);
    /* Qaysi qatorda «tekshiruvda»gilarning hammasi ochilgan */
    const [openAway, setOpenAway] = useState<ReadonlySet<string>>(new Set());
    const [open, setOpen] = useState(() => (collapsible ? readOpen() : true));

    const toggleOpen = () => setOpen(prev => {
        try { localStorage.setItem(OPEN_KEY, prev ? '0' : '1'); } catch { /* xotira yopiq — sessiya davomida ishlaydi */ }
        return !prev;
    });

    const run = async (key: string, fn: () => void | Promise<void>) => {
        if (pending) return;
        setPending(key);
        try {
            await fn();
        } catch {
            // Xatoni ishlovchining o'zi ko'rsatadi (toast)
        } finally {
            setPending(null);
        }
    };

    const fmtMin = (min: number) => {
        if (min < 60) return fill(t('flow.min'), min);
        const h = Math.floor(min / 60);
        const m = min % 60;
        return m ? fill(t('flow.hourMin'), h, m) : fill(t('flow.hour'), h);
    };
    const doctorLabel = (d: Doctor) => fill(t('flow.dr'), d.lastName);
    const laneLabel = (lane: FlowLane) => (lane.doctor ? doctorLabel(lane.doctor) : lane.department?.name || '—');
    const laneOf = (key: string) => flow.lanes.find(l => l.key === key);
    const laneOfAppt = (a: Appointment) => laneOf(a.doctorId) || laneOf(`dept:${a.departmentId || ''}`);
    const dimmed = (key?: string) => !!hover && hover !== key;
    const openVisit = (v: Visit) => (onOpenVisit ? () => onOpenVisit(v) : onPatientClick ? () => onPatientClick(v.patientId) : undefined);
    const openPatient = (a: Appointment) => (onPatientClick ? () => onPatientClick(a.patientId) : undefined);

    const waitText = (v: Visit) => {
        const m = waitedMinutes(v, nowMs);
        return m <= 0 ? t('flow.newArrival') : fmtMin(m);
    };
    /* To'lanmagan summa — navbat va kabinetdagi bemor yonida. Registrator
       bemorni chaqirayotganda ham, chiqarayotganda ham summani ko'rib turadi;
       ilgari bu belgi alohida navbat ro'yxatida edi. */
    const dueBadge = (patientId?: string, extra = '') => {
        const due = patientId && dueOf ? dueOf(patientId) : 0;
        if (!(due > 0)) return null;
        return (
            <span title={t('today.toPay')} className={`inline-block px-1.5 rounded-md border border-amber-500/25 bg-amber-500/12 text-[10px] leading-4 font-bold tabular-nums text-amber-700 dark:text-amber-400 ${extra}`}>
                {formatNumber(due)}
            </span>
        );
    };
    const waitTone = (m: number) => (m >= 30 ? 'text-red-600 dark:text-red-400' : m >= 15 ? 'text-amber-700 dark:text-amber-400' : 'text-muted');

    const lateOf = (a: Appointment) => Math.max(0, nowMin - minutesOf(a.time));
    const delayOf = (a: Appointment) => laneOfAppt(a)?.delays[a.id] || 0;

    const soon = flow.coming.filter(a => minutesOf(a.time) - nowMin <= ROAD_WINDOW_MIN);
    const seatsPerBench = xxl ? 5 : xl ? 4 : 3;

    // ── Kichik bo'laklar ──────────────────────────────────────────────

    const arriveButton = (a: Appointment, size: 'sm' | 'md') => onArrived && (
        <button
            type="button"
            onClick={() => run(a.id, () => onArrived(a))}
            disabled={!!pending}
            title={t('flow.arrivedHint')}
            aria-label={`${a.patientName}: ${t('ui.keldi')}`}
            className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-lg border border-primary-200 dark:border-primary-800 bg-surface text-primary-700 dark:text-primary-300 font-extrabold hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-50 transition-colors ${size === 'sm' ? 'h-[22px] px-2 text-[11px]' : 'h-8 px-3 text-xs'}`}
        >
            {pending === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('ui.keldi')}
        </button>
    );

    const markNoShow = async (a: Appointment) => {
        if (!onNoShow) return;
        const ok = await confirmAction({ title: fill(t('flow.noShowConfirm'), a.patientName), body: t('flow.noShowBody'), confirmLabel: t('ui.kelmadi') });
        if (ok) void run(`noshow:${a.id}`, () => onNoShow(a));
    };

    /** «Kelmadi» — faqat vaqti o'tgan yozuvda: kelajakdagi yozuvni bekor qilish kalendarning ishi */
    const noShowButton = (a: Appointment, size: 'sm' | 'md') => onNoShow && lateOf(a) > 0 && (
        <button
            type="button"
            onClick={() => markNoShow(a)}
            disabled={!!pending}
            title={t('ui.kelmadi')}
            aria-label={`${a.patientName}: ${t('ui.kelmadi')}`}
            className={`shrink-0 inline-flex items-center justify-center rounded-lg text-faint hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-900/20 disabled:opacity-50 transition-colors ${size === 'sm' ? 'w-[22px] h-[22px]' : 'w-8 h-8'}`}
        >
            {pending === `noshow:${a.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
        </button>
    );

    /** Vaqti o'tgan bo'lsa — qancha kechikdi; aks holda navbat tufayli qancha kech kiradi */
    const timeBadge = (a: Appointment) => {
        const late = lateOf(a);
        if (late > 0) {
            return (
                <span title={fill(t('flow.lateHint'), a.time)} className="shrink-0 h-4 px-1.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-extrabold leading-4 tabular-nums whitespace-nowrap">
                    {late < 60 ? fill(t('flow.lateMin'), late) : fill(t('flow.lateHour'), Math.floor(late / 60))}
                </span>
            );
        }
        const d = delayOf(a);
        if (d < DELAY_WARN_MIN) return null;
        return (
            <span title={fill(t('flow.delayHint'), hhmmOfMin(minutesOf(a.time) + d))} className="shrink-0 h-4 px-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold leading-4 tabular-nums whitespace-nowrap">
                {d < 60 ? fill(t('flow.delay'), d) : fill(t('flow.delayHour'), Math.floor(d / 60))}
            </span>
        );
    };

    const etaChip = (lane: FlowLane) => {
        const free = lane.etaMin <= 0;
        const cls = free
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : lane.etaMin >= 45
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-elevated text-muted';
        return (
            <span
                title={free ? t('flow.etaFreeHint') : fill(t('flow.etaHint'), fmtMin(lane.etaMin))}
                className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] font-extrabold whitespace-nowrap ${cls}`}
            >
                <Clock className="w-3 h-3" />
                {free ? t('flow.etaFree') : `~${fmtMin(lane.etaMin)}`}
            </span>
        );
    };

    /** Kabinet: kim qabulda, qancha vaqtdan beri, reja bo'yicha qancha qoldi */
    const cabinetBody = (lane: FlowLane, compact: boolean) => {
        const { chair, chairSince } = lane;
        const ring = compact ? 60 : 68;
        if (chair && chairSince) {
            const name = visitName(chair);
            const planMin = flow.plan[chair.id];
            const elapsedMin = Math.max(0, (nowMs - chairSince) / 60000);
            const over = elapsedMin > planMin;
            const progress = Math.min(1, elapsedMin / planMin);
            const r = ring / 2 - 3;
            const circ = 2 * Math.PI * r;
            const foot = over
                ? fill(t('flow.overPlan'), Math.max(1, Math.floor(elapsedMin - planMin)))
                : fill(t('flow.freesIn'), Math.max(1, Math.ceil(planMin - elapsedMin)));
            const ringEl = (
                <span className="relative shrink-0" style={{ width: ring, height: ring }}>
                    <svg viewBox={`0 0 ${ring} ${ring}`} width={ring} height={ring} className="-rotate-90" aria-hidden="true">
                        <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" strokeWidth={5} className="stroke-primary-100 dark:stroke-primary-900/70" />
                        <circle
                            cx={ring / 2} cy={ring / 2} r={r} fill="none" strokeWidth={5} strokeLinecap="round"
                            stroke={over ? '#F59E0B' : 'var(--x-primary)'}
                            strokeDasharray={`${(circ * progress).toFixed(1)} ${circ.toFixed(1)}`}
                            style={{ transition: 'stroke-dasharray 1s linear' }}
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center">
                        <Token flowId={flowIdOfVisit(chair)} name={name} size={ring - 16} color={lane.color} title={name} />
                    </span>
                </span>
            );
            const info = (
                <div className="flex-1 min-w-0">
                    <Name name={name} onOpen={openVisit(chair)} className={`${compact ? 'text-sm' : 'text-[15px]'} font-extrabold text-ink`} />
                    <p className="truncate text-xs text-muted">
                        {[visitLabel(chair, flow.booked[chair.id]), fill(t('flow.since'), hhmmOf(chairSince))].filter(Boolean).join(' · ')}
                    </p>
                    <p className={`truncate text-xs font-bold ${over ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}`}>{foot}</p>
                    {/* Ismma-ism va bosiladi: navbat ro'yxati olib tashlangach
                        bu qabullarga «Bugun» dan boshqa yo'l qolmagan edi. */}
                    {lane.chairOthers.length > 0 && (
                        <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-faint">
                            <span>{fill(t('flow.alsoInChair'), lane.chairOthers.length)}:</span>
                            {lane.chairOthers.map(v => (
                                <Name key={v.id} name={visitName(v)} short onOpen={openVisit(v)} className="font-bold text-muted" />
                            ))}
                        </p>
                    )}
                    {dueBadge(chair.patientId, 'mt-0.5')}
                </div>
            );
            const timer = (
                <>
                    <LiveTimer since={chairSince} className={`${compact ? 'text-xl' : 'text-2xl'} font-black leading-none tabular-nums tracking-tight ${over ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`} />
                    <span className="text-[11px] font-bold text-faint whitespace-nowrap">{fill(t('flow.plan'), planMin)}</span>
                </>
            );
            const actions = (onUndoEnter || onOpenVisit) && (
                <div className="flex items-center gap-1">
                    {onUndoEnter && (
                        <button
                            type="button"
                            onClick={() => run(`undo:${chair.id}`, () => onUndoEnter(chair))}
                            disabled={!!pending}
                            title={t('flow.undoEnter')}
                            aria-label={`${name}: ${t('flow.undoEnter')}`}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-line bg-surface text-faint hover:text-ink disabled:opacity-50 transition-colors"
                        >
                            {pending === `undo:${chair.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    {onOpenVisit && (
                        <button
                            type="button"
                            onClick={() => onOpenVisit(chair)}
                            aria-label={fill(t('flow.openHint'), name)}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-surface text-primary-700 dark:text-primary-300 text-xs font-extrabold hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                        >
                            {t('flow.open')}
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            );
            // Telefonda tugmalar alohida qatorda — ism qisqarib ketmasin
            if (compact) {
                return (
                    <div className="w-full min-w-0">
                        <div className="flex items-center gap-3">
                            {ringEl}
                            {info}
                            <div className="shrink-0 flex flex-col items-end gap-1">{timer}</div>
                        </div>
                        {actions && <div className="mt-2.5 flex justify-end">{actions}</div>}
                    </div>
                );
            }
            return (
                <>
                    {ringEl}
                    {info}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                        {timer}
                        {actions && <div className="mt-1">{actions}</div>}
                    </div>
                </>
            );
        }
        const next = lane.queue[0];
        const booked = lane.coming.find(a => lateOf(a) === 0);
        const hint = next
            ? fill(t('flow.nextInQueue'), shortName(visitName(next)), waitText(next))
            : booked
                ? fill(t('flow.nextBooked'), booked.time, shortName(booked.patientName))
                : t('flow.noMore');
        const enterHint = next
            ? (enterLabel ? `${visitName(next)}: ${enterLabel}` : fill(t('flow.enterHint'), visitName(next)))
            : '';
        const seatEl = (
            <span className="shrink-0 rounded-full border-2 border-dashed border-primary-200 dark:border-primary-800 bg-surface/70 flex items-center justify-center text-primary-300 dark:text-primary-700" style={{ width: ring, height: ring }}>
                <Armchair className="w-7 h-7" strokeWidth={1.8} />
            </span>
        );
        const freeInfo = (
            <div className="flex-1 min-w-0">
                <p className={`${compact ? 'text-sm' : 'text-[15px]'} font-extrabold text-primary-700 dark:text-primary-300`}>{t('flow.chairFree')}</p>
                <p className="truncate text-xs text-muted">{hint}</p>
            </div>
        );
        const enterButton = next && onEnter && (
            <button
                type="button"
                onClick={() => run(`in:${next.id}`, () => onEnter(next))}
                disabled={!!pending}
                title={enterHint}
                aria-label={enterHint}
                className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-[12.5px] font-extrabold active:scale-95 disabled:opacity-60 transition-all"
            >
                {pending === `in:${next.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (enterLabel || t('flow.enter'))}
                <ArrowRight className="w-3.5 h-3.5" />
            </button>
        );
        // Telefonda tugma alohida qatorda — «Qabulni boshlash» yozuvni siqib qo'ymasin
        if (compact) {
            return (
                <div className="w-full min-w-0">
                    <div className="flex items-center gap-3">
                        {seatEl}
                        {freeInfo}
                    </div>
                    {enterButton && <div className="mt-2.5 flex justify-end">{enterButton}</div>}
                </div>
            );
        }
        return (
            <>
                {seatEl}
                {freeInfo}
                {enterButton}
            </>
        );
    };

    const cabinetTitle = (lane: FlowLane) => {
        if (!lane.doctor) return lane.department?.name || '—';
        const room = lane.doctor.room ? ` ${lane.doctor.room}` : '';
        const spec = lane.doctor.specialty || lane.department?.name || '';
        return `${t('flow.cabinet')}${room} · ${doctorLabel(lane.doctor)}${spec ? ` · ${spec}` : ''}`;
    };

    const cabinetShell = (lane: FlowLane, compact: boolean) => {
        const over = !!(lane.chair && lane.chairSince && (nowMs - lane.chairSince) / 60000 > flow.plan[lane.chair.id]);
        const tone = lane.chair
            ? over
                ? 'border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20'
                : 'border-primary-200 dark:border-primary-800/60 bg-primary-50/60 dark:bg-primary-900/15'
            : 'border-line bg-elevated/40';
        return (
            <div className={`relative h-full flex items-center gap-4 ${compact ? 'p-3' : 'pl-5 pr-4 py-3'} rounded-[22px] border-[1.5px] transition-colors ${tone}`} style={FLOOR_COOL}>
                {!compact && <span aria-hidden="true" className="absolute -left-[2px] top-1/2 -translate-y-1/2 w-1 h-9 bg-surface" />}
                {!compact && (
                    <span className="absolute -top-2.5 left-5 max-w-[calc(100%-2.5rem)] inline-flex items-center gap-1.5 h-[18px] px-2 rounded-md bg-surface text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
                        <span className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} />
                        <span className="truncate">{cabinetTitle(lane)}</span>
                    </span>
                )}
                {cabinetBody(lane, compact)}
            </div>
        );
    };

    /** Kutish zalidagi bitta bemor */
    const seated = (lane: FlowLane, v: Visit, index: number, size: number) => {
        const name = visitName(v);
        const waited = waitedMinutes(v, nowMs);
        const called = v.status === 'Called';
        const nextUp = index === 0 && !lane.chair;
        return (
            <div key={v.id} className="shrink-0 w-20 flex flex-col items-center">
                <Token
                    flowId={flowIdOfVisit(v)}
                    name={name}
                    size={size}
                    color={lane.color}
                    title={[name, visitLabel(v, flow.booked[v.id])].filter(Boolean).join(' — ')}
                    className={`mt-1.5 ${waited >= 30 ? 'ring-4 ring-red-500/15' : ''}`}
                >
                    {(nextUp || called) && <span aria-hidden="true" className="absolute -inset-1.5 rounded-full border-2 border-primary-400 animate-pulse" />}
                    <span aria-hidden="true" className={`absolute -top-1.5 -right-2 min-w-[20px] h-5 px-1 rounded-full border-2 border-amber-50 dark:border-surface text-[10.5px] font-black leading-4 text-center text-white ${index === 0 ? 'bg-primary-600' : 'bg-slate-400 dark:bg-slate-600'}`}>
                        {v.queueNumber ?? index + 1}
                    </span>
                </Token>
                <Name name={name} onOpen={openVisit(v)} short className="mt-1.5 text-[11.5px] font-bold text-ink" />
                <span className={`text-[11px] font-bold whitespace-nowrap ${called ? 'text-primary-600 dark:text-primary-400' : waitTone(waited)}`}>
                    {called ? t('flow.called') : waitText(v)}
                </span>
                {dueBadge(v.patientId)}
                {onCall && (
                    <button
                        type="button"
                        onClick={() => run(`call:${v.id}`, () => onCall(v))}
                        disabled={!!pending}
                        title={called ? t('flow.recall') : t('flow.call')}
                        aria-label={`${name}: ${called ? t('flow.recall') : t('flow.call')}`}
                        className="mt-0.5 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md text-[10.5px] font-bold text-faint hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-300 dark:hover:bg-primary-900/30 disabled:opacity-50 transition-colors"
                    >
                        {pending === `call:${v.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                        {called ? t('flow.recallShort') : t('flow.call')}
                    </button>
                )}
            </div>
        );
    };

    /* Qatorga sig'maganlar «+N» ortida turadi. U TUGMA: bosilsa qator to'liq
       ochiladi. Ilgari yashirin bemorlarga yonidagi navbat ro'yxatidan
       borilardi; ro'yxat olib tashlangach xaritaning o'zi shu ishni qilishi
       kerak — aks holda beshinchi bo'lib kelgan bemorni chaqirib bo'lmaydi. */
    const benchSeats = (lane: FlowLane, slots: number, size: number) => {
        const all = openLane === lane.key;
        const overflow = lane.queue.length > slots;
        const visible = overflow && !all ? lane.queue.slice(0, slots - 1) : lane.queue;
        const hidden = lane.queue.length - visible.length;
        const empty = Math.max(0, slots - visible.length - (hidden > 0 ? 1 : 0));
        return (
            <>
                {visible.map((v, i) => seated(lane, v, i, size))}
                {hidden > 0 && (
                    <button type="button" onClick={() => setOpenLane(lane.key)} aria-expanded={false}
                        aria-label={`${laneLabel(lane)}: ${fill(t('flow.showAllWaiting'), hidden)}`}
                        className="shrink-0 w-20 flex flex-col items-center group">
                        <span className="mt-1.5 inline-flex items-center justify-center rounded-full border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-sm font-black group-hover:border-amber-500 transition-colors" style={{ width: size, height: size }}>+{hidden}</span>
                        <span className="mt-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">{t('flow.moreWaiting')}</span>
                    </button>
                )}
                {all && overflow && (
                    <button type="button" onClick={() => setOpenLane(null)} aria-expanded={true}
                        aria-label={`${laneLabel(lane)}: ${t('flow.collapseLane')}`}
                        className="shrink-0 w-20 flex flex-col items-center text-amber-700 dark:text-amber-400">
                        <span className="mt-1.5 inline-flex items-center justify-center rounded-full border-2 border-dashed border-amber-300 dark:border-amber-700" style={{ width: size, height: size }}><ChevronUp className="w-4 h-4" /></span>
                        <span className="mt-1.5 text-[11px] font-bold">{t('flow.collapseLane')}</span>
                    </button>
                )}
                {Array.from({ length: empty }, (_, i) => (
                    <div key={`empty-${i}`} aria-hidden="true" className="shrink-0 w-20 flex justify-center">
                        <Armchair className="mt-4 w-8 h-8 text-amber-200/90 dark:text-amber-900/60" strokeWidth={1.6} />
                    </div>
                ))}
            </>
        );
    };

    /* TEKSHIRUVDAGILAR. Bemor tahlil yoki UZI ga ketgan — navbatda ham,
       kabinetda ham yo'q, lekin klinikada va shu shifokorga qaytadi. Ilgari
       ular faqat tepada bitta son edi («4 natija kutmoqda»): kim, kimning
       bemori va marshrutning qayerida ekani ko'rinmasdi — «yo'qolgan bemor».
       Endi har biri shifokor qatorida: ismi va «1/3» (nechta bekatdan
       nechtasi o'tildi). Bosilsa — kartasi. */
    const awayChips = (lane: FlowLane) => {
        if (lane.away.length === 0) return null;
        /* Uchtadan ko'pi «+N» ortida — u TUGMA: bosilsa hammasi ochiladi.
           Bosilmaydigan son bo'lsa, to'rtinchi bemor yana «yo'qolardi». */
        const all = openAway.has(lane.key);
        const shown = all ? lane.away : lane.away.slice(0, 3);
        const hidden = lane.away.length - shown.length;
        return (
            <span className="mt-1 flex flex-wrap items-center gap-1">
                {shown.map(v => {
                    const name = visitName(v);
                    const p = routeProgress(v);
                    const label = `${name}: ${t('flow.away')}${p ? ` · ${p.done}/${p.total}` : ''}`;
                    const cls = 'inline-flex items-center gap-1 h-5 pl-1.5 pr-1.5 rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 text-[10.5px] font-bold text-purple-700 dark:text-purple-300';
                    const body = <>{initialsOf(name)}{p && <span className="tabular-nums opacity-80">{p.done}/{p.total}</span>}</>;
                    return onOpenVisit
                        ? <button key={v.id} type="button" title={label} aria-label={label} onClick={() => onOpenVisit(v)} className={`${cls} hover:border-purple-400`}>{body}</button>
                        : <span key={v.id} title={label} className={cls}>{body}</span>;
                })}
                {hidden > 0 && (
                    <button type="button" onClick={() => setOpenAway(prev => new Set(prev).add(lane.key))} aria-expanded={false}
                        aria-label={`${laneLabel(lane)}: ${fill(t('flow.awayMore'), hidden)}`} title={fill(t('flow.awayMore'), hidden)}
                        className="h-5 px-1.5 rounded-md border border-dashed border-purple-300 dark:border-purple-700 text-[10.5px] font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30">
                        +{hidden}
                    </button>
                )}
                {all && lane.away.length > 3 && (
                    <button type="button" onClick={() => setOpenAway(prev => { const next = new Set(prev); next.delete(lane.key); return next; })} aria-expanded={true}
                        aria-label={`${laneLabel(lane)}: ${t('flow.collapseLane')}`} title={t('flow.collapseLane')}
                        className="h-5 w-5 inline-flex items-center justify-center rounded-md border border-dashed border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30">
                        <ChevronUp className="w-3 h-3" />
                    </button>
                )}
            </span>
        );
    };

    const benchLabel = (lane: FlowLane, withName = true) => {
        const longest = lane.queue.reduce((m, v) => Math.max(m, waitedMinutes(v, nowMs)), 0);
        return (
            <>
                {withName && (
                    <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lane.color }} />
                        <span className="truncate text-[13px] font-extrabold text-ink">{laneLabel(lane)}</span>
                    </span>
                )}
                <span className={`block truncate text-[11.5px] font-bold ${waitTone(longest)}`}>
                    {lane.queue.length ? fill(t('flow.queueCount'), lane.queue.length) : t('flow.queueEmpty')}
                </span>
                {awayChips(lane)}
            </>
        );
    };

    /** Yo'ldagi bemor — ixcham kartochka (telefonda va «keyinroq» ro'yxatida) */
    const roadChip = (a: Appointment) => (
        <div key={a.id} className={`shrink-0 flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-2xl border border-dashed border-faint/50 bg-surface ${dimmed(laneOfAppt(a)?.key) ? 'opacity-30' : ''}`}>
            <Token flowId={flowIdOfAppointment(a)} name={a.patientName} size={32} variant="ghost" color={lateOf(a) > 0 ? '#F87171' : '#94A3B8'} />
            <div className="min-w-0 max-w-[130px]">
                <p className="flex items-center gap-1 text-[11.5px] font-extrabold text-ink tabular-nums">{a.time}{timeBadge(a)}</p>
                <Name name={a.patientName} onOpen={openPatient(a)} short className="text-xs font-bold text-muted" />
            </div>
            {arriveButton(a, 'md')}
            {noShowButton(a, 'md')}
        </div>
    );

    // ── Yo'l: yaqin 3 soatda keladiganlar ───────────────────────────────

    const trackRef = useRef<HTMLDivElement>(null);
    const [trackW, setTrackW] = useState(800);
    useLayoutEffect(() => {
        const el = trackRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => setTrackW(entry.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, [wide, open]);
    const roadFit = Math.max(1, Math.floor((trackW - ROAD_INSET) / ROAD_SLOT));
    const onRoad = soon.slice(0, roadFit);
    const offRoad = flow.coming.slice(onRoad.length);
    const roadPositions = useMemo(() => {
        const half = ROAD_SLOT / 2;
        const usable = Math.max(1, trackW - ROAD_INSET - ROAD_SLOT);
        const ideal = onRoad.map(a => (minutesOf(a.time) - nowMin) / ROAD_WINDOW_MIN);
        return spreadPositions(ideal, ROAD_SLOT / usable).map(p => ROAD_INSET + half + p * usable);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRoad.map(a => `${a.id}@${a.time}`).join(','), trackW, nowMin]);

    const roadDesktop = (
        <>
            <div className="mt-4 flex items-stretch gap-4 h-[100px]">
                <div className="w-36 shrink-0 flex flex-col justify-center gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                        <Footprints className="w-4 h-4" /> {t('flow.road')}
                    </span>
                    <span className="text-xs font-semibold text-muted">
                        <b className="text-xl font-black text-ink tabular-nums">{soon.length}</b> {t('flow.roadMeta')}
                    </span>
                </div>
                <div ref={trackRef} className="relative flex-1 min-w-0">
                    <span aria-hidden="true" className="absolute left-0 right-0 top-[37px] border-t-2 border-dashed border-faint/40" />
                    <span aria-hidden="true" className="absolute -left-1.5 top-[31px] flex w-3.5 h-3.5">
                        <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                        <span className="relative w-3.5 h-3.5 rounded-full bg-emerald-500 ring-4 ring-surface" />
                    </span>
                    <span className="absolute -left-2 top-[54px] text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">{t('flow.now')}</span>
                    <span aria-hidden="true" className="absolute -right-1 top-[34px] w-2 h-2 rounded-full bg-faint/60" />
                    <span className="absolute -right-2 top-[54px] text-[11px] font-bold text-faint tabular-nums">{hhmmOfMin(nowMin + ROAD_WINDOW_MIN)}</span>
                    {onRoad.length === 0 && (
                        <div className="absolute inset-x-10 top-[46px] flex items-center justify-center">
                            <span className="px-2 bg-surface text-xs font-semibold text-faint">{t('flow.roadEmpty')}</span>
                        </div>
                    )}
                    {onRoad.map((a, i) => {
                        const lane = laneOfAppt(a);
                        const late = lateOf(a) > 0;
                        return (
                            <div
                                key={a.id}
                                className={`absolute top-0 flex flex-col items-center transition-[left,opacity] duration-700 ${dimmed(lane?.key) ? 'opacity-30' : ''}`}
                                style={{ left: roadPositions[i], width: ROAD_SLOT - 4, marginLeft: -(ROAD_SLOT - 4) / 2 }}
                            >
                                <span className="h-4 inline-flex items-center gap-1 text-[11.5px] font-extrabold text-ink tabular-nums whitespace-nowrap">
                                    {a.time}
                                    {a.status === 'Confirmed' && !late && <Check className="w-3 h-3 text-emerald-500" strokeWidth={3} aria-label={t('flow.confirmed')} />}
                                    {timeBadge(a)}
                                </span>
                                <Token
                                    flowId={flowIdOfAppointment(a)} name={a.patientName} size={36} variant="ghost"
                                    color={late || delayOf(a) >= DELAY_WARN_MIN ? '#F87171' : '#94A3B8'}
                                    title={[a.patientName, lane ? laneLabel(lane) : a.doctorName, a.type].filter(Boolean).join(' — ')}
                                    className="mt-1"
                                >
                                    <span aria-hidden="true" className="absolute -right-1 -bottom-1 w-3 h-3 rounded-full border-2 border-surface" style={{ backgroundColor: lane?.color || '#94A3B8' }} />
                                </Token>
                                <Name name={a.patientName} onOpen={openPatient(a)} short className="mt-1 text-xs font-bold text-ink" />
                                <span className="mt-0.5 flex items-center gap-0.5">{arriveButton(a, 'sm')}{noShowButton(a, 'sm')}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="w-36 shrink-0 pl-3 flex flex-col justify-center items-end gap-0.5 text-right">
                    {offRoad.length > 0 && (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowAll(x => !x)}
                                aria-expanded={showAll}
                                className="inline-flex items-center gap-1 text-[12.5px] font-extrabold text-ink hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            >
                                {fill(t('flow.later'), offRoad.length)}
                                {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <span className="max-w-full truncate text-[11.5px] font-semibold text-faint">
                                {offRoad.slice(0, 2).map(a => `${a.time} ${shortName(a.patientName)}`).join(', ')}
                            </span>
                        </>
                    )}
                </div>
            </div>
            {/* Yo'lga sig'maganlar. Kech soatga yozilgan bemor erta kelsa ham
                «Keldi» shu yerdan bosiladi — kalendarga o'tish shart emas. */}
            {showAll && offRoad.length > 0 && (
                <div className="mt-1 mb-2 flex flex-wrap gap-2">{offRoad.map(roadChip)}</div>
            )}
        </>
    );

    const roadMobile = (
        <div className="mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                    <Footprints className="w-4 h-4" /> {t('flow.road')} · {flow.coming.length}
                </span>
            </div>
            {flow.coming.length === 0 ? (
                <p className="text-xs text-faint">{t('flow.roadEmpty')}</p>
            ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
                    {flow.coming.map(roadChip)}
                </div>
            )}
        </div>
    );

    // ── Kutish zali + kabinetlar ─────────────────────────────────────

    const mapDesktop = (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1.15fr)]">
            {flow.lanes.map((lane, i) => {
                const first = i === 0;
                const last = i === flow.lanes.length - 1;
                const hoverProps = {
                    onMouseEnter: () => setHover(lane.key),
                    onMouseLeave: () => setHover(null),
                };
                return (
                    <React.Fragment key={lane.key}>
                        <div
                            {...hoverProps}
                            className={`relative px-4 border-x-[1.5px] border-amber-200/80 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 ${first ? 'pt-4 rounded-t-3xl border-t-[1.5px]' : 'pt-3'} ${last ? 'pb-4 rounded-b-3xl border-b-[1.5px]' : 'pb-3'}`}
                            style={FLOOR_WARM}
                        >
                            {!first && <span aria-hidden="true" className="absolute left-3 right-3 top-0 border-t-[1.5px] border-dashed border-amber-200/90 dark:border-amber-900/40" />}
                            {first && (
                                <>
                                    <span className="absolute -top-2.5 left-5 z-10 h-[18px] px-2 rounded-md bg-surface text-[10.5px] font-extrabold uppercase tracking-wider leading-[18px] whitespace-nowrap text-amber-800 dark:text-amber-300">
                                        {t('flow.hall')} · {fill(t('flow.hallCount'), flow.counts.waiting)}
                                    </span>
                                    <span aria-hidden="true" className="absolute -top-[2px] right-10 w-16 h-1 bg-surface" />
                                    <span className="absolute -top-2.5 right-[6.75rem] z-10 h-[18px] px-1.5 rounded-md bg-surface text-[10px] font-extrabold uppercase tracking-wider leading-[18px] text-amber-600/80 dark:text-amber-400/80">{t('flow.door')}</span>
                                </>
                            )}
                            <span aria-hidden="true" className="absolute -right-[2px] top-1/2 -translate-y-1/2 w-1 h-9 bg-surface" />
                            <div className="flex items-center gap-3 min-h-[96px]">
                                <div className="w-28 shrink-0 min-w-0 flex flex-col gap-0.5">
                                    {benchLabel(lane)}
                                    <span className="mt-1">{etaChip(lane)}</span>
                                </div>
                                {/* Navbatdagi birinchi eshikka (kabinetga) eng yaqin o'tiradi */}
                                <div className={`flex-1 min-w-0 flex flex-row-reverse items-center justify-start gap-1 ${openLane === lane.key ? 'flex-wrap gap-y-3 py-1' : ''}`}>
                                    {benchSeats(lane, seatsPerBench, 44)}
                                </div>
                            </div>
                        </div>
                        <div aria-hidden="true" className="relative flex items-center justify-center">
                            <span className={`absolute left-1/2 -translate-x-1/2 border-l-2 border-dashed border-line ${first ? 'top-1/2' : 'top-0'} ${last ? 'bottom-1/2' : 'bottom-0'}`} />
                            <span className="relative w-7 h-7 rounded-full bg-surface border-[1.5px] border-line text-faint flex items-center justify-center">
                                <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                        </div>
                        <div {...hoverProps} className={`${first ? '' : 'pt-1.5'} ${last ? '' : 'pb-1.5'}`}>
                            {cabinetShell(lane, false)}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );

    const mapMobile = (
        <div className="mt-4 space-y-3">
            {flow.lanes.map(lane => (
                <div key={lane.key} className="rounded-3xl border border-line overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                        <span className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: lane.color }} />
                            <span className="truncate text-sm font-extrabold text-ink">{laneLabel(lane)}</span>
                            {lane.doctor?.specialty && <span className="truncate text-xs text-faint">{lane.doctor.specialty}</span>}
                        </span>
                        {etaChip(lane)}
                    </div>
                    <div className="p-3">{cabinetShell(lane, true)}</div>
                    <div className="px-3.5 pb-3 pt-2 bg-amber-50/70 dark:bg-amber-950/20 border-t border-amber-100 dark:border-amber-900/40" style={FLOOR_WARM}>
                        <div className="mb-1">{benchLabel(lane, false)}</div>
                        {lane.queue.length > 0 && (
                            <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
                                {lane.queue.map((v, i) => seated(lane, v, i, 40))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    const legendItem = (dot: React.ReactNode, n: number, label: string) => (
        <span className="inline-flex items-center gap-1.5">{dot}<b className="font-extrabold text-ink tabular-nums">{n}</b> {label}</span>
    );
    const legend = (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
            {legendItem(<span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-dashed border-faint" />, flow.counts.coming, t('flow.legend.coming'))}
            {legendItem(<span className="w-2.5 h-2.5 rounded-full bg-amber-500" />, flow.counts.waiting, t('flow.legend.waiting'))}
            {legendItem(<span className="w-2.5 h-2.5 rounded-full bg-primary-600" />, flow.counts.inChair, t('flow.legend.inChair'))}
            {/* Natija kutayotganlar navbatda ham, kabinetda ham emas — nol bo'lsa ko'rsatilmaydi */}
            {flow.counts.awaiting > 0 && legendItem(<span className="w-2.5 h-2.5 rounded-full bg-purple-500" />, flow.counts.awaiting, t('flow.legend.awaiting'))}
            {legendItem(<span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />, flow.counts.done, t('flow.legend.done'))}
        </div>
    );

    const hasAnyone = flow.lanes.length > 0 || flow.coming.length > 0;

    return (
        <Card className="p-5 sm:p-6">
            <MotionConfig reducedMotion="user">
                <LayoutGroup>
                    <section aria-labelledby="clinic-map-title">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <h2 id="clinic-map-title" className="text-lg font-black text-ink">{title || t('flow.title')}</h2>
                                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold tracking-wide tabular-nums">
                                    <span className="relative flex w-2 h-2">
                                        <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                                        <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
                                    </span>
                                    {t('flow.live')} · {hhmmOfMin(nowMin)}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {legend}
                                {collapsible && (
                                    <button
                                        type="button"
                                        onClick={toggleOpen}
                                        aria-expanded={open}
                                        aria-label={open ? t('flow.collapse') : t('flow.expand')}
                                        title={open ? t('flow.collapse') : t('flow.expand')}
                                        className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg border border-line text-faint hover:text-ink transition-colors"
                                    >
                                        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                )}
                            </div>
                        </div>

                        {open && (
                            <>
                                {doctors.length === 0 ? (
                                    <p className="mt-4 text-sm text-muted">{t('flow.noDoctors')}</p>
                                ) : !hasAnyone ? (
                                    <div className="mt-5 p-5 rounded-3xl border-2 border-dashed border-line">
                                        <p className="text-sm font-semibold text-muted">{t('flow.empty')}</p>
                                    </div>
                                ) : (
                                    <>
                                        {wide ? roadDesktop : roadMobile}
                                        {flow.lanes.length > 0 && (wide ? mapDesktop : mapMobile)}
                                    </>
                                )}

                                {footer}

                                {(flow.idle.length > 0 || onSeeAll) && (
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                                        {flow.idle.length > 0 ? (
                                            <span className="text-muted">
                                                {t('flow.freeNow')}: <b className="font-extrabold text-ink">{flow.idle.map(doctorLabel).join(', ')}</b>
                                            </span>
                                        ) : <span />}
                                        {onSeeAll && (
                                            <button type="button" onClick={onSeeAll} className="inline-flex items-center gap-1 font-bold text-primary-600 dark:text-primary-400 hover:underline">
                                                {t('flow.calendar')} <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </LayoutGroup>
            </MotionConfig>
        </Card>
    );
};
