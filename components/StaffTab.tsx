import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Input, Select, Modal } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { confirmAction } from '../services/confirm';
import { formatFullName } from '../utils/format';
import { formatUzPhone } from '../shared/validation';
import { Department, Service } from '../types';
import { DoctorRatesEditor } from './DoctorRatesEditor';
import { formatMoney } from '../utils/format';
import {
    Plus, Edit, Trash2, Loader2, Search, Users, Phone, FlaskConical, HeartPulse,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   XODIMLAR — BITTA EKRAN.

   Ilgari Sozlamalarda TO'RTTA alohida vkladka turardi: «Shifokorlar»,
   «Resepshnlar», «Laborantlar», «Hamshiralar». Xodimni topish uchun avval
   uning ROLINI eslash kerak edi, va har vkladkaning o'z ro'yxati, o'z
   formasi, o'z o'chirish oynasi bor edi.

   Maydonlar ham tasodifan farq qilardi: bo'lim faqat shifokor va
   hamshirada, kabinet va ish soatlari faqat shifokorda. Migratsiya 0035
   ularni tenglashtirdi, bu ekran esa yagona forma bilan ishlaydi —
   maydonlar ROLGA qarab ko'rinadi.

   Ro'yxat `GET /api/staff` dan: bitta so'rov, `role` maydoni bilan.
   Yozish esa har rolning o'z marshrutidan — jadvallar birlashtirilmagan
   va birlashtirilmaydi ham: ularga tizimga kirish va qabullar, yozuvlar,
   tahlillar bilan bog'lam osilgan.
   ───────────────────────────────────────────────────────────────────────────── */

const DOCTOR_COLORS = [
    { name: "Ko'k", value: '#3B82F6' },
    { name: 'Yashil', value: '#10B981' },
    { name: 'Binafsha', value: '#8B5CF6' },
    { name: 'Qizil', value: '#F43F5E' },
    { name: 'Sariq', value: '#F59E0B' },
    { name: 'Havorang', value: '#06B6D4' },
    { name: "To'q ko'k", value: '#6366F1' },
    { name: "To'q sariq", value: '#FB923C' },
];

type Role = 'DOCTOR' | 'RECEPTIONIST' | 'LAB_TECHNICIAN' | 'NURSE';

interface StaffRow {
    id: string;
    role: Role;
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
}

const ROLES: { key: Role; label: string; icon: React.ElementType; hint: string }[] = [
    { key: 'DOCTOR', label: 'Shifokor', icon: Users, hint: 'Qabul qiladi, tashxis qo\'yadi' },
    { key: 'RECEPTIONIST', label: 'Registrator', icon: Phone, hint: 'Yozadi, navbat ochadi, kassa' },
    { key: 'LAB_TECHNICIAN', label: 'Laborant', icon: FlaskConical, hint: 'Tahlil natijalarini kiritadi' },
    { key: 'NURSE', label: 'Hamshira', icon: HeartPulse, hint: 'Dori beradi, palatani olib boradi' },
];

const roleMeta = (r: Role) => ROLES.find(x => x.key === r)!;

/* Har rolda qaysi maydon ma'noga ega. Forma shu jadvalga qaraydi —
   `if (role === ...)` shoxobchalarini bitta joyga yig'ish uchun. */
const FIELDS: Record<Role, {
    specialty: boolean; login: boolean; share: boolean; color: boolean; email: boolean;
}> = {
    DOCTOR: { specialty: true, login: true, share: true, color: true, email: true },
    RECEPTIONIST: { specialty: false, login: true, share: false, color: false, email: false },
    LAB_TECHNICIAN: { specialty: true, login: true, share: false, color: false, email: false },
    NURSE: { specialty: true, login: true, share: false, color: false, email: false },
};

const emptyForm = {
    firstName: '', lastName: '', specialty: '', phone: '', secondaryPhone: '', email: '',
    username: '', password: '', departmentId: '', room: '',
    startHour: '', endHour: '', color: DOCTOR_COLORS[0].value,
    percentage: '', salaryType: 'none', fixedSalary: '', status: 'Active',
};

interface Props {
    departments?: Department[];
    services?: Service[];
    clinicId?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
    /** Ro'yxat o'zgargach ota-ekran o'z keshini yangilashi uchun */
    onChanged?: () => void;
}

/* Karta bo'limlari. Yaratishda faqat birinchisi ochiq: stavka ham,
   tarix ham hali mavjud bo'lmagan xodimga tegishli bo'lolmaydi. */
type CardTab = 'info' | 'rates' | 'history';

export const StaffTab: React.FC<Props> = ({
    departments = [], services = [], clinicId, addToast, onChanged,
}) => {
    const [rows, setRows] = useState<StaffRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');

    const [editing, setEditing] = useState<StaffRow | null>(null);
    const [creatingRole, setCreatingRole] = useState<Role | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [cardTab, setCardTab] = useState<CardTab>('info');

    /* Hisoblash va to'lash tarixi — kartaning ichida.

       «Bu shifokorga shu paytgacha qancha hisoblandi va qancha
       to'landi?» degan savolga javob berish uchun ilgari hamma
       vedomostni ochib chiqish kerak edi. */
    const [history, setHistory] = useState<{
        lines: { id: string; periodFrom: string; periodTo: string; runStatus: string; accrued: number; paid: number }[];
        totals: { accrued: number; paid: number };
    } | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setRows(await api.staff.getAll());
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "Xodimlar ro'yxati olinmadi");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const role: Role = editing?.role || creatingRole || 'DOCTOR';
    const isOpen = !!editing || !!creatingRole;
    const shows = FIELDS[role];

    const openCreate = (r: Role) => {
        setEditing(null);
        setCreatingRole(r);
        setCardTab('info');
        setHistory(null);
        setForm({ ...emptyForm });
    };

    const openEdit = (row: StaffRow) => {
        setCreatingRole(null);
        setEditing(row);
        setCardTab('info');
        setHistory(null);
        setForm({
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
        });
    };

    const close = () => { setEditing(null); setCreatingRole(null); setHistory(null); };

    /* Tarix FAQAT o'sha bo'lim ochilganda so'raladi — kartani ochish
       og'irlashmasin. */
    useEffect(() => {
        if (cardTab !== 'history' || !editing || editing.role !== 'DOCTOR') return;
        let alive = true;
        setHistoryLoading(true);
        api.payroll.staffHistory(editing.id)
            .then(d => { if (alive) setHistory(d); })
            .catch(() => { if (alive) setHistory(null); })
            .finally(() => { if (alive) setHistoryLoading(false); });
        return () => { alive = false; };
    }, [cardTab, editing]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r =>
            (roleFilter === 'all' || r.role === roleFilter)
            && (!q || `${r.lastName} ${r.firstName} ${r.specialty || ''} ${r.username || ''}`
                .toLowerCase().includes(q)));
    }, [rows, roleFilter, search]);

    const counts = useMemo(() => {
        const map: Record<string, number> = { all: rows.length };
        for (const r of rows) map[r.role] = (map[r.role] || 0) + 1;
        return map;
    }, [rows]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.firstName.trim() || !form.lastName.trim()) {
            toast.error('Ism va familiya majburiy');
            return;
        }

        /* Umumiy maydonlar hamma rolda bir xil nomlanadi (migratsiya 0035),
           shuning uchun ular bir marta yig'iladi. Rolga xoslari ustiga
           qo'shiladi. */
        const common: any = {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            phone: form.phone.trim(),
            departmentId: form.departmentId || null,
            room: form.room.trim() || null,
            startHour: form.startHour === '' ? null : Number(form.startHour),
            endHour: form.endHour === '' ? null : Number(form.endHour),
            status: form.status,
        };
        if (shows.specialty) common.specialty = form.specialty.trim() || 'Umumiy';
        if (shows.login) {
            common.username = form.username.trim() || null;
            if (form.password) common.password = form.password;
        }
        if (shows.email && form.email.trim()) common.email = form.email.trim();
        if (shows.color) common.color = form.color;
        if (shows.share) {
            common.secondaryPhone = form.secondaryPhone.trim() || null;
            common.percentage = Number(form.percentage) || 0;
            common.salaryType = form.salaryType;
            common.fixedSalary = Number(form.fixedSalary) || 0;
        }

        setSaving(true);
        try {
            if (editing) {
                if (role === 'DOCTOR') await api.doctors.update(editing.id, common);
                else if (role === 'RECEPTIONIST') await api.receptionists.update(editing.id, common);
                else if (role === 'LAB_TECHNICIAN') await api.labTechnicians.update(editing.id, common);
                else await api.nurses.update(editing.id, common);
            } else {
                if (role === 'DOCTOR') await api.doctors.create(common);
                else if (role === 'RECEPTIONIST') await api.receptionists.create(common);
                else if (role === 'LAB_TECHNICIAN') await api.labTechnicians.create(common);
                else await api.nurses.create(common);
            }
            close();
            await load();
            onChanged?.();
        } catch (err: any) {
            toast.error(err?.data?.error || err?.message || "Saqlab bo'lmadi");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (row: StaffRow) => {
        if (!await confirmAction({
            title: `${formatFullName(row)} ro'yxatdan chiqarilsinmi?`,
            body: 'Yozuvlar va tarix saqlanadi — xodim faqat ishlamaydigan bo\'lib qoladi va tizimga kira olmaydi.',
            danger: true, confirmLabel: "Ro'yxatdan chiqarish",
        })) return;
        try {
            if (row.role === 'DOCTOR') await api.doctors.delete(row.id);
            else if (row.role === 'RECEPTIONIST') await api.receptionists.delete(row.id);
            else if (row.role === 'LAB_TECHNICIAN') await api.labTechnicians.delete(row.id);
            else await api.nurses.remove(row.id);
            await load();
            onChanged?.();
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || "O'chirib bo'lmadi");
        }
    };

    const depName = (id?: string | null) => departments.find(d => d.id === id)?.name;

    return (
        <Card className="p-6">
            <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
                <div>
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">Xodimlar</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Klinikada kim ishlaydi, qaysi bo'limda va qaysi kabinetda.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {ROLES.map(r => (
                        <Button key={r.key} size="sm" variant="secondary" onClick={() => openCreate(r.key)}>
                            <Plus className="w-4 h-4 mr-1" /> {r.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Rol bo'yicha filtr — vkladka o'rniga. Xodimni topish uchun
                uning rolini ESLASH shart emas: «Hammasi» birinchi turadi. */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <button type="button" onClick={() => setRoleFilter('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${roleFilter === 'all'
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-400'}`}>
                    Hammasi ({counts.all || 0})
                </button>
                {ROLES.map(r => (
                    <button key={r.key} type="button" onClick={() => setRoleFilter(r.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${roleFilter === r.key
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-400'}`}>
                        {r.label} ({counts[r.key] || 0})
                    </button>
                ))}
                <div className="relative ml-auto">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Ism, mutaxassislik yoki login"
                        className="pl-9 pr-3 py-2 w-64 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm dark:text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
            </div>

            {loading ? (
                <div className="py-16 text-center text-gray-400">Yuklanmoqda…</div>
            ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                    {search || roleFilter !== 'all' ? 'Mos xodim topilmadi' : 'Hali xodim qo\'shilmagan'}
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(row => {
                        const meta = roleMeta(row.role);
                        const Icon = meta.icon;
                        return (
                            <div key={`${row.role}-${row.id}`}
                                className="flex items-center justify-between gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm shrink-0"
                                        style={{ backgroundColor: row.color || '#94A3B8' }}>
                                        {row.firstName[0]}{row.lastName[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-900 dark:text-white truncate">
                                            {formatFullName(row)}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5">
                                            <Icon className="w-3 h-3" />
                                            {meta.label}
                                            {row.specialty && <><span>·</span>{row.specialty}</>}
                                            {depName(row.departmentId) && <><span>·</span>{depName(row.departmentId)}</>}
                                            {row.room && <><span>·</span>{row.room}-kabinet</>}
                                            {row.startHour != null && row.endHour != null &&
                                                <><span>·</span>{row.startHour}:00–{row.endHour}:00</>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {row.phone && (
                                        <span className="hidden md:inline text-xs text-gray-400">{formatUzPhone(row.phone)}</span>
                                    )}
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.status === 'Active'
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                        {row.status === 'Active' ? 'Faol' : row.status}
                                    </span>
                                    <button onClick={() => openEdit(row)} title="Tahrirlash"
                                        className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => remove(row)} title="Ro'yxatdan chiqarish"
                                        className="p-2 text-gray-400 hover:text-red-600 rounded-md">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Yagona forma. Maydonlar ROLGA qarab ko'rinadi. ────────── */}
            <Modal isOpen={isOpen} onClose={close}
                title={editing ? `${formatFullName(editing)} — ${roleMeta(role).label}` : `Yangi ${roleMeta(role).label.toLowerCase()}`}
                className="max-w-2xl">

                {/* KARTA BO'LIMLARI. Stavka va tarix — faqat mavjud
                    shifokorda: yangi xodimda ular tegishli bo'lolmaydi,
                    laborant va hamshirada esa ulush tizimi yo'q. */}
                {editing && role === 'DOCTOR' && (
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl mb-4">
                        {([
                            ['info', "Ma'lumotlar"],
                            ['rates', 'Stavkalar'],
                            ['history', 'Hisob-kitob'],
                        ] as const).map(([k, label]) => (
                            <button key={k} type="button" onClick={() => setCardTab(k)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${cardTab === k
                                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Stavkalar ── Moliya → Ulush dan KO'CHDI. U yerda birinchi
                    ish shifokorni ro'yxatdan tanlash edi: odam xodim
                    kartasidan chiqib, boshqa bo'limga borib, o'sha odamni
                    qaytadan qidirishi kerak bo'lardi. */}
                {editing && role === 'DOCTOR' && cardTab === 'rates' && (
                    <DoctorRatesEditor
                        doctorId={editing.id}
                        fallbackPercent={editing.percentage ?? null}
                        departments={departments}
                        services={services}
                        clinicId={clinicId}
                        addToast={addToast}
                    />
                )}

                {/* ── Hisob-kitob tarixi ── */}
                {editing && role === 'DOCTOR' && cardTab === 'history' && (
                    <div className="space-y-3">
                        {historyLoading ? (
                            <p className="text-sm text-gray-400 py-8 text-center">Yuklanmoqda…</p>
                        ) : !history || history.lines.length === 0 ? (
                            <p className="text-sm text-gray-400 py-8 text-center">
                                Hali vedomostga tushmagan
                            </p>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                                        <p className="text-[11px] text-gray-400 uppercase tracking-wide">Hisoblangan</p>
                                        <p className="text-xl font-black tabular-nums text-gray-900 dark:text-white">
                                            {formatMoney(history.totals.accrued)}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                                        <p className="text-[11px] text-gray-400 uppercase tracking-wide">To'langan</p>
                                        <p className="text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                                            {formatMoney(history.totals.paid)}
                                        </p>
                                        {history.totals.accrued - history.totals.paid > 0 && (
                                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                                qoldiq {formatMoney(history.totals.accrued - history.totals.paid)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto">
                                    {history.lines.map(l => (
                                        <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-900 dark:text-white">
                                                    {l.periodFrom} — {l.periodTo}
                                                </p>
                                                <p className="text-[11px] text-gray-400">{l.runStatus}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                                                    {formatMoney(l.accrued)}
                                                </p>
                                                <p className={`text-[11px] tabular-nums ${l.paid > 0
                                                    ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                                                    {l.paid > 0 ? `to'landi ${formatMoney(l.paid)}` : "to'lanmagan"}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="flex justify-end pt-1">
                            <Button type="button" variant="secondary" onClick={close}>Yopish</Button>
                        </div>
                    </div>
                )}

                {(cardTab === 'info' || !editing || role !== 'DOCTOR') && (
                <form onSubmit={save} className="space-y-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{roleMeta(role).hint}</p>

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
                        {shows.specialty ? (
                            <Input label="Mutaxassislik" value={form.specialty}
                                onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
                        ) : shows.share ? (
                            <Input label="Qo'shimcha telefon" value={form.secondaryPhone}
                                onChange={e => setForm(f => ({ ...f, secondaryPhone: e.target.value }))} />
                        ) : <div />}
                    </div>

                    {/* Bo'lim, kabinet va soatlar — TO'RT rolda ham (0035). */}
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

                    {shows.login && (
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Login" value={form.username}
                                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                            <Input label={editing ? 'Yangi parol (bo\'sh — o\'zgarmaydi)' : 'Parol'}
                                type="password" value={form.password}
                                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                        </div>
                    )}

                    {shows.email && (
                        <Input label="Elektron pochta" type="email" value={form.email}
                            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                    )}

                    {shows.share && (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">To'lov</p>
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="Xizmat foizi (%)" type="number" value={form.percentage}
                                    onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} />
                                <Select label="Maosh turi" value={form.salaryType}
                                    onChange={e => setForm(f => ({ ...f, salaryType: e.target.value }))}
                                    options={[
                                        { value: 'none', label: "Belgilanmagan — faqat foiz" },
                                        { value: 'kpi', label: 'Faqat xizmat foizi' },
                                        { value: 'fixed', label: "Faqat qat'iy summa" },
                                        { value: 'fixed_kpi', label: "Qat'iy summa + foiz" },
                                    ]} />
                            </div>
                            {(form.salaryType === 'fixed' || form.salaryType === 'fixed_kpi') && (
                                <Input label="Fix maosh (UZS)" type="number" value={form.fixedSalary}
                                    onChange={e => setForm(f => ({ ...f, fixedSalary: e.target.value }))}
                                    placeholder="3000000" />
                            )}
                            <p className="text-[11px] text-gray-400">
                                Vedomost shu sozlamaga qarab hisoblaydi. Fix maosh davr kunlari
                                bo'yicha taqsimlanadi va kelasi davr uchun hisoblanmaydi.
                            </p>
                        </div>
                    )}

                    {shows.color && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Kalendardagi rang
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {DOCTOR_COLORS.map(c => (
                                    <button key={c.value} type="button" title={c.name}
                                        onClick={() => setForm(f => ({ ...f, color: c.value }))}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c.value
                                            ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                                        style={{ backgroundColor: c.value }} />
                                ))}
                            </div>
                        </div>
                    )}

                    {editing && (
                        <Select label="Holat" value={form.status}
                            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                            options={[
                                { value: 'Active', label: 'Faol' },
                                { value: 'Vacation', label: "Ta'tilda" },
                                { value: 'Inactive', label: 'Ishlamayapti' },
                            ]} />
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={close} disabled={saving}>Bekor</Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Saqlash
                        </Button>
                    </div>
                </form>
                )}
            </Modal>
        </Card>
    );
};
