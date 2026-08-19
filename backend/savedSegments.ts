/**
 * Saqlangan segmentlar — bir marta yig'ilgan auditoriyani qayta ishlatish.
 *
 * "8 mart — ayollar" har yili qaytadan yig'ilmasin: bir marta saqlanadi va
 * keyin ham qo'lda yuborishda, ham jadval bo'yicha qoidada tanlanadi.
 *
 * NEGA MAVJUD JADVALDA: yangi jadval qo'shish migratsiya talab qiladi, deploy
 * pipeline'da esa `prisma migrate deploy` yo'q va migratsiya tarixi haqiqatdan
 * uzilgan. Shuning uchun PlatformSetting kalit-qiymat jadvalidan foydalanamiz —
 * bu BAZA UCHUN MUTLAQO XAVFSIZ, sxema o'zgarmaydi.
 *
 * Klinika bo'yicha bitta yozuv: `clinic:segments:<clinicId>` -> JSON massiv.
 */

import { prisma } from './db';
import type { AudienceSegment } from './segments';

export interface SavedSegment {
    id: string;
    name: string;
    segment: AudienceSegment;
    createdAt: string;
}

const key = (clinicId: string) => `clinic:segments:${clinicId}`;

export async function listSegments(clinicId: string): Promise<SavedSegment[]> {
    try {
        const row = await prisma.platformSetting.findUnique({ where: { key: key(clinicId) } });
        if (!row?.value) return [];
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error(`[SavedSegments] ${clinicId} o'qishda xatolik:`, err);
        return [];
    }
}

async function write(clinicId: string, list: SavedSegment[]): Promise<void> {
    const k = key(clinicId);
    const value = JSON.stringify(list);
    await prisma.platformSetting.upsert({
        where: { key: k },
        update: { value, updatedAt: new Date() },
        create: { key: k, value },
    });
}

/** Nom bo'yicha ustiga yozadi — bir xil nomli ikkita segment paydo bo'lmasin */
export async function saveSegment(clinicId: string, name: string, segment: AudienceSegment): Promise<SavedSegment> {
    const list = await listSegments(clinicId);
    const trimmed = name.trim();
    const existing = list.find(s => s.name.toLowerCase() === trimmed.toLowerCase());

    if (existing) {
        existing.segment = segment;
        await write(clinicId, list);
        return existing;
    }

    const created: SavedSegment = {
        id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        segment,
        createdAt: new Date().toISOString(),
    };
    list.unshift(created);
    // Cheklov: cheksiz o'smasin
    await write(clinicId, list.slice(0, 50));
    return created;
}

export async function deleteSegment(clinicId: string, id: string): Promise<void> {
    const list = await listSegments(clinicId);
    await write(clinicId, list.filter(s => s.id !== id));
}
