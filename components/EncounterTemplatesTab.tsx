import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Input, Select, Modal } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { confirmAction } from '../services/confirm';
import { Department, EncounterTemplate, EncounterField, EncounterFieldType } from '../types';
import { rangeForField } from '../shared/validation';
import { Plus, Edit, Trash2, Loader2, X, GripVertical, Star } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   KO'RIK BAYONI SHABLONLARI — KONSTRUKTOR.

   Shablonlar bazada bor, server ularni beradi va bemor kartasidagi qabul
   paneli ularni ochadi. Lekin YARATADIGAN yoki TAHRIRLAYDIGAN ekran yo'q
   edi: klinika o'rnatishda kelgan shablonlar bilan qolib ketardi va
   bironta maydon qo'sha olmasdi.

   Ya'ni «terapevt uchun o'z bayonini tuzish» — tibbiy dasturning eng
   asosiy sozlamalaridan biri — mutlaqo imkonsiz edi.

   MAYDON KALITI muhim: `temperature`, `pulse`, `bpSystolic` kabi kalitlar
   fiziologik chegara tekshiruviga ulanadi (`shared/validation.ts`).
   Boshqa kalit — chegarasiz oddiy maydon. Shuning uchun forma bu bog'lamni
   AYTIB turadi, aks holda odam «temp» deb yozadi va tekshiruv ishlamaydi.
   ───────────────────────────────────────────────────────────────────────────── */

const FIELD_TYPES: { value: EncounterFieldType; label: string; hint: string }[] = [
    { value: 'text', label: 'Matn', hint: 'Bir qatorli yozuv' },
    { value: 'textarea', label: "Ko'p qatorli", hint: 'Shikoyat, xulosa' },
    { value: 'number', label: 'Son', hint: "O'lchov: harorat, puls" },
    { value: 'select', label: 'Tanlov', hint: 'Variantlardan biri' },
    { value: 'checkbox', label: 'Belgi', hint: 'Bor / yo\'q' },
];

/* Chegara tekshiruviga ulanadigan kalitlar — forma ularni taklif qiladi,
   shunda odam qo'lda yozib adashmaydi. */
const VITAL_KEYS: { key: string; label: string }[] = [
    { key: 'temperature', label: 'Harorat' },
    { key: 'pulse', label: 'Puls' },
    { key: 'bpSystolic', label: 'Bosim (yuqori)' },
    { key: 'bpDiastolic', label: 'Bosim (pastki)' },
    { key: 'weight', label: 'Vazn' },
    { key: 'height', label: "Bo'y" },
    { key: 'spo2', label: 'SpO2' },
];

const inputCls = 'h-10 rounded-lg border border-line bg-transparent px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none';

/** Yorliqdan kalit yasaydi: «Qon bosimi» → `qonBosimi` */
function keyFromLabel(label: string): string {
    const parts = label.trim().toLowerCase()
        .replace(/[^a-z0-9Ѐ-ӿ' ]/gi, ' ')
        .split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    return parts[0] + parts.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join('');
}

interface Props {
    departments: Department[];
}

const emptyTemplate = {
    name: '', departmentId: '', gender: '' as '' | 'Male' | 'Female',
    minAge: '', maxAge: '', isDefault: false,
};

export const EncounterTemplatesTab: React.FC<Props> = ({ departments }) => {
    const [list, setList] = useState<EncounterTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterDept, setFilterDept] = useState('');

    const [editing, setEditing] = useState<EncounterTemplate | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ ...emptyTemplate });
    const [fields, setFields] = useState<EncounterField[]>([]);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setList(await api.encounterTemplates.getAll());
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "Shablonlar o'qilmadi");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const isOpen = creating || !!editing;

    const openCreate = () => {
        setEditing(null);
        setCreating(true);
        setForm({ ...emptyTemplate, departmentId: filterDept || departments[0]?.id || '' });
        setFields([]);
    };

    const openEdit = (t: EncounterTemplate) => {
        setCreating(false);
        setEditing(t);
        setForm({
            name: t.name,
            departmentId: t.departmentId,
            gender: (t.gender || '') as '' | 'Male' | 'Female',
            minAge: t.minAge != null ? String(t.minAge) : '',
            maxAge: t.maxAge != null ? String(t.maxAge) : '',
            isDefault: !!t.isDefault,
        });
        setFields(Array.isArray(t.fields) ? [...t.fields] : []);
    };

    const close = () => { setCreating(false); setEditing(null); };

    const shown = useMemo(
        () => list.filter(t => !filterDept || t.departmentId === filterDept),
        [list, filterDept]);

    const depName = (id: string) => departments.find(d => d.id === id)?.name || "Bo'limsiz";

    const setField = (i: number, patch: Partial<EncounterField>) =>
        setFields(fs => fs.map((f, j) => j === i ? { ...f, ...patch } : f));

    const move = (i: number, dir: -1 | 1) => setFields(fs => {
        const j = i + dir;
        if (j < 0 || j >= fs.length) return fs;
        const next = [...fs];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });

    const save = async () => {
        if (!form.name.trim()) { toast.error('Shablon nomi majburiy'); return; }
        if (!form.departmentId) { toast.error("Bo'lim tanlanmagan"); return; }

        /* Kalit BO'SH bo'lmasligi va TAKRORLANMASLIGI kerak: bayon
           qiymatlari kalit bo'yicha saqlanadi, takror kalit esa oldingi
           qiymatni jimgina bosib ketadi. */
        const clean = fields
            .filter(f => f.label.trim())
            .map(f => ({ ...f, key: (f.key || keyFromLabel(f.label)).trim(), label: f.label.trim() }));
        const empty = clean.find(f => !f.key);
        if (empty) { toast.error(`«${empty.label}» uchun kalit bo'sh`); return; }
        const keys = clean.map(f => f.key);
        const dup = keys.find((k, i) => keys.indexOf(k) !== i);
        if (dup) { toast.error(`Kalit takrorlanmoqda: ${dup}`); return; }

        const payload = {
            name: form.name.trim(),
            fields: clean,
            isDefault: form.isDefault,
            gender: form.gender || null,
            minAge: form.minAge === '' ? null : Number(form.minAge),
            maxAge: form.maxAge === '' ? null : Number(form.maxAge),
        };

        setSaving(true);
        try {
            if (editing) await api.encounterTemplates.update(editing.id, payload);
            else await api.encounterTemplates.create({ ...payload, departmentId: form.departmentId });
            close();
            await load();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || 'Saqlanmadi');
        } finally { setSaving(false); }
    };

    const remove = async (t: EncounterTemplate) => {
        if (!await confirmAction({
            title: `«${t.name}» shabloni o'chirilsinmi?`,
            body: 'Shu shablon bilan yozilgan qabullar tegilmaydi — ularning bayoni joyida qoladi.',
            danger: true, confirmLabel: "O'chirish",
        })) return;
        try {
            await api.encounterTemplates.delete(t.id);
            await load();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "O'chirib bo'lmadi");
        }
    };

    return (
        <Card className="p-6">
            <div className="flex flex-wrap justify-between items-start gap-3 mb-5">
                <div>
                    <h2 className="text-lg font-medium text-ink">Ko'rik bayoni shablonlari</h2>
                    <p className="text-sm text-muted">
                        Shifokor qabulda to'ldiradigan maydonlar. Har bo'limning o'z shabloni bo'ladi.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                        options={[
                            { value: '', label: 'Barcha bo\'limlar' },
                            ...departments.filter(d => d.isActive).map(d => ({ value: d.id, label: d.name })),
                        ]} />
                    <Button size="sm" onClick={openCreate} disabled={departments.length === 0}>
                        <Plus className="w-4 h-4 mr-1" /> Shablon
                    </Button>
                </div>
            </div>

            {departments.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                    Avval bo'lim qo'shing — shablon bo'limga biriktiriladi.
                </p>
            ) : loading ? (
                <p className="py-10 text-center text-faint">Yuklanmoqda…</p>
            ) : shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                    Shablon yo'q. Shifokor bayonni bo'sh varaqqa yozadi.
                </p>
            ) : (
                <div className="space-y-2">
                    {shown.map(t => (
                        <div key={t.id}
                            className="flex items-center justify-between gap-3 p-3 border border-line rounded-lg">
                            <div className="min-w-0">
                                <p className="font-medium text-ink truncate flex items-center gap-2">
                                    {t.name}
                                    {t.isDefault && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                            <Star className="w-3 h-3 fill-current" /> standart
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-muted truncate">
                                    {depName(t.departmentId)}
                                    <span className="mx-1.5">·</span>
                                    {(t.fields || []).length} maydon
                                    {t.gender && <><span className="mx-1.5">·</span>{t.gender === 'Male' ? 'erkaklar' : 'ayollar'}</>}
                                    {(t.minAge != null || t.maxAge != null) && (
                                        <><span className="mx-1.5">·</span>
                                            {t.minAge ?? 0}–{t.maxAge ?? '∞'} yosh</>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => openEdit(t)} title="Tahrirlash"
                                    className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md">
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => remove(t)} title="O'chirish"
                                    className="p-2 text-faint hover:text-red-600 rounded-md">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Konstruktor ────────────────────────────────────────────── */}
            <Modal isOpen={isOpen} onClose={close}
                title={editing ? `${editing.name} — shablon` : 'Yangi shablon'}
                className="max-w-3xl">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Shablon nomi *" value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        <Select label="Bo'lim *" value={form.departmentId}
                            disabled={!!editing}
                            onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                            options={departments.filter(d => d.isActive).map(d => ({ value: d.id, label: d.name }))} />
                    </div>

                    {/* Jins va yosh chegarasi (migratsiya 0031): erkak
                        bemorda ginekologiya shabloni ochilib qolgan edi. */}
                    <div className="grid grid-cols-3 gap-3">
                        <Select label="Kimga mos" value={form.gender}
                            onChange={e => setForm(f => ({ ...f, gender: e.target.value as any }))}
                            options={[
                                { value: '', label: 'Hammaga' },
                                { value: 'Male', label: 'Erkaklar' },
                                { value: 'Female', label: 'Ayollar' },
                            ]} />
                        <Input label="Eng kichik yosh" type="number" value={form.minAge}
                            onChange={e => setForm(f => ({ ...f, minAge: e.target.value }))} placeholder="—" />
                        <Input label="Eng katta yosh" type="number" value={form.maxAge}
                            onChange={e => setForm(f => ({ ...f, maxAge: e.target.value }))} placeholder="—" />
                    </div>

                    <label className="flex items-center gap-2.5 text-sm text-muted">
                        <input type="checkbox" checked={form.isDefault}
                            onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                            className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500" />
                        Bu bo'limda standart bo'lsin — qabul ochilganda o'zi tanlanadi
                    </label>

                    {/* ── Maydonlar ── */}
                    <div className="border-t border-line pt-4">
                        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                            Maydonlar ({fields.length})
                        </p>

                        {fields.length === 0 ? (
                            <p className="text-sm text-faint py-4 text-center">
                                Maydon yo'q — shablon bo'sh bayon beradi
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {fields.map((f, i) => {
                                    const range = rangeForField(f.key);
                                    return (
                                        <div key={i} className="rounded-xl border border-line p-3 space-y-2">
                                            <div className="flex items-start gap-2">
                                                <div className="flex flex-col pt-1.5">
                                                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                                                        className="text-faint hover:text-muted disabled:opacity-30 leading-none">▲</button>
                                                    <GripVertical className="w-4 h-4 text-faint" />
                                                    <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1}
                                                        className="text-faint hover:text-muted disabled:opacity-30 leading-none">▼</button>
                                                </div>

                                                <div className="flex-1 grid grid-cols-2 gap-2">
                                                    <input value={f.label} placeholder="Yorliq (shifokor ko'radi)"
                                                        onChange={e => {
                                                            const label = e.target.value;
                                                            /* Kalit yorliqdan O'ZI yasaladi, agar odam
                                                               uni qo'lda o'zgartirmagan bo'lsa. */
                                                            const auto = !f.key || f.key === keyFromLabel(f.label);
                                                            setField(i, auto ? { label, key: keyFromLabel(label) } : { label });
                                                        }}
                                                        className={inputCls} />
                                                    <input value={f.key} placeholder="kalit"
                                                        onChange={e => setField(i, { key: e.target.value.trim() })}
                                                        className={inputCls + ' font-mono text-xs'} />
                                                </div>

                                                <button type="button" onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}
                                                    className="p-2 text-faint hover:text-red-600">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 pl-8">
                                                <select value={f.type}
                                                    onChange={e => setField(i, { type: e.target.value as EncounterFieldType })}
                                                    className={inputCls + ' min-w-[130px]'}>
                                                    {FIELD_TYPES.map(ft => (
                                                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                                                    ))}
                                                </select>

                                                {f.type === 'number' && (
                                                    <input value={f.unit || ''} placeholder="birlik (°C, mm)"
                                                        onChange={e => setField(i, { unit: e.target.value })}
                                                        className={inputCls + ' w-32'} />
                                                )}

                                                {f.type === 'select' && (
                                                    <input value={(f.options || []).join(', ')} placeholder="variantlar, vergul bilan"
                                                        onChange={e => setField(i, {
                                                            options: e.target.value.split(',').map(x => x.trim()).filter(Boolean),
                                                        })}
                                                        className={inputCls + ' flex-1 min-w-[200px]'} />
                                                )}

                                                <input value={f.group || ''} placeholder="guruh (ixtiyoriy)"
                                                    onChange={e => setField(i, { group: e.target.value })}
                                                    className={inputCls + ' w-40'} />
                                            </div>

                                            {/* Fiziologik chegara bog'langanini AYTAMIZ: aks holda
                                                odam «temp» deb yozadi va tekshiruv ishlamaydi. */}
                                            {range && (
                                                <p className="pl-8 text-[11px] text-emerald-600 dark:text-emerald-400">
                                                    Chegara tekshiruvi yoqildi: {range.label} {range.min}–{range.max} {range.unit}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <button type="button"
                                onClick={() => setFields(fs => [...fs, { key: '', label: '', type: 'text' }])}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-line rounded-lg hover:bg-elevated">
                                <Plus className="w-4 h-4" /> Maydon
                            </button>
                            {/* Tayyor o'lchovlar: kalit TO'G'RI yozilsin — chegara
                                tekshiruvi aynan kalitga ulanadi. */}
                            {VITAL_KEYS.filter(v => !fields.some(f => f.key === v.key)).map(v => (
                                <button key={v.key} type="button"
                                    onClick={() => setFields(fs => [...fs, {
                                        key: v.key, label: v.label, type: 'number',
                                        unit: rangeForField(v.key)?.unit, group: "Ko'rsatkichlar",
                                    }])}
                                    className="px-2.5 py-1.5 text-xs font-medium border border-dashed border-line rounded-lg text-muted hover:border-primary-400 hover:text-primary-600">
                                    + {v.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={close} disabled={saving}>Bekor</Button>
                        <Button type="button" onClick={save} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};
