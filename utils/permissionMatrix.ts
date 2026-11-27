/**
 * Ruxsatlar jadvali (Xodimlar → Ruxsatlar) — qatorlar katalogi.
 *
 * Har qator `utils/staffPerms.ts` dagi ma'lumotga tushadi: bo'lim harflari
 * (v/c/e/d/x), maxsus amal bayrog'i, foizli chegara yoki shifokorning ko'rish
 * doirasi. Qator faqat o'z `mask` idagi harflarni o'zgartiradi.
 *
 * Bo'limning birinchi qatori — «eshik» (kind: 'gate'): Yo'q bo'lsa bo'lim
 * menyuda chiqmaydi, qolgan qatorlarning qiymati saqlanib turadi.
 * Model DentaCRM dan (2026-11-25).
 */
import { PermRole, PermLevel, RolePerms, PermSectionDef, PERM_MODULES, presetPerms } from './staffPerms';

export type MatrixTone = 'none' | 'view' | 'edit';
export type MatrixIcon = 'eye' | 'pen' | 'check' | 'user' | 'users';

export interface MatrixOption {
    id: string;
    label: string;
    desc: string;
    tone: MatrixTone;
    ro?: boolean;
    icon?: MatrixIcon;
    letters?: string;
    value?: boolean | number;
    scope?: 'own' | 'all';
}

export type MatrixRowKind = 'gate' | 'cells' | 'flag' | 'limit' | 'scope';

export interface MatrixRow {
    id: string;
    name: string;
    hint?: string;
    kind: MatrixRowKind;
    section?: string;
    mask?: string;
    special?: string;
    roles?: PermRole[];
    fixed?: Partial<Record<PermRole, string>>;
    warnFrom?: number;
    opts: MatrixOption[];
}

export interface MatrixGroup {
    id: string;
    name: string;
    note?: string;
    rows: MatrixRow[];
}

const levels = (off: string, view: string, edit: string, editLetters: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', letters: '' },
    { id: 'view', label: "Ko'radi", desc: view, tone: 'view', ro: true, icon: 'eye', letters: 'v' },
    { id: 'edit', label: "O'zgartiradi", desc: edit, tone: 'edit', icon: 'pen', letters: editLetters },
];
const bit = (letter: string, on: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: 'Bu amalni bajara olmaydi', tone: 'none', letters: '' },
    { id: 'allow', label: 'Ruxsat', desc: on, tone: 'edit', icon: 'check', letters: letter },
];
const seeBit = (off: string, on: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', letters: '' },
    { id: 'view', label: "Ko'radi", desc: on, tone: 'view', ro: true, icon: 'eye', letters: 'v' },
];
const flag = (on: string, off = 'Bu amalni bajara olmaydi'): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', value: false },
    { id: 'allow', label: 'Ruxsat', desc: on, tone: 'edit', icon: 'check', value: true },
];
const seeFlag = (off: string, on: string): MatrixOption[] => [
    { id: 'none', label: "Yo'q", desc: off, tone: 'none', value: false },
    { id: 'view', label: "Ko'radi", desc: on, tone: 'view', ro: true, icon: 'eye', value: true },
];
const pct = (n: number): MatrixOption => ({ id: `p${n}`, label: `${n}% gacha`, desc: `Bitta hisobda ${n}% gacha`, tone: 'view', icon: 'check', value: n });

export const PERM_MATRIX: MatrixGroup[] = [
    {
        id: 'reception', name: 'Bugun', rows: [
            { id: 'queue', name: 'Navbat va qabullar', hint: 'Kelganini belgilash, chaqirish, qabul ochish', kind: 'gate', section: 'queue', mask: 'ce',
              opts: levels("Bugun menyuda chiqmaydi", "Navbatni ko'radi, boshqarmaydi", "Bemorni qabul qiladi, navbatni yuritadi", 'vce') },
            { id: 'delete', name: "Qabulni bekor qilish", kind: 'cells', section: 'queue', mask: 'd', opts: bit('d', "Ochilgan qabulni o'chiradi") },
        ],
    },
    {
        id: 'patients', name: 'Bemorlar', rows: [
            { id: 'card', name: 'Bemor kartasi', hint: 'Ism, telefon, manzil, shifokor', kind: 'gate', section: 'card', mask: 'ce',
              opts: levels("Bemorlar menyuda chiqmaydi", "Kartani ochadi, o'zgartira olmaydi", "Yangi bemor qo'shadi va kartani tahrirlaydi", 'vce') },
            { id: 'scope', name: 'Qaysi bemorlar', hint: 'Kalendarda ham shu amal qiladi', kind: 'scope', roles: ['doctor'],
              fixed: { receptionist: 'Hammasini', labTechnician: 'Hammasini', nurse: 'Hammasini' },
              opts: [
                  { id: 'own', label: "O'zinikini", desc: "Faqat o'ziga yozilgan bemorlar va qabullar", tone: 'view', icon: 'user', scope: 'own' },
                  { id: 'all', label: 'Hammasini', desc: 'Klinikadagi barcha bemor va qabullar', tone: 'edit', icon: 'users', scope: 'all' },
              ] },
            { id: 'delete', name: "Bemorni o'chirish", kind: 'cells', section: 'card', mask: 'd', warnFrom: 1, opts: bit('d', "Bemor kartasini butunlay o'chiradi") },
            { id: 'export', name: "Excel'ga yuklash", hint: "Bemorlar ro'yxatini faylga olish", kind: 'cells', section: 'card', mask: 'x', opts: bit('x', "Ro'yxatni Excel faylga yuklab oladi") },
            { id: 'history', name: 'Allergiya va kasalliklar', kind: 'cells', section: 'history', mask: 've',
              opts: levels("Kartada bu qism ko'rinmaydi", "O'qiydi, o'zgartira olmaydi", 'Yozadi va tuzatadi', 've') },
            { id: 'docs', name: 'Hujjatlar va rozilik', kind: 'cells', section: 'docs', mask: 'vc',
              opts: levels("Kartada hujjatlar ko'rinmaydi", "Hujjatlarni ko'radi", "Hujjat va rozilik varag'ini yaratadi", 'vc') },
            { id: 'photos', name: 'Suratlar', kind: 'cells', section: 'photos', mask: 'vcd', opts: [
                { id: 'none', label: "Yo'q", desc: "Kartada suratlar ko'rinmaydi", tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Suratlarni ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'upload', label: 'Yuklaydi', desc: "Yangi surat yuklaydi, o'chira olmaydi", tone: 'edit', icon: 'pen', letters: 'vc' },
                { id: 'full', label: "To'liq", desc: "Yuklaydi va o'chiradi", tone: 'edit', icon: 'pen', letters: 'vcd' },
            ] },
            { id: 'payhist', name: "To'lovlar tarixi", hint: "Kartadagi to'lovlar", kind: 'cells', section: 'payhist', mask: 'v',
              opts: seeBit("Kartada to'lovlar ko'rinmaydi", "To'lovlarni ko'radi") },
            { id: 'phone', name: 'Telefon raqami', hint: "Yo'q bo'lsa: +*** ** *** ** 67", kind: 'flag', special: 'phone',
              opts: seeFlag("Raqam yulduzcha bilan ko'rinadi", "To'liq raqamni ko'radi") },
            { id: 'message', name: 'Bemorga xabar', hint: 'Kartadan SMS yoki Telegram', kind: 'flag', special: 'message', opts: flag('Kartadan SMS yoki Telegram yuboradi') },
            /* Bugun → «Shikoyat va fikrlar» (2026-11-26) */
            { id: 'complaints', name: 'Shikoyatlar', hint: "Bemor shikoyatini yozadi, mas'ul tayinlaydi, yopadi", kind: 'flag', special: 'complaints', opts: flag("Shikoyatlar ro'yxati bilan ishlaydi") },
        ],
    },
    {
        id: 'calendar', name: 'Kalendar', rows: [
            { id: 'appts', name: 'Qabullar', kind: 'gate', section: 'appts', mask: 'ce',
              opts: levels('Kalendar menyuda chiqmaydi', "Qabullarni ko'radi, yoza olmaydi", "Qabul yozadi, kun va vaqtini ko'chiradi", 'vce') },
            { id: 'delete', name: "Qabulni o'chirish", kind: 'cells', section: 'appts', mask: 'd', opts: bit('d', "Qabulni kalendardan o'chiradi") },
            { id: 'remind', name: 'Eslatma yuborish', hint: 'Qabul haqida bemorga xabar', kind: 'flag', special: 'remind', opts: flag('Bemorga qabul haqida xabar yuboradi') },
        ],
    },
    {
        id: 'money', name: "Pul va to'lovlar", note: "Bugun, bemor kartasi va Kassada bir xil amal qiladi", rows: [
            { id: 'payCreate', name: "To'lov qabul qilish", hint: 'Bemordan pul olish, qarzni yopish, avans', kind: 'flag', special: 'payCreate',
              opts: flag('Bemordan pul oladi, qarzni yopadi', "O'zi pul olmaydi — kassaga yuboradi") },
            { id: 'discount', name: 'Chegirma', hint: "Bitta hisobda eng ko'pi bilan", kind: 'limit', special: 'discount', warnFrom: 5, opts: [
                { id: 'p0', label: "Yo'q", desc: 'Chegirma bera olmaydi', tone: 'none', value: 0 },
                pct(5), pct(10), pct(20), pct(50),
                { id: 'p100', label: 'Cheklovsiz', desc: 'Istalgan chegirma, bepulgacha', tone: 'edit', icon: 'check', value: 100 },
            ] },
            { id: 'refund', name: 'Pulni qaytarish', hint: "To'langan xizmat pulini bemorga qaytarish", kind: 'flag', special: 'refund', warnFrom: 1, opts: flag('Bemorga pulni qaytaradi') },
            { id: 'payEdit', name: "To'lovni tahrirlash", hint: 'Summasi, usuli yoki holati', kind: 'flag', special: 'payEdit', warnFrom: 1, opts: flag("Kiritilgan to'lovni o'zgartiradi") },
            { id: 'payDelete', name: "To'lovni o'chirish", hint: "O'chirilgani jurnalda qoladi", kind: 'flag', special: 'payDelete', warnFrom: 1, opts: flag("To'lovni o'chiradi") },
            { id: 'amounts', name: 'Tushum summalari', hint: "Tushum, o'rtacha chek va qarz summalari", kind: 'flag', special: 'amounts',
              opts: seeFlag("Summalar ko'rinmaydi", "Summalarni ko'radi") },
        ],
    },
    {
        id: 'finance', name: 'Kassa', rows: [
            { id: 'cashbook', name: 'Kunlik kassa', hint: 'Kirim va chiqimlar', kind: 'gate', section: 'cashbook', mask: 'x', opts: [
                { id: 'none', label: "Yo'q", desc: 'Kassa menyuda chiqmaydi', tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Kunlik kassani ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'viewx', label: "Ko'radi + Excel", desc: "Ko'radi va Excel faylga yuklab oladi", tone: 'view', ro: true, icon: 'eye', letters: 'vx' },
            ] },
            { id: 'expenses', name: 'Xarajatlar', kind: 'cells', section: 'expenses', mask: 'vced', opts: [
                { id: 'none', label: "Yo'q", desc: "Xarajatlar ko'rinmaydi", tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Xarajatlarni ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'add', label: "Qo'shadi", desc: "Mayda naqd xarajat yozadi, keyin o'zgartira olmaydi", tone: 'edit', icon: 'pen', letters: 'vc' },
                { id: 'full', label: "To'liq", desc: "Qo'shadi, tuzatadi va o'chiradi", tone: 'edit', icon: 'pen', letters: 'vced' },
            ] },
            { id: 'closeday', name: 'Kunni ochish va yopish', hint: 'Kun oxirida kassani sanab yopish', kind: 'flag', special: 'closeday', opts: flag('Kassani ochadi va kun oxirida yopadi') },
            { id: 'reopen', name: 'Yopilgan kunni qayta ochish', hint: "Yopilgan kassaga o'zgartirish kiritish", kind: 'flag', special: 'reopen', warnFrom: 1,
              opts: flag("Yopilgan kunni qayta ochib, o'zgartiradi") },
            { id: 'encash', name: 'Inkassatsiya', hint: 'Kassadan pul olish, kassaga pul solish', kind: 'flag', special: 'encash',
              opts: flag('Kassadan pul oladi va soladi') },
        ],
    },
    {
        id: 'dashboard', name: 'Hisobot', rows: [
            { id: 'reports', name: 'Hisobot', hint: 'Tushum, foyda, shifokor ulushi, davomat', kind: 'gate', section: 'reports', mask: 'x', warnFrom: 1, opts: [
                { id: 'none', label: "Yo'q", desc: 'Hisobot menyuda chiqmaydi', tone: 'none', letters: '' },
                { id: 'view', label: "Ko'radi", desc: "Tushum va foydani ko'radi", tone: 'view', ro: true, icon: 'eye', letters: 'v' },
                { id: 'viewx', label: "Ko'radi + Excel", desc: "Ko'radi va Excel faylga yuklab oladi", tone: 'view', ro: true, icon: 'eye', letters: 'vx' },
            ] },
        ],
    },
    {
        id: 'lab', name: 'Laboratoriya', rows: [
            { id: 'orders', name: 'Tahlil buyurtmalari', kind: 'gate', section: 'orders', mask: 'ce',
              opts: levels('Laboratoriya menyuda chiqmaydi', "Buyurtmalarni ko'radi", "Buyurtma yozadi, qon olinganini belgilaydi", 'vce') },
            { id: 'delete', name: "Buyurtmani o'chirish", kind: 'cells', section: 'orders', mask: 'd', opts: bit('d', "Tahlil buyurtmasini o'chiradi") },
            { id: 'results', name: 'Natija kiritish', kind: 'flag', special: 'results', opts: flag('Tahlil natijasini kiritadi') },
            /* Sozlamada «natijani tasdiqlash» yoqilgandagina ma'noga ega (2026-11-26) */
            { id: 'verify', name: 'Natijani tasdiqlash', kind: 'flag', special: 'verify', opts: flag('Boshqa xodim kiritgan natijani tasdiqlaydi') },
        ],
    },
    {
        id: 'diagnostics', name: 'Diagnostika', rows: [
            { id: 'studies', name: 'Tekshiruvlar', hint: 'UZI, rentgen, EKG', kind: 'gate', section: 'studies', mask: 'ce',
              opts: levels('Diagnostika menyuda chiqmaydi', "Tekshiruvlarni ko'radi", "Tekshiruvga yozadi, xulosa va fayl qo'shadi", 'vce') },
            { id: 'delete', name: "Tekshiruvni o'chirish", kind: 'cells', section: 'studies', mask: 'd', opts: bit('d', "Tekshiruv va faylini o'chiradi") },
        ],
    },
    {
        id: 'inpatient', name: 'Statsionar', rows: [
            { id: 'admissions', name: 'Yotqizish va chiqarish', kind: 'gate', section: 'admissions', mask: 'ce',
              opts: levels('Statsionar menyuda chiqmaydi', "Palatalarni ko'radi", "Bemorni yotqizadi, ko'chiradi va chiqaradi", 'vce') },
            { id: 'care', name: "Ko'rik va dori berish", hint: "Ko'rsatkichlar, dori berish, koykani tayyorlash", kind: 'flag', special: 'care',
              opts: flag("Ko'rik yozadi, dori beradi, ko'rsatkich kiritadi") },
        ],
    },
    {
        id: 'inventory', name: 'Ombor', rows: [
            { id: 'items', name: 'Mahsulotlar', kind: 'gate', section: 'items', mask: 'ce',
              opts: levels('Ombor menyuda chiqmaydi', "Qoldiqni ko'radi", "Mahsulot qo'shadi va tahrirlaydi", 'vce') },
            { id: 'delete', name: "Mahsulotni o'chirish", kind: 'cells', section: 'items', mask: 'd', opts: bit('d', "Mahsulotni ombordan o'chiradi") },
            { id: 'moves', name: 'Kirim va chiqim', kind: 'cells', section: 'moves', mask: 'c', opts: bit('c', 'Omborga kirim va chiqim yozadi') },
        ],
    },
    {
        id: 'messages', name: 'Xabarlar', rows: [
            { id: 'messages', name: "Xabarlar bo'limi", hint: 'Shablonlar va yuborilgan xabarlar tarixi', kind: 'gate', opts: [
                { id: 'none', label: "Yo'q", desc: 'Xabarlar menyuda chiqmaydi', tone: 'none' },
                { id: 'view', label: "Ko'radi", desc: "Shablon va tarixni ko'radi", tone: 'view', ro: true, icon: 'eye' },
            ] },
            { id: 'bulk', name: "Ko'p bemorga yuborish", hint: "Tanlangan guruhga — pulli SMS", kind: 'flag', special: 'bulk', warnFrom: 1,
              opts: flag('Guruhga birdaniga SMS yuboradi') },
            { id: 'automation', name: 'Shablon va avtomatik xabarlar', kind: 'flag', special: 'automation',
              opts: flag("Shablon va qoidalarni o'zgartiradi") },
        ],
    },
    {
        id: 'staff', name: 'Xodimlar', note: "Maosh, ulush va ruxsatlar — faqat egada", rows: [
            { id: 'list', name: "Xodimlar ro'yxati", kind: 'gate', section: 'list', mask: 'ced', warnFrom: 2,
              opts: levels('Xodimlar menyuda chiqmaydi', "Ro'yxatni ko'radi", "Xodim qo'shadi, tahrirlaydi, o'chiradi", 'vced') },
        ],
    },
    {
        id: 'settings', name: 'Sozlamalar', rows: [
            { id: 'services', name: 'Xizmatlar va narxlar', kind: 'gate', section: 'services', mask: 'ce', warnFrom: 2,
              opts: levels('Sozlamalar menyuda chiqmaydi', "Narxlarni ko'radi", "Xizmat qo'shadi va narxini o'zgartiradi", 'vce') },
            { id: 'delete', name: "Xizmatni o'chirish", kind: 'cells', section: 'services', mask: 'd', opts: bit('d', "Xizmatni prayslistdan o'chiradi") },
            { id: 'clinic', name: 'Klinika sozlamalari', hint: "Ma'lumotlar, bo'limlar, palatalar, tahlil katalogi, shablonlar", kind: 'cells', section: 'clinic', mask: 've',
              opts: levels("Ko'rinmaydi", "Ko'radi", "O'zgartiradi", 've') },
        ],
    },
];

// ── O'qish va yozish ──────────────────────────────────────────────────────────

const ORDER = 'vcedx';
const CODE: Record<string, string> = { view: 'v', create: 'c', edit: 'e', delete: 'd', export: 'x' };
const only = (letters: string, mask: string) => ORDER.split('').filter(ch => mask.includes(ch) && letters.includes(ch)).join('');

const moduleDef = (id: string) => PERM_MODULES.find(m => m.id === id);
const sectionDef = (moduleId: string, sectionId: string): PermSectionDef | undefined =>
    moduleDef(moduleId)?.sections.find(s => s.id === sectionId);

function normalize(letters: string, sec: PermSectionDef): string {
    const allowed = sec.acts.map(a => CODE[a]).join('');
    let v = letters.split('').filter(ch => allowed.includes(ch)).join('');
    if (sec.acts.includes('view') && (sec.fixedView || v.length > 0) && !v.includes('v')) v = 'v' + v;
    return ORDER.split('').filter(ch => v.includes(ch)).join('');
}

export const groupHasRole = (g: MatrixGroup, role: PermRole): boolean => !!moduleDef(g.id)?.roles.includes(role);
export const rowHasRole = (g: MatrixGroup, r: MatrixRow, role: PermRole): boolean =>
    groupHasRole(g, role) && (!r.roles || r.roles.includes(role));

export interface RowRead {
    opt: MatrixOption;
    index: number;
    custom: boolean;
}

const WORDS: Record<string, string> = { v: "ko'radi", c: "qo'shadi", e: 'tahrirlaydi', d: "o'chiradi", x: "Excel'ga yuklaydi" };

function customRead(letters: string): RowRead {
    const words = letters.split('').map(ch => WORDS[ch]).filter(Boolean);
    return {
        opt: {
            id: 'custom', label: "Qo'lda sozlangan",
            desc: words.length ? `Avval belgilangan: ${words.join(', ')}` : 'Avval belgilangan: hech narsa',
            tone: /[cedx]/.test(letters) ? 'edit' : letters ? 'view' : 'none',
        },
        index: -1, custom: true,
    };
}

export function readRow(g: MatrixGroup, r: MatrixRow, perms: RolePerms): RowRead {
    const t = perms[g.id];
    const at = (i: number): RowRead => ({ opt: r.opts[i], index: i, custom: false });
    if (!t) return at(0);
    switch (r.kind) {
        case 'gate': {
            if (!t.on) return at(0);
            if (!r.section) return at(1);
            const cur = only(t.cells[r.section] || '', r.mask || '');
            for (let i = 1; i < r.opts.length; i++) if (only(r.opts[i].letters || '', r.mask || '') === cur) return at(i);
            return customRead('v' + cur);
        }
        case 'cells': {
            const cur = only(t.cells[r.section!] || '', r.mask!);
            for (let i = 0; i < r.opts.length; i++) if (only(r.opts[i].letters || '', r.mask!) === cur) return at(i);
            return customRead(cur);
        }
        case 'flag': {
            const on = t.sp[r.special!] === true;
            return at(Math.max(0, r.opts.findIndex(o => o.value === on)));
        }
        case 'limit': {
            const n = Number(t.sp[r.special!]) || 0;
            const i = r.opts.findIndex(o => o.value === n);
            if (i >= 0) return at(i);
            return { opt: { id: 'custom', label: `${n}% gacha`, desc: `Bitta hisobda ${n}% gacha`, tone: 'view', icon: 'check', value: n }, index: -1, custom: true };
        }
        case 'scope':
            return at(Math.max(0, r.opts.findIndex(o => o.scope === t.scope)));
    }
    return at(0);
}

/** Qatorga variant yozadi (perms ni o'zgartiradi — chaqiruvchi nusxa beradi) */
export function writeRow(g: MatrixGroup, r: MatrixRow, perms: RolePerms, opt: MatrixOption): void {
    const t = perms[g.id];
    if (!t) return;
    const setLetters = (section: string, mask: string, letters: string) => {
        const sec = sectionDef(g.id, section);
        if (!sec) return;
        const keep = (t.cells[section] || '').split('').filter(ch => !mask.includes(ch)).join('');
        t.cells[section] = normalize(keep + only(letters, mask), sec);
    };
    switch (r.kind) {
        case 'gate':
            if (opt.id === r.opts[0].id) { t.on = false; return; }
            t.on = true;
            if (r.section) setLetters(r.section, r.mask || '', opt.letters || '');
            return;
        case 'cells':
            setLetters(r.section!, r.mask!, opt.letters || '');
            return;
        case 'flag':
            t.sp[r.special!] = opt.value === true;
            return;
        case 'limit':
            t.sp[r.special!] = Number(opt.value) || 0;
            return;
        case 'scope':
            t.scope = opt.scope === 'all' ? 'all' : 'own';
            return;
    }
}

export function rowSignature(g: MatrixGroup, r: MatrixRow, perms: RolePerms): string {
    const t = perms[g.id];
    if (!t) return '';
    switch (r.kind) {
        case 'gate': return `${t.on}|${r.section ? only(t.cells[r.section] || '', r.mask || '') : ''}`;
        case 'cells': return only(t.cells[r.section!] || '', r.mask!);
        case 'flag':
        case 'limit': return String(t.sp[r.special!]);
        case 'scope': return t.scope;
    }
    return '';
}

export const isWarn = (r: MatrixRow, read: RowRead): boolean =>
    r.warnFrom != null && (read.custom ? read.opt.tone !== 'none' : read.index >= r.warnFrom);

export function groupClosed(g: MatrixGroup, perms: RolePerms): boolean {
    const gate = g.rows.find(r => r.kind === 'gate');
    return !!gate && !perms[g.id]?.on;
}

export function groupSame(g: MatrixGroup, role: PermRole, a: RolePerms, b: RolePerms): boolean {
    if (groupClosed(g, a) && groupClosed(g, b)) return true;
    return g.rows.every(r => !rowHasRole(g, r, role) || rowSignature(g, r, a) === rowSignature(g, r, b));
}

export function levelOf(role: PermRole, perms: RolePerms): PermLevel | null {
    for (const level of ['standard', 'simple', 'full'] as PermLevel[]) {
        const preset = presetPerms(role, level);
        if (PERM_MATRIX.every(g => !groupHasRole(g, role) || groupSame(g, role, perms, preset))) return level;
    }
    return null;
}

export type GroupAgg = 'full' | 'view' | 'none' | 'mixed';
export type GroupAction = 'full' | 'standard' | 'view' | 'none';

export function groupAgg(g: MatrixGroup, role: PermRole, perms: RolePerms): GroupAgg {
    if (groupClosed(g, perms)) return 'none';
    const reads = g.rows.filter(r => rowHasRole(g, r, role) && r.kind !== 'scope').map(r => ({ r, read: readRow(g, r, perms) }));
    if (reads.every(x => !x.read.custom && x.read.index === x.r.opts.length - 1)) return 'full';
    if (reads.every(x => !x.read.custom && x.read.index === 0)) return 'none';
    if (reads.every(x => !x.read.custom && (x.read.opt.tone === 'none' || x.read.opt.ro))) return 'view';
    return 'mixed';
}

export function applyGroup(g: MatrixGroup, role: PermRole, perms: RolePerms, action: GroupAction): void {
    if (!perms[g.id]) return;
    if (action === 'standard') {
        perms[g.id] = JSON.parse(JSON.stringify(presetPerms(role, 'standard')[g.id]));
        return;
    }
    for (const r of g.rows) {
        if (!rowHasRole(g, r, role) || r.kind === 'scope') continue;
        if (action === 'none' && r.kind === 'gate') {
            writeRow(g, r, perms, r.opts[1]);
            writeRow(g, r, perms, r.opts[0]);
            continue;
        }
        const opt = action === 'full' ? r.opts[r.opts.length - 1]
            : action === 'view' ? (r.opts.find(o => o.ro) || r.opts[0])
                : r.opts[0];
        writeRow(g, r, perms, opt);
    }
}

/** Ochiq menyu bo'limlari soni — oxirgisini yopib bo'lmaydi (xodim kira olmay qoladi) */
export function openMenuCount(perms: RolePerms): number {
    return PERM_MODULES.filter(m => m.menu && perms[m.id]?.on).length;
}
