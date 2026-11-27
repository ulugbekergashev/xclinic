/* ─────────────────────────────────────────────────────────────────────────────
   SHIKOYAT VA FIKRLAR — «Bugun» ekranida, «Qayta ko'rik» ostida (2026-11-26).

   Tepada: oyning o'rtacha bahosi, ochiq shikoyatlar, oyda hal qilinganlar.
   Har kartada: matn, qachondan beri ochiq, yulduzlar yoki «Registratura»,
   bemor · qabul · shifokor, «Mas'ul», «Bemorga qo'ng'iroq», «Hal qilindi deb
   yopish» (nima qilingani yoziladi va kartada qoladi).
   Oyda shikoyat bo'lmasa — blok umuman chiqmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquareWarning, Phone, Check, Star } from 'lucide-react';
import { api, ComplaintsPayload, ComplaintRow } from '../services/api';
import { useLanguage, fill } from '../context/LanguageContext';
import { formatUzPhone } from '../shared/validation';
import { formatDate } from '../utils/format';
import { toast } from '../services/toast';
import { Modal, Button } from './Common';

interface Props {
    onOpenPatient: (patientId: string) => void;
}

const DAY_MS = 864e5;

export function ComplaintList({ onOpenPatient }: Props) {
    const { t } = useLanguage();
    const [data, setData] = useState<ComplaintsPayload | null>(null);
    const [filter, setFilter] = useState<'open' | 'resolved'>('open');
    const [closing, setClosing] = useState<ComplaintRow | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try { setData(await api.complaints.list()); } catch { setData(null); }
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!data) return null;
    const { stats, rows, assignees } = data;
    if (stats.open === 0 && stats.resolvedMonth === 0 && !rows.length) return null;
    const shown = rows.filter(r => r.status === filter);

    const assign = async (c: ComplaintRow, key: string) => {
        try { await api.complaints.assign(c.id, key || null); await load(); }
        catch (e: any) { toast.error(e?.data?.error || e?.message || t('ui.xatolik_yuz_berdi')); }
    };
    const resolve = async () => {
        if (!closing) return;
        if (note.trim().length < 3) { toast.error(t('cmp.noteRequired')); return; }
        setBusy(true);
        try {
            await api.complaints.resolve(closing.id, note.trim());
            toast.success(t('cmp.resolved'));
            setClosing(null); setNote('');
            await load();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || t('ui.xatolik_yuz_berdi'));
        } finally { setBusy(false); }
    };
    const age = (iso: string) => {
        const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
        return d <= 0 ? t('cmp.today') : fill(t('cmp.days'), d);
    };

    return (
        <section className="card p-4 sm:p-5" aria-labelledby="cmp-title">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 id="cmp-title" className="flex items-center gap-2 text-base font-black text-ink mr-auto">
                    <MessageSquareWarning className="w-5 h-5 text-amber-600 dark:text-amber-400" /> {t('cmp.title')}
                </h2>
                {stats.avgRating != null && (
                    <span className="inline-flex items-center gap-1 text-sm text-muted">
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        <b className="text-ink tabular-nums">{stats.avgRating.toFixed(1).replace('.', ',')}</b>
                        <span className="text-faint">· {fill(t('cmp.ratings'), stats.ratingCount)}</span>
                    </span>
                )}
                <div role="tablist" className="flex items-center gap-1 bg-elevated p-1 rounded-xl">
                    {(['open', 'resolved'] as const).map(k => (
                        <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold ${filter === k ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
                            {k === 'open' ? fill(t('cmp.open'), stats.open) : fill(t('cmp.resolvedMonth'), stats.resolvedMonth)}
                        </button>
                    ))}
                </div>
            </div>

            {shown.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{filter === 'open' ? t('cmp.noneOpen') : t('cmp.noneResolved')}</p>
            ) : (
                <ul className="mt-3 space-y-2.5">
                    {shown.map(c => (
                        <li key={c.id} className="rounded-xl border border-line p-3">
                            <div className="flex flex-wrap items-start gap-2">
                                <p className="min-w-0 flex-1 text-sm font-semibold text-ink break-words">
                                    {c.text || <span className="text-faint font-normal">{t('cmp.noText')}</span>}
                                </p>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${c.status === 'open'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                    {c.status === 'open' ? `${t('cmp.statusOpen')} · ${age(c.createdAt)}` : t('cmp.statusResolved')}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-muted">
                                {c.rating != null
                                    ? <span className="text-yellow-600 dark:text-yellow-400" aria-label={fill(t('cmp.stars'), c.rating)}>{'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)}</span>
                                    : <span>{t('cmp.fromReception')}</span>}
                                {' · '}
                                <button type="button" onClick={() => onOpenPatient(c.patientId)} className="font-semibold text-ink hover:underline">{c.patientName}</button>
                                {c.visitDate ? ` · ${fill(t('cmp.visitOf'), formatDate(c.visitDate))}` : ''}
                                {c.doctorName ? ` · ${c.doctorName}` : ''}
                            </p>
                            {c.status === 'resolved' ? (
                                <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-2.5 py-1.5">
                                    «{c.resolution}»{c.resolvedByName ? ` — ${c.resolvedByName}` : ''}
                                </p>
                            ) : (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <label className="flex items-center gap-1.5 text-xs text-muted">
                                        {t('cmp.assignee')}
                                        <select value={c.assigneeKey || ''} onChange={e => assign(c, e.target.value)}
                                            className="h-8 px-2 rounded-lg border border-line bg-surface text-ink text-xs max-w-[220px]">
                                            <option value="">—</option>
                                            {assignees.map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
                                        </select>
                                    </label>
                                    <span className="ml-auto flex items-center gap-2">
                                        {c.phone && (
                                            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-line text-xs font-semibold text-ink hover:border-primary-400">
                                                <Phone className="w-3.5 h-3.5" /> {t('cmp.call')}
                                                <span className="hidden sm:inline text-faint tabular-nums">{formatUzPhone(c.phone)}</span>
                                            </a>
                                        )}
                                        <button type="button" onClick={() => { setClosing(c); setNote(''); }}
                                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                                            <Check className="w-3.5 h-3.5" /> {t('cmp.close')}
                                        </button>
                                    </span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <Modal isOpen={!!closing} onClose={() => setClosing(null)} title={t('cmp.closeTitle')}>
                <div className="space-y-3">
                    <p className="text-sm text-muted">{closing?.text}</p>
                    <label className="block">
                        <span className="block text-sm font-medium text-muted mb-1">{t('cmp.whatDone')}</span>
                        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000} autoFocus
                            placeholder={t('cmp.whatDonePh')}
                            className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </label>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setClosing(null)}>{t('common.cancel')}</Button>
                        <Button onClick={resolve} disabled={busy || note.trim().length < 3}>{t('cmp.close')}</Button>
                    </div>
                </div>
            </Modal>
        </section>
    );
}
