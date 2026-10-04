import React, { useMemo } from 'react';
import { Appointment } from '../types';
import { useLanguage, fill } from '../context/LanguageContext';
import { formatDateToISO } from '../utils/dateUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   KALENDAR — OY KO'RINISHI.

   Stomatologiyada (denta7) oy katagida bemorlarning ISMLARI turardi: kuniga
   besh-olti qabul sig'adi. Ko'p profilli klinikada bir kunda sakkiz shifokor
   va yuzga yaqin yozuv bor — ism sig'maydi va oy darajasida kerak ham emas.
   Oy ko'rinishining savoli boshqa: «qaysi kun band, qaysi kun bo'sh?».

   Shuning uchun katakda ism emas, kunning BANDLIGI: yozuvlar soni va chiziq.
   Chiziq uzunligi — band qilingan vaqtning shifokorlar ish vaqtiga nisbati
   (bekor qilinganlar kirmaydi). Kun bosilsa — o'sha kun kunlik ko'rinishda
   ochiladi: ismlar o'sha yerda.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    /** Ko'rsatiladigan oyning istalgan kuni */
    month: Date;
    appointments: Appointment[];
    /** Bir kunda band qilish mumkin bo'lgan daqiqalar (faol shifokorlarning ish vaqti yig'indisi) */
    capacityMin: number;
    /** Dushanbadan boshlab hafta kunlarining qisqa nomlari */
    weekdays: string[];
    onOpenDay: (day: Date) => void;
}

export const CalendarMonth: React.FC<Props> = ({ month, appointments, capacityMin, weekdays, onOpenDay }) => {
    const { t } = useLanguage();
    const todayKey = formatDateToISO(new Date());

    const byDay = useMemo(() => {
        const m = new Map<string, { total: number; minutes: number; noShow: number }>();
        for (const a of appointments) {
            if (a.status === 'Cancelled') continue;
            const key = String(a.date).slice(0, 10);
            const d = m.get(key) || { total: 0, minutes: 0, noShow: 0 };
            d.total += 1;
            d.minutes += a.duration || 30;
            if (a.status === 'No-Show') d.noShow += 1;
            m.set(key, d);
        }
        return m;
    }, [appointments]);

    /* Setka dushanbadan boshlanadi va to'liq haftalardan iborat: oldingi va
       keyingi oyning kunlari xira ko'rinadi (ular ham bosiladi). */
    const cells = useMemo(() => {
        const first = new Date(month.getFullYear(), month.getMonth(), 1);
        const lead = (first.getDay() + 6) % 7;
        const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        const weeks = Math.ceil((lead + last.getDate()) / 7);
        return Array.from({ length: weeks * 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + i));
    }, [month]);

    return (
        <div className="flex-1 min-h-0 bg-surface rounded-xl border border-line overflow-hidden flex flex-col">
            <div className="grid grid-cols-7 border-b border-line bg-canvas">
                {weekdays.map(w => (
                    <div key={w} className="px-2 py-2.5 text-center text-xs font-bold text-muted">{w}</div>
                ))}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
                <div className="grid grid-cols-7 auto-rows-fr min-h-full">
                    {cells.map(day => {
                        const key = formatDateToISO(day);
                        const d = byDay.get(key);
                        const inMonth = day.getMonth() === month.getMonth();
                        const isToday = key === todayKey;
                        const load = d && capacityMin > 0 ? Math.min(1, d.minutes / capacityMin) : 0;
                        const tone = load > 0.85 ? 'bg-amber-500' : load > 0.5 ? 'bg-primary-600' : 'bg-primary-300';
                        const label = d ? fill(t('cal.month.dayTitle'), day.getDate(), d.total, Math.round(load * 100)) : fill(t('cal.month.dayEmpty'), day.getDate());
                        return (
                            <button key={key} type="button" onClick={() => onOpenDay(day)} aria-label={label} title={label}
                                className={`min-h-[92px] p-2 flex flex-col gap-1 text-left border-b border-r border-line-soft transition-colors hover:bg-primary-50/60 dark:hover:bg-primary-900/15 ${inMonth ? '' : 'bg-canvas/60'}`}>
                                <span className={`self-start min-w-6 h-6 px-1.5 rounded-full inline-flex items-center justify-center text-xs font-bold tabular-nums ${isToday
                                    ? 'bg-primary-600 text-white'
                                    : inMonth ? 'text-ink' : 'text-faint'}`}>
                                    {day.getDate()}
                                </span>
                                {d ? (
                                    <>
                                        <span className={`text-[13px] font-bold tabular-nums ${inMonth ? 'text-ink' : 'text-muted'}`}>
                                            {fill(t('cal.month.count'), d.total)}
                                        </span>
                                        <span aria-hidden="true" className="h-1.5 w-full rounded-full bg-elevated overflow-hidden">
                                            <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(6, Math.round(load * 100))}%` }} />
                                        </span>
                                        {d.noShow > 0 && (
                                            <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">{fill(t('cal.month.noShow'), d.noShow)}</span>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-[11px] text-faint">{t('cal.month.free')}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
            <p className="px-4 py-2 border-t border-line text-[11.5px] font-semibold text-muted">{t('cal.month.hint')}</p>
        </div>
    );
};

export default CalendarMonth;
