import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { useLanguage, fill, tr, TranslationKey } from '../../context/LanguageContext';
import { fmt, KpiStrip, CardHead, Calculating, Empty, ShareBar } from './shared';

/* ─────────────────────────────────────────────────────────────────────────────
   OMBOR ISROFI — nima behuda ketdi (tannarxda).

   «Xizmatga ishlatilgan» — yo'qotish EMAS, u daromad keltirgan: endi qizil
   emas (ilgari kartochka «bu yo'qotish emas» der, jadval esa uni qizil
   yozardi). Pozitsiyalar ichki aylantirishsiz: birinchi sakkiztasi va
   «hammasini ko'rsatish» — ilgari ro'yxat kartochka ichida kesilib qolardi.
   ───────────────────────────────────────────────────────────────────────────── */

const REASON_KEYS: Record<string, TranslationKey> = {
    Expired: 'report.wo_expired',
    Damaged: 'report.wo_damaged',
    Inventory: 'report.wo_inventory',
    Service: 'report.wo_service',
    Manual: 'report.wo_manual',
};
const reasonLabel = (r: string, fallback: string) => (REASON_KEYS[r] ? tr(REASON_KEYS[r]) : fallback);
const ITEMS_SHOWN = 8;

export const WasteView: React.FC<{ report: any | null; loading: boolean }> = ({ report, loading }) => {
    const { t } = useLanguage();
    const [allItems, setAllItems] = useState(false);
    if (loading || !report) return <Calculating />;

    const reasons: any[] = report.byReason || [];
    const items: any[] = (report.byItem || []).filter((it: any) => Math.abs(it.cost || 0) > 0);
    const maxReason = Math.max(0, ...reasons.map(r => r.cost || 0));
    const maxItem = Math.max(0, ...items.map(i => Math.abs(i.cost || 0)));
    const shown = allItems ? items : items.slice(0, ITEMS_SHOWN);

    return (
        <div className="space-y-4">
            <KpiStrip items={[
                { key: 'waste', label: t('finance.report.wasted'), value: report.wasteCost, unit: 'UZS', tone: report.wasteCost > 0 ? 'bad' : undefined, hint: t('financereport.muddati_otgan_buzilgan_kam') },
                { key: 'service', label: t('finance.report.usedForService'), value: report.serviceCost, unit: 'UZS', hint: t('financereport.bu_yoqotish_emas_daromad') },
                { key: 'total', label: t('finance.report.totalOut'), value: report.totalCost, unit: 'UZS', hint: fill(t('financereport.x_harakat'), report.movementCount) },
            ]} footer={t('financereport.summalar_tannarxda_yoqolgan_tovarning')} />

            {reasons.length === 0 ? (
                <Empty icon={Package} text={t('finance.report.noExpenses')} />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
                    <section className="card lg:col-span-2" aria-labelledby="rep-wo-reason">
                        <CardHead id="rep-wo-reason" title={t('finance.report.byReason')} />
                        <ul className="px-5 pb-4 space-y-3">
                            {reasons.map(r => {
                                const service = r.reason === 'Service';
                                return (
                                    <li key={r.reason}>
                                        <div className="flex items-baseline gap-3 text-sm mb-1">
                                            <span className="text-ink">{reasonLabel(r.reason, r.label)}</span>
                                            <span className="text-[12px] text-faint">{r.count} {t('ui.ta')}</span>
                                            <span className={`ml-auto tabular-nums font-semibold ${service ? 'text-ink' : 'text-danger-600 dark:text-danger-300'}`}>{fmt(r.cost)}</span>
                                        </div>
                                        <ShareBar value={r.cost || 0} max={maxReason} color={service ? 'var(--color-primary-300)' : 'var(--color-danger-500)'} />
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    <section className="card lg:col-span-3" aria-labelledby="rep-wo-item">
                        <CardHead id="rep-wo-item" title={t('finance.report.byItem')} />
                        <ul className="divide-y divide-line-soft border-t border-line-soft">
                            {shown.map((it: any) => (
                                <li key={it.itemId} className="px-5 h-11 flex items-center gap-4 text-sm">
                                    <span className="text-ink truncate flex-1 min-w-0">{it.name}</span>
                                    <span className="w-24 hidden sm:block"><ShareBar value={Math.abs(it.cost || 0)} max={maxItem} /></span>
                                    {/* Chiqim omborda manfiy son — bu yerda «qancha ketdi» */}
                                    <span className="w-24 text-right text-muted tabular-nums shrink-0">{Math.abs(it.qty || 0)} {it.unit || ''}</span>
                                    <span className="w-28 text-right font-semibold text-ink tabular-nums shrink-0">{fmt(Math.abs(it.cost || 0))}</span>
                                </li>
                            ))}
                        </ul>
                        {items.length > ITEMS_SHOWN && (
                            <div className="px-5 py-2 border-t border-line-soft">
                                <button type="button" onClick={() => setAllItems(o => !o)} aria-expanded={allItems}
                                    className="h-8 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                    {allItems ? t('pay.queue.hide') : fill(t('pay.queue.showN'), items.length - ITEMS_SHOWN)}
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};
