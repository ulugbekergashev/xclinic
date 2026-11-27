/**
 * XODIMLAR RUXSATLARI — yagona katalog, shablonlar va tekshiruv.
 *
 * ⚠️ Bu fayl `backend/staffPerms.ts` bilan BAYT-BAYT bir xil bo'lishi shart:
 * backend alohida tsconfig bilan yig'iladi, umumiy fayl import qilib bo'lmaydi.
 * Birini o'zgartirsangiz: `cp utils/staffPerms.ts backend/staffPerms.ts`.
 * `scripts/checkStaffPerms.mjs` farqni topadi va yig'ishni to'xtatadi.
 * Shuning uchun faylda hech qanday import yo'q.
 *
 * Model DentaCRM dan olingan (2026-11-25, egasining talabi): har bo'lim
 * ochiladi, ichida amallar (ko'rish, qo'shish, tahrirlash, o'chirish, Excel)
 * va maxsus amallar (to'lov olish, chegirma foizi ...). XClinic ning to'rt
 * roli va o'z bo'limlari bilan.
 *
 * Saqlanishi: `Clinic.accessControl` (JSON) — yangi ustun yoki migratsiya yo'q.
 *   { doctor: { ...eski bayroqlar, perms }, receptionist: {...}, ... }
 * Eski bayroqlar (hiddenModules, showFinance, showPatientPhone) `perms` dan
 * hisoblanib yoniga yoziladi — server va eski ilova versiyasi shularni o'qiydi.
 *
 * Asosiy qoida: sozlamaga tegmagan klinikada hech narsa o'zgarmaydi —
 * «Standart» shablon jadvaldan oldingi xatti-harakatning aynan o'zi.
 */

export type PermRole = 'receptionist' | 'doctor' | 'labTechnician' | 'nurse';
export type PermAction = 'view' | 'create' | 'edit' | 'delete' | 'export';
export type PermLevel = 'simple' | 'standard' | 'full';

export interface PermSectionDef {
    id: string;
    name: string;
    hint?: string;
    acts: PermAction[];
    /** Bo'lim ochiq bo'lsa har doim ko'rinadi — «Ko'rish» katagini o'chirib bo'lmaydi */
    fixedView?: boolean;
}

export interface PermSpecialDef {
    id: string;
    name: string;
    desc?: string;
    /** Foizli chegara (0–100), yoqish/o'chirish emas */
    limit?: boolean;
    warn?: boolean;
}

export interface PermModuleDef {
    id: string;
    name: string;
    roles: PermRole[];
    /** Menyudagi sahifa. false — ilova bo'ylab amal qiladigan imkoniyatlar guruhi */
    menu: boolean;
    scopeRoles?: PermRole[];
    note?: string;
    sections: PermSectionDef[];
    specials: PermSpecialDef[];
}

export const PERM_ROLES: { id: PermRole; userRole: string; name: string }[] = [
    { id: 'receptionist', userRole: 'RECEPTIONIST', name: 'Registrator' },
    { id: 'doctor', userRole: 'DOCTOR', name: 'Shifokor' },
    { id: 'labTechnician', userRole: 'LAB_TECHNICIAN', name: 'Laborant' },
    { id: 'nurse', userRole: 'NURSE', name: 'Hamshira' },
];

const CODE: Record<PermAction, string> = { view: 'v', create: 'c', edit: 'e', delete: 'd', export: 'x' };
const ORDER = 'vcedx';
const ALL: PermRole[] = ['receptionist', 'doctor', 'labTechnician', 'nurse'];

export const PERM_MODULES: PermModuleDef[] = [
    {
        id: 'reception', name: 'Bugun', roles: ALL, menu: true,
        sections: [
            { id: 'queue', name: 'Navbat va qabullar', hint: 'Kelganini belgilash, chaqirish, qabul ochish', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [],
    },
    {
        id: 'patients', name: 'Bemorlar', roles: ALL, menu: true,
        scopeRoles: ['doctor'],
        sections: [
            { id: 'card', name: 'Bemor kartasi', hint: 'Ism, telefon, manzil, shifokor', acts: ['view', 'create', 'edit', 'delete', 'export'], fixedView: true },
            { id: 'history', name: 'Allergiya va kasalliklar', acts: ['view', 'edit'] },
            { id: 'docs', name: 'Hujjatlar va rozilik', acts: ['view', 'create'] },
            { id: 'photos', name: 'Suratlar', acts: ['view', 'create', 'delete'] },
            { id: 'payhist', name: "To'lovlar tarixi", acts: ['view'] },
        ],
        specials: [
            { id: 'phone', name: "Telefon raqamini ko'rish" },
            { id: 'message', name: 'Bemorga xabar yuborish' },
            { id: 'complaints', name: 'Shikoyatlar bilan ishlash' },
        ],
    },
    {
        id: 'calendar', name: 'Kalendar', roles: ALL, menu: true,
        sections: [
            { id: 'appts', name: 'Qabullar', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [{ id: 'remind', name: 'Eslatma yuborish' }],
    },
    {
        id: 'money', name: "Pul va to'lovlar", roles: ALL, menu: false,
        note: "Bugun, bemor kartasi va Kassada bir xil amal qiladi",
        sections: [],
        specials: [
            { id: 'payCreate', name: "To'lov qabul qilish" },
            { id: 'discount', name: 'Chegirma berish', limit: true },
            { id: 'refund', name: 'Pulni qaytarish', warn: true },
            { id: 'payEdit', name: "To'lovni tahrirlash", warn: true },
            { id: 'payDelete', name: "To'lovni o'chirish", warn: true },
            { id: 'amounts', name: "Tushum summalarini ko'rish" },
        ],
    },
    {
        id: 'finance', name: 'Kassa', roles: ALL, menu: true,
        sections: [
            { id: 'cashbook', name: 'Kunlik kassa', acts: ['view', 'export'], fixedView: true },
            { id: 'expenses', name: 'Xarajatlar', acts: ['view', 'create', 'edit', 'delete'] },
        ],
        specials: [
            { id: 'closeday', name: 'Kunni ochish va yopish' },
            { id: 'reopen', name: 'Yopilgan kunni qayta ochish', warn: true },
            { id: 'encash', name: 'Inkassatsiya va kassaga pul solish' },
        ],
    },
    {
        id: 'dashboard', name: 'Hisobot', roles: ALL, menu: true,
        sections: [
            { id: 'reports', name: 'Hisobot', hint: 'Tushum, foyda, shifokor ulushi, davomat', acts: ['view', 'export'], fixedView: true },
        ],
        specials: [],
    },
    {
        id: 'lab', name: 'Laboratoriya', roles: ALL, menu: true,
        sections: [
            { id: 'orders', name: 'Tahlil buyurtmalari', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [{ id: 'results', name: 'Natija kiritish' }, { id: 'verify', name: 'Natijani tasdiqlash' }],
    },
    {
        id: 'diagnostics', name: 'Diagnostika', roles: ALL, menu: true,
        sections: [
            { id: 'studies', name: 'Tekshiruvlar', hint: 'UZI, rentgen, EKG', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [],
    },
    {
        id: 'inpatient', name: 'Statsionar', roles: ALL, menu: true,
        sections: [
            { id: 'admissions', name: 'Yotqizish va chiqarish', acts: ['view', 'create', 'edit'], fixedView: true },
        ],
        specials: [{ id: 'care', name: "Ko'rik, dori berish, ko'rsatkichlar" }],
    },
    {
        id: 'inventory', name: 'Ombor', roles: ALL, menu: true,
        sections: [
            { id: 'items', name: 'Mahsulotlar', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
            { id: 'moves', name: 'Kirim va chiqim', acts: ['create'] },
        ],
        specials: [],
    },
    {
        id: 'messages', name: 'Xabarlar', roles: ALL, menu: true,
        sections: [],
        specials: [
            { id: 'bulk', name: "Ko'p bemorga yuborish", warn: true },
            { id: 'automation', name: 'Shablon va avtomatik xabarlar' },
        ],
    },
    {
        id: 'staff', name: 'Xodimlar', roles: ['receptionist'], menu: true,
        note: "Maosh, ulush va ruxsatlar — faqat egada",
        sections: [
            { id: 'list', name: "Xodimlar ro'yxati", acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
        ],
        specials: [],
    },
    {
        id: 'settings', name: 'Sozlamalar', roles: ALL, menu: true,
        sections: [
            { id: 'services', name: 'Xizmatlar va narxlar', acts: ['view', 'create', 'edit', 'delete'], fixedView: true },
            { id: 'clinic', name: 'Klinika sozlamalari', hint: "Ma'lumotlar, bo'limlar, palatalar, tahlil katalogi, shablonlar", acts: ['view', 'edit'] },
        ],
        specials: [],
    },
];

export interface ModulePerm {
    on: boolean;
    scope: 'own' | 'all';
    /** Bo'lim → ruxsat harflari: v ko'rish, c qo'shish, e tahrirlash, d o'chirish, x eksport */
    cells: Record<string, string>;
    sp: Record<string, boolean | number>;
}
export type RolePerms = Record<string, ModulePerm>;

type Spec = Record<string, { on?: boolean; scope?: 'own' | 'all'; c?: Record<string, string>; s?: Record<string, boolean | number> }>;

/* STANDART — jadvaldan oldingi xatti-harakat (backend/permissions.ts RULES).
   Registrator — qabulxona va kassa; shifokor — klinik ish; laborant —
   laboratoriya; hamshira — statsionar. Egaga tegishli narsalar (chegirma,
   qaytarish, to'lovni tuzatish, hisobot) standartda yopiq. */
const STANDARD: Record<PermRole, Spec> = {
    receptionist: {
        reception: { on: true, c: { queue: 'vced' } },
        patients: { on: true, c: { card: 'vcex', history: 've', docs: 'vc', photos: 'vc', payhist: 'v' }, s: { phone: true, message: true, complaints: true } },
        calendar: { on: true, c: { appts: 'vced' }, s: { remind: true } },
        money: { on: true, s: { payCreate: true, discount: 0, refund: false, payEdit: false, payDelete: false, amounts: true } },
        finance: { on: true, c: { cashbook: 'vx', expenses: 'vc' }, s: { closeday: true, reopen: false, encash: true } },
        lab: { on: true, c: { orders: 'vced' }, s: { results: false } },
        diagnostics: { on: true, c: { studies: 'vc' } },
        inpatient: { on: true, c: { admissions: 'vce' }, s: { care: false } },
        inventory: { on: true, c: { items: 'vce', moves: 'c' } },
        settings: { on: true, c: { services: 'vce', clinic: 'v' } },
    },
    doctor: {
        reception: { on: true, c: { queue: 'vce' } },
        patients: { on: true, scope: 'own', c: { card: 'vcex', history: 've', docs: 'vc', photos: 'vcd', payhist: '' }, s: { phone: true, message: false } },
        calendar: { on: true, c: { appts: 'vce' }, s: { remind: false } },
        money: { on: true, s: { payCreate: false, discount: 0, refund: false, payEdit: false, payDelete: false, amounts: true } },
        inpatient: { on: true, c: { admissions: 'vce' }, s: { care: true } },
    },
    labTechnician: {
        lab: { on: true, c: { orders: 've' }, s: { results: true } },
        money: { on: true, s: { amounts: false } },
    },
    nurse: {
        reception: { on: true, c: { queue: 'v' } },
        patients: { on: true, c: { card: 'v', history: 've', docs: '', photos: 'v', payhist: '' }, s: { phone: true, message: false } },
        money: { on: true, s: { amounts: false } },
        inpatient: { on: true, c: { admissions: 'v' }, s: { care: true } },
    },
};

/* SODDA — faqat kundalik ish; o'chirish va pulga oid xavfli amallar yopiq. */
const SIMPLE: Record<PermRole, Spec> = {
    receptionist: {
        reception: { on: true, c: { queue: 'vce' } },
        patients: { on: true, c: { card: 'vce', history: 'v', docs: 'vc', photos: 'v', payhist: 'v' }, s: { phone: true, message: true, complaints: true } },
        calendar: { on: true, c: { appts: 'vce' }, s: { remind: true } },
        money: { on: true, s: { payCreate: true, amounts: true } },
        finance: { on: true, c: { cashbook: 'v', expenses: 'v' }, s: { closeday: true } },
    },
    doctor: {
        reception: { on: true, c: { queue: 'vce' } },
        patients: { on: true, scope: 'own', c: { card: 'vce', history: 've', docs: 'vc', photos: 'vc', payhist: '' }, s: { phone: true } },
        calendar: { on: true, c: { appts: 'v' } },
        money: { on: true, s: { amounts: false } },
    },
    labTechnician: {
        lab: { on: true, c: { orders: 'v' }, s: { results: true } },
        money: { on: true, s: { amounts: false } },
    },
    nurse: {
        patients: { on: true, c: { card: 'v', history: 'v' }, s: { phone: true } },
        money: { on: true, s: { amounts: false } },
        inpatient: { on: true, c: { admissions: 'v' }, s: { care: true } },
    },
};

export const PERM_LEVELS: { id: PermLevel; label: string }[] = [
    { id: 'simple', label: 'Sodda' },
    { id: 'standard', label: 'Standart' },
    { id: 'full', label: "To'liq" },
];

export const modulesForRole = (role: PermRole): PermModuleDef[] => PERM_MODULES.filter(m => m.roles.includes(role));

const normalizeCells = (value: string, sec: PermSectionDef): string => {
    const allowed = sec.acts.map(a => CODE[a]).join('');
    let v = String(value || '').split('').filter(ch => allowed.includes(ch)).join('');
    if (sec.acts.includes('view') && (sec.fixedView || v.length > 0) && !v.includes('v')) v = 'v' + v;
    return ORDER.split('').filter(ch => v.includes(ch)).join('');
};

const clampLimit = (n: unknown): number => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
};

function blankPerms(role: PermRole): RolePerms {
    const p: RolePerms = {};
    for (const m of modulesForRole(role)) {
        const t: ModulePerm = { on: false, scope: 'all', cells: {}, sp: {} };
        for (const s of m.sections) t.cells[s.id] = normalizeCells('', s);
        for (const s of m.specials) t.sp[s.id] = s.limit ? 0 : false;
        p[m.id] = t;
    }
    if (p.money) p.money.on = true;
    return p;
}

function fromSpec(role: PermRole, spec: Spec): RolePerms {
    const p = blankPerms(role);
    for (const m of modulesForRole(role)) {
        const s = spec[m.id];
        if (!s) continue;
        const t = p[m.id];
        if (typeof s.on === 'boolean') t.on = s.on;
        if (s.scope) t.scope = s.scope;
        for (const sec of m.sections) if (s.c && typeof s.c[sec.id] === 'string') t.cells[sec.id] = normalizeCells(s.c[sec.id], sec);
        for (const sp of m.specials) if (s.s && s.s[sp.id] !== undefined) t.sp[sp.id] = sp.limit ? clampLimit(s.s[sp.id]) : !!s.s[sp.id];
    }
    if (p.money) p.money.on = true;
    return p;
}

function fullPerms(role: PermRole): RolePerms {
    const p = blankPerms(role);
    for (const m of modulesForRole(role)) {
        const t = p[m.id];
        t.on = true;
        t.scope = 'all';
        for (const s of m.sections) t.cells[s.id] = normalizeCells(s.acts.map(a => CODE[a]).join(''), s);
        for (const s of m.specials) t.sp[s.id] = s.limit ? 100 : true;
    }
    return p;
}

export function presetPerms(role: PermRole, level: PermLevel): RolePerms {
    if (level === 'full') return fullPerms(role);
    return fromSpec(role, (level === 'simple' ? SIMPLE : STANDARD)[role]);
}

function mergeStored(role: PermRole, stored: any): RolePerms {
    const p = presetPerms(role, 'standard');
    for (const m of modulesForRole(role)) {
        const s = stored?.[m.id];
        if (!s || typeof s !== 'object') continue;
        const t = p[m.id];
        if (typeof s.on === 'boolean') t.on = s.on;
        if (s.scope === 'own' || s.scope === 'all') t.scope = s.scope;
        for (const sec of m.sections) {
            const v = s.cells?.[sec.id];
            if (typeof v === 'string') t.cells[sec.id] = normalizeCells(v, sec);
        }
        for (const sp of m.specials) {
            const v = s.sp?.[sp.id];
            if (sp.limit ? typeof v === 'number' : typeof v === 'boolean') t.sp[sp.id] = sp.limit ? clampLimit(v) : v;
        }
    }
    if (p.money) p.money.on = true;
    return p;
}

/** Jadvaldan oldingi bayroqlar → ruxsatlar (ega yangi jadvalda hali saqlamagan) */
function fromLegacy(role: PermRole, legacy: any): RolePerms {
    const p = presetPerms(role, 'standard');
    const hidden: string[] = Array.isArray(legacy?.hiddenModules) ? legacy.hiddenModules : [];
    const own = (o: object, k: unknown): k is string => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
    for (const id of hidden) {
        const key = id === 'today' ? 'reception' : id;
        if (own(p, key) && key !== 'money') p[key].on = false;
    }
    /* Eski «ochib berish» — faqat bo'limni ochadi, xavfli amallarsiz (Standart darajasida) */
    const granted: string[] = Array.isArray(legacy?.grantedModules) ? legacy.grantedModules : [];
    const std = presetPerms('receptionist', 'standard');
    for (const id of granted) {
        if (!own(p, id) || id === 'money') continue;
        p[id].on = true;
        if (own(std, id)) p[id].cells = { ...std[id].cells };
    }
    if (typeof legacy?.showFinance === 'boolean') p.money.sp.amounts = legacy.showFinance;
    if (legacy?.showFinance === false && p.finance) p.finance.on = false;
    if (legacy?.showPatientPhone === false && p.patients) p.patients.sp.phone = false;
    return p;
}

export function parseAccessControlRaw(raw: unknown): any {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        const parsed = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function resolveRolePerms(role: PermRole, accessControl: unknown): RolePerms {
    const ac = parseAccessControlRaw(accessControl);
    const entry = ac?.[role];
    if (entry && typeof entry === 'object' && entry.perms && typeof entry.perms === 'object') return mergeStored(role, entry.perms);
    if (entry && typeof entry === 'object') return fromLegacy(role, entry);
    return presetPerms(role, 'standard');
}

/** Saqlashda eski bayroqlar ham yoziladi: server va eski ilova shularni o'qiydi */
export function legacyFlags(role: PermRole, p: RolePerms) {
    const moneyVisible = p.money?.sp.amounts === true || !!p.finance?.on || !!p.dashboard?.on;
    return {
        hiddenModules: modulesForRole(role).filter(m => m.menu && !p[m.id]?.on).map(m => m.id),
        showFinance: moneyVisible,
        showPatientPhone: p.patients?.sp.phone !== false,
        seeAllPatients: role === 'doctor' ? p.patients?.scope === 'all' : true,
    };
}

export function buildAccessControl(perms: Record<PermRole, RolePerms>) {
    const out: Record<string, any> = {};
    for (const r of PERM_ROLES) out[r.id] = { ...legacyFlags(r.id, perms[r.id]), perms: perms[r.id] };
    return out;
}

// ── Tekshiruv ─────────────────────────────────────────────────────────────────

export interface PermChecker {
    /** Klinika egasi — hamma narsa mumkin */
    owner: boolean;
    role: PermRole | null;
    perms: RolePerms | null;
    menu(moduleId: string): boolean;
    can(moduleId: string, sectionId: string, action: PermAction): boolean;
    flag(moduleId: string, specialId: string): boolean;
    limit(moduleId: string, specialId: string): number;
    scopeAll(): boolean;
}

export const toPermRole = (userRole: unknown): PermRole | null =>
    PERM_ROLES.find(r => r.userRole === userRole)?.id ?? null;

const OPEN: PermChecker = {
    owner: true, role: null, perms: null,
    menu: () => true, can: () => true, flag: () => true, limit: () => 100, scopeAll: () => true,
};

export function makePermChecker(userRole: unknown, accessControl: unknown): PermChecker {
    const role = toPermRole(userRole);
    if (!role) return OPEN;
    const perms = resolveRolePerms(role, accessControl);
    const moduleOn = (id: string): ModulePerm | null => {
        const def = PERM_MODULES.find(m => m.id === id);
        const t = Object.prototype.hasOwnProperty.call(perms, id) ? perms[id] : undefined;
        if (!def || !t || !def.roles.includes(role)) return null;
        if (def.menu && !t.on) return null;
        return t;
    };
    return {
        owner: false, role, perms,
        menu: id => !!moduleOn(id),
        can: (mid, sid, action) => {
            const t = moduleOn(mid);
            if (!t) return false;
            const sec = PERM_MODULES.find(m => m.id === mid)!.sections.find(s => s.id === sid);
            if (!sec || !sec.acts.includes(action)) return false;
            if (action === 'view' && sec.fixedView) return true;
            return (t.cells[sid] || '').includes(CODE[action]);
        },
        flag: (mid, id) => {
            const t = moduleOn(mid);
            if (!t) return false;
            const v = t.sp[id];
            return typeof v === 'number' ? v > 0 : v === true;
        },
        limit: (mid, id) => {
            const t = moduleOn(mid);
            return t ? clampLimit(t.sp[id]) : 0;
        },
        scopeAll: () => role !== 'doctor' || perms.patients?.scope === 'all',
    };
}
