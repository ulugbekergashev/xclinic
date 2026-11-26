/* AVTOMATIK TABI — qoidalar.

   Qoida qatori JUMLA bo'lib o'qiladi: «Qabuldan oldin · 2 soat →
   Telegram → Qabul eslatmasi». Ilgari bu bitta kulrang satr edi
   («⏰ Qabuldan oldin · 2 soat · Telegram· Shablon: …») — emoji, yopishgan
   nuqta, va qaysi bo'lak nima ekani ajralmasdi.

   VAQT HAMMA TRIGGER UCHUN SAQLANADI. Ilgari forma `hoursBefore` ni faqat
   «Qabuldan oldin» uchun yuborardi: «Qabuldan keyin 48 soat» tanlangan
   qoida jimgina 24 soatlik bo'lib saqlanardi. Tahrirlashda esa
   `rule.hoursBefore || 2` — «Darhol» (0) ni 2 ga aylantirardi. */
import React, { useState } from 'react';
import { FileText, Pencil, Plus, Stethoscope, Trash2, X, Zap, AlertTriangle, CalendarClock } from 'lucide-react';
import type {
    AudienceSegment, AutomationRule, AutomationTrigger, Doctor, MessageChannel, MessageTemplate,
    RuleSchedule, SegmentFieldDescriptor, TriggerDescriptor,
} from '../../types';
import { Button } from '../Common';
import { SegmentBuilder } from '../SegmentBuilder';
import { api } from '../../services/api';
import { confirmAction } from '../../services/confirm';
import { formatFullName } from '../../utils/format';
import { useLanguage, fill, tr } from '../../context/LanguageContext';
import {
    ChannelIcon, ChannelTag, EmptyState, IconButton, Toggle, channelOptions, inputCls, labelCls,
    offsetText, toConditionSegment, triggerIcon,
} from './shared';

interface Props {
    clinicId: string;
    rules: AutomationRule[];
    setRules: React.Dispatch<React.SetStateAction<AutomationRule[]>>;
    templates: MessageTemplate[];
    triggerDefs: TriggerDescriptor[];
    segmentFields: SegmentFieldDescriptor[];
    doctors: Doctor[];
    /** Shablon yo'q — Shablonlar tabiga o'tib yangi shablon ochish */
    onCreateTemplate: () => void;
    addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

type RuleForm = {
    name: string;
    templateId: string;
    trigger: AutomationTrigger;
    hoursBefore: number;
    channel: MessageChannel;
    doctorId: string;
    segment: AudienceSegment;
    schedule: RuleSchedule;
};

const emptyRuleForm = (): RuleForm => ({
    name: '',
    templateId: '',
    trigger: 'before_appointment' as AutomationTrigger,
    hoursBefore: 2,
    channel: 'telegram_first',
    doctorId: '',
    segment: { match: 'all', conditions: [{ field: 'status', op: 'eq', value: 'Active' }] },
    schedule: { kind: 'weekly', weekday: 1, hour: 10 },
});

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Jadval qiymati 1..7 = Dushanba..Yakshanba; `ui.wd_N` esa 0 = Yakshanba */
const weekdayName = (wd: number) => tr(`ui.wd_${wd % 7}` as any);

function scheduleText(s: RuleSchedule): string {
    const at = `${pad2(s.hour)}:00`;
    if (s.kind === 'daily') return `${tr('messagesmanagement.har_kuni')}, ${at}`;
    if (s.kind === 'monthly') return `${tr('messagesmanagement.har_oy')}, ${s.dayOfMonth || 1}-${tr('messagesmanagement.kuni')} ${at}`;
    return `${tr('messagesmanagement.har_hafta')}, ${weekdayName(s.weekday || 1)} ${at}`;
}

export const RulesTab: React.FC<Props> = ({
    clinicId, rules, setRules, templates, triggerDefs, segmentFields, doctors, onCreateTemplate, addToast,
}) => {
    const { t } = useLanguage();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<AutomationRule | null>(null);
    const [form, setForm] = useState<RuleForm>(emptyRuleForm);
    const [saving, setSaving] = useState(false);
    const activeDef = triggerDefs.find(d => d.id === form.trigger);

    const openForm = (rule?: AutomationRule) => {
        setEditing(rule || null);
        if (!rule) { setForm(emptyRuleForm()); setIsFormOpen(true); return; }
        const def = triggerDefs.find(d => d.id === rule.trigger);
        setForm({
            name: rule.name,
            templateId: rule.templateId,
            trigger: rule.trigger,
            // `??` — «Darhol» (0) saqlansin; bo'sh bo'lsa trigger'ning o'z sukuti
            hoursBefore: rule.hoursBefore ?? def?.offset?.default ?? 2,
            channel: rule.channel,
            doctorId: rule.doctorId || '',
            segment: toConditionSegment(rule.segment),
            schedule: rule.schedule || { kind: 'weekly', weekday: 1, hour: 10 },
        });
        setIsFormOpen(true);
    };

    const closeForm = () => { setIsFormOpen(false); setEditing(null); setForm(emptyRuleForm()); };

    const handleSave = async () => {
        if (!form.name.trim() || !form.templateId) return;
        setSaving(true);
        const payload = {
            name: form.name,
            templateId: form.templateId,
            trigger: form.trigger,
            hoursBefore: activeDef?.offset ? form.hoursBefore : null,
            channel: form.channel,
            doctorId: form.doctorId || null,
            segment: activeDef?.supportsSegment ? form.segment : null,
            schedule: activeDef?.supportsSchedule ? form.schedule : null,
        };
        try {
            if (editing) {
                const updated = await api.automationRules.update(editing.id, payload);
                setRules(prev => prev.map(r => r.id === editing.id ? updated : r));
                addToast('success', t('messagesmanagement.qoida_yangilandi'));
            } else {
                const created = await api.automationRules.create({ ...payload, active: true, clinicId });
                setRules(prev => [created, ...prev]);
                addToast('success', t('messagesmanagement.qoida_qoshildi'));
            }
            closeForm();
        } catch (e: any) {
            addToast('error', e.message || t('ui.xatolik_yuz_berdi'));
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (rule: AutomationRule) => {
        try {
            const updated = await api.automationRules.update(rule.id, { active: !rule.active });
            setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
        } catch (e: any) {
            addToast('error', e.message || t('ui.xatolik_yuz_berdi'));
        }
    };

    const handleDelete = async (rule: AutomationRule) => {
        if (!await confirmAction({ title: fill(t('messagesmanagement.x_qoidasini_ochirishni_tasdiqlaysizmi'), rule.name), danger: true, confirmLabel: t('ui.ochirish_2') })) return;
        try {
            await api.automationRules.delete(rule.id);
            setRules(prev => prev.filter(r => r.id !== rule.id));
            addToast('info', t('messagesmanagement.qoida_ochirildi'));
        } catch (e: any) {
            addToast('error', e.message || t('ui.xatolik_yuz_berdi'));
        }
    };

    const activeCount = rules.filter(r => r.active).length;
    const channels = channelOptions();

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                    {rules.length > 0
                        ? fill(t('msg.rules.summary'), rules.length, activeCount)
                        : t('msg.rules.lead')}
                </p>
                {!isFormOpen && (
                    <Button onClick={() => openForm()}>
                        <Plus className="w-4 h-4" /> {t('messagesmanagement.yangi_qoida')}
                    </Button>
                )}
            </div>

            {isFormOpen && (
                <section className="card p-5 space-y-5" aria-label={editing ? t('messagesmanagement.qoidani_tahrirlash') : t('messagesmanagement.yangi_qoida')}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-ink">
                            {editing ? t('messagesmanagement.qoidani_tahrirlash') : t('messagesmanagement.yangi_qoida')}
                        </h2>
                        <IconButton label={t('common.close')} onClick={closeForm}><X className="w-4 h-4" /></IconButton>
                    </div>

                    {templates.length === 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-warning-500/10 text-sm text-warning-700 dark:text-warning-300">
                            <span className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {t('messagesmanagement.avval_kamida_bitta_shablon')}
                            </span>
                            <Button size="sm" variant="secondary" onClick={() => { closeForm(); onCreateTemplate(); }}>
                                {t('messagesmanagement.shablon_yaratish')}
                            </Button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="rule-name" className={labelCls}>{t('messagesmanagement.qoida_nomi')}</label>
                            <input id="rule-name" type="text" className={inputCls}
                                placeholder={t('messagesmanagement.masalan_qabuldan_2_soat')}
                                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <label htmlFor="rule-tpl" className={labelCls}>{t('ui.shablon')}</label>
                            <select id="rule-tpl" className={inputCls} value={form.templateId}
                                onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}>
                                <option value="">{t('messagesmanagement.shablon_tanlang')}</option>
                                {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="rule-trigger" className={labelCls}>{t('messagesmanagement.qachon_yuborilsin')}</label>
                            <select id="rule-trigger" className={inputCls} value={form.trigger}
                                onChange={e => {
                                    const next = triggerDefs.find(d => d.id === e.target.value);
                                    setForm(f => ({
                                        ...f,
                                        trigger: e.target.value as AutomationTrigger,
                                        // Har trigger o'z offset shkalasiga ega — sukutga qaytaramiz
                                        hoursBefore: next?.offset?.default ?? 0,
                                        ...(next && !next.supportsDoctorFilter ? { doctorId: '' } : {}),
                                    }));
                                }}>
                                {triggerDefs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                            </select>
                        </div>
                        {activeDef?.offset && (
                            <div>
                                <label htmlFor="rule-offset" className={labelCls}>{activeDef.offset.label}</label>
                                <select id="rule-offset" className={inputCls} value={form.hoursBefore}
                                    onChange={e => setForm(f => ({ ...f, hoursBefore: parseInt(e.target.value, 10) }))}>
                                    {activeDef.offset.options.map(v => (
                                        <option key={v} value={v}>{offsetText(v, activeDef.offset!.unit)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <fieldset>
                        <legend className={labelCls}>{t('messagesmanagement.yuborish_kanali')}</legend>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {channels.map(({ value, label, hint }) => (
                                <button key={value} type="button" title={hint} aria-pressed={form.channel === value}
                                    onClick={() => setForm(f => ({ ...f, channel: value }))}
                                    className={`h-10 px-3 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-colors ${form.channel === value
                                        ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                                        : 'border-line text-muted hover:text-ink hover:border-faint'}`}>
                                    <ChannelIcon channel={value === 'both' ? 'telegram' : value} className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted mt-2">{channels.find(c => c.value === form.channel)?.hint}</p>
                    </fieldset>

                    {activeDef?.supportsSchedule && (
                        <fieldset className="p-4 bg-elevated rounded-xl">
                            <legend className="sr-only">{t('msg.rules.schedule')}</legend>
                            <p className={labelCls}>{t('msg.rules.schedule')}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <select aria-label={t('msg.rules.schedule')} className={inputCls} value={form.schedule.kind}
                                    onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, kind: e.target.value as RuleSchedule['kind'] } }))}>
                                    <option value="daily">{t('messagesmanagement.har_kuni')}</option>
                                    <option value="weekly">{t('messagesmanagement.har_hafta')}</option>
                                    <option value="monthly">{t('messagesmanagement.har_oy')}</option>
                                </select>
                                {form.schedule.kind === 'weekly' && (
                                    <select aria-label={t('msg.rules.weekday')} className={inputCls} value={form.schedule.weekday || 1}
                                        onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, weekday: parseInt(e.target.value, 10) } }))}>
                                        {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{weekdayName(d)}</option>)}
                                    </select>
                                )}
                                {form.schedule.kind === 'monthly' && (
                                    <select aria-label={t('msg.rules.dayOfMonth')} className={inputCls} value={form.schedule.dayOfMonth || 1}
                                        onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, dayOfMonth: parseInt(e.target.value, 10) } }))}>
                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                            <option key={d} value={d}>{d}-{t('messagesmanagement.kuni')}</option>
                                        ))}
                                    </select>
                                )}
                                <select aria-label={t('msg.rules.hour')} className={inputCls} value={form.schedule.hour}
                                    onChange={e => setForm(f => ({ ...f, schedule: { ...f.schedule, hour: parseInt(e.target.value, 10) } }))}>
                                    {Array.from({ length: 13 }, (_, i) => i + 8).map(h => (
                                        <option key={h} value={h}>{pad2(h)}:00</option>
                                    ))}
                                </select>
                            </div>
                        </fieldset>
                    )}

                    {activeDef?.supportsSegment && (
                        <div className="p-4 bg-elevated rounded-xl space-y-3">
                            <p className={labelCls}>{t('msg.rules.audience')}</p>
                            <SegmentBuilder value={form.segment} fields={segmentFields}
                                onChange={next => setForm(f => ({ ...f, segment: next }))} />
                        </div>
                    )}

                    {activeDef?.supportsDoctorFilter !== false && (
                        <div className="md:w-1/2">
                            <label htmlFor="rule-doctor" className={labelCls}>{t('messagesmanagement.shifokor_filtri_ixtiyoriy')}</label>
                            <select id="rule-doctor" className={inputCls} value={form.doctorId}
                                onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}>
                                <option value="">{t('messagesmanagement.barcha_shifokorlar')}</option>
                                {doctors.map(d => <option key={d.id} value={d.id}>{formatFullName(d)}</option>)}
                            </select>
                        </div>
                    )}

                    {activeDef?.sendWindow && (
                        <p className="text-xs text-muted">
                            {t('messagesmanagement.yuborish_vaqti')}: <strong className="text-ink">{pad2(activeDef.sendWindow.fromHour)}:00 – {pad2(activeDef.sendWindow.toHour)}:00</strong> {t('messagesmanagement.oraligida_bemorlarga_tunda_xabar')}
                        </p>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={closeForm}>{t('ui.bekor')}</Button>
                        <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.templateId}>
                            {saving ? t('ui.saqlanmoqda_2') : t('ui.saqlash')}
                        </Button>
                    </div>
                </section>
            )}

            {rules.length === 0 && !isFormOpen ? (
                <EmptyState icon={Zap} title={t('msg.rules.emptyTitle')} hint={t('messagesmanagement.avtomatik_qoidalar_yoq_yangi')} />
            ) : (
                <ul className="card divide-y divide-line-soft overflow-hidden">
                    {rules.map(rule => {
                        const tpl = templates.find(x => x.id === rule.templateId);
                        const doctor = rule.doctorId ? doctors.find(d => d.id === rule.doctorId) : null;
                        const def = triggerDefs.find(d => d.id === rule.trigger);
                        const Icon = triggerIcon(rule.trigger);
                        const when = [
                            def?.label || rule.trigger,
                            def?.offset && rule.hoursBefore != null ? offsetText(rule.hoursBefore, def.offset.unit) : '',
                        ].filter(Boolean).join(' · ');
                        return (
                            <li key={rule.id} className="flex items-center gap-4 px-4 py-3.5">
                                <span aria-hidden="true" className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${rule.active
                                    ? 'bg-primary-500/10 text-primary-600 dark:text-primary-300'
                                    : 'bg-elevated text-faint'}`}>
                                    <Icon className="w-5 h-5" />
                                </span>
                                <div className={`min-w-0 flex-1 ${rule.active ? '' : 'opacity-60'}`}>
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                        <h3 className="font-semibold text-ink">{rule.name}</h3>
                                        {!rule.active && <span className="text-xs font-medium text-faint">{t('msg.rules.off')}</span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-sm text-muted">
                                        <span>{when}</span>
                                        {rule.schedule && def?.supportsSchedule && (
                                            <span className="inline-flex items-center gap-1 text-muted">
                                                <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> {scheduleText(rule.schedule)}
                                            </span>
                                        )}
                                        <span className="text-faint" aria-hidden="true">→</span>
                                        <ChannelTag channel={rule.channel} />
                                        {tpl ? (
                                            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-elevated text-xs font-medium text-muted max-w-[16rem]">
                                                <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                                                <span className="truncate">{tpl.name}</span>
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-danger">{t('msg.rules.noTemplate')}</span>
                                        )}
                                        {doctor && (
                                            <span className="inline-flex items-center gap-1 text-xs text-muted">
                                                <Stethoscope className="w-3 h-3" aria-hidden="true" /> {formatFullName(doctor)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Toggle on={rule.active} onChange={() => handleToggle(rule)}
                                        label={rule.active ? t('msg.rules.turnOff') : t('net.turnOn')} />
                                    <span className="w-2" />
                                    <IconButton label={t('ui.tahrirlash')} onClick={() => openForm(rule)}><Pencil className="w-4 h-4" /></IconButton>
                                    <IconButton danger label={t('ui.ochirish')} onClick={() => handleDelete(rule)}><Trash2 className="w-4 h-4" /></IconButton>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
