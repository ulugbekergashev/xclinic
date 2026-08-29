/* TOZA BEMORLAR — namoyish uchun (o'rganish maqsadida).
 *
 * NIMA UCHUN KERAK. `demoSeed.ts` har bir bemorga tashrif, tashxis,
 * allergiya va tahlil qo'shadi — ya'ni bazadagi HAR bir bemorning
 * tarixi to'la. Natijada qabul ekranidagi «Avval nima bo'lgan» paneli
 * doim to'lib turadi va tizim bilan tanishayotgan odam BOSHIDAN,
 * bo'sh kartadan boshlab ko'ra olmaydi.
 *
 * Bu skript ataylab HECH NARSASI YO'Q bemorlar yaratadi: tashrifi yo'q,
 * tashxisi yo'q, tahlili yo'q, allergiyasi yo'q. Ular ustida butun
 * zanjirni noldan yurib ko'rish mumkin.
 *
 * Qayta ishga tushirilsa yangi yozuv yaratmaydi — telefon bo'yicha
 * mavjudini topadi (demoSeed dagi xatoning takrorlanmasligi uchun).
 *
 * Ishga tushirish: cd backend && npx ts-node --transpile-only scripts/seedCleanPatients.ts
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

/* Telefon raqamlari ataylab «tanib olinadigan» — 900 00 01..04.
   Namoyish paytida qidiruvga `000001` yozilsa darhol chiqadi. */
const CLEAN = [
    { firstName: 'Dilnoza', lastName: 'Yo\u2018ldosheva', gender: 'Female', dob: '1995-03-14', phone: '+998901000001' },
    { firstName: 'Sanjar',  lastName: 'Aliyev',          gender: 'Male',   dob: '1988-11-02', phone: '+998901000002' },
    { firstName: 'Zilola',  lastName: 'Karimova',        gender: 'Female', dob: '2001-06-25', phone: '+998901000003' },
    { firstName: 'Otabek',  lastName: 'Sobirov',         gender: 'Male',   dob: '1979-01-09', phone: '+998901000004' },
];

async function main() {
    const clinic = await prisma.clinic.findFirst();
    if (!clinic) throw new Error('Klinika topilmadi');

    const token = jwt.sign(
        { role: 'CLINIC_ADMIN', name: 'seed', clinicId: clinic.id, typ: 'access' },
        readJwtSecret(), { expiresIn: '2h' },
    );

    for (const p of CLEAN) {
        /* Server telefonni NORMALLASHTIRIB saqlaydi: `+998901000001`
           bazaga `998901000001` bo'lib tushadi. Kiritilgan shakl bo'yicha
           izlash hech qachon topmaydi va skript har safar dublikat
           yaratardi — shuning uchun oxirgi 9 raqam bo'yicha izlanadi. */
        const tail = p.phone.replace(/\D/g, '').slice(-9);
        const already = await prisma.patient.findFirst({
            where: { clinicId: clinic.id, phone: { contains: tail } },
            select: { id: true, firstName: true, lastName: true },
        });
        if (already) {
            console.log(`  = ${already.lastName} ${already.firstName} — allaqachon bor (id ${already.id})`);
            continue;
        }

        const r = await fetch(BASE + '/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ...p, medicalHistory: '', address: '' }),
        });
        const text = await r.text();
        if (r.status === 200 || r.status === 201) {
            let id: any = '?';
            try { id = JSON.parse(text).id; } catch { /* javob shakli muhim emas */ }
            console.log(`  + ${p.lastName} ${p.firstName} — yaratildi (id ${id})`);
        } else {
            console.log(`  ! ${p.lastName} ${p.firstName} — ${r.status} ${text.slice(0, 140)}`);
        }
    }

    /* Nazorat: haqiqatan TOZA ekaniga ishonch hosil qilamiz.
       Yaratilgan bemorda tashrif/tashxis chiqsa — skript aybdor emas,
       demak boshqa narsa ularga tegib ketgan, va buni bilish kerak. */
    console.log('\nNazorat — har birida nechta yozuv bor:');
    for (const p of CLEAN) {
        const tail = p.phone.replace(/\D/g, '').slice(-9);
        const pt = await prisma.patient.findFirst({ where: { clinicId: clinic.id, phone: { contains: tail } }, select: { id: true } });
        if (!pt) { console.log(`  ? ${p.lastName} — topilmadi`); continue; }
        const [visits, diags, orders] = await Promise.all([
            prisma.visit.count({ where: { patientId: pt.id } }),
            prisma.patientDiagnosis.count({ where: { patientId: pt.id } }),
            prisma.labOrder.count({ where: { patientId: pt.id } }),
        ]);
        const clean = visits === 0 && diags === 0 && orders === 0;
        console.log(`  ${clean ? 'TOZA ' : 'TOZA EMAS'} ${p.lastName} ${p.firstName} · ${p.phone} · tashrif ${visits}, tashxis ${diags}, tahlil ${orders}`);
    }
}

main().catch((e) => { console.error('Xatolik:', e.message); process.exit(1); })
      .finally(() => prisma.$disconnect());
