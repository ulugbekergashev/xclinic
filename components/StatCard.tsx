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

// Yagona KPI/stat karta. flat = oq fon + rangli ikonka chipi; gradient = to'liq rangli (faqat muhim kartalar).
const FLAT_ICON: Record<StatColor, string> = {
    primary: 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400',
    success: 'bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success',
    warning: 'bg-warning-50 text-warning-600 dark:bg-warning-900/30 dark:text-warning',
    danger: 'bg-danger-50 text-danger-600 dark:bg-danger-900/30 dark:text-danger',
    info: 'bg-info-50 text-info-600 dark:bg-info-900/30 dark:text-info',
    neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const GRADIENT_BG: Record<StatColor, string> = {
    primary: 'from-primary-500 via-primary-600 to-primary-700 shadow-primary-500/25',
    success: 'from-emerald-400 via-success-500 to-teal-600 shadow-success/25',
    warning: 'from-amber-400 via-warning-500 to-orange-600 shadow-warning/25',
    danger: 'from-rose-400 via-danger-500 to-red-600 shadow-danger/25',
    info: 'from-sky-400 via-info-500 to-cyan-600 shadow-info/25',
    neutral: 'from-gray-500 via-gray-600 to-gray-700 shadow-gray-500/25',
};

const ACTIVE_BG: Record<StatColor, string> = {
    primary: 'bg-primary text-white border-primary',
    success: 'bg-success text-white border-success',
    warning: 'bg-warning text-white border-warning',
    danger: 'bg-danger text-white border-danger',
    info: 'bg-info text-white border-info',
    neutral: 'bg-gray-700 text-white border-gray-700',
};

/* KONTRAST (S4.4, audit B-16).

   Audit: «YANGI BEMORLAR» (10px), «Oxirgi 7 kun», «QARZDOR BEMORLAR»...
   kontrast 2,6:1, WCAG AA talabi 4,5:1. Ustiga 10px o'lchamdagi katta
   harfli matn.

   Sabab shu fayldagi ikkita sinf edi: `text-[10px]` va `text-gray-400`.
   `gray-400` (#9ca3af) oq fonda 2,55:1 beradi.

   Yorug' va qorong'i temada TURLI tus kerak: `gray-600` oq fonda 7,5:1,
   lekin `gray-800` fonda 3,1:1 — ya'ni bitta rang ikkalasida ishlamaydi. */
const LABEL_CLS = 'text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest leading-none';
const MUTED_CLS = 'text-gray-600 dark:text-gray-400';

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

    // Active (filter tanlangan) holat — to'ldirilgan rang
    if (active) {
        return (
            <div
                {...interactive}
                className={`relative overflow-hidden rounded-2xl border p-5 ${ACTIVE_BG[color]} shadow-lg ${clickable} transition-all ${className}`}
            >
                <div className="p-2 w-fit bg-white/20 rounded-xl"><Icon className="w-5 h-5" /></div>
                <div className="mt-4">
                    <p className="text-[11px] font-bold text-white/95 uppercase tracking-widest leading-none">{label}</p>
                    <h3 className="text-2xl font-black text-white mt-1 leading-none">{value}{unit && <span className="text-sm font-semibold text-white/95 ml-1">{unit}</span>}</h3>
                    {subtitle && <p className="text-xs text-white/90 mt-2">{subtitle}</p>}
                </div>
            </div>
        );
    }

    // Standart flat
    return (
        <div
            {...interactive}
            className={`relative group overflow-hidden bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md ${clickable} transition-all duration-300 ${className}`}
        >
            <div className={`p-2 w-fit rounded-xl ${FLAT_ICON[color]}`}><Icon className="w-5 h-5" /></div>
            <div className="mt-4">
                <p className={LABEL_CLS}>{label}</p>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1 leading-none">
                    {value}{unit && <span className={`text-sm font-semibold ml-1 ${MUTED_CLS}`}>{unit}</span>}
                </h3>
                {(subtitle || trend) && (
                    <p className={`text-xs mt-2 ${MUTED_CLS}`}>{trend || subtitle}</p>
                )}
            </div>
        </div>
    );
};
