/* ─────────────────────────────────────────────────────────────────────────────
   Tahlil natijasining «ko'rinishi» — buyurtma + bemorga moslangan normalar.

   Ekrandagi natija oynasi ham, bemorga ketadigan PDF ham AYNAN SHU yerdan
   o'qiydi (2026-11-26). Ilgari bu yig'ish multiprofile.ts ichidagi GET
   marshrutida edi; PDF uchun nusxa olinsa, ikki joyda norma ikki xil
   tanlanib qolishi mumkin edi.
   ───────────────────────────────────────────────────────────────────────────── */

/** Yosh (to'liq yil) — tahlil normasini tanlashda kerak */
export function ageFromDob(dob?: string | null): number | null {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (365.25 * 864e5));
}

/**
 * Ko'rsatkich uchun bemorga mos normani tanlaydi.
 * Bir ko'rsatkichda jins/yosh bo'yicha bir necha qator bo'lishi mumkin —
 * eng aniq mos keladiganini olamiz.
 */
export function pickReference(params: any[], sex: string | null, age: number | null) {
    const scored = params.map((p) => {
        let score = 0;
        if (p.sex) {
            if (!sex || p.sex !== sex) return null;   // mos kelmadi
            score += 2;
        }
        if (p.ageMin != null || p.ageMax != null) {
            if (age == null) return null;
            if (p.ageMin != null && age < p.ageMin) return null;
            if (p.ageMax != null && age > p.ageMax) return null;
            score += 1;
        }
        return { p, score };
    }).filter(Boolean) as { p: any; score: number }[];

    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[0].p;
}

/** Qiymatni normaga solishtirib bayroq qo'yadi */
export function flagFor(valueNum: number | null, ref: { refLow: number | null; refHigh: number | null } | null): string {
    if (valueNum == null || !ref) return 'Normal';
    if (ref.refLow != null && valueNum < ref.refLow) return 'Low';
    if (ref.refHigh != null && valueNum > ref.refHigh) return 'High';
    return 'Normal';
}

export interface LabParamView {
    parameterId: string;
    name: string;
    unit: string | null;
    refLow: number | null;
    refHigh: number | null;
    refText: string | null;
    value: string;
    valueNum: number | null;
    flag: string | null;
    note: string | null;
}

/**
 * Buyurtmani natijalari bilan o'qiydi. Begona klinikaniki yoki yo'q bo'lsa — null.
 * Bir xil nomli ko'rsatkichlardan bemorga mos keladiganini tanlaymiz,
 * shunda blankada har ko'rsatkich bir marta, to'g'ri norma bilan chiqadi.
 */
export async function loadLabResultView(prisma: any, orderId: string, clinicId: string) {
    const order = await prisma.labOrder.findUnique({
        where: { id: orderId },
        include: {
            patient: true,
            items: {
                include: {
                    test: { include: { parameters: { orderBy: { sortOrder: 'asc' } } } },
                    results: true,
                },
            },
        },
    });
    if (!order || order.clinicId !== clinicId) return null;

    const sex = order.patient?.gender || null;
    const age = ageFromDob(order.patient?.dob);

    const items = order.items.map((item: any) => {
        const byName = new Map<string, any[]>();
        for (const p of item.test.parameters) {
            if (!byName.has(p.name)) byName.set(p.name, []);
            byName.get(p.name)!.push(p);
        }
        const parameters: LabParamView[] = Array.from(byName.entries()).map(([name, variants]) => {
            const ref = pickReference(variants, sex, age) || variants[0];
            const result = item.results.find((r: any) => r.parameterId === ref.id)
                || item.results.find((r: any) => variants.some((v: any) => v.id === r.parameterId));
            return {
                parameterId: ref.id, name, unit: ref.unit,
                refLow: ref.refLow, refHigh: ref.refHigh, refText: ref.refText,
                value: result?.value ?? '', valueNum: result?.valueNum ?? null,
                flag: result?.flag ?? null, note: result?.note ?? null,
            };
        });
        return { id: item.id, testId: item.testId, testName: item.testName, status: item.status, price: item.price, parameters };
    });

    /* Klinika natijani tasdiqlashni yoqqanmi — ekran «Tasdiqlash» tugmasini,
       qog'oz «dastlabki natija» belgisini shundan biladi (migratsiya 0045) */
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { labVerifyRequired: true } });

    return { ...order, items, patientAge: age, patientSex: sex, verifyRequired: !!clinic?.labVerifyRequired };
}

/** Tasdiq kutilyaptimi: klinika «natijani tasdiqlash» ni yoqqan va buyurtma
 *  hali tasdiqlanmagan. O'chiq bo'lsa — hech qachon (avvalgi xatti-harakat). */
export function awaitsVerification(clinic: { labVerifyRequired?: boolean | null } | null | undefined,
    order: { verifiedAt?: Date | string | null } | null | undefined): boolean {
    return !!clinic?.labVerifyRequired && !order?.verifiedAt;
}

/** Xodim kaliti «ROL:id» — tokendagi id bo'yicha. Ega uchun «CLINIC_ADMIN:klinika».
 *  Ism EMAS: bir xil ismli xodimlar bor, ismsiz xodim ham bo'lishi mumkin. */
export function staffKey(user: any): string | null {
    if (!user?.role) return null;
    const id = user.doctorId || user.technicianId || user.receptionistId || user.nurseId
        || (user.role === 'CLINIC_ADMIN' ? user.clinicId : null) || user.id || null;
    return id ? `${user.role}:${id}` : null;
}
