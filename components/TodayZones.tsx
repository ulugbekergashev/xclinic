import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BedDouble, Check } from 'lucide-react';
import { TodayZones as Zones } from '../types';
import { useLanguage, fill } from '../context/LanguageContext';
import { initialsOf } from '../utils/flow';

/* ─────────────────────────────────────────────────────────────────────────────
   «BUGUN» XARITASIDAGI LABORATORIYA VA STATSIONAR ZONALARI.

   Xaritaning yuqori qismi shifokor qabulini ko'rsatadi (yo'l → kutish zali →
   kabinet). Ko'p profilli klinikada esa bemorlarning yarmi ayni paytda boshqa
   joyda: tahlil topshiryapti yoki palatada yotibdi. Bu ikki zona o'sha
   bo'limlarning HOZIRGI holatini ko'rsatadi:

     · Laboratoriya — uch bosqich: proba olish → ishlanmoqda → bugun tayyor;
     · Statsionar   — palatalar va koykalar: band, bo'sh, tozalanmoqda.

   BU YERDA ISH BAJARILMAYDI. Zona — raqam va havola: proba olish, natija
   kiritish, obxod — o'sha bo'limlarning o'z ekranida. Aks holda «Bugun» ularni
   takrorlab qo'yardi (Bosh panel bilan bir marta shunday bo'lgan).

   Raqamlar serverdan keladi (`/api/today/zones`); bo'lim klinikada bo'lmasa
   maydon `null` va zona chizilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    zones: Zones;
    /** «Ruxsatlar» da bo'lim yashirilgan bo'lsa — zonasi ham ko'rsatilmaydi */
    showLab?: boolean;
    showInpatient?: boolean;
}

// Pol naqshi — `ClinicMap` dagi bilan bir xil usul, zonaning o'z rangida
const FLOOR_SKY: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(14,165,233,0.14) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };
const FLOOR_PINK: React.CSSProperties = { backgroundImage: 'radial-gradient(rgba(236,72,153,0.13) 1px, transparent 1.4px)', backgroundSize: '16px 16px' };

const TAB = 'absolute -top-2.5 inline-flex items-center gap-1 h-[18px] px-2 rounded-md bg-surface text-[10.5px] font-extrabold uppercase tracking-wider whitespace-nowrap';

/** Zonadagi bosqichlar orasidagi o'q. Telefonda bosqichlar ustma-ust turadi — o'q kerak emas */
const Step: React.FC = () => (
    <span aria-hidden="true" className="hidden sm:flex sm:mt-2 shrink-0 w-6 h-6 rounded-full bg-surface border-[1.5px] border-line text-faint items-center justify-center">
        <ArrowRight className="w-3 h-3" />
    </span>
);

export const TodayZones: React.FC<Props> = ({ zones, showLab = true, showInpatient = true }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const lab = showLab ? zones.lab : null;
    const inp = showInpatient ? zones.inpatient : null;
    if (!lab && !inp) return null;

    const openTab = (label: string, to: string) => (
        <button type="button" onClick={() => navigate(to)} aria-label={`${label}: ${t('flow.open')}`}
            className={`${TAB} right-5 text-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors`}>
            {t('flow.open')} <ArrowRight className="w-3 h-3" />
        </button>
    );

    /* Bosqich: tepada belgi, ostida nom va son. Telefonda uchta bosqich bir
       qatorga sig'maydi — u yerda har biri alohida qator (belgi chapda). */
    const stage = (art: React.ReactNode, title: string, sub: React.ReactNode, grow = 'sm:flex-1') => (
        <div className={`${grow} min-w-0 flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-2`}>
            <div className="h-10 w-24 shrink-0 flex items-end sm:w-auto">{art}</div>
            <div className="min-w-0">
                <p className="text-[13px] leading-tight font-extrabold text-ink">{title}</p>
                <p className="text-[11.5px] leading-snug font-bold text-muted">{sub}</p>
            </div>
        </div>
    );

    const labZone = lab && (
        <section aria-label={t('nav.lab')}
            className="relative rounded-[22px] border-[1.5px] border-sky-200 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/20 px-4 pt-5 pb-3.5"
            style={FLOOR_SKY}>
            <span className={`${TAB} left-5 text-sky-700 dark:text-sky-300`}>{t('nav.lab')}</span>
            {openTab(t('nav.lab'), '/lab')}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
                {/* 1. Proba olish — kutayotgan ODAMLAR */}
                {stage(
                    lab.waiting.count === 0 ? (
                        <span aria-hidden="true" className="w-8 h-8 rounded-full border-[1.5px] border-dashed border-sky-300 dark:border-sky-800" />
                    ) : (
                        <span className="flex items-center">
                            {lab.waiting.people.slice(0, 3).map((p, i) => (
                                <span key={`${p.patientId || p.patientName}-${i}`} title={p.patientName}
                                    className={`${i ? '-ml-1.5' : ''} w-8 h-8 rounded-full border-2 ${p.urgent ? 'border-red-400' : 'border-sky-400'} bg-surface text-ink text-[10.5px] font-extrabold inline-flex items-center justify-center`}>
                                    {initialsOf(p.patientName)}
                                </span>
                            ))}
                            {lab.waiting.count > 3 && (
                                <span className="-ml-1.5 w-8 h-8 rounded-full border-2 border-dashed border-sky-400 bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-[11px] font-black inline-flex items-center justify-center">
                                    +{lab.waiting.count - 3}
                                </span>
                            )}
                        </span>
                    ),
                    t('zones.lab.sample'),
                    <>
                        {lab.waiting.count ? fill(t('zones.lab.sampleCount'), lab.waiting.count) : t('zones.lab.sampleNone')}
                        {lab.stale > 0 && <span className="block text-amber-700 dark:text-amber-400">{fill(t('zones.lab.stale'), lab.stale)}</span>}
                    </>,
                )}
                <Step />
                {/* 2. Ishlanmoqda — har yo'llanma bitta probirka */}
                {stage(
                    <span className="flex items-end gap-1 overflow-hidden">
                        {(lab.working.items.length ? lab.working.items : [null, null, null]).map((x, i) => (
                            <span key={i} className="shrink-0 flex flex-col items-center" title={x?.overdue ? t('zones.lab.overdueOne') : undefined}>
                                {x?.overdue && <span aria-hidden="true" className="w-[5px] h-[5px] mb-0.5 rounded-full bg-red-500" />}
                                <span aria-hidden="true" className={`w-[11px] h-[5px] rounded-sm ${!x ? 'bg-sky-200 dark:bg-sky-900' : x.urgent ? 'bg-red-400' : 'bg-sky-400'}`} />
                                <span aria-hidden="true" className={`w-2 h-6 rounded-b-[5px] border-[1.5px] border-t-0 ${!x
                                    ? 'border-sky-200 dark:border-sky-900'
                                    : x.overdue ? 'border-red-300 dark:border-red-800 bg-red-400/60' : 'border-sky-300 dark:border-sky-700 bg-sky-400/50'}`} />
                            </span>
                        ))}
                        {lab.working.count > lab.working.items.length && lab.working.items.length > 0 && (
                            <span className="shrink-0 self-center text-[11px] font-black text-sky-700 dark:text-sky-300">+{lab.working.count - lab.working.items.length}</span>
                        )}
                    </span>,
                    t('zones.lab.working'),
                    <>
                        {lab.working.count ? fill(t('zones.lab.workingCount'), lab.working.count) : t('zones.lab.workingNone')}
                        {lab.working.overdue > 0 && <span className="block text-red-600 dark:text-red-400">{fill(t('zones.lab.overdue'), lab.working.overdue)}</span>}
                    </>,
                    'sm:flex-[1.6]',
                )}
                <Step />
                {/* 3. Bugun tayyor */}
                {stage(
                    <span className="flex items-end gap-1 overflow-hidden">
                        {lab.ready.count === 0 ? (
                            <span aria-hidden="true" className="w-5 h-[26px] rounded border-[1.5px] border-dashed border-emerald-300 dark:border-emerald-900" />
                        ) : Array.from({ length: Math.min(lab.ready.count, 5) }, (_, i) => (
                            <span key={i} aria-hidden="true"
                                className={`shrink-0 w-5 h-[26px] rounded border-[1.5px] inline-flex items-center justify-center ${i < lab.ready.unseen
                                    ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                    : 'border-emerald-400/70 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                                <Check className="w-3 h-3" strokeWidth={3.2} />
                            </span>
                        ))}
                        {lab.ready.count > 5 && <span className="shrink-0 self-center text-[11px] font-black text-emerald-700 dark:text-emerald-400">+{lab.ready.count - 5}</span>}
                    </span>,
                    t('zones.lab.ready'),
                    <>
                        {lab.ready.count ? fill(t('zones.lab.readyCount'), lab.ready.count) : t('zones.lab.readyNone')}
                        {lab.ready.unseen > 0 && <span className="block text-amber-700 dark:text-amber-400">{fill(t('zones.lab.unseen'), lab.ready.unseen)}</span>}
                    </>,
                )}
            </div>
        </section>
    );

    const bedTone = (status: string) => (
        status === 'Occupied' ? 'text-pink-500 dark:text-pink-400'
            : status === 'Cleaning' ? 'text-amber-500'
                : status === 'Blocked' ? 'text-faint/40'
                    : 'text-faint/70'
    );
    const bedState = (status: string) => (
        status === 'Cleaning' ? t('zones.inp.bedCleaning')
            : status === 'Blocked' ? t('zones.inp.bedBlocked')
                : t('zones.inp.bedFree')
    );

    const inpZone = inp && (
        <section aria-label={t('nav.inpatient')}
            className="relative rounded-[22px] border-[1.5px] border-pink-200 dark:border-pink-900/50 bg-pink-50/50 dark:bg-pink-950/15 px-4 pt-5 pb-3.5 flex flex-col gap-3"
            style={FLOOR_PINK}>
            <span className={`${TAB} left-5 max-w-[calc(100%-7.5rem)] text-pink-700 dark:text-pink-300`}>
                <span className="truncate">{fill(t('zones.inp.title'), inp.beds.occupied, inp.beds.total)}</span>
            </span>
            {openTab(t('nav.inpatient'), '/inpatient')}
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2.5 min-h-[52px]">
                {inp.wards.map(w => (
                    <div key={w.id} className="flex flex-col gap-1">
                        <div className="flex gap-[3px]">
                            {w.beds.length === 0 && <span className="h-[26px]" />}
                            {w.beds.map(b => {
                                const icon = <BedDouble className="w-[26px] h-[26px]" strokeWidth={1.8} />;
                                /* Band koyka — o'sha yotishga havola. Sariq nuqta: bugun
                                   obxod yozilmagan; yashil: bemor bugun yotgan. */
                                if (b.admissionId) {
                                    const flag = !b.seenToday ? 'bg-amber-500' : b.admittedToday ? 'bg-emerald-500' : '';
                                    const note = !b.seenToday ? t('today.notSeenToday') : b.admittedToday ? t('zones.inp.bedNew') : '';
                                    const label = [`${w.name} · ${b.label}`, b.patientName, note].filter(Boolean).join(' — ');
                                    return (
                                        <button key={b.id} type="button" title={label} aria-label={label}
                                            onClick={() => navigate(`/inpatient?admission=${b.admissionId}`)}
                                            className={`relative inline-flex rounded-md ${bedTone(b.status)} hover:text-pink-600 dark:hover:text-pink-300 transition-colors`}>
                                            {icon}
                                            {flag && <span aria-hidden="true" className={`absolute -top-px -right-px w-2 h-2 rounded-full border-[1.5px] border-pink-50 dark:border-surface ${flag}`} />}
                                        </button>
                                    );
                                }
                                return (
                                    <span key={b.id} title={`${w.name} · ${b.label} — ${bedState(b.status)}`} className={`inline-flex ${bedTone(b.status)}`}>
                                        {icon}
                                    </span>
                                );
                            })}
                        </div>
                        <span className="text-[10.5px] font-bold text-muted whitespace-nowrap">{w.name}</span>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] font-bold text-muted">
                {/* Vaqti kelgan dorilar — birinchi: bu hamshiraning HOZIRGI ishi.
                    Havola Statsionarning «Dorilar» ro'yxatini ochadi. */}
                {inp.medsDue > 0 && (
                    <button type="button" onClick={() => navigate('/inpatient?tab=meds')}
                        className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 hover:underline">
                        <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full bg-red-500" />
                        {fill(t('zones.inp.medsDue'), inp.medsDue)}
                    </button>
                )}
                {inp.notSeenToday > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full bg-amber-500" />
                        {fill(t('zones.inp.notSeen'), inp.notSeenToday)}
                    </span>
                )}
                {inp.admittedToday > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full bg-emerald-500" />
                        {fill(t('zones.inp.admitted'), inp.admittedToday)}
                    </span>
                )}
                {inp.dischargedToday > 0 && <span>{fill(t('zones.inp.discharged'), inp.dischargedToday)}</span>}
                <span>{fill(t('zones.inp.free'), inp.beds.free)}</span>
                {inp.beds.cleaning > 0 && <span className="text-amber-700 dark:text-amber-400">{fill(t('zones.inp.cleaning'), inp.beds.cleaning)}</span>}
            </div>
        </section>
    );

    return (
        <div className={`mt-6 grid grid-cols-1 gap-x-6 gap-y-6 ${labZone && inpZone ? 'lg:grid-cols-2' : ''}`}>
            {labZone}
            {inpZone}
        </div>
    );
};

export default TodayZones;
