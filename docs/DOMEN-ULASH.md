# Doimiy manzil — domen ulash

Maqsad: har klinika o'zgarmaydigan manzil olsin — `https://k-a3f9c2b1d0.getxclinic.com`.
Hozirgi Quick Tunnel manzili (`xxx.trycloudflare.com`) dastur qayta ishga
tushganda o'zgaradi.

Kod tayyor. Quyidagi qadamlarning **faqat 1–3 tasi sizdan**, qolganini men
bajaraman.

---

## Qanday ishlaydi

```
Klinika dasturi ──(machineId + litsenziya kaliti)──► Vercel registratori
                                                       │  (Cloudflare tokeni FAQAT shu yerda)
                                                       ▼
                                                  Cloudflare: tunnel + DNS
                                                       │
Klinika dasturi ◄──(manzil + FAQAT o'z tunnel tokeni)──┘
```

**Nega token klinikada emas.** Eski kod Cloudflare tokenini har klinikaning
kompyuteriga qo'yishni kutardi. Unda istalgan klinika kompyuteridan tokenni
olib, boshqa hamma klinikalarning tunnelini o'chirish mumkin bo'lardi —
dentalocal dagi xatoning aynan o'zi. Endi klinika faqat o'z tunnelini ishga
tushiradigan tokenni oladi.

---

## 1. Alohida Cloudflare akkaunt oching — MUHIM

<https://dash.cloudflare.com/sign-up> — yangi email bilan.

**Nega denta akkauntida emas.** Tunnel yaratish huquqi Cloudflare'da
**akkaunt darajasida** beriladi. XClinic tokeni denta akkauntida bo'lsa, u
denta klinikalarining tunnellarini ham o'chira oladi. Alohida akkaunt bepul
va ikkala mahsulotni butunlay ajratadi.

## 2. Domenni sotib oling

Cloudflare panelida: **Domain Registration → Register Domains**.

Tekshirilgan bo'sh variantlar (2026-09-15):

| Domen | Holat | Izoh |
|---|---|---|
| **getxclinic.com** | bo'sh | tavsiya — `.com` eng arzon va tanish |
| myxclinic.com | bo'sh | |
| xclinic.pro | bo'sh | |
| xclinic.io | bo'sh | sezilarli qimmatroq |
| xclinic.com / .app / .net | **band** | |

Karta bilan to'lang. Cloudflare Registrar'da sotib olingan domen **avtomatik
ulanadi** — nameserver almashtirish shart emas.

## 3. Uchta qiymatni oling

**a) Account ID va Zone ID.** Domen sahifasi → **Overview** → o'ng ustunning
pastida, **API** bo'limida. Ikkalasini ham ko'chiring.

**b) API token.** O'ng yuqorida profil → **My Profile → API Tokens → Create
Token → Create Custom Token**:

| Maydon | Qiymat |
|---|---|
| Token name | `xclinic-tunnel-registrar` |
| Permissions | `Account` · `Cloudflare Tunnel` · `Edit` |
| | `Zone` · `DNS` · `Edit` |
| Account Resources | `Include` · o'z akkauntingiz |
| Zone Resources | `Include` · `Specific zone` · `getxclinic.com` |

**Continue to summary → Create Token.** Token **bir marta** ko'rsatiladi —
darhol ko'chiring.

---

## 4. Vercel'ga yozish

Registrator `xclinic-alpha.vercel.app` loyihasida ishlaydi. Unga beshta
o'zgaruvchi kerak:

```
CLOUDFLARE_API_TOKEN      (3-qadamdan)
CLOUDFLARE_ACCOUNT_ID     (3-qadamdan)
CLOUDFLARE_ZONE_ID        (3-qadamdan)
CLOUDFLARE_TUNNEL_DOMAIN  getxclinic.com
XCLINIC_LICENSE_SALT      backend/licenseService.ts dagi SECRET_SALT
```

**Diqqat — akkaunt.** Bu kompyuterdagi Vercel CLI `gippokamp` akkauntiga
kirgan, XClinic loyihasi esa u yerda **yo'q** (2026-09-15 da tekshirildi).
Shuning uchun ikki yo'l bor:

- **A (tavsiya):** Vercel panelida o'zingiz qo'shing — XClinic loyihasi
  turgan akkauntga kiring → **Project → Settings → Environment Variables**
  → beshtasini **Production** uchun qo'shing → **Deployments → Redeploy**.
  Oxirgi ikkitasining qiymatini men beraman.
- **B:** CLI ni to'g'ri akkauntga kiriting (`vercel login`), keyin menga
  ayting — `vercel link` va beshta `vercel env add` ni o'zim bajaraman.

Tokenni chatga yozish shart emas: A yo'lida u faqat Vercel panelida qoladi.

## 5. Tekshirish

Registrator sozlanganini tekshirish (javob `403` bo'lishi kerak — sozlanmagan
bo'lsa `503`):

```bash
curl -s -X POST https://xclinic-alpha.vercel.app/api/tunnel-register \
  -H "Content-Type: application/json" \
  -d '{"machineId":"HWID-TEST000000","licenseKey":"000000000000000000000000","port":3001}'
```

Klinikada: **Sozlamalar → Tarmoq va kirish → Internet orqali → Yoqish**.
Bir daqiqa ichida manzil `k-….getxclinic.com` ga almashadi va sariq
«vaqtinchalik manzil» ogohlantirishi yo'qoladi.

---

## Nima o'zgarmaydi

- Domen ulanmaguncha klinikalar **Quick Tunnel** bilan ishlayveradi — hech
  narsa buzilmaydi.
- Masofaviy kirish o'chiq bo'lsa, doimiy tunnel ham **ko'tarilmaydi**.
- Standart parol turganda yoqish baribir rad etiladi.

## Ma'lum cheklov

Registrator litsenziya kalitini tekshiradi, lekin litsenziya siri
(`SECRET_SALT`) dastur ichida turibdi — o'rnatuvchini ochib olgan odam kalit
yasay oladi. Bu registratordan kattaroq muammo (dasturni litsenziyasiz
ishlatish) va alohida hal qilinishi kerak.
