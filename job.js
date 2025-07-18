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
const LAST_MSG_FILE = path.join(__dirname, "lastMessage.json");

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const sendToTelegramUsers = async (message) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  for (const id of TELEGRAM_IDS) {
    if (!id) continue;
    try {
      await axios.post(url, {
        chat_id: id,
        text: message,
        parse_mode: "Markdown",
      });
    } catch (err) {
      log(`❌ Failed to send message to ${id}: ${err.message}`);
    }
  }
};

const getJobMessage = async () => {
  try {
    const response = await axios.post(API_URL, {
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
    }, {
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_TOKEN,
      },
    });

    const jobs = response.data?.data?.searchJobCardsByLocation?.jobCards || [];
    const partTimeJobs = jobs.filter(job => job.jobType?.toLowerCase() === "part-time");
    const fullTimeJobs = jobs.filter(job => job.jobType?.toLowerCase() === "full-time");
    const otherJobs = jobs.filter(job => !["part-time", "full-time"].includes(job.jobType?.toLowerCase()));

    const supportLine = "\n\n[☕️ Support this bot](https://www.buymeacoffee.com/amazonjobbot)";

    if (partTimeJobs.length > 0) {
      return `✅ Part-time jobs found:\n` +
        partTimeJobs.map(job => `• ${job.jobTitle} (${job.city})`).join("\n") + supportLine;
    } else if (fullTimeJobs.length > 0) {
      return `❗ Only full-time jobs available:\n` +
        fullTimeJobs.map(job => `• ${job.jobTitle} (${job.city})`).join("\n") + supportLine;
    } else if (otherJobs.length > 0) {
      const jobTypes = [...new Set(otherJobs.map(job => job.jobType))];
      return `📌 Other job(s) available [${jobTypes.join(", ")}]:\n` +
        otherJobs.map(job => `• ${job.jobTitle} (${job.city})`).join("\n") + supportLine;
    } else {
      return `❌ No jobs found.` + supportLine;
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

// Boost interval control
let isBoostActive = false;

const start20MinBoostInterval = () => {
  if (isBoostActive) return; // avoid overlap
  isBoostActive = true;

  log("⚡ 20-minute boosted job check started (every 20 seconds)...");
  sendToTelegramUsers("⚡ 20-minute boosted job check started (every 20 seconds)...");

  let count = 0;
  const intervalId = setInterval(async () => {
    await fetchAndStoreJobs(false); // silent mode
    count++;
    if (count >= 60) { // 60 * 20s = 20 minutes
      clearInterval(intervalId);
      isBoostActive = false;
      log("💤 20-minute boost finished. Back to normal schedule.");
      sendToTelegramUsers("💤 20-minute boost finished. Back to normal schedule.");
    }
  }, 20 * 1000);
};

const fetchAndStoreJobs = async (checkNew = true) => {
  try {
    const jobMsg = await getJobMessage();
    if (checkNew && jobMsg !== lastMessageSent) {
      log("🔁 Sending updated job message...");
      await sendToTelegramUsers(jobMsg);
      lastMessageSent = jobMsg;
      fs.writeFileSync(LAST_MSG_FILE, JSON.stringify({ message: jobMsg }, null, 2));

      // Start 20-min boost when a new job message arrives
      start20MinBoostInterval();
    } else if (checkNew) {
      log("⏸ No new job update to send.");
    }
  } catch (err) {
    const msg = "❌ Error running job check: " + err.message;
    log(msg);
    await sendToTelegramUsers(msg);
  }
};

// Regular 5-minute job checks
cron.schedule("*/5 * * * *", async () => {
  if (!isBoostActive) {
    log("🔄 Running 5-minute job check...");
    await fetchAndStoreJobs(true);
  } else {
    log("⏸ Skipping normal check, boost mode active.");
  }
}, { timezone: "Europe/London" });

// Initial run at startup
fetchAndStoreJobs(true);

// Express server for health check
app.get("/", (req, res) => res.send("✅ Job Bot is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => log(`🚀 Server started on port ${PORT}`));


module.exports = { getJobMessage };
