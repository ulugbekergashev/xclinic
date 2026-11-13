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

import { esc, fmtMoney, PrintClinic } from './printDocument';

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
    const clinic = data.clinic;
    const contact = [clinic?.address, clinic?.phone].filter(Boolean).map(esc).join(' · ');
    const lines = data.lines.map(l => {
        const qty = l.quantity && l.quantity > 1 ? ` <span class="q">×${esc(l.quantity)}</span>` : '';
        return `<div class="r"><span>${esc(l.name)}${qty}</span><span>${esc(fmtMoney(l.total))}</span></div>`;
    }).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)}</title>
<style>${CSS}</style></head><body>
<div class="c name">${esc(clinic?.name || '')}</div>
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
