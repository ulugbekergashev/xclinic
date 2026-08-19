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
     * Sync Encounter (Visit) to DMED
     */
    public async syncEncounter(clinicId: string, visitId: string) {
        console.log(`[DMED] Syncing encounter ${visitId} for clinic ${clinicId}`);
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
