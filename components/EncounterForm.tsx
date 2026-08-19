import React, { useMemo, useState, useEffect } from 'react';
import { ClipboardList, Save, ChevronDown } from 'lucide-react';
import type { Department, EncounterTemplate, EncounterField } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   Qabul bayoni — tish kartasining o'rnini bosadi.

   TeethChart 32 ta tishni qattiq kodlangan holda chizardi. Bu komponent esa
   hech narsani qattiq kodlamaydi: bo'lim shabloni qanday maydonlar bersa,
   shularni chizadi. Shuning uchun kardiolog, ginekolog va pediatr bir xil
   komponentdan foydalanadi — farq faqat shablonda.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    departments: Department[];
    templates: EncounterTemplate[];
    departmentId?: string;
    templateId?: string;
    /** Saqlangan qiymatlar (JSON matn yoki obyekt) */
    value?: string | Record<string, any> | null;
    readOnly?: boolean;
    onChange?: (data: Record<string, any>, templateId: string | undefined) => void;
    onSave?: (data: Record<string, any>, templateId: string | undefined) => void;
    onDepartmentChange?: (departmentId: string) => void;
}

const parseValue = (v: Props['value']): Record<string, any> => {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v) || {}; } catch { return {}; }
};

export const EncounterForm: React.FC<Props> = ({
    departments, templates, departmentId, templateId,
    value, readOnly = false, onChange, onSave, onDepartmentChange,
}) => {
    const [data, setData] = useState<Record<string, any>>(() => parseValue(value));
    const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(templateId);
    const [dirty, setDirty] = useState(false);

    // Tashqaridan boshqa bemor/qabul kelsa, formani qayta yuklaymiz
    useEffect(() => { setData(parseValue(value)); setDirty(false); }, [value]);
    useEffect(() => { setActiveTemplateId(templateId); }, [templateId]);

    const clinicalDepartments = useMemo(
        () => departments.filter(d => d.isActive && d.type === 'CLINICAL'),
        [departments],
    );

    const deptTemplates = useMemo(
        () => templates.filter(t => !departmentId || t.departmentId === departmentId),
        [templates, departmentId],
    );

    // Shablon tanlanmagan bo'lsa — bo'limning standart shabloni
    const template = useMemo(() => {
        if (activeTemplateId) return deptTemplates.find(t => t.id === activeTemplateId) || deptTemplates[0];
        return deptTemplates.find(t => t.isDefault) || deptTemplates[0];
    }, [deptTemplates, activeTemplateId]);

    // Maydonlarni guruhlarga ajratamiz — bitta uzun ro'yxat o'qib bo'lmaydigan bo'ladi
    const groups = useMemo(() => {
        const fields: EncounterField[] = template?.fields || [];
        const map = new Map<string, EncounterField[]>();
        for (const f of fields) {
            const g = f.group || 'Umumiy';
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(f);
        }
        return Array.from(map.entries());
    }, [template]);

    const update = (key: string, v: any) => {
        const next = { ...data, [key]: v };
        setData(next);
        setDirty(true);
        onChange?.(next, template?.id);
    };

    const handleSave = () => {
        onSave?.(data, template?.id);
        setDirty(false);
    };

    const inputClass =
        'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 ' +
        'text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ' +
        'disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500';

    const renderField = (f: EncounterField) => {
        const v = data[f.key] ?? '';
        switch (f.type) {
            case 'textarea':
                return (
                    <textarea
                        className={inputClass} rows={3} value={v} disabled={readOnly}
                        onChange={e => update(f.key, e.target.value)}
                    />
                );
            case 'select':
                return (
                    <select className={inputClass} value={v} disabled={readOnly}
                        onChange={e => update(f.key, e.target.value)}>
                        <option value="">—</option>
                        {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                );
            case 'checkbox':
                return (
                    <label className="flex items-center gap-2 py-2">
                        <input type="checkbox" checked={!!v} disabled={readOnly}
                            onChange={e => update(f.key, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">Ha</span>
                    </label>
                );
            case 'number':
                return (
                    <div className="relative">
                        <input type="number" className={inputClass} value={v} disabled={readOnly}
                            onChange={e => update(f.key, e.target.value)} />
                        {f.unit && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                                {f.unit}
                            </span>
                        )}
                    </div>
                );
            default:
                return (
                    <input type="text" className={inputClass} value={v} disabled={readOnly}
                        onChange={e => update(f.key, e.target.value)} />
                );
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            {/* Sarlavha: bo'lim va shablon tanlash */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <ClipboardList className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Qabul bayoni</h3>
                </div>

                {onDepartmentChange && (
                    <div className="relative">
                        <select
                            value={departmentId || ''} disabled={readOnly}
                            onChange={e => onDepartmentChange(e.target.value)}
                            className={`${inputClass} pr-8 appearance-none min-w-[180px]`}
                        >
                            <option value="">Bo'limni tanlang</option>
                            {clinicalDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                )}

                {deptTemplates.length > 1 && (
                    <div className="relative">
                        <select
                            value={template?.id || ''} disabled={readOnly}
                            onChange={e => setActiveTemplateId(e.target.value)}
                            className={`${inputClass} pr-8 appearance-none min-w-[180px]`}
                        >
                            {deptTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                )}
            </div>

            {/* Maydonlar */}
            {!template ? (
                <div className="p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        {departmentId
                            ? "Bu bo'lim uchun shablon yaratilmagan."
                            : "Bo'limni tanlang."}
                    </p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                        Shablonlar Sozlamalar → Bo'limlar bo'limida tahrirlanadi.
                    </p>
                </div>
            ) : (
                <div className="p-4 space-y-6">
                    {groups.map(([groupName, fields]) => (
                        <div key={groupName}>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                                {groupName}
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {fields.map(f => (
                                    <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            {f.label}
                                        </label>
                                        {renderField(f)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {!readOnly && onSave && (
                        <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={handleSave}
                                disabled={!dirty}
                                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium
                                           hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Save className="w-4 h-4" />
                                {dirty ? 'Saqlash' : 'Saqlangan'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/** Saqlangan bayonni faqat o'qish uchun ko'rsatadi (bemor tarixi, chop etish) */
export const EncounterSummary: React.FC<{ template?: EncounterTemplate; value?: string | null }> = ({ template, value }) => {
    const data = parseValue(value);
    const filled = (template?.fields || []).filter(f => {
        const v = data[f.key];
        return v !== undefined && v !== '' && v !== false;
    });

    if (!filled.length) {
        return <p className="text-sm text-gray-400 dark:text-gray-500">Bayon to'ldirilmagan</p>;
    }

    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {filled.map(f => (
                <div key={f.key} className="flex gap-2">
                    <dt className="text-gray-500 dark:text-gray-400 shrink-0">{f.label}:</dt>
                    <dd className="text-gray-900 dark:text-white font-medium">
                        {typeof data[f.key] === 'boolean' ? 'Ha' : String(data[f.key])}
                        {f.unit ? ` ${f.unit}` : ''}
                    </dd>
                </div>
            ))}
        </dl>
    );
};
