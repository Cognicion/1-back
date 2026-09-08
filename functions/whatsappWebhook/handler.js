const { verifyToken, verifySignature } = require("./security");
const { parseWebhookPayload, PayloadLimitError } = require("./parser");

const MAX_BODY_BYTES = 1024 * 1024;

function createWebhookHandler({ getVerifyToken, getAppSecret, recordEvents, logger, now = Date.now }) {
  // No request/error object is ever passed to the logger (including on failure).
  const log = (fields) => {
    try { logger.info("[WHATSAPP_WEBHOOK]", fields); } catch { /* logging must not alter delivery */ }
  };
  return async function whatsappWebhook(request, response) {
    response.set("Cache-Control", "no-store");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "POST") {
      response.set("Allow", "GET, POST");
      return response.status(405).send("Method not allowed");
    }
    if (request.method === "GET") {
      let expected;
      try { expected = getVerifyToken(); } catch { return response.status(503).send("Unavailable"); }
      if (typeof expected !== "string" || !expected) return response.status(503).send("Unavailable");
      const query = request.query || {};
      if (query["hub.mode"] !== "subscribe" || !verifyToken(query["hub.verify_token"], expected)) {
        return response.status(403).send("Forbidden");
      }
      const challenge = query["hub.challenge"];
      if (typeof challenge !== "string" || !challenge.length || challenge.length > 4096) {
        return response.status(400).send("Invalid challenge");
      }
      return response.status(200).type("text/plain").send(challenge);
    }

    const rawBody = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) return response.status(400).send("Raw body required");
    if (rawBody.length > MAX_BODY_BYTES) return response.status(413).send("Payload too large");
    let appSecret;
    try { appSecret = getAppSecret(); } catch { return response.status(503).send("Unavailable"); }
    if (typeof appSecret !== "string" || !appSecret) return response.status(503).send("Unavailable");
    if (!verifySignature(rawBody, request.headers?.["x-hub-signature-256"], appSecret)) {
      return response.status(403).send("Forbidden");
    }
    let events;
    try {
      // Firebase Request.rawBody contains the original Buffer. Never serialize
      // request.body to authenticate or parse an authenticated request.
      events = parseWebhookPayload(JSON.parse(rawBody.toString("utf8")), now());
    } catch (error) {
      return response.status(error instanceof PayloadLimitError ? 413 : 400).send("Invalid payload");
    }
    let results;
    try {
      // Only a bounded atomic receipt write precedes ACK. No external API,
      // media download, AI, appointment action or post-response work here.
      results = await recordEvents(events);
    } catch {
      log({ eventType: "storage.unavailable", hasMessage: false, messageType: null, timestamp: now(), deduplicated: false });
      // Never acknowledge a receipt lost to Firestore failure; allow redelivery.
      return response.status(503).send("Unavailable");
    }
    events.forEach((event, index) => {
      log({
        eventType: event.eventType,
        hasMessage: event.eventType === "message" || event.eventType === "message.unidentified",
        messageType: event.messageType,
        timestamp: event.receivedAt,
        deduplicated: results[index].deduplicated
      });
    });
    return response.status(200).type("text/plain").send("EVENT_RECEIVED");
  };
}

module.exports = { createWebhookHandler, MAX_BODY_BYTES };
