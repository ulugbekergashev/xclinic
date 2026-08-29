import React, { useState } from 'react';
import { formatFullName } from '../utils/format';
import { toast } from '../services/toast';
import { Modal, Input, Button } from './Common';
import { Patient, Doctor, UserRole } from '../types';
import { api } from '../services/api';
import { ChevronDown, Search, Loader2 } from 'lucide-react';
import { normalizeUzPhone } from '../utils/phone';
import { validatePatient, formatUzPhone } from '../shared/validation';

/* ─── Kiritish sifati (FIX-PLAN 8.4) ──────────────────────────────────────
   Ilgari faqat ism va familiya tekshirilardi. Telefon va tug'ilgan sana esa
   qanday yozilsa shunday tushardi — natijada SMS ketmaydigan raqamlar va
   2035-yilda tug'ilgan bemorlar paydo bo'lardi.

   Tekshiruv YUMSHOQ: xato ko'rsatiladi, lekin saqlashni faqat aniq noto'g'ri
   qiymat to'xtatadi. Registratura shoshib ishlaydi va uni har maydonda
   bloklab qo'yish — dasturni tashlab, daftarga yozishga majbur qilish. */
const MAX_AGE_YEARS = 120;

function dobProblem(dob: string): string | null {
    if (!dob) return null;
    const d = new Date(dob + 'T00:00:00Z');
    if (isNaN(d.getTime())) return "Sana noto'g'ri";
    const now = new Date();
    if (d.getTime() > now.getTime()) return 'Sana kelajakda';
    const years = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (years > MAX_AGE_YEARS) return `${MAX_AGE_YEARS} yoshdan katta — sanani tekshiring`;
    return null;
}

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
    dob: '', gender: 'Male', address: '', medicalHistory: '', doctorId: '', pinfl: '', cardNumber: '',
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
            toast.error('JSHSHIR 14 raqamdan iborat bo\'lishi kerak');
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
            toast.error(e.message || 'JSHSHIR bo\'yicha ma\'lumot topilmadi');
        } finally {
            setLookupLoading(false);
        }
    };

    /* Takror bemor. Server 409 qaytaradi va topilganlar ro'yxatini beradi —
       bloklamaydi, TANLOV beradi: mavjud kartani ochish yoki baribir yangi
       yaratish. Bir xil ismli ikki bemor bo'lishi mumkin. */
    const [duplicates, setDuplicates] = useState<any[] | null>(null);

    const submit = async (force: boolean) => {
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
                cardNumber: form.cardNumber?.trim() || undefined,
                status: 'Active',
                lastVisit: 'Never',
                ...(force ? { force: true } : {}),
            } as any);
            reset();
            setDuplicates(null);
            onClose();
            if (newPatient && (newPatient as Patient).id) onCreated?.(newPatient as Patient);
        } catch (e: any) {
            if (e?.data?.code === 'DUPLICATE_PATIENT') {
                setDuplicates(e.data.matches || []);
            } else {
                toast.error(e?.message || "Bemorni saqlab bo'lmadi");
            }
        } finally {
            setSaving(false);
        }
    };

    /* MAYDON XATOLARI — har biri o'z maydoni ostida (S3.1, S3.5).

       Ilgari bu yerda `toast.error()` bilan bitta xato ko'rsatilardi va
       foydalanuvchi ularni bittalab topib chiqardi. Endi `validatePatient`
       hamma xatoni bir vaqtda qaytaradi va forma hammasini birdan
       ko'rsatadi.

       Muhimi: qoida SERVER ishlatadigan fayldan keladi
       (`shared/validation.ts`), ya'ni bu yerda o'tgan narsa u yerda
       to'silib qolmaydi. Ilgari telefon xatosi shu yerda faqat
       OGOHLANTIRISH edi va bemor baribir saqlanardi — bazada
       `+99890000000M` kabi yozuvlar shundan (audit B-13). */
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const checked = validatePatient({
            firstName: form.firstName,
            lastName: form.lastName,
            gender: form.gender,
            phone: form.phone,
            dob: form.dob,
            pinfl: form.pinfl,
        });

        if (!checked.ok) {
            setFieldErrors((checked as any).errors || {});
            return;
        }

        setFieldErrors({});
        void submit(false);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Yangi bemor qo'shish" className="max-w-xl">
            {duplicates && duplicates.length > 0 && (
                <div className="mb-4 p-4 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                        Bunday bemor allaqachon bor — yangisini yaratishga ishonchingiz komilmi?
                    </p>
                    <div className="space-y-1.5 mb-3">
                        {duplicates.map((d) => (
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => { setDuplicates(null); reset(); onClose(); onCreated?.(d as Patient); }}
                                className="w-full text-left p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                                           rounded-lg hover:border-primary-400 transition-colors"
                            >
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatFullName(d)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {d.phone}
                                    {d.dob ? ` · ${d.dob}` : ''}
                                    {d.cardNumber ? ` · karta ${d.cardNumber}` : ''}
                                    {d.lastVisit && d.lastVisit !== 'Never' ? ` · oxirgi tashrif ${d.lastVisit}` : ''}
                                </p>
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setDuplicates(null)}>
                            Orqaga
                        </Button>
                        <Button type="button" size="sm" disabled={saving} onClick={() => void submit(true)}>
                            {saving ? 'Saqlanmoqda…' : 'Baribir yangi yaratish'}
                        </Button>
                    </div>
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* UMUMIY XATO QATORI.

                    Ilgari xato faqat uchta maydon ostida ko'rsatilardi
                    (ism, familiya, telefon). Jins, tug'ilgan sana yoki
                    JSHSHIR xato bo'lsa forma JIMGINA saqlamas, sabab esa
                    hech qayerda ko'rinmasdi — foydalanuvchi tugmani
                    bosaverib, nima bo'layotganini tushunmasdi.

                    Buni brauzer E2E sinovi topdi: so'rov umuman
                    ketmasdi. */}
                {Object.values(fieldErrors).some(Boolean) && (
                    <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">
                            Saqlash uchun quyidagilarni to'g'rilang:
                        </p>
                        <ul className="mt-1 text-xs text-red-700 dark:text-red-300 list-disc list-inside">
                            {Object.entries(fieldErrors)
                                .filter(([, v]) => v)
                                .map(([k, v]) => <li key={k}>{v}</li>)}
                        </ul>
                    </div>
                )}
                {/* Asosiy maydonlar */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Input label="Familiya *" value={form.lastName}
                            onChange={e => { setForm(f => ({ ...f, lastName: e.target.value })); if (fieldErrors.lastName) setFieldErrors(v => ({ ...v, lastName: '' })); }} required />
                        {fieldErrors.lastName && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.lastName}</p>}
                    </div>
                    <div>
                        <Input label="Ism *" value={form.firstName}
                            onChange={e => { setForm(f => ({ ...f, firstName: e.target.value })); if (fieldErrors.firstName) setFieldErrors(v => ({ ...v, firstName: '' })); }} required />
                        {fieldErrors.firstName && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.firstName}</p>}
                    </div>
                </div>
                <div>
                    <Input label="Telefon" value={form.phone}
                        onChange={e => {
                            setForm(f => ({ ...f, phone: e.target.value }));
                            if (fieldErrors.phone) setFieldErrors(v => ({ ...v, phone: '' }));
                        }}
                        /* Maydondan chiqqanda ko'rinish bir xillashtiriladi:
                           «901234567» → «+998 90 123 45 67». Yozayotganda
                           emas — kursor sakrab ketmasin. */
                        onBlur={() => setForm(f => ({ ...f, phone: f.phone.trim() ? formatUzPhone(f.phone) : '' }))}
                        placeholder="+998 90 123 45 67" />
                    {fieldErrors.phone ? (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.phone}</p>
                    ) : form.phone.trim() && !normalizeUzPhone(form.phone) ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Raqam tanilmadi. Masalan: +998 90 123 45 67
                        </p>
                    ) : null}
                </div>

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
                            <div className="flex-1">
                                <Input label="JSHSHIR (PINFL)" value={form.pinfl}
                                    onChange={e => setForm(f => ({ ...f, pinfl: e.target.value.replace(/\D/g, '') }))}
                                    placeholder="14 raqam" maxLength={14} inputMode="numeric" />
                                {form.pinfl.length > 0 && form.pinfl.length !== 14 && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                        14 ta raqam bo'lishi kerak ({form.pinfl.length} ta kiritildi)
                                    </p>
                                )}
                            </div>
                            {/* Karta raqami — registratura og'zaki aytadigan va
                                qog'ozga yozadigan raqam. UUID buning uchun yaroqsiz. */}
                            <Input label="Karta raqami" containerClassName="flex-1" value={form.cardNumber}
                                onChange={e => setForm(f => ({ ...f, cardNumber: e.target.value }))}
                                placeholder="Masalan: 001234" />
                            <Button type="button" variant="secondary" onClick={handleLookupPinfl} disabled={lookupLoading} className="h-10">
                                {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Qo'shimcha telefon" value={form.secondaryPhone} onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} />
                            <div>
                                <Input label="Tug'ilgan sana" type="date" value={form.dob}
                                    onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
                                {dobProblem(form.dob) && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{dobProblem(form.dob)}</p>
                                )}
                            </div>
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
                                    {doctors.map(d => <option key={d.id} value={d.id}>{formatFullName(d)}</option>)}
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
