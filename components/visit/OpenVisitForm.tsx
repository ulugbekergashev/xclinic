import React, { useEffect, useId, useMemo, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { Department, Doctor, Patient, Service } from '../../types';
import { api } from '../../services/api';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatNumber } from '../../utils/format';
import { todayISO } from '../../utils/dateUtils';
import { pickableDoctors } from '../DoctorPicker';
import { inputCls } from './sheetParts';

/* ── BUGUN QABUL OCHILMAGAN ──────────────────────────────────────────────────
   «Bugungi qabul» qutisining bo'sh holati. To'rt maydon: Bo'lim → Shifokor →
   Xizmat → Shikoyat — «Bugun» ekranidagi qabul formasi bilan AYNAN bir xil.

   2026-11-21: bir kun shifokor kartochkalari (bo'lim sarlavhalari ostida)
   turdi. Klinika egasi «avvalgi ko'rinishi yaxshimasmidi?» dedi va to'g'ri
   chiqdi: bitta ish ikki ekranda ikki xil ko'rinardi, kartochkalar har yangi
   shifokor bilan o'sib borardi, ismlar kesilardi, shifokorsiz bo'lim va
   bo'limsiz shifokor jimgina yo'qolardi.

   Eski formadan farqi — «Bugun» ekranidagi qoidalar:
     · klinik bo'limda shifokor MAJBURIY. Shifokorsiz qabul hech bir
       shifokorning navbatida ko'rinmaydi (navbat `doctorId` bo'yicha);
     · diagnostikada shifokor ixtiyoriy («Belgilanmagan»);
     · bo'limda bitta shifokor bo'lsa — o'zi tanlanadi;
     · xizmat O'ZI TANLANMAYDI: tanlangani hisobga pul bo'lib tushadi;
     · tugma natijani aytadi: «Qabul ochish — Dr. Tosheva».
   Shifokor kirgan bo'lsa — to'rt maydon emas, bitta «Qabulni boshlash» (pastda). */

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

const BOOKABLE_TYPES = ['CLINICAL', 'DIAGNOSTIC'];
const EMPTY = { departmentId: '', doctorId: '', serviceId: '', complaints: '' };

const nameOf = (d: Doctor) => `${d.lastName || ''} ${d.firstName || ''}`.trim();

export const OpenVisitForm: React.FC<Props> = ({
    patient, departments, doctors, services, loggedDoctorId, error, addToast, onOpened,
}) => {
    const { t } = useLanguage();
    const ids = useId();
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(false);

    /* Qabul faqat KLINIK va DIAGNOSTIK bo'limlarga ochiladi. Laboratoriya
       va dorixona navbat olmaydi — ularga yo'llanma bilan boriladi. */
    const bookable = useMemo(
        () => departments.filter(d => d.isActive && BOOKABLE_TYPES.includes(d.type)),
        [departments],
    );
    const dept = departments.find(d => d.id === form.departmentId);
    const isDiagnostic = dept?.type === 'DIAGNOSTIC';
    /* Yagona qoida: faqat faol shifokorlar; bo'limsiz shifokor har bo'limda */
    const deptDoctors = form.departmentId ? pickableDoctors(doctors, form.departmentId, form.doctorId) : [];
    const deptServices = form.departmentId
        ? services.filter(s => !s.departmentId || s.departmentId === form.departmentId)
        : [];

    /* SHIFOKOR O'ZI UCHUN — BITTA TUGMA (2026-11-22). Klinika egasi: «bu joy
       bilan ko'proq vrach ishlaydi, bo'lim va vrachni tanlab o'tirish
       qanchalik to'g'ri?». Shifokor kirgan bo'lsa bo'lim ham, shifokor ham
       ma'lum: formada faqat «Kardiologiya · Dr. Tosheva» qatori va
       «Qabulni boshlash». Boshqa shifokorga ochish kerak bo'lsa —
       «O'zgartirish», shunda to'liq forma chiqadi. */
    const me = doctors.find(d => d.id === loggedDoctorId && d.status === 'Active' && d.departmentId);
    const [custom, setCustom] = useState(false);

    /* Standart tanlov — ro'yxat kechroq kelsa ham: shifokorga o'zi,
       registratorga bemorning biriktirilgan shifokori (bo'lsa). */
    const preset = me || doctors.find(d => d.id === patient.doctorId && d.status === 'Active' && d.departmentId);
    useEffect(() => {
        if (!preset) return;
        setForm(f => (f.departmentId ? f : { ...f, departmentId: preset.departmentId as string, doctorId: preset.id }));
    }, [preset]);

    const pickDepartment = (departmentId: string) => {
        const next = departments.find(d => d.id === departmentId);
        const list = departmentId ? pickableDoctors(doctors, departmentId) : [];
        /* Klinik bo'limda yagona shifokor — so'rab o'tirmaymiz */
        const only = next?.type !== 'DIAGNOSTIC' && list.length === 1 ? list[0].id : '';
        setForm(f => ({ ...f, departmentId, doctorId: only, serviceId: '' }));
    };

    const doctor = doctors.find(d => d.id === form.doctorId);
    const canOpen = !!form.departmentId && (isDiagnostic || !!form.doctorId);
    const target = doctor ? `Dr. ${nameOf(doctor)}` : dept?.name || '';
    /* Shifokor o'zi uchun ochmoqda — bemor oldida, qabul darhol boshlanadi */
    const forMe = !!me && form.doctorId === me.id;
    const quick = !!me && !custom && forMe;

    const open = async () => {
        if (!canOpen) return;
        setBusy(true);
        try {
            const created = await api.visits.create({
                patientId: patient.id,
                departmentId: form.departmentId,
                doctorId: form.doctorId || undefined,
                doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}`.trim() : undefined,
                complaints: form.complaints.trim() || undefined,
                date: todayISO(),
                /* Shifokor o'ziga ochsa bemor oldida — «Kutmoqda» ni
                   chetlab, qabul darhol boshlanadi (ikkinchi bosish yo'q) */
                status: forMe ? 'In Progress' : 'Waiting',
            } as any);
            if (form.serviceId) {
                try { await api.visits.addProcedure(created.id, { serviceId: Number(form.serviceId) }); }
                catch { addToast('info', t('visit.serviceNotAdded')); }
            }
            addToast('success', forMe ? t('visit.started') : t('visit.opened'));
            setForm(EMPTY);
            setCustom(false);
            onOpened(created.id);
        } catch (e: any) {
            /* Bugun shu bo'limda qabul bor — yangisini ochish o'rniga
               mavjudini ochamiz. Ikki marta ro'yxatga tushish xato. */
            const existing = e?.data?.visitId;
            if (existing) { addToast('info', t('visit.alreadyOpen')); onOpened(existing); }
            else addToast('error', e?.data?.error || e?.message || t('ui.xatolik'));
        } finally { setBusy(false); }
    };

    const label = 'block text-xs font-medium text-muted mb-1.5';
    return (
        <section aria-labelledby="visit-title" className="min-w-0 bg-surface border border-line rounded-[20px]">
            <div className="flex items-center gap-4 px-5 py-4 border-b border-line">
                <span aria-hidden="true" className="shrink-0 w-10 h-10 grid place-items-center rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                    <Activity className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                    <h2 id="visit-title" className="text-lg font-bold text-ink">{t('pcard.todayVisit')}</h2>
                    <p className="text-sm text-muted">{t('pcard.noVisitToday')}</p>
                </div>
            </div>

            <div className="p-5 flex flex-col gap-4">
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                {quick ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="min-w-0 text-sm text-ink">
                            <span className="font-semibold">{dept?.name}</span>
                            <span className="text-muted"> · Dr. {nameOf(me!)}</span>
                            <button type="button" onClick={() => setCustom(true)}
                                className="ml-2 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                                {t('common.change')}
                            </button>
                        </p>
                        <button type="button" onClick={open} disabled={busy}
                            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-50">
                            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            {t('flow.startVisit')}
                        </button>
                    </div>
                ) : (<>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor={`${ids}-dept`} className={label}>{t('reception.department')}</label>
                        <select id={`${ids}-dept`} className={inputCls} value={form.departmentId}
                            onChange={e => pickDepartment(e.target.value)}>
                            <option value="">{t('common.choose')}</option>
                            {bookable.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`${ids}-doctor`} className={label}>
                            {t('ui.shifokor_2')}{form.departmentId && !isDiagnostic ? ' *' : ''}
                            {form.departmentId && deptDoctors.length === 0 ? ` ${t('today.bolimda_shifokor_yoq')}` : ''}
                        </label>
                        <select id={`${ids}-doctor`} className={inputCls} value={form.doctorId} disabled={!form.departmentId}
                            onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}>
                            <option value="">
                                {!form.departmentId ? t('visit.pickDept')
                                    : isDiagnostic ? t('reception.unassigned') : t('today.shifokorni_tanlang_2')}
                            </option>
                            {deptDoctors.map(d => <option key={d.id} value={d.id}>{nameOf(d)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`${ids}-service`} className={label}>{t('today.xizmat_qabul_turi')}</label>
                        <select id={`${ids}-service`} className={inputCls} value={form.serviceId} disabled={!form.departmentId}
                            onChange={e => setForm(f => ({ ...f, serviceId: e.target.value }))}>
                            <option value="">{form.departmentId ? t('today.noService') : t('visit.pickDept')}</option>
                            {deptServices.map(s => <option key={s.id} value={s.id}>{s.name} — {formatNumber(s.price)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`${ids}-complaints`} className={label}>{t('today.shikoyat_ixtiyoriy')}</label>
                        <input id={`${ids}-complaints`} className={inputCls} value={form.complaints} placeholder={t('visit.complaintPh')}
                            onChange={e => setForm(f => ({ ...f, complaints: e.target.value }))} />
                    </div>
                </div>

                <div className="flex justify-end">
                    <button type="button" onClick={open} disabled={busy || !canOpen}
                        className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold disabled:opacity-50">
                        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                        {canOpen ? fill(t('pcard.openFor'), target) : t('visit.openNew')}
                    </button>
                </div>
                </>)}
            </div>
        </section>
    );
};
