import React, { useMemo } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Doctor } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { formatDateToISO } from '../utils/dateUtils';
import { doctorColor } from '../utils/chartColors';
import { monthLabel, CalLang } from '../utils/calendarLabels';

/* ─────────────────────────────────────────────────────────────────────────────
   KALENDAR — YON PANEL (denta7 dagi tuzilma, ko'p profilga moslangan).

   Uch narsa, uchalasi ham ilgari yo'q yoki noqulay edi:

     · OY KALENDARI — istalgan kunga bitta bosish bilan o'tish. Ilgari faqat
       «oldingi/keyingi» strelkalari bor edi: uch hafta keyingi kunni ochish
       uchun yigirma marta bosish kerak edi. Yozuvi bor kun nuqta bilan.
     · SHIFOKORLAR PROFIL BO'YICHA — filtr. Tepada bir qator nishon edi;
       sakkiz shifokorda u ikki qatorga bo'linadi va kim qaysi mutaxassis
       ekani ko'rinmaydi. Bu yerda ular mutaxassislik bo'yicha guruhlangan,
       yonida — ko'rinayotgan davrdagi yozuvlar soni.
     · HOLATLAR — blokning ko'rinishi nimani anglatishi. Punktir, belgi va
       xira blok ilgari hech qayerda izohlanmagan edi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    current: Date;
    lang: CalLang;
    /** Dushanbadan boshlab hafta kunlarining qisqa nomlari */
    weekdays: string[];
    /** Kun (`YYYY-MM-DD`) → yozuvlar soni: oy kalendaridagi nuqta */
    countByDay: Map<string, number>;
    doctors: Doctor[];
    /** Shifokor → ko'rinayotgan davrdagi yozuvlar soni */
    countByDoctor: Map<string, number>;
    doctorFilter: string | null;
    onFilter: (id: string | null) => void;
    onPick: (day: Date) => void;
    /** Shifokor o'zi kirgan — filtr unga kerak emas (faqat o'z yozuvlarini ko'radi) */
    hideDoctors?: boolean;
}

export const CalendarSide: React.FC<Props> = ({
    current, lang, weekdays, countByDay, doctors, countByDoctor, doctorFilter, onFilter, onPick, hideDoctors,
}) => {
    const { t } = useLanguage();
    const todayKey = formatDateToISO(new Date());
    const currentKey = formatDateToISO(current);

    const cells = useMemo(() => {
        const first = new Date(current.getFullYear(), current.getMonth(), 1);
        const lead = (first.getDay() + 6) % 7;
        const last = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        const weeks = Math.ceil((lead + last.getDate()) / 7);
        return Array.from({ length: weeks * 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + i));
    }, [current]);

    const shiftMonth = (delta: number) => {
        // Oyning shu kuni yo'q bo'lsa (31 → 30 kunlik oy) — oxirgi kuni
        const last = new Date(current.getFullYear(), current.getMonth() + delta + 1, 0).getDate();
        onPick(new Date(current.getFullYear(), current.getMonth() + delta, Math.min(current.getDate(), last)));
    };

    /* Profil — shifokorning mutaxassisligi. Bo'lim emas: terapiya bo'limida
       terapevt ham, kardiolog ham bo'lishi mumkin, bemor esa mutaxassisga yoziladi. */
    const groups = useMemo(() => {
        const m = new Map<string, Doctor[]>();
        for (const d of doctors) {
            const key = (d.specialty || '').trim() || '—';
            m.set(key, [...(m.get(key) || []), d]);
        }
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [doctors]);

    const sample = 'w-7 h-4 rounded-[4px] border-l-[3px] text-primary-600 dark:text-primary-300 border-current inline-flex items-center justify-center shrink-0';
    const STATUSES: [string, React.ReactNode][] = [
        [t('cal.status.pending'), <span className={`${sample} border border-dashed bg-primary-50 dark:bg-primary-900/30`} />],
        [t('cal.status.confirmed'), <span className={`${sample} bg-primary-100 dark:bg-primary-900/40`} />],
        [t('cal.status.done'), <span className={`${sample} bg-primary-100 dark:bg-primary-900/40 opacity-80`}><Check className="w-2.5 h-2.5" strokeWidth={3.4} /></span>],
        [t('cal.status.noShow'), <span className="w-7 h-4 rounded-[4px] border-l-[3px] border-line bg-elevated opacity-60 shrink-0" />],
        [t('cal.status.cancelled'), <span className="w-7 h-4 rounded-[4px] border-l-[3px] border-red-500 bg-red-50 dark:bg-red-900/30 opacity-60 shrink-0" />],
    ];

    return (
        <aside aria-label={t('cal.side.label')} className="w-64 shrink-0 hidden xl:flex flex-col gap-4 overflow-y-auto pr-1">
            {/* ── Oy kalendari ── */}
            <div className="bg-surface rounded-xl border border-line p-3">
                <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => shiftMonth(-1)} aria-label={t('cal.side.prevMonth')}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted hover:bg-elevated"><ChevronLeft className="w-4 h-4" /></button>
                    <p className="text-sm font-bold text-ink">{monthLabel(current, lang)}</p>
                    <button type="button" onClick={() => shiftMonth(1)} aria-label={t('cal.side.nextMonth')}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted hover:bg-elevated"><ChevronRight className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-7 gap-y-0.5 text-center">
                    {weekdays.map(w => <span key={w} className="py-1 text-[10px] font-bold text-faint">{w.slice(0, 2)}</span>)}
                    {cells.map(day => {
                        const key = formatDateToISO(day);
                        const inMonth = day.getMonth() === current.getMonth();
                        const on = key === currentKey;
                        const has = (countByDay.get(key) || 0) > 0;
                        return (
                            <button key={key} type="button" onClick={() => onPick(day)} aria-pressed={on}
                                aria-label={`${day.getDate()} ${monthLabel(day, lang)}`}
                                className={`relative mx-auto w-8 h-8 rounded-full text-xs tabular-nums transition-colors ${on
                                    ? 'bg-primary-600 text-white font-bold'
                                    : key === todayKey ? 'text-primary-600 dark:text-primary-300 font-bold ring-1 ring-primary-300 dark:ring-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/30'
                                        : inMonth ? 'text-ink font-medium hover:bg-elevated' : 'text-faint hover:bg-elevated'}`}>
                                {day.getDate()}
                                {has && <span aria-hidden="true" className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${on ? 'bg-white' : 'bg-primary-500'}`} />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Shifokorlar profil bo'yicha ── */}
            {!hideDoctors && (
                <div className="bg-surface rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-faint">{t('cal.side.doctors')}</p>
                        {doctorFilter && (
                            <button type="button" onClick={() => onFilter(null)} className="text-xs font-bold text-primary-600 dark:text-primary-300 hover:underline">{t('ui.hammasi')}</button>
                        )}
                    </div>
                    {groups.map(([specialty, list]) => (
                        <div key={specialty} className="mt-2 first:mt-0">
                            <p className="px-1 text-[11px] font-semibold text-muted truncate">{specialty}</p>
                            {list.map(doc => {
                                const on = doctorFilter === doc.id;
                                const n = countByDoctor.get(doc.id) || 0;
                                return (
                                    <button key={doc.id} type="button" onClick={() => onFilter(on ? null : doc.id)} aria-pressed={on}
                                        className={`mt-0.5 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[13px] transition-colors ${on
                                            ? 'bg-primary-100 dark:bg-primary-900/40 text-ink font-bold'
                                            : 'text-ink font-medium hover:bg-elevated'}`}>
                                        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: doctorColor(doc) }} />
                                        <span className="min-w-0 flex-1 truncate">Dr. {doc.lastName}</span>
                                        <span className={`shrink-0 text-xs tabular-nums ${n ? 'text-muted font-bold' : 'text-faint'}`}>{n}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Holatlar ── */}
            <div className="bg-surface rounded-xl border border-line p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-faint mb-2">{t('cal.side.statuses')}</p>
                <ul className="flex flex-col gap-1.5">
                    {STATUSES.map(([label, mark]) => (
                        <li key={label} className="flex items-center gap-2 text-xs font-medium text-muted">{mark}{label}</li>
                    ))}
                </ul>
            </div>
        </aside>
    );
};

export default CalendarSide;
