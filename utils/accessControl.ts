import { AccessControl, RoleAccess, Clinic, UserRole } from '../types';
import { tr } from '../context/LanguageContext';

// Klinika sozlamalaridagi ruxsatlarni o'qish uchun yagona manba.
// accessControl bo'lmasa (eski klinikalar, backend hali yangilanmagan) — hammasi ochiq.

export function parseAccessControl(clinic?: Clinic): AccessControl {
    const raw = clinic?.accessControl;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw) as AccessControl;
    } catch {
        return {};
    }
}

export function getRoleAccess(ac: AccessControl, role: UserRole): RoleAccess | undefined {
    if (role === UserRole.DOCTOR) return ac.doctor;
    if (role === UserRole.RECEPTIONIST) return ac.receptionist;
    if (role === UserRole.LAB_TECHNICIAN) return ac.labTechnician;
    if (role === UserRole.NURSE) return ac.nurse;
    return undefined; // klinika egasi cheklanmaydi
}

/** Sozlamalardagi kalit — rol bo'yicha. Ekran ham, o'qish ham shundan. */
export const ACCESS_ROLE_KEYS: { role: UserRole; key: keyof AccessControl; title: string; desc: string }[] = [
    { role: UserRole.RECEPTIONIST, key: 'receptionist', title: tr('ui.registrator'), desc: tr('ui.qabulxona_xodimlari_uchun') },
    { role: UserRole.DOCTOR, key: 'doctor', title: tr('ui.shifokor_2'), desc: tr('ui.shifokorlar_uchun') },
    { role: UserRole.LAB_TECHNICIAN, key: 'labTechnician', title: tr('ui.laborant'), desc: tr('ui.tahlil_natijalarini_kiritadi') },
    { role: UserRole.NURSE, key: 'nurse', title: tr('ui.hamshira'), desc: tr('ui.dori_beradi_palatani_olib') },
];

/* ESKI MODUL ID LARI. «Bugun» (`today`) 2026-09-16 da «Registratura»
   (`reception`) bo'ldi. Sozlamalarda saqlangan `hiddenModules` ro'yxatida
   eski id turgan bo'lishi mumkin — u yangi id uchun ham amal qiladi, aks
   holda yashirilgan modul yangilanishdan keyin jimgina ochilib qolardi. */
export const LEGACY_MODULE_IDS: Record<string, string[]> = { reception: ['today'] };

/** Ro'yxatda modul (yoki uning eski nomi) bormi */
export function hiddenListHas(hidden: string[] | undefined, moduleId: string): boolean {
    if (!hidden?.length) return false;
    return hidden.includes(moduleId)
        || (LEGACY_MODULE_IDS[moduleId] || []).some(id => hidden.includes(id));
}

export function isModuleHidden(ac: AccessControl, role: UserRole, moduleId: string): boolean {
    return hiddenListHas(getRoleAccess(ac, role)?.hiddenModules, moduleId);
}

export function canSeeFinance(ac: AccessControl, role: UserRole): boolean {
    // Hamshira moliyani ko'rmaydi. Sozlamalarda bunday bayroq yo'q, ya'ni
    // sukut bo'yicha "ochiq" bo'lib qolardi — shuning uchun aniq yozilgan.
    if (role === UserRole.NURSE) return false;
    return getRoleAccess(ac, role)?.showFinance !== false;
}

export function canSeePatientPhone(ac: AccessControl, role: UserRole): boolean {
    return getRoleAccess(ac, role)?.showPatientPhone !== false;
}

// Oxirgi 2 raqamdan tashqari hammasini yashiradi: "+998 90 123 45 67" → "+*** ** *** ** 67"
export function maskPhone(phone?: string): string {
    if (!phone) return '';
    return phone.replace(/\d(?=(?:\D*\d){2})/g, '*');
}
