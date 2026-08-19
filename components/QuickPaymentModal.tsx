import React, { useState } from 'react';
import { Modal, Button } from './Common';
import { Patient, Doctor, Transaction, PaymentMethod } from '../types';
import { INCOMING_PAYMENT_METHODS, getPaymentMethodLabel } from '../utils/paymentMethods';
import { Plus, Loader2 } from 'lucide-react';

interface QuickPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    patients: Patient[];
    doctors: Doctor[];
    services: { name: string; price: number; duration?: number }[];
    clinicId: string;
    onAddTransaction: (tx: Omit<Transaction, 'id'>) => Promise<any>;
    presetPatientId?: string;
    presetDoctorId?: string;
    presetService?: string;
    presetAmount?: number;
    presetDate?: string; // Qabul sanasi — isAppointmentPaid shu sana bo'yicha moslashtiradi
}

const emptyForm = {
    patientId: '', doctorId: '', service: '', amount: '',
    type: 'Cash' as PaymentMethod,
};

const inputCls = "w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500/30 dark:text-white";
const labelCls = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5";

// Tez to'lov modali (Finance + Dashboard). status har doim 'Paid', bitta tranzaksiya.
export const QuickPaymentModal: React.FC<QuickPaymentModalProps> = ({
    isOpen, onClose, patients, doctors, services, clinicId, onAddTransaction,
    presetPatientId, presetDoctorId, presetService, presetAmount, presetDate,
}) => {
    const buildPresetForm = () => ({
        ...emptyForm,
        patientId: presetPatientId || '',
        doctorId: presetDoctorId || '',
        service: presetService || '',
        amount: presetAmount ? String(presetAmount) : '',
    });
    const [form, setForm] = useState(buildPresetForm);
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        if (isOpen) setForm(buildPresetForm());
    }, [isOpen, presetPatientId, presetDoctorId, presetService, presetAmount]);

    const handleSave = async () => {
        if (!form.amount || !form.patientId) return;
        setSaving(true);
        try {
            const patient = patients.find(p => p.id === form.patientId);
            const doctor = doctors.find(d => d.id === form.doctorId);
            const today = new Date().toISOString().split('T')[0];
            await onAddTransaction({
                patientName: patient ? `${patient.lastName} ${patient.firstName}` : '',
                date: presetDate || today,
                amount: parseFloat(form.amount),
                type: form.type,
                service: form.service || 'To\'lov',
                status: 'Paid',
                clinicId,
                patientId: form.patientId || undefined,
                doctorId: form.doctorId || undefined,
                doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : undefined,
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="💰 To'lov qo'shish" className="max-w-md">
            <div className="space-y-4">
                <div>
                    <label className={labelCls}>Bemor *</label>
                    <select value={form.patientId} onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))} className={inputCls}>
                        <option value="">Bemorni tanlang...</option>
                        {patients.map(p => <option key={p.id} value={p.id}>{p.lastName} {p.firstName} — {p.phone}</option>)}
                    </select>
                </div>

                <div>
                    <label className={labelCls}>Shifokor</label>
                    <select value={form.doctorId} onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))} className={inputCls}>
                        <option value="">Tanlanmagan (ixtiyoriy)</option>
                        {doctors.map(d => <option key={d.id} value={d.id}>{d.lastName} {d.firstName} — {d.specialty}</option>)}
                    </select>
                </div>

                <div>
                    <label className={labelCls}>Xizmat</label>
                    <select
                        value={form.service}
                        onChange={e => {
                            const svc = services.find(s => s.name === e.target.value);
                            setForm(f => ({ ...f, service: e.target.value, amount: svc ? String(svc.price) : f.amount }));
                        }}
                        className={inputCls}
                    >
                        <option value="">Xizmatni tanlang...</option>
                        {services.map((s, i) => <option key={i} value={s.name}>{s.name} — {s.price.toLocaleString()} UZS</option>)}
                    </select>
                </div>

                <div>
                    <label className={labelCls}>Summa (UZS) *</label>
                    <input type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} onWheel={e => e.currentTarget.blur()} className={inputCls} />
                </div>

                <div>
                    <label className={labelCls}>To'lov usuli</label>
                    <div className="flex gap-2 flex-wrap">
                        {[...INCOMING_PAYMENT_METHODS, 'Balance' as PaymentMethod].map(type => (
                            <button
                                key={type}
                                onClick={() => setForm(f => ({ ...f, type }))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${form.type === type
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                            >
                                {getPaymentMethodLabel(type)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 pt-2">
                    <Button variant="secondary" className="flex-1" onClick={onClose}>Bekor</Button>
                    <button
                        disabled={saving || !form.amount || !form.patientId}
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-success hover:bg-success-700 disabled:bg-success/50 disabled:cursor-not-allowed transition-all"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Saqlash
                    </button>
                </div>
            </div>
        </Modal>
    );
};
