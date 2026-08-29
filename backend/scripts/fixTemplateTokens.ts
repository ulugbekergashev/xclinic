/* MAVJUD SHABLONLARDAGI NOTO'G'RI TOKENLARNI TUZATISH.
 *
 * MUAMMO. `demoSeed.ts` shablonlarni `{ism}` va `{summa}` tokenlari
 * bilan yaratgan. Ular `processTemplate` (backend/server.ts) qo'llab-
 * quvvatlaydigan ro'yxatda YO'Q, ya'ni almashtirilmaydi va bemor
 * «Hurmatli {ism}» degan SMS oladi.
 *
 * Seed tuzatildi, lekin bazada ALLAQACHON yaratilgan shablonlar
 * qolib ketadi — shuning uchun bu skript.
 *
 * Ishga tushirish: cd backend && npx ts-node --transpile-only scripts/fixTemplateTokens.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* `processTemplate` dagi ro'yxat bilan bir xil bo'lishi shart. */
const FIX: [RegExp, string][] = [
    [/\{ism\}/g, '{bemor_ismi}'],
    [/\{familya\}/g, '{bemor_familyasi}'],
    [/\{summa\}/g, '{qarz}'],
    [/\{miqdor\}/g, '{qarz}'],
    [/\{doktor\}/g, '{shifokor_ismi}'],
    [/\{klinika\}/g, '{klinika_nomi}'],
];

async function main() {
    const all = await prisma.messageTemplate.findMany({ select: { id: true, name: true, text: true } });
    console.log(`Jami shablon: ${all.length}`);

    let fixed = 0;
    for (const t of all) {
        let next = t.text || '';
        for (const [re, to] of FIX) next = next.replace(re, to);
        if (next === t.text) continue;
        await prisma.messageTemplate.update({ where: { id: t.id }, data: { text: next } });
        console.log(`  ✔ ${t.name}`);
        console.log(`      oldin: ${String(t.text).slice(0, 66)}`);
        console.log(`      keyin: ${next.slice(0, 66)}`);
        fixed++;
    }
    console.log(`\nTuzatildi: ${fixed} ta`);

    /* Nazorat: qo'llab-quvvatlanmaydigan token qolmaganini tekshiramiz. */
    const KNOWN = ['bemor_ismi', 'bemor_familyasi', 'sana', 'vaqt', 'klinika_nomi',
                   'shifokor_ismi', 'qarz', 'BEMOR', 'VAQT', 'SANA', 'MIQDOR', 'KLINIKA', 'DOKTOR'];
    const after = await prisma.messageTemplate.findMany({ select: { name: true, text: true } });
    const stillBad: string[] = [];
    for (const t of after) {
        for (const m of String(t.text || '').matchAll(/\{([^}]+)\}/g)) {
            if (!KNOWN.includes(m[1])) stillBad.push(`${t.name}: {${m[1]}}`);
        }
    }
    if (stillBad.length) {
        console.log('\nHali ham nomamlum token bor:');
        stillBad.forEach(x => console.log('  · ' + x));
    } else {
        console.log('Nazorat: nomalum token qolmadi.');
    }
}

main().catch(e => { console.error('Xatolik:', e.message); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
