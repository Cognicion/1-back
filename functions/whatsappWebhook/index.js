const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { createWebhookHandler } = require("./handler");
const { createEventStore } = require("./store");

const WHATSAPP_WEBHOOK_VERIFY_TOKEN = defineSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
const META_APP_SECRET = defineSecret("META_APP_SECRET");

function createWhatsAppWebhook({ db, logger }) {
  return onRequest({
    region: "us-central1",
    invoker: "public",
    cors: false,
    secrets: [WHATSAPP_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET],
    timeoutSeconds: 15,
    memory: "256MiB",
    maxInstances: 5
  }, createWebhookHandler({
    getVerifyToken: () => WHATSAPP_WEBHOOK_VERIFY_TOKEN.value(),
    getAppSecret: () => META_APP_SECRET.value(),
    recordEvents: createEventStore({ db }),
    logger
  }));
}

module.exports = { createWhatsAppWebhook };
