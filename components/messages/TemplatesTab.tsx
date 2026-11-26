/* SHABLONLAR TABI.

   Ilgari tepada xom `{bemor_ismi}` tokenlar qatori va Eskiz moderatsiyasi
   haqida uch qatorli paragraf turardi. Token qatori muharrirdagi
   «+ Bemor ismi» tugmalarining takrori edi — olib tashlandi. Eskiz izohi
   bitta qatorga qisqardi va faqat SMS ulangan bo'lsa chiqadi (ulanmagan
   klinikaga moderatsiya haqida o'qish befoyda).

   Kartada: nomi, Eskiz holati, qaysi avtomatik qoida shu shablonni
   ishlatayotgani va matn — tokenlar odam tilida («Bemor ismi»). */
import React, { useEffect, useState } from 'react';
import { FileText, Pencil, Plus, RefreshCw, Trash2, X, Zap } from 'lucide-react';
import type { AutomationRule, MessageTemplate } from '../../types';
import { Button } from '../Common';
import { api } from '../../services/api';
import { confirmAction } from '../../services/confirm';
import { useLanguage, fill } from '../../context/LanguageContext';
import {
    EmptyState, IconButton, Pill, TokenText, UnknownTokenWarning, VarButtons,
    eskizStatusBadge, inputCls, labelCls, textareaCls,
} from './shared';

interface Props {
    clinicId: string;
    templates: MessageTemplate[];
    setTemplates: React.Dispatch<React.SetStateAction<MessageTemplate[]>>;
    rules: AutomationRule[];
    smsConnected: boolean;
    /** Oshganda yangi shablon formasi ochiladi (Avtomatik tabidan so'ralganda) */
    openNewSignal: number;
    addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const TemplatesTab: React.FC<Props> = ({
    clinicId, templates, setTemplates, rules, smsConnected, openNewSignal, addToast,
}) => {
    const { t } = useLanguage();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<MessageTemplate | null>(null);
    const [form, setForm] = useState({ name: '', text: '' });
    const [saving, setSaving] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const openForm = (tpl?: MessageTemplate) => {
        setEditing(tpl || null);
        setForm({ name: tpl?.name || '', text: tpl?.text || '' });
        setIsFormOpen(true);
    };
    const closeForm = () => { setIsFormOpen(false); setEditing(null); };

    useEffect(() => { if (openNewSignal > 0) openForm(); }, [openNewSignal]);

    const handleSave = async () => {
        if (!form.name.trim() || !form.text.trim()) return;
        setSaving(true);
        try {
            if (editing) {
                const updated = await api.messageTemplates.update(editing.id, form);
                setTemplates(prev => prev.map(x => x.id === editing.id ? updated : x));
                addToast('success', t('messagesmanagement.shablon_yangilandi'));
            } else {
                const created = await api.messageTemplates.create({ ...form, clinicId });
                setTemplates(prev => [created, ...prev]);
                addToast('success', t('messagesmanagement.shablon_qoshildi'));
            }
            closeForm();
        } catch (e: any) {
            addToast('error', e.message || t('ui.xatolik_yuz_berdi'));
        } finally {
            setSaving(false);
        }
    };

    const handleSync = async (tpl: MessageTemplate) => {
        setSyncingId(tpl.id);
        try {
            const updated = await api.messageTemplates.syncEskizStatus(tpl.id);
            setTemplates(prev => prev.map(x => x.id === tpl.id ? updated : x));
        } catch (e: any) {
            addToast('error', e.message || t('messagesmanagement.holatni_tekshirishda_xatolik'));
        } finally {
            setSyncingId(null);
        }
    };

    const handleDelete = async (tpl: MessageTemplate) => {
        if (!await confirmAction({ title: fill(t('messagesmanagement.x_shablonini_ochirishni_tasdiqlaysizmi'), tpl.name), danger: true, confirmLabel: t('ui.ochirish_2') })) return;
        try {
            await api.messageTemplates.delete(tpl.id);
            setTemplates(prev => prev.filter(x => x.id !== tpl.id));
            addToast('info', t('messagesmanagement.shablon_ochirildi'));
        } catch (e: any) {
            addToast('error', e.message || t('messagesmanagement.shablon_avtomatik_qoidada_ishlatilmoqda'));
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                    {templates.length > 0 ? fill(t('msg.templates.count'), templates.length) : t('msg.templates.lead')}
                    {smsConnected && (
                        <span className="text-faint" title={`${t('messagesmanagement.eskiz_sms_ulangan_bolsa')} %w ${t('messagesmanagement.korinishiga_aylantiriladi_holatini_tugma')}`}>
                            {' · '}{t('msg.templates.eskizNote')}
                        </span>
                    )}
                </p>
                {!isFormOpen && (
                    <Button onClick={() => openForm()}>
                        <Plus className="w-4 h-4" /> {t('messagesmanagement.yangi_shablon')}
                    </Button>
                )}
            </div>

            {isFormOpen && (
                <section className="card p-5 space-y-4" aria-label={editing ? t('messagesmanagement.shablonni_tahrirlash') : t('messagesmanagement.yangi_shablon')}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-ink">
                            {editing ? t('messagesmanagement.shablonni_tahrirlash') : t('messagesmanagement.yangi_shablon')}
                        </h2>
                        <IconButton label={t('common.close')} onClick={closeForm}><X className="w-4 h-4" /></IconButton>
                    </div>
                    <div>
                        <label htmlFor="tpl-name" className={labelCls}>{t('messagesmanagement.shablon_nomi')}</label>
                        <input id="tpl-name" type="text" value={form.name} className={inputCls}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="tpl-text" className={labelCls}>{t('messagesmanagement.xabar_matni')}</label>
                        <textarea id="tpl-text" rows={4} value={form.text} className={textareaCls}
                            placeholder={t('messagesmanagement.xabar_matni_masalan_hurmatli')}
                            onChange={e => setForm(f => ({ ...f, text: e.target.value }))} />
                        <VarButtons onInsert={token => setForm(f => ({ ...f, text: f.text + token }))} />
                        <UnknownTokenWarning text={form.text} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={closeForm}>{t('ui.bekor')}</Button>
                        <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.text.trim()}>
                            {saving ? t('ui.saqlanmoqda_2') : t('ui.saqlash')}
                        </Button>
                    </div>
                </section>
            )}

            {templates.length === 0 && !isFormOpen ? (
                <EmptyState icon={FileText} title={t('msg.templates.emptyTitle')} hint={t('messagesmanagement.hozircha_shablonlar_yoq_yangi')} />
            ) : (
                <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {templates.map(tpl => {
                        const badge = eskizStatusBadge(tpl.eskizStatus);
                        const usedBy = rules.filter(r => r.templateId === tpl.id);
                        return (
                            <li key={tpl.id} className="card p-4 flex flex-col gap-2.5 min-w-0">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-semibold text-ink truncate">{tpl.name}</h3>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1 empty:hidden">
                                            {badge && <Pill tone={badge.tone}>{badge.label}</Pill>}
                                            {usedBy.length > 0 && (
                                                <Pill tone="neutral" icon={Zap} title={usedBy.map(r => r.name).join(', ')}>
                                                    {usedBy.length === 1 ? usedBy[0].name : fill(t('msg.templates.usedByN'), usedBy.length)}
                                                </Pill>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 -mr-1.5 -mt-1">
                                        {smsConnected && (
                                            <IconButton onClick={() => handleSync(tpl)} disabled={syncingId === tpl.id}
                                                label={tpl.eskizStatus ? t('messagesmanagement.eskiz_holatini_yangilash') : t('messagesmanagement.eskiz_moderatsiyasiga_yuborish')}>
                                                <RefreshCw className={`w-4 h-4 ${syncingId === tpl.id ? 'animate-spin' : ''}`} />
                                            </IconButton>
                                        )}
                                        <IconButton label={t('ui.tahrirlash')} onClick={() => openForm(tpl)}><Pencil className="w-4 h-4" /></IconButton>
                                        <IconButton danger label={t('ui.ochirish')} onClick={() => handleDelete(tpl)}><Trash2 className="w-4 h-4" /></IconButton>
                                    </div>
                                </div>
                                <TokenText text={tpl.text} className="text-sm text-muted leading-relaxed line-clamp-4" />
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
