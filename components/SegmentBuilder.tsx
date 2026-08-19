import React from 'react';
import { AudienceSegment, SegmentCondition, SegmentFieldDescriptor } from '../types';
import { X, Plus } from 'lucide-react';

/**
 * Auditoriya konstruktori — "kimga yuborish" savolining YAGONA UI'si.
 * Qo'lda yuborishda ham, jadval bo'yicha qoidada ham shu komponent ishlatiladi.
 *
 * Forma maydonlar reyestridan quriladi (GET /api/messages/segment-fields),
 * shuning uchun backendga yangi filtr qo'shilganda bu fayl o'zgarmaydi.
 * Bemorlarni komponent hisoblamaydi — natijani doim server qaytaradi.
 */

const inputCls = "px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/20 dark:text-white";

/** Tez boshlash uchun tayyor shartlar */
const PRESETS: { label: string; conditions: SegmentCondition[] }[] = [
    { label: '👩 Ayollar', conditions: [{ field: 'gender', op: 'eq', value: 'Female' }] },
    { label: '👨 Erkaklar', conditions: [{ field: 'gender', op: 'eq', value: 'Male' }] },
    { label: '🧒 Bolalar (18 gacha)', conditions: [{ field: 'age', op: 'lte', value: 18 }] },
    { label: '⏰ Qarzi bor', conditions: [{ field: 'hasDebt', op: 'is_true' }] },
    { label: '🎁 Shu oy tug\'ilganlar', conditions: [{ field: 'birthdayMonth', op: 'eq', value: 'current' }] },
    { label: '🔄 6 oydan beri kelmagan', conditions: [{ field: 'lastVisit', op: 'before', value: 6 }] },
    { label: '✈️ Botga ulanmagan', conditions: [{ field: 'hasTelegram', op: 'is_false' }] },
    { label: '🆕 Yangi (30 kun)', conditions: [{ field: 'registered', op: 'within', value: 30 }] },
    { label: '⭐ VIP (5 mln+)', conditions: [{ field: 'totalSpent', op: 'gte', value: 5000000 }] },
    { label: '❗ 2+ marta kelmagan', conditions: [{ field: 'noShowCount', op: 'gte', value: 2 }] },
    { label: '📅 Qabuli yo\'q', conditions: [{ field: 'hasUpcomingAppointment', op: 'is_false' }] },
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
    const def = fields.find(f => f.id === cond.field);
    const op = def?.operators.find(o => o.id === cond.op);
    const arity = op?.arity ?? 1;
    const groups = fieldGroups(fields);

    return (
        <>
            <select
                value={cond.field || ''}
                onChange={e => {
                    const nd = fields.find(f => f.id === e.target.value);
                    if (!nd) return;
                    onChange({ field: nd.id, op: nd.defaultOp, value: nd.defaultValue });
                }}
                className={inputCls}
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
                    className={inputCls}
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
                            <option value="">— muolaja —</option>
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
                        <span className="text-xs text-gray-400">{def.unit}</span>
                    </span>
                ) : def.options ? (
                    <select
                        value={String(cond.value ?? '')}
                        onChange={e => onChange({ value: e.target.value })}
                        className={inputCls}
                    >
                        <option value="">— tanlang —</option>
                        {def.options.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                ) : def.type === 'text' ? (
                    <input
                        type="text"
                        value={String(cond.value ?? '')}
                        onChange={e => onChange({ value: e.target.value })}
                        placeholder="matn"
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
                        <span className="text-gray-400 text-sm">—</span>
                        <input
                            type="number"
                            value={Array.isArray(cond.value) ? cond.value[1] : ''}
                            onChange={e => onChange({ value: [Array.isArray(cond.value) ? cond.value[0] : 0, Number(e.target.value)] })}
                            className={`${inputCls} w-20`}
                        />
                        {def.unit && <span className="text-xs text-gray-400">{def.unit}</span>}
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5">
                        <input
                            type="number"
                            value={cond.value ?? ''}
                            onChange={e => onChange({ value: Number(e.target.value) })}
                            className={`${inputCls} w-24`}
                        />
                        {def.unit && <span className="text-xs text-gray-400">{def.unit}</span>}
                    </span>
                )
            )}

            {count !== undefined && (
                <span className="text-xs text-gray-400 font-mono tabular-nums">{count} ta</span>
            )}
        </>
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
                <div key={i} className="flex flex-wrap items-center gap-2">
                    {i > 0 ? (
                        <button
                            type="button"
                            onClick={toggleMatch}
                            title="VA / YOKI almashtirish"
                            className="px-2 py-1 text-[10px] font-bold rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-primary-600 uppercase tracking-wider min-w-[46px]"
                        >
                            {match === 'all' ? 'VA' : 'YOKI'}
                        </button>
                    ) : (
                        <span className="min-w-[46px]" />
                    )}

                    {isGroup(cond) ? (
                        <div className="flex-1 min-w-[260px] rounded-lg bg-gray-50 dark:bg-gray-800/40 p-2">
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
                        title={isGroup(cond) ? "Guruhni olib tashlash" : "Shartni olib tashlash"}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors ml-auto"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={addCondition}
                    className="flex items-center gap-1.5 text-sm font-bold text-primary-600 hover:text-primary-700"
                >
                    <Plus className="w-4 h-4" /> Shart
                </button>
                {depth < 2 && (
                    <button
                        type="button"
                        onClick={addGroup}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-primary-600"
                        title="Qavs ichida alohida mantiq: ayol VA (VIP YOKI implant)"
                    >
                        <Plus className="w-3.5 h-3.5" /> Qavs
                    </button>
                )}
                {conditions.length === 0 && depth === 0 && (
                    <span className="text-xs text-gray-400">Shartsiz — klinikaning barcha bemorlari</span>
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
            <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                    <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p.conditions)}
                        className="px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600 transition-colors bg-white dark:bg-gray-800"
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
                <p className="text-xs text-gray-400">
                    {match === 'all'
                        ? 'Barcha shartlar bajarilishi kerak'
                        : 'Shartlardan bittasi bajarilsa yetarli'}
                    {' · '}"Qavs" tugmasi bilan ichma-ich mantiq tuziladi: ayol VA (VIP YOKI implant)
                </p>
            )}
        </div>
    );
};
