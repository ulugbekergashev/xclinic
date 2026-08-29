/* Brauzer darajasidagi E2E (S3.8, T11).
 *
 * NIMA UCHUN API SINOVLARIDAN TASHQARI. `backend/tests/api/` HTTP orqali
 * server mantiqini tekshiradi — 288 ta sinov. Ular ushlay olmaydigan
 * narsalar bor: tugma bosiladimi, forma nima ko'rsatadi, ekranda kerakli
 * matn chiqadimi. Aynan shu qatlamda auditning yarmi topilgan edi
 * («Band qilish hech qanday reaksiya bermaydi», «MKB-10 qidiruvi bo'sh»).
 *
 * BAZA — NUSXA. `e2e/server.ts` ishlab turgan bazadan `VACUUM INTO` bilan
 * nusxa oladi va serverni bo'sh portda ko'taradi. Sinovlar bemor va qabul
 * yaratadi; ular dev bazada qolmasligi kerak — API sinovlaridagi bilan
 * bir xil qoida.
 *
 * Ishga tushirish:  npm run test:e2e
 *                   npm run test:e2e -- --headed   (brauzerni ko'rish)
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 3077);

export default defineConfig({
    testDir: './e2e',
    /* Sinovlar bitta bazani baham ko'radi — parallel yuritish bir-birining
       ma'lumotini buzadi (masalan «bitta bemorda bitta ochiq qabul»
       qoidasi). Ketma-ket. */
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI ? 'list' : [['list']],

    use: {
        baseURL: `http://localhost:${PORT}`,
        /* Xato bo'lganda sabab ko'rinsin — «yiqildi» degan qatorning o'zi
           hech narsa aytmaydi. */
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        /* 1440×900 — klinikadagi odatiy monitor. Playwright standarti
           1280×720 bo'lib, unda nav paneli boshqacha joylashadi. */
        viewport: { width: 1440, height: 900 },
        locale: 'uz-UZ',
        timezoneId: 'Asia/Tashkent',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],

    /* Server sinovlardan OLDIN ko'tariladi va oxirida o'chadi.
       `reuseExistingServer` dev'da qulay: qayta ishga tushirishni
       kutmaysiz. CI da esa har doim toza server. */
    webServer: {
        command: `node e2e/server.mjs`,
        url: `http://localhost:${PORT}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
