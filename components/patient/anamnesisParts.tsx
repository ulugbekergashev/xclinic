import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

/* Tibbiy tarix blokining mayda qismlari: qator, belgi (chip), tanlov tugmasi
   va tanlash qutisi. Mantiq yo'q — faqat ko'rinish; mantiq `Anamnesis.tsx`
   va `AnamnesisPickers.tsx` da. */

export type ChipTone = 'plain' | 'red' | 'amber' | 'ok';

const TONE: Record<ChipTone, string> = {
    plain: 'bg-elevated text-ink',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

export const fieldCls = 'w-full px-3 py-2 text-sm border border-line rounded-xl bg-surface text-ink';
export const addBtn = 'shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30';

/** Kartadagi belgi: «Lidokain · og'ir», «I10 Gipertoniya», «Chekmaydi» */
export const Chip: React.FC<{
    tone?: ChipTone;
    code?: string;
    note?: string;
    title?: string;
    onRemove?: () => void;
    removeLabel?: string;
    children: React.ReactNode;
}> = ({ tone = 'plain', code, note, title, onRemove, removeLabel, children }) => (
    <li title={title}
        className={`inline-flex items-center gap-1 min-h-7 py-0.5 ${onRemove ? 'pl-2.5 pr-1' : 'px-2.5'} rounded-lg text-[13px] font-medium ${TONE[tone]}`}>
        {code && <b className="text-[11.5px] font-bold text-primary-700 dark:text-primary-300 tabular-nums">{code}</b>}
        <span className="min-w-0 break-words">{children}</span>
        {note && <span className="text-xs font-normal opacity-80">· {note}</span>}
        {onRemove && (
            <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel}
                className="shrink-0 w-6 h-6 grid place-items-center rounded-md opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10">
                <X className="w-3.5 h-3.5" />
            </button>
        )}
    </li>
);

/** Bitta bo'lim: tepada nomi va «+ Qo'shish», ostida belgilar — blokning
 *  to'liq kengligida (yonma-yon ustunlarda tor blokda so'zlar bo'linib ketardi). */
export const Row: React.FC<{
    id: string;
    label: string;
    action?: React.ReactNode;
    children?: React.ReactNode;
    picker?: React.ReactNode;
}> = ({ id, label, action, children, picker }) => (
    <div className="flex flex-col gap-1.5 pt-3 first:pt-0 border-t first:border-t-0 border-line">
        <div className="flex items-center justify-between gap-2 min-h-7">
            <h3 id={id} className="text-[13px] font-medium text-muted">{label}</h3>
            {action}
        </div>
        <ul aria-labelledby={id} className="min-w-0 flex flex-wrap items-center gap-1.5 empty:hidden">{children}</ul>
        {picker}
    </div>
);

/** Tanlov tugmasi — bosilsa yoqiladi, yana bosilsa o'chadi */
export const Opt: React.FC<{
    on: boolean;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
    dashed?: boolean;
    code?: string;
    children: React.ReactNode;
}> = ({ on, onClick, disabled, title, dashed, code, children }) => (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled} title={title}
        className={`inline-flex items-center gap-1.5 min-h-8 px-2.5 rounded-lg border text-[13px] font-semibold transition-colors disabled:opacity-40 ${on
            ? 'border-primary-500 bg-primary-600 text-white'
            : `${dashed ? 'border-dashed' : ''} border-line bg-surface text-ink hover:border-primary-400`}`}>
        {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
        {children}
        {code && <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-white/80' : 'text-faint'}`}>{code}</span>}
    </button>
);

/** Qator ostida ochiladigan tanlash qutisi. «Tayyor» — yopadi (saqlash allaqachon bo'lgan). */
export const PickBox: React.FC<{ label: string; doneLabel: string; onDone: () => void; children: React.ReactNode }> = ({
    label, doneLabel, onDone, children,
}) => (
    <div role="group" aria-label={label} className="flex flex-col gap-2.5 p-2.5 rounded-xl border border-line bg-canvas">
        {children}
        <button type="button" onClick={onDone}
            className="self-end px-4 py-2 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700">
            {doneLabel}
        </button>
    </div>
);

export const OptRow: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-1.5">
        {label && <span className="text-xs font-medium text-muted">{label}</span>}
        <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
);

/** Matn maydoni + «Qo'shish»: Enter ham qo'shadi */
export const AddText: React.FC<{
    placeholder: string;
    addLabel: string;
    onAdd: (text: string) => void;
}> = ({ placeholder, addLabel, onAdd }) => {
    const [value, setValue] = useState('');
    const submit = () => {
        const text = value.trim();
        if (!text) return;
        onAdd(text);
        setValue('');
    };
    return (
        <div className="flex gap-2">
            <input value={value} className={fieldCls} aria-label={placeholder} placeholder={placeholder}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
            <button type="button" onClick={submit} disabled={!value.trim()}
                className="shrink-0 px-3 py-2 text-sm font-bold border border-line rounded-xl text-ink hover:border-primary-400 disabled:opacity-50">
                {addLabel}
            </button>
        </div>
    );
};
