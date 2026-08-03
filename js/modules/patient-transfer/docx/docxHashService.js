export async function calculateDocxHash(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function calculateNormalizedTextHash(text = "") {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const buffer = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
