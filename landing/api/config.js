// GET /api/config — sahifaga Meta piksel ID ni beradi (ID maxfiy emas, brauzerda baribir ko'rinadi).
// Piksel ID ni kodga yozmaslik uchun: Vercel'da META_PIXEL_ID qo'yilsa, qayta joylashsiz ishlaydi.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ pixelId: process.env.META_PIXEL_ID || null });
}
