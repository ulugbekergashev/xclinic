// POST /api/lead — landing formasidan kelgan arizani Telegram guruhiga yuboradi.
// Meta piksel sozlangan bo'lsa, Conversions API orqali "Lead" hodisasini ham yuboradi.
//
// Vercel sozlamalari (Environment Variables):
//   TELEGRAM_BOT_TOKEN  — @BotFather bergan token (majburiy)
//   TELEGRAM_CHAT_ID    — arizalar tushadigan guruh/chat ID (majburiy)
//   META_PIXEL_ID       — Meta piksel ID (ixtiyoriy)
//   META_CAPI_TOKEN     — Conversions API kirish tokeni (ixtiyoriy)

import { createHash } from 'node:crypto';
import { validateLead, formatLeadMessage } from './_lead.js';

const GRAPH_API_VERSION = 'v23.0';
const OUTBOUND_TIMEOUT_MS = 8000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 5;

// Bitta instansiya xotirasidagi oddiy cheklov — spam botlarga qarshi birinchi to'siq.
const hitsByIp = new Map();

const rateLimitOk = (ip) => {
  const now = Date.now();
  const recent = (hitsByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  const next = [...recent, now];
  hitsByIp.set(ip, next);
  return next.length <= RATE_MAX_PER_WINDOW;
};

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const sendToTelegram = async (text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID sozlanmagan');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Telegram ${response.status}: ${detail.slice(0, 300)}`);
  }
};

// Meta Conversions API. Xato bo'lsa ariza baribir qabul qilingan — faqat jurnalga yoziladi.
const sendToMeta = async (lead, req, body) => {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return;

  const firstName = lead.name.split(' ')[0].toLowerCase();
  const userData = {
    ph: [sha256(lead.phone)],
    fn: [sha256(firstName)],
    country: [sha256('uz')],
    client_ip_address: clientIp(req),
    client_user_agent: String(req.headers['user-agent'] || ''),
    ...(body.fbp ? { fbp: String(body.fbp).slice(0, 200) } : {}),
    ...(body.fbc ? { fbc: String(body.fbc).slice(0, 300) } : {}),
  };

  const event = {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: lead.pageUrl || undefined,
    // Brauzer pikseli bilan bir xil ID — Meta ikkalasini bitta lid deb hisoblaydi.
    event_id: String(body.eventId || '').slice(0, 100) || undefined,
    user_data: userData,
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] }),
        signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Meta CAPI xatosi:', response.status, detail.slice(0, 300));
    }
  } catch (error) {
    console.error('Meta CAPI yuborilmadi:', error?.message || error);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'method' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Yashirin maydon: odam uni ko'rmaydi, bot esa to'ldiradi. Botga "muvaffaqiyat" deymiz.
  if (body.website) return res.status(200).json({ success: true });

  if (!rateLimitOk(clientIp(req))) {
    return res.status(429).json({ success: false, error: 'rate' });
  }

  const result = validateLead(body);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });

  const { lead } = result;
  try {
    await sendToTelegram(formatLeadMessage(lead));
  } catch (error) {
    // Ariza yo'qolmasin: to'liq ma'lumot Vercel jurnalida qoladi.
    console.error('Ariza Telegramga yuborilmadi:', error?.message || error, JSON.stringify(lead));
    return res.status(502).json({ success: false, error: 'delivery' });
  }

  await sendToMeta(lead, req, body);
  return res.status(200).json({ success: true });
}
