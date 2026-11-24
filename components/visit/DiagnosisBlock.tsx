import React, { useState } from 'react';
import { ICD10Code, PatientDiagnosis } from '../../types';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { ChipButton, PickerBox, inputCls } from './sheetParts';

/* Tashxis tanlovi — «+ Qo'shish» oynasidagi «Tashxis» turida: tez tugmalar
   va MKB-10 bo'yicha qidiruv. */

export const DiagnosisPicker: React.FC<{
    diagnoses: PatientDiagnosis[];
    /** Shifokor ko'p qo'yadigan tashxislar — qidirmasdan bir bosishda */
    recent?: ICD10Code[];
    busy: boolean;
    onAdd: (code: ICD10Code, isChronic: boolean) => Promise<unknown>;
}> = ({ diagnoses, recent = [], busy, onAdd }) => {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ICD10Code[]>([]);
    const [chronic, setChronic] = useState(false);

    /* Shu qabulda allaqachon qo'yilgani tugma bo'lib qayta chiqmaydi */
    const placed = new Set(diagnoses.map(d => d.code));
    const quick = recent.filter(c => !placed.has(c.code));

    const search = async (q: string) => {
        setQuery(q);
        if (q.trim().length < 2) { setResults([]); return; }
        try { setResults(await api.diagnoses.searchCodes(q.trim())); } catch { setResults([]); }
    };

    const add = async (code: ICD10Code) => {
        await onAdd(code, chronic);
        setQuery(''); setResults([]); setChronic(false);
    };

    return (
        <PickerBox title={t('visit.blockDx')}>
            {quick.length > 0 && (
                <div className="mb-4">
                    <p className="mb-1.5 text-xs font-medium text-muted">{t('visit.recentDx')}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {quick.map(c => (
                            <ChipButton key={c.code} disabled={busy} onClick={() => add(c)} title={c.name}>
                                <b className="text-primary-700 dark:text-primary-300">{c.code}</b>
                                <span className="max-w-[220px] truncate">{c.name}</span>
                            </ChipButton>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <input value={query} onChange={e => search(e.target.value)} className={`${inputCls} flex-1 min-w-[200px]`}
                    aria-label={t('visit.diagnosisTitle')} placeholder={t('visit.icdSearchPh')} />
                <label className="flex items-center gap-2 text-sm text-muted whitespace-nowrap">
                    <input type="checkbox" checked={chronic} onChange={e => setChronic(e.target.checked)}
                        className="w-4 h-4 rounded text-primary-600" />
                    {t('visit.chronicMark')}
                </label>
            </div>
            {results.length > 0 && (
                <div className="mt-2 border border-line rounded-xl bg-surface divide-y divide-line max-h-64 overflow-y-auto">
                    {results.slice(0, 12).map(c => (
                        <button type="button" key={c.code} onClick={() => add(c)} disabled={busy}
                            className="w-full text-left p-2.5 text-sm hover:bg-elevated">
                            <b className="text-primary-700 dark:text-primary-300">{c.code}</b>
                            <span className="text-muted"> — {c.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </PickerBox>
    );
};
