import React, { useState } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { api } from '../../services/api';
import { confirmAction } from '../../services/confirm';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatDateShort } from '../../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   DOIM KO'RINADIGAN FAKTLAR — tarix lentasining tepasida.

   Allergiya, surunkali kasallik, oxirgi retsept va me'yordan chiqqan oxirgi
   natijalar. Bular «tarix» emas: shifokor dori yoki tahlil buyurishdan OLDIN
   bilishi kerak bo'lgan holat, shuning uchun lenta bilan birga aylanib
   ketmaydi va yopilmaydi.

   Ilgari bular «Avval nima bo'lgan» degan yig'iladigan panel ichida edi va
   panel faqat allergiya bo'lsagina o'zi ochilardi.

   «YO'Q» VA «BILMAYMIZ» — IKKI BOSHQA NARSA. Ma'lumot hali yuklanmagan yoki
   yuklanmay qolgan bo'lsa, bu yerda «ma'lumot yo'q» deb YOZILMAYDI: shifokor
   uni «allergiyasi yo'q» deb o'qiydi. Yuklanmasa — shunday deb aytiladi.

   ALLERGIYA SHU YERDA KIRITILADI. O'chirilmaydi — faolsizlantiriladi (yozuv
   bazada qoladi), va bu ham tasdiq bilan: bitta tasodifiy bosish dori
   tayinlashdagi ogohlantirishni olib tashlamasin.
   ───────────────────────────────────────────────────────────────────────────── */

export interface ClinicalSummary {
    allergies?: { id: string; substance: string; reaction?: string | null; severity?: string | null }[];
    chronic?: { id: string; code: string; name: string }[];
    /** Oxirgi retseptlardagi dorilar (server holatni kuzatmaydi — «doimiy» degani emas) */
    activeMedications?: { name: string; dosage?: string | null; frequency?: string | null; date?: string | null }[];
    /** Oxirgi tayyor tahlillardagi me'yordan chiqqan qiymatlar */
    abnormalResults?: { name: string; value: string; unit?: string | null; flag: string; at?: string | null }[];
    admissions?: { id: string; admittedAt: string; dischargedAt?: string | null; status?: string | null; diagnosis?: string | null }[];
    /** Oxirgi tayyor tahlil va tekshiruvlar — qabulga bog'lanmaganlari ham */
    recentLabs?: { id: string; completedAt?: string | null; tests?: string[] }[];
    recentStudies?: { id: string; modality: string; name: string; conclusion?: string | null; performedAt?: string | null }[];
    due?: number;
}

interface Props {
    patientId: string;
    /** `null` — hali yuklanmagan (yoki yuklanmay qolgan, `failed` ga qarang) */
    summary: ClinicalSummary | null;
    /** Oxirgi so'rov xato bilan tugadi. `summary` bo'lsa — u ESKI nusxa. */
    failed: boolean;
    /** Allergiya qo'shish va olib tashlash — faqat shifokor va ega */
    canEdit: boolean;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
    onChanged: () => void;
}

const EMPTY_ALLERGY = { substance: '', reaction: '', severity: 'Unknown' };
/** Me'yordan chiqqan qiymatlardan shunchasi ko'rinadi, qolgani «+N» */
const ABNORMAL_SHOWN = 6;
const rowLabel = 'w-[88px] shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wider leading-tight text-muted';
const fieldCls = 'w-full px-3 py-2 text-sm border border-line rounded-xl bg-surface text-ink';

export const PinnedFacts: React.FC<Props> = ({ patientId, summary, failed, canEdit, addToast, onChanged }) => {
    const { t, language } = useLanguage();
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(EMPTY_ALLERGY);
    const [saving, setSaving] = useState(false);

    const allergies = summary?.allergies || [];
    const chronic = summary?.chronic || [];
    const medications = summary?.activeMedications || [];
    const abnormal = summary?.abnormalResults || [];
    const severityLabel = (severity?: string | null): string =>
        severity === 'Severe' ? t('patienthistorypanel.ogir')
            : severity === 'Mild' ? t('card.pin.sevMild') : t('card.pin.sevUnknown');

    const submit = async () => {
        if (!form.substance.trim()) return;
        setSaving(true);
        try {
            await api.clinical.addAllergy(patientId, {
                substance: form.substance.trim(),
                reaction: form.reaction.trim() || undefined,
                severity: form.severity,
            });
            setForm(EMPTY_ALLERGY);
            setAdding(false);
            onChanged();
            addToast('success', t('patienthistorypanel.allergiya_qoshildi'));
        } catch (e: any) {
            addToast('error', e?.message || t('ui.saqlanmadi'));
        } finally { setSaving(false); }
    };

    const remove = async (id: string, substance: string) => {
        if (!await confirmAction({ title: fill(t('card.pin.removeAllergy'), substance), body: t('patienthistorypanel.faolsizlantirish_yozuv_saqlanadi') })) return;
        try { await api.clinical.removeAllergy(patientId, id); onChanged(); }
        catch (e: any) { addToast('error', e?.message || t('ui.ochirilmadi')); }
    };

    return (
        <dl className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas px-3 py-2.5">
            {failed && (
                <div role="alert" className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{t('ui.tarixni_yuklab_bolmadi')}</span>
                    <button type="button" onClick={onChanged} className="font-bold underline">{t('ui.qayta_urinish')}</button>
                </div>
            )}

            <div className="flex gap-2">
                <dt className={rowLabel}>{t('patienthistorypanel.allergiya_2')}</dt>
                <dd className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                    {allergies.map(a => (
                        <span key={a.id} title={[severityLabel(a.severity), a.reaction].filter(Boolean).join(' · ')}
                            className="inline-flex items-center gap-1 h-6 pl-2 pr-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs font-bold">
                            {a.substance}
                            {a.severity === 'Severe' && <span className="font-semibold">· {severityLabel('Severe')}</span>}
                            {canEdit && (
                                <button type="button" onClick={() => remove(a.id, a.substance)}
                                    aria-label={`${t('patienthistorypanel.faolsizlantirish_yozuv_saqlanadi')}: ${a.substance}`}
                                    title={t('patienthistorypanel.faolsizlantirish_yozuv_saqlanadi')}
                                    className="w-5 h-5 grid place-items-center rounded hover:bg-red-200 dark:hover:bg-red-900/60">
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </span>
                    ))}
                    {/* «Yo'q» faqat ma'lumot HAQIQATAN kelganda aytiladi */}
                    {summary === null
                        ? <span className="text-[13px] text-faint">{failed ? '—' : t('common.loading')}</span>
                        : allergies.length === 0 && <span className="text-[13px] text-faint">{t('ui.malumot_yoq')}</span>}
                    {canEdit && summary !== null && !adding && (
                        <button type="button" onClick={() => setAdding(true)}
                            className="inline-flex items-center gap-0.5 text-xs font-bold text-primary-700 dark:text-primary-300 hover:underline">
                            <Plus className="w-3 h-3" aria-hidden="true" />{t('patienthistorypanel.qoshish')}
                        </button>
                    )}
                </dd>
            </div>

            {adding && (
                <div role="group" aria-label={t('patienthistorypanel.allergiya_2')} className="flex flex-col gap-2 p-2.5 rounded-xl border border-line bg-surface">
                    <input value={form.substance} autoFocus className={fieldCls}
                        onChange={e => setForm(f => ({ ...f, substance: e.target.value }))}
                        placeholder={t('patienthistorypanel.dori_yoki_modda_masalan')} />
                    <input value={form.reaction} className={fieldCls}
                        onChange={e => setForm(f => ({ ...f, reaction: e.target.value }))}
                        placeholder={t('patienthistorypanel.qanday_namoyon_boldi_ixtiyoriy')} />
                    <div className="flex items-center gap-2">
                        <select value={form.severity} className={`${fieldCls} w-auto`}
                            aria-label={t('patienthistorypanel.ogir')}
                            onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                            <option value="Unknown">{severityLabel('Unknown')}</option>
                            <option value="Mild">{severityLabel('Mild')}</option>
                            <option value="Severe">{severityLabel('Severe')}</option>
                        </select>
                        <button type="button" onClick={submit} disabled={saving || !form.substance.trim()}
                            className="ml-auto px-3 py-2 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50">
                            {t('common.save')}
                        </button>
                        <button type="button" onClick={() => { setAdding(false); setForm(EMPTY_ALLERGY); }} className="px-2 py-2 text-sm text-muted">
                            {t('ui.bekor')}
                        </button>
                    </div>
                </div>
            )}

            {chronic.length > 0 && (
                <div className="flex gap-2">
                    <dt className={rowLabel}>{t('visit.chronic')}</dt>
                    <dd className="min-w-0 flex-1 text-[13px] text-ink">
                        {chronic.map((c, index) => (
                            <span key={c.id}>{index > 0 && ' · '}<b className="font-bold">{c.code}</b> {c.name}</span>
                        ))}
                    </dd>
                </div>
            )}

            {medications.length > 0 && (
                <div className="flex gap-2">
                    <dt className={rowLabel}>{t('card.pin.meds')}</dt>
                    <dd className="min-w-0 flex-1 text-[13px] text-ink">
                        {medications.map((m, index) => (
                            <span key={`${m.name}-${index}`}>
                                {index > 0 && ' · '}
                                {[m.name, m.dosage, m.frequency].filter(Boolean).join(' ')}
                                {m.date && <span className="text-xs text-muted"> ({formatDateShort(m.date, language)})</span>}
                            </span>
                        ))}
                    </dd>
                </div>
            )}

            {abnormal.length > 0 && (
                <div className="flex gap-2">
                    <dt className={rowLabel}>{t('card.pin.abnormal')}</dt>
                    <dd className="min-w-0 flex-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px]">
                        {abnormal.slice(0, ABNORMAL_SHOWN).map((r, index) => (
                            <span key={`${r.name}-${index}`} className="whitespace-nowrap">
                                <span className="text-muted">{r.name}</span>{' '}
                                <b className={`font-bold tabular-nums ${r.flag === 'High' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                    {r.value}{r.unit ? ` ${r.unit}` : ''} {r.flag === 'High' ? '↑' : '↓'}
                                </b>
                                {r.at && <span className="text-xs text-muted"> ({formatDateShort(r.at, language)})</span>}
                            </span>
                        ))}
                        {abnormal.length > ABNORMAL_SHOWN && (
                            <span className="text-xs font-bold text-muted">+{abnormal.length - ABNORMAL_SHOWN}</span>
                        )}
                    </dd>
                </div>
            )}
        </dl>
    );
};
