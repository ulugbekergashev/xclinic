/* ─────────────────────────────────────────────────────────────────────────────
   LABORATORIYA SOZLAMALARI — Sozlamalar → Laboratoriya katalogi, tepada.

   Uchta narsa, hammasi dastlab O'CHIQ (klinika o'zi yoqadi):
     · probirka yorlig'ining o'lchami (termoprinter yoki 80 mm chek printeri)
       va «Sinov yorlig'i» — printer to'g'ri sozlanganini darhol ko'rish;
     · «Olindi» bosilganda yorliq o'zi chiqsin;
     · natijani ikkinchi xodim tasdiqlasin — yoqilsa natija Telegramga faqat
       tasdiqdan keyin ketadi. Bitta laborantli klinikada yoqmaslik kerak.
   Saqlash — har o'zgarishda darhol (ortiqcha «Saqlash» tugmasi yo'q).
   ───────────────────────────────────────────────────────────────────────────── */

import React, { useState } from 'react';
import { Barcode, ShieldCheck, Printer } from 'lucide-react';
import { Card } from '../Common';
import { Clinic } from '../../types';
import { api } from '../../services/api';
import { toast } from '../../services/toast';
import { useLanguage } from '../../context/LanguageContext';
import { printLabels, LABEL_SIZE_OPTIONS, LabelSize } from '../../utils/printLabel';

interface Props {
    clinic: Clinic | null | undefined;
    /** Faqat ega o'zgartiradi (server ham shunday) */
    canEdit: boolean;
    onSaved?: () => void;
}

const SAMPLE_CODE = '2611260001';

export function LabSettingsCard({ clinic, canEdit, onSaved }: Props) {
    const { t } = useLanguage();
    const [size, setSize] = useState<LabelSize>(((clinic?.labLabelSize as LabelSize) || '40x30'));
    const [auto, setAuto] = useState(!!clinic?.labLabelAuto);
    const [verify, setVerify] = useState(!!clinic?.labVerifyRequired);
    const [busy, setBusy] = useState(false);

    const save = async (patch: { labLabelSize?: string; labLabelAuto?: boolean; labVerifyRequired?: boolean }, undo: () => void) => {
        if (!clinic?.id) return;
        setBusy(true);
        try {
            await api.patientDocs.setLabSettings(clinic.id, patch);
            toast.success(t('lab.settings.saved'));
            onSaved?.();
        } catch (e: any) {
            undo();
            toast.error(e?.data?.error || e?.message || t('lab.settings.failed'));
        } finally { setBusy(false); }
    };

    const testLabel = () => {
        const ok = printLabels({
            code: SAMPLE_CODE, patientName: 'Familiya Ism', dob: '1990-01-01', gender: 'Male',
            at: new Date().toISOString(), groups: [{ sample: 'Qon', tests: ['UAK', 'Glyukoza'] }],
        }, size);
        if (!ok) toast.error(t('print.popupBlocked'));
    };

    const row = 'flex items-start gap-3';
    const box = 'mt-0.5 w-5 h-5 text-primary-600 border-line rounded focus:ring-primary-500 disabled:opacity-50';

    return (
        <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
                <Barcode className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <h3 className="text-sm font-bold text-ink">{t('lab.settings.title')}</h3>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                    <span className="block text-sm font-medium text-muted mb-1">{t('lab.settings.size')}</span>
                    <select value={size} disabled={!canEdit || busy}
                        onChange={e => {
                            const prev = size; const next = e.target.value as LabelSize;
                            setSize(next);
                            save({ labLabelSize: next }, () => setSize(prev));
                        }}
                        className="h-10 px-3 rounded-lg border border-line bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 disabled:opacity-60">
                        {LABEL_SIZE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                </label>
                <button type="button" onClick={testLabel}
                    className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:border-primary-400">
                    <Printer className="w-4 h-4" /> {t('lab.settings.test')}
                </button>
            </div>
            <p className="text-xs text-faint -mt-2">{t('lab.settings.sizeHint')}</p>

            <label className={row}>
                <input type="checkbox" className={box} checked={auto} disabled={!canEdit || busy}
                    onChange={e => { const v = e.target.checked; setAuto(v); save({ labLabelAuto: v }, () => setAuto(!v)); }} />
                <span>
                    <span className="block text-sm font-medium text-ink">{t('lab.settings.auto')}</span>
                    <span className="block text-xs text-muted">{t('lab.settings.autoHint')}</span>
                </span>
            </label>

            <label className={row}>
                <input type="checkbox" className={box} checked={verify} disabled={!canEdit || busy}
                    onChange={e => { const v = e.target.checked; setVerify(v); save({ labVerifyRequired: v }, () => setVerify(!v)); }} />
                <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> {t('lab.settings.verify')}
                    </span>
                    <span className="block text-xs text-muted">{t('lab.settings.verifyHint')}</span>
                </span>
            </label>
        </Card>
    );
}
