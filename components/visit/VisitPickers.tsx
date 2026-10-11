import React, { useState } from 'react';
import {
    Department, Doctor, InventoryItem, LabTest, Modality, MODALITY_LABELS, Service,
} from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { formatNumber } from '../../utils/format';
import { pickableDoctors } from '../DoctorPicker';
import { PickerBox, inputCls } from './sheetParts';

/* Varaqdagi «+» ostida ochiladigan tanlovlar: tahlil, tekshiruv, boshqa
   shifokor, dori, xizmat. Har biri o'z maydonlarini o'zi ushlaydi va tayyor
   qiymatni yuqoriga beradi — serverga yozish varaqning ishi (`VisitPanel`). */

const MODALITIES: Modality[] = ['UZI', 'EKG', 'RENTGEN', 'ENDOSKOPIYA', 'MRT', 'KT'];
const sendCls = 'px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 disabled:opacity-50';

export interface StudyDraft { modality: Modality; name: string; price: string; serviceId: string }
export interface ConsultDraft { departmentId: string; doctorId: string; reason: string }
export interface RxDraft { name: string; dosage: string; frequency: string; durationDays: string }

const EMPTY_RX: RxDraft = { name: '', dosage: '', frequency: '', durationDays: '' };

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

export const StudyPicker: React.FC<{
    services: Service[]; busy: boolean; onSend: (draft: StudyDraft) => void;
}> = ({ services, busy, onSend }) => {
    const { t } = useLanguage();
    const [form, setForm] = useState<StudyDraft>({ modality: 'UZI', name: '', price: '', serviceId: '' });

    const pickService = (id: string) => {
        const s = services.find(x => String(x.id) === id);
        setForm(f => ({ ...f, serviceId: id, name: s ? s.name : f.name, price: s ? String(s.price) : f.price }));
    };
    return (
        <PickerBox title={t('visit.whichStudy')}>
            {/* Prayslistdan tanlash — nom va narx o'zi to'ladi. Qo'lda
                yozish ham qoldi: prayslistda yo'q tekshiruv bo'lishi mumkin. */}
            {services.length > 0 && (
                <select className={`${inputCls} mb-3`} value={form.serviceId} aria-label={t('visit.pickFromPrice')}
                    onChange={e => pickService(e.target.value)}>
                    <option value="">{t('visit.pickFromPrice')}</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — {formatNumber(s.price)}</option>)}
                </select>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={form.modality} className={inputCls} aria-label={t('visit.tabDiag')}
                    onChange={e => setForm(f => ({ ...f, modality: e.target.value as Modality }))}>
                    {MODALITIES.map(m => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
                </select>
                <input value={form.name} className={`${inputCls} sm:col-span-2`} placeholder={t('visit.studyNamePh')}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value, serviceId: '' }))} />
            </div>
            <div className="flex items-center gap-3 mt-3">
                <input type="number" value={form.price} className={`${inputCls} max-w-[160px]`} placeholder={t('visit.price')}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
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

/** Dorilar ombordan taklif qilinadi; erkin matn ham qoladi — omborda yo'q dorini yozish mumkin. */
export const RxForm: React.FC<{
    meds: InventoryItem[]; busy: boolean; onSave: (items: RxDraft[]) => void;
}> = ({ meds, busy, onSave }) => {
    const { t } = useLanguage();
    const [items, setItems] = useState<RxDraft[]>([EMPTY_RX]);
    const setField = (index: number, patch: Partial<RxDraft>) =>
        setItems(list => list.map((x, j) => j === index ? { ...x, ...patch } : x));
    return (
        <PickerBox title={t('visit.prescription')}>
            <datalist id="xc-rx-meds">
                {meds.map(m => <option key={m.id} value={m.name} />)}
            </datalist>
            <div className="space-y-2">
                {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                        <input value={it.name} list="xc-rx-meds" placeholder={t('visit.medName')}
                            onChange={e => setField(i, { name: e.target.value })}
                            className={`${inputCls} col-span-12 sm:col-span-4`} />
                        <input value={it.dosage} placeholder={t('visit.dose')}
                            onChange={e => setField(i, { dosage: e.target.value })}
                            className={`${inputCls} col-span-4 sm:col-span-3`} />
                        <input value={it.frequency} placeholder={t('visit.frequencyPh')}
                            onChange={e => setField(i, { frequency: e.target.value })}
                            className={`${inputCls} col-span-5 sm:col-span-3`} />
                        <input type="number" value={it.durationDays} placeholder={t('visit.days')}
                            onChange={e => setField(i, { durationDays: e.target.value })}
                            className={`${inputCls} col-span-3 sm:col-span-2`} />
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-3 mt-3">
                <button type="button" onClick={() => setItems(list => [...list, EMPTY_RX])}
                    className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">{t('visit.oneMoreMed')}</button>
                <button type="button" onClick={() => onSave(items)} disabled={busy || !items.some(i => i.name.trim())} className={`ml-auto ${sendCls}`}>
                    {t('visit.saveRx')}
                </button>
            </div>
        </PickerBox>
    );
};

export const ServicePicker: React.FC<{
    services: Service[]; busy: boolean; onAdd: (serviceId: number) => void;
}> = ({ services, busy, onAdd }) => {
    const { t } = useLanguage();
    const [picked, setPicked] = useState<number | ''>('');
    return (
        <PickerBox title={t('visit.addService')}>
            <div className="flex flex-wrap gap-3">
                <select value={picked} className={`${inputCls} max-w-md`} aria-label={t('visit.addService')}
                    onChange={e => setPicked(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">{t('common.choose')}</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — {formatNumber(s.price)}</option>)}
                </select>
                <button type="button" onClick={() => picked !== '' && onAdd(picked)} disabled={busy || picked === ''} className={sendCls}>
                    {t('common.add')}
                </button>
            </div>
        </PickerBox>
    );
};
