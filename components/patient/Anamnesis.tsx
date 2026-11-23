import React, { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { confirmAction } from '../../services/confirm';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatDate } from '../../utils/format';
import { Chip, Row, PickBox, addBtn } from './anamnesisParts';
import {
    AllergyPicker, BloodPicker, ConditionsPicker, FamilyPicker, HabitsPicker, InfectionsPicker,
    MedsPicker, PregnancyPicker, SurgeriesPicker, medTone,
} from './AnamnesisPickers';
import { AnamnesisData, FAMILY, Lang, SURGERIES, catalogLabel, parseAnamnesis, isThinner } from './anamnesisData';
import { historyLines, lineGroup, lineView, withoutLine, conditionOf } from './conditions';
import type { TranslationKey } from '../../i18n/translations';

/* ─────────────────────────────────────────────────────────────────────────────
   TIBBIY TARIX (ANAMNEZ) — «Umumiy» tabidagi «Tibbiy tarix» blokining boshi.

   Shifokor dori yozish yoki tish olishdan OLDIN bilishi kerak bo'lgan hamma
   narsa — bitta qarashda. Klinika egasi (2026-11-21): «tibbiy tarix ancha
   zo'r bo'lishi kerak, buni ko'pchilik so'radi». Rejasi ko'rsatildi va
   tasdiqlandi: to'qqiz bo'lim, hammasi bosib tanlanadi, registrator ham
   to'ldiradi.

   QOIDALAR:
     · Har bo'lim — bitta qator. Faqat SO'RALGAN bo'lim chiziladi; qolganlari
       pastdagi bitta sariq qatorga yig'iladi («Hali so'ralmagan: …»).
       Shunda bo'sh bemorda o'nta bo'sh qator turmaydi, to'ldirilganida esa
       hamma narsa ko'rinadi.
     · «Yo'q» va «so'ralmagan» — ikki boshqa narsa. «Allergiyasi yo'q» —
       yashil belgi, so'ralmagani — sariq qatorda. Ma'lumot yuklanmagan
       bo'lsa «yo'q» deb YOZILMAYDI.
     · Tanlash qatorning ostida, shu joyda ochiladi — oyna chiqmaydi.
       Bosildi — saqlandi, «Saqlash» tugmasi yo'q.
     · Allergiya o'chirilmaydi — faolsizlantiriladi, tasdiq bilan.
     · Sarlavha yonida kim va qachon yangilagani.
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

type Section = 'allergies' | 'conditions' | 'meds' | 'surgeries' | 'family' | 'habits' | 'blood' | 'pregnancy' | 'infections';

const SECTION_LABEL: Record<Section, TranslationKey> = {
    allergies: 'anamnesis.s.allergies', conditions: 'anamnesis.conditions', meds: 'anamnesis.s.meds',
    surgeries: 'anamnesis.s.surgeries', family: 'anamnesis.s.family', habits: 'anamnesis.s.habits',
    blood: 'anamnesis.s.blood', pregnancy: 'anamnesis.s.pregnancy', infections: 'anamnesis.s.infections',
};
/** Ro'yxati bor bo'limlar — tugmasi «+ Qo'shish»; qolganlari bitta javob — «O'zgartirish» */
const LIST_SECTIONS = new Set<Section>(['allergies', 'conditions', 'meds', 'surgeries', 'family', 'infections']);

interface Props {
    patientId: string;
    gender?: string;
    /** `null` — hali yuklanmagan (yoki yuklanmay qolgan, `failed` ga qarang) */
    summary: ClinicalSummary | null;
    /** Oxirgi so'rov xato bilan tugadi. `summary` bo'lsa — u ESKI nusxa. */
    failed: boolean;
    /** Kasalliklar matni (`Patient.medicalHistory`): har satr — bitta yozuv */
    historyText: string;
    /** Qolgan bo'limlar (`Patient.anamnesis`, JSON) */
    anamnesisRaw: string;
    updatedAt?: string | null;
    updatedBy?: string | null;
    canEditAllergies: boolean;
    canEditHistory: boolean;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
    onChanged: () => void;
    onHistoryChange: (text: string) => void;
    onAnamnesisChange: (data: AnamnesisData) => void;
}

export const Anamnesis: React.FC<Props> = ({
    patientId, gender, summary, failed, historyText, anamnesisRaw, updatedAt, updatedBy,
    canEditAllergies, canEditHistory, addToast, onChanged, onHistoryChange, onAnamnesisChange,
}) => {
    const { t, language } = useLanguage();
    const lang = language as Lang;
    const [open, setOpen] = useState<Section | null>(null);
    const [busy, setBusy] = useState(false);

    const data = parseAnamnesis(anamnesisRaw);
    const allergies = summary?.allergies || [];
    const chronic = summary?.chronic || [];
    const lines = historyLines(historyText);
    const byGroup = (g: ReturnType<typeof lineGroup>) => lines.filter(line => lineGroup(line) === g);
    const conditionLines = [...byGroup('healthy'), ...byGroup('chronic')];
    /* Tashxisda «surunkali» deb qo'yilgani bilan bir xil kodli satr ikki marta chiqmasin */
    const chronicCodes = new Set(chronic.map(c => c.code));
    const shownConditionLines = conditionLines.filter(line => {
        const code = lineView(line, lang, t).code;
        return !code || !chronicCodes.has(code);
    });
    const infectionLines = byGroup('infection');
    const pregnancyLines = byGroup('pregnancy');
    const isFemale = gender === 'Female';
    const loaded = summary !== null;

    const severityLabel = (severity?: string | null): string =>
        severity === 'Severe' ? t('patienthistorypanel.ogir')
            : severity === 'Mild' ? t('card.pin.sevMild') : t('card.pin.sevUnknown');

    /** Bo'lim so'ralganmi: biror yozuv yoki «yo'q» belgisi bor */
    const asked: Record<Section, boolean> = {
        allergies: allergies.length > 0 || !!data.none?.allergies,
        conditions: chronic.length > 0 || conditionLines.length > 0,
        meds: (data.meds || []).length > 0 || !!data.none?.meds,
        surgeries: (data.surgeries || []).length > 0 || !!data.none?.surgeries,
        family: (data.family || []).length > 0 || !!data.none?.family,
        habits: !!data.smoking || !!data.alcohol,
        blood: !!data.blood,
        pregnancy: !!data.pregnancy || pregnancyLines.length > 0,
        infections: infectionLines.length > 0 || !!data.none?.infections,
    };
    const order: Section[] = ['allergies', 'conditions', 'meds', 'surgeries', 'family', 'habits', 'blood',
        ...(isFemale ? ['pregnancy' as const] : []), 'infections'];
    const canEdit = (s: Section) => (s === 'allergies' ? canEditAllergies && loaded : canEditHistory);
    /* Ma'lumot yuklanmagan bo'lsa allergiya va kasallik «so'ralmagan» ham deb
       aytilmaydi — biz bilmaymiz. */
    const unknownYet = (s: Section) => !loaded && (s === 'allergies' || s === 'conditions');
    const shown = order.filter(s => asked[s] || open === s);
    const notAsked = order.filter(s => !asked[s] && open !== s && !unknownYet(s));

    // ── Allergiya amallari (alohida jadval, darhol serverga) ──────────────
    const addAllergy = async (a: { substance: string; reaction?: string; severity: string }) => {
        setBusy(true);
        try {
            await api.clinical.addAllergy(patientId, a);
            if (data.none?.allergies) onAnamnesisChange({ ...data, none: { ...data.none, allergies: false } });
            onChanged();
        } catch (e: any) {
            addToast('error', e?.message || t('ui.saqlanmadi'));
        } finally { setBusy(false); }
    };
    const removeAllergy = async (id: string, substance: string) => {
        if (!await confirmAction({ title: fill(t('card.pin.removeAllergy'), substance), body: t('patienthistorypanel.faolsizlantirish_yozuv_saqlanadi') })) return;
        setBusy(true);
        try { await api.clinical.removeAllergy(patientId, id); onChanged(); }
        catch (e: any) { addToast('error', e?.message || t('ui.ochirilmadi')); }
        finally { setBusy(false); }
    };

    const removeLine = (line: string, name: string) =>
        canEditHistory ? { onRemove: () => onHistoryChange(withoutLine(historyText, line)), removeLabel: fill(t('anamnesis.remove'), name) } : {};
    const removeFromData = (s: Section, next: AnamnesisData, name: string) =>
        canEdit(s) ? { onRemove: () => onAnamnesisChange(next), removeLabel: fill(t('anamnesis.remove'), name) } : {};

    // ── Har bo'limning belgilari ─────────────────────────────────────────
    const chips = (s: Section): React.ReactNode => {
        switch (s) {
            case 'allergies':
                if (!loaded) return <li className="text-[13px] text-faint">{failed ? '—' : t('common.loading')}</li>;
                return allergies.length ? allergies.map(a => (
                    <Chip key={a.id} tone="red" title={[severityLabel(a.severity), a.reaction].filter(Boolean).join(' · ')}
                        note={a.severity === 'Severe' ? severityLabel('Severe').toLowerCase() : undefined}
                        {...(canEditAllergies ? { onRemove: () => removeAllergy(a.id, a.substance), removeLabel: `${t('patienthistorypanel.faolsizlantirish_yozuv_saqlanadi')}: ${a.substance}` } : {})}>
                        {a.substance}
                    </Chip>
                )) : data.none?.allergies ? <Chip tone="ok">{t('anamnesis.none.allergies')}</Chip> : null;
            case 'conditions':
                return [
                    ...chronic.map(c => <Chip key={c.id} code={c.code} title={c.code}>{c.name}</Chip>),
                    ...shownConditionLines.map(line => {
                        const v = lineView(line, lang, t);
                        const healthy = conditionOf(line)?.group === 'healthy';
                        return <Chip key={line} tone={healthy ? 'ok' : 'plain'} code={v.code} {...removeLine(line, v.name)}>{v.name}</Chip>;
                    }),
                ];
            case 'infections':
                return infectionLines.length ? infectionLines.map(line => {
                    const v = lineView(line, lang, t);
                    return <Chip key={line} tone="red" code={v.code} {...removeLine(line, v.name)}>{v.name}</Chip>;
                }) : data.none?.infections ? <Chip tone="ok">{t('anamnesis.none.infections')}</Chip> : null;
            case 'meds':
                return (data.meds || []).length ? (data.meds || []).map(m => (
                    <Chip key={m} tone={medTone(m)} note={isThinner(m) ? t('anamnesis.thinner') : undefined}
                        {...removeFromData('meds', { ...data, meds: (data.meds || []).filter(x => x !== m) }, m)}>{m}</Chip>
                )) : data.none?.meds ? <Chip tone="ok">{t('anamnesis.none.meds')}</Chip> : null;
            case 'surgeries':
                return (data.surgeries || []).length ? (data.surgeries || []).map((x, i) => {
                    const name = catalogLabel(SURGERIES, x.name, lang);
                    return <Chip key={`${x.name}-${i}`} note={x.year}
                        {...removeFromData('surgeries', { ...data, surgeries: (data.surgeries || []).filter((_, j) => j !== i) }, name)}>{name}</Chip>;
                }) : data.none?.surgeries ? <Chip tone="ok">{t('anamnesis.none.surgeries')}</Chip> : null;
            case 'family':
                return (data.family || []).length ? (data.family || []).map(f => {
                    const name = catalogLabel(FAMILY, f, lang);
                    return <Chip key={f} {...removeFromData('family', { ...data, family: (data.family || []).filter(x => x !== f) }, name)}>{name}</Chip>;
                }) : data.none?.family ? <Chip tone="ok">{t('anamnesis.none.family')}</Chip> : null;
            case 'habits':
                return [
                    data.smoking && <Chip key="s" tone={data.smoking === 'yes' ? 'amber' : 'ok'}>{t(`anamnesis.smoke.${data.smoking}`)}</Chip>,
                    data.alcohol && <Chip key="a" tone={data.alcohol === 'yes' ? 'amber' : 'ok'}>{t(`anamnesis.alcohol.${data.alcohol}`)}</Chip>,
                ];
            case 'blood':
                if (!data.blood) return null;
                return data.blood === 'unknown'
                    ? <Chip>{t('anamnesis.blood.unknown')}</Chip>
                    : <Chip>{`${data.blood}${data.rh ? ` · Rh${data.rh === '+' ? '+' : '−'}` : ''}`}</Chip>;
            case 'pregnancy':
                return [
                    data.pregnancy && <Chip key="p" tone={data.pregnancy === 'no' ? 'ok' : 'amber'}>{t(`anamnesis.preg.${data.pregnancy}`)}</Chip>,
                    ...pregnancyLines.map(line => {
                        const v = lineView(line, lang, t);
                        return <Chip key={line} tone="amber" code={v.code} {...removeLine(line, v.name)}>{v.name}</Chip>;
                    }),
                ];
        }
    };

    const picker = (s: Section): React.ReactNode => {
        const p = { data, onChange: onAnamnesisChange };
        switch (s) {
            case 'allergies':
                return <AllergyPicker {...p} allergies={allergies} busy={busy} severityLabel={severityLabel}
                    onAdd={addAllergy} onRemove={removeAllergy} />;
            case 'conditions': return <ConditionsPicker historyText={historyText} onHistoryChange={onHistoryChange} />;
            case 'infections': return <InfectionsPicker {...p} historyText={historyText} onHistoryChange={onHistoryChange} />;
            case 'meds': return <MedsPicker {...p} />;
            case 'surgeries': return <SurgeriesPicker {...p} />;
            case 'family': return <FamilyPicker {...p} />;
            case 'habits': return <HabitsPicker {...p} />;
            case 'blood': return <BloodPicker {...p} />;
            case 'pregnancy': return <PregnancyPicker {...p} />;
        }
    };

    const stamp = updatedAt
        ? (updatedBy ? fill(t('anamnesis.updated'), formatDate(updatedAt), updatedBy) : fill(t('anamnesis.updatedAt'), formatDate(updatedAt)))
        : '';

    return (
        <section aria-labelledby="anamnesis-title" className="min-w-0 flex flex-col gap-3">
            {/* Sarlavha emas: blokning ko'rinadigan sarlavhasi «Tibbiy tarix»
                `VisitPanel` da turibdi, ikkinchi bir xil sarlavha ortiqcha. */}
            <span id="anamnesis-title" className="sr-only">{t('anamnesis.title')}</span>
            {stamp && <p className="-mt-2 text-xs text-faint">{stamp}</p>}

            {failed && (
                <div role="alert" className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{t('ui.tarixni_yuklab_bolmadi')}</span>
                    <button type="button" onClick={onChanged} className="font-bold underline">{t('ui.qayta_urinish')}</button>
                </div>
            )}

            {shown.length > 0 && (
                <div className="flex flex-col gap-3">
                    {shown.map(s => {
                        const label = t(SECTION_LABEL[s]);
                        return (
                            <Row key={s} id={`anamnesis-${s}`} label={label}
                                action={canEdit(s) && open !== s ? (
                                    <button type="button" onClick={() => setOpen(s)} className={addBtn}
                                        aria-label={fill(t('anamnesis.editSection'), label)}>
                                        {LIST_SECTIONS.has(s)
                                            ? <><Plus className="w-3.5 h-3.5" aria-hidden="true" />{t('anamnesis.add')}</>
                                            : t('anamnesis.change')}
                                    </button>
                                ) : undefined}
                                picker={open === s ? (
                                    <PickBox label={label} doneLabel={t('ui.tayyor')} onDone={() => setOpen(null)}>
                                        {picker(s)}
                                    </PickBox>
                                ) : undefined}>
                                {chips(s)}
                            </Row>
                        );
                    })}
                </div>
            )}

            {notAsked.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-[13px] text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">{t('anamnesis.notAsked')}</span>
                    {notAsked.map(s => canEdit(s) ? (
                        <button key={s} type="button" onClick={() => setOpen(s)}
                            className="inline-flex items-center min-h-7 px-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-surface text-ink font-medium hover:border-primary-400">
                            {t(SECTION_LABEL[s])}
                        </button>
                    ) : (
                        <span key={s} className="px-1 font-medium">{t(SECTION_LABEL[s])}</span>
                    ))}
                    {notAsked.some(canEdit) && <span className="opacity-80">— {t('anamnesis.notAskedHint')}</span>}
                </div>
            )}
        </section>
    );
};
