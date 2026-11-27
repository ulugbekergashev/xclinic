/* ─────────────────────────────────────────────────────────────────────────────
   KASSA CHEKI — lentaga (58/80 mm), QATORMA-QATOR.

   MUAMMO. Yagona chek (`components/ReceiptModal.tsx`) bitta `Transaction` ni
   bosadi: unda xizmat bitta satr va bitta summa. Bemor uch xizmat uchun
   to'lasa yoki statsionardan chiqayotganda o'n kunlik hisobni so'rasa —
   «nima uchun shuncha» degan savolga qog'ozda javob yo'q edi.

   Bu yerda chek QATORLARDAN quriladi: har xizmat alohida, ostida jami.
   Ikki joyda ishlatiladi:
     · to'lov oynasi (`ServicePaymentModal`) — pul olingandan keyin;
     · statsionar hisobi (`AdmissionBill`) — bemor chiqayotganda.

   MATNLAR TASHQARIDAN. Sarlavha va yorliqlar chaqiruvchidan keladi
   (`t(...)`): bu fayl tilni bilmaydi va sinovda brauzersiz ishlaydi.

   XAVFSIZLIK. Bemor ismi va xizmat nomi — foydalanuvchi kiritgan matn.
   HTML ga tushadigan har bir qiymat `esc()` dan o'tadi.
   ───────────────────────────────────────────────────────────────────────────── */

import { esc, fmtMoney, PrintClinic, resolvePrintClinic, printDocument, clinicHeader } from './printDocument';

export interface ReceiptLine {
    name: string;
    quantity?: number;
    total: number;
}

export interface ReceiptRow {
    label: string;
    value: string;
    /** Yakuniy satr (jami, qarz) — qalin va yirik */
    strong?: boolean;
}

export interface ReceiptData {
    title: string;
    clinic?: PrintClinic | null;
    /** Chek tepasidagi ma'lumot: sana, bemor, kassir */
    meta: ReceiptRow[];
    lines: ReceiptLine[];
    /** Qatorlar ostidagi yakun: jami, to'langan, qarz, to'lov usuli */
    summary: ReceiptRow[];
    footer?: string;
}

/** Bir xil xizmat bir necha marta yozilgan bo'lsa — chekda bitta satr.
 *  Statsionarda «Koyka (sana)» o'n marta takrorlanadi; lentada ular
 *  o'n satr emas, mazmunan bitta narsa. Nomi bir xil bo'lganlargina
 *  qo'shiladi, tartib birinchi uchrashiga qarab saqlanadi. */
export function mergeReceiptLines(lines: ReceiptLine[]): ReceiptLine[] {
    const byName = new Map<string, ReceiptLine>();
    for (const l of lines) {
        const qty = l.quantity && l.quantity > 0 ? l.quantity : 1;
        const hit = byName.get(l.name);
        byName.set(l.name, hit
            ? { name: l.name, quantity: (hit.quantity || 1) + qty, total: hit.total + l.total }
            : { name: l.name, quantity: qty, total: l.total });
    }
    return Array.from(byName.values());
}

const CSS = `
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 6px; }
  .c { text-align: center; }
  .name { font-size: 16px; font-weight: 800; }
  .sub { font-size: 11px; margin-top: 2px; }
  .title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-top: 6px; }
  .s { border-top: 1px dashed #000; margin: 7px 0; }
  .r { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
  .r span:first-child { flex: 1; min-width: 0; word-break: break-word; }
  .r span:last-child { white-space: nowrap; text-align: right; }
  .q { font-size: 11px; color: #333; }
  .b { font-size: 15px; font-weight: 800; margin: 5px 0; }
  .f { font-size: 11px; margin-top: 10px; }
`;

const row = (r: ReceiptRow) =>
    `<div class="r${r.strong ? ' b' : ''}"><span>${esc(r.label)}</span><span>${esc(r.value)}</span></div>`;

/** Chekning to'liq HTML hujjati. Brauzerga bog'liq emas — sinovda tekshiriladi. */
export function buildReceiptHtml(data: ReceiptData): string {
    // Klinika berilmasa — ilovadagi joriy klinika (printDocument)
    const clinic = resolvePrintClinic(data.clinic);
    const contact = [clinic?.address, clinic?.phone].filter(Boolean).map(esc).join(' · ');
    const lines = data.lines.map(l => {
        const qty = l.quantity && l.quantity > 1 ? ` <span class="q">×${esc(l.quantity)}</span>` : '';
        return `<div class="r"><span>${esc(l.name)}${qty}</span><span>${esc(fmtMoney(l.total))}</span></div>`;
    }).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)}</title>
<style>${CSS}</style></head><body>
<div class="c name">${esc(clinic?.name || 'XClinic')}</div>
${contact ? `<div class="c sub">${contact}</div>` : ''}
<div class="c title">${esc(data.title)}</div>
<div class="s"></div>
${data.meta.map(row).join('')}
<div class="s"></div>
${lines}
<div class="s"></div>
${data.summary.map(row).join('')}
${data.footer ? `<div class="c f">${esc(data.footer)}</div>` : ''}
</body></html>`;
}

/**
 * Chekni yangi oynada ochadi va bosishga beradi.
 * `false` — oyna ochilmadi (pop-up bloklangan): chaqiruvchi xabar beradi.
 */
export function printReceipt(data: ReceiptData): boolean {
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) return false;
    w.document.write(buildReceiptHtml(data));
    w.document.close();
    w.focus();
    // Uslublar qo'llanishiga vaqt beramiz, aks holda bo'sh lenta chiqadi
    setTimeout(() => { try { w.print(); } catch { /* foydalanuvchi o'zi bosadi */ } }, 250);
    return true;
}

/* ═══ A4 VARAQ — o'sha chek, katta qog'ozda ═══════════════════════════════════

   Lenta cheki bemorga yetadi, lekin ishxona, sug'urta yoki tashkilot
   (xodimini davolatgan korxona) A4 varaq so'raydi: shapka, jadval, imzo
   va muhr joyi bilan. Ma'lumot chekniki bilan BIR XIL (`ReceiptData`) —
   ikkinchi hisob-kitob yo'q, faqat boshqa ko'rinish.

   Bu soliq e-hisob-fakturasi (Didox va h.k.) EMAS: u davlat tizimida
   chiqariladi. Bu — klinikaning to'lov hujjati. */

export interface ReceiptA4Labels {
    no: string;
    name: string;
    qty: string;
    sum: string;
    cashier: string;
    payer: string;
    stamp: string;
}

const A4_DEFAULT_LABELS: ReceiptA4Labels = {
    no: '№', name: 'Nomi', qty: 'Soni', sum: 'Summa',
    cashier: 'Kassir', payer: "To'lovchi", stamp: 'M.O.',
};

/** A4 varaqning tanasi. Brauzerga bog'liq emas — sinovda tekshiriladi. */
export function buildReceiptA4Body(data: ReceiptData, labels: Partial<ReceiptA4Labels> = {}): string {
    const L = { ...A4_DEFAULT_LABELS, ...labels };
    const table = `<table class="grid">
      <thead><tr>
        <th style="width:10mm">${esc(L.no)}</th><th>${esc(L.name)}</th>
        <th style="width:18mm" class="num">${esc(L.qty)}</th>
        <th style="width:34mm" class="num">${esc(L.sum)}</th>
      </tr></thead>
      <tbody>${data.lines.map((l, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.name)}</td>
        <td class="num">${esc(l.quantity && l.quantity > 0 ? l.quantity : 1)}</td>
        <td class="num">${esc(fmtMoney(l.total))}</td>
      </tr>`).join('')}</tbody>
    </table>`;

    const summary = `<table class="rows" style="width:auto;margin-left:auto">${data.summary.map(r =>
        `<tr${r.strong ? ' style="font-weight:700"' : ''}><td class="k" style="width:auto;padding-right:8mm">${esc(r.label)}:</td><td class="num" style="text-align:right">${esc(r.value)}</td></tr>`,
    ).join('')}</table>`;

    const sign = (label: string) => `<div class="sign" style="float:none">
        <div class="sign-line"></div><div class="sign-label">${esc(label)}</div>
      </div>`;

    return `
    ${clinicHeader(data.clinic)}
    <div class="title">${esc(data.title)}</div>
    <table class="rows">${data.meta.map(r =>
        `<tr><td class="k">${esc(r.label)}:</td><td>${esc(r.value)}</td></tr>`).join('')}</table>
    ${table}
    ${summary}
    ${data.footer ? `<div class="note">${esc(data.footer)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10mm">
      ${sign(L.cashier)}
      <div class="sign-label" style="margin-bottom:2mm">${esc(L.stamp)}</div>
      ${sign(L.payer)}
    </div>`;
}

/** A4 varaqni bosadi. `false` — oyna ochilmadi (pop-up bloklangan). */
export function printReceiptA4(data: ReceiptData, labels?: Partial<ReceiptA4Labels>): boolean {
    return printDocument(data.title, buildReceiptA4Body(data, labels));
}

/** Jadval va imzo yorliqlari tarjimadan. `t` tashqaridan — bu fayl tilni bilmaydi. */
export const receiptA4Labels = (t: (key: any) => string): ReceiptA4Labels => ({
    no: '№',
    name: t('print.col.name'),
    qty: t('print.col.qty'),
    sum: t('print.col.sum'),
    cashier: t('print.sign.cashier'),
    payer: t('print.sign.payer'),
    stamp: t('print.stamp'),
});
