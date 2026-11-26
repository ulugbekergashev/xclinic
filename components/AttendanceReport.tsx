import React, { useState, useEffect } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarX2 } from 'lucide-react';
import { formatNumber } from '../utils/format';
import { api } from '../services/api';
import { useLanguage, fill, tr, TranslationKey } from '../context/LanguageContext';
import { KpiStrip, CardHead, ChartTip, Calculating, Empty, useIsDark, chartTheme } from './report/shared';

/* Server `name` ni o'zbekcha beradi; ekranda hafta kuni raqamidan tildagi nom olinadi (0 = yakshanba). */
const wdName = (n: number | undefined, fallback = '') => (n == null || Number.isNaN(Number(n)) ? fallback : tr(`ui.wd_${n}` as TranslationKey));
/** 10.7 → «10,7» (o'nlik vergul bilan) */
const dec = (n: number) => String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ',');

/* ─────────────────────────────────────────────────────────────────────
   DAVOMAT HISOBOTI — «qaysi kunlarda va soatlarda bemor ko'p keladi,
   kim kelmay qoladi?» Klinika egasining jadval tuzishdagi savoli.

   2026-11-26 (olti maslahatchi):
   • Davr — Hisobotning UMUMIY davri. Ilgari bu yerda o'z «30 kun /
     90 kun / 1 yil» tanlovi bor edi: Umumiy «Olindi 4,4 mln» yonida
     Davomat «Tushum 19,1 mln» — ikki xil davr, bir xil ekran.
   • «Tushum» plitkasi va chizig'i olib tashlandi: pul — Umumiyda.
   • «Hafta kunlari — raqamlar» jadvali olib tashlandi: u grafikni
     takrorlardi. Shifokorlar — grafik emas, «kim kelmay qoldi» ro'yxati.
   ───────────────────────────────────────────────────────────────── */

const AttendanceReport: React.FC<{ data: any }> = ({ data }) => {
    const { t } = useLanguage();
    const dark = useIsDark();
    const c = chartTheme(dark);

    const tot = data.totals || {};
    const wd: any[] = data.byWeekday || [];
    const docs: any[] = (data.byDoctor || []).filter((d: any) => d.booked > 0);
    const daily = (data.byDay || []).map((d: any) => ({ ...d, label: `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}` }));
    const hours = (data.byHour || []).filter((h: any) => h.booked > 0)
        .map((h: any) => ({ ...h, label: `${h.hour}:00`, noShow: Math.max(0, h.booked - h.arrived) }));
    const wdChart = wd.map((w: any) => ({ ...w, short: wdName(w.weekday, w.name).slice(0, 3) }));
    const maxWd = Math.max(1, ...wd.map((w: any) => w.avgVisits || 0));
    const maxDoc = Math.max(1, ...docs.map(d => d.booked || 0));

    if (!tot.booked) return <Empty icon={CalendarX2} text={t('ui.bu_davrda_yozuv_yoq')} />;

    const best = data.best, worst = data.worst;
    const footer = best && worst && best.weekday !== worst.weekday
        ? fill(t('report.att.bestWorst'), wdName(best.weekday, best.name), dec(best.avgVisits), wdName(worst.weekday, worst.name), dec(worst.avgVisits))
        : undefined;

    const axis = { tick: { fill: c.axis, fontSize: 11 }, tickLine: false, axisLine: false } as const;

    return (
        <div className="space-y-4">
            <KpiStrip footer={footer} items={[
                { key: 'booked', label: t('attendancereport.yozilgan'), value: formatNumber(tot.booked), hint: t('attendancereport.kalendardagi_yozuvlar') },
                { key: 'arrived', label: t('attendancereport.kelgan'), value: formatNumber(tot.arrived), tone: 'ok', hint: fill(t('report.att.ofBooked'), tot.arrivalRate ?? 0) },
                { key: 'noShow', label: t('report.att.noShow'), value: formatNumber(tot.noShow), tone: tot.noShowRate > 15 ? 'warn' : undefined, hint: fill(t('report.att.noShowHint'), tot.noShowRate ?? 0) },
                { key: 'cancelled', label: t('attendancereport.bekor_qilingan'), value: formatNumber(tot.cancelled), hint: t('attendancereport.oldindan_aytgan') },
            ]} />

            {daily.length > 1 && (
                <section className="card" aria-labelledby="att-daily">
                    <CardHead id="att-daily" title={t('attendancereport.kunma_kun')}
                        right={
                            <div className="flex items-center gap-4 text-[12px] text-muted" aria-hidden="true">
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.primarySoft }} />{t('ui.yozilgan')}</span>
                                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.primary }} />{t('attendancereport.kelgan')}</span>
                            </div>
                        } />
                    <div className="px-2 pb-3">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={daily} margin={{ top: 6, right: 16, left: 0, bottom: 0 }} barGap={2}>
                                <CartesianGrid stroke={c.grid} vertical={false} />
                                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={18} />
                                <YAxis {...axis} width={32} allowDecimals={false} />
                                <Tooltip content={<ChartTip formatter={formatNumber} />} cursor={{ fill: c.grid }} />
                                <Bar dataKey="booked" name={t('ui.yozilgan')} fill={c.primarySoft} radius={[3, 3, 0, 0]} maxBarSize={18} />
                                <Bar dataKey="arrived" name={t('attendancereport.kelgan')} fill={c.primary} radius={[3, 3, 0, 0]} maxBarSize={18} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
                <section className="card" aria-labelledby="att-wd">
                    <CardHead id="att-wd" title={t('attendancereport.hafta_kunlari')} hint={t('report.att.wdHint')} />
                    <div className="px-2 pb-3">
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={wdChart} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke={c.grid} vertical={false} />
                                <XAxis dataKey="short" {...axis} />
                                <YAxis {...axis} width={28} />
                                <Tooltip content={<ChartTip formatter={dec} />} cursor={{ fill: c.grid }} />
                                <Bar dataKey="avgVisits" name={t('attendancereport.kuniga_ortacha')} radius={[4, 4, 0, 0]} maxBarSize={36}>
                                    {wdChart.map((w: any, i: number) => (
                                        <Cell key={w.weekday ?? i}
                                            fill={w.avgVisits >= maxWd * 0.85 ? c.success : w.avgVisits <= maxWd * 0.45 ? c.warning : c.primary} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className="card" aria-labelledby="att-hours">
                    <CardHead id="att-hours" title={t('attendancereport.kun_davomida')} hint={t('attendancereport.qaysi_soatda_gavjum')} />
                    {hours.length === 0 ? (
                        <p className="px-5 pb-6 text-sm text-faint">{t('ui.malumot_yoq')}</p>
                    ) : (
                        <div className="px-2 pb-3">
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={hours} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke={c.grid} vertical={false} />
                                    <XAxis dataKey="label" {...axis} />
                                    <YAxis {...axis} width={28} allowDecimals={false} />
                                    <Tooltip content={<ChartTip formatter={formatNumber} />} cursor={{ fill: c.grid }} />
                                    <Bar dataKey="arrived" name={t('attendancereport.kelgan')} stackId="h" fill={c.primary} maxBarSize={28} />
                                    <Bar dataKey="noShow" name={t('report.att.noShow')} stackId="h" fill={c.muted} radius={[3, 3, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>
            </div>

            {docs.length > 0 && (
                <section className="card" aria-labelledby="att-docs">
                    <CardHead id="att-docs" title={t('attendancereport.shifokorlar_boyicha')} hint={t('report.att.docsHint')} />
                    <ul className="divide-y divide-line-soft border-t border-line-soft">
                        {docs.map((d: any) => {
                            const noShow = d.noShow ?? Math.max(0, d.booked - d.arrived);
                            const rate = d.booked ? Math.round((noShow / d.booked) * 100) : 0;
                            return (
                                <li key={d.doctorId || d.doctorName} className="px-5 h-12 flex items-center gap-4 text-sm">
                                    <span className="w-48 shrink-0 truncate font-medium text-ink">{d.doctorName}</span>
                                    <div className="flex-1 min-w-0 flex h-2 rounded-full overflow-hidden bg-elevated" aria-hidden="true">
                                        <div style={{ width: `${(d.arrived / maxDoc) * 100}%`, background: c.primary }} />
                                        <div style={{ width: `${(noShow / maxDoc) * 100}%`, background: c.warning }} />
                                    </div>
                                    <span className="w-28 text-right text-muted tabular-nums shrink-0 whitespace-nowrap">{fill(t('report.att.cameOf'), d.arrived, d.booked)}</span>
                                    <span className={`w-36 text-right tabular-nums shrink-0 whitespace-nowrap ${rate > 15 ? 'font-semibold text-warning-700 dark:text-warning-300' : 'text-faint'}`}>
                                        {noShow > 0 ? fill(t('report.att.noShowN'), noShow, rate) : '—'}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
};

/* Ma'lumotni komponentning O'ZI so'raydi — davr Hisobotdan keladi. */
export const AttendanceTab: React.FC<{ from: string; to: string; refreshKey?: number }> = ({ from, to, refreshKey = 0 }) => {
    const { t } = useLanguage();
    /* `key` — qaysi davr uchun yuklangani: davr almashganda eski raqamlar
       yangi sarlavha ostida turmaydi (jim yangilashda esa joyida qoladi). */
    const [loaded, setLoaded] = useState<{ key: string; data: any } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const key = `${from}|${to}`;
    const data = loaded?.key === key ? loaded.data : null;

    useEffect(() => {
        let alive = true;
        setBusy(true);
        setError(null);
        api.reports.attendance(from, to)
            .then(d => { if (alive) { setLoaded({ key: `${from}|${to}`, data: d }); setError(null); } })
            .catch(e => {
                /* Sabab SAQLANADI va ekranda ko'rsatiladi. Quruq «yuklab
                   bo'lmadi» nima bo'lganini aytmaydi: server eskimi,
                   tarmoqmi, ruxsatmi — hammasi bir xil ko'rinardi. */
                if (alive) { setLoaded(null); setError(e?.message || String(e)); }
            })
            .finally(() => { if (alive) setBusy(false); });
        return () => { alive = false; };
    }, [from, to, refreshKey]);

    if (busy && !data) return <Calculating />;
    if (!data) {
        return (
            <div className="card py-12 px-4 text-center">
                <p className="text-muted mb-2">{t('attendancereport.hisobotni_yuklab_bolmadi')}</p>
                {error && (
                    <p className="inline-block text-xs font-mono text-danger-600 dark:text-danger-300 bg-danger-50 dark:bg-danger-500/10 border border-danger-500/30 rounded-lg px-3 py-2 mb-2">{error}</p>
                )}
                <p className="text-xs text-faint">{t('attendancereport.agar_404_yozilgan_bolsa')}</p>
            </div>
        );
    }
    return <AttendanceReport data={data} />;
};
