import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const root = new URL("../", import.meta.url);
const origin = "https://cognicion-57052.web.app";
const digest = value => createHash("sha256").update(value).digest("hex");
const paths = ["index.html", "js/config/appVersion.js"];
const expected = await Promise.all(paths.map(async path => ({
  path, hash: digest(await readFile(new URL(path, root)))
})));
let lastFailure = "";
for (let attempt = 0; attempt < 6; attempt += 1) {
  const results = await Promise.all(expected.map(async ({ path, hash }) => {
    try {
      const url = new URL(path, origin);
      url.searchParams.set("release", process.env.GITHUB_SHA || String(Date.now()));
      const response = await fetch(url, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(10000) });
      return response.ok && digest(Buffer.from(await response.arrayBuffer())) === hash;
    } catch { return false; }
  }));
  if (results.every(Boolean)) {
    console.log("Hosting confirmado: index y version coinciden con el commit publicado.");
    process.exit(0);
  }
  lastFailure = expected.filter((_, i) => !results[i]).map(item => item.path).join(", ");
  if (attempt < 5) await delay(3000);
}
throw new Error("Hosting todavia no coincide con este commit: " + lastFailure);

