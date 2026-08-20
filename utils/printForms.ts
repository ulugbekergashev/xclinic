/* ─────────────────────────────────────────────────────────────────────────────
   Uchta rasmiy blank: yo'llanma, tahlil natijasi, tekshiruv xulosasi.

   Hammasi bitta asosga quriladi (printDocument.ts) va bitta qoidaga bo'ysunadi:
   qog'ozda DASTUR interfeysi ko'rinmaydi — faqat hujjat. Bemor bu varaqni
   boshqa klinikaga ko'rsatadi.
   ───────────────────────────────────────────────────────────────────────────── */

import {
    printDocument, clinicHeader, signatureBlock, letterheadFooter,
    esc, fmtMoney, fmtDate, fmtDateTime, PrintClinic,
} from './printDocument';

const KIND_LABEL: Record<string, string> = {
    Lab: 'Laboratoriyaga',
    Study: 'Diagnostikaga',
    Consult: 'Konsultatsiyaga',
    Cashier: 'Kassaga',
};

const genderLabel = (g?: string | null) =>
    g === 'Male' ? 'Erkak' : g === 'Female' ? 'Ayol' : (g || '—');

/** Bemor qatorlari — uch blankda ham bir xil ko'rinadi */
function patientRows(p: any, extra: [string, string][] = []): string {
    const rows: [string, string][] = [
        ['Bemor', `${p?.lastName || ''} ${p?.firstName || ''}`.trim() || '—'],
        ['Tug\'ilgan sana', fmtDate(p?.dob)],
        ['Jinsi', genderLabel(p?.gender)],
        ...(p?.cardNumber ? [['Karta raqami', String(p.cardNumber)] as [string, string]] : []),
        ...(p?.phone ? [['Telefon', String(p.phone)] as [string, string]] : []),
        ...extra,
    ];
    return `<table class="rows">${rows
        .map(([k, v]) => `<tr><td class="k">${esc(k)}:</td><td>${esc(v)}</td></tr>`)
        .join('')}</table>`;
}

/* ═══ 1. YO'LLANMA ═══════════════════════════════════════════════════════════

   Bemor qo'lidagi varaq. Kassir undan nima to'lanishi kerakligini o'qiydi,
   laborant — nima olish kerakligini. Ilgari bularning hammasi og'zaki edi. */

export function printReferral(referral: any, clinic?: PrintClinic | null): boolean {
    const items: any[] = referral?.payload?.items || [];
    const total: number = referral?.payload?.total || 0;

    const table = items.length
        ? `<table class="grid">
        <thead><tr>
          <th style="width:10mm">№</th><th>Xizmat</th>
          <th style="width:18mm" class="num">Soni</th>
          <th style="width:30mm" class="num">Narxi</th>
        </tr></thead>
        <tbody>${items.map((it, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(it.name)}</td>
          <td class="num">${esc(it.quantity || 1)}</td>
          <td class="num">${fmtMoney((it.price || 0) * (it.quantity || 1))}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td colspan="3">Jami</td><td class="num">${fmtMoney(total)} so'm</td>
        </tr></tfoot>
      </table>`
        /* Xizmatsiz yo'llanma — normal holat: shifokor "terapevtga boring"
           deb yozadi, narx yo'q. Bo'sh jadval o'rniga izoh. */
        : `<div class="note">Xizmatlar ro'yxati ko'rsatilmagan.</div>`;

    const statusStamp = referral?.status === 'Cancelled'
        ? '<div class="stamp">BEKOR QILINGAN</div>'
        : referral?.status === 'Used'
            ? '<div class="stamp">ISHLATILGAN</div>'
            : '';

    const body = `
    ${clinicHeader(clinic)}
    <div class="title">Yo'llanma</div>
    <div class="subtitle">
      № ${esc(referral?.number || '—')} · ${esc(fmtDateTime(referral?.issuedAt))}
      ${referral?.kind ? ` · ${esc(KIND_LABEL[referral.kind] || referral.kind)}` : ''}
    </div>
    ${statusStamp ? `<div style="text-align:center;margin-bottom:8px">${statusStamp}</div>` : ''}
    ${patientRows(referral?.patient, referral?.targetDepartment?.name
        ? [['Yo\'naltirildi', referral.targetDepartment.name]]
        : [])}
    ${table}
    <div class="note">
      Narxlar yo'llanma berilgan kunga ko'ra ko'rsatilgan. Varaqni kassaga taqdim etish kerak.
    </div>
    ${signatureBlock('Yo\'llanma bergan', referral?.issuedByName)}
    ${letterheadFooter(clinic)}`;

    return printDocument(`Yo'llanma ${referral?.number || ''}`, body);
}

/* ═══ 2. TAHLIL NATIJASI ═════════════════════════════════════════════════════

   Bemorga beriladigan blank. Muhimi — NORMA ustuni: raqamning o'zi bemorga
   hech narsa aytmaydi. Normadan chetdagi qiymat belgilanadi. */

export function printLabResult(order: any, clinic?: PrintClinic | null): boolean {
    const items: any[] = order?.items || [];

    const flagMark = (flag?: string | null) =>
        flag === 'High' ? ' ↑' : flag === 'Low' ? ' ↓' : '';

    /* Natija IKKI qatlamli: buyurtmada tahlillar (`items`), har tahlilda
       ko'rsatkichlar (`parameters`). Masalan "Umumiy qon tahlili" ichida
       gemoglobin, leykotsitlar, EChT. Qog'ozda ham shunday ko'rinishi kerak:
       tahlil nomi sarlavha, ko'rsatkichlar uning ostida. */
    const rows = items.map((it: any) => {
        const params: any[] = Array.isArray(it.parameters) ? it.parameters : [];
        const head = `<tr><td colspan="4" style="background:#f5f5f5;font-weight:700">${esc(it.testName || it.name)}</td></tr>`;

        if (params.length === 0) {
            return head + `<tr><td colspan="4" class="muted">Natija kiritilmagan</td></tr>`;
        }

        return head + params.map((pr: any) => {
            const ref = (pr.refLow !== null && pr.refLow !== undefined)
                || (pr.refHigh !== null && pr.refHigh !== undefined)
                ? `${pr.refLow ?? ''} – ${pr.refHigh ?? ''}`
                : (pr.refText || '—');
            const cls = pr.flag === 'High' ? 'flag-high' : pr.flag === 'Low' ? 'flag-low' : '';
            return `<tr>
          <td style="padding-left:8mm">${esc(pr.name)}</td>
          <td class="num ${cls}">${esc(pr.value ?? '—')}${flagMark(pr.flag)}</td>
          <td>${esc(pr.unit || '')}</td>
          <td>${esc(ref)}</td>
        </tr>`;
        }).join('');
    }).join('');

    const body = `
    ${clinicHeader(clinic)}
    <div class="title">Laboratoriya tahlili natijasi</div>
    <div class="subtitle">
      Buyurtma № ${esc(order?.id ? String(order.id).slice(0, 8).toUpperCase() : '—')} ·
      Olindi: ${esc(fmtDateTime(order?.orderedAt))} ·
      Tayyor: ${esc(fmtDateTime(order?.completedAt))}
    </div>
    ${patientRows(order?.patient || { lastName: order?.patientName }, [
        ...(order?.doctorName ? [['Yuborgan shifokor', order.doctorName] as [string, string]] : []),
        ...(order?.priority === 'Urgent' ? [['Shoshilinch', 'Ha'] as [string, string]] : []),
    ])}
    ${items.length
            ? `<table class="grid">
        <thead><tr>
          <th>Ko'rsatkich</th>
          <th style="width:28mm" class="num">Natija</th>
          <th style="width:20mm">Birlik</th>
          <th style="width:34mm">Norma</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="note">↑ — normadan yuqori, ↓ — normadan past.</div>`
            : `<div class="box"><div class="box-title">Natija</div>Natija kiritilmagan.</div>`}
    ${order?.technicianNotes ? `<div class="box"><div class="box-title">Laborant izohi</div>${esc(order.technicianNotes)}</div>` : ''}
    ${signatureBlock('Laborant', order?.technicianName)}
    ${letterheadFooter(clinic)}`;

    return printDocument('Tahlil natijasi', body);
}

/* ═══ 3. TEKSHIRUV XULOSASI ══════════════════════════════════════════════════

   UZI, rentgen, EKG xulosasi. Bu yerda asosiysi MATN: tavsif va xulosa.
   Tasvirlar bo'lsa ular ham qo'shiladi. */

export function printStudyConclusion(study: any, clinic?: PrintClinic | null): boolean {
    const files: any[] = Array.isArray(study?.files) ? study.files : [];

    const body = `
    ${clinicHeader(clinic)}
    <div class="title">${esc(study?.modalityLabel || study?.modality || 'Tekshiruv')} xulosasi</div>
    <div class="subtitle">
      ${esc(study?.name || '')} · ${esc(fmtDateTime(study?.performedAt || study?.orderedAt))}
    </div>
    ${patientRows(study?.patient || { lastName: study?.patientName }, [
        ...(study?.orderedByName ? [['Yuborgan shifokor', study.orderedByName] as [string, string]] : []),
        ...(study?.performedByName ? [['Bajardi', study.performedByName] as [string, string]] : []),
    ])}
    <div class="box">
      <div class="box-title">Tavsif</div>
      ${esc(study?.findings || 'Kiritilmagan')}
    </div>
    <div class="box">
      <div class="box-title">Xulosa</div>
      ${esc(study?.conclusion || 'Kiritilmagan')}
    </div>
    ${files.length
            ? `<div class="note">Tasvirlar: ${files.length} ta (elektron shaklda saqlanadi).</div>`
            /* Tasvirlarni qog'ozga BOSMAYMIZ: himoyalangan manzil orqali
               kelgan surat bosma oynada ochilmaydi (u yerda token yo'q), va
               oddiy printerda UZI surati baribir o'qilmaydi. */
            : ''}
    ${signatureBlock('Shifokor', study?.performedByName || study?.orderedByName)}
    ${letterheadFooter(clinic)}`;

    return printDocument('Tekshiruv xulosasi', body);
}

/* ═══ 4. CHIQARISH EPIKRIZI ══════════════════════════════════════════════════

   Statsionardan chiqqan bemor qo'lida qoladigan asosiy hujjat. Boshqa
   klinikada davolashni davom ettirish uchun aynan shu varaq o'qiladi.

   To'rt qism ATAYLAB alohida: kirishdagi tashxis, yakuniy tashxis,
   o'tkazilgan davolash, tavsiyalar. Ilgari bitta erkin matn edi
   (`dischargeSummary`) va undan rasmiy blank tuzib bo'lmasdi. Eski
   yozuvlar uchun o'sha matn ham chiqadi. */

export function printDischarge(adm: any, clinic?: PrintClinic | null): boolean {
    const days = (() => {
        const from = new Date(adm?.admittedAt || Date.now()).getTime();
        const to = adm?.dischargedAt ? new Date(adm.dischargedAt).getTime() : Date.now();
        return Math.max(1, Math.ceil((to - from) / 864e5));
    })();

    const section = (title: string, text?: string | null) =>
        `<div class="box"><div class="box-title">${esc(title)}</div>${esc(text || 'Kiritilmagan')}</div>`;

    const rounds: any[] = Array.isArray(adm?.rounds) ? adm.rounds : [];
    const meds: any[] = Array.isArray(adm?.medicationOrders) ? adm.medicationOrders : [];

    const body = `
    ${clinicHeader(clinic)}
    <div class="title">Chiqarish epikrizi</div>
    <div class="subtitle">
      ${esc(fmtDate(adm?.admittedAt))} — ${esc(fmtDate(adm?.dischargedAt))} · ${days} kun
    </div>
    ${patientRows(adm?.patient || { lastName: adm?.patientName }, [
        ...(adm?.bed?.ward?.name ? [['Palata', `${adm.bed.ward.name} / ${adm.bed.label || ''}`] as [string, string]] : []),
        ...(adm?.doctorName ? [['Davolagan shifokor', adm.doctorName] as [string, string]] : []),
    ])}
    ${section('Kirishdagi tashxis', adm?.admissionDiagnosis || adm?.diagnosis)}
    ${section('Yakuniy tashxis', adm?.finalDiagnosis)}
    ${section("O'tkazilgan davolash", adm?.treatmentGiven)}
    ${meds.length
            ? `<table class="grid">
        <thead><tr><th>Dori</th><th style="width:26mm">Doza</th><th style="width:26mm">Yo'li</th><th style="width:34mm">Qabul</th></tr></thead>
        <tbody>${meds.map((m: any) => `<tr>
          <td>${esc(m.name)}</td><td>${esc(m.dosage || '')}</td>
          <td>${esc(m.route || '')}</td><td>${esc(m.frequency || '')}</td>
        </tr>`).join('')}</tbody>
      </table>`
            : ''}
    ${section('Tavsiyalar', adm?.recommendations)}
    ${adm?.dischargeSummary
            /* Eski yozuvlarda faqat bitta matn bor — uni yo'qotmaymiz */
            ? `<div class="box"><div class="box-title">Qo'shimcha</div>${esc(adm.dischargeSummary)}</div>`
            : ''}
    ${rounds.length ? `<div class="note">Obxodlar soni: ${rounds.length}.</div>` : ''}
    ${signatureBlock('Davolagan shifokor', adm?.doctorName)}
    ${letterheadFooter(clinic)}`;

    return printDocument('Chiqarish epikrizi', body);
}
