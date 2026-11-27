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

import { makePermChecker, PermChecker, PermRole, resolveRolePerms, legacyFlags } from './staffPerms';

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
    { method: 'POST', path: '/api/public/leads' },
    /* Saytdan yozilish (0046): sozlama o'chiq bo'lsa 404, IP bo'yicha chegara */
    { method: 'POST', path: '/api/public/booking' },
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
    /* Qayta ko'rik sanasi — shifokorning qarori (2026-11-26) */
    { method: 'POST', path: '/api/visits/:id/follow-up', roles: owner(D) },
    { method: 'POST', path: '/api/visits/:id/procedures', roles: owner(D, R) },
    { method: 'DELETE', path: '/api/visit-procedures/:id', roles: owner(D, R) },
    { method: 'POST', path: '/api/visits/:id/dmed-sync', roles: owner(D, R) },

    /* ─── Klinik yozuvlar — shifokorniki ───────────────────────────────────
       Tashxis, retsept va yo'llanma — tibbiy qaror, registrator ularni
       kirita olmaydi. ALLERGIYA bundan mustasno (klinika egasi,
       2026-11-21): uni anamnez bilan birga qabulxona ham so'rab yozadi. */
    { method: 'POST', path: '/api/diagnoses', roles: owner(D) },
    { method: 'PATCH', path: '/api/diagnoses/:id', roles: owner(D) },
    { method: 'DELETE', path: '/api/diagnoses/:id', roles: owner(D) },
    { method: 'POST', path: '/api/patients/:id/allergies', roles: owner(D, N, R) },
    { method: 'DELETE', path: '/api/patients/:id/allergies/:allergyId', roles: owner(D, R) },
    { method: 'POST', path: '/api/prescriptions', roles: owner(D) },
    { method: 'DELETE', path: '/api/prescriptions/:id', roles: owner(D) },
    /* Bemorning Telegramiga PDF (2026-11-26): kim chop eta olsa, o'sha yuboradi */
    { method: 'POST', path: '/api/prescriptions/:id/send-telegram', roles: owner(D, R) },
    { method: 'POST', path: '/api/lab-orders/:id/send-telegram', roles: owner(D, L, R) },
    { method: 'PUT', path: '/api/clinics/:id/lab-auto-send', roles: owner() },
    /* Probirka yorlig'i va natijani tasdiqlash (2026-11-26, labSamples.ts).
       Yorliq — proba oladigan kim bo'lsa; tasdiq — ega ochib bergan xodim. */
    { method: 'POST', path: '/api/lab-orders/:id/label', roles: owner(L, R, N) },
    { method: 'POST', path: '/api/lab-orders/:id/verify', roles: owner(L, D) },
    { method: 'PUT', path: '/api/clinics/:id/lab-settings', roles: owner() },
    /* Xarajatni tasdiqlash va bo'lim byudjeti (2026-11-26, expenseApproval.ts) — faqat ega */
    { method: 'POST', path: '/api/expenses/:id/approve', roles: owner() },
    { method: 'POST', path: '/api/expenses/:id/reject', roles: owner() },
    { method: 'PUT', path: '/api/clinics/:id/expense-settings', roles: owner() },
    /* Shikoyatlar (2026-11-26, complaints.ts): ishlash — ruxsat berilgan xodim
       (registratorda standart yoqiq); qayta ochish va xabar sozlamasi — ega */
    { method: 'POST', path: '/api/complaints', roles: owner(R, D, N, L) },
    { method: 'PUT', path: '/api/complaints/:id', roles: owner(R, D, N, L) },
    { method: 'POST', path: '/api/complaints/:id/resolve', roles: owner(R, D, N, L) },
    { method: 'POST', path: '/api/complaints/:id/reopen', roles: owner() },
    { method: 'PUT', path: '/api/clinics/:id/complaint-alert', roles: owner() },
    /* Saytdan kelgan so'rov (2026-11-26, onlineBooking.ts): kim kalendar yozsa — o'sha */
    { method: 'POST', path: '/api/appointments/:id/confirm', roles: owner(R, D) },
    { method: 'POST', path: '/api/appointments/:id/reject', roles: owner(R, D) },
    { method: 'PUT', path: '/api/online-booking/settings', roles: owner() },
    /* Davolash to'plami (2026-11-26): shifokor o'zinikini, ega klinikanikini */
    { method: 'POST', path: '/api/treatment-templates', roles: owner(D) },
    { method: 'POST', path: '/api/treatment-templates/:id/use', roles: owner(D) },
    { method: 'DELETE', path: '/api/treatment-templates/:id', roles: owner(D) },
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
    /* Avans to'ldirish — kassirning ishi, xuddi to'lov kabi. */
    { method: 'POST', path: '/api/payments/advance', roles: owner(R) },
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
       2026-11-22: registrator MAYDA NAQD xarajatni yozadi (toifa, usul va sana
       cheklovi — `server.ts` POST /api/expenses); tuzatish va o'chirish egada.
       Ilgari butunlay egada edi («registrator kamomadni xarajat yozib
       yopmasin»). Endi yozuvda kim yozgani turadi va ega uni ko'radi. */
    { method: 'POST', path: '/api/expenses', roles: owner(R) },
    { method: 'PUT', path: '/api/expenses/:id', roles: owner() },
    { method: 'DELETE', path: '/api/expenses/:id', roles: owner() },
    { method: 'PUT', path: '/api/doctor-rates/:doctorId', roles: owner() },
    { method: 'POST', path: '/api/payroll/runs', roles: owner() },
    { method: 'POST', path: '/api/payroll/runs/:id/approve', roles: owner() },
    { method: 'POST', path: '/api/payroll/lines/:id/pay', roles: owner() },
    { method: 'DELETE', path: '/api/payroll/runs/:id', roles: owner() },

    /* Xodimlar moduli (HR). Oylik, bonus va jarima — faqat klinika egasi.
       Davomat ham shu yerda: kim kelmagani ish haqiga sabab bo'ladi. */
    { method: 'POST', path: '/api/hr/staff/:role/:id/adjustments', roles: owner() },
    { method: 'DELETE', path: '/api/hr/adjustments/:id', roles: owner() },
    { method: 'POST', path: '/api/hr/staff/:role/:id/pay', roles: owner() },
    { method: 'POST', path: '/api/hr/staff/:role/:id/attendance', roles: owner() },
    { method: 'POST', path: '/api/admin/recalculate-balances', roles: owner() },

    /* ─── Laboratoriya ─────────────────────────────────────────────────────
       Buyurtmani registrator yoki shifokor beradi; namuna olish va natija
       kiritish — laborantniki. */
    { method: 'POST', path: '/api/lab-orders', roles: owner(R, D) },
    { method: 'PUT', path: '/api/lab-orders/:id', roles: owner(R, D, L) },
    /* Yuborgan shifokor to'lanmagan yo'llanmani bekor qila oladi (2026-11-26):
       ilgari yuborish mumkin edi-yu, varaqdagi «×» va to'plamni «Bekor qilish»
       shifokorga 403 qaytarardi. To'langanini server baribir rad etadi (LAB_PAID). */
    { method: 'DELETE', path: '/api/lab-orders/:id', roles: owner(R, D) },
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
    /* Yotish hisobiga qo'lda qator (nom + summa). Hamshiraga ham ochiq:
       u dori varag'i orqali shu hisobga baribir yozadi. Umumiy
       `/api/charges` esa unga yopiq qoladi. */
    { method: 'POST', path: '/api/admissions/:id/charges', roles: owner(D, R, N) },
    { method: 'POST', path: '/api/medication-orders/:id/administer', roles: owner(N, D) },
    { method: 'POST', path: '/api/vitals', roles: owner(N, D, R) },
    { method: 'POST', path: '/api/beds/:id/ready', roles: owner(N, R) },
    // Palata to'ri — sozlama.
    { method: 'POST', path: '/api/wards', roles: owner() },
    { method: 'PUT', path: '/api/wards/:id', roles: owner() },
    /* Koyka qo'shish va ta'mirga chiqarish — registrator ham qiladi:
       u palata to'rini kunlik boshqaradi. O'chirish faqat egada. */
    { method: 'POST', path: '/api/wards/:id/beds', roles: owner(R) },
    { method: 'PUT', path: '/api/beds/:id', roles: owner(R) },
    { method: 'DELETE', path: '/api/beds/:id', roles: owner() },
    /* Tayinlovni to'xtatish — shifokorning qarori, hamshiraning emas. */
    { method: 'PUT', path: '/api/medication-orders/:id', roles: owner(D) },

    /* ─── Ombor ────────────────────────────────────────────────────────────
       Kirim/chiqim/ko'chirish — registrator yoki hamshira bajaradi.
       Inventarizatsiya tuzatishi (`adjust`) va qaytarish (`reverse`) —
       egada: ular qoldiqni sababsiz o'zgartira oladi. */
    { method: 'POST', path: '/api/inventory', roles: owner(R) },
    { method: 'PUT', path: '/api/inventory/:id', roles: owner(R) },
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
    { method: 'POST', path: '/api/messages/test-send', roles: owner() },
    { method: 'POST', path: '/api/messages/retry', roles: owner() },
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
    /* AI sozlamalari. Ilgari jadvalda YO'Q edi — ya'ni egaga ham 403
       `PERMISSION_UNLISTED` qaytardi va sozlamani saqlab bo'lmasdi. */
    { method: 'PUT', path: '/api/ai/settings', roles: owner() },
    { method: 'POST', path: '/api/ai/settings/test', roles: owner() },
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
export function check(method: string, path: string, role: string | string[] | undefined): Decision {
    const m = method.toUpperCase();
    const roles = Array.isArray(role) ? role : role ? [role] : [];

    const rule = COMPILED.find(r => (r.method === m || r.method === '*') && r.re.test(path));
    if (rule) {
        return roles.some(r => rule.roles.includes(r))
            ? { allow: true }
            : { allow: false, reason: 'role', allowed: rule.roles };
    }

    // Jadvalda yo'q. O'qish o'tadi, yozuv o'tmaydi.
    if (!WRITE_METHODS.has(m)) return { allow: true };
    return { allow: false, reason: 'unlisted' };
}

/* ─── MOLIYANI O'QISH (audit 2026-09-17) ────────────────────────────────────

   Yuqoridagi jadval faqat YOZUVNI boshqaradi, o'qish esa hammaga ochiq edi.
   Egasining «Kirish nazorati» dagi «Moliyani ko'rsatish» bayrog'i faqat
   ekranda ishlardi: laborant `GET /api/reports/summary` bilan sof foydani,
   hamshira xarajatlar va kassa jurnalini to'g'ridan-to'g'ri olardi.

   Qoida interfeysdagi `canSeeFinance` (utils/accessControl.ts) bilan bir xil:
     · hamshira va laborant — faqat ega aniq ochib bergan bo'lsa (`showFinance: true`);
     · shifokor va registrator — ega `showFinance: false` qo'ygan bo'lsa;
     · ega — har doim.
   To'lovlar ro'yxati (`/api/transactions`) shifokor va registratorga
   bayroqdan qat'i nazar ochiq: bemor kartasi to'lov tarixini ko'rsatadi. */
const FINANCE_READ: RegExp[] = [
    /^\/api\/expenses(\/|$)/,
    /^\/api\/cash-register(\/|$)/,
    /^\/api\/cash-movements(\/|$)/,
    /^\/api\/cash-audit(\/|$)/,
    /^\/api\/reports\/summary(\/|$)/,
    /* Bular ham pul qaytaradi: tushum, qarz summasi, qarzdorlar ro'yxati.
       Ilgari faqat kirishni tekshirardi — hamshira ham, «pulni ko'rmasin»
       deb belgilangan registrator ham ularni o'qiy olardi. */
    /* `/api/reports/snapshot` bu ro'yxatda YO'Q: undagi bemor sonlari
       (jami, yangi) pul emas va Bemorlar sahifasida hamma rolga kerak.
       Pulni ko'rmaydigan rolga u puldan tozalangan holda beriladi —
       `hidesMoney` va `reports.ts` dagi snapshot marshruti. */
    /^\/api\/reports\/dashboard(\/|$)/,
    /^\/api\/reports\/debtors(\/|$)/,
    /^\/api\/reports\/attendance(\/|$)/,
];
const TRANSACTIONS_READ = /^\/api\/transactions(\/|$)/;

export function isFinanceRead(method: string, path: string): boolean {
    const m = method.toUpperCase();
    if (m !== 'GET' && m !== 'HEAD') return false;
    return FINANCE_READ.some(re => re.test(path)) || TRANSACTIONS_READ.test(path);
}

/* ─── RUXSATLAR SOZLAMASINI TOZALASH ─────────────────────────────────
   Ekran har rol uchun `perms` yuboradi (`staffPerms.ts`). Server ularni
   katalog bo'yicha tozalaydi va eski bayroqlarni (hiddenModules,
   showFinance, showPatientPhone) O'ZI hisoblaydi — mijoz yuborgan
   bayroqlarga ishonilmaydi. `perms` siz eski shakl ham qabul qilinadi
   (eski ilova versiyasi), u ham katalogdan o'tkaziladi. */
const ACCESS_ROLE_FIELDS: PermRole[] = ['doctor', 'receptionist', 'labTechnician', 'nurse'];

export function sanitizeAccessControl(raw: unknown): Record<string, any> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const src = raw as Record<string, unknown>;
    const out: Record<string, any> = {};
    for (const key of ACCESS_ROLE_FIELDS) {
        const entry = src[key];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const perms = resolveRolePerms(key, { [key]: entry });
        out[key] = { ...legacyFlags(key, perms), perms };
    }
    return out;
}

/* ─── XODIM RUXSATLARI BO'YICHA TEKSHIRUV (2026-11-25) ───────────────────

   Ega «Xodimlar → Ruxsatlar» jadvalida har rolga har amalni beradi yoki
   oladi (`staffPerms.ts`, DentaCRM modeli). Shu ro'yxatdagi marshrutlar
   uchun egadan boshqa xodimda QAROR SHU YERDA: yuqoridagi `RULES` dagi rol
   qoidasi ishlatilmaydi. «Standart» shablon RULES dagi eski xatti-harakatni
   aynan takrorlaydi — sozlamaga tegmagan klinikada hech narsa o'zgarmaydi.

   Ro'yxatda YO'Q marshrutlar RULES bo'yicha qoladi: tashxis, retsept, dori
   buyurish (faqat shifokor), maosh, ruxsatlar, zaxira nusxa (faqat ega).

   `actsAs` — marshrut ichidagi qo'lda yozilgan rol tekshiruvi. Ruxsat shu
   jadval bo'yicha berilgan bo'lsa (`req.permAllowed`), u ham o'tkazadi. */

type PermCheck = (p: PermChecker, req: any) => boolean;
interface PermRoute { method: string; path: string; check: PermCheck; what: string }

const r = (method: string, path: string, what: string, check: PermCheck): PermRoute => ({ method, path, what, check });

export const PERM_ROUTES: PermRoute[] = [
    /* Bugun — navbat va qabul */
    r('POST', '/api/visits', 'qabul ochish', p => p.can('reception', 'queue', 'create') || p.can('calendar', 'appts', 'create')),
    r('POST', '/api/visits/:id/call', 'bemorni chaqirish', p => p.can('reception', 'queue', 'edit')),
    r('PUT', '/api/visits/:id', 'qabulni yuritish', p => p.can('reception', 'queue', 'edit')),
    r('DELETE', '/api/visits/:id', 'qabulni bekor qilish', p => p.can('reception', 'queue', 'delete')),
    r('POST', '/api/visits/:id/procedures', 'xizmat qo\'shish', p => p.can('reception', 'queue', 'edit')),
    r('DELETE', '/api/visit-procedures/:id', 'xizmatni olib tashlash', p => p.can('reception', 'queue', 'edit')),

    /* Bemorlar */
    r('POST', '/api/patients', 'bemor qo\'shish', p => p.can('patients', 'card', 'create')),
    r('PUT', '/api/patients/:id', 'bemor kartasini tahrirlash', p => p.can('patients', 'card', 'edit')),
    r('DELETE', '/api/patients/:id', 'bemorni o\'chirish', p => p.can('patients', 'card', 'delete')),
    r('POST', '/api/patients/:id/photos', 'surat yuklash', p => p.can('patients', 'photos', 'create')),
    r('POST', '/api/patients/:id/avatar', 'surat yuklash', p => p.can('patients', 'photos', 'create') || p.can('patients', 'card', 'edit')),
    r('POST', '/api/patients/:id/portrait', 'surat yuklash', p => p.can('patients', 'photos', 'create') || p.can('patients', 'card', 'edit')),
    r('DELETE', '/api/photos/:id', 'suratni o\'chirish', p => p.can('patients', 'photos', 'delete')),
    r('POST', '/api/patients/:id/allergies', 'allergiya yozish', p => p.can('patients', 'history', 'edit')),
    /* O'chirish — hamshirada yo'q (u faqat yozadi), eski qoida shunday */
    r('DELETE', '/api/patients/:id/allergies/:allergyId', 'allergiyani o\'chirish', p => p.role !== 'nurse' && p.can('patients', 'history', 'edit')),
    r('POST', '/api/patient-documents', 'hujjat yaratish', p => p.can('patients', 'docs', 'create')),
    r('POST', '/api/patient-documents/:id/sign', 'hujjatni imzolash', p => p.can('patients', 'docs', 'create')),
    r('POST', '/api/patients/:id/send-message', 'bemorga xabar', p => p.flag('patients', 'message')),
    r('POST', '/api/patients/:id/remind-debt', 'qarz eslatmasi', p => p.flag('patients', 'message')),

    /* Kalendar */
    r('POST', '/api/appointments', 'qabulga yozish', p => p.can('calendar', 'appts', 'create') || p.can('reception', 'queue', 'create')),
    r('PUT', '/api/appointments/:id', 'qabulni ko\'chirish', p => p.can('calendar', 'appts', 'edit') || p.can('reception', 'queue', 'edit')),
    r('DELETE', '/api/appointments/:id', 'qabulni o\'chirish', p => p.can('calendar', 'appts', 'delete')),
    r('POST', '/api/appointments/:id/remind', 'eslatma yuborish', p => p.flag('calendar', 'remind')),

    /* Pul */
    r('POST', '/api/transactions', 'to\'lov qabul qilish', p => p.flag('money', 'payCreate')),
    r('POST', '/api/payments', 'to\'lov qabul qilish', p => p.flag('money', 'payCreate')),
    r('POST', '/api/payments/advance', 'avans qabul qilish', p => p.flag('money', 'payCreate')),
    r('POST', '/api/installments', 'bo\'lib to\'lash', p => p.flag('money', 'payCreate')),
    r('POST', '/api/installments/:id/pay', 'to\'lov qabul qilish', p => p.flag('money', 'payCreate')),
    r('PUT', '/api/transactions/:id', 'to\'lovni tahrirlash', p => p.flag('money', 'payEdit')),
    r('DELETE', '/api/transactions/:id', 'to\'lovni o\'chirish', p => p.flag('money', 'payDelete')),
    r('DELETE', '/api/installments/:id', 'shartnomani o\'chirish', p => p.flag('money', 'payDelete')),
    r('POST', '/api/charges/:id/refund', 'pulni qaytarish', p => p.flag('money', 'refund')),
    r('PUT', '/api/charges/:id/discount', 'chegirma berish', p => p.limit('money', 'discount') > 0),

    /* Kassa */
    r('POST', '/api/cash-register/open', 'kassani ochish', p => p.flag('finance', 'closeday')),
    r('POST', '/api/cash-register/close', 'kunni yopish', p => p.flag('finance', 'closeday')),
    r('DELETE', '/api/cash-register/:date', 'yopilgan kunni qayta ochish', p => p.flag('finance', 'reopen')),
    r('POST', '/api/cash-movements', 'inkassatsiya', p => p.flag('finance', 'encash')),
    r('DELETE', '/api/cash-movements/:id', 'kassa harakatini o\'chirish', p => p.flag('finance', 'reopen')),
    r('POST', '/api/expenses', 'xarajat qo\'shish', p => p.can('finance', 'expenses', 'create')),
    r('PUT', '/api/expenses/:id', 'xarajatni tahrirlash', p => p.can('finance', 'expenses', 'edit')),
    r('DELETE', '/api/expenses/:id', 'xarajatni o\'chirish', p => p.can('finance', 'expenses', 'delete')),

    /* Hisobot — faqat ko'rish (ega uchun yozilgan hisobot marshrutlari) */
    ...['writeoffs', 'doctors', 'departments', 'compare', 'months', 'lab-shift', 'attention', 'summary', 'patients', 'services']
        .map(name => r('GET', `/api/reports/${name}`, 'hisobot', p => p.menu('dashboard'))),
    r('GET', '/api/hr/shares', 'hisobot', p => p.menu('dashboard')),

    /* Laboratoriya */
    r('POST', '/api/lab-orders', 'tahlilga yozish', p => p.can('lab', 'orders', 'create') || p.can('patients', 'card', 'edit')),
    r('PUT', '/api/lab-orders/:id', 'buyurtmani o\'zgartirish', p => p.can('lab', 'orders', 'edit') || p.flag('lab', 'results') || p.can('patients', 'card', 'edit')),
    r('DELETE', '/api/lab-orders/:id', 'buyurtmani o\'chirish', p => p.can('lab', 'orders', 'delete') || p.can('patients', 'card', 'edit')),
    r('POST', '/api/lab-orders/:id/collect', 'qon olinganini belgilash', p => p.can('lab', 'orders', 'edit')),
    r('POST', '/api/lab-orders/:id/results', 'natija kiritish', p => p.flag('lab', 'results')),
    r('POST', '/api/lab-orders/:id/label', "probirka yorlig'i", p => p.can('lab', 'orders', 'edit')),
    r('POST', '/api/lab-orders/:id/verify', 'natijani tasdiqlash', p => p.flag('lab', 'verify')),
    r('POST', '/api/complaints', 'shikoyat yozish', p => p.flag('patients', 'complaints')),
    r('POST', '/api/appointments/:id/confirm', "so'rovni tasdiqlash", p => p.can('calendar', 'appts', 'edit')),
    r('POST', '/api/appointments/:id/reject', "so'rovni rad etish", p => p.can('calendar', 'appts', 'edit')),
    r('PUT', '/api/complaints/:id', "shikoyatga mas'ul", p => p.flag('patients', 'complaints')),
    r('POST', '/api/complaints/:id/resolve', 'shikoyatni yopish', p => p.flag('patients', 'complaints')),

    /* Diagnostika — yozish. Xulosa (PUT) shifokorniki va RULES da qoladi */
    r('POST', '/api/studies', 'tekshiruvga yozish', p => p.can('diagnostics', 'studies', 'create') || p.can('patients', 'card', 'edit')),
    r('POST', '/api/studies/:id/files', 'fayl qo\'shish', p => p.can('diagnostics', 'studies', 'create') || p.can('patients', 'card', 'edit')),

    /* Statsionar */
    r('POST', '/api/admissions', 'yotqizish', p => p.can('inpatient', 'admissions', 'create')),
    r('PUT', '/api/admissions/:id', 'yotqizishni tahrirlash', p => p.can('inpatient', 'admissions', 'edit')),
    r('POST', '/api/admissions/:id/discharge', 'chiqarish', p => p.can('inpatient', 'admissions', 'edit')),
    /* Ko'chirish — shifokor qarori (marshrutdagi eski cheklov) */
    r('POST', '/api/admissions/:id/transfer', 'ko\'chirish', p => p.role === 'doctor' && p.can('inpatient', 'admissions', 'edit')),
    r('POST', '/api/admissions/:id/rounds', 'ko\'rik yozish', p => p.flag('inpatient', 'care')),
    r('POST', '/api/medication-orders/:id/administer', 'dori berish', p => p.flag('inpatient', 'care')),
    r('POST', '/api/vitals', 'ko\'rsatkich kiritish', p => p.flag('inpatient', 'care')),
    /* Koykani tayyorlash — hamshira va registrator ishi (shifokor emas) */
    r('POST', '/api/beds/:id/ready', 'koykani tayyorlash', p => p.role !== 'doctor'
        && (p.flag('inpatient', 'care') || p.can('inpatient', 'admissions', 'edit'))),

    /* Ombor */
    r('POST', '/api/inventory', 'mahsulot qo\'shish', p => p.can('inventory', 'items', 'create')),
    r('PUT', '/api/inventory/:id', 'mahsulotni tahrirlash', p => p.can('inventory', 'items', 'edit')),
    r('PUT', '/api/inventory-items/:id', 'mahsulotni tahrirlash', p => p.can('inventory', 'items', 'edit')),
    r('PUT', '/api/inventory/:id/stock', 'qoldiqni o\'zgartirish', p => p.can('inventory', 'moves', 'create')),
    r('DELETE', '/api/inventory/:id', 'mahsulotni o\'chirish', p => p.can('inventory', 'items', 'delete')),
    r('POST', '/api/inventory/:id/batches', 'kirim', p => p.can('inventory', 'moves', 'create') || (p.role === 'nurse' && p.flag('inpatient', 'care'))),
    r('POST', '/api/stock-movements/in', 'kirim', p => p.can('inventory', 'moves', 'create') || (p.role === 'nurse' && p.flag('inpatient', 'care'))),
    r('POST', '/api/stock-movements/out', 'chiqim', p => p.can('inventory', 'moves', 'create') || p.flag('inpatient', 'care')),
    r('POST', '/api/stock-movements/transfer', 'ko\'chirish', p => p.can('inventory', 'moves', 'create') || (p.role === 'nurse' && p.flag('inpatient', 'care'))),

    /* Xabarlar */
    ...['/api/message-templates', '/api/message-templates/:id', '/api/message-templates/:id/sync-eskiz-status',
        '/api/automation-rules', '/api/automation-rules/:id'].flatMap(path =>
        ['POST', 'PUT', 'DELETE'].map(m => r(m, path, 'shablon va avtomatik xabarlar', p => p.flag('messages', 'automation')))),
    ...['/api/messages/send-bulk', '/api/messages/saved-segments', '/api/messages/saved-segments/:id',
        '/api/messages/audience', '/api/messages/test-send', '/api/messages/retry', '/api/batch/remind-debts'].flatMap(path =>
        ['POST', 'DELETE'].map(m => r(m, path, 'ko\'p bemorga xabar', p => p.flag('messages', 'bulk')))),

    /* Xodimlar — ro'yxat. Maosh, ulush, ruxsatlar RULES da (faqat ega) */
    ...['doctors', 'receptionists', 'lab-technicians', 'nurses'].flatMap(kind => [
        r('POST', `/api/${kind}`, 'xodim qo\'shish', p => p.can('staff', 'list', 'create')),
        r('PUT', `/api/${kind}/:id`, 'xodimni tahrirlash', p => p.can('staff', 'list', 'edit')),
        r('DELETE', `/api/${kind}/:id`, 'xodimni o\'chirish', p => p.can('staff', 'list', 'delete')),
    ]),

    /* Sozlamalar */
    r('POST', '/api/services', 'xizmat qo\'shish', p => p.can('settings', 'services', 'create')),
    r('PUT', '/api/services/:id', 'narxni o\'zgartirish', p => p.can('settings', 'services', 'edit')),
    r('DELETE', '/api/services/:id', 'xizmatni o\'chirish', p => p.can('settings', 'services', 'delete')),
    r('POST', '/api/categories', 'toifa qo\'shish', p => p.can('settings', 'services', 'create')),
    r('PUT', '/api/categories/:id', 'toifani o\'zgartirish', p => p.can('settings', 'services', 'edit')),
    r('DELETE', '/api/categories/:id', 'toifani o\'chirish', p => p.can('settings', 'services', 'delete')),
    r('POST', '/api/lab-tests', 'tahlil katalogi', p => p.can('settings', 'clinic', 'edit')),
    r('PUT', '/api/lab-tests/:id', 'tahlil katalogi', p => p.can('settings', 'clinic', 'edit')),
    r('DELETE', '/api/lab-tests/:id', 'tahlil katalogi', p => p.can('settings', 'clinic', 'edit')),
    /* Integratsiyalar (bot tokeni, SMS, DMED, oldindan to'lov kartasi) bu
       ro'yxatda YO'Q — sirlar va pul yo'nalishi faqat egada (RULES). Koyka
       to'ri (wards/:id/beds, beds/:id) ham RULES da — registrator ishi. */
    r('PUT', '/api/clinics/:id/general', 'klinika sozlamalari', p => p.can('settings', 'clinic', 'edit')),
    ...['/api/departments', '/api/departments/:id', '/api/encounter-templates', '/api/encounter-templates/:id',
        '/api/wards', '/api/wards/:id'].flatMap(path =>
        ['POST', 'PUT', 'DELETE'].map(m => r(m, path, 'klinika sozlamalari', p => p.can('settings', 'clinic', 'edit')))),
];

const PERM_COMPILED = PERM_ROUTES.map(x => ({ ...x, re: compile(x.path) }));

export type PermDecision = { matched: false } | { matched: true; allow: boolean; what: string };

/**
 * Ega emas xodim uchun ruxsatlar jadvali bo'yicha qaror. Marshrut jadvalda
 * bo'lmasa `matched: false` — RULES ishlaydi.
 */
export function checkStaffPerm(method: string, path: string, role: string | undefined, accessControl: unknown, req?: any): PermDecision {
    if (!role || role === A) return { matched: false };
    const m = method.toUpperCase();
    const hit = PERM_COMPILED.find(x => x.method === m && x.re.test(path));
    if (!hit) return { matched: false };
    const p = makePermChecker(role, accessControl);
    if (p.owner) return { matched: false };
    return { matched: true, allow: !!hit.check(p, req), what: hit.what };
}

/** Chegirma ruxsatlardagi chegaradan oshmaydimi («Pul → Chegirma», masalan 10% gacha).
    Ega — cheklanmaydi. Hisob qatori, xizmat va to'lov — uchala yo'lda ham shu. */
export function discountWithinLimit(req: any, gross: number, discount: number): { ok: boolean; max: number } {
    const p = req?.perms;
    if (!p || p.owner || !(discount > 0)) return { ok: true, max: 100 };
    const max = p.limit('money', 'discount');
    return { ok: gross > 0 && discount <= (gross * max) / 100 + 0.001, max };
}

export const discountDenied = (max: number) => ({
    error: max > 0 ? `Chegirma ${max}% dan oshmasin` : "Chegirma berishga ruxsat yo'q",
    code: 'DISCOUNT_LIMIT',
});

/** Marshrut ichidagi rol tekshiruvi — ruxsatlar jadvali bergan ruxsatni ham hisobga oladi */
export function actsAs(req: any, ...roles: string[]): boolean {
    if (req?.permAllowed === true) return true;
    const role = req?.user?.role;
    return !!role && roles.includes(role);
}

/** Javobi puldan TOZALANADIGAN o'qishlar — taqiqlanmaydi, faqat summalar olinadi */
const MONEY_STRIPPED_READ = /^\/api\/reports\/snapshot(\/|$)/;
export function isMoneyStrippedRead(method: string, path: string): boolean {
    const m = method.toUpperCase();
    return (m === 'GET' || m === 'HEAD') && MONEY_STRIPPED_READ.test(path);
}

/** Moliyaviy o'qishga ruxsat. `showFinance` — klinika sozlamasidagi shu rol bayrog'i. */
export function canReadFinance(path: string, role: string | undefined, showFinance: boolean | undefined): boolean {
    if (role === 'CLINIC_ADMIN') return true;
    /* Hamshira va laborant — odatda yopiq, faqat ega aniq ochib bergan
       bo'lsa (`showFinance: true`). Shifokor va registrator — odatda ochiq. */
    if (role === 'NURSE' || role === 'LAB_TECHNICIAN') return showFinance === true;
    if (TRANSACTIONS_READ.test(path)) return true;
    return showFinance !== false;
}
