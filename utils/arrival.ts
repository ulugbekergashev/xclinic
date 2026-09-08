import { api } from '../services/api';
import { formatFullName } from './format';
import { todayISO } from './dateUtils';
import type { Appointment, Doctor, Service, Visit } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   «KELDI» — kalendardagi yozuv bilan navbat orasidagi YAGONA ko'prik.

   Bir bosishda uch ish bajariladi:
     1. qabul yaratiladi va yozuvga bog'lanadi (`appointmentId`);
     2. yozilish paytida tanlangan xizmat qabulga qo'shiladi;
     3. kalendardagi yozuv «Checked-In» ga o'tadi va kutayotganlar
        ro'yxatidan chiqadi.

   NIMA UCHUN ALOHIDA FAYL. Bu mantiq faqat Registraturada bor edi, ya'ni
   kalendarni ochib turgan registrator kelgan bemorni belgilay olmasdi —
   avval Registraturaga o'tishi kerak edi. Kalendarda esa «Yakunlash»
   tugmasi turardi va u yozuv holatini o'zgartirib qo'yardi, LEKIN hech
   qanday qabul yaratmasdi: bemor «qabul qilingan» ko'rinardi, tizimda esa
   na tashxis, na xizmat, na pul qatori bo'lardi.

   Nusxa ko'chirish o'rniga bitta funksiya: ikkala ekran ham shuni
   chaqiradi, ya'ni qoida bir joyda o'zgaradi.
   ───────────────────────────────────────────────────────────────────────────── */

export interface ArrivalOutcome {
    visit: Visit;
    /** Qabul ochildi, lekin kalendardagi yozuv yopilmadi */
    appointmentNotClosed: boolean;
    /** Yozuvdagi xizmat nomi prayslistda topilmadi — kassada qo'shiladi */
    serviceNotFound: boolean;
}

export type ArrivalFailure =
    /** Yozuvda ham, shifokorda ham bo'lim yo'q — qo'lda ochish kerak */
    | { code: 'NO_DEPARTMENT' }
    /** Bugun shu bo'limda qabul allaqachon ochilgan */
    | { code: 'EXISTS'; visitId: string }
    | { code: 'FAILED'; message: string };

export class ArrivalError extends Error {
    readonly failure: ArrivalFailure;
    constructor(failure: ArrivalFailure, message: string) {
        super(message);
        this.name = 'ArrivalError';
        this.failure = failure;
    }
}

export async function markAppointmentArrived(
    appt: Appointment,
    ctx: { doctors: Doctor[]; services: Service[] },
): Promise<ArrivalOutcome> {
    const doc = ctx.doctors.find(d => d.id === appt.doctorId);
    const departmentId = appt.departmentId || doc?.departmentId || '';
    if (!departmentId) {
        throw new ArrivalError({ code: 'NO_DEPARTMENT' },
            "Bu yozuvda bo'lim aniqlanmadi — qabulni qo'lda oching");
    }

    let visit: Visit;
    try {
        visit = await api.visits.create({
            patientId: appt.patientId,
            appointmentId: appt.id,
            departmentId,
            doctorId: appt.doctorId || undefined,
            doctorName: appt.doctorName || (doc ? formatFullName(doc) : undefined),
            complaints: appt.notes || undefined,
            date: todayISO(),
            status: 'Waiting',
        } as any);
    } catch (e: any) {
        if (e?.status === 409 && e?.data?.visitId) {
            throw new ArrivalError({ code: 'EXISTS', visitId: e.data.visitId },
                "Bu bemorga bugun shu bo'limda qabul allaqachon ochilgan");
        }
        throw new ArrivalError({ code: 'FAILED', message: e?.message || 'Xatolik' },
            e?.message || "Qabulni ochib bo'lmadi");
    }

    /* Yozuvdagi xizmat. AVVAL identifikator bo'yicha (migratsiya 0034),
       topilmasa — eski yozuvlar uchun nom bo'yicha.

       Ilgari FAQAT nom bo'yicha qidirilardi. Prayslistda nom ozgina
       o'zgarsa — «UZI» → «Qorin UZI si» — moslik yo'qolardi va qabul
       XIZMATSIZ ochilardi: kassada hech narsa ko'rinmasdi va bemor
       pul to'lamasdan ketardi. Nom o'zgarishi esa odatiy ish.

       Topilmasa qabul baribir ochiladi — xizmatni keyin qo'shish
       mumkin. */
    let serviceNotFound = false;
    const svc = appt.serviceId
        ? ctx.services.find(x => Number(x.id) === Number(appt.serviceId))
        : ctx.services.find(x => x.name === appt.type);
    if (svc) {
        try { await api.visits.addProcedure(visit.id, { serviceId: Number(svc.id) }); }
        catch { serviceNotFound = true; }
    } else if (appt.type) {
        serviceNotFound = true;
    }

    /* Qabul yaratildi, lekin yozuv yopilmadi — bu jimgina o'tkazib
       yuboriladigan holat emas: kalendar «hali kelmagan» deb ko'rsatib
       turaveradi va registrator bemorni ikkinchi marta belgilashga
       urinadi. */
    let appointmentNotClosed = false;
    try { await api.appointments.update(appt.id, { status: 'Checked-In' } as any); }
    catch { appointmentNotClosed = true; }

    return { visit, appointmentNotClosed, serviceNotFound };
}
