/* KALENDAR TO'RIDAGI BITTA YOZUV.

   Birinchi qatorda — VAQT va BEMOR: registrator kalendarga qarab aynan
   shuni qidiradi («soat nechada kim?»). Ilgari vaqt uchinchi qatorda,
   «D» harfli doirachaning yonida edi va 30 daqiqalik blokdan tashqariga
   chiqib turardi.

   Rang — FAQAT shifokorniki (chap chiziq va och fon). Holat rang bilan
   emas, shakl bilan: kutilmoqda — uzuq chiziq, keldi / yakunlandi —
   kichik belgi, kelmadi / bekor — kulrang va ustidan chizilgan. Ilgari
   «bekor» qizil edi va qizil rangli shifokorning oddiy qabuli bilan
   adashtirilardi. */
import React from 'react';
import { Bell, CheckCircle2, UserCheck } from 'lucide-react';
import type { Appointment } from '../../types';
import { isClosedAppt } from '../../utils/calendarLayout';
import { useLanguage } from '../../context/LanguageContext';

interface AppointmentBlockProps {
    appt: Appointment;
    color: string;
    top: number;
    height: number;
    left: string;
    width: string;
    onOpen: (appt: Appointment) => void;
}

/** Ikkinchi qator (xizmat) shu balandlikdan boshlab sig'adi */
const TWO_LINE_MIN_PX = 38;

export function AppointmentBlock({ appt, color, top, height, left, width, onOpen }: AppointmentBlockProps) {
    const { t } = useLanguage();
    const closed = isClosedAppt(appt);
    const pending = appt.status === 'Pending';
    const done = appt.status === 'Completed';
    const arrived = appt.status === 'Checked-In';
    const twoLines = height >= TWO_LINE_MIN_PX;

    const tip = `${appt.time} · ${appt.patientName} · ${appt.type}${appt.doctorName ? ' · Dr. ' + appt.doctorName : ''}`;
    /* `color-mix` — shifokor rangi qanday yozilgan bo'lmasin (hex, rgb,
       nom) ishlaydi va qorong'i temada ham sirt rangiga aralashadi.
       Ilgari hex'ga `20` qo'shilardi: boshqa ko'rinishdagi rang bilan
       CSS yaroqsiz bo'lib, blok fonsiz qolardi. */
    const background = closed
        ? 'var(--color-elevated)'
        : `color-mix(in srgb, ${color} ${done ? 9 : 15}%, var(--color-surface))`;

    return (
        <div
            role="button"
            tabIndex={0}
            title={tip}
            onClick={() => onOpen(appt)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(appt); } }}
            className={`absolute z-10 rounded-md overflow-hidden cursor-pointer px-2 transition-shadow hover:shadow-md hover:z-[11] focus-visible:outline-2 focus-visible:outline-primary-500 ${twoLines ? 'py-1' : 'flex items-center'} ${closed ? 'opacity-70' : ''}`}
            style={{
                top, height, left, width, background,
                borderLeft: `3px ${pending ? 'dashed' : 'solid'} ${closed ? 'var(--color-faint)' : color}`,
            }}
        >
            <div className="flex items-center gap-1.5 min-w-0 w-full text-[12px] leading-4">
                <span className="tabular-nums text-muted shrink-0">{appt.time}</span>
                <span className={`font-semibold truncate ${closed ? 'text-muted line-through' : 'text-ink'}`}>{appt.patientName}</span>
                <span className="ml-auto flex items-center gap-1 shrink-0">
                    {arrived && <UserCheck className="w-3.5 h-3.5 text-primary" aria-label={t('calendar.arrived')} />}
                    {done && <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-label={t('cal.status.done')} />}
                    {appt.reminderSent && !closed && <Bell className="w-3 h-3 text-faint" aria-label={t('calendar.eslatma_yuborilgan')} />}
                </span>
            </div>
            {twoLines && (
                <div className={`text-[11px] leading-4 truncate ${closed ? 'text-faint' : 'text-muted'}`}>
                    {closed ? t(appt.status === 'Cancelled' ? 'cal.status.cancelled' : 'cal.status.noShow') : appt.type}
                </div>
            )}
        </div>
    );
}
