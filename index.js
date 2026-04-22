const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CRISP_ID = process.env.CRISP_IDENTIFIER;
const CRISP_KEY = process.env.CRISP_KEY;
const WEBSITE_ID = process.env.WEBSITE_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    if (event.data?.from !== "user") return res.sendStatus(200);

    const message = event.data?.content;
    const session_id = event.data?.session_id || event.session_id;

    if (!message || !session_id) return res.sendStatus(200);

    const ai = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 200,
        messages: [{ role: "user", content: message }]
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );

    const reply = ai.data.content[0].text;

    await axios.post(
      `https://api.crisp.chat/v1/website/${WEBSITE_ID}/conversation/${session_id}/message`,
      {
        type: "text",
        content: reply
      },
      {
        auth: {
          username: CRISP_ID,
          password: CRISP_KEY
        }
      }
    );

    res.sendStatus(200);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
