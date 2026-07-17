import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadDichoticCorpus, validateDichoticAudioFiles } from "./dichotic/dichotic-corpus-loader.js";
import { StereoAudioEngine } from "./dichotic/stereo-audio-engine.js";
import {
  DICHOTIC_ACTIVITY_VERSION,
  calculateDichoticMetrics,
  dichoticTrialsToCsv,
  scoreDichoticTrial
} from "./dichotic/dichotic-core.js";

let usuarioId = "";
let pacienteId = "";
let corpus = null;
let corpusValidation = null;
let audioValidation = { ok: false, issues: ["Validacion de audio pendiente."] };
let engine = new StereoAudioEngine();
let headphoneCheck = { headphoneCheckCompleted: false, leftChannelConfirmed: false, rightChannelConfirmed: false, overrideUsed: false, overrideReason: "" };
let sessionId = "";
let currentIndex = -1;
let currentTrial = null;
let responseWindowStartPerf = 0;
let responseWindowTimer = null;
let currentPlayback = null;
let trials = [];
let breaks = [];
let interruptions = [];
let result = null;
let activeList = [];
let activeIsPractice = false;
let sessionMode = "validated";
let recognitionConfidence = null;
let recognitionRaw = "";
let activeRecognition = null;

const RESPONSE_WINDOW_MS = 5000;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  pacienteId = new URLSearchParams(window.location.search).get("id") || new URLSearchParams(window.location.search).get("paciente") || "";
  wireEvents();
  await initializeCorpus();
});

onAuthStateChanged(auth, (user) => {
  usuarioId = user?.uid || "";
  if (!pacienteId) pacienteId = usuarioId;
});

function wireEvents() {
  $("volumenDicotica")?.addEventListener("input", () => engine.setVolume(Number($("volumenDicotica").value)));
  $("btnProbarIzquierdo")?.addEventListener("click", () => testChannel("left"));
  $("btnProbarDerecho")?.addEventListener("click", () => testChannel("right"));
  $("btnConfirmarIzquierdo")?.addEventListener("click", () => updateHeadphoneCheck({ leftChannelConfirmed: true }));
  $("btnConfirmarDerecho")?.addEventListener("click", () => updateHeadphoneCheck({ rightChannelConfirmed: true }));
  $("overrideAuriculares")?.addEventListener("change", () => updateHeadphoneCheck({ overrideUsed: $("overrideAuriculares").checked }));
  $("motivoOverride")?.addEventListener("input", () => updateHeadphoneCheck({ overrideReason: $("motivoOverride").value.trim() }));
  $("btnMicrofono")?.addEventListener("click", checkMicrophone);
  $("btnPractica")?.addEventListener("click", () => startPractice());
  $("btnIniciar")?.addEventListener("click", startExperimental);
  $("btnDemo")?.addEventListener("click", openDemoModal);
  $("btnCancelarDemo")?.addEventListener("click", closeDemoModal);
  $("btnContinuarDemo")?.addEventListener("click", startDemo);
  $("btnEscucharRespuesta")?.addEventListener("click", startSpeechRecognition);
  $("btnConfirmarRespuesta")?.addEventListener("click", () => submitTrial($("respuestaManual").value, {}));
  $("btnSinRespuesta")?.addEventListener("click", () => submitTrial("", {}));
  $("btnIninteligible")?.addEventListener("click", () => submitTrial($("respuestaManual").value, { unintelligible: true }));
  $("btnFalloTecnico")?.addEventListener("click", () => submitTrial($("respuestaManual").value, { technicalFailure: true }));
  $("btnExportarJson")?.addEventListener("click", exportJson);
  $("btnExportarCsv")?.addEventListener("click", exportCsv);
  $("btnImprimir")?.addEventListener("click", () => window.print());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && currentTrial) interruptions.push({ type: "visibilitychange", at: new Date().toISOString(), trialId: currentTrial.trialId });
  });
  window.addEventListener("pagehide", () => {
    window.clearTimeout(responseWindowTimer);
    activeRecognition?.abort?.();
    engine.close();
  });
}

async function initializeCorpus() {
  try {
    const loaded = await loadDichoticCorpus();
    corpus = loaded.corpus;
    corpusValidation = loaded.validation;
    renderCorpusState();
  } catch (error) {
    corpusValidation = { ok: false, issues: [error.message], totalPairs: 0, isProvisional: true };
    renderCorpusState();
  }
}

function renderCorpusState() {
  $("estadoCorpus").textContent = corpusValidation?.ok ? "Estructura valida" : "No habilitado";
  $("advertenciaCorpus").textContent = corpusValidation?.isProvisional
    ? "Corpus provisional pendiente de sustitucion por material bibliografico autorizado. No usar como prueba validada."
    : "Corpus autorizado cargado.";
  $("estadoValidado").textContent = corpusValidation?.authorizedMaterial && corpusValidation?.clinicallyValidated
    ? "Material autorizado disponible para prueba experimental validada."
    : "Actividad pendiente de material auditivo bibliografico autorizado.";
  $("resumenAdminCorpus").innerHTML = `
    <p><strong>Version:</strong> ${escapeHtml(corpus?.corpusVersion || "Sin version")}</p>
    <p><strong>Tipo:</strong> ${escapeHtml(corpus?.corpusType || "sin tipo")}</p>
    <p><strong>Validado clinicamente:</strong> ${corpus?.clinicallyValidated ? "Si" : "No"}</p>
    <p><strong>Material autorizado:</strong> ${corpus?.authorizedMaterial ? "Si" : "No"}</p>
    <p><strong>Pares:</strong> ${corpusValidation?.totalPairs || 0}</p>
    <p><strong>Estado:</strong> ${corpusValidation?.ok ? "Estructura valida" : "Bloqueado por validacion"}</p>
    ${(corpusValidation?.issues || []).map((issue) => `<p class="alerta-dicotica advertencia">${escapeHtml(issue)}</p>`).join("")}
    <button type="button" id="btnValidarAudios">Validar audios decodificables</button>
  `;
  $("btnValidarAudios")?.addEventListener("click", validateAudioAssets);
  $("tablaCorpus").innerHTML = (corpus?.pairs || []).map((p) => `<tr><td>${escapeHtml(p.trialId)}</td><td>${p.blockNumber}</td><td>${p.trialNumber}</td><td>${escapeHtml(p.leftWord)}</td><td>${escapeHtml(p.rightWord)}</td><td>${escapeHtml(p.leftAudio)}</td><td>${escapeHtml(p.rightAudio)}</td></tr>`).join("");
  updateStartButtons();
}

async function validateAudioAssets() {
  try {
    const ctx = await engine.ensureContext();
    audioValidation = await validateDichoticAudioFiles(corpus, ctx);
  } catch (error) {
    audioValidation = { ok: false, issues: [error.message] };
  }
  $("estadoAudios").textContent = audioValidation.ok ? "Audios decodificables" : "Audios faltantes/no validos";
  renderCorpusState();
  updateStartButtons();
}

function updateHeadphoneCheck(update) {
  headphoneCheck = { ...headphoneCheck, ...update };
  headphoneCheck.headphoneCheckCompleted = (headphoneCheck.leftChannelConfirmed && headphoneCheck.rightChannelConfirmed) || (headphoneCheck.overrideUsed && headphoneCheck.overrideReason);
  updateStartButtons();
}

async function testChannel(channel) {
  toast("La prueba de canal requiere audios de verificacion cargados. Se reproducira un tono lateral provisional.");
  const ctx = await engine.ensureContext();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.sin((i / ctx.sampleRate) * Math.PI * 2 * 440) * 0.2;
  await engine.playSingleChannel(buffer, channel);
}

async function checkMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    $("estadoMicrofono").textContent = "Disponible";
  } catch (error) {
    $("estadoMicrofono").textContent = "No disponible";
    toast("No se pudo acceder al microfono. Puede usarse puntuacion manual.");
  }
}

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast("El navegador no ofrece reconocimiento de voz. Usa puntuacion manual.");
    return;
  }
  activeRecognition?.abort?.();
  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  recognition.lang = "es-MX";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  $("estadoEnsayo").textContent = "Escuchando respuesta";
  recognition.onresult = (event) => {
    const item = event.results?.[0]?.[0];
    recognitionRaw = item?.transcript || "";
    recognitionConfidence = item?.confidence ?? null;
    $("respuestaManual").value = recognitionRaw;
    $("estadoEnsayo").textContent = "Confirma o corrige la transcripcion";
  };
  recognition.onerror = () => {
    $("estadoEnsayo").textContent = "Reconocimiento no disponible";
    toast("No se pudo transcribir automaticamente. Usa captura manual.");
  };
  recognition.onend = () => {
    if (activeRecognition === recognition) activeRecognition = null;
  };
  recognition.start();
}

function updateStartButtons() {
  const demoReady = Boolean(corpusValidation?.ok && audioValidation.ok && headphoneCheck.headphoneCheckCompleted);
  const validatedReady = Boolean(demoReady && corpusValidation?.authorizedMaterial && corpusValidation?.clinicallyValidated);
  $("btnIniciar")?.toggleAttribute("disabled", !validatedReady);
  $("btnDemo")?.toggleAttribute("disabled", !demoReady);
  $("btnPractica")?.toggleAttribute("disabled", !demoReady);
}

function startPractice() {
  const practicePairs = (corpus?.pairs || []).slice(0, 6).map((pair, index) => ({
    ...pair,
    trialId: `practice-${index + 1}`,
    blockNumber: 0,
    trialNumber: index + 1
  }));
  sessionId = createSessionId();
  sessionMode = "practice_demo";
  trials = [];
  currentIndex = -1;
  activeList = practicePairs;
  activeIsPractice = true;
  showTrialScreen();
  $("demoBanner").hidden = false;
  toast("Practica de demostracion: material provisional no valido para interpretacion clinica.");
  runTrialList(practicePairs, true);
}

function startExperimental() {
  if (!(corpusValidation?.authorizedMaterial && corpusValidation?.clinicallyValidated)) {
    toast("Actividad pendiente de material auditivo bibliografico autorizado.");
    return;
  }
  if (!(corpusValidation?.ok && audioValidation.ok && headphoneCheck.headphoneCheckCompleted)) {
    toast("No se puede iniciar: corpus, audios y auriculares deben estar validados.");
    return;
  }
  beginSession("validated_experimental", corpus.pairs);
}

function openDemoModal() {
  $("modalDemo")?.classList.remove("oculta");
}

function closeDemoModal() {
  $("modalDemo")?.classList.add("oculta");
}

function startDemo() {
  closeDemoModal();
  beginSession("demo_technical", corpus.pairs);
}

function beginSession(mode, pairList) {
  sessionId = createSessionId();
  sessionMode = mode;
  trials = [];
  breaks = [];
  currentIndex = -1;
  activeList = pairList;
  activeIsPractice = false;
  $("demoBanner").hidden = mode !== "demo_technical";
  showTrialScreen();
  runTrialList(pairList, false);
}

async function runTrialList(list, isPractice) {
  currentIndex += 1;
  if (currentIndex >= list.length) {
    if (isPractice) {
      $("pantallaEnsayo").classList.add("oculta");
      $("pantallaPreparacion").classList.remove("oculta");
      toast("Practica finalizada.");
      return;
    }
    finishSession();
    return;
  }
  currentTrial = list[currentIndex];
  if (!isPractice && currentIndex > 0 && currentIndex % 30 === 0) {
    showBreak(currentTrial.blockNumber - 1, () => runCurrentTrial(list, isPractice));
    return;
  }
  await runCurrentTrial(list, isPractice);
}

async function runCurrentTrial(list, isPractice) {
  $("bloqueActual").textContent = `${Math.max(1, currentTrial.blockNumber)}/4`;
  $("ensayoActual").textContent = `${currentIndex + 1}/${list.length}`;
  $("estadoEnsayo").textContent = "Fijacion";
  $("fijacion").textContent = "+";
  $("respuestaManual").value = "";
  recognitionConfidence = null;
  recognitionRaw = "";
  currentPlayback = null;
  window.clearTimeout(responseWindowTimer);
  await delay(700);
  responseWindowStartPerf = null;
  try {
    if (!currentTrial.leftAudio || !currentTrial.rightAudio) throw new Error("Audios de ensayo no disponibles.");
    const playback = await engine.playDichoticPair(currentTrial);
    currentPlayback = playback;
    $("estadoEnsayo").textContent = "Escucha";
    await playback.completed;
    responseWindowStartPerf = performance.now();
    $("indicacionRespuesta").textContent = "Responde ahora con una sola palabra.";
    responseWindowTimer = window.setTimeout(() => submitTrial("", {}), RESPONSE_WINDOW_MS);
  } catch (error) {
    submitTrial("", { technicalFailure: true, technicalError: error.message });
  }
}

function submitTrial(rawResponse, flags = {}) {
  if (!currentTrial) return;
  window.clearTimeout(responseWindowTimer);
  activeRecognition?.abort?.();
  const now = performance.now();
  const scored = scoreDichoticTrial({
    sessionId,
    trial: currentTrial,
    rawResponse,
    timing: {
      scheduledStartTime: currentPlayback?.scheduledStartTime ?? null,
      actualStartTime: currentPlayback?.actualStartTime ?? null,
      synchronizationErrorMs: currentPlayback?.synchronizationErrorMs ?? null,
      responseWindowStartedAt: responseWindowStartPerf,
      responseStartedAt: rawResponse ? now : null,
      responseEndedAt: now,
      responseLatencyMs: rawResponse && Number.isFinite(responseWindowStartPerf) ? Math.round(now - responseWindowStartPerf) : null,
      leftAudioLoaded: Boolean(currentPlayback?.leftAudioLoaded) && !flags.technicalFailure,
      rightAudioLoaded: Boolean(currentPlayback?.rightAudioLoaded) && !flags.technicalFailure,
      audioPlaybackCompleted: Boolean(currentPlayback?.completed) && !flags.technicalFailure
    },
    scoring: {
      ...flags,
      recognitionConfidence,
      scoringMethod: recognitionRaw ? "speech_recognition_corrected" : "manual",
      manuallyReviewed: true,
      scorerId: usuarioId
    },
    context: {
      headphonesVerified: headphoneCheck.headphoneCheckCompleted,
      volumeSetting: Number($("volumenDicotica").value),
      corpusVersion: corpus?.corpusVersion || "practice"
    }
  });
  trials.push(scored);
  currentTrial = null;
  currentPlayback = null;
  window.setTimeout(() => runTrialList(activeList, activeIsPractice), 650);
}

function showBreak(blockNumber, onContinue) {
  const started = performance.now();
  $("descansoBloque").classList.remove("oculta");
  $("descansoBloque").innerHTML = `<p>Has completado el bloque ${blockNumber} de 4. Puedes descansar brevemente. Continua cuando estes preparado.</p><button type="button" id="btnContinuarBloque">Continuar</button>`;
  $("btnContinuarBloque").addEventListener("click", () => {
    breaks.push({ blockNumber, breakStartedAt: started, breakEndedAt: performance.now(), breakDurationMs: Math.round(performance.now() - started) });
    $("descansoBloque").classList.add("oculta");
    onContinue();
  }, { once: true });
}

function finishSession() {
  const metrics = calculateDichoticMetrics(trials);
  result = {
    activityId: "escucha_dicotica_derecho",
    activityName: "Prueba de Escucha Dicotica",
    activityVersion: DICHOTIC_ACTIVITY_VERSION,
    sessionId,
    patientId: pacienteId || usuarioId,
    uidProfesional: usuarioId,
    date: new Date().toISOString(),
    corpusId: corpus?.corpusId || "",
    corpusVersion: corpus?.corpusVersion || "",
    corpusType: corpus?.corpusType || "",
    clinicallyValidated: corpus?.clinicallyValidated === true,
    authorizedMaterial: corpus?.authorizedMaterial === true,
    sessionMode,
    demoWarning: sessionMode === "demo_technical" ? "MODO DEMOSTRACION - NO VALIDO PARA INTERPRETACION CLINICA" : "",
    configuration: { attendedEar: "right", totalTrials: 120, blocks: 4, trialsPerBlock: 30, sequenceMode: corpus?.sequenceMode, randomized: false },
    headphoneCheck,
    volumeSetting: Number($("volumenDicotica").value),
    exclusionFlags: collectConditions(),
    results: metrics,
    blockResults: metrics.blockResults,
    trialHistory: trials,
    breaks,
    interruptions,
    voicePrivacy: { voiceRecordingConsent: false, consentDate: null, consentVersion: "no_audio_storage_default" }
  };
  saveLocal(result);
  saveRemote(result);
  renderResults(result);
}

function renderResults(r) {
  $("pantallaEnsayo").classList.add("oculta");
  $("pantallaResultados").classList.remove("oculta");
  const m = r.results;
  const cards = [["Aciertos", m.correctResponses],["Errores", m.totalErrors],["Intrusiones oido izquierdo", m.leftEarIntrusions],["No presentadas", m.nonPresentedWords],["Omisiones", m.omissions],["Validos", m.validTrials],["Fallos tecnicos", m.technicalFailures],["% aciertos", m.accuracyPercentage ?? "N/A"]];
  cards.push(["Modo", r.sessionMode === "demo_technical" ? "Demostracion tecnica" : "Validado"]);
  $("resultadosGrid").innerHTML = cards.map(([k,v]) => `<div class="resultado-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("interpretacionDicotica").innerHTML = `<strong>Descripcion objetiva</strong><p>${objectiveSummary(m)}</p>`;
  $("tablaBloques").innerHTML = m.blockResults.map((b) => `<tr><td>${b.blockNumber}</td><td>${b.correctResponses}</td><td>${b.leftEarIntrusions}</td><td>${b.nonPresentedWords}</td><td>${b.omissions}</td><td>${b.technicalFailures}</td></tr>`).join("");
  $("tablaEnsayos").innerHTML = r.trialHistory.map((t) => `<tr><td>${t.blockNumber}</td><td>${t.trialNumber}</td><td>${escapeHtml(t.leftWord)}</td><td>${escapeHtml(t.rightWord)}</td><td>${escapeHtml(t.rawResponse)}</td><td>${t.classification}</td><td>${t.scoringMethod}</td><td>${t.recognitionConfidence ?? ""}</td><td>${t.manuallyReviewed ? "Si" : "No"}</td><td>${t.responseLatencyMs ?? ""}</td><td>${t.isTechnicalFailure ? "Fallo" : "OK"}</td></tr>`).join("");
  renderBars("graficaBloques", m.blockResults.map((b) => [`B${b.blockNumber}`, b.correctResponses]));
  renderBars("graficaCategorias", [["Aciertos", m.correctResponses],["Izquierdo", m.leftEarIntrusions],["No presentadas", m.nonPresentedWords],["Omisiones", m.omissions],["Tecnicos", m.technicalFailures]]);
}

async function saveRemote(payload) {
  const owner = payload.patientId || usuarioId;
  if (!owner) return;
  try {
    const ref = doc(collection(db, "usuarios", owner, "rehabilitacionResultados"));
    await setDoc(ref, { ...payload, idResultado: ref.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.warn("No se pudo guardar Escucha Dicotica; queda copia local.", error);
  }
}

function saveLocal(payload) {
  const key = `cognicion_escucha_dicotica_${usuarioId || "anon"}`;
  const prev = JSON.parse(localStorage.getItem(key) || "[]");
  prev.unshift(payload);
  localStorage.setItem(key, JSON.stringify(prev.slice(0, 20)));
}

function exportJson() { if (result) download(`escucha_dicotica_${sessionId}.json`, JSON.stringify(result, null, 2), "application/json"); }
function exportCsv() { if (result) download(`escucha_dicotica_${sessionId}.csv`, dichoticTrialsToCsv(result.trialHistory), "text/csv;charset=utf-8"); }

function showTrialScreen() { $("pantallaPreparacion").classList.add("oculta"); $("pantallaResultados").classList.add("oculta"); $("pantallaEnsayo").classList.remove("oculta"); }
function collectConditions() { return [...document.querySelectorAll("[data-condicion]:checked")].map((el) => el.dataset.condicion).concat($("dominanciaLinguistica").value ? [`dominancia:${$("dominanciaLinguistica").value}`] : []); }
function objectiveSummary(m) { return `Se registraron ${m.correctResponses} aciertos, ${m.leftEarIntrusions} respuestas correspondientes al oido izquierdo, ${m.nonPresentedWords} palabras no presentadas y ${m.omissions} omisiones. Estos resultados dependen del corpus, audicion, auriculares e idioma.`; }
function renderBars(id, data) { const max = Math.max(...data.map(([,v]) => v), 1); $(id).innerHTML = data.map(([k,v]) => `<div class="barra-metrica"><span>${k}</span><i style="width:${Math.max(4,(v/max)*100)}%"></i><strong>${v}</strong></div>`).join(""); }
function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
function createSessionId() { return `dicotica-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function delay(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function toast(msg) { const t = $("toastDicotica"); t.textContent = msg; t.classList.add("visible"); window.setTimeout(() => t.classList.remove("visible"), 2600); }
function escapeHtml(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
