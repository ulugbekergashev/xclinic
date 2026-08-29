import React, { useMemo, useState, useEffect } from 'react';
import { ClipboardList, Save, ChevronDown } from 'lucide-react';
import type { Department, EncounterTemplate, EncounterField } from '../types';
import {
    validateEncounterField, rangeForField, isVitalAbnormal, calcBmi, bmiLabel,
    ENCOUNTER_FIELD_TO_VITAL,
} from '../shared/validation';

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
    /** Bemor jinsi — mos kelmaydigan shablonni yashirish uchun (B-09) */
    patientGender?: 'Male' | 'Female' | null;
    /** Bemor yoshi, to'liq yil. `null` — noma'lum, chegara qo'llanmaydi */
    patientAge?: number | null;
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
    departments, templates, departmentId, templateId, patientGender, patientAge,
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

    /* BEMORGA MOS SHABLONLAR (audit B-09).
     *
     * Ilgari bu yerda faqat bo'lim bo'yicha filtr bor edi, so'ng
     * `deptTemplates.find(t => t.isDefault) || deptTemplates[0]` ishlardi.
     * Bazadagi yettita shablonning HAMMASI `isDefault` edi va ro'yxat
     * alifbo tartibida kelardi — ya'ni «Ginekolog ko'rigi» har doim
     * birinchi turardi va ERKAK bemorda ham ochilardi: menarxe, hayz
     * sanasi, bimanual tekshiruv.
     *
     * Endi ikki qatlam: server bemor bo'yicha filtrlaydi (`?patientId=`),
     * bu yerda esa yana bir bor tekshiriladi — ro'yxat keshdan yoki
     * filtrsiz kelgan bo'lishi mumkin. */
    const fitsPatient = (t: EncounterTemplate) => {
        if (t.gender && patientGender && t.gender !== patientGender) return false;
        /* Yosh noma'lum bo'lsa chegara QO'LLANMAYDI: tug'ilgan sanasi
           kiritilmagan bemorda hamma shablon yopilib qolsa, shifokor hech
           narsa yoza olmaydi. */
        if (patientAge === null || patientAge === undefined) return true;
        if (t.minAge != null && patientAge < t.minAge) return false;
        if (t.maxAge != null && patientAge > t.maxAge) return false;
        return true;
    };

    const deptTemplates = useMemo(
        () => templates
            .filter(t => !departmentId || t.departmentId === departmentId)
            .filter(fitsPatient),
        [templates, departmentId, patientGender, patientAge],
    );

    // Shablon tanlanmagan bo'lsa — bo'limning standart shabloni
    const template = useMemo(() => {
        if (activeTemplateId) {
            const chosen = deptTemplates.find(t => t.id === activeTemplateId);
            /* Tanlangan shablon bemorga mos kelmasa, unga QAYTMAYMIZ:
               ilgari `|| deptTemplates[0]` shu yerda ham turardi va
               mos kelmaydigan tanlovni jimgina boshqasiga almashtirardi. */
            if (chosen) return chosen;
        }
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

    /* Chegaradan chiqqan maydon — saqlashga to'siq. */
    const fieldProblem = (key: string, value: any): string | null => {
        const r = validateEncounterField(key, value);
        return r.ok === true ? null : (r as any).error;
    };

    /* Normadan chiqqan, lekin fiziologik mumkin — ogohlantirish, to'siq emas. */
    const fieldAbnormal = (key: string, value: any): boolean => {
        const kind = ENCOUNTER_FIELD_TO_VITAL[key];
        if (!kind || value === '' || value === null || value === undefined) return false;
        const n = Number(value);
        return Number.isFinite(n) && isVitalAbnormal(kind, n);
    };

    /* Barcha chegara xatolari — saqlash tugmasi uchun. */
    const problems = useMemo(() => {
        const list: string[] = [];
        for (const f of (template?.fields || [])) {
            const p = fieldProblem(f.key, data[f.key]);
            if (p) list.push(p);
        }
        return list;
    }, [template, data]);

    /* VKI — bo'y va vazndan avtomatik (audit B-10: «hisoblanmaydi»).
       Saqlanmaydi, hisoblanadi: ikkala manba ham shu formada turibdi. */
    const bmi = useMemo(() => {
        const h = Number(data['height']);
        const w = Number(data['weight']);
        return calcBmi(Number.isFinite(h) ? h : null, Number.isFinite(w) ? w : null);
    }, [data]);

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
            case 'number': {
                /* FIZIOLOGIK CHEGARA (S3.2, audit B-10).

                   Auditdagi 500 °C harorat, −40 puls va 9999 sistolik
                   AYNAN shu maydonlardan kiritilgan. Chegaralar
                   `shared/validation.ts` da — server ham o'sha fayldan
                   o'qiydi, ya'ni ikkalasi ajralib keta olmaydi.

                   Ikki xil belgi:
                     qizil  — fiziologik imkonsiz, SAQLASHGA yo'l yo'q;
                     sariq  — normadan chiqqan, lekin saqlanadi (kasal
                              odamning harorati 39 bo'ladi va yozilishi
                              kerak). */
                const problem = fieldProblem(f.key, v);
                const abnormal = !problem && fieldAbnormal(f.key, v);
                const range = rangeForField(f.key);
                return (
                    <div>
                        <div className="relative">
                            <input type="number" value={v} disabled={readOnly}
                                min={range?.min} max={range?.max} step="any"
                                className={`${inputClass} ${problem ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : abnormal ? 'border-amber-500' : ''}`}
                                onChange={e => update(f.key, e.target.value)} />
                            {f.unit && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                                    {f.unit}
                                </span>
                            )}
                        </div>
                        {problem && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{problem}</p>}
                        {abnormal && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Normadan tashqarida</p>}
                    </div>
                );
            }
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

                    {/* VKI — bo'y va vazn kiritilgan bo'lsa avtomatik.
                        Audit: «Bo'y va vazndan VKI ham hisoblanmaydi». */}
                    {bmi !== null && (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">VKI</span>
                            <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{bmi}</span>
                            <span className="text-sm text-gray-600 dark:text-gray-300">{bmiLabel(bmi)}</span>
                        </div>
                    )}

                    {!readOnly && onSave && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                            {problems.length > 0 && (
                                <p className="text-xs text-red-600 dark:text-red-400 flex-1">
                                    {problems.length === 1 ? problems[0] : `${problems.length} ta ko'rsatkich chegaradan tashqarida`}
                                </p>
                            )}
                            <button
                                onClick={handleSave}
                                /* Chegaradan chiqqan qiymat bilan SAQLASH YO'Q:
                                   server ham uni rad etadi, va «saqladim» deb
                                   o'ylab qolish eng yomon holat. */
                                disabled={!dirty || problems.length > 0}
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
