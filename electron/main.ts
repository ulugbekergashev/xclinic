import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import fs from 'fs';
import { applyPendingRestore } from './restore';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let cloudflaredProcess: ChildProcess | null = null;
let cloudflaredQuickProcess: ChildProcess | null = null;
let currentTunnelToken = '';
let isQuitting = false;
let backendErrorOutput = '';

const isDev = process.env.NODE_ENV === 'development';

/* ── FAYL JURNALI ────────────────────────────────────────────────────────
   Windows'da GUI dasturi konsolga yozmaydi: `console.log` hech qayerga
   bormaydi. Ya'ni paketlangan nusxa ishga tushmasa, sababini bilishning
   HECH QANDAY yo'li yo'q edi — na ekranda, na faylda.

   Klinika «ochilmayapti» deb qo'ng'iroq qilganda, so'raladigan yagona
   narsa shu fayl bo'ladi:
     %APPDATA%\XClinic\logs\main.log

   Jurnal `app.getPath` ishlaydigan bo'lgach ochiladi; undan oldingi
   yozuvlar buferda saqlanib turadi va fayl ochilishi bilan tushadi. */
let logStream: fs.WriteStream | null = null;
const logBuffer: string[] = [];

/* Jurnal MODUL YUKLANISHIDA ochiladi, `app.whenReady()` da emas.

   Sabab amalda ko'rindi: paketlangan nusxa ishga tushmay, Electron ning
   o'z «Error» oynasini ko'rsatardi. Bu oyna asosiy jarayonda modul
   yuklanayotganda istisno bo'lganini bildiradi — ya'ni `whenReady`
   umuman chaqirilmaydi va o'sha yerdagi jurnal hech qachon ochilmaydi.
   Aynan diagnostika kerak bo'lgan holat yozib olinmasdan qolardi.

   `app.getPath` bu bosqichda ishlamaydi, shuning uchun katalog `APPDATA`
   dan qo'lda yig'iladi — u jarayon boshlanishidayoq mavjud. */
function defaultUserData(): string {
    const roaming = process.env.APPDATA
        || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'AppData', 'Roaming');
    return path.join(roaming, 'XClinic');
}

function writeLog(level: string, args: unknown[]) {
    const line = `[${new Date().toISOString()}] ${level} ` +
        args.map(a => (a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    if (logStream) logStream.write(line + '\n');
    else logBuffer.push(line);
}

function openLog(userData: string) {
    try {
        const dir = path.join(userData, 'logs');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'main.log');

        /* Jurnal cheksiz o'smasin: 2 MB dan oshsa avvalgisi
           `main.prev.log` ga ko'chiriladi. Ikkitasi yetarli —
           muammo odatda oxirgi ishga tushirishda ko'rinadi. */
        try {
            if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
                fs.renameSync(file, path.join(dir, 'main.prev.log'));
            }
        } catch { /* aylantirib bo'lmasa ham yozishda davom etamiz */ }

        logStream = fs.createWriteStream(file, { flags: 'a' });
        logStream.write(`\n=== ${new Date().toISOString()} XClinic ishga tushdi ===\n`);
        for (const line of logBuffer) logStream.write(line + '\n');
        logBuffer.length = 0;
    } catch { /* jurnal ochilmasa dastur baribir ishlashi kerak */ }
}

/* `console` ni almashtiramiz — mavjud yuzlab `console.log` chaqiruvlari
   o'zgartirilmasdan faylga tushsin. */
const rawConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = (...a: unknown[]) => { rawConsole.log(...a); writeLog('INFO ', a); };
console.warn = (...a: unknown[]) => { rawConsole.warn(...a); writeLog('WARN ', a); };
console.error = (...a: unknown[]) => { rawConsole.error(...a); writeLog('ERROR', a); };

/* Ushlanmagan xatolik — aynan shu holat dasturni jimgina yopadi. */
process.on('uncaughtException', (e) => writeLog('FATAL', [e]));
process.on('unhandledRejection', (e) => writeLog('FATAL', ['unhandledRejection', e]));

openLog(defaultUserData());
console.log('main.js yuklandi');
const DEFAULT_BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;

// 3001 ni boshqa dastur egallab olgan bo'lishi mumkin (masalan boshqa proyektning
// dev-serveri). Bunda ilgari backend ko'tarilmay, foydalanuvchi 30 soniyadan keyin
// tushunarsiz "javob bermadi" xatosini ko'rardi. Endi bo'sh port tanlanadi va
// frontendga uzatiladi.
let BACKEND_PORT = DEFAULT_BACKEND_PORT;

function isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const net = require('net');
        const tester = net.createServer();
        tester.once('error', () => resolve(false));
        tester.once('listening', () => tester.close(() => resolve(true)));
        tester.listen(port, '0.0.0.0');
    });
}

async function pickBackendPort(): Promise<number> {
    for (let port = DEFAULT_BACKEND_PORT; port < DEFAULT_BACKEND_PORT + 20; port++) {
        if (await isPortFree(port)) {
            if (port !== DEFAULT_BACKEND_PORT) {
                console.log(`⚠️  ${DEFAULT_BACKEND_PORT}-port band, ${port} ishlatiladi`);
            }
            return port;
        }
    }
    return DEFAULT_BACKEND_PORT; // hammasi band bo'lsa — odatdagidek urinib ko'ramiz
}

// ─── Cloudflare Tunnel (public internet link) ────────────────────────────────
// The backend registers the tunnel on Cloudflare's side and writes the token to
// .env; the connector itself must be launched from here. The token is re-read
// periodically so a re-registered tunnel reconnects without user intervention.

function getCfExe(): string {
    return isDev
        ? path.join(__dirname, '../resources/cloudflared.exe')
        : path.join(process.resourcesPath, 'cloudflared.exe');
}

function readTunnelEnv(userData: string): { token: string; url: string } {
    const envPaths = [
        path.join(userData, '.env'),
        isDev
            ? path.join(__dirname, '../backend/.env')
            : path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', '.env'),
    ];
    let token = '';
    let url = '';
    for (const p of envPaths) {
        try {
            if (!fs.existsSync(p)) continue;
            const content = fs.readFileSync(p, 'utf8');
            const tokenMatch = content.match(/CLOUDFLARE_TUNNEL_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?/);
            const urlMatch = content.match(/CLOUDFLARE_TUNNEL_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
            if (urlMatch && urlMatch[1].trim() && !url) url = urlMatch[1].trim();
            if (tokenMatch && tokenMatch[1].trim()) {
                token = tokenMatch[1].trim();
                break;
            }
        } catch { /* keep trying other paths */ }
    }
    return { token, url };
}

function startQuickTunnel(userData: string, logStream: fs.WriteStream) {
    const cfExe = getCfExe();
    if (!fs.existsSync(cfExe)) return;

    const cfQuickPath = path.join(userData, 'cf-quick-tunnel.json');
    try { if (fs.existsSync(cfQuickPath)) fs.unlinkSync(cfQuickPath); } catch { }

    logStream.write('[CF-Quick] Starting Quick Tunnel...\n');
    cloudflaredQuickProcess = spawn(cfExe, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${BACKEND_PORT}`], {
        windowsHide: true,
        env: { ...process.env, USERPROFILE: userData, HOME: userData, TUNNEL_PROTOCOL: 'http2' }
    });

    const parseQuickTunnelUrl = (data: Buffer) => {
        const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
            try { fs.writeFileSync(cfQuickPath, JSON.stringify({ url: match[0] }, null, 2)); } catch { }
            logStream.write(`[CF-Quick] URL: ${match[0]}\n`);
        }
    };

    cloudflaredQuickProcess.stdout?.on('data', d => { logStream.write(d); parseQuickTunnelUrl(d); });
    cloudflaredQuickProcess.stderr?.on('data', d => { logStream.write(d); parseQuickTunnelUrl(d); });
    cloudflaredQuickProcess.on('exit', code => {
        logStream.write(`\n=== [CF-Quick] EXITED code ${code} at ${new Date().toISOString()} ===\n`);
        if (!isQuitting) setTimeout(() => startQuickTunnel(userData, logStream), 5000);
    });
}

function startNamedTunnel(userData: string, logStream: fs.WriteStream, token: string, tunnelUrl: string) {
    const cfExe = getCfExe();
    if (!fs.existsSync(cfExe)) return;

    currentTunnelToken = token;
    logStream.write(`[CF] Starting Named Tunnel (token ${token.substring(0, 12)}...)\n`);
    cloudflaredProcess = spawn(cfExe, ['tunnel', '--no-autoupdate', '--protocol', 'http2', 'run', '--token', token], {
        windowsHide: true,
        env: { ...process.env, USERPROFILE: userData, HOME: userData, TUNNEL_PROTOCOL: 'http2' }
    });

    if (tunnelUrl) {
        try { fs.writeFileSync(path.join(userData, 'cf-tunnel.json'), JSON.stringify({ url: tunnelUrl }, null, 2)); } catch { }
        setTimeout(() => { mainWindow?.setTitle(`XClinic  |  🌐 ${tunnelUrl}`); }, 3000);
    }

    cloudflaredProcess.stdout?.on('data', d => logStream.write(d));
    cloudflaredProcess.stderr?.on('data', d => logStream.write(d));
    cloudflaredProcess.on('exit', code => {
        logStream.write(`\n=== [CF-Named] EXITED code ${code} at ${new Date().toISOString()} ===\n`);
        cloudflaredProcess = null;
        if (!isQuitting) {
            setTimeout(() => {
                const { token: freshToken, url: freshUrl } = readTunnelEnv(userData);
                if (freshToken) startNamedTunnel(userData, logStream, freshToken, freshUrl);
            }, 5000);
        }
    });
}

function startCloudflared(userData: string) {
    const cfExe = getCfExe();
    if (!fs.existsSync(cfExe)) {
        console.error('[CF] cloudflared.exe topilmadi:', cfExe);
        return;
    }

    const logStream = fs.createWriteStream(path.join(userData, 'cloudflared.log'), { flags: 'a' });
    logStream.write(`\n=== ${new Date().toISOString()} START (cfExe=${cfExe}) ===\n`);

    /* MASOFAVIY KIRISH ENDI IXTIYORIY, sukut bo'yicha O'CHIQ.

       Ilgari bu yerda "Quick tunnel always runs as a fallback link" yozilgan
       edi va tunnel SHARTSIZ ko'tarilardi — ya'ni har bir o'rnatma o'zi
       bilmagan holda `trycloudflare.com` manzili orqali INTERNETGA ochiq
       bo'lardi. Standart `admin` / `admin` login bilan birga bu jiddiy
       teshik edi.

       Endi u `remote-access.json` bilan boshqariladi va yoqish uchun standart
       parol almashtirilgan bo'lishi shart (backend tekshiradi). */
    let remoteEnabled = false;
    try {
        const p = path.join(userData, 'remote-access.json');
        if (fs.existsSync(p)) remoteEnabled = JSON.parse(fs.readFileSync(p, 'utf8'))?.enabled === true;
    } catch { /* fayl buzuq bo'lsa — o'chiq deb hisoblaymiz */ }

    if (remoteEnabled) {
        startQuickTunnel(userData, logStream);
    } else {
        logStream.write('[CF-Quick] Masofaviy kirish o\'chirilgan — tunnel ko\'tarilmadi\n');
        // Eski manzil fayli qolib ketmasin: aks holda Sozlamalar "internetdan
        // ochiq" deb YOLG'ON ogohlantirish ko'rsatib turardi.
        for (const f of ['cf-quick-tunnel.json', 'cf-tunnel.json']) {
            try {
                const p = path.join(userData, f);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            } catch { /* ixtiyoriy */ }
        }
    }

    const { token, url } = readTunnelEnv(userData);
    if (token) startNamedTunnel(userData, logStream, token, url);

    // The backend may (re)register the tunnel after startup and write a NEW token
    // to .env — without this watcher the connector would keep serving a deleted
    // tunnel and the public link would die with Cloudflare error 1033.
    setInterval(() => {
        if (isQuitting) return;
        const fresh = readTunnelEnv(userData);
        if (fresh.token && fresh.token !== currentTunnelToken) {
            logStream.write(`[CF] Tunnel token changed — restarting Named Tunnel...\n`);
            if (cloudflaredProcess) {
                cloudflaredProcess.kill(); // exit handler re-reads .env and respawns
            } else {
                startNamedTunnel(userData, logStream, fresh.token, fresh.url);
            }
        }
    }, 30000);
}

async function startBackend() {
    console.log('🚀 Starting Backend...');

    // Portni spawn'dan oldin tanlaymiz — quyidagi PORT env, health-check,
    // tunnel va tarmoq manzili shu qiymatdan foydalanadi.
    BACKEND_PORT = await pickBackendPort();

    const backendDir = isDev
        ? path.join(__dirname, '../backend')
        : path.join(process.resourcesPath, 'app.asar.unpacked', 'backend');

    const serverPath = isDev
        ? path.join(backendDir, 'server.ts')
        : path.join(backendDir, 'dist-bundle/index.js');

    const { ELECTRON_RUN_AS_NODE: _removed, ...safeEnv } = process.env;
    const env = {
        ...safeEnv,
        ELECTRON_RUN: 'true',
        /* Aktivatsiya tekshiruvi FAQAT paketlangan nusxada yoqiladi —
           xaridor oladigan holat aynan shu. Ishlab chiqishda va
           sinovlarda u o'chiq, aks holda har o'zgarishdan keyin
           kalit kiritish kerak bo'lardi. */
        LICENSE_ENFORCE: isDev ? '0' : '1',
        ELECTRON_USER_DATA_PATH: app.getPath('userData'),
        PORT: BACKEND_PORT.toString(),
        // .env fayllari override:true bilan yuklanib PORT ni bekor qiladi — bu esa qilmaydi
        ELECTRON_BACKEND_PORT: BACKEND_PORT.toString(),
        ELECTRON_RUN_AS_NODE: '1',
        PRISMA_QUERY_ENGINE_LIBRARY: isDev
            ? path.join(backendDir, 'node_modules/.prisma/client/query_engine-windows.dll.node')
            : path.join(backendDir, 'dist-bundle/client/query_engine-windows.dll.node')
    };

    // --- DATABASE AUTO-INIT ---
    const userData = app.getPath('userData');
    const dbPath = path.join(userData, 'xclinic.db');

    /* --- ZAXIRADAN TIKLASH ---
       Backend bazani ochiq tutadi, shuning uchun faylni o'z ostidan
       almashtira olmaydi: `/api/admin/backup/restore` faqat BELGI qo'yadi.
       Almashtirish shu yerda, backend ishga tushishidan OLDIN bo'ladi.

       Almashtirishdan oldin joriy baza yonma-yon saqlanadi: noto'g'ri nusxa
       tanlangan bo'lsa, qaytish yo'li qolishi kerak. */
    applyPendingRestore(userData, dbPath);

    if (!isDev && !fs.existsSync(dbPath)) {
        console.log('📦 Initializing fresh database...');
        const starterDbPath = isDev
            ? path.join(backendDir, 'prisma/starter.db')
            : path.join(backendDir, 'dist-bundle/starter.db');
        if (fs.existsSync(starterDbPath)) {
            try {
                const finalDbDir = path.dirname(dbPath);
                if (!fs.existsSync(finalDbDir)) {
                    fs.mkdirSync(finalDbDir, { recursive: true });
                }
                fs.copyFileSync(starterDbPath, dbPath);
                console.log('✅ Starter database copied to AppData');
            } catch (err) {
                console.error('❌ Failed to copy starter database:', err);
                dialog.showErrorBox('Database Error', 'Ma\'lumotlar bazasini yaratib bo\'lmadi.');
            }
        } else {
            console.error('❌ Starter database NOT FOUND at:', starterDbPath);
        }
    }
    // --------------------------------

    try {
        if (isDev) {
            backendProcess = spawn('npm', ['run', 'dev'], {
                cwd: backendDir,
                env,
                shell: true
            });
        } else {
            if (!fs.existsSync(serverPath)) {
                dialog.showErrorBox('Xatolik', `Backend fayli topilmadi: ${serverPath}`);
                return false;
            }

            backendProcess = spawn(process.execPath, [serverPath], {
                cwd: backendDir,
                env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
                shell: false,
                windowsHide: true
            });
        }

        backendProcess?.stdout?.on('data', (data) => console.log(`[Backend]: ${data}`));
        backendProcess?.stderr?.on('data', (data) => {
            const msg = data.toString();
            console.error(`[Backend Error]: ${msg}`);
            backendErrorOutput += msg + '\n';
        });

        backendProcess?.on('error', (err) => {
            dialog.showErrorBox('Backend Spawn Error', err.message);
        });

    } catch (error: any) {
        dialog.showErrorBox('Startup Exception', error.message);
        return false;
    }

    // Wait for backend to be ready
    let attempts = 0;
    while (attempts < 30) {
        try {
            const isReady = await new Promise((resolve) => {
                const req = http.get(`http://localhost:${BACKEND_PORT}/health`, (res) => {
                    resolve(res.statusCode === 200);
                });
                req.on('error', () => resolve(false));
                req.setTimeout(500, () => {
                    req.destroy();
                    resolve(false);
                });
            });

            if (isReady) {
                console.log('✅ Backend is ready!');
                return true;
            }
        } catch (e) {
            // Ignore
        }

        if (backendProcess?.exitCode !== null && backendProcess?.exitCode !== undefined) {
             dialog.showErrorBox('Backend Crash', `Backend server kutilmaganda to'xtadi (Exit Code: ${backendProcess.exitCode}).\n\nError:\n${backendErrorOutput}`);
             return false;
        }

        attempts++;
        await new Promise(r => setTimeout(r, 1000));
    }

    dialog.showErrorBox('Timeout', `Backend server 30 soniya ichida javob bermadi.\n\nOxirgi xabarlar:\n${backendErrorOutput || 'Hech qanday xabar yo\'q'}`);
    return false;
}

// Wraps a raw PNG buffer into a single-image Windows .ico container (Vista+ PNG-in-ICO format).
// Avoids pulling in native image libs (sharp, etc.) just to swap the app/shortcut icon.
function pngBufferToIco(png: Buffer, width: number, height: number): Buffer {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(1, 4); // image count

    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // color palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // size of image data
    entry.writeUInt32LE(header.length + entry.length, 12); // offset to image data

    return Buffer.concat([header, entry, png]);
}

// Points the desktop & start-menu shortcuts' icon at the given .ico file (Windows only).
function updateShortcutIcons(iconPath: string): Promise<void> {
    return new Promise((resolve) => {
        const shortcutName = 'XClinic.lnk';
        const candidatePaths = [
            path.join(app.getPath('desktop'), shortcutName),
            path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', shortcutName),
            path.join('C:\\Users\\Public\\Desktop', shortcutName),
        ];

        const psQuotedPaths = candidatePaths.map(p => `'${p.replace(/'/g, "''")}'`).join(',');
        const psQuotedIcon = iconPath.replace(/'/g, "''");

        const script = [
            '$WshShell = New-Object -ComObject WScript.Shell',
            `$paths = @(${psQuotedPaths})`,
            'foreach ($p in $paths) {',
            '  if (Test-Path $p) {',
            '    try {',
            '      $sc = $WshShell.CreateShortcut($p)',
            `      $sc.IconLocation = '${psQuotedIcon}' + ',0'`,
            '      $sc.Save()',
            '    } catch {}',
            '  }',
            '}',
        ].join('\n');

        const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true });
        ps.on('close', () => resolve());
        ps.on('error', () => resolve());
    });
}

function getLocalIP(): string {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of (interfaces[name] || [])) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function createWindow() {
    const localIP = getLocalIP();
    const networkInfo = `Tarmoq: http://${localIP}:${BACKEND_PORT}`;

    const customIconPath = path.join(app.getPath('userData'), 'app-icon.ico');
    const hasCustomIcon = fs.existsSync(customIconPath);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: `XClinic  |  ${networkInfo}`,
        ...(hasCustomIcon ? { icon: customIconPath } : {}),
webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (isDev) {
        mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
        mainWindow.webContents.openDevTools();
    } else {
        /* BACKEND ORQALI YUKLANADI, `file://` DAN EMAS (S1.3).

           Sabab: sessiyani `httpOnly` cookie ushlab turadi, `file://` da esa
           cookie umuman ishlamaydi — Electron o'rnatmasi har ochilganda
           parol so'rab qolardi.

           Bu yangi infratuzilma talab qilmaydi: backend `dist/` ni
           allaqachon beradi (`express.static`, backend/server.ts) va SPA
           uchun catch-all marshruti bor. Oyna esa faqat `startBackend()`
           tayyor deganidan keyin ochiladi, ya'ni port albatta tinglayapti.

           Yon foyda: front va API bitta manbaga tushdi — `?port=` uzatish
           ham, CORS ham bu yerda keraksiz bo'ldi. */
        const appUrl = `http://localhost:${BACKEND_PORT}`;
        mainWindow.loadURL(appUrl).catch(err => {
            dialog.showErrorBox('UI Error', `Frontend yuklanmadi: ${appUrl}\n${err.message}`);
        });
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    console.log(`Ishga tushmoqda: isDev=${isDev}, resourcesPath=${process.resourcesPath}`);

    // IPC Handlers
    ipcMain.handle('select-backup-folder', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Backup uchun papka tanlang',
            buttonLabel: 'Papkani tanlash'
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

    ipcMain.handle('update-app-icon', async (_event, pngBuffer: Uint8Array) => {
        try {
            const icoBuffer = pngBufferToIco(Buffer.from(pngBuffer), 256, 256);
            const iconPath = path.join(app.getPath('userData'), 'app-icon.ico');
            fs.writeFileSync(iconPath, icoBuffer);

            if (mainWindow) {
                mainWindow.setIcon(iconPath);
            }

            if (process.platform === 'win32') {
                await updateShortcutIcons(iconPath);
            }

            return { success: true };
        } catch (err: any) {
            console.error('Failed to update app icon:', err);
            return { success: false, error: err.message };
        }
    });

    let backendReady = false;
    try {
        backendReady = await startBackend();
    } catch (e: any) {
        console.error('Backend ishga tushmadi:', e);
    }

    if (backendReady) {
        createWindow();
        startCloudflared(app.getPath('userData'));
    } else {
        /* Ilgari bu yerda jimgina `app.quit()` turardi: dastur ochilmay
           yopilar, foydalanuvchi esa hech narsa ko'rmasdi. Endi sabab
           aytiladi va jurnal fayli ko'rsatiladi. */
        const logPath = path.join(app.getPath('userData'), 'logs', 'main.log');
        dialog.showErrorBox(
            'XClinic ishga tushmadi',
            'Dastur serveri ko\'tarilmadi.\n\n' +
            (backendErrorOutput ? backendErrorOutput.slice(-1500) + '\n\n' : '') +
            'Batafsil ma\'lumot:\n' + logPath,
        );
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('quit', () => {
    isQuitting = true;
    if (backendProcess) {
        backendProcess.kill();
    }
    if (cloudflaredProcess) {
        cloudflaredProcess.kill();
    }
    if (cloudflaredQuickProcess) {
        cloudflaredQuickProcess.kill();
    }
});
