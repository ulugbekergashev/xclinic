/* TARIX TABI.

   Ilgari: uchta katta karta (9 / 8 / 1), qizil banner (yana «1 ta xato»)
   va filtr tugmalari (yana «Yuborildi (8) · Xato (1)») — bitta raqam uch
   marta. Endi raqamlar FILTRNING O'ZI: kafelni bosish ro'yxatni o'sha
   holatga o'tkazadi.

   Qator: holat belgisi, kim (ism — bemor kartasiga havola; ism yo'q
   bo'lsa raqam; u ham yo'q bo'lsa «Noma'lum» — ilgari «-» edi), kanal,
   manba (noma'lum bo'lsa chiqmaydi — ilgari «SMS ()» edi), matn va vaqt.
   Ro'yxat kunlarga bo'lingan: «Bugun», «Kecha», sana. */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, History, RefreshCw, RotateCcw, X, XCircle } from 'lucide-react';
import type { BulkSendStatus, MessageLog } from '../../types';
import { Button } from '../Common';
import { formatDateMedium, formatFullName } from '../../utils/format';
import { dayKey, todayISO, formatDateToISO } from '../../utils/dateUtils';
import { useLanguage, fill } from '../../context/LanguageContext';
import { ChannelTag, EmptyState, sourceLabel } from './shared';

export type HistoryFilter = 'all' | 'sent' | 'failed';

interface Props {
    logs: MessageLog[];
    stats: { total: number; sent: number; failed: number };
    filter: HistoryFilter;
    onFilter: (f: HistoryFilter) => void;
    loading: boolean;
    onReload: () => void;
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onSelectAllFailed: () => void;
    onClearSelection: () => void;
    onRetry: () => void;
    retrying: boolean;
    bulkJob: BulkSendStatus | null;
    onDismissBulk: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const timeOf = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const HistoryTab: React.FC<Props> = ({
    logs, stats, filter, onFilter, loading, onReload, selectedIds, onToggleSelect,
    onSelectAllFailed, onClearSelection, onRetry, retrying, bulkJob, onDismissBulk,
}) => {
    const { t, language } = useLanguage();

    // Kunlarga bo'lish — yozuvlar serverdan yangisi birinchi keladi
    const groups = useMemo(() => {
        const today = todayISO();
        const y = new Date(); y.setDate(y.getDate() - 1);
        const yesterday = formatDateToISO(y);
        const out: { key: string; label: string; items: MessageLog[] }[] = [];
        /* Yangisi birinchi. Server shunday beradi, lekin tartibga suyanmaymiz:
           aks holda bitta kun («Kecha») ro'yxatda ikki marta chiqadi. */
        const sorted = [...logs].sort((a, b) => (Date.parse(b.sentAt) || 0) - (Date.parse(a.sentAt) || 0));
        for (const log of sorted) {
            const key = dayKey(log.sentAt) || '—';
            let g = out[out.length - 1];
            if (!g || g.key !== key) {
                const label = key === today ? t('msg.history.today')
                    : key === yesterday ? t('msg.history.yesterday')
                        : formatDateMedium(log.sentAt, language);
                g = { key, label, items: [] };
                out.push(g);
            }
            g.items.push(log);
        }
        return out;
    }, [logs, t, language]);

    const tiles: { key: HistoryFilter; label: string; value: number; tone: string }[] = [
        { key: 'all', label: t('messagesmanagement.jami_yuborilgan'), value: stats.total, tone: 'text-ink' },
        { key: 'sent', label: t('messagesmanagement.muvaffaqiyatli'), value: stats.sent, tone: 'text-success' },
        { key: 'failed', label: t('messagesmanagement.xato'), value: stats.failed, tone: stats.failed > 0 ? 'text-danger' : 'text-ink' },
    ];

    const done = (bulkJob?.sent || 0) + (bulkJob?.failed || 0);

    return (
        <div className="space-y-4">
            {/* Raqamlar = filtr */}
            <div role="group" aria-label={t('msg.history.filter')} className="grid grid-cols-3 gap-3">
                {tiles.map(tile => {
                    const pressed = filter === tile.key;
                    return (
                        <button key={tile.key} type="button" aria-pressed={pressed} onClick={() => onFilter(tile.key)}
                            className={`card text-left px-4 py-3 transition-colors ${pressed
                                ? '!border-primary-500 ring-2 ring-primary-500/15'
                                : 'hover:!border-faint'}`}>
                            <span className={`block text-2xl font-semibold tabular-nums leading-tight ${tile.tone}`}>{tile.value}</span>
                            <span className="block text-sm text-muted mt-0.5">{tile.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Fonda ketayotgan yuborish */}
            {bulkJob && (
                <div className="card px-4 py-3 space-y-2" role="status">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-semibold text-ink">
                            {!bulkJob.done && <span className="w-3.5 h-3.5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />}
                            {bulkJob.done ? t('messagesmanagement.yuborish_tugadi') : t('messagesmanagement.yuborilmoqda')}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
                            {done} / {bulkJob.total || 0}
                            {(bulkJob.failed || 0) > 0 && <span className="text-danger">{fill(t('messagesmanagement.x_ta_xato'), bulkJob.failed)}</span>}
                            {bulkJob.done && (
                                <button type="button" onClick={onDismissBulk} className="text-faint hover:text-ink" aria-label={t('common.close')}>
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </span>
                    </div>
                    <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                        <div className="h-full bg-primary-600 transition-all"
                            style={{ width: `${Math.round((done / Math.max(1, bulkJob.total || 0)) * 100)}%` }} />
                    </div>
                    {bulkJob.error && <p className="text-xs text-danger">{bulkJob.error}</p>}
                </div>
            )}

            <section className="card overflow-hidden" aria-label={t('messagesmanagement.tarix')}>
                <div className="px-4 h-14 border-b border-line flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        {selectedIds.size > 0 ? (
                            <>
                                <Button size="sm" onClick={onRetry} disabled={retrying}>
                                    <RotateCcw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                                    {fill(t('msg.history.retryN'), selectedIds.size)}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={onClearSelection}>{t('ui.bekor')}</Button>
                            </>
                        ) : stats.failed > 0 ? (
                            <Button size="sm" variant="secondary" onClick={onSelectAllFailed} disabled={loading}>
                                <XCircle className="w-3.5 h-3.5 text-danger" />
                                {fill(t('msg.history.selectFailed'), stats.failed)}
                            </Button>
                        ) : (
                            <span className="text-sm font-semibold text-ink">{t('messagesmanagement.tarix')}</span>
                        )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={onReload} disabled={loading}>
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('ui.yangilash')}
                    </Button>
                </div>

                {logs.length === 0 ? (
                    <div className="p-4">
                        {loading
                            ? <p className="py-8 text-center text-sm text-muted">{t('ui.yuklanmoqda_2')}</p>
                            : <EmptyState icon={History} title={filter === 'all' ? t('messagesmanagement.xabarlar_tarixi_bosh') : t('messagesmanagement.bu_filtr_boyicha_xabar')} />}
                    </div>
                ) : (
                    <div className="max-h-[calc(100vh-22rem)] min-h-[16rem] overflow-y-auto">
                        {groups.map(g => (
                            <div key={g.key}>
                                <h3 className="sticky top-0 z-[1] px-4 py-1.5 bg-elevated/95 backdrop-blur text-xs font-semibold text-muted border-b border-line-soft">
                                    {g.label} <span className="text-faint font-medium">· {g.items.length}</span>
                                </h3>
                                <ul className="divide-y divide-line-soft">
                                    {g.items.map(log => <LogRow key={log.id} log={log}
                                        selected={selectedIds.has(log.id)} onToggle={() => onToggleSelect(log.id)} />)}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

const LogRow: React.FC<{ log: MessageLog; selected: boolean; onToggle: () => void }> = ({ log, selected, onToggle }) => {
    const { t } = useLanguage();
    const isFailed = log.status === 'Failed';
    const isRetried = log.status === 'Retried';
    const isSkipped = log.status === 'Skipped';
    const patientName = log.patient ? formatFullName(log.patient) : '';
    const contact = log.patient?.phone || log.recipient || '';
    const source = sourceLabel(log.source, log.type);

    const StatusIcon = isFailed ? XCircle : isRetried ? RotateCcw : isSkipped ? Clock : CheckCircle2;
    const statusCls = isFailed ? 'text-danger' : (isRetried || isSkipped) ? 'text-faint' : 'text-success';
    const statusText = isFailed ? t('messagesmanagement.xato')
        : isRetried ? t('messagesmanagement.qayta_yuborilgan')
            : isSkipped ? t('messagesmanagement.otkazib_yuborildi')
                : t('messagesmanagement.yuborildi');

    return (
        <li className={`flex items-start gap-3 px-4 py-2.5 ${selected ? 'bg-danger-500/5' : 'hover:bg-elevated/60'}`}>
            {/* Belgilash faqat xatolar uchun; joyi doim band — qatorlar tekis tursin */}
            <input type="checkbox" checked={isFailed && selected} onChange={onToggle} disabled={!isFailed}
                aria-label={t('msg.history.selectRow')}
                className={`mt-1 w-4 h-4 rounded border-line accent-danger-600 ${isFailed ? '' : 'invisible'}`} />
            <StatusIcon className={`mt-0.5 w-[18px] h-[18px] shrink-0 ${statusCls}`} aria-label={statusText} role="img" />
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {patientName && log.patient?.id ? (
                        <Link to={`/patients/${log.patient.id}`} className="font-semibold text-sm text-ink hover:text-primary-600 hover:underline">
                            {patientName}
                        </Link>
                    ) : (
                        <span className="font-semibold text-sm text-ink">{contact || t('msg.history.unknown')}</span>
                    )}
                    {patientName && contact && <span className="text-xs text-faint tabular-nums">{contact}</span>}
                    <ChannelTag channel={log.channel} />
                    {source && <span className="text-xs text-muted">{source}</span>}
                </div>
                {log.message && <p className="text-sm text-muted mt-0.5 truncate" title={log.message}>{log.message}</p>}
                {(isFailed || isRetried || isSkipped) && log.error && (
                    <p className={`text-xs mt-0.5 ${isFailed ? 'text-danger' : 'text-faint'}`}>{log.error}</p>
                )}
            </div>
            <time dateTime={log.sentAt} className="text-xs text-faint tabular-nums shrink-0 mt-0.5">{timeOf(log.sentAt)}</time>
        </li>
    );
};
