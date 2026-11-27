import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import {
    Department, Doctor, InventoryItem, LabTest, MealTiming, Modality, MODALITY_LABELS, Service,
} from '../../types';
import { checkDrugAllergy, AllergyLike, AllergyHit } from '../../shared/allergyMatch';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatNumber } from '../../utils/format';
import { pickableDoctors } from '../DoctorPicker';
import { ChipButton, PickerBox, inputCls } from './sheetParts';

/* Varaqdagi «+» ostida ochiladigan tanlovlar: tahlil, tekshiruv, boshqa
   shifokor, dori, xizmat. Har biri o'z maydonlarini o'zi ushlaydi va tayyor
   qiymatni yuqoriga beradi — serverga yozish varaqning ishi (`VisitPanel`). */

const MODALITIES: Modality[] = ['UZI', 'EKG', 'RENTGEN', 'ENDOSKOPIYA', 'MRT', 'KT'];
const sendCls = 'px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 disabled:opacity-50';

export interface StudyDraft { modality: Modality; name: string; price: string; serviceId: string }
export interface ConsultDraft { departmentId: string; doctorId: string; reason: string }
export interface RxDraft {
    name: string; dosage: string; frequency: string; durationDays: string;
    /** Ovqatga nisbatan (2026-11-26) */
    mealTiming?: MealTiming | null;
    /** Allergiya ogohlantirishini shifokor ko'rdi va baribir yozdi */
    allergyAck?: boolean;
    allergyReason?: string | null;
}

const EMPTY_RX: RxDraft = { name: '', dosage: '', frequency: '', durationDays: '', mealTiming: null };

/** Ovqat vaqti tugmalari va matni — varaq, ro'yxat va chop etish bitta kalitdan */
export const MEAL_KEYS: Record<MealTiming, string> = {
    before: 'visit.meal.before', with: 'visit.meal.with', after: 'visit.meal.after',
};

export const LabPicker: React.FC<{
    tests: LabTest[]; busy: boolean; onSend: (testIds: string[]) => void;
}> = ({ tests, busy, onSend }) => {
    const { t } = useLanguage();
    const [picked, setPicked] = useState<string[]>([]);
    const active = tests.filter(x => x.isActive);
    const total = active.filter(x => picked.includes(x.id)).reduce((s, x) => s + x.price, 0);

    if (active.length === 0) {
        return <PickerBox title={t('visit.whichTests')}><p className="text-sm text-muted">{t('visit.labCatalogEmpty')}</p></PickerBox>;
    }
    return (
        <PickerBox title={t('visit.whichTests')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {active.map(x => {
                    const on = picked.includes(x.id);
                    return (
                        <label key={x.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer ${on
                            ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-line bg-surface hover:bg-elevated'}`}>
                            <input type="checkbox" checked={on} className="w-4 h-4 rounded text-primary-600"
                                onChange={() => setPicked(p => on ? p.filter(y => y !== x.id) : [...p, x.id])} />
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm text-ink truncate">{x.name}</span>
                                <span className="block text-xs text-faint">{x.sampleType} · {x.turnaroundHours} {t('visit.hours')}</span>
                            </span>
                            <span className="text-sm tabular-nums text-muted">{formatNumber(x.price)}</span>
                        </label>
                    );
                })}
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line">
                <span className="text-sm text-muted">
                    {t('common.total')}: <b className="text-ink tabular-nums">{formatNumber(total)} {t('ui.som')}</b>
                </span>
                <button type="button" onClick={() => onSend(picked)} disabled={busy || picked.length === 0} className={`ml-auto ${sendCls}`}>
                    {t('visit.sendLabBtn')}
                </button>
            </div>
        </PickerBox>
    );
};

/** Prayslistdagi nomdan tekshiruv turini topish: «UZI qorin bo'shlig'i» → UZI.
    Topilmasa — oldingi tanlov qoladi. */
const guessModality = (name: string): Modality | null => {
    const up = name.toUpperCase();
    return MODALITIES.find(m => up.includes(m) || up.includes(String(MODALITY_LABELS[m]).toUpperCase())) || null;
};

export const StudyPicker: React.FC<{
    services: Service[];
    /** Boshqa bo'limga xos tekshiruvlar (masalan OPG) — «Hammasi» bosilgandagina */
    more?: Service[];
    busy: boolean; onSend: (draft: StudyDraft) => void;
}> = ({ services: own, more = [], busy, onSend }) => {
    const { t } = useLanguage();
    const [form, setForm] = useState<StudyDraft>({ modality: 'UZI', name: '', price: '', serviceId: '' });
    const [showAll, setShowAll] = useState(own.length === 0);
    const services = showAll ? [...own, ...more] : own;
    /* Prayslist bo'lsa — tugmalar; qo'lda yozish faqat prayslistda yo'q
       tekshiruv uchun, alohida bosib ochiladi. */
    const [manual, setManual] = useState(own.length + more.length === 0);

    const pickService = (s: Service) => setForm(f => ({
        modality: guessModality(s.name) || f.modality,
        serviceId: String(s.id), name: s.name, price: String(s.price),
    }));
    const toManual = () => { setManual(true); setForm(f => ({ ...f, serviceId: '', name: '', price: '' })); };
    const toPrice = () => { setManual(false); setForm(f => ({ ...f, serviceId: '', name: '', price: '' })); };

    return (
        <PickerBox title={t('visit.whichStudy')}>
            {!manual && (
                <PriceTiles services={services} busy={busy} pickedId={form.serviceId} onPick={pickService} />
            )}
            {manual && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select value={form.modality} className={inputCls} aria-label={t('visit.tabDiag')}
                            onChange={e => setForm(f => ({ ...f, modality: e.target.value as Modality }))}>
                            {MODALITIES.map(m => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
                        </select>
                        <input value={form.name} className={`${inputCls} sm:col-span-2`} placeholder={t('visit.studyNamePh')}
                            aria-label={t('visit.studyNamePh')}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value, serviceId: '' }))} />
                    </div>
                    <input type="number" min={0} value={form.price} className={`${inputCls} max-w-[160px] mt-3`} placeholder={t('visit.price')}
                        aria-label={t('visit.price')}
                        onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-3">
                {!manual && !showAll && more.length > 0 && (
                    <button type="button" onClick={() => setShowAll(true)}
                        className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                        {fill(t('visit.studyShowAll'), more.length)}
                    </button>
                )}
                {services.length > 0 && (
                    <button type="button" onClick={manual ? toPrice : toManual}
                        className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                        {manual ? t('visit.studyFromPrice') : t('visit.studyManual')}
                    </button>
                )}
                <button type="button" onClick={() => onSend(form)} disabled={busy || !form.name.trim()} className={`ml-auto ${sendCls}`}>
                    {t('visit.sendStudyBtn')}
                </button>
            </div>
        </PickerBox>
    );
};

export const ConsultPicker: React.FC<{
    departments: Department[]; doctors: Doctor[]; busy: boolean; onSend: (draft: ConsultDraft) => void;
}> = ({ departments, doctors, busy, onSend }) => {
    const { t } = useLanguage();
    const [form, setForm] = useState<ConsultDraft>({ departmentId: '', doctorId: '', reason: '' });
    return (
        <PickerBox title={t('visit.consultTitle')}>
            <p className="-mt-1.5 mb-3 text-xs text-muted">{t('visit.consultHint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select className={inputCls} value={form.departmentId} aria-label={t('visit.department')}
                    onChange={e => setForm(f => ({ ...f, departmentId: e.target.value, doctorId: '' }))}>
                    <option value="">{t('visit.department')}</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select className={inputCls} value={form.doctorId} disabled={!form.departmentId} aria-label={t('visit.doctor')}
                    onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}>
                    <option value="">{t('visit.anyDoctor')}</option>
                    {pickableDoctors(doctors, form.departmentId || null, form.doctorId)
                        .map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                </select>
            </div>
            <div className="flex items-center gap-3 mt-3">
                <input className={inputCls} value={form.reason} placeholder={t('visit.consultReasonPh')}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
                <button type="button" onClick={() => onSend(form)} disabled={busy || !form.departmentId} className={`shrink-0 ${sendCls}`}>
                    {t('visit.sendConsultBtn')}
                </button>
            </div>
        </PickerBox>
    );
};

/* Mahal va kun — klaviaturasiz. Bular eng ko'p yoziladigan qiymatlar;
   boshqasi kerak bo'lsa maydonning o'ziga yoziladi. */
const FREQUENCIES = [
    { label: '1×', key: 'visit.freq1' },
    { label: '2×', key: 'visit.freq2' },
    { label: '3×', key: 'visit.freq3' },
    { label: '4×', key: 'visit.freq4' },
] as const;
const MEALS: MealTiming[] = ['before', 'with', 'after'];
/** «Baribir yozish» dan keyin bir bosishda sabab (ixtiyoriy) */
const ACK_REASONS = ['visit.allergy.reasonTolerated', 'visit.allergy.reasonUnconfirmed'] as const;

/** Allergiya ogohlantirishi — dori qatorining ostida. To'xtatmaydi:
    «Boshqa dori» nomni tozalaydi, «Baribir yozish» belgilaydi (jurnalga
    yoziladi). Jiddiy (Severe) yoki o'sha moddaning o'zi — qizil. */
const AllergyWarning: React.FC<{
    hits: AllergyHit[]; drug: string; acked: boolean; reason?: string | null;
    onOther: () => void; onAck: () => void; onReason: (r: string | null) => void;
}> = ({ hits, drug, acked, reason, onOther, onAck, onReason }) => {
    const { t } = useLanguage();
    const h = hits[0];
    const severe = h.severity === 'Severe' || h.level === 'direct';
    if (acked) {
        return (
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                <span>{fill(t('visit.allergy.acked'), h.allergy)}</span>
                {ACK_REASONS.map(k => (
                    <ChipButton key={k} on={reason === t(k)} onClick={() => onReason(reason === t(k) ? null : t(k))}>
                        {t(k)}
                    </ChipButton>
                ))}
            </div>
        );
    }
    const why = h.level === 'direct' ? t('visit.allergy.same')
        : h.level === 'class' ? fill(t('visit.allergy.classOf'), h.group || '')
            : fill(t('visit.allergy.related'), h.group || '');
    const tone = severe
        ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
        : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200';
    return (
        <div role="alert" className={'flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5 rounded-lg border ' + tone}>
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-[200px] text-[13px] leading-snug">
                <b className="font-semibold">{fill(t('visit.allergy.title'), h.allergy)}</b>
                <span className="block">{drug} — {why}{h.severity === 'Severe' ? ' · ' + t('visit.allergy.severe') : ''}</span>
            </div>
            <button type="button" onClick={onOther}
                className={'h-8 px-3 rounded-lg text-[12.5px] font-semibold text-white ' + (severe ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-700 hover:bg-amber-800')}>
                {t('visit.allergy.other')}
            </button>
            <button type="button" onClick={onAck}
                className="h-8 px-3 rounded-lg border border-current bg-surface text-[12.5px] font-semibold">
                {t('visit.allergy.anyway')}
            </button>
        </div>
    );
};
const DAY_CHOICES = ['3', '5', '7', '10', '14'];

/** Dorilar ombordan taklif qilinadi; erkin matn ham qoladi — omborda yo'q dorini yozish mumkin.
    `recent` — shifokorning oxirgi yozgan dorilari: bitta bosishda butun qator to'ladi. */
export const RxForm: React.FC<{
    meds: InventoryItem[]; recent?: RxDraft[]; busy: boolean; onSave: (items: RxDraft[]) => void;
    /** Bemorning faol allergiyalari — dori yozilganda solishtiriladi */
    allergies?: AllergyLike[];
    /** Oldindan to'ldirilgan qatorlar («O'tgan safar» — allergiyaga mos dori bilan) */
    initial?: RxDraft[];
}> = ({ meds, recent = [], busy, onSave, allergies = [], initial }) => {
    const { t } = useLanguage();
    const [items, setItems] = useState<RxDraft[]>(() => (initial && initial.length ? initial : [EMPTY_RX]));
    /* Nom o'zgarsa — oldingi «baribir yozish» boshqa dori uchun edi, bekor */
    const setField = (index: number, patch: Partial<RxDraft>) =>
        setItems(list => list.map((x, j) => j === index
            ? { ...x, ...patch, ...('name' in patch && patch.name !== x.name ? { allergyAck: false, allergyReason: null } : {}) }
            : x));
    const activeIngredient = (name: string) =>
        meds.find(m => m.name.trim().toLowerCase() === name.trim().toLowerCase())?.activeIngredient || null;
    const hitsOf = (it: RxDraft) => (it.name.trim() ? checkDrugAllergy(it.name, allergies, activeIngredient(it.name)) : []);
    /* Ko'rilmagan ogohlantirish bor ekan — saqlanmaydi (server ham rad etadi) */
    const blocked = items.some(it => !it.allergyAck && hitsOf(it).length > 0);
    const removeRow = (index: number) =>
        setItems(list => list.length > 1 ? list.filter((_, j) => j !== index) : [EMPTY_RX]);

    /* Tez dori — birinchi bo'sh qatorga tushadi, bo'sh qator bo'lmasa
       yangisi qo'shiladi. Formada allaqachon turgan dori qayta chiqmaydi. */
    const inForm = new Set(items.map(x => x.name.trim().toLowerCase()).filter(Boolean));
    const quick = recent.filter(r => !inForm.has(r.name.trim().toLowerCase()));
    const addRecent = (r: RxDraft) => setItems(list => {
        const emptyAt = list.findIndex(x => !x.name.trim());
        return emptyAt === -1 ? [...list, { ...r }] : list.map((x, j) => j === emptyAt ? { ...r } : x);
    });

    return (
        <PickerBox title={t('visit.prescription')}>
            {quick.length > 0 && (
                <div className="mb-3">
                    <p className="mb-1.5 text-xs font-semibold text-muted">{t('visit.recentRx')}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {quick.map(r => (
                            <ChipButton key={r.name} onClick={() => addRecent(r)}
                                title={[r.dosage, r.frequency, r.durationDays && `${r.durationDays} ${t('visit.days')}`].filter(Boolean).join(' · ')}>
                                {r.name}
                                {r.dosage && <span className="font-normal text-muted">{r.dosage}</span>}
                            </ChipButton>
                        ))}
                    </div>
                </div>
            )}
            <datalist id="xc-rx-meds">
                {meds.map(m => <option key={m.id} value={m.name} />)}
            </datalist>
            <div className="space-y-2.5">
                {items.map((it, i) => (
                    <div key={i} className="rounded-xl border border-line bg-surface p-2.5 space-y-2">
                        <div className="grid grid-cols-12 gap-2">
                            <input value={it.name} list="xc-rx-meds" placeholder={t('visit.medName')}
                                aria-label={t('visit.medName')}
                                onChange={e => setField(i, { name: e.target.value })}
                                className={`${inputCls} col-span-12 sm:col-span-4`} />
                            <input value={it.dosage} placeholder={t('visit.dose')} aria-label={t('visit.dose')}
                                onChange={e => setField(i, { dosage: e.target.value })}
                                className={`${inputCls} col-span-4 sm:col-span-3`} />
                            <input value={it.frequency} placeholder={t('visit.frequencyPh')} aria-label={t('visit.frequencyLabel')}
                                onChange={e => setField(i, { frequency: e.target.value })}
                                className={`${inputCls} col-span-5 sm:col-span-3`} />
                            <input type="number" min={1} value={it.durationDays} placeholder={t('visit.days')} aria-label={t('visit.days')}
                                onChange={e => setField(i, { durationDays: e.target.value })}
                                className={`${inputCls} col-span-3 sm:col-span-2`} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {FREQUENCIES.map(f => {
                                const value = t(f.key);
                                return (
                                    <ChipButton key={f.key} on={it.frequency === value} title={value}
                                        onClick={() => setField(i, { frequency: value })}>
                                        {f.label}
                                    </ChipButton>
                                );
                            })}
                            <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
                            {DAY_CHOICES.map(d => (
                                <ChipButton key={d} on={it.durationDays === d} onClick={() => setField(i, { durationDays: d })}>
                                    {d} {t('visit.days')}
                                </ChipButton>
                            ))}
                            <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
                            {MEALS.map(m => (
                                <ChipButton key={m} on={it.mealTiming === m}
                                    onClick={() => setField(i, { mealTiming: it.mealTiming === m ? null : m })}>
                                    {t(MEAL_KEYS[m] as any)}
                                </ChipButton>
                            ))}
                            {(items.length > 1 || it.name.trim()) && (
                                <button type="button" onClick={() => removeRow(i)}
                                    aria-label={t('visit.removeMed')} title={t('visit.removeMed')}
                                    className="ml-auto w-7 h-7 grid place-items-center rounded-md text-faint hover:text-red-600 hover:bg-elevated">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        {(() => {
                            const hits = hitsOf(it);
                            return hits.length > 0 && (
                                <AllergyWarning hits={hits} drug={it.name.trim()} acked={!!it.allergyAck} reason={it.allergyReason}
                                    onOther={() => setField(i, { name: '' })}
                                    onAck={() => setField(i, { allergyAck: true })}
                                    onReason={r => setField(i, { allergyReason: r })} />
                            );
                        })()}
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-3 mt-3">
                <button type="button" onClick={() => setItems(list => [...list, EMPTY_RX])}
                    className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">{t('visit.oneMoreMed')}</button>
                {blocked && <span className="text-[12.5px] text-red-700 dark:text-red-300">{t('visit.allergy.decideFirst')}</span>}
                <button type="button" onClick={() => onSave(items)} disabled={busy || blocked || !items.some(i => i.name.trim())} className={`ml-auto ${sendCls}`}>
                    {t('visit.saveRx')}
                </button>
            </div>
        </PickerBox>
    );
};

/** Ro'yxat shundan uzun bo'lsa — tepada qidiruv chiqadi */
const SEARCH_FROM = 9;

const tileCls = (on: boolean) =>
    `flex flex-col items-start gap-0.5 min-h-[56px] p-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${on
        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-600'
        : 'border-line bg-surface hover:border-primary-400 hover:bg-primary-50/60 dark:hover:bg-primary-900/20'}`;

/** Prayslist tugmalari: nom va narx. Uzun ro'yxatda qidiruv bilan. */
const PriceTiles: React.FC<{
    services: Service[]; busy: boolean; pickedId?: string;
    onPick: (s: Service) => void;
}> = ({ services, busy, pickedId, onPick }) => {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const shown = q ? services.filter(s => s.name.toLowerCase().includes(q)) : services;
    return (
        <>
            {services.length > SEARCH_FROM && (
                <input value={query} onChange={e => setQuery(e.target.value)} className={`${inputCls} mb-2.5`}
                    placeholder={t('visit.svcSearchPh')} aria-label={t('visit.svcSearchPh')} />
            )}
            {shown.length === 0 ? (
                <p className="text-sm text-muted">{t('visit.svcNotFound')}</p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                    {shown.map(s => (
                        <button key={s.id} type="button" disabled={busy} onClick={() => onPick(s)}
                            aria-pressed={pickedId === undefined ? undefined : pickedId === String(s.id)}
                            className={tileCls(pickedId === String(s.id))}>
                            <span className="text-[13px] font-bold text-ink leading-snug">{s.name}</span>
                            <span className="text-xs tabular-nums text-muted">{formatNumber(s.price)} {t('ui.som')}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
};

/** Xizmat — bitta bosishda qo'shiladi */
export const ServicePicker: React.FC<{
    services: Service[]; busy: boolean; onAdd: (serviceId: number) => void;
}> = ({ services, busy, onAdd }) => {
    const { t } = useLanguage();
    return (
        <PickerBox title={t('visit.addService')}>
            {services.length === 0
                ? <p className="text-sm text-muted">{t('visit.svcEmpty')}</p>
                : <PriceTiles services={services} busy={busy} onPick={s => { if (s.id !== undefined) onAdd(s.id); }} />}
        </PickerBox>
    );
};
