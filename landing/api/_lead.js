// Lidni tekshirish va matnga aylantirish. Fayl nomi "_" bilan boshlangani uchun
// Vercel uni alohida endpoint qilmaydi — faqat api/lead.js import qiladi.

export const DOCTOR_RANGES = ['1-3', '4-10', '11-30', '30+'];

const LIMITS = { name: 80, clinic: 120, city: 60, utm: 200, url: 500 };
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** "90 123 45 67", "+998901234567", "998 90 ..." → "998901234567". Noto'g'ri bo'lsa null. */
export const normalizePhone = (input) => {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 9) return `998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return digits;
  return null;
};

export const formatPhone = (phone) =>
  `+${phone.slice(0, 3)} ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10, 12)}`;

/** Forma ma'lumotini tekshiradi. { ok: true, lead } yoki { ok: false, error }. */
export const validateLead = (body) => {
  const data = body && typeof body === 'object' ? body : {};

  const name = clean(data.name, LIMITS.name);
  if (name.length < 2) return { ok: false, error: 'name' };

  const phone = normalizePhone(data.phone);
  if (!phone) return { ok: false, error: 'phone' };

  // Klinika nomi ixtiyoriy: reklamadan kelgan odamdan faqat ism va telefon so'raladi.
  const clinic = clean(data.clinic, LIMITS.clinic);

  const doctors = DOCTOR_RANGES.includes(data.doctors) ? data.doctors : '';
  const utm = Object.fromEntries(
    UTM_KEYS.map((key) => [key, clean(data[key], LIMITS.utm)]).filter(([, value]) => value)
  );

  return {
    ok: true,
    lead: {
      name,
      phone,
      clinic,
      city: clean(data.city, LIMITS.city),
      doctors,
      lang: data.lang === 'ru' ? 'ru' : 'uz',
      utm,
      pageUrl: clean(data.pageUrl, LIMITS.url),
    },
  };
};

/** Telegram uchun oddiy matn (parse_mode yo'q — foydalanuvchi matni belgi sifatida talqin qilinmaydi). */
export const formatLeadMessage = (lead, receivedAt = new Date()) => {
  const lines = [
    '🆕 XClinic — yangi ariza',
    '',
    `👤 ${lead.name}`,
    `📞 ${formatPhone(lead.phone)}`,
  ];
  if (lead.clinic) lines.push(`🏥 ${lead.clinic}`);
  if (lead.city) lines.push(`📍 ${lead.city}`);
  if (lead.doctors) lines.push(`👨‍⚕️ Shifokorlar: ${lead.doctors}`);
  lines.push(`🌐 Til: ${lead.lang}`);

  const utmEntries = Object.entries(lead.utm);
  if (utmEntries.length) {
    lines.push('', 'Reklama:');
    for (const [key, value] of utmEntries) lines.push(`${key.replace('utm_', '')}: ${value}`);
  }

  const time = receivedAt.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });
  lines.push('', `🕒 ${time}`);
  return lines.join('\n');
};
