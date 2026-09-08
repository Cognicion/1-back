const { createHash } = require("node:crypto");
const { Timestamp } = require("firebase-admin/firestore");
const { MAX_EVENTS } = require("./parser");

const COLLECTION = "whatsappWebhookEvents";
const EVENT_TYPES = new Set(["message", "status.sent", "status.delivered", "status.read", "status.failed"]);

function eventIdHash(event) {
  if (!event.messageId || !EVENT_TYPES.has(event.eventType)) return null;
  // A message's key does not depend on content, type, receipt time or secrets
  // (secret rotation must not turn a redelivery into a new message).
  // Each outbound status has its own key; sent must not consume delivered/read.
  return createHash("sha256").update(JSON.stringify(["whatsapp", event.eventType, event.messageId])).digest("hex");
}

function createEventStore({ db, prepareWork = null }) {
  return async function recordEvents(events, payload) {
    if (events.length > MAX_EVENTS) throw new Error("webhook-event-limit");
    const unique = new Map();
    for (const event of events) {
      const key = eventIdHash(event);
      if (key && !unique.has(key)) unique.set(key, event);
    }
    if (!unique.size) return events.map(() => ({ recorded: false, deduplicated: false, eventIdHash: null }));
    const entries = [...unique];
    const work = prepareWork ? await prepareWork(entries, payload) : new Map();
    const existing = await db.runTransaction(async (tx) => {
      const refs = entries.map(([key]) => db.collection(COLLECTION).doc(key));
      const snapshots = await tx.getAll(...refs);
      const found = new Set();
      entries.forEach(([key, event], index) => {
        if (snapshots[index].exists) {
          found.add(key);
          return;
        }
        // This is a technical receipt, not a conversation or a bot work queue.
        tx.create(refs[index], {
          schemaVersion: 1,
          provider: "whatsapp",
          eventIdHash: key,
          eventType: event.eventType,
          messageType: event.messageType,
          receivedAt: Timestamp.fromMillis(event.receivedAt)
        });
        // Receipt and encrypted work become durable in the SAME transaction.
        // Historical receipts never acquire jobs on replay.
        if (work.has(key)) tx.create(db.doc(`whatsappBotJobs/${key}`), work.get(key));
      });
      return found;
    }, { maxAttempts: 3 });
    const seen = new Set(existing);
    return events.map((event) => {
      const key = eventIdHash(event);
      if (!key) return { recorded: false, deduplicated: false, eventIdHash: null };
      const deduplicated = seen.has(key);
      seen.add(key);
      return { recorded: !deduplicated, deduplicated, eventIdHash: key };
    });
  };
}

module.exports = { createEventStore, eventIdHash, COLLECTION };
