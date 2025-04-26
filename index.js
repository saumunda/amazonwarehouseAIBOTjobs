require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cron = require("node-cron");

const app = express();
app.use(bodyParser.json());

const API_URL = "https://qy64m4juabaffl7tjakii4gdoa.appsync-api.eu-west-1.amazonaws.com/graphql";
const AUTH_TOKEN = `Bearer ${process.env.AUTH_TOKEN}`;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_IDS = [
  process.env.TELEGRAM_USER_ID,
  process.env.TELEGRAM_USER_ID2,
];
const DATA_FILE = path.join(__dirname, "data.json");
const LAST_MSG_FILE = path.join(__dirname, "lastMessage.json");

const GRAPHQL_QUERY = {
  operationName: "searchJobCardsByLocation",
  query: `query searchJobCardsByLocation($searchJobRequest: SearchJobRequest!) {
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
  }`,
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

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const sendToTelegramUsers = async (message) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  for (const id of TELEGRAM_IDS) {
    if (!id) continue;
    try {
      await axios.post(url, {
        chat_id: id,
        text: message,
      });
    } catch (err) {
      log(`❌ Failed to send message to ${id}: ${err.message}`);
    }
  }
};

const getJobMessage = async () => {
  try {
    const response = await axios.post(API_URL, GRAPHQL_QUERY, {
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_TOKEN,
      },
    });

    const jobs = response.data?.data?.searchJobCardsByLocation?.jobCards || [];

    const partTimeJobs = jobs.filter(job => job.jobType?.toLowerCase() === "part-time");
    const fullTimeJobs = jobs.filter(job => job.jobType?.toLowerCase() === "full-time");
    const otherJobs = jobs.filter(job => {
      const type = job.jobType?.toLowerCase();
      return type !== "part-time" && type !== "full-time";
    });

    if (partTimeJobs.length > 0) {
      return `✅ Part-time jobs found:\n` + partTimeJobs.map(job =>
        `• ${job.jobTitle} (${job.city})`
      ).join("\n");
    } else if (fullTimeJobs.length > 0) {
      return `❗ Only full-time jobs available:\n` + fullTimeJobs.map(job =>
        `• ${job.jobTitle} (${job.city})`
      ).join("\n");
    } else if (otherJobs.length > 0) {
      const jobTypes = [...new Set(otherJobs.map(job => job.jobType))];
      return `📌 Other job(s) available [${jobTypes.join(", ")}]:\n` + otherJobs.map(job =>
        `• ${job.jobTitle} (${job.city})`
      ).join("\n");
    } else {
      return "❌ No jobs found.";
    }

  } catch (err) {
    return "❌ Error fetching job data: " + err.message;
  }
};

// Load last message if exists
let lastMessageSent = "";
if (fs.existsSync(LAST_MSG_FILE)) {
  try {
    const data = fs.readFileSync(LAST_MSG_FILE, "utf-8");
    lastMessageSent = JSON.parse(data)?.message || "";
  } catch (err) {
    console.error("Failed to read lastMessage.json:", err.message);
  }
}

const fetchAndStoreJobs = async () => {
  try {
    const jobMsg = await getJobMessage();

    if (jobMsg !== lastMessageSent) {
      log("🔁 Sending updated job message...");
      await sendToTelegramUsers(jobMsg);
      lastMessageSent = jobMsg;
      fs.writeFileSync(LAST_MSG_FILE, JSON.stringify({ message: jobMsg }, null, 2));
    } else {
      log("⏸ No new job update to send.");
    }
  } catch (err) {
    const msg = "❌ Error running scheduled job check: " + err.message;
    log(msg);
    await sendToTelegramUsers(msg);
  }
};

// 🕚 Run once daily at 11:00 AM London time (BST/GMT auto-adjusted)
cron.schedule("00 05 * * *", async () => {
  log("🕚 Scheduled job check at 05:00 AM London time...");
  const sch = "🕚 Scheduled job check at 05:00 AM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(sch);
}, {
  timezone: "Europe/London"
});

cron.schedule("00 06 * * *", async () => {
  log("🕚 Scheduled job check at 06:00 AM London time...");
  const msg = "🕚 Scheduled job check at 06:00 AM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(msg);
}, {
  timezone: "Europe/London"
});

cron.schedule("00 07 * * *", async () => {
  log("🕚 Scheduled job check at 07:00 AM London time...");
  const sch = "🕚 Scheduled job check at 07:00 AM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(sch);
}, {
  timezone: "Europe/London"
});

cron.schedule("00 08 * * *", async () => {
  log("🕚 Scheduled job check at 08:00 AM London time...");
  const msg = "🕚 Scheduled job check at 08:00 AM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(msg);
}, {
  timezone: "Europe/London"
});

cron.schedule("00 09 * * *", async () => {
  log("🕚 Scheduled job check at 09:00 AM London time...");
  const sch = "🕚 Scheduled job check at 09:00 AM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(sch);
}, {
  timezone: "Europe/London"
});

cron.schedule("00 10 * * *", async () => {
  log("🕚 Scheduled job check at 10:00 AM London time...");
  const sch = "🕚 Scheduled job check at 10:00 AM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(sch);
}, {
  timezone: "Europe/London"
});

cron.schedule("00 11 * * *", async () => {
  log("🕚 Scheduled job check at 11:00 AM London time...");
  const sch = "🕚 Scheduled job check at 11:00 AM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(sch);
}, {
  timezone: "Europe/London"
});

cron.schedule("00 23 * * *", async () => {
  log("🕚 Scheduled job check at 11:00 PM London time...");
  const sch = "🕚 Scheduled job check at 11:00 PM London time...";
  await fetchAndStoreJobs();
  await sendToTelegramUsers(sch);
}, {
  timezone: "Europe/London"
});

// Optional: Run once at startup
// fetchAndStoreJobs();

// Polling job alert every 1 seconds
// setInterval(fetchAndStoreJobs, 1000);
fetchAndStoreJobs(); // Initial call

// Telegram Webhook
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text;

  let reply = `Type "job" to get the latest job listings.`;
  if (/job/i.test(text)) {
    reply = await getJobMessage();
  }

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text: reply,
  });

  res.sendStatus(200);
});

// Health Check
app.get("/", (req, res) => res.send("✅ Bot is live."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
