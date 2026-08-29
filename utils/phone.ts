/* Telefon bilan ishlash — mantiq `shared/validation.ts` da (S3.1).
 *
 * ILGARI QANDAY EDI. Shu faylda `normalizeUzPhone` ning to'liq nusxasi
 * turardi va sarlavhasida ochiq yozib qo'yilgandi:
 *
 *     "⚠️ MUHIM: bu mantiq `backend/smsService.ts` dagi `normalizeUzPhone`
 *      bilan bir xil bo'lishi shart. Backend alohida tsconfig/outDir bilan
 *      build bo'lgani uchun umumiy fayl import qilib bo'lmaydi — biri
 *      o'zgarsa, ikkinchisi ham o'zgartirilsin. Aks holda UI '26 ta bemor'
 *      deb ko'rsatib, backend ularning bir qismini rad etadi."
 *
 * To'siq yechildi: `shared/` papkasida o'z `package.json` i bor
 * (`type: commonjs`) va backend `tsconfig` da `rootDir: ".."` — ya'ni
 * ikkala tomon ham bitta fayldan o'qiy oladi. Nusxa yo'q, ajralib ketish
 * ham yo'q.
 *
 * Bu fayl re-eksport bo'lib qoldi: uni import qiladigan joylar buzilmasin.
 */
export { normalizeUzPhone, isSendablePhone, formatUzPhone, validatePhone } from '../shared/validation';
