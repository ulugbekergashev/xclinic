/* ─────────────────────────────────────────────────────────────────────────────
   BEMORGA KETADIGAN PDF — retsept va tahlil natijasi (2026-11-26).

   Nega serverda. Natija tayyor bo'lganda o'zi yuborilishi mumkin — o'sha
   paytda brauzer yo'q. Server Electron ichida emas, alohida Node jarayoni
   (electron/main.ts: ELECTRON_RUN_AS_NODE), ya'ni printToPDF ham yo'q.
   Shuning uchun sof JS kutubxona: pdf-lib + fontkit.

   Shrift diskdan o'qiladi (Windows: Arial). Lotin o'zbekcha (oʻ, gʻ) va
   kirill harflari standart PDF shriftlarida YO'Q — shrift topilmasa PDF
   yasalmaydi va sabab aniq aytiladi, «?» bilan to'la varaq yuborilmaydi.

   Ko'rinish utils/printForms.ts dagi qog'oz blank bilan bir xil: shapka,
   sarlavha, bemor qatorlari, jadval, imzo. Bemor bu varaqni boshqa
   klinikaga ham ko'rsatadi.

   ICHKI YOZUVLAR KETMAYDI: retsept izohidagi «Allergiya ogohlantirishi
   o'tkazildi» qatori, shifokorning laboratoriyaga izohi (clinicianNotes),
   bemor telefoni. Model funksiyalari (`prescriptionModel`, `labResultModel`)
   faqat ruxsat etilgan maydonlarni oladi — sinov shuni tekshiradi.
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ALLERGY_OVERRIDE_PREFIX } from '../shared/allergyMatch';

export interface PdfClinic {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    licenseNumber?: string | null;
    letterheadNote?: string | null;
}

/* ═══ Ma'lumot modeli — PDF ga NIMA tushadi ══════════════════════════════════ */

const genderLabel = (g?: string | null) =>
    g === 'Male' ? 'Erkak' : g === 'Female' ? 'Ayol' : (g || '—');

/** 2026-11-26 → 26.11.2026. Sana bo'lmasa «—» */
export function fmtDate(v?: string | Date | null): string {
    if (!v) return '—';
    const s = v instanceof Date ? v.toISOString() : String(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

/** Vaqt Toshkent bo'yicha (UTC+5, yozgi vaqt yo'q) */
export function fmtDateTime(v?: string | Date | null): string {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    const t = new Date(d.getTime() + 5 * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

function patientRows(p: any): [string, string][] {
    return [
        ['Bemor', `${p?.lastName || ''} ${p?.firstName || ''}`.trim() || '—'],
        ['Tug\'ilgan sana', fmtDate(p?.dob)],
        ['Jinsi', genderLabel(p?.gender)],
        ...(p?.cardNumber ? [['Karta raqami', String(p.cardNumber)] as [string, string]] : []),
        /* Telefon YO'Q: hujjat bemorning o'z Telegramiga ketadi, uni qayta
           ko'rsatish shart emas, varaq esa boshqa qo'llarga o'tishi mumkin */
    ];
}

const MEAL: Record<string, string> = { before: 'ovqatdan oldin', with: 'ovqat bilan', after: 'ovqatdan keyin' };

export interface PrescriptionModel {
    date: string;
    doctorName: string | null;
    patient: [string, string][];
    items: { name: string; regimen: string; instructions: string | null }[];
    notes: string | null;
}

/** Retseptdan bemorga ko'rsatiladigan qism. Izohdagi ichki qayd olib tashlanadi. */
export function prescriptionModel(rx: any): PrescriptionModel {
    const items = (Array.isArray(rx?.items) ? rx.items : []).map((it: any) => ({
        name: String(it?.name || '—'),
        regimen: [
            it?.dosage,
            it?.frequency,
            it?.mealTiming ? MEAL[it.mealTiming] : null,
            it?.durationDays ? `${it.durationDays} kun` : null,
        ].filter(Boolean).join(' · ') || '—',
        instructions: it?.instructions ? String(it.instructions) : null,
    }));
    const notes = String(rx?.notes || '')
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith(ALLERGY_OVERRIDE_PREFIX))
        .join('\n')
        .trim();
    return {
        date: fmtDate(rx?.date),
        doctorName: rx?.doctorName || null,
        patient: patientRows(rx?.patient || { lastName: rx?.patientName }),
        items,
        notes: notes || null,
    };
}

export interface LabResultModel {
    number: string;
    orderedAt: string;
    completedAt: string;
    patient: [string, string][];
    groups: { testName: string; rows: { name: string; value: string; flag: 'High' | 'Low' | null; unit: string; ref: string }[] }[];
    hasAnyValue: boolean;
    technicianName: string | null;
    technicianNotes: string | null;
    /** «Ism · sana» — natijani tasdiqlagan (klinika yoqqan bo'lsa). Migratsiya 0045. */
    verifiedBy: string | null;
}

/** Natijadan bemorga ko'rsatiladigan qism. Qiymati yo'q ko'rsatkich tushmaydi. */
export function labResultModel(order: any): LabResultModel {
    const groups = (Array.isArray(order?.items) ? order.items : []).map((it: any) => ({
        testName: String(it?.testName || it?.name || '—'),
        rows: (Array.isArray(it?.parameters) ? it.parameters : [])
            .filter((pr: any) => String(pr?.value ?? '').trim() !== '')
            .map((pr: any) => ({
                name: String(pr.name || ''),
                value: String(pr.value),
                flag: pr.flag === 'High' ? 'High' as const : pr.flag === 'Low' ? 'Low' as const : null,
                unit: String(pr.unit || ''),
                ref: (pr.refLow != null || pr.refHigh != null)
                    ? `${pr.refLow ?? ''} – ${pr.refHigh ?? ''}`
                    : (pr.refText || '—'),
            })),
    }));
    const extra: [string, string][] = order?.doctorName ? [['Yuborgan shifokor', String(order.doctorName)]] : [];
    return {
        /* Probirka kodi bo'lsa — o'sha (yorliqdagi raqam); bo'lmasa id boshi */
        number: order?.sampleCode ? String(order.sampleCode) : order?.id ? String(order.id).slice(0, 8).toUpperCase() : '—',
        orderedAt: fmtDateTime(order?.orderedAt),
        completedAt: fmtDateTime(order?.completedAt),
        patient: [...patientRows(order?.patient || { lastName: order?.patientName }), ...extra],
        groups,
        hasAnyValue: groups.some((g: any) => g.rows.length > 0),
        technicianName: order?.technicianName || null,
        technicianNotes: order?.technicianNotes || null,
        verifiedBy: order?.verifiedAt
            ? [order.verifiedByName, fmtDateTime(order.verifiedAt)].filter(Boolean).join(' · ')
            : null,
    };
}

/* ═══ Shrift ═════════════════════════════════════════════════════════════════ */

const FONT_CANDIDATES: [string, string][] = (() => {
    const win = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
    return [
        [path.join(win, 'arial.ttf'), path.join(win, 'arialbd.ttf')],
        [path.join(win, 'segoeui.ttf'), path.join(win, 'segoeuib.ttf')],
        [path.join(win, 'tahoma.ttf'), path.join(win, 'tahomabd.ttf')],
        ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
        ['/Library/Fonts/Arial Unicode.ttf', '/Library/Fonts/Arial Unicode.ttf'],
    ];
})();

let fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;

function loadFontBytes(): { regular: Uint8Array; bold: Uint8Array } {
    if (fontCache) return fontCache;
    for (const [reg, bold] of FONT_CANDIDATES) {
        try {
            if (!fs.existsSync(reg)) continue;
            const regular = fs.readFileSync(reg);
            const boldBytes = fs.existsSync(bold) ? fs.readFileSync(bold) : regular;
            fontCache = { regular, bold: boldBytes };
            return fontCache;
        } catch { /* keyingisini sinaymiz */ }
    }
    throw new Error('PDF uchun shrift topilmadi (Arial). Kompyuterda Windows shriftlari bo\'lishi kerak.');
}

/* ═══ Sahifa quruvchi ════════════════════════════════════════════════════════ */

const A4: [number, number] = [595.28, 841.89];
const M = { left: 40, right: 40, top: 42, bottom: 48 };
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.38, 0.38, 0.38);
const LINE = rgb(0.72, 0.72, 0.72);
const FILL = rgb(0.95, 0.95, 0.95);
const HIGH = rgb(0.7, 0.07, 0.07);
const LOW = rgb(0.05, 0.3, 0.7);

interface TextOpts { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right'; x?: number; width?: number; gap?: number }

class Layout {
    pages: PDFPage[] = [];
    page!: PDFPage;
    y = 0;
    /** Yangi sahifa ochilganda chaqiriladi (jadval sarlavhasini qayta chizish) */
    onNewPage: (() => void) | null = null;
    private charset: Set<number>;

    constructor(private pdf: PDFDocument, public regular: PDFFont, public bold: PDFFont) {
        this.charset = new Set(regular.getCharacterSet());
        this.addPage();
    }

    get width() { return A4[0] - M.left - M.right; }

    addPage() {
        this.page = this.pdf.addPage(A4);
        this.pages.push(this.page);
        this.y = A4[1] - M.top;
        if (this.onNewPage) this.onNewPage();
    }

    ensure(h: number) {
        if (this.y - h < M.bottom) this.addPage();
    }

    /** Shriftda yo'q belgi (emoji va h.k.) tashlab yuboriladi — aks holda
     *  pdf-lib yiqiladi. «?» qo'yilmaydi: bemor uni xato deb o'qiydi. */
    clean(s: string): string {
        return Array.from(String(s ?? '').replace(/\t/g, ' '))
            .filter(ch => ch === '\n' || this.charset.has(ch.codePointAt(0)!))
            .join('')
            .replace(/ +\n/g, '\n')
            .replace(/ +$/, '');
    }

    /** Matnni kenglikka bo'lib qatorlarga ajratadi */
    wrap(text: string, size: number, width: number, bold = false): string[] {
        const font = bold ? this.bold : this.regular;
        const out: string[] = [];
        for (const para of this.clean(text).split('\n')) {
            const words = para.split(/ +/);
            let line = '';
            for (const w of words) {
                const tryLine = line ? `${line} ${w}` : w;
                if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; continue; }
                if (line) out.push(line);
                /* Bitta so'z qatordan uzun — harflab bo'lamiz */
                let rest = w;
                while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
                    let n = rest.length - 1;
                    while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
                    out.push(rest.slice(0, n));
                    rest = rest.slice(n);
                }
                line = rest;
            }
            out.push(line);
        }
        return out;
    }

    /** Qatorlarni chizadi va y ni pastga suradi */
    text(str: string, o: TextOpts = {}) {
        const size = o.size ?? 11;
        const font = o.bold ? this.bold : this.regular;
        const x0 = o.x ?? M.left;
        const width = o.width ?? (A4[0] - M.right - x0);
        const lh = size * 1.3;
        for (const line of this.wrap(str, size, width, o.bold)) {
            this.ensure(lh);
            const w = font.widthOfTextAtSize(line, size);
            const x = o.align === 'center' ? x0 + (width - w) / 2 : o.align === 'right' ? x0 + width - w : x0;
            this.page.drawText(line, { x, y: this.y - size, size, font, color: o.color ?? BLACK });
            this.y -= lh;
        }
        this.y -= o.gap ?? 0;
    }

    hr(thickness = 0.8, color: RGB = BLACK) {
        this.page.drawLine({ start: { x: M.left, y: this.y }, end: { x: A4[0] - M.right, y: this.y }, thickness, color });
    }

    /** Jadval qatori: har katak o'z kengligiga bo'linadi, balandlik eng uzun katakdan */
    row(cells: { text: string; width: number; bold?: boolean; color?: RGB; align?: 'left' | 'right'; indent?: number; sub?: string | null }[], o: { size?: number; fill?: RGB } = {}) {
        const size = o.size ?? 10;
        const pad = 4;
        const lh = size * 1.28;
        /* `sub` — asosiy matn ostidagi oddiy shriftli qator (dori izohi) */
        const lines = cells.map(c => {
            const inner = c.width - pad * 2 - (c.indent || 0);
            const main = this.wrap(c.text, size, inner, c.bold).map(t => ({ t, bold: !!c.bold }));
            const sub = c.sub ? this.wrap(c.sub, size, inner, false).map(t => ({ t, bold: false })) : [];
            return [...main, ...sub];
        });
        const h = Math.max(...lines.map(w => w.length)) * lh + pad * 2;
        this.ensure(h);
        const top = this.y;
        if (o.fill) this.page.drawRectangle({ x: M.left, y: top - h, width: this.width, height: h, color: o.fill });
        let x = M.left;
        cells.forEach((c, i) => {
            lines[i].forEach((line, k) => {
                const font = line.bold ? this.bold : this.regular;
                const w = font.widthOfTextAtSize(line.t, size);
                const tx = c.align === 'right' ? x + c.width - pad - w : x + pad + (c.indent || 0);
                this.page.drawText(line.t, { x: tx, y: top - pad - size - k * lh + 1.5, size, font, color: c.color ?? BLACK });
            });
            x += c.width;
        });
        this.page.drawLine({ start: { x: M.left, y: top - h }, end: { x: A4[0] - M.right, y: top - h }, thickness: 0.5, color: LINE });
        this.y = top - h;
    }

    /** Ramkali blok: «Izoh», «Laborant izohi» */
    box(title: string, body: string) {
        const size = 10.5;
        const lines = this.wrap(body, size, this.width - 16);
        const h = 14 + 6 + lines.length * size * 1.3 + 8;
        this.ensure(Math.min(h, 200));
        this.y -= 6;
        const top = this.y;
        const lh = size * 1.3;
        const height = Math.min(h, top - M.bottom);
        this.page.drawRectangle({ x: M.left, y: top - height, width: this.width, height, borderColor: LINE, borderWidth: 0.8 });
        this.y -= 6;
        this.text(title, { size: 10, bold: true, x: M.left + 8, width: this.width - 16 });
        for (const line of lines) {
            this.ensure(lh);
            this.page.drawText(line, { x: M.left + 8, y: this.y - size, size, font: this.regular, color: BLACK });
            this.y -= lh;
        }
        this.y -= 8;
    }

    signature(label: string, name?: string | null) {
        this.ensure(60);
        this.y -= 34;
        this.page.drawLine({ start: { x: M.left, y: this.y }, end: { x: M.left + 200, y: this.y }, thickness: 0.8, color: BLACK });
        this.y -= 4;
        this.text(`${label}${name ? ` — ${name}` : ''}`, { size: 10, color: GRAY });
    }

    /** Sahifa raqamlari — faqat bir nechta sahifa bo'lsa */
    finish() {
        const n = this.pages.length;
        if (n < 2) return;
        this.pages.forEach((p, i) => {
            const label = `${i + 1} / ${n}`;
            const w = this.regular.widthOfTextAtSize(label, 8.5);
            p.drawText(label, { x: A4[0] - M.right - w, y: M.bottom - 24, size: 8.5, font: this.regular, color: GRAY });
        });
    }
}

async function newLayout(title: string): Promise<{ pdf: PDFDocument; L: Layout }> {
    const fonts = loadFontBytes();
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(title);
    pdf.setCreator('XClinic');
    pdf.setProducer('XClinic');
    const regular = await pdf.embedFont(fonts.regular, { subset: true });
    const bold = await pdf.embedFont(fonts.bold, { subset: true });
    return { pdf, L: new Layout(pdf, regular, bold) };
}

function letterhead(L: Layout, clinic: PdfClinic | null | undefined) {
    L.text(clinic?.name || 'Klinika', { size: 16, bold: true, align: 'center', x: M.left, width: L.width });
    const line2 = [clinic?.address, clinic?.phone].filter(Boolean).join(' · ');
    if (line2) L.text(line2, { size: 9.5, align: 'center', x: M.left, width: L.width });
    if (clinic?.licenseNumber) L.text(`Litsenziya: ${clinic.licenseNumber}`, { size: 9.5, align: 'center', x: M.left, width: L.width });
    L.y -= 4;
    L.hr(1.6);
    L.y -= 14;
}

function titleBlock(L: Layout, title: string, subtitle: string) {
    L.text(title, { size: 15, bold: true, align: 'center', x: M.left, width: L.width, gap: 1 });
    L.text(subtitle, { size: 10, color: GRAY, align: 'center', x: M.left, width: L.width, gap: 10 });
}

function patientBlock(L: Layout, rows: [string, string][]) {
    for (const [k, v] of rows) {
        const top = L.y;
        L.text(`${k}:`, { size: 10.5, color: GRAY, x: M.left, width: 118 });
        const after = L.y;
        L.y = top;
        L.text(v, { size: 10.5, x: M.left + 120, width: L.width - 120 });
        L.y = Math.min(L.y, after);
    }
    L.y -= 10;
}

function footerNote(L: Layout, clinic: PdfClinic | null | undefined) {
    if (!clinic?.letterheadNote) return;
    L.y -= 10;
    L.text(clinic.letterheadNote, { size: 9, color: GRAY, align: 'center', x: M.left, width: L.width });
}

/* ═══ Retsept ════════════════════════════════════════════════════════════════ */

export async function renderPrescriptionPdf(rx: any, clinic?: PdfClinic | null): Promise<Uint8Array> {
    const m = prescriptionModel(rx);
    const { pdf, L } = await newLayout('Retsept');
    letterhead(L, clinic);
    titleBlock(L, 'Retsept', m.date);
    patientBlock(L, m.patient);

    if (m.items.length) {
        const W = [28, L.width - 28 - 190, 190];
        const head = () => L.row([
            { text: '№', width: W[0], bold: true },
            { text: 'Dori', width: W[1], bold: true },
            { text: 'Qabul tartibi', width: W[2], bold: true },
        ], { fill: FILL, size: 9.5 });
        head();
        L.onNewPage = head;
        m.items.forEach((it, i) => {
            L.row([
                { text: String(i + 1), width: W[0] },
                { text: it.name, width: W[1], bold: true, sub: it.instructions },
                { text: it.regimen, width: W[2] },
            ], { size: 10.5 });
        });
        L.onNewPage = null;
    } else {
        L.text('Dorilar ko\'rsatilmagan.', { size: 10.5, color: GRAY });
    }

    if (m.notes) L.box('Izoh', m.notes);
    L.y -= 8;
    L.text('Dorilarni faqat shifokor ko\'rsatgan tartibda qabul qiling. Yon ta\'sir sezilsa qabulni to\'xtatib, shifokorga murojaat qiling.',
        { size: 9.5, color: GRAY });
    L.signature('Shifokor', m.doctorName);
    footerNote(L, clinic);
    L.finish();
    return pdf.save();
}

/* ═══ Tahlil natijasi ════════════════════════════════════════════════════════ */

export async function renderLabResultPdf(order: any, clinic?: PdfClinic | null, opts: { corrected?: boolean } = {}): Promise<Uint8Array> {
    const m = labResultModel(order);
    const { pdf, L } = await newLayout('Tahlil natijasi');
    letterhead(L, clinic);
    titleBlock(L, opts.corrected ? 'Laboratoriya tahlili natijasi (tuzatilgan)' : 'Laboratoriya tahlili natijasi',
        `Buyurtma № ${m.number} · Olindi: ${m.orderedAt} · Tayyor: ${m.completedAt}`);
    patientBlock(L, m.patient);

    if (m.hasAnyValue) {
        const W = [L.width - 80 - 62 - 110, 80, 62, 110];
        const head = () => L.row([
            { text: 'Ko\'rsatkich', width: W[0], bold: true },
            { text: 'Natija', width: W[1], bold: true, align: 'right' },
            { text: 'Birlik', width: W[2], bold: true },
            { text: 'Norma', width: W[3], bold: true },
        ], { fill: FILL, size: 9.5 });
        head();
        L.onNewPage = head;
        for (const g of m.groups) {
            L.row([{ text: g.testName, width: L.width, bold: true }], { fill: FILL, size: 10 });
            if (!g.rows.length) {
                L.row([{ text: 'Natija kiritilmagan', width: L.width, color: GRAY, indent: 14 }], { size: 10 });
                continue;
            }
            for (const r of g.rows) {
                const color = r.flag === 'High' ? HIGH : r.flag === 'Low' ? LOW : BLACK;
                L.row([
                    { text: r.name, width: W[0], indent: 14 },
                    { text: `${r.value}${r.flag === 'High' ? ' ↑' : r.flag === 'Low' ? ' ↓' : ''}`, width: W[1], bold: !!r.flag, color, align: 'right' },
                    { text: r.unit, width: W[2] },
                    { text: r.ref, width: W[3] },
                ], { size: 10.5 });
            }
        }
        L.onNewPage = null;
        L.y -= 4;
        L.text('↑ — normadan yuqori, ↓ — normadan past.', { size: 9, color: GRAY });
    } else {
        L.box('Natija', 'Natija kiritilmagan.');
    }

    if (m.technicianNotes) L.box('Laborant izohi', m.technicianNotes);
    L.signature('Laborant', m.technicianName);
    if (m.verifiedBy) L.text(`Tasdiqladi: ${m.verifiedBy}`, { size: 10, color: GRAY });
    footerNote(L, clinic);
    L.finish();
    return pdf.save();
}
