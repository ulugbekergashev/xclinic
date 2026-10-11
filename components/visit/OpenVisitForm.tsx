import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Stethoscope } from 'lucide-react';
import { Department, Doctor, Patient, Service } from '../../types';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { formatNumber } from '../../utils/format';
import { todayISO } from '../../utils/dateUtils';
import { pickableDoctors } from '../DoctorPicker';
import { inputCls } from './sheetParts';

/* ── YANGI QABUL OCHISH ──────────────────────────────────────────────────────
   Bugun bemorning ochiq qabuli yo'q — varaq o'rnida shu forma turadi.
   Registraturaga bormasdan: shifokor o'z bo'limida bemorni qabul qila oladi;
   navbat raqamini baribir server beradi, ya'ni tablo va navbat mantiqi
   buzilmaydi. */

interface Props {
    patient: Patient;
    departments: Department[];
    doctors: Doctor[];
    services: Service[];
    /** Kirgan shifokor — o'zi standart bo'lib tanlanadi */
    loggedDoctorId?: string;
    error?: string;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
    onOpened: (visitId: string) => void;
}

const EMPTY = { departmentId: '', doctorId: '', serviceId: '', complaints: '' };

export const OpenVisitForm: React.FC<Props> = ({
    patient, departments, doctors, services, loggedDoctorId, error, addToast, onOpened,
}) => {
    const { t } = useLanguage();
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(false);

    /* Kirgan shifokor o'zi standart bo'lib turadi: o'z bemorini qabul
       qilayotgan odam har safar ro'yxatdan o'zini qidirib o'tirmasin. */
    useEffect(() => {
        if (!loggedDoctorId) return;
        const me = doctors.find(d => d.id === loggedDoctorId);
        if (!me || !me.departmentId) return;
        setForm(f => (f.departmentId || f.doctorId)
            ? f
            : { ...f, doctorId: me.id, departmentId: me.departmentId as string });
    }, [loggedDoctorId, doctors]);

    /* Qabul ochish uchun faqat KLINIK va DIAGNOSTIK bo'limlar. Laboratoriya
       va dorixona navbat olmaydi — ularga yo'llanma bilan boriladi
       (Registratura bilan bir xil qoida). */
    const bookable = useMemo(
        () => departments.filter(d => d.isActive && (d.type === 'CLINICAL' || d.type === 'DIAGNOSTIC')),
        [departments],
    );
    /* Yagona qoida (`pickableDoctors`): faqat FAOL shifokorlar, kerak bo'lsa
       bo'lim bo'yicha. Ilgari bu yerda holat umuman tekshirilmasdi va
       ta'tildagi shifokorga qabul ochib bo'lardi. */
    const formDoctors = pickableDoctors(doctors, form.departmentId || null, form.doctorId);
    const formServices = services.filter(s => !form.departmentId || !s.departmentId || s.departmentId === form.departmentId);

    const open = async () => {
        if (!form.departmentId) { addToast('error', t('visit.pickDept')); return; }
        setBusy(true);
        try {
            const doc = doctors.find(d => d.id === form.doctorId);
            const created = await api.visits.create({
                patientId: patient.id,
                departmentId: form.departmentId,
                doctorId: form.doctorId || undefined,
                doctorName: doc ? `${doc.firstName} ${doc.lastName}`.trim() : undefined,
                complaints: form.complaints.trim() || undefined,
                date: todayISO(),
                status: 'Waiting',
            } as any);
            if (form.serviceId) {
                try { await api.visits.addProcedure(created.id, { serviceId: Number(form.serviceId) }); }
                catch { addToast('info', t('visit.serviceNotAdded')); }
            }
            addToast('success', t('visit.opened'));
            setForm(EMPTY);
            onOpened(created.id);
        } catch (e: any) {
            /* Bugun shu bo'limda qabul bor — yangisini ochish o'rniga
               mavjudini ochamiz. Ikki marta ro'yxatga tushish xato. */
            const existing = e?.data?.visitId;
            if (existing) { addToast('info', t('visit.alreadyOpen')); onOpened(existing); }
            else addToast('error', e?.data?.error || e?.message || t('ui.xatolik'));
        } finally { setBusy(false); }
    };

    const fieldLabel = 'block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5';
    return (
        <section aria-labelledby="visit-title" className="bg-surface rounded-[20px] border border-line p-5">
            <h2 id="visit-title" className="flex items-center gap-2 text-base font-bold text-ink">
                <Stethoscope className="w-5 h-5 text-primary-600" aria-hidden="true" /> {t('visit.noOpen')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('visit.noOpenHint')}</p>
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                    <span className={fieldLabel}>{t('visit.department')}</span>
                    <select className={inputCls} value={form.departmentId}
                        onChange={e => setForm(f => ({ ...f, departmentId: e.target.value, doctorId: '', serviceId: '' }))}>
                        <option value="">{t('common.choose')}</option>
                        {bookable.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className={fieldLabel}>{t('visit.doctor')}</span>
                    <select className={inputCls} value={form.doctorId} disabled={!form.departmentId}
                        onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}>
                        <option value="">{t('common.choose')}</option>
                        {formDoctors.map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className={fieldLabel}>{t('visit.serviceOptional')}</span>
                    <select className={inputCls} value={form.serviceId} disabled={!form.departmentId}
                        onChange={e => setForm(f => ({ ...f, serviceId: e.target.value }))}>
                        <option value="">{t('common.choose')}</option>
                        {formServices.map(s => <option key={s.id} value={s.id}>{s.name} — {formatNumber(s.price)}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className={fieldLabel}>{t('visit.complaintLabel')}</span>
                    <input className={inputCls} value={form.complaints} placeholder={t('visit.complaintPh')}
                        onChange={e => setForm(f => ({ ...f, complaints: e.target.value }))} />
                </label>
            </div>
            <button type="button" onClick={open} disabled={busy || !form.departmentId}
                className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t('visit.openNew')}
            </button>
        </section>
    );
};
