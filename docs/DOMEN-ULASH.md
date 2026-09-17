# Doimiy manzil — domen ulash

Har klinika o'zgarmaydigan manzil oladi — `https://k-a3f9c2b1d0.xclinic.org`.
Quick Tunnel manzili (`xxx.trycloudflare.com`) dastur qayta ishga tushganda
o'zgarardi; doimiy manzil o'zgarmaydi.

**Holat: ishlayapti (2026-09-16).** Sozlash tugagan, quyidagilar shunchaki
tarix uchun yozilgan.

---

## Nima qilingan

| Nima | Qiymat |
|---|---|
| Cloudflare akkaunti | denta'dan **alohida**, yangi email (`...workakkaunt@gmail.com`) |
| Domen | **xclinic.org** — Cloudflare Registrar'da sotib olingan, zona `active` |
| Zona | `5b669ff7e7982d4664439efbb174c9bf` |
| Token | `XClinic tunnel registrar`, akkaunt tokeni, muddatsiz |
| Token huquqlari | 1-siyosat: butun akkaunt → `Cloudflare Tunnel Write` |
| | 2-siyosat: `All Domains` → `DNS Write`, `Zone Read` |
| Sozlamalar | Vercel `xclinic-registrar` → `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_TUNNEL_DOMAIN`, `XCLINIC_LICENSE_SALT` |

Nega alohida akkaunt: tunnel yaratish huquqi Cloudflare'da **butun akkauntga**
beriladi. XClinic tokeni denta akkauntida bo'lsa, u denta tunnellarini ham
o'chira olardi.

Cloudflare'ning yangi panelida token huquqlari «siyosat» (policy) ko'rinishida
beriladi: akkaunt darajasidagi va domen darajasidagi huquqlar **alohida
siyosat** bo'lishi kerak. Domen siyosatida `All Domains` tanlansa, keyin
qo'shiladigan domenlar ham avtomatik qamrab olinadi. `Cloudflare Tunnel`
qidiruvda **`Argo Tunnel (Legacy)`** nomi bilan chiqadi — xulosada u
`Cloudflare Tunnel Write` deb ko'rsatiladi.

## Tekshirildi

| Sinov | Natija |
|---|---|
| Soxta litsenziya kaliti | `403 LICENSE_INVALID` |
| Format buzilgan machineId | `400 BAD_MACHINE` |
| Haqiqiy kalit | `200`, `https://k-57b1273c46.xclinic.org` + tunnel tokeni |
| Cloudflare'da DNS | `CNAME k-57b1273c46.xclinic.org → <tunnel>.cfargotunnel.com`, proxied |
| Cloudflare'da tunnel | `xclinic-k-57b1273c46` — klinika ulanmaguncha `inactive` |

## Domen almashtirilsa

Bitta sozlama: `CLOUDFLARE_TUNNEL_DOMAIN` (va yangi zona uchun
`CLOUDFLARE_ZONE_ID`) Vercel'da yangilanadi, so'ng
`node scripts/deploy-registrar.mjs`. Kodda domen yozilmagan.

---

## Qanday ishlaydi

```
Klinika dasturi ──(machineId + litsenziya kaliti)──► xclinic-registrar.vercel.app
                                                       │  (Cloudflare tokeni FAQAT shu yerda)
                                                       ▼
                                                  Cloudflare: tunnel + DNS
                                                       │
Klinika dasturi ◄──(manzil + FAQAT o'z tunnel tokeni)──┘
```

**Nega token klinikada emas.** Eski kod Cloudflare tokenini har klinikaning
kompyuteriga qo'yishni kutardi. Unda istalgan klinika kompyuteridan tokenni
olib, boshqa hamma klinikalarning tunnelini o'chirish mumkin bo'lardi —
dentalocal dagi xatoning aynan o'zi.

**Nega alohida Vercel loyihasi.** Registratorning sozlamalarida Cloudflare
tokeni turadi. Demo sayt (`xclinic-alpha`) har push'da qayta quriladi va
unda registratorning ikkinchi, sozlanmagan nusxasi chalkashtirardi — shuning
uchun `api/` u yerdan `.vercelignore` bilan chiqarilgan.

| Nima | Qayerda |
|---|---|
| Registrator kodi | `api/tunnel-register.ts` (yagona manba) |
| Joylashuv | `https://xclinic-registrar.vercel.app` — Vercel `gippokamp` akkaunti |
| Qayta joylash | `node scripts/deploy-registrar.mjs` |
| Klinika tomoni | `backend/tunnelClient.ts` |

---

## Nima o'zgarmaydi

- Doimiy manzil bilan BIRGA **zaxira manzil** (Quick Tunnel,
  `trycloudflare.com`) ham ishlaydi — domen, akkaunt yoki registrator
  ishlamay qolsa klinika tashqaridan yopilib qolmasin. Zaxira manzil
  o'zgarganda egasining Telegramiga yuboriladi.
- Registrator javob bermasa (`503` yoki tarmoq xatosi) — zaxira manzil
  yagona manzil bo'lib qoladi, bu xato emas.
- Masofaviy kirish o'chiq bo'lsa, ikkala tunnel ham **ko'tarilmaydi**, yoqilgan
  paytda o'chirilsa — 30 soniya ichida yopiladi.
- Standart parol turganda yoqish baribir rad etiladi.

## O'rnatma kaliti (2026-09-17)

Litsenziya siri (`SECRET_SALT`) dastur ichida turibdi — o'rnatuvchini ochib
olgan odam istalgan `machineId` uchun kalit yasay oladi. Ilgari registrator
faqat shu kalitga ishonardi, ya'ni boshqa klinikaning `machineId` sini bilgan
odam uning tunnel tokenini olib, `k-….xclinic.org` ga o'z serverini ulay
olardi.

Endi har o'rnatma o'zida tasodifiy kalit saqlaydi (bazada, `PlatformSetting`
→ `tunnel_install_secret`) va registratorga yuboradi. Birinchi so'rovda
registrator kalitning **xeshini** Cloudflare DNS ga TXT yozuvi qilib qo'yadi:
`_xca.k-….xclinic.org`. Shundan keyin manzil faqat shu kalit bilan beriladi.

Qo'shimcha: `GET /api/license/status` to'liq `machineId` ni endi faqat
faollashtirilmagan nusxada qaytaradi.

**Joylash tartibi.** Avval registrator (`node scripts/deploy-registrar.mjs`),
keyin klinikalarga yangi o'rnatuvchi. Yangi registrator eski dasturni ham
qabul qiladi (kalitsiz so'rov, TXT yozuvi hali yo'q bo'lsa). Yangilangan
klinika birinchi marta ulanganda kalit bog'lanadi.

**Klinika kalitini yo'qotsa** (Windows qayta o'rnatildi va baza zaxiradan
tiklanmadi): jurnalda `INSTALL_MISMATCH`, klinika vaqtinchalik manzil bilan
ishlayveradi. Tiklash — Cloudflare → `xclinic.org` → DNS da
`_xca.k-….xclinic.org` TXT yozuvini o'chirish. Keyingi urinishda (1 daqiqa
ichida) yangi kalit bog'lanadi va doimiy manzil qaytadi.

## Ma'lum cheklov

Litsenziya siri hamon dastur ichida: o'rnatuvchini ochib olgan odam dasturni
**litsenziyasiz ishlata oladi**. Endi u boshqa klinikaning manzilini
ololmaydi, lekin nusxa ko'chirishdan himoya shu darajada qoladi. To'liq
yechim — kalitni sotuvchining yopiq kaliti bilan imzolash; 2026-09-17 da
ortiqcha ish deb qoldirildi.

Hali yangilanmagan klinika manzili, u birinchi marta yangi dastur bilan
ulanmaguncha, eski himoyada qoladi.
