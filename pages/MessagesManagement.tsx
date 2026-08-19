import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button } from '../components/Common';
import { Patient, Doctor, Transaction, Clinic, MessageTemplate, AutomationRule, MessageLog, MessageChannel, AutomationTrigger, BulkSendStatus, TriggerDescriptor, AudienceSegment, AudiencePreview, SegmentFieldDescriptor, SavedSegment, RuleSchedule } from '../types';
import { SegmentBuilder } from '../components/SegmentBuilder';
import { api } from '../services/api';
import { analyzeSms, hasTypographicApostrophe, fixApostrophes } from '../utils/sms';
import { processTemplate } from '../utils/messageTemplate';
import {
    MessageSquare, Clock, Send, CalendarDays, Plus, X, Pencil, Trash2,
    AlertTriangle, Eye, Users, RefreshCw, CheckCircle2, XCircle, Smartphone
} from 'lucide-react';

interface MessagesManagementProps {
    clinicId: string;
    currentClinic?: Clinic;
    // Bemorlar va tranzaksiyalar bu yerga uzatilmaydi: auditoriyani va qarzni
    // server hisoblaydi (backend/segments.ts), aks holda ta'riflar ikkiga bo'linadi.
    doctors: Doctor[];
    addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

// Shablon o'zgaruvchilari (backend processTemplate bilan mos)
const TEMPLATE_VARS: { token: string; label: string }[] = [
    { token: '{bemor_ismi}', label: '+ Bemor ismi' },
    { token: '{bemor_familyasi}', label: '+ Familya' },
    { token: '{sana}', label: '+ Sana' },
    { token: '{vaqt}', label: '+ Vaqt' },
    { token: '{klinika_nomi}', label: '+ Klinika nomi' },
    { token: '{shifokor_ismi}', label: '+ Shifokor ismi' },
    { token: '{qarz}', label: '+ Qarz miqdori' },
];

// Trigger ro'yxati backenddan keladi (backend/triggers.ts) — bu yerda faqat
// belgichalar. Yangi trigger qo'shilsa, forma o'zi yangilanadi.
const TRIGGER_ICONS: Record<string, string> = {
    before_appointment: '⏰',
    birthday: '🎂',
    no_show: '❗',
    after_appointment: '💬',
    new_patient: '👋',
    payment_received: '💰',
    recall: '🔄',
    debt_reminder: '📄',
};

const triggerIcon = (id: string) => TRIGGER_ICONS[id] || '⚙️';

const offsetUnitLabel = (unit: 'hour' | 'day' | 'month') =>
    unit === 'hour' ? 'soat' : unit === 'day' ? 'kun' : 'oy';

const CHANNEL_OPTIONS: { value: MessageChannel; label: string; hint: string }[] = [
    { value: 'telegram_first', label: '✈️→📱 Avval Telegram', hint: 'Bemor botga ulangan bo\'lsa — bepul Telegram. Ulanmagan yoki xato bo\'lsa — SMS. Eng tejamli variant.' },
    { value: 'telegram', label: '✈️ Telegram', hint: 'Faqat Telegram. Botga ulanmagan bemorlarga xabar bormaydi.' },
    { value: 'sms', label: '📱 SMS', hint: 'Faqat SMS. Har bir xabar uchun pul yechiladi.' },
    { value: 'both', label: '⚠️ Ikkalasi', hint: 'Telegram VA SMS — ikkalasi ham yuboriladi. Botga ulangan bemor ikki marta xabar oladi va SMS uchun baribir pul ketadi.' },
];

// Auditoriya filtrlari SegmentBuilder komponentida, hisoblash esa serverda —
// bu yerda takrorlanmaydi.

const SOURCE_LABELS: Record<string, string> = {
    manual: "Qo'lda yuborildi",
    bulk: "Qo'lda yuborildi",
    auto: 'Avtomatik',
    scheduled: 'Jadval bo\'yicha',
    before_appointment: 'Qabuldan oldin',
    after_appointment: 'Qabuldan keyin',
    new_patient: 'Yangi bemor',
    payment_received: "To'lov",
    recall: 'Profilaktika',
    debt_reminder: 'Qarz eslatma',
    debt: 'Qarz eslatma',
    birthday: "Tug'ilgan kun",
    noshow: 'Kelmagan bemor',
    no_show: 'Kelmagan bemor',
    test: 'Test',
    retry: 'Qayta yuborish',
};

const inputCls = "w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white placeholder-gray-400";
const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

// Eskiz'dan qaytgan xom holat matnini o'qiladigan yorliq + rangga aylantiradi.
// Aniq enum kafolatlanmagani uchun kalit so'zlarga qarab taxminiy rang beriladi.
function eskizStatusBadge(status?: string | null): { label: string; cls: string } | null {
    if (!status) return null;
    const s = status.toLowerCase();
    if (s === 'error') return { label: 'Yuborishda xatolik', cls: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' };
    if (s === 'not_found') return { label: 'Eskiz\'da topilmadi', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
    if (/(declin|reject|rad)/.test(s)) return { label: `Rad etildi (${status})`, cls: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' };
    if (/(confirm|approv|activ|tasdiq)/.test(s)) return { label: `Tasdiqlandi (${status})`, cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' };
    return { label: `Moderatsiyada (${status})`, cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' };
}

/**
 * Eski formatdagi segmentni shartlar ro'yxatiga aylantiradi.
 * Server ham xuddi shunday qiladi (backend/segments.ts normalizeSegment) —
 * bu yerda faqat forma to'g'ri ko'rinishi uchun kerak.
 */
function toConditionSegment(seg?: AudienceSegment | null): AudienceSegment {
    if (seg && Array.isArray(seg.conditions)) return seg;

    const conditions: AudienceSegment['conditions'] = [];
    if (!seg || seg.status !== 'All') conditions.push({ field: 'status', op: 'eq', value: 'Active' });
    if (seg?.doctorId) conditions.push({ field: 'doctorId', op: 'eq', value: seg.doctorId });
    if (seg?.inactiveMonths) {
        conditions.push({
            field: 'lastVisit',
            op: seg.includeNeverVisited ? 'before_or_never' : 'before',
            value: seg.inactiveMonths,
        });
    }
    if (seg?.debtors) conditions.push({ field: 'hasDebt', op: 'is_true' });
    if (seg?.birthdayToday) conditions.push({ field: 'birthdayToday', op: 'is_true' });
    if (seg?.birthdayMonth) conditions.push({ field: 'birthdayMonth', op: 'eq', value: 'current' });

    return { match: 'all', conditions };
}

// Auditoriya hisobining bitta qatori — son qayerdan kelgani ko'rinib tursin
const FunnelRow: React.FC<{ label: string; value: number; diff?: number; isDeduction?: boolean }> = ({
    label, value, diff, isDeduction,
}) => (
    <div className="flex items-center justify-between px-4 py-2">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="flex items-center gap-2">
            {diff !== undefined && diff !== 0 && (
                <span className="text-xs text-gray-400">{diff > 0 ? `+${diff}` : diff}</span>
            )}
            <span className={`font-bold ${isDeduction ? 'text-amber-600' : 'text-gray-900 dark:text-white'}`}>
                {isDeduction ? value : `${value} ta`}
            </span>
        </span>
    </div>
);

export const MessagesManagement: React.FC<MessagesManagementProps> = ({
    clinicId, currentClinic, doctors, addToast
}) => {
    const [activeTab, setActiveTab] = useState<'templates' | 'auto' | 'manual' | 'history'>('templates');

    // ── Ma'lumotlar ──
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [triggerDefs, setTriggerDefs] = useState<TriggerDescriptor[]>([]);
    const [logs, setLogs] = useState<MessageLog[]>([]);
    const [logStats, setLogStats] = useState({ total: 0, sent: 0, failed: 0 });
    const [smsConnected, setSmsConnected] = useState(false);
    // Balansni aynan pul sarflanadigan joyda ko'rsatamiz (ilgari faqat Sozlamalarda edi)
    const [smsBalance, setSmsBalance] = useState<number | null>(null);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');
    const [logsLoading, setLogsLoading] = useState(false);

    // Filtr serverda qo'llanadi: aks holda limitdan tashqarida qolgan xatolar
    // ro'yxatda ko'rinmay, yuqoridagi hisoblagich bilan ziddiyat hosil qilardi.
    const loadLogs = useCallback(async (filter: 'all' | 'sent' | 'failed' = historyFilter): Promise<MessageLog[]> => {
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

    useEffect(() => {
        if (!clinicId) return;
        api.messageTemplates.getAll(clinicId).then(setTemplates).catch(() => { });
        api.automationRules.getAll(clinicId).then(setRules).catch(() => { });
        api.automationTriggers.getAll().then(setTriggerDefs).catch(() => { });
        api.messages.segmentFields(clinicId).then(setSegmentFields).catch(() => { });
        api.messages.savedSegments(clinicId).then(setSavedSegments).catch(() => { });
        api.sms.getSettings(clinicId).then((s: any) => {
            setSmsConnected(!!s.isConnected);
            if (s.isConnected) {
                api.sms.getBalance(clinicId)
                    .then((b: any) => setSmsBalance(typeof b?.balance === 'number' ? b.balance : null))
                    .catch(() => { });
            }
        }).catch(() => { });
        api.messages.getSettings(clinicId).then(s => setCooldownDays(s.cooldownDays || 0)).catch(() => { });
        loadLogs('all');
        // Sahifa qayta ochilganda fonda ketayotgan yuborish bo'lsa — ulanib olamiz
        api.messages.bulkStatus(clinicId).then(s => { if (s.active && !s.done) setBulkJob(s); }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clinicId]);

    const changeHistoryFilter = (filter: 'all' | 'sent' | 'failed') => {
        setHistoryFilter(filter);
        loadLogs(filter);
    };

    const telegramConnected = !!currentClinic?.botToken;

    // ── Shablonlar tab ──
    const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
    const [templateForm, setTemplateForm] = useState({ name: '', text: '' });
    const [templateSaving, setTemplateSaving] = useState(false);

    const openTemplateForm = (tpl?: MessageTemplate) => {
        setEditingTemplate(tpl || null);
        setTemplateForm({ name: tpl?.name || '', text: tpl?.text || '' });
        setIsTemplateFormOpen(true);
    };

    const handleSaveTemplate = async () => {
        if (!templateForm.name.trim() || !templateForm.text.trim()) return;
        setTemplateSaving(true);
        try {
            if (editingTemplate) {
                const updated = await api.messageTemplates.update(editingTemplate.id, templateForm);
                setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? updated : t));
                addToast('success', 'Shablon yangilandi.');
            } else {
                const created = await api.messageTemplates.create({ ...templateForm, clinicId });
                setTemplates(prev => [created, ...prev]);
                addToast('success', "Shablon qo'shildi.");
            }
            setIsTemplateFormOpen(false);
            setEditingTemplate(null);
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        } finally {
            setTemplateSaving(false);
        }
    };

    const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
    const handleSyncEskizStatus = async (tpl: MessageTemplate) => {
        setSyncingTemplateId(tpl.id);
        try {
            const updated = await api.messageTemplates.syncEskizStatus(tpl.id);
            setTemplates(prev => prev.map(t => t.id === tpl.id ? updated : t));
        } catch (e: any) {
            addToast('error', e.message || 'Holatni tekshirishda xatolik');
        } finally {
            setSyncingTemplateId(null);
        }
    };

    const handleDeleteTemplate = async (tpl: MessageTemplate) => {
        if (!confirm(`"${tpl.name}" shablonini o'chirishni tasdiqlaysizmi?`)) return;
        try {
            await api.messageTemplates.delete(tpl.id);
            setTemplates(prev => prev.filter(t => t.id !== tpl.id));
            addToast('info', "Shablon o'chirildi.");
        } catch (e: any) {
            addToast('error', e.message || "Shablon avtomatik qoidada ishlatilmoqda bo'lishi mumkin");
        }
    };

    // ── Avtomatik tab ──
    const EMPTY_RULE_FORM = {
        name: '',
        templateId: '',
        trigger: 'before_appointment' as AutomationTrigger,
        hoursBefore: 2,
        channel: 'telegram_first' as MessageChannel,
        doctorId: '',
        segment: { match: 'all', conditions: [{ field: 'status', op: 'eq', value: 'Active' }] } as AudienceSegment,
        schedule: { kind: 'weekly', weekday: 1, hour: 10 } as RuleSchedule,
    };
    const [isRuleFormOpen, setIsRuleFormOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
    const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);
    const [ruleSaving, setRuleSaving] = useState(false);
    const activeTriggerDef = triggerDefs.find(t => t.id === ruleForm.trigger);

    const openRuleForm = (rule?: AutomationRule) => {
        setEditingRule(rule || null);
        setRuleForm(rule ? {
            name: rule.name,
            templateId: rule.templateId,
            trigger: rule.trigger,
            hoursBefore: rule.hoursBefore || 2,
            channel: rule.channel,
            doctorId: rule.doctorId || '',
            // Eski formatda saqlangan qoidalar shartlarga aylantiriladi
            segment: toConditionSegment(rule.segment),
            schedule: rule.schedule || { kind: 'weekly', weekday: 1, hour: 10 },
        } : EMPTY_RULE_FORM);
        setIsRuleFormOpen(true);
    };

    const closeRuleForm = () => {
        setIsRuleFormOpen(false);
        setEditingRule(null);
        setRuleForm(EMPTY_RULE_FORM);
    };

    const handleSaveRule = async () => {
        if (!ruleForm.name.trim() || !ruleForm.templateId) return;
        setRuleSaving(true);
        const payload = {
            name: ruleForm.name,
            templateId: ruleForm.templateId,
            trigger: ruleForm.trigger,
            hoursBefore: ruleForm.trigger === 'before_appointment' ? ruleForm.hoursBefore : null,
            channel: ruleForm.channel,
            doctorId: ruleForm.doctorId || null,
            // Faqat qo'llab-quvvatlaydigan triggerlar uchun yuboriladi
            segment: activeTriggerDef?.supportsSegment ? ruleForm.segment : null,
            schedule: activeTriggerDef?.supportsSchedule ? ruleForm.schedule : null,
        };
        try {
            if (editingRule) {
                const updated = await api.automationRules.update(editingRule.id, payload);
                setRules(prev => prev.map(r => r.id === editingRule.id ? updated : r));
                addToast('success', 'Qoida yangilandi.');
            } else {
                const created = await api.automationRules.create({ ...payload, active: true, clinicId });
                setRules(prev => [created, ...prev]);
                addToast('success', "Qoida qo'shildi.");
            }
            closeRuleForm();
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        } finally {
            setRuleSaving(false);
        }
    };

    const handleToggleRule = async (rule: AutomationRule) => {
        try {
            const updated = await api.automationRules.update(rule.id, { active: !rule.active });
            setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        }
    };

    const handleDeleteRule = async (rule: AutomationRule) => {
        if (!confirm(`"${rule.name}" qoidasini o'chirishni tasdiqlaysizmi?`)) return;
        try {
            await api.automationRules.delete(rule.id);
            setRules(prev => prev.filter(r => r.id !== rule.id));
            addToast('info', "Qoida o'chirildi.");
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik yuz berdi');
        }
    };

    // ── Qo'lda tab ──
    const [manualChannel, setManualChannel] = useState<'sms' | 'telegram' | 'telegram_first'>('telegram_first');
    // Auditoriyani SERVER hisoblaydi (backend/segments.ts). Frontend faqat
    // filtrni yig'adi — shu sabab "qarzdor" ta'rifi va {qarz} summasi qo'lda
    // yuborishda ham, avtomatikada ham bir xil bo'ladi.
    const [segment, setSegment] = useState<AudienceSegment>({
        match: 'all',
        conditions: [{ field: 'status', op: 'eq', value: 'Active' }],
    });
    const [segmentFields, setSegmentFields] = useState<SegmentFieldDescriptor[]>([]);
    const [savedSegments, setSavedSegments] = useState<SavedSegment[]>([]);
    // Ro'yxatdan qo'lda chiqarilgan bemorlar — yuborishdan oldin belgisi olinganlar
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const [showRecipients, setShowRecipients] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState('');
    const [audience, setAudience] = useState<AudiencePreview | null>(null);
    const [audienceLoading, setAudienceLoading] = useState(false);
    const [showUnreachable, setShowUnreachable] = useState(false);
    const [manualMessage, setManualMessage] = useState('');
    const [manualSending, setManualSending] = useState(false);

    // Filtr yoki kanal o'zgarganda qayta hisoblanadi (har bosishda so'rov ketmasin)
    useEffect(() => {
        if (!clinicId || activeTab !== 'manual') return;
        setAudienceLoading(true);
        const timer = setTimeout(() => {
            api.messages.audience(clinicId, segment, manualChannel)
                .then(setAudience)
                .catch(() => setAudience(null))
                .finally(() => setAudienceLoading(false));
        }, 350);
        return () => clearTimeout(timer);
    }, [clinicId, activeTab, segment, manualChannel]);

    // Segment o'zgarsa qo'lda chiqarilganlar ro'yxati ham eskiradi
    useEffect(() => { setExcludedIds(new Set()); }, [segment, manualChannel]);

    const allRecipients = audience?.recipients ?? [];
    const recipientIds = (audience?.patientIds ?? []).filter(id => !excludedIds.has(id));
    const recipientCount = recipientIds.length;
    const recipientSample = audience?.sample ?? [];
    const unreachableCount = audience?.unreachable ?? 0;

    // Qo'lda chiqarilganlarni hisobga olib qayta sanaymiz
    const { viaTelegram, viaSms } = useMemo(() => {
        if (allRecipients.length === 0) {
            return { viaTelegram: audience?.viaTelegram ?? 0, viaSms: audience?.viaSms ?? 0 };
        }
        const kept = allRecipients.filter(r => !excludedIds.has(r.id));
        const tg = kept.filter(r => r.channel === 'telegram').length;
        return { viaTelegram: tg, viaSms: kept.length - tg };
    }, [allRecipients, excludedIds, audience]);

    const visibleRecipients = useMemo(() => {
        const q = recipientSearch.trim().toLowerCase();
        if (!q) return allRecipients;
        return allRecipients.filter(r =>
            `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q)
        );
    }, [allRecipients, recipientSearch]);

    const toggleExcluded = (id: string) => {
        setExcludedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // ── Segmentni saqlash ──
    const handleSaveSegment = async () => {
        const name = prompt('Segment nomi (masalan: "8 mart — ayollar"):');
        if (!name || !name.trim()) return;
        try {
            const saved = await api.messages.saveSegment(clinicId, name.trim(), segment);
            setSavedSegments(prev => [saved, ...prev.filter(s => s.id !== saved.id)]);
            addToast('success', `"${saved.name}" saqlandi.`);
        } catch (e: any) {
            addToast('error', e.message || 'Saqlashda xatolik');
        }
    };

    const handleDeleteSegment = async (s: SavedSegment) => {
        if (!confirm(`"${s.name}" segmentini o'chirishni tasdiqlaysizmi?`)) return;
        try {
            await api.messages.deleteSegment(clinicId, s.id);
            setSavedSegments(prev => prev.filter(x => x.id !== s.id));
        } catch (e: any) {
            addToast('error', e.message || 'Xatolik');
        }
    };

    // Xabar matnini shaxsiylashtirilgandan keyingi eng yomon holat bo'yicha o'lchaymiz:
    // {bemor_ismi} o'rniga eng uzun ism qo'yilsa, SMS qismlari soni oshib ketishi mumkin.
    const smsInfo = useMemo(() => {
        const longest = (vals: (string | undefined)[]) =>
            vals.reduce<string>((a, b) => ((b || '').length > a.length ? (b || '') : a), '');
        const sample = manualMessage
            .split('{bemor_ismi}').join(longest(recipientSample.map(r => r.firstName)))
            .split('{bemor_familyasi}').join(longest(recipientSample.map(r => r.lastName)))
            .split('{klinika_nomi}').join(currentClinic?.name || '')
            .split('{sana}').join('2026-08-20')
            .split('{vaqt}').join('14:30')
            .split('{shifokor_ismi}').join(longest(doctors.map(d => `${d.firstName} ${d.lastName}`)))
            .split('{qarz}').join('1 500 000');
        return analyzeSms(sample);
    }, [manualMessage, recipientSample, doctors, currentClinic]);

    const totalSmsParts = smsInfo.parts * viaSms;
    const messageHasBadApostrophe = hasTypographicApostrophe(manualMessage);

    // ── Preview: bemor aynan nimani ko'radi ──
    const [previewIndex, setPreviewIndex] = useState(0);
    const previewPatient = recipientSample.length > 0 ? recipientSample[previewIndex % recipientSample.length] : null;
    const previewText = useMemo(() => {
        if (!previewPatient) return '';
        return processTemplate(manualMessage, {
            patientName: `${previewPatient.firstName} ${previewPatient.lastName}`,
            firstName: previewPatient.firstName,
            lastName: previewPatient.lastName,
            date: new Date().toISOString().split('T')[0],
            time: '',
            clinicName: currentClinic?.name || '',
            doctorName: '',
            amount: 0,
        });
    }, [manualMessage, previewPatient, currentClinic]);

    // ── Test yuborish ──
    const [testOpen, setTestOpen] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [testSending, setTestSending] = useState(false);

    const handleTestSend = async () => {
        if (!manualMessage.trim()) return;
        const testChannel: 'sms' | 'telegram' = manualChannel === 'telegram' ? 'telegram' : 'sms';
        if (testChannel === 'sms' && !testPhone.trim()) {
            addToast('error', 'Test uchun telefon raqamini kiriting');
            return;
        }
        setTestSending(true);
        try {
            await api.messages.testSend(clinicId, manualMessage, testChannel, testPhone.trim(), previewPatient?.id);
            addToast('success', testChannel === 'telegram'
                ? 'Test xabar klinika Telegramiga yuborildi.'
                : `Test SMS ${testPhone} raqamiga yuborildi.`);
        } catch (e: any) {
            addToast('error', e.message || 'Test yuborishda xatolik');
        } finally {
            setTestSending(false);
        }
    };

    // ── Chastota chegarasi ──
    const [cooldownDays, setCooldownDays] = useState(0);
    const [cooldownSaving, setCooldownSaving] = useState(false);
    const [ignoreCooldown, setIgnoreCooldown] = useState(false);

    const saveCooldown = async (days: number) => {
        setCooldownDays(days);
        setCooldownSaving(true);
        try {
            await api.messages.saveSettings(clinicId, days);
            addToast('success', days === 0 ? "Chastota chegarasi o'chirildi." : `Chegara: ${days} kunda bir marta.`);
        } catch (e: any) {
            addToast('error', e.message || 'Saqlashda xatolik');
        } finally {
            setCooldownSaving(false);
        }
    };

    // Yuborish serverda fonda ketadi (yuzlab SMS bir HTTP so'roviga sig'maydi).
    const [bulkJob, setBulkJob] = useState<BulkSendStatus | null>(null);

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
                        addToast('info', `Yuborildi: ${status.sent} ta, xato: ${status.failed} ta.`);
                    } else {
                        addToast('success', `${status.sent} ta xabar muvaffaqiyatli yuborildi!`);
                    }
                }
            }).catch(() => { });
        }, 3000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clinicId, bulkJob]);

    const handleManualSend = async () => {
        if (!manualMessage.trim() || recipientCount === 0) return;
        const costNote = viaSms > 0
            ? `\n\n✈️ Telegram: ${viaTelegram} ta (bepul)\n📱 SMS: ${viaSms} ta × ${smsInfo.parts} qism = ${totalSmsParts} SMS (pullik)`
            : `\n\nHammasi Telegram orqali — bepul.`;
        if (!confirm(`${recipientCount} ta bemorga xabar yuborilsinmi?${costNote}`)) return;
        setManualSending(true);
        try {
            const result = await api.messages.sendBulk(clinicId, recipientIds, manualMessage, manualChannel, ignoreCooldown);
            addToast('info', `${result.total} ta bemorga yuborish boshlandi. Jarayonni Tarix bo'limida kuzating.`);
            setBulkJob({ active: true, total: result.total, sent: 0, failed: 0, done: false });
            setManualMessage('');
            setActiveTab('history');
        } catch (e: any) {
            addToast('error', e.message || 'Yuborishda xatolik yuz berdi');
        } finally {
            setManualSending(false);
        }
    };

    // ── Tarix tab ──
    const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
    const [retrying, setRetrying] = useState(false);

    const loadedFailedIds = useMemo(
        () => logs.filter(l => l.status === 'Failed').map(l => l.id),
        [logs]
    );

    const toggleLogSelection = (id: string) => {
        setSelectedLogIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Xatolar limitdan tashqarida bo'lishi mumkin — avval "Xato" filtriga o'tib,
    // serverdan to'liq ro'yxatni olib, keyin tanlaymiz.
    const selectAllFailed = async () => {
        if (historyFilter === 'failed') {
            setSelectedLogIds(new Set(loadedFailedIds));
            return;
        }
        setHistoryFilter('failed');
        const failed = await loadLogs('failed');
        setSelectedLogIds(new Set(failed.filter(l => l.status === 'Failed').map(l => l.id)));
    };

    const handleRetry = async (ids: string[]) => {
        if (ids.length === 0) return;
        setRetrying(true);
        try {
            const result = await api.messages.retry(clinicId, ids);
            const skippedNote = result.skipped > 0 ? `, ${result.skipped} ta qayta yuborib bo'lmadi` : '';
            addToast(result.success > 0 ? 'success' : 'info', `Qayta yuborildi: ${result.success} ta muvaffaqiyatli, ${result.failed} ta xato${skippedNote}.`);
            setSelectedLogIds(new Set());
            loadLogs();
        } catch (e: any) {
            addToast('error', e.message || 'Qayta yuborishda xatolik');
        } finally {
            setRetrying(false);
        }
    };

    const bulkRunning = !!bulkJob && !bulkJob.done;

    const formatLogDate = (iso: string) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    // O'zgaruvchi tugmalari (shablon va qo'lda xabar uchun)
    const VarButtons: React.FC<{ onInsert: (token: string) => void }> = ({ onInsert }) => (
        <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARS.map(v => (
                <button
                    key={v.token}
                    type="button"
                    onClick={() => onInsert(v.token)}
                    className="px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                >
                    {v.label}
                </button>
            ))}
        </div>
    );

    const TABS = [
        { id: 'templates' as const, label: 'Shablonlar', icon: MessageSquare },
        { id: 'auto' as const, label: 'Avtomatik', icon: Clock },
        { id: 'manual' as const, label: "Qo'lda", icon: Send },
        { id: 'history' as const, label: 'Tarix', icon: CalendarDays },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Xabarlar</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Avtomatik va qo'lda SMS/Telegram xabar yuborish boshqaruvi</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-4 gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id
                            ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* ═══ SHABLONLAR ═══ */}
            {activeTab === 'templates' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-1.5">
                            {TEMPLATE_VARS.map(v => (
                                <span key={v.token} className="px-2 py-0.5 text-xs font-mono text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-md bg-white dark:bg-gray-800">
                                    {v.token}
                                </span>
                            ))}
                        </div>
                        <Button onClick={() => openTemplateForm()}>
                            <Plus className="w-4 h-4 mr-1" /> Yangi shablon
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 px-4 py-2.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 rounded-xl text-xs text-primary-700 dark:text-primary-400">
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        <span>Eskiz SMS ulangan bo'lsa, shablon saqlangach fonda Eskiz moderatsiyasiga yuboriladi (o'zgaruvchilar Eskiz talab qilgan <code className="font-mono">%w</code> ko'rinishiga aylantiriladi). Holatini "🔄" tugmasi bilan yangilab turing.</span>
                    </div>

                    {isTemplateFormOpen && (
                        <Card className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {editingTemplate ? 'Shablonni tahrirlash' : 'Yangi shablon'}
                                </h3>
                                <button onClick={() => { setIsTemplateFormOpen(false); setEditingTemplate(null); }} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="Shablon nomi"
                                value={templateForm.name}
                                onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                                className={inputCls}
                            />
                            <textarea
                                placeholder="Xabar matni. Masalan: Hurmatli {bemor_ismi}, qabulingiz {sana} kuni {vaqt} da."
                                value={templateForm.text}
                                onChange={e => setTemplateForm(f => ({ ...f, text: e.target.value }))}
                                rows={4}
                                className={inputCls}
                            />
                            <VarButtons onInsert={token => setTemplateForm(f => ({ ...f, text: f.text + token }))} />
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="secondary" onClick={() => { setIsTemplateFormOpen(false); setEditingTemplate(null); }}>Bekor</Button>
                                <Button onClick={handleSaveTemplate} disabled={templateSaving || !templateForm.name.trim() || !templateForm.text.trim()}>
                                    {templateSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                                </Button>
                            </div>
                        </Card>
                    )}

                    <div className="space-y-3">
                        {templates.map(tpl => {
                            const badge = eskizStatusBadge(tpl.eskizStatus);
                            return (
                                <Card key={tpl.id} className="p-5 flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="font-bold text-gray-900 dark:text-white">{tpl.name}</h4>
                                            {badge && (
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${badge.cls}`}>
                                                    {badge.label}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-wrap break-words">{tpl.text}</p>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        {smsConnected && (
                                            <button
                                                onClick={() => handleSyncEskizStatus(tpl)}
                                                disabled={syncingTemplateId === tpl.id}
                                                className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                                title={tpl.eskizStatus ? 'Eskiz holatini yangilash' : "Eskiz moderatsiyasiga yuborish"}
                                            >
                                                <RefreshCw className={`w-4 h-4 ${syncingTemplateId === tpl.id ? 'animate-spin' : ''}`} />
                                            </button>
                                        )}
                                        <button onClick={() => openTemplateForm(tpl)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors" title="Tahrirlash">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDeleteTemplate(tpl)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="O'chirish">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </Card>
                            );
                        })}
                        {templates.length === 0 && !isTemplateFormOpen && (
                            <Card className="p-10 text-center text-gray-500">
                                Hozircha shablonlar yo'q. "Yangi shablon" tugmasi bilan birinchisini yarating.
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ AVTOMATIK ═══ */}
            {activeTab === 'auto' && (
                <div className="space-y-4">
                    {/* Chastota chegarasi — bir bemorga N kunda bittadan ko'p xabar ketmasin */}
                    <Card className="p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h4 className="font-bold text-gray-900 dark:text-white text-sm">Chastota chegarasi</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Bitta bemorga shu muddat ichida bittadan ko'p xabar yuborilmaydi.
                                    Qabul eslatmalari bundan mustasno — ular baribir yetib boradi.
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                {[0, 1, 3, 7, 30].map(d => (
                                    <button
                                        key={d}
                                        disabled={cooldownSaving}
                                        onClick={() => saveCooldown(d)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${cooldownDays === d
                                            ? 'bg-primary-600 text-white'
                                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                    >
                                        {d === 0 ? "O'chiq" : `${d} kun`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </Card>

                    <div className="flex justify-end">
                        <Button onClick={() => openRuleForm()}>
                            <Plus className="w-4 h-4 mr-1" /> Yangi qoida
                        </Button>
                    </div>

                    {isRuleFormOpen && (
                        <Card className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {editingRule ? 'Qoidani tahrirlash' : 'Yangi qoida'}
                                </h3>
                                <button onClick={closeRuleForm} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            {templates.length === 0 && (
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                                    <span className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        Avval kamida bitta shablon yarating — qoida shablonsiz ishlamaydi.
                                    </span>
                                    <button
                                        onClick={() => { closeRuleForm(); setActiveTab('templates'); openTemplateForm(); }}
                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-all"
                                    >
                                        Shablon yaratish
                                    </button>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Qoida nomi</label>
                                    <input
                                        type="text"
                                        placeholder="Masalan: Qabuldan 2 soat oldin eslatma"
                                        value={ruleForm.name}
                                        onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Shablon</label>
                                    <select
                                        value={ruleForm.templateId}
                                        onChange={e => setRuleForm(f => ({ ...f, templateId: e.target.value }))}
                                        className={inputCls}
                                    >
                                        <option value="">— Shablon tanlang —</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Qachon yuborilsin</label>
                                    <select
                                        value={ruleForm.trigger}
                                        onChange={e => {
                                            const next = triggerDefs.find(t => t.id === e.target.value);
                                            setRuleForm(f => ({
                                                ...f,
                                                trigger: e.target.value,
                                                // Har trigger o'z offset shkalasiga ega — defaultga qaytaramiz
                                                hoursBefore: next?.offset?.default ?? 0,
                                                ...(next && !next.supportsDoctorFilter ? { doctorId: '' } : {}),
                                            }));
                                        }}
                                        className={inputCls}
                                    >
                                        {triggerDefs.map(t => (
                                            <option key={t.id} value={t.id}>{triggerIcon(t.id)} {t.label}</option>
                                        ))}
                                    </select>
                                </div>
                                {activeTriggerDef?.offset && (
                                    <div>
                                        <label className={labelCls}>{activeTriggerDef.offset.label}</label>
                                        <select
                                            value={ruleForm.hoursBefore}
                                            onChange={e => setRuleForm(f => ({ ...f, hoursBefore: parseInt(e.target.value) }))}
                                            className={inputCls}
                                        >
                                            {activeTriggerDef.offset.options.map(v => (
                                                <option key={v} value={v}>
                                                    {v === 0 ? 'Darhol' : `${v} ${offsetUnitLabel(activeTriggerDef.offset!.unit)}`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>Yuborish kanali</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {CHANNEL_OPTIONS.map(({ value, label, hint }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            title={hint}
                                            onClick={() => setRuleForm(f => ({ ...f, channel: value }))}
                                            className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-all ${ruleForm.channel === value
                                                ? 'bg-primary-600 text-white border-primary-600'
                                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-2">
                                    {CHANNEL_OPTIONS.find(c => c.value === ruleForm.channel)?.hint}
                                </p>
                            </div>
                            {activeTriggerDef?.supportsSchedule && (
                                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-3">
                                    <label className={labelCls}>Qachon yuborilsin</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <select
                                            value={ruleForm.schedule.kind}
                                            onChange={e => setRuleForm(f => ({ ...f, schedule: { ...f.schedule, kind: e.target.value as RuleSchedule['kind'] } }))}
                                            className={inputCls}
                                        >
                                            <option value="daily">Har kuni</option>
                                            <option value="weekly">Har hafta</option>
                                            <option value="monthly">Har oy</option>
                                        </select>
                                        {ruleForm.schedule.kind === 'weekly' && (
                                            <select
                                                value={ruleForm.schedule.weekday || 1}
                                                onChange={e => setRuleForm(f => ({ ...f, schedule: { ...f.schedule, weekday: parseInt(e.target.value) } }))}
                                                className={inputCls}
                                            >
                                                {['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'].map((d, i) => (
                                                    <option key={i} value={i + 1}>{d}</option>
                                                ))}
                                            </select>
                                        )}
                                        {ruleForm.schedule.kind === 'monthly' && (
                                            <select
                                                value={ruleForm.schedule.dayOfMonth || 1}
                                                onChange={e => setRuleForm(f => ({ ...f, schedule: { ...f.schedule, dayOfMonth: parseInt(e.target.value) } }))}
                                                className={inputCls}
                                            >
                                                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                    <option key={d} value={d}>{d}-kuni</option>
                                                ))}
                                            </select>
                                        )}
                                        <select
                                            value={ruleForm.schedule.hour}
                                            onChange={e => setRuleForm(f => ({ ...f, schedule: { ...f.schedule, hour: parseInt(e.target.value) } }))}
                                            className={inputCls}
                                        >
                                            {Array.from({ length: 13 }, (_, i) => i + 8).map(h => (
                                                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {activeTriggerDef?.supportsSegment && (
                                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-3">
                                    <label className={labelCls}>Kimga yuborilsin</label>
                                    <SegmentBuilder
                                        value={ruleForm.segment}
                                        onChange={next => setRuleForm(f => ({ ...f, segment: next }))}
                                        fields={segmentFields}
                                    />
                                </div>
                            )}

                            {activeTriggerDef?.supportsDoctorFilter !== false && (
                                <div>
                                    <label className={labelCls}>Shifokor filtri (ixtiyoriy)</label>
                                    <select
                                        value={ruleForm.doctorId}
                                        onChange={e => setRuleForm(f => ({ ...f, doctorId: e.target.value }))}
                                        className={inputCls}
                                    >
                                        <option value="">Barcha shifokorlar</option>
                                        {doctors.map(d => (
                                            <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {activeTriggerDef && (
                                <div className="text-xs text-gray-400 space-y-1">
                                    {activeTriggerDef.sendWindow && (
                                        <p>
                                            Yuborish vaqti: <strong>{activeTriggerDef.sendWindow.fromHour}:00 – {activeTriggerDef.sendWindow.toHour}:00</strong> oralig'ida
                                            (bemorlarga tunda xabar ketmaydi).
                                        </p>
                                    )}
                                    {!activeTriggerDef.respectCooldown && cooldownDays > 0 && (
                                        <p>Bu trigger transaksion hisoblanadi — chastota chegarasiga ({cooldownDays} kun) bo'ysunmaydi.</p>
                                    )}
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="secondary" onClick={closeRuleForm}>Bekor</Button>
                                <Button onClick={handleSaveRule} disabled={ruleSaving || !ruleForm.name.trim() || !ruleForm.templateId}>
                                    {ruleSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                                </Button>
                            </div>
                        </Card>
                    )}

                    <div className="space-y-3">
                        {rules.map(rule => {
                            const tpl = templates.find(t => t.id === rule.templateId);
                            const doctor = rule.doctorId ? doctors.find(d => d.id === rule.doctorId) : null;
                            const def = triggerDefs.find(t => t.id === rule.trigger);
                            return (
                                <Card key={rule.id} className={`p-5 flex items-center justify-between gap-4 ${!rule.active ? 'opacity-60' : ''}`}>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-gray-900 dark:text-white">{rule.name}</h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {triggerIcon(rule.trigger)} {def?.label || rule.trigger}
                                            {def?.offset && rule.hoursBefore != null
                                                ? ` · ${rule.hoursBefore === 0 ? 'darhol' : `${rule.hoursBefore} ${offsetUnitLabel(def.offset.unit)}`}`
                                                : ''}
                                            {' · '}{rule.channel === 'sms' ? 'SMS'
                                                : rule.channel === 'telegram' ? 'Telegram'
                                                    : rule.channel === 'telegram_first' ? 'Avval Telegram, keyin SMS'
                                                        : 'SMS + Telegram'}
                                            {tpl ? ` · Shablon: ${tpl.name}` : ''}
                                            {doctor ? ` · ${doctor.lastName} ${doctor.firstName}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleToggleRule(rule)}
                                            className={`relative w-11 h-6 rounded-full transition-colors ${rule.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                            title={rule.active ? "O'chirish" : 'Yoqish'}
                                        >
                                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${rule.active ? 'left-[22px]' : 'left-0.5'}`} />
                                        </button>
                                        <button onClick={() => openRuleForm(rule)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors" title="Tahrirlash">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDeleteRule(rule)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="O'chirish">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </Card>
                            );
                        })}
                        {rules.length === 0 && !isRuleFormOpen && (
                            <Card className="p-10 text-center text-gray-500">
                                Avtomatik qoidalar yo'q. "Yangi qoida" tugmasi bilan yarating — masalan, qabuldan 2 soat oldin eslatma.
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ QO'LDA ═══ */}
            {activeTab === 'manual' && (
                <div className="space-y-4">
                    {/* Kanal tanlash */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                            onClick={() => setManualChannel('telegram_first')}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border transition-all ${manualChannel === 'telegram_first'
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                        >
                            ✈️→📱 Avval Telegram
                        </button>
                        <button
                            onClick={() => setManualChannel('telegram')}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border transition-all ${manualChannel === 'telegram'
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                        >
                            ✈️ Telegram {!telegramConnected && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        </button>
                        <button
                            onClick={() => setManualChannel('sms')}
                            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border transition-all ${manualChannel === 'sms'
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                        >
                            <Smartphone className="w-4 h-4" /> Faqat SMS {!smsConnected && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        </button>
                    </div>
                    {manualChannel === 'telegram_first' && (
                        <p className="text-xs text-gray-400 px-1">
                            Botga ulangan bemorga bepul Telegram, qolganiga SMS ketadi — eng tejamli variant.
                        </p>
                    )}

                    {(manualChannel === 'sms' || manualChannel === 'telegram_first') && !smsConnected && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Eskiz SMS ulanmagan. <strong>Sozlamalar → SMS va Telegram</strong> bo'limida login va parolni kiriting.</span>
                        </div>
                    )}
                    {manualChannel === 'telegram' && !telegramConnected && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Telegram bot ulanmagan. <strong>Sozlamalar → SMS va Telegram</strong> bo'limida bot tokenini kiriting.</span>
                        </div>
                    )}

                    {/* Auditoriya */}
                    <Card className="p-6 space-y-4">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-gray-400" /> Kimga yuborish?
                        </h3>
                        {/* Saqlangan segmentlar — bir marta yig'ilib qayta ishlatiladi */}
                        {savedSegments.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Saqlangan:</span>
                                {savedSegments.map(s => (
                                    <span key={s.id} className="flex items-center rounded-lg border border-primary-200 dark:border-primary-800 overflow-hidden">
                                        <button
                                            onClick={() => setSegment(s.segment)}
                                            className="px-2.5 py-1 text-xs font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                                        >
                                            {s.name}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteSegment(s)}
                                            title="O'chirish"
                                            className="px-1.5 py-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <SegmentBuilder
                            value={segment}
                            onChange={setSegment}
                            fields={segmentFields}
                            conditionCounts={audience?.conditionCounts}
                        />

                        {(segment.conditions?.length || 0) > 0 && (
                            <button
                                onClick={handleSaveSegment}
                                className="self-start text-xs font-bold text-gray-500 hover:text-primary-600"
                            >
                                💾 Shu segmentni saqlab qo'yish
                            </button>
                        )}

                        {/* Hisob-kitob: son qayerdan kelgani bosqichma-bosqich ko'rinadi */}
                        {audienceLoading ? (
                            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-sm text-gray-500">
                                Hisoblanmoqda...
                            </div>
                        ) : audience ? (
                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                <div className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                                    <FunnelRow label="Klinikada bemorlar" value={audience.clinicTotal} />
                                    {audience.matched !== audience.clinicTotal && (
                                        <FunnelRow
                                            label={
                                                (segment.conditions?.length || 0) === 0
                                                    ? 'Filtrsiz'
                                                    : (segment.match === 'any' ? 'Shartlardan biriga mos' : 'Barcha shartlarga mos')
                                            }
                                            value={audience.matched}
                                            diff={audience.matched - audience.clinicTotal}
                                        />
                                    )}
                                    {unreachableCount > 0 && (
                                        <FunnelRow
                                            label="Tanlangan kanal bilan yetib bo'lmaydi"
                                            value={-unreachableCount}
                                            isDeduction
                                        />
                                    )}
                                    {excludedIds.size > 0 && (
                                        <FunnelRow
                                            label="Ro'yxatdan qo'lda chiqarildi"
                                            value={-excludedIds.size}
                                            isDeduction
                                        />
                                    )}
                                    <div className="flex items-center justify-between px-4 py-3 bg-primary-50 dark:bg-primary-900/20">
                                        <span className="flex items-center gap-2 font-bold text-primary-700 dark:text-primary-400">
                                            <Eye className="w-4 h-4" /> Xabar yetib boradi
                                        </span>
                                        <span className="font-black text-lg text-primary-700 dark:text-primary-400">
                                            {recipientCount} ta
                                        </span>
                                    </div>
                                </div>

                                {/* Narx — pul faqat SMS uchun ketadi */}
                                {recipientCount > 0 && (
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 text-sm">
                                        {viaTelegram > 0 && (
                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                                ✈️ {viaTelegram} ta — bepul
                                            </span>
                                        )}
                                        {viaSms > 0 && (
                                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                                                📱 {viaSms} ta — pullik
                                                {smsInfo.parts > 1 && ` × ${smsInfo.parts} qism`}
                                                {totalSmsParts > 0 && ` = ${totalSmsParts} SMS`}
                                            </span>
                                        )}
                                        {smsBalance !== null && (
                                            <span className={`text-xs ${totalSmsParts > smsBalance ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                                Eskiz balansi: {smsBalance.toLocaleString()} SMS
                                                {totalSmsParts > smsBalance && ' — yetmaydi!'}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* To'liq ro'yxat — kimga ketishini ko'rib, kerakmasini olib tashlash */}
                                {allRecipients.length > 0 && (
                                    <div className="border-t border-gray-200 dark:border-gray-700">
                                        <button
                                            onClick={() => setShowRecipients(v => !v)}
                                            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-gray-500 hover:text-primary-600"
                                        >
                                            <span>
                                                {recipientSample.map(r => `${r.firstName} ${r.lastName}`).join(', ')}
                                                {recipientCount > recipientSample.length ? ` va yana ${recipientCount - recipientSample.length} ta` : ''}
                                            </span>
                                            <span className="font-bold shrink-0">
                                                {showRecipients ? 'Yashirish' : "To'liq ro'yxat"}
                                            </span>
                                        </button>

                                        {showRecipients && (
                                            <div className="border-t border-gray-100 dark:border-gray-800">
                                                <div className="px-4 py-2 flex flex-wrap items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={recipientSearch}
                                                        onChange={e => setRecipientSearch(e.target.value)}
                                                        placeholder="Ism yoki raqam bo'yicha qidirish"
                                                        className="flex-1 min-w-[180px] px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none dark:text-white"
                                                    />
                                                    {excludedIds.size > 0 && (
                                                        <button
                                                            onClick={() => setExcludedIds(new Set())}
                                                            className="text-xs font-bold text-primary-600 hover:text-primary-700"
                                                        >
                                                            {excludedIds.size} tasini qaytarish
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto">
                                                    {visibleRecipients.map(r => {
                                                        const off = excludedIds.has(r.id);
                                                        return (
                                                            <label
                                                                key={r.id}
                                                                className={`flex items-center gap-3 px-4 py-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${off ? 'opacity-40' : ''}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!off}
                                                                    onChange={() => toggleExcluded(r.id)}
                                                                    className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                                                />
                                                                <span className="font-medium text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">
                                                                    {r.firstName} {r.lastName}
                                                                </span>
                                                                <span className={r.channel === 'telegram' ? 'text-emerald-600' : 'text-amber-600'}>
                                                                    {r.channel === 'telegram' ? '✈️ bepul' : '📱 SMS'}
                                                                </span>
                                                                {r.debt > 0 && (
                                                                    <span className="text-gray-400 tabular-nums">{r.debt.toLocaleString()} so'm</span>
                                                                )}
                                                            </label>
                                                        );
                                                    })}
                                                    {visibleRecipients.length === 0 && (
                                                        <div className="px-4 py-6 text-center text-xs text-gray-400">Topilmadi</div>
                                                    )}
                                                </div>
                                                {audience.recipientsTruncated && (
                                                    <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 dark:border-gray-800">
                                                        Birinchi 500 tasi ko'rsatilgan — yuborish baribir hammasiga ketadi.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {/* Kimga yetib bormaydi va NIMA UCHUN — klinika tuzata olishi uchun */}
                        {unreachableCount > 0 && (
                            <div className="border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setShowUnreachable(v => !v)}
                                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-400"
                                >
                                    <span className="flex items-center gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        <strong>{unreachableCount} ta bemorga</strong> yetib bo'lmaydi
                                    </span>
                                    <span className="font-bold">{showUnreachable ? 'Yashirish' : "Kimlar? Ko'rsatish"}</span>
                                </button>
                                {showUnreachable && (
                                    <div className="divide-y divide-amber-100 dark:divide-amber-900/40 max-h-56 overflow-y-auto">
                                        {(audience?.unreachableList || []).map(u => (
                                            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                                                <span className="font-medium text-gray-700 dark:text-gray-300">{u.name}</span>
                                                <span className="text-amber-600 dark:text-amber-500 text-right">{u.reason}</span>
                                            </div>
                                        ))}
                                        {unreachableCount > (audience?.unreachableList?.length || 0) && (
                                            <div className="px-4 py-2 text-xs text-gray-400">
                                                ...va yana {unreachableCount - (audience?.unreachableList?.length || 0)} ta
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* Xabar matni */}
                    <Card className="p-6 space-y-4">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-gray-400" /> Xabar matni
                        </h3>
                        {templates.length > 0 && (
                            <div>
                                <p className="text-xs text-gray-500 mb-2">Shablondan foydalanish:</p>
                                <div className="flex flex-wrap gap-2">
                                    {templates.map(tpl => (
                                        <button
                                            key={tpl.id}
                                            onClick={() => setManualMessage(tpl.text)}
                                            className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600 transition-colors bg-white dark:bg-gray-800"
                                        >
                                            {tpl.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <textarea
                            placeholder="Xabar matni..."
                            value={manualMessage}
                            onChange={e => setManualMessage(e.target.value)}
                            rows={5}
                            className={inputCls}
                        />
                        {/* SMS hisoblagichi — operator har QISM uchun alohida pul oladi */}
                        {manualMessage.trim() && viaSms > 0 && (
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                    <span className="text-gray-500">
                                        {smsInfo.length} belgi · <strong className={smsInfo.parts > 1 ? 'text-amber-600' : 'text-gray-700 dark:text-gray-300'}>{smsInfo.parts} qism</strong>
                                        {' '}({smsInfo.encoding}, qismiga {smsInfo.perPart} belgi)
                                    </span>
                                    <span className="text-gray-400">Keyingi qismgacha: {smsInfo.remaining}</span>
                                </div>
                                {smsInfo.encoding === 'UCS-2' && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                                        <span className="flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                            {messageHasBadApostrophe
                                                ? <>Tipografik apostrof (<span className="font-mono">’</span>) ishlatilgan — shu sabab bitta SMS 160 emas, 70 belgi.</>
                                                : <>Lotin alifbosidan tashqari belgi bor ({smsInfo.nonGsmChars.slice(0, 6).join(' ')}) — bitta SMS 70 belgi.</>}
                                        </span>
                                        {messageHasBadApostrophe && (
                                            <button
                                                onClick={() => setManualMessage(m => fixApostrophes(m))}
                                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md shrink-0"
                                            >
                                                Apostrofni to'g'rilash
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        <VarButtons onInsert={token => setManualMessage(m => m + token)} />
                        <p className="text-xs text-gray-400">
                            <strong>{'{sana}'}</strong>, <strong>{'{vaqt}'}</strong> va <strong>{"{shifokor_ismi}"}</strong> bemorning eng yaqin kelgusi qabuli bo'yicha to'ldiriladi.
                            Qabuli bo'lmasa {'{sana}'} bugungi sana bo'ladi, qolganlari bo'sh qoladi.
                        </p>
                        {/* Bemor aynan nimani ko'radi */}
                        {manualMessage.trim() && previewPatient && (
                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Eye className="w-3.5 h-3.5" /> Bemor ko'radigan matn
                                    </span>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-gray-400">{previewPatient.firstName} {previewPatient.lastName}</span>
                                        {recipientSample.length > 1 && (
                                            <button
                                                onClick={() => setPreviewIndex(i => i + 1)}
                                                className="px-2 py-0.5 font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                                            >
                                                Boshqasi →
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                                    {previewText}
                                </p>
                            </div>
                        )}

                        {/* Test yuborish — 26 kishiga tarqatishdan oldin o'zingizga */}
                        {manualMessage.trim() && (
                            <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-3">
                                {!testOpen ? (
                                    <button
                                        onClick={() => setTestOpen(true)}
                                        className="flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-700"
                                    >
                                        <Send className="w-4 h-4" /> Avval o'zimga test yuborish
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-500">
                                            {manualChannel === 'telegram'
                                                ? "Test xabar klinikaning Telegram chatiga yuboriladi."
                                                : "Test SMS shu raqamga yuboriladi (bemorlarga tegmaydi, chastota chegarasidan ozod)."}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {manualChannel !== 'telegram' && (
                                                <input
                                                    type="tel"
                                                    placeholder="+998 90 123 45 67"
                                                    value={testPhone}
                                                    onChange={e => setTestPhone(e.target.value)}
                                                    className={`${inputCls} flex-1 min-w-[200px]`}
                                                />
                                            )}
                                            <Button onClick={handleTestSend} disabled={testSending}>
                                                {testSending ? 'Yuborilmoqda...' : 'Test yuborish'}
                                            </Button>
                                            <Button variant="secondary" onClick={() => setTestOpen(false)}>Yopish</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {cooldownDays > 0 && (
                            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={ignoreCooldown}
                                    onChange={e => setIgnoreCooldown(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                />
                                Chastota chegarasini ({cooldownDays} kun) e'tiborsiz qoldirish — yaqinda xabar olganlarga ham yuborilsin
                            </label>
                        )}

                        <button
                            disabled={manualSending || bulkRunning || !manualMessage.trim() || recipientCount === 0}
                            onClick={handleManualSend}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-white transition-all bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
                        >
                            {manualSending || bulkRunning ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            {bulkRunning
                                ? 'Oldingi yuborish davom etmoqda...'
                                : `${recipientCount} ta bemorga yuborish${viaSms > 0 ? ` (${totalSmsParts} SMS)` : ' (bepul)'}`}
                        </button>
                    </Card>
                </div>
            )}

            {/* ═══ TARIX ═══ */}
            {activeTab === 'history' && (
                <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <Card className="p-5 text-center">
                            <h3 className="text-3xl font-black text-gray-900 dark:text-white">{logStats.total}</h3>
                            <p className="text-sm text-gray-500 mt-1">Jami yuborilgan</p>
                        </Card>
                        <Card className="p-5 text-center border border-emerald-100 dark:border-emerald-900/40">
                            <h3 className="text-3xl font-black text-emerald-600">{logStats.sent}</h3>
                            <p className="text-sm text-gray-500 mt-1">Muvaffaqiyatli</p>
                        </Card>
                        <Card className="p-5 text-center border border-red-100 dark:border-red-900/40">
                            <h3 className="text-3xl font-black text-red-600">{logStats.failed}</h3>
                            <p className="text-sm text-gray-500 mt-1">Xato</p>
                        </Card>
                    </div>

                    {/* Fonda ketayotgan yuborish */}
                    {bulkJob && (
                        <div className="px-4 py-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex items-center gap-2 font-bold text-primary-700 dark:text-primary-400">
                                    {!bulkJob.done && <span className="w-3.5 h-3.5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />}
                                    {bulkJob.done ? 'Yuborish tugadi' : 'Yuborilmoqda...'}
                                </span>
                                <span className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400">
                                    {(bulkJob.sent || 0) + (bulkJob.failed || 0)} / {bulkJob.total || 0}
                                    {(bulkJob.failed || 0) > 0 ? ` · ${bulkJob.failed} ta xato` : ''}
                                    {bulkJob.done && (
                                        <button onClick={() => setBulkJob(null)} className="text-primary-400 hover:text-primary-700" title="Yopish">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </span>
                            </div>
                            <div className="h-1.5 bg-primary-100 dark:bg-primary-900/40 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary-600 transition-all"
                                    style={{ width: `${Math.round((((bulkJob.sent || 0) + (bulkJob.failed || 0)) / Math.max(1, bulkJob.total || 0)) * 100)}%` }}
                                />
                            </div>
                            {bulkJob.error && <p className="text-xs text-red-600">{bulkJob.error}</p>}
                        </div>
                    )}

                    {/* Xatolar banneri — hisob butun baza bo'yicha, ro'yxat limitidan mustaqil */}
                    {logStats.failed > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                            <div className="flex items-center gap-2 text-sm">
                                <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                                <div>
                                    <p className="font-bold text-red-700 dark:text-red-400">{logStats.failed} ta xato xabar</p>
                                    <p className="text-red-600/80 dark:text-red-400/80 text-xs">Qayta yuborish uchun tanlang yoki hammasini qayta yuboring</p>
                                </div>
                            </div>
                            <button
                                onClick={selectAllFailed}
                                disabled={logsLoading}
                                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-bold rounded-xl transition-all"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} /> Hammasini tanlash
                            </button>
                        </div>
                    )}

                    {/* Tanlangan xatolarni qayta yuborish */}
                    {selectedLogIds.size > 0 && (
                        <button
                            disabled={retrying}
                            onClick={() => handleRetry(Array.from(selectedLogIds))}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-all"
                        >
                            {retrying ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                            Tanlanganlarni qayta yuborish ({selectedLogIds.size})
                        </button>
                    )}

                    {/* Filtr + ro'yxat */}
                    <Card className="overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-1">
                                {([
                                    ['all', 'Barchasi'],
                                    ['sent', `Yuborildi (${logStats.sent})`],
                                    ['failed', `Xato (${logStats.failed})`],
                                ] as const).map(([key, lbl]) => (
                                    <button
                                        key={key}
                                        onClick={() => changeHistoryFilter(key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${historyFilter === key
                                            ? 'bg-primary-600 text-white'
                                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                    >
                                        {lbl}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => loadLogs()} disabled={logsLoading} className="flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700 disabled:opacity-50">
                                <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} /> Yangilash
                            </button>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[60vh] overflow-y-auto">
                            {logs.map(log => {
                                const name = log.patient ? `${log.patient.firstName} ${log.patient.lastName}` : (log.recipient || '-');
                                const contact = log.recipient || log.patient?.phone || '';
                                const isFailed = log.status === 'Failed';
                                const isRetried = log.status === 'Retried';
                                const isSkipped = log.status === 'Skipped';
                                return (
                                    <div key={log.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        {/* Checkbox faqat xatolar uchun faol, lekin joyi doim band —
                                            aks holda qatorlar chapga siljib, ro'yxat notekis ko'rinardi */}
                                        <input
                                            type="checkbox"
                                            checked={isFailed && selectedLogIds.has(log.id)}
                                            onChange={() => toggleLogSelection(log.id)}
                                            disabled={!isFailed}
                                            className={`mt-1.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 ${isFailed ? '' : 'invisible'}`}
                                        />
                                        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${isFailed ? 'bg-red-500' : (isRetried || isSkipped) ? 'bg-gray-400' : 'bg-emerald-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-gray-900 dark:text-white text-sm">{name}</span>
                                                {contact && <span className="text-xs text-gray-400">{contact}</span>}
                                                <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md">
                                                    {log.channel === 'sms' ? 'SMS' : 'Telegram'} ({SOURCE_LABELS[log.source] || log.source})
                                                </span>
                                                {isFailed ? (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-red-50 dark:bg-red-900/20 text-red-600 rounded-md">
                                                        <XCircle className="w-3 h-3" /> Xato
                                                    </span>
                                                ) : isRetried ? (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-md">
                                                        <RefreshCw className="w-3 h-3" /> Qayta yuborilgan
                                                    </span>
                                                ) : isSkipped ? (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-md">
                                                        <Clock className="w-3 h-3" /> O'tkazib yuborildi
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-md">
                                                        <CheckCircle2 className="w-3 h-3" /> Yuborildi
                                                    </span>
                                                )}
                                            </div>
                                            {log.message && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{log.message}</p>}
                                            {(isFailed || isRetried || isSkipped) && log.error && <p className={`text-xs mt-0.5 ${isFailed ? 'text-red-500' : 'text-gray-400'}`}>{log.error}</p>}
                                        </div>
                                        <span className="text-xs text-gray-400 shrink-0">{formatLogDate(log.sentAt)}</span>
                                    </div>
                                );
                            })}
                            {logs.length === 0 && (
                                <div className="px-4 py-10 text-center text-gray-500 text-sm">
                                    {logsLoading ? 'Yuklanmoqda...' : historyFilter === 'all' ? "Xabarlar tarixi bo'sh." : 'Bu filtr bo\'yicha xabar yo\'q.'}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
