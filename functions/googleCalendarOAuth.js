const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { randomBytes, createHash } = require("node:crypto");
const { Timestamp } = require("firebase-admin/firestore");
const { isAdmin, isProfessional } = require("./clinicalAnalytics/access");
const {
  GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  GOOGLE_CALENDAR_KMS_KEY_NAME,
  REGION,
  REQUIRED_SCOPES
} = require("./googleCalendar/config");
const { kmsRequest } = require("./googleCalendar/credentials");
const REDIRECT_URI = "https://us-central1-cognicion-57052.cloudfunctions.net/googleCalendarOAuthCallback";
const AGENDA_REDIRECT = "https://cognicionlabs.com/agenda.html";
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const SCOPES = REQUIRED_SCOPES;
const STATE_TTL_MS = 10 * 60 * 1000;

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken(bytes = 32) { return base64Url(randomBytes(bytes)); }
function hashState(state) { return createHash("sha256").update(state).digest("hex"); }
function redirectUrl(params) {
  const query = new URLSearchParams(params);
  return `${AGENDA_REDIRECT}?${query.toString()}#configuracionAgenda`;
}
function safeErrorReason(value) {
  const allowed = new Set(["access_denied", "invalid_grant", "state_invalid", "scope_insufficient", "internal"]);
  return allowed.has(String(value)) ? String(value) : "internal";
}
function assertAuth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
  return request.auth.uid;
}
async function assertProfessional(db, request) {
  const uid = assertAuth(request);
  const snapshot = await db.doc(`usuarios/${uid}`).get();
  const profile = snapshot.exists ? snapshot.data() || {} : {};
  if (!snapshot.exists || (!isProfessional(profile) && !isAdmin(profile, request.auth))) {
    throw new HttpsError("permission-denied", "Solo personal clínico autorizado puede conectar esta integración.");
  }
  return { uid, profile };
}

function pkceChallenge(verifier) { return base64Url(createHash("sha256").update(verifier).digest()); }
function isStateUsable(data, currentMs) {
  return Boolean(data && !data.usedAt && data.expiresAt && data.expiresAt.toMillis() > currentMs);
}
function buildAuthorizationUrl({ clientId, state, codeVerifier, promptConsent = false }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    state,
    code_challenge: pkceChallenge(codeVerifier),
    code_challenge_method: "S256"
  });
  if (promptConsent) params.set("prompt", "consent");
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

function createGoogleCalendarHandlers({ db, credential, fetchImpl = fetch, now = () => Date.now() }) {
  const kmsKeyName = () => GOOGLE_CALENDAR_KMS_KEY_NAME.value();
  const encryptRefreshToken = (token) => kmsRequest({ keyName: kmsKeyName(), operation: "encrypt", value: token, credential, fetchImpl });
  const decryptRefreshToken = (ciphertext) => kmsRequest({ keyName: kmsKeyName(), operation: "decrypt", value: Buffer.from(ciphertext, "base64"), credential, fetchImpl });

  async function audit(uid, action, result) {
    await db.collection("auditoria").add({
      accion: action,
      modulo: "Google Calendar",
      usuarioUid: uid,
      usuarioRol: "profesional",
      descripcion: "Operación de conexión de calendario.",
      exito: result === "success",
      fecha: Timestamp.fromMillis(now()),
      detalles: { actor: "doctor", canal: "web", resultado: result }
    });
  }

  const connect = onCall({ region: REGION, secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET], timeoutSeconds: 30 }, async (request) => {
    const { uid } = await assertProfessional(db, request);
    const state = randomToken(32);
    const stateHash = hashState(state);
    const codeVerifier = randomToken(48);
    const protectedVerifier = await encryptRefreshToken(codeVerifier);
    const createdAt = now();
    await db.doc(`googleCalendarOAuthStates/${stateHash}`).set({
      firebaseUid: uid,
      stateHash,
      codeVerifierEncrypted: protectedVerifier,
      createdAt: Timestamp.fromMillis(createdAt),
      expiresAt: Timestamp.fromMillis(createdAt + STATE_TTL_MS),
      usedAt: null
    });
    await audit(uid, "google_calendar_connect_started", "success");
    const previous = await db.doc(`googleCalendarConnections/${uid}`).get();
    const promptConsent = request.data?.reauthorize === true || previous.data()?.connectionStatus === "reauthorization_required";
    return { authorizationUrl: buildAuthorizationUrl({ clientId: GOOGLE_CALENDAR_CLIENT_ID.value(), state, codeVerifier, promptConsent }) };
  });

  const callback = onRequest({ region: REGION, secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET], timeoutSeconds: 60 }, async (request, response) => {
    if (request.method !== "GET") return response.status(405).send("Método no permitido.");
    const state = String(request.query.state || "");
    const stateHash = state ? hashState(state) : "";
    if (!stateHash) return response.status(400).send("Solicitud OAuth inválida.");
    const stateRef = db.doc(`googleCalendarOAuthStates/${stateHash}`);
    const current = now();
    const stateData = await db.runTransaction(async (tx) => {
      const stateSnapshot = await tx.get(stateRef);
      const data = stateSnapshot.exists ? stateSnapshot.data() || {} : null;
      if (!isStateUsable(data, current)) return null;
      tx.update(stateRef, { usedAt: Timestamp.fromMillis(current) });
      return data;
    });
    if (!stateData) {
      logger.warn("[GOOGLE_CALENDAR] OAuth state inválido", { reason: "invalid_state" });
      return response.redirect(redirectUrl({ googleCalendar: "error", reason: "state_invalid" }));
    }
    const uid = stateData.firebaseUid;
    if (request.query.error) {
      await audit(uid, "google_calendar_connect_failed", safeErrorReason(request.query.error));
      return response.redirect(redirectUrl({ googleCalendar: "error", reason: safeErrorReason(request.query.error) }));
    }
    const code = String(request.query.code || "");
    if (!code) return response.redirect(redirectUrl({ googleCalendar: "error", reason: "internal" }));
    try {
      const tokenResponse = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CALENDAR_CLIENT_ID.value(),
          client_secret: GOOGLE_CALENDAR_CLIENT_SECRET.value(),
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: await decryptRefreshToken(stateData.codeVerifierEncrypted),
          grant_type: "authorization_code"
        })
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.error || "token_exchange_failed");
      if (!tokenData.refresh_token) throw new Error("refresh_token_missing");
      const encryptedRefreshToken = await encryptRefreshToken(tokenData.refresh_token);
      await db.doc(`googleCalendarConnections/${uid}`).set({
        encryptedRefreshToken,
        scopes: String(tokenData.scope || SCOPES.join(" ")).split(" ").filter(Boolean),
        googleAccountId: null,
        selectedCalendarId: "primary",
        connectionStatus: "connected",
        connectedAt: Timestamp.fromMillis(current),
        updatedAt: Timestamp.fromMillis(current)
      }, { merge: true });
      await audit(uid, "google_calendar_connected", "success");
      return response.redirect(redirectUrl({ googleCalendar: "connected" }));
    } catch (error) {
      const reason = error?.message === "invalid_grant" ? "invalid_grant" : error?.message === "scope_insufficient" ? "scope_insufficient" : "internal";
      if (reason === "invalid_grant" || reason === "scope_insufficient") {
        await db.doc(`googleCalendarConnections/${uid}`).set({ connectionStatus: "reauthorization_required", updatedAt: Timestamp.fromMillis(current) }, { merge: true });
      }
      await audit(uid, "google_calendar_connect_failed", reason);
      logger.error("[GOOGLE_CALENDAR] OAuth callback rechazado", { reason });
      return response.redirect(redirectUrl({ googleCalendar: "error", reason }));
    }
  });

  const status = onCall({ region: REGION }, async (request) => {
    const { uid } = await assertProfessional(db, request);
    const snapshot = await db.doc(`googleCalendarConnections/${uid}`).get();
    if (!snapshot.exists) return { connected: false, status: "not_connected", connectedAt: null, selectedCalendar: "primary", integration: { enabled: false, useForAvailability: false, mirrorAppointments: false } };
    const data = snapshot.data() || {};
    const integration = {
      enabled: data.integration?.enabled === true,
      useForAvailability: data.integration?.useForAvailability === true,
      mirrorAppointments: data.integration?.mirrorAppointments === true
    };
    return { connected: data.connectionStatus === "connected", status: data.connectionStatus || "unknown", connectedAt: data.connectedAt || null, selectedCalendar: data.selectedCalendarId || "primary", integration };
  });

  const disconnect = onCall({ region: REGION }, async (request) => {
    const { uid } = await assertProfessional(db, request);
    const ref = db.doc(`googleCalendarConnections/${uid}`);
    const snapshot = await ref.get();
    if (snapshot.exists && snapshot.data()?.encryptedRefreshToken) {
      try {
        const token = await decryptRefreshToken(snapshot.data().encryptedRefreshToken);
        await fetchImpl(GOOGLE_REVOKE_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
      } catch (error) { logger.warn("[GOOGLE_CALENDAR] No se pudo revocar credencial", { reason: "revoke_failed" }); }
    }
    await ref.set({ connectionStatus: "disconnected", encryptedRefreshToken: null, integration: { enabled: false, useForAvailability: false, mirrorAppointments: false }, updatedAt: Timestamp.fromMillis(now()) }, { merge: true });
    await audit(uid, "google_calendar_disconnected", "success");
    return { disconnected: true };
  });

  return { connect, callback, status, disconnect };
}

module.exports = { createGoogleCalendarHandlers, REDIRECT_URI, SCOPES, hashState, pkceChallenge, buildAuthorizationUrl, isStateUsable };
