require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

// ----- Config -----
const API_URL = "https://qy64m4juabaffl7tjakii4gdoa.appsync-api.eu-west-1.amazonaws.com/graphql";
const AUTH_TOKEN = process.env.AUTH_TOKEN ? `Bearer ${process.env.AUTH_TOKEN}` : "";
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_IDS = [process.env.TELEGRAM_USER_ID, process.env.TELEGRAM_USER_ID2].filter(Boolean);
const LAST_MSG_FILE = path.join(__dirname, "lastMessage.json");
const TIMEZONE = "Europe/London";

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN missing.");
  process.exit(1);
}

// ----- HTTP (optional but recommended on Render Web Services) -----
const app = express();
app.use(express.json());
app.get("/", (_req, res) => res.send("OK"));
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🟢 Service running on :${PORT}`);
});

// ----- Utils -----
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const tg = axios.create({
  baseURL: `https://api.telegram.org/bot${TELEGRAM_TOKEN}`,
  timeout: 15000,
});
tg.interceptors.response.use(
  r => r,
  async (e) => {
    const cfg = e.config || {};
    cfg.__retryCount = (cfg.__retryCount || 0) + 1;
    if (cfg.__retryCount <= 2) {
      await new Promise(r => setTimeout(r, 500 * cfg.__retryCount));
      return tg(cfg);
    }
    return Promise.reject(e);
  }
);

const gql = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    ...(AUTH_TOKEN ? { Authorization: AUTH_TOKEN } : {}),
  },
});

// Escape a few Markdown chars to avoid formatting issues
const md = (s = "") =>
  String(s).replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");

const sendToTelegramUsers = async (message) => {
  if (!TELEGRAM_IDS.length) {
    log("⚠️ No TELEGRAM_USER_ID envs set; skipping send.");
    return;
  }
  for (const id of TELEGRAM_IDS) {
    try {
      await tg.post("/sendMessage", {
        chat_id: id,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch (err) {
      log(`❌ Failed to send message to ${id}: ${err.message}`);
    }
  }
};

// Chunk long messages to respect Telegram 4096-char limit
const sendChunked = async (text) => {
  const limit = 3800; // margin for markup
  for (let i = 0; i < text.length; i += limit) {
    await sendToTelegramUsers(text.slice(i, i + limit));
  }
};

// ----- Job fetch -----
const GRAPHQL_QUERY = {
  operationName: "searchJobCardsByLocation",
  query: `
    query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
      searchJobCardsByLocation(searchJobRequest: $searchJobRequest) {
        jobCards {
          jobId
          jobTitle
          jobType
          employmentType
          city
          state
          totalPayRateMin
          totalPayRateMax
        }
      }
    }
  `,
  variables: {
    searchJobRequest: {
      locale: "en-GB",
      country: "United Kingdom",
      keyWords: "",
      equalFilters: [],
      rangeFilters: [],
    },
  },
};

const getJobMessage = async () => {
  try {
    const { data } = await gql.post("", GRAPHQL_QUERY);
    if (data?.errors?.length) {
      const msg = data.errors.map(e => e.message).join("; ");
      throw new Error(msg);
    }
    const jobs = data?.data?.searchJobCardsByLocation?.jobCards || [];
    if (!Array.isArray(jobs) || !jobs.length) {
      return `❌ No jobs found.\n\n[☕️ Support this bot](https://www.buymeacoffee.com/amazonjobbot)`;
    }

    // Normalize + bucket
    const norm = jobs.map(j => ({
      id: j.jobId,
      title: j.jobTitle || "Untitled",
      type: (j.jobType || "").toLowerCase(),
      city: j.city || "",
      payMin: j.totalPayRateMin,
      payMax: j.totalPayRateMax,
    }));

    const part = norm.filter(j => j.type === "part-time");
    const full = norm.filter(j => j.type === "full-time");
    const other = norm.filter(j => j.type !== "part-time" && j.type !== "full-time");

    const fmt = (arr) =>
      arr.slice(0, 40) // cap list length
        .map(j => `• ${md(j.title)} (${md(j.city)})`).join("\n");

    const support = `\n\n[☕️ Support this bot](https://www.buymeacoffee.com/amazonjobbot)`;

    if (part.length) {
      return `✅ *Part-time jobs found:*\n${fmt(part)}${support}`;
    }
    if (full.length) {
      return `❗ *Only full-time jobs available:*\n${fmt(full)}${support}`;
    }
    const types = [...new Set(other.map(j => j.type || "other"))].join(", ");
    return `📌 *Other job(s) available* [${md(types)}]:\n${fmt(other)}${support}`;
  } catch (err) {
    return `❌ Error fetching job data: ${md(err.message || String(err))}`;
  }
};

// ----- Diff / persistence -----
let lastMessageSent = "";
if (fs.existsSync(LAST_MSG_FILE)) {
  try {
    lastMessageSent = JSON.parse(fs.readFileSync(LAST_MSG_FILE, "utf-8"))?.message || "";
  } catch (e) {
    log("⚠️ Failed to parse lastMessage.json, ignoring.");
  }
}

// prevent overlapping fetches if a slow request runs long
let inFlight = false;
const fetchAndStoreJobs = async () => {
  if (inFlight) {
    log("⏳ Skipping run; previous fetch still in flight.");
    return;
  }
  inFlight = true;
  try {
    const jobMsg = await getJobMessage();
    if (jobMsg !== lastMessageSent) {
      log("🔁 Sending updated job message...");
      await sendChunked(jobMsg);
      lastMessageSent = jobMsg;
      fs.writeFileSync(LAST_MSG_FILE, JSON.stringify({ message: jobMsg }, null, 2));
    } else {
      log("⏸ No new job update to send.");
    }
  } catch (err) {
    const msg = `❌ Error running scheduled job check: ${err.message}`;
    log(msg);
    await sendToTelegramUsers(msg);
  } finally {
    inFlight = false;
  }
};

// ----- Burst interval helpers -----
const startBurstInterval = (label, everyMs, totalMinutes) => {
  const totalCycles = Math.floor((totalMinutes * 60 * 1000) / everyMs);
  const startMsg = `⏳ Started ${everyMs / 1000}-second interval fetch for ${totalMinutes} minutes (${label})...`;
  log(startMsg); sendToTelegramUsers(startMsg);

  let count = 0;
  const id = setInterval(async () => {
    await fetchAndStoreJobs();
    count++;
    if (count >= totalCycles) {
      clearInterval(id);
      const done = "💤 System Standby... 🖥️ Scheduled Job Check completed.";
      log(done); sendToTelegramUsers(done);
    }
  }, everyMs);
  return id;
};

// ----- CRON (London time) -----
cron.schedule("2 11 * * *", async () => {
  const msg = "🕚 Clock’s Ticking! ⚡ Job Check set for 11:02 AM London time.";
  log(msg); await sendToTelegramUsers(msg);
  startBurstInterval("AM burst", 1000, 20); // every 1s for 20 mins
}, { timezone: TIMEZONE });

cron.schedule("2 23 * * *", async () => {
  const msg = "🌙 Countdown Active: Job Status Update at 11:02 PM London time.";
  log(msg); await sendToTelegramUsers(msg);
  startBurstInterval("PM burst", 1000, 20); // every 1s for 20 mins
}, { timezone: TIMEZONE });

// ▶️ Initial run + optional burst on boot (can be noisy—disable if you prefer)
fetchAndStoreJobs();
startBurstInterval("Boot burst", 20_000, 20); // every 20s for 20 mins

// ----- Graceful shutdown -----
const shutdown = () => {
  log("🔻 Shutting down...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Exported for unit tests or reuse
module.exports = { getJobMessage, fetchAndStoreJobs };
