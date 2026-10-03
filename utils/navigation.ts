import {
    LayoutDashboard, BarChart3, Users, Calendar as CalendarIcon, Wallet, Package,
    FlaskConical, Scan, BedDouble, Settings as SettingsIcon, UserCog,
    MessageSquare,
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
    /* BITTA EKRAN, ROLGA QARAB BOSHQA NOM — kerak bo'lganda. Hozir hech
       bir punkt ishlatmaydi («Bugun» hamma rol uchun bir xil nomda), lekin
       nomni baribir `navLabelKey` orqali oling. */
    labelFor?: Partial<Record<UserRole, TranslationKey>>;
    icon: React.ElementType;
    roles: UserRole[];
}

const ALL = [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.NURSE];

export const NAVIGATION: NavItemDef[] = [
    /* BUGUN — kunlik ish, hamma uchun bitta ekran (`pages/Reception.tsx`).
       Registrator va ega jonli xaritada navbatni yuritadi va «Yangi qabul»
       ochadi; egaga qo'shimcha — kassa qatori va «Bugun hal qilinsin»;
       shifokor o'z navbatini ko'radi.

       Bu punkt «Registratura» edi, yonida esa egaga alohida «Bosh panel»
       turardi va o'sha xaritani takrorlardi. 2026-10-03 da birlashtirildi:
       bitta ish — bitta joy. Manzil va modul nomi (`reception`) o'zgarmadi —
       talonlarda, xatcho'plarda va «Ruxsatlar» sozlamasida shular turadi. */
    { id: 'reception', path: '/reception', labelKey: 'nav.today', icon: LayoutDashboard, roles: ALL },
    { id: 'patients', path: '/patients', labelKey: 'nav.patients', icon: Users, roles: ALL },
    { id: 'calendar', path: '/calendar', labelKey: 'nav.calendar', icon: CalendarIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
    /* MOLIYA — kassa. Hisobot va davomat bu yerda emas, «Hisobot» da. */
    { id: 'finance', path: '/finance', labelKey: 'nav.finance', icon: Wallet, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    /* HISOBOT — faqat egaga: davr bo'yicha foyda, qarz, davomat. Bugungi
       holat bu yerda emas, «Bugun» da. Modul nomi `dashboard` bo'lib qoldi
       (eski havolalar uchun), ekran esa `pages/Dashboard.tsx`. */
    { id: 'dashboard', path: '/dashboard', labelKey: 'nav.reports', icon: BarChart3, roles: [UserRole.CLINIC_ADMIN] },
    { id: 'inventory', path: '/inventory', labelKey: 'inventory.title', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    /* Laboratoriya va Diagnostika — BAJARUVCHINING ish o'rni. Shifokor
       ularga bemor kartasidan yo'llanma yuboradi va natijani o'sha yerda
       ko'radi; ish ro'yxati unga kerak emas va menyuni shishiradi. */
    { id: 'lab', path: '/lab', labelKey: 'nav.lab', icon: FlaskConical, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST, UserRole.LAB_TECHNICIAN] },
    { id: 'diagnostics', path: '/diagnostics', labelKey: 'nav.diagnostics', icon: Scan, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    { id: 'inpatient', path: '/inpatient', labelKey: 'nav.inpatient', icon: BedDouble, roles: ALL },
    /* XABARLAR — MENYUGA QAYTDI.

       U Sozlamalar ichiga ko'chirilgan edi: «shablon va avtomatik qoida
       oyiga bir-ikki marta kerak» degan hisob bilan. Amalda esa bo'lim
       kundalik ish quroli bo'lib chiqdi — SMS balansi, yuborilgan
       xabarlar tarixi va kanal sozlamasi bir joyda kerak. Sozlamalar
       ichida uni topish uchun esa avval «u yerda ekanini» bilish kerak
       edi.

       Faqat klinika egasida: xabar yuborish pul turadi (SMS) va
       shablonlar butun klinika nomidan gapiradi. Server ham shu
       marshrutlarga boshqa rolni qo'ymaydi. */
    { id: 'messages', path: '/messages', labelKey: 'nav.messages', icon: MessageSquare, roles: [UserRole.CLINIC_ADMIN] },
    /* XODIMLAR — alohida modul.

       U Sozlamalar ichidagi vkladka edi, ulush va vedomost esa Moliyada.
       Ya'ni «bu odam qancha oladi va qancha ishladi» degan bitta savolga
       javob izlash uchun ikkita bo'limni kezib chiqish kerak edi.

       Faqat klinika egasida: oylik, bonus va jarima — registratorning
       ishi emas, server ham bu marshrutlarga 403 qaytaradi. */
    { id: 'staff', path: '/staff', labelKey: 'nav.staff', icon: UserCog, roles: [UserRole.CLINIC_ADMIN] },
    { id: 'settings', path: '/settings', labelKey: 'nav.settings', icon: SettingsIcon, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
];

/** Punktning shu rol uchun nomi — menyu, sarlavha va «Ruxsatlar» shundan oladi */
export function navLabelKey(item: NavItemDef, role: UserRole): TranslationKey {
    return item.labelFor?.[role] ?? item.labelKey;
}

/* ─── RUXSAT MODULLARI ──────────────────────────────────────

   Ro'yxat MENYUDAN hosil bo'ladi — alohida yozilmaydi.

   Ilgari u `constants.ts` da qo'lda yozilgan nusxa edi va menyudan
   ajralib ketgan: unda allaqachon olib tashlangan bo'limlar turardi
   («Registratura», «Mening navbatim», «Lidlar», «Shifokorlar»,
   «Navbat tablosi»), «Bugun» esa umuman yo'q edi. Ya'ni ruxsatlar
   ekrani mavjud bo'lmagan sahifalarni yashirishni taklif qilardi va
   mavjudini yashira olmasdi.

   Klinika egasi cheklanmaydi, shuning uchun u ro'yxatga kirmaydi. */
export function accessModulesFor(role: UserRole): NavItemDef[] {
    return NAVIGATION.filter(item =>
        item.roles.includes(role) && role !== UserRole.CLINIC_ADMIN);
}

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

/** Rolning bosh sahifasi — kirganda shu yerga tushadi, ruxsat bo'lmaganda shu yerga qaytariladi */
export function homeFor(role: UserRole): string {
    if (role === UserRole.NURSE) return '/inpatient';
    if (role === UserRole.LAB_TECHNICIAN) return '/lab';
    return '/reception';
}
