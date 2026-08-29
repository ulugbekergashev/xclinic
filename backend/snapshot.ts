/* ─────────────────────────────────────────────────────────────────────────────
   YAGONA HISOBLASH QATLAMI — bitta raqam, bitta manba (S2.1).

   MUAMMO. Audit bir vaqtning o'zida to'rtta qarz raqamini topdi:
   Bosh sahifa «0», Bemorlar «0», Kassa «0», Hisobot «11 501 043».
   Qabullar soni ham mos kelmasdi (17 / 17 / 18), o'rtacha chek ham
   (199 024 / 78 457).

   SABAB — ta'rif emas, MANBA. Har ekran qarzni boshqacha o'lchardi:

   | Ekran | Nimadan sanardi | Qayerda |
   |---|---|---|
   | Bosh sahifa | `Transaction.status IN (Pending, Overdue)` | brauzerda |
   | Bemorlar | xuddi shu, lekin bemor ISMI bo'yicha moslashtirib | brauzerda |
   | Hisobot | `VisitCharge.total − paidAmount` | serverda |

   Ikki xil ma'lumot modeli va ikki xil qamrov. Brauzerdagilar bundan
   tashqari faqat YUKLANGAN oynani ko'rardi (oxirgi 45 kun, 500 bemor) —
   ya'ni ular butun bazani emas, ekranga kelgan qismini sanardi.

   TO'G'RI MANBA `billing.ts` da yozib qo'yilgan:

       «Qarz alohida saqlanmaydi — u to'lanmagan qatorlarning yig'indisi.
        `Patient.balance` esa avans (oldindan to'lov) uchun ishlatiladi.»

   Ya'ni qarz = Σ(VisitCharge.total − paidAmount), bekor qilinganlardan
   tashqari. `Transaction.status = 'Pending'` — eski model. `Patient.balance`
   esa umuman qarz emas, u AVANS va musbat bo'ladi (shuning uchun bosh
   sahifadagi `balance < 0` tekshiruvi hech qachon ishlamasdi).

   BU FAYL — yagona javob beruvchi. Yangi ekran raqam ko'rsatmoqchi bo'lsa,
   uni O'ZI SANAMAYDI, shu yerdan oladi.
   ───────────────────────────────────────────────────────────────────────── */

import { som } from './money';
import { tashkentDateStr, tashkentRangeBounds } from './tashkentTime';

export interface Snapshot {
    /** Davr chegaralari — javob qaysi oraliq uchun ekani aniq bo'lsin. */
    range: { from: string; to: string };

    /** QARZ — davrga bog'liq EMAS, ayni damdagi holat.
     *  Direktor «qancha qarz bor?» deganda «shu oyda paydo bo'lgani» emas,
     *  «hozir yig'ilmagani» ni so'raydi. */
    debt: {
        amount: number;
        /** To'lanmagan qatorlar soni */
        charges: number;
        /** Qarzi bor BEMORLAR soni — qatorlar soni emas */
        patients: number;
    };

    /** Davr ichidagi pul harakati. */
    period: {
        /** Buyurilgan xizmatlar summasi (hisoblangan tushum) */
        charged: number;
        /** Shu qatorlar bo'yicha haqiqatan olingan pul */
        collected: number;
        /** Davr ichida qolgan qarz */
        due: number;
        /** Tashriflar (qabullar) soni */
        visits: number;
        /** Qabulga yozilganlar soni */
        appointments: number;
        /** O'rtacha chek = buyurilgan summa / tashriflar soni */
        avgCheck: number;
    };

    patients: {
        total: number;
        active: number;
        /** Oxirgi 7 kunda BAZAGA QO'SHILGAN bemorlar.
         *  Ilgari `lastVisit` bo'yicha sanalardi va «Never» ham «yangi» deb
         *  hisoblanardi — shuning uchun butun baza «yangi» chiqardi. */
        newLast7Days: number;
    };
}

/** `YYYY-MM-DD`, `n` kun oldin (Toshkent kuni bo'yicha). */
function daysAgo(n: number): string {
    const today = tashkentDateStr();
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}

/**
 * Klinikaning moliyaviy va bemor ko'rsatkichlari — barcha ekranlar uchun
 * YAGONA manba.
 *
 * `from`/`to` — Toshkent kuni (`YYYY-MM-DD`). Berilmasa: joriy oy boshidan
 * bugungacha.
 */
export async function financialSnapshot(
    prisma: any,
    clinicId: string,
    fromArg?: string,
    toArg?: string,
): Promise<Snapshot> {
    const today = tashkentDateStr();
    const from = fromArg || today.slice(0, 8) + '01';
    const to = toArg || today;
    const { start, end } = tashkentRangeBounds(from, to);

    const notCancelled = { status: { not: 'Cancelled' } };

    const [
        openCharges,
        periodCharges,
        visitCount,
        appointmentCount,
        patientsTotal,
        patientsActive,
        patientsNew,
    ] = await Promise.all([
        /* QARZ — davr filtri ATAYLAB yo'q. Bemorning uch oy oldingi qarzi
           ham qarz. Bemorlar ro'yxati `distinct` bilan olinadi: bitta
           bemorda beshta to'lanmagan qator bo'lishi mumkin va u BITTA
           qarzdor. Auditdagi «Jami bemorlar 159, bazada 67» aynan shu
           farqni sanamaslikdan chiqqan edi. */
        prisma.visitCharge.findMany({
            where: { clinicId, status: 'Unpaid' },
            select: { total: true, paidAmount: true, patientId: true },
        }),
        prisma.visitCharge.aggregate({
            where: { clinicId, ...notCancelled, createdAt: { gte: start, lte: end } },
            _sum: { total: true, paidAmount: true },
            _count: { _all: true },
        }),
        prisma.visit.count({ where: { clinicId, date: { gte: from, lte: to } } }),
        prisma.appointment.count({ where: { clinicId, date: { gte: from, lte: to } } }),
        prisma.patient.count({ where: { clinicId } }),
        prisma.patient.count({ where: { clinicId, status: 'Active' } }),
        prisma.patient.count({
            where: { clinicId, createdAt: { gte: new Date(`${daysAgo(7)}T00:00:00.000Z`) } },
        }),
    ]);

    let debtAmount = 0;
    const debtPatients = new Set<string>();
    for (const c of openCharges) {
        const left = (c.total || 0) - (c.paidAmount || 0);
        if (left <= 0) continue;
        debtAmount += left;
        if (c.patientId) debtPatients.add(c.patientId);
    }

    const charged = som(periodCharges._sum.total || 0);
    const collected = som(periodCharges._sum.paidAmount || 0);

    return {
        range: { from, to },
        debt: {
            amount: som(debtAmount),
            charges: openCharges.length,
            patients: debtPatients.size,
        },
        period: {
            charged,
            collected,
            due: som(charged - collected),
            visits: visitCount,
            appointments: appointmentCount,
            /* O'rtacha chek — TASHRIFGA bo'linadi, qatorga emas. Bitta
               tashrifda uch qator bo'lishi mumkin (konsultatsiya + tahlil +
               dori) va ular bitta chek. Auditdagi 199 024 va 78 457 farqi
               shundan: biri tashrifga, ikkinchisi qatorga bo'lardi. */
            avgCheck: visitCount > 0 ? som(charged / visitCount) : 0,
        },
        patients: {
            total: patientsTotal,
            active: patientsActive,
            newLast7Days: patientsNew,
        },
    };
}
