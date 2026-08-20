/* ─────────────────────────────────────────────────────────────────────────────
   A4 hujjatlarni bosib chiqarish uchun umumiy asos.

   MUAMMO. Yo'llanma, tahlil natijasi va tekshiruv xulosasi — RASMIY qog'oz.
   Bemor uni qo'lida olib ketadi, boshqa klinikaga ko'rsatadi, ishxonaga
   topshiradi. Hozir dasturda bitta bosma shakl bor — kassa cheki (58 mm
   lentaga). A4 hujjat umuman yo'q (GAP-ANALYSIS, B7, B26, B33).

   NIMA UCHUN SATRLAR, REACT KOMPONENTI EMAS. Bosma oyna — alohida hujjat,
   unda ilovaning Tailwind uslublari yo'q. Uslubni har holda ichkariga yozish
   kerak, ya'ni React komponentidan foyda yo'q. Satr bilan ishlaganda esa
   qanday HTML chiqqani ko'rinib turadi.

   XAVFSIZLIK. Bemor ismi, shikoyati, xulosasi — hammasi FOYDALANUVCHI
   kiritgan matn. `esc()` dan o'tmagan qiymat bosma oynaga HTML sifatida
   tushadi. Shuning uchun bu faylda qiymat qo'yishning YAGONA yo'li — `esc`.
   ───────────────────────────────────────────────────────────────────────────── */

/** HTML ga tushadigan har qanday qiymat shu yerdan o'tadi */
export const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export const fmtMoney = (n: number) =>
    Math.round(n || 0).toLocaleString('uz-UZ').replace(/,/g, ' ');

export const fmtDate = (v?: string | Date | null) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('uz-UZ'); } catch { return String(v).slice(0, 10); }
};

export const fmtDateTime = (v?: string | Date | null) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return String(v); }
};

export interface PrintClinic {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    licenseNumber?: string | null;
    letterheadNote?: string | null;
}

/** Hujjat shapkasi: klinika kim ekani va litsenziya raqami */
export function clinicHeader(clinic?: PrintClinic | null): string {
    const line2 = [clinic?.address, clinic?.phone].filter(Boolean).map(esc).join(' · ');
    return `
    <div class="head">
      <div class="head-name">${esc(clinic?.name || 'Klinika')}</div>
      ${line2 ? `<div class="head-sub">${line2}</div>` : ''}
      ${clinic?.licenseNumber
            ? `<div class="head-sub">Litsenziya: ${esc(clinic.licenseNumber)}</div>`
            /* Litsenziya raqami kiritilmagan bo'lsa shapkada JOY QOLDIRAMIZ.
               Sabab: bu rasmiy hujjat va raqamsiz chiqqani ko'rinib turishi
               kerak, jimgina yo'qolib ketmasligi kerak. */
            : `<div class="head-sub muted">Litsenziya raqami kiritilmagan (Sozlamalar)</div>`}
    </div>`;
}

/** Hujjat pastidagi imzo joyi — qog'oz imzosiz yaroqsiz */
export function signatureBlock(label = 'Shifokor', name?: string | null): string {
    return `
    <div class="sign">
      <div class="sign-line"></div>
      <div class="sign-label">${esc(label)}${name ? ` — ${esc(name)}` : ''}</div>
    </div>`;
}

/** Klinikaning blank pastidagi erkin satri */
export function letterheadFooter(clinic?: PrintClinic | null): string {
    if (!clinic?.letterheadNote) return '';
    return `<div class="foot">${esc(clinic.letterheadNote)}</div>`;
}

const BASE_CSS = `
  @page { size: A4; margin: 14mm 14mm 12mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 12pt; color: #000; margin: 0; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .head { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 12px; }
  .head-name { font-size: 16pt; font-weight: 700; letter-spacing: .3px; }
  .head-sub { font-size: 9.5pt; margin-top: 2px; }
  .muted { color: #666; }
  .title { text-align: center; font-size: 14pt; font-weight: 700; margin: 10px 0 4px; text-transform: uppercase; }
  .subtitle { text-align: center; font-size: 10pt; margin-bottom: 12px; }
  .rows { width: 100%; margin-bottom: 10px; }
  .rows td { padding: 2px 0; vertical-align: top; font-size: 11pt; }
  .rows td.k { width: 38mm; color: #444; }
  table.grid { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 4px 6px; font-size: 10.5pt; }
  table.grid th { background: #eee; text-align: left; font-weight: 700; }
  table.grid td.num { text-align: right; white-space: nowrap; }
  table.grid tfoot td { font-weight: 700; background: #f5f5f5; }
  .flag-high { font-weight: 700; }
  .flag-low  { font-weight: 700; }
  .box { border: 1px solid #000; padding: 6px 8px; margin: 6px 0 10px; min-height: 14mm; }
  .box-title { font-size: 9.5pt; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; color: #333; }
  .sign { margin-top: 16mm; width: 70mm; float: right; }
  .sign-line { border-bottom: 1px solid #000; height: 8mm; }
  .sign-label { font-size: 9.5pt; text-align: center; margin-top: 2px; }
  .foot { clear: both; margin-top: 10mm; padding-top: 4px; border-top: 1px solid #999;
          font-size: 9pt; color: #444; text-align: center; }
  .note { font-size: 9.5pt; color: #333; margin-top: 6px; }
  .stamp { display: inline-block; border: 1.5px solid #000; padding: 2px 8px;
           font-size: 10pt; font-weight: 700; letter-spacing: .5px; }
`;

/**
 * Hujjatni yangi oynada ochadi va bosishga beradi.
 *
 * Oyna O'ZI YOPILMAYDI: chekdan farqli, A4 hujjatni odam ko'z bilan tekshiradi
 * ("bemor ismi to'g'rimi", "summa to'g'rimi") va kerak bo'lsa PDF ga saqlaydi.
 * Chek oynasi darhol yopiladi, chunki u lentadan chiqadi va tekshirishga
 * hech narsa yo'q.
 */
export function printDocument(title: string, bodyHtml: string): boolean {
    const w = window.open('', '_blank', 'width=880,height=1000');
    if (!w) {
        // Brauzer yoki Electron oynani bloklagan — chaqiruvchi xabar bersin
        return false;
    }
    w.document.write(`<!doctype html><html lang="uz"><head>
      <meta charset="utf-8">
      <title>${esc(title)}</title>
      <style>${BASE_CSS}</style>
    </head><body>${bodyHtml}</body></html>`);
    w.document.close();
    w.focus();
    // Uslublar qo'llanishiga vaqt beramiz, aks holda bo'sh sahifa bosiladi
    setTimeout(() => { try { w.print(); } catch { /* foydalanuvchi o'zi bosadi */ } }, 300);
    return true;
}
