import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ICD10Code, PatientDiagnosis } from '../../types';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { AddButton, PickerBox, SheetLabel, inputCls } from './sheetParts';

/* Varaqdagi «Tashxis» bo'limi: qo'yilganlari nishon bo'lib turadi, yangisi
   MKB-10 bo'yicha qidiruvdan tanlanadi.

   Tashxis hali yo'q bo'lsa qidiruv OCHIQ turadi: shifokor avval «+» ni bosib
   o'tirmasin — tashxissiz qabul baribir yakunlanmaydi. */

interface Props {
    diagnoses: PatientDiagnosis[];
    /** Yozib bo'lmaydi: yakunlangan qabul yoki registrator */
    readOnly: boolean;
    /** «+ tashxis» bosilgan */
    pickerOpen: boolean;
    busy: boolean;
    onTogglePicker: () => void;
    onAdd: (code: ICD10Code, isChronic: boolean) => Promise<unknown>;
    onRemove: (id: string) => void;
}

export const DiagnosisBlock: React.FC<Props> = ({
    diagnoses, readOnly, pickerOpen, busy, onTogglePicker, onAdd, onRemove,
}) => {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ICD10Code[]>([]);
    const [chronic, setChronic] = useState(false);

    const open = !readOnly && (pickerOpen || diagnoses.length === 0);

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
        <div className="flex flex-col gap-2">
            <SheetLabel>{t('visit.diagnosisTitle')}</SheetLabel>
            {(diagnoses.length > 0 || readOnly) && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {diagnoses.map(d => (
                        <span key={d.id} className="inline-flex items-center gap-2 min-h-[34px] py-1 pl-3 pr-1.5 rounded-[10px] border-[1.5px] border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-[13px] font-bold text-ink">
                            <b className="font-bold text-primary-700 dark:text-primary-300">{d.code}</b>
                            {d.icd10?.name}
                            {d.isChronic && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold uppercase">
                                    {t('visit.chronic')}
                                </span>
                            )}
                            {!readOnly && (
                                <button type="button" onClick={() => onRemove(d.id)} aria-label={`${t('common.delete')}: ${d.code}`}
                                    className="w-[22px] h-[22px] grid place-items-center rounded-md text-muted hover:text-red-600">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </span>
                    ))}
                    {diagnoses.length === 0 && <span className="text-sm text-faint">{t('card.noDiagnoses')}</span>}
                    {!readOnly && diagnoses.length > 0 && (
                        <AddButton label={t('visit.addDx')} open={pickerOpen} onClick={onTogglePicker} />
                    )}
                </div>
            )}
            {open && (
                <PickerBox>
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
                        <div className="mt-2 border border-line rounded-xl bg-surface divide-y divide-line max-h-48 overflow-y-auto">
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
            )}
        </div>
    );
};
