const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("la integración no contiene secretos concretos ni refresh tokens legibles", () => {
  const source = fs.readFileSync("calendar/googleCalendar.js", "utf8");
  assert.match(source, /defineSecret\("GOOGLE_CLIENT_SECRET"\)/);
  assert.match(source, /refreshTokenEncrypted/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
});

test("las funciones de calendario se exportan desde el entrypoint v2", () => {
  const source = fs.readFileSync("index.js", "utf8");
  assert.match(source, /Object\.assign\(exports, calendar\)/);
});
