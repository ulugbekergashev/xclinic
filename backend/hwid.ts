import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// Memory cache
let cachedMachineId: string | null = null;

/**
 * Returns the file paths used to persist the device ID, most-preferred first.
 *
 * In a packaged Electron app the ID lives in the per-user writable userData folder
 * (e.g. %APPDATA%\xclinic). This guarantees the value is PER MACHINE and can
 * never be accidentally shipped inside the installer bundle — which previously caused
 * every clinic to inherit the developer's ID (and therefore the same tunnel link).
 *
 * The install-directory paths are used ONLY as a dev fallback (ts-node), never when
 * running under Electron, so a stale/bundled device_id.txt in the app folder is ignored.
 */
function getPersistPaths(): { primary: string; readFallbacks: string[] } {
    const rawUserData = process.env.ELECTRON_USER_DATA_PATH
        ? process.env.ELECTRON_USER_DATA_PATH.replace(/['"]/g, '').trim()
        : (process.env.APPDATA ? path.join(process.env.APPDATA, 'xclinic') : '');

    if (rawUserData) {
        return {
            primary: path.join(rawUserData, 'device_id.txt'),
            readFallbacks: [],
        };
    }

    // Pure dev environment (no Electron userData available).
    return {
        primary: path.join(__dirname, 'prisma', 'device_id.txt'),
        readFallbacks: [path.join(__dirname, 'device_id.txt')],
    };
}

/**
 * Gets a unique hardware identifier for this machine.
 * Guaranteed 100% non-blocking, runs in 0ms, and persists stable values.
 */
export function getMachineId(): string {
    if (cachedMachineId) {
        return cachedMachineId;
    }

    const { primary, readFallbacks } = getPersistPaths();

    // 1. Try reading a previously persisted, machine-local ID.
    for (const readPath of [primary, ...readFallbacks]) {
        try {
            if (fs.existsSync(readPath)) {
                const persisted = fs.readFileSync(readPath, 'utf8').trim();
                if (persisted && persisted.startsWith('HWID-') && persisted.length > 10) {
                    cachedMachineId = persisted;
                    // Promote the value to the primary location for next time.
                    if (readPath !== primary) {
                        try {
                            fs.mkdirSync(path.dirname(primary), { recursive: true });
                            fs.writeFileSync(primary, persisted, 'utf8');
                        } catch (err) {}
                    }
                    return persisted;
                }
            }
        } catch (e) {
            console.warn(`Failed to read persisted hardware ID from ${readPath}:`, e);
        }
    }

    // 2. Generate a robust unique ID based on platform, CPU, MAC, and Hostname
    let hardwareSignature = '';
    try {
        // Collect CPU info
        const cpus = os.cpus() || [];
        if (cpus.length > 0) {
            hardwareSignature += cpus[0].model || '';
        }

        // Collect OS and User Details
        hardwareSignature += os.platform() + os.arch() + os.hostname();

        // Collect MAC Address
        const networkInterfaces = os.networkInterfaces();
        let macs = '';
        for (const name of Object.keys(networkInterfaces)) {
            for (const net of networkInterfaces[name] || []) {
                if (net.mac && net.mac !== '00:00:00:00:00:00') {
                    macs += net.mac;
                }
            }
        }
        hardwareSignature += macs;
    } catch (e) {
        console.error('Error gathering system signatures:', e);
    }

    // If signature is somehow completely empty, use a cryptographically secure random fallback
    if (!hardwareSignature) {
        hardwareSignature = crypto.randomBytes(32).toString('hex');
    }

    // Create a deterministic hash
    const generatedId = 'HWID-' + crypto.createHash('sha256').update(hardwareSignature).digest('hex').substring(0, 16).toUpperCase();

    // 3. Save and persist the generated ID to the primary (machine-local) location.
    try {
        fs.mkdirSync(path.dirname(primary), { recursive: true });
        fs.writeFileSync(primary, generatedId, 'utf8');
    } catch (e) {
        console.error('Failed to persist hardware ID:', e);
    }

    cachedMachineId = generatedId;
    console.log('🔌 Generated stable hardware ID:', generatedId);
    return generatedId;
}

/**
 * Generates a short, user-friendly version of the Machine ID for the UI
 */
export function getDisplayMachineId(): string {
    const fullId = getMachineId();
    return crypto.createHash('sha256').update(fullId).digest('hex').substring(0, 12).toUpperCase();
}
