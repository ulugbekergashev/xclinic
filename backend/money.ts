/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — pul bilan ishlashning YAGONA joyi.

   MUAMMO. `round()` funksiyasi loyihada OLTI marta alohida yozilgan edi va
   aniqligi bir xil emasdi: `billing.ts`, `clinical.ts`, `inpatient.ts`,
   `payroll.ts`, `reports.ts` da ikki xona (`*100`), `inventory.ts` da esa uch
   xona (`*1000`). Ya'ni bitta summa ikki modулda ikki xil yaxlitlanishi
   mumkin edi, va bu farq hisobotda "1 so'm yo'qoldi" bo'lib chiqardi.

   O'ZBEK SO'MI — BUTUN SON. Tiyin muomaladan chiqqan. Kasr faqat ikki joydan
   paydo bo'ladi: foizli chegirma va proportsional taqsimot. Ikkalasini ham
   YOZISHDAN OLDIN butun songa keltiramiz — shunda bazada hech qachon kasrli
   pul bo'lmaydi.

   OMBOR MIQDORI BOSHQA MASALA: 0.5 ampula, 2.5 ml — bu real qiymatlar,
   shuning uchun u uch xonada qoladi va ALOHIDA funksiya bilan ishlanadi.
   ───────────────────────────────────────────────────────────────────────────── */

/** Pul — butun so'm. Bazaga yoziladigan HAR QANDAY summa shundan o'tadi. */
export const som = (n: number): number => Math.round(Number(n) || 0);

/** Ombor miqdori — uch xona (0.5 ampula, 2.5 ml real qiymatlar). */
export const qty = (n: number): number => Math.round((Number(n) || 0) * 1000) / 1000;

/** Foiz — bir xona (12.5% real, 12.53% ma'nosiz). */
export const pct = (n: number): number => Math.round((Number(n) || 0) * 10) / 10;

/**
 * Summani og'irliklarga qarab BUTUN songa taqsimlaydi.
 *
 * NIMA UCHUN ALOHIDA FUNKSIYA. Har qismni alohida yaxlitlash qismlar
 * yig'indisini butunga teng qilmaydi:
 *
 *     100 000 ni uchga: har biri 33 333 → yig'indi 99 999, bitta so'm yo'qoldi.
 *
 * Kassada bu shunday ko'rinadi: chek 100 000, lekin qatorlarga yozilgani
 * 99 999 — va yaxlitlik tekshiruvi (7.5) buni "buzilish" deb ko'rsatadi.
 *
 * Yechim — ENG KATTA QOLDIQ usuli: avval hamma qismni pastga yaxlitlaymiz,
 * qolgan so'mlarni esa kasr qismi eng katta bo'lganlarga bittadan tarqatamiz.
 * Yig'indi HAR DOIM `total` ga teng bo'ladi.
 */
export function splitProportionally(total: number, weights: number[]): number[] {
    const t = som(total);
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!(sum > 0) || weights.length === 0) return weights.map(() => 0);

    const exact = weights.map((w) => (w / sum) * t);
    const floors = exact.map((x) => Math.floor(x));
    let left = t - floors.reduce((a, b) => a + b, 0);

    // Kasr qismi eng katta bo'lganlar birinchi bo'lib qo'shimcha so'm oladi
    const order = exact
        .map((x, i) => ({ i, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac);

    const out = floors.slice();
    for (let k = 0; k < order.length && left > 0; k++, left--) {
        out[order[k].i] += 1;
    }
    return out;
}

/** Ikki summa amalda tengmi (kasrli meros yozuvlar uchun bardosh) */
export const sameMoney = (a: number, b: number): boolean => Math.abs((a || 0) - (b || 0)) < 0.001;
