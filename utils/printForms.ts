/* ─────────────────────────────────────────────────────────────────────────────
   Uchta rasmiy blank: yo'llanma, tahlil natijasi, tekshiruv xulosasi.

   Hammasi bitta asosga quriladi (printDocument.ts) va bitta qoidaga bo'ysunadi:
   qog'ozda DASTUR interfeysi ko'rinmaydi — faqat hujjat. Bemor bu varaqni
   boshqa klinikaga ko'rsatadi.
   ───────────────────────────────────────────────────────────────────────────── */

import {
    printDocument, clinicHeader, signatureBlock, letterheadFooter,
    esc, fmtMoney, fmtDate, fmtDateTime, PrintClinic, PrintLayout,
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
    const hasAnyValue = items.some((it: any) => (Array.isArray(it.parameters) ? it.parameters : [])
        .some((pr: any) => String(pr?.value ?? '').trim() !== ''));

    const flagMark = (flag?: string | null) =>
        flag === 'High' ? ' ↑' : flag === 'Low' ? ' ↓' : '';

    /* Natija IKKI qatlamli: buyurtmada tahlillar (`items`), har tahlilda
       ko'rsatkichlar (`parameters`). Masalan "Umumiy qon tahlili" ichida
       gemoglobin, leykotsitlar, EChT. Qog'ozda ham shunday ko'rinishi kerak:
       tahlil nomi sarlavha, ko'rsatkichlar uning ostida. */
    const rows = items.map((it: any) => {
        /* Qiymati kiritilmagan ko'rsatkich qog'ozga «—» bo'lib tushmaydi */
        const params: any[] = (Array.isArray(it.parameters) ? it.parameters : [])
            .filter((pr: any) => String(pr?.value ?? '').trim() !== '');
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

    /* TASDIQ (migratsiya 0045). Klinika yoqqan va hali tasdiqlanmagan natija
       ham bosiladi — to'smaymiz — lekin varaqning o'zi buni aytadi. */
    const unverified = !!order?.verifyRequired && !order?.verifiedAt;
    const verifiedLine = order?.verifiedAt
        ? `<div class="note">Tasdiqladi: ${esc([order.verifiedByName, fmtDateTime(order.verifiedAt)].filter(Boolean).join(' · '))}</div>`
        : '';
    const number = order?.sampleCode ? String(order.sampleCode) : order?.id ? String(order.id).slice(0, 8).toUpperCase() : '—';

    const body = `
    ${clinicHeader(clinic)}
    ${unverified ? `<div style="text-align:center;margin:4px 0"><span class="stamp">DASTLABKI NATIJA — TASDIQLANMAGAN</span></div>` : ''}
    <div class="title">Laboratoriya tahlili natijasi</div>
    <div class="subtitle">
      Buyurtma № ${esc(number)} ·
      Olindi: ${esc(fmtDateTime(order?.orderedAt))} ·
      Tayyor: ${esc(fmtDateTime(order?.completedAt))}
    </div>
    ${patientRows(order?.patient || { lastName: order?.patientName }, [
        ...(order?.doctorName ? [['Yuborgan shifokor', order.doctorName] as [string, string]] : []),
        ...(order?.priority === 'Urgent' ? [['Shoshilinch', 'Ha'] as [string, string]] : []),
    ])}
    ${hasAnyValue
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
    ${verifiedLine ? `<div style="clear:both;padding-top:4mm">${verifiedLine}</div>` : ''}
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

/* ═══ 5. BEMOR HUJJATI (rozilik, shartnoma) ══════════════════════════════════

   Bu blank boshqalardan farq qiladi: asosiy narsa MATN, va u tizimdan emas,
   HUJJATNING O'ZIDAN olinadi (`textSnapshot`). Sabab: shablon keyin
   o'zgaradi, bemor imzolagan matn esa o'zgarmasligi kerak.

   Imzo joyi IKKITA: bemor va klinika xodimi. Faqat xodim imzosi bo'lgan
   rozilikning huquqiy kuchi yo'q. */

export function printPatientDocument(doc: any, clinic?: PrintClinic | null): boolean {
    const p = doc?.patient || {};
    const signed = !!doc?.signedAt;

    const body = `
    ${clinicHeader(clinic || doc?.clinic)}
    <div class="title">${esc(doc?.title || 'Hujjat')}</div>
    <div class="subtitle">
      ${doc?.number ? `№ ${esc(doc.number)} · ` : ''}${esc(fmtDate(doc?.createdAt))}
      ${signed ? ` · imzolangan ${esc(fmtDate(doc.signedAt))}` : ''}
    </div>

    <table class="rows">
      <tr><td class="k">Bemor:</td><td>${esc(`${p.lastName || ''} ${p.firstName || ''}`.trim() || '—')}</td></tr>
      <tr><td class="k">Tug'ilgan sana:</td><td>${esc(fmtDate(p.dob))}</td></tr>
      ${p.cardNumber ? `<tr><td class="k">Karta raqami:</td><td>${esc(p.cardNumber)}</td></tr>` : ''}
      ${p.phone ? `<tr><td class="k">Telefon:</td><td>${esc(p.phone)}</td></tr>` : ''}
      ${p.address ? `<tr><td class="k">Manzil:</td><td>${esc(p.address)}</td></tr>` : ''}
    </table>

    <!-- Matn hujjatning o'zidan: imzolangan variant o'zgarmaydi.
         white-space:pre-wrap — satr ko'chishlari saqlanadi. -->
    <div style="white-space: pre-wrap; line-height: 1.5; margin: 10px 0 4px; font-size: 11.5pt">${esc(doc?.textSnapshot || '')}</div>

    <div style="margin-top: 14mm">
      <table style="width:100%">
        <tr>
          <td style="width:50%; padding-right:8mm">
            <div style="border-bottom:1px solid #000; height:8mm"></div>
            <div style="font-size:9.5pt; text-align:center; margin-top:2px">
              Bemor${p.lastName ? ` — ${esc(p.lastName)} ${esc(p.firstName || '')}` : ''}
            </div>
          </td>
          <td style="width:50%; padding-left:8mm">
            <div style="border-bottom:1px solid #000; height:8mm"></div>
            <div style="font-size:9.5pt; text-align:center; margin-top:2px">
              Klinika xodimi${doc?.signedByName ? ` — ${esc(doc.signedByName)}` : ''}
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${letterheadFooter(clinic || doc?.clinic)}`;

    return printDocument(doc?.title || 'Hujjat', body);
}

/* ═══ 6. RETSEPT ═════════════════════════════════════════════════════════════

   Retsept dasturda YOZILARDI, lekin uni bosib bo'lmasdi va hech qayerda
   ko'rinmasdi ham: `prescriptions.getAll` ni chaqiradigan ekran yo'q edi.
   Ya'ni dori tayinlanardi, bemor esa qo'lida hech narsasiz chiqib ketardi.

   Qog'ozda dori nomi va qabul tartibi eng katta shrift bilan turadi —
   bemor uyda aynan shu ikkitasini o'qiydi. */

export function printPrescription(rx: any, clinic?: PrintClinic | null): boolean {
    const items: any[] = Array.isArray(rx?.items) ? rx.items : [];

    /* Qabul tartibi bitta satrga yig'iladi: "500 mg · kuniga 2 mahal · 7 kun".
       Bo'sh maydonlar tushib qoladi, ya'ni "· ·" ko'rinmaydi. */
    const regimen = (it: any) => [
        it?.dosage,
        it?.frequency,
        /* Ovqat vaqti (2026-11-26) — bemor eng ko'p so'raydigani */
        it?.mealTiming === 'before' ? 'ovqatdan oldin' : it?.mealTiming === 'with' ? 'ovqat bilan' : it?.mealTiming === 'after' ? 'ovqatdan keyin' : null,
        it?.durationDays ? `${it.durationDays} kun` : null,
    ].filter(Boolean).join(' · ') || '—';

    const table = items.length
        ? `<table class="grid">
        <thead><tr>
          <th style="width:10mm">№</th><th>Dori</th><th style="width:60mm">Qabul tartibi</th>
        </tr></thead>
        <tbody>${items.map((it, i) => `<tr>
          <td>${i + 1}</td>
          <td><b>${esc(it?.name || '—')}</b>${it?.instructions ? `<br><span style="font-size:9pt">${esc(it.instructions)}</span>` : ''}</td>
          <td>${esc(regimen(it))}</td>
        </tr>`).join('')}</tbody>
      </table>`
        : `<div class="note">Dorilar ko'rsatilmagan.</div>`;

    const body = `
    ${clinicHeader(clinic || rx?.clinic)}
    <div class="title">Retsept</div>
    <div class="subtitle">${esc(fmtDate(rx?.date))}</div>
    ${patientRows(rx?.patient || { lastName: rx?.patientName })}
    ${table}
    ${rx?.notes ? `<div class="box"><div class="box-title">Izoh</div>${esc(rx.notes)}</div>` : ''}
    <div class="note">
      Dorilarni faqat shifokor ko'rsatgan tartibda qabul qiling. Yon ta'sir
      sezilsa qabulni to'xtatib, shifokorga murojaat qiling.
    </div>
    ${signatureBlock('Shifokor', rx?.doctorName)}
    ${letterheadFooter(clinic || rx?.clinic)}`;

    return printDocument('Retsept', body);
}

/* ═══ 7. NAMUNA VARAQ (chekkalarni sozlash) ══════════════════════════════════

   Sozlamalar → «Bosma blank» → «Namuna chop etish». SAQLANMAGAN chekkalar
   bilan bosiladi: klinika oldindan bosilgan blankaga bitta varaq urib
   ko'radi, keyin saqlaydi. Punktir ramka — matn chiqadigan joyning chegarasi;
   u har sahifada turadi (`position: fixed` bosmada sahifaga bog'lanadi). */

export function printLayoutSample(layout: PrintLayout, clinicName?: string | null): boolean {
    const body = `
    <div style="position:fixed;inset:0;border:1px dashed #888;pointer-events:none"></div>
    ${clinicHeader(clinicName ? { name: clinicName } : null, layout)}
    <div class="title">Namuna varaq</div>
    <div class="subtitle">Chekkalar: tepa ${layout.topMm} mm · past ${layout.bottomMm} mm · yon ${layout.sideMm} mm${layout.hideHeader ? ' · shapkasiz' : ''}</div>
    ${patientRows({ lastName: 'Familiya', firstName: 'Ism', dob: '1990-01-01', gender: 'Male' })}
    <table class="grid">
      <thead><tr><th style="width:10mm">№</th><th>Dori</th><th style="width:60mm">Qabul tartibi</th></tr></thead>
      <tbody>
        <tr><td>1</td><td><b>Paratsetamol 500 mg</b></td><td>kuniga 2 mahal · ovqatdan keyin · 5 kun</td></tr>
        <tr><td>2</td><td><b>Vitamin C 500 mg</b></td><td>kuniga 1 mahal · 10 kun</td></tr>
      </tbody>
    </table>
    <div class="note">
      Punktir ramka — matn chiqadigan joy. Ramka blankadagi bosilgan shapka yoki
      pastki yozuvga tegsa, Sozlamalarda tegishli chekkani kattalashtiring.
    </div>
    ${signatureBlock('Shifokor')}`;
    return printDocument('Namuna varaq', body, layout);
}

/* ═══ 8. OYLIK VARAQASI (xodim kartasi → Maosh) ═══════════════════════════════

   Xodim «nega shuncha» deb so'raydi — javob qog'ozda bo'lishi kerak:
   asosiy qism (shifokorda — qaysi xizmatlardan qancha ulush), bonuslar,
   jarimalar, jami va to'langani. Pastda ikki imzo: xodim pulni oldi,
   kassir berdi. Ma'lumot `GET /api/hr/staff/:role/:id/month` javobidan. */

/** Ulush jadvali bir varaqdan oshib ketmasin; qolgani bitta «yana N ta» qatorida */
const MAX_SLIP_ROWS = 300;

export interface SalarySlipInput {
    periodLabel: string;
    staffName: string;
    roleLabel?: string;
    isDoctor: boolean;
    month: any;
}

export function salarySlipBody(input: SalarySlipInput, clinic?: PrintClinic | null): string {
    const m = input.month || {};
    const adjustments: any[] = Array.isArray(m.adjustments) ? m.adjustments : [];
    const bonuses = adjustments.filter(a => a?.type === 'Bonus');
    const penalties = adjustments.filter(a => a?.type === 'Penalty');
    /* Fix maoshli shifokorda foiz qatorlari TO'LANMAYDI (`payroll.ts`):
       ularni qog'ozga chiqarsak, jadval jami summaga to'g'ri kelmaydi.
       Faqat «Fix maosh» qatori qoladi. */
    const allItems: any[] = input.isDoctor && Array.isArray(m.share?.items) ? m.share.items : [];
    const items = m.staff?.salaryType === 'fixed' ? allItems.filter(i => i?.kind === 'Fixed') : allItems;
    const shown = items.slice(0, MAX_SLIP_ROWS);
    const hidden = items.slice(MAX_SLIP_ROWS);
    const payment = m.payment;
    const att = m.attendance;

    const rows: [string, string][] = [
        ['Xodim', input.staffName || '—'],
        ...(input.roleLabel ? [['Lavozimi', input.roleLabel] as [string, string]] : []),
        /* Davr sarlavha ostida turadi — bu yerda takrorlanmaydi */
        ...(att && (att.present || att.absent || att.late || att.excused)
            ? [['Davomat', `keldi ${att.present || 0} · kelmadi ${att.absent || 0} · kechikdi ${att.late || 0} · sababli ${att.excused || 0}`] as [string, string]]
            : []),
    ];

    const shareTable = items.length
        ? `<div class="box-title" style="margin-top:8px">Ulush hisobi</div>
      <table class="grid">
        <thead><tr>
          <th style="width:10mm">№</th><th>Xizmat</th>
          <th style="width:30mm" class="num">To'langan</th>
          <th style="width:22mm" class="num">Foiz</th>
          <th style="width:30mm" class="num">Ulush</th>
        </tr></thead>
        <tbody>${shown.map((it, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(it?.name || '—')}</td>
          <td class="num">${fmtMoney(it?.paid || 0)}</td>
          <td class="num">${esc(it?.percent ?? 0)}%</td>
          <td class="num">${fmtMoney(it?.share || 0)}</td>
        </tr>`).join('')}${hidden.length ? `<tr>
          <td></td><td colspan="3">… yana ${hidden.length} ta xizmat</td>
          <td class="num">${fmtMoney(hidden.reduce((s, it) => s + (Number(it?.share) || 0), 0))}</td>
        </tr>` : ''}</tbody>
      </table>`
        : '';

    const adjList = (title: string, list: any[], sign: string) => list.length
        ? `<div class="box-title" style="margin-top:8px">${esc(title)}</div>
      <table class="grid"><tbody>${list.map(a => `<tr>
        <td>${esc(a?.reason || '—')}</td>
        <td class="num" style="width:34mm">${sign}${fmtMoney(a?.amount || 0)}</td>
      </tr>`).join('')}</tbody></table>`
        : '';

    /* Shifokorda `m.base` — allaqachon SOF summa (hisoblangan minus eski
       vedomost orqali to'langan). Qog'ozda zanjir to'liq ko'rinadi:
       hisoblangan → ayirilgan → bonus/jarima → to'lanishi kerak. Aks holda
       «ayirildi» qatori ikkinchi marta ayirilgandek o'qiladi. */
    const baseRows: [string, string, boolean][] = input.isDoctor && m.share
        ? [
            ['Hisoblangan ulush va oylik', fmtMoney(m.share.accrued || 0), false],
            ...(m.share.paidViaRuns > 0
                ? [["Eski vedomost orqali to'langan", `−${fmtMoney(m.share.paidViaRuns)}`, false] as [string, string, boolean]]
                : []),
        ]
        : [[input.isDoctor ? 'Ulush va oylik' : 'Asosiy oylik', fmtMoney(m.base || 0), false]];
    const summary: [string, string, boolean][] = [
        ...baseRows,
        ['Bonus', `+${fmtMoney(m.bonus || 0)}`, false],
        ['Jarima', `−${fmtMoney(m.penalty || 0)}`, false],
        ["To'lanishi kerak", fmtMoney(m.due || 0), true],
        ...(payment
            ? [[`To'landi (${fmtDate(payment.paidAt)})`, fmtMoney(payment.amount || 0), true] as [string, string, boolean]]
            : []),
    ];

    return `
    ${clinicHeader(clinic)}
    <div class="title">Oylik varaqasi</div>
    <div class="subtitle">${esc(input.periodLabel)}</div>
    <table class="rows">${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}:</td><td>${esc(v)}</td></tr>`).join('')}</table>
    ${shareTable}
    ${adjList('Bonuslar', bonuses, '+')}
    ${adjList('Jarimalar', penalties, '−')}
    <table class="grid" style="margin-top:10px">
      <tbody>${summary.map(([k, v, strong]) => `<tr${strong ? ' style="font-weight:700"' : ''}>
        <td>${esc(k)}</td><td class="num" style="width:40mm">${esc(v)} so'm</td>
      </tr>`).join('')}</tbody>
    </table>
    ${payment ? '' : `<div class="note">Hali to'lanmagan.</div>`}
    <div style="display:flex;justify-content:space-between;gap:10mm">
      <div class="sign" style="float:none">
        <div class="sign-line"></div><div class="sign-label">Xodim imzosi</div>
      </div>
      <div class="sign" style="float:none">
        <div class="sign-line"></div><div class="sign-label">Kassir${payment?.paidByName ? ` — ${esc(payment.paidByName)}` : ''}</div>
      </div>
    </div>`;
}

export function printSalarySlip(input: SalarySlipInput, clinic?: PrintClinic | null): boolean {
    return printDocument(`Oylik varaqasi — ${input.staffName}`, salarySlipBody(input, clinic));
}
