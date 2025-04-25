require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_URL = "https://qy64m4juabaffl7tjakii4gdoa.appsync-api.eu-west-1.amazonaws.com/graphql";
const AUTH_TOKEN = `Bearer ${process.env.AUTH_TOKEN}`;
const DATA_FILE = path.join(__dirname, "data.json");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
const TELEGRAM_USER_ID2 = process.env.TELEGRAM_USER_ID2;


if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const sendTelegramMessage = async (message) => {
  if (!TELEGRAM_TOKEN || !TELEGRAM_USER_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: TELEGRAM_USER_ID,
      text: message,
    });
  } catch (err) {
    log("❌ Failed to send Telegram message: " + err.message);
  }
};

const sendTelegramMessage2 = async (message) => {
  if (!TELEGRAM_TOKEN || !TELEGRAM_USER_ID2) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: TELEGRAM_USER_ID2,
      text: message,
    });
  } catch (err) {
    log("❌ Failed to send Telegram message2: " + err.message);
  }
};



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

    let jobHistory = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    const now = new Date().toISOString();

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

    if (partTimeJobs.length > 0) {
      const msg = `✅ Part-time jobs found:\n` + partTimeJobs.map(job => `• ${job.jobTitle} (${job.city})`).join("\n");
      log(msg);
      await sendTelegramMessage(msg);
      await sendTelegramMessage2(msg);
    } else if (otherJobs.length > 0) {
      const msg = `✅ Other job(s) available: ${otherJobTypes.join(", ")}`;
      log(msg);
      await sendTelegramMessage(msg);
      await sendTelegramMessage2(msg);
    } else if (fullTimeJobs.length > 0) {
      const msg = "❌ Only full-time jobs available.";
      log(msg);
      await sendTelegramMessage(msg);
      await sendTelegramMessage2(msg);
      } else {
      const msg = "❌ No jobs found.";
      log(msg);
    }
  } catch (error) {
    log("❌ Error fetching job data: " + error.message);
    await sendTelegramMessage("❌ Error fetching job data: " + error.message);
    await sendTelegramMessage2("❌ Error fetching job data: " + error.message);

  }
};

// Run every 1 minutes
// setInterval(fetchAndStoreJobs, 1 * 60 * 1000); // every min
setInterval(fetchAndStoreJobs, 10 * 1000); // every 10 sec
// setInterval(fetchAndStoreJobs, 1000); // every 1 second
//setInterval(fetchAndStoreJobs, 10 * 60 * 1000); // every 10 minutes


fetchAndStoreJobs(); // Initial run
