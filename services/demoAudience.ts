/* DEMO: «Kimga yuborish» hisobi.

   Haqiqiy dasturda auditoriyani server hisoblaydi (backend/segments.ts).
   Demoda server yo'q va ilgari bu yerda doim «14 ta, hammasi Telegram,
   bepul» qaytardi: «Ayollar» yoki «Botga ulanmagan» bosilsa ham son
   o'zgarmasdi — namoyishda filtr buzilgandek ko'rinardi.

   Bu yerda faqat demo bemorlarida BOR maydonlar baholanadi; qolganlari
   (qarz, VIP, kelmaganlar soni …) demoda «mos» deb olinadi. */
import { todayISO } from '../utils/dateUtils';
import type { AudiencePreview, AudienceSegment, MessageChannel, Patient, SegmentCondition } from '../types';

const ageOf = (dob?: string): number | null => {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
    return a;
};

const cmp = (v: number | null, op: string | undefined, target: any): boolean => {
    if (v == null) return false;
    const t = Number(target);
    switch (op) {
        case 'eq': return v === t;
        case 'gte': return v >= t;
        case 'lte': return v <= t;
        case 'gt': return v > t;
        case 'lt': return v < t;
        case 'between': return Array.isArray(target) ? v >= Number(target[0]) && v <= Number(target[1]) : true;
        default: return true;
    }
};

function matchCondition(p: Patient, c: SegmentCondition): boolean {
    if (Array.isArray(c.conditions)) return matchGroup(p, c.match, c.conditions);
    const v = c.value;
    switch (c.field) {
        case 'status': return v === 'All' || (p.status || 'Active') === v;
        case 'gender': return p.gender === v;
        case 'age': return cmp(ageOf(p.dob), c.op, v);
        case 'doctorId': return c.op === 'eq' ? p.doctorId === v : p.doctorId !== v;
        case 'hasTelegram': return c.op === 'is_false' ? !p.telegramChatId : !!p.telegramChatId;
        case 'birthdayMonth': {
            const d = p.dob ? new Date(p.dob) : null;
            return !!d && !isNaN(d.getTime()) && d.getMonth() === new Date().getMonth();
        }
        case 'lastVisit': {
            /* Server qoidasi (`backend/segmentFields.ts`, `patientVisits.ts`):
               sana satri bilan, «N kalendar oyi oldin» chegarasi. Hisobot →
               Bemorlar «Yo'qolgan» soni bilan bir xil chiqishi shart. */
            const day = /^\d{4}-\d{2}-\d{2}/.test(p.lastVisit || '') ? p.lastVisit.slice(0, 10) : null;
            if (!day) return c.op === 'before_or_never';
            const [y, mo, d] = todayISO().split('-').map(Number);
            const cut = new Date(Date.UTC(y, mo - 1, d));
            cut.setUTCMonth(cut.getUTCMonth() - (Number(v) || 0));
            const cutoff = cut.toISOString().slice(0, 10);
            return c.op === 'within' ? day > cutoff : day <= cutoff;
        }
        // Demoda ma'lumoti yo'q maydonlar — filtrni buzmaymiz
        default: return true;
    }
}

function matchGroup(p: Patient, match: 'all' | 'any' | undefined, conds: SegmentCondition[]): boolean {
    if (conds.length === 0) return true;
    return match === 'any' ? conds.some(c => matchCondition(p, c)) : conds.every(c => matchCondition(p, c));
}

export function demoAudience(
    patients: Patient[], segment: AudienceSegment, channel: MessageChannel, botConnected: boolean,
): AudiencePreview {
    const conds = segment.conditions || [];
    const matched = patients.filter(p => matchGroup(p, segment.match, conds));
    const recipients: AudiencePreview['recipients'] = [];
    const unreachableList: AudiencePreview['unreachableList'] = [];

    for (const p of matched) {
        const name = `${p.lastName} ${p.firstName}`.trim();
        const hasTg = botConnected && !!p.telegramChatId;
        let via: 'telegram' | 'sms' | null;
        if (channel === 'sms') via = p.phone ? 'sms' : null;
        else if (channel === 'telegram') via = hasTg ? 'telegram' : null;
        else via = hasTg ? 'telegram' : p.phone ? 'sms' : null;
        if (!via) {
            unreachableList.push({ id: p.id, name, reason: channel === 'telegram' ? 'Botga ulanmagan' : "Telefon raqami yo'q" });
            continue;
        }
        recipients.push({ id: p.id, firstName: p.firstName, lastName: p.lastName, phone: p.phone || '', channel: via, debt: 0 });
    }

    const viaTelegram = recipients.filter(r => r.channel === 'telegram').length;
    return {
        total: recipients.length,
        matched: matched.length,
        unreachable: unreachableList.length,
        unreachableList,
        clinicTotal: patients.length,
        conditionCounts: conds.map(c => patients.filter(p => matchCondition(p, c)).length),
        conditions: conds,
        recipients,
        recipientsTruncated: false,
        viaTelegram,
        viaSms: recipients.length - viaTelegram,
        description: 'Demo',
        patientIds: recipients.map(r => r.id),
        sample: recipients.slice(0, 3).map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, debt: 0 })),
    };
}
