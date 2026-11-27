/* ─────────────────────────────────────────────────────────────────────────────
   CODE128 SHTRIX-KOD — faqat raqamli kod uchun (C to'plami).

   Probirka kodi faqat raqam (2611260014): skaner klaviatura bo'lib yozadi va
   kirill/o'zbek tartibida harfni buzadi. C to'plamida har IKKI raqam bitta
   belgi — kod ixcham chiqadi va 40 mm yorliqqa sig'adi.

   Tashqi kutubxonasiz: jadval — Code128 standartining 107 naqshi (bar/oraliq
   kengliklari, modulda). Jadvalning to'g'riligini sinov tekshiradi: har
   belgi 11 modul, chiziqlar yig'indisi juft, hamma naqsh har xil
   (`backend/tests/barcode.test.ts`).

   Brauzersiz ishlaydi: natija — SVG matni, DOM kerak emas.
   ───────────────────────────────────────────────────────────────────────────── */

/** Code128 naqshlari: qiymat → 6 ta kenglik (bar, oraliq, bar, oraliq, bar, oraliq) */
export const CODE128_PATTERNS: readonly string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232',
];
/** To'xtash belgisi — 7 kenglik (13 modul) */
export const CODE128_STOP = '2331112';
const START_C = 105;

/** Faqat juft sonli raqamlar qabul qilinadi (C to'plami) */
export function isCode128CText(text: string): boolean {
    return /^(\d\d)+$/.test(text);
}

/** Belgilar qiymatlari: start, juftlar, nazorat yig'indisi (stop alohida) */
export function code128CValues(text: string): number[] {
    if (!isCode128CText(text)) throw new Error('Code128-C: faqat juft sonli raqam');
    const pairs: number[] = [];
    for (let i = 0; i < text.length; i += 2) pairs.push(Number(text.slice(i, i + 2)));
    const checksum = pairs.reduce((sum, v, i) => sum + v * (i + 1), START_C) % 103;
    return [START_C, ...pairs, checksum];
}

/** Kengliklar ketma-ketligi (bar bilan boshlanadi, oraliq bilan almashadi) */
export function code128CWidths(text: string): number[] {
    const widths: number[] = [];
    for (const v of code128CValues(text)) for (const ch of CODE128_PATTERNS[v]) widths.push(Number(ch));
    for (const ch of CODE128_STOP) widths.push(Number(ch));
    return widths;
}

/** Shtrix-kodning to'liq kengligi, modulda (tinch zonasiz) */
export const code128CModules = (text: string): number =>
    code128CWidths(text).reduce((s, w) => s + w, 0);

/**
 * SVG matni. O'lchamlar mm da — bosmada aniq chiqadi. `moduleMm` — eng ingichka
 * chiziq: 203 dpi printerda kamida 0.25 mm (2 nuqta). Tinch zona — 10 modul.
 */
export function code128CSvg(text: string, opts: { moduleMm: number; heightMm: number }): string {
    const widths = code128CWidths(text);
    const quiet = 10;
    const total = widths.reduce((s, w) => s + w, 0) + quiet * 2;
    let x = quiet;
    const rects: string[] = [];
    widths.forEach((w, i) => {
        if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="1"/>`);
        x += w;
    });
    const wMm = +(total * opts.moduleMm).toFixed(3);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${opts.heightMm}mm" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}
