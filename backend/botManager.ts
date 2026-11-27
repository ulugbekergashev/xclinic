import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { prisma } from './db';
import { applyAdvance } from './billing';
import { recordRating, attachComplaintText } from './complaints';
import {
    buildReportScreen, buildTodayAppointments, buildDoctorSchedule, parseReportCallback, addDays,
    notifyDoctorAppointment, notifyReception, cantComeText, receptionPerms, bookingRequestText,
} from './ownerBot';
import { tashkentDateStr } from './tashkentTime';

/* MENYULAR (2026-11-27, dentalocal'dan): rahbar — hisobot, bugungi
   qabullar, zaxira nusxa; shifokor — bugungi va ertangi qabullar. */
const OWNER_MENU = [[{ text: '📊 Hisobot' }, { text: '📋 Bugungi qabullar' }], [{ text: '💾 Zaxira nusxa' }]];
const DOCTOR_MENU = [[{ text: '📅 Bugungi qabullarim' }, { text: '🗓 Ertangi qabullarim' }]];
/* Registrator (0051): bugungi/ertangi qabullar va bugungi kassa */
const RECEPTION_MENU = [[{ text: '📅 Bugungi qabullar' }, { text: '🗓 Ertangi qabullar' }], [{ text: '💰 Bugungi kassa' }]];

/* Past bahodan keyin bemorning KEYINGI matni shikoyat matni bo'ladi —
   30 daqiqa ichida. Kalit: bot tokeni + chat. */
const COMPLAINT_REPLY_MS = 30 * 60 * 1000;
const awaitingComplaint = new Map<string, { complaintId: string; until: number }>();

class BotManager {
    private bots: Map<string, Telegraf> = new Map(); // token -> Telegraf
    private usageCount: Map<string, number> = new Map(); // token -> count of clinics
    private botUsernames: Map<string, string> = new Map(); // token -> username
    private pendingPayments: Map<string, { appointmentId: string; clinicId: string }> = new Map(); // chatId -> payment info

    /* Konstruktorda bazaga BORILMAYDI.
       Ilgari botlar import paytida yuklanardi — ya'ni migratsiyalar
       o'tishidan OLDIN. Yangilanishdan keyingi birinchi ishga tushishda
       `prisma.clinic.findMany()` hali yo'q ustunni so'rab xato berardi,
       konsolga prisma:error chiqardi va botlar 30 soniya ishlamasdi.
       Endi yuklashni server migratsiyalardan keyin o'zi boshlaydi. */
    public init() {
        this.loadBots().catch(err => {
            console.error("⚠️ Initial bot loading failed (likely DB issue). Server starting without bots.", err.message);
        });
    }

    private async loadBots() {
        while (true) {
            try {
                console.log('Attempting to load bots from database...');
                const clinics = await prisma.clinic.findMany({
                    where: { botToken: { not: null } }
                });

                for (const clinic of clinics) {
                    if (clinic.botToken) {
                        await this.startBot(clinic.id, clinic.botToken);
                    }
                }
                console.log(`🤖 Loaded ${this.bots.size} unique bot instances.`);
                break; // If successful, exit the retry loop
            } catch (error: any) {
                console.error("❌ Failed to load bots (retrying in 30s):", error.message);
                await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds before retry
            }
        }
    }

    public async startBot(clinicId: string, token: string) {
        // Increment usage count
        const currentCount = this.usageCount.get(token) || 0;
        this.usageCount.set(token, currentCount + 1);

        // If bot already exists for this token, just return
        if (this.bots.has(token)) {
            console.log(`ℹ️ Bot for token already running. Added clinic ${clinicId} to shared instance.`);
            return;
        }

        try {
            const bot = new Telegraf(token);

            // Fetch username immediately and cache it
            bot.telegram.getMe().then(me => {
                if (me.username) {
                    this.botUsernames.set(token, me.username);
                }
            }).catch(e => {
                console.error(`Failed to fetch bot username for token:`, e.message);
            });

            // 1. Start Command
            bot.start(async (ctx) => {
                const payload = ctx.payload;
                const chatId = String(ctx.chat.id);

                if (payload) {
                    try {
                        const patient = await prisma.patient.findUnique({
                            where: { id: payload },
                            include: { clinic: true }
                        });

                        /* Bog'langan bemorni QAYTA bog'lab bo'lmaydi (audit 2026-09-17).
                           Ilgari bemor id sini bilgan har kim uning xabarlarini
                           o'z chatiga burib olardi. Ilova bunday havola
                           yasamaydi — bu eski yo'l faqat hali ulanmagan bemor
                           uchun qoldi. */
                        if (patient && patient.telegramChatId && patient.telegramChatId !== chatId) {
                            ctx.reply("❌ Bu profil boshqa Telegram hisobiga ulangan. Klinikaga murojaat qiling.");
                            return;
                        }

                        if (patient) {
                            await prisma.patient.update({
                                where: { id: payload },
                                data: { telegramChatId: chatId }
                            });

                            // Check if also owner
                            const ownerClinic = await prisma.clinic.findFirst({
                                where: { telegramChatId: chatId, botToken: token }
                            });

                            const patientMenu = [
                                [{ text: "📅 Qabulga yozilish" }, { text: "⏰ Keyingi qabulim" }],
                                [{ text: "📋 Davolanish tarixim" }, { text: "💳 Mening hisobim" }]
                            ];
                            const keyboard = ownerClinic
                                ? [...OWNER_MENU, ...patientMenu]
                                : patientMenu;

                            ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSizning profilingiz muvaffaqiyatli ulandi.\n\nEndi siz ${patient.clinic.name}dan eslatmalar va xabarlar olasiz.`, {
                                reply_markup: {
                                    keyboard,
                                    resize_keyboard: true
                                }
                            });
                        } else {
                            ctx.reply("❌ Bemor topilmadi.");
                        }
                    } catch (e) {
                        console.error("Bot start error:", e);
                        ctx.reply("❌ Xatolik.");
                    }
                } else {
                    // Check if user is already linked as owner
                    const clinicAsOwner = await prisma.clinic.findFirst({
                        where: { telegramChatId: chatId, botToken: token }
                    });

                    if (clinicAsOwner) {
                        return ctx.reply(`👋 Assalomu alaykum, ${clinicAsOwner.adminName}!\n\nSiz ${clinicAsOwner.name} egasi sifatida ulandingiz. Hisobot olish uchun «📊 Hisobot» tugmasini bosing yoki /report yuboring.`, {
                            reply_markup: {
                                keyboard: OWNER_MENU,
                                resize_keyboard: true
                            }
                        });
                    }

                    // Check if already linked as a doctor
                    const doctorLinked = await prisma.doctor.findFirst({
                        where: { telegramChatId: chatId, clinic: { botToken: token } },
                        include: { clinic: true }
                    });

                    if (doctorLinked) {
                        return ctx.reply(`👋 Assalomu alaykum, Dr. ${doctorLinked.firstName} ${doctorLinked.lastName}!\n\nSiz ${doctorLinked.clinic.name} klinikasiga ulangansiz. Bugungi yoki ertangi qabullaringizni ko'rish uchun quyidagi tugmalarni bosing.`, {
                            reply_markup: {
                                keyboard: DOCTOR_MENU,
                                resize_keyboard: true
                            }
                        });
                    }

                    const receptionLinked = await prisma.receptionist.findFirst({
                        where: { telegramChatId: chatId, status: 'Active', clinic: { botToken: token } },
                        include: { clinic: true },
                    });
                    if (receptionLinked) {
                        return ctx.reply(`👋 Assalomu alaykum, ${receptionLinked.firstName}!\n\nSiz ${receptionLinked.clinic.name} registratori sifatida ulangansiz.`, {
                            reply_markup: { keyboard: RECEPTION_MENU, resize_keyboard: true },
                        });
                    }

                    ctx.reply("👋 Assalomu alaykum!\n\nKlinika botiga xush kelibsiz.\n\nIltimos, telefon raqamingizni yuboring:", {
                        reply_markup: {
                            keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                            resize_keyboard: true,
                            one_time_keyboard: false
                        }
                    });
                }
            });

            // 2. Report Command (for clinic owner)
            bot.command('report', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const clinic = await prisma.clinic.findFirst({
                    where: { telegramChatId: chatId, botToken: token }
                });

                if (!clinic) {
                    return ctx.reply("❌ Siz klinika egasi sifatida ulanmagansiz. Iltimos, avval ro'yxatdan o'ting.");
                }

                const screen = await buildReportScreen(prisma, clinic, 'd', 'sum');
                ctx.reply(screen.text, { parse_mode: 'HTML', reply_markup: screen.keyboard });
            });

            /* 3. Rahbar: «📊 Hisobot» (eski «📊 Kunlik hisobot» tugmasi ham —
               ulangan rahbarlarning klaviaturasida hali o'sha turibdi) */
            const ownerOf = (chatId: string) => prisma.clinic.findFirst({ where: { telegramChatId: chatId, botToken: token } });
            bot.hears(['📊 Hisobot', '📊 Kunlik hisobot'], async (ctx) => {
                const clinic = await ownerOf(String(ctx.chat.id));
                if (!clinic) return;
                const screen = await buildReportScreen(prisma, clinic, 'd', 'sum');
                await ctx.reply(screen.text, { parse_mode: 'HTML', reply_markup: screen.keyboard });
                /* Eski klaviaturani yangisiga almashtirish */
                if ((ctx.message as any)?.text === '📊 Kunlik hisobot') {
                    await ctx.reply('Menyu yangilandi.', { reply_markup: { keyboard: OWNER_MENU, resize_keyboard: true } }).catch(() => null);
                }
            });
            /* Davr va bo'lim tugmalari — xabar o'z joyida o'zgaradi */
            bot.action(/^rp:/, async (ctx) => {
                const parsed = parseReportCallback(String((ctx.callbackQuery as any)?.data || ''));
                const clinic = await ownerOf(String(ctx.chat?.id || ''));
                if (!parsed || !clinic) return ctx.answerCbQuery("Bu hisobot faqat klinika rahbari uchun").catch(() => null);
                await ctx.answerCbQuery().catch(() => null);
                const screen = await buildReportScreen(prisma, clinic, parsed.p, parsed.s);
                await ctx.editMessageText(screen.text, { parse_mode: 'HTML', reply_markup: screen.keyboard })
                    .catch((e: any) => { if (!/not modified/i.test(e?.message || '')) console.error('Hisobot tahriri:', e?.message || e); });
            });
            bot.hears('📋 Bugungi qabullar', async (ctx) => {
                const clinic = await ownerOf(String(ctx.chat.id));
                if (!clinic) return;
                await ctx.reply(await buildTodayAppointments(prisma, clinic), { parse_mode: 'HTML' });
            });
            bot.hears('💾 Zaxira nusxa', async (ctx) => {
                const clinic = await ownerOf(String(ctx.chat.id));
                if (!clinic) return;
                if (!this.backupHandler) return ctx.reply("Zaxira nusxa bu kompyuterda sozlanmagan.");
                await ctx.reply('⏳ Zaxira nusxa tayyorlanmoqda…');
                try {
                    const r = await this.backupHandler();
                    if (!r.sent) await ctx.reply(`❌ Yuborilmadi: ${r.reason}`);
                } catch (e: any) {
                    await ctx.reply(`❌ Zaxira olinmadi: ${e?.message || 'xatolik'}`);
                }
            });

            /* Registrator (0051) */
            const receptionOf = (chatId: string) => prisma.receptionist.findFirst({
                where: { telegramChatId: chatId, status: 'Active', clinic: { botToken: token } }, include: { clinic: true },
            });
            bot.hears(['📅 Bugungi qabullar', '🗓 Ertangi qabullar'], async (ctx) => {
                const rec = await receptionOf(String(ctx.chat.id));
                if (!rec) return;
                if (!(await receptionPerms(prisma, rec.clinicId)).menu('calendar')) return ctx.reply("Ruxsatlarda kalendar sizga yopiq.");
                const tomorrow = (ctx.message as any)?.text?.startsWith('🗓');
                const day = tomorrow ? addDays(tashkentDateStr(), 1) : tashkentDateStr();
                await ctx.reply(await buildTodayAppointments(prisma, rec.clinic, day, tomorrow ? 'Ertangi qabullar' : 'Bugungi qabullar'), { parse_mode: 'HTML' });
            });
            bot.hears('💰 Bugungi kassa', async (ctx) => {
                const rec = await receptionOf(String(ctx.chat.id));
                if (!rec) return;
                /* Ilovadagi Kassa bilan bir qoida: Ruxsatlarda yopiq bo'lsa — botda ham yopiq */
                if (!(await receptionPerms(prisma, rec.clinicId)).can('finance', 'cashbook', 'view')) {
                    return ctx.reply("Ruxsatlarda kassa sizga yopiq.");
                }
                const screen = await buildReportScreen(prisma, rec.clinic, 'd', 'cash');
                await ctx.reply(screen.text, { parse_mode: 'HTML' });
            });

            /* Bemorning eslatmaga javobi: «✅ Kelaman» / «❌ Kela olmayman» (0051) */
            bot.action(/^cf:(y|n):([\w-]+)$/, async (ctx) => {
                const [, yn, apptId] = (ctx as any).match as string[];
                const chatId = String(ctx.chat?.id || '');
                const appt = await prisma.appointment.findUnique({
                    where: { id: apptId },
                    include: { patient: { select: { telegramChatId: true, phone: true } }, clinic: { select: { botToken: true } } },
                });
                if (!appt || appt.clinic?.botToken !== token || appt.patient?.telegramChatId !== chatId) {
                    return ctx.answerCbQuery('Bu qabul topilmadi').catch(() => null);
                }
                if (['Cancelled', 'Completed', 'No-Show'].includes(appt.status)) {
                    await ctx.answerCbQuery('Bu qabul allaqachon yopilgan').catch(() => null);
                    return ctx.editMessageReplyMarkup(undefined).catch(() => null);
                }
                const coming = yn === 'y';
                await prisma.appointment.update({
                    where: { id: appt.id },
                    /* Holat O'ZGARMAYDI: «Pending» bu yerda «oldindan to'lov kutilmoqda» —
                       uni faqat rahbar to'lovni ko'rib tasdiqlaydi (avans shu bilan yoziladi) */
                    data: { patientReply: coming ? 'coming' : 'cant', patientReplyAt: new Date() },
                });
                await ctx.answerCbQuery(coming ? 'Rahmat!' : 'Tushunarli').catch(() => null);
                await ctx.editMessageReplyMarkup(undefined).catch(() => null);
                await ctx.reply(coming
                    ? `✅ Rahmat! Sizni ${appt.date} soat ${appt.time} da kutamiz.`
                    : "Tushunarli. Klinika siz bilan bog'lanib, boshqa vaqtni kelishib oladi.");
                if (!coming && appt.patientReply !== 'cant') {
                    await notifyReception(prisma, (cid, chat, html) => this.sendHtml(cid, chat, html), appt.clinicId,
                        showPhone => cantComeText(appt, showPhone ? appt.patient?.phone : null), true);
                }
            });

            /* Shifokor: ertangi qabullar */
            bot.hears('🗓 Ertangi qabullarim', async (ctx) => {
                const doctor = await prisma.doctor.findFirst({ where: { telegramChatId: String(ctx.chat.id), clinic: { botToken: token } } });
                if (!doctor) return ctx.reply("❌ Siz shifokor sifatida ulanmagansiz. Telefon raqamingizni yuboring.", {
                    reply_markup: { keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]], resize_keyboard: true },
                });
                await ctx.reply(await buildDoctorSchedule(prisma, doctor.id, addDays(tashkentDateStr(), 1), 'Ertangi jadvalingiz'), { parse_mode: 'HTML' });
            });

            // 4. Listen for "📅 Bugungi qabullarim" button (doctor)
            bot.hears('📅 Bugungi qabullarim', async (ctx) => {
                const chatId = String(ctx.chat.id);

                const doctor = await prisma.doctor.findFirst({
                    where: {
                        telegramChatId: chatId,
                        clinic: { botToken: token }
                    },
                    include: { clinic: true }
                });

                if (doctor) {
                    const schedule = await buildDoctorSchedule(prisma, doctor.id, tashkentDateStr(), 'Bugungi jadvalingiz');
                    ctx.reply(schedule, { parse_mode: 'HTML' });
                } else {
                    ctx.reply("❌ Siz shifokor sifatida ulanmagansiz. Iltimos, telefon raqamingizni yuboring.", {
                        reply_markup: {
                            keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                            resize_keyboard: true
                        }
                    });
                }
            });

            // 5. Contact Listener
            bot.on('contact', async (ctx) => {
                const contact = ctx.message.contact;
                const chatId = String(ctx.chat.id);
                if (!contact || !contact.phone_number) return;

                /* KONTAKT YUBORUVCHINING O'ZINIKI BO'LISHI SHART (audit 2026-09-17).

                   Telegram'da telefon kitobidagi ISTALGAN kontaktni ulashish
                   mumkin. Tekshiruv yo'q edi: egasining raqamini bilgan odam
                   o'z chatini ega sifatida ulab, hisobotlar, to'lov cheklari
                   (bemor ismi va telefoni) va «Tasdiqlash» tugmalarini olardi.
                   Shifokor va bemor raqami bilan ham xuddi shunday.

                   «Raqamni yuborish» tugmasi orqali yuborilgan kontaktda
                   `user_id` yuboruvchining o'zi bo'ladi. */
                if (!contact.user_id || contact.user_id !== ctx.from?.id) {
                    ctx.reply("❌ Iltimos, o'z raqamingizni «📱 Telefon raqamni yuborish» tugmasi orqali yuboring.");
                    return;
                }

                let phone = contact.phone_number.replace(/\s/g, '').replace('+', '');

                try {
                    // Check if owner of ANY clinic using this token
                    const clinics = await prisma.clinic.findMany({
                        where: { botToken: token }
                    });

                    let foundAny = false;

                    // --- CHECK: Clinic Owner ---
                    for (const clinic of clinics) {
                        if ((clinic as any).ownerPhone) {
                            const ownerPhone = (clinic as any).ownerPhone.replace(/\s/g, '').replace('+', '');
                            if (ownerPhone === phone) {
                                await prisma.clinic.update({
                                    where: { id: clinic.id },
                                    data: { telegramChatId: chatId }
                                } as any);
                                ctx.reply(`✅ Xush kelibsiz, ${clinic.adminName}!\n\nSiz ${clinic.name} egasi sifatida muvaffaqiyatli ulandingiz. Endi siz har kuni hisobotlarni olasiz.`, {
                                    reply_markup: {
                                        keyboard: OWNER_MENU,
                                        resize_keyboard: true
                                    }
                                });
                                foundAny = true;
                            }
                        }
                    }

                    if (foundAny) return;

                    // --- CHECK: Doctor ---
                    const cleanPhone = phone.slice(-9); // last 9 digits for matching
                    const doctors = await prisma.doctor.findMany({
                        where: {
                            clinic: { botToken: token }
                        },
                        include: { clinic: true }
                    });

                    for (const doctor of doctors) {
                        const doctorPhone = doctor.phone.replace(/\s/g, '').replace('+', '');
                        if (doctorPhone.slice(-9) === cleanPhone) {
                            // Check unique constraint before updating
                            // Clear any existing doctor with this chatId in same clinic
                            await prisma.doctor.updateMany({
                                where: {
                                    telegramChatId: chatId,
                                    clinicId: doctor.clinicId,
                                    NOT: { id: doctor.id }
                                },
                                data: { telegramChatId: null }
                            });

                            await prisma.doctor.update({
                                where: { id: doctor.id },
                                data: { telegramChatId: chatId }
                            });

                            const schedule = await buildDoctorSchedule(prisma, doctor.id, tashkentDateStr(), 'Bugungi jadvalingiz');

                            ctx.reply(`✅ Xush kelibsiz, Dr. ${doctor.firstName} ${doctor.lastName}!\n\nSiz ${doctor.clinic.name} klinikasiga muvaffaqiyatli ulandi. Endi har kuni ertalab bugungi qabullaringiz keladi, registrator qabul yozsa, ko'chirsa yoki bekor qilsa — darhol xabar olasiz. 🏥`, {
                                reply_markup: {
                                    keyboard: DOCTOR_MENU,
                                    resize_keyboard: true
                                }
                            });

                            // Send today's schedule immediately
                            if (schedule !== null) {
                                ctx.reply(schedule, { parse_mode: 'HTML' });
                            }

                            foundAny = true;
                            break;
                        }
                    }

                    if (foundAny) return;

                    // --- CHECK: Registrator (0051) ---
                    const receptionists = await prisma.receptionist.findMany({
                        where: { status: 'Active', clinic: { botToken: token } },
                        include: { clinic: true },
                    });
                    const rec = receptionists.find((r: any) => String(r.phone || '').replace(/\D/g, '').slice(-9) === cleanPhone);
                    if (rec) {
                        await prisma.receptionist.updateMany({
                            where: { telegramChatId: chatId, clinicId: rec.clinicId, NOT: { id: rec.id } },
                            data: { telegramChatId: null },
                        });
                        await prisma.receptionist.update({ where: { id: rec.id }, data: { telegramChatId: chatId } });
                        await ctx.reply(`✅ Xush kelibsiz, ${rec.firstName}!\n\nSiz ${rec.clinic.name} registratori sifatida ulandingiz. Bugungi va ertangi qabullar, bugungi kassa — tugmalarda. Bemor eslatmaga «kela olmayman» desa yoki saytdan so'rov kelsa, shu yerga xabar keladi.`, {
                            reply_markup: { keyboard: RECEPTION_MENU, resize_keyboard: true },
                        });
                        return;
                    }

                    // --- CHECK: Patient ---
                    const patients = await prisma.patient.findMany({
                        where: {
                            phone: { contains: cleanPhone },
                            clinic: { botToken: token }
                        },
                        include: { clinic: true }
                    });

                    for (const patient of patients) {
                        await prisma.patient.update({
                            where: { id: patient.id },
                            data: { telegramChatId: chatId }
                        });
                        ctx.reply(`✅ Assalomu alaykum, ${patient.firstName}!\n\nSiz ${patient.clinic.name} bemori sifatida muvaffaqiyatli ulandingiz.`, {
                            reply_markup: {
                                keyboard: [
                                    [{ text: "📅 Qabulga yozilish" }, { text: "⏰ Keyingi qabulim" }],
                                    [{ text: "📋 Davolanish tarixim" }, { text: "💳 Mening hisobim" }]
                                ],
                                resize_keyboard: true
                            }
                        });
                        foundAny = true;
                    }

                    if (!foundAny) {
                        ctx.reply("❌ Kechirasiz, sizning telefon raqamingiz tizimda topilmadi. Iltimos, klinika bilan bog'laning.");
                    }
                } catch (e) {
                    console.error("Contact handler error:", e);
                    ctx.reply("❌ Xatolik yuz berdi.");
                }
            });

            // --- PATIENT MENU HANDLERS ---
            bot.hears('⏰ Keyingi qabulim', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const patient = await prisma.patient.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } } });
                if (!patient) return;

                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                const nextAppt = await prisma.appointment.findFirst({
                    where: {
                        patientId: patient.id,
                        date: { gte: todayStr },
                        status: { in: ['Confirmed', 'Pending'] }
                    },
                    orderBy: [
                        { date: 'asc' },
                        { time: 'asc' }
                    ]
                });

                if (nextAppt) {
                    ctx.reply(`📅 *Sizning navbatdagi qabulingiz:*\n\n👨‍⚕️ Shifokor: ${nextAppt.doctorName}\n📆 Sana: ${nextAppt.date}\n⏰ Vaqt: ${nextAppt.time}`, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply("Sizda rejalashtirilgan qabullar yo'q. Yangi qabulga yozilish uchun '📅 Qabulga yozilish' tugmasidan foydalaning.");
                }
            });

            bot.hears('📋 Davolanish tarixim', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const patient = await prisma.patient.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } } });
                if (!patient) return;

                const history = await prisma.appointment.findMany({
                    where: {
                        patientId: patient.id,
                        status: 'Completed'
                    },
                    orderBy: { date: 'desc' },
                    take: 5
                });

                if (history.length > 0) {
                    let msg = `📋 *So'nggi tashriflaringiz:*\n\n`;
                    history.forEach((appt, idx) => {
                        msg += `${idx + 1}. ${appt.date} — ${appt.type} (${appt.doctorName})\n`;
                    });
                    ctx.reply(msg, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply("Sizning davolanish tarixingiz bo'sh. Hali klinikamizda to'liq qabulda bo'lmagansiz.");
                }
            });

            bot.hears('💳 Mening hisobim', async (ctx) => {
                const chatId = String(ctx.chat.id);
                const patient = await prisma.patient.findFirst({ where: { telegramChatId: chatId, clinic: { botToken: token } } });
                if (!patient) return;

                const debts = await prisma.transaction.findMany({
                    where: {
                        patientId: patient.id,
                        status: 'Pending'
                    }
                });

                const totalDebt = debts.reduce((sum, t) => sum + t.amount, 0);

                if (totalDebt > 0) {
                    let msg = `💳 *Sizning to'lanmagan qarzingiz: ${totalDebt.toLocaleString()} UZS*\n\n`;
                    debts.forEach((t, idx) => {
                        msg += `• ${t.date}: ${t.service} - ${t.amount.toLocaleString()} UZS\n`;
                    });
                    ctx.reply(msg, { parse_mode: 'Markdown' });
                } else {
                    ctx.reply("💳 Sizda to'lanmagan qarzdorlik yo'q. Barcha xizmatlar uchun to'lov qilingan! Rahmat 😊");
                }
            });

            // --- BOOKING WIZARD START ---
            
            const startBookingFlow = async (ctx: any) => {
                const chatId = String(ctx.chat ? ctx.chat.id : (ctx.callbackQuery ? ctx.callbackQuery.message.chat.id : ''));
                if (!chatId) return;

                const patient = await prisma.patient.findFirst({
                    where: { telegramChatId: chatId, clinic: { botToken: token } },
                    include: { clinic: true }
                });
                
                if (!patient) {
                    const msg = "❌ Siz bemor sifatida ulanmagansiz. Iltimos, /start buyrug'ini bering yoki raqamingizni yuboring.";
                    return ctx.callbackQuery ? ctx.answerCbQuery(msg, {show_alert: true}) : ctx.reply(msg);
                }

                const doctors = await prisma.doctor.findMany({
                    where: { clinicId: patient.clinicId, status: 'Active' }
                });

                if (doctors.length === 0) {
                    const msg = "Hozircha shifokorlar topilmadi.";
                    return ctx.callbackQuery ? ctx.answerCbQuery(msg, {show_alert: true}) : ctx.reply(msg);
                }

                const buttons = doctors.map(d => ([{ text: `👨‍⚕️ Dr. ${d.firstName} ${d.lastName}`, callback_data: `bdc_${d.id}` }]));
                
                const text = "🩺 Qaysi shifokor qabuliga yozilmoqchisiz?";
                const opts = { reply_markup: { inline_keyboard: buttons } };
                
                if (ctx.callbackQuery) {
                    await ctx.editMessageText(text, opts).catch(() => ctx.reply(text, opts));
                } else {
                    await ctx.reply(text, opts);
                }
            };

            bot.hears('📅 Qabulga yozilish', startBookingFlow);
            bot.action('start_booking', startBookingFlow);

            bot.action(/^bdc_([^_]+)$/, async (ctx) => {
                const doctorId = ctx.match[1];
                const dateButtons = [];
                const today = new Date();
                
                for(let i=0; i<7; i++) {
                    const d = new Date(today);
                    d.setDate(today.getDate() + i);
                    
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    const dateStr = `${yyyy}-${mm}-${dd}`;
                    
                    const display = i === 0 ? "Bugun" : i === 1 ? "Ertaga" : `${dd}.${mm}.${yyyy}`;
                    
                    dateButtons.push([{ text: `📅 ${display}`, callback_data: `bdt_${doctorId}_${dateStr}` }]);
                }

                ctx.editMessageText("🗓 Qaysi kunga yozilmoqchisiz?", {
                    reply_markup: { inline_keyboard: dateButtons }
                });
            });

            bot.action(/^bdt_([^_]+)_(.+)$/, async (ctx) => {
                const doctorId = ctx.match[1];
                const dateStr = ctx.match[2];
                
                const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { clinic: true } });
                if (!doctor) return ctx.answerCbQuery("Shifokor topilmadi");

                const appointments = await prisma.appointment.findMany({
                    where: { doctorId, date: dateStr, status: { notIn: ['Cancelled'] } }
                });

                const startHour = (doctor as any).startHour ?? doctor.clinic.startHour ?? 8;
                const endHour = (doctor as any).endHour ?? doctor.clinic.endHour ?? 20;
                
                const availableSlots: string[] = [];
                for(let h = startHour; h < endHour; h++) {
                    for(let m of [0, 30]) {
                        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        const slotStartMins = h * 60 + m;
                        
                        let isOverlap = false;
                        for(const appt of appointments) {
                            const [ah, am] = appt.time.split(':').map(Number);
                            const apptStartMins = ah * 60 + am;
                            const apptEndMins = apptStartMins + (appt.duration || 30);
                            
                            if (slotStartMins >= apptStartMins && slotStartMins < apptEndMins) {
                                isOverlap = true;
                                break;
                            }
                        }
                        
                        const today = new Date();
                        const yyyy = today.getFullYear();
                        const mm = String(today.getMonth() + 1).padStart(2, '0');
                        const dd = String(today.getDate()).padStart(2, '0');
                        if (dateStr === `${yyyy}-${mm}-${dd}`) {
                            const currentMins = today.getHours() * 60 + today.getMinutes();
                            if (slotStartMins <= currentMins) {
                                isOverlap = true;
                            }
                        }

                        if (!isOverlap) {
                            availableSlots.push(timeStr);
                        }
                    }
                }

                if (availableSlots.length === 0) {
                    return ctx.editMessageText("❌ Bu kunda bo'sh vaqtlar qolmagan. Boshqa kunni tanlang.");
                }

                const buttons = [];
                for(let i=0; i < availableSlots.length; i+=3) {
                    const row = [];
                    for(let j=0; j<3 && i+j < availableSlots.length; j++) {
                        const t = availableSlots[i+j];
                        row.push({ text: t, callback_data: `btm_${doctorId}_${dateStr}_${t}` });
                    }
                    buttons.push(row);
                }

                ctx.editMessageText(`🗓 ${dateStr} sanasi uchun bo'sh vaqtlarni tanlang:`, {
                    reply_markup: { inline_keyboard: buttons }
                });
            });

            bot.action(/^btm_([^_]+)_([^_]+)_(.+)$/, async (ctx) => {
                if (!ctx.chat) return;
                const doctorId = ctx.match[1];
                const dateStr = ctx.match[2];
                const timeStr = ctx.match[3];
                const chatId = String(ctx.chat.id);

                const patient = await prisma.patient.findFirst({
                    where: { telegramChatId: chatId, clinic: { botToken: token } },
                    include: { clinic: true }
                });
                
                if (!patient) return ctx.answerCbQuery("Siz tizimda topilmadingiz.");

                const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
                if (!doctor) return ctx.answerCbQuery("Shifokor topilmadi.");

                const overlapping = await prisma.appointment.findMany({
                    where: { doctorId, date: dateStr, status: { notIn: ['Cancelled'] } }
                });
                
                const [h, m] = timeStr.split(':').map(Number);
                const slotStartMins = h * 60 + m;
                let isOverlap = false;
                for(const appt of overlapping) {
                    const [ah, am] = appt.time.split(':').map(Number);
                    const apptStartMins = ah * 60 + am;
                    const apptEndMins = apptStartMins + (appt.duration || 30);
                    if (slotStartMins >= apptStartMins && slotStartMins < apptEndMins) {
                        isOverlap = true;
                        break;
                    }
                }
                
                if (isOverlap) {
                    return ctx.editMessageText("❌ Kechirasiz, bu vaqt allaqachon band qilindi. Boshqa vaqt tanlang.");
                }

                const clinic = patient.clinic as any;
                const prepaymentEnabled = clinic?.prepaymentEnabled ?? false;
                const prepaymentCard = clinic?.prepaymentCardNumber || '';
                const prepaymentAmount = clinic?.prepaymentAmount ?? 0;
                /* Saytdan yozilish yoqilgan va avtomatik tasdiq yo'q — bot orqali
                   yozilish ham registratorning «so'rovlar» ro'yxatiga tushadi
                   (2026-11-26, migratsiya 0046). O'chiq bo'lsa — avvalgidek. */
                const asRequest = !prepaymentEnabled && !!clinic?.onlineBookingEnabled && !clinic?.bookingAutoConfirm;

                try {
                    const newAppointment = await prisma.appointment.create({
                        data: {
                            patientId: patient.id,
                            patientName: `${patient.firstName} ${patient.lastName}`,
                            doctorId: doctor.id,
                            doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
                            clinicId: patient.clinicId,
                            date: dateStr,
                            time: timeStr,
                            duration: 30,
                            status: prepaymentEnabled ? 'Pending' : asRequest ? 'Requested' : 'Confirmed',
                            source: 'bot',
                            type: 'Konsultatsiya',
                            notes: prepaymentEnabled ? 'Telegram bot orqali yozildi (to\'lov kutilmoqda)' : 'Telegram bot orqali yozildi'
                            // `bookedAt` ATAYLAB qo'yilmaydi: bot pastda chatda o'zi
                            // tasdiqlaydi — «Qabulga yozilganda» avtomatikasi ikkinchi
                            // xabar (yoki pullik SMS) yubormasin.
                        }
                    });

                    if (prepaymentEnabled && prepaymentCard && prepaymentAmount > 0) {
                        this.pendingPayments.set(chatId, { appointmentId: newAppointment.id, clinicId: patient.clinicId });
                        await ctx.editMessageText(
                            `📋 Qabulingiz vaqtincha band qilindi.\n\n` +
                            `👨‍⚕️ Shifokor: Dr. ${doctor.firstName} ${doctor.lastName}\n` +
                            `📅 Sana: ${dateStr}\n⏰ Vaqt: ${timeStr}\n\n` +
                            `💳 *Oldindan to'lov talab etiladi!*\n\n` +
                            `To'lov miqdori: *${prepaymentAmount.toLocaleString()} so'm*\n` +
                            `Karta raqami: \`${prepaymentCard}\`\n\n` +
                            `Iltimos, yuqoridagi kartaga to'lov qiling va chekni (rasm yoki fayl sifatida) shu yerga yuboring. ` +
                            `Admin tekshirgach, qabulingiz tasdiqlanadi.`,
                            { parse_mode: 'Markdown' }
                        );
                    } else if (asRequest) {
                        void notifyReception(prisma, (cid, chat, html) => this.sendHtml(cid, chat, html), doctor.clinicId,
                            showPhone => bookingRequestText({
                                patientName: `${patient.firstName} ${patient.lastName}`.trim(), date: dateStr, time: timeStr,
                                doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`, notes: patient.phone,
                            }, showPhone, 'bot'));
                        await ctx.editMessageText(`📝 So'rovingiz qabul qilindi.\n\n👨‍⚕️ Shifokor: Dr. ${doctor.firstName} ${doctor.lastName}\n📅 Sana: ${dateStr}\n⏰ Vaqt: ${timeStr}\n\nRegistratura tasdiqlagach shu yerga xabar keladi.`);
                    } else {
                        await ctx.editMessageText(`✅ Muvaffaqiyatli yozildingiz!\n\n👨‍⚕️ Shifokor: Dr. ${doctor.firstName} ${doctor.lastName}\n📅 Sana: ${dateStr}\n⏰ Vaqt: ${timeStr}\n\nKlinikada kutib qolamiz.`);
                        if (doctor.telegramChatId) {
                            const msg = `🔔 *YANGI QABUL (Telegram bot orqali)*\n\n👤 Bemor: ${patient.firstName} ${patient.lastName}\n📱 Telefon: ${patient.phone}\n📅 Sana: ${dateStr}\n⏰ Vaqt: ${timeStr}`;
                            await bot.telegram.sendMessage(doctor.telegramChatId, msg, { parse_mode: 'Markdown' }).catch(() => {});
                        }
                    }

                } catch(e: any) {
                    if (e.code === 'P2002') {
                        return ctx.editMessageText("❌ Sizda bu kunga allaqachon qabul mavjud. Boshqa kunni tanlang.");
                    }
                    console.error("Booking error:", e);
                    ctx.editMessageText("❌ Xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
                }
            });

            // --- BOOKING WIZARD END ---

            // 7. Payment Receipt Handler (photo or document)
            const handlePaymentReceipt = async (ctx: any, fileId: string, isPhoto: boolean) => {
                if (!ctx.chat) return;
                const chatId = String(ctx.chat.id);
                const pending = this.pendingPayments.get(chatId);
                if (!pending) return;

                const { appointmentId, clinicId } = pending;

                const appointment = await prisma.appointment.findUnique({
                    where: { id: appointmentId },
                    include: { patient: true, doctor: true }
                });
                if (!appointment) return;

                const adminClinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
                if (!adminClinic?.telegramChatId) {
                    await ctx.reply("✅ Chekingiz qabul qilindi. Admin tez orada tasdiqlaydî.");
                    return;
                }

                const caption =
                    `💳 *TO'LOV CHEKI*\n\n` +
                    `👤 Bemor: ${appointment.patient.firstName} ${appointment.patient.lastName}\n` +
                    `📱 Telefon: ${appointment.patient.phone}\n` +
                    `👨‍⚕️ Shifokor: ${appointment.doctorName}\n` +
                    `📅 Sana: ${appointment.date}\n` +
                    `⏰ Vaqt: ${appointment.time}\n\n` +
                    `Qabulni tasdiqlaysizmi?`;

                const replyMarkup = {
                    inline_keyboard: [[
                        { text: "✅ Tasdiqlash", callback_data: `confirm_pay_${appointmentId}` },
                        { text: "❌ Rad etish", callback_data: `reject_pay_${appointmentId}` }
                    ]]
                };

                try {
                    if (isPhoto) {
                        await bot.telegram.sendPhoto(adminClinic.telegramChatId, fileId, {
                            caption,
                            parse_mode: 'Markdown',
                            reply_markup: replyMarkup
                        });
                    } else {
                        await bot.telegram.sendDocument(adminClinic.telegramChatId, fileId, {
                            caption,
                            parse_mode: 'Markdown',
                            reply_markup: replyMarkup
                        });
                    }
                    this.pendingPayments.delete(chatId);
                    await ctx.reply("✅ Chekingiz adminga yuborildi. Tez orada qabulingiz tasdiqlanadi.");
                } catch (e) {
                    console.error("Failed to forward payment receipt:", e);
                    await ctx.reply("❌ Xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
                }
            };

            bot.on(message('photo'), async (ctx) => {
                const photos = ctx.message.photo;
                const fileId = photos[photos.length - 1].file_id;
                await handlePaymentReceipt(ctx, fileId, true);
            });

            bot.on(message('document'), async (ctx) => {
                const fileId = ctx.message.document.file_id;
                await handlePaymentReceipt(ctx, fileId, false);
            });

            // 8. Admin: Confirm or Reject Payment
            /* To'lov tugmalari FAQAT klinika egasining chatidan (audit 2026-09-17).
               Ilgari kim bosgani tekshirilmasdi: callback ma'lumotini
               Telegram mijoz API si orqali istalgan chatdan yuborish mumkin,
               tasdiq esa bemor avansiga pul yozadi. */
            const fromOwnerChat = async (ctx: any, appointmentId: string): Promise<boolean> => {
                const appt = await prisma.appointment.findUnique({
                    where: { id: appointmentId },
                    select: { clinic: { select: { telegramChatId: true } } },
                });
                const ownerChat = appt?.clinic?.telegramChatId;
                const ok = !!ownerChat && String(ctx.chat?.id) === String(ownerChat);
                if (!ok) {
                    console.warn(`[bot] to'lov tugmasi egadan boshqa chatdan bosildi: ${ctx.chat?.id}`);
                    await ctx.answerCbQuery("⛔ Ruxsat yo'q").catch(() => {});
                }
                return ok;
            };

            bot.action(/^confirm_pay_([\w-]+)$/, async (ctx) => {
                const appointmentId = ctx.match[1];
                if (!(await fromOwnerChat(ctx, appointmentId))) return;
                try {
                    /* ─── TASDIQ = PUL YOZILADI ──────────────────────────────

                       Ilgari admin «Tasdiqlash» bosganda faqat qabul holati
                       o'zgarardi. Bemor kartaga HAQIQIY pul yuborgan bo'lardi,
                       klinikaning hisobida esa hech narsa qolmasdi: kassada
                       yo'q, bemor balansida yo'q, hisobotda yo'q. Kelganda
                       bemor «men to'laganman» derdi va buni tekshirishning
                       yo'li yo'q edi.

                       Endi tasdiq bemor hisobiga AVANS yozadi — kassadagi
                       avans bilan aynan bir yo'ldan (`applyAdvance`).
                       Kelganda u xizmat to'lovida «Avansdan» usuli bilan
                       sarflanadi.

                       Qabul holati va pul bitta tranzaksiyada: yarim holat
                       qolmasin. */
                    const { appointment, advanceSum, fresh } = await prisma.$transaction(async (tx: any) => {
                        /* Tasdiq FAQAT kutayotgan qabulni o'zgartiradi.
                           Telegram tugmasi o'chmaydi va admin uni ikki marta
                           bosishi mumkin — u holda avans ikki marta
                           yozilardi. `updateMany` nechta qator o'zgarganini
                           aytadi: nol bo'lsa pul yozilmaydi. */
                        const changed = await tx.appointment.updateMany({
                            where: { id: appointmentId, status: 'Pending' },
                            data: { status: 'Confirmed', notes: 'Telegram bot orqali yozildi (to\'lov tasdiqlandi)' },
                        });
                        const appt = await tx.appointment.findUnique({
                            where: { id: appointmentId },
                            include: { patient: true, doctor: true },
                        });
                        if (!appt) throw new Error('Qabul topilmadi');
                        if (changed.count === 0) return { appointment: appt, advanceSum: 0, fresh: false };

                        const clinic = await tx.clinic.findUnique({
                            where: { id: appt.clinicId },
                            select: { prepaymentAmount: true },
                        });
                        const sum = Math.round(Number(clinic?.prepaymentAmount) || 0);
                        if (sum > 0 && appt.patientId) {
                            await applyAdvance(tx, appt.clinicId, {
                                patientId: appt.patientId,
                                amount: sum,
                                // Bron uchun to'lov kartaga yuboriladi
                                method: 'Card',
                                receivedByName: 'Telegram bot',
                            });
                        }
                        return { appointment: appt, advanceSum: sum, fresh: true };
                    }, { timeout: 15000, maxWait: 10000 });

                    await ctx.editMessageCaption(
                        `✅ *TASDIQLANDI*\n\n` +
                        `👤 Bemor: ${appointment.patient.firstName} ${appointment.patient.lastName}\n` +
                        `👨‍⚕️ Shifokor: ${appointment.doctorName}\n` +
                        `📅 ${appointment.date} soat ${appointment.time}` +
                        (advanceSum > 0
                            ? `\n\n💰 Bemor hisobiga avans yozildi: ${advanceSum.toLocaleString()} so'm`
                            : ''),
                        { parse_mode: 'Markdown' }
                    );
                    await ctx.answerCbQuery("✅ Qabul tasdiqlandi");
                    /* Shifokorga — bemor o'zi bot orqali yozilgan qabul (0050) */
                    if (fresh) {   // ikkinchi bosishda takror xabar yo'q
                        void notifyDoctorAppointment(prisma, (cid, chat, html) => this.sendHtml(cid, chat, html),
                            { ...appointment, status: 'Confirmed' } as any, null);
                    }

                    if (appointment.patient.telegramChatId) {
                        await bot.telegram.sendMessage(
                            appointment.patient.telegramChatId,
                            `✅ *Qabulingiz tasdiqlandi!*\n\n👨‍⚕️ Shifokor: ${appointment.doctorName}\n📅 Sana: ${appointment.date}\n⏰ Vaqt: ${appointment.time}`
                            + (advanceSum > 0
                                ? `\n\n💰 To'lovingiz hisobingizga yozildi: ${advanceSum.toLocaleString()} so'm. Xizmat to'lovida shundan yechiladi.`
                                : '')
                            + `\n\nKlinikada kutib qolamiz!`,
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});
                    }
                } catch (e) {
                    console.error("Confirm payment error:", e);
                    await ctx.answerCbQuery("Xatolik yuz berdi");
                }
            });

            bot.action(/^reject_pay_([\w-]+)$/, async (ctx) => {
                const appointmentId = ctx.match[1];
                if (!(await fromOwnerChat(ctx, appointmentId))) return;
                try {
                    /* Faqat kutayotgan qabul rad etiladi — tasdiqlangan (avansi
                       yozilgan) qabul eski tugma bilan bekor bo'lib qolmasin. */
                    const changed = await prisma.appointment.updateMany({
                        where: { id: appointmentId, status: 'Pending' },
                        data: { status: 'Cancelled', notes: 'To\'lov rad etildi' },
                    });
                    if (changed.count === 0) {
                        await ctx.answerCbQuery("Bu qabul allaqachon ko'rib chiqilgan");
                        return;
                    }
                    const appointment: any = await prisma.appointment.findUnique({
                        where: { id: appointmentId },
                        include: { patient: true, doctor: true }
                    });
                    await ctx.editMessageCaption(
                        `❌ *RAD ETILDI*\n\n` +
                        `👤 Bemor: ${appointment.patient.firstName} ${appointment.patient.lastName}\n` +
                        `👨‍⚕️ Shifokor: ${appointment.doctorName}\n` +
                        `📅 ${appointment.date} soat ${appointment.time}`,
                        { parse_mode: 'Markdown' }
                    );
                    await ctx.answerCbQuery("❌ Qabul rad etildi");

                    if (appointment.patient.telegramChatId) {
                        await bot.telegram.sendMessage(
                            appointment.patient.telegramChatId,
                            `❌ *Qabulingiz tasdiqlanmadi.*\n\nTo'lovingiz rad etildi. Iltimos, klinika bilan bog'laning yoki qaytadan urinib ko'ring.`,
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});
                    }
                } catch (e) {
                    console.error("Reject payment error:", e);
                    await ctx.answerCbQuery("Xatolik yuz berdi");
                }
            });

            // 6. Rating Action Handler
            bot.action(/^rate_(\d+)_([\w-]+)$/, async (ctx) => {
                const rating = parseInt(ctx.match[1]);
                const appointmentId = ctx.match[2];
                if (!ctx.chat) return;

                try {
                    /* Faqat 1..5 va faqat o'sha bemorning o'z chati (shikoyatlar,
                       2026-11-26). Ilgari istalgan chat istalgan son yozardi. */
                    const res = await recordRating(prisma, { appointmentId, chatId: String(ctx.chat.id), rating });
                    if (!res.ok) { await ctx.answerCbQuery("Baholab bo'lmadi"); return; }

                    const stars = "⭐".repeat(rating);
                    if (res.complaintId) {
                        awaitingComplaint.set(`${token}:${ctx.chat.id}`, { complaintId: res.complaintId, until: Date.now() + COMPLAINT_REPLY_MS });
                        await ctx.editMessageText(`Bahoingiz uchun rahmat (${stars}).\n\nKechirasiz, nimadir yoqmadi. Iltimos, bitta xabarda yozing: nima yoqmadi? Klinika rahbariyati albatta ko'rib chiqadi.`);
                        /* Egaga xabar — faqat yoqilgan bo'lsa */
                        const clinic = await prisma.clinic.findUnique({ where: { id: res.clinicId }, select: { complaintAlert: true, telegramChatId: true } });
                        if (clinic?.complaintAlert && clinic.telegramChatId) {
                            await bot.telegram.sendMessage(clinic.telegramChatId,
                                `⚠️ Past baho: ${stars} (${rating}/5)\nBemor: ${res.patientName}${res.doctorName ? `\nShifokor: ${res.doctorName}` : ''}\nXClinic → Bugun → «Shikoyat va fikrlar»`).catch(() => {});
                        }
                    } else {
                        await ctx.editMessageText(`✅ Bahoingiz uchun rahmat!\n\nSiz bizni ${rating} ball (${stars}) bilan baholadingiz. Kelajakda xizmatlarimizni yanada yaxshilashda davom etamiz.`);
                    }
                    await ctx.answerCbQuery("Rahmat!");
                } catch (e) {
                    console.error("Rating save error:", e);
                    await ctx.answerCbQuery("Xatolik yuz berdi.");
                }
            });

            /* Past bahodan keyingi matn — shikoyat matni. ENG OXIRIDA: boshqa
               hech bir buyruq ushlamagan oddiy matngina shu yerga keladi. */
            bot.on(message('text'), async (ctx, next) => {
                const key = `${token}:${ctx.chat.id}`;
                const wait = awaitingComplaint.get(key);
                if (!wait || wait.until < Date.now()) { awaitingComplaint.delete(key); return next(); }
                awaitingComplaint.delete(key);
                try {
                    const saved = await attachComplaintText(prisma, wait.complaintId, ctx.message.text);
                    await ctx.reply(saved
                        ? "Rahmat, yozganingiz qabul qilindi. Mas'ul xodim siz bilan bog'lanadi."
                        : "Rahmat! Fikringiz avval qabul qilingan — mas'ul xodim siz bilan bog'lanadi.");
                } catch (e) {
                    console.error('Complaint text error:', e);
                }
            });

            /* Bitta tugmadagi xato (tarmoq, baza band, Telegram 400/429)
               butun botni to'xtatmasin: Telegraf standart holatda xatoni
               qayta otadi va polling o'ladi — bemorlar ham javobsiz qoladi. */
            bot.catch((err: any, ctx: any) => {
                console.error(`Bot xatosi (${ctx?.updateType || '?'}):`, err?.message || err);
            });
            bot.launch().catch(err => console.error(`Bot launch failed for token ${token.substring(0, 5)}:`, err.message));
            this.bots.set(token, bot);
            console.log(`✅ Bot instance started for token: ${token.substring(0, 10)}...`);

        } catch (error: any) {
            console.error(`Failed to start bot for token ${token.substring(0, 5)}:`, error.message);
        }
    }

    public async removeBot(clinicId: string) {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return;

        const token = clinic.botToken;
        const count = this.usageCount.get(token) || 0;

        if (count <= 1) {
            const bot = this.bots.get(token);
            if (bot) {
                try {
                    await bot.stop();
                } catch (e) { }
                this.bots.delete(token);
                this.usageCount.delete(token);
                this.botUsernames.delete(token);
                console.log(`🛑 Bot instance stopped for token: ${token.substring(0, 10)}...`);
            }
        } else {
            this.usageCount.set(token, count - 1);
            console.log(`ℹ️ Bot instance remains active for other clinics. Clinic ${clinicId} association removed.`);
        }
    }

    public async notifyClinicUser(
        clinicId: string,
        chatId: string,
        message: string,
        patientId?: string,
        type: string = 'Manual',
        replyMarkup?: any,
        logExtra?: { source?: string; ruleId?: string; refId?: string }
    ): Promise<{ success: boolean; error?: string }> {
        const extra = {
            channel: 'telegram',
            source: logExtra?.source || 'manual',
            ruleId: logExtra?.ruleId || null,
            refId: logExtra?.refId || null,
            recipient: chatId,
        };

        // Har qanday muvaffaqiyatsizlik ham tarixga yozilishi shart: aks holda xabar
        // "yo'qoladi" va avtomatika dvigateli (ruleId+refId bo'yicha dedupe qiladi)
        // o'sha qabulga har 10 daqiqada qayta urinaveradi.
        const logFailure = async (error: string) => {
            await prisma.telegramLog.create({
                data: { clinicId, patientId, type, status: 'Failed', message, error, ...extra }
            }).catch((err: any) => console.error('Telegram log error:', err));
            return { success: false, error };
        };

        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return await logFailure('Bot sozlanmagan');

        const bot = this.bots.get(clinic.botToken);
        if (!bot) return await logFailure('Bot instance topilmadi (bot ishga tushmagan)');
        try {
            await bot.telegram.sendMessage(chatId, message, replyMarkup ? { reply_markup: replyMarkup } : undefined);
            await prisma.telegramLog.create({
                data: { clinicId, patientId, type, status: 'Sent', message, ...extra }
            }).catch((err: any) => console.error('Telegram log error:', err));
            return { success: true };
        } catch (e: any) {
            console.error(`Failed to send message in clinic ${clinicId}:`, e);
            return await logFailure(e.message || 'Telegram xatosi');
        }
    }

    public async sendRatingRequest(clinicId: string, chatId: string, appointmentId: string, patientName: string, patientId?: string) {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return;

        const bot = this.bots.get(clinic.botToken);
        const message = `🌟 Assalomu alaykum, ${patientName}!\n\nBugun klinikamamizdan foydalanganingiz uchun rahmat. Iltimos, xizmat ko'rsatish sifatini 5 ballik tizimda baholang. Bu bizga yanada yaxshiroq bo'lishimizga yordam beradi.`;

        if (bot) {
            try {
                await bot.telegram.sendMessage(chatId, message, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "⭐ 1", callback_data: `rate_1_${appointmentId}` },
                            { text: "⭐ 2", callback_data: `rate_2_${appointmentId}` },
                            { text: "⭐ 3", callback_data: `rate_3_${appointmentId}` },
                            { text: "⭐ 4", callback_data: `rate_4_${appointmentId}` },
                            { text: "⭐ 5", callback_data: `rate_5_${appointmentId}` }
                        ]]
                    }
                });
                await prisma.telegramLog.create({
                    data: { clinicId, patientId, type: 'Rating', status: 'Sent', message: 'Rating Request sent' }
                });
            } catch (e: any) {
                console.error(`Failed to send rating request in clinic ${clinicId}:`, e);
                await prisma.telegramLog.create({
                    data: { clinicId, patientId, type: 'Rating', status: 'Failed', message: 'Rating Request failed', error: e.message }
                });
            }
        }
    }

    public async getBotUsername(clinicId: string): Promise<string | null> {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
        if (!clinic || !clinic.botToken) return null;
        return this.botUsernames.get(clinic.botToken) || null;
    }

    /**
     * Send morning schedule to ALL doctors across ALL clinics that have a bot and telegram-linked doctors
     */
    /** «💾 Zaxira nusxa» tugmasi — server o'rnatadi (yangi nusxa olib, egaga yuboradi) */
    private backupHandler: (() => Promise<{ sent: boolean; reason?: string }>) | null = null;
    public setBackupHandler(fn: () => Promise<{ sent: boolean; reason?: string }>) { this.backupHandler = fn; }

    /** HTML xabar (hisobot, jadval, shifokorga qabul xabari). Tarixga yoziladi. */
    public async sendHtml(clinicId: string, chatId: string, html: string, replyMarkup?: any): Promise<{ success: boolean; error?: string }> {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { botToken: true } });
        const bot = clinic?.botToken ? this.bots.get(clinic.botToken) : undefined;
        const log = (status: string, error?: string) => prisma.telegramLog.create({
            data: { clinicId, type: 'Staff', status, message: html.slice(0, 2000), error: error || null, channel: 'telegram', source: 'staff', recipient: chatId },
        }).catch(() => null);
        if (!bot) { await log('Failed', 'Bot ishga tushmagan'); return { success: false, error: 'Bot ishga tushmagan' }; }
        try {
            await bot.telegram.sendMessage(chatId, html, { parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
            await log('Sent');
            return { success: true };
        } catch (e: any) {
            await log('Failed', e?.message || 'Telegram xatosi');
            return { success: false, error: e?.message };
        }
    }

}

export const botManager = new BotManager();
