/* AI TAYYORLAGAN AMALLAR — «Tasdiqlash / Bekor qilish» (2026-11-27).
   AI hech narsani o'zi bajarmaydi: server amalni tayyorlab, imzolangan
   bir martalik token beradi. Tasdiqlanganda server o'sha so'rovni ilovadagi
   tugma bilan AYNAN bir yo'ldan yuboradi (backend/ai/actions.ts). */

import React from 'react';
import { Check, X, Loader2, CalendarPlus, CalendarX, Bell, Send, Wallet, Receipt } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export type AiAction = {
    token: string;
    summary: string;
    kind: string;
    state: 'pending' | 'busy' | 'done' | 'cancelled' | 'error';
    message?: string;
};

const ICON: Record<string, React.ElementType> = {
    book_appointment: CalendarPlus,
    cancel_appointment: CalendarX,
    send_reminder: Bell,
    send_message: Send,
    record_payment: Wallet,
    create_expense: Receipt,
};

export function AiActionCards({ actions, onConfirm, onCancel }: {
    actions: AiAction[];
    onConfirm: (index: number) => void;
    onCancel: (index: number) => void;
}) {
    const { t } = useLanguage();
    if (!actions.length) return null;
    return (
        <ul className="mt-3 space-y-2 max-w-2xl" aria-label={t('aiact.title')}>
            {actions.map((a, i) => {
                const Icon = ICON[a.kind] || Check;
                const tone = a.state === 'done'
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/15'
                    : a.state === 'error' ? 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-900/15'
                        : a.state === 'cancelled' ? 'border-line bg-elevated/50 opacity-70'
                            : 'border-violet-300 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/15';
                return (
                    <li key={a.token} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${tone}`}>
                        <Icon className="w-4 h-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                        <span className="min-w-0 flex-1 text-sm text-ink">
                            {a.summary}
                            {a.state === 'done' && <span className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t('aiact.done')}</span>}
                            {a.state === 'cancelled' && <span className="block text-xs text-muted">{t('aiact.cancelled')}</span>}
                            {a.state === 'error' && <span className="block text-xs font-semibold text-red-700 dark:text-red-300">{a.message}</span>}
                        </span>
                        {(a.state === 'pending' || a.state === 'busy') && (
                            <span className="flex items-center gap-1.5 shrink-0">
                                <button type="button" onClick={() => onCancel(i)} disabled={a.state === 'busy'}
                                    className="h-8 px-2.5 rounded-lg border border-line bg-surface text-xs font-semibold text-muted hover:text-ink disabled:opacity-50">
                                    <X className="w-3.5 h-3.5 inline -mt-0.5" /> {t('aiact.cancel')}
                                </button>
                                <button type="button" onClick={() => onConfirm(i)} disabled={a.state === 'busy'}
                                    className="h-8 px-3 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-60 inline-flex items-center gap-1">
                                    {a.state === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    {t('aiact.confirm')}
                                </button>
                            </span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
