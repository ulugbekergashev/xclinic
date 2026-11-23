import React, { useRef } from 'react';
import { BedDouble, Calendar, Camera, CreditCard, Edit, Phone, Plus, Printer, Send, Stethoscope, UserPlus, Wallet } from 'lucide-react';
import { Patient } from '../../types';
import { getFileUrl } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatDobDDMMYYYY, calcAge, todayISO } from '../../utils/dateUtils';
import { formatNumber } from '../../utils/format';
import { maskPhone } from '../../utils/accessControl';

/* ─────────────────────────────────────────────────────────────────────────────
   BEMOR KARTOCHKASI — kartaning chap ustuni, hamma tabda bir joyda turadi.

   Namuna — DentaCRM (2026-11-20, klinika egasi): chapda «kim», o'ngda ish.
   Ilgari bemor tepadagi bir qatorli sarlavhada edi, kam ishlatiladigan amallar
   esa «⋯» menyusida yashirin turardi.

   Tartib yuqoridan pastga — registrator bemor kelganda so'raydigan tartibda
   (2026-11-22 qayta ko'rildi):
     · portret (bosilsa rasm yuklanadi), ism, holat, jinsi va yoshi;
     · PUL: ikki katak — QARZ va OXIRGI TASHRIF, avans bo'lsa uning summasi;
       ostida to'lov tugmasi HAR DOIM (shifokordan boshqaga): qarz bo'lsa
       «To'lov qabul qilish», bo'lmasa «To'lov qo'shish». 2026-11-22 gacha
       tugma faqat qarz bo'lganda chiqardi va klinika egasi «to'lov qo'shish
       qayerga ketdi?» dedi. Ilgari pul olish qabul sarlavhasidagi «To'lash»
       edi: «Bu qabul: 180 000» deb turib, butun qarz oynasini ochardi;
     · KEYINGI QABUL — bo'lsa (bugun bo'lsa «Bugun, 14:00»);
     · aloqa: telefon, karta raqami, biriktirilgan shifokor;
     · allergiya va kasalliklar — «Umumiy» tabidagi «Tibbiy tarix» blokida
       (2026-11-21, DentaCRM dagidek: chapda faqat «kim»); bu yerda faqat
       «ma'lumot yuklanmadi» ogohlantirishi;
     · statsionarda yotgan bo'lsa — shu haqda belgi;
     · bitta katta tugma «Qabulga yozish» va to'rtta kichik amal.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    patient: Patient;
    showPhone: boolean;
    visitCount: number;
    /** Bemorning jami to'lanmagan qarzi */
    due: number;
    lastVisit?: string | null;
    /** Allergiya ma'lumoti yuklanmadi — «yo'q» emas, «bilmaymiz» */
    allergiesUnknown?: boolean;
    /** Hozir statsionarda yotibdi */
    admitted?: boolean;
    /* Eng yaqin kelajakdagi yozilish. «Yozuvlar» tabi olib tashlandi
       (2026-11-22): undan foydali birgina narsa shu edi va u boshqa hech
       qayerda ko'rinmasdi. DentaCRM ham keyingi qabulni kartaning o'zida beradi. */
    nextAppointment?: { date: string; time: string; doctorName?: string } | null;
    onOpenPayments: () => void;
    /** Qarzni olish — kassadagi bilan bir xil oyna. Shifokorda yo'q. */
    onTakePayment?: () => void;
    /** Qarz yo'q bo'lganda — yangi xizmatga to'lov yoki avans. Shifokorda yo'q. */
    onAddPayment?: () => void;
    onSchedule: () => void;
    onEdit: () => void;
    onMessage: () => void;
    onAssignDoctor: () => void;
    onPrintCard: () => void;
    onUploadPhoto: (file: File) => void;
}

const iconBtn = 'h-10 grid place-items-center text-muted hover:text-primary-700 dark:hover:text-primary-300 hover:bg-elevated transition-colors';

export const ProfileCard: React.FC<Props> = ({
    patient, showPhone, visitCount, due, lastVisit, allergiesUnknown = false, admitted = false,
    nextAppointment, onOpenPayments, onTakePayment, onAddPayment, onSchedule, onEdit, onMessage, onAssignDoctor, onPrintCard, onUploadPhoto,
}) => {
    const { t } = useLanguage();
    const photoInputRef = useRef<HTMLInputElement | null>(null);

    const age = calcAge(patient.dob);
    const phone = (value?: string) => (showPhone ? value : maskPhone(value));
    const sexAge = [
        patient.gender === 'Male' ? t('patients.modal.male') : t('patients.modal.female'),
        age !== null ? `${age} ${t('patients.details.age')}` : '',
    ].filter(Boolean).join(' · ');
    const archived = patient.status === 'Archived';
    const initials = `${patient.lastName?.[0] || ''}${patient.firstName?.[0] || ''}`.toUpperCase();

    return (
        <section aria-labelledby="pt-name"
            className="min-w-0 bg-surface border border-line rounded-[20px] p-5 flex flex-col gap-4">

            {/* ── Kim ───────────────────────────────────────────────────── */}
            <div className="flex items-start gap-3.5">
                <button type="button" onClick={() => photoInputRef.current?.click()}
                    aria-label={t('card.menuPhoto')} title={t('card.menuPhoto')}
                    className="group relative shrink-0 w-14 h-14 rounded-2xl bg-primary-600 text-white grid place-items-center overflow-hidden text-lg font-bold focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
                    {patient.avatarUrl
                        ? <img src={getFileUrl('patient-avatar', patient.id)} alt="" className="w-full h-full object-cover" />
                        : initials}
                    <span aria-hidden="true"
                        className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                        <Camera className="w-5 h-5" />
                    </span>
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                        <h1 id="pt-name" className="min-w-0 flex-1 text-lg leading-snug font-semibold text-ink break-words">
                            {patient.lastName} {patient.firstName}
                        </h1>
                        <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${archived
                            ? 'bg-elevated text-muted'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                            {archived ? t('patients.filter.archived') : t('patients.filter.active')}
                        </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{sexAge}</p>
                    {patient.dob && <p className="text-xs text-faint tabular-nums">{formatDobDDMMYYYY(patient.dob)}</p>}
                </div>
            </div>

            {/* ── Qarz va oxirgi tashrif ───────────────────────────────── */}
            <div className="grid grid-cols-2 rounded-xl border border-line overflow-hidden">
                <button type="button" onClick={onOpenPayments} title={t('card.secPayments')}
                    className="text-left px-3.5 py-2.5 hover:bg-elevated transition-colors">
                    <span className="block text-xs text-muted">{t('pcard.debt')}</span>
                    {due > 0
                        ? <span className="block text-lg font-semibold text-red-600 dark:text-red-400 tabular-nums">{formatNumber(due)}</span>
                        : <span className="block text-lg font-semibold text-ink tabular-nums">0</span>}
                    {(patient.balance || 0) > 0 && (
                        <span className="block text-xs text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {fill(t('card.advance'), formatNumber(patient.balance || 0))}
                        </span>
                    )}
                </button>
                <div className="px-3.5 py-2.5 border-l border-line">
                    <span className="block text-xs text-muted">{t('pcard.lastVisit')}</span>
                    <span className="block text-sm font-medium text-ink leading-7">
                        {lastVisit ? formatDobDDMMYYYY(lastVisit) : t('pcard.noVisits')}
                    </span>
                </div>
            </div>
            {due > 0 && onTakePayment ? (
                <button type="button" onClick={onTakePayment}
                    className="-mt-1.5 w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 text-sm font-semibold hover:bg-primary-50 dark:hover:bg-primary-900/30">
                    <Wallet className="w-4 h-4" aria-hidden="true" /> {t('card.takePayment')}
                </button>
            ) : onAddPayment && (
                <button type="button" onClick={onAddPayment}
                    className="-mt-1.5 w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 text-sm font-semibold hover:bg-primary-50 dark:hover:bg-primary-900/30">
                    <Plus className="w-4 h-4" aria-hidden="true" /> {t('card.addPayment')}
                </button>
            )}

            {/* ── Keyingi qabul ─────────────────────────────────────────── */}
            {nextAppointment && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3.5 py-2.5">
                    <span className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t('card.nextVisit')}</span>
                    <span className="block text-sm font-medium text-ink tabular-nums">
                        {[`${nextAppointment.date === todayISO() ? t('card.today') : formatDobDDMMYYYY(nextAppointment.date)}, ${nextAppointment.time}`,
                            nextAppointment.doctorName].filter(Boolean).join(' · ')}
                    </span>
                </div>
            )}

            {/* ── Aloqa ─────────────────────────────────────────────────── */}
            <ul className="flex flex-col gap-2 text-sm text-ink">
                <li className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 shrink-0 text-faint" aria-hidden="true" />
                    <span className="min-w-0 tabular-nums">{phone(patient.phone) || '—'}</span>
                </li>
                {patient.secondaryPhone && (
                    <li className="flex items-center gap-2.5">
                        <Phone className="w-4 h-4 shrink-0 text-faint" aria-hidden="true" />
                        <span className="min-w-0 tabular-nums">{phone(patient.secondaryPhone)} <span className="text-muted">{t('patientdetails.qoshimcha')}</span></span>
                    </li>
                )}
                {patient.cardNumber && (
                    <li className="flex items-center gap-2.5">
                        <CreditCard className="w-4 h-4 shrink-0 text-faint" aria-hidden="true" />
                        <span>{fill(t('card.cardNo'), patient.cardNumber)}</span>
                    </li>
                )}
                {/* Doimiy shifokor bo'lmasa qator chiqmaydi: «Shifokor
                    biriktirilmagan» yozuvi bugungi qabuldagi shifokor bilan
                    yonma-yon turib, xatodek o'qilardi (2026-11-21). Biriktirish —
                    pastdagi tugma. */}
                {patient.doctorName && (
                    <li className="flex items-center gap-2.5">
                        <Stethoscope className="w-4 h-4 shrink-0 text-faint" aria-hidden="true" />
                        <span>{patient.doctorName}</span>
                    </li>
                )}
            </ul>

            {/* ── Xavfsizlik: allergiya va statsionar ──────────────────── */}
            {(allergiesUnknown || admitted) && (
                <div className="flex flex-wrap gap-1.5">
                    {allergiesUnknown && (
                        <span role="alert" className="inline-flex items-center min-h-7 px-2.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[13px] font-medium">
                            {t('card.allergyUnknown')}
                        </span>
                    )}
                    {admitted && (
                        <span className="inline-flex items-center gap-1.5 min-h-7 px-2.5 rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-[13px] font-medium">
                            <BedDouble className="w-3.5 h-3.5" aria-hidden="true" /> {t('pcard.admitted')}
                        </span>
                    )}
                </div>
            )}

            {/* ── Amallar ───────────────────────────────────────────────── */}
            <div className="flex flex-col gap-2 pt-1 border-t border-line">
                <button type="button" onClick={onSchedule}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold">
                    <Calendar className="w-4 h-4" aria-hidden="true" /> {t('pcard.schedule')}
                </button>
                <div className="grid grid-cols-4 rounded-xl border border-line overflow-hidden divide-x divide-line">
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
                </div>
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
