import crypto from 'crypto';
import { getMachineId } from './hwid';

// VERY IMPORTANT: These salts must never be shared.
// DIQQAT: bu tuzlar dentalocal nikidan BOSHQA bo'lishi shart. Bir xil bo'lsa,
// dentalocal uchun berilgan litsenziya kaliti XClinic'ni ham ochib yuboradi.
// SECRET_SALT — used to generate the activation/license keys for clinics.
// RECOVERY_SALT — used to generate one-time admin password recovery keys (different salt
// so a leaked license key cannot be used to reset the password and vice-versa).
const SECRET_SALT = 'XCl1n1c_Mult1Pr0f1l_L1c_2026_$#@!vB7nM4kQ9wE2rT6yU8i';
const RECOVERY_SALT = 'XCl1n1c_R3c0v3ry_Adm1n_2026_%^&*Lp2oI5uY8tR3eW6qZ9xC4vB';

/**
 * Generates the expected activation key for the current machine
 */
export function generateExpectedKey(machineId: string): string {
    return crypto.createHash('sha256')
        .update(machineId + SECRET_SALT)
        .digest('hex')
        .substring(0, 24)
        .toUpperCase();
}

/**
 * Checks if a provided key is valid for this machine
 */
export function verifyLicense(providedKey: string): boolean {
    if (!providedKey) return false;
    
    const machineId = getMachineId();
    const expectedKey = generateExpectedKey(machineId);
    
    // Constant time comparison to prevent timing attacks (extreme overkill here but good practice)
    try {
        return crypto.timingSafeEqual(
            Buffer.from(providedKey.toUpperCase()),
            Buffer.from(expectedKey)
        );
    } catch {
        return providedKey.toUpperCase() === expectedKey;
    }
}

/**
 * Generates the admin password recovery key for this machine.
 * The developer runs `node scripts/generate-recovery-key.js <machineId>`
 * and gives the result to the clinic admin (over phone, etc.).
 */
export function generateRecoveryKey(machineId: string): string {
    return crypto.createHash('sha256')
        .update(machineId + RECOVERY_SALT)
        .digest('hex')
        .substring(0, 20)
        .toUpperCase();
}

/**
 * Verifies a recovery key against the current machine.
 */
export function verifyRecoveryKey(providedKey: string): boolean {
    if (!providedKey) return false;

    const machineId = getMachineId();
    const expectedKey = generateRecoveryKey(machineId);

    try {
        const a = Buffer.from(providedKey.toUpperCase().trim());
        const b = Buffer.from(expectedKey);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return providedKey.toUpperCase().trim() === expectedKey;
    }
}

/**
 * Returns current license status for the API
 */
export async function getLicenseStatus(prisma: any) {
    const machineId = getMachineId();
    const clinic = await prisma.clinic.findFirst(); // In local mode, there's usually 1 clinic
    
    if (!clinic || !clinic.licenseKey) {
        return {
            activated: false,
            machineId: machineId,
            displayId: machineId.substring(0, 8) + '...' // More user friendly
        };
    }
    
    const isActive = verifyLicense(clinic.licenseKey);
    
    return {
        activated: isActive,
        machineId: machineId,
        displayId: machineId.substring(0, 8) + '...'
    };
}
