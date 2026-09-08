/* XClinic logotipi — SVG, rasm EMAS.

   Nega SVG. Ilgari uch joyda `/logo-icon.png` (denta7 dan qolgan TISH
   surati) turardi, login sahifasida esa umuman boshqa narsa — TABASSUM
   belgisi. Ya'ni dasturning uch ekranida uch xil logotip edi. Tish
   umumiy klinika dasturiga mos ham emas.

   SVG rasmdan afzal: har qanday o'lchamda tiniq (Retina va 16px favicon
   bir xil), rangi mavzuga moslashadi, alohida fayl yuklanmaydi — ya'ni
   internetsiz kompyuterda ham kafolatlangan chiziladi.

   Shakl. "X" ikkita yumaloq uchli chiziqdan. Ikkinchi chiziq ostidan fon
   rangida qalinroq chiziq o'tkazilgan — kesishgan joyda kichik bo'shliq
   hosil bo'lib, chiziqlar bir-birining ustidan o'tgandek ko'rinadi.
   Bo'shliq fon bilan aynan bir xil rangda chiqishi uchun gradient
   `userSpaceOnUse` da: shunda to'rtburchak ham, chiziq ham gradientni
   bitta koordinata maydonidan oladi. */

import React from 'react';

let uid = 0;

type Props = {
    /** Tashqi o'lcham — Tailwind klassi bilan beriladi (`w-10 h-10`). */
    className?: string;
    /** Fon plitkasisiz, faqat "X" — och fonli joylar uchun. */
    bare?: boolean;
};

export const Logo: React.FC<Props> = ({ className = 'w-10 h-10', bare = false }) => {
    /* Bitta sahifada bir nechta logotip bo'lishi mumkin, id lar esa hujjat
       bo'ylab yagona bo'lishi shart — aks holda brauzer birinchisining
       gradientini hammasiga qo'llaydi. */
    const id = React.useMemo(() => `xl${++uid}`, []);
    const g = `${id}-g`, s = `${id}-s`;

    return (
        <svg viewBox="0 0 48 48" className={className} role="img" aria-label="XClinic">
            <defs>
                <linearGradient id={g} gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="44" y2="44">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="55%" stopColor="#4F46E5" />
                    <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
                {/* Yuqoridan pastga so'nuvchi oq — plitkaga hajm beradi */}
                <linearGradient id={s} gradientUnits="userSpaceOnUse" x1="24" y1="0" x2="24" y2="30">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
            </defs>

            {!bare && (
                <>
                    <rect width="48" height="48" rx="12.5" fill={`url(#${g})`} />
                    <rect width="48" height="48" rx="12.5" fill={`url(#${s})`} />
                </>
            )}

            <g fill="none" strokeLinecap="round">
                {/* Pastga tushuvchi chiziq */}
                <path d="M16.5 16.5 L31.5 31.5" stroke={bare ? `url(#${g})` : '#fff'} strokeWidth="6.4" />
                {/* Ko'taruvchi chiziqning "ostki" qatlami — kesishmada bo'shliq */}
                <path d="M31.5 16.5 L16.5 31.5" stroke={bare ? '#fff' : `url(#${g})`} strokeWidth="11.4" />
                <path d="M31.5 16.5 L16.5 31.5" stroke={bare ? `url(#${g})` : '#fff'} strokeWidth="6.4" />
            </g>
        </svg>
    );
};

/** Logotip + yozuv. Sarlavha va login sahifasida bir xil ko'rinishi uchun. */
export const LogoWordmark: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
    <div className={`flex items-center ${size === 'md' ? 'gap-3' : 'gap-2'} shrink-0`}>
        <Logo className={size === 'md' ? 'w-10 h-10' : 'w-8 h-8'} />
        <span className={`font-extrabold tracking-tight text-ink ${
            size === 'md' ? 'text-2xl' : 'text-xl'
        }`}>
            X<span className="text-primary dark:text-primary-400">Clinic</span>
        </span>
    </div>
);
