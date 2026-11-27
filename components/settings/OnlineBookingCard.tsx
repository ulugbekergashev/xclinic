/* Saytdan qabulga yozilish — Sozlamalar → Integratsiyalar (faqat ega, 2026-11-26).
   Yoqish, «avtomatik tasdiqlash» va bemorga beriladigan havola. Havola
   masofaviy kirish (Tarmoq) manzilidan olinadi — u o'chiq bo'lsa, shuni aytadi. */

import React, { useEffect, useState } from 'react';
import { Globe, Copy } from 'lucide-react';
import { Card } from '../Common';
import { api } from '../../services/api';
import { toast } from '../../services/toast';
import { useLanguage } from '../../context/LanguageContext';

export function OnlineBookingCard() {
    const { t } = useLanguage();
    const [state, setState] = useState<{ enabled: boolean; autoConfirm: boolean; url: string | null } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => { api.onlineBooking.getSettings().then(setState).catch(() => setState(null)); }, []);
    if (!state) return null;

    const save = async (patch: { enabled?: boolean; autoConfirm?: boolean }) => {
        const prev = state;
        setState({ ...state, ...patch });
        setBusy(true);
        try {
            await api.onlineBooking.saveSettings(patch);
            toast.success(t('ui.saqlandi'));
        } catch (e: any) {
            setState(prev);
            toast.error(e?.data?.error || e?.message || t('ui.saqlab_bolmadi'));
        } finally { setBusy(false); }
    };
    const copy = async () => {
        if (!state.url) return;
        try { await navigator.clipboard.writeText(state.url); toast.success(t('booking.copied')); }
        catch { toast.info(state.url); }
    };

    return (
        <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 mt-0.5 text-primary-600 dark:text-primary-400" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{t('booking.settingsTitle')}</p>
                    <p className="text-xs text-muted mt-0.5">{t('booking.settingsHint')}</p>
                </div>
                <label className="relative shrink-0 cursor-pointer mt-1">
                    <input type="checkbox" className="sr-only peer" checked={state.enabled} disabled={busy}
                        aria-label={t('booking.settingsTitle')} onChange={e => save({ enabled: e.target.checked })} />
                    <span className={`block w-10 h-6 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40 ${state.enabled ? 'bg-success-500' : 'bg-line'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${state.enabled ? 'translate-x-4' : ''}`} />
                    </span>
                </label>
            </div>
            {state.enabled && (
                <>
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={state.autoConfirm} disabled={busy} onChange={e => save({ autoConfirm: e.target.checked })}
                            className="mt-0.5 w-5 h-5 text-primary-600 border-line rounded focus:ring-primary-500" />
                        <span>
                            <span className="block text-sm font-medium text-ink">{t('booking.autoConfirm')}</span>
                            <span className="block text-xs text-muted">{t('booking.autoConfirmHint')}</span>
                        </span>
                    </label>
                    {state.url ? (
                        <div className="flex items-center gap-2">
                            <code className="min-w-0 flex-1 truncate px-3 py-2 rounded-lg bg-elevated text-xs text-ink">{state.url}</code>
                            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line text-xs font-semibold text-ink hover:border-primary-400">
                                <Copy className="w-3.5 h-3.5" /> {t('booking.copy')}
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-warning-700 dark:text-warning-300">{t('booking.needsRemote')}</p>
                    )}
                </>
            )}
        </Card>
    );
}
