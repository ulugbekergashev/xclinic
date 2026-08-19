// ─── AI tool qatlami (2-bosqich) ──────────────────────────────────────────────
// AI klinika ma'lumotini SHU FAYL orqali va faqat O'QISH uchun ko'radi.
//
// Uchta qat'iy qoida:
//
//  1. clinicId HECH QACHON tool parametri emas. U chaqiruv kontekstidan
//     (tokendan) keladi. Aks holda model boshqa klinikaning id'sini o'ylab
//     topib, tenant chegarasidan chiqib ketishi mumkin.
//
//  2. Text-to-SQL yo'q. Har bir savol turi uchun alohida, tipizatsiyalangan
//     funksiya. Model faqat argument beradi, so'rovni biz yozamiz.
//
//  3. Rol filtri tool RO'YXATIDA amalga oshadi — mavjud bo'lmagan tool
//     modelga umuman ko'rsatilmaydi va bajarilishda ham qayta tekshiriladi.

const { prisma } = require('../db');

export interface ToolContext {
    clinicId: string;
    role: string;
    /** DOCTOR roli uchun — o'z bemorlari bilan cheklash. */
    doctorId?: string;
}

// ─── Maxfiylik ───────────────────────────────────────────────────────────────
// Bepul AI tier'lari so'rovlarni model o'qitishiga ishlatishi mumkin, shuning
// uchun to'liq shaxsiy ma'lumot yuborilmaydi. Foydalanuvchi kimligini tanishi
// uchun familiya + ism bosh harfi yetarli. PINFL va manzil umuman yuborilmaydi.

const maskName = (first?: string | null, last?: string | null): string => {
    const f = (first || '').trim();
    const l = (last || '').trim();
    if (!f && !l) return 'Noma\'lum';
    return l ? `${l} ${f.charAt(0).toUpperCase()}.`.trim() : f;
};

const maskPhone = (phone?: string | null): string => {
    const p = (phone || '').replace(/\D/g, '');
    return p.length >= 4 ? `***${p.slice(-4)}` : '***';
};

// ─── To'lov mantiqidan nusxa ─────────────────────────────────────────────────
// Manba: utils/paymentMethods.ts (frontend). U yerdagi ro'yxat o'zgarsa,
// bu yerni ham yangilang. Backend frontend'dagi util'ni import qila olmaydi
// (tsconfig chegarasi), shuning uchun ataylab takrorlangan.
// 'Balance' — avansdan yechish: pul ilgari tushgan, kassaga yangi pul kirmaydi.
const MONEY_IN_METHODS = new Set(['Cash', 'Card', 'Click', 'Transfer', 'Insurance']);
const isMoneyIn = (method?: string | null): boolean =>
    !method ? true : MONEY_IN_METHODS.has(method);

const fmt = (n: number): number => Math.round(n);

// ─── Tool ta'riflari (OpenAI-compatible) ─────────────────────────────────────

export interface ToolDef {
    name: string;
    description: string;
    parameters: Record<string, any>;
    /** Shu tool'ni ko'ra oladigan rollar. */
    roles: string[];
}

const ALL = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];
const FINANCE = ['SUPER_ADMIN', 'CLINIC_ADMIN'];
const FRONT_DESK = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'];

export const TOOL_DEFS: ToolDef[] = [
    {
        name: 'get_appointments',
        description:
            'Qabullar ro\'yxati va soni. Sana yoki sana oralig\'i bo\'yicha, ' +
            'ixtiyoriy ravishda shifokor va status bo\'yicha filtrlanadi. ' +
            '"Bugun nechta qabul bor?" kabi savollar uchun.',
        parameters: {
            type: 'object',
            properties: {
                dateFrom: { type: 'string', description: 'Boshlanish sanasi, YYYY-MM-DD' },
                dateTo: { type: 'string', description: 'Tugash sanasi, YYYY-MM-DD. Bir kun uchun dateFrom bilan bir xil.' },
                doctorName: { type: 'string', description: 'Shifokor familiyasi yoki ismi (qisman moslik)' },
                status: {
                    type: 'string',
                    enum: ['Confirmed', 'Pending', 'Completed', 'Cancelled', 'No-Show', 'Checked-In'],
                },
            },
            required: ['dateFrom', 'dateTo'],
        },
        roles: ALL,
    },
    {
        name: 'get_revenue',
        description:
            'Berilgan davr uchun moliyaviy xulosa: kassaga kirgan pul, umumiy ' +
            'aylanma, to\'lov usullari bo\'yicha taqsimot va xarajatlar. ' +
            '"Shu oy daromad qancha?" kabi savollar uchun.',
        parameters: {
            type: 'object',
            properties: {
                dateFrom: { type: 'string', description: 'Boshlanish sanasi, YYYY-MM-DD' },
                dateTo: { type: 'string', description: 'Tugash sanasi, YYYY-MM-DD' },
            },
            required: ['dateFrom', 'dateTo'],
        },
        roles: FINANCE,
    },
    {
        name: 'get_debtors',
        description:
            'Qarzdor bemorlar (balansi manfiy) — eng katta qarzdan boshlab. ' +
            '"Kim qarzdor?" savoli uchun.',
        parameters: {
            type: 'object',
            properties: {
                limit: { type: 'integer', description: 'Nechta bemor qaytarilsin (standart 10, maksimum 50)' },
            },
            required: [],
        },
        roles: FRONT_DESK,
    },
    {
        name: 'get_doctor_stats',
        description:
            'Shifokorlar kesimida ko\'rsatkichlar: qabullar soni, bajarilgan ' +
            'qabullar, kelmaganlar (no-show) va tushum. Shifokorlarni ' +
            'solishtirish uchun.',
        parameters: {
            type: 'object',
            properties: {
                dateFrom: { type: 'string', description: 'Boshlanish sanasi, YYYY-MM-DD' },
                dateTo: { type: 'string', description: 'Tugash sanasi, YYYY-MM-DD' },
            },
            required: ['dateFrom', 'dateTo'],
        },
        roles: FINANCE,
    },
    {
        name: 'find_patient',
        description:
            'Bemorni ism yoki telefon bo\'yicha qidiradi va qisqacha ' +
            'ma\'lumotini qaytaradi: oxirgi tashrif, balans, biriktirilgan shifokor.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Ism, familiya yoki telefon raqamining bir qismi' },
            },
            required: ['query'],
        },
        roles: ALL,
    },
    {
        name: 'get_low_stock',
        description:
            'Zaxirasi minimal darajadan tushgan materiallar ro\'yxati. ' +
            '"Nima tugayapti?" savoli uchun.',
        parameters: { type: 'object', properties: {}, required: [] },
        roles: ALL,
    },
    {
        name: 'get_leads',
        description:
            'Lidlar (potensial bemorlar) bo\'yicha xulosa. Qaytaradi: jami soni, ' +
            'STATUS kesimida taqsimot (New, Contacted, Thinking, Booked — ya\'ni ' +
            'nechtasi bemorga aylandi, Cancelled), MANBA kesimida taqsimot ' +
            '(Instagram, Telegram, tavsiya va h.k. — qaysi kanal ko\'p lid keltiryapti) ' +
            'va 7 kundan beri javobsiz qolgan eski lidlar soni. ' +
            'Lid manbasi, konversiya va marketing samaradorligi haqidagi savollar uchun.',
        parameters: {
            type: 'object',
            properties: {
                days: { type: 'integer', description: 'Oxirgi necha kun (standart 30)' },
            },
            required: [],
        },
        roles: FRONT_DESK,
    },
];

/** Rolga ko'ra ko'rinadigan tool ta'riflari (OpenAI `tools` formatida). */
export const toolsForRole = (role: string) =>
    TOOL_DEFS
        .filter(t => t.roles.includes(role))
        .map(t => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
        }));

// ─── Implementatsiyalar ──────────────────────────────────────────────────────
// Har birida `where` ichida clinicId ctx dan keladi — args dan EMAS.

const clampLimit = (n: any, def: number, max: number): number => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return def;
    return Math.min(Math.floor(v), max);
};

const IMPL: Record<string, (args: any, ctx: ToolContext) => Promise<any>> = {

    get_appointments: async (args, ctx) => {
        const where: any = {
            clinicId: ctx.clinicId,
            date: { gte: String(args.dateFrom), lte: String(args.dateTo) },
        };
        if (args.status) where.status = String(args.status);
        // DOCTOR faqat o'z qabullarini ko'radi.
        if (ctx.role === 'DOCTOR' && ctx.doctorId) where.doctorId = ctx.doctorId;
        else if (args.doctorName) where.doctorName = { contains: String(args.doctorName), mode: 'insensitive' };

        const rows = await prisma.appointment.findMany({
            where,
            orderBy: [{ date: 'asc' }, { time: 'asc' }],
            take: 100,
            select: { date: true, time: true, doctorName: true, type: true, status: true, patientName: true },
        });

        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

        return {
            jami: rows.length,
            status_kesimida: byStatus,
            qabullar: rows.slice(0, 40).map((r: any) => ({
                sana: r.date,
                vaqt: r.time,
                shifokor: r.doctorName,
                bemor: maskName(r.patientName?.split(' ')[0], r.patientName?.split(' ').slice(1).join(' ')),
                turi: r.type,
                status: r.status,
            })),
            izoh: rows.length > 40 ? 'Faqat birinchi 40 tasi ko\'rsatildi.' : undefined,
        };
    },

    get_revenue: async (args, ctx) => {
        const range = { gte: String(args.dateFrom), lte: String(args.dateTo) };

        const [txs, expenses] = await Promise.all([
            prisma.transaction.findMany({
                where: { clinicId: ctx.clinicId, date: range, status: 'Paid' },
                select: { amount: true, type: true, service: true },
            }),
            prisma.expense.findMany({
                where: { clinicId: ctx.clinicId, date: range },
                select: { amount: true, category: true },
            }),
        ]);

        let kassaga_kirgan = 0;   // haqiqiy pul oqimi
        let umumiy_aylanma = 0;   // ko'rsatilgan xizmatlar hajmi
        const usul_kesimida: Record<string, number> = {};

        for (const t of txs) {
            umumiy_aylanma += t.amount;
            if (isMoneyIn(t.type)) kassaga_kirgan += t.amount;
            usul_kesimida[t.type || 'Noma\'lum'] = fmt((usul_kesimida[t.type || 'Noma\'lum'] || 0) + t.amount);
        }

        let xarajat = 0;
        const xarajat_kesimida: Record<string, number> = {};
        for (const e of expenses) {
            xarajat += e.amount;
            xarajat_kesimida[e.category] = fmt((xarajat_kesimida[e.category] || 0) + e.amount);
        }

        return {
            davr: `${args.dateFrom} — ${args.dateTo}`,
            kassaga_kirgan: fmt(kassaga_kirgan),
            umumiy_aylanma: fmt(umumiy_aylanma),
            xarajat: fmt(xarajat),
            sof: fmt(kassaga_kirgan - xarajat),
            tolovlar_soni: txs.length,
            usul_kesimida,
            xarajat_kesimida,
            izoh:
                'kassaga_kirgan — haqiqatda tushgan pul. umumiy_aylanma bunga qo\'shimcha ' +
                'ravishda avansdan yechilgan (Balance) to\'lovlarni ham o\'z ichiga oladi, ' +
                'ular kassaga yangi pul keltirmaydi. Summalar so\'mda.',
        };
    },

    get_debtors: async (args, ctx) => {
        const limit = clampLimit(args.limit, 10, 50);
        const rows = await prisma.patient.findMany({
            where: { clinicId: ctx.clinicId, balance: { lt: 0 }, status: 'Active' },
            orderBy: { balance: 'asc' },
            take: limit,
            select: { firstName: true, lastName: true, phone: true, balance: true, lastVisit: true },
        });
        const jami = rows.reduce((s: number, r: any) => s + Math.abs(r.balance || 0), 0);
        return {
            topildi: rows.length,
            jami_qarz: fmt(jami),
            bemorlar: rows.map((r: any) => ({
                bemor: maskName(r.firstName, r.lastName),
                telefon: maskPhone(r.phone),
                qarz: fmt(Math.abs(r.balance || 0)),
                oxirgi_tashrif: r.lastVisit,
            })),
            izoh: 'Summalar so\'mda. Faqat faol bemorlar.',
        };
    },

    get_doctor_stats: async (args, ctx) => {
        const range = { gte: String(args.dateFrom), lte: String(args.dateTo) };
        const [doctors, appts, txs] = await Promise.all([
            prisma.doctor.findMany({
                where: { clinicId: ctx.clinicId },
                select: { id: true, firstName: true, lastName: true, specialty: true },
            }),
            prisma.appointment.findMany({
                where: { clinicId: ctx.clinicId, date: range },
                select: { doctorId: true, status: true },
            }),
            prisma.transaction.findMany({
                where: { clinicId: ctx.clinicId, date: range, status: 'Paid' },
                select: { doctorId: true, amount: true, type: true },
            }),
        ]);

        return {
            davr: `${args.dateFrom} — ${args.dateTo}`,
            shifokorlar: doctors.map((d: any) => {
                const mine = appts.filter((a: any) => a.doctorId === d.id);
                const tushum = txs
                    .filter((t: any) => t.doctorId === d.id && isMoneyIn(t.type))
                    .reduce((s: number, t: any) => s + t.amount, 0);
                return {
                    shifokor: maskName(d.firstName, d.lastName),
                    yonalish: d.specialty,
                    qabullar: mine.length,
                    bajarilgan: mine.filter((a: any) => a.status === 'Completed').length,
                    kelmagan: mine.filter((a: any) => a.status === 'No-Show').length,
                    bekor: mine.filter((a: any) => a.status === 'Cancelled').length,
                    tushum: fmt(tushum),
                };
            }),
            izoh: 'tushum — shifokorga biriktirilgan to\'lovlar, so\'mda. Eski yozuvlarda shifokor ko\'rsatilmagan bo\'lishi mumkin.',
        };
    },

    find_patient: async (args, ctx) => {
        const q = String(args.query || '').trim();
        if (q.length < 2) return { xato: 'Qidiruv so\'rovi juda qisqa (kamida 2 belgi).' };

        const where: any = {
            clinicId: ctx.clinicId,
            OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
            ],
        };
        if (ctx.role === 'DOCTOR' && ctx.doctorId) where.doctorId = ctx.doctorId;

        const rows = await prisma.patient.findMany({
            where,
            take: 10,
            select: {
                firstName: true, lastName: true, phone: true, balance: true,
                lastVisit: true, doctorName: true, status: true,
            },
        });

        return {
            topildi: rows.length,
            bemorlar: rows.map((r: any) => ({
                bemor: maskName(r.firstName, r.lastName),
                telefon: maskPhone(r.phone),
                balans: fmt(r.balance || 0),
                oxirgi_tashrif: r.lastVisit,
                shifokor: r.doctorName || '-',
                holat: r.status,
            })),
            izoh: rows.length === 0
                ? 'Bemor topilmadi. Ism boshqacha yozilgan bo\'lishi mumkin.'
                : 'Manfiy balans — qarz. Ismlar maxfiylik uchun qisqartirilgan.',
        };
    },

    get_low_stock: async (_args, ctx) => {
        const rows = await prisma.inventoryItem.findMany({
            where: { clinicId: ctx.clinicId },
            select: { name: true, quantity: true, minQuantity: true, unit: true },
        });
        const low = rows.filter((r: any) => r.minQuantity > 0 && r.quantity <= r.minQuantity);
        return {
            jami_pozitsiya: rows.length,
            tugayotgan: low.length,
            materiallar: low
                .sort((a: any, b: any) => (a.quantity / (a.minQuantity || 1)) - (b.quantity / (b.minQuantity || 1)))
                .slice(0, 30)
                .map((r: any) => ({
                    nom: r.name,
                    qoldiq: r.quantity,
                    minimum: r.minQuantity,
                    olchov: r.unit,
                })),
            izoh: low.length === 0 ? 'Hamma material yetarli.' : undefined,
        };
    },

    get_leads: async (args, ctx) => {
        const days = clampLimit(args.days, 30, 365);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const rows = await prisma.lead.findMany({
            where: { clinicId: ctx.clinicId, createdAt: { gte: since } },
            select: { status: true, source: true, createdAt: true, service: true },
        });

        const status_kesimida: Record<string, number> = {};
        const manba_kesimida: Record<string, number> = {};
        for (const r of rows) {
            status_kesimida[r.status] = (status_kesimida[r.status] || 0) + 1;
            manba_kesimida[r.source || 'Noma\'lum'] = (manba_kesimida[r.source || 'Noma\'lum'] || 0) + 1;
        }

        // 7 kundan oshgan va hali "New" holatidagilar — e'tiborsiz qolgan lidlar.
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const sovigan = rows.filter((r: any) => r.status === 'New' && r.createdAt < weekAgo).length;

        return {
            davr_kun: days,
            jami: rows.length,
            status_kesimida,
            manba_kesimida,
            javobsiz_eski_lidlar: sovigan,
            izoh: sovigan > 0
                ? `${sovigan} ta lid 7 kundan beri "New" holatida — ular bilan bog'lanilmagan.`
                : undefined,
        };
    },
};

/**
 * Tool'ni bajaradi. Rol tekshiruvi bu yerda QAYTA amalga oshiriladi —
 * ro'yxatdagi filtrga tayanib qolmaymiz, chunki model mavjud bo'lmagan
 * tool nomini o'ylab topishi mumkin.
 */
export const runTool = async (
    name: string,
    args: any,
    ctx: ToolContext
): Promise<any> => {
    const def = TOOL_DEFS.find(t => t.name === name);
    if (!def) return { xato: `Noma'lum tool: ${name}` };
    if (!def.roles.includes(ctx.role)) {
        return { xato: 'Bu ma\'lumotga sizning rolingizda ruxsat yo\'q.' };
    }
    if (!ctx.clinicId) {
        return { xato: 'Klinika aniqlanmadi.' };
    }
    try {
        return await IMPL[name](args || {}, ctx);
    } catch (e: any) {
        console.error(`[AI:tool] ${name} xatolik:`, e.message);
        return { xato: 'Ma\'lumotni olishda xatolik yuz berdi.' };
    }
};
