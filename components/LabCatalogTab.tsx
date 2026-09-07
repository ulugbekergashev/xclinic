import React, { useEffect, useState, useCallback } from 'react';
import { FlaskConical, Plus, Trash2, Pencil, Loader2, AlertCircle } from 'lucide-react';
import { Card, Button, Input, Modal, EmptyState } from './Common';
import { LabTest, LabTestParameter, Department } from '../types';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { confirmAction } from '../services/confirm';
import { formatNumber } from '../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   TAHLILLAR KATALOGI.

   Bu ekran YO'Q edi. Server esa to'liq tayyor turardi: `GET/POST/PUT/DELETE
   /api/lab-tests` ko'rsatkichlari va normalari bilan birga yozilgan, `api.ts`
   da metodlar ham bor — faqat ularni chaqiradigan sahifa qurilmagan.

   Oqibati ko'zga tashlanadigan darajada edi: laboratoriya ekrani katalog
   bo'sh bo'lganda «Sozlamalar → Laboratoriya» ga yuborardi, LEKIN bunday
   vkladka mavjud emas edi. Ya'ni dastur foydalanuvchini yo'q joyga
   jo'natardi va tahlil qo'shishning umuman iloji yo'q edi — seed bergan
   6 tasi bilan yashash kerak edi.

   NORMA JINS VA YOSHGA BOG'LIQ. Gemoglobin 125 g/l ayolda norma, erkakda
   past. Shuning uchun har ko'rsatkichda `sex`, `ageMin`, `ageMax` bor va
   natijaga bahoni SERVER qo'yadi — norma keyin o'zgarsa eski natija o'z
   bahosini yo'qotmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    departments: Department[];
}

type ParamDraft = Partial<LabTestParameter> & { name: string };

const emptyTest = () => ({
    name: '', code: '', sampleType: 'Qon', price: '', cost: '',
    turnaroundHours: '24', departmentId: '',
});

export const LabCatalogTab: React.FC<Props> = ({ departments }) => {
    const { t } = useLanguage();
    const [tests, setTests] = useState<LabTest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const [editing, setEditing] = useState<LabTest | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [form, setForm] = useState(emptyTest());
    const [params, setParams] = useState<ParamDraft[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try { setTests(await api.labTests.getAll()); setError(''); }
        catch (e: any) { setError(e?.message || t('lab.loadFailed')); }
        finally { setLoading(false); }
    }, [t]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setForm(emptyTest());
        setParams([{ name: '' }]);
        setIsNew(true);
        setEditing({} as LabTest);
    };

    const openEdit = (x: LabTest) => {
        setForm({
            name: x.name, code: x.code, sampleType: x.sampleType || 'Qon',
            price: String(x.price ?? ''), cost: String(x.cost ?? ''),
            turnaroundHours: String(x.turnaroundHours ?? 24),
            departmentId: x.departmentId || '',
        });
        setParams((x.parameters || []).map(p => ({ ...p })));
        setIsNew(false);
        setEditing(x);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.code.trim()) { setError(t('lab.nameCodeRequired')); return; }
        setSaving(true); setError('');
        const payload = {
            name: form.name.trim(), code: form.code.trim().toUpperCase(),
            sampleType: form.sampleType, price: Number(form.price) || 0,
            cost: Number(form.cost) || 0,
            turnaroundHours: Number(form.turnaroundHours) || 24,
            departmentId: form.departmentId || null,
            /* Nomsiz qatorlar tashlanadi: bo'sh ko'rsatkich natija
               kiritishda bo'sh maydon bo'lib chiqardi. */
            parameters: params.filter(p => p.name.trim()).map(p => ({
                ...(p.id ? { id: p.id } : {}),
                name: p.name.trim(), unit: p.unit || null,
                refLow: p.refLow === undefined || p.refLow === null || (p.refLow as any) === '' ? null : Number(p.refLow),
                refHigh: p.refHigh === undefined || p.refHigh === null || (p.refHigh as any) === '' ? null : Number(p.refHigh),
                refText: p.refText || null,
                sex: p.sex || null,
                ageMin: p.ageMin === undefined || p.ageMin === null || (p.ageMin as any) === '' ? null : Number(p.ageMin),
                ageMax: p.ageMax === undefined || p.ageMax === null || (p.ageMax as any) === '' ? null : Number(p.ageMax),
            })),
        };
        try {
            if (isNew) await api.labTests.create(payload as any);
            else await api.labTests.update(editing!.id, payload as any);
            setEditing(null);
            await load();
        } catch (err: any) {
            setError(err?.data?.error || err?.message || t('lab.saveFailed'));
        } finally { setSaving(false); }
    };

    const remove = async (x: LabTest) => {
        if (!await confirmAction({
            title: t('lab.deleteTitle'), body: t('lab.deleteBody'), confirmLabel: t('common.delete'), danger: true,
        })) return;
        try {
            const r = await api.labTests.delete(x.id);
            /* Buyurtmada ishlatilgan tahlil O'CHMAYDI — faolsizlantiriladi,
               aks holda eski buyurtmalar nomsiz qolardi. */
            if ((r as any)?.deactivated) setError(t('lab.deactivatedInstead'));
            await load();
        } catch (e: any) { setError(e?.message || t('lab.saveFailed')); }
    };

    if (loading) {
        return <Card className="p-10 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary-600" /></Card>;
    }

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                    <div className="p-2.5 bg-primary-50 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-300">
                        <FlaskConical className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('lab.catalogTitle')}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('lab.catalogDesc')}</p>
                    </div>
                    <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> {t('lab.addTest')}</Button>
                </div>

                {error && (
                    <div className="flex items-start gap-2 p-3 mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                )}

                <div className="mt-5">
                    {tests.length === 0 ? (
                        <EmptyState icon={<FlaskConical className="w-12 h-12" />}
                            title={t('lab.empty')} hint={t('lab.emptyHint')} />
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                            {tests.map(x => (
                                <div key={x.id} className={`flex flex-wrap items-center gap-3 p-4 ${x.isActive ? '' : 'opacity-50'}`}>
                                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                                        {x.code}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{x.name}</span>
                                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                                            {x.sampleType} · {x.turnaroundHours} {t('visit.hours')} · {(x.parameters || []).length} {t('lab.paramsShort')}
                                        </span>
                                    </span>
                                    <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{formatNumber(x.price)}</span>
                                    <Button variant="secondary" size="sm" onClick={() => openEdit(x)} title={t('inventory.ui.edit')}>
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => remove(x)} title={t('common.delete')}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            {/* ── Tahlil oynasi ────────────────────────────────────────────── */}
            {editing && (
                <Modal isOpen={true} onClose={() => setEditing(null)}
                    title={isNew ? t('lab.addTest') : `${t('inventory.ui.edit')} — ${form.name}`}>
                    <form onSubmit={save} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                                <Input label={t('lab.testName')} value={form.name} required
                                    onChange={(e: any) => setForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <Input label={t('lab.code')} value={form.code} required placeholder="OAK"
                                onChange={(e: any) => setForm(f => ({ ...f, code: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <Input label={t('lab.sample')} value={form.sampleType} placeholder="Qon"
                                onChange={(e: any) => setForm(f => ({ ...f, sampleType: e.target.value }))} />
                            <Input label={t('visit.price')} type="number" value={form.price}
                                onChange={(e: any) => setForm(f => ({ ...f, price: e.target.value }))} />
                            <Input label={t('lab.cost')} type="number" value={form.cost}
                                onChange={(e: any) => setForm(f => ({ ...f, cost: e.target.value }))} />
                            <Input label={t('lab.turnaround')} type="number" value={form.turnaroundHours}
                                onChange={(e: any) => setForm(f => ({ ...f, turnaroundHours: e.target.value }))} />
                        </div>

                        {/* ── Ko'rsatkichlar va normalar ──────────────────────
                            Norma JINS va YOSHGA bog'liq: gemoglobin 125 g/l
                            ayolda norma, erkakda past. Bo'sh qoldirilsa —
                            hammaga bir xil. */}
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('lab.params')}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('lab.paramsHint')}</p>

                            <div className="space-y-2 max-h-72 overflow-y-auto">
                                {params.map((p, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                        <input value={p.name} placeholder={t('lab.paramName')}
                                            onChange={e => setParams(a => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                                            className="col-span-12 sm:col-span-3 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                        <input value={p.unit || ''} placeholder={t('lab.unit')}
                                            onChange={e => setParams(a => a.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))}
                                            className="col-span-3 sm:col-span-2 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                        <input type="number" step="any" value={p.refLow ?? ''} placeholder={t('lab.from')}
                                            onChange={e => setParams(a => a.map((x, j) => j === i ? { ...x, refLow: e.target.value as any } : x))}
                                            className="col-span-3 sm:col-span-2 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                        <input type="number" step="any" value={p.refHigh ?? ''} placeholder={t('lab.to')}
                                            onChange={e => setParams(a => a.map((x, j) => j === i ? { ...x, refHigh: e.target.value as any } : x))}
                                            className="col-span-3 sm:col-span-2 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                                        <select value={p.sex || ''}
                                            onChange={e => setParams(a => a.map((x, j) => j === i ? { ...x, sex: (e.target.value || null) as any } : x))}
                                            className="col-span-2 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
                                            <option value="">{t('lab.anySex')}</option>
                                            <option value="Male">{t('patients.modal.male')}</option>
                                            <option value="Female">{t('patients.modal.female')}</option>
                                        </select>
                                        <button type="button" aria-label={t('common.delete')}
                                            onClick={() => setParams(a => a.filter((_, j) => j !== i))}
                                            className="col-span-1 p-1 text-gray-300 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button type="button" onClick={() => setParams(a => [...a, { name: '' }])}
                                className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline">
                                {t('lab.addParam')}
                            </button>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                            <Button type="submit" disabled={saving}>{saving ? '...' : t('common.save')}</Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};
