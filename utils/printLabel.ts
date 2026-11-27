/* ─────────────────────────────────────────────────────────────────────────────
   PROBIRKA YORLIG'I — termoprinter (40×30, 58×40, 50×25 mm) yoki 80 mm lenta.

   Har NAMUNA TURIGA bitta yorliq: qon va siydik — ikki probirka, ikki yorliq,
   kod bitta (buyurtma bitta). Yorliqda: familiya va ism, tug'ilgan sana
   (kod yolg'iz ikkinchi identifikator bo'la olmaydi), kod raqam bilan ham
   (skaner o'qimasa qo'lda teriladi), namuna turi, tahlillar, sana.

   Bitta yorliq — bitta sahifa: termoprinter drayveri sahifani yorliq deb
   oladi; bo'sh yorliq chiqmasin deb sahifa yorliqdan biroz qisqa.
   Xavfsizlik: ism — foydalanuvchi kiritgan matn, `esc()` dan o'tadi.
   ───────────────────────────────────────────────────────────────────────────── */

import { esc, fmtDate, fmtDateTime } from './printDocument';
import { code128CSvg, isCode128CText } from './barcode';

export type LabelSize = '40x30' | '58x40' | '50x25' | 'tape80';

export interface LabelData {
    code: string;
    patientName?: string | null;
    dob?: string | null;
    gender?: string | null;
    at?: string | Date | null;
    groups: { sample: string; tests: string[] }[];
}

interface SizeSpec { w: number; h: number | null; pad: number; name: number; small: number; bar: number }

/* mm va pt. `h: null` — lenta: balandlik mazmunga qarab */
const SIZES: Record<LabelSize, SizeSpec> = {
    '40x30': { w: 40, h: 30, pad: 1.5, name: 8, small: 6.5, bar: 9 },
    '58x40': { w: 58, h: 40, pad: 2, name: 10, small: 8, bar: 12 },
    '50x25': { w: 50, h: 25, pad: 1.5, name: 8, small: 6.5, bar: 7.5 },
    'tape80': { w: 72, h: null, pad: 2, name: 11, small: 9, bar: 12 },
};

export const LABEL_SIZE_OPTIONS: { id: LabelSize; label: string }[] = [
    { id: '40x30', label: '40 × 30 mm' },
    { id: '58x40', label: '58 × 40 mm' },
    { id: '50x25', label: '50 × 25 mm' },
    { id: 'tape80', label: '80 mm lenta (chek printeri)' },
];

const QUIET_MODULES = 20;
const MIN_MODULE_MM = 0.25;   // 203 dpi da 2 nuqta — bundan ingichkasi o'qilmaydi
const MAX_MODULE_MM = 0.375;  // 3 nuqta
const DOT_MM = 0.125;         // 203 dpi printerning bitta nuqtasi

const genderShort = (g?: string | null) => g === 'Male' ? 'E' : g === 'Female' ? 'A' : '';

/** Chiziq kengligi: yorliq eniga sig'adigan eng yo'g'oni, lekin 0.25 mm dan ingichka emas */
export function moduleFor(widthMm: number, padMm: number, modules: number): number {
    /* Butun nuqtaga yaxlitlanadi: 2.7 nuqtali chiziq printerda notekis
       chiqadi va skaner yomon o'qiydi */
    const fit = (widthMm - padMm * 2) / (modules + QUIET_MODULES);
    const dots = Math.floor(fit / DOT_MM + 1e-9) * DOT_MM;
    return Math.max(MIN_MODULE_MM, Math.min(MAX_MODULE_MM, dots));
}

export function buildLabelHtml(data: LabelData, size: LabelSize = '40x30'): string {
    const s = SIZES[size] || SIZES['40x30'];
    const code = String(data.code || '');
    const groups = data.groups.length ? data.groups : [{ sample: 'Namuna', tests: [] }];
    const modules = 90;   // 10 xonali kod: start + 5 juft + nazorat + stop
    const barcode = isCode128CText(code)
        ? code128CSvg(code, { moduleMm: moduleFor(s.w, s.pad, modules), heightMm: s.bar })
        : '';
    const idLine = [fmtDate(data.dob || null) !== '—' ? fmtDate(data.dob || null) : '', genderShort(data.gender)]
        .filter(Boolean).join(' · ');

    const pageH = s.h ? `${s.h - 0.5}mm` : 'auto';
    const css = `
  @page { size: ${size === 'tape80' ? '80mm auto' : `${s.w}mm ${s.h}mm`}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, "Segoe UI", sans-serif; color: #000;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lbl { width: ${size === 'tape80' ? '80mm' : `${s.w}mm`}; height: ${pageH}; padding: ${s.pad}mm ${size === 'tape80' ? 4 : s.pad}mm;
         overflow: hidden; page-break-after: always; break-after: page; display: flex; flex-direction: column; }
  .lbl:last-child { page-break-after: auto; break-after: auto; }
  .tape .lbl { border-bottom: 1px dashed #000; height: auto; padding-bottom: 4mm; margin-bottom: 2mm; }
  .nm { font-size: ${s.name}pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; }
  .sm { font-size: ${s.small}pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
  .row { display: flex; justify-content: space-between; gap: 1mm; }
  .bc { display: flex; justify-content: center; margin: 0.6mm 0 0.2mm; }
  .bc svg { display: block; fill: #000; }
  .code { text-align: center; font-size: ${s.small + 1}pt; font-weight: 700; letter-spacing: .6px; line-height: 1.1; }
  .smp { font-weight: 700; }`;

    const labels = groups.map(g => `
<div class="lbl">
  <div class="nm">${esc(data.patientName || '—')}</div>
  <div class="row sm"><span>${esc(idLine)}</span><span>${esc(fmtDateTime(data.at || null))}</span></div>
  <div class="bc">${barcode}</div>
  <div class="code">${esc(code)}</div>
  <div class="sm"><span class="smp">${esc(g.sample)}</span>${g.tests.length ? ` · ${esc(g.tests.join(', '))}` : ''}</div>
</div>`).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><title>Yorliq ${esc(code)}</title>
<style>${css}</style></head><body class="${size === 'tape80' ? 'tape' : ''}">${labels}</body></html>`;
}

/** Yorliqni bosadi. `false` — oyna ochilmadi (pop-up bloklangan). */
export function printLabels(data: LabelData, size: LabelSize = '40x30'): boolean {
    const w = window.open('', '_blank', 'width=420,height=520');
    if (!w) return false;
    w.document.write(buildLabelHtml(data, size));
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* foydalanuvchi o'zi bosadi */ } }, 250);
    return true;
}
