import React from 'react';
import { LucideIcon } from 'lucide-react';

export type StatColor = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatCardProps {
    label: string;
    value: React.ReactNode;
    unit?: string;
    icon: LucideIcon;
    color?: StatColor;
    variant?: 'flat' | 'gradient';
    subtitle?: React.ReactNode;
    trend?: React.ReactNode;
    onClick?: () => void;
    active?: boolean; // filter-style tanlangan holat (flat)
    className?: string;
}

/* Yagona KPI/stat karta.
     flat     — karta foni + rangli ikonka chipi;
     active   — filtr tanlangan holat (TUSLI, to'ldirilgan emas — pastga qarang);
     gradient — to'liq rangli (faqat sanoqli, eng muhim kartalar).

   Rang endi SHAFFOFLIK orqali beriladi (`/12`), tayyor 50/900 pog'onalar
   bilan emas. Sabab: `bg-primary-50` yorug' temada oq-ko'k, qorong'ida esa
   deyarli oq dog' bo'lib chiqadi va har bir rang uchun `dark:` juftlik
   yozishga to'g'ri kelardi. Shaffof tus fon qanday bo'lsa, shunga
   moslashadi — bitta qator ikkala temada ishlaydi. */
const FLAT_ICON: Record<StatColor, string> = {
    primary: 'bg-primary-500/12 text-primary',
    success: 'bg-success-500/12 text-success',
    warning: 'bg-warning-500/12 text-warning',
    danger: 'bg-danger-500/12 text-danger',
    info: 'bg-info-500/12 text-info',
    neutral: 'bg-elevated text-muted',
};

const GRADIENT_BG: Record<StatColor, string> = {
    primary: 'from-primary-500 via-primary-600 to-primary-700 shadow-primary-500/25',
    success: 'from-emerald-400 via-success-500 to-teal-600 shadow-success/25',
    warning: 'from-amber-400 via-warning-500 to-orange-600 shadow-warning/25',
    danger: 'from-rose-400 via-danger-500 to-red-600 shadow-danger/25',
    info: 'from-sky-400 via-info-500 to-cyan-600 shadow-info/25',
    neutral: 'from-gray-500 via-gray-600 to-gray-700 shadow-gray-500/25',
};

/* TANLANGAN FILTR — TO'LDIRILGAN EMAS, TUSLI.

   Ilgari bu `bg-primary text-white` edi: butun karta yorqin rangga
   bo'yalardi. Qorong'i temada natija yomon — to'rtta kartaning biri
   ekranni yoritib yuboradigan blok bo'lib turadi va oq matn ochiq
   indigo ustida o'qilmaydi (kontrast ~2,6:1).

   Endi tanlanganlik uch belgidan bilinadi: tusli fon, rangli ramka va
   raqamning rangi. Karta qolganlari bilan bir og'irlikda qoladi, lekin
   qaysi biri tanlangani baribir bir qarashda ko'rinadi. */
const ACTIVE_CLS: Record<StatColor, string> = {
    primary: 'bg-primary-500/10 border-primary-500/45',
    success: 'bg-success-500/10 border-success-500/45',
    warning: 'bg-warning-500/10 border-warning-500/45',
    danger: 'bg-danger-500/10 border-danger-500/45',
    info: 'bg-info-500/10 border-info-500/45',
    neutral: 'bg-elevated border-line',
};

const ACTIVE_TEXT: Record<StatColor, string> = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
    neutral: 'text-ink',
};

/* KONTRAST (S4.4, audit B-16).

   Audit: «YANGI BEMORLAR» (10px), «Oxirgi 7 kun», «QARZDOR BEMORLAR»...
   kontrast 2,6:1, WCAG AA talabi 4,5:1. Ustiga 10px o'lchamdagi katta
   harfli matn.

   Sabab shu fayldagi ikkita sinf edi: `text-[10px]` va `text-faint`.
   `gray-400` (#9ca3af) oq fonda 2,55:1 beradi.

   Yorug' va qorong'i temada TURLI tus kerak: `gray-600` oq fonda 7,5:1,
   lekin `gray-800` fonda 3,1:1 — ya'ni bitta rang ikkalasida ishlamaydi. */
const LABEL_CLS = 'text-[11px] font-bold text-muted uppercase tracking-widest leading-none';
const MUTED_CLS = 'text-muted';

export const StatCard: React.FC<StatCardProps> = ({
    label, value, unit, icon: Icon, color = 'primary', variant = 'flat',
    subtitle, trend, onClick, active = false, className = '',
}) => {
    const clickable = onClick ? 'cursor-pointer active:scale-[0.98]' : '';

    /* Bosiladigan karta KLAVIATURAGA ham ochiq bo'lishi kerak (S4.2).
       `div onClick` Tab bilan yetib bo'lmaydigan tugma yaratadi — ekran
       o'quvchi uni umuman e'lon qilmaydi. */
    const interactive = onClick
        ? { role: 'button' as const, tabIndex: 0, onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
            } }
        : {};

    if (variant === 'gradient') {
        return (
            <div
                {...interactive}
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${GRADIENT_BG[color]} p-6 text-white shadow-lg ${clickable} transition-all ${className}`}
            >
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
                <div className="absolute -right-2 -bottom-8 w-32 h-32 rounded-full bg-white/5" />
                <div className="relative">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-white/20 rounded-lg"><Icon className="w-4 h-4" /></div>
                        <p className="text-white/95 text-xs font-semibold uppercase tracking-wider">{label}</p>
                    </div>
                    <h3 className="text-3xl font-black leading-none">{value}</h3>
                    {unit && <p className="text-white/90 text-xs font-medium mt-1">{unit}</p>}
                    {(subtitle || trend) && (
                        <div className="mt-4 text-xs text-white/95 font-medium">{trend || subtitle}</div>
                    )}
                </div>
            </div>
        );
    }

    /* Flat va active bitta shakl — farqi faqat fon/ramka/raqam rangida.
       Ilgari ular ikkita alohida JSX bloki edi va bir-biridan ajralib
       ketgandi: bittasida `p-5`, ikkinchisida boshqa yorliq o'lchami,
       ikkalasida ham `LABEL_CLS` ishlatilmasdi. */
    return (
        <div
            {...interactive}
            className={`relative group overflow-hidden p-5 card transition-colors
                        ${active ? ACTIVE_CLS[color] : 'hover:border-line'}
                        ${clickable} ${className}`}
        >
            <div className={`p-2 w-fit rounded-xl ${FLAT_ICON[color]}`}><Icon className="w-5 h-5" /></div>
            <div className="mt-4">
                <p className={LABEL_CLS}>{label}</p>
                <h3 className={`text-2xl font-black mt-1 leading-none tnum ${active ? ACTIVE_TEXT[color] : 'text-ink'}`}>
                    {value}{unit && <span className={`text-sm font-semibold ml-1 ${MUTED_CLS}`}>{unit}</span>}
                </h3>
                {(subtitle || trend) && (
                    <p className={`text-xs mt-2 ${MUTED_CLS}`}>{trend || subtitle}</p>
                )}
            </div>
        </div>
    );
};
