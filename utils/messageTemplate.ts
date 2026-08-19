/**
 * Shablon o'zgaruvchilarini almashtirish — preview uchun.
 *
 * ⚠️ MUHIM: bu `backend/server.ts` dagi `processTemplate` bilan bir xil
 * bo'lishi shart. Biri o'zgarsa, ikkinchisi ham. Aks holda preview'da bir xil,
 * bemorga esa boshqa matn ketadi.
 */

export interface TemplateData {
    patientName?: string;
    firstName?: string;
    lastName?: string;
    date?: string;
    time?: string;
    clinicName?: string;
    doctorName?: string;
    amount?: number;
}

export function processTemplate(template: string, data: TemplateData): string {
    const placeholders: Record<string, string> = {
        // Yangi (Xabarlar moduli) o'zgaruvchilar
        '{bemor_ismi}': data.firstName || data.patientName || '',
        '{bemor_familyasi}': data.lastName || '',
        '{sana}': data.date || '',
        '{vaqt}': data.time || '',
        '{klinika_nomi}': data.clinicName || '',
        '{shifokor_ismi}': data.doctorName || '',
        '{qarz}': data.amount !== undefined ? Number(data.amount).toLocaleString() : '',
        // Eski tokenlar (moslik uchun)
        '{BEMOR}': data.patientName || '',
        '{VAQT}': data.time || '',
        '{SANA}': data.date || '',
        '{MIQDOR}': data.amount !== undefined ? Number(data.amount).toLocaleString() : '',
        '{KLINIKA}': data.clinicName || '',
        '{DOKTOR}': data.doctorName || '',
    };

    return Object.keys(placeholders).reduce(
        (result, key) => result.split(key).join(placeholders[key]),
        template || ''
    );
}
