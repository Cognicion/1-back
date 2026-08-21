import { auth } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  loadPatientPatternProfile,
  refreshPatientPatternProfile,
  reviewPatientPatternResult,
  searchAuthorizedPatternPatients
} from "./patientPatternApi.js";
import { clinicalStatusFromSpanish, renderPatientPatternError, renderPatientPatternProfile } from "./patientPatternRenderer.js";
import { openSofiaWithPatternContext } from "./patternSofiaBridge.js";

const input = document.getElementById("patientPatternSearch");
const searchButton = document.getElementById("patientPatternSearchButton");
const results = document.getElementById("patientPatternResults");
const status = document.getElementById("patientPatternStatus");
const host = document.getElementById("patientPatternHost");
let selectedPatientId = "";
let searchTimer = null;
let requestSequence = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function setStatus(message) {
  if (status) status.textContent = message;
}

function patientResult(patient) {
  return `<button type="button" class="patient-search-result" data-patient-id="${escapeHtml(patient.id)}"><span><strong>${escapeHtml(patient.label || "Paciente")}</strong><small>${patient.age !== null && patient.age !== undefined ? `${escapeHtml(patient.age)} años · ` : ""}Expediente ${escapeHtml(patient.recordNumber || "no disponible")}</small></span><span aria-hidden="true">→</span></button>`;
}

async function runSearch() {
  const sequence = ++requestSequence;
  setStatus("Buscando pacientes autorizados…");
  try {
    const patients = await searchAuthorizedPatternPatients(input?.value || "");
    if (sequence !== requestSequence) return;
    results.innerHTML = patients.length ? patients.map(patientResult).join("") : `<p class="pattern-empty">No hay coincidencias dentro de tus pacientes autorizados.</p>`;
    setStatus(`${patients.length} resultado${patients.length === 1 ? "" : "s"}. La CURP nunca se muestra en esta lista.`);
  } catch (error) {
    if (sequence !== requestSequence) return;
    results.innerHTML = "";
    setStatus(error?.code === "functions/permission-denied" ? "No tienes permiso para consultar pacientes." : "No fue posible buscar pacientes.");
  }
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 260);
}

async function loadProfile(patientId, refresh = false) {
  selectedPatientId = patientId;
  host.innerHTML = `<p class="pattern-empty">${refresh ? "Recalculando" : "Cargando"} el perfil protegido del paciente…</p>`;
  setStatus("El backend está validando acceso al expediente.");
  try {
    const response = refresh ? await refreshPatientPatternProfile(patientId) : await loadPatientPatternProfile(patientId);
    render(response);
    setStatus("Perfil cargado desde PatientPatternProfile.");
    host.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  } catch (error) {
    renderPatientPatternError(host, error);
    setStatus(error?.code === "functions/permission-denied" ? "Acceso denegado por el backend." : "No se pudo cargar el análisis.");
  }
}

async function withBusy(callback) {
  host.setAttribute("aria-busy", "true");
  try { await callback(); } finally { host.removeAttribute("aria-busy"); }
}

function render(response) {
  renderPatientPatternProfile(host, response, {
    onAsk: (context) => {
      if (!openSofiaWithPatternContext(context)) setStatus("El navegador bloqueó la apertura de SOFÍA.");
    },
    onRefresh: () => withBusy(() => loadProfile(selectedPatientId, true)),
    onConfirm: ({ observationId }) => withBusy(async () => {
      await reviewPatientPatternResult({ patientId: selectedPatientId, targetType: "pattern_observation", targetId: observationId, action: "confirm" });
      await loadProfile(selectedPatientId, true);
    }),
    onConfirmInstrument: ({ instrumentId }) => withBusy(async () => {
      await reviewPatientPatternResult({ patientId: selectedPatientId, targetType: "bss_instrument", targetId: instrumentId, action: "confirm" });
      await loadProfile(selectedPatientId, true);
    }),
    onCorrect: ({ observationId, pattern }) => withBusy(async () => {
      const statusLabel = window.prompt("Estado corregido: presente, ausente, histórico, posible, contradictorio o datos insuficientes", "presente");
      const statusValue = clinicalStatusFromSpanish(statusLabel);
      if (!statusValue) { setStatus("El estado clínico indicado no es válido."); return; }
      const booleanValue = statusValue === "present" ? true : statusValue === "absent" ? false : null;
      await reviewPatientPatternResult({ patientId: selectedPatientId, targetType: "pattern_observation", targetId: observationId, action: "correct", clinicianValue: booleanValue, status: statusValue });
      await loadProfile(selectedPatientId, true);
    }),
    onReviewBssItem: ({ instrumentId, itemNumber, value }) => withBusy(async () => {
      const next = window.prompt(`Valor clínico para el reactivo ${itemNumber} (0, 1 o 2)`, String(value));
      if (next === null) return;
      const clinicianValue = Number(next);
      if (![0, 1, 2].includes(clinicianValue)) {
        setStatus("El valor BSS debe ser 0, 1 o 2.");
        return;
      }
      await reviewPatientPatternResult({ patientId: selectedPatientId, targetType: "bss_item", targetId: instrumentId, itemNumber, clinicianValue, action: "correct" });
      await loadProfile(selectedPatientId, true);
    }),
    onOpenSource: ({ sourceDocumentId }) => {
      document.dispatchEvent(new CustomEvent("cognicion:open-clinical-source", { detail: { patientId: selectedPatientId, sourceDocumentId } }));
      setStatus(`Fuente identificada: ${sourceDocumentId}. La apertura puntual depende del visor clínico de origen.`);
    }
  });
}

results?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-patient-id]");
  if (button) void loadProfile(button.dataset.patientId);
});
input?.addEventListener("input", scheduleSearch);
input?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch(); } });
searchButton?.addEventListener("click", runSearch);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  void runSearch();
});
