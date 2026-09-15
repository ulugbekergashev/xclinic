# Doimiy manzil — domen ulash

Maqsad: har klinika o'zgarmaydigan manzil olsin — `https://k-a3f9c2b1d0.getxclinic.com`.
Hozirgi Quick Tunnel manzili (`xxx.trycloudflare.com`) dastur qayta ishga
tushganda o'zgaradi.

**Kod, registrator va Vercel sozlamasi tayyor.** Sizdan faqat to'lov va bitta
token kerak.

---

## Siz qiladigan ishlar — 3 ta, ~10 daqiqa

### 1. Yangi Cloudflare akkaunt

<https://dash.cloudflare.com/sign-up> — **yangi email bilan**, denta akkauntida emas.

Nega: tunnel yaratish huquqi Cloudflare'da **butun akkauntga** beriladi.
XClinic tokeni denta akkauntida bo'lsa, u denta klinikalarining tunnellarini
ham o'chira oladi. Alohida akkaunt bepul va ikkala mahsulotni butunlay ajratadi.

### 2. Domenni sotib oling — to'lov

**Domain Registration → Register Domains** → `getxclinic.com` → karta bilan to'lang.

Tekshirilgan (2026-09-15):

| Domen | Holat |
|---|---|
| **getxclinic.com** | bo'sh — tavsiya |
| myxclinic.com, xclinic.pro | bo'sh |
| xclinic.io | bo'sh, sezilarli qimmat |
| xclinic.com / .app / .net | band |

Boshqa domen olsangiz — nomini ayting, bitta sozlamani o'zgartiraman.
Cloudflare'da sotib olingan domen **o'zi ulanadi**, nameserver shart emas.

### 3. Bitta token yarating va menga yuboring

O'ng yuqorida profil → **My Profile → API Tokens → Create Token →
Create Custom Token**:

| Maydon | Qiymat |
|---|---|
| Token name | `xclinic-tunnel-registrar` |
| Permissions | `Account` · `Cloudflare Tunnel` · `Edit` |
| | `Zone` · `DNS` · `Edit` |
| | `Zone` · `Zone` · `Read` |
| Account Resources | `Include` · o'z akkauntingiz |
| Zone Resources | `Include` · `Specific zone` · `getxclinic.com` |

**Continue to summary → Create Token** → tokenni ko'chirib menga yuboring.

`Zone · Read` — Account ID va Zone ID ni o'zim topishim uchun. Ularni
panelda qidirib ko'chirishingiz shart emas.

---

## Keyin men qiladigan ishlar

1. Token orqali Account ID va Zone ID ni topaman
2. `xclinic-registrar` Vercel loyihasiga uchta sozlama yozaman va qayta joylayman
3. Registratorni sinab ko'raman: begona kalit — `403`, to'g'ri kalit — manzil
4. Doimiy tunnelni haqiqiy klinika o'rnatmasida tekshiraman
5. Yangi `.exe` yig'aman

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

- Domen ulanmaguncha klinikalar **Quick Tunnel** bilan ishlayveradi —
  registrator `503` qaytaradi va bu xato emas.
- Masofaviy kirish o'chiq bo'lsa, doimiy tunnel ham **ko'tarilmaydi**.
- Standart parol turganda yoqish baribir rad etiladi.

## Ma'lum cheklov

Registrator litsenziya kalitini tekshiradi, lekin litsenziya siri
(`SECRET_SALT`) dastur ichida turibdi — o'rnatuvchini ochib olgan odam kalit
yasay oladi. Bu registratordan kattaroq muammo (dasturni litsenziyasiz
ishlatish) va alohida hal qilinishi kerak.
