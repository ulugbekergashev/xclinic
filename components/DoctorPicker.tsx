import React, { useMemo } from 'react';
import { Doctor } from '../types';
import { formatDoctorName } from '../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   SHIFOKORNI TANLASH — YAGONA QOIDA.

   Shifokor tanlash ro'yxati o'nga yaqin joyda bor edi va har birida
   FILTR BOSHQACHA:

     · kalendarda   — `status === 'Active'`;
     · statsionarda — filtrsiz;
     · laboratoriyada, xabarlarda, bemorlar ro'yxatida — filtrsiz;
     · qabul panelida — bo'lim bo'yicha, lekin holatsiz.

   Ya'ni klinikadan ketgan yoki ta'tildagi shifokor ko'p joyda hamon
   tanlanadigan bo'lib turardi: unga tahlil buyurtmasi ochilardi, bemor
   biriktirilardi, xabar yozilardi. Va buni sezish qiyin — ro'yxat
   ko'rinishidan farq qilmaydi.

   Endi qoida bitta: FAQAT FAOL shifokorlar. Kerak bo'lsa bo'lim bo'yicha
   ham toraytiriladi.

   `current` — tahrirlash uchun: yozuvda ta'tilga chiqqan yoki ishdan
   ketgan shifokor ko'rsatilgan bo'lishi mumkin, va uni ro'yxatdan
   yashirish qiymatni JIMGINA yo'qotardi. Shuning uchun u alohida,
   izoh bilan qo'shiladi.
   ───────────────────────────────────────────────────────────────────────────── */

export interface DoctorPickerProps {
    doctors: Doctor[];
    value: string;
    onChange: (doctorId: string) => void;
    label?: string;
    /** Faqat shu bo'lim shifokorlari. Bo'limsiz shifokorlar HAR DOIM qoladi:
     *  bo'lim ko'rsatilmagani «hech qayerda ishlamaydi» degani emas. */
    departmentId?: string | null;
    /** Bo'sh variantning matni. Berilmasa — tanlov majburiy. */
    emptyLabel?: string;
    required?: boolean;
    disabled?: boolean;
    className?: string;
    id?: string;
}

/** Ro'yxatga tushadigan shifokorlar — bitta joyda, sinov uchun ham ochiq. */
export function pickableDoctors(
    doctors: Doctor[], departmentId?: string | null, currentId?: string,
): Doctor[] {
    return doctors.filter(d => {
        if (currentId && d.id === currentId) return true;
        if (d.status !== 'Active') return false;
        // Bo'limsiz shifokor har bo'limda qoladi
        return !departmentId || !d.departmentId || d.departmentId === departmentId;
    });
}

export const DoctorPicker: React.FC<DoctorPickerProps> = ({
    doctors, value, onChange, label, departmentId, emptyLabel,
    required, disabled, className = '', id,
}) => {
    const autoId = React.useId();
    const selectId = id || autoId;

    const list = useMemo(
        () => pickableDoctors(doctors, departmentId, value),
        [doctors, departmentId, value]);

    /* Tanlangan shifokor endi faol emas — buni AYTAMIZ. Jimgina
       ko'rsatib turish «hammasi joyida» degan taassurot beradi. */
    const chosen = doctors.find(d => d.id === value);
    const staleWarning = chosen && chosen.status !== 'Active';

    return (
        <div className={className}>
            {label && (
                <label htmlFor={selectId}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {label}
                </label>
            )}
            <select
                id={selectId}
                value={value}
                required={required}
                disabled={disabled}
                onChange={e => onChange(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-60"
            >
                {(emptyLabel || !value) && (
                    <option value="">{emptyLabel || '— Tanlang —'}</option>
                )}
                {list.map(d => (
                    <option key={d.id} value={d.id}>
                        {formatDoctorName(d)}
                        {d.specialty ? ` — ${d.specialty}` : ''}
                        {d.status !== 'Active' ? ' (ishlamayapti)' : ''}
                    </option>
                ))}
            </select>
            {staleWarning && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    Bu shifokor hozir faol emas — yozuvda eskisi qolgan.
                </p>
            )}
            {list.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-1">
                    {departmentId
                        ? "Bu bo'limda faol shifokor yo'q"
                        : "Faol shifokor yo'q — Sozlamalar → Xodimlar"}
                </p>
            )}
        </div>
    );
};
