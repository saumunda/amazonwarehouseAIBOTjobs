require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { getJobMessage } = require("./job1");

// ---- Config ----
const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
  console.error("Missing TELEGRAM_TOKEN in env.");
  process.exit(1);
}
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ""; // optional extra safety
const BASE_URL =
  process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || ""; // set on Render automatically

// axios client with timeout & simple retry
const api = axios.create({ timeout: 15000 });
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const cfg = err.config || {};
    cfg.__retryCount = (cfg.__retryCount || 0) + 1;
    if (cfg.__retryCount <= 2) {
      await new Promise((r) => setTimeout(r, 500 * cfg.__retryCount));
      return api(cfg);
    }
    return Promise.reject(err);
  }
);

const app = express();
app.use(express.json()); // bodyParser not needed on modern Express
app.use(express.urlencoded({ extended: true }));

// ---- Helpers ----
const sendMessage = (chat_id, text, extra = {}) =>
  api.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    ...extra,
  });

// ---- Health / Keep-alive ----
app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// ---- Optional: auto-setup webhook on /setup-webhook ----
// Requires BASE_URL/RENDER_EXTERNAL_URL available in env
app.get("/setup-webhook", async (_req, res) => {
  try {
    if (!BASE_URL) {
      return res
        .status(400)
        .send("Missing BASE_URL/RENDER_EXTERNAL_URL env for webhook setup.");
    }
    const url = `${BASE_URL.replace(/\/$/, "")}/webhook/${TOKEN}`;
    const payload = { url };
    if (WEBHOOK_SECRET) {
      payload.secret_token = WEBHOOK_SECRET; // Telegram echoes this in headers
    }
    const { data } = await api.post(`${TELEGRAM_API}/setWebhook`, payload);
    res.json(data);
  } catch (e) {
    console.error("setWebhook error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Webhook endpoint ----
app.post(`/webhook/${TOKEN}`, async (req, res) => {
  // If you set a secret_token in setWebhook, validate it here
  if (WEBHOOK_SECRET) {
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (header !== WEBHOOK_SECRET) return res.sendStatus(401);
  }

  const update = req.body || {};
  const message = update.message || update.edited_message;
  if (!message || !message.chat) {
    return res.sendStatus(200); // acknowledge quickly
  }

  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  console.log(
    `[${new Date().toISOString()}] From ${chatId}: ${text || "(non-text)"}`
  );

  try {
    if (/^\/?start$/i.test(text)) {
      await sendMessage(
        chatId,
        "👋 Hi! Send *job* to get the latest job listings. You can also send */help*."
      );
    } else if (/^\/?help$/i.test(text)) {
      await sendMessage(
        chatId,
        "🧭 Commands:\n• *job* – fetch latest jobs\n• */help* – show this help"
      );
    } else if (/job/i.test(text)) {
      const jobMsg = await getJobMessage();
      await sendMessage(chatId, jobMsg || "No jobs found right now.");
    } else {
      await sendMessage(
        chatId,
        "🤖 I didn’t catch that. Type *job* to get the latest listings."
      );
    }
  } catch (err) {
    console.error("❌ Handler error:", err.message);
    try {
      await sendMessage(
        chatId,
        "❌ Something went wrong while processing your request. Please try again."
      );
    } catch (_) {}
  }

  // Always respond fast so Telegram doesn’t retry
  res.sendStatus(200);
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🤖 Telegram bot listening on :${PORT}`);
  if (!BASE_URL) {
    console.warn(
      "Tip: set BASE_URL or rely on RENDER_EXTERNAL_URL, then call GET /setup-webhook once deployed."
    );
  }
});

// Graceful shutdown (Render sends SIGTERM on deploy/restart)
const shutdown = () => {
  console.log("Shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
