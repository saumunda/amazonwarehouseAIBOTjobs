require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { getJobMessage } = require("./server"); // import the job logic

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

app.post(`/webhook/${TOKEN}`, async (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) return res.send();

  const chatId = message.chat.id;
  const text = message.text;

  console.log("Message received:", text);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot is live on port ${PORT}`);
});
