import React, { useState } from 'react';
import { Button, Input, Select, Modal } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { formatFullName } from '../utils/format';
import { Department, Service } from '../types';
import { Loader2, Users, Phone, FlaskConical, HeartPulse } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   XODIM FORMASI — YAGONA.

   Ilgari to'rt rolning har birida o'z formasi, o'z o'chirish oynasi va o'z
   maydonlar to'plami bor edi. Farq mantiqiy emas, o'sish tartibi shunday
   chiqqan: har rol o'z vaqtida qo'shilgan. Migratsiya 0035 maydonlarni
   tenglashtirdi, 0036 esa oylik va ish grafigini qo'shdi.

   Bu fayl FAQAT forma. Ro'yxat `pages/Staff.tsx` da, xodim kartasi
   `pages/StaffCard.tsx` da — shuning uchun forma ikkalasidan ham
   ochilaveradi va nusxa ko'chirilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

export type StaffRole = 'DOCTOR' | 'RECEPTIONIST' | 'LAB_TECHNICIAN' | 'NURSE';

export interface StaffRow {
    id: string;
    role: StaffRole;
    firstName: string;
    lastName: string;
    phone?: string | null;
    secondaryPhone?: string | null;
    email?: string | null;
    specialty?: string | null;
    status?: string | null;
    username?: string | null;
    departmentId?: string | null;
    room?: string | null;
    startHour?: number | null;
    endHour?: number | null;
    color?: string | null;
    percentage?: number | null;
    salaryType?: string | null;
    fixedSalary?: number | null;
    workDays?: string | null;
}

export const DOCTOR_COLORS = [
    { name: "Ko'k", value: '#3B82F6' },
    { name: 'Yashil', value: '#10B981' },
    { name: 'Binafsha', value: '#8B5CF6' },
    { name: 'Qizil', value: '#F43F5E' },
    { name: 'Sariq', value: '#F59E0B' },
    { name: 'Havorang', value: '#06B6D4' },
    { name: "To'q ko'k", value: '#6366F1' },
    { name: "To'q sariq", value: '#FB923C' },
];

export const ROLES: {
    key: StaffRole; label: string; icon: React.ElementType; hint: string; badge: string;
}[] = [
    {
        key: 'DOCTOR', label: 'Shifokor', icon: Users,
        hint: "Qabul qiladi, tashxis qo'yadi",
        badge: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
    },
    {
        key: 'RECEPTIONIST', label: 'Registrator', icon: Phone,
        hint: 'Yozadi, navbat ochadi, kassa',
        badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    },
    {
        key: 'LAB_TECHNICIAN', label: 'Laborant', icon: FlaskConical,
        hint: 'Tahlil natijalarini kiritadi',
        badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    },
    {
        key: 'NURSE', label: 'Hamshira', icon: HeartPulse,
        hint: 'Dori beradi, palatani olib boradi',
        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
];

export const roleMeta = (r: StaffRole) => ROLES.find(x => x.key === r) || ROLES[0];

/* Har rolda qaysi maydon ma'noga ega.

   `share` — XIZMAT FOIZI. U faqat shifokorda: ulush to'langan xizmatdan
   hisoblanadi va uni faqat shifokor bajaradi. Registratorga «KPI foizi»
   maydonini qo'yish hech qachon pul chiqarmaydigan maydon ko'rsatish,
   ya'ni yolg'on bo'lardi. OYLIK esa (`fixedSalary`) to'rt rolda ham bor. */
export const FIELDS: Record<StaffRole, {
    specialty: boolean; login: boolean; share: boolean; color: boolean;
}> = {
    DOCTOR: { specialty: true, login: true, share: true, color: true },
    RECEPTIONIST: { specialty: true, login: true, share: false, color: false },
    LAB_TECHNICIAN: { specialty: true, login: true, share: false, color: false },
    NURSE: { specialty: true, login: true, share: false, color: false },
};

const emptyForm = {
    firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', email: '',
    username: '', password: '', departmentId: '', room: '',
    startHour: '', endHour: '', color: DOCTOR_COLORS[0].value,
    percentage: '', salaryType: 'none', fixedSalary: '', status: 'Active',
};

interface Props {
    mode: 'create' | 'edit';
    role: StaffRole;
    row?: StaffRow;
    departments?: Department[];
    services?: Service[];
    onClose: () => void;
    onSaved: (saved?: any) => void;
}

/** Rolga mos yozish marshruti — bitta joyda. */
export async function saveStaff(role: StaffRole, id: string | null, data: any) {
    if (id) {
        if (role === 'DOCTOR') return api.doctors.update(id, data);
        if (role === 'RECEPTIONIST') return api.receptionists.update(id, data);
        if (role === 'LAB_TECHNICIAN') return api.labTechnicians.update(id, data);
        return api.nurses.update(id, data);
    }
    if (role === 'DOCTOR') return api.doctors.create(data);
    if (role === 'RECEPTIONIST') return api.receptionists.create(data);
    if (role === 'LAB_TECHNICIAN') return api.labTechnicians.create(data);
    return api.nurses.create(data);
}

export async function removeStaff(role: StaffRole, id: string) {
    if (role === 'DOCTOR') return api.doctors.delete(id);
    if (role === 'RECEPTIONIST') return api.receptionists.delete(id);
    if (role === 'LAB_TECHNICIAN') return api.labTechnicians.delete(id);
    return api.nurses.remove(id);
}

export const StaffForm: React.FC<Props> = ({
    mode, role, row, departments = [], onClose, onSaved,
}) => {
    const shows = FIELDS[role];
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(() => row ? {
        firstName: row.firstName || '',
        lastName: row.lastName || '',
        specialty: row.specialty || '',
        phone: row.phone || '',
        secondaryPhone: row.secondaryPhone || '',
        email: row.email || '',
        username: row.username || '',
        password: '',
        departmentId: row.departmentId || '',
        room: row.room || '',
        startHour: row.startHour != null ? String(row.startHour) : '',
        endHour: row.endHour != null ? String(row.endHour) : '',
        color: row.color || DOCTOR_COLORS[0].value,
        percentage: row.percentage != null ? String(row.percentage) : '',
        salaryType: row.salaryType || 'none',
        fixedSalary: row.fixedSalary != null ? String(row.fixedSalary) : '',
        status: row.status || 'Active',
    } : { ...emptyForm });

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.firstName.trim() || !form.lastName.trim()) {
            toast.error('Ism va familiya majburiy');
            return;
        }

        /* Umumiy maydonlar hamma rolda BIR XIL nomlanadi (0035, 0036),
           shuning uchun ular bir marta yig'iladi. Rolga xoslari ustiga
           qo'shiladi. */
        const data: any = {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            phone: form.phone.trim(),
            departmentId: form.departmentId || null,
            room: form.room.trim() || null,
            startHour: form.startHour === '' ? null : Number(form.startHour),
            endHour: form.endHour === '' ? null : Number(form.endHour),
            email: form.email.trim() || null,
            fixedSalary: Number(form.fixedSalary) || 0,
            status: form.status,
        };
        if (shows.specialty) data.specialty = form.specialty.trim() || 'Umumiy';
        if (shows.login) {
            data.username = form.username.trim() || null;
            if (form.password) data.password = form.password;
        }
        if (shows.color) data.color = form.color;
        if (shows.share) {
            data.secondaryPhone = form.secondaryPhone.trim() || null;
            data.percentage = Number(form.percentage) || 0;
            data.salaryType = form.salaryType;
        }

        setSaving(true);
        try {
            const saved = await saveStaff(role, mode === 'edit' && row ? row.id : null, data);
            onSaved(saved);
        } catch (err: any) {
            toast.error(err?.data?.error || err?.message || "Saqlab bo'lmadi");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} className="max-w-2xl"
            title={mode === 'edit' && row
                ? `${formatFullName(row)} — ${roleMeta(role).label}`
                : `Yangi ${roleMeta(role).label.toLowerCase()}`}>
            <form onSubmit={save} className="space-y-4">
                <p className="text-xs text-muted">{roleMeta(role).hint}</p>

                <div className="grid grid-cols-2 gap-3">
                    <Input label="Familiya *" value={form.lastName}
                        onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
                    <Input label="Ism *" value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input label="Telefon" value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+998 90 123 45 67" />
                    <Input label="Lavozim" value={form.specialty}
                        onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                        placeholder={role === 'DOCTOR' ? 'Kardiolog' : 'Masalan: katta hamshira'} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Select label="Bo'lim" value={form.departmentId}
                        onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                        options={[
                            { value: '', label: 'Tanlanmagan' },
                            ...departments.filter(d => d.isActive).map(d => ({ value: d.id, label: d.name })),
                        ]} />
                    <Input label="Kabinet" value={form.room}
                        onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
                        placeholder="Masalan: 204" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input label="Ish boshlanishi (soat)" type="number" min={0} max={23}
                        value={form.startHour}
                        onChange={e => setForm(f => ({ ...f, startHour: e.target.value }))}
                        placeholder="9" />
                    <Input label="Ish tugashi (soat)" type="number" min={0} max={23}
                        value={form.endHour}
                        onChange={e => setForm(f => ({ ...f, endHour: e.target.value }))}
                        placeholder="18" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input label="Elektron pochta" type="email" value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                    {shows.share ? (
                        <Input label="Qo'shimcha telefon" value={form.secondaryPhone}
                            onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} />
                    ) : <div />}
                </div>

                {shows.login && (
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Login" value={form.username}
                            onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                        <Input label={mode === 'edit' ? "Yangi parol (bo'sh — o'zgarmaydi)" : 'Parol'}
                            type="password" value={form.password}
                            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                    </div>
                )}

                {/* ── OYLIK. To'rt rolda ham (0036). Ilgari u faqat shifokorda
                    bor edi va registratorning oyligi daftarda qolardi. ── */}
                <div className="rounded-xl border border-line p-4 space-y-3">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Oylik</p>
                    <Input label="Asosiy oylik (UZS)" type="number" value={form.fixedSalary}
                        onChange={e => setForm(f => ({ ...f, fixedSalary: e.target.value }))}
                        placeholder="3000000" />

                    {shows.share && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="Xizmat foizi (%)" type="number" value={form.percentage}
                                    onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} />
                                <Select label="Maosh turi" value={form.salaryType}
                                    onChange={e => setForm(f => ({ ...f, salaryType: e.target.value }))}
                                    options={[
                                        { value: 'none', label: 'Belgilanmagan — faqat foiz' },
                                        { value: 'kpi', label: 'Faqat xizmat foizi' },
                                        { value: 'fixed', label: "Faqat qat'iy summa" },
                                        { value: 'fixed_kpi', label: "Qat'iy summa + foiz" },
                                    ]} />
                            </div>
                            <p className="text-[11px] text-faint">
                                Shifokorda asosiy oylik ham, ulush ham VEDOMOST orqali to'lanadi —
                                shuning uchun xodim kartasidan ikkinchi marta to'lanmaydi.
                            </p>
                        </>
                    )}
                    {!shows.share && (
                        <p className="text-[11px] text-faint">
                            Oylik xodim kartasidagi «Maosh» bo'limidan to'lanadi va kassaga
                            xarajat bo'lib tushadi.
                        </p>
                    )}
                </div>

                {shows.color && (
                    <div>
                        <label className="block text-sm font-medium text-muted mb-1.5">
                            Kalendardagi rang
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {DOCTOR_COLORS.map(c => (
                                <button key={c.value} type="button" title={c.name}
                                    onClick={() => setForm(f => ({ ...f, color: c.value }))}
                                    className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c.value
                                        ? 'border-line scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c.value }} />
                            ))}
                        </div>
                    </div>
                )}

                {mode === 'edit' && (
                    <Select label="Holat" value={form.status}
                        onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                        options={[
                            { value: 'Active', label: 'Faol' },
                            { value: 'Vacation', label: "Ta'tilda" },
                            { value: 'Inactive', label: 'Ishlamayapti' },
                        ]} />
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Bekor</Button>
                    <Button type="submit" disabled={saving}>
                        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Saqlash
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
