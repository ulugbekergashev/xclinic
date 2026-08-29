/* SOTUVCHI VOSITASI — aktivatsiya va parol tiklash kaliti.
 *
 * Xaridor dasturni birinchi marta ochganda sozlash ekranida MASHINA
 * IDENTIFIKATORI ko'rinadi. U shu kodni sizga yuboradi, siz shu skript
 * bilan kalit yasab qaytarasiz.
 *
 * Kalit `SHA256(machineId + maxfiy_tuz)` dan olinadi, ya'ni u FAQAT
 * o'sha kompyuterda ishlaydi. Nusxa ko'chirilgan dastur ochilmaydi.
 *
 * Ikkita kalit turi bor va ular BOSHQA-BOSHQA tuzdan hisoblanadi:
 *   · aktivatsiya — dasturni ishga tushirish uchun
 *   · tiklash     — admin parolini unutganda
 * Ajratilganining sababi: aktivatsiya kaliti xaridorda doim turadi.
 * Agar u bir xil bo'lganida, xaridor o'sha kalit bilan admin parolini
 * ham almashtira olardi.
 *
 * Ishga tushirish:
 *   cd backend
 *   npx ts-node --transpile-only scripts/generateKey.ts <MASHINA-ID>
 *   npx ts-node --transpile-only scripts/generateKey.ts <MASHINA-ID> --recovery
 *
 * DIQQAT: `licenseService.ts` dagi tuzlarni hech kimga bermang va
 * ommaviy repozitoriyga chiqarmang — ular chiqsa himoya ma'nosini
 * yo'qotadi.
 */
import { generateExpectedKey, generateRecoveryKey } from '../licenseService';

const arg = process.argv[2];
const wantsRecovery = process.argv.includes('--recovery');

if (!arg || arg.startsWith('--')) {
    console.log('');
    console.log('  Foydalanish:');
    console.log('    npx ts-node --transpile-only scripts/generateKey.ts <MASHINA-ID>');
    console.log('    npx ts-node --transpile-only scripts/generateKey.ts <MASHINA-ID> --recovery');
    console.log('');
    console.log('  Mashina identifikatorini xaridor sozlash ekranidan nusxa oladi.');
    console.log('');
    process.exit(1);
}

const machineId = arg.trim();

/* Identifikator qisqartirilgan ko'rinishda («a1b2c3d4…») yuborilgan
   bo'lsa, undan kalit hisoblab bo'lmaydi — natija jimgina noto'g'ri
   chiqardi va «kalit ishlamayapti» degan chalkashlik boshlanardi. */
if (machineId.includes('…') || machineId.includes('...')) {
    console.error('\n  ✗ Identifikator QISQARTIRILGAN ko\'rinishda yuborilgan.');
    console.error('    Xaridordan to\'liq kodni so\'rang — sozlash ekranidagi');
    console.error('    «nusxa olish» tugmasi to\'lig\'ini beradi.\n');
    process.exit(1);
}

const key = wantsRecovery ? generateRecoveryKey(machineId) : generateExpectedKey(machineId);

console.log('');
console.log('  ┌────────────────────────────────────────────────────────┐');
console.log(`  │  ${wantsRecovery ? 'PAROL TIKLASH KALITI' : 'AKTIVATSIYA KALITI  '}                                  │`);
console.log('  └────────────────────────────────────────────────────────┘');
console.log('');
console.log('  Mashina:  ' + machineId);
console.log('  Kalit:    ' + key);
console.log('');
if (!wantsRecovery) {
    console.log('  Xaridor buni sozlash ekranidagi «Aktivatsiya kaliti»');
    console.log('  maydoniga kiritadi.');
} else {
    console.log('  Bu kalit FAQAT admin parolini tiklash uchun.');
}
console.log('');
