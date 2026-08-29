# shared — ikkala tomon o'qiydigan kod

Bu yerda front va backend **birgalikda** ishlatadigan qoidalar yotadi.
Hozircha bitta fayl: `validation.ts`.

## Nima uchun `package.json` bor

Ildizdagi `package.json` da `"type": "module"` turibdi, ya'ni undan pastdagi
har qanday `.ts` fayl ES-modul deb hisoblanadi. Backend esa CommonJS
(`ts-node`, `module: commonjs`) — u shunday faylni `require` qila olmaydi:

    ERR_REQUIRE_ESM: Must use import to load ES Module: shared/validation.ts

Shu yerdagi `"type": "commonjs"` eng yaqin ota-`package.json` bo'lib qoladi va
qoidani shu papka uchun bekor qiladi. Front tomonga ta'siri yo'q: Vite `.ts`
ni o'zi kompilyatsiya qiladi va bu maydonga qaramaydi.

## Qoidalar

1. **Bog'liqliksiz.** Bu yerdagi kod hech qanday paketni import qilmasin —
   u brauzerda ham, Node'da ham, `ncc` bundle'ida ham ishlashi kerak.
2. **Brauzer yoki Node API'siga tegmasin.** `window`, `fs`, `process` — yo'q.
3. **Faqat qoida.** Ma'lumot o'qish, tarmoq, baza — bu yerda emas.

## Qayerdan chaqiriladi

- Backend: `import { ... } from '../shared/validation'`
  (`backend/tsconfig.json` da `rootDir: ".."` va `include` ga qo'shilgan)
- Front: `import { ... } from '../shared/validation'`
  (ildizdagi `tsconfig.json` da `include` ga qo'shilgan)

Relizga ta'siri yo'q: production backend `dist-bundle/index.js` dan yuriladi
(`npm run bundle`, ncc) — u import grafigini kuzatib, bu faylni ichiga
qo'shib yuboradi.
