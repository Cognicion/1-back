const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("calendar/googleCalendar.js", "utf8");

test("usa state aleatorio, asociado al UID, con expiración y eliminación de un solo uso", () => {
  assert.match(source, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(source, /_googleCalendarOAuthStates\/\$\{state\}/);
  assert.match(source, /expiresAt: admin\.firestore\.Timestamp\.fromMillis/);
  assert.match(source, /await stateRef\.delete\(\)/);
});

test("cifra tokens con AES-256-GCM, IV aleatorio y authentication tag", () => {
  assert.match(source, /createCipheriv\("aes-256-gcm", keyBytes\(\), iv\)/);
  assert.match(source, /randomBytes\(12\)/);
  assert.match(source, /cipher\.getAuthTag\(\)/);
  assert.match(source, /decipher\.setAuthTag\(tag\)/);
  assert.match(source, /refreshTokenEncrypted/);
});

test("mantiene tokens en una colección backend exclusiva y no los devuelve", () => {
  assert.match(source, /const TOKEN_COLLECTION = "_googleCalendarTokens"/);
  assert.match(source, /db\.doc\(`\$\{TOKEN_COLLECTION\}\/\$\{uid\}`\)/);
  assert.doesNotMatch(source, /return \{[^}]*refreshTokenEncrypted/);
});

test("mantiene scopes limitados al calendario y no al conjunto de servicios Google", () => {
  assert.match(source, /calendar\.events/);
  assert.match(source, /calendar\.calendarlist\.readonly/);
  assert.doesNotMatch(source, /auth\/drive|auth\/gmail|auth\/userinfo/);
});
