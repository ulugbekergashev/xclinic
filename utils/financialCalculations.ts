import { Transaction, Expense, Doctor, Service } from '../types';

// Yangi moliya modeli (kassa usuli + shifokor ulushi hisobi):
// - Kirim = status 'Paid' bo'lgan to'lovlar (Transaction).
// - Shifokor ulushi AVTOMATIK hisoblanadi: to'lov summasi × foiz (hisoblangan ulush).
// - Kassadan shifokorga pul berilganda 'DoctorShare' kategoriyali Expense yoziladi —
//   bu hisoblangan ulushni "to'laydi", lekin sof foydadan QAYTA ayirilmaydi (double-count yo'q).
// - Sof foyda = Kirim − hisoblangan ulush − boshqa xarajatlar (DoctorShare dan tashqari).

export interface DoctorShareSummary {
    doctorId: string;
    doctorName: string;
    percentage: number;
    grossRevenue: number; // shifokorga tegishli kirim (Paid)
    accrued: number;      // hisoblangan ulush
    paid: number;         // to'langan (DoctorShare xarajatlari)
    balance: number;      // qoldiq (accrued - paid)
}

export interface TotalFinancials {
    totalRevenue: number;       // barcha kirim (Paid to'lovlar)
    doctorShareAccrued: number; // hisoblangan shifokor ulushlari jami
    doctorSharePaid: number;    // to'langan shifokor ulushlari jami
    totalExpenses: number;      // barcha xarajatlar (kassadan chiqqan pul, DoctorShare bilan)
    otherExpenses: number;      // sof foydada ayiriladigan xarajatlar (DoctorShare dan tashqari)
    labCosts: number;           // shundan: Laboratoriya kategoriyasi
    inventoryCosts: number;     // shundan: Ombor kategoriyasi
    netProfit: number;          // sof foyda
}

// Shifokor ismini qat'iy solishtirish uchun normalizatsiya:
// "Dr. Alisher Atajanov" === "Atajanov Alisher" (prefiks/tartib/punktuatsiyadan qat'i nazar),
// lekin qism-satr (includes) moslashtirish YO'Q — turli shifokorlar aralashmaydi.
export function normalizeDoctorName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\bdr[._]?\s*/g, '')
        .replace(/[.,_]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
}

// Tranzaksiya shu shifokorga tegishlimi — qat'iy tekshiruv:
// doctorId bor bo'lsa faqat id tengligi; yo'q bo'lsa (eski yozuvlar) faqat aniq ism tengligi.
export function transactionBelongsToDoctor(tx: Transaction, doctor: Doctor): boolean {
    if (tx.doctorId) return tx.doctorId === doctor.id;
    const txDocName = (tx.doctorName || '').trim();
    if (!txDocName) return false;
    return normalizeDoctorName(txDocName) === normalizeDoctorName(`${doctor.lastName} ${doctor.firstName}`);
}

// Tranzaksiyani shifokorga biriktirish: doctorId → aniq ism → yagona shifokor fallback
export function findDoctorForTransaction(tx: Transaction, doctors: Doctor[]): Doctor | undefined {
    let doctor = doctors.find(d => transactionBelongsToDoctor(tx, d));

    // Yagona shifokorli klinikada barcha kirim o'sha shifokorga tegishli
    if (!doctor && doctors.length === 1) {
        doctor = doctors[0];
    }
    return doctor;
}

/**
 * Har bir shifokor bo'yicha ulush hisobi: hisoblangan / to'langan / qoldiq.
 * transactions va expenses bir xil davr filtri bilan berilishi kerak.
 */
export function calculateDoctorShares(
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[]
): DoctorShareSummary[] {
    const summaries = new Map<string, DoctorShareSummary>();
    doctors.forEach(d => {
        summaries.set(d.id, {
            doctorId: d.id,
            doctorName: `${d.lastName} ${d.firstName}`,
            percentage: d.percentage || 0,
            grossRevenue: 0,
            accrued: 0,
            paid: 0,
            balance: 0,
        });
    });

    transactions.forEach(tx => {
        if (tx.status !== 'Paid') return;
        const doctor = findDoctorForTransaction(tx, doctors);
        if (!doctor) return;
        const s = summaries.get(doctor.id)!;
        s.grossRevenue += tx.amount;
        if (s.percentage > 0) {
            s.accrued += tx.amount * (s.percentage / 100);
        }
    });

    expenses.forEach(exp => {
        if (exp.category !== 'DoctorShare' || !exp.doctorId) return;
        const s = summaries.get(exp.doctorId);
        if (s) s.paid += exp.amount;
    });

    summaries.forEach(s => { s.balance = s.accrued - s.paid; });
    return Array.from(summaries.values());
}

/**
 * Klinika bo'yicha umumiy moliya: kirim, xarajatlar, sof foyda.
 * Finance sahifasi va Dashboard shu bitta manbadan foydalanadi.
 */
export function calculateTotalFinancials(
    transactions: Transaction[],
    expenses: Expense[],
    doctors: Doctor[]
): TotalFinancials {
    let totalRevenue = 0;
    transactions.forEach(tx => {
        if (tx.status === 'Paid') totalRevenue += tx.amount;
    });

    const shares = calculateDoctorShares(transactions, expenses, doctors);
    const doctorShareAccrued = shares.reduce((sum, s) => sum + s.accrued, 0);
    const doctorSharePaid = shares.reduce((sum, s) => sum + s.paid, 0);

    let totalExpenses = 0;
    let otherExpenses = 0;
    let labCosts = 0;
    let inventoryCosts = 0;
    expenses.forEach(exp => {
        totalExpenses += exp.amount;
        if (exp.category === 'DoctorShare') return; // sof foydada accrued orqali hisoblangan
        otherExpenses += exp.amount;
        if (exp.category === 'Lab') labCosts += exp.amount;
        if (exp.category === 'Inventory') inventoryCosts += exp.amount;
    });

    const netProfit = totalRevenue - doctorShareAccrued - otherExpenses;

    return {
        totalRevenue,
        doctorShareAccrued,
        doctorSharePaid,
        totalExpenses,
        otherExpenses,
        labCosts,
        inventoryCosts,
        netProfit,
    };
}

/**
 * Bitta shifokor uchun ulush hisobi (DoctorsAnalytics / DoctorDetails).
 * transactions — shu shifokorga tegishli (yoki umumiy, biriktirish ichkarida) to'lovlar.
 */
export function calculateDoctorShare(
    transactions: Transaction[],
    doctor: Doctor,
    expenses: Expense[] = []
): DoctorShareSummary {
    const [summary] = calculateDoctorShares(transactions, expenses, [doctor]);
    return summary;
}

/**
 * Qabul notes matnidan (bajarilgan protseduralar ro'yxati) summani hisoblaydi.
 * PatientDetails (to'lov modali) va Dashboard (to'lanmagan qabullar paneli) shu bitta manbadan foydalanadi.
 */
export function calculateAppointmentTotal(
    appointmentNotes: string,
    services: Service[]
): { total: number; breakdown: string } {
    if (!appointmentNotes) return { total: 0, breakdown: '' };

    try {
        const sortedServices = [...(services || [])].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
        let total = 0;
        const procedures: string[] = [];
        const lines = appointmentNotes.split('\n');

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.includes('Bajarilgan ishlar:') || trimmedLine.includes("Qo'shimcha")) {
                return;
            }

            // 1. Try to parse price from brackets [100 000 UZS]
            const priceMatch = trimmedLine.match(/\[([\d\s]+)\s*UZS\]/i);
            if (priceMatch) {
                const priceStr = priceMatch[1].replace(/\s/g, '');
                const price = parseFloat(priceStr);
                if (!isNaN(price)) {
                    total += price;
                    // Extract clean name before the brackets
                    const nameMatch = trimmedLine.match(/^-\s*(.*?)\s*\[/);
                    const name = nameMatch ? nameMatch[1].trim() : trimmedLine;
                    procedures.push(`${name}|${price.toLocaleString().replace(/,/g, ' ')}`);
                    return; // Skip to next line
                }
            }

            // 2. Fallback: Try fuzzy matching with service list (for old format)
            const cleanLine = trimmedLine.toLowerCase();

            let matched = false;
            for (const service of sortedServices) {
                const serviceNameLower = service.name.toLowerCase();
                if (cleanLine.includes(serviceNameLower) || serviceNameLower.includes(cleanLine)) {
                    total += service.price;
                    procedures.push(`${service.name}|${service.price.toLocaleString().replace(/,/g, ' ')}`);
                    matched = true;
                    break;
                }
            }

            if (!matched && trimmedLine.startsWith('- ')) {
                procedures.push(`${trimmedLine.substring(2)}|0`);
            }
        });

        const breakdown = procedures.join('||') + (procedures.length > 0 ? `||TOTAL|${total.toLocaleString().replace(/,/g, ' ')}` : '');
        return { total, breakdown };
    } catch (e) {
        console.error("Error calculating total", e);
        return { total: 0, breakdown: '' };
    }
}

/**
 * Qabul to'langanmi — sana + bemor (id ustuvor, aks holda ism) bo'yicha moslashtiradi.
 * Reception ish oqimi: shifokor "Completed" qiladi → to'lov shu qabul sanasiga yozilmaguncha "kutilmoqda" hisoblanadi.
 */
export function isAppointmentPaid(
    appointment: { date: string; patientId?: string; patientName: string },
    transactions: Transaction[]
): boolean {
    return transactions.some(t => {
        if (!t || t.date !== appointment.date || t.status !== 'Paid') return false;
        if (appointment.patientId && t.patientId) return t.patientId === appointment.patientId;
        return t.patientName === appointment.patientName;
    });
}
