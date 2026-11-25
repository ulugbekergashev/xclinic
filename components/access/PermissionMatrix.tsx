import React, { useEffect, useMemo, useState } from 'react';
import {
   Users, User, Calendar as CalendarIcon, Banknote, Wallet, Package, FlaskConical, Scan, BedDouble,
   MessageSquare, Settings as SettingsIcon, ChevronDown, Lock, Eye, Pencil, Check, AlertTriangle,
   Loader2, Shield, LayoutDashboard, BarChart3, UserCog,
} from 'lucide-react';
import { Clinic, UserRole } from '../../types';
import { api } from '../../services/api';
import { toast } from '../../services/toast';
import {
   PermRole, PermLevel, RolePerms, PERM_LEVELS, PERM_ROLES, presetPerms, resolveRolePerms, buildAccessControl,
} from '../../utils/staffPerms';
import {
   PERM_MATRIX, MatrixGroup, MatrixRow, MatrixIcon, GroupAgg, GroupAction,
   readRow, writeRow, rowSignature, rowHasRole, groupHasRole, groupClosed, groupSame, groupAgg, applyGroup,
   isWarn, levelOf, openMenuCount,
} from '../../utils/permissionMatrix';

/* ─────────────────────────────────────────────────────────────────────────────
   RUXSATLAR — DentaCRM modelida (egasining talabi, 2026-11-25).

   Rollar ustunlarda, bo'limlar qatorlarda. Har bo'lim OCHILADI: ichida
   amallar (qo'shish, tahrirlash, o'chirish, Excel) va maxsus amallar
   (to'lov olish, chegirma foizi ...). Har katakda bitta tanlov — Yo'q /
   Ko'radi / O'zgartiradi / Ruxsat. Bo'lim sarlavhasidagi katak butun
   bo'limni birdaniga o'zgartiradi. Har rol uchun shablon: Sodda / Standart
   / To'liq. Server har bir amalni shu sozlama bo'yicha tekshiradi
   (`backend/permissions.ts`, PERM_ROUTES).
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
   currentClinic?: Clinic;
   onClinicUpdated?: () => void;
   staffCounts?: Partial<Record<UserRole, number>>;
}

const MODULE_ICONS: Record<string, React.ElementType> = {
   reception: LayoutDashboard, patients: Users, calendar: CalendarIcon, money: Banknote, finance: Wallet,
   dashboard: BarChart3, lab: FlaskConical, diagnostics: Scan, inpatient: BedDouble, inventory: Package,
   messages: MessageSquare, staff: UserCog, settings: SettingsIcon,
};
const OPT_ICONS: Record<MatrixIcon, React.ElementType> = { eye: Eye, pen: Pencil, check: Check, user: User, users: Users };

const ROLES = PERM_ROLES;
const roleName = (role: PermRole) => ROLES.find(r => r.id === role)!.name;

const LEVEL_ORDER: PermLevel[] = ['standard', 'simple', 'full'];
const LEVEL_DESC: Record<PermLevel, string> = {
   standard: "Hozirgacha qanday ishlagan bo'lsa, shunday",
   simple: "Faqat kundalik ish — o'chirish va xavfli pul amallari yopiq",
   full: "Hamma bo'lim va amallar ochiq",
};
const levelLabel = (l: PermLevel) => PERM_LEVELS.find(x => x.id === l)!.label;

const AGG_LABEL: Record<GroupAgg, string> = { full: "To'liq", view: "Faqat ko'radi", none: "Yo'q", mixed: 'Aralash' };
const GROUP_ACTIONS: { id: GroupAction; label: string }[] = [
   { id: 'full', label: "To'liq" },
   { id: 'standard', label: 'Standart' },
   { id: 'view', label: "Faqat ko'radi" },
   { id: 'none', label: "Yo'q" },
];
function groupActionDesc(g: MatrixGroup, a: GroupAction): string {
   const menu = g.rows.some(r => r.kind === 'gate');
   if (a === 'full') return "Bo'limdagi hamma amal ochiq";
   if (a === 'standard') return "Shu bo'limni standart holatga qaytaradi";
   if (a === 'view') return menu ? "Ko'radi, hech narsani o'zgartirmaydi" : 'Faqat summalarni ko\'radi';
   return menu ? "Bo'lim menyuda ham chiqmaydi" : "Pulga oid hech bir amal yo'q";
}

type Tone = 'none' | 'view' | 'edit' | 'warn' | 'off';
const CHIP: Record<Tone, string> = {
   none: 'bg-surface border-line text-muted',
   view: 'bg-primary-50 border-primary-200 text-primary-700 dark:bg-primary-900/20 dark:border-primary-800 dark:text-primary-300',
   edit: 'bg-primary-100 border-primary-300 text-primary-900 dark:bg-primary-800/50 dark:border-primary-700 dark:text-primary-100',
   warn: 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200',
   off: 'bg-elevated border-dashed border-line text-faint',
};
const GROUP_CHIP: Record<GroupAgg, string> = {
   full: 'border-primary-300 text-primary-900 dark:border-primary-700 dark:text-primary-200',
   view: 'border-primary-200 text-primary-700 dark:border-primary-800 dark:text-primary-300',
   none: 'border-line text-muted',
   mixed: 'border-line text-ink',
};
const DOT: Record<Tone | 'std', string> = {
   none: 'bg-surface border-line',
   view: 'bg-primary-50 border-primary-300 dark:bg-primary-900/40 dark:border-primary-600',
   edit: 'bg-primary-300 border-primary-500 dark:bg-primary-600 dark:border-primary-400',
   warn: 'bg-amber-200 border-amber-500 dark:bg-amber-700 dark:border-amber-400',
   off: 'bg-elevated border-line',
   std: 'bg-surface border-dashed border-faint',
};
const GROUP_DOT: Record<GroupAction, string> = { full: DOT.edit, standard: DOT.std, view: DOT.view, none: DOT.none };

// Kompyuterda: nom + to'rt rol ustuni
const COLS = 'grid grid-cols-[minmax(200px,1fr)_repeat(4,minmax(150px,176px))] items-center gap-x-3 px-6';

type PopTarget =
   | { kind: 'row'; group: string; row: string; role: PermRole }
   | { kind: 'group'; group: string; role: PermRole }
   | { kind: 'level'; role: PermRole };
type Pop = PopTarget & { up: boolean };
const samePop = (a: PopTarget, b: PopTarget) =>
   a.kind === b.kind && a.role === b.role
   && (a.kind === 'level' || (a as any).group === (b as any).group)
   && (a.kind !== 'row' || (a as any).row === (b as any).row);

interface ChipView {
   label: string;
   tone: Tone;
   group?: GroupAgg;
   icon?: React.ElementType;
   changed: boolean;
   disabled: boolean;
   aria: string;
   title?: string;
   target: PopTarget;
}
type CellView = { type: 'na'; text: string } | ({ type: 'chip' } & ChipView);

interface MenuItem { key: string; label: string; desc: string; selected: boolean; dot: string; onPick: () => void }
interface MenuView { title: string; sub: string; items: MenuItem[] }

const MenuList: React.FC<{ menu: MenuView; large?: boolean }> = ({ menu, large }) => (
   <>
      <p className={`px-2 pt-1.5 font-bold text-ink ${large ? 'text-[15px]' : 'text-[13px]'}`}>{menu.title}</p>
      {menu.sub && <p className="px-2 pt-0.5 pb-2 text-xs text-muted border-b border-line-soft">{menu.sub}</p>}
      <div className="flex flex-col gap-0.5 pt-1.5">
         {menu.items.map(it => (
            <button
               key={it.key}
               type="button"
               onClick={it.onPick}
               aria-pressed={it.selected}
               autoFocus={it.selected}
               className={`flex w-full items-start gap-2.5 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${large ? 'min-h-[52px] p-2.5' : 'min-h-[44px] p-2'} ${it.selected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-elevated'}`}
            >
               <span className={`mt-[3px] h-3 w-3 shrink-0 rounded-full border-[1.5px] ${it.dot}`} />
               <span className="flex-1 min-w-0">
                  <span className={`block font-semibold text-ink ${large ? 'text-[14.5px]' : 'text-[13.5px]'}`}>{it.label}</span>
                  <span className={`block leading-snug text-muted ${large ? 'text-[12.5px]' : 'text-xs'}`}>{it.desc}</span>
               </span>
               {it.selected && <Check className="mt-0.5 w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" />}
            </button>
         ))}
      </div>
   </>
);

const ROLE_ENUM: Record<PermRole, UserRole> = {
   receptionist: UserRole.RECEPTIONIST, doctor: UserRole.DOCTOR,
   labTechnician: UserRole.LAB_TECHNICIAN, nurse: UserRole.NURSE,
};

export const PermissionMatrix: React.FC<Props> = ({ currentClinic, onClinicUpdated, staffCounts }) => {
   const initial = useMemo<Record<PermRole, RolePerms>>(() => Object.fromEntries(
      ROLES.map(r => [r.id, resolveRolePerms(r.id, currentClinic?.accessControl)]),
   ) as Record<PermRole, RolePerms>, [currentClinic?.id, currentClinic?.accessControl]);

   const [base, setBase] = useState(initial);
   const [draft, setDraft] = useState(initial);
   const [pop, setPop] = useState<Pop | null>(null);
   /* Hamma bo'lim OCHIQ turadi (DentaCRM kabi): ichidagi amallar darrov ko'rinsin */
   const [closed, setClosed] = useState<Record<string, boolean>>({});
   const [mobileRole, setMobileRole] = useState<PermRole>('receptionist');
   const [saving, setSaving] = useState(false);
   useEffect(() => { setBase(initial); setDraft(initial); }, [initial]);

   useEffect(() => {
      if (!pop) return;
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
   }, [pop]);

   const staffCount = (role: PermRole) => staffCounts?.[ROLE_ENUM[role]];

   /* Yangi nusxada o'zgartiramiz. Rolning oxirgi menyu bo'limi yopilmaydi —
      aks holda xodim tizimga kirib, hech qayerga o'ta olmaydi. */
   const change = (role: PermRole, fn: (p: RolePerms) => void) => {
      setPop(null);
      setDraft(prev => {
         const next = JSON.parse(JSON.stringify(prev)) as Record<PermRole, RolePerms>;
         fn(next[role]);
         if (openMenuCount(next[role]) === 0) {
            toast.error(`${roleName(role)}da kamida bitta bo'lim ochiq qolishi kerak — aks holda u kira olmaydi`);
            return prev;
         }
         return next;
      });
   };
   const applyLevel = (role: PermRole, level: PermLevel) => {
      setPop(null);
      setDraft(prev => ({ ...prev, [role]: presetPerms(role, level) }));
   };

   const openPop = (target: PopTarget, e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const up = window.innerHeight - r.bottom < 330 && r.top > 330;
      setPop(cur => (cur && samePop(cur, target) ? null : { ...target, up } as Pop));
   };
   const isOpen = (target: PopTarget) => !!pop && samePop(pop, target);

   const rowChanged = (g: MatrixGroup, r: MatrixRow, role: PermRole) =>
      rowSignature(g, r, draft[role]) !== rowSignature(g, r, base[role]);

   const changes = useMemo(() => {
      const count = Object.fromEntries(ROLES.map(r => [r.id, 0])) as Record<PermRole, number>;
      for (const role of ROLES.map(x => x.id)) {
         for (const g of PERM_MATRIX) for (const r of g.rows) {
            if (rowHasRole(g, r, role) && rowSignature(g, r, draft[role]) !== rowSignature(g, r, base[role])) count[role]++;
         }
      }
      return count;
   }, [draft, base]);
   const dirty = JSON.stringify(draft) !== JSON.stringify(base);
   const totalChanges = ROLES.reduce((s, r) => s + changes[r.id], 0);

   const rowCell = (g: MatrixGroup, r: MatrixRow, role: PermRole): CellView => {
      const fixed = r.fixed?.[role];
      if (fixed) return { type: 'na', text: fixed };
      if (!rowHasRole(g, r, role)) return { type: 'na', text: '' };
      const perms = draft[role];
      const read = readRow(g, r, perms);
      const off = r.kind !== 'gate' && groupClosed(g, perms);
      const warn = !off && isWarn(r, read);
      const tone: Tone = off ? 'off' : warn ? 'warn' : read.opt.tone;
      const icon = off ? undefined : warn ? AlertTriangle : read.opt.icon ? OPT_ICONS[read.opt.icon] : undefined;
      return {
         type: 'chip', tone, icon,
         label: off ? 'Yopiq' : read.opt.label,
         changed: rowChanged(g, r, role),
         disabled: off,
         aria: `${r.name}, ${roleName(role)}: ${off ? "bo'lim yopiq" : read.opt.label}`,
         title: off ? `${g.name} yopiq — avval bo'limni oching` : read.opt.desc,
         target: { kind: 'row', group: g.id, row: r.id, role },
      };
   };
   const groupCell = (g: MatrixGroup, role: PermRole): CellView => {
      if (g.rows.length === 1) return rowCell(g, g.rows[0], role);
      if (!groupHasRole(g, role)) return { type: 'na', text: g.note || "Bu rolda yo'q" };
      const agg = groupAgg(g, role, draft[role]);
      return {
         type: 'chip', tone: 'none', group: agg,
         label: AGG_LABEL[agg],
         changed: g.rows.some(r => rowHasRole(g, r, role) && rowChanged(g, r, role)),
         disabled: false,
         aria: `${g.name}, ${roleName(role)}: ${AGG_LABEL[agg]}`,
         title: "Butun bo'limni birdaniga o'zgartirish",
         target: { kind: 'group', group: g.id, role },
      };
   };

   const menuFor = (p: Pop): MenuView | null => {
      if (p.kind === 'level') {
         const cur = levelOf(p.role, draft[p.role]);
         return {
            title: `Shablon · ${roleName(p.role)}`,
            sub: "Butun ustunni birdaniga o'zgartiradi",
            items: LEVEL_ORDER.map(l => ({
               key: l, label: levelLabel(l), desc: LEVEL_DESC[l], selected: cur === l,
               dot: l === 'full' ? DOT.edit : l === 'standard' ? DOT.std : DOT.view,
               onPick: () => applyLevel(p.role, l),
            })),
         };
      }
      const g = PERM_MATRIX.find(x => x.id === p.group);
      if (!g) return null;
      if (p.kind === 'group') {
         const agg = groupAgg(g, p.role, draft[p.role]);
         const isStd = groupSame(g, p.role, draft[p.role], presetPerms(p.role, 'standard'));
         return {
            title: `${g.name} · ${roleName(p.role)}`,
            sub: `Hozir: ${AGG_LABEL[agg]}${isStd ? ' · standart holatda' : ''}`,
            items: GROUP_ACTIONS.map(a => ({
               key: a.id, label: a.label, desc: groupActionDesc(g, a.id),
               selected: a.id !== 'standard' && a.id === agg,
               dot: GROUP_DOT[a.id],
               onPick: () => change(p.role, perms => applyGroup(g, p.role, perms, a.id)),
            })),
         };
      }
      const r = g.rows.find(x => x.id === p.row);
      if (!r) return null;
      const read = readRow(g, r, draft[p.role]);
      const items: MenuItem[] = r.opts.map((o, i) => ({
         key: o.id, label: o.label, desc: o.desc, selected: !read.custom && read.index === i,
         dot: DOT[r.warnFrom != null && i >= r.warnFrom ? 'warn' : o.tone],
         onPick: () => change(p.role, perms => writeRow(g, r, perms, o)),
      }));
      if (read.custom) items.unshift({ key: 'custom', label: read.opt.label, desc: read.opt.desc, selected: true, dot: DOT[read.opt.tone], onPick: () => setPop(null) });
      return { title: `${r.name} · ${roleName(p.role)}`, sub: r.hint || g.name, items };
   };
   const menu = pop ? menuFor(pop) : null;

   const handleSave = async () => {
      if (!currentClinic?.id || !dirty) return;
      setSaving(true);
      try {
         await api.clinics.updateAccessControl(currentClinic.id, buildAccessControl(draft));
         setBase(draft);
         toast.success('Ruxsatlar saqlandi');
         onClinicUpdated?.();
      } catch (error: any) {
         toast.error(error?.message || 'Ruxsatlarni saqlashda xatolik');
      } finally {
         setSaving(false);
      }
   };

   const renderChip = (c: ChipView) => {
      const Icon = c.icon;
      const open = isOpen(c.target);
      const colors = c.group ? `border-[1.5px] border-dashed bg-surface ${GROUP_CHIP[c.group]}` : `border ${CHIP[c.tone]}`;
      return (
         <button
            type="button"
            onClick={e => openPop(c.target, e)}
            disabled={c.disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={c.aria}
            title={c.title}
            className={`relative flex h-10 w-full items-center gap-1.5 rounded-xl pl-3 pr-2.5 text-[13.5px] font-semibold transition-[filter] hover:brightness-[.97] disabled:cursor-not-allowed disabled:hover:brightness-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${colors}`}
         >
            {Icon && <Icon className="w-[15px] h-[15px] shrink-0" />}
            <span className="flex-1 min-w-0 truncate text-left">{c.label}</span>
            <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
            {c.changed && <span aria-hidden="true" className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-surface" />}
         </button>
      );
   };

   const renderCell = (cell: CellView, key: string, desk: boolean) => {
      if (cell.type === 'na') {
         return <span key={key} className="pl-1 text-[12.5px] leading-snug text-faint">{cell.text}</span>;
      }
      const open = desk && isOpen(cell.target) && !!menu;
      return (
         <div key={key} className="relative min-w-0">
            {renderChip(cell)}
            {open && pop && (
               <div role="dialog" aria-label={menu!.title} className={`absolute right-0 z-50 w-[300px] rounded-2xl border border-line bg-surface p-2 shadow-xl ${pop.up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
                  <MenuList menu={menu!} />
               </div>
            )}
         </div>
      );
   };

   const levelButton = (role: PermRole, desk: boolean) => {
      const level = levelOf(role, draft[role]);
      const target: PopTarget = { kind: 'level', role };
      const open = isOpen(target);
      return (
         <div className="relative self-start">
            <button
               type="button"
               onClick={e => openPop(target, e)}
               aria-haspopup="dialog"
               aria-expanded={open}
               aria-label={`${roleName(role)} shabloni: ${level ? levelLabel(level) : "qo'lda sozlangan"}`}
               className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${level ? 'border-line bg-elevated text-ink' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}
            >
               {level ? levelLabel(level) : "Qo'lda sozlangan"}
               <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>
            {desk && open && menu && (
               <div role="dialog" aria-label={menu.title} className="absolute left-0 top-full mt-1.5 z-50 w-[300px] rounded-2xl border border-line bg-surface p-2 shadow-xl">
                  <MenuList menu={menu} />
               </div>
            )}
         </div>
      );
   };

   const groupTitle = (g: MatrixGroup) => {
      const Icon = MODULE_ICONS[g.id] || Shield;
      const note = g.note || (g.rows.length === 1 ? g.rows[0].hint : undefined);
      return (
         <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
               <Icon className="w-[17px] h-[17px]" />
            </span>
            <span className="ml-1 flex min-w-0 flex-col">
               <span className="text-[15px] font-bold text-ink">{g.name}</span>
               {note && <span className="text-[12.5px] text-muted">{note}</span>}
            </span>
         </>
      );
   };
   const groupHead = (g: MatrixGroup) => {
      const multi = g.rows.length > 1;
      const expanded = multi && !closed[g.id];
      return multi ? (
         <button
            type="button"
            onClick={() => { setPop(null); setClosed(c => ({ ...c, [g.id]: !c[g.id] })); }}
            aria-expanded={expanded}
            className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 rounded-lg"
         >
            <ChevronDown className={`w-[18px] h-[18px] shrink-0 text-faint transition-transform ${expanded ? '' : '-rotate-90'}`} />
            {groupTitle(g)}
         </button>
      ) : (
         <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2">
            <span className="w-[18px] shrink-0" />
            {groupTitle(g)}
         </div>
      );
   };

   const anyExpanded = PERM_MATRIX.some(g => g.rows.length > 1 && !closed[g.id]);
   const toggleAll = () => {
      setPop(null);
      setClosed(anyExpanded ? Object.fromEntries(PERM_MATRIX.map(g => [g.id, true])) : {});
   };

   const mobileGroups = PERM_MATRIX.filter(g => groupHasRole(g, mobileRole));
   const changeParts = ROLES.filter(r => changes[r.id] > 0).map(r => `${r.name}: ${changes[r.id]}`).join(', ');

   return (
      <div className="space-y-4">
         <section aria-labelledby="access-title" className="lg:card">
            <div className="flex items-start justify-between gap-6 lg:px-6 lg:pt-5 pb-3">
               <div className="max-w-3xl">
                  <h2 id="access-title" className="text-[17px] font-bold text-ink">Ruxsatlar</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                     Har bir rol qaysi bo'limni ko'radi va nimani o'zgartiradi — bitta jadvalda. Bo'lim nomini bosing — ichidagi amallar ochiladi. Ko'rmaydigan bo'lim xodim menyusida chiqmaydi.
                  </p>
               </div>
               <button
                  type="button"
                  onClick={toggleAll}
                  className="hidden lg:inline-flex h-9 shrink-0 items-center rounded-[10px] border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink hover:bg-elevated"
               >
                  {anyExpanded ? "Hammasini yig'ish" : 'Hammasini ochish'}
               </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:px-6 pb-4 text-[12.5px] text-muted">
               <span className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${CHIP.edit}`}><Pencil className="w-3.5 h-3.5" />O'zgartiradi</span>
               <span className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${CHIP.view}`}><Eye className="w-3.5 h-3.5" />Ko'radi</span>
               <span className="inline-flex items-center gap-2">
                  <span className={`inline-flex h-6 items-center rounded-lg border px-2 text-xs font-semibold ${CHIP.none}`}>Yo'q</span>
                  <span className="hidden sm:inline">ko'rmaydi; bo'lim yopilsa, menyuda ham chiqmaydi</span>
               </span>
               <span className="inline-flex items-center gap-2">
                  <span className={`inline-flex h-6 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${CHIP.warn}`}><AlertTriangle className="w-3.5 h-3.5" />Ruxsat</span>
                  <span className="hidden sm:inline">xavfli amal ochiq</span>
               </span>
               <span className="inline-flex items-center gap-1.5 lg:ml-auto text-muted"><Lock className="w-3.5 h-3.5" />Klinika egasi cheklanmaydi</span>
            </div>

            {/* Kompyuter: rollar yonma-yon */}
            <div className="hidden lg:block">
               <div>
                  <div className={`${COLS} min-h-[68px] border-y border-line bg-surface ${pop?.kind === 'level' ? 'relative z-[45]' : ''}`}>
                     <span className="text-xs font-semibold text-muted">Bo'lim</span>
                     {ROLES.map(r => (
                        <div key={r.id} className="flex flex-col gap-1.5 py-2.5">
                           <div className="flex items-baseline gap-2">
                              <span className="text-[14.5px] font-bold text-ink">{r.name}</span>
                              {staffCount(r.id) !== undefined && <span className="text-xs text-muted">{staffCount(r.id)} xodim</span>}
                           </div>
                           {levelButton(r.id, true)}
                        </div>
                     ))}
                  </div>

                  {PERM_MATRIX.map(g => {
                     const expanded = g.rows.length > 1 && !closed[g.id];
                     return (
                        <React.Fragment key={g.id}>
                           <div className={`${COLS} min-h-[60px] border-t border-line bg-elevated/50`}>
                              {groupHead(g)}
                              {ROLES.map(r => renderCell(groupCell(g, r.id), r.id, true))}
                           </div>
                           {expanded && g.rows.map(row => (
                              <div key={row.id} className={`${COLS} min-h-[58px] border-t border-line-soft`}>
                                 <div className="min-w-0 py-2 pl-[70px]">
                                    <div className="text-sm font-medium text-ink">{row.name}</div>
                                    {row.hint && <div className="text-[12.5px] text-muted">{row.hint}</div>}
                                 </div>
                                 {ROLES.map(r => renderCell(rowCell(g, row, r.id), r.id, true))}
                              </div>
                           ))}
                        </React.Fragment>
                     );
                  })}
               </div>
            </div>

            {/* Telefon: bitta rol, tanlov pastdan chiqadi */}
            <div className="lg:hidden space-y-3">
               <div role="group" aria-label="Rol" className="grid grid-cols-2 gap-1 rounded-xl bg-elevated p-1">
                  {ROLES.map(r => {
                     const sel = r.id === mobileRole;
                     return (
                        <button
                           key={r.id}
                           type="button"
                           aria-pressed={sel}
                           onClick={() => { setPop(null); setMobileRole(r.id); }}
                           className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg ${sel ? 'bg-surface shadow-sm' : ''}`}
                        >
                           <span className={`text-sm font-bold ${sel ? 'text-ink' : 'text-muted'}`}>{r.name}</span>
                           {staffCount(r.id) !== undefined && <span className="text-xs text-muted">{staffCount(r.id)} xodim</span>}
                        </button>
                     );
                  })}
               </div>
               <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-muted">{roleName(mobileRole)} uchun shablon</span>
                  {levelButton(mobileRole, false)}
               </div>
               {mobileGroups.map(g => {
                  const expanded = g.rows.length > 1 && !closed[g.id];
                  const rows = expanded ? g.rows.filter(r => rowHasRole(g, r, mobileRole)) : [];
                  return (
                     <div key={g.id} className="rounded-2xl border border-line bg-surface">
                        <div className="flex items-center gap-2.5 px-2.5 py-2">
                           {groupHead(g)}
                           <div className="w-[140px] shrink-0">{renderCell(groupCell(g, mobileRole), 'g', false)}</div>
                        </div>
                        {rows.map(row => (
                           <div key={row.id} className="flex min-h-[58px] items-center gap-2.5 border-t border-line-soft py-1.5 pl-3.5 pr-2.5">
                              <div className="min-w-0 flex-1">
                                 <div className="text-sm font-medium text-ink">{row.name}</div>
                                 {row.hint && <div className="text-xs text-muted">{row.hint}</div>}
                              </div>
                              <div className="w-[140px] shrink-0">{renderCell(rowCell(g, row, mobileRole), 'c', false)}</div>
                           </div>
                        ))}
                     </div>
                  );
               })}
            </div>

            <p className="mt-3 lg:mt-0 lg:border-t border-line lg:px-6 lg:py-3.5 px-1 text-xs text-muted">
               Qo'shish, tahrirlash, o'chirish va pulga oid amallar serverda ham tekshiriladi — tugmani yashirish bilan cheklanib qolmaydi. Tashxis, retsept va dori buyurish — faqat shifokorda. Maosh, ulush, integratsiyalar (SMS, bot, DMED) va ruxsatlar — faqat egada.
            </p>
         </section>

         {/* Saqlash — pastda doim ko'rinib turadi */}
         <div className="sticky bottom-20 lg:bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 backdrop-blur px-4 py-3 shadow-lg">
            <span role="status" className={`text-sm ${dirty ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}>
               {dirty ? (totalChanges > 0 ? `${totalChanges} ta o'zgarish saqlanmagan · ${changeParts}` : "O'zgarishlar saqlanmagan")
                  : "O'zgarishlar yo'q"}
            </span>
            <div className="flex gap-2">
               <button
                  type="button"
                  onClick={() => { setPop(null); setDraft(base); }}
                  disabled={!dirty || saving}
                  className="h-10 px-4 rounded-xl border border-line text-sm font-medium text-ink hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  Bekor qilish
               </button>
               <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="h-10 px-5 rounded-xl bg-primary-600 hover:bg-primary-700 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
               >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Saqlash
               </button>
            </div>
         </div>

         {pop && (
            <button type="button" tabIndex={-1} aria-label="Ro'yxatni yopish" onClick={() => setPop(null)} className="hidden lg:block fixed inset-0 z-40 cursor-default" />
         )}
         {pop && menu && (
            <div className="lg:hidden">
               <button type="button" tabIndex={-1} aria-label="Ro'yxatni yopish" onClick={() => setPop(null)} className="fixed inset-0 z-[60] bg-black/40" />
               <div role="dialog" aria-label={menu.title} className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-w-lg rounded-t-3xl bg-surface px-3 pt-2 pb-6 shadow-2xl">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
                  <MenuList menu={menu} large />
               </div>
            </div>
         )}
      </div>
   );
};
