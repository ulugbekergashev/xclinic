/**
 * Auditoriya segmenti — "kimga yuborish" savoliga YAGONA javob.
 *
 * Segment — shartlar ro'yxati. Har bir shart qaysi maydon bo'yicha ekanini
 * ./segmentFields.ts reyestri hal qiladi, ya'ni yangi filtr qo'shish uchun bu
 * fayl o'zgarmaydi.
 *
 * Qarz bir joyda hisoblanadi (buildDebtMap): "qarzdorlar" filtri ham, xabardagi
 * {qarz} summasi ham shundan keladi. Ilgari ular ikki xil edi.
 *
 * MUHIM: BAZA SXEMASINI O'ZGARTIRMAYDI — faqat mavjud ustunlardan o'qiydi.
 */

import { prisma } from './db';
import { getField, SEGMENT_FIELDS, FieldContext, neededAggregates } from './segmentFields';
import { buildAggregates, AggregateKey } from './segmentAggregates';
import { normalizeUzPhone } from './smsService';

/**
 * Shart — yo maydon sharti (field/op/value), yo qavs ichidagi guruh
 * (match/conditions). Guruh oddiy shartning o'rnida tura oladi, shuning uchun
 * "ayol VA (VIP YOKI implant)" kabi ifodalar tuziladi.
 */
export interface SegmentCondition {
    field?: string;
    op?: string;
    value?: any;
    match?: 'all' | 'any';
    conditions?: SegmentCondition[];
}

const isGroup = (c: SegmentCondition): boolean => Array.isArray(c.conditions);

export interface AudienceSegment {
    /** 'all' — barcha shartlar bajarilsin (VA), 'any' — bittasi yetarli (YOKI) */
    match?: 'all' | 'any';
    conditions?: SegmentCondition[];

    // ── Eski format (moslik uchun; o'qishda avtomatik shartlarga aylanadi) ──
    doctorId?: string | null;
    status?: 'Active' | 'All';
    inactiveMonths?: number | null;
    includeNeverVisited?: boolean;
    debtors?: boolean;
    birthdayToday?: boolean;
    birthdayMonth?: boolean;
}

export const EMPTY_SEGMENT: AudienceSegment = {
    match: 'all',
    conditions: [{ field: 'status', op: 'eq', value: 'Active' }],
};

/**
 * Eski formatdagi segmentni shartlar ro'yxatiga aylantiradi.
 * Saqlangan qoidalar eski formatda bo'lgani uchun kerak — migratsiyasiz o'tadi.
 */
export function normalizeSegment(seg?: AudienceSegment | null): { match: 'all' | 'any'; conditions: SegmentCondition[] } {
    if (!seg) return { match: 'all', conditions: [...(EMPTY_SEGMENT.conditions || [])] };

    // Yangi format
    if (Array.isArray(seg.conditions)) {
        return { match: seg.match === 'any' ? 'any' : 'all', conditions: seg.conditions };
    }

    // Eski format → shartlar
    const conditions: SegmentCondition[] = [];
    if (seg.status !== 'All') conditions.push({ field: 'status', op: 'eq', value: 'Active' });
    if (seg.doctorId) conditions.push({ field: 'doctorId', op: 'eq', value: seg.doctorId });
    if (seg.inactiveMonths) {
        conditions.push({
            field: 'lastVisit',
            op: seg.includeNeverVisited ? 'before_or_never' : 'before',
            value: seg.inactiveMonths,
        });
    }
    if (seg.debtors) conditions.push({ field: 'hasDebt', op: 'is_true' });
    if (seg.birthdayToday) conditions.push({ field: 'birthdayToday', op: 'is_true' });
    if (seg.birthdayMonth) conditions.push({ field: 'birthdayMonth', op: 'eq', value: 'current' });

    return { match: 'all', conditions };
}

/**
 * Klinikaning qarz xaritasi: Pending tranzaksiyalar + faol bo'lib to'lash
 * qoldiqlari. {qarz} o'zgaruvchisi ham, "qarzi bor" filtri ham shu hisobdan.
 */
export async function buildDebtMap(clinicId: string, patientIds?: string[]): Promise<Map<string, number>> {
    const scope = patientIds && patientIds.length > 0 ? { patientId: { in: patientIds } } : {};

    const [pendingTx, activePlans] = await Promise.all([
        prisma.transaction.findMany({
            where: { clinicId, status: 'Pending', ...scope },
            select: { patientId: true, amount: true },
        }),
        prisma.installmentPlan.findMany({
            where: { clinicId, status: 'Active', ...scope },
            select: { patientId: true, totalAmount: true, totalPaid: true },
        }),
    ]);

    const debtMap = new Map<string, number>();
    for (const t of pendingTx as any[]) {
        if (!t.patientId) continue;
        debtMap.set(t.patientId, (debtMap.get(t.patientId) || 0) + t.amount);
    }
    for (const p of activePlans as any[]) {
        const remaining = Math.max(0, p.totalAmount - p.totalPaid);
        if (remaining <= 0) continue;
        debtMap.set(p.patientId, (debtMap.get(p.patientId) || 0) + remaining);
    }
    return debtMap;
}

/** Bitta shart (yoki butun guruh) bitta bemorga mos keladimi — rekursiv */
function conditionMatches(patient: any, cond: SegmentCondition, ctx: FieldContext): boolean {
    // Guruh: ichidagilarni o'z rejimi bo'yicha birlashtiramiz
    if (isGroup(cond)) {
        const kids = cond.conditions || [];
        if (kids.length === 0) return true;
        return cond.match === 'any'
            ? kids.some(k => conditionMatches(patient, k, ctx))
            : kids.every(k => conditionMatches(patient, k, ctx));
    }

    const def = cond.field ? getField(cond.field) : null;
    if (!def) return true; // noma'lum maydon — filtrlamaymiz, xabarni bloklamaymiz
    if (def.predicate) return def.predicate(patient, cond.op || def.defaultOp, cond.value, ctx);

    // where bor, lekin bu yerda JS tekshiruvi kerak ('any' rejimi yoki guruh ichida)
    return whereFallbackMatches(patient, cond);
}

/** Daraxtdagi barcha maydon shartlarini tekislab beradi (jamlanmalarni aniqlash uchun) */
function flattenFields(conditions: SegmentCondition[]): SegmentCondition[] {
    const out: SegmentCondition[] = [];
    const walk = (list: SegmentCondition[]) => {
        for (const c of list) {
            if (isGroup(c)) walk(c.conditions || []);
            else if (c.field) out.push(c);
        }
    };
    walk(conditions);
    return out;
}

/** `where` bilan ishlaydigan maydonlarning JS ekvivalenti (OR rejimi uchun) */
function whereFallbackMatches(patient: any, cond: SegmentCondition): boolean {
    const v = cond.value;
    switch (cond.field) {
        case 'status': return cond.op === 'eq' ? patient.status === v : patient.status !== v;
        case 'gender': return cond.op === 'eq' ? patient.gender === v : patient.gender !== v;
        case 'doctorId': return cond.op === 'eq' ? patient.doctorId === v : patient.doctorId !== v;
        case 'address': return String(patient.address || '').toLowerCase().includes(String(v || '').toLowerCase());
        case 'hasTelegram': return cond.op === 'is_true' ? !!patient.telegramChatId : !patient.telegramChatId;
        case 'balance': {
            const b = Number(patient.balance || 0);
            if (cond.op === 'gte') return b >= Number(v);
            if (cond.op === 'lte') return b <= Number(v);
            const [min, max] = Array.isArray(v) ? v : [v, v];
            return b >= Number(min) && b <= Number(max);
        }
        case 'registered': {
            const days = Number(v) || 0;
            const cutoff = new Date(Date.now() - days * 86400000);
            const created = new Date(patient.createdAt);
            return cond.op === 'within' ? created >= cutoff : created < cutoff;
        }
        default: return true;
    }
}

export interface ResolvedAudience {
    patients: any[];
    debtMap: Map<string, number>;
    /** Klinikadagi jami bemorlar (filtrlarsiz) */
    clinicTotal: number;
    /** Har bir shart alohida nechta bemorga mos — UI da shart yonida ko'rsatiladi */
    conditionCounts: number[];
    conditions: SegmentCondition[];
    match: 'all' | 'any';
}

/**
 * Segmentni haqiqiy bemorlar ro'yxatiga aylantiradi.
 *
 * Tez yo'l: 'all' rejimida `where` bera oladigan shartlar Prisma so'roviga
 * qo'shiladi, qolganlari JSda tekshiriladi. 'any' (YOKI) rejimida hammasi
 * JSda — chunki OR ni fragmentlarga bo'lib bo'lmaydi.
 */
export async function resolveSegment(clinicId: string, segment?: AudienceSegment | null): Promise<ResolvedAudience> {
    const { match, conditions } = normalizeSegment(segment);

    // Tez yo'l uchun where fragmentlarini yig'amiz
    const whereFragments: any[] = [];
    const jsConditions: SegmentCondition[] = [];

    for (const cond of conditions) {
        // Guruh SQLga tushmaydi — qavs ichidagi YOKI ni fragmentga bo'lib bo'lmaydi
        const def = !isGroup(cond) && cond.field ? getField(cond.field) : null;
        if (match === 'all' && def?.where) {
            const frag = def.where(cond.op || def.defaultOp, cond.value);
            if (frag) { whereFragments.push(frag); continue; }
        }
        jsConditions.push(cond);
    }

    // Jamlanmalar (to'lovlar summasi, tashriflar soni ...) — faqat shartlarda
    // ishlatilganlari hisoblanadi. Guruhlar ichidagilar ham hisobga olinadi.
    const needed = neededAggregates(flattenFields(conditions)) as Set<AggregateKey>;

    const [scoped, clinicTotal, debtMap, agg] = await Promise.all([
        prisma.patient.findMany({
            where: { clinicId, ...(whereFragments.length ? { AND: whereFragments } : {}) },
        }),
        prisma.patient.count({ where: { clinicId } }),
        buildDebtMap(clinicId),
        buildAggregates(clinicId, needed),
    ]);

    const ctx: FieldContext = {
        debtMap,
        isSendablePhone: (phone) => normalizeUzPhone(phone) !== null,
        now: new Date(),
        agg,
    };

    let patients: any[];
    if (match === 'any') {
        // Bitta shart bajarilsa yetarli; shartsiz segment — hamma
        patients = conditions.length === 0
            ? (scoped as any[])
            : (scoped as any[]).filter(p => conditions.some(c => conditionMatches(p, c, ctx)));
    } else {
        patients = (scoped as any[]).filter(p => jsConditions.every(c => conditionMatches(p, c, ctx)));
    }

    // Har bir shart YAKKA o'zi nechtaga mos — foydalanuvchi qaysi shart
    // ro'yxatni qisqartirayotganini ko'rsin
    const allPatients = await prisma.patient.findMany({ where: { clinicId } });
    const conditionCounts = conditions.map(c =>
        (allPatients as any[]).filter(p => conditionMatches(p, c, ctx)).length
    );

    return { patients, debtMap, clinicTotal, conditionCounts, conditions, match };
}

/** Segmentni odam o'qiy oladigan matnga aylantiradi */
export function describeSegment(seg?: AudienceSegment | null): string {
    const { match, conditions } = normalizeSegment(seg);
    if (conditions.length === 0) return 'Barcha bemorlar';

    const describeOne = (c: SegmentCondition): string => {
        if (isGroup(c)) {
            const inner = (c.conditions || []).map(describeOne).join(c.match === 'any' ? ' YOKI ' : ' VA ');
            return inner ? `(${inner})` : '';
        }
        const def = c.field ? getField(c.field) : null;
        if (!def) return c.field || '';
        const op = def.operators.find(o => o.id === c.op);
        const opLabel = op?.label || c.op || '';
        if (op?.arity === 0) return `${def.label}: ${opLabel}`;
        const valLabel = def.options?.find(o => o.value === String(c.value))?.label ?? c.value;
        return `${def.label} ${opLabel} ${Array.isArray(valLabel) ? valLabel.join('–') : valLabel}`;
    };

    const parts = conditions.map(describeOne).filter(Boolean);

    return parts.join(match === 'any' ? ' YOKI ' : ' · ');
}

export { SEGMENT_FIELDS };
