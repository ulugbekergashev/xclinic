import React, { useState } from 'react';
import { Modal, Input, Button } from './Common';
import { Patient, Doctor, UserRole } from '../types';
import { api } from '../services/api';
import { ChevronDown, Search, Loader2 } from 'lucide-react';

interface AddPatientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddPatient: (data: Omit<Patient, 'id' | 'clinicId'>) => Promise<Patient | void>;
    doctors?: Doctor[];
    userRole?: UserRole;
    doctorId?: string; // DOCTOR roli uchun avtomatik biriktirish
    compact?: boolean; // true = faqat asosiy maydonlar ochiq, qolgani yig'iladigan
    onCreated?: (patient: Patient) => void;
}

const emptyForm = {
    firstName: '', lastName: '', phone: '', secondaryPhone: '',
    dob: '', gender: 'Male', address: '', medicalHistory: '', doctorId: '', pinfl: '',
};

// Barcha joylar uchun yagona bemor qo'shish modali.
export const AddPatientModal: React.FC<AddPatientModalProps> = ({
    isOpen, onClose, onAddPatient, doctors = [], userRole, doctorId, compact = false, onCreated,
}) => {
    const [form, setForm] = useState({ ...emptyForm });
    const [showMore, setShowMore] = useState(!compact);
    const [saving, setSaving] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const isDoctor = userRole === UserRole.DOCTOR;

    const reset = () => { setForm({ ...emptyForm }); setShowMore(!compact); };

    const handleLookupPinfl = async () => {
        if (!form.pinfl || form.pinfl.length < 14) {
            alert('JSHSHIR 14 raqamdan iborat bo\'lishi kerak');
            return;
        }
        setLookupLoading(true);
        try {
            const data: any = await api.patients.lookupPinfl(form.pinfl);
            if (data) {
                setForm(f => ({
                    ...f,
                    firstName: data.firstName || f.firstName,
                    lastName: data.lastName || f.lastName,
                    dob: data.dob || f.dob,
                    gender: data.gender || f.gender,
                    address: data.address || f.address,
                }));
                setShowMore(true);
            }
        } catch (e: any) {
            alert(e.message || 'JSHSHIR bo\'yicha ma\'lumot topilmadi');
        } finally {
            setLookupLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.firstName.trim() || !form.lastName.trim()) {
            alert('Ism va familiyani kiriting');
            return;
        }
        setSaving(true);
        try {
            const newPatient = await onAddPatient({
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                phone: form.phone,
                secondaryPhone: form.secondaryPhone || undefined,
                dob: form.dob,
                gender: form.gender as 'Male' | 'Female',
                address: form.address || undefined,
                medicalHistory: form.medicalHistory || '',
                doctorId: isDoctor ? doctorId : (form.doctorId || undefined),
                pinfl: form.pinfl || undefined,
                status: 'Active',
                lastVisit: 'Never',
            } as Omit<Patient, 'id' | 'clinicId'>);
            reset();
            onClose();
            if (newPatient && (newPatient as Patient).id) onCreated?.(newPatient as Patient);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Yangi bemor qo'shish" className="max-w-xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Asosiy maydonlar */}
                <div className="grid grid-cols-2 gap-3">
                    <Input label="Familiya *" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
                    <Input label="Ism *" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
                </div>
                <Input label="Telefon" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+998 90 123 45 67" />

                {/* Qo'shimcha ma'lumot toggle */}
                {compact && (
                    <button
                        type="button"
                        onClick={() => setShowMore(s => !s)}
                        className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                        <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
                        Qo'shimcha ma'lumot
                    </button>
                )}

                {showMore && (
                    <div className="space-y-4 pt-1">
                        <div className="flex gap-2 items-end">
                            <Input label="JSHSHIR (PINFL)" containerClassName="flex-1" value={form.pinfl} onChange={e => setForm(f => ({ ...f, pinfl: e.target.value }))} placeholder="14 raqam" maxLength={14} />
                            <Button type="button" variant="secondary" onClick={handleLookupPinfl} disabled={lookupLoading} className="h-10">
                                {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Qo'shimcha telefon" value={form.secondaryPhone} onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} />
                            <Input label="Tug'ilgan sana" type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
                        </div>
                        <Input label="Manzil" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />

                        {!isDoctor && doctors.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Biriktirilgan shifokor</label>
                                <select
                                    value={form.doctorId}
                                    onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}
                                    className="w-full h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 outline-none"
                                >
                                    <option value="">Tanlanmagan</option>
                                    {doctors.map(d => <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>)}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jins</label>
                            <div className="flex gap-2">
                                {(['Male', 'Female'] as const).map(g => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, gender: g }))}
                                        className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-all ${form.gender === g
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                                    >
                                        {g === 'Male' ? 'Erkak' : 'Ayol'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tibbiy tarix</label>
                            <textarea
                                value={form.medicalHistory}
                                onChange={e => setForm(f => ({ ...f, medicalHistory: e.target.value }))}
                                rows={2}
                                placeholder="Allergiya, surunkali kasalliklar..."
                                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Bekor</Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saqlanmoqda...</> : 'Saqlash'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
