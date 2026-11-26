import React, { useMemo, useState } from 'react';
import { Stethoscope, ArrowRight } from 'lucide-react';
import { useLanguage, fill } from '../../context/LanguageContext';
import type { ServiceReport, ServiceReportRow } from '../../services/api';
import { fmt, fmtDay, deptName, Th, Td, Calculating, Empty, ShareBar, DeltaChip } from './shared';

/* ─────────────────────────────────────────────────────────────────────────────
   XIZMATLAR — «qaysi xizmat pul keltiryapti, qayerda chegirma ko'p, qaysi
   xizmatni hech kim buyurtma qilmayapti» (2026-11-26, olti maslahatchi).

   • Summa — Umumiydagi «Xizmatlar» bilan bitta son (o'sha qatorlar).
     Bo'lim tanlansa — Bo'limlar jadvalidagi o'sha bo'lim soni bilan bitta.
   • O'tgan davrga o'zgarish — summa yonida, alohida ustun emas.
   • Chegirma va Material ustunlari faqat ma'lumot bo'lsa chiqadi. Material
     kiritilmagan xizmatda «—» (0 emas): aks holda xizmat materialsiz
     ko'rinardi. «Foyda» ustuni ATAYLAB yo'q — sof foyda qoidasi bitta.
   • Tahlil buyurtmasi tahlilma-tahlil yoyilgan; dori va koyka-kun —
     bittadan yig'ma qator.
   ───────────────────────────────────────────────────────────────────────────── */

const SHOWN = 15;
/** Shu foizdan katta chegirma va material ulushi sariq bilan belgilanadi */
const DISCOUNT_WARN_PCT = 20;
const MATERIAL_WARN_PCT = 50;

export type DeptFilter = 'all' | 'none' | string;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

interface Props {
    report: ServiceReport | null;
    loading: boolean;
    dept: DeptFilter;
    onDept: (d: DeptFilter) => void;
}

export const ServicesView: React.FC<Props> = ({ report, loading, dept, onDept }) => {
    const { t } = useLanguage();
    const [showAll, setShowAll] = useState(false);
    const [showUnsold, setShowUnsold] = useState(false);

    const deptById = useMemo(() => new Map((report?.departments || []).map(d => [d.id, d])), [report]);
    if (loading || !report) return <Calculating />;

    const inDept = (id: string | null) => dept === 'all' || (dept === 'none' ? !id : id === dept);
    const rows = report.services.filter(r => inDept(r.departmentId));
    const unsold = report.unsold.filter(u => inDept(u.departmentId));

    /* Chiplar — faqat shu davrda xizmati bor bo'limlar (+ tanlangani) */
    const present = new Set(report.services.map(r => r.departmentId || 'none'));
    if (dept !== 'all') present.add(dept);
    const chips: { id: DeptFilter; label: string; color?: string | null }[] = [
        { id: 'all', label: t('report.svc.all') },
        ...report.departments.filter(d => present.has(d.id)).map(d => ({ id: d.id, label: d.name, color: d.color })),
        ...(present.has('none') ? [{ id: 'none' as DeptFilter, label: deptName("Bo'limsiz") }] : []),
    ];

    const total = rows.reduce((s, r) => s + r.revenue, 0);
    /* O'tgan davr jami — o'sha bo'limning HAMMA xizmatlari (bu davrda
       sotilmagani ham): o'zgarish Umumiydagi bilan bir xil chiqadi */
    const prevTotal = Object.entries(report.prevByDepartment || {})
        .filter(([k]) => inDept(k === 'none' ? null : k))
        .reduce((s, [, v]) => s + v, 0);
    /* Jami «Soni» — faqat xizmat, tahlil, tekshiruv: dori dozasi va
       koyka-kun bilan qo'shilsa son ma'nosiz bo'lardi */
    const count = rows.filter(r => r.source !== 'Medication' && r.source !== 'Bed').reduce((s, r) => s + r.count, 0);
    const discount = rows.reduce((s, r) => s + r.discount, 0);
    const known = rows.filter(r => r.materialCost != null);
    const material = known.reduce((s, r) => s + (r.materialCost || 0), 0);
    const showDiscount = discount > 0;
    const showMaterial = known.length > 0;
    const noMaterial = new Set(rows.filter(r => r.source === 'Service' && r.serviceId != null && r.materialCost == null).map(r => r.serviceId)).size;
    const maxRevenue = Math.max(0, ...rows.map(r => r.revenue));
    const shown = showAll ? rows : rows.slice(0, SHOWN);

    const nameOf = (r: ServiceReportRow) => (r.source === 'Medication' ? t('report.svc.medication')
        : r.source === 'Bed' ? t('report.svc.bed') : r.name);
    const tagOf = (r: ServiceReportRow) => (r.source === 'Lab' ? t('report.svc.tagLab') : r.source === 'Study' ? t('report.svc.tagStudy') : null);
    const delta = (cur: number, prev: number) => ({ abs: cur - prev, pct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null });
    const prevText = report.previous ? fill(t('report.vsPeriod'), fmtDay(report.previous.from), fmtDay(report.previous.to)) : '';

    return (
        <div className="space-y-4">
            <div role="group" aria-label={t('finance.report.department')} className="flex flex-wrap gap-1.5">
                {chips.map(c => {
                    const on = dept === c.id;
                    return (
                        <button key={c.id} type="button" aria-pressed={on} onClick={() => { onDept(c.id); setShowAll(false); }}
                            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] transition-colors ${on
                                ? 'bg-ink text-surface font-semibold'
                                : 'bg-surface border border-line-soft text-muted hover:text-ink font-medium'}`}>
                            {c.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />}
                            {c.label}
                        </button>
                    );
                })}
            </div>

            {rows.length === 0 ? <Empty icon={Stethoscope} text={t('report.svc.empty')} /> : (
                <section className="card overflow-hidden" aria-labelledby="rep-svc">
                    <div className="px-5 pt-4 pb-3">
                        <h3 id="rep-svc" className="text-[15px] font-semibold text-ink">{fill(t('report.svc.title'), rows.length)}</h3>
                        <p className="text-[12px] text-faint mt-0.5">{t('report.svc.hint')}{prevText ? ` ${prevText}` : ''}</p>
                    </div>
                    <div className="overflow-x-auto border-t border-line-soft">
                        <table className="w-full min-w-[760px]">
                            <thead className="border-b border-line-soft">
                                <tr>
                                    <Th>{t('report.svc.service')}</Th>
                                    <Th right>{t('report.svc.count')}</Th>
                                    <Th right>{t('report.svc.sum')}</Th>
                                    <Th right>{t('report.svc.avgPrice')}</Th>
                                    {showDiscount && <Th right>{t('report.svc.discount')}</Th>}
                                    {showMaterial && <Th right>{t('report.svc.material')}</Th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line-soft">
                                {shown.map(r => {
                                    const d = r.departmentId ? deptById.get(r.departmentId) : undefined;
                                    const avg = r.count > 0 ? r.revenue / r.count : 0;
                                    /* Narxnoma narxi faqat chegirma bo'lsa: narx davr o'rtasida
                                       o'zgarganda «o'rtacha 1,5 mln — narxnomada 5 mln» chegirmaga
                                       o'xshab, egani chalg'itardi */
                                    const listGap = r.discount > 0 && r.listPrice != null && r.listPrice > 0 && Math.abs(avg - r.listPrice) / r.listPrice > 0.01;
                                    const discPct = pct(r.discount, r.revenue + r.discount);
                                    const matPct = r.materialCost != null ? pct(r.materialCost, r.revenue) : 0;
                                    const tag = tagOf(r);
                                    return (
                                        <tr key={r.key} className="hover:bg-elevated/40 transition-colors">
                                            <Td className="min-w-[240px] py-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-ink truncate">{nameOf(r)}</span>
                                                    {tag && <span className="shrink-0 h-5 px-1.5 rounded bg-elevated text-[11px] font-medium text-muted inline-flex items-center">{tag}</span>}
                                                </div>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <div className="w-28 shrink-0"><ShareBar value={r.revenue} max={maxRevenue} color={d?.color || undefined} /></div>
                                                    {dept === 'all' && <span className="text-[12px] text-faint truncate">{d ? d.name : deptName("Bo'limsiz")}</span>}
                                                </div>
                                            </Td>
                                            <Td right>{fmt(r.count)}</Td>
                                            <Td right>
                                                <div className="font-semibold">{fmt(r.revenue)}</div>
                                                <div className="mt-0.5 flex items-center justify-end gap-2 text-[12px] text-faint">
                                                    {r.prevRevenue > 0 && <DeltaChip delta={delta(r.revenue, r.prevRevenue)} previous={r.prevRevenue} goodUp />}
                                                    <span>{pct(r.revenue, total)}%</span>
                                                </div>
                                            </Td>
                                            <Td right>
                                                <div>{fmt(avg)}</div>
                                                {listGap && <div className="text-[12px] text-faint">{fill(t('report.svc.listPrice'), fmt(r.listPrice))}</div>}
                                            </Td>
                                            {showDiscount && (
                                                <Td right tone={r.discount > 0 ? (discPct >= DISCOUNT_WARN_PCT ? 'warn' : undefined) : 'muted'}>
                                                    {r.discount > 0 ? <><div>{fmt(r.discount)}</div><div className="text-[12px] opacity-80">{discPct}%</div></> : '—'}
                                                </Td>
                                            )}
                                            {showMaterial && (
                                                <Td right tone={r.materialCost == null ? 'muted' : matPct >= 100 ? 'bad' : matPct >= MATERIAL_WARN_PCT ? 'warn' : undefined}>
                                                    {r.materialCost == null ? '—' : <><div>{fmt(r.materialCost)}</div><div className="text-[12px] opacity-80">{fill(t('report.svc.ofSum'), matPct)}</div></>}
                                                </Td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-line bg-elevated/50">
                                <tr>
                                    <Td strong>{t('report.total')}</Td>
                                    <Td right strong>{fmt(count)}</Td>
                                    <Td right strong>
                                        <div>{fmt(total)}</div>
                                        {prevTotal > 0 && <div className="mt-0.5 flex justify-end"><DeltaChip delta={delta(total, prevTotal)} previous={prevTotal} goodUp /></div>}
                                    </Td>
                                    {/* Turli xizmatlar narxining o'rtachasi ma'nosiz — bo'sh */}
                                    <Td right tone="muted">—</Td>
                                    {showDiscount && <Td right strong>{fmt(discount)}</Td>}
                                    {showMaterial && <Td right strong>{fmt(material)}</Td>}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {rows.length > SHOWN && (
                        <div className="px-5 py-2 border-t border-line-soft">
                            <button type="button" onClick={() => setShowAll(o => !o)} aria-expanded={showAll}
                                className="h-8 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                {showAll ? t('pay.queue.hide') : fill(t('pay.queue.showN'), rows.length - SHOWN)}
                            </button>
                        </div>
                    )}
                    {noMaterial > 0 && (
                        <p className="px-5 py-2.5 text-[12px] text-faint border-t border-line-soft">
                            {fill(t('report.svc.noMaterial'), noMaterial)}{' '}
                            <a href="#/settings?tab=services" className="inline-flex items-center gap-0.5 font-medium text-primary-700 dark:text-primary-300 hover:underline">
                                {t('report.svc.toSettings')}<ArrowRight className="w-3 h-3" aria-hidden="true" />
                            </a>
                        </p>
                    )}
                </section>
            )}

            {/* ── Narxnomada bor, davrda bajarilmagan ───────────────────── */}
            {unsold.length > 0 && (
                <section className="card px-5 py-3" aria-labelledby="rep-unsold">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 id="rep-unsold" className="text-sm font-semibold text-ink">{fill(t('report.svc.unsoldTitle'), unsold.length)}</h3>
                        <span className="text-[12px] text-faint">{t('report.svc.unsoldHint')}</span>
                        <button type="button" onClick={() => setShowUnsold(o => !o)} aria-expanded={showUnsold}
                            className="ml-auto h-8 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                            {showUnsold ? t('pay.queue.hide') : t('report.svc.showList')}
                        </button>
                    </div>
                    {showUnsold && (
                        <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                            {unsold.map(u => (
                                <li key={u.serviceId} className="flex items-baseline gap-3 py-1 border-b border-line-soft last:border-0">
                                    <span className="text-ink truncate">{u.name}</span>
                                    <span className="ml-auto shrink-0 tabular-nums text-[12px] text-faint">{fmt(u.listPrice)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
};
