require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

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

  // Simple response logic
  let reply = "I'm not sure what you mean.";
  if (/hello/i.test(text)) reply = "Hey there!";
  if (/job/i.test(text)) reply = "Looking for jobs? I’ll keep you posted.";

  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: reply,
  });

  res.send("OK");
});

// Health check
app.get("/", (req, res) => res.send("Bot is running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
