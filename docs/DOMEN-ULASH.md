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

## Ma'lum cheklov

Registrator litsenziya kalitini tekshiradi, lekin litsenziya siri
(`SECRET_SALT`) dastur ichida turibdi — o'rnatuvchini ochib olgan odam kalit
yasay oladi. Bu registratordan kattaroq muammo (dasturni litsenziyasiz
ishlatish) va alohida hal qilinishi kerak.
