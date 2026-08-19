import * as XLSX from 'xlsx';
import { Transaction, Expense, Doctor, EXPENSE_CATEGORY_LABELS } from '../types';
import { TotalFinancials, DoctorShareSummary } from './financialCalculations';
import { PAYMENT_METHODS, getPaymentMethodLabel } from './paymentMethods';

const STATUS_LABELS: Record<string, string> = {
    Paid: "To'langan",
    Pending: 'Kutilmoqda',
    Overdue: 'Qarzdor',
};

export interface FinanceExportData {
    startDate: string;
    endDate: string;
    transactions: Transaction[];
    expenses: Expense[];
    financials: TotalFinancials;
    doctorShares: DoctorShareSummary[];
    doctors: Doctor[];
    debtors: { name: string; amount: number; days: number }[];
}

// Moliya sahifasidagi joriy davr ma'lumotlarini 4 varaqli .xlsx faylga eksport qiladi:
// Hisobot / To'lovlar / Xarajatlar / Qarzdorlar
export function exportFinanceToExcel(data: FinanceExportData) {
    const { startDate, endDate, transactions, expenses, financials, doctorShares, doctors, debtors } = data;
    const wb = XLSX.utils.book_new();

    // --- 1. Hisobot (umumiy ko'rsatkichlar) ---
    const summaryRows: (string | number)[][] = [
        ['MOLIYA HISOBOTI'],
        ['Davr', `${startDate || 'Boshlanish'} — ${endDate || 'Tugash'}`],
        ['Tuzilgan sana', new Date().toLocaleString('uz-UZ')],
        [],
        ['KIRIM (TO\'LOVLAR)'],
        ['Jami kirim (to\'langan)', financials.totalRevenue],
    ];

    PAYMENT_METHODS.forEach(({ key, label }) => {
        const txs = transactions.filter(t => t.type === key && t.status === 'Paid');
        if (txs.length > 0) {
            summaryRows.push([`  ${label}`, txs.reduce((s, t) => s + t.amount, 0)]);
        }
    });

    summaryRows.push([]);
    summaryRows.push(['CHIQIM (XARAJATLAR)']);
    summaryRows.push(['Jami xarajatlar', financials.totalExpenses]);
    (Object.keys(EXPENSE_CATEGORY_LABELS) as (keyof typeof EXPENSE_CATEGORY_LABELS)[]).forEach(cat => {
        const catTotal = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
        if (catTotal > 0) summaryRows.push([`  ${EXPENSE_CATEGORY_LABELS[cat]}`, catTotal]);
    });

    summaryRows.push([]);
    summaryRows.push(['SHIFOKOR HISOBI']);
    summaryRows.push(['Shifokor', 'Kirim', 'Hisoblangan ulush', 'To\'langan', 'Qoldiq']);
    doctorShares.forEach(s => {
        summaryRows.push([s.doctorName, s.grossRevenue, Math.round(s.accrued), Math.round(s.paid), Math.round(s.balance)]);
    });

    summaryRows.push([]);
    summaryRows.push(['SOF FOYDA']);
    summaryRows.push(['Kirim', financials.totalRevenue]);
    summaryRows.push(['− Shifokor ulushi (hisoblangan)', Math.round(financials.doctorShareAccrued)]);
    summaryRows.push(['− Xarajatlar (shifokor ulushisiz)', financials.otherExpenses]);
    summaryRows.push(['= Sof foyda', Math.round(financials.netProfit)]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 36 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Hisobot');

    // --- 2. To'lovlar ---
    const paymentRows = transactions.map(t => ({
        'Sana': t.date,
        'Bemor': t.patientName,
        'Shifokor': t.doctorName || '-',
        'Xizmat': t.service,
        'Usul': getPaymentMethodLabel(t.type),
        'Summa (UZS)': t.amount,
        'Holat': STATUS_LABELS[t.status] || t.status,
    }));
    const wsPayments = XLSX.utils.json_to_sheet(paymentRows);
    wsPayments['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 22 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsPayments, "To'lovlar");

    // --- 3. Xarajatlar ---
    const expenseRows = expenses.map(e => {
        const doctor = e.doctorId ? doctors.find(d => d.id === e.doctorId) : undefined;
        return {
            'Sana': e.date,
            'Kategoriya': EXPENSE_CATEGORY_LABELS[e.category] || e.category,
            'Nomi': e.title,
            'Shifokor': doctor ? `${doctor.lastName} ${doctor.firstName}` : '-',
            'Usul': getPaymentMethodLabel(e.method),
            'Summa (UZS)': e.amount,
            'Izoh': e.note || '',
        };
    });
    const wsExpenses = XLSX.utils.json_to_sheet(expenseRows);
    wsExpenses['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Xarajatlar');

    // --- 4. Qarzdorlar ---
    const debtorRows = debtors.map(d => ({
        'Bemor': d.name,
        'Qarz (UZS)': d.amount,
        'Kechikkan kunlar': d.days,
    }));
    const wsDebtors = XLSX.utils.json_to_sheet(debtorRows);
    wsDebtors['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsDebtors, 'Qarzdorlar');

    // Kassa eksporti (kassa_*.xlsx) bilan aralashmasligi uchun alohida nom
    const fileName = `moliya_hisobot_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
}
