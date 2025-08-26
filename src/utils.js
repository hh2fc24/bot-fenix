const { CONSTANTS } = require('./config');

function nowInLaPaz() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: CONSTANTS.TZ }));
}

function normalizeString(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/[^0-9+]/g, "");
  if (/^\d{8}$/.test(digits)) return `+591${digits}`;
  if (/^591\d{8}$/.test(digits)) return `+${digits}`;
  if (/^\+\d{9,15}$/.test(digits)) return digits;
  return digits || null;
}

function parseTimeRange(raw) {
  if (!raw) return { from: null, to: null };
  const t = normalizeString(raw);
  const m = t.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-a–]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );
  if (m) {
    const h1 = Number(m[1]), min1 = Number(m[2] || 0), ap1 = (m[3] || "").toLowerCase();
    const to24 = (h, ap) => {
      if (!ap) return h;
      if (ap === "pm" && h < 12) return h + 12;
      if (ap === "am" && h === 12) return 0;
      return h;
    };
    const h2 = Number(m[4]), min2 = Number(m[5] || 0), ap2 = (m[6] || "").toLowerCase();
    const from = `${String(to24(h1, ap1)).padStart(2, "0")}:${String(min1).padStart(2, "0")}`;
    const to = `${String(to24(h2, ap2)).padStart(2, "0")}:${String(min2).padStart(2, "0")}`;
    return { from, to };
  }
  if (/mañana/.test(t)) return { from: "09:00", to: "12:00" };
  if (/tarde/.test(t)) return { from: "14:00", to: "18:00" };
  if (/noche/.test(t)) return { from: "18:00", to: "21:00" };
  return { from: null, to: null };
}

function calculateTotalAmount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (total, item) => total + Number(item.qty || 1) * Number(item.unit_price || 0),
    0
  );
}

async function say(ctx, text, extra) {
  try {
    return await ctx.reply(text, { ...extra, parse_mode: "Markdown" });
  } catch (e) {
    console.warn(`Error al enviar mensaje: ${e.message}`);
  }
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function timeSalutation() {
  const h = nowInLaPaz().getHours();
  if (h < 12) return "¡Buenos días";
  if (h < 20) return "¡Buenas tardes";
  return "¡Buenas noches";
}

function isGreetingText(text) {
    if (!text) return false;
    const t = normalizeString(text);
    return [
      /(hola|buen dia|buenos dias|buenas|saludos)\b/,
      /\b(hi|hello|hey)\b/,
      /^\/start$/,
    ].some((re) => re.test(t));
}

module.exports = {
  nowInLaPaz,
  normalizeString,
  normalizePhone,
  parseTimeRange,
  calculateTotalAmount,
  say,
  escapeMarkdown,
  timeSalutation,
  isGreetingText,
};
