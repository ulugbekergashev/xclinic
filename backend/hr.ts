/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — XODIMLAR MODULI (HR).

   MUAMMO. Maosh faqat shifokorda bor edi. Registrator, laborant va
   hamshiraning oyligi dasturda umuman yo'q: u daftarda yoki Excel da
   yashaydi. Bonus va jarima ham shunday — ular «Boshqa xarajat» bo'lib
   yoziladi va kimga tegishli ekani yo'qoladi.

   ENG MUHIM QARORI — PUL IKKI MARTA BERILMASLIGI.

   Vedomost (`payroll.ts`) shifokorga IKKALASINI ham hisoblaydi: ulushni
   ham, FIX MAOSHNI ham (`computePayroll` ichidagi «FIX MAOSH» bo'limi).
   Shuning uchun xodim kartasidagi «Maosh to'lash» tugmasi shifokorda
   asosiy oylikni TO'LAMAYDI — u nolga tenglashtiriladi va ekranda
   vedomostga havola ko'rsatiladi.

   Ya'ni:

     · registrator / laborant / hamshira → asosiy oylik + bonus − jarima
       shu yerdan to'lanadi (vedomost ular uchun umuman ishlamaydi);
     · shifokor → asosiy oylik va ulush VEDOMOSTDAN, kartadan esa faqat
       bonus va jarima to'lanadi.

   Ikkinchi qoida: har xodimga har oy uchun BITTA to'lov. Buni baza
   kafolatlaydi (`StaffSalaryPayment` dagi unikal indeks), server esa
   405 emas, tushunarli 409 qaytaradi.

   Uchinchi qoida: pul har doim XARAJAT yozuvi bilan chiqadi. Aks holda
   oylik hisobotda ham, kassada ham ko'rinmaydi — «pul qayerda» degan
   savol javobsiz qoladi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { som } from './money';
import { tashkentDateStr } from './tashkentTime';
import { computePayroll } from './payroll';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

export type StaffRole = 'DOCTOR' | 'RECEPTIONIST' | 'LAB_TECHNICIAN' | 'NURSE';

/* Rol → Prisma modeli va ko'rsatiladigan nom. Bitta jadval bo'lganda bu
   kerak bo'lmasdi, lekin to'rtta jadval birlashtirilmaydi: ularga
   tizimga kirish va qabullar, yozuvlar, tahlillar bilan bog'lam osilgan
   (0035 migratsiyasidagi izohga qarang). */
const ROLE_MODEL: Record<StaffRole, { model: string; label: string }> = {
    DOCTOR: { model: 'doctor', label: 'Shifokor' },
    RECEPTIONIST: { model: 'receptionist', label: 'Registrator' },
    LAB_TECHNICIAN: { model: 'labTechnician', label: 'Laborant' },
    NURSE: { model: 'nurse', label: 'Hamshira' },
};

const isRole = (v: any): v is StaffRole => Object.prototype.hasOwnProperty.call(ROLE_MODEL, String(v));

/** 'YYYY-MM' — noto'g'ri qiymat kelsa joriy oy. */
export function normalizePeriod(v: any): string {
    const s = String(v || '');
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : tashkentDateStr().slice(0, 7);
}

/** Oyning birinchi va oxirgi kuni — 'YYYY-MM-DD'. */
export function monthBounds(period: string): { from: string; to: string } {
    const [y, m] = period.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

/* ─── HAFTALIK YUKLAMA ────────────────────────────────────────────────────────

   Reference'da bu «24 dars/hafta = to'liq stavka» edi. Klinikada dars
   yo'q, shuning uchun o'lchov QABUL SOATLARI bo'yicha olinadi:

       yuklama = shu hafta band qilingan daqiqalar
                 ───────────────────────────────────────
                 ish kunlari × kunlik soat × 60

   Maxraj ISH GRAFIGIDAN keladi. Grafik belgilanmagan bo'lsa yuklama
   KO'RSATILMAYDI (`null`) — o'ylab topilgan «to'liq stavka» bilan foiz
   chiqarish, aslida hech narsa anglatmaydigan raqam ko'rsatish bo'lardi. */
export function weeklyCapacityMinutes(row: {
    workDays?: string | null; startHour?: number | null; endHour?: number | null;
}): number | null {
    const days = parseWorkDays(row.workDays);
    if (!days.length) return null;
    const start = row.startHour, end = row.endHour;
    if (start == null || end == null || end <= start) return null;
    return days.length * (end - start) * 60;
}

/** «1,2,3» → [1,2,3]; bo'sh yoki noto'g'ri → []. 1 = dushanba, 7 = yakshanba. */
export function parseWorkDays(v?: string | null): number[] {
    if (!v) return [];
    return String(v).split(',')
        .map(x => Number(x.trim()))
        .filter(n => Number.isInteger(n) && n >= 1 && n <= 7)
        .filter((n, i, arr) => arr.indexOf(n) === i)
        .sort((a, b) => a - b);
}

/** Kiruvchi qiymatni saqlash uchun tozalaydi. Bo'sh ro'yxat → NULL. */
export function serializeWorkDays(v: any): string | null {
    if (v == null) return null;
    const arr = Array.isArray(v) ? v : String(v).split(',');
    const days = parseWorkDays(arr.join(','));
    return days.length ? days.join(',') : null;
}

/** Shu haftaning dushanbasi va yakshanbasi — 'YYYY-MM-DD'. */
export function currentWeekBounds(today = tashkentDateStr()): { from: string; to: string } {
    const d = new Date(`${today}T00:00:00Z`);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();   // 1..7, dushanba = 1
    const mon = new Date(d.getTime() - (dow - 1) * 864e5);
    const sun = new Date(mon.getTime() + 6 * 864e5);
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

/* ─── SHIFOKORNING BIR OYLIK ULUSHI ───────────────────────────────────────────

   `computePayroll` bir DAVR uchun hamma shifokorni hisoblaydi; bu yerda
   undan bittasi olinadi. Hisob nusxalanmaydi — foiz tanlash tartibi
   (`pickRate`) bir marta nusxalangan edi va ikki ekran bitta shifokor
   uchun boshqa-boshqa foiz ko'rsatishi mumkin bo'lgan.

   ESKI VEDOMOST AYRILADI. Vedomost ish oqimidan chiqdi, lekin u ishlab
   turgan klinikalarda QOLDI va u orqali pul allaqachon to'langan
   bo'lishi mumkin. Shu oy bilan kesishgan vedomostlarda to'langan summa
   ayriladi va ekranda ALOHIDA qator bo'lib ko'rinadi — jimgina emas:
   «nega raqam kichik?» degan savol javobsiz qolmasin. */
export async function doctorMonthShare(
    prisma: any, clinicId: string, role: StaffRole, staff: any, from: string, to: string,
): Promise<null | {
    accrued: number; paidViaRuns: number; payable: number;
    items: any[]; runs: any[];
}> {
    if (role !== 'DOCTOR') return null;

    const { lines } = await computePayroll(prisma, clinicId, from, to);
    const mine = lines.find((l: any) => l.doctorId === staff.id);
    const accrued = som(mine?.accrued || 0);

    const runLines = await prisma.payrollLine.findMany({
        where: {
            doctorId: staff.id,
            run: { clinicId, periodFrom: { lte: to }, periodTo: { gte: from } },
        },
        include: { run: { select: { id: true, periodFrom: true, periodTo: true, status: true } } },
    });
    const paidViaRuns = som(runLines.reduce((s: number, l: any) => s + (l.paid || 0), 0));

    return {
        accrued,
        paidViaRuns,
        /* Manfiyga tushmaydi: vedomost orqali hisoblangandan ko'proq
           to'langan bo'lsa, shifokordan pul talab qilish tizimning ishi
           emas. Raqam ko'rinib turadi. */
        payable: Math.max(0, som(accrued - paidViaRuns)),
        items: mine?.items || [],
        runs: runLines
            .filter((l: any) => l.paid > 0)
            .map((l: any) => ({
                runId: l.run.id, periodFrom: l.run.periodFrom, periodTo: l.run.periodTo,
                status: l.run.status, paid: som(l.paid),
            })),
    };
}

export function registerHrRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    /* Xodim ma'lumoti va oylik — faqat klinika egasi. Registrator kassani
       yuritadi, lekin kimning qancha oylik olishini bilishi shart emas. */
    const route = (
        method: 'get' | 'post' | 'delete',
        path: string,
        handler: (req: any, res: any, clinicId: string) => Promise<any>,
    ) => {
        (app as any)[method](path, auth, async (req: any, res: any) => {
            try {
                const clinicId = getScopedClinicId(req);
                if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
                if ((req as any).user?.role !== 'CLINIC_ADMIN') {
                    return res.status(403).json({ error: "Ruxsat yo'q" });
                }
                await handler(req, res, clinicId);
            } catch (e: any) {
                console.error(`[${method.toUpperCase()} ${path}]`, e?.message || e);
                res.status(500).json({ error: e?.message || 'Server xatoligi' });
            }
        });
    };

    /** Xodimni topadi va klinikaga tegishliligini tekshiradi. */
    const findStaff = async (clinicId: string, role: StaffRole, id: string) => {
        const row = await prisma[ROLE_MODEL[role].model].findUnique({ where: { id } });
        if (!row || row.clinicId !== clinicId) return null;
        return row;
    };

    const fullName = (r: any) => `${r.lastName || ''} ${r.firstName || ''}`.trim();

    /* ═══ 1. KPI KARTALARI ═══════════════════════════════════════════════════

       To'rtta raqam SERVERDA sanaladi. Ilgari bunday raqamlar ekranga
       kelgan proplardan sanalardi va ro'yxat qisqarganda jimgina
       yolg'on ko'rsatardi (MODUL-ISHLARI, 1-bo'lim). */
    route('get', '/api/hr/summary', async (_req, res, clinicId) => {
        const notDeleted = { clinicId, status: { not: 'Deleted' } };
        const sel = {
            id: true, firstName: true, lastName: true, status: true,
            fixedSalary: true, workDays: true, startHour: true, endHour: true,
        };
        const [doctors, receptionists, technicians, nurses] = await Promise.all([
            prisma.doctor.findMany({ where: notDeleted, select: { ...sel, salaryType: true } }),
            prisma.receptionist.findMany({ where: notDeleted, select: sel }),
            prisma.labTechnician.findMany({ where: notDeleted, select: sel }),
            prisma.nurse.findMany({ where: notDeleted, select: sel }),
        ]);

        const all = [
            ...doctors.map((r: any) => ({ ...r, role: 'DOCTOR' as StaffRole })),
            ...receptionists.map((r: any) => ({ ...r, role: 'RECEPTIONIST' as StaffRole })),
            ...technicians.map((r: any) => ({ ...r, role: 'LAB_TECHNICIAN' as StaffRole })),
            ...nurses.map((r: any) => ({ ...r, role: 'NURSE' as StaffRole })),
        ];
        const active = all.filter(r => r.status === 'Active');

        /* Shu haftaning qabullari — «kim ishlayapti» degan savolga javob. */
        const week = currentWeekBounds();
        const appts = await prisma.appointment.findMany({
            where: {
                clinicId, date: { gte: week.from, lte: week.to },
                status: { not: 'Cancelled' },
            },
            select: { doctorId: true, duration: true },
        });
        const bookedByDoctor = new Map<string, number>();
        for (const a of appts) {
            bookedByDoctor.set(a.doctorId, (bookedByDoctor.get(a.doctorId) || 0) + (a.duration || 0));
        }

        const activeDoctors = doctors.filter((d: any) => d.status === 'Active');
        const withLoad = activeDoctors
            .map((d: any) => {
                const cap = weeklyCapacityMinutes(d);
                if (!cap) return null;
                return Math.min(200, Math.round(((bookedByDoctor.get(d.id) || 0) / cap) * 100));
            })
            .filter((v: number | null): v is number => v != null);

        const salaryFund = som(active.reduce((s, r: any) => s + (Number(r.fixedSalary) || 0), 0));

        res.json({
            total: active.length,
            archived: all.length - active.length,
            byRole: {
                DOCTOR: activeDoctors.length,
                RECEPTIONIST: receptionists.filter((r: any) => r.status === 'Active').length,
                LAB_TECHNICIAN: technicians.filter((r: any) => r.status === 'Active').length,
                NURSE: nurses.filter((r: any) => r.status === 'Active').length,
            },
            /** Shu hafta qabuli bor shifokorlar */
            working: activeDoctors.filter((d: any) => (bookedByDoctor.get(d.id) || 0) > 0).length,
            doctors: activeDoctors.length,
            /** Ish grafigi belgilangan shifokorlar bo'yicha o'rtacha yuklama */
            avgLoad: withLoad.length
                ? Math.round(withLoad.reduce((s: number, v: number) => s + v, 0) / withLoad.length)
                : null,
            loadKnownFor: withLoad.length,
            salaryFund,
            /** Oyligi kiritilmaganlar — fondning to'liq emasligi shundan */
            noSalary: active.filter((r: any) => !(Number(r.fixedSalary) > 0)).length,
        });
    });

    /* ═══ 2. HAFTALIK YUKLAMA — RO'YXAT UCHUN ════════════════════════════════ */
    route('get', '/api/hr/workload', async (_req, res, clinicId) => {
        const week = currentWeekBounds();
        const [doctors, appts] = await Promise.all([
            prisma.doctor.findMany({
                where: { clinicId, status: { not: 'Deleted' } },
                select: { id: true, workDays: true, startHour: true, endHour: true },
            }),
            prisma.appointment.findMany({
                where: {
                    clinicId, date: { gte: week.from, lte: week.to },
                    status: { not: 'Cancelled' },
                },
                select: { doctorId: true, duration: true },
            }),
        ]);
        const booked = new Map<string, { minutes: number; count: number }>();
        for (const a of appts) {
            const g = booked.get(a.doctorId) || { minutes: 0, count: 0 };
            g.minutes += a.duration || 0;
            g.count += 1;
            booked.set(a.doctorId, g);
        }
        res.json({
            week,
            rows: doctors.map((d: any) => {
                const cap = weeklyCapacityMinutes(d);
                const g = booked.get(d.id) || { minutes: 0, count: 0 };
                return {
                    doctorId: d.id,
                    appointments: g.count,
                    minutes: g.minutes,
                    capacityMinutes: cap,
                    percent: cap ? Math.min(200, Math.round((g.minutes / cap) * 100)) : null,
                };
            }),
        });
    });

    /* ═══ 2b. DAVOMAT — HAMMA XODIM BO'YICHA ═════════════════════════════════

       Xodim kartasidagi davomat BITTA odam haqida. «Bu oy kim qancha
       ishladi?» degan savol esa boshqa: unga javob berish uchun har
       kartani ochib chiqish kerak bo'lardi.

       FOIZ BELGILANGAN KUNLARDAN hisoblanadi, kalendar kunlaridan emas.
       Ya'ni maxraj — shu xodim uchun ACTUALLY belgilangan kunlar soni.
       Aks holda oyning yarmida ochilgan xodim 50% ko'rsatardi va bu
       raqam hech narsani anglatmasdi. Belgilanmagan xodimda foiz
       umuman ko'rsatilmaydi. */
    route('get', '/api/hr/attendance-summary', async (req, res, clinicId) => {
        const period = normalizePeriod(req.query.period);
        const { from, to } = monthBounds(period);

        const notDeleted = { clinicId, status: { not: 'Deleted' } };
        const sel = {
            id: true, firstName: true, lastName: true, phone: true,
            specialty: true, status: true,
        };
        const [doctors, receptionists, technicians, nurses, days] = await Promise.all([
            prisma.doctor.findMany({ where: notDeleted, select: sel }),
            prisma.receptionist.findMany({ where: notDeleted, select: sel }),
            prisma.labTechnician.findMany({ where: notDeleted, select: sel }),
            prisma.nurse.findMany({ where: notDeleted, select: sel }),
            prisma.staffAttendance.findMany({
                where: { clinicId, date: { gte: from, lte: to } },
                select: { staffRole: true, staffId: true, status: true },
            }),
        ]);

        const marks = new Map<string, { present: number; absent: number; excused: number; late: number }>();
        for (const d of days) {
            const key = `${d.staffRole}:${d.staffId}`;
            const g = marks.get(key) || { present: 0, absent: 0, excused: 0, late: 0 };
            if (d.status === 'Present') g.present++;
            else if (d.status === 'Absent') g.absent++;
            else if (d.status === 'Excused') g.excused++;
            else if (d.status === 'Late') g.late++;
            marks.set(key, g);
        }

        const build = (rows: any[], role: StaffRole) => rows.map((r: any) => {
            const g = marks.get(`${role}:${r.id}`) || { present: 0, absent: 0, excused: 0, late: 0 };
            const marked = g.present + g.absent + g.excused + g.late;
            return {
                role, id: r.id, name: fullName(r),
                position: r.specialty || ROLE_MODEL[role].label,
                phone: r.phone || null,
                status: r.status,
                markedDays: marked,
                present: g.present, absent: g.absent, excused: g.excused, late: g.late,
                /* Kechikkan kun ham KELGAN kun: odam ishga chiqqan.
                   Uni alohida ustunda ko'rsatamiz, foizdan chiqarmaymiz. */
                percent: marked ? Math.round(((g.present + g.late) / marked) * 100) : null,
            };
        });

        const rows = [
            ...build(doctors, 'DOCTOR'),
            ...build(receptionists, 'RECEPTIONIST'),
            ...build(technicians, 'LAB_TECHNICIAN'),
            ...build(nurses, 'NURSE'),
        ].sort((a, b) => a.name.localeCompare(b.name));

        const withPercent = rows.filter(r => r.percent != null);
        const best = withPercent.length
            ? withPercent.reduce((a, b) => (b.percent! > a.percent! ? b : a))
            : null;

        res.json({
            period, from, to,
            staffTotal: rows.length,
            trackedStaff: withPercent.length,
            avgPercent: withPercent.length
                ? Math.round(withPercent.reduce((s, r) => s + (r.percent || 0), 0) / withPercent.length)
                : null,
            best: best ? { name: best.name, percent: best.percent } : null,
            markedDays: rows.reduce((s, r) => s + r.markedDays, 0),
            rows,
        });
    });

    /* ═══ 3. OYLIK HISOBI ════════════════════════════════════════════════════ */
    route('get', '/api/hr/staff/:role/:id/month', async (req, res, clinicId) => {
        const role = req.params.role as StaffRole;
        if (!isRole(role)) return res.status(400).json({ error: "Rol noto'g'ri" });
        const staff = await findStaff(clinicId, role, req.params.id);
        if (!staff) return res.status(404).json({ error: 'Xodim topilmadi' });

        const period = normalizePeriod(req.query.period);
        const { from, to } = monthBounds(period);

        const [adjustments, payment, attendance] = await Promise.all([
            prisma.staffAdjustment.findMany({
                where: { clinicId, staffRole: role, staffId: staff.id, period },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.staffSalaryPayment.findFirst({
                where: { staffRole: role, staffId: staff.id, period },
            }),
            prisma.staffAttendance.findMany({
                where: { staffRole: role, staffId: staff.id, date: { gte: from, lte: to } },
                select: { date: true, status: true },
            }),
        ]);

        const bonus = som(adjustments.filter((a: any) => a.type === 'Bonus')
            .reduce((s: number, a: any) => s + a.amount, 0));
        const penalty = som(adjustments.filter((a: any) => a.type === 'Penalty')
            .reduce((s: number, a: any) => s + a.amount, 0));

        const monthShare = await doctorMonthShare(prisma, clinicId, role, staff, from, to);

        /* SHIFOKORDA «ASOSIY» — SHU OYNING ULUSHI.

           Ilgari bu yerda nol turardi va pul faqat VEDOMOST orqali
           chiqardi. Vedomost esa davr uchun hujjat: uni qo'lda yaratish,
           tasdiqlash va qatorma-qator to'lash kerak edi — ya'ni oddiy
           «shu odamga shu oy uchun to'lash» amali uch qadamga bo'lingan
           va boshqa ekranda turardi.

           Endi hisob shu yerda: oy tanlanadi, ulush hisoblanadi, ustiga
           bonus qo'shilib jarima ayriladi. Vedomost bekor qilinmadi —
           u ARXIV bo'lib qoldi, va eski vedomost orqali allaqachon
           to'langan summa quyida AYRILADI: bitta pul ikki marta
           berilmasin. */
        const base = role === 'DOCTOR'
            ? monthShare!.payable
            : som(Number(staff.fixedSalary) || 0);

        const due = som(base + bonus - penalty);
        const counts = { present: 0, absent: 0, excused: 0, late: 0 };
        for (const a of attendance) {
            if (a.status === 'Present') counts.present++;
            else if (a.status === 'Absent') counts.absent++;
            else if (a.status === 'Excused') counts.excused++;
            else if (a.status === 'Late') counts.late++;
        }

        res.json({
            period, from, to,
            staff: {
                id: staff.id, role, name: fullName(staff),
                fixedSalary: som(Number(staff.fixedSalary) || 0),
                salaryType: staff.salaryType || null,
                percentage: staff.percentage ?? null,
                workDays: parseWorkDays(staff.workDays),
            },
            base, bonus, penalty, due,
            adjustments: adjustments.map((a: any) => ({
                id: a.id, type: a.type, reason: a.reason, amount: som(a.amount),
                createdAt: a.createdAt, createdByName: a.createdByName,
            })),
            payment: payment ? {
                id: payment.id, amount: som(payment.amount), paidAt: payment.paidAt,
                method: payment.method, paidByName: payment.paidByName,
                base: som(payment.base), bonus: som(payment.bonus), penalty: som(payment.penalty),
            } : null,
            share: monthShare,
            attendance: counts,
        });
    });

    /* ═══ 3b. OYLIK ULUSH JADVALI — HAMMA SHIFOKOR ═══════════════════════════

       «Bu oy kimga qancha tegadi?» — bitta ekranda, bitta oy uchun.

       Ilgari bunga javob VEDOMOST edi: davr tanlanadi, hujjat yaratiladi,
       tasdiqlanadi, keyin qatorma-qator to'lanadi. To'rt qadam, va
       ularning uchtasi buxgalteriya marosimi. Endi jadval o'zi javob
       beradi, to'lash esa bir bosish. Vedomost arxiv bo'lib qoladi. */
    route('get', '/api/hr/shares', async (req, res, clinicId) => {
        const period = normalizePeriod(req.query.period);
        const { from, to } = monthBounds(period);

        const [doctors, payments] = await Promise.all([
            prisma.doctor.findMany({
                where: { clinicId, status: 'Active' },
                select: { id: true, firstName: true, lastName: true, specialty: true },
                orderBy: { lastName: 'asc' },
            }),
            prisma.staffSalaryPayment.findMany({
                where: { clinicId, staffRole: 'DOCTOR', period },
            }),
        ]);

        /* Hisob BIR MARTA — har shifokor uchun alohida so'rov yuborilsa,
           o'nta shifokorda o'nta to'liq o'tish bo'lardi. */
        const { lines, stats } = await computePayroll(prisma, clinicId, from, to);
        const runLines = await prisma.payrollLine.findMany({
            where: { run: { clinicId, periodFrom: { lte: to }, periodTo: { gte: from } } },
            select: { doctorId: true, paid: true },
        });

        const paidByRun = new Map<string, number>();
        for (const l of runLines) {
            if (!l.doctorId) continue;
            paidByRun.set(l.doctorId, som((paidByRun.get(l.doctorId) || 0) + (l.paid || 0)));
        }

        const rows = doctors.map((d: any) => {
            const line = lines.find((l: any) => l.doctorId === d.id);
            const accrued = som(line?.accrued || 0);
            const viaRuns = som(paidByRun.get(d.id) || 0);
            const payment = payments.find((p: any) => p.staffId === d.id);
            return {
                id: d.id,
                name: `${d.lastName} ${d.firstName}`.trim(),
                specialty: d.specialty || null,
                accrued,
                /* Eski vedomost orqali to'langani — ko'rinib turadi,
                   jimgina ayrilmaydi. */
                paidViaRuns: viaRuns,
                paid: payment ? som(payment.amount) : 0,
                paidAt: payment?.paidAt || null,
                payable: payment ? 0 : Math.max(0, som(accrued - viaRuns)),
                closed: !!payment,
                itemCount: (line?.items || []).length,
            };
        });

        res.json({
            period, from, to,
            rows,
            totals: {
                accrued: som(rows.reduce((s: number, r: any) => s + r.accrued, 0)),
                paid: som(rows.reduce((s: number, r: any) => s + r.paid + r.paidViaRuns, 0)),
                payable: som(rows.reduce((s: number, r: any) => s + r.payable, 0)),
            },
            /* Nega bo'sh — sabab bilan. Ilgari ekran «ulush yo'q» deb
               turardi va foydalanuvchi sababini o'zi topishi kerak edi. */
            stats,
        });
    });

    /* ═══ 4. BONUS VA JARIMA ═════════════════════════════════════════════════ */
    route('post', '/api/hr/staff/:role/:id/adjustments', async (req, res, clinicId) => {
        const role = req.params.role as StaffRole;
        if (!isRole(role)) return res.status(400).json({ error: "Rol noto'g'ri" });
        const staff = await findStaff(clinicId, role, req.params.id);
        if (!staff) return res.status(404).json({ error: 'Xodim topilmadi' });

        const type = String(req.body?.type || '');
        if (type !== 'Bonus' && type !== 'Penalty') {
            return res.status(400).json({ error: "Turi Bonus yoki Penalty bo'lishi kerak" });
        }
        const reason = String(req.body?.reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'Sabab kiritilmagan' });
        const amount = som(Number(req.body?.amount));
        if (!(amount > 0)) return res.status(400).json({ error: "Summa noldan katta bo'lishi kerak" });

        const period = normalizePeriod(req.body?.period);

        /* To'langan oyga yangi qator qo'shilmaydi. Aks holda hujjat
           imzolangandan keyin o'zgarardi va «nega summa boshqa» degan
           savolga javob bo'lmasdi. */
        const paid = await prisma.staffSalaryPayment.findFirst({
            where: { staffRole: role, staffId: staff.id, period },
        });
        if (paid) {
            return res.status(409).json({ error: `${period} oyligi allaqachon to'langan` });
        }

        const created = await prisma.staffAdjustment.create({
            data: {
                clinicId, staffRole: role, staffId: staff.id, period, type, reason, amount,
                createdByName: (req as any).user?.name || null,
            },
        });
        res.status(201).json(created);
    });

    route('delete', '/api/hr/adjustments/:id', async (req, res, clinicId) => {
        const row = await prisma.staffAdjustment.findUnique({ where: { id: req.params.id } });
        if (!row || row.clinicId !== clinicId) return res.status(404).json({ error: 'Yozuv topilmadi' });

        const paid = await prisma.staffSalaryPayment.findFirst({
            where: { staffRole: row.staffRole, staffId: row.staffId, period: row.period },
        });
        if (paid) return res.status(409).json({ error: "To'langan oyni o'zgartirib bo'lmaydi" });

        await prisma.staffAdjustment.delete({ where: { id: row.id } });
        res.json({ success: true });
    });

    /* ═══ 5. OYLIK TO'LASH ═══════════════════════════════════════════════════

       Summa SERVERDA qayta hisoblanadi — brauzerdan kelgan raqamga
       ishonilmaydi. Pul xarajat yozuvi bilan chiqadi va ikkalasi bitta
       tranzaksiyada yoziladi: xarajat yozilib, to'lov yozilmay qolsa,
       oy «to'lanmagan» bo'lib turaverar va ikkinchi marta to'lanardi. */
    route('post', '/api/hr/staff/:role/:id/pay', async (req, res, clinicId) => {
        const role = req.params.role as StaffRole;
        if (!isRole(role)) return res.status(400).json({ error: "Rol noto'g'ri" });
        const staff = await findStaff(clinicId, role, req.params.id);
        if (!staff) return res.status(404).json({ error: 'Xodim topilmadi' });

        const period = normalizePeriod(req.body?.period);
        const already = await prisma.staffSalaryPayment.findFirst({
            where: { staffRole: role, staffId: staff.id, period },
        });
        if (already) return res.status(409).json({ error: `${period} oyligi allaqachon to'langan` });

        const adjustments = await prisma.staffAdjustment.findMany({
            where: { clinicId, staffRole: role, staffId: staff.id, period },
        });
        const bonus = som(adjustments.filter((a: any) => a.type === 'Bonus')
            .reduce((s: number, a: any) => s + a.amount, 0));
        const penalty = som(adjustments.filter((a: any) => a.type === 'Penalty')
            .reduce((s: number, a: any) => s + a.amount, 0));
        /* Summa SHU YERDA qayta hisoblanadi — brauzerdan kelgan raqam
           umuman o'qilmaydi. */
        const { from, to } = monthBounds(period);
        const share = await doctorMonthShare(prisma, clinicId, role, staff, from, to);
        const base = role === 'DOCTOR'
            ? (share?.payable || 0)
            : som(Number(staff.fixedSalary) || 0);
        const amount = som(base + bonus - penalty);

        if (!(amount > 0)) {
            return res.status(400).json({
                error: role === 'DOCTOR'
                    ? `${period} oyida to'lanadigan ulush yo'q: hisoblangan ${share?.accrued || 0}, allaqachon to'langan ${share?.paidViaRuns || 0}`
                    : "To'lanadigan summa yo'q",
            });
        }

        const method = String(req.body?.method || 'Cash');
        const user = (req as any).user;
        const name = fullName(staff);
        const title = role === 'DOCTOR'
            ? `${name} — ulush (${period})`
            : `${name} — oylik (${period})`;

        const result = await prisma.$transaction(async (tx: any) => {
            const expense = await tx.expense.create({
                data: {
                    clinicId,
                    date: tashkentDateStr(),
                    amount,
                    /* Shifokor ulushi ALOHIDA kategoriya: hisobotda u
                       oddiy oylikdan ajratib ko'rsatiladi
                       (`reports.ts` dagi `doctorShare`). Vedomost ham
                       aynan shu kategoriyani yozardi — hisobot uzilib
                       qolmasin. */
                    category: role === 'DOCTOR' ? 'DoctorShare' : 'Salary',
                    title,
                    method,
                    doctorId: role === 'DOCTOR' ? staff.id : null,
                    receptionistId: role === 'RECEPTIONIST' ? staff.id : null,
                    departmentId: staff.departmentId || null,
                },
            });
            const payment = await tx.staffSalaryPayment.create({
                data: {
                    clinicId, staffRole: role, staffId: staff.id, staffName: name,
                    period, base, bonus, penalty, amount, method,
                    expenseId: expense.id, paidByName: user?.name || null,
                },
            });
            return { expense, payment };
        });

        res.status(201).json(result);
    });

    /* ═══ 6. DAVOMAT ═════════════════════════════════════════════════════════

       Oylikdan AVTOMATIK ushlanmaydi — 0036 migratsiyasidagi izohga
       qarang. Kelmagan kun ko'rinadi, ushlash esa jarima orqali
       ataylab qo'lda yoziladi. */
    route('get', '/api/hr/staff/:role/:id/attendance', async (req, res, clinicId) => {
        const role = req.params.role as StaffRole;
        if (!isRole(role)) return res.status(400).json({ error: "Rol noto'g'ri" });
        const staff = await findStaff(clinicId, role, req.params.id);
        if (!staff) return res.status(404).json({ error: 'Xodim topilmadi' });

        const period = normalizePeriod(req.query.period);
        const { from, to } = monthBounds(period);
        const days = await prisma.staffAttendance.findMany({
            where: { staffRole: role, staffId: staff.id, date: { gte: from, lte: to } },
            orderBy: { date: 'asc' },
        });
        res.json({
            period, from, to,
            workDays: parseWorkDays(staff.workDays),
            days: days.map((d: any) => ({ date: d.date, status: d.status, note: d.note })),
        });
    });

    route('post', '/api/hr/staff/:role/:id/attendance', async (req, res, clinicId) => {
        const role = req.params.role as StaffRole;
        if (!isRole(role)) return res.status(400).json({ error: "Rol noto'g'ri" });
        const staff = await findStaff(clinicId, role, req.params.id);
        if (!staff) return res.status(404).json({ error: 'Xodim topilmadi' });

        const date = String(req.body?.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Sana noto'g'ri" });
        if (date > tashkentDateStr()) {
            return res.status(400).json({ error: 'Kelajakdagi kunni belgilab bo\'lmaydi' });
        }

        const status = String(req.body?.status || '');
        /* Bo'sh status — belgini olib tashlash. Ekranda kun bosilganda
           holatlar aylanadi va oxirida yana «belgilanmagan» bo'ladi. */
        if (!status) {
            await prisma.staffAttendance.deleteMany({
                where: { staffRole: role, staffId: staff.id, date },
            });
            return res.json({ success: true, cleared: true });
        }
        if (!['Present', 'Absent', 'Excused', 'Late'].includes(status)) {
            return res.status(400).json({ error: "Holat noto'g'ri" });
        }

        const existing = await prisma.staffAttendance.findFirst({
            where: { staffRole: role, staffId: staff.id, date },
        });
        const note = req.body?.note ? String(req.body.note).trim() : null;
        const saved = existing
            ? await prisma.staffAttendance.update({ where: { id: existing.id }, data: { status, note } })
            : await prisma.staffAttendance.create({
                data: { clinicId, staffRole: role, staffId: staff.id, date, status, note },
            });
        res.json(saved);
    });

    console.log('✅ Xodimlar moduli (HR) endpointlari ulandi');
}
