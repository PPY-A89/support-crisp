const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Variables d'environnement
const CRISP_ID = process.env.CRISP_IDENTIFIER;
const CRISP_KEY = process.env.CRISP_KEY;
const WEBSITE_ID = process.env.WEBSITE_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

// Webhook Crisp
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log("EVENT:", JSON.stringify(event, null, 2));

    // Ne traiter que les messages utilisateurs
    if (event?.data?.from !== "user") {
      console.log("Ignored: not a user message");
      return res.sendStatus(200);
    }

    const message = event?.data?.content;

    // IMPORTANT → fallback session_id
    const session_id = event?.session_id || event?.data?.session_id;

    if (!message) {
      console.log("No message content");
      return res.sendStatus(200);
    }

    if (!session_id) {
      console.log("No session_id found → abort");
      return res.sendStatus(200);
    }

    console.log("Message reçu:", message);
    console.log("Session ID:", session_id);

    // Appel Claude
    const aiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: message
          }
        ]
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );

    const reply =
      aiResponse.data?.content?.[0]?.text || "Réponse indisponible";

    console.log("Réponse IA:", reply);

    // Envoi vers Crisp
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

    console.log("Réponse envoyée à Crisp");

    res.sendStatus(200);

  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

// Serveur
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
