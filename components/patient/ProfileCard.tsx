import React, { useRef } from 'react';
import { AlertTriangle, BedDouble, Calendar, CalendarClock, Camera, Edit, HeartPulse, History, Plus, Printer, Send, UserPlus, Wallet, MessageSquareWarning } from 'lucide-react';
import { Patient } from '../../types';
import { getFileUrl } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatDobDDMMYYYY, calcAge, todayISO } from '../../utils/dateUtils';
import { formatNumber } from '../../utils/format';
import { maskPhone } from '../../utils/accessControl';

/* ─────────────────────────────────────────────────────────────────────────────
   BEMOR QATORI — kartaning tepasida, butun kenglikda, hamma tabda bir joyda
   (2026-11-24, tasdiqlangan maket «maket-karta.html»).

   Ilgari bu chap ustundagi 320px kartochka edi (DentaCRM namunasida,
   2026-11-20). Shifokorning ish joyi (Qabul tabi) unga siqilib qolardi va
   klinika egasi «bemor ma'lumotlarini chapga qo'yibsan yana» dedi. Endi
   «kim» — bitta gorizontal qatorda, qolgan butun kenglik — ishga.

   Ikki qavat:
     · yuqorida — portret (bosilsa rasm yuklanadi), ism, ostida kulrang
       qator (jinsi · yoshi · tug'ilgan sana · telefon · karta raqami ·
       biriktirilgan shifokor); o'ngda amallar: (ega/registrator) qarz va
       to'lov — bitta yaxlit blok, «Qabulga yozish», to'rtta kichik amal;
     · pastda, och fonli tasmada — belgilar: allergiya (qizil, birinchi),
       surunkali kasalliklar, «Statsionarda», keyingi qabul; o'ng chetda
       kulrang matn bilan oxirgi tashrif.
   «Faol» belgisi olib tashlandi (2026-11-24): har bemorda bir xil turib,
   hech narsa demasdi. Faqat arxivdagi bemorda «Arxiv» chiqadi.

   Shifokor bemorning jami qarzini KO'RMAYDI (2026-11-23 kelishuv): pul —
   kassirning ishi. Shu qabulning to'langan-to'lanmagani esa qabul
   varag'ining sarlavhasida qoladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patient: Patient;
    showPhone: boolean;
    /** Ega va registrator — qarz va to'lov tugmasi. Shifokorda false. */
    showMoney: boolean;
    /** Bemorning jami to'lanmagan qarzi */
    due: number;
    lastVisit?: string | null;
    /** Allergiya ma'lumoti yuklanmadi — «yo'q» emas, «bilmaymiz» */
    allergiesUnknown?: boolean;
    /** Faol allergiyalar — moddaning nomi */
    allergies?: string[];
    /** Surunkali kasalliklar — MKB kodi va nomi */
    chronic?: { code: string; name: string }[];
    /** Hozir statsionarda yotibdi */
    admitted?: boolean;
    nextAppointment?: { date: string; time: string; doctorName?: string } | null;
    onOpenPayments: () => void;
    /** Qarzni olish — kassadagi bilan bir xil oyna */
    onTakePayment?: () => void;
    /** Qarz yo'q bo'lganda — yangi xizmatga to'lov yoki avans */
    onAddPayment?: () => void;
    onSchedule: () => void;
    onEdit: () => void;
    onMessage: () => void;
    onAssignDoctor: () => void;
    onPrintCard: () => void;
    onUploadPhoto: (file: File) => void;
    /** «Shikoyat yozish» — faqat ruxsati borga beriladi (2026-11-26) */
    onComplaint?: () => void;
}

const iconBtn = 'w-11 h-11 grid place-items-center text-muted hover:text-primary-700 dark:hover:text-primary-300 hover:bg-elevated transition-colors';
const chip = 'inline-flex items-center gap-1.5 min-h-7 px-2.5 rounded-lg text-[13px] font-medium';

export const ProfileCard: React.FC<Props> = ({
    patient, showPhone, showMoney, due, lastVisit, allergiesUnknown = false, allergies = [], chronic = [], admitted = false,
    nextAppointment, onOpenPayments, onTakePayment, onAddPayment, onSchedule, onEdit, onMessage, onAssignDoctor, onPrintCard, onUploadPhoto, onComplaint,
}) => {
    const { t } = useLanguage();
    const photoInputRef = useRef<HTMLInputElement | null>(null);

    const age = calcAge(patient.dob);
    const phone = (value?: string) => (showPhone ? value : maskPhone(value));
    const archived = patient.status === 'Archived';
    const initials = `${patient.lastName?.[0] || ''}${patient.firstName?.[0] || ''}`.toUpperCase();
    const facts = [
        patient.gender === 'Male' ? t('patients.modal.male') : t('patients.modal.female'),
        age !== null ? `${age} ${t('patients.details.age')}` : '',
        patient.dob ? formatDobDDMMYYYY(patient.dob) : '',
        phone(patient.phone) || '',
        patient.secondaryPhone ? `${phone(patient.secondaryPhone)} ${t('patientdetails.qoshimcha')}` : '',
        patient.cardNumber ? fill(t('card.cardNo'), patient.cardNumber) : '',
        patient.doctorName || '',
    ].filter(Boolean);
    const nextLabel = nextAppointment
        ? [`${nextAppointment.date === todayISO() ? t('card.today') : formatDobDDMMYYYY(nextAppointment.date)}, ${nextAppointment.time}`,
            nextAppointment.doctorName].filter(Boolean).join(' · ')
        : '';
    /* Surunkali: birinchisi nomi bilan, qolganlari soni bilan — to'liq
       ro'yxat sichqoncha ustida va «Anamnez» tabida */
    const chronicLabel = chronic.length
        ? `${chronic[0].code} ${chronic[0].name}${chronic.length > 1 ? ` +${chronic.length - 1}` : ''}`
        : '';
    const hasDebt = due > 0;

    return (
        <section aria-labelledby="pt-name"
            className="relative min-w-0 overflow-hidden bg-surface border border-line rounded-[20px] shadow-sm">
            {/* Chap chetdagi ingichka rang — karta «kim» ekanini ko'zga ajratadi */}
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary-600" />

            <div className="pl-5 pr-4 sm:pl-6 sm:pr-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                {/* ── Kim ─────────────────────────────────────────────────── */}
                <button type="button" onClick={() => photoInputRef.current?.click()}
                    aria-label={t('card.menuPhoto')} title={t('card.menuPhoto')}
                    className="group relative shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white grid place-items-center overflow-hidden text-lg font-bold tracking-wide ring-4 ring-primary-50 dark:ring-primary-900/30 focus-visible:outline-none focus-visible:ring-primary-300">
                    {patient.avatarUrl
                        ? <img src={getFileUrl('patient-avatar', patient.id)} alt="" className="w-full h-full object-cover" />
                        : initials}
                    <span aria-hidden="true"
                        className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                        <Camera className="w-5 h-5" />
                    </span>
                </button>
                <div className="min-w-0 flex-1 basis-40 sm:basis-64">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h1 id="pt-name" className="min-w-0 text-xl leading-tight font-semibold tracking-tight text-ink break-words">
                            {patient.lastName} {patient.firstName}
                        </h1>
                        {archived && (
                            <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium bg-elevated text-muted">
                                {t('patients.filter.archived')}
                            </span>
                        )}
                    </div>
                    {/* Har bir bo'lak bo'linmaydi — telefon raqami ikki qatorga uzilardi */}
                    <p className="mt-1 text-sm text-muted tabular-nums">
                        {facts.map((f, i) => (
                            <React.Fragment key={i}>
                                {/* Bo'shliqlar — qator shu yerda o'raladi */}
                                {i > 0 && <>{' '}<span aria-hidden="true" className="mx-0.5 text-faint">·</span>{' '}</>}
                                <span className="whitespace-nowrap">{f}</span>
                            </React.Fragment>
                        ))}
                    </p>
                </div>

                {/* ── Amallar ─────────────────────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                    {showMoney && (
                        /* Qarz va to'lov — bitta blok: summa va uni olish tugmasi yonma-yon */
                        <div className={`flex h-11 rounded-xl border overflow-hidden ${hasDebt
                            ? 'border-red-200 dark:border-red-900/60'
                            : 'border-line'}`}>
                            <button type="button" onClick={onOpenPayments} title={t('card.secPayments')}
                                className={`px-3 text-left leading-tight transition-colors whitespace-nowrap ${hasDebt
                                    ? 'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30'
                                    : 'hover:bg-elevated'}`}>
                                <span className="block text-[11px] font-medium text-muted">{t('pcard.debt')}</span>
                                <span className="block whitespace-nowrap">
                                    <span className={`text-[15px] font-bold tabular-nums ${hasDebt ? 'text-red-600 dark:text-red-400' : 'text-ink'}`}>
                                        {hasDebt ? formatNumber(due) : '0'}
                                    </span>
                                    {(patient.balance || 0) > 0 && (
                                        <span className="ml-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                                            {fill(t('card.advance'), formatNumber(patient.balance || 0))}
                                        </span>
                                    )}
                                </span>
                            </button>
                            {hasDebt && onTakePayment ? (
                                <button type="button" onClick={onTakePayment}
                                    className="inline-flex items-center gap-2 px-3.5 border-l border-red-200 dark:border-red-900/60 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 whitespace-nowrap">
                                    <Wallet className="w-4 h-4" aria-hidden="true" /> {t('card.takePayment')}
                                </button>
                            ) : onAddPayment && (
                                <button type="button" onClick={onAddPayment}
                                    className="inline-flex items-center gap-2 px-3.5 border-l border-line text-sm font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 whitespace-nowrap">
                                    <Plus className="w-4 h-4" aria-hidden="true" /> {t('card.addPayment')}
                                </button>
                            )}
                        </div>
                    )}
                    <button type="button" onClick={onSchedule}
                        className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-sm whitespace-nowrap">
                        <Calendar className="w-4 h-4" aria-hidden="true" /> {t('pcard.schedule')}
                    </button>
                    <div className="flex rounded-xl border border-line overflow-hidden divide-x divide-line">
                        <button type="button" onClick={onEdit} className={iconBtn}
                            aria-label={t('patients.details.editProfile')} title={t('patients.details.editProfile')}>
                            <Edit className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={onMessage} className={iconBtn}
                            aria-label={t('patients.details.sendMessage')} title={t('patients.details.sendMessage')}>
                            <Send className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={onAssignDoctor} className={iconBtn}
                            aria-label={patient.doctorId ? t('patients.details.changeDoctor') : t('patients.details.assignDoctor')}
                            title={patient.doctorId ? t('patients.details.changeDoctor') : t('patients.details.assignDoctor')}>
                            <UserPlus className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={onPrintCard} className={iconBtn}
                            aria-label={t('patientdetails.karta_vipiska')} title={t('patientdetails.karta_vipiska')}>
                            <Printer className="w-4 h-4" />
                        </button>
                        {onComplaint && (
                            <button type="button" onClick={onComplaint} className={iconBtn}
                                aria-label={t('cmp.write')} title={t('cmp.write')}>
                                <MessageSquareWarning className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Belgilar tasmasi: xavfsizlik birinchi, keyin vaqt ─────── */}
            <div className="pl-5 pr-4 sm:pl-6 sm:pr-5 py-2.5 border-t border-line-soft bg-elevated/50 flex flex-wrap items-center gap-2">
                {allergies.length > 0 && (
                    <span className={`${chip} bg-red-100 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-900/60`}>
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('anamnesis.s.allergies')}: {allergies.join(', ')}
                    </span>
                )}
                {allergiesUnknown && (
                    <span role="alert" className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}>
                        {t('card.allergyUnknown')}
                    </span>
                )}
                {chronic.length > 0 && (
                    <span className={`${chip} max-w-full bg-surface text-ink ring-1 ring-inset ring-line`}
                        title={chronic.map(c => `${c.code} — ${c.name}`).join('\n')}>
                        <HeartPulse className="w-3.5 h-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                        <span className="text-muted">{t('anamnesis.conditions')}:</span>
                        <span className="min-w-0 truncate max-w-[18rem]">{chronicLabel}</span>
                    </span>
                )}
                {admitted && (
                    <span className={`${chip} bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-900/50`}>
                        <BedDouble className="w-3.5 h-3.5" aria-hidden="true" /> {t('pcard.admitted')}
                    </span>
                )}
                {nextAppointment && (
                    <span className={`${chip} bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-900/50 tabular-nums`}>
                        <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('card.nextVisit')}: {nextLabel}
                    </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted tabular-nums whitespace-nowrap">
                    <History className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('pcard.lastVisit')}: {lastVisit ? formatDobDDMMYYYY(lastVisit) : t('pcard.noVisits')}
                </span>
            </div>

            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden="true"
                onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onUploadPhoto(file);
                }} />
        </section>
    );
};
