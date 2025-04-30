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
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
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
  const url = `${TELEGRAM_API}/sendMessage`;
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

// Load last message
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

const startOneMinuteJobInterval = () => {
  const msg = "⏳ Started 1-minute interval fetch for 10 minutes...";
  log(msg);
  sendToTelegramUsers(msg);

  let counta = 0;
  const intervalId = setInterval(async () => {
    await fetchAndStoreJobs();
    counta++;
    if (counta >= 40) {
      clearInterval(intervalId);
      const msg = "🛑 Search Stopped. Stay Tuned — The Next Hunt Begins At 11:00 PM!";
      log(msg);
      sendToTelegramUsers(msg);
    }
  }, 30 * 1000); // every 30 seconds
};

const start20MinuteJobInterval = () => {
  const msg = "⏳ Started 1-second interval fetch for 20 minutes...";
  log(msg);
  sendToTelegramUsers(msg);

  let count = 0;
  const intervalId = setInterval(async () => {
    await fetchAndStoreJobs();
    count++;
    if (count >= 1200) {
      clearInterval(intervalId);
      const msg = "💤 System Standby... 🖥️ Scheduled Job Check: 11:00 AM London Time.";
      log(msg);
      sendToTelegramUsers(msg);
    }
  }, 1000);
};

// Schedule jobs
cron.schedule("00 11 * * *", () => {
  log("🕚 Clock’s Ticking! ⚡ Job Check Set for 11:00 AM London Time.");
  sendToTelegramUsers("🕚 Clock’s Ticking! ⚡ Job Check Set for 11:00 AM London Time.");
  startOneMinuteJobInterval();
}, { timezone: "Europe/London" });

cron.schedule("00 23 * * *", () => {
  log("🕚 Countdown Active: Job Status Update at 11:00 PM London Time.");
  sendToTelegramUsers("🕚 Countdown Active: Job Status Update at 11:00 PM London Time.");
  start20MinuteJobInterval();
}, { timezone: "Europe/London" });

// Telegram Webhook
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) return res.send();

  const chatId = message.chat.id;
  const text = message.text;

  log("📩 Message received: " + text);

  if (/job/i.test(text)) {
    const jobMsg = await getJobMessage();
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: jobMsg,
    });
  } else {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: "Type 'job' to get the latest job listings.",
    });
  }

  res.send("OK");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`🚀 Bot is live on port ${PORT}`);
  fetchAndStoreJobs(); // optional: run on start
});
