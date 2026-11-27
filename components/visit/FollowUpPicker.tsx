import React, { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { Visit } from '../../types';
import { api } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatDate } from '../../utils/format';
import { ChipButton } from './sheetParts';

/* ─────────────────────────────────────────────────────────────────────────────
   QAYTA KO'RIK — «3 haftadan keyin keling» (2026-11-26).

   Varaq pastida, «Qabulni yakunlash» ustida BITTA qator. Ixtiyoriy: bosilmasa
   hech narsa o'zgarmaydi — qabulni yopishga yangi qadam qo'shilmadi
   (klinika so'ramagan majburiy qadam yo'q). Yakunlangandan keyin ham
   qo'yiladi: qaror ko'pincha oxirida aytiladi.

   Belgilangan kun registraturaning «Bugun» ro'yxatiga tushadi, Xabarlardagi
   «Qayta ko'rik» qoidasi yoqilgan bo'lsa bemorga eslatma ketadi.
   ───────────────────────────────────────────────────────────────────────────── */

const CHOICES: { days: number; key: string }[] = [
    { days: 3, key: 'visit.fu.d3' },
    { days: 7, key: 'visit.fu.w1' },
    { days: 14, key: 'visit.fu.w2' },
    { days: 21, key: 'visit.fu.w3' },
    { days: 30, key: 'visit.fu.m1' },
    { days: 90, key: 'visit.fu.m3' },
    { days: 180, key: 'visit.fu.m6' },
];

const addDays = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export const FollowUpPicker: React.FC<{
    visit: Visit;
    /** Shifokor yoki ega, qabul bekor qilinmagan */
    canEdit: boolean;
    onChanged: () => Promise<void> | void;
    onError: (msg: string) => void;
}> = ({ visit, canEdit, onChanged, onError }) => {
    const { t } = useLanguage();
    const [busy, setBusy] = useState(false);
    const value = visit.followUpDate || null;
    if (!canEdit && !value) return null;

    const set = async (date: string | null) => {
        if (busy) return;
        setBusy(true);
        try { await api.visits.setFollowUp(visit.id, date); await onChanged(); }
        catch (e: any) { onError(e?.message || t('ui.xatolik')); }
        finally { setBusy(false); }
    };
    const picked = CHOICES.find(c => addDays(visit.date, c.days) === value);

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <CalendarClock className="w-4 h-4 text-muted" aria-hidden="true" />{t('visit.fu.label')}
            </span>
            {value ? (
                <span className="inline-flex items-center gap-1.5 h-[30px] pl-2.5 pr-1 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200">
                    <b className="font-semibold">{formatDate(value)}</b>
                    {picked && <span className="text-muted">· {t(picked.key as any)}</span>}
                    {canEdit && (
                        <button type="button" disabled={busy} onClick={() => set(null)} aria-label={t('visit.fu.clear')}
                            className="w-6 h-6 grid place-items-center rounded-md text-faint hover:text-red-600 disabled:opacity-50">
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                    )}
                </span>
            ) : (
                <>
                    {CHOICES.map(c => (
                        <ChipButton key={c.days} disabled={busy} onClick={() => set(addDays(visit.date, c.days))}>
                            {t(c.key as any)}
                        </ChipButton>
                    ))}
                    <label className="inline-flex items-center gap-1.5 text-muted">
                        <span className="sr-only">{t('visit.fu.pickDate')}</span>
                        <input type="date" min={addDays(visit.date, 1)} disabled={busy} aria-label={t('visit.fu.pickDate')}
                            /* Yil terilayotganda chala sana («0202-…») kelmasin:
                               faqat qabuldan keyingi, to'liq sana yuboriladi */
                            onChange={e => {
                                const v = e.target.value;
                                if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v > visit.date && v.slice(0, 4) >= visit.date.slice(0, 4)) set(v);
                            }}
                            className="h-[30px] px-2 rounded-lg border border-line bg-surface text-[12.5px] text-ink" />
                    </label>
                </>
            )}
            {value && <span className="text-[12px] text-muted">{fill(t('visit.fu.hint'), formatDate(value))}</span>}
        </div>
    );
};
