import React, { useState } from 'react';
import { api } from '../../services/api';
import { ICD10Code } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { AddText, Opt, OptRow, fieldCls } from './anamnesisParts';
import {
    AnamnesisData, ALLERGENS, BLOOD_GROUPS, FAMILY, Lang, MEDS, NoneKey, SURGERIES,
    catalogLabel, hasText, isThinner, toggleText, withoutNone,
} from './anamnesisData';
import {
    COMMON_CONDITIONS, CommonCondition, codedLine, conditionLabel, conditionOf, historyLines, toggleCondition, withLine,
} from './conditions';

/* ─────────────────────────────────────────────────────────────────────────────
   TIBBIY TARIX — HAR BO'LIMNING TANLASH QUTISI.

   Hammasi bosib tanlanadi va darhol saqlanadi: «Saqlash» tugmasi yo'q.
   Xato bosilgani yana bosilsa olinadi. Har qutida «Yo'q» tugmasi bor —
   u ro'yxat bo'sh bo'lgandagina yoqiladi: «allergiyasi yo'q» va yonida
   «Lidokain» bir vaqtda turishi mumkin emas.
   ───────────────────────────────────────────────────────────────────────────── */

interface DataProps {
    data: AnamnesisData;
    onChange: (next: AnamnesisData) => void;
}

/** «Yo'q» tugmasi: ro'yxat bo'sh bo'lsagina bosiladi */
const NoneOpt: React.FC<DataProps & { k: NoneKey; label: string; blocked: boolean }> = ({ data, onChange, k, label, blocked }) => {
    const { t } = useLanguage();
    const on = !!data.none?.[k];
    return (
        <Opt on={on} dashed disabled={blocked && !on} title={blocked ? t('anamnesis.noneBlocked') : undefined}
            onClick={() => onChange({ ...data, none: { ...data.none, [k]: !on } })}>
            {label}
        </Opt>
    );
};

// ── Allergiya ───────────────────────────────────────────────────────────────

const SEVERITIES = ['Unknown', 'Mild', 'Severe'] as const;

export const AllergyPicker: React.FC<DataProps & {
    allergies: { id: string; substance: string }[];
    busy: boolean;
    severityLabel: (s: string) => string;
    onAdd: (a: { substance: string; reaction?: string; severity: string }) => void;
    onRemove: (id: string, substance: string) => void;
}> = ({ data, onChange, allergies, busy, severityLabel, onAdd, onRemove }) => {
    const { t } = useLanguage();
    const [form, setForm] = useState({ substance: '', reaction: '', severity: 'Unknown' });
    const active = (name: string) => allergies.find(a => a.substance.trim().toLowerCase() === name.toLowerCase());
    const submit = () => {
        if (!form.substance.trim()) return;
        onAdd({ substance: form.substance.trim(), reaction: form.reaction.trim() || undefined, severity: form.severity });
        setForm({ substance: '', reaction: '', severity: 'Unknown' });
    };
    return (
        <>
            <OptRow>
                <NoneOpt data={data} onChange={onChange} k="allergies" label={t('anamnesis.none.allergies')} blocked={allergies.length > 0} />
                {ALLERGENS.map(name => {
                    const rec = active(name);
                    return (
                        <Opt key={name} on={!!rec} disabled={busy}
                            onClick={() => rec ? onRemove(rec.id, rec.substance) : onAdd({ substance: name, severity: 'Unknown' })}>
                            {name}
                        </Opt>
                    );
                })}
            </OptRow>
            <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted">{t('anamnesis.otherAllergy')}</span>
                <input value={form.substance} className={fieldCls} aria-label={t('anamnesis.otherAllergy')}
                    onChange={e => setForm(f => ({ ...f, substance: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                    placeholder={t('patienthistorypanel.dori_yoki_modda_masalan')} />
                {form.substance.trim() && (
                    <div className="flex flex-wrap items-center gap-2">
                        <input value={form.reaction} className={`${fieldCls} flex-1 min-w-[12rem]`}
                            onChange={e => setForm(f => ({ ...f, reaction: e.target.value }))}
                            placeholder={t('patienthistorypanel.qanday_namoyon_boldi_ixtiyoriy')} />
                        <select value={form.severity} className={`${fieldCls} w-auto`} aria-label={t('patienthistorypanel.ogir')}
                            onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                            {SEVERITIES.map(s => <option key={s} value={s}>{severityLabel(s)}</option>)}
                        </select>
                        <button type="button" onClick={submit} disabled={busy}
                            className="px-3 py-2 text-sm font-bold border border-line rounded-xl text-ink hover:border-primary-400 disabled:opacity-50">
                            {t('anamnesis.add')}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

// ── Kasalliklari (surunkali) ────────────────────────────────────────────────

export const ConditionsPicker: React.FC<{ historyText: string; onHistoryChange: (text: string) => void }> = ({ historyText, onHistoryChange }) => {
    const { t, language } = useLanguage();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ICD10Code[]>([]);
    const lines = historyLines(historyText);
    const isOn = (c: CommonCondition) => lines.some(line => conditionOf(line) === c);
    const list = COMMON_CONDITIONS.filter(c => c.group === 'chronic' || c.group === 'healthy');

    const search = async (q: string) => {
        setQuery(q);
        if (q.trim().length < 2) { setResults([]); return; }
        try { setResults(await api.diagnoses.searchCodes(q.trim())); } catch { setResults([]); }
    };
    const addCode = (c: ICD10Code) => {
        onHistoryChange(withLine(historyText, codedLine(c.name, c.code)));
        setQuery(''); setResults([]);
    };

    return (
        <>
            <OptRow>
                {list.map(c => (
                    <Opt key={c.value} on={isOn(c)} dashed={c.group === 'healthy'} code={c.code}
                        onClick={() => onHistoryChange(toggleCondition(historyText, c))}>
                        {conditionLabel(c, language as Lang, t)}
                    </Opt>
                ))}
            </OptRow>
            <div className="flex flex-col gap-1.5">
                <input value={query} onChange={e => search(e.target.value)} className={fieldCls}
                    aria-label={t('anamnesis.icdSearch')} placeholder={t('anamnesis.icdSearch')} />
                {results.length > 0 && (
                    <div className="border border-line rounded-xl bg-surface divide-y divide-line max-h-56 overflow-y-auto">
                        {results.slice(0, 10).map(c => (
                            <button type="button" key={c.code} onClick={() => addCode(c)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-elevated">
                                <b className="text-primary-700 dark:text-primary-300">{c.code}</b>
                                <span className="text-muted"> — {c.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <AddText placeholder={t('anamnesis.other')} addLabel={t('anamnesis.add')}
                onAdd={text => onHistoryChange(withLine(historyText, text))} />
        </>
    );
};

// ── Yuqumli kasalliklar ─────────────────────────────────────────────────────

export const InfectionsPicker: React.FC<DataProps & { historyText: string; onHistoryChange: (text: string) => void }> = ({
    data, onChange, historyText, onHistoryChange,
}) => {
    const { t, language } = useLanguage();
    const lines = historyLines(historyText);
    const list = COMMON_CONDITIONS.filter(c => c.group === 'infection');
    const isOn = (c: CommonCondition) => lines.some(line => conditionOf(line) === c);
    const anyOn = list.some(isOn);
    return (
        <OptRow>
            <NoneOpt data={data} onChange={onChange} k="infections" label={t('anamnesis.none.infections')} blocked={anyOn} />
            {list.map(c => (
                <Opt key={c.value} on={isOn(c)} code={c.code}
                    onClick={() => {
                        if (!isOn(c) && data.none?.infections) onChange(withoutNone(data, 'infections'));
                        onHistoryChange(toggleCondition(historyText, c));
                    }}>
                    {conditionLabel(c, language as Lang, t)}
                </Opt>
            ))}
        </OptRow>
    );
};

// ── Doimiy dorilar ──────────────────────────────────────────────────────────

export const MedsPicker: React.FC<DataProps> = ({ data, onChange }) => {
    const { t } = useLanguage();
    const meds = data.meds || [];
    const toggle = (name: string) => onChange({ ...withoutNone(data, 'meds'), meds: toggleText(meds, name) });
    return (
        <>
            <OptRow>
                <NoneOpt data={data} onChange={onChange} k="meds" label={t('anamnesis.none.meds')} blocked={meds.length > 0} />
                {MEDS.map(m => (
                    <Opt key={m.name} on={hasText(meds, m.name)} onClick={() => toggle(m.name)}
                        title={m.thinner ? t('anamnesis.thinner') : undefined}>
                        {m.name}
                    </Opt>
                ))}
            </OptRow>
            <AddText placeholder={t('anamnesis.otherMed')} addLabel={t('anamnesis.add')}
                onAdd={text => { if (!hasText(meds, text)) toggle(text); }} />
        </>
    );
};

/** Dori belgisining rangi va izohi — kartadagi qator uchun */
export const medTone = (name: string) => (isThinner(name) ? 'amber' as const : 'plain' as const);

// ── Operatsiyalar ───────────────────────────────────────────────────────────

export const SurgeriesPicker: React.FC<DataProps> = ({ data, onChange }) => {
    const { t, language } = useLanguage();
    const list = data.surgeries || [];
    const [name, setName] = useState('');
    const [year, setYear] = useState('');
    const has = (id: string) => list.some(s => s.name === id);
    const set = (next: typeof list) => onChange({ ...withoutNone(data, 'surgeries'), surgeries: next });
    const submit = () => {
        const text = name.trim();
        if (!text) return;
        set([...list, { name: text, ...(year.trim() ? { year: year.trim() } : {}) }]);
        setName(''); setYear('');
    };
    return (
        <>
            <OptRow>
                <NoneOpt data={data} onChange={onChange} k="surgeries" label={t('anamnesis.none.surgeries')} blocked={list.length > 0} />
                {SURGERIES.map(s => (
                    <Opt key={s.id} on={has(s.id)}
                        onClick={() => set(has(s.id) ? list.filter(x => x.name !== s.id) : [...list, { name: s.id }])}>
                        {catalogLabel(SURGERIES, s.id, language as Lang)}
                    </Opt>
                ))}
            </OptRow>
            <div className="flex gap-2">
                <input value={name} className={fieldCls} aria-label={t('anamnesis.surgeryName')} placeholder={t('anamnesis.surgeryName')}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
                <input value={year} className={`${fieldCls} w-24 shrink-0`} aria-label={t('anamnesis.year')} placeholder={t('anamnesis.year')}
                    inputMode="numeric" maxLength={4}
                    onChange={e => setYear(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
                <button type="button" onClick={submit} disabled={!name.trim()}
                    className="shrink-0 px-3 py-2 text-sm font-bold border border-line rounded-xl text-ink hover:border-primary-400 disabled:opacity-50">
                    {t('anamnesis.add')}
                </button>
            </div>
        </>
    );
};

// ── Oilada ──────────────────────────────────────────────────────────────────

export const FamilyPicker: React.FC<DataProps> = ({ data, onChange }) => {
    const { t, language } = useLanguage();
    const list = data.family || [];
    const toggle = (value: string) => onChange({ ...withoutNone(data, 'family'), family: toggleText(list, value) });
    return (
        <>
            <OptRow>
                <NoneOpt data={data} onChange={onChange} k="family" label={t('anamnesis.none.family')} blocked={list.length > 0} />
                {FAMILY.map(f => (
                    <Opt key={f.id} on={hasText(list, f.id)} onClick={() => toggle(f.id)}>
                        {catalogLabel(FAMILY, f.id, language as Lang)}
                    </Opt>
                ))}
            </OptRow>
            <AddText placeholder={t('anamnesis.otherFamily')} addLabel={t('anamnesis.add')}
                onAdd={text => { if (!hasText(list, text)) toggle(text); }} />
        </>
    );
};

// ── Odatlari ────────────────────────────────────────────────────────────────

export const HabitsPicker: React.FC<DataProps> = ({ data, onChange }) => {
    const { t } = useLanguage();
    const pick = <K extends 'smoking' | 'alcohol'>(key: K, value: AnamnesisData[K]) =>
        onChange({ ...data, [key]: data[key] === value ? undefined : value });
    return (
        <>
            <OptRow label={t('anamnesis.smoking')}>
                {(['no', 'yes', 'quit'] as const).map(v => (
                    <Opt key={v} on={data.smoking === v} onClick={() => pick('smoking', v)}>{t(`anamnesis.smoke.${v}`)}</Opt>
                ))}
            </OptRow>
            <OptRow label={t('anamnesis.alcohol')}>
                {(['no', 'yes'] as const).map(v => (
                    <Opt key={v} on={data.alcohol === v} onClick={() => pick('alcohol', v)}>{t(`anamnesis.alcohol.${v}`)}</Opt>
                ))}
            </OptRow>
        </>
    );
};

// ── Qon guruhi ──────────────────────────────────────────────────────────────

export const BloodPicker: React.FC<DataProps> = ({ data, onChange }) => {
    const { t } = useLanguage();
    return (
        <>
            <OptRow label={t('anamnesis.s.blood')}>
                {BLOOD_GROUPS.map(g => (
                    <Opt key={g.value} on={data.blood === g.value}
                        onClick={() => onChange({ ...data, blood: data.blood === g.value ? undefined : g.value })}>
                        {g.text}
                    </Opt>
                ))}
                <Opt on={data.blood === 'unknown'} dashed
                    onClick={() => onChange({ ...data, blood: data.blood === 'unknown' ? undefined : 'unknown', rh: undefined })}>
                    {t('anamnesis.blood.unknown')}
                </Opt>
            </OptRow>
            {data.blood && data.blood !== 'unknown' && (
                <OptRow label={t('anamnesis.rh')}>
                    {(['+', '-'] as const).map(v => (
                        <Opt key={v} on={data.rh === v} onClick={() => onChange({ ...data, rh: data.rh === v ? undefined : v })}>
                            {v === '+' ? 'Rh+' : 'Rh−'}
                        </Opt>
                    ))}
                </OptRow>
            )}
        </>
    );
};

// ── Homiladorlik ────────────────────────────────────────────────────────────

export const PregnancyPicker: React.FC<DataProps> = ({ data, onChange }) => {
    const { t } = useLanguage();
    return (
        <OptRow>
            {(['no', 'yes', 'breastfeeding'] as const).map(v => (
                <Opt key={v} on={data.pregnancy === v}
                    onClick={() => onChange({ ...data, pregnancy: data.pregnancy === v ? undefined : v })}>
                    {t(`anamnesis.preg.${v}`)}
                </Opt>
            ))}
        </OptRow>
    );
};
