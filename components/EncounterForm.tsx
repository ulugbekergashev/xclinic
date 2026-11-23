import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { EncounterTemplate, EncounterField } from '../types';
import { useLanguage, fill } from '../context/LanguageContext';
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

   SAQLASH TUGMASI YO'Q. Forma qabul varag'ining bir qismi va o'zi saqlanadi:
   har o'zgarish `onChange` orqali varaqqa beriladi, varaq uni bir oz kutib
   serverga yozadi (`VisitPanel`). Ilgari bu yerda «Saqlash» tugmasi bor edi
   va shifokor uni bosmay «Qabulni yakunlash» ni bossa, ko'rik yozilmay
   qolardi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
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
    /** Har o'zgarishda. `invalidKeys` — chegaradan chiqqan maydonlar: ular saqlanmaydi */
    onChange?: (data: Record<string, any>, templateId: string | undefined, invalidKeys: string[]) => void;
}

const parseValue = (v: Props['value']): Record<string, any> => {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v) || {}; } catch { return {}; }
};

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

const INPUT_CLASS =
    'w-full px-3 py-2 border border-line rounded-xl bg-canvas ' +
    'text-ink text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ' +
    'disabled:text-muted';

export const EncounterForm: React.FC<Props> = ({
    templates, departmentId, templateId, patientGender, patientAge,
    value, readOnly = false, onChange,
}) => {
    const { t } = useLanguage();
    const [data, setData] = useState<Record<string, any>>(() => parseValue(value));
    const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(templateId);
    /* Yozilgan, lekin server hali tasdiqlamagan o'zgarish bormi. Holat emas,
       `ref`: pastdagi effekt uni o'qiydi, lekin unga qarab qayta ishlamasligi
       kerak. */
    const dirty = useRef(false);
    const dataRef = useRef(data);
    dataRef.current = data;

    /* SERVERDAN YANGI QIYMAT KELDI. Uch holat:
         - yozilgani bilan bir xil → saqlandi, forma «toza»;
         - forma toza              → serverdagini olamiz (boshqa kompyuterda
                                     o'zgargan yoki boshqa qabul ochilgan);
         - forma «iflos»           → TEGMAYMIZ. Forma o'zi saqlanadi, ya'ni
           javob shifokor keyingi harfni yozib ulgurganda keladi; eski javobni
           olsak o'sha harflar o'chib ketardi. */
    useEffect(() => {
        const incoming = parseValue(value);
        if (JSON.stringify(incoming) === JSON.stringify(dataRef.current)) { dirty.current = false; return; }
        if (dirty.current) return;
        setData(incoming);
    }, [value]);
    useEffect(() => { setActiveTemplateId(templateId); }, [templateId]);

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
    const deptTemplates = useMemo(() => {
        const fitsPatient = (x: EncounterTemplate) => {
            if (x.gender && patientGender && x.gender !== patientGender) return false;
            /* Yosh noma'lum bo'lsa chegara QO'LLANMAYDI: tug'ilgan sanasi
               kiritilmagan bemorda hamma shablon yopilib qolsa, shifokor hech
               narsa yoza olmaydi. */
            if (patientAge === null || patientAge === undefined) return true;
            if (x.minAge != null && patientAge < x.minAge) return false;
            if (x.maxAge != null && patientAge > x.maxAge) return false;
            return true;
        };
        return templates
            .filter(x => !departmentId || x.departmentId === departmentId)
            .filter(fitsPatient);
    }, [templates, departmentId, patientGender, patientAge]);

    // Shablon tanlanmagan bo'lsa — bo'limning standart shabloni
    const template = useMemo(() => {
        if (activeTemplateId) {
            const chosen = deptTemplates.find(x => x.id === activeTemplateId);
            /* Tanlangan shablon bemorga mos kelmasa, unga QAYTMAYMIZ:
               ilgari `|| deptTemplates[0]` shu yerda ham turardi va
               mos kelmaydigan tanlovni jimgina boshqasiga almashtirardi. */
            if (chosen) return chosen;
        }
        return deptTemplates.find(x => x.isDefault) || deptTemplates[0];
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

    /* Chegaradan chiqqan qiymat SAQLANMAYDI: server ham uni rad etadi, va
       «saqlandi» deb o'ylab qolish eng yomon holat. Varaqqa qaysi maydonlar
       xato ekani beriladi — u o'shalarni tashlab, qolganini yozadi; sabab
       esa shu yerda, maydon ostida ko'rinadi. */
    const invalidKeysOf = (values: Record<string, any>): string[] =>
        (template?.fields || []).filter(f => fieldProblem(f.key, values[f.key])).map(f => f.key);
    const problemCount = useMemo(() => invalidKeysOf(data).length, [template, data]);

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
        dirty.current = true;
        onChange?.(next, template?.id, invalidKeysOf(next));
    };

    const pickTemplate = (id: string) => {
        setActiveTemplateId(id);
        dirty.current = true;
        onChange?.(data, id, invalidKeysOf(data));
    };

    const renderField = (f: EncounterField) => {
        const v = data[f.key] ?? '';
        switch (f.type) {
            case 'textarea':
                return (
                    <textarea
                        className={`${INPUT_CLASS} resize-y leading-relaxed`} rows={2} value={v} disabled={readOnly}
                        onChange={e => update(f.key, e.target.value)}
                    />
                );
            case 'select':
                return (
                    <select className={INPUT_CLASS} value={v} disabled={readOnly}
                        onChange={e => update(f.key, e.target.value)}>
                        <option value="">—</option>
                        {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                );
            case 'checkbox':
                return (
                    <span className="flex items-center gap-2 py-2">
                        <input type="checkbox" checked={!!v} disabled={readOnly}
                            onChange={e => update(f.key, e.target.checked)}
                            className="w-4 h-4 rounded border-line text-primary-600 focus:ring-primary-500" />
                        <span className="text-sm text-muted">Ha</span>
                    </span>
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
                    <>
                        <span className="relative">
                            <input type="number" value={v} disabled={readOnly}
                                min={range?.min} max={range?.max} step="any"
                                className={`${INPUT_CLASS} ${problem ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : abnormal ? 'border-amber-500' : ''}`}
                                onChange={e => update(f.key, e.target.value)} />
                            {f.unit && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint pointer-events-none">
                                    {f.unit}
                                </span>
                            )}
                        </span>
                        {problem && <span className="text-xs text-red-600 dark:text-red-400">{problem}</span>}
                        {abnormal && <span className="text-xs text-amber-600 dark:text-amber-400">{t('encounterform.normadan_tashqarida')}</span>}
                    </>
                );
            }
            default:
                return (
                    <input type="text" className={INPUT_CLASS} value={v} disabled={readOnly}
                        onChange={e => update(f.key, e.target.value)} />
                );
        }
    };

    if (!template) {
        return (
            <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center">
                <p className="text-muted text-sm">
                    {departmentId ? t('encounterform.bu_bolim_uchun_shablon') : t('ui.bolimni_tanlang')}
                </p>
                <p className="text-faint text-xs mt-1">{t('encounterform.shablonlar_sozlamalar_bolimlar_bolimida')}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {groups.map(([groupName, fields], index) => (
                <div key={groupName} role="group" aria-label={groupName} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink">{groupName}</span>
                        {/* Shablon tanlovi — birinchi guruh sarlavhasida, alohida qator emas */}
                        {index === 0 && deptTemplates.length > 1 && (
                            <span className="relative">
                                <select
                                    value={template.id} disabled={readOnly}
                                    aria-label={t('ui.qabul_bayoni')}
                                    onChange={e => pickTemplate(e.target.value)}
                                    className="h-7 pl-2 pr-7 rounded-lg border border-line bg-surface text-xs font-semibold text-muted appearance-none"
                                >
                                    {deptTemplates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                            </span>
                        )}
                    </div>
                    {/* Ko'rik o'z blokida (2026-11-21): matn maydoni blok kengligida,
                        raqamli maydonlar (harorat, bosim) — ikkitadan yonma-yon. */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        {fields.map(f => (
                            <label key={f.key}
                                className={`flex flex-col gap-1 min-w-0 ${f.type === 'textarea' || f.type === 'text' ? 'col-span-2' : ''}`}>
                                <span className="text-xs font-medium text-muted truncate">{f.label}</span>
                                {renderField(f)}
                            </label>
                        ))}
                    </div>
                </div>
            ))}

            {/* VKI — bo'y va vazn kiritilgan bo'lsa avtomatik.
                Audit: «Bo'y va vazndan VKI ham hisoblanmaydi». */}
            {bmi !== null && (
                <p className="self-start inline-flex items-center gap-2 h-7 px-2.5 rounded-md bg-elevated text-xs font-bold text-ink">
                    VKI <span className="tabular-nums">{bmi}</span>
                    <span className="font-semibold text-muted">{bmiLabel(bmi)}</span>
                </p>
            )}

            {!readOnly && problemCount > 1 && (
                <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {fill(t('encounterform.x_ta_korsatkich_chegaradan'), problemCount)}
                </p>
            )}
        </div>
    );
};

/** Saqlangan bayonni faqat o'qish uchun ko'rsatadi (bemor tarixi, chop etish) */
export const EncounterSummary: React.FC<{ template?: EncounterTemplate; value?: string | null }> = ({ template, value }) => {
    const { t } = useLanguage();
    const data = parseValue(value);
    const filled = (template?.fields || []).filter(f => {
        const v = data[f.key];
        return v !== undefined && v !== '' && v !== false;
    });

    if (!filled.length) {
        return <p className="text-sm text-faint">{t('encounterform.bayon_toldirilmagan')}</p>;
    }

    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {filled.map(f => (
                <div key={f.key} className="flex gap-2">
                    <dt className="text-muted shrink-0">{f.label}:</dt>
                    <dd className="text-ink font-medium">
                        {typeof data[f.key] === 'boolean' ? 'Ha' : String(data[f.key])}
                        {f.unit ? ` ${f.unit}` : ''}
                    </dd>
                </div>
            ))}
        </dl>
    );
};
