import { Appointment, Department, Doctor, Service, Visit } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   «BUGUN KLINIKADA» xaritasining hisobi — kim hozir qayerda.

   To'rt joy, to'rttasi ham bazadagi HAQIQIY holatdan olinadi:

     · yo'lda       — bugunga yozilgan, hali kelmagan (`Appointment`:
                      Pending / Confirmed va unga qabul ochilmagan);
     · kutish zali  — qabul ochilgan, navbatda (`Visit`: Waiting / Called);
     · kabinetda    — shifokor oldida (`Visit`: In Progress);
     · yakunlandi   — `Visit`: Completed.

   Bu xarita denta7 dan olingan, lekin hisob BOSHQACHA. U yerda navbat —
   kalendar yozuvining o'zi: vaqti kelgan yozuv «keldi» deb hisoblanadi,
   kabinetga kirgani esa alohida jurnalda yuritiladi. Bu yerda taxmin yo'q:
   bemor kelsa registrator qabul ochadi (`Visit`), har bir bosqichning o'z
   holati va vaqti bor. Shuning uchun vaqti o'tgan, lekin kelmagan bemor
   kutish zaliga tushmaydi — yo'lda «kechikdi» belgisi bilan qoladi.

   Qator (lane) — shifokor. Shifokorsiz qabul (UZI, rentgen — diagnostikada
   shifokor shart emas) bo'lim qatoriga tushadi.
   ───────────────────────────────────────────────────────────────────────────── */

/** Reja davomiyligi noma'lum bo'lsa — 20 daqiqa (oddiy konsultatsiya) */
export const DEFAULT_VISIT_MIN = 20;

/** Rejadan oshib ketgan qabul taxminan shuncha daqiqada tugaydi deb olinadi */
const OVERRUN_GRACE_MIN = 2;

/** Shundan ko'p qator bo'lsa, hozir ishi yo'q shifokorlar «bo'sh» ro'yxatiga yig'iladi */
const MAX_QUIET_LANES = 6;

const OPEN_APPOINTMENT = new Set(['Pending', 'Confirmed']);

/** "HH:MM" → kun boshidan beri daqiqa. Noto'g'ri qiymat — kun oxiri */
export const minutesOf = (hhmm?: string): number => {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60;
};

const ms = (iso?: string | null): number => {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? 0 : t;
};

export const visitName = (v: Pick<Visit, 'patient'>): string =>
    `${v.patient?.lastName || ''} ${v.patient?.firstName || ''}`.trim() || '—';

/** Xaritada bemor belgisi bir joydan boshqasiga «uchib» o'tishi uchun yagona kalit:
 *  yo'ldagi yozuv va unga ochilgan qabul — bitta odam. */
export const flowIdOfVisit = (v: Pick<Visit, 'id' | 'appointmentId'>): string =>
    v.appointmentId ? `appt-${v.appointmentId}` : `visit-${v.id}`;
export const flowIdOfAppointment = (a: Pick<Appointment, 'id'>): string => `appt-${a.id}`;

export interface FlowLane {
    /** Shifokor id si yoki `dept:<bo'lim id>` */
    key: string;
    doctor: Doctor | null;
    department: Department | null;
    color: string;
    /** Hozir kabinetda (eng oxirgi kirgani) */
    chair: Visit | null;
    /** Kabinetga kirgan payt (ms) */
    chairSince: number | null;
    /** Kabinetda yana ochiq turgan qabullar (odatda bo'sh) — ismma-ism, xaritadan ochilsin */
    chairOthers: Visit[];
    /** Kutish zalida — chaqirilganlar oldinda, keyin kelish tartibida */
    queue: Visit[];
    /** Bugun hali keladiganlar — vaqt tartibida */
    coming: Appointment[];
    /** Bugun yakunlanganlar soni */
    done: number;
    /** Hozir kelgan yangi bemor taxminan necha daqiqa kutadi */
    etaMin: number;
    /** Yo'ldagilar navbat tufayli necha daqiqa kech kiradi (yozuv id → daqiqa) */
    delays: Record<string, number>;
}

export interface ClinicFlow {
    lanes: FlowLane[];
    /** Hozir ishi yo'q faol shifokorlar */
    idle: Doctor[];
    /** Hamma yo'ldagilar — vaqt tartibida */
    coming: Appointment[];
    /** Qabulning reja davomiyligi (qabul id → daqiqa) — ochiq qabullar uchun */
    plan: Record<string, number>;
    /** Qabulga bog'langan kalendar yozuvi (qabul id → yozuv) */
    booked: Record<string, Appointment>;
    counts: { coming: number; waiting: number; inChair: number; awaiting: number; done: number };
}

const byTime = (a: Appointment, b: Appointment) => minutesOf(a.time) - minutesOf(b.time) || a.id.localeCompare(b.id);

const byArrival = (a: Visit, b: Visit) =>
    Number(b.status === 'Called') - Number(a.status === 'Called')
    || ms(a.checkInTime) - ms(b.checkInTime)
    || (a.queueNumber ?? 0) - (b.queueNumber ?? 0);

/** Kabinetga kirgan vaqt. Eski yozuvda `startedAt` yo'q — chaqirilgan, bo'lmasa kelgan vaqt */
export const chairSinceOf = (v: Pick<Visit, 'startedAt' | 'calledAt' | 'checkInTime'>): number =>
    ms(v.startedAt) || ms(v.calledAt) || ms(v.checkInTime);

/** Kutish zalida necha daqiqadan beri */
export const waitedMinutes = (v: Pick<Visit, 'checkInTime'>, now: number): number => {
    const from = ms(v.checkInTime);
    return from ? Math.max(0, Math.floor((now - from) / 60000)) : 0;
};

/** Qabulda nima qilinyapti: xizmat nomi, bo'lmasa yozuvdagi tur, bo'lmasa bo'lim */
export const visitLabel = (v: Visit, booked?: Appointment): string =>
    v.procedures?.find(p => p.status !== 'Cancelled')?.procedureName
    || booked?.type
    || v.department?.name
    || '';

export function buildClinicFlow(
    visits: Visit[],
    appointments: Appointment[],
    doctors: Doctor[],
    departments: Department[],
    services: Service[],
    today: string,
    now: number,
): ClinicFlow {
    const d = new Date(now);
    const nowMin = d.getHours() * 60 + d.getMinutes();
    const todays = visits.filter(v => v.date === today && v.status !== 'Cancelled');

    const apptById = new Map(appointments.map(a => [a.id, a]));
    const arrivedAppts = new Set(todays.map(v => v.appointmentId).filter(Boolean) as string[]);
    const coming = appointments
        .filter(a => a.date === today && OPEN_APPOINTMENT.has(a.status) && !arrivedAppts.has(a.id))
        .sort(byTime);

    const booked: Record<string, Appointment> = {};
    const plan: Record<string, number> = {};
    const serviceMinutes = new Map(services.map(s => [Number(s.id), Number(s.duration) || 0]));
    /* Reja: yozilgan bo'lsa — yozuvdagi davomiylik (uni registrator o'zi
       tanlagan); bo'lmasa xizmatlarning davomiyligi; u ham yo'q bo'lsa —
       standart. */
    const planOf = (v: Visit): number => {
        const a = v.appointmentId ? apptById.get(v.appointmentId) : undefined;
        if (a && a.duration > 0) return a.duration;
        const fromServices = (v.procedures || [])
            .filter(p => p.status !== 'Cancelled')
            .reduce((sum, p) => sum + (Number(p.duration) || serviceMinutes.get(Number(p.serviceId)) || 0), 0);
        return fromServices > 0 ? fromServices : DEFAULT_VISIT_MIN;
    };

    const doctorIds = new Set(doctors.filter(x => x.status !== 'Deleted').map(x => x.id));
    const keyOfVisit = (v: Visit) => (v.doctorId && doctorIds.has(v.doctorId) ? v.doctorId : `dept:${v.departmentId || ''}`);
    const keyOfAppt = (a: Appointment) => (doctorIds.has(a.doctorId) ? a.doctorId : `dept:${a.departmentId || ''}`);

    const visitsByKey = new Map<string, Visit[]>();
    for (const v of todays) {
        const k = keyOfVisit(v);
        if (!visitsByKey.has(k)) visitsByKey.set(k, []);
        visitsByKey.get(k)!.push(v);
    }
    const comingByKey = new Map<string, Appointment[]>();
    for (const a of coming) {
        const k = keyOfAppt(a);
        if (!comingByKey.has(k)) comingByKey.set(k, []);
        comingByKey.get(k)!.push(a);
    }

    const buildLane = (key: string, doctor: Doctor | null, department: Department | null): FlowLane | null => {
        const mine = visitsByKey.get(key) || [];
        const seated = mine
            .filter(v => v.status === 'In Progress')
            .sort((a, b) => chairSinceOf(b) - chairSinceOf(a));
        const chair = seated[0] || null;
        const queue = mine.filter(v => v.status === 'Waiting' || v.status === 'Called').sort(byArrival);
        const laneComing = comingByKey.get(key) || [];
        const done = mine.filter(v => v.status === 'Completed').length;
        if (!chair && queue.length === 0 && laneComing.length === 0 && done === 0) return null;

        for (const v of [...seated, ...queue]) {
            plan[v.id] = planOf(v);
            const a = v.appointmentId ? apptById.get(v.appointmentId) : undefined;
            if (a) booked[v.id] = a;
        }

        /* Taxminiy jadval: kabinet qachon bo'shaydi, navbatdagilar ketma-ket
           kiradi, keyin yozilganlar o'z vaqtida yoki navbat tugagach kiradi.
           Vaqti o'tib ketgan, lekin kelmagan yozuv hisobga kirmaydi — u
           kelishi ham, kelmasligi ham mumkin. */
        let t = nowMin;
        if (chair) {
            const since = new Date(chairSinceOf(chair));
            t = Math.max(since.getHours() * 60 + since.getMinutes() + plan[chair.id], nowMin + OVERRUN_GRACE_MIN);
        }
        for (const v of queue) t += plan[v.id];
        const etaMin = Math.max(0, t - nowMin);
        const delays: Record<string, number> = {};
        for (const a of laneComing) {
            const at = minutesOf(a.time);
            if (at < nowMin) continue;
            const start = Math.max(at, t);
            delays[a.id] = start - at;
            t = start + (a.duration > 0 ? a.duration : DEFAULT_VISIT_MIN);
        }

        return {
            key, doctor, department,
            color: doctor?.color || department?.color || '#4f46e5',
            chair,
            chairSince: chair ? chairSinceOf(chair) : null,
            chairOthers: seated.slice(1),
            queue,
            coming: laneComing,
            done,
            etaMin,
            delays,
        };
    };

    const deptById = new Map(departments.map(x => [x.id, x]));
    let lanes: FlowLane[] = [];
    const idle: Doctor[] = [];
    for (const doctor of doctors) {
        if (doctor.status === 'Deleted') continue;
        const lane = buildLane(doctor.id, doctor, doctor.departmentId ? deptById.get(doctor.departmentId) || null : null);
        if (lane) lanes.push(lane);
        else if (doctor.status === 'Active') idle.push(doctor);
    }
    const deptKeys = new Set([...visitsByKey.keys(), ...comingByKey.keys()].filter(k => k.startsWith('dept:')));
    for (const key of deptKeys) {
        const lane = buildLane(key, null, deptById.get(key.slice(5)) || null);
        if (lane) lanes.push(lane);
    }

    /* Katta klinikada 15 ta shifokor bo'lishi mumkin. Bugun ishlab bo'lgan va
       boshqa bemori yo'q shifokorning bo'sh qatori joy oladi, xabar bermaydi —
       ular «hozir bo'sh» ro'yxatiga o'tadi. Kichik klinikada hamma qator turadi:
       u yerda barqaror ko'rinish muhimroq. */
    if (lanes.length > MAX_QUIET_LANES) {
        const busy = (l: FlowLane) => !!l.chair || l.queue.length > 0 || l.coming.length > 0;
        for (const l of lanes) if (!busy(l) && l.doctor?.status === 'Active') idle.push(l.doctor);
        lanes = lanes.filter(busy);
    }

    return {
        lanes,
        idle,
        coming,
        plan,
        booked,
        counts: {
            coming: coming.length,
            waiting: todays.filter(v => v.status === 'Waiting' || v.status === 'Called').length,
            inChair: todays.filter(v => v.status === 'In Progress').length,
            awaiting: todays.filter(v => v.status === 'AwaitingResults').length,
            done: todays.filter(v => v.status === 'Completed').length,
        },
    };
}

/**
 * Yo'l chizig'idagi belgilar joyi (0..1). Vaqtga mutanosib, lekin bir-birining
 * ustiga tushmaydi: yaqin vaqtdagilar kamida `gap` masofada suriladi.
 */
export function spreadPositions(ideal: number[], gap: number): number[] {
    const out = ideal.map(x => Math.min(1, Math.max(0, x)));
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
    // O'ng chetdan chiqib ketganlarni chapga qaytaramiz
    for (let i = out.length - 1; i >= 0; i--) {
        const limit = 1 - (out.length - 1 - i) * gap;
        out[i] = Math.min(out[i], limit);
    }
    return out.map(x => Math.max(0, x));
}

/** "Rashidov Bekzod" → "Rashidov B." */
export const shortName = (name: string): string => {
    const [first = '', second = ''] = String(name || '').trim().split(/\s+/);
    return second ? `${first} ${second.charAt(0)}.` : first;
};

/** "Rashidov Bekzod" → "RB" */
export const initialsOf = (name: string): string =>
    String(name || '')
        .replace(/^Dr\.\s*/, '')
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase();
