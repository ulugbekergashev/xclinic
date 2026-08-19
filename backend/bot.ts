import { Telegraf, Context } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN is missing in .env. Bot will not start.");
}

export const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// --- Bot Logic ---

if (bot) {
    // 1. Start Command (Handles Patient Linking via Deep Link)
    // Usage: t.me/MyBot?start=patient_uuid_123
    bot.start(async (ctx) => {
        const payload = ctx.payload; // The 'patient_uuid_123' part
        const chatId = String(ctx.chat.id);

        if (payload) {
            // Try to find patient with this ID
            try {
                const patient = await prisma.patient.findUnique({
                    where: { id: payload }
                });

                if (patient) {
                    // Link patient
                    await prisma.patient.update({
                        where: { id: payload },
                        data: { telegramChatId: chatId }
                    });
                    ctx.reply(`✅ Assalomu alaykum, ${patient.firstName} ${patient.lastName}! Sizning profilingiz muvaffaqiyatli ulandi. Endi qabullar haqida eslatmalarni shu yerda olasiz.`);
                    return;
                } else {
                    ctx.reply("❌ Bemor topilmadi. Iltimos, administrator bergan havolani to'g'ri ishlating.");
                }
            } catch (error) {
                console.error("Bot start error:", error);
                ctx.reply("❌ Xatolik yuz berdi.");
            }
        } else {
            // Normal start (for Doctors/Admins)
            ctx.reply("Assalomu alaykum! Agar siz Shifokor yoki Admin bo'lsangiz, iltimos, telefon raqamingizni yuboring.", {
                reply_markup: {
                    keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
    });

    // 2. Contact Listener (For Doctors & Admins)
    bot.on('contact', async (ctx) => {
        const contact = ctx.message.contact;
        const chatId = String(ctx.chat.id);

        if (!contact || !contact.phone_number) return;

        let phone = contact.phone_number.replace('+', ''); // Normalize phone

        try {
            // Check Doctor
            // Note: In real app, phone formats might vary. We assume exact match or simple normalization.
            // You might need to check both '+998...' and '998...'

            // Try finding doctor
            let doctor = await prisma.doctor.findFirst({
                where: {
                    OR: [
                        { phone: phone },
                        { phone: `+${phone}` }
                    ]
                }
            });

            if (doctor) {
                await prisma.doctor.update({
                    where: { id: doctor.id },
                    data: { telegramChatId: chatId }
                });
                ctx.reply(`✅ Xush kelibsiz, Dr. ${doctor.lastName}! Siz tizimga ulandingiz.`);
                return;
            }

            // Try finding clinic admin
            let clinic = await prisma.clinic.findFirst({
                where: {
                    OR: [
                        { phone: phone },
                        { phone: `+${phone}` }
                    ]
                }
            });

            if (clinic) {
                await prisma.clinic.update({
                    where: { id: clinic.id },
                    data: { telegramChatId: chatId }
                });
                ctx.reply(`✅ Xush kelibsiz, ${clinic.adminName}! Klinika admini sifatida ulandingiz.`);
                return;
            }

            ctx.reply("❌ Kechirasiz, bu raqam tizimda topilmadi.");

        } catch (error) {
            console.error("Bot contact error:", error);
            ctx.reply("❌ Tizim xatosi.");
        }
    });

    // Launch bot
    bot.launch().then(() => {
        console.log("🤖 Telegram Bot started!");
    }).catch(err => {
        console.error("❌ Bot launch failed:", err);
    });

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// --- Notification Helpers ---

export async function notifyUser(chatId: string, message: string) {
    if (!bot || !chatId) return;
    try {
        await bot.telegram.sendMessage(chatId, message);
    } catch (error) {
        console.error(`Failed to send message to ${chatId}:`, error);
    }
}

export async function notifyPatient(patientId: string, message: string) {
    try {
        const patient = await prisma.patient.findUnique({
            where: { id: patientId },
            select: { telegramChatId: true }
        });
        if (patient && patient.telegramChatId) {
            await notifyUser(patient.telegramChatId, message);
        }
    } catch (error) {
        console.error(`Failed to notify patient ${patientId}:`, error);
    }
}
