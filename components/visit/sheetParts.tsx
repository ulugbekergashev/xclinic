import React from 'react';
import { Trash2 } from 'lucide-react';
import { VisitCharge } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

/* Qabul varag'ining mayda bo'laklari — blok, «+ qo'shish» tugmasi, tanlov
   va qator. Varaqning hamma bloki shulardan yig'iladi, shuning uchun bloklar
   bir xil ko'rinadi va bir xil ishlaydi. */

export const inputCls = 'w-full px-3 py-2 border border-line rounded-xl bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

/** Blok ichidagi kichik yorliq. Bosh harf bilan YOZILMAYDI: «ANAMNEZ»,
    «KO'RIK» kabi bosh harfli yozuvlar ekranni shovqinli qilardi. */
export const SheetLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
    <p className="text-[13px] font-medium text-muted">
        {children}
        {hint && <span className="ml-1.5 text-faint">— {hint}</span>}
    </p>
);

/** Kichik tanlov tugmasi: mahal, kun, tez dori yoki tez tashxis.
    `on` — tanlangan holat (masalan, shu qatorda «2×» belgilangan). */
export const ChipButton: React.FC<{
    on?: boolean; disabled?: boolean; onClick: () => void; title?: string; children: React.ReactNode;
}> = ({ on, disabled, onClick, title, children }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} title={title}
        className={`inline-flex items-center gap-1 min-h-[30px] px-2.5 rounded-lg border text-[12.5px] font-medium transition-colors disabled:opacity-50 ${on
            ? 'border-primary-600 bg-primary-600 text-white'
            : 'border-line bg-surface text-ink hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}>
        {children}
    </button>
);

/** Tanlov — «+» bosilganda OYNADA ochiladi. Sarlavhani oynaning o'zi
    ko'rsatadi, bu yerda faqat ekran o'quvchi uchun nom. */
export const PickerBox: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
    <div role="group" aria-label={title}>
        {children}
    </div>
);

export const PaidBadge: React.FC<{ charge?: VisitCharge }> = ({ charge }) => {
    const { t } = useLanguage();
    if (!charge) return null;
    const paid = charge.status === 'Paid';
    return (
        <span className={`text-[11px] font-medium shrink-0 ${paid
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'}`}>
            {paid ? t('visit.paidShort') : t('visit.unpaidShort')}
        </span>
    );
};

/** «Bugungi qabul» ro'yxatidagi bitta qator: tashxis, xizmat, tahlil,
    diagnostika, retsept. Qatorlar orasida ingichka chiziq — har biri alohida
    quti bo'lib turmaydi. `kind` — nima ekani («Xizmat», «Tahlil» …): hammasi
    bitta ro'yxatda turgani uchun har qator o'zini aytadi. */
export const ItemRow: React.FC<{
    icon?: React.ElementType;
    main: string; kind?: string; sub?: string; right?: string;
    tone?: 'ok' | 'wait'; charge?: VisitCharge;
    onDelete?: () => void;
    /** O'chirish tugmasining nomi — standart «O'chirish» */
    deleteLabel?: string;
    action?: React.ReactNode;
}> = ({ icon: Icon, main, kind, sub, right, tone, onDelete, deleteLabel, charge, action }) => {
    const { t } = useLanguage();
    return (
        <li className="flex items-center gap-3 py-2.5 text-sm border-t border-line first:border-t-0 first:pt-0">
            {Icon && <Icon className="w-4 h-4 shrink-0 text-faint" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink break-words">{main}</span>
                {(kind || sub || charge || right) && (
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {kind && <span>{kind}</span>}
                        {sub && (
                            <span className={tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
                                : tone === 'wait' ? 'text-amber-700 dark:text-amber-400' : ''}>
                                {sub}
                            </span>
                        )}
                        {right && <span className="tabular-nums">{right}</span>}
                        <PaidBadge charge={charge} />
                    </span>
                )}
            </span>
            {action}
            {onDelete && (
                <button type="button" aria-label={deleteLabel || t('ui.ochirish')} title={deleteLabel || t('ui.ochirish')} onClick={onDelete}
                    className="w-7 h-7 grid place-items-center rounded-md text-faint hover:text-red-600 hover:bg-elevated shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
        </li>
    );
};
