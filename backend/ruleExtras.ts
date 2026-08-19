/**
 * Qoidaning qo'shimcha sozlamalari (segment + jadval).
 *
 * NEGA ALOHIDA JADVALDA: AutomationRule ga yangi ustun qo'shish migratsiya
 * talab qiladi, deploy pipeline'da esa `prisma migrate deploy` yo'q va
 * migratsiya tarixi allaqachon haqiqatdan uzilgan (12 jadval vs 33 model).
 * Ustun qo'shib deploy qilsak, Prisma bazada yo'q ustunni so'rab, butun modul
 * qulaydi. Shuning uchun mavjud PlatformSetting kalit-qiymat jadvalidan
 * yon jadval sifatida foydalanamiz — bu BAZA UCHUN MUTLAQO XAVFSIZ.
 *
 * Yetimlarga qarshi: qoida o'chirilganda yozuv ham o'chiriladi (deleteExtras).
 *
 * Keyinchalik haqiqiy ustun qo'shilsa, ma'lumot bir martalik skript bilan
 * ko'chiriladi — format bir xil JSON.
 */

import { prisma } from './db';
import type { AudienceSegment } from './segments';

export interface RuleSchedule {
    kind: 'daily' | 'weekly' | 'monthly';
    /** weekly uchun: 1=Dushanba ... 7=Yakshanba */
    weekday?: number;
    /** monthly uchun: 1-28 */
    dayOfMonth?: number;
    /** Toshkent vaqti bo'yicha soat (0-23) */
    hour: number;
}

export interface RuleExtras {
    segment?: AudienceSegment | null;
    schedule?: RuleSchedule | null;
}

const extrasKey = (ruleId: string) => `rule:extras:${ruleId}`;

/** Bitta qoidaning qo'shimchalari */
export async function getExtras(ruleId: string): Promise<RuleExtras> {
    try {
        const row = await prisma.platformSetting.findUnique({ where: { key: extrasKey(ruleId) } });
        if (!row?.value) return {};
        return JSON.parse(row.value) as RuleExtras;
    } catch (err) {
        console.error(`[RuleExtras] ${ruleId} o'qishda xatolik:`, err);
        return {};
    }
}

/** Ko'p qoidaning qo'shimchalari — dvigatel N+1 so'rov qilmasligi uchun */
export async function getExtrasMap(ruleIds: string[]): Promise<Map<string, RuleExtras>> {
    const map = new Map<string, RuleExtras>();
    if (ruleIds.length === 0) return map;
    try {
        const rows = await prisma.platformSetting.findMany({
            where: { key: { in: ruleIds.map(extrasKey) } },
        });
        for (const row of rows as any[]) {
            const ruleId = row.key.replace('rule:extras:', '');
            try {
                map.set(ruleId, row.value ? JSON.parse(row.value) : {});
            } catch {
                map.set(ruleId, {});
            }
        }
    } catch (err) {
        console.error('[RuleExtras] ommaviy o\'qishda xatolik:', err);
    }
    return map;
}

export async function saveExtras(ruleId: string, extras: RuleExtras): Promise<void> {
    const key = extrasKey(ruleId);
    const value = JSON.stringify({
        segment: extras.segment ?? null,
        schedule: extras.schedule ?? null,
    });
    await prisma.platformSetting.upsert({
        where: { key },
        update: { value, updatedAt: new Date() },
        create: { key, value },
    });
}

/** Qoida o'chirilganda chaqiriladi — yetim yozuv qolmasligi uchun */
export async function deleteExtras(ruleId: string): Promise<void> {
    await prisma.platformSetting
        .delete({ where: { key: extrasKey(ruleId) } })
        .catch(() => { /* yo'q bo'lsa muammo emas */ });
}

/**
 * Jadval bo'yicha qoida hozir ishlashi kerakmi va qaysi davr uchun.
 * Davr kaliti takrorlanmaslik (dedupe) uchun ishlatiladi.
 * Ishlamasligi kerak bo'lsa null qaytaradi.
 */
export function schedulePeriodKey(schedule: RuleSchedule, tashkentNow: Date): string | null {
    if (tashkentNow.getUTCHours() !== schedule.hour) return null;

    const y = tashkentNow.getUTCFullYear();
    const m = String(tashkentNow.getUTCMonth() + 1).padStart(2, '0');
    const d = String(tashkentNow.getUTCDate()).padStart(2, '0');

    if (schedule.kind === 'daily') return `${y}-${m}-${d}`;

    if (schedule.kind === 'weekly') {
        // getUTCDay(): 0=Yakshanba. Bizda 1=Dushanba ... 7=Yakshanba
        const dow = tashkentNow.getUTCDay() === 0 ? 7 : tashkentNow.getUTCDay();
        if (dow !== (schedule.weekday || 1)) return null;
        return `${y}-${m}-${d}`; // kunlik kalit yetarli — haftada bir kun mos keladi
    }

    if (schedule.kind === 'monthly') {
        if (tashkentNow.getUTCDate() !== (schedule.dayOfMonth || 1)) return null;
        return `${y}-${m}`;
    }

    return null;
}
