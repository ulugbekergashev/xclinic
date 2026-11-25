import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button } from '../components/Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { formatFullName, formatMoney } from '../utils/format';
import { formatUzPhone } from '../shared/validation';
import { Department, Service, Doctor, Clinic, UserRole } from '../types';
import { StaffForm, StaffRow, ROLES, roleMeta, StaffRole } from '../components/StaffForm';
import { DoctorShares } from '../components/DoctorShares';
import { StaffAttendanceReport } from '../components/StaffAttendanceReport';
import { AccessControlTab } from '../components/AccessControlTab';
import { useLanguage, fill } from '../context/LanguageContext';
import { permsFor } from '../utils/accessControl';
import {
    Plus, Search, Users, Percent, CalendarCheck, ShieldCheck, ChevronRight,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   XODIMLAR — ALOHIDA MODUL.

   Ilgari u Sozlamalar ichidagi vkladka edi, ulush va vedomost esa Moliyada.
   Ya'ni bitta savolga («bu odam qancha oladi va qancha ishladi?») javob
   izlayotgan odam ikkita bo'limni kezib chiqishi kerak edi.

   Endi bitta joy: ro'yxat, xodim kartasi, stavkalar va vedomost.

   RAQAMLAR SERVERDAN. Yuqoridagi to'rtta karta `/api/hr/summary` dan keladi.
   Ularni ekranda proplardan sanash mumkin edi, lekin prop ro'yxati har doim
   ham to'liq bo'lmaydi — MODUL-ISHLARI dagi qoida aynan shu haqda: propdan
   sanalgan son jimgina yolg'on ko'rsatadi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    departments?: Department[];
    services?: Service[];
    doctors?: Doctor[];
    clinicId?: string;
    addToast?: (type: 'success' | 'error' | 'info', msg: string) => void;
    /** Ro'yxat o'zgargach App dagi keshni yangilash */
    onStaffChanged?: () => void;
    /* «Ruxsatlar» vkladkasi uchun — u klinika yozuvidagi `accessControl`
       ni tahrirlaydi. Faqat egaga ko'rinadi. */
    userRole?: UserRole;
    currentClinic?: Clinic;
    onClinicUpdated?: () => void;
}

type Tab = 'people' | 'payroll' | 'attendance' | 'access';

/** Yuklama chizig'i — foiz bo'lmasa grafik yo'qligini aytadi. */
const LoadBar: React.FC<{ percent: number | null }> = ({ percent }) => {
    const { t } = useLanguage();
    if (percent == null) return <span className="text-xs text-faint">{t('staff.noSchedule')}</span>;
    const color = percent >= 90 ? 'bg-red-500' : percent >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
        <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-elevated overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            <span className="text-xs text-muted tabular-nums">{percent}%</span>
        </div>
    );
};

/* RAQAMLAR — BITTA QATOR. Ilgari to'rtta katta karta edi va ro'yxatdan
   oldin ekranning uchdan birini egallardi. Raqamlar o'sha, joy kam. */
const Stat: React.FC<{
    title: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'default' | 'warn';
}> = ({ title, value, hint, tone = 'default' }) => (
    <div className="min-w-0 px-5 py-3.5">
        <p className="text-xs text-muted">{title}</p>
        <p className="mt-0.5 text-xl font-semibold text-ink tabular-nums">{value}</p>
        {hint && (
            <p className={`mt-0.5 truncate text-xs ${tone === 'warn'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-faint'}`}>{hint}</p>
        )}
    </div>
);

export const Staff: React.FC<Props> = ({
    departments = [], services = [], doctors = [], clinicId, addToast, onStaffChanged,
    userRole, currentClinic, onClinicUpdated,
}) => {
    const { t } = useLanguage();
    const navigate = useNavigate();

    /* Vkladka MANZILDA turadi: xodim kartasidagi «Vedomost →» havolasi
       to'g'ridan-to'g'ri o'sha bo'limni ochsin, va sahifa yangilanganda
       odam boshiga qaytmasin. */
    const [searchParams, setSearchParams] = useSearchParams();
    const canManageAccess = userRole === UserRole.CLINIC_ADMIN;
    /* Xodim qo'shish — «Xodimlar → Ruxsatlar» bo'yicha (registratorga ochilishi mumkin) */
    const canAddStaff = permsFor(userRole, currentClinic).can('staff', 'list', 'create');
    const q = searchParams.get('tab');
    /* `?tab=access` ni faqat ega ocholadi. Manzilni qo'lda yozib kirishga
       ham yo'l yo'q: rol mos kelmasa vkladka "people" ga tushadi. */
    const tab: Tab = (q === 'payroll' && canManageAccess) ? 'payroll'
        : (q === 'attendance' && canManageAccess) ? 'attendance'
            : (q === 'access' && canManageAccess) ? 'access'
                : 'people';
    const setTab = (next: Tab) => {
        const p = new URLSearchParams(searchParams);
        if (next === 'people') p.delete('tab'); else p.set('tab', next);
        setSearchParams(p, { replace: true });
    };

    const [rows, setRows] = useState<StaffRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<any>(null);
    const [workload, setWorkload] = useState<Record<string, any>>({});
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<StaffRole | 'all' | 'archive'>('all');

    const [creatingRole, setCreatingRole] = useState<StaffRole | null>(null);
    const [pickRole, setPickRole] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const [staff, sum, wl] = await Promise.all([
                api.staff.getAll(),
                api.hr.summary().catch(() => null),
                api.hr.workload().catch(() => null),
            ]);
            setRows(staff);
            setSummary(sum);
            const map: Record<string, any> = {};
            for (const r of (wl?.rows || [])) map[r.doctorId] = r;
            setWorkload(map);
        } catch (e: any) {
            toast.error(e?.data?.error || e?.message || t('staff.xodimlar_royxati_olinmadi'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            /* «Arxiv» — ishdan ketganlar. Ular boshqa filtrlarda
               KO'RINMAYDI: ro'yxatning maqsadi «hozir kim ishlaydi». */
            const archived = r.status !== 'Active';
            if (roleFilter === 'archive') { if (!archived) return false; }
            else if (archived) return false;
            if (roleFilter !== 'all' && roleFilter !== 'archive' && r.role !== roleFilter) return false;
            if (!q) return true;
            return `${r.lastName} ${r.firstName} ${r.specialty || ''} ${r.username || ''} ${r.phone || ''}`
                .toLowerCase().includes(q);
        });
    }, [rows, roleFilter, search]);

    const counts = useMemo(() => {
        const map: Record<string, number> = { all: 0, archive: 0 };
        for (const r of rows) {
            if (r.status !== 'Active') { map.archive++; continue; }
            map.all++;
            map[r.role] = (map[r.role] || 0) + 1;
        }
        return map;
    }, [rows]);

    const depName = (id?: string | null) => departments.find(d => d.id === id)?.name;

    const afterChange = async () => {
        setCreatingRole(null);
        await load();
        onStaffChanged?.();
    };

    /* Rol ustunlari uchun xodim soni — «Ruxsatlar» jadvalida ko'rinadi */
    const staffCounts = useMemo(() => ({
        [UserRole.DOCTOR]: counts.DOCTOR || 0,
        [UserRole.RECEPTIONIST]: counts.RECEPTIONIST || 0,
        [UserRole.LAB_TECHNICIAN]: counts.LAB_TECHNICIAN || 0,
        [UserRole.NURSE]: counts.NURSE || 0,
    }), [counts]);

    /* Bo'limlar — sarlavha qatorida, o'ngda, ikonka bilan. */
    const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
        { key: 'people', label: t('staff.xodimlar_2'), icon: Users },
        /* Ulush va davomat — maosh bilan bog'liq, faqat egada */
        ...(canManageAccess ? [
            { key: 'payroll' as Tab, label: t('finance.report.share'), icon: Percent },
            { key: 'attendance' as Tab, label: t('staff.davomat'), icon: CalendarCheck },
        ] : []),
        /* RUXSATLAR — faqat shu yerda (Sozlamalardan olib tashlandi). */
        ...(canManageAccess ? [{ key: 'access' as Tab, label: t('ui.ruxsatlar'), icon: ShieldCheck }] : []),
    ];

    const filterBtn = (active: boolean) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${active
        ? 'bg-elevated font-semibold text-ink shadow-[inset_0_0_0_1px_var(--x-line)]'
        : 'font-medium text-muted hover:text-ink'}`;

    return (
        <div className="p-4 md:p-6 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-ink">{t('staff.xodimlar')}</h1>
                    <p className="text-sm text-muted mt-1">
                        {t('staff.klinikada_kim_ishlaydi_qancha')}
                    </p>
                </div>
                <div aria-label={t('staff.xodimlar')}
                    className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-sm">
                    {tabs.map(({ key, label, icon: Icon }) => (
                        <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}
                            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${tab === key
                                ? 'bg-primary-600 text-white shadow-sm'
                                : 'text-muted hover:bg-elevated hover:text-ink'}`}>
                            <Icon className="h-4 w-4" aria-hidden />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'payroll' ? (
                <DoctorShares doctors={doctors} clinicId={clinicId} addToast={addToast} />
            ) : tab === 'attendance' ? (
                <StaffAttendanceReport />
            ) : tab === 'access' ? (
                <AccessControlTab currentClinic={currentClinic} onClinicUpdated={onClinicUpdated} staffCounts={staffCounts} />
            ) : (
                <>
                    {/* ── Raqamlar — bitta ixcham qator (maosh — faqat egaga) ── */}
                    {canManageAccess && <div className="card grid grid-cols-2 xl:grid-cols-4 overflow-hidden [&>*]:border-line [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b xl:[&>*]:border-b-0 xl:[&>*:not(:last-child)]:border-r">
                        <Stat
                            title={t('ui.jami_xodim')}
                            value={summary ? summary.total : '—'}
                            hint={summary
                                ? fill(t('staff.x_shifokor_x_boshqa'), summary.byRole?.DOCTOR || 0, summary.total - (summary.byRole?.DOCTOR || 0))
                                : undefined}
                        />
                        <Stat
                            title={t('staff.bu_hafta_qabul_qilmoqda')}
                            value={summary ? summary.working : '—'}
                            hint={summary
                                ? (summary.working === summary.doctors && summary.doctors > 0
                                    ? t('staff.barcha_shifokorda_qabul_bor')
                                    : `${summary.doctors} shifokordan`)
                                : undefined}
                            tone={summary && summary.doctors > summary.working ? 'warn' : 'default'}
                        />
                        <Stat
                            title={t('staff.ortacha_yuklama')}
                            value={summary?.avgLoad != null ? <>{summary.avgLoad}<span className="text-base text-faint"> %</span></> : '—'}
                            hint={summary?.avgLoad != null
                                ? fill(t('staff.ish_grafigi_belgilangan_x'), summary.loadKnownFor)
                                : t('staff.ish_grafigi_hech_kimga')}
                            tone={summary?.avgLoad == null ? 'warn' : 'default'}
                        />
                        <Stat
                            title={t('staff.oylik_fond')}
                            value={summary ? formatMoney(summary.salaryFund) : '—'}
                            hint={summary?.noSalary
                                ? fill(t('staff.x_ta_xodimning_oyligi'), summary.noSalary)
                                : 'hamma xodimning oyligi kiritilgan'}
                            tone={summary?.noSalary ? 'warn' : 'default'}
                        />
                    </div>}

                    {/* ── Ro'yxat: filtr, qidiruv, qo'shish va jadval bitta kartada ── */}
                    <section className="card overflow-hidden">
                        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
                            <div className="flex flex-wrap items-center gap-1">
                                <button type="button" onClick={() => setRoleFilter('all')} className={filterBtn(roleFilter === 'all')}>
                                    {t('ui.barchasi')} <span className="text-xs tabular-nums opacity-60">{counts.all}</span>
                                </button>
                                {ROLES.map(r => (
                                    <button key={r.key} type="button" onClick={() => setRoleFilter(r.key)} className={filterBtn(roleFilter === r.key)}>
                                        {r.label} <span className="text-xs tabular-nums opacity-60">{counts[r.key] || 0}</span>
                                    </button>
                                ))}
                                {counts.archive > 0 && (
                                    <button type="button" onClick={() => setRoleFilter('archive')} className={filterBtn(roleFilter === 'archive')}>
                                        {t('patients.filter.archived')} <span className="text-xs tabular-nums opacity-60">{counts.archive}</span>
                                    </button>
                                )}
                            </div>
                            <div className="ml-auto flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                                    <input value={search} onChange={e => setSearch(e.target.value)}
                                        placeholder={t('staff.ism_lavozim_yoki_telefon')}
                                        aria-label={t('staff.ism_lavozim_yoki_telefon')}
                                        className="h-9 w-56 rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                                </div>
                                {canAddStaff && <div className="relative">
                                    <Button size="sm" onClick={() => setPickRole(v => !v)} aria-expanded={pickRole} aria-haspopup="menu">
                                        <Plus className="w-4 h-4 mr-1" /> {t('staff.yangi_xodim')}
                                    </Button>
                                    {pickRole && (
                                        <div role="menu" className="absolute right-0 mt-2 w-60 bg-surface border border-line rounded-xl shadow-lg z-20 p-1">
                                            {ROLES.map(r => (
                                                <button key={r.key} type="button" role="menuitem"
                                                    onClick={() => { setPickRole(false); setCreatingRole(r.key); }}
                                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated">
                                                    <span className="block text-sm font-medium text-ink">{r.label}</span>
                                                    <span className="block text-xs text-muted">{r.hint}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>}
                            </div>
                        </div>

                        {loading ? (
                            <div className="py-16 text-center text-faint">{t('ui.yuklanmoqda')}</div>
                        ) : filtered.length === 0 ? (
                            <div className="py-16 text-center text-muted">
                                {search || roleFilter !== 'all' ? t('staff.mos_xodim_topilmadi') : t('staff.hali_xodim_qoshilmagan')}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-muted border-b border-line">
                                            <th className="py-3 pl-5 pr-4 font-medium">{t('staff.xodim')}</th>
                                            <th className="py-3 px-4 font-medium">{t('ui.lavozim')}</th>
                                            <th className="py-3 px-4 font-medium">Rol</th>
                                            <th className="py-3 px-4 font-medium">{t('ui.bolim')}</th>
                                            <th className="py-3 px-4 font-medium">{t('staff.haftalik_yuklama')}</th>
                                            {canManageAccess && <th className="py-3 px-4 font-medium text-right">{t('ui.oylik')}</th>}
                                            <th className="w-10" aria-hidden />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(row => {
                                            const meta = roleMeta(row.role);
                                            const wl = row.role === 'DOCTOR' ? workload[row.id] : null;
                                            return (
                                                <tr key={`${row.role}-${row.id}`}
                                                    onClick={() => navigate(`/staff/${row.role}/${row.id}`)}
                                                    className="group border-b border-line-soft last:border-0 hover:bg-elevated/60 cursor-pointer">
                                                    <td className="py-3.5 pl-5 pr-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                                                                style={{ backgroundColor: row.color || '#768692' }}>
                                                                {(row.firstName || '?')[0]}{(row.lastName || '')[0]}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-[15px] font-semibold text-ink truncate">
                                                                    {formatFullName(row)}
                                                                </p>
                                                                {row.phone && (
                                                                    <p className="text-xs text-muted truncate tabular-nums">{formatUzPhone(row.phone)}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-ink">
                                                        {row.specialty || <span className="text-faint">—</span>}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide ${meta.badge}`}>
                                                            {meta.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-muted">
                                                        {depName(row.departmentId) || <span className="text-faint">—</span>}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        {row.role === 'DOCTOR'
                                                            ? <LoadBar percent={wl?.percent ?? null} />
                                                            : <span className="text-faint">—</span>}
                                                    </td>
                                                    {canManageAccess && <td className="py-3.5 px-4 text-right tabular-nums">
                                                        {row.fixedSalary
                                                            ? <span className="font-semibold text-ink">{formatMoney(row.fixedSalary)}</span>
                                                            : <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('staff.notSet')}</span>}
                                                    </td>}
                                                    <td className="py-3.5 pr-4 text-right">
                                                        <ChevronRight className="ml-auto h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-muted" aria-hidden />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}

            {creatingRole && (
                <StaffForm
                    mode="create" role={creatingRole}
                    departments={departments} services={services}
                    onClose={() => setCreatingRole(null)}
                    onSaved={afterChange}
                />
            )}
        </div>
    );
};

export default Staff;
