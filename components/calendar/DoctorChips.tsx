/* SHIFOKOR FILTRI — chiplar qatori.

   Ilgari bu ochiladigan ro'yxat edi: kimning rangi qaysi ekanini bilish
   uchun uni ochish kerak edi, tanlangan shifokor esa bir so'z bo'lib
   ko'rinardi. Chiplar bir vaqtda filtr ham, rang izohi ham: ko'k nuqta —
   Dr. Ahmedova, yonida — ko'rinayotgan davrdagi yozuvlari soni.
   Bitta bosish — bitta shifokor; «Hammasi» — hamma. */
import React from 'react';
import type { Doctor } from '../../types';
import { doctorColor } from '../../utils/chartColors';

interface DoctorChipsProps {
    doctors: Doctor[];
    value: string | null;
    counts: Map<string, number>;
    label: string;
    allLabel: string;
    onChange: (doctorId: string | null) => void;
}

const chipClass = (pressed: boolean) =>
    `inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[13px] whitespace-nowrap shrink-0 transition-colors ${pressed
        ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold'
        : 'border-line bg-surface text-muted font-medium hover:text-ink hover:bg-elevated'}`;

export function DoctorChips({ doctors, value, counts, label, allLabel, onChange }: DoctorChipsProps) {
    return (
        <div role="group" aria-label={label} className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
            <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chipClass(value === null)}>
                {allLabel}
            </button>
            {doctors.map(doc => {
                const n = counts.get(doc.id) || 0;
                const pressed = value === doc.id;
                return (
                    <button key={doc.id} type="button" aria-pressed={pressed}
                        onClick={() => onChange(pressed ? null : doc.id)}
                        title={doc.specialty || undefined}
                        className={chipClass(pressed)}>
                        <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: doctorColor(doc) }} />
                        <span>Dr. {doc.lastName}</span>
                        {n > 0 && <span className="text-faint font-medium tabular-nums">{n}</span>}
                    </button>
                );
            })}
        </div>
    );
}
