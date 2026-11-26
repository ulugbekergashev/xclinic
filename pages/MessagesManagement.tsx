/* XABARLAR — SMS va Telegram.

   DIZAYN (2026-11-25). Ilgari sahifa 1656 qatorli bitta fayl edi; tepada
   katta sarlavha bloki (nomini chap menyu allaqachon aytadi), keng tablar
   qatori va har tabda uzun izohlar turardi. Endi:

     · tepada bitta qator — chapda tablar, o'ngda kanal holati
       («Telegram ulangan · SMS ulanmagan»); bosilsa Sozlamalar ochiladi.
       Ilgari bu faqat Qo'lda tabidagi sariq bannerlarda ko'rinardi;
     · tablar tartibi: har kungi ish (Avtomatik, Qo'lda, Tarix) oldinda,
       bir marta sozlanadigan (Shablonlar, Sozlamalar) oxirida. Oxirgi
       tanlangan tab eslab qolinadi;
     · Tarix tabida xatolar soni ko'rinib turadi — qaysi tabda bo'lmang,
       «nimadir ketmadi» bir qarashda bilinadi;
     · har tab o'z faylida: components/messages/*.

   Tablar bir marta ochilgandan keyin YASHIRILADI, o'chirilmaydi — yozilgan
   xabar, ochiq forma va tanlangan segment tab almashganda yo'qolmaydi
   (ilgari ham shunday edi: holat sahifa darajasida turardi). */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap, Megaphone, History, FileText, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import type {
    Clinic, Doctor, MessageTemplate, AutomationRule, MessageLog, BulkSendStatus, TriggerDescriptor,
    SegmentFieldDescriptor, AudienceSegment,
} from '../types';
import { MessageChannelSettings } from '../components/MessageChannelSettings';
import { TemplatesTab } from '../components/messages/TemplatesTab';
import { RulesTab } from '../components/messages/RulesTab';
import { ManualTab } from '../components/messages/ManualTab';
import { HistoryTab, type HistoryFilter } from '../components/messages/HistoryTab';
import { api } from '../services/api';
import { formatMoney } from '../utils/format';
import { useLanguage, fill } from '../context/LanguageContext';

interface MessagesManagementProps {
    clinicId: string;
    currentClinic?: Clinic;
    /** Klinika yozuvi o'zgardi (bron to'lovi sozlamasi) */
    onClinicUpdated?: () => void;
    // Bemorlar va tranzaksiyalar bu yerga uzatilmaydi: auditoriyani va qarzni
    // server hisoblaydi (backend/segments.ts), aks holda ta'riflar ikkiga bo'linadi.
    doctors: Doctor[];
    addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

type TabId = 'auto' | 'manual' | 'history' | 'templates' | 'settings';
const TAB_KEY = 'xclinic_msg_tab';
const TAB_IDS: TabId[] = ['auto', 'manual', 'history', 'templates', 'settings'];

const initialTab = (): TabId => {
    try {
        const saved = localStorage.getItem(TAB_KEY) as TabId | null;
        if (saved && TAB_IDS.includes(saved)) return saved;
    } catch { /* localStorage yopiq */ }
    return 'auto';
};

/* TAYYOR AUDITORIYA havoladan (2026-11-26). Hisobot → Bemorlar →
   «Eslatma yuborish» `#/messages?audience=inactive6` ga olib keladi:
   Qo'lda tabi o'sha «6 oydan beri kelmagan» segmenti bilan ochiladi —
   hisobotdagi son va bu yerdagi ro'yxat bitta qoidadan. */
const AUDIENCE_PRESETS: Record<string, AudienceSegment> = {
    inactive6: { match: 'all', conditions: [{ field: 'status', op: 'eq', value: 'Active' }, { field: 'lastVisit', op: 'before', value: 6 }] },
};

export const MessagesManagement: React.FC<MessagesManagementProps> = ({
    clinicId, currentClinic, doctors, addToast, onClinicUpdated,
}) => {
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const presetSegment = AUDIENCE_PRESETS[searchParams.get('audience') || ''] || null;
    const [activeTab, setActiveTabState] = useState<TabId>(() => (presetSegment ? 'manual' : initialTab()));
    const [visited, setVisited] = useState<Set<TabId>>(() => new Set([activeTab]));

    const setActiveTab = useCallback((tab: TabId) => {
        setActiveTabState(tab);
        setVisited(prev => prev.has(tab) ? prev : new Set(prev).add(tab));
        try { localStorage.setItem(TAB_KEY, tab); } catch { /* yopiq */ }
    }, []);

    // ── Ma'lumotlar ──
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [triggerDefs, setTriggerDefs] = useState<TriggerDescriptor[]>([]);
    const [segmentFields, setSegmentFields] = useState<SegmentFieldDescriptor[]>([]);
    const [logs, setLogs] = useState<MessageLog[]>([]);
    const [logStats, setLogStats] = useState({ total: 0, sent: 0, failed: 0 });
    const [smsConnected, setSmsConnected] = useState(false);
    // Balans pul sarflanadigan joyda ko'rinadi (Qo'lda xulosasi va tepadagi holat)
    const [smsBalance, setSmsBalance] = useState<number | null>(null);
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
    const [logsLoading, setLogsLoading] = useState(false);
    const [bulkJob, setBulkJob] = useState<BulkSendStatus | null>(null);
    const [newTemplateSignal, setNewTemplateSignal] = useState(0);

    // Filtr serverda qo'llanadi: aks holda limitdan tashqaridagi xatolar
    // ro'yxatda ko'rinmay, yuqoridagi hisoblagich bilan ziddiyat hosil qilardi.
    const loadLogs = useCallback(async (filter: HistoryFilter = historyFilter): Promise<MessageLog[]> => {
        if (!clinicId) return [];
        setLogsLoading(true);
        try {
            const res = await api.messages.getLogs(clinicId, filter === 'all' ? undefined : filter);
            setLogs(res.logs || []);
            setLogStats(res.stats || { total: 0, sent: 0, failed: 0 });
            return res.logs || [];
        } catch {
            return [];
        } finally {
            setLogsLoading(false);
        }
    }, [clinicId, historyFilter]);

    const loadSmsStatus = useCallback(() => {
        if (!clinicId) return;
        api.sms.getSettings(clinicId).then((s: any) => {
            setSmsConnected(!!s.isConnected);
            if (s.isConnected) {
                api.sms.getBalance(clinicId)
                    .then((b: any) => setSmsBalance(typeof b?.balance === 'number' ? b.balance : null))
                    .catch(() => { });
            } else {
                setSmsBalance(null);
            }
        }).catch(() => { });
    }, [clinicId]);

    useEffect(() => {
        if (!clinicId) return;
        api.messageTemplates.getAll(clinicId).then(setTemplates).catch(() => { });
        api.automationRules.getAll(clinicId).then(setRules).catch(() => { });
        api.automationTriggers.getAll().then(setTriggerDefs).catch(() => { });
        api.messages.segmentFields(clinicId).then(setSegmentFields).catch(() => { });
        loadSmsStatus();
        loadLogs('all');
        // Sahifa qayta ochilganda fonda ketayotgan yuborish bo'lsa — ulanib olamiz
        api.messages.bulkStatus(clinicId).then(s => { if (s.active && !s.done) setBulkJob(s); }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clinicId]);

    /* Sozlamalardan QAYTGANDA Eskiz holati yangilansin (login endi kiritilgan
       bo'lishi mumkin). Faqat shu o'tishda — har tab almashganda Eskiz'ga
       balans so'rovi ketmasin. */
    const prevTab = useRef(activeTab);
    useEffect(() => {
        if (prevTab.current === 'settings' && activeTab !== 'settings') loadSmsStatus();
        prevTab.current = activeTab;
    }, [activeTab, loadSmsStatus]);

    // Yuborish serverda fonda ketadi (yuzlab SMS bir HTTP so'roviga sig'maydi)
    useEffect(() => {
        if (!clinicId || !bulkJob || bulkJob.done) return;
        const timer = setInterval(() => {
            api.messages.bulkStatus(clinicId).then(status => {
                if (!status.active) { setBulkJob(null); return; }
                setBulkJob(status);
                if (status.done) {
                    loadLogs();
                    if (status.error) {
                        addToast('error', status.error);
                    } else if ((status.failed || 0) > 0) {
                        addToast('info', fill(t('messagesmanagement.yuborildi_x_ta_xato'), status.sent, status.failed));
                    } else {
                        addToast('success', fill(t('messagesmanagement.x_ta_xabar_muvaffaqiyatli'), status.sent));
                    }
                }
            }).catch(() => { });
        }, 3000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clinicId, bulkJob]);

    const telegramConnected = !!currentClinic?.botToken;
    const bulkRunning = !!bulkJob && !bulkJob.done;

    // ── Tarix: tanlash va qayta yuborish ──
    const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
    const [retrying, setRetrying] = useState(false);

    const changeHistoryFilter = (filter: HistoryFilter) => {
        setHistoryFilter(filter);
        loadLogs(filter);
    };

    const toggleLogSelection = (id: string) => setSelectedLogIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // Xatolar limitdan tashqarida bo'lishi mumkin — avval «Xato» filtriga
    // o'tib, serverdan to'liq ro'yxatni olib, keyin tanlaymiz.
    const selectAllFailed = async () => {
        const failed = historyFilter === 'failed' ? logs : await (async () => {
            setHistoryFilter('failed');
            return loadLogs('failed');
        })();
        setSelectedLogIds(new Set(failed.filter(l => l.status === 'Failed').map(l => l.id)));
    };

    const handleRetry = async () => {
        const ids = Array.from(selectedLogIds);
        if (ids.length === 0) return;
        setRetrying(true);
        try {
            const result = await api.messages.retry(clinicId, ids);
            const skippedNote = result.skipped > 0 ? fill(t('messagesmanagement.x_ta_qayta_yuborib'), result.skipped) : '';
            addToast(result.success > 0 ? 'success' : 'info', fill(t('messagesmanagement.qayta_yuborildi_x_ta'), result.success, result.failed, skippedNote));
            setSelectedLogIds(new Set());
            loadLogs();
        } catch (e: any) {
            addToast('error', e.message || t('messagesmanagement.qayta_yuborishda_xatolik'));
        } finally {
            setRetrying(false);
        }
    };

    const TABS: { id: TabId; label: string; icon: LucideIcon; badge?: number }[] = [
        { id: 'auto', label: t('messagesmanagement.avtomatik'), icon: Zap },
        { id: 'manual', label: t('ui.qolda'), icon: Megaphone },
        { id: 'history', label: t('messagesmanagement.tarix'), icon: History, badge: logStats.failed },
        { id: 'templates', label: t('messagesmanagement.shablonlar'), icon: FileText },
        /* KANAL SOZLAMASI SHU YERDA. Ilgari u Sozlamalar → Integratsiyalar
           da turardi: shablon yozayotgan odam xabar qaysi yo'l bilan
           ketishini bilish uchun boshqa bo'limga borishi kerak edi. */
        { id: 'settings', label: t('nav.settings'), icon: SettingsIcon },
    ];

    const show = (id: TabId) => visited.has(id);

    return (
        <div className="space-y-4 animate-fade-in">
            <h1 className="sr-only">{t('nav.messages')}</h1>

            {/* Tablar + kanal holati */}
            <div className="flex flex-wrap items-center gap-3">
                <div role="group" aria-label={t('nav.messages')} className="flex items-center bg-elevated/70 rounded-xl p-1 gap-0.5 overflow-x-auto max-w-full">
                    {TABS.map(tab => {
                        const on = activeTab === tab.id;
                        return (
                            <button key={tab.id} type="button" aria-pressed={on} onClick={() => setActiveTab(tab.id)}
                                className={`h-9 px-3.5 inline-flex items-center gap-2 rounded-lg text-sm whitespace-nowrap transition-colors ${on
                                    ? 'bg-surface shadow-sm text-ink font-semibold'
                                    : 'text-muted hover:text-ink font-medium'}`}>
                                <tab.icon className={`w-4 h-4 ${on ? 'text-primary-600 dark:text-primary-400' : ''}`} aria-hidden="true" />
                                {tab.label}
                                {!!tab.badge && tab.badge > 0 && (
                                    <>
                                        <span aria-hidden="true" className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-danger-500 text-white text-[11px] font-semibold leading-5 text-center tabular-nums">
                                            {tab.badge}
                                        </span>
                                        <span className="sr-only">, {fill(t('msg.history.failedN'), tab.badge)}</span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <ChannelStatus label="Telegram" on={telegramConnected} onClick={() => setActiveTab('settings')} />
                    <ChannelStatus label="SMS" on={smsConnected}
                        extra={smsConnected && smsBalance !== null ? formatMoney(smsBalance) : undefined}
                        onClick={() => setActiveTab('settings')} />
                </div>
            </div>

            {show('auto') && (
                <div hidden={activeTab !== 'auto'}>
                    <RulesTab clinicId={clinicId} rules={rules} setRules={setRules} templates={templates}
                        triggerDefs={triggerDefs} segmentFields={segmentFields} doctors={doctors} addToast={addToast}
                        onCreateTemplate={() => { setActiveTab('templates'); setNewTemplateSignal(n => n + 1); }} />
                </div>
            )}

            {show('manual') && (
                <div hidden={activeTab !== 'manual'}>
                    <ManualTab clinicId={clinicId} active={activeTab === 'manual'} currentClinic={currentClinic} initialSegment={presetSegment}
                        doctors={doctors} templates={templates} segmentFields={segmentFields}
                        smsConnected={smsConnected} telegramConnected={telegramConnected} smsBalance={smsBalance}
                        bulkRunning={bulkRunning} addToast={addToast}
                        onOpenSettings={() => setActiveTab('settings')}
                        onBulkStarted={total => {
                            setBulkJob({ active: true, total, sent: 0, failed: 0, done: false });
                            setActiveTab('history');
                        }} />
                </div>
            )}

            {show('history') && (
                <div hidden={activeTab !== 'history'}>
                    <HistoryTab logs={logs} stats={logStats} filter={historyFilter} onFilter={changeHistoryFilter}
                        loading={logsLoading} onReload={() => loadLogs()}
                        selectedIds={selectedLogIds} onToggleSelect={toggleLogSelection}
                        onSelectAllFailed={selectAllFailed} onClearSelection={() => setSelectedLogIds(new Set())}
                        onRetry={handleRetry} retrying={retrying}
                        bulkJob={bulkJob} onDismissBulk={() => setBulkJob(null)} />
                </div>
            )}

            {show('templates') && (
                <div hidden={activeTab !== 'templates'}>
                    <TemplatesTab clinicId={clinicId} templates={templates} setTemplates={setTemplates} rules={rules}
                        smsConnected={smsConnected} openNewSignal={newTemplateSignal} addToast={addToast} />
                </div>
            )}

            {show('settings') && (
                <div hidden={activeTab !== 'settings'}>
                    <MessageChannelSettings clinicId={clinicId} currentClinic={currentClinic}
                        telegramConnected={telegramConnected} onClinicUpdated={onClinicUpdated} />
                </div>
            )}
        </div>
    );
};

/** Kanal holati — yashil nuqta «ulangan», kulrang «ulanmagan». Rang
 *  yolg'iz emas: so'z ham yoziladi (ekran o'quvchi va rang ko'rmaydiganlar). */
const ChannelStatus: React.FC<{ label: string; on: boolean; extra?: string; onClick: () => void }> = ({ label, on, extra, onClick }) => {
    const { t } = useLanguage();
    const state = on ? t('msg.connected') : t('msg.notConnected');
    return (
        <button type="button" onClick={onClick} title={`${label}: ${state}`}
            className="h-9 px-3 inline-flex items-center gap-2 rounded-xl border border-line bg-surface text-sm hover:bg-elevated transition-colors">
            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${on ? 'bg-success-500' : 'bg-faint/60'}`} />
            <span className="font-medium text-ink">{label}</span>
            <span className={on ? 'text-muted' : 'text-faint'}>{state}{extra ? ` · ${extra}` : ''}</span>
        </button>
    );
};
