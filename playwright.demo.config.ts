/* Namoyish (Vercel) nusxasi uchun sinov sozlamasi.
 *
 * Asosiy `playwright.config.ts` dan AJRATILGAN, chunki ikkalasi boshqa
 * dunyoni sinaydi: u yerda backend va baza bor, bu yerda esa faqat
 * brauzer. Bitta konfiguratsiyada ikkala serverni ko'tarib bo'lmaydi va
 * `testDir` ham har xil bo'lishi kerak — aks holda demo sinovlari
 * backendli yurishga tushib, kirish sahifasida qotib qolardi.
 *
 * Ishga tushirish:  npm run test:e2e:demo
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.DEMO_E2E_PORT || 4180);

export default defineConfig({
    testDir: './e2e-demo',
    /* Sinovlar bitta brauzer holatini emas, bitta `localStorage` ni baham
       ko'radi — demo ma'lumoti o'sha yerda yashaydi. Parallel yurish
       bir-birining qoldig'ini buzadi. */
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: [['list']],

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        viewport: { width: 1440, height: 900 },
        locale: 'uz-UZ',
        timezoneId: 'Asia/Tashkent',
    },

    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

    webServer: {
        command: 'node e2e-demo/server.mjs',
        url: `http://localhost:${PORT}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
