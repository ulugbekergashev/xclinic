import axios from 'axios';
import { prisma } from './db';

const IS_DMED_PROD = process.env.DMED_MODE === 'production';
const DMED_BASE_URL = IS_DMED_PROD ? 'https://api.ssv.uz/v2' : 'https://test-api.ssv.uz/v2';

class DmedService {
    /**
     * Get DMED API configuration for a clinic
     */
    private async getConfig(clinicId: string) {
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId }
        });
        if (!clinic || !clinic.dmedEnabled) return null;
        return {
            apiKey: clinic.dmedApiKey,
            apiSecret: clinic.dmedApiSecret,
            clinicId: clinic.dmedClinicId,
            token: clinic.dmedToken,
            expiry: clinic.dmedTokenExpiry
        };
    }

    /**
     * Get a valid DMED token for the clinic.
     * Note: Exact auth endpoint needs to be confirmed from special IT-MED docs, 
     * but usually it's /auth/token or similar OAuth2 flow.
     */
    public async getToken(clinicId: string): Promise<string | null> {
        const config = await this.getConfig(clinicId);
        if (!config || !config.apiKey || !config.apiSecret) return null;

        // Check if existing token is valid
        if (config.token && config.expiry) {
            const now = new Date();
            if (new Date(config.expiry) > now) {
                return config.token;
            }
        }

        // Fetch new token (Placeholder logic as exact /auth endpoint is usually private)
        return await this.refreshToken(clinicId, config.apiKey, config.apiSecret);
    }

    /**
     * Refresh DMED token
     */
    public async refreshToken(clinicId: string, apiKey: string, apiSecret: string): Promise<string | null> {
        try {
            // Sandbox Mode for testing without real keys (only allowed in non-production environments)
            if (process.env.NODE_ENV !== 'production' && (apiKey === 'test_key' || apiKey === 'sandbox_key')) {
                console.log(`[DMED] 🧪 Sandbox Mode: Simulating token refresh for ${clinicId}`);
                const token = 'sandbox_token_' + Math.random().toString(36).substring(7);
                const expiry = new Date();
                expiry.setHours(expiry.getHours() + 1);

                await prisma.clinic.update({
                    where: { id: clinicId },
                    data: { dmedToken: token, dmedTokenExpiry: expiry }
                });
                return token;
            }

            const response = await axios.post(`${DMED_BASE_URL}/auth/token`, {
                grant_type: 'client_credentials',
                client_id: apiKey,
                client_secret: apiSecret
            }, { timeout: 10000 });

            const token = response.data?.access_token;
            const expiresIn = response.data?.expires_in || 3600;

            if (token) {
                const expiry = new Date();
                expiry.setSeconds(expiry.getSeconds() + expiresIn - 60);

                await prisma.clinic.update({
                    where: { id: clinicId },
                    data: {
                        dmedToken: token,
                        dmedTokenExpiry: expiry
                    }
                });
                return token;
            }
            return null;
        } catch (err: any) {
            console.error(`[DMED] Auth error for clinic ${clinicId}:`, err.message);
            return null;
        }
    }

    /**
     * Search patient by PINFL (JSHSHIR)
     */
    public async findPatientByPinfl(clinicId: string, pinfl: string) {
        try {
            const config = await this.getConfig(clinicId);
            const token = await this.getToken(clinicId);
            
            if (!token) return { success: false, error: 'DMED tokeni olinmadi' };

            // Sandbox Mode Mock Response (only allowed in non-production environments)
            if (process.env.NODE_ENV !== 'production' && (config?.apiKey === 'test_key' || config?.apiKey === 'sandbox_key')) {
                console.log(`[DMED] 🧪 Sandbox Mode: Searching for PINFL ${pinfl}`);
                await new Promise(r => setTimeout(r, 1000)); // Simulate network lag
                
                // Mock FHIR Patient resource
                return { 
                    success: true, 
                    data: {
                        resourceType: "Patient",
                        identifier: [{ system: "nnuzb", value: pinfl }],
                        name: [{ family: "Azizov", given: ["Sherzod", "Alisherovich"] }],
                        birthDate: "1988-10-12",
                        gender: "male",
                        address: [{ text: "Toshkent sh., Yunusobod tumani, 4-uy" }]
                    } 
                };
            }

            const response = await axios.get(`${DMED_BASE_URL}/Patient`, {
                params: { 'identifier': `nnuzb|${pinfl}` },
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data?.entry && response.data.entry.length > 0) {
                const patientData = response.data.entry[0].resource;
                return { success: true, data: patientData };
            }

            return { success: false, error: 'Bemor topilmadi' };
        } catch (err: any) {
            console.error(`[DMED] Patient lookup error:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Qabulni DMED (IT-MED) ga yuborish.
     *
     * DIQQAT: TRANSPORT QISMI HALI YO'Q. Bu yerda qabulni davlat tizimiga
     * haqiqatan yuboradigan kod yozilmagan, chunki DMED ning Encounter
     * uchun kutgan FHIR profili va majburiy maydonlari ro'yxati bizda yo'q.
     * O'ylab topib yozish — yuborilgan deb ko'rsatib, aslida yubormaslik
     * degani; bu davlat hisobotida eng yomon holat.
     *
     * NIMA ISHLAYDI: yuborishga urinish HOLATI yoziladi. Ya'ni:
     *   - `dmedError` — nima uchun ketmadi (masalan PINFL bo'sh);
     *   - `dmedSyncedAt` — muvaffaqiyatli yuborilgan payt;
     *   - `dmedId` — DMED bergan tashqi id.
     *
     * Shu tufayli klinika "qaysi qabullar ketmagan" degan savolga javob
     * oladi va PINFL kabi to'ldirilmagan maydonlarni oldindan tuzatadi
     * (GAP-ANALYSIS B103). Transport kelganda faqat shu funksiya ichi
     * to'ldiriladi, interfeys o'zgarmaydi.
     */
    public async syncEncounter(clinicId: string, visitId: string): Promise<{
        success: boolean; dmedId?: string | null; error?: string;
    }> {
        // `getConfig` dmedEnabled bo'lmasa null qaytaradi — alohida maydon yo'q
        const config = await this.getConfig(clinicId);
        if (!config) {
            const error = 'DMED integratsiyasi yoqilmagan (Sozlamalar)';
            await this.markVisit(visitId, { error });
            return { success: false, error };
        }

        const visit = await prisma.visit.findUnique({
            where: { id: visitId },
            include: { patient: { select: { pinfl: true, firstName: true, lastName: true } } },
        });
        if (!visit) return { success: false, error: 'Qabul topilmadi' };

        /* Oldindan tekshiruv — bu qism HAQIQATDA foydali: DMED ga PINFL siz
           bemorni yuborib bo'lmaydi, va buni yuborishdan oldin bilish kerak. */
        if (!visit.patient?.pinfl) {
            const error = "Bemorda PINFL yo'q — DMED PINFL talab qiladi";
            await this.markVisit(visitId, { error });
            return { success: false, error };
        }
        if (!visit.diagnosis) {
            const error = "Qabulda tashxis yo'q";
            await this.markVisit(visitId, { error });
            return { success: false, error };
        }

        const error = 'DMED ga yuborish hali ulanmagan: Encounter uchun FHIR profili kerak';
        await this.markVisit(visitId, { error });
        console.log(`[DMED] ${visitId}: tekshiruvlar o'tdi, transport yo'q`);
        return { success: false, error };
    }

    /** Qabuldagi DMED holatini yozadi */
    private async markVisit(visitId: string, data: { error?: string | null; dmedId?: string | null; synced?: boolean }) {
        try {
            await prisma.visit.update({
                where: { id: visitId },
                data: {
                    dmedError: data.error ?? null,
                    ...(data.dmedId ? { dmedId: data.dmedId } : {}),
                    ...(data.synced ? { dmedSyncedAt: new Date() } : {}),
                },
            });
        } catch (e: any) {
            console.warn("[DMED] holatni yozib bo'lmadi:", e?.message || e);
        }
    }

    /**
     * Validate DMED credentials
     */
    public async validateCredentials(apiKey: string, apiSecret: string): Promise<{ valid: boolean; error?: string }> {
        try {
            if (apiKey === 'test_key' || apiKey === 'sandbox_key') {
                return { valid: true };
            }

            const response = await axios.post(`${DMED_BASE_URL}/auth/token`, {
                grant_type: 'client_credentials',
                client_id: apiKey,
                client_secret: apiSecret
            }, { timeout: 10000 });

            if (response.data?.access_token) return { valid: true };
            return { valid: false, error: 'Noto\'g\'ri kalitlar' };
        } catch (err: any) {
            return { valid: false, error: err.message };
        }
    }
}

export const dmedService = new DmedService();
