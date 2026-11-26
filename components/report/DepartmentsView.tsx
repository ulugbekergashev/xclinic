import React from 'react';
import { BedDouble, ChevronRight } from 'lucide-react';
import { useLanguage, fill } from '../../context/LanguageContext';
import { fmt, deptName, isNoDept, Th, Td, Calculating, ShareBar } from './shared';

/* ─────────────────────────────────────────────────────────────────────────────
   BO'LIMLAR — qaysi bo'lim qancha keltiradi.

   Tepadagi «Xizmatlar / Xarajat / Sof foyda» plitkalari olib tashlandi
   (2026-11-26): ular Umumiyni so'zma-so'z takrorlardi. Koyka bandligi esa
   faqat shu yerda — u qoldi, jadval ustida bitta qator bo'lib.

   «Bo'limsiz» qatori — bo'limga bog'lanmagan umumiy xarajat (ijara,
   kommunal). U zarar ko'rgan bo'lim emas: qizil emas, xira yoziladi.

   BEMORLAR va O'RTACHA CHEK (2026-11-26): «bo'lim kam pul keltiryapti —
   bemor kammi yoki chek pastmi?». O'rtacha chek Shifokorlardagi qoida bilan
   (bir qabulga summa). Jami qatordagi bemorlar — klinika bo'yicha har xil
   bemor, ustun yig'indisi EMAS (bir kishi uch bo'limga borgan bo'lishi
   mumkin). Bo'lim nomi bosilsa — Xizmatlar tabi shu bo'lim bilan ochiladi.
   ───────────────────────────────────────────────────────────────────────────── */

const PALETTE = ['#0E5F55', '#005EB8', '#D5281B', '#6F4FA3', '#0891B2', '#C96F00', '#B5377A', '#009639'];

export const DepartmentsView: React.FC<{ report: any | null; loading: boolean; onOpenServices?: (deptId: string | null) => void }> = ({ report, loading, onOpenServices }) => {
    const { t } = useLanguage();
    if (loading || !report) return <Calculating />;
    const rows: any[] = report.departments || [];
    const tot = report.totals || {};
    const maxRevenue = Math.max(0, ...rows.map(d => d.revenue || 0));
    const hasBeds = (tot.bedCount || 0) > 0;
    const anyBedDays = rows.some(d => d.bedDays);
    const checks = rows.reduce((s, d) => s + (d.checks || 0), 0);

    return (
        <div className="space-y-4">
            {hasBeds && (
                <div className="card px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 grid place-items-center">
                            <BedDouble className="w-5 h-5" aria-hidden="true" />
                        </span>
                        <div>
                            <p className="text-[13px] font-medium text-muted">{t('finance.report.bedOccupancy')}</p>
                            <p className="text-[22px] leading-7 font-semibold tabular-nums text-ink">
                                {tot.occupancy != null ? `${tot.occupancy}%` : '—'}
                            </p>
                        </div>
                    </div>
                    <div className="flex-1 min-w-[200px] max-w-md">
                        <ShareBar value={tot.occupancy || 0} max={100} />
                        <p className="mt-1.5 text-[12px] text-faint">{fill(t('report.bedDaysOf'), tot.bedDays || 0, tot.bedCount || 0)}</p>
                    </div>
                </div>
            )}

            <section className="card overflow-hidden" aria-label={t('settings.bolimlar')}>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px]">
                        <thead className="border-b border-line-soft">
                            <tr>
                                <Th>{t('finance.report.department')}</Th>
                                <Th right>{t('finance.report.patient')}</Th>
                                <Th right>{t('report.services')}</Th>
                                <Th right>{t('finance.report.avgCheck')}</Th>
                                <Th right>{t('finance.report.paid')}</Th>
                                <Th right>{t('finance.report.expense')}</Th>
                                <Th right>{t('finance.report.profit')}</Th>
                                {anyBedDays && <Th right>{t('finance.report.bedDays')}</Th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                            {rows.map((d: any, i: number) => {
                                const none = isNoDept(d.name);
                                return (
                                    <tr key={d.departmentId || `none-${i}`} className="hover:bg-elevated/40 transition-colors">
                                        <Td className="min-w-[200px]">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full shrink-0" aria-hidden="true"
                                                    style={{ backgroundColor: none ? 'var(--color-line)' : (d.color || PALETTE[i % PALETTE.length]) }} />
                                                {onOpenServices && d.revenue > 0 ? (
                                                    <button type="button" onClick={() => onOpenServices(d.departmentId || null)}
                                                        aria-label={fill(t('report.dept.openServices'), deptName(d.name))}
                                                        className={`group inline-flex items-center gap-1 text-left hover:underline ${none ? 'text-muted' : 'font-medium text-ink'}`}>
                                                        {deptName(d.name)}
                                                        <ChevronRight className="w-3.5 h-3.5 text-faint group-hover:text-ink" aria-hidden="true" />
                                                    </button>
                                                ) : <span className={none ? 'text-muted' : 'font-medium text-ink'}>{deptName(d.name)}</span>}
                                            </div>
                                            {!none && <div className="mt-1 ml-4 w-32"><ShareBar value={d.revenue || 0} max={maxRevenue} color={d.color || PALETTE[i % PALETTE.length]} /></div>}
                                        </Td>
                                        <Td right tone={d.patients ? undefined : 'muted'}>{d.patients ? fmt(d.patients) : '—'}</Td>
                                        <Td right tone={d.revenue ? undefined : 'muted'}>{fmt(d.revenue)}</Td>
                                        <Td right tone={d.avgCheck ? undefined : 'muted'}>{d.avgCheck ? fmt(d.avgCheck) : '—'}</Td>
                                        <Td right tone={d.paid ? undefined : 'muted'}>{fmt(d.paid)}</Td>
                                        <Td right tone={d.expense > 0 ? undefined : 'muted'}>{d.expense > 0 ? fmt(d.expense) : '—'}</Td>
                                        <Td right strong tone={none ? 'muted' : d.profit < 0 ? 'bad' : undefined}>{fmt(d.profit)}</Td>
                                        {anyBedDays && <Td right tone={d.bedDays ? undefined : 'muted'}>{d.bedDays || '—'}</Td>}
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="border-t border-line bg-elevated/50">
                            <tr>
                                <Td strong>{t('report.total')}</Td>
                                <Td right strong>{tot.patients != null ? fmt(tot.patients) : '—'}</Td>
                                <Td right strong>{fmt(tot.revenue)}</Td>
                                <Td right strong>{checks > 0 ? fmt(tot.revenue / checks) : '—'}</Td>
                                <Td right strong>{fmt(rows.reduce((s, d) => s + (d.paid || 0), 0))}</Td>
                                <Td right strong>{fmt(tot.expense)}</Td>
                                <Td right strong tone={tot.profit < 0 ? 'bad' : 'ok'}>{fmt(tot.profit)}</Td>
                                {anyBedDays && <Td right strong>{tot.bedDays || '—'}</Td>}
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <p className="px-4 py-2.5 text-[12px] text-faint border-t border-line-soft">{t('report.noDeptNote')}</p>
            </section>
        </div>
    );
};
