import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// XClinic offline rejimda ishlaydi: bundle Electron ichidan file:// orqali ochiladi,
// shuning uchun base './' bo'lishi shart. PWA/service-worker olib tashlangan —
// desktop ilova uchun keraksiz va offline bazani eskirgan kesh bilan chalkashtiradi.
export default defineConfig(() => {
  const backendPort = 3001;

  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true },
        '/uploads': { target: `http://localhost:${backendPort}`, changeOrigin: true },
        '/health': { target: `http://localhost:${backendPort}`, changeOrigin: true },
      },
    },
    plugins: [react(), tailwindcss()],
    // DIQQAT: AI/SMS kalitlarini bu yerga QO'YMANG — `define` qiymatlari frontend
    // bundle'ga ochiq yoziladi. Barcha tashqi so'rovlar backend orqali o'tadi.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
