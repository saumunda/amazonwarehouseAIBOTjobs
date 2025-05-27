require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const { CronJob } = require("cron"); // ✅ Correct cron package

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

const getJobMessage = async () =>  {
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
      const type = job.jobType?.toLowerC
