"use strict";
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { createPublicDirectoryService } = require("./service");
function createPublicDirectoryRuntime({ db, externalAvailabilityProvider, secrets = [] }) {
  const directory = createPublicDirectoryService({ db });
  let booking;
  const safe = handler => async request => {
    try { return await handler(request); }
    catch (error) {
      console.warn("[COGNICION][DIRECTORY] Solicitud rechazada");
      const code = ["invalid-argument", "permission-denied", "not-found", "resource-exhausted"].includes(error.code) ? error.code : "failed-precondition";
      throw new HttpsError(code, "No fue posible completar la solicitud. Puedes reintentar.");
    }
  };
  return {
    getPublicProfessionals: onCall({ region: "us-central1", timeoutSeconds: 30, maxInstances: 10 }, safe(request => directory.execute(request.data))),
    managePublicAppointment: onCall({ region: "us-central1", timeoutSeconds: 60, maxInstances: 10, secrets }, safe(async request => {
      booking ||= import("./appointments.mjs").then(({ createPublicAppointmentAdapter }) => createPublicAppointmentAdapter({ db, externalAvailabilityProvider }));
      return (await booking)({ data: request.data, ip: request.rawRequest?.ip || "" });
    }))
  };
}
module.exports = { createPublicDirectoryRuntime };

