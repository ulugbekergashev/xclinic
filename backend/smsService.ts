import axios from 'axios';
import { prisma } from './db';

const ESKIZ_BASE_URL = 'https://notify.eskiz.uz/api';
// Eskiz kabinetida ro'yxatdan o'tgan jo'natuvchi nomi.
// DIQQAT: standart qiymat ATAYLAB yo'q. Ilgari bu yerda '4546' turardi —
// bu denta7 ning Eskiz hisobiga tegishli nom. Sozlanmagan XClinic o'sha nom
// bilan SMS yuborib, boshqa klinikaning hisobidan foydalanib qo'yardi.
// Endi nom Sozlamalarda kiritilmasa, SMS yuborilmaydi.
const ESKIZ_NICK = process.env.ESKIZ_NICK || '';

// Eskiz shablonida o'zgaruvchan qism `%w` bilan belgilanadi. Bizning
// `{bemor_ismi}` kabi tokenlarimiz literal matn sifatida yuborilsa, moderatsiyadan
// o'tgan shablon real (ism qo'yilgan) SMS'ga mos kelmaydi va yuborish rad etiladi.
const TEMPLATE_TOKEN_RE = /\{[A-Za-z_]+\}/g;
export const toEskizTemplate = (text: string): string => (text || '').replace(TEMPLATE_TOKEN_RE, '%w');

// Eskiz matnni ozgina qayta formatlab qaytarishi mumkin — solishtirishdan oldin
// bo'sh joy va registr farqlarini yo'qotamiz.
const normalizeForMatch = (text: string): string => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * ⚠️ Bu funksiya `utils/phone.ts` dagi nusxasi bilan bir xil bo'lishi shart —
 * frontend yuboriladigan bemorlar sonini o'sha nusxa bilan hisoblaydi.
 *
 * O'zbekiston raqamini Eskiz kutadigan 998XXXXXXXXX ko'rinishiga keltiradi.
 * Bemor telefoni erkin matn sifatida kiritilgani uchun ( "+998 90 123 45 67",
 * "(90) 123-45-67", "90 123 45 67" ... ) faqat raqamlarni ajratib olamiz.
 * Tanib bo'lmasa null qaytaradi — buzuq raqamni Eskizga yubormaymiz.
 */
export function normalizeUzPhone(phone?: string | null): string | null {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 12 && digits.startsWith('998')) return digits;
    if (digits.length === 13 && digits.startsWith('0998')) return digits.slice(1);
    if (digits.length === 9) return `998${digits}`;
    // Ichki formatlar: 0XX XXX XX XX yoki 8XX XXX XX XX
    if (digits.length === 10 && (digits.startsWith('0') || digits.startsWith('8'))) return `998${digits.slice(1)}`;
    return null;
}

class SmsService {
    /**
     * Get a valid Eskiz token for the clinic.
     * If stored token is missing or expired, fetches a new one.
     */
    public async getToken(clinicId: string): Promise<string | null> {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } }) as any;

        if (!clinic || !clinic.eskizEmail || !clinic.eskizPassword) {
            console.log(`[SMS] Clinic ${clinicId} has no Eskiz credentials.`);
            return null;
        }

        // Check if existing token is still valid (> 1 day buffer)
        if (clinic.eskizToken && clinic.eskizTokenExpiry) {
            const expiry = new Date(clinic.eskizTokenExpiry);
            const now = new Date();
            const oneDayMs = 24 * 60 * 60 * 1000;
            if (expiry.getTime() - now.getTime() > oneDayMs) {
                return clinic.eskizToken;
            }
        }

        // Need fresh token
        return await this.refreshToken(clinicId, clinic.eskizEmail, clinic.eskizPassword);
    }

    /**
     * Login to Eskiz and save the new token to DB.
     */
    public async refreshToken(clinicId: string, email: string, password: string): Promise<string | null> {
        try {
            const formData = new URLSearchParams();
            formData.append('email', email);
            formData.append('password', password);

            const response = await axios.post(`${ESKIZ_BASE_URL}/auth/login`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            });

            const token = response.data?.data?.token;
            if (!token) {
                console.error('[SMS] Eskiz login returned no token:', response.data);
                return null;
            }

            // Save token — valid for 30 days, we store 29 days expiry
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 29);

            const updateData: any = {
                eskizToken: token,
                eskizTokenExpiry: expiry
            };

            // Try to auto-resolve nickname if not set
            try {
                const nicksResponse = await axios.get(`${ESKIZ_BASE_URL}/user/get-nicknames`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    timeout: 5000
                });
                const nicks = nicksResponse.data?.data;
                if (Array.isArray(nicks) && nicks.length > 0) {
                    const activeNick = nicks.find((n: any) => n.status === 'active')?.name || nicks[0].name;
                    updateData.eskizNick = activeNick;
                    console.log(`[SMS] Auto-resolved Nickname: ${activeNick}`);
                }
            } catch (e) {
                console.error('[SMS] Failed to auto-resolve nickname during token refresh');
            }

            await (prisma.clinic as any).update({
                where: { id: clinicId },
                data: updateData
            });

            console.log(`[SMS] Fresh Eskiz token saved for clinic ${clinicId}`);
            return token;
        } catch (err: any) {
            console.error('[SMS] Failed to refresh Eskiz token:', err.response?.data || err.message);
            return null;
        }
    }

    /**
     * Send an SMS to a phone number using the clinic's Eskiz account.
     * phone must be in format: 998901234567 (without +)
     */
    public async sendSms(clinicId: string, phone: string, message: string): Promise<{ success: boolean; error?: string }> {
        try {
            const token = await this.getToken(clinicId);
            if (!token) {
                return { success: false, error: 'Eskiz token topilmadi. Iltimos SMS sozlamalarini tekshiring.' };
            }

            const cleanPhone = normalizeUzPhone(phone);
            if (!cleanPhone) {
                return { success: false, error: `Telefon raqami noto'g'ri formatda: ${phone}` };
            }

            const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } }) as any;
            const senderNick = clinic?.eskizNick || ESKIZ_NICK;

            // Jo'natuvchi nomi sozlanmagan bo'lsa SMS yubormaymiz. Ilgari bu yerda
            // denta7 ning nomi ('4546') standart qiymat bo'lib turardi va sozlanmagan
            // nusxa boshqa klinikaning Eskiz hisobidan foydalanib qo'yardi.
            if (!senderNick) {
                return {
                    success: false,
                    error: "SMS jo'natuvchi nomi sozlanmagan. Sozlamalar → SMS bo'limida Eskiz nomini kiriting.",
                };
            }

            const formData = new URLSearchParams();
            formData.append('mobile_phone', cleanPhone);
            formData.append('message', message);
            formData.append('from', senderNick);
            formData.append('callback_url', '');

            const response = await axios.post(`${ESKIZ_BASE_URL}/message/sms/send`, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${token}`
                },
                timeout: 15000
            });

            const status = response.data?.status;
            if (status === 'waiting' || status === 'success' || response.data?.id) {
                console.log(`[SMS] Sent to ${cleanPhone} via clinic ${clinicId}. Status: ${status}`);
                return { success: true };
            } else {
                console.error('[SMS] Unexpected response:', response.data);
                return { success: false, error: response.data?.message || 'SMS yuborishda xatolik' };
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || err.message || 'SMS yuborishda xatolik';
            console.error(`[SMS] sendSms error for clinic ${clinicId}:`, errorMsg);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Get remaining SMS balance from Eskiz for a clinic.
     */
    public async getBalance(clinicId: string): Promise<{ balance: number | null; error?: string }> {
        try {
            const token = await this.getToken(clinicId);
            if (!token) {
                return { balance: null, error: 'Eskiz token topilmadi' };
            }

            const response = await axios.get(`${ESKIZ_BASE_URL}/user/get-limit`, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            });

            const balance = response.data?.data?.balance ?? response.data?.balance ?? null;
            return { balance };
        } catch (err: any) {
            console.error('[SMS] getBalance error:', err.response?.data || err.message);
            return { balance: null, error: err.response?.data?.message || err.message };
        }
    }

    /**
     * Shablon matnini Eskiz moderatsiyasiga yuboradi (POST /api/user/template).
     * Tokenlar (`{bemor_ismi}` ...) Eskiz kutadigan `%w` ga aylantiriladi.
     * Eskiz javobi shablonni tasdiqlamaydi/rad etmaydi — faqat qabul qilinganini bildiradi,
     * haqiqiy holatni keyin getTemplates() orqali tekshirish kerak.
     */
    public async submitTemplate(clinicId: string, text: string): Promise<{ success: boolean; error?: string }> {
        try {
            const token = await this.getToken(clinicId);
            if (!token) {
                return { success: false, error: 'Eskiz token topilmadi' };
            }

            const formData = new URLSearchParams();
            formData.append('template', toEskizTemplate(text));

            await axios.post(`${ESKIZ_BASE_URL}/user/template`, formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${token}`
                },
                timeout: 15000
            });

            return { success: true };
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || err.message || 'Shablonni yuborishda xatolik';
            console.error(`[SMS] submitTemplate error for clinic ${clinicId}:`, errorMsg);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Klinikaning Eskiz'ga yuborilgan barcha shablonlari va ularning moderatsiya holatini qaytaradi
     * (GET /api/user/templates).
     */
    public async getTemplates(clinicId: string): Promise<{ templates: { id: number; template: string; original_text: string; status: string }[]; error?: string }> {
        try {
            const token = await this.getToken(clinicId);
            if (!token) {
                return { templates: [], error: 'Eskiz token topilmadi' };
            }

            const response = await axios.get(`${ESKIZ_BASE_URL}/user/templates`, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            });

            const templates = response.data?.result;
            return { templates: Array.isArray(templates) ? templates : [] };
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || err.message || 'Shablonlarni olishda xatolik';
            console.error(`[SMS] getTemplates error for clinic ${clinicId}:`, errorMsg);
            return { templates: [], error: errorMsg };
        }
    }

    /**
     * Berilgan shablon matnini Eskiz'dagi ro'yxatdan topadi (tokenlar `%w` ga
     * aylantirilgan holda solishtiriladi) va ID + moderatsiya holatini qaytaradi.
     */
    public async findTemplate(clinicId: string, text: string): Promise<{ match: { id: number; status: string } | null; error?: string }> {
        const { templates, error } = await this.getTemplates(clinicId);
        if (error) return { match: null, error };

        const target = normalizeForMatch(toEskizTemplate(text));
        // Oxirgi yuborilgani ustuvor — bir xil matn bir necha marta yuborilgan bo'lishi mumkin
        const found = [...templates].reverse().find(t =>
            normalizeForMatch(t.original_text) === target || normalizeForMatch(t.template) === target
        );
        return { match: found ? { id: found.id, status: found.status } : null };
    }

    /**
     * Shablonni Eskiz'ga yuborib, so'ng ro'yxatdan (matn bo'yicha) topib, ID va holatini qaytaradi.
     * Klinikada Eskiz ulanmagan bo'lsa jim o'tkazib yuboradi (null qaytaradi).
     */
    public async submitAndSyncTemplate(clinicId: string, text: string): Promise<{ eskizTemplateId: number | null; eskizStatus: string | null }> {
        const submitResult = await this.submitTemplate(clinicId, text);
        if (!submitResult.success) {
            // Eskiz ulanmagan bo'lsa jim qoladi; ulangan-yu xato bo'lsa holatni belgilaymiz
            return { eskizTemplateId: null, eskizStatus: submitResult.error === 'Eskiz token topilmadi' ? null : 'error' };
        }

        const { match } = await this.findTemplate(clinicId, text);
        if (match) {
            return { eskizTemplateId: match.id, eskizStatus: match.status };
        }
        // Yuborildi, lekin ro'yxatda hali topilmadi (masalan matn Eskiz tomonidan biroz o'zgartirilgan)
        return { eskizTemplateId: null, eskizStatus: 'moderation' };
    }

    /**
     * Validate Eskiz credentials (used when clinic saves SMS settings).
     * Returns token on success, null on failure.
     */
    public async validateCredentials(email: string, password: string): Promise<{ valid: boolean; error?: string }> {
        try {
            const formData = new URLSearchParams();
            formData.append('email', email);
            formData.append('password', password);

            const response = await axios.post(`${ESKIZ_BASE_URL}/auth/login`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            });

            const token = response.data?.data?.token;
            if (token) {
                return { valid: true };
            }
            return { valid: false, error: 'Login yoki parol noto\'g\'ri' };
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Eskiz bilan bog\'lanib bo\'lmadi';
            return { valid: false, error: msg };
        }
    }
}

export const smsService = new SmsService();
