/* Bemor kartasidan shikoyat yozish (registrator, 2026-11-26).
   Qabul — bemorning oxirgi qabuli (server o'zi bog'laydi), mas'ul ixtiyoriy.
   Yozilgach «Bugun → Shikoyat va fikrlar» da chiqadi. */

import React, { useEffect, useState } from 'react';
import { Modal, Button } from '../Common';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from '../../services/toast';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    patientId: string;
    patientName?: string;
}

export function ComplaintModal({ isOpen, onClose, patientId, patientName }: Props) {
    const { t } = useLanguage();
    const [text, setText] = useState('');
    const [assignee, setAssignee] = useState('');
    const [people, setPeople] = useState<{ key: string; name: string }[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setText(''); setAssignee('');
        api.complaints.list().then(d => setPeople(d.assignees)).catch(() => setPeople([]));
    }, [isOpen]);

    const save = async () => {
        if (text.trim().length < 3) return;
        setBusy(true);
        try {
            await api.complaints.create({ patientId, text: text.trim(), assigneeKey: assignee || null });
            toast.success(t('cmp.saved'));
            onClose();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || t('ui.xatolik_yuz_berdi'));
        } finally { setBusy(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={patientName ? `${t('cmp.write')} — ${patientName}` : t('cmp.write')}>
            <div className="space-y-3">
                <label className="block">
                    <span className="block text-sm font-medium text-muted mb-1">{t('cmp.textLabel')}</span>
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={1000} autoFocus
                        placeholder={t('cmp.textPh')}
                        className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                </label>
                <label className="block">
                    <span className="block text-sm font-medium text-muted mb-1">{t('cmp.assignee')}</span>
                    <select value={assignee} onChange={e => setAssignee(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-line bg-surface text-ink text-sm">
                        <option value="">—</option>
                        {people.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                    </select>
                </label>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={save} disabled={busy || text.trim().length < 3}>{t('common.save')}</Button>
                </div>
            </div>
        </Modal>
    );
}
