import React from 'react';
import { AudienceSegment, SegmentCondition, SegmentFieldDescriptor } from '../types';
import { X, Plus } from 'lucide-react';

import { useLanguage, tr } from '../context/LanguageContext';
/**
 * Auditoriya konstruktori — "kimga yuborish" savolining YAGONA UI'si.
 * Qo'lda yuborishda ham, jadval bo'yicha qoidada ham shu komponent ishlatiladi.
 *
 * Forma maydonlar reyestridan quriladi (GET /api/messages/segment-fields),
 * shuning uchun backendga yangi filtr qo'shilganda bu fayl o'zgarmaydi.
 * Bemorlarni komponent hisoblamaydi — natijani doim server qaytaradi.
 */

const inputCls = "h-9 px-2.5 bg-surface border border-line rounded-lg text-sm text-ink outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20";

/** Tez boshlash uchun tayyor shartlar */
/* Tayyor filtrlar. Funksiya — til almashganda yorliqlar ham almashsin.
   Emoji yo'q (2026-11-25): «👩 Ayollar», «🔄 6 oydan…» har kompyuterda har
   xil chizilardi va chiplar qatorini rang-barang shovqinga aylantirardi. */
const presets = (): { label: string; conditions: SegmentCondition[] }[] => [
    { label: tr('segmentbuilder.women'), conditions: [{ field: 'gender', op: 'eq', value: 'Female' }] },
    { label: tr('segmentbuilder.men'), conditions: [{ field: 'gender', op: 'eq', value: 'Male' }] },
    { label: tr('segmentbuilder.bolalar_18_gacha'), conditions: [{ field: 'age', op: 'lte', value: 18 }] },
    { label: tr('segmentbuilder.qarzi_bor'), conditions: [{ field: 'hasDebt', op: 'is_true' }] },
    { label: tr('segmentbuilder.shu_oy_tugilganlar'), conditions: [{ field: 'birthdayMonth', op: 'eq', value: 'current' }] },
    { label: tr('segmentbuilder.inactive6'), conditions: [{ field: 'lastVisit', op: 'before', value: 6 }] },
    { label: tr('segmentbuilder.botga_ulanmagan'), conditions: [{ field: 'hasTelegram', op: 'is_false' }] },
    { label: tr('segmentbuilder.yangi_30_kun'), conditions: [{ field: 'registered', op: 'within', value: 30 }] },
    { label: tr('segmentbuilder.vip_5_mln'), conditions: [{ field: 'totalSpent', op: 'gte', value: 5000000 }] },
    { label: tr('segmentbuilder.2_marta_kelmagan'), conditions: [{ field: 'noShowCount', op: 'gte', value: 2 }] },
    { label: tr('segmentbuilder.qabuli_yoq'), conditions: [{ field: 'hasUpcomingAppointment', op: 'is_false' }] },
];

const isGroup = (c: SegmentCondition): boolean => Array.isArray(c.conditions);

/** Maydonlarni guruhlab optgroup uchun tayyorlaydi */
function fieldGroups(fields: SegmentFieldDescriptor[]): [string, SegmentFieldDescriptor[]][] {
    const groups: Record<string, SegmentFieldDescriptor[]> = {};
    for (const f of fields) {
        if (!groups[f.group]) groups[f.group] = [];
        groups[f.group].push(f);
    }
    return Object.keys(groups).map(g => [g, groups[g]]);
}

/** Bitta maydon sharti qatori */
const ConditionRow: React.FC<{
    cond: SegmentCondition;
    fields: SegmentFieldDescriptor[];
    count?: number;
    onChange: (patch: Partial<SegmentCondition>) => void;
}> = ({ cond, fields, count, onChange }) => {
    const { t } = useLanguage();
    const def = fields.find(f => f.id === cond.field);
    const op = def?.operators.find(o => o.id === cond.op);
    const arity = op?.arity ?? 1;
    const groups = fieldGroups(fields);

    return (
        /* Tor ustunda (Xabarlar → Qo'lda chap ustuni) maydonlar SIQILADI,
           qatorga sinmaydi: ilgari «Faol» keyingi qatorga tushib qolardi. */
        <div className="flex-1 min-w-0 flex flex-wrap sm:flex-nowrap items-center gap-2">
            <select
                aria-label={t('segmentbuilder.field')}
                value={cond.field || ''}
                onChange={e => {
                    const nd = fields.find(f => f.id === e.target.value);
                    if (!nd) return;
                    onChange({ field: nd.id, op: nd.defaultOp, value: nd.defaultValue });
                }}
                className={`${inputCls} min-w-0 flex-[1.4_1_0%]`}
            >
                {groups.map(([group, list]) => (
                    <optgroup key={group} label={group}>
                        {list.map(f => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                    </optgroup>
                ))}
            </select>

            {def && def.operators.length > 1 && (
                <select
                    value={cond.op}
                    onChange={e => {
                        const no = def.operators.find(o => o.id === e.target.value);
                        onChange({
                            op: e.target.value,
                            value: no?.arity === 2 && !Array.isArray(cond.value)
                                ? [cond.value ?? 0, cond.value ?? 0]
                                : cond.value,
                        });
                    }}
                    aria-label={t('segmentbuilder.operator')}
                    className={`${inputCls} min-w-0 flex-[0.8_1_0%]`}
                >
                    {def.operators.map(o => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                </select>
            )}

            {/* Qiymat — maydon turiga qarab */}
            {def && arity > 0 && (
                def.type === 'enum_months' ? (
                    // Muolaja + necha oy: "implant qo'ygan va 12 oy o'tgan"
                    <span className="flex items-center gap-1.5">
                        <select
                            value={Array.isArray(cond.value) ? String(cond.value[0] ?? '') : ''}
                            onChange={e => onChange({ value: [e.target.value, Array.isArray(cond.value) ? cond.value[1] : 12] })}
                            className={inputCls}
                        >
                            <option value="">— {t('segmentbuilder.muolaja')} —</option>
                            {(def.options || []).map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            value={Array.isArray(cond.value) ? (cond.value[1] ?? '') : ''}
                            onChange={e => onChange({ value: [Array.isArray(cond.value) ? cond.value[0] : '', Number(e.target.value)] })}
                            className={`${inputCls} w-20`}
                        />
                        <span className="text-xs text-faint">{def.unit}</span>
                    </span>
                ) : def.options ? (
                    <select
                        aria-label={t('segmentbuilder.value')}
                        value={String(cond.value ?? '')}
                        onChange={e => onChange({ value: e.target.value })}
                        className={`${inputCls} min-w-0 flex-1`}
                    >
                        <option value="">{t('segmentbuilder.tanlang')}</option>
                        {def.options.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                ) : def.type === 'text' ? (
                    <input
                        type="text"
                        value={String(cond.value ?? '')}
                        onChange={e => onChange({ value: e.target.value })}
                        placeholder={t('segmentbuilder.matn')}
                        className={`${inputCls} w-40`}
                    />
                ) : arity === 2 ? (
                    <span className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={Array.isArray(cond.value) ? cond.value[0] : ''}
                            onChange={e => onChange({ value: [Number(e.target.value), Array.isArray(cond.value) ? cond.value[1] : 0] })}
                            className={`${inputCls} w-20`}
                        />
                        <span className="text-faint text-sm">—</span>
                        <input
                            type="number"
                            value={Array.isArray(cond.value) ? cond.value[1] : ''}
                            onChange={e => onChange({ value: [Array.isArray(cond.value) ? cond.value[0] : 0, Number(e.target.value)] })}
                            className={`${inputCls} w-20`}
                        />
                        {def.unit && <span className="text-xs text-faint">{def.unit}</span>}
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={cond.value ?? ''}
                            onChange={e => onChange({ value: Number(e.target.value) })}
                            className={`${inputCls} w-24`}
                        />
                        {def.unit && <span className="text-xs text-faint">{def.unit}</span>}
                    </span>
                )
            )}

            {count !== undefined && (
                <span className="text-xs text-faint tabular-nums whitespace-nowrap shrink-0">{count} {t('ui.ta')}</span>
            )}
        </div>
    );
};

/** Guruh (qavs) — o'z ichida shartlar va boshqa guruhlar bo'lishi mumkin */
const GroupEditor: React.FC<{
    node: SegmentCondition;
    fields: SegmentFieldDescriptor[];
    counts?: number[];
    depth: number;
    onChange: (next: SegmentCondition) => void;
}> = ({ node, fields, counts, depth, onChange }) => {
    const { t } = useLanguage();
    const conditions = node.conditions || [];
    const match = node.match === 'any' ? 'any' : 'all';

    const setConditions = (next: SegmentCondition[]) => onChange({ ...node, match, conditions: next });
    const updateAt = (i: number, next: SegmentCondition) =>
        setConditions(conditions.map((c, idx) => (idx === i ? next : c)));
    const removeAt = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));

    const addCondition = () => {
        const def = fields[0];
        if (!def) return;
        setConditions([...conditions, { field: def.id, op: def.defaultOp, value: def.defaultValue }]);
    };
    const addGroup = () => {
        const def = fields[0];
        if (!def) return;
        setConditions([...conditions, {
            match: 'any',
            conditions: [{ field: def.id, op: def.defaultOp, value: def.defaultValue }],
        }]);
    };

    const toggleMatch = () => onChange({ ...node, match: match === 'all' ? 'any' : 'all', conditions });

    return (
        <div className={depth > 0 ? 'pl-3 border-l-2 border-primary-200 dark:border-primary-800 space-y-2' : 'space-y-2'}>
            {conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                    {i > 0 ? (
                        <button aria-label={t('segmentbuilder.va_yoki_almashtirish')}
                            type="button"
                            onClick={toggleMatch}
                            title={t('segmentbuilder.va_yoki_almashtirish')}
                            className="h-7 px-2 text-[10px] font-bold rounded-md bg-elevated text-muted hover:text-ink uppercase tracking-wider min-w-[46px] shrink-0"
                        >
                            {match === 'all' ? 'VA' : t('segmentbuilder.yoki')}
                        </button>
                    ) : (
                        <span className="min-w-[46px] shrink-0" aria-hidden="true" />
                    )}

                    {isGroup(cond) ? (
                        <div className="flex-1 min-w-0 rounded-lg bg-elevated p-2">
                            <GroupEditor
                                node={cond}
                                fields={fields}
                                depth={depth + 1}
                                onChange={next => updateAt(i, next)}
                            />
                        </div>
                    ) : (
                        <ConditionRow
                            cond={cond}
                            fields={fields}
                            count={depth === 0 ? counts?.[i] : undefined}
                            onChange={patch => updateAt(i, { ...cond, ...patch })}
                        />
                    )}

                    <button
                        type="button"
                        onClick={() => removeAt(i)}
                        title={isGroup(cond) ? t('segmentbuilder.guruhni_olib_tashlash') : t('segmentbuilder.shartni_olib_tashlash')}
                        aria-label={isGroup(cond) ? t('segmentbuilder.guruhni_olib_tashlash') : t('segmentbuilder.shartni_olib_tashlash')}
                        className="w-8 h-8 inline-flex items-center justify-center text-faint hover:text-danger hover:bg-danger-500/10 rounded-lg transition-colors shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={addCondition}
                    className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700"
                >
                    <Plus className="w-4 h-4" /> {t('segmentbuilder.shart')}
                </button>
                {depth < 2 && (
                    <button
                        type="button"
                        onClick={addGroup}
                        className="flex items-center gap-1.5 text-xs font-bold text-muted hover:text-primary-600"
                        title={t('segmentbuilder.qavs_ichida_alohida_mantiq')}
                    >
                        <Plus className="w-3.5 h-3.5" /> {t('segmentbuilder.qavs')}
                    </button>
                )}
                {conditions.length === 0 && depth === 0 && (
                    <span className="text-xs text-faint">{t('segmentbuilder.shartsiz_klinikaning_barcha_bemorlari')}</span>
                )}
            </div>
        </div>
    );
};

interface Props {
    value: AudienceSegment;
    onChange: (next: AudienceSegment) => void;
    fields: SegmentFieldDescriptor[];
    /** Har bir shart yakka o'zi nechtaga mos (serverdan) */
    conditionCounts?: number[];
}

export const SegmentBuilder: React.FC<Props> = ({ value, onChange, fields, conditionCounts }) => {
    const { t } = useLanguage();
    const conditions = value.conditions || [];
    const match = value.match === 'any' ? 'any' : 'all';

    const applyPreset = (preset: SegmentCondition[]) => {
        // Bir xil maydon bo'yicha eski shartni almashtiramiz, qolganini saqlaymiz
        const ids = preset.map(p => p.field);
        onChange({
            ...value,
            match,
            conditions: [...conditions.filter(c => isGroup(c) || !ids.includes(c.field)), ...preset],
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('segmentbuilder.quick')}>
                {presets().map(p => (
                    <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p.conditions)}
                        className="h-7 px-2.5 text-xs font-medium border border-line rounded-lg text-muted hover:text-ink hover:border-faint hover:bg-elevated/60 transition-colors"
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            <GroupEditor
                node={{ match, conditions }}
                fields={fields}
                counts={conditionCounts}
                depth={0}
                onChange={next => onChange({ ...value, match: next.match, conditions: next.conditions })}
            />

            {conditions.length > 1 && (
                <p className="text-xs text-faint">
                    {match === 'all'
                        ? t('segmentbuilder.barcha_shartlar_bajarilishi_kerak')
                        : t('segmentbuilder.shartlardan_bittasi_bajarilsa_yetarli')}
                    {' · '}{t('segmentbuilder.groupHint')}
                </p>
            )}
        </div>
    );
};
