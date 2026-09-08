const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { createServer, request: httpRequest } = require("node:http");
const { once } = require("node:events");
const express = require("express");
const { verifyToken, verifySignature } = require("../whatsappWebhook/security");
const { parseWebhookPayload, MAX_EVENTS } = require("../whatsappWebhook/parser");
const { createEventStore, eventIdHash } = require("../whatsappWebhook/store");
const { createWebhookHandler, MAX_BODY_BYTES } = require("../whatsappWebhook/handler");
const { createWhatsAppWebhook } = require("../whatsappWebhook");

// These are public, synthetic fixtures; never production secret values.
const VERIFY = "test-only-verification-fixture";
const SECRET = "test-only-hmac-fixture";
const CLOCK = 1_788_912_000_000;
const PRIVATE_TEXT = "SYNTHETIC_PRIVATE_TEXT_DO_NOT_LOG";
const PRIVATE_PHONE = "15550000001";
const PRIVATE_NAME = "SYNTHETIC_PRIVATE_NAME";
function payload(messages = [{ id: "wamid.synthetic-1", type: "text", text: { body: PRIVATE_TEXT }, from: PRIVATE_PHONE }], statuses) {
  return { object: "whatsapp_business_account", entry: [{ id: "synthetic-waba", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: PRIVATE_PHONE, phone_number_id: "synthetic-phone-id" },
    contacts: [{ wa_id: PRIVATE_PHONE, profile: { name: PRIVATE_NAME } }], messages, ...(statuses ? { statuses } : {})
  } }] }] };
}
const sign = (body, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const post = (body = payload()) => {
  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return { method: "POST", rawBody, headers: { "x-hub-signature-256": sign(rawBody) } };
};
const get = (query = {}) => ({ method: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "001234", ...query } });
function response() {
  return { statusCode: 200, headers: {}, sent: false,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    type(value) { this.contentType = value; return this; },
    send(value) { this.body = value; this.sent = true; return this; }
  };
}
function memoryDb() {
  const docs = new Map();
  let tail = Promise.resolve();
  let transactions = 0;
  return { docs, get transactions() { return transactions; },
    collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
    runTransaction(callback) {
      transactions++;
      const work = tail.then(async () => {
        const writes = [];
        const result = await callback({
          getAll: async (...refs) => refs.map((ref) => ({ exists: docs.has(ref.path) })),
          create: (ref, data) => writes.push([ref.path, data])
        });
        for (const [path, data] of writes) {
          assert.equal(docs.has(path), false);
          docs.set(path, data);
        }
        return result;
      });
      tail = work.catch(() => {});
      return work;
    }
  };
}
function fixture(overrides = {}) {
  const db = memoryDb(), logs = [];
  const logger = { info: (...args) => logs.push(args) };
  const handler = createWebhookHandler({ getVerifyToken: () => VERIFY, getAppSecret: () => SECRET,
    recordEvents: createEventStore({ db }), logger, now: () => CLOCK, ...overrides });
  return { db, logs, logger, handler, async invoke(req) { const res = response(); await handler(req, res); return res; } };
}

test("GET correct verification returns the exact challenge as plain text", async () => {
  const f = fixture(), res = await f.invoke(get());
  assert.equal(res.statusCode, 200); assert.equal(res.body, "001234");
  assert.equal(res.contentType, "text/plain"); assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(f.db.transactions, 0); assert.deepEqual(f.logs, []);
});
test("GET invalid token or mode is 403, with no reflected token", async () => {
  for (const query of [{ "hub.verify_token": "wrong" }, { "hub.verify_token": [VERIFY] }, { "hub.mode": "wrong" }, { "hub.verify_token": undefined }]) {
    const f = fixture(), res = await f.invoke(get(query));
    assert.equal(res.statusCode, 403); assert.equal(res.body, "Forbidden"); assert.deepEqual(f.logs, []);
  }
});
test("GET missing, empty or nonscalar challenge is 400", async () => {
  for (const value of [undefined, "", ["1"], { text: "1" }]) assert.equal((await fixture().invoke(get({ "hub.challenge": value }))).statusCode, 400);
});
test("missing runtime secrets fail closed (503)", async () => {
  assert.equal((await fixture({ getVerifyToken: () => "" }).invoke(get())).statusCode, 503);
  assert.equal((await fixture({ getAppSecret: () => { throw new Error(SECRET); } }).invoke(post())).statusCode, 503);
  assert.equal((await fixture({ getAppSecret: () => "" }).invoke(post())).statusCode, 503);
});
test("POST valid HMAC is accepted without Firebase Auth", async () => {
  const f = fixture(), res = await f.invoke(post());
  assert.equal(res.statusCode, 200); assert.equal(res.body, "EVENT_RECEIVED"); assert.equal(f.db.docs.size, 1);
});
test("POST invalid signature rejects before parsing or persistence", async () => {
  const f = fixture(), req = post(Buffer.from("not-json"));
  req.headers["x-hub-signature-256"] = sign(req.rawBody, "wrong-fixture");
  assert.equal((await f.invoke(req)).statusCode, 403); assert.equal(f.db.transactions, 0); assert.deepEqual(f.logs, []);
});
test("POST missing, malformed, duplicate and non-sha256 signatures are rejected", async () => {
  for (const signature of [undefined, "", "sha256=00", "sha256=" + "z".repeat(64), "sha1=" + "a".repeat(64), ["sha256=" + "a".repeat(64)]]) {
    const f = fixture(), req = post(); req.headers["x-hub-signature-256"] = signature;
    assert.equal((await f.invoke(req)).statusCode, 403); assert.equal(f.db.docs.size, 0);
  }
});
test("HMAC authenticates original UTF-8 bytes, whitespace and escapes, never reserialized JSON", async () => {
  const original = Buffer.from(JSON.stringify(payload(), null, 2).replace(PRIVATE_TEXT, "sintético \\u00f1"));
  const reserialized = Buffer.from(JSON.stringify(JSON.parse(original.toString())));
  assert.notDeepEqual(original, reserialized);
  assert.equal(verifySignature(original, sign(original), SECRET), true);
  assert.equal(verifySignature(reserialized, sign(original), SECRET), false);
  const req = post(original);
  Object.defineProperty(req, "body", { get() { throw new Error("request.body must never be accessed"); } });
  assert.equal((await fixture().invoke(req)).statusCode, 200);
});
test("POST missing raw Buffer cannot fall back to request.body", async () => {
  const req = post(); req.body = payload(); delete req.rawBody;
  assert.equal((await fixture().invoke(req)).statusCode, 400);
  req.rawBody = JSON.stringify(req.body); assert.equal((await fixture().invoke(req)).statusCode, 400);
});
test("signed malformed JSON is rejected without storing or logging payload", async () => {
  const f = fixture(); assert.equal((await f.invoke(post(Buffer.from(PRIVATE_TEXT)))).statusCode, 400);
  assert.equal(f.db.docs.size, 0); assert.deepEqual(f.logs, []);
});
test("messages parser projects only technical fields", () => {
  assert.deepEqual(parseWebhookPayload(payload(), CLOCK), [{ provider: "whatsapp", eventType: "message", messageId: "wamid.synthetic-1", messageType: "text", receivedAt: CLOCK }]);
});
for (const type of ["text", "interactive", "button"]) test(`parser recognizes ${type} without propagating its content`, async () => {
  const f = fixture(); await f.invoke(post(payload([{ id: `wamid.synthetic-${type}`, type, [type]: { body: PRIVATE_TEXT, payload: PRIVATE_PHONE } }])));
  const saved = [...f.db.docs.values()][0]; assert.equal(saved.messageType, type);
  assert.equal(JSON.stringify(saved).includes(PRIVATE_TEXT), false);
});
test("statuses sent/delivered/read/failed are distinct from inbound messages", async () => {
  const f = fixture();
  const statuses = ["sent", "delivered", "read", "failed"].map((status) => ({ id: "wamid.synthetic-1", status, recipient_id: PRIVATE_PHONE, errors: [{ message: PRIVATE_TEXT }] }));
  assert.equal((await f.invoke(post(payload([], statuses)))).statusCode, 200);
  assert.deepEqual([...f.db.docs.values()].map((d) => d.eventType), statuses.map((s) => `status.${s.status}`));
  assert.ok(f.logs.every(([, fields]) => fields.hasMessage === false && fields.messageType === null));
});
test("unknown envelope, field and status are safely ACKed without persistence", async () => {
  for (const body of [null, {}, { object: "another-provider", entry: [] }, { object: "whatsapp_business_account", entry: [null] },
    payload([], [{ id: "wamid.synthetic-1", status: PRIVATE_TEXT }]),
    { object: "whatsapp_business_account", entry: [{ changes: [{ field: PRIVATE_TEXT, value: {} }] }] }]) {
    const f = fixture(); assert.equal((await f.invoke(post(body))).statusCode, 200);
    assert.equal(f.db.transactions, 0); assert.equal(JSON.stringify(f.logs).includes(PRIVATE_TEXT), false);
  }
});
test("missing official message ID never creates a potentially actionable receipt", async () => {
  const f = fixture(); await f.invoke(post(payload([{ type: "text", text: { body: PRIVATE_TEXT } }])));
  assert.equal(f.db.docs.size, 0); assert.equal(f.logs[0][1].eventType, "message.unidentified");
});
test("unknown message type cannot inject arbitrary log values", async () => {
  const f = fixture(); await f.invoke(post(payload([{ id: "wamid.synthetic-1", type: PRIVATE_PHONE }])));
  assert.equal(f.logs[0][1].messageType, "unknown"); assert.equal(JSON.stringify(f.logs).includes(PRIVATE_PHONE), false);
});
test("same messageId twice produces one receipt and deduplicated true on retry", async () => {
  const f = fixture(); await f.invoke(post()); await f.invoke(post());
  assert.equal(f.db.docs.size, 1); assert.deepEqual(f.logs.map(([, d]) => d.deduplicated), [false, true]);
});
test("duplicate messages inside one batch and concurrent requests are suppressed", async () => {
  const f = fixture(); const message = { id: "wamid.synthetic-batch", type: "button" };
  await Promise.all(Array.from({ length: 8 }, () => f.invoke(post(payload([message, message])))));
  assert.equal(f.db.docs.size, 1); assert.equal(f.logs.filter(([, d]) => !d.deduplicated).length, 1);
});
test("dedup key is stable across message type/content, receipt time and secret rotation", () => {
  const event = parseWebhookPayload(payload(), CLOCK)[0];
  assert.equal(eventIdHash(event), eventIdHash({ ...event, messageType: "button", receivedAt: CLOCK + 1000 }));
  assert.notEqual(eventIdHash(event), eventIdHash({ ...event, eventType: "status.sent" }));
  assert.match(eventIdHash(event), /^[a-f0-9]{64}$/);
});
for (const [label, sensitive] of [["phone", PRIVATE_PHONE], ["text", PRIVATE_TEXT], ["name", PRIVATE_NAME], ["verify token", VERIFY], ["App Secret", SECRET], ["official message ID", "wamid.synthetic-1"]]) test(`logs and persisted receipt contain no ${label}`, async () => {
  const f = fixture(); await f.invoke(get()); await f.invoke(post()); await f.invoke(post());
  const serialized = JSON.stringify({ logs: f.logs, docs: [...f.db.docs] });
  assert.equal(serialized.includes(sensitive), false);
  for (const [, fields] of f.logs) assert.deepEqual(Object.keys(fields).sort(), ["deduplicated", "eventType", "hasMessage", "messageType", "timestamp"]);
});
test("Firestore failure returns 503 for retry and sanitizes exception details", async () => {
  const f = fixture({ recordEvents: async () => { throw new Error(`${PRIVATE_PHONE} ${PRIVATE_TEXT} ${SECRET}`); } });
  const res = await f.invoke(post()); assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(f.logs).includes(PRIVATE_TEXT), false); assert.equal(res.body, "Unavailable");
});
test("logger failure does not change a durably accepted receipt", async () => {
  assert.equal((await fixture({ logger: { info() { throw new Error("synthetic logger failure"); } } }).invoke(post())).statusCode, 200);
});
test("all methods other than GET/POST return 405 and Allow", async () => {
  for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
    const f = fixture(); const res = await f.invoke({ method });
    assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, "GET, POST"); assert.equal(f.db.transactions, 0);
  }
});
test("ACK waits only for technical receipt persistence, never runs work after sending", async () => {
  let release, committed = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const f = fixture({ recordEvents: async (events) => { await barrier; committed = true; return events.map(() => ({ deduplicated: false })); } });
  const res = response(); const work = f.handler(post(), res);
  await new Promise(setImmediate); assert.equal(res.sent, false);
  release(); await work; assert.equal(committed, true); assert.equal(res.statusCode, 200);
});
test("fast ACK with healthy mocked persistence, without external APIs", async () => {
  const started = performance.now(); const res = await fixture().invoke(post());
  assert.equal(res.statusCode, 200); assert.ok(performance.now() - started < 1000);
});
test("raw body and normalized batch size limits reject without partial persistence", async () => {
  const f = fixture(); const oversized = Buffer.alloc(MAX_BODY_BYTES + 1);
  assert.equal((await f.invoke(post(oversized))).statusCode, 413);
  const many = Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ({ id: `wamid.synthetic-${i}`, type: "text" }));
  assert.equal((await f.invoke(post(payload(many)))).statusCode, 413); assert.equal(f.db.docs.size, 0);
});
test("verification token matches exactly and fails on invalid inputs", () => {
  assert.equal(verifyToken(VERIFY, VERIFY), true);
  for (const candidate of [null, {}, [], "", VERIFY.toUpperCase(), VERIFY + " "]) assert.equal(verifyToken(candidate, VERIFY), false);
});
test("deployment contract: public onRequest, us-central1, bound secrets, reused Admin", () => {
  const webhook = createWhatsAppWebhook({ db: memoryDb(), logger: { info() {} } });
  assert.equal(webhook.__endpoint.platform, "gcfv2");
  assert.deepEqual(webhook.__endpoint.region, ["us-central1"]);
  assert.deepEqual(webhook.__endpoint.httpsTrigger.invoker, ["public"]);
  assert.deepEqual(webhook.__endpoint.secretEnvironmentVariables.map((s) => s.key).sort(), ["META_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]);
  const index = readFileSync(require.resolve("../index.js"), "utf8");
  assert.match(index, /exports\.whatsappWebhook = createWhatsAppWebhook\(\{ db: adminDb, logger, prepareWork: whatsappBot\.prepareWork, ingressSecrets: whatsappBot\.ingressSecrets \}\)/);
  for (const file of ["security", "parser", "store", "handler", "index"]) {
    const source = readFileSync(require.resolve(`../whatsappWebhook/${file}.js`), "utf8");
    assert.doesNotMatch(source, /initializeApp\(|onCall\(|fetch\(|graph\.facebook|AppointmentService|openai|sofia/i);
  }
  const ignore = readFileSync(require.resolve("../../.gitignore"), "utf8");
  assert.match(ignore, /functions\/\.secret\.local/);
});
test("real HTTP JSON middleware preserves raw bytes through the Firebase onRequest wrapper", async (t) => {
  const previous = { verify: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, secret: process.env.META_APP_SECRET };
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY; process.env.META_APP_SECRET = SECRET;
  const f = fixture(), app = express();
  // Same verify hook used by Firebase's HTTP runtime; real JSON middleware.
  app.use(express.json({ verify(req, _res, bytes) { req.rawBody = bytes; } }));
  app.all("/webhook", createWhatsAppWebhook({ db: f.db, logger: f.logger }));
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const [name, value] of [["WHATSAPP_WEBHOOK_VERIFY_TOKEN", previous.verify], ["META_APP_SECRET", previous.secret]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const call = (method, path, body = Buffer.alloc(0), signature) => new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port: server.address().port, path, method,
      headers: { "content-type": "application/json", "content-length": body.length, ...(signature ? { "x-hub-signature-256": signature } : {}) } }, (res) => {
      const chunks = []; res.on("data", (chunk) => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: res.headers }));
    });
    req.on("error", reject); req.end(body);
  });
  const body = Buffer.from(JSON.stringify(payload(), null, 2));
  assert.equal((await call("POST", "/webhook", body, sign(body))).status, 200);
  assert.equal((await call("POST", "/webhook", body)).status, 403);
  assert.equal((await call("POST", "/webhook", Buffer.from(JSON.stringify(JSON.parse(body))), sign(body))).status, 403);
  assert.equal((await call("OPTIONS", "/webhook")).status, 405);
  const result = await call("GET", `/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=001234`);
  assert.equal(result.status, 200); assert.equal(result.body, "001234"); assert.match(result.headers["content-type"], /^text\/plain/);
});
