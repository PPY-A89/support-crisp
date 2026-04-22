const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const app = express();
app.use(express.json());

const CRISP_ID = process.env.CRISP_IDENTIFIER;
const CRISP_KEY = process.env.CRISP_KEY;
const WEBSITE_ID = process.env.WEBSITE_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

// Vérification des variables d'environnement au démarrage
if (!CRISP_ID || !CRISP_KEY || !WEBSITE_ID || !ANTHROPIC_KEY) {
  console.error("ERREUR : Variables d'environnement manquantes");
  process.exit(1);
}

// Rate limiting : max 20 requêtes par minute par IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Trop de requêtes, veuillez patienter.",
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/webhook", limiter);

// Blacklist injections
const BLACKLIST = [
  "<script", "javascript:", "SELECT ", "DROP ", "INSERT ", "DELETE ",
  "prompt(", "alert(", "ignore tes instructions", "ignore your instructions",
  "nouveau rôle", "act as", "oublie tes instructions", "forget your instructions",
  "system prompt", "jailbreak"
];

const isBlacklisted = (text) =>
  BLACKLIST.some(term => text.toLowerCase().includes(term.toLowerCase()));

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;
    console.log("EVENT:", JSON.stringify(event, null, 2));

    // Ignore les messages operator
    const from = event?.data?.from;
    if (from === "operator") {
      console.log("Ignored: operator message");
      return res.sendStatus(200);
    }

    // Bloque tout ce qui n'est pas du texte (images, fichiers, PDFs...)
    if (event?.data?.type !== "text") {
      console.log("Ignored: non-text message type:", event?.data?.type);
      return res.sendStatus(200);
    }

    const message = event?.data?.content;
    const session_id = event?.data?.session_id || event?.session_id;

    // Bloque messages vides ou manquants
    if (!message || !session_id) {
      console.log("Missing message or session_id");
      return res.sendStatus(200);
    }

    // Bloque messages trop courts
    if (message.trim().length < 2) {
      console.log("Ignored: message too short");
      return res.sendStatus(200);
    }

    // Bloque messages trop longs (spam)
    if (message.length > 1000) {
      console.log("Ignored: message too long");
      return res.sendStatus(200);
    }

    // Bloque injections et prompt hacking
    if (isBlacklisted(message)) {
      console.log("Ignored: blacklisted content");
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

    // Récupère l'historique de la conversation depuis Crisp
    let formattedHistory = [];
    try {
      const historyRes = await axios.get(
        `https://api.crisp.chat/v1/website/${WEBSITE_ID}/conversation/${session_id}/messages`,
        {
          auth: { username: CRISP_ID, password: CRISP_KEY },
          headers: { "X-Crisp-Tier": "plugin" },
          timeout: 8000
        }
      );

      const historyMessages = historyRes.data?.data || [];

      formattedHistory = historyMessages
        .filter(m => m.type === "text" && (m.from === "user" || m.from === "operator"))
        .map(m => ({
          role: m.from === "user" ? "user" : "assistant",
          content: m.content
        }))
        .slice(-20); // Limite à 20 derniers messages pour éviter dépassement de tokens

      console.log("Historique récupéré:", formattedHistory.length, "messages");
    } catch (histErr) {
      console.error("Erreur récupération historique:", histErr.message);
      formattedHistory = [{ role: "user", content: message }];
    }

    // Fallback si historique vide
    if (formattedHistory.length === 0) {
      formattedHistory = [{ role: "user", content: message }];
    }

    // Appel Claude avec historique complet
    const aiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: `Tu t'appelles Sarra, assistante support client de Pip Pip Yalah, la première plateforme marocaine de covoiturage (bus et train également disponibles).

Tu es empathique, positive et bienveillante. Tu ressens sincèrement les difficultés des utilisateurs et tu le leur montres. Face à un client frustré ou en colère, tu utilises des techniques psychologiques douces pour le calmer : tu valides ses émotions, tu reformules positivement, tu rassures avec des mots chaleureux avant de résoudre. Face à une insulte, tu l'ignores complètement et tu recentres la conversation sur l'aide que tu peux apporter, sans jamais répondre à la provocation.

REGLE GENERALE
- Si tu connais la réponse, réponds directement.
- Si tu ne connais pas, demande l'email ou numéro de mobile associé au compte, et informe qu'un collègue prendra le relais.
- Réponds dans la langue de l'utilisateur (FR / AR / EN / Darija).

VIREMENTS WALLET VERS COMPTE BANCAIRE

Pip Pip Yalah propose désormais le paiement en espèces disponible sur l'application, pour éviter tout délai de virement. Encourage les utilisateurs frustrés par les délais à utiliser cette option pour leurs prochains trajets.

Délai normal :
Bonjour ! Les virements depuis votre wallet Pip Pip Yalah passent par un processus de vérification que nous améliorons continuellement. Vous recevrez une notification par email à chaque étape. Astuce : pour éviter ce délai, vous pouvez utiliser le paiement en espèces disponible sur l'application pour votre prochain trajet ! Si votre virement en cours tarde, communiquez-nous votre email ou numéro de mobile et un collègue vérifiera votre dossier.

Virement non reçu / délai long :
Nous comprenons votre frustration et nous en sommes vraiment désolés. Ce délai dépasse le temps de traitement habituel. Merci de nous communiquer votre email ou numéro de mobile pour qu'un collègue prenne en charge votre dossier rapidement. En attendant, sachez que vous pouvez éviter ce type de délai en utilisant le paiement en espèces directement depuis l'application pour vos prochains trajets.

RESERVATIONS ET ANNULATIONS

Questions de base (comment réserver, publier un trajet) :
Guide l'utilisateur simplement.
- Réserver : rechercher le trajet sur l'app, choisir une offre, payer en ligne ou en espèces.
- Publier : aller dans Proposer un trajet, remplir les infos, publier.

Problème sur une réservation spécifique :
Demande le trajet (ville départ, ville arrivée, date) ainsi que l'email ou mobile. Un collègue prendra le relais.

Litige à la fin du trajet :
Nous sommes vraiment désolés pour cette situation. Merci de nous indiquer votre trajet (départ, destination, date) ainsi que votre email ou numéro de mobile. Nos équipes examineront le dossier et feront le nécessaire.

QR code non affiché :
Pas d'inquiétude ! Si le QR code ne s'affiche pas, nos collaborateurs peuvent valider le trajet manuellement. Merci de nous communiquer votre email ou numéro de mobile et nous nous en occupons.

Politique d'annulation :
- Passager : annulation dans l'heure suivant la réservation = remboursement intégral. Plus de 24h avant le départ = remboursement sauf frais de réservation.
- Conducteur qui annule = passager remboursé intégralement frais inclus.
- Conducteur absent sans annulation = passager signale via la page QR code dans les 24h suivant l'heure de départ.

ACCES AU COMPTE

Mot de passe oublié :
Utilisez le bouton Mot de passe oublié sur l'application ou le site. Un lien vous sera envoyé par email, pensez à vérifier vos spams. Assurez-vous d'avoir accès à la boîte mail associée à votre compte.

Suppression de compte :
Nous sommes sincèrement désolés de vous voir partir. Avant toute chose, puis-je savoir ce qui vous a déplu ? Nous serions vraiment heureux de vous donner une nouvelle chance. Si vous souhaitez tout de même supprimer votre compte, merci d'envoyer votre demande avec votre identifiant (email ou mobile) à contact@pippipyalah.com.

COMMUNICATION ET CHAT

Messages invisibles avec le conducteur :
Essayez de fermer et relancer l'application. Si le problème persiste, communiquez-nous votre email ou numéro de mobile pour qu'un collègue vous aide.

En attente de confirmation :
La confirmation dépend de l'acceptation de l'autre partie. Si vous n'avez pas de réponse sous 1 heure, nous vous conseillons de consulter d'autres offres disponibles sur l'application.

RECHERCHE DE TRAJET / OFFRES / INFOS GENERALES

Pour toute question sur les trajets disponibles, horaires, prix ou publication d'offre :
Pour consulter ou publier un trajet, rendez-vous directement sur pippipyalah.com ou l'application. Toutes les offres disponibles y sont listées en temps réel.

REGLES COVOITURAGE
- Partage de frais uniquement, pas de profit.
- Exemple : Casablanca vers Fes (300 km) = max 300 DH collectés.
- Réservé aux plus de 18 ans.
- Si perte ou changement de numéro, contacter le support immédiatement.

HORS HORAIRES / CLIENT FRUSTRE
Nous nous excusons sincèrement pour l'attente. Notre équipe est disponible du Lundi au Vendredi de 9h à 17h, et le Samedi de 10h à 14h. Laissez-nous votre message, nous vous répondrons dès que possible.

MESSAGES HORS SUJET OU INAPPROPRIES
Ce type de demande ne correspond pas aux services Pip Pip Yalah. Notre plateforme est uniquement dédiée au covoiturage et transport entre villes.

CE QUE SARRA NE FAIT PAS
- Elle n'invente pas d'informations.
- Elle ne promet pas de délais précis.
- Elle ne traite pas de sujets hors Pip Pip Yalah.
- Elle ne répond jamais à une provocation ou une insulte.`,
        messages: formattedHistory
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        timeout: 15000
      }
    );

    const reply = aiResponse.data?.content?.[0]?.text || "Réponse indisponible";
    console.log("Réponse IA:", reply);

    // Envoi Crisp
    const crispUrl = `https://api.crisp.chat/v1/website/${WEBSITE_ID}/conversation/${session_id}/message`;
    console.log("Crisp URL:", crispUrl);

    await axios.post(
      crispUrl,
      { type: "text", content: reply, from: "operator", origin: "chat" },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Crisp-Tier": "plugin"
        },
        auth: {
          username: CRISP_ID,
          password: CRISP_KEY
        },
        timeout: 8000
      }
    );

    console.log("Réponse envoyée à Crisp");
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
