import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../js/sofia/pageTools.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { ALLOWED_ACTIONS, SOFIA_PAGE_SECTIONS, applySofiaPageActions, collectSofiaPageState } = await import(moduleUrl);

function createElement() {
  return {
    value: "",
    focused: false,
    scrolled: false,
    dispatched: false,
    classList: { add() {}, remove() {} },
    scrollIntoView() { this.scrolled = true; },
    focus() { this.focused = true; },
    dispatchEvent() { this.dispatched = true; }
  };
}

test("el estado de página expone solo capacidades declaradas", () => {
  const state = collectSofiaPageState({ timelineFilter: "ansiedad", hasNoteDraft: true, panelContext: { alerts: [] } });
  assert.deepEqual(state.capabilities, Object.keys(SOFIA_PAGE_SECTIONS));
  assert.equal(state.timelineFilter, "ansiedad");
  assert.equal(state.hasNoteDraft, true);
  assert.ok(ALLOWED_ACTIONS.has("show-section"));
  assert.ok(!ALLOWED_ACTIONS.has("run-javascript"));
});

test("las acciones solo usan IDs permitidos y rechazan acciones arbitrarias", async () => {
  const timeline = createElement();
  const filter = createElement();
  const documentRef = {
    getElementById(id) {
      if (id === "timelineSofia") return timeline;
      if (id === "buscarTimelineSofia") return filter;
      return null;
    }
  };
  const windowRef = { matchMedia: () => ({ matches: true }), setTimeout() {} };
  const results = await applySofiaPageActions([
    { type: "show-section", section: "timeline" },
    { type: "filter-timeline", query: "insomnio" },
    { type: "run-javascript", code: "alert(1)" }
  ], { documentRef, windowRef });
  assert.equal(results[0].ok, true);
  assert.equal(timeline.scrolled, true);
  assert.equal(results[1].ok, true);
  assert.equal(filter.value, "insomnio");
  assert.equal(filter.dispatched, true);
  assert.equal(results[2].reason, "action-not-allowed");
});
