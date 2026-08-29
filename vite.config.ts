import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/* XClinic offline rejimda ishlaydi, shuning uchun `base: './'`.
 *
 * PWA — QAYTA YOQILDI (S5.4), lekin ehtiyot bilan.
 *
 * Bu yerda ilgari shunday yozilgan edi: «PWA/service-worker olib tashlangan —
 * desktop ilova uchun keraksiz va offline bazani eskirgan kesh bilan
 * chalkashtiradi». Xavf HAQIQIY va u saqlanadi — lekin uning manbai aniq:
 * API javoblarini keshlash. Statik fayllar (JS/CSS/ikonka) esa mazmun
 * xeshi bilan nomlanadi, ya'ni ular eskirmaydi: yangi build — yangi nom.
 *
 * Shuning uchun sozlama qat'iy: `/api/` va `/uploads/` keshga UMUMAN
 * tushmaydi (`navigateFallbackDenylist` + `globPatterns` faqat statik),
 * `registerType: 'autoUpdate'` esa yangi versiyani darhol o'rnatadi.
 *
 * Nima uchun umuman kerak: klinikada planshet va telefon shu serverga
 * tarmoq orqali ulanadi (`/api/network-info`, cloudflared tunnel). Ular
 * uchun o'rnatiladigan ilova va registratura uchun offline talon berish
 * kerak. `InstallPWAButton` va `usePWAInstall` allaqachon yozilgan edi —
 * ular manifest va service worker yo'qligi uchun ishlamasdi (audit B-17). */
export default defineConfig(() => {
  /* Backend porti muhit o'zgaruvchisi bilan almashtirilishi mumkin.

     Kerak bo'ladigan joyi: tiklashni sinash va boshqa mashqlar uchun NUSXA
     baza ustida ikkinchi stend ko'tariladi (masalan 3021), unga qaragan
     frontend esa boshqa portda turadi. `VITE_API_URL` bilan to'g'ridan-to'g'ri
     ulanish CORS ga tiralardi; proksi orqali so'rov bir manzilda qoladi. */
  const backendPort = Number(process.env.VITE_BACKEND_PORT) || 3001;

  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
      /* Kuzatuvdan CHIQARILADIGAN papkalar.

         Muammo: dev server butun loyiha ildizini kuzatadi, ildiz ichida esa
         `backend/prisma/xclinic.db` yotadi. SQLite WAL rejimida ishlaydi va
         `.db-wal` fayli HAR YOZUVDA o'zgaradi, vaqti-vaqti bilan o'chib
         qayta yaratiladi. Kuzatuvchi buni "fayl qo'shildi/o'chdi" deb
         hisoblaydi va sahifani qayta yuklaydi — foydalanuvchi uchun bu
         "ekran o'zidan o'zi yangilanaverdi" bo'lib ko'rinadi. Ma'lumot
         kiritilayotgan paytda esa ayniqsa tez-tez.

         Frontend `backend/` dan hech narsa import qilmaydi (tekshirilgan),
         `dist/` esa qurilma natijasi — ikkalasini ham kuzatish shart emas. */
      watch: {
        ignored: [
          '**/backend/**',
          '**/dist/**',
          '**/dist-electron/**',
          '**/electron-main/**',
          '**/*.db',
          '**/*.db-*',
        ],
      },
      proxy: {
        '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true },
        '/uploads': { target: `http://localhost:${backendPort}`, changeOrigin: true },
        '/health': { target: `http://localhost:${backendPort}`, changeOrigin: true },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // Yangi build — yangi service worker, darhol. Foydalanuvchidan
        // so'ramaymiz: klinikada «yangilash kerak» oynasi bosilmay qoladi.
        registerType: 'autoUpdate',
        /* Avtomatik ro'yxatga olish O'CHIRILDI — ro'yxatga olish
           `index.tsx` da, ELECTRON TEKSHIRUVI bilan. Sabab: dastlabki
           qaror aynan desktop ilova haqida edi, va u kuchida qoladi —
           Electron'da service worker umuman bo'lmaydi. Brauzer va
           planshet uchun esa u yoqiladi. */
        injectRegister: null,
        includeAssets: ['logo.svg', 'logo-icon.png'],
        manifest: {
          name: 'XClinic — klinika boshqaruvi',
          short_name: 'XClinic',
          description: "Ko'p profilli klinika uchun boshqaruv tizimi",
          lang: 'uz',
          dir: 'ltr',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'any',
          background_color: '#f9fafb',
          theme_color: '#2563eb',
          icons: [
            { src: './logo-icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: './logo-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: './logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          /* FAQAT STATIK FAYLLAR. Ular mazmun xeshi bilan nomlanadi,
             ya'ni eskirgan nusxa qaytarilishi mumkin emas. */
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          /* API va yuklangan fayllar keshdan UMUMAN o'tmaydi — aynan shu
             yuqoridagi izohda ogohlantirilgan xavf edi. */
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/health$/],
          runtimeCaching: [],
          // 5 MB — bundle hozir ~2 MB, zaxira bilan
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          // Dev serverda service worker YO'Q: u issiq qayta yuklashni buzadi
          enabled: false,
        },
      }),
    ],
    // DIQQAT: AI/SMS kalitlarini bu yerga QO'YMANG — `define` qiymatlari frontend
    // bundle'ga ochiq yoziladi. Barcha tashqi so'rovlar backend orqali o'tadi.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
