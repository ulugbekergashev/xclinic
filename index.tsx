import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { reloadOnServiceWorkerUpdate } from './utils/lazyWithReload';

/* HashRouter — chuqur havolalar va sahifa yangilanishi uchun. Electron
   ilgari `file://` dan ochilardi va u yerda BrowserRouter «file not found»
   berardi; endi u `http://localhost` dan yuklanadi (S1.3), lekin
   HashRouter saqlanadi — mavjud havolalar va zakladkalar buzilmasin. */

/* ─── SERVICE WORKER (S5.4, audit B-17) ─────────────────────────────────────

   `InstallPWAButton` va `usePWAInstall` allaqachon yozilgan edi, lekin
   manifest ham, service worker ham yo'q edi — tugma hech narsa qilmasdi.

   ELECTRON'DA RO'YXATGA OLINMAYDI. Bu yerda ilgari yozilgan qaror kuchida
   qoladi: «desktop ilovada u faqat eskirgan kesh muammosini keltiradi».
   Endi Electron ham `http://localhost` dan yuklanadi, ya'ni SW o'z-o'zidan
   ro'yxatga olinib qolishi mumkin edi — shuning uchun tekshiruv aniq.

   Brauzer va planshet uchun esa u kerak: klinikada ular shu serverga
   tarmoq orqali ulanadi va registratura offline talon bera olishi kerak. */
const isElectron = /electron/i.test(navigator.userAgent);

if (!isElectron && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // `./sw.js` — `base: './'` bilan mos
        navigator.serviceWorker.register('./sw.js').catch((e) => {
            // Ro'yxatga olinmasa ilova baribir ishlaydi — faqat o'rnatib bo'lmaydi
            console.warn("Service worker ro'yxatga olinmadi:", e?.message || e);
        });
        /* Yangi versiya nazoratni olganda sahifa bir marta yangilanadi.
           Busiz ochiq turgan eski sahifa yangi bo'lak nomlarini bilmaydi
           va «Failed to fetch dynamically imported module» beradi. */
        reloadOnServiceWorkerUpdate();
    });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
