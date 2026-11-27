/* ─────────────────────────────────────────────────────────────────────────────
   XARAJAT NAZORATI — Sozlamalar → Umumiy, «Kassa smenalari» ostida (faqat ega).

   · Tasdiq chegarasi: shundan KATTA xarajatni boshqa xodim yozsa — egaga
     boradi. Bo'sh — o'chiq (avvalgidek, hech narsa o'zgarmaydi).
   · Bo'lim byudjeti: oyiga qancha. Bo'sh — byudjet yo'q, Kassadagi blok
     ko'rinmaydi.
   Migratsiya 0048.
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, Button, Input } from '../Common';
import { Clinic, Department } from '../../types';
import { api } from '../../services/api';
import { toast } from '../../services/toast';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
    clinic: Clinic | null | undefined;
    departments: Department[];
    onSaved?: () => void;
}

const toField = (n?: number | null) => (n && n > 0 ? String(Math.round(n)) : '');
const fromField = (v: string): number | null => {
    const n = Math.round(Number(v.replace(/\s/g, '')));
    return Number.isFinite(n) && n > 0 ? n : null;
};

export function ExpenseControlCard({ clinic, departments, onSaved }: Props) {
    const { t } = useLanguage();
    const [threshold, setThreshold] = useState(toField(clinic?.expenseApprovalThreshold));
    const [budgets, setBudgets] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => { setThreshold(toField(clinic?.expenseApprovalThreshold)); }, [clinic?.expenseApprovalThreshold]);
    useEffect(() => {
        setBudgets(Object.fromEntries(departments.map(d => [d.id, toField(d.monthlyBudget)])));
    }, [departments]);

    const active = departments.filter(d => d.isActive !== false);

    const save = async () => {
        if (!clinic?.id) return;
        setSaving(true);
        try {
            await api.expenses.saveSettings(clinic.id, {
                expenseApprovalThreshold: fromField(threshold),
                budgets: active.map(d => ({ departmentId: d.id, monthlyBudget: fromField(budgets[d.id] || '') })),
            });
            toast.success(t('exp.settingsSaved'));
            onSaved?.();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || t('common.error'));
        } finally { setSaving(false); }
    };

    return (
        <Card className="p-6 space-y-4">
            <div>
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                    <ShieldCheck className="w-4 h-4 text-primary-600 dark:text-primary-400" /> {t('exp.settingsTitle')}
                </p>
                <p className="text-xs text-muted mt-0.5">{t('exp.settingsHint')}</p>
            </div>
            <Input
                containerClassName="max-w-xs"
                inputMode="numeric"
                label={t('exp.threshold')}
                placeholder={t('exp.thresholdPh')}
                value={threshold}
                onChange={e => setThreshold(e.target.value.replace(/[^\d\s]/g, ''))}
            />
            {active.length > 0 && (
                <div>
                    <p className="text-sm font-medium text-muted mb-1">{t('exp.budgets')}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {active.map(d => (
                            <label key={d.id} className="flex items-center gap-2">
                                <span className="text-sm text-ink flex-1 truncate">{d.name}</span>
                                <input
                                    inputMode="numeric"
                                    aria-label={`${d.name}: ${t('exp.budgets')}`}
                                    placeholder="—"
                                    value={budgets[d.id] || ''}
                                    onChange={e => setBudgets(b => ({ ...b, [d.id]: e.target.value.replace(/[^\d\s]/g, '') }))}
                                    className="w-36 h-9 px-2.5 rounded-lg border border-line bg-surface text-ink text-sm tabular-nums text-right focus:ring-2 focus:ring-primary-500"
                                />
                            </label>
                        ))}
                    </div>
                </div>
            )}
            <Button type="button" onClick={save} disabled={saving}>{t('common.save')}</Button>
        </Card>
    );
}
