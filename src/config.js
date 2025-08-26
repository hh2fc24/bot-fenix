require("dotenv").config();
const { Telegraf } = require("telegraf");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const requiredEnv = [
  "TELEGRAM_BOT_TOKEN",
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE",
  "OPENCAGE_API_KEY",
];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("❌ Faltan variables de entorno:", missing.join(", "));
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const CONSTANTS = Object.freeze({
  TZ: "America/La_Paz",
  ROLES: { ASESOR: "ASESOR", PROMOTOR: "PROMOTOR" },
  BUCKETS: {
    ORDER_IMAGES: "order-images",
    DELIVERY_PROOFS: "delivery-proofs",
    PAYMENT_PROOFS: "delivery-proofs",
  },
  WHOLESALE_KEYWORDS: [
    "mayorista", "al por mayor", "por mayor", "wholesale", "fardo", "bulto", "caja", "docena",
  ],
});

module.exports = {
  bot,
  oai,
  supabase,
  CONSTANTS,
  openCageApiKey: process.env.OPENCAGE_API_KEY,
};