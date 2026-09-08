import React, { useState, useEffect } from 'react';
import { formatFullName } from '../utils/format';
import { toast } from '../services/toast';
import { Modal, Input, Button } from './Common';
import { Patient, Doctor, UserRole } from '../types';
import { api } from '../services/api';
import { ChevronDown, Search, Loader2, Plus } from 'lucide-react';
import { normalizeUzPhone } from '../utils/phone';
import { validatePatient, formatUzPhone } from '../shared/validation';
import { DoctorPicker } from './DoctorPicker';

/* ─────────────────────────────────────────────────────────────────────────────
   BEMOR FORMASI — YAGONA.

   Ilgari bemor TO'RT joyda kiritilardi va har biri o'z formasi bilan:

     · `Patients.tsx`      — to'liq forma, JSHSHIR va rasm bor, lekin takror
                             haqidagi 409 ni JIMGINA yutardi (`catch {}`),
                             ya'ni tugma bosilardi va hech narsa bo'lmasdi;
     · `Calendar.tsx`      — o'z formasi, tekshiruvsiz;
     · `Today.tsx`         — eng qisqasi, `api.patients.create` ga to'g'ridan-
                             to'g'ri yozardi, tekshiruv umuman yo'q;
     · `PatientDetails`    — tahrirlash oynasi, atigi 5 maydon: tug'ilgan
                             sana va JINSNI umuman o'zgartirib bo'lmasdi,
                             holbuki tahlil normalari aynan shulardan
                             tanlanadi.

   Va aynan mana bu — hammasidan to'lig'i — HECH QAYERDA ishlatilmasdi.

   Endi bitta komponent ikkala ish uchun: `patient` berilsa TAHRIRLASH,
   berilmasa YARATISH.
   ───────────────────────────────────────────────────────────────────────────── */

const MAX_AGE_YEARS = 120;

/* Tug'ilgan sana tekshiruvi YUMSHOQ: xato ko'rsatiladi, lekin saqlashni
   to'xtatmaydi. Registratura shoshib ishlaydi va uni har maydonda bloklab
   qo'yish — dasturni tashlab, daftarga yozishga majbur qilish. */
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

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Berilsa — TAHRIRLASH rejimi. */
    patient?: Patient | null;
    /** Yaratish. Takror bo'lsa `DUPLICATE_PATIENT` bilan xato tashlashi kerak. */
    onCreate?: (data: Omit<Patient, 'id' | 'clinicId'>) => Promise<Patient | void>;
    /** Tahrirlash. */
    onUpdate?: (id: string, data: Partial<Patient>) => Promise<void> | void;
    doctors?: Doctor[];
    userRole?: UserRole;
    /** DOCTOR roli uchun avtomatik biriktirish */
    doctorId?: string;
    /** true = faqat asosiy maydonlar ochiq, qolgani yig'iladigan */
    compact?: boolean;
    /** Yaratishda rasm yuklash maydoni ham ko'rinsin */
    allowPhoto?: boolean;
    /** Saqlangandan keyin. `kind` chaqiruvchiga qaror berish uchun:
     *  `existing` — takror ro'yxatidan MAVJUD karta tanlandi, uni ochish
     *  deyarli har doim to'g'ri; `created` — yangi yozildi. */
    onSaved?: (patient: Patient, kind: 'created' | 'existing' | 'updated') => void;
}

const emptyForm = {
    firstName: '', lastName: '', phone: '', secondaryPhone: '',
    dob: '', gender: 'Male', address: '', medicalHistory: '',
    doctorId: '', pinfl: '', cardNumber: '', status: 'Active',
};

export const PatientFormModal: React.FC<Props> = ({
    isOpen, onClose, patient = null, onCreate, onUpdate,
    doctors = [], userRole, doctorId, compact = false, allowPhoto = false, onSaved,
}) => {
    const isEdit = !!patient;
    const [form, setForm] = useState({ ...emptyForm });
    const [showMore, setShowMore] = useState(!compact);
    const [saving, setSaving] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [photo, setPhoto] = useState<File | null>(null);
    const [duplicates, setDuplicates] = useState<any[] | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const isDoctor = userRole === UserRole.DOCTOR;

    /* Oyna ochilganda forma to'ldiriladi. Tahrirlashda hamma maydon
       ochiq turadi: yig'ilgan bo'limda yashiringan qiymatni topolmay
       «bu yerda tug'ilgan sana yo'q» degan xulosa chiqarish oson.

       Bog'liqlikda `patient.id`, obyektning O'ZI emas. Karta sahifasi
       bemorni `patients.find(...)` bilan oladi va ro'yxat yangilanganda
       yangi obyekt qaytishi mumkin — u holda effekt har renderda ishlab,
       foydalanuvchi yozayotgan matnni ustidan qayta yozib turardi. */
    useEffect(() => {
        if (!isOpen) return;
        setDuplicates(null);
        setFieldErrors({});
        setPhoto(null);
        if (patient) {
            setForm({
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                phone: patient.phone || '',
                secondaryPhone: patient.secondaryPhone || '',
                dob: patient.dob || '',
                gender: patient.gender || 'Male',
                address: patient.address || '',
                medicalHistory: patient.medicalHistory || '',
                doctorId: patient.doctorId || '',
                pinfl: patient.pinfl || '',
                cardNumber: patient.cardNumber || '',
                status: patient.status || 'Active',
            });
            setShowMore(true);
        } else {
            setForm({ ...emptyForm });
            setShowMore(!compact);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, patient?.id, compact]);

    const handleLookupPinfl = async () => {
        if (!form.pinfl || form.pinfl.length < 14) {
            toast.error('JSHSHIR 14 raqamdan iborat bo\'lishi kerak');
            return;
        }
        setLookupLoading(true);
        try {
            /* `api.patients.lookupPinfl` DMED ning FHIR javobini yassi
               shaklga o'giradi — bu yerda faqat to'ldiramiz. */
            const data = await api.patients.lookupPinfl(form.pinfl);
            if (!(data.firstName || data.lastName || data.dob)) {
                toast.error('JSHSHIR bo\'yicha ma\'lumot topilmadi');
                return;
            }
            setForm(f => ({
                ...f,
                firstName: data.firstName || f.firstName,
                lastName: data.lastName || f.lastName,
                dob: data.dob || f.dob,
                gender: data.gender || f.gender,
                address: data.address || f.address,
            }));
            setShowMore(true);
        } catch (e: any) {
            toast.error(e.message || 'JSHSHIR bo\'yicha ma\'lumot topilmadi');
        } finally {
            setLookupLoading(false);
        }
    };

    const close = () => { setDuplicates(null); onClose(); };

    /* Takror bemor. Server 409 qaytaradi va topilganlar ro'yxatini beradi —
       bloklamaydi, TANLOV beradi: mavjud kartani ochish yoki baribir yangi
       yaratish. Bir xil ismli ikki bemor bo'lishi mumkin. */
    const submit = async (force: boolean) => {
        setSaving(true);
        try {
            const payload = {
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
            };

            if (isEdit && patient) {
                await onUpdate?.(patient.id, { ...payload, status: form.status as Patient['status'] });
                close();
                onSaved?.({ ...patient, ...payload } as Patient, 'updated');
                return;
            }

            const created = await onCreate?.({
                ...payload,
                status: 'Active',
                lastVisit: 'Never',
                ...(force ? { force: true } : {}),
            } as any);

            /* Rasm yaratilgandan KEYIN yuklanadi: unga bemor id si kerak.
               Yuklash yiqilsa bemor baribir saqlangan bo'ladi — shuning
               uchun xato faqat ogohlantiradi. */
            if (created && (created as Patient).id && photo) {
                const id = (created as Patient).id;
                try {
                    await Promise.all([
                        api.patients.uploadAvatar(id, photo),
                        api.patients.uploadPortrait(id, photo),
                    ]);
                } catch {
                    toast.error('Bemor saqlandi, lekin rasm yuklanmadi');
                }
            }

            close();
            if (created && (created as Patient).id) onSaved?.(created as Patient, 'created');
        } catch (e: any) {
            if (e?.data?.code === 'DUPLICATE_PATIENT') {
                setDuplicates(e.data.matches || []);
            } else if (e?.data?.fields) {
                // Server tekshiruvi — maydon ostiga tushadi
                setFieldErrors(e.data.fields);
            } else {
                toast.error(e?.message || "Bemorni saqlab bo'lmadi");
            }
        } finally {
            setSaving(false);
        }
    };

    /* MAYDON XATOLARI — har biri o'z maydoni ostida.

       Qoida SERVER ishlatadigan fayldan keladi (`shared/validation.ts`),
       ya'ni bu yerda o'tgan narsa u yerda to'silib qolmaydi. */
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
        <Modal isOpen={isOpen} onClose={close}
            title={isEdit ? 'Bemor ma\'lumotlari' : 'Yangi bemor qo\'shish'} className="max-w-xl">
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
                                onClick={() => { setDuplicates(null); close(); onSaved?.(d as Patient, 'existing'); }}
                                className="w-full text-left p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                                           rounded-lg hover:border-primary-400 transition-colors"
                            >
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatFullName(d)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatUzPhone(d.phone)}
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
                {/* UMUMIY XATO QATORI. Ilgari xato faqat uchta maydon ostida
                    ko'rsatilardi; jins, tug'ilgan sana yoki JSHSHIR xato
                    bo'lsa forma JIMGINA saqlamas, sabab esa hech qayerda
                    ko'rinmasdi. Buni brauzer sinovi topgan edi. */}
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

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Input label="Familiya *" name="lastName" value={form.lastName}
                            onChange={e => { setForm(f => ({ ...f, lastName: e.target.value })); if (fieldErrors.lastName) setFieldErrors(v => ({ ...v, lastName: '' })); }} required />
                        {fieldErrors.lastName && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.lastName}</p>}
                    </div>
                    <div>
                        <Input label="Ism *" name="firstName" value={form.firstName}
                            onChange={e => { setForm(f => ({ ...f, firstName: e.target.value })); if (fieldErrors.firstName) setFieldErrors(v => ({ ...v, firstName: '' })); }} required />
                        {fieldErrors.firstName && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.firstName}</p>}
                    </div>
                </div>

                <div>
                    <Input label="Telefon" name="phone" value={form.phone}
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

                {compact && !isEdit && (
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
                                <Input label="JSHSHIR (PINFL)" name="pinfl" value={form.pinfl}
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
                            <Input label="Karta raqami" name="cardNumber" containerClassName="flex-1" value={form.cardNumber}
                                onChange={e => setForm(f => ({ ...f, cardNumber: e.target.value }))}
                                placeholder="Masalan: 001234" />
                            <Button type="button" variant="secondary" onClick={handleLookupPinfl} disabled={lookupLoading} className="h-10">
                                {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Qo'shimcha telefon" name="secondaryPhone" value={form.secondaryPhone}
                                onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} />
                            <div>
                                <Input label="Tug'ilgan sana" name="dob" type="date" value={form.dob}
                                    onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
                                {dobProblem(form.dob) && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{dobProblem(form.dob)}</p>
                                )}
                            </div>
                        </div>

                        <Input label="Manzil" name="address" value={form.address}
                            onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />

                        {/* Rasm — faqat yaratishda. Kartada uni almashtirish
                            uchun alohida, qulayroq joy bor. */}
                        {allowPhoto && !isEdit && (
                            <div className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-primary-200 dark:border-primary-800 rounded-xl bg-primary-50/50 dark:bg-primary-900/20 hover:bg-primary-100/50 dark:hover:bg-primary-900/30 transition-colors group cursor-pointer relative overflow-hidden">
                                <input type="file" accept="image/*"
                                    onChange={e => setPhoto(e.target.files?.[0] || null)}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                                {photo ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary-500 shadow-lg">
                                            <img src={URL.createObjectURL(photo)} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/40 px-3 py-1 rounded-full">
                                            {photo.name}
                                        </span>
                                        <button type="button"
                                            onClick={e => { e.preventDefault(); e.stopPropagation(); setPhoto(null); }}
                                            className="text-xs text-red-500 hover:text-red-600 font-medium z-20 relative">
                                            O'chirish
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-primary-500 group-hover:scale-110 transition-transform">
                                            <Plus className="w-6 h-6" />
                                        </div>
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Rasm yuklash</span>
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">JPG, PNG, WEBP</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {!isDoctor && doctors.length > 0 && (
                            <DoctorPicker
                                label="Biriktirilgan shifokor"
                                doctors={doctors}
                                value={form.doctorId}
                                emptyLabel="Tanlanmagan"
                                onChange={(id) => setForm(f => ({ ...f, doctorId: id }))}
                            />
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
                            <p className="text-[11px] text-gray-400 mt-1">
                                Jins va tug'ilgan sana tahlil normalarini to'g'ri tanlash uchun kerak.
                            </p>
                        </div>

                        {/* Holat — faqat tahrirlashda. Yangi bemor har doim faol. */}
                        {isEdit && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Holat</label>
                                <div className="flex gap-2">
                                    {([['Active', 'Faol'], ['Archived', 'Arxiv']] as const).map(([val, label]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, status: val }))}
                                            className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-all ${form.status === val
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-400'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

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
                    <Button type="button" variant="secondary" onClick={close} disabled={saving}>Bekor</Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saqlanmoqda...</> : 'Saqlash'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
