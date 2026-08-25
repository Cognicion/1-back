import assert from "node:assert/strict";
import { eventoSeSolapaRango, expandirRecurrencia } from "../services/agendaRecurrence.js";

const serie = {
  id: "serie-1",
  type: "academic",
  title: "Sesión académica",
  startDate: "2026-08-29",
  endDate: "2026-08-29",
  startTime: "10:00",
  recurrence: "weekly"
};

const ocurrencias = expandirRecurrencia(serie, "2026-09-01", "2026-09-30");
assert.deepEqual(ocurrencias.map((event) => event.occurrenceDate), ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]);
assert.equal(ocurrencias.every((event) => event.isVirtualOccurrence && event.parentEventId === "serie-1"), true);

const quincenal = expandirRecurrencia({ ...serie, id: "serie-14", recurrence: "biweekly" }, "2026-09-01", "2026-10-31");
assert.deepEqual(quincenal.map((event) => event.occurrenceDate), ["2026-09-12", "2026-09-26", "2026-10-10", "2026-10-24"]);

assert.equal(eventoSeSolapaRango({ startDate: "2026-12-28", endDate: "2027-01-03" }, "2027-01-01", "2027-01-31"), true);
assert.equal(eventoSeSolapaRango({ startDate: "2026-08-01", endDate: "2026-08-02" }, "2026-09-01", "2026-09-30"), false);

const mensual31 = expandirRecurrencia({ ...serie, id: "serie-31", startDate: "2026-01-31", endDate: "2026-01-31", recurrence: "monthly" }, "2026-02-01", "2026-05-31");
assert.deepEqual(mensual31.map((event) => event.occurrenceDate), ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);

console.log("agendaRecurrence: PASS");
