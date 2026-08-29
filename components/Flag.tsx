/* Bayroqchalar — SVG, emoji EMAS.

   Sabab: Windows'da bayroq emojisi umuman chizilmaydi. 🇺🇿 aslida ikkita
   "mintaqa ko'rsatkichi" harfidan iborat va Windows uni bitta rasmga
   birlashtirmaydi — ekranda oddiy "UZ" harflari qoladi. Til almashtirgichda
   yonida "UZ" yozuvi ham turgani uchun foydalanuvchi «UZ UZ» ni ko'rardi.

   Shuning uchun bayroqlar bu yerda soddalashtirilgan SVG bo'lib chizilgan:
   hech qanday shrift yoki tashqi rasmga bog'liq emas. */

import React from 'react';

type Props = { code: 'uz' | 'ru'; className?: string };

export const Flag: React.FC<Props> = ({ code, className = 'w-5 h-3.5' }) => {
    const common = `${className} rounded-[2px] shrink-0 ring-1 ring-black/10 dark:ring-white/15`;

    if (code === 'ru') {
        return (
            <svg viewBox="0 0 9 6" className={common} aria-hidden="true">
                <rect width="9" height="2" y="0" fill="#fff" />
                <rect width="9" height="2" y="2" fill="#0039A6" />
                <rect width="9" height="2" y="4" fill="#D52B1E" />
            </svg>
        );
    }

    /* O'zbekiston: ko'k–oq–yashil, orasida ingichka qizil chiziqlar,
       yuqori chapda yarim oy va yulduzlar. */
    return (
        <svg viewBox="0 0 18 9" className={common} aria-hidden="true">
            <rect width="18" height="2.7" y="0" fill="#0099B5" />
            <rect width="18" height="0.35" y="2.7" fill="#CE1126" />
            <rect width="18" height="2.6" y="3.05" fill="#fff" />
            <rect width="18" height="0.35" y="5.65" fill="#CE1126" />
            <rect width="18" height="3" y="6" fill="#1EB53A" />
            <circle cx="3.1" cy="1.35" r="0.95" fill="#fff" />
            <circle cx="3.5" cy="1.35" r="0.95" fill="#0099B5" />
            <g fill="#fff">
                <circle cx="5.3" cy="0.75" r="0.16" />
                <circle cx="5.3" cy="1.6" r="0.16" />
                <circle cx="6.3" cy="0.75" r="0.16" />
                <circle cx="6.3" cy="1.6" r="0.16" />
                <circle cx="6.3" cy="2.3" r="0.16" />
            </g>
        </svg>
    );
};
