require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

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

const fetchAndStoreJobs = async () => {
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

    const otherJobTypes = [...new Set(otherJobs.map(job => job.jobType))];
    const now = new Date().toISOString();

    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    }

    let jobHistory = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

    const updatedJobs = partTimeJobs.map((job) => {
      const existing = jobHistory.find(j => j.jobId === job.jobId && j.city === job.city);
      return existing
        ? { ...existing, lastUpdated: now, status: "active" }
        : { ...job, firstSeen: now, lastUpdated: now, status: "active" };
    });

    jobHistory.forEach((job) => {
      if (!partTimeJobs.find(j => j.jobId === job.jobId && j.city === job.city)) {
        job.status = "inactive";
        job.lastUpdated = now;
        updatedJobs.push(job);
      }
    });

    fs.writeFileSync(DATA_FILE, JSON.stringify(updatedJobs, null, 2));

    let msg = "";
    let errormsg = "";

    if (partTimeJobs.length > 0) {
      msg = `✅ Part-time jobs found:\n` + partTimeJobs.map(job => `• ${job.jobTitle} (${job.city})`).join("\n");
    } else if (otherJobs.length > 0) {
      msg = `✅ Other job(s) available: ${otherJobTypes.join(", ")}`;
    } else if (fullTimeJobs.length > 0) {
      msg = "❌ Only full-time jobs available.";
    } else {
      errormsg = "❌ No jobs found.";
    }

    log(msg);
    log(errormsg);
    await sendToTelegramUsers(msg);

  } catch (error) {
    const errMsg = "❌ Error fetching job data: " + error.message;
    log(errMsg);
    await sendToTelegramUsers(errMsg);
  }
};


// setInterval(fetchAndStoreJobs, 10 * 1000); // Run every 10 seconds
setInterval(fetchAndStoreJobs, 1000); // every 1 second

fetchAndStoreJobs(); // initial call

// Webhook endpoint
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text;

  if (/job/i.test(text)) {
    const jobMsg = await getJobMessage();
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: jobMsg,
    });
  } else {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `Type "job" to get the latest part-time job listings.`,
    });
  }

  res.sendStatus(200);
});

// Health check
app.get("/", (req, res) => res.send("✅ Bot is live."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
