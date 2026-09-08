import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DEFAULT_TIME_ZONE, TYPES, FILTER_GROUPS, eventGroup, todayInZone, addDays, addMonths, rangeFor, stepDate, dateLabel, eventDisplayInterval, projectEvents, arrangeOverlaps } from "../js/agenda/visualModel.js";
import { canonicalAppointmentInterval, getAvailability } from "../functions/appointments/domain.mjs";

const zone = "America/Mexico_City";
const base = { id: "synthetic-event", type: "event", title: "Reunión de ejemplo", startDate: "2026-09-08", endDate: "2026-09-08", startTime: "09:00", durationMinutes: 60 };
const view = (date, events, timeZone = zone) => projectEvents(events, rangeFor(date, "day"), timeZone);
const modern = (changes = {}, timeZone = zone) => {
  const event = { ...base, type: "appointment", ...changes };
  return { ...event, ...canonicalAppointmentInterval(event, { timeZone }) };
};

test("today follows the explicit agenda zone across UTC midnight", () => {
  const now = new Date("2026-09-09T02:30:00Z");
  assert.equal(todayInZone(zone, now), "2026-09-08");
  assert.equal(todayInZone("Asia/Tokyo", now), "2026-09-09");
  assert.equal(todayInZone(undefined, now), todayInZone(DEFAULT_TIME_ZONE, now));
  assert.throws(() => todayInZone("not/a-zone", now), RangeError);
});
test("civil date arithmetic handles month ends and leap days", () => {
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.throws(() => addDays("2026-02-30", 1), /invalid-civil-date/u);
});
test("Day, Week, Month and List each expose their actual civil range", () => {
  assert.deepEqual(rangeFor("2026-09-08", "day"), { start: "2026-09-08", end: "2026-09-08", days: ["2026-09-08"] });
  const week = rangeFor("2026-09-08", "week");
  assert.equal(week.start, "2026-09-07");
  assert.equal(week.end, "2026-09-13");
  assert.equal(week.days.length, 7);
  const month = rangeFor("2026-09-08", "month");
  assert.equal(month.start, "2026-08-31");
  assert.equal(month.end, "2026-10-04");
  assert.equal(month.days.length, 35);
  assert.equal(rangeFor("2026-09-08", "list").days.length, 30);
  assert.throws(() => rangeFor("2026-09-08", "quarter"), /invalid-calendar-view/u);
});
test("navigation advances by the active view without changing its input", () => {
  assert.equal(stepDate("2026-09-08", "day", 1), "2026-09-09");
  assert.equal(stepDate("2026-09-08", "week", -1), "2026-09-01");
  assert.equal(stepDate("2026-09-08", "month", 1), "2026-10-08");
  assert.equal(stepDate("2026-09-08", "list", 1), "2026-10-08");
  assert.match(dateLabel("2026-09-08"), /septiembre/u);
});
test("filter groups retain all eight existing event types", () => {
  assert.equal(Object.keys(TYPES).length, 8);
  assert.equal(Object.keys(FILTER_GROUPS).length, 5);
  for (const type of ["event", "meeting", "academic", "other"]) assert.equal(eventGroup(type), "event");
  for (const type of ["appointment", "shift", "block", "vacation"]) assert.equal(eventGroup(type), type);
});
test("filtering a visual projection never removes a domain availability blocker", () => {
  const source = [{ ...base, type: "block" }];
  const before = structuredClone(source);
  const visible = view(base.startDate, source).filter((segment) => eventGroup(segment.event.type) !== "block");
  assert.equal(visible.length, 0);
  assert.deepEqual(source, before);
  const result = getAvailability({ candidate: { ...base, type: "appointment" }, events: source, policy: { availabilityMode: "legacy-civil" }, complete: true });
  assert.equal(result.reason, "conflict");
});
test("legacy dates remain civil labels without assigning them a timezone", () => {
  const legacy = { id: "old", fecha: "2026-09-08", hora: "09:00", duracion: 60, durationMinutes: 60, pacienteNombre: "Persona ficticia", estado: "programada" };
  const before = structuredClone(legacy);
  for (const displayZone of [zone, "Asia/Tokyo", "America/Los_Angeles"]) {
    const [segment] = view("2026-09-08", [legacy], displayZone);
    assert.equal(segment.date, "2026-09-08");
    assert.equal(segment.startMinute, 540);
    assert.equal(segment.endMinute, 600);
    assert.equal(segment.event.startAt, undefined);
  }
  assert.deepEqual(legacy, before);
});
test("modern instants are projected in the display zone without changing stored fields", () => {
  const source = modern();
  const before = structuredClone(source);
  const [local] = view("2026-09-08", [source]);
  const [tokyo] = view("2026-09-09", [source], "Asia/Tokyo");
  assert.equal(local.startMinute, 540);
  assert.equal(tokyo.startMinute, 0);
  assert.equal(tokyo.endMinute, 60);
  assert.deepEqual(source, before);
});
test("Firestore Timestamp shapes are accepted as modern instants", () => {
  const source = modern();
  const timestamp = (milliseconds) => ({ seconds: milliseconds / 1000, nanoseconds: 0 });
  const [segment] = view(base.startDate, [{ ...source, startAt: timestamp(source.startAt), endAt: timestamp(source.endAt) }]);
  assert.equal(segment.startMinute, 540);
  assert.equal(segment.endMinute, 600);
});
test("month recurrence preserves the day-31 anchor across February and April", () => {
  const source = { ...base, startDate: "2028-01-31", endDate: "2028-01-31", recurrence: "monthly" };
  const before = structuredClone(source);
  const segments = projectEvents([source], { start: "2028-02-01", end: "2028-05-31" }, zone);
  assert.deepEqual(segments.map((item) => item.date), ["2028-02-29", "2028-03-31", "2028-04-30", "2028-05-31"]);
  assert.ok(segments.every((item) => item.id === source.id && item.occurrenceId.includes("::") && item.event.parentEventId === source.id));
  assert.deepEqual(source, before);
});
test("modern recurring projections derive occurrences in the source IANA zone", () => {
  const source = modern({ startDate: "2026-03-02", endDate: "2026-03-02", recurrence: "weekly" }, "America/New_York");
  const before = structuredClone(source);
  const [beforeDst] = view("2026-03-02", [source], "UTC");
  const [afterDst] = view("2026-03-09", [source], "UTC");
  assert.equal(beforeDst.startMinute, 14 * 60);
  assert.equal(afterDst.startMinute, 13 * 60);
  assert.equal(afterDst.id, source.id);
  assert.equal(afterDst.occurrenceId, `${source.id}::2026-03-09`);
  assert.deepEqual(source, before);
});
test("ambiguous or nonexistent recurring wall times remain visible with a warning", () => {
  const source = modern({ startDate: "2026-03-01", endDate: "2026-03-01", startTime: "02:30", durationMinutes: 30, recurrence: "weekly" }, "America/New_York");
  const [segment] = view("2026-03-08", [source], "America/New_York");
  assert.equal(segment.invalidTime, true);
  assert.equal(segment.date, "2026-03-08");
  assert.equal(segment.timeWarning, "ambiguous-timezone-interval");
});
test("overnight duration splits display segments while retaining one source ID", () => {
  const source = { ...base, startTime: "23:30", durationMinutes: 120 };
  const parts = projectEvents([source], { start: "2026-09-08", end: "2026-09-09" }, zone);
  assert.deepEqual(parts.map(({ date, startMinute, endMinute, id }) => ({ date, startMinute, endMinute, id })), [
    { date: "2026-09-08", startMinute: 1410, endMinute: 1440, id: source.id },
    { date: "2026-09-09", startMinute: 0, endMinute: 90, id: source.id }
  ]);
  assert.equal(parts[0].continuesAfter, true);
  assert.equal(parts[1].continuesBefore, true);
  assert.equal(view("2026-09-09", [source]).length, 1);
});
test("midnight ending is exclusive and creates no extra next-day segment", () => {
  const source = { ...base, startTime: "23:00", durationMinutes: 60 };
  assert.equal(view("2026-09-08", [source])[0].endMinute, 1440);
  assert.equal(view("2026-09-09", [source]).length, 0);
});
test("explicit endTime takes precedence over duration and dates split correctly", () => {
  const source = { ...base, startTime: "22:00", endDate: "2026-09-10", endTime: "02:00", durationMinutes: 60 };
  const segments = projectEvents([source], { start: "2026-09-08", end: "2026-09-10" }, zone);
  assert.deepEqual(segments.map(({ startMinute, endMinute }) => [startMinute, endMinute]), [[1320, 1440], [0, 1440], [0, 120]]);
});
test("all-day multidate events retain the legacy inclusive final date", () => {
  const source = { ...base, type: "vacation", allDay: true, startDate: "2026-09-06", endDate: "2026-09-09", startTime: "", durationMinutes: null };
  const segments = projectEvents([source], rangeFor("2026-09-08", "week"), zone);
  assert.deepEqual(segments.map((segment) => segment.date), ["2026-09-07", "2026-09-08", "2026-09-09"]);
  assert.ok(segments.every((segment) => segment.allDay));
  assert.equal(segments[0].continuesBefore, true);
});
test("short events retain their exact visual interval", () => {
  const [segment] = view(base.startDate, [{ ...base, durationMinutes: 5 }]);
  assert.equal(segment.endMinute - segment.startMinute, 5);
});
test("simultaneous events occupy distinct columns within their overlap component", () => {
  const events = [
    { ...base, id: "a", durationMinutes: 120 },
    { ...base, id: "b", startTime: "09:30", durationMinutes: 60 },
    { ...base, id: "c", startTime: "10:00", durationMinutes: 120 },
    { ...base, id: "separate", startTime: "12:00", durationMinutes: 60 }
  ];
  const arranged = arrangeOverlaps(view(base.startDate, events));
  const byId = Object.fromEntries(arranged.map((segment) => [segment.id, segment]));
  assert.equal(new Set([byId.a.column, byId.b.column, byId.c.column]).size, 3);
  assert.equal(byId.a.columns, 3);
  assert.equal(byId.b.columns, 3);
  assert.equal(byId.c.columns, 3);
  assert.equal(byId.separate.columns, 1);
});
test("adjacent intervals share a column and overlapping components are independent", () => {
  const arranged = arrangeOverlaps(view(base.startDate, [base, { ...base, id: "next", startTime: "10:00" }]));
  assert.ok(arranged.every((segment) => segment.column === 0 && segment.columns === 1));
});
test("long events beginning well before the visible range remain projected", () => {
  const source = { ...base, startDate: "2026-07-01", endDate: "2026-09-10", endTime: "12:00" };
  const [segment] = view("2026-09-08", [source]);
  assert.equal(segment.id, source.id);
  assert.equal(segment.continuesBefore, true);
  assert.equal(segment.continuesAfter, true);
});
test("host timezone does not change civil or modern view output", () => {
  const moduleURL = new URL("../js/agenda/visualModel.js", import.meta.url).href;
  const source = `import { projectEvents, rangeFor, todayInZone } from ${JSON.stringify(moduleURL)}; const events = ${JSON.stringify([base, modern()])}; console.log(JSON.stringify({today:todayInZone('America/Mexico_City',new Date('2026-09-09T02:30:00Z')),parts:projectEvents(events,rangeFor('2026-09-08','week'),'America/Mexico_City')}));`;
  const results = ["UTC", "Asia/Tokyo", "America/Los_Angeles"].map((TZ) => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", env: { ...process.env, TZ } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
});

test("detail exposes the complete overnight interval independently of its clicked segment", () => {
  const source = { ...base, type: "shift", startTime: "22:00", endDate: "2026-09-09", endTime: "07:00" };
  const [nextDay] = view("2026-09-09", [source]);
  assert.equal(nextDay.startMinute, 0);
  assert.deepEqual(eventDisplayInterval(nextDay.event, zone), { startDate: "2026-09-08", endDate: "2026-09-09", startMinute: 1320, endMinute: 420, allDay: false });
});
test("detail keeps an exclusive midnight end on its actual end date", () => {
  const source = { ...base, startTime: "23:00", durationMinutes: 60 };
  assert.deepEqual(eventDisplayInterval(source, zone), { startDate: "2026-09-08", endDate: "2026-09-09", startMinute: 1380, endMinute: 0, allDay: false });
});
test("detail keeps all-day final dates inclusive for civil and modern data", () => {
  const source = { ...base, allDay: true, startTime: "", endDate: "2026-09-09", durationMinutes: null };
  const expected = { startDate: "2026-09-08", endDate: "2026-09-09", startMinute: 0, endMinute: 1440, allDay: true };
  assert.deepEqual(eventDisplayInterval(source, zone), expected);
  assert.deepEqual(eventDisplayInterval({ ...source, startAt: Date.parse("2026-09-08T06:00:00Z"), endAt: Date.parse("2026-09-10T06:00:00Z"), timeZone: zone }, zone), expected);
});
test("detail derives the entire modern occurrence in the selected display timezone", () => {
  const source = modern({ startDate: "2026-03-02", endDate: "2026-03-02", recurrence: "weekly" }, "America/New_York");
  const [afterDst] = view("2026-03-09", [source], "UTC");
  assert.deepEqual(eventDisplayInterval(afterDst.event, "UTC"), { startDate: "2026-03-09", endDate: "2026-03-09", startMinute: 780, endMinute: 840, allDay: false });
});
test("fall-back instants with repeated wall clock times remain visible as warnings", () => {
  const source = { ...base, type: "appointment", startDate: "2026-11-01", endDate: "2026-11-01", startTime: "01:30", startAt: Date.parse("2026-11-01T05:30:00Z"), endAt: Date.parse("2026-11-01T06:30:00Z"), timeZone: "America/New_York" };
  const before = structuredClone(source);
  const [segment] = view("2026-11-01", [source], "America/New_York");
  assert.equal(segment.invalidTime, true);
  assert.equal(segment.id, source.id);
  assert.equal(eventDisplayInterval(source, "America/New_York"), null);
  assert.deepEqual(eventDisplayInterval(source, "UTC"), { startDate: "2026-11-01", endDate: "2026-11-01", startMinute: 330, endMinute: 390, allDay: false });
  assert.deepEqual(source, before);
});
