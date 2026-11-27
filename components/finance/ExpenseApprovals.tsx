/* ─────────────────────────────────────────────────────────────────────────────
   XARAJAT TASDIG'I VA BO'LIM BYUDJETI — Kassa sahifasida, kassa daftaridan
   OLDIN (alohida sahifa yo'q). Migratsiya 0048.

   Ega ko'radi:
     · «Tasdiq kutayotgan xarajatlar — N» — har birida «Rad etish» va
       «Tasdiqlash». Tasdiqlangan pul BUGUN yashikdan chiqadi.
     · «Bo'lim byudjeti — <oy>» — sarflandi / byudjet; «sarflandi» Hisobot →
       Bo'limlardagi xarajat bilan bitta son.
   Xodim ko'radi: o'zi so'ragan xarajatlarning holati (kutmoqda / rad etildi).
   Hech narsa bo'lmasa — blok umuman chizilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, Clock, Wallet } from 'lucide-react';
import { Expense, Department } from '../../types';
import { api, DepartmentBudget } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatMoney, formatDate } from '../../utils/format';
import { toast } from '../../services/toast';

interface Props {
    expenses: Expense[];
    departments?: Department[];
    isOwner: boolean;
    /** Qaror berilgandan keyin xarajatlar ro'yxati qayta o'qiladi */
    onChanged: () => void | Promise<void>;
}

const DAY_MS = 864e5;

export function ExpenseApprovals({ expenses, departments = [], isOwner, onChanged }: Props) {
    const { t } = useLanguage();
    const [busy, setBusy] = useState('');
    const [budget, setBudget] = useState<DepartmentBudget | null>(null);

    const pending = useMemo(() => expenses.filter(e => e.status === 'Pending'), [expenses]);
    /* Xodimga: oxirgi 7 kundagi rad etilganlari ham — javobni ko'rsin */
    const mine = useMemo(() => expenses.filter(e => e.status === 'Pending'
        || (e.status === 'Rejected' && e.decidedAt && Date.now() - new Date(e.decidedAt).getTime() < 7 * DAY_MS)), [expenses]);
    const deptName = (id?: string | null) => departments.find(d => d.id === id)?.name || t('exp.noDept');

    const loadBudget = useCallback(async () => {
        if (!isOwner) return;
        try { setBudget(await api.reports.departmentBudget()); } catch { setBudget(null); }
    }, [isOwner]);
    useEffect(() => { loadBudget(); }, [loadBudget, expenses.length]);

    const decide = async (e: Expense, approve: boolean) => {
        setBusy(e.id);
        try {
            if (approve) await api.expenses.approve(e.id); else await api.expenses.reject(e.id);
            toast.success(approve ? t('exp.approved') : t('exp.rejected'));
            await onChanged();
            await loadBudget();
        } catch (err: any) {
            toast.error(err?.data?.error || err?.message || t('ui.xatolik_yuz_berdi'));
        } finally { setBusy(''); }
    };

    const showPending = isOwner ? pending.length > 0 : mine.length > 0;
    const budgetRows = budget?.rows || [];
    if (!showPending && !(isOwner && budgetRows.length > 0)) return null;

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {showPending && (
                <section className="card p-4" aria-labelledby="exp-pending-title">
                    <h3 id="exp-pending-title" className="flex items-center gap-2 text-sm font-bold text-ink">
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        {isOwner ? fill(t('exp.pendingTitle'), pending.length) : t('exp.myRequests')}
                    </h3>
                    {isOwner && <p className="text-xs text-muted mt-0.5">{t('exp.pendingHint')}</p>}
                    <ul className="mt-3 divide-y divide-line">
                        {(isOwner ? pending : mine).map(e => (
                            <li key={e.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-ink truncate">{e.title} — {deptName((e as any).departmentId)}</p>
                                    <p className="text-[11px] text-faint">
                                        {e.requestedByName ? fill(t('exp.requestedBy'), e.requestedByName) : ''}
                                        {e.date ? ` · ${formatDate(e.date)}` : ''}
                                    </p>
                                </div>
                                <span className="text-sm font-bold tabular-nums text-ink">{formatMoney(e.amount)}</span>
                                {isOwner ? (
                                    <span className="flex items-center gap-1.5">
                                        <button type="button" disabled={!!busy} onClick={() => decide(e, false)}
                                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-red-600 hover:border-red-300 disabled:opacity-50">
                                            <X className="w-3.5 h-3.5" /> {t('exp.reject')}
                                        </button>
                                        <button type="button" disabled={!!busy} onClick={() => decide(e, true)}
                                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
                                            <Check className="w-3.5 h-3.5" /> {t('exp.approve')}
                                        </button>
                                    </span>
                                ) : (
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${e.status === 'Rejected'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                        {e.status === 'Rejected' ? t('exp.statusRejected') : t('exp.statusPending')}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {isOwner && budgetRows.length > 0 && (
                <section className="card p-4" aria-labelledby="exp-budget-title">
                    <h3 id="exp-budget-title" className="flex items-center gap-2 text-sm font-bold text-ink">
                        <Wallet className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        {fill(t('exp.budgetTitle'), budget?.month || '')}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">{t('exp.budgetHint')}</p>
                    <ul className="mt-3 space-y-2.5">
                        {budgetRows.map(r => {
                            const pct = r.budget > 0 ? Math.min(100, Math.round((r.spent / r.budget) * 100)) : 0;
                            const over = r.spent > r.budget;
                            return (
                                <li key={r.departmentId}>
                                    <div className="flex items-baseline justify-between gap-2 text-xs">
                                        <span className="font-semibold text-ink truncate">{r.name}</span>
                                        <span className={`tabular-nums ${over ? 'text-red-600 dark:text-red-400 font-bold' : 'text-muted'}`}>
                                            {formatMoney(r.spent)} / {formatMoney(r.budget)}
                                        </span>
                                    </div>
                                    <div className="mt-1 h-2 rounded-full bg-elevated overflow-hidden"
                                        role="progressbar" aria-label={r.name} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                                        <div className={`h-full rounded-full ${over ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${pct}%` }} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
}
