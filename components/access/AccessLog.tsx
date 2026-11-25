import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, History, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import type { TranslationKey } from '../../i18n/translations';
import { useLanguage, fill } from '../../context/LanguageContext';

/* ─────────────────────────────────────────────────────────────────────────────
   KIRISH JURNALI — «kim qaysi bemor kartasini ochdi».

   Ruxsatlar bilan bir sahifada, lekin YOPIQ turadi: bu sozlama emas,
   nazorat, va har kuni kerak emas. Ochilganda yuklanadi.

   Server amal va yozuv turini inglizcha nom bilan yozadi (View, Charge,
   Prescription …), namoyish ma'lumoti esa KATTA harf bilan (VIEW). Ikkalasi
   ham shu yerda o'zbekchaga o'giriladi — ekranga xom so'z chiqmasin.
   ───────────────────────────────────────────────────────────────────────────── */

/* Kalitlar kichik harfda — `label()` xom qiymatni kichik harfga o'tkazib qidiradi */
const ROLE_KEY: Record<string, TranslationKey> = {
    clinic_admin: 'accesscontroltab.klinika_egasi', doctor: 'ui.shifokor_2', receptionist: 'ui.registrator',
    nurse: 'ui.hamshira', lab_technician: 'ui.laborant',
};

const ACTION_KEY: Record<string, TranslationKey> = {
    view: 'access.action.view', create: 'access.action.create', update: 'access.action.update',
    delete: 'access.action.delete', print: 'access.action.print', export: 'access.action.export',
};

const ENTITY_KEY: Record<string, TranslationKey> = {
    patient: 'access.entity.patient', visit: 'access.entity.visit',
    patientdocument: 'access.entity.document', patientphoto: 'access.entity.photo', photo: 'access.entity.photo',
    diagnosticstudy: 'access.entity.study', study: 'access.entity.study', studyfile: 'access.entity.study',
    laborder: 'access.entity.lab', labtest: 'access.entity.lab',
    charge: 'access.entity.charge', prescription: 'access.entity.prescription',
    transaction: 'access.entity.payment', appointment: 'access.entity.appointment',
    diagnose: 'access.entity.diagnosis', diagnosis: 'access.entity.diagnosis', allergy: 'access.entity.allergy',
    visitprocedure: 'access.entity.procedure', installment: 'access.entity.installment', expense: 'access.entity.expense',
};

const ACTION_TONE: Record<string, string> = {
    view: 'bg-elevated text-muted',
    delete: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
const DEFAULT_TONE = 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

const FILTER_ACTIONS = ['View', 'Create', 'Update', 'Delete'] as const;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const AccessLog: React.FC = () => {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return isoDay(d); });
    const [to, setTo] = useState(() => isoDay(new Date()));
    const [action, setAction] = useState('');

    const label = (map: Record<string, TranslationKey>, raw?: string) => {
        const key = map[String(raw || '').toLowerCase()];
        return key ? t(key) : (raw || '—');
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setData(await api.compliance.accessLog({ from, to, action: action || undefined }));
        } catch (e: any) {
            setError(e?.message || t('ui.xatolik'));
        } finally {
            setLoading(false);
        }
    }, [from, to, action, t]);

    useEffect(() => { if (open) load(); }, [open, load]);

    /* Namoyish rejimi filtrni bilmaydi — ro'yxat shu yerda ham suziladi */
    const items: any[] = (data?.items || []).filter((l: any) =>
        !action || String(l.action).toLowerCase() === action.toLowerCase());

    const inputCls = 'h-9 px-3 border border-line rounded-lg bg-surface text-ink text-sm';

    return (
        <section aria-labelledby="access-log-title" className="card overflow-hidden">
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-elevated/40 sm:px-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted">
                    <History className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span id="access-log-title" className="block text-base font-semibold text-ink">{t('accesscontroltab.kirish_jurnali')}</span>
                    <span className="block text-sm text-muted">
                        {t('access.log.hint')}
                        {data?.retentionMonths ? ` · ${data.retentionMonths} oy saqlanadi` : ''}
                    </span>
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary-600 dark:text-primary-300">
                    {open ? t('access.log.hide') : t('access.log.show')}
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
            </button>

            {open && (
                <div className="border-t border-line px-5 py-4 sm:px-6">
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                        <label className="text-[11px] text-muted">
                            <span className="mb-1 block">{t('finance.report.from')}</span>
                            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
                        </label>
                        <label className="text-[11px] text-muted">
                            <span className="mb-1 block">{t('finance.report.to')}</span>
                            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                        </label>
                        <label className="text-[11px] text-muted">
                            <span className="mb-1 block">{t('settings.services.thAction')}</span>
                            <select value={action} onChange={e => setAction(e.target.value)} className={inputCls}>
                                <option value="">{t('ui.barchasi')}</option>
                                {FILTER_ACTIONS.map(a => <option key={a} value={a}>{label(ACTION_KEY, a)}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={load} disabled={loading}
                            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-elevated disabled:opacity-50">
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {t('ui.yangilash')}
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                        </div>
                    )}

                    {loading && !data ? (
                        <div className="space-y-2">
                            {[0, 1, 2].map(i => <div key={i} className="h-10 animate-pulse rounded bg-elevated" />)}
                        </div>
                    ) : items.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted">{t('ui.bu_davrda_yozuv_yoq')}</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto rounded-xl border border-line">
                                <table className="w-full min-w-[640px] text-sm">
                                    <thead className="border-b border-line">
                                        <tr>
                                            {[t('ui.vaqt'), t('ui.kim'), t('settings.services.thAction'), t('accesscontroltab.nima'), t('ui.bemor')].map(h => (
                                                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line-soft">
                                        {items.map((l: any) => {
                                            const a = String(l.action || '').toLowerCase();
                                            return (
                                                <tr key={l.id}>
                                                    <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted">
                                                        {new Date(l.at).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className="block text-ink">{l.userName || '—'}</span>
                                                        <span className="block text-xs text-muted">{label(ROLE_KEY, l.userRole)}</span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ACTION_TONE[a] || DEFAULT_TONE}`}>
                                                            {label(ACTION_KEY, l.action)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-muted">{label(ENTITY_KEY, l.entityType)}</td>
                                                    <td className="px-3 py-2.5 text-ink">{l.patientName || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-2 text-[11px] text-faint">
                                {data?.total ?? items.length} {t('accesscontroltab.yozuv')}
                                {data?.truncated ? fill(t('accesscontroltab.oxirgi_x_tasi_korsatilgan'), items.length) : ''}
                            </p>
                        </>
                    )}
                </div>
            )}
        </section>
    );
};
