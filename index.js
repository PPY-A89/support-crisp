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
    console.log("EVENT:", JSON.stringify(event, null, 2));

    const from = event?.data?.from;
    if (from === "operator") {
      console.log("Ignored: operator message");
      return res.sendStatus(200);
    }

    const message = event?.data?.content;
    const session_id = event?.data?.session_id || event?.session_id;

    if (!message || !session_id) {
      console.log("Missing message or session_id");
      return res.sendStatus(200);
    }

    console.log("Message:", message);
    console.log("Session:", session_id);
    console.log("ENV CHECK:", {
      hasCrispId: !!CRISP_ID,
      hasCrispKey: !!CRISP_KEY,
      hasWebsiteId: !!WEBSITE_ID,
      hasAnthropicKey: !!ANTHROPIC_KEY
    });

    // Appel Claude
    const aiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
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

    const reply = aiResponse.data?.content?.[0]?.text || "Réponse indisponible";
    console.log("Réponse IA:", reply);

    // Envoi Crisp
    const crispUrl = `https://api.crisp.chat/v1/website/${WEBSITE_ID}/conversation/${session_id}/message`;
    console.log("Crisp URL:", crispUrl);

    await axios.post(
      crispUrl,
      { type: "text", content: reply },
      {
        auth: {
          username: CRISP_ID,
          password: CRISP_KEY
        }
      }
    );

    console.log("✅ Réponse envoyée à Crisp");
    res.sendStatus(200);

  } catch (err) {
    console.error("ERROR STATUS:", err.response?.status);
    console.error("ERROR DATA:", JSON.stringify(err.response?.data));
    console.error("ERROR MSG:", err.message);
    res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
