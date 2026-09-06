/* ─────────────────────────────────────────────────────────────────────────────
   RUXSATLAR JADVALI — kim qaysi amalni bajara oladi.

   NIMA UCHUN BU FAYL BOR.

   Audit topgan holat: 160 ta marshrutning 144 tasi `authenticateToken` bilan
   yopilgan ("kim ekaningni ko'rsat"), lekin `requireRole` atigi 16 tasida
   turgan. Ya'ni AUTENTIFIKATSIYA bor edi, AVTORIZATSIYA yo'q: kirgan har
   qanday foydalanuvchi qolgan hamma yozuv amalini bajara olardi — registrator
   ham xarajat o'chira olardi, hamshira ham klinika sozlamalarini o'zgartira
   olardi.

   NIMA UCHUN JADVAL, HAR MARSHRUTGA `requireRole` EMAS.

   171 ta yozuv marshruti bor. Ularning har biriga qo'lda middleware qo'shish
   — 171 ta o'zgartirish va 171 ta unutish imkoniyati. Yangi marshrut
   qo'shilganda esa uni himoyalash ESDAN CHIQADI va buni hech narsa aytmaydi.

   Shuning uchun qoida teskari yozildi: **mos qoida topilmagan yozuv amali
   rad etiladi**. Yangi marshrut qo'shgan dasturchi uni shu jadvalga yozmasa,
   marshrut ishlamaydi va sabab javobda aniq yoziladi. Unutish mumkin emas.

   O'QISH (GET) cheklanmaydi. Ma'lumot `getScopedClinicId` orqali allaqachon
   klinikaga bog'langan, va rol bo'yicha ko'rinishni interfeys hal qiladi.
   O'qishni ham yopish keyingi qadam — lekin u alohida ish, chunki har bir
   ro'yxat qaysi rolga kerakligini tekshirish talab qiladi.

   TEKSHIRUV. `tests/permissions.test.ts` har bir marshrut jadvalda borligini
   sinaydi: kodda mavjud, jadvalda yo'q marshrut sinovni yiqitadi.
   ───────────────────────────────────────────────────────────────────────── */

export const ROLES = {
    ADMIN: 'CLINIC_ADMIN',
    DOCTOR: 'DOCTOR',
    RECEPTION: 'RECEPTIONIST',
    LAB: 'LAB_TECHNICIAN',
    NURSE: 'NURSE',
} as const;

const A = ROLES.ADMIN;
const D = ROLES.DOCTOR;
const R = ROLES.RECEPTION;
const L = ROLES.LAB;
const N = ROLES.NURSE;

/** Klinika egasi hamma narsani qila oladi — har qatorda takrorlamaslik uchun. */
const owner = (...extra: string[]) => [A, ...extra];

export interface Rule {
    /** 'POST' | 'PUT' | 'PATCH' | 'DELETE' yoki '*' — barcha yozuv usullari */
    method: string;
    /** Express uslubidagi yo'l: /api/patients/:id */
    path: string;
    /** Ruxsat etilgan rollar. Bo'sh massiv — hech kimga (ishlatilmaydi). */
    roles: string[];
}

/* ─── Ochiq marshrutlar ───────────────────────────────────────────────────────
   Bularda token umuman talab qilinmaydi, shuning uchun rol tekshiruvi ham
   qo'llanmaydi. Ro'yxat ANIQ bo'lishi shart: bu yerga tushgan har bir yo'l
   internetdan ochiq. */
export const PUBLIC_PATHS: { method: string; path: string }[] = [
    { method: 'POST', path: '/api/auth/login' },
    /* Yangilash va chiqish `authenticateToken` dan o'tmaydi — kirish tokeni
       aynan eskirgani uchun bu yerga kelinadi. Himoya `httpOnly` cookie'da:
       uni JavaScript o'qiy ham, yubora ham olmaydi. */
    { method: 'POST', path: '/api/auth/refresh' },
    { method: 'POST', path: '/api/auth/logout' },
    { method: 'POST', path: '/api/public/demo-request' },
    { method: 'POST', path: '/api/public/leads' },
    // AI maslahatchi demo sahifasida ishlatiladi.
    { method: 'POST', path: '/api/ai/dental-advisor' },
];

export const RULES: Rule[] = [

    /* ─── Parol ────────────────────────────────────────────────────────────
       Har qanday kirgan foydalanuvchi o'z parolini almashtiradi. Cheklangan
       token (`scope: 'password-change'`) faqat SHU marshrutga yaraydi —
       tekshiruv `authenticateToken` ichida. */
    { method: 'POST', path: '/api/auth/change-password', roles: [A, D, R, L, N] },

    /* ─── Bemorlar ─────────────────────────────────────────────────────────
       Shifokor ham bemor qo'sha oladi: qabul paytida kartasi yo'q bemor
       chiqib qolishi odatiy hol. O'chirish esa faqat egada — bemorni
       o'chirish tashrif, to'lov va tahlil tarixini ham olib ketadi. */
    { method: 'POST', path: '/api/patients', roles: owner(R, D) },
    { method: 'PUT', path: '/api/patients/:id', roles: owner(R, D) },
    { method: 'DELETE', path: '/api/patients/:id', roles: owner() },
    { method: 'POST', path: '/api/patients/:id/photos', roles: owner(R, D) },
    { method: 'POST', path: '/api/patients/:id/avatar', roles: owner(R, D) },
    { method: 'POST', path: '/api/patients/:id/portrait', roles: owner(R, D) },
    { method: 'DELETE', path: '/api/photos/:id', roles: owner(D) },
    { method: 'POST', path: '/api/patients/:id/remind-debt', roles: owner(R) },
    { method: 'POST', path: '/api/patients/:id/send-message', roles: owner(R) },
    // Ikki kartani birlashtirish — qaytarib bo'lmaydigan amal.
    { method: 'POST', path: '/api/patient-merge', roles: owner() },

    /* ─── Qabullar va kalendar ─────────────────────────────────────────────── */
    { method: 'POST', path: '/api/appointments', roles: owner(R, D) },
    { method: 'PUT', path: '/api/appointments/:id', roles: owner(R, D) },
    { method: 'DELETE', path: '/api/appointments/:id', roles: owner(R) },
    { method: 'POST', path: '/api/appointments/:id/remind', roles: owner(R) },

    /* ─── Registratura oqimi: vizit ────────────────────────────────────────
       `PUT /api/visits/:id` — qabulni yakunlash, bayon va tashxis yozish:
       bu shifokorning ishi. Ochish va chaqirish — registraturaniki. */
    { method: 'POST', path: '/api/visits', roles: owner(R, D) },
    { method: 'POST', path: '/api/visits/:id/call', roles: owner(R, D) },
    { method: 'PUT', path: '/api/visits/:id', roles: owner(D, R) },
    { method: 'DELETE', path: '/api/visits/:id', roles: owner(R) },
    { method: 'POST', path: '/api/visits/:id/lock', roles: owner(D) },
    { method: 'POST', path: '/api/visits/:id/procedures', roles: owner(D, R) },
    { method: 'DELETE', path: '/api/visit-procedures/:id', roles: owner(D, R) },
    { method: 'POST', path: '/api/visits/:id/dmed-sync', roles: owner(D, R) },

    /* ─── Klinik yozuvlar — shifokorniki ───────────────────────────────────
       Tashxis, allergiya, retsept va yo'llanma — tibbiy qaror. Registrator
       ularni kirita olmaydi. */
    { method: 'POST', path: '/api/diagnoses', roles: owner(D) },
    { method: 'DELETE', path: '/api/diagnoses/:id', roles: owner(D) },
    { method: 'POST', path: '/api/patients/:id/allergies', roles: owner(D, N) },
    { method: 'DELETE', path: '/api/patients/:id/allergies/:allergyId', roles: owner(D) },
    { method: 'POST', path: '/api/prescriptions', roles: owner(D) },
    { method: 'DELETE', path: '/api/prescriptions/:id', roles: owner(D) },
    { method: 'POST', path: '/api/referrals', roles: owner(D) },
    { method: 'POST', path: '/api/referrals/:id/use', roles: owner(D, R) },
    { method: 'POST', path: '/api/referrals/:id/cancel', roles: owner(D, R) },
    { method: 'POST', path: '/api/lab-orders/:id/seen', roles: owner(D) },
    { method: 'POST', path: '/api/studies/:id/seen', roles: owner(D) },

    /* ─── Hujjatlar va rozilik ─────────────────────────────────────────────── */
    { method: 'POST', path: '/api/patient-documents', roles: owner(R, D) },
    { method: 'POST', path: '/api/patient-documents/:id/sign', roles: owner(R, D) },

    /* ─── Pul: kassa ───────────────────────────────────────────────────────
       To'lov qabul qilish — registratorning asosiy ishi. Lekin to'lovni
       KEYIN o'zgartirish yoki o'chirish faqat egada: bu audit izini
       buzadigan amal. Kassani qayta ochish ham egada. */
    { method: 'POST', path: '/api/transactions', roles: owner(R) },
    { method: 'PUT', path: '/api/transactions/:id', roles: owner() },
    { method: 'DELETE', path: '/api/transactions/:id', roles: owner() },
    { method: 'POST', path: '/api/payments', roles: owner(R) },
    { method: 'POST', path: '/api/cash-register/open', roles: owner(R) },
    { method: 'POST', path: '/api/cash-register/close', roles: owner(R) },
    { method: 'DELETE', path: '/api/cash-register/:date', roles: owner() },
    { method: 'POST', path: '/api/cash-movements', roles: owner(R) },
    { method: 'DELETE', path: '/api/cash-movements/:id', roles: owner() },
    { method: 'POST', path: '/api/installments', roles: owner(R) },
    { method: 'POST', path: '/api/installments/:id/pay', roles: owner(R) },
    { method: 'DELETE', path: '/api/installments/:id', roles: owner() },

    /* ─── Pul: hisob qatorlari ─────────────────────────────────────────────
       Shifokor xizmat buyuradi (qator ochadi), registrator to'lovni oladi.
       Chegirma va qaytarish — egada: ular tushumni kamaytiradi. */
    { method: 'POST', path: '/api/charges', roles: owner(D, R) },
    { method: 'DELETE', path: '/api/charges/:id', roles: owner(D, R) },
    { method: 'POST', path: '/api/charges/:id/refund', roles: owner() },
    { method: 'PUT', path: '/api/charges/:id/discount', roles: owner() },

    /* ─── Pul: xarajat va oylik ────────────────────────────────────────────
       Butunlay egada. Registrator xarajat kirita olmaydi — aks holda kassa
       farqini xarajat yozib yopib qo'yish mumkin bo'lardi. */
    { method: 'POST', path: '/api/expenses', roles: owner() },
    { method: 'PUT', path: '/api/expenses/:id', roles: owner() },
    { method: 'DELETE', path: '/api/expenses/:id', roles: owner() },
    { method: 'PUT', path: '/api/doctor-rates/:doctorId', roles: owner() },
    { method: 'POST', path: '/api/payroll/runs', roles: owner() },
    { method: 'POST', path: '/api/payroll/runs/:id/approve', roles: owner() },
    { method: 'POST', path: '/api/payroll/lines/:id/pay', roles: owner() },
    { method: 'DELETE', path: '/api/payroll/runs/:id', roles: owner() },
    { method: 'POST', path: '/api/admin/recalculate-balances', roles: owner() },

    /* ─── Laboratoriya ─────────────────────────────────────────────────────
       Buyurtmani registrator yoki shifokor beradi; namuna olish va natija
       kiritish — laborantniki. */
    { method: 'POST', path: '/api/lab-orders', roles: owner(R, D) },
    { method: 'PUT', path: '/api/lab-orders/:id', roles: owner(R, D, L) },
    { method: 'DELETE', path: '/api/lab-orders/:id', roles: owner(R) },
    { method: 'POST', path: '/api/lab-orders/:id/collect', roles: owner(L, R, N) },
    { method: 'POST', path: '/api/lab-orders/:id/results', roles: owner(L) },
    // Tahlil turlari spravochnigi — sozlama, egada.
    { method: 'POST', path: '/api/lab-tests', roles: owner() },
    { method: 'PUT', path: '/api/lab-tests/:id', roles: owner() },
    { method: 'DELETE', path: '/api/lab-tests/:id', roles: owner() },

    /* ─── Diagnostika (UZI, rentgen, EKG) ──────────────────────────────────── */
    { method: 'POST', path: '/api/studies', roles: owner(R, D) },
    { method: 'PUT', path: '/api/studies/:id', roles: owner(D) },
    { method: 'DELETE', path: '/api/studies/:id', roles: owner(D) },
    { method: 'POST', path: '/api/studies/:id/files', roles: owner(D, R) },
    { method: 'DELETE', path: '/api/study-files/:id', roles: owner(D) },

    /* ─── Statsionar ───────────────────────────────────────────────────────
       Yotqizish va chiqarish — shifokor/registrator. Kunlik ishlar
       (ko'rsatkich, dori berish, koyka tayyorlash) — hamshiraniki. */
    { method: 'POST', path: '/api/admissions', roles: owner(D, R) },
    { method: 'PUT', path: '/api/admissions/:id', roles: owner(D, R) },
    { method: 'POST', path: '/api/admissions/:id/discharge', roles: owner(D, R) },
    { method: 'POST', path: '/api/admissions/:id/transfer', roles: owner(D, R, N) },
    { method: 'POST', path: '/api/admissions/:id/rounds', roles: owner(D, N) },
    { method: 'POST', path: '/api/admissions/:id/medications', roles: owner(D) },
    { method: 'POST', path: '/api/admissions/:id/charge-bed-days', roles: owner(R) },
    { method: 'POST', path: '/api/medication-orders/:id/administer', roles: owner(N, D) },
    { method: 'POST', path: '/api/vitals', roles: owner(N, D, R) },
    { method: 'POST', path: '/api/beds/:id/ready', roles: owner(N, R) },
    // Palata to'ri — sozlama.
    { method: 'POST', path: '/api/wards', roles: owner() },
    { method: 'PUT', path: '/api/wards/:id', roles: owner() },

    /* ─── Ombor ────────────────────────────────────────────────────────────
       Kirim/chiqim/ko'chirish — registrator yoki hamshira bajaradi.
       Inventarizatsiya tuzatishi (`adjust`) va qaytarish (`reverse`) —
       egada: ular qoldiqni sababsiz o'zgartira oladi. */
    { method: 'POST', path: '/api/inventory', roles: owner(R) },
    { method: 'DELETE', path: '/api/inventory/:id', roles: owner() },
    { method: 'PUT', path: '/api/inventory/:id/stock', roles: owner(R) },
    { method: 'DELETE', path: '/api/inventory/logs/:id', roles: owner() },
    { method: 'POST', path: '/api/inventory/:id/batches', roles: owner(R, N) },
    { method: 'PUT', path: '/api/inventory-items/:id', roles: owner(R) },
    { method: 'POST', path: '/api/stock-movements/in', roles: owner(R, N) },
    { method: 'POST', path: '/api/stock-movements/out', roles: owner(R, N, D) },
    { method: 'POST', path: '/api/stock-movements/transfer', roles: owner(R, N) },
    { method: 'POST', path: '/api/stock-movements/adjust', roles: owner() },
    { method: 'POST', path: '/api/stock-movements/:id/reverse', roles: owner() },
    { method: 'PUT', path: '/api/service-recipes/:serviceId', roles: owner() },

    /* ─── Lidlar (CRM) ─────────────────────────────────────────────────────── */
    { method: 'POST', path: '/api/leads', roles: owner(R) },
    { method: 'PUT', path: '/api/leads/:id', roles: owner(R) },
    { method: 'DELETE', path: '/api/leads/:id', roles: owner() },

    /* ─── Xizmatlar va kategoriyalar ───────────────────────────────────────
       Narx qo'yish registratorga ochiq qoldirildi: bu allaqachon qabul
       qilingan qaror (`POST /api/services` da shunday edi) va kichik
       klinikada narxlarni registrator yuritadi. O'chirish — egada. */
    { method: 'POST', path: '/api/services', roles: owner(R) },
    { method: 'PUT', path: '/api/services/:id', roles: owner(R) },
    { method: 'DELETE', path: '/api/services/:id', roles: owner() },
    { method: 'POST', path: '/api/categories', roles: owner(R) },
    { method: 'PUT', path: '/api/categories/:id', roles: owner(R) },
    { method: 'DELETE', path: '/api/categories/:id', roles: owner() },

    /* ─── Xodimlar — faqat ega ─────────────────────────────────────────────
       Ilgari bu yerda rol umuman tekshirilmasdi: kirgan har kim login
       yaratib, undan kira olardi. `STAFF` middleware'i qo'shilgan, jadval
       uni takrorlaydi. */
    { method: 'POST', path: '/api/doctors', roles: owner() },
    { method: 'PUT', path: '/api/doctors/:id', roles: owner() },
    { method: 'DELETE', path: '/api/doctors/:id', roles: owner() },
    { method: 'POST', path: '/api/receptionists', roles: owner() },
    { method: 'PUT', path: '/api/receptionists/:id', roles: owner() },
    { method: 'DELETE', path: '/api/receptionists/:id', roles: owner() },
    { method: 'POST', path: '/api/lab-technicians', roles: owner() },
    { method: 'PUT', path: '/api/lab-technicians/:id', roles: owner() },
    { method: 'DELETE', path: '/api/lab-technicians/:id', roles: owner() },
    { method: 'POST', path: '/api/nurses', roles: owner() },
    { method: 'PUT', path: '/api/nurses/:id', roles: owner() },
    { method: 'DELETE', path: '/api/nurses/:id', roles: owner() },

    /* ─── Klinika sozlamalari — faqat ega ──────────────────────────────────── */
    { method: 'PUT', path: '/api/clinics/:id/general', roles: owner() },
    { method: 'PUT', path: '/api/clinics/:id/settings', roles: owner() },
    { method: 'PUT', path: '/api/clinics/:id/cash-settings', roles: owner() },
    { method: 'PUT', path: '/api/clinics/:id/access-control', roles: owner() },
    { method: 'PUT', path: '/api/clinics/:id/prepayment-settings', roles: owner() },
    { method: 'PUT', path: '/api/clinics/:id/sms-settings', roles: owner() },
    { method: 'POST', path: '/api/clinics/:id/sms-test', roles: owner() },
    { method: 'POST', path: '/api/clinics/:id/dmed-settings', roles: owner() },
    { method: 'POST', path: '/api/clinics/:id/dmed-test', roles: owner() },
    { method: 'POST', path: '/api/departments', roles: owner() },
    { method: 'PUT', path: '/api/departments/:id', roles: owner() },
    { method: 'DELETE', path: '/api/departments/:id', roles: owner() },
    { method: 'POST', path: '/api/encounter-templates', roles: owner() },
    { method: 'PUT', path: '/api/encounter-templates/:id', roles: owner() },
    { method: 'DELETE', path: '/api/encounter-templates/:id', roles: owner() },

    /* ─── Xabarlar va avtomatlashtirish — faqat ega ────────────────────────
       Ommaviy yuborish pul turadi va butun bazaga ketadi. */
    { method: 'POST', path: '/api/message-templates', roles: owner() },
    { method: 'PUT', path: '/api/message-templates/:id', roles: owner() },
    { method: 'DELETE', path: '/api/message-templates/:id', roles: owner() },
    { method: 'POST', path: '/api/message-templates/:id/sync-eskiz-status', roles: owner() },
    { method: 'POST', path: '/api/automation-rules', roles: owner() },
    { method: 'PUT', path: '/api/automation-rules/:id', roles: owner() },
    { method: 'DELETE', path: '/api/automation-rules/:id', roles: owner() },
    { method: 'POST', path: '/api/messages/send-bulk', roles: owner() },
    { method: 'POST', path: '/api/messages/saved-segments', roles: owner() },
    { method: 'DELETE', path: '/api/messages/saved-segments/:id', roles: owner() },
    { method: 'POST', path: '/api/messages/audience', roles: owner() },
    { method: 'PUT', path: '/api/messages/settings', roles: owner() },
    { method: 'POST', path: '/api/messages/test-send', roles: owner() },
    { method: 'POST', path: '/api/messages/retry', roles: owner() },
    { method: 'POST', path: '/api/batch/remind-appointments', roles: owner() },
    { method: 'POST', path: '/api/batch/remind-debts', roles: owner() },

    /* ─── Integratsiyalar va API kalitlari — faqat ega ─────────────────────── */
    { method: 'POST', path: '/api/leads/api-key', roles: owner() },
    { method: 'DELETE', path: '/api/leads/api-key', roles: owner() },
    { method: 'PUT', path: '/api/admin/remote-access', roles: owner() },

    /* ─── Zaxira nusxa va tiklash — faqat ega ──────────────────────────────
       Tiklash butun bazani almashtiradi. */
    { method: 'POST', path: '/api/admin/backup', roles: owner() },
    { method: 'PUT', path: '/api/admin/backup/config', roles: owner() },
    { method: 'POST', path: '/api/admin/backup/restore', roles: owner() },
    { method: 'DELETE', path: '/api/admin/backup/restore', roles: owner() },

    /* ─── AI ───────────────────────────────────────────────────────────────
       Savol berish hammaga; hisobot va tahlil moliyaviy raqamlarni
       ko'rsatadi, shuning uchun egada. */
    { method: 'POST', path: '/api/ai/ask', roles: [A, D, R, L, N] },
    { method: 'POST', path: '/api/ai/chat', roles: [A, D, R, L, N] },
    { method: 'POST', path: '/api/ai/report', roles: owner() },
    { method: 'POST', path: '/api/ai/insights', roles: owner() },
];

/* ─── Moslashtirish ──────────────────────────────────────────────────────── */

/** `/api/patients/:id` → `^/api/patients/[^/]+$` */
function compile(path: string): RegExp {
    const escaped = path
        .split('/')
        .map(seg => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/');
    return new RegExp(`^${escaped}/?$`);
}

const COMPILED = RULES.map(r => ({ ...r, re: compile(r.path) }));
const PUBLIC_COMPILED = PUBLIC_PATHS.map(r => ({ ...r, re: compile(r.path) }));

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isPublic(method: string, path: string): boolean {
    return PUBLIC_COMPILED.some(r => r.method === method.toUpperCase() && r.re.test(path));
}

export type Decision =
    | { allow: true }
    | { allow: false; reason: 'role'; allowed: string[] }
    | { allow: false; reason: 'unlisted' };

/**
 * Amalga ruxsat bormi.
 *
 * O'qish (GET/HEAD/OPTIONS) — har doim ruxsat: ma'lumot `getScopedClinicId`
 * orqali klinikaga bog'langan. Yozuv — faqat jadvalda mos qoida bo'lsa va
 * rol shu qoidada ko'rsatilgan bo'lsa.
 */
export function check(method: string, path: string, role: string | undefined): Decision {
    const m = method.toUpperCase();

    const rule = COMPILED.find(r => (r.method === m || r.method === '*') && r.re.test(path));
    if (rule) {
        return role && rule.roles.includes(role)
            ? { allow: true }
            : { allow: false, reason: 'role', allowed: rule.roles };
    }

    // Jadvalda yo'q. O'qish o'tadi, yozuv o'tmaydi.
    if (!WRITE_METHODS.has(m)) return { allow: true };
    return { allow: false, reason: 'unlisted' };
}
