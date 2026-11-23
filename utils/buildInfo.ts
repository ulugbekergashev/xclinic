/* Dastur qachon yig'ilgani — ekranda ko'rinadigan belgi.

   Versiya raqami hamma yig'ishda bir xil (0.1.0). Klinika yangi
   o'rnatuvchini qo'ygach «hech narsa o'zgarmadi» dedi va tekshirishning
   iloji yo'q edi: eski dasturmi, yangisimi — ekranda farq yo'q. Endi sana
   kirish sahifasida va (kompyuter dasturida) oyna sarlavhasida turadi.

   Qiymatni `vite.config.ts` yig'ish paytida qo'yadi. */
declare const __BUILD_STAMP__: string | undefined;

export const BUILD_STAMP: string =
    typeof __BUILD_STAMP__ === 'string' && __BUILD_STAMP__ ? __BUILD_STAMP__ : '';
