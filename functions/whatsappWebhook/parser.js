const MESSAGE_TYPES = new Set([
  "text", "interactive", "button", "image", "audio", "video", "document",
  "sticker", "contacts", "location", "reaction", "order", "system", "unknown"
]);
const STATUS_TYPES = new Set(["sent", "delivered", "read", "failed"]);
const MAX_EVENTS = 100;

class PayloadLimitError extends Error {
  constructor() { super("webhook-event-limit"); }
}

function messageId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !/\s/.test(value) ? value : null;
}

// Only this projection leaves the parser. Bodies, contacts, media, metadata,
// errors and arbitrary provider strings never become logs or persisted data.
function parseWebhookPayload(payload, receivedAt) {
  const events = [];
  const append = (eventType, id = null, messageType = null) => {
    if (events.length >= MAX_EVENTS) throw new PayloadLimitError();
    events.push({ provider: "whatsapp", eventType, messageId: id, messageType, receivedAt });
  };
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    append("unknown");
    return events;
  }
  for (const entry of payload.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== "messages" || value?.messaging_product !== "whatsapp") {
        append("unknown");
        continue;
      }
      let found = false;
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const id = messageId(message?.id);
        append(id ? "message" : "message.unidentified", id, MESSAGE_TYPES.has(message?.type) ? message.type : "unknown");
        found = true;
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const id = messageId(status?.id);
        append(id && STATUS_TYPES.has(status?.status) ? `status.${status.status}` : "unknown", id);
        found = true;
      }
      if (!found) append("unknown");
    }
  }
  if (!events.length) append("unknown");
  return events;
}

module.exports = { parseWebhookPayload, PayloadLimitError, MAX_EVENTS };
