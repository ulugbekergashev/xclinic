import React, { useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

/* ── KIM YO'NALTIRDI (tashqi yo'llanma) ──────────────────────────────────────
   Registrator qabul ochganda bitta ixtiyoriy maydon. Bo'sh — bemor o'zi
   keldi (sukut). Yozilsa — boshqa klinika yoki shifokor yo'naltirgan
   (`referralSource: 'External'`, migratsiya 0040). Qabul qiluvchi shifokor
   uni varaq tepasida ko'radi.

   Bir marta yozilgan nom shu kompyuterda eslab qolinadi va keyingi safar
   ro'yxatdan tanlanadi — bir poliklinika har kuni bir xil yoziladi.
   Ichki yo'llanma (klinikaning o'z shifokori) bu yerda emas: u qabul
   varag'idagi «Yo'naltirish» tugmasidan o'zi yoziladi. */

const KEY = 'xclinic.referrers';
const MAX = 30;

const readNames = (): string[] => {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
};

/** Qabul ochilgach chaqiriladi — nom ro'yxat boshiga tushadi */
export function rememberReferrer(name: string): void {
    const n = name.trim();
    if (!n) return;
    try {
        const next = [n, ...readNames().filter(x => x.toLowerCase() !== n.toLowerCase())].slice(0, MAX);
        localStorage.setItem(KEY, JSON.stringify(next));
    } catch { /* xususiy oyna yoki kvota — ro'yxatsiz ham ishlaydi */ }
}

/** `api.visits.create` ga qo'shiladigan maydonlar: bo'sh bo'lsa — hech narsa */
export const referrerFields = (name: string) => {
    const n = name.trim();
    return n ? { referralSource: 'External' as const, referredByName: n } : {};
};

export const ReferrerField: React.FC<{
    value: string;
    onChange: (name: string) => void;
    className?: string;
    labelClassName?: string;
}> = ({ value, onChange, className = '', labelClassName = '' }) => {
    const { t } = useLanguage();
    const id = useId();
    const [names] = useState(readNames);
    return (
        <div>
            <label htmlFor={`${id}-ref`} className={labelClassName}>{t('visit.referrerLabel')}</label>
            <input id={`${id}-ref`} list={`${id}-refs`} value={value} maxLength={120}
                placeholder={t('visit.referrerPh')} autoComplete="off"
                onChange={e => onChange(e.target.value)} className={className} />
            <datalist id={`${id}-refs`}>
                {names.map(n => <option key={n} value={n} />)}
            </datalist>
        </div>
    );
};
