/* Namoyish uchun TASHXISLAR (S2.2 davomi).
 *
 * NIMA UCHUN ALOHIDA SKRIPT. `demoSeed.ts` tashxis qo'ymaydi — u
 * yozilganda `ICD10Code` jadvali bo'sh edi (bitta qator), ya'ni qo'yadigan
 * narsa yo'q edi. Migratsiya 0030 spravochnikni 345 ta kod bilan
 * to'ldirgach, bu bo'shliq ko'rinib qoldi: bemor kartasida «Tashxislar»
 * bo'limi bo'sh, qabul yakunlashda esa nazorat har doim «tashxis yo'q»
 * deydi (S3.7).
 *
 * TASHXIS BO'LIMGA MOS TANLANADI. Kardiologiya tashrifiga tasodifiy
 * ginekologik kod qo'yish namoyishni yolg'on qiladi — audit aynan shunday
 * narsani topgan edi («xirurgning eng ko'p xizmati Pediatr
 * konsultatsiyasi»).
 *
 * HTTP orqali: `POST /api/diagnoses` ruxsat va bog'lanishlarni tekshiradi.
 *
 * Ishga tushirish: cd backend && npx ts-node --transpile-only scripts/seedDiagnoses.ts
 *                  (server ishlab turishi shart)
 */
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SEED_BASE || 'http://localhost:3001';
const prisma = new PrismaClient();

const USER_DATA_PATH = (process.env.ELECTRON_USER_DATA_PATH || __dirname).replace(/['"]/g, '').trim();

function readJwtSecret(): string {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    for (const dir of [path.join(__dirname, '..'), USER_DATA_PATH]) {
        const k = path.join(dir, 'jwt.key');
        if (fs.existsSync(k)) return fs.readFileSync(k, 'utf8').trim();
    }
    throw new Error('JWT kaliti topilmadi');
}

/* Bo'lim → shu bo'limda haqiqatan qo'yiladigan MKB-10 kodlari.
   Ro'yxat `icd10Data.ts` dagi kodlardan olingan. */
const BY_DEPARTMENT: Record<string, string[]> = {
    Terapiya: ['I10', 'J06.9', 'K29.5', 'E11.9', 'D50.9', 'R51', 'J20.9', 'M54.5', 'K21.9', 'E78.5'],
    Kardiologiya: ['I10', 'I25.9', 'I20.8', 'I48', 'I50.0', 'I11.9', 'I49.9', 'E78.0'],
    Nevrologiya: ['G43.9', 'G44.2', 'M42.1', 'M54.2', 'G47.0', 'G56.0', 'M51.1', 'G90.9'],
    Ginekologiya: ['N76.0', 'N86', 'N83.2', 'N92.6', 'N94.6', 'N80.9', 'D25.9', 'N95.1'],
    Pediatriya: ['J06.9', 'J03.9', 'B01.9', 'A09', 'J35.2', 'B80', 'D50.9', 'Z23'],
    Xirurgiya: ['K40.9', 'K42.9', 'I84.9', 'L02.9', 'K35.8', 'S61.9', 'K60.2', 'L60.0'],
    LOR: ['J35.0', 'H66.0', 'J01.0', 'J34.2', 'H60.9', 'J02.9', 'H93.1', 'J31.0'],
};

/* Bo'limi noma'lum tashrif uchun — umumiy amaliyot kodlari */
const FALLBACK = ['I10', 'J06.9', 'K29.5', 'M54.5', 'R51', 'E11.9'];

/** Surunkali deb belgilanadiganlar — bemor kartasida doimiy ro'yxatda turadi */
const CHRONIC = new Set(['I10', 'E11.9', 'E10.9', 'J44.9', 'J45.9', 'I25.9', 'N18.9', 'E03.9', 'B18.2']);

async function main() {
    const clinic = await prisma.clinic.findFirst();
    if (!clinic) throw new Error('Klinika topilmadi');

    const token = jwt.sign(
        { role: 'CLINIC_ADMIN', name: 'seed', clinicId: clinic.id, typ: 'access' },
        readJwtSecret(),
        { expiresIn: '2h' },
    );

    const call = async (method: string, url: string, body?: any) => {
        const r = await fetch(BASE + '/api' + url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await r.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 160) }; }
        return { status: r.status, data };
    };

    // Tugagan tashriflar — ularga tashxis qo'yiladi
    const visits = await prisma.visit.findMany({
        where: { clinicId: clinic.id, status: 'Completed' },
        select: { id: true, patientId: true, date: true, departmentId: true },
        orderBy: { date: 'desc' },
        take: 400,
    });

    const departments = await prisma.department.findMany({ where: { clinicId: clinic.id } });
    const depName = new Map(departments.map((d: any) => [d.id, d.name]));

    console.log(`Tugagan tashriflar: ${visits.length}`);

    let ok = 0;
    const errors: string[] = [];

    for (const v of visits) {
        if (!v.patientId) continue;

        const dep = v.departmentId ? depName.get(v.departmentId) : null;
        const pool = (dep && BY_DEPARTMENT[dep]) || FALLBACK;
        const code = pool[Math.floor(Math.random() * pool.length)];

        const r = await call('POST', '/diagnoses', {
            patientId: v.patientId,
            visitId: v.id,
            code,
            date: v.date,
            status: 'Active',
            isChronic: CHRONIC.has(code),
            notes: '',
        });

        if (r.status === 200) ok++;
        else if (errors.length < 5) errors.push(`${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
    }

    console.log(`Qo'yilgan tashxislar: ${ok}`);
    if (errors.length) {
        console.log('Xatolar:');
        errors.forEach((e) => console.log('  · ' + e));
    }

    const total = await prisma.patientDiagnosis.count({ where: { clinicId: clinic.id } });
    const chronic = await prisma.patientDiagnosis.count({ where: { clinicId: clinic.id, isChronic: true } });
    console.log(`Bazada jami: ${total} tashxis (${chronic} tasi surunkali)`);
}

main()
    .catch((e) => { console.error('Xatolik:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
