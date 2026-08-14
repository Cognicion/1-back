export const SOFIA_PAGE_SECTIONS = Object.freeze({
  "patient-overview": "pacienteDigitalSofia",
  alerts: "alertasSofia",
  "risk-estimates": "prediccionSofia",
  timeline: "timelineSofia",
  relationships: "mapaSofia",
  "structured-analysis": "clinicalAnalysisSofia",
  narrative: "narrativaSofia",
  "clinical-reasoning": "razonamientoSofia",
  monitoring: "labsSofia",
  pharmacology: "farmacoSofia",
  "note-review": "criticaNotaSofia",
  chat: "chatBox"
});

const ALLOWED_ACTIONS = new Set([
  "show-section",
  "filter-timeline",
  "refresh-analysis",
  "analyze-note-draft",
  "focus-note-editor"
]);

function reducedMotion(windowRef) {
  return Boolean(windowRef?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function highlightElement(element, windowRef) {
  element.classList.add("sofia-tool-target");
  windowRef?.setTimeout?.(() => element.classList.remove("sofia-tool-target"), 1800);
}

function showSection(section, { documentRef, windowRef }) {
  const id = SOFIA_PAGE_SECTIONS[section];
  const element = id ? documentRef?.getElementById(id) : null;
  if (!element) return { ok: false, action: "show-section", reason: "section-not-found" };
  element.scrollIntoView?.({ behavior: reducedMotion(windowRef) ? "auto" : "smooth", block: "center" });
  highlightElement(element, windowRef);
  return { ok: true, action: "show-section", section };
}

export function collectSofiaPageState({
  timelineFilter = "",
  hasNoteDraft = false,
  panelContext = null
} = {}) {
  return {
    capabilities: Object.keys(SOFIA_PAGE_SECTIONS),
    timelineFilter: String(timelineFilter || "").slice(0, 120),
    hasNoteDraft: hasNoteDraft === true,
    panelContext: panelContext && typeof panelContext === "object" ? panelContext : {}
  };
}

export async function applySofiaPageActions(actions = [], {
  documentRef = document,
  windowRef = window,
  onRefresh = null,
  onAnalyzeNote = null,
  onTrace = null
} = {}) {
  const results = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action || !ALLOWED_ACTIONS.has(action.type)) {
      results.push({ ok: false, action: action?.type || "unknown", reason: "action-not-allowed" });
      continue;
    }

    let result;
    if (action.type === "show-section") {
      result = showSection(action.section, { documentRef, windowRef });
    } else if (action.type === "filter-timeline") {
      const input = documentRef?.getElementById("buscarTimelineSofia");
      if (!input) result = { ok: false, action: action.type, reason: "timeline-filter-not-found" };
      else {
        input.value = String(action.query || "").slice(0, 120);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        result = { ok: true, action: action.type };
      }
    } else if (action.type === "refresh-analysis") {
      result = typeof onRefresh === "function"
        ? { ok: (await onRefresh()) !== false, action: action.type }
        : { ok: false, action: action.type, reason: "refresh-handler-unavailable" };
    } else if (action.type === "analyze-note-draft") {
      result = typeof onAnalyzeNote === "function"
        ? { ok: (await onAnalyzeNote()) !== false, action: action.type }
        : { ok: false, action: action.type, reason: "note-handler-unavailable" };
    } else {
      const editor = documentRef?.getElementById("notaCriticaSofia");
      if (!editor) result = { ok: false, action: action.type, reason: "note-editor-not-found" };
      else {
        editor.focus();
        result = { ok: true, action: action.type };
      }
    }
    results.push(result);
    if (typeof onTrace === "function") onTrace(result);
  }
  return results;
}

export { ALLOWED_ACTIONS };
