import {
    Stethoscope, Users, Calendar as CalendarIcon, Wallet, Package,
    FlaskConical, Scan, BedDouble, Settings as SettingsIcon,
} from 'lucide-react';
import { UserRole, AccessControl } from '../types';
import type { TranslationKey } from '../i18n/translations';
import { isModuleHidden, canSeeFinance } from './accessControl';

/* ─────────────────────────────────────────────────────────────────────────────
   MENYU — YAGONA RO'YXAT.

   Ilgari u IKKI JOYDA yozilgan edi: `App.tsx` dagi `CLINIC_NAVIGATION`
   (yon panel) va `BottomNav.tsx` dagi o'z ro'yxati (telefon). Ular
   ajralib ketgan edi:

     · telefondagi ro'yxatda Registratura, navbat, laboratoriya va
       diagnostika UMUMAN yo'q edi — ya'ni registratorning va shifokorning
       ASOSIY ekranlari pastki menyuda ko'rinmasdi;
     · laborantga bironta ham punkt to'g'ri kelmasdi va pastki panel bo'sh
       chiziq bo'lib turardi, «Barchasi» tugmasi ham chiqmasdi;
     · ombor punkti ikki xil tarjima kalitidan foydalanardi.

   Endi ikkalasi ham shu ro'yxatdan o'qiydi. Marshrut qo'riqchisi ham
   shu yerdan: «Ruxsatlar» da yashirilgan modulni manzilni qo'lda yozib
   ochib bo'lmasin (ilgari mumkin edi — filtr faqat menyuga qo'llanardi).
   ───────────────────────────────────────────────────────────────────────────── */

export interface NavItemDef {
    id: string;
    path: string;
    labelKey: TranslationKey;
    icon: React.ElementType;
    roles: UserRole[];
}

const ALL = [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.NURSE];

export const NAVIGATION: NavItemDef[] = [
    /* «Bugun» — kunlik ish. Registrator qabul ochadi, shifokor o'z
       navbatini ko'radi, hamshira kimga nima buyurilganini biladi. */
    { id: 'today', path: '/today', labelKey: 'today.title', icon: Stethoscope, roles: ALL },
    { id: 'patients', path: '/patients', labelKey: 'nav.patients', icon: Users, roles: ALL },
    { id: 'calendar', path: '/calendar', labelKey: 'nav.calendar', icon: CalendarIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
    { id: 'finance', path: '/finance', labelKey: 'nav.finance', icon: Wallet, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    { id: 'inventory', path: '/inventory', labelKey: 'inventory.title', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    /* Laboratoriya va Diagnostika — BAJARUVCHINING ish o'rni. Shifokor
       ularga bemor kartasidan yo'llanma yuboradi va natijani o'sha yerda
       ko'radi; ish ro'yxati unga kerak emas va menyuni shishiradi. */
    { id: 'lab', path: '/lab', labelKey: 'nav.lab', icon: FlaskConical, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST, UserRole.LAB_TECHNICIAN] },
    { id: 'diagnostics', path: '/diagnostics', labelKey: 'nav.diagnostics', icon: Scan, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    { id: 'inpatient', path: '/inpatient', labelKey: 'nav.inpatient', icon: BedDouble, roles: ALL },
    { id: 'settings', path: '/settings', labelKey: 'nav.settings', icon: SettingsIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
];

/** Rol va «Ruxsatlar» sozlamasiga ko'ra ko'rinadigan punktlar */
export function visibleNavigation(role: UserRole, ac: AccessControl): NavItemDef[] {
    return NAVIGATION.filter(item =>
        item.roles.includes(role)
        && !isModuleHidden(ac, role, item.id)
        && (item.id !== 'finance' || canSeeFinance(ac, role)),
    );
}

/** Shu modulni ochish mumkinmi — marshrut qo'riqchisi shundan foydalanadi */
export function canOpenModule(role: UserRole, ac: AccessControl, moduleId: string): boolean {
    const item = NAVIGATION.find(n => n.id === moduleId);
    if (!item) return true;                       // menyuda yo'q sahifalar cheklanmaydi
    if (!item.roles.includes(role)) return false;
    if (isModuleHidden(ac, role, moduleId)) return false;
    if (moduleId === 'finance' && !canSeeFinance(ac, role)) return false;
    return true;
}

/** Rolning bosh sahifasi — ruxsat bo'lmaganda shu yerga qaytariladi */
export function homeFor(role: UserRole): string {
    if (role === UserRole.NURSE) return '/inpatient';
    if (role === UserRole.LAB_TECHNICIAN) return '/lab';
    return '/today';
}
