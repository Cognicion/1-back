const CHANNEL_NAME = "cognicion.sofia.patient-pattern-context";

export function openSofiaWithPatternContext(context = {}, windowRef = window) {
  const patientId = String(context.patientId || "").trim();
  const patternId = String(context.patternId || "").trim();
  if (!patientId || !patternId) return false;
  const target = windowRef.open("./sofia.html#patient-patterns", "cognicion-sofia");
  if (!target) return false;
  if (!("BroadcastChannel" in windowRef)) {
    target.focus();
    return true;
  }
  const channel = new windowRef.BroadcastChannel(CHANNEL_NAME);
  const message = {
    type: "cognicion:patient-pattern-context",
    patientId,
    patternId,
    instrumentId: context.instrumentId || null,
    contextType: "clinical_pattern",
    expiresAt: Date.now() + 8000
  };
  let attempts = 0;
  const timer = windowRef.setInterval(() => {
    attempts += 1;
    channel.postMessage(message);
    if (attempts >= 16) {
      windowRef.clearInterval(timer);
      channel.close();
    }
  }, 300);
  target.focus();
  return true;
}

export function listenForSofiaPatternContext(handler, windowRef = window) {
  if (!("BroadcastChannel" in windowRef) || typeof handler !== "function") return () => {};
  const channel = new windowRef.BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "cognicion:patient-pattern-context" || Number(message.expiresAt) < Date.now()) return;
    handler({
      patientId: String(message.patientId || ""),
      patternId: String(message.patternId || ""),
      instrumentId: message.instrumentId ? String(message.instrumentId) : null,
      contextType: "clinical_pattern"
    });
  });
  return () => channel.close();
}

export { CHANNEL_NAME };
