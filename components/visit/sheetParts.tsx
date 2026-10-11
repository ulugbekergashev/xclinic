import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { VisitCharge } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

/* Qabul varag'ining mayda bo'laklari — sarlavha, «+ qo'shish» tugmasi, tanlov
   qutisi, qator. Varaqning hamma bo'limi shu to'rttadan yig'iladi, shuning
   uchun bo'limlar bir xil ko'rinadi va bir xil ishlaydi. */

export const inputCls = 'w-full px-3 py-2 border border-line rounded-xl bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

/** Bo'lim sarlavhasi: «TASHXIS», «TAYINLOV» … */
export const SheetLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
        {children}
        {hint && <span className="ml-1.5 normal-case tracking-normal font-semibold text-faint">— {hint}</span>}
    </p>
);

/** Uzuq chiziqli «+ nimadir» — bosilganda ostida tanlov qutisi ochiladi */
export const AddButton: React.FC<{
    label: string; open?: boolean; solid?: boolean; onClick: () => void;
}> = ({ label, open = false, solid = false, onClick }) => (
    <button type="button" onClick={onClick} aria-expanded={open}
        className={solid
            ? `inline-flex items-center gap-1 h-8 px-3 rounded-lg border text-xs font-bold whitespace-nowrap transition-colors ${open
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-primary-200 dark:border-primary-800 bg-surface text-primary-700 dark:text-primary-300 hover:border-primary-400'}`
            : `inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[10px] border-[1.5px] border-dashed text-[13px] font-bold transition-colors ${open
                ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                : 'border-line text-muted hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300'}`}>
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />{label}
    </button>
);

/** Tanlov qutisi: qidiruv, ro'yxat, forma — «+» ostida ochiladi */
export const PickerBox: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
    <div role="group" aria-label={title} className="rounded-xl border border-primary-200 dark:border-primary-800 bg-canvas p-3">
        {title && <p className="mb-2.5 text-[13px] font-bold text-ink">{title}</p>}
        {children}
    </div>
);

export const PaidBadge: React.FC<{ charge?: VisitCharge }> = ({ charge }) => {
    const { t } = useLanguage();
    if (!charge) return null;
    const paid = charge.status === 'Paid';
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${paid
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
            {paid ? t('visit.paidShort') : t('visit.unpaidShort')}
        </span>
    );
};

/** Varaqdagi bitta qator: xizmat, yo'llanma yoki dori */
export const ItemRow: React.FC<{
    icon?: React.ElementType;
    main: string; sub?: string; right?: string;
    tone?: 'ok' | 'wait'; charge?: VisitCharge;
    onDelete?: () => void;
    action?: React.ReactNode;
}> = ({ icon: Icon, main, sub, right, tone, onDelete, charge, action }) => {
    const { t } = useLanguage();
    return (
        <li className="flex items-center gap-3 pl-3 pr-2 py-2 rounded-xl border border-line bg-canvas text-sm">
            {Icon && <Icon className="w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink truncate">{main}</span>
                {sub && (
                    <span className={`block text-xs truncate ${tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
                        : tone === 'wait' ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}`}>
                        {sub}
                    </span>
                )}
            </span>
            {action}
            <PaidBadge charge={charge} />
            {right && <span className="tabular-nums text-muted shrink-0">{right}</span>}
            {onDelete && (
                <button type="button" aria-label={t('ui.ochirish')} onClick={onDelete}
                    className="w-7 h-7 grid place-items-center rounded-md text-faint hover:text-red-600 hover:bg-surface shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
        </li>
    );
};
