import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Input, Select, Button, SearchableSelect } from './Common';
import { Appointment, Patient, Doctor, Service, ServiceCategory } from '../types';
import { formatFullName } from '../utils/format';
import { formatDoctorName } from '../utils/format';
import { todayISO } from '../utils/dateUtils';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { Plus, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/* ─────────────────────────────────────────────────────────────────────────────
   YOZUV FORMASI — YAGONA.

   Ilgari ikkita nusxa bor edi:

     · `Calendar.tsx`      — to'liq forma, to'qnashuvni SERVER tekshiradi;
     · `PatientDetails.tsx` — o'z formasi va O'ZINING to'qnashuv tekshiruvi,
                              u brauzerga yuklangan ro'yxatga qarab ishlardi
                              va `appt.time === apptData.time` bilan
                              solishtirardi. Ya'ni 08:30 dagi bir soatlik
                              qabul ustiga 09:00 ni yozib bo'laverardi, va
                              yuklanmagan yozuvni «yo'q» deb hisoblardi.

   Tekshiruv endi FAQAT serverda: u butun jadvalni ko'radi va oraliqlarni
   solishtiradi. Server to'smaydi, TANLOV beradi (409 + `DOCTOR_BUSY`), forma
   esa tasdiq so'rab `force` bilan takrorlaydi.

   Xizmat NOM bilan emas, IDENTIFIKATOR bilan yuboriladi (migratsiya 0034):
   prayslistda nom o'zgarsa ham bemor kelganda xizmat topiladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Berilsa — TAHRIRLASH rejimi */
    appointment?: Appointment | null;
    /** Bemor oldindan ma'lum (bemor kartasi) — tanlash maydoni ko'rinmaydi */
    patient?: Patient | null;
    patients?: Patient[];
    doctors: Doctor[];
    services: Service[];
    categories?: ServiceCategory[];
    /** Boshlang'ich sana/vaqt — kalendarda katakka bosilganda */
    defaultDate?: string;
    defaultTime?: string;
    defaultDoctorId?: string;
    /** Yangi bemor qo'shish tugmasi (kalendar) */
    onAddPatientClick?: () => void;
    onCreate?: (appt: Omit<Appointment, 'id' | 'clinicId'>) => Promise<any>;
    onUpdate?: (id: string, data: Partial<Appointment>) => Promise<any>;
    onSaved?: () => void;
}

const emptyForm = {
    patientId: '', doctorId: '', serviceId: '' as string,
    type: '', categoryId: '', date: todayISO(), time: '09:00',
    duration: 60, notes: '',
};

export const AppointmentFormModal: React.FC<Props> = ({
    isOpen, onClose, appointment = null, patient = null, patients = [],
    doctors, services, categories = [],
    defaultDate, defaultTime, defaultDoctorId,
    onAddPatientClick, onCreate, onUpdate, onSaved,
}) => {
    const { t } = useLanguage();
    const isEdit = !!appointment;
    const [form, setForm] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        if (appointment) {
            setForm({
                patientId: appointment.patientId,
                doctorId: appointment.doctorId || '',
                serviceId: appointment.serviceId ? String(appointment.serviceId) : '',
                type: appointment.type || '',
                categoryId: '',
                date: appointment.date,
                time: appointment.time,
                duration: appointment.duration || 60,
                notes: appointment.notes || '',
            });
        } else {
            setForm({
                ...emptyForm,
                patientId: patient?.id || '',
                doctorId: defaultDoctorId || patient?.doctorId || (doctors[0]?.id || ''),
                date: defaultDate || todayISO(),
                time: defaultTime || '09:00',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, appointment?.id, patient?.id, defaultDate, defaultTime, defaultDoctorId]);

    const visibleServices = useMemo(() => services.filter(
        s => !form.categoryId || (s as any).categoryId === form.categoryId), [services, form.categoryId]);

    const pickService = (value: string) => {
        const svc = services.find(s => String(s.id) === value);
        setForm(f => ({
            ...f,
            serviceId: value,
            type: svc?.name || '',
            duration: svc?.duration || f.duration,
        }));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const target = patient || patients.find(p => p.id === form.patientId);
        if (!target) { toast.error('Bemor tanlanmagan'); return; }
        const doctor = doctors.find(d => d.id === form.doctorId);
        if (!doctor) { toast.error('Shifokor tanlanmagan'); return; }

        /* Yuborish alohida funksiyada: 409 dan keyin AYNAN shu so'rovni
           `force` bilan takrorlash kerak. */
        const send = async (force: boolean) => {
            const payload: any = {
                patientId: target.id,
                patientName: formatFullName(target),
                doctorId: doctor.id,
                doctorName: formatDoctorName(doctor),
                // Xizmat: bog'lam + o'sha paytdagi nom
                serviceId: form.serviceId ? Number(form.serviceId) : null,
                type: form.type || 'Konsultatsiya',
                date: form.date,
                time: form.time,
                duration: Number(form.duration),
                notes: form.notes,
                ...(force ? { force: true } : {}),
            };
            if (isEdit && appointment) await onUpdate?.(appointment.id, payload);
            else await onCreate?.({ ...payload, status: 'Pending' });
        };

        setSaving(true);
        try {
            await send(false);
            onClose();
            onSaved?.();
        } catch (err: any) {
            /* SHIFOKOR BAND (409). Server TO'SMAYDI, TANLOV beradi —
               shoshilinch holatda registrator ustiga yozishi kerak
               bo'lishi mumkin. */
            const code = err?.data?.code || err?.code;
            if (code === 'DOCTOR_BUSY') {
                const busy = err?.data?.conflict;
                const when = busy ? `${busy.time} — ${busy.patientName || 'bemor'}` : '';
                const okToForce = await confirmAction({
                    title: when ? `Bu vaqtda shifokor band: ${when}` : 'Bu vaqtda shifokor band',
                    body: 'Baribir yozilsinmi?',
                    confirmLabel: 'Baribir yozish',
                });
                if (okToForce) {
                    try {
                        await send(true);
                        onClose();
                        onSaved?.();
                    } catch (e2: any) {
                        toast.error(e2?.data?.error || e2?.message || 'Yozib bo\'lmadi');
                    }
                }
            } else {
                toast.error(err?.data?.error || err?.message || 'Yozib bo\'lmadi');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}
            title={isEdit ? t('calendar.editAppointment') : t('calendar.newAppointment')}>
            <form onSubmit={submit} className="space-y-4">
                {/* Bemor — karta ichida tanlash kerak emas */}
                {!patient && (
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <SearchableSelect
                                label={t('calendar.patient')}
                                options={patients.map(p => ({ value: p.id, label: formatFullName(p) }))}
                                value={form.patientId}
                                onChange={(val) => setForm(f => ({ ...f, patientId: val }))}
                            />
                        </div>
                        {!isEdit && onAddPatientClick && (
                            <Button type="button" variant="secondary"
                                className="mb-1 p-2 h-10 w-10 flex items-center justify-center"
                                onClick={onAddPatientClick} title={t('patients.modal.addTitle')}>
                                <Plus className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                )}

                <Select
                    label={t('calendar.doctor')}
                    options={doctors.map(d => ({ value: d.id, label: formatDoctorName(d) }))}
                    value={form.doctorId}
                    onChange={(e) => setForm(f => ({ ...f, doctorId: e.target.value }))}
                />

                {categories.length > 0 && (
                    <Select
                        label={t('calendar.serviceCategory')}
                        options={[
                            { value: '', label: t('calendar.allCategories') },
                            ...categories.map(c => ({ value: c.id, label: c.name })),
                        ]}
                        value={form.categoryId}
                        onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value, serviceId: '', type: '' }))}
                    />
                )}

                <div className="grid grid-cols-2 gap-4">
                    {/* Qiymat — IDENTIFIKATOR, nom emas: prayslistda nom
                        o'zgarsa yozuv bilan aloqa uzilmasin. */}
                    <Select
                        label={t('calendar.serviceType')}
                        options={[
                            { value: '', label: t('common.select') },
                            ...visibleServices.map(s => ({ value: String(s.id), label: s.name })),
                        ]}
                        value={form.serviceId}
                        onChange={e => pickService(e.target.value)}
                    />
                    <Input label={t('calendar.duration')} type="number" value={form.duration}
                        onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input label={t('calendar.date')} type="date" value={form.date}
                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                    <Input label={t('calendar.time')} type="time" value={form.time}
                        onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('calendar.notes')}</label>
                    <textarea
                        className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm h-20 dark:border-gray-700 dark:text-white"
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
                    <Button type="submit" disabled={saving}>
                        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {isEdit ? t('common.save') : t('calendar.book')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
