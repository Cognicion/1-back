import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, service, agenda] = await Promise.all([
  readFile(new URL("../agenda.html", import.meta.url), "utf8"),
  readFile(new URL("../js/services/googleCalendarService.js", import.meta.url), "utf8"),
  readFile(new URL("../js/agenda.js", import.meta.url), "utf8")
]);
assert.match(html, /data-google-calendar-connect/);
assert.match(service, /googleCalendarConnect/);
assert.match(service, /getGoogleCalendarConnectionStatus/);
assert.doesNotMatch(service, /client_secret|refresh_token|access_token/i);
assert.match(agenda, /history\.replaceState/);
console.log("google-calendar-oauth-ui-static.test.mjs OK");
