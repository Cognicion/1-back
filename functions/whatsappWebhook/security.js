const { createHash, createHmac, timingSafeEqual } = require("node:crypto");

function verifyToken(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string" || !candidate || !expected || candidate.length > 4096) return false;
  const digest = (value) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

function verifySignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof appSecret !== "string" || !appSecret) return false;
  if (typeof signature !== "string" || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

module.exports = { verifyToken, verifySignature };
