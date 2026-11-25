import {
    LayoutDashboard, BarChart3, Users, Calendar as CalendarIcon, Wallet, Package,
    FlaskConical, Scan, BedDouble, Settings as SettingsIcon, UserCog,
    MessageSquare,
} from 'lucide-react';
import { UserRole, AccessControl } from '../types';
import type { TranslationKey } from '../i18n/translations';
import { makePermChecker } from './staffPerms';

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
    /** Menyuda ko'rinmaydi — faqat manzil va ruxsat uchun turadi */
    hidden?: boolean;
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
    /* BO'LIMLAR — bemor qabuldan keyin boradigan joylar, shu tartibda:
       tahlil, tekshiruv, palata. Laboratoriya va Diagnostika —
       BAJARUVCHINING ish o'rni. Shifokor ularga bemor kartasidan yo'llanma
       yuboradi va natijani o'sha yerda ko'radi; ish ro'yxati unga kerak
       emas va menyuni shishiradi. */
    { id: 'lab', path: '/lab', labelKey: 'nav.lab', icon: FlaskConical, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST, UserRole.LAB_TECHNICIAN] },
    { id: 'diagnostics', path: '/diagnostics', labelKey: 'nav.diagnostics', icon: Scan, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    { id: 'inpatient', path: '/inpatient', labelKey: 'nav.inpatient', icon: BedDouble, roles: ALL },
    /* KASSA — to'lov navbati va kassa oynasi. Menyuda «Moliya» edi, lekin
       bu yerda moliya yo'q: hisobot va davomat «Hisobot» da, ulush —
       «Xodimlar» da. Qolgani — kassirning ishi, nomi ham shunday. Modul
       nomi va manzil (`finance`) o'zgarmadi — «Ruxsatlar» sozlamasida,
       F4 tugmasida va eski havolalarda shular turadi. */
    { id: 'finance', path: '/finance', labelKey: 'nav.finance', icon: Wallet, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
    /* HISOBOT — faqat egaga: davr bo'yicha foyda, qarz, davomat. Bugungi
       holat bu yerda emas, «Bugun» da. Modul nomi `dashboard` bo'lib qoldi
       (eski havolalar uchun), ekran esa `pages/Dashboard.tsx`. */
    { id: 'dashboard', path: '/dashboard', labelKey: 'nav.reports', icon: BarChart3, roles: [UserRole.CLINIC_ADMIN] },
    { id: 'inventory', path: '/inventory', labelKey: 'inventory.title', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
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

/* ─── QAYSI BO'LIM OCHIQ ─────────────────────────────────────────────────

   «Xodimlar → Ruxsatlar» (DentaCRM modeli, `utils/staffPerms.ts`) har rol
   uchun har bo'limni ochadi yoki yopadi. `roles` endi «odatda kimda bor»
   degani — «Standart» shablon shundan tuzilgan. Ega hammasini ko'radi.
   Server ham xuddi shu katalogga qaraydi (`backend/permissions.ts`). */

function rawOpen(role: UserRole, ac: AccessControl, item: NavItemDef): boolean {
    if (role === UserRole.CLINIC_ADMIN) return item.roles.includes(role);
    return makePermChecker(role, ac).menu(item.id);
}

/** Rolga ochiq bo'limlar. Hammasi yopilgan bo'lsa — bosh sahifa ochiq
    qoladi: aks holda xodim kira olmay, qo'riqchi aylanib qolardi. */
function openModuleIds(role: UserRole, ac: AccessControl): Set<string> {
    const ids = new Set(NAVIGATION.filter(i => !i.hidden && rawOpen(role, ac, i)).map(i => i.id));
    if (ids.size === 0) {
        const home = homeModuleId(role);
        if (home) ids.add(home);
    }
    return ids;
}

/** Rol va «Ruxsatlar» sozlamasiga ko'ra ko'rinadigan punktlar */
export function visibleNavigation(role: UserRole, ac: AccessControl): NavItemDef[] {
    const open = openModuleIds(role, ac);
    return NAVIGATION.filter(item => !item.hidden && open.has(item.id));
}

/* TELEFONDAGI PASTKI PANEL — to'rtta joy.

   Yon panelda tartib bemorning yo'li bo'yicha (qabul → bo'limlar → kassa),
   telefonda esa joy to'rtta va u yerga ENG KO'P ochiladiganlari kerak:
   registrator uchun kassa laboratoriyaning ish ro'yxatidan muhimroq.
   Ro'yxatda yo'q yoki rolga yopiq punkt o'rnini menyudagi navbatdagisi
   oladi (laborantda — laboratoriya, hamshirada — statsionar). */
const PHONE_FIRST = ['reception', 'patients', 'calendar', 'finance'];
export function phoneNavigation(items: NavItemDef[], slots = 4): NavItemDef[] {
    const first = PHONE_FIRST.map(id => items.find(i => i.id === id)).filter((i): i is NavItemDef => !!i);
    const rest = items.filter(i => !first.includes(i));
    return [...first, ...rest].slice(0, slots);
}

/** Shu modulni ochish mumkinmi — marshrut qo'riqchisi shundan foydalanadi */
export function canOpenModule(role: UserRole, ac: AccessControl, moduleId: string): boolean {
    const item = NAVIGATION.find(n => n.id === moduleId);
    if (!item) return true;                       // menyuda yo'q sahifalar cheklanmaydi
    return openModuleIds(role, ac).has(moduleId);
}

/** Rolning ODATIY bosh sahifasi */
function defaultHome(role: UserRole): string {
    if (role === UserRole.NURSE) return '/inpatient';
    if (role === UserRole.LAB_TECHNICIAN) return '/lab';
    return '/reception';
}

/** Rolning bosh sahifasi — kirganda shu yerga tushadi, ruxsat bo'lmaganda
    shu yerga qaytariladi. Ega odatiy bosh sahifani yopgan bo'lsa — menyudagi
    birinchi ochiq bo'lim. */
export function homeFor(role: UserRole, ac?: AccessControl): string {
    const home = defaultHome(role);
    if (!ac) return home;
    const visible = visibleNavigation(role, ac);
    if (visible.some(i => i.path === home)) return home;
    return visible[0]?.path || home;
}

/** Odatiy bosh sahifa qaysi menyu bandi */
export function homeModuleId(role: UserRole): string | undefined {
    const path = defaultHome(role);
    return NAVIGATION.find(n => n.path === path)?.id;
}
