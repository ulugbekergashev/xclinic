import React from 'react';
import { Users, ArrowRight } from 'lucide-react';
import { useLanguage, fill } from '../../context/LanguageContext';
import { fmt, deptName, Th, Td, Calculating, Empty, ShareBar } from './shared';

/* ─────────────────────────────────────────────────────────────────────────────
   SHIFOKORLAR — kim qancha ish qildi va kimga qancha ulush qoldi.

   Tepada endi to'rt plitka YO'Q (2026-11-26): ular Umumiyni boshqa ma'noda
   takrorlardi («Xizmatlar 4 650 000» u yerda 6 450 000 edi). Jamilar
   jadvalning o'z pastki qatorida. Ulush qoldig'i qizil emas — bu signal
   emas, oddiy hisob-kitob: «To'lash →» Xodimlar → Ulush ga olib boradi.
   ───────────────────────────────────────────────────────────────────────────── */

type ShareMap = Record<string, { paid: number; payable: number }>;

interface Props {
    report: any | null;
    loading: boolean;
    shares: ShareMap | null;
    sharesFailed: boolean;
    shareMonthsText: string;
}

export const DoctorsView: React.FC<Props> = ({ report, loading, shares, sharesFailed, shareMonthsText }) => {
    const { t } = useLanguage();
    if (loading || !report) return <Calculating />;
    const rows: any[] = report.doctors || [];
    if (rows.length === 0) return <Empty icon={Users} text={t('finance.report.noRows')} />;

    const maxRevenue = Math.max(0, ...rows.map(d => d.revenue || 0));
    const pending = !shares ? (sharesFailed ? '?' : '…') : null;
    const shareOf = (d: any) => (d.doctorId && shares ? shares[d.doctorId] : undefined);
    /* Jami — Xodimlar → Ulush jadvalining BUTUN oylari bo'yicha, Umumiydagi
       «to'lanmagan ulush» bilan bitta son (davrda qatori yo'q shifokor ham). */
    const sharePaidTotal = shares ? Object.values(shares).reduce((s, x) => s + (x.paid || 0), 0) : 0;
    const shareLeftTotal = shares ? Object.values(shares).reduce((s, x) => s + (x.payable || 0), 0) : 0;

    return (
        <section className="card overflow-hidden" aria-label={t('ui.shifokorlar')}>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                    <thead className="border-b border-line-soft">
                        <tr>
                            <Th>{t('finance.report.doctor')}</Th>
                            <Th right>{t('report.services')}</Th>
                            <Th right>{t('finance.report.paid')}</Th>
                            <Th right>{t('finance.report.debt')}</Th>
                            <Th right>{t('finance.report.patient')}</Th>
                            <Th right>{t('finance.report.avgCheck')}</Th>
                            <Th right>{t('finance.report.share')}</Th>
                            <Th right>{t('report.sharePaid')}</Th>
                            <Th right>{t('report.shareLeft')}</Th>
                            <Th right><span className="sr-only">{t('report.payShare')}</span></Th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                        {rows.map((d: any) => {
                            const s = shareOf(d);
                            return (
                                <tr key={d.doctorId || d.name} className="hover:bg-elevated/40 transition-colors">
                                    <Td className="min-w-[200px]">
                                        <div className="font-medium text-ink">{deptName(d.name)}</div>
                                        <div className="mt-1 w-32"><ShareBar value={d.revenue || 0} max={maxRevenue} /></div>
                                    </Td>
                                    <Td right>{fmt(d.revenue)}</Td>
                                    <Td right>{fmt(d.paid)}</Td>
                                    <Td right tone={d.due > 0 ? 'bad' : 'muted'}>{d.due > 0 ? fmt(d.due) : '—'}</Td>
                                    <Td right>{d.patientCount}</Td>
                                    <Td right>{fmt(d.avgCheck)}</Td>
                                    <Td right strong>{d.doctorId ? fmt(d.accrued) : '—'}</Td>
                                    <Td right tone={s && s.paid > 0 ? 'ok' : 'muted'}>{pending ?? (s && s.paid > 0 ? fmt(s.paid) : '—')}</Td>
                                    <Td right strong tone={s && s.payable > 0 ? undefined : 'muted'}>{pending ?? (s && s.payable > 0 ? fmt(s.payable) : '—')}</Td>
                                    <Td right>
                                        {s && s.payable > 0 ? (
                                            <a href="#/staff?tab=payroll"
                                                className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-700 dark:text-primary-300 hover:underline whitespace-nowrap">
                                                {t('report.payShare')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                                            </a>
                                        ) : null}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="border-t border-line bg-elevated/50">
                        <tr>
                            <Td strong>{t('report.total')}</Td>
                            <Td right strong>{fmt(report.totals?.revenue)}</Td>
                            <Td right strong>{fmt(report.totals?.paid)}</Td>
                            <Td right strong tone={report.totals?.due > 0 ? 'bad' : undefined}>{fmt(report.totals?.due)}</Td>
                            <Td />
                            <Td />
                            <Td right strong>{fmt(report.totals?.accrued)}</Td>
                            <Td right strong tone={sharePaidTotal > 0 ? undefined : 'muted'}>{pending ?? (sharePaidTotal > 0 ? fmt(sharePaidTotal) : '—')}</Td>
                            <Td right strong tone={shareLeftTotal > 0 ? undefined : 'muted'}>{pending ?? (shareLeftTotal > 0 ? fmt(shareLeftTotal) : '—')}</Td>
                            <Td />
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p className="px-4 py-2.5 text-[12px] text-faint border-t border-line-soft">
                {t('report.shareNoteShort')} {fill(t('report.shareMonthsNote'), shareMonthsText)}
            </p>
        </section>
    );
};
