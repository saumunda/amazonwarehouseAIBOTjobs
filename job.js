// job.js
require("dotenv").config();
const axios = require("axios");

const API_URL = "https://qy64m4juabaffl7tjakii4gdoa.appsync-api.eu-west-1.amazonaws.com/graphql";
const AUTH_TOKEN = `Bearer ${process.env.AUTH_TOKEN}`;

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

async function getJobMessage() {
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

module.exports = { getJobMessage };
