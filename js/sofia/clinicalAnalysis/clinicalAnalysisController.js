import { obtenerFunctions } from "../../firebase.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { reviewPatientPatternResult } from "../../patient-patterns/patientPatternApi.js";
import { clinicalStatusFromSpanish, renderPatientPatternError, renderPatientPatternProfile } from "../../patient-patterns/patientPatternRenderer.js";

let functionsPromise;
let listPatientsPromise;

async function getFunctions() {
  if (!functionsPromise) functionsPromise = obtenerFunctions();
  return functionsPromise;
}

async function call(name, data) {
  const functions = await getFunctions();
  return (await httpsCallable(functions, name)(data)).data;
}

export async function listAuthorizedSofiaPatients() {
  if (!listPatientsPromise) listPatientsPromise = call("listAuthorizedSofiaPatients", {}).catch((error) => { listPatientsPromise = null; throw error; });
  const result = await listPatientsPromise;
  return Array.isArray(result?.patients) ? result.patients : [];
}

export async function analyzeSelectedPatient(patientId) {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) throw new Error("CLINICAL_ANALYSIS_PATIENT_REQUIRED");
  return call("analyzePatientClinicalContext", { patientId: normalizedPatientId });
}

function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

function formatProbability(probability = {}) {
  if (probability.insufficientEvidence || probability.probability === null) return "Evidencia insuficiente";
  const interval = probability.ciLower === null ? "" : ` · IC ${(probability.ciLower * 100).toFixed(0)}–${(probability.ciUpper * 100).toFixed(0)}%`;
  return `${Math.round(probability.probability * 100)}% (n=${probability.numerator}/${probability.denominator})${interval}`;
}

function list(items, empty) {
  return items?.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="clinical-analysis-empty">${escapeHtml(empty)}</p>`;
}

export function renderClinicalAnalysis(container, result) {
  if (!container) return;
  if (result?.profile) {
    const reload = async () => {
      const next = await analyzeSelectedPatient(result.profile.patientId);
      renderClinicalAnalysis(container, next);
    };
    renderPatientPatternProfile(container, { patient: result.patient, profile: result.profile }, {
      onAsk: (detail) => document.dispatchEvent(new CustomEvent("sofia:ask-pattern", { detail })),
      onRefresh: reload,
      onConfirm: async ({ observationId }) => {
        await reviewPatientPatternResult({ patientId: result.profile.patientId, targetType: "pattern_observation", targetId: observationId, action: "confirm" });
        await reload();
      },
      onConfirmInstrument: async ({ instrumentId }) => {
        await reviewPatientPatternResult({ patientId: result.profile.patientId, targetType: "bss_instrument", targetId: instrumentId, action: "confirm" });
        await reload();
      },
      onCorrect: async ({ observationId, pattern }) => {
        const statusLabel = window.prompt("Estado corregido: presente, ausente, histórico, posible, contradictorio o datos insuficientes", "presente");
        const status = clinicalStatusFromSpanish(statusLabel);
        if (!status) return;
        const clinicianValue = status === "present" ? true : status === "absent" ? false : null;
        await reviewPatientPatternResult({ patientId: result.profile.patientId, targetType: "pattern_observation", targetId: observationId, action: "correct", clinicianValue, status });
        await reload();
      },
      onReviewBssItem: async ({ instrumentId, itemNumber, value }) => {
        const next = window.prompt(`Valor clínico para el reactivo ${itemNumber} (0, 1 o 2)`, String(value));
        if (next === null || ![0, 1, 2].includes(Number(next))) return;
        await reviewPatientPatternResult({ patientId: result.profile.patientId, targetType: "bss_item", targetId: instrumentId, itemNumber, clinicianValue: Number(next), action: "correct" });
        await reload();
      },
      onOpenSource: (detail) => document.dispatchEvent(new CustomEvent("cognicion:open-clinical-source", { detail }))
    });
    return;
  }
  const patterns = result?.patterns || [];
  const associations = result?.associations || [];
  container.innerHTML = `
    <div class="clinical-analysis-header"><div><h2>Análisis de SOFÍA</h2><p>Resultado individual para el expediente actualmente autorizado.</p></div><span class="clinical-analysis-badge">Apoyo clínico</span></div>
    <div class="clinical-analysis-summary"><span>Variables <strong>${result?.summary?.variables || 0}</strong></span><span>Eventos <strong>${result?.summary?.timelineEvents || 0}</strong></span><span>Patrones <strong>${patterns.length}</strong></span><span>Asociaciones <strong>${associations.length}</strong></span></div>
    <div class="clinical-analysis-grid">
      <article><h3>Resumen longitudinal</h3>${list((result?.timeline || []).slice(-8).map((event) => `${event.observedAt?.slice(0, 10) || "Sin fecha"}: ${event.eventType}${event.value === false ? " (negado)" : ""}`), "Sin eventos temporales.")}</article>
      <article><h3>Patrones detectados</h3>${list(patterns.map((pattern) => `${pattern.variables.join(" → ")} · soporte ${pattern.supportCount}`), "No se detectaron secuencias con evidencia suficiente.")}</article>
      <article><h3>Asociaciones observadas</h3>${list(associations.map((item) => `${item.outcome} | condición: ${item.condition} · ${formatProbability(item.probability)}`), "No hay asociaciones calculables.")}</article>
    </div>
    <p class="clinical-analysis-warning">${escapeHtml(result?.notice || "Análisis de apoyo clínico. No sustituye el juicio profesional.")}</p>`;
}

export function renderClinicalAnalysisError(container, error) {
  renderPatientPatternError(container, error);
}
