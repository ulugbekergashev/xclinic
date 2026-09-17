/* ─────────────────────────────────────────────────────────────────────────────
   CSV KATAGI — YAGONA QOIDA.

   Ikki xavf:
     1. Ajratgich va qo'shtirnoq. Ism yoki manzilda vergul bo'lsa, qator
        ustunlarga noto'g'ri bo'linadi. Shuning uchun HAR maydon qo'shtirnoq
        ichida, ichidagi `"` esa ikkilanadi.
     2. Formula in'ektsiyasi. Bemor ismi `=HYPERLINK(...)` yoki `+cmd|...`
        bo'lsa, Excel faylni ochganda uni FORMULA sifatida bajaradi. Bu
        foydalanuvchi kiritgan matn, ya'ni hujum yo'li. `=`, `+`, `-`, `@`,
        tab yoki CR bilan boshlangan satr oldiga `'` qo'yiladi — Excel uni
        oddiy matn deb ko'rsatadi.

   Raqam turidagi qiymat tegilmaydi: `-5` formula emas. Telefon raqami
   (`+998 90 123-45-67`) ham: unda faqat raqam, bo'shliq, qavs va chiziqcha —
   funksiya chaqira olmaydi, `'` esa har qatorda ko'zga tashlanardi.
   ───────────────────────────────────────────────────────────────────────────── */

export function csvCell(v: unknown): string {
    if (v === null || v === undefined) return '""';
    let s = String(v);
    const phoneLike = /^[+-]?[\d\s()-]+$/.test(s);
    if (typeof v !== 'number' && !phoneLike && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}

/** Bir qator — kataklar `sep` bilan ajratiladi */
export const csvRow = (cells: unknown[], sep = ','): string => cells.map(csvCell).join(sep);
