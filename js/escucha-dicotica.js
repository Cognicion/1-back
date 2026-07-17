import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { loadDichoticCorpus, validateDichoticAudioFiles } from "./dichotic/dichotic-corpus-loader.js";
import { StereoAudioEngine } from "./dichotic/stereo-audio-engine.js";
import rehabilitationModeManager from "./rehabilitation-mode-manager.js";
import {
  DICHOTIC_ACTIVITY_VERSION,
  calculateDichoticMetrics,
  dichoticTrialsToCsv,
  scoreDichoticTrial
} from "./dichotic/dichotic-core.js";

const DICHOTIC_ACTIVITY_ID = "escucha_dicotica_derecho";
rehabilitationModeManager.registerActivity(DICHOTIC_ACTIVITY_ID, {
  supportsTraining: true,
  supportsRehabilitation: true,
  supportsClinical: true,
  supportsResearch: true,
  activityVersion: DICHOTIC_ACTIVITY_VERSION
});

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
let responseTimeoutTimer = null;
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
let volumeConfirmed = false;
let microphoneChecked = false;
let manualCaptureSelected = false;
let corpusPage = 1;
let corpusSearch = "";
let trialSpeechTranscriptOriginal = "";
let trialCaptureMethod = "";
let trialRecognitionStartedAt = null;
let trialRecognitionEndedAt = null;
let trialRecognitionActive = false;
let suppressRecognitionCallbacks = false;
let detailFilter = "all";
let detailSearch = "";
let detailSort = "trialNumber";
let sessionConfig = null;
let sessionStartedAt = null;

const CORPUS_PAGE_SIZE = 10;
const AUTO_RECOGNITION_DELAY_MS = 300;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  pacienteId = new URLSearchParams(window.location.search).get("id") || new URLSearchParams(window.location.search).get("paciente") || "";
  wireEvents();
  applyModeDefaults($("configModo")?.value || "clinical");
  await initializeCorpus();
});

onAuthStateChanged(auth, (user) => {
  usuarioId = user?.uid || "";
  if (!pacienteId) pacienteId = usuarioId;
});

function wireEvents() {
  $("volumenDicotica")?.addEventListener("input", () => {
    engine.setVolume(Number($("volumenDicotica").value));
    setVolumeConfirmed(false);
  });
  $("btnProbarIzquierdo")?.addEventListener("click", () => testChannel("left"));
  $("btnProbarDerecho")?.addEventListener("click", () => testChannel("right"));
  $("btnConfirmarIzquierdo")?.addEventListener("click", () => updateHeadphoneCheck({ leftChannelConfirmed: true }));
  $("btnConfirmarDerecho")?.addEventListener("click", () => updateHeadphoneCheck({ rightChannelConfirmed: true }));
  $("btnNegarIzquierdo")?.addEventListener("click", () => resetChannel("left", "Repite la prueba y confirma solo si el sonido fue exclusivamente por el oido izquierdo."));
  $("btnNegarDerecho")?.addEventListener("click", () => resetChannel("right", "Repite la prueba y confirma solo si el sonido fue exclusivamente por el oido derecho."));
  $("btnRepetirIzquierdo")?.addEventListener("click", () => testChannel("left"));
  $("btnRepetirDerecho")?.addEventListener("click", () => testChannel("right"));
  $("overrideAuriculares")?.addEventListener("change", () => updateHeadphoneCheck({ overrideUsed: $("overrideAuriculares").checked }));
  $("motivoOverrideSelect")?.addEventListener("change", updateOverrideReason);
  $("motivoOverride")?.addEventListener("input", updateOverrideReason);
  $("btnAudioVolumen")?.addEventListener("click", playVolumeCheck);
  $("btnVolumenBajo")?.addEventListener("click", () => adjustVolume(-0.05));
  $("btnVolumenAlto")?.addEventListener("click", () => adjustVolume(0.05));
  $("btnVolumenCorrecto")?.addEventListener("click", () => setVolumeConfirmed(true));
  $("btnMicrofono")?.addEventListener("click", checkMicrophone);
  $("btnCapturaManual")?.addEventListener("click", selectManualCapture);
  $("dominanciaLinguistica")?.addEventListener("change", () => $("dominanciaOtra")?.classList.toggle("oculta", $("dominanciaLinguistica").value !== "otra"));
  $("btnContinuarPractica")?.addEventListener("click", () => startPractice());
  $("btnPractica")?.addEventListener("click", () => startPractice());
  $("btnIniciarModalidad")?.addEventListener("click", startSelectedMode);
  $("btnEntrenamiento")?.addEventListener("click", startTraining);
  $("btnIniciar")?.addEventListener("click", startExperimental);
  $("btnInvestigacion")?.addEventListener("click", startResearch);
  $("btnDemo")?.addEventListener("click", openDemoModal);
  $("btnCancelarDemo")?.addEventListener("click", closeDemoModal);
  $("btnContinuarDemo")?.addEventListener("click", startDemo);
  $("btnCancelarExperimental")?.addEventListener("click", closeExperimentalModal);
  $("btnContinuarExperimental")?.addEventListener("click", continueExperimental);
  $("btnHablar")?.addEventListener("click", toggleTrialSpeechRecognition);
  $("btnConfirmarRespuesta")?.addEventListener("click", () => submitTrial($("respuestaManual").value, {}));
  $("btnEditarRespuesta")?.addEventListener("click", showManualResponseInput);
  $("btnRepetirCaptura")?.addEventListener("click", () => startSpeechRecognition({ manual: true }));
  $("btnEscribirManual")?.addEventListener("click", showManualResponseInput);
  $("btnSinRespuesta")?.addEventListener("click", () => submitTrial("", {}));
  $("btnIninteligible")?.addEventListener("click", () => submitTrial($("respuestaManual").value, { unintelligible: true }));
  $("btnFalloTecnico")?.addEventListener("click", () => submitTrial($("respuestaManual").value, { technicalFailure: true }));
  $("btnExportarJson")?.addEventListener("click", exportJson);
  $("btnExportarCsv")?.addEventListener("click", exportCsv);
  $("btnExportarCompleto")?.addEventListener("click", exportCompleteResults);
  $("btnCopiarResultados")?.addEventListener("click", copyResultsToClipboard);
  $("btnImprimir")?.addEventListener("click", () => window.print());
  $("filtroDetalle")?.addEventListener("change", () => {
    detailFilter = $("filtroDetalle").value;
    renderTrialDetails();
  });
  $("buscadorDetalle")?.addEventListener("input", () => {
    detailSearch = $("buscadorDetalle").value.trim().toLowerCase();
    renderTrialDetails();
  });
  $("ordenDetalle")?.addEventListener("change", () => {
    detailSort = $("ordenDetalle").value;
    renderTrialDetails();
  });
  document.querySelectorAll("[id^='config']").forEach((el) => {
    el.addEventListener("change", syncConfigTotals);
    el.addEventListener("input", syncConfigTotals);
  });
  $("configModo")?.addEventListener("change", () => applyModeDefaults($("configModo").value));
  $("btnMostrarCorpus")?.addEventListener("click", toggleCorpusDetails);
  $("buscadorCorpus")?.addEventListener("input", () => {
    corpusSearch = $("buscadorCorpus").value.trim().toLowerCase();
    corpusPage = 1;
    renderCorpusTable();
  });
  $("btnCorpusPrev")?.addEventListener("click", () => {
    corpusPage = Math.max(1, corpusPage - 1);
    renderCorpusTable();
  });
  $("btnCorpusNext")?.addEventListener("click", () => {
    corpusPage += 1;
    renderCorpusTable();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      activeRecognition?.abort?.();
      if ($("detalleMicrofono")?.classList.contains("escuchando")) {
        $("detalleMicrofono").classList.remove("escuchando");
        $("detalleMicrofono").textContent = "Prueba de microfono cancelada.";
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && currentTrial) interruptions.push({ type: "visibilitychange", at: new Date().toISOString(), trialId: currentTrial.trialId });
  });
  window.addEventListener("pagehide", () => {
    window.clearTimeout(responseTimeoutTimer);
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
    : "Prueba experimental habilitada con corpus provisional. Resultados sin referencia normativa.";
  const audioCount = new Set((corpus?.pairs || []).flatMap((pair) => [pair.leftAudio, pair.rightAudio]).filter(Boolean)).size;
  const blockCount = new Set((corpus?.pairs || []).map((pair) => pair.blockNumber)).size;
  $("resumenAdminCorpus").innerHTML = `
    ${corpusSummaryItem("Version", corpus?.corpusVersion || "Sin version")}
    ${corpusSummaryItem("Tipo", corpus?.corpusType || "sin tipo")}
    ${corpusSummaryItem("Material autorizado", corpus?.authorizedMaterial ? "Si" : "No")}
    ${corpusSummaryItem("Estado", corpusValidation?.ok ? "Estructura valida" : "Bloqueado por validacion")}
    ${corpusSummaryItem("Numero de pares", corpusValidation?.totalPairs || 0)}
    ${corpusSummaryItem("Numero de bloques", blockCount || 0)}
    ${corpusSummaryItem("Numero de audios", audioCount)}
    ${corpusSummaryItem("Archivos de audio", audioValidation.ok ? "Encontrados" : "Pendiente")}
    ${(corpusValidation?.issues || []).map((issue) => `<p class="alerta-dicotica advertencia">${escapeHtml(issue)}</p>`).join("")}
    <div class="corpus-resumen-item"><span>Integridad</span><button type="button" id="btnValidarAudios">Comprobar que todos los archivos de audio existen</button></div>
  `;
  $("btnValidarAudios")?.addEventListener("click", validateAudioAssets);
  renderCorpusTable();
  updateStartButtons();
}

async function validateAudioAssets() {
  try {
    $("estadoAudios").textContent = "Comprobando archivos...";
    const ctx = await engine.ensureContext();
    audioValidation = await validateDichoticAudioFiles(corpus, ctx);
  } catch (error) {
    audioValidation = { ok: false, issues: [error.message] };
  }
  $("estadoAudios").textContent = audioValidation.ok ? "Archivos encontrados" : "Archivos faltantes";
  toast(audioValidation.ok ? "Todos los archivos de audio fueron encontrados." : `Faltan ${audioValidation.issues.length} archivos de audio.`);
  renderCorpusState();
  updateStartButtons();
}

function updateHeadphoneCheck(update) {
  headphoneCheck = { ...headphoneCheck, ...update };
  const overrideValid = Boolean(headphoneCheck.overrideUsed && headphoneCheck.overrideReason);
  headphoneCheck.headphoneCheckCompleted = (headphoneCheck.leftChannelConfirmed && headphoneCheck.rightChannelConfirmed) || overrideValid;
  renderHeadphoneState();
  updateStartButtons();
}

async function testChannel(channel) {
  setStepState("pasoAuriculares", "estadoPasoAuriculares", "en-proceso", "En proceso");
  setChannelPlaying(channel);
  const ctx = await engine.ensureContext();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.sin((i / ctx.sampleRate) * Math.PI * 2 * 440) * 0.2;
  await engine.playSingleChannel(buffer, channel);
  await delay(520);
  setChannelAwaitingConfirmation(channel);
}

async function checkMicrophone() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  manualCaptureSelected = false;
  microphoneChecked = false;
  setStepState("pasoMicrofono", "estadoPasoMicrofono", "en-proceso", "En proceso");
  $("estadoCaptura").textContent = "Probando microfono";
  $("detalleMicrofono").className = "microfono-estado escuchando";
  $("detalleMicrofono").textContent = "Escuchando...";
  if (!SpeechRecognition) {
    $("estadoMicrofono").textContent = "No disponible";
    $("estadoCaptura").textContent = "Captura manual requerida";
    $("detalleMicrofono").className = "microfono-estado";
    $("detalleMicrofono").innerHTML = `<p>Tu navegador no soporta reconocimiento de voz.</p><button type="button" id="btnManualDesdeAviso">Continuar con captura manual</button>`;
    $("btnManualDesdeAviso")?.addEventListener("click", selectManualCapture);
    updateStartButtons();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    activeRecognition?.abort?.();
    const recognition = new SpeechRecognition();
    activeRecognition = recognition;
    let gotMicrophoneResult = false;
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      gotMicrophoneResult = true;
      const item = event.results?.[0]?.[0];
      const transcript = item?.transcript || "";
      const confidence = item?.confidence ?? null;
      $("detalleMicrofono").className = "microfono-estado";
      $("detalleMicrofono").innerHTML = `<p>Se reconocio:</p><blockquote>"${escapeHtml(transcript || "Sin texto reconocido")}"</blockquote>`;
      if (transcript && (confidence === null || confidence >= 0.55)) {
        microphoneChecked = true;
        $("estadoMicrofono").textContent = "Disponible";
        $("estadoCaptura").textContent = "Microfono confirmado";
        $("detalleMicrofono").innerHTML += `<p class="estado-exito">✓ Microfono funcionando correctamente</p>`;
        setStepState("pasoMicrofono", "estadoPasoMicrofono", "completado", "Completado");
      } else {
        $("estadoMicrofono").textContent = "Poco claro";
        $("estadoCaptura").textContent = "Repetir o usar captura manual";
        $("detalleMicrofono").innerHTML += `<p class="alerta-dicotica advertencia">El reconocimiento fue poco claro.</p><div class="acciones-dicotica"><button type="button" id="btnRepetirMicrofono">Repetir prueba</button><button type="button" id="btnManualMicrofono" class="boton-secundario">Continuar con captura manual</button></div>`;
        $("btnRepetirMicrofono")?.addEventListener("click", checkMicrophone);
        $("btnManualMicrofono")?.addEventListener("click", selectManualCapture);
      }
      updateStartButtons();
    };
    recognition.onerror = () => {
      $("estadoMicrofono").textContent = "No disponible";
      $("estadoCaptura").textContent = "Captura manual disponible";
      $("detalleMicrofono").className = "microfono-estado";
      $("detalleMicrofono").innerHTML = `<p class="alerta-dicotica advertencia">No se pudo reconocer la voz.</p><div class="acciones-dicotica"><button type="button" id="btnRepetirMicrofono">Repetir prueba</button><button type="button" id="btnManualMicrofono" class="boton-secundario">Continuar con captura manual</button></div>`;
      $("btnRepetirMicrofono")?.addEventListener("click", checkMicrophone);
      $("btnManualMicrofono")?.addEventListener("click", selectManualCapture);
      updateStartButtons();
    };
    recognition.onend = () => {
      if (activeRecognition === recognition) activeRecognition = null;
      $("detalleMicrofono")?.classList.remove("escuchando");
      if (!gotMicrophoneResult && !$("detalleMicrofono")?.textContent.includes("No se pudo")) {
        $("estadoMicrofono").textContent = "Sin reconocimiento";
        $("estadoCaptura").textContent = "Repetir o usar captura manual";
        $("detalleMicrofono").className = "microfono-estado";
        $("detalleMicrofono").innerHTML = `<p>Se reconocio:</p><blockquote>"Sin texto reconocido"</blockquote><p class="alerta-dicotica advertencia">El reconocimiento fue poco claro.</p><div class="acciones-dicotica"><button type="button" id="btnRepetirMicrofono">Repetir prueba</button><button type="button" id="btnManualMicrofono" class="boton-secundario">Continuar con captura manual</button></div>`;
        $("btnRepetirMicrofono")?.addEventListener("click", checkMicrophone);
        $("btnManualMicrofono")?.addEventListener("click", selectManualCapture);
        updateStartButtons();
      }
    };
    recognition.start();
  } catch (error) {
    $("estadoMicrofono").textContent = "No disponible";
    $("estadoCaptura").textContent = "Captura manual disponible";
    $("detalleMicrofono").className = "microfono-estado";
    $("detalleMicrofono").innerHTML = `<p class="alerta-dicotica advertencia">No se pudo acceder al microfono. Puede usarse captura manual.</p><button type="button" id="btnManualMicrofono" class="boton-secundario">Continuar con captura manual</button>`;
    $("btnManualMicrofono")?.addEventListener("click", selectManualCapture);
    updateStartButtons();
  }
}

function selectManualCapture() {
  activeRecognition?.abort?.();
  manualCaptureSelected = true;
  microphoneChecked = false;
  $("estadoMicrofono").textContent = "Captura manual";
  $("estadoCaptura").textContent = "Captura manual seleccionada";
  $("detalleMicrofono").className = "microfono-estado";
  $("detalleMicrofono").innerHTML = `<p>Se continuara con captura manual de respuestas.</p><p class="estado-exito">✓ Captura manual disponible</p>`;
  setStepState("pasoMicrofono", "estadoPasoMicrofono", "completado", "Completado");
  updateStartButtons();
}

function updateOverrideReason() {
  const selected = $("motivoOverrideSelect")?.value || "";
  const isOther = selected === "otra";
  $("motivoOverride")?.classList.toggle("oculta", !isOther);
  const reason = isOther ? $("motivoOverride").value.trim() : selected;
  updateHeadphoneCheck({ overrideReason: reason });
}

function renderHeadphoneState() {
  const overrideOn = Boolean(headphoneCheck.overrideUsed);
  $("panelOverrideAuriculares")?.classList.toggle("oculta", !overrideOn);
  if (!overrideOn) {
    headphoneCheck.overrideReason = "";
    if ($("motivoOverrideSelect")) $("motivoOverrideSelect").value = "";
    if ($("motivoOverride")) $("motivoOverride").value = "";
  }
  setChannelConfirmed("left", headphoneCheck.leftChannelConfirmed);
  setChannelConfirmed("right", headphoneCheck.rightChannelConfirmed);
  const leftText = headphoneCheck.leftChannelConfirmed ? "Canal izquierdo ✓" : "Canal izquierdo pendiente";
  const rightText = headphoneCheck.rightChannelConfirmed ? "Canal derecho ✓" : "Canal derecho pendiente";
  $("resumenAuriculares").textContent = overrideOn && headphoneCheck.overrideReason
    ? "Verificacion omitida por profesional"
    : `${leftText} | ${rightText}`;
  $("btnProbarDerecho")?.toggleAttribute("disabled", !headphoneCheck.leftChannelConfirmed && !overrideOn);
  $("auricularesVerificados")?.classList.toggle("oculta", !headphoneCheck.headphoneCheckCompleted);
  setStepState(
    "pasoAuriculares",
    "estadoPasoAuriculares",
    headphoneCheck.headphoneCheckCompleted ? "completado" : (headphoneCheck.leftChannelConfirmed || overrideOn ? "en-proceso" : "pendiente"),
    headphoneCheck.headphoneCheckCompleted ? "Completado" : (headphoneCheck.leftChannelConfirmed || overrideOn ? "En proceso" : "Pendiente")
  );
}

function setChannelPlaying(channel) {
  const isLeft = channel === "left";
  const card = $(isLeft ? "cardCanalIzquierdo" : "cardCanalDerecho");
  const status = $(isLeft ? "estadoCanalIzquierdo" : "estadoCanalDerecho");
  const message = $(isLeft ? "mensajeCanalIzquierdo" : "mensajeCanalDerecho");
  const confirmation = $(isLeft ? "confirmacionIzquierdo" : "confirmacionDerecho");
  card?.classList.remove("pendiente", "confirmado");
  card?.classList.add("reproduciendo");
  if (status) status.textContent = `Reproduciendo canal ${isLeft ? "izquierdo" : "derecho"}...`;
  if (message) message.textContent = `Reproduciendo canal ${isLeft ? "izquierdo" : "derecho"}...`;
  confirmation?.classList.add("oculta");
}

function setChannelAwaitingConfirmation(channel) {
  const isLeft = channel === "left";
  const card = $(isLeft ? "cardCanalIzquierdo" : "cardCanalDerecho");
  const status = $(isLeft ? "estadoCanalIzquierdo" : "estadoCanalDerecho");
  const message = $(isLeft ? "mensajeCanalIzquierdo" : "mensajeCanalDerecho");
  const confirmation = $(isLeft ? "confirmacionIzquierdo" : "confirmacionDerecho");
  card?.classList.remove("reproduciendo");
  card?.classList.add("pendiente");
  if (status) status.textContent = "Confirmacion requerida";
  if (message) message.textContent = `Escuchaste el sonido unicamente por el oido ${isLeft ? "izquierdo" : "derecho"}?`;
  confirmation?.classList.remove("oculta");
}

function setChannelConfirmed(channel, confirmed) {
  const isLeft = channel === "left";
  const card = $(isLeft ? "cardCanalIzquierdo" : "cardCanalDerecho");
  const status = $(isLeft ? "estadoCanalIzquierdo" : "estadoCanalDerecho");
  const message = $(isLeft ? "mensajeCanalIzquierdo" : "mensajeCanalDerecho");
  const confirmation = $(isLeft ? "confirmacionIzquierdo" : "confirmacionDerecho");
  if (!card || !status || !message) return;
  card.classList.toggle("confirmado", confirmed);
  card.classList.toggle("pendiente", !confirmed);
  confirmation?.classList.add("oculta");
  status.textContent = confirmed ? `Canal ${isLeft ? "izquierdo" : "derecho"} ✓` : "Pendiente";
  message.textContent = confirmed
    ? `Canal ${isLeft ? "izquierdo" : "derecho"} confirmado.`
    : (isLeft ? "Presiona reproducir para escuchar el canal izquierdo." : "Cuando confirmes el izquierdo, verifica el canal derecho.");
}

function resetChannel(channel, message) {
  if (channel === "left") {
    updateHeadphoneCheck({ leftChannelConfirmed: false, rightChannelConfirmed: false });
  } else {
    updateHeadphoneCheck({ rightChannelConfirmed: false });
  }
  const target = $(channel === "left" ? "mensajeCanalIzquierdo" : "mensajeCanalDerecho");
  if (target) target.textContent = message;
}

async function playVolumeCheck() {
  setStepState("pasoVolumen", "estadoPasoVolumen", "en-proceso", "En proceso");
  $("estadoVolumen").textContent = "Reproduciendo prueba";
  $("confirmacionVolumen")?.classList.add("oculta");
  await playVolumePrompt();
  $("estadoVolumen").textContent = "Confirmacion requerida";
  $("confirmacionVolumen")?.classList.remove("oculta");
}

async function playVolumePrompt() {
  if ("speechSynthesis" in window) {
    await new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance("Esta es una prueba de volumen.");
      utterance.lang = "es-MX";
      utterance.volume = Number($("volumenDicotica").value);
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      window.setTimeout(resolve, 2600);
    });
    return;
  }
  const ctx = await engine.ensureContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = 440;
  gain.gain.value = Math.max(0.02, Number($("volumenDicotica").value) * 0.18);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.45);
  await delay(550);
}

function adjustVolume(delta) {
  const input = $("volumenDicotica");
  const next = Math.min(1, Math.max(0, Number(input.value) + delta));
  input.value = String(Math.round(next * 100) / 100);
  engine.setVolume(Number(input.value));
  setVolumeConfirmed(false);
  playVolumeCheck();
}

function setVolumeConfirmed(confirmed) {
  volumeConfirmed = confirmed;
  $("estadoVolumen").textContent = confirmed ? "Volumen confirmado" : "Sin confirmar";
  setStepState("pasoVolumen", "estadoPasoVolumen", confirmed ? "completado" : "pendiente", confirmed ? "Completado" : "Pendiente");
  updateStartButtons();
}

function setStepState(panelId, labelId, state, label) {
  const panel = $(panelId);
  const badge = $(labelId);
  panel?.classList.remove("pendiente", "en-proceso", "completado");
  panel?.classList.add(state);
  if (badge) badge.textContent = label;
}

function corpusSummaryItem(label, value) {
  return `<div class="corpus-resumen-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function toggleCorpusDetails() {
  $("detalleCorpus")?.classList.toggle("oculta");
  $("btnMostrarCorpus").textContent = $("detalleCorpus")?.classList.contains("oculta") ? "Mostrar detalles del corpus" : "Ocultar detalles del corpus";
  renderCorpusTable();
}

function renderCorpusTable() {
  const pairs = (corpus?.pairs || []).filter((pair) => {
    const haystack = `${pair.trialId} ${pair.leftWord} ${pair.rightWord} ${pair.leftAudio} ${pair.rightAudio}`.toLowerCase();
    return !corpusSearch || haystack.includes(corpusSearch);
  });
  const totalPages = Math.max(1, Math.ceil(pairs.length / CORPUS_PAGE_SIZE));
  corpusPage = Math.min(corpusPage, totalPages);
  const start = (corpusPage - 1) * CORPUS_PAGE_SIZE;
  const visible = pairs.slice(start, start + CORPUS_PAGE_SIZE);
  if ($("tablaCorpus")) {
    $("tablaCorpus").innerHTML = visible.map((p) => `<tr><td>${escapeHtml(p.trialId)}</td><td>${p.blockNumber}</td><td>${p.trialNumber}</td><td>${escapeHtml(p.leftWord)}</td><td>${escapeHtml(p.rightWord)}</td><td>${escapeHtml(p.leftAudio)}</td><td>${escapeHtml(p.rightAudio)}</td></tr>`).join("");
  }
  if ($("paginaCorpus")) $("paginaCorpus").textContent = `Pagina ${corpusPage} de ${totalPages}`;
  $("btnCorpusPrev")?.toggleAttribute("disabled", corpusPage <= 1);
  $("btnCorpusNext")?.toggleAttribute("disabled", corpusPage >= totalPages);
}

function toggleTrialSpeechRecognition() {
  if (trialRecognitionActive) {
    activeRecognition?.stop?.();
    activeRecognition?.abort?.();
    return;
  }
  startSpeechRecognition({ manual: true });
}

function startSpeechRecognition({ manual = false } = {}) {
  if (!currentTrial) return;
  if (trialRecognitionActive) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showVoiceStatus("error", "Este navegador no soporta reconocimiento de voz.", "Puedes continuar escribiendo manualmente.");
    showManualResponseInput();
    return;
  }
  activeRecognition?.abort?.();
  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  suppressRecognitionCallbacks = false;
  trialRecognitionActive = true;
  trialRecognitionStartedAt = performance.now();
  trialRecognitionEndedAt = null;
  recognitionRaw = "";
  recognitionConfidence = null;
  recognition.lang = "es-MX";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  $("btnHablar").textContent = "Detener captura";
  $("btnHablar").classList.add("detener");
  $("btnConfirmarRespuesta")?.toggleAttribute("disabled", true);
  $("btnEditarRespuesta")?.toggleAttribute("disabled", true);
  $("panelTranscripcion")?.classList.add("oculta");
  $("campoRespuestaManual")?.classList.add("oculta");
  $("estadoEnsayo").textContent = "Procesando voz";
  showVoiceStatus("escuchando", "Escuchando...", "Pronuncia unicamente la palabra del oido derecho.");
  recognition.onresult = (event) => {
    const item = event.results?.[0]?.[0];
    recognitionRaw = item?.transcript || "";
    recognitionConfidence = item?.confidence ?? null;
    trialSpeechTranscriptOriginal = recognitionRaw;
    trialCaptureMethod = "voice";
    $("respuestaManual").value = recognitionRaw;
    renderRecognizedText(recognitionRaw);
  };
  recognition.onerror = () => {
    if (suppressRecognitionCallbacks) return;
    if (activeRecognition !== recognition && !currentTrial) return;
    trialRecognitionActive = false;
    trialRecognitionEndedAt = performance.now();
    $("btnHablar").textContent = "Hablar";
    $("btnHablar").classList.remove("detener");
    $("estadoEnsayo").textContent = "Confirmacion";
    showVoiceStatus("error", "No fue posible reconocer la palabra.", "Permite el acceso desde el navegador o utiliza captura manual.");
    $("btnConfirmarRespuesta")?.toggleAttribute("disabled", true);
    $("btnEditarRespuesta")?.toggleAttribute("disabled", true);
  };
  recognition.onend = () => {
    if (suppressRecognitionCallbacks) return;
    if (activeRecognition !== recognition && !currentTrial) return;
    trialRecognitionActive = false;
    trialRecognitionEndedAt = performance.now();
    if (activeRecognition === recognition) activeRecognition = null;
    $("btnHablar").textContent = "Hablar";
    $("btnHablar").classList.remove("detener");
    if (recognitionRaw) {
      $("estadoEnsayo").textContent = "Confirmacion";
      showVoiceStatus("completado", "Voz capturada", "Reconocimiento finalizado. Confirma, edita o repite la captura.");
      $("btnConfirmarRespuesta")?.toggleAttribute("disabled", false);
      $("btnEditarRespuesta")?.toggleAttribute("disabled", false);
      return;
    }
    showVoiceStatus("error", "No fue posible reconocer la palabra.", manual ? "Intenta nuevamente o escribe manualmente." : "Puedes intentar nuevamente o escribir manualmente.");
    $("estadoEnsayo").textContent = "Confirmacion";
  };
  try {
    recognition.start();
  } catch (error) {
    trialRecognitionActive = false;
    activeRecognition = null;
    $("btnHablar").textContent = "Hablar";
    $("btnHablar").classList.remove("detener");
    showVoiceStatus("error", "No fue posible acceder al microfono.", "Permite el acceso desde el navegador o utiliza captura manual.");
    showManualResponseInput();
  }
}

function showVoiceStatus(kind, title, message) {
  const box = $("estadoVoz");
  if (!box) return;
  box.className = `estado-voz ${kind || ""}`.trim();
  box.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
}

function renderRecognizedText(text) {
  $("panelTranscripcion")?.classList.remove("oculta");
  $("textoReconocido").textContent = text || "Sin respuesta";
}

function showManualResponseInput() {
  trialCaptureMethod = trialSpeechTranscriptOriginal ? "voice_edited" : "manual";
  $("campoRespuestaManual")?.classList.remove("oculta");
  $("respuestaManual")?.focus();
  $("btnConfirmarRespuesta")?.toggleAttribute("disabled", false);
  $("btnEditarRespuesta")?.toggleAttribute("disabled", true);
  showVoiceStatus(
    trialSpeechTranscriptOriginal ? "completado" : "error",
    trialSpeechTranscriptOriginal ? "Editando respuesta" : "Captura manual",
    trialSpeechTranscriptOriginal ? "Corrige la palabra reconocida y confirma." : "Escribe la palabra que dijo el paciente."
  );
}

function resetResponseCaptureUi() {
  trialSpeechTranscriptOriginal = "";
  trialCaptureMethod = "";
  trialRecognitionStartedAt = null;
  trialRecognitionEndedAt = null;
  trialRecognitionActive = false;
  suppressRecognitionCallbacks = false;
  recognitionConfidence = null;
  recognitionRaw = "";
  activeRecognition?.abort?.();
  $("respuestaManual").value = "";
  $("campoRespuestaManual")?.classList.add("oculta");
  $("panelTranscripcion")?.classList.add("oculta");
  $("textoReconocido").textContent = "Sin respuesta";
  $("btnHablar").textContent = "Hablar";
  $("btnHablar").classList.remove("detener");
  $("btnConfirmarRespuesta")?.toggleAttribute("disabled", true);
  $("btnEditarRespuesta")?.toggleAttribute("disabled", true);
  showVoiceStatus("pendiente", "Esperando audio", "La captura por voz iniciara automaticamente al terminar el audio.");
}

function updateStartButtons() {
  const captureReady = microphoneChecked || manualCaptureSelected;
  const prepReady = Boolean(corpusValidation?.ok && headphoneCheck.headphoneCheckCompleted && volumeConfirmed && captureReady);
  const demoReady = Boolean(prepReady && audioValidation.ok);
  $("btnIniciar")?.toggleAttribute("disabled", !demoReady);
  $("btnDemo")?.toggleAttribute("disabled", !demoReady);
  $("btnPractica")?.toggleAttribute("disabled", !prepReady);
  $("btnContinuarPractica")?.toggleAttribute("disabled", !prepReady);
  $("btnEntrenamiento")?.toggleAttribute("disabled", !demoReady);
  $("btnInvestigacion")?.toggleAttribute("disabled", !demoReady);
  $("btnIniciarModalidad")?.toggleAttribute("disabled", !demoReady);
}

function syncConfigTotals(event) {
  if (!event?.target) return;
  const blocks = clampNumber($("configBloques")?.value, 1, 4, 4);
  const perBlock = clampNumber($("configEnsayosBloque")?.value, 1, 30, 30);
  const totalInput = $("configTotalEnsayos");
  if (event.target.id === "configBloques" || event.target.id === "configEnsayosBloque") {
    totalInput.value = String(Math.min(120, blocks * perBlock));
  }
}

function applyModeDefaults(modeId) {
  rehabilitationModeManager.setCurrentMode(modeId, DICHOTIC_ACTIVITY_ID);
  const config = rehabilitationModeManager.getConfiguration({}, DICHOTIC_ACTIVITY_ID);
  setChecked("configFeedback", config.immediateFeedback);
  setChecked("configRespuestaCorrecta", config.showCorrectAnswer);
  setChecked("configMostrarClasificacion", config.showClassification);
  setChecked("configRepetirEstimulo", config.allowStimulusRepeat);
  setChecked("configReconocimientoAuto", config.voiceCapture !== false && config.manualCaptureMode !== true);
  setChecked("configCapturaManual", config.manualCaptureMode === true);
  setChecked("configPausaAutomatica", config.automaticPause === true);
  setChecked("configPausaManual", config.freePauses || config.manualPause);
  setChecked("configPantallaCompleta", config.fullscreen === true);
  setChecked("configSonidos", config.sounds !== false);
  setChecked("configAnimaciones", config.animations !== false);
  const maxReps = $("configMaxRepeticiones");
  if (maxReps) maxReps.value = String(config.maxRepetitions ?? 0);
  const response = $("configTiempoRespuesta");
  if (response) response.value = String(config.responseMaxSeconds || 15);
}

function setChecked(id, value) {
  const el = $(id);
  if (el) el.checked = Boolean(value);
}

function getTestConfig(modeOverride = "") {
  const blocks = clampNumber($("configBloques")?.value, 1, 4, 4);
  const trialsPerBlock = clampNumber($("configEnsayosBloque")?.value, 1, 30, 30);
  const maxTotal = Math.min(120, blocks * trialsPerBlock);
  const totalTrials = clampNumber($("configTotalEnsayos")?.value, 1, maxTotal, maxTotal);
  const mode = modeOverride || $("configModo")?.value || "clinical";
  rehabilitationModeManager.setCurrentMode(mode, DICHOTIC_ACTIVITY_ID);
  const overrides = {
    attendedEar: "right",
    blocks,
    trialsPerBlock,
    totalTrials,
    interTrialMs: clampNumber($("configTiempoEntreEnsayos")?.value, 300, 5000, 700),
    fixationMs: clampNumber($("configTiempoFijacion")?.value, 0, 5000, 700),
    responseMaxSeconds: clampNumber($("configTiempoRespuesta")?.value, 3, 60, 15),
    immediateFeedback: Boolean($("configFeedback")?.checked) || mode === "training" || mode === "rehabilitation",
    showCorrectAnswer: Boolean($("configRespuestaCorrecta")?.checked) || mode === "training",
    showClassification: Boolean($("configMostrarClasificacion")?.checked) || mode === "training",
    allowStimulusRepeat: Boolean($("configRepetirEstimulo")?.checked),
    maxRepetitions: clampNumber($("configMaxRepeticiones")?.value, 0, 10, 0),
    automaticRecognition: Boolean($("configReconocimientoAuto")?.checked) && !Boolean($("configCapturaManual")?.checked),
    manualCaptureMode: Boolean($("configCapturaManual")?.checked),
    automaticPause: Boolean($("configPausaAutomatica")?.checked),
    manualPause: Boolean($("configPausaManual")?.checked),
    fullscreen: Boolean($("configPantallaCompleta")?.checked),
    sounds: Boolean($("configSonidos")?.checked),
    animations: Boolean($("configAnimaciones")?.checked),
    showFixation: Boolean($("configCruz")?.checked),
    showCounter: Boolean($("configContador")?.checked),
    showProgress: Boolean($("configProgreso")?.checked),
    showBlockResults: Boolean($("configResultadosBloque")?.checked),
    mode,
    sequenceMode: corpus?.sequenceMode,
    randomized: false
  };
  return rehabilitationModeManager.getConfiguration(overrides, DICHOTIC_ACTIVITY_ID);
}

function buildSessionPairs(pairList, config) {
  return (pairList || []).slice(0, config.totalTrials).map((pair, index) => ({
    ...pair,
    sessionTrialNumber: index + 1,
    blockNumber: Math.floor(index / config.trialsPerBlock) + 1,
    trialNumber: (index % config.trialsPerBlock) + 1
  }));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function startPractice() {
  const config = { ...getTestConfig("demo"), blocks: 1, trialsPerBlock: 6, totalTrials: 6, immediateFeedback: true };
  const practicePairs = (corpus?.pairs || []).slice(0, 6).map((pair, index) => ({
    ...pair,
    trialId: `practice-${index + 1}`,
    blockNumber: 1,
    trialNumber: index + 1,
    sessionTrialNumber: index + 1
  }));
  sessionId = createSessionId();
  sessionMode = "practice_demo";
  sessionConfig = config;
  sessionStartedAt = performance.now();
  trials = [];
  currentIndex = -1;
  activeList = practicePairs;
  activeIsPractice = true;
  showTrialScreen();
  $("demoBanner").hidden = false;
  toast("Practica de demostracion: material provisional no valido para interpretacion clinica.");
  runTrialList(practicePairs, true);
}

function startTraining() {
  const config = getTestConfig("training");
  beginSession("training", buildSessionPairs(corpus.pairs, config), config);
}

function startSelectedMode() {
  const mode = $("configModo")?.value || "clinical";
  if (mode === "training") return startTraining();
  if (mode === "rehabilitation") return startRehabilitation();
  if (mode === "research") return startResearch();
  return startExperimental();
}

function startRehabilitation() {
  const config = getTestConfig("rehabilitation");
  beginSession("rehabilitation", buildSessionPairs(corpus.pairs, config), config);
}

function startResearch() {
  const config = getTestConfig("research");
  beginSession("research", buildSessionPairs(corpus.pairs, config), config);
}

function startExperimental() {
  if (!(corpusValidation?.ok && audioValidation.ok && headphoneCheck.headphoneCheckCompleted)) {
    toast("No se puede iniciar: corpus, audios y auriculares deben estar validados.");
    return;
  }
  if (!(corpusValidation?.authorizedMaterial && corpusValidation?.clinicallyValidated)) {
    openExperimentalModal();
    return;
  }
  continueExperimental();
}

function openDemoModal() {
  $("modalDemo")?.classList.remove("oculta");
}

function closeDemoModal() {
  $("modalDemo")?.classList.add("oculta");
}

function openExperimentalModal() {
  $("modalExperimental")?.classList.remove("oculta");
}

function closeExperimentalModal() {
  $("modalExperimental")?.classList.add("oculta");
}

function continueExperimental() {
  closeExperimentalModal();
  const config = getTestConfig("clinical");
  beginSession("clinical", buildSessionPairs(corpus.pairs, config), config);
}

function startDemo() {
  closeDemoModal();
  const config = getTestConfig("demo");
  beginSession("demo_technical", buildSessionPairs(corpus.pairs, config), config);
}

function beginSession(mode, pairList, config = getTestConfig()) {
  sessionId = createSessionId();
  sessionMode = mode;
  sessionConfig = config;
  sessionStartedAt = performance.now();
  rehabilitationModeManager.clearResearchEvents();
  if (config.researchLogging) {
    rehabilitationModeManager.attachResearchLogging(document);
  } else {
    rehabilitationModeManager.detachResearchLogging(document);
  }
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
  if (!isPractice && currentIndex > 0 && currentIndex % (sessionConfig?.trialsPerBlock || 30) === 0) {
    showBreak(currentTrial.blockNumber - 1, () => runCurrentTrial(list, isPractice));
    return;
  }
  await runCurrentTrial(list, isPractice);
}

async function runCurrentTrial(list, isPractice) {
  $("modoEnsayo").textContent = isPractice ? "Practica" : sessionModeLabel(sessionMode);
  $("bloqueActual").textContent = `${Math.max(1, currentTrial.blockNumber)}/${sessionConfig?.blocks || 4}`;
  const blockTrial = currentTrial.trialNumber || ((currentIndex % (sessionConfig?.trialsPerBlock || 30)) + 1);
  $("ensayoActual").textContent = `${blockTrial}/${sessionConfig?.trialsPerBlock || list.length}`;
  $("fijacion").classList.toggle("oculta", sessionConfig?.showFixation === false);
  document.querySelector(".hud-dicotica")?.classList.toggle("oculta", sessionConfig?.showCounter === false);
  $("estadoEnsayo").textContent = "Esperando";
  $("fijacion").textContent = sessionConfig?.showFixation === false ? "" : "+";
  $("indicacionRespuesta").textContent = "Espera el audio.";
  $("retroalimentacionEnsayo")?.classList.add("oculta");
  resetResponseCaptureUi();
  currentPlayback = null;
  window.clearTimeout(responseTimeoutTimer);
  await delay(sessionConfig?.fixationMs ?? 700);
  responseWindowStartPerf = null;
  try {
    if (!currentTrial.leftAudio || !currentTrial.rightAudio) throw new Error("Audios de ensayo no disponibles.");
    const playback = await engine.playDichoticPair(currentTrial);
    currentPlayback = playback;
    $("estadoEnsayo").textContent = "Escuchando";
    await playback.completed;
    responseWindowStartPerf = performance.now();
    $("indicacionRespuesta").textContent = "Responde ahora con una sola palabra.";
    await delay(AUTO_RECOGNITION_DELAY_MS);
    if (sessionConfig?.automaticRecognition !== false) {
      startSpeechRecognition();
    } else {
      showManualResponseInput();
    }
    responseTimeoutTimer = window.setTimeout(() => {
      const hasResponse = Boolean(trialSpeechTranscriptOriginal || $("respuestaManual")?.value.trim());
      if (currentTrial && !hasResponse) submitTrial("", {});
    }, (sessionConfig?.responseMaxSeconds || 15) * 1000);
  } catch (error) {
    submitTrial("", { technicalFailure: true, technicalError: error.message });
  }
}

function submitTrial(rawResponse, flags = {}) {
  if (!currentTrial) return;
  window.clearTimeout(responseTimeoutTimer);
  const recognitionToAbort = activeRecognition;
  activeRecognition = null;
  trialRecognitionActive = false;
  suppressRecognitionCallbacks = true;
  recognitionToAbort?.abort?.();
  const now = performance.now();
  const responseText = String(rawResponse || "").trim();
  const originalTranscript = trialSpeechTranscriptOriginal.trim();
  const editedTranscript = originalTranscript && responseText && responseText !== originalTranscript ? responseText : "";
  const captureMethod = originalTranscript && trialCaptureMethod !== "manual" ? "Voz" : "Manual";
  const scored = scoreDichoticTrial({
    sessionId,
    trial: currentTrial,
    rawResponse: responseText,
    timing: {
      scheduledStartTime: currentPlayback?.scheduledStartTime ?? null,
      actualStartTime: currentPlayback?.actualStartTime ?? null,
      synchronizationErrorMs: currentPlayback?.synchronizationErrorMs ?? null,
      responseWindowStartedAt: responseWindowStartPerf,
      responseStartedAt: responseText ? (trialRecognitionStartedAt ?? now) : null,
      responseEndedAt: now,
      responseLatencyMs: responseText && Number.isFinite(responseWindowStartPerf) ? Math.round(now - responseWindowStartPerf) : null,
      leftAudioLoaded: Boolean(currentPlayback?.leftAudioLoaded) && !flags.technicalFailure,
      rightAudioLoaded: Boolean(currentPlayback?.rightAudioLoaded) && !flags.technicalFailure,
      audioPlaybackCompleted: Boolean(currentPlayback?.completed) && !flags.technicalFailure
    },
    scoring: {
      ...flags,
      recognitionConfidence,
      scoringMethod: originalTranscript ? (editedTranscript ? "speech_recognition_corrected" : "speech_recognition") : "manual",
      manuallyReviewed: true,
      scorerId: usuarioId
    },
    context: {
      headphonesVerified: headphoneCheck.headphoneCheckCompleted,
      volumeSetting: Number($("volumenDicotica").value),
      corpusVersion: corpus?.corpusVersion || "practice"
    }
  });
  const finalTrial = {
    ...scored,
    speechTranscriptOriginal: originalTranscript,
    speechTranscriptEdited: editedTranscript,
    captureMethod,
    patientResponse: responseText,
    correct: Boolean(scored.isCorrect),
    reactionTime: scored.responseLatencyMs,
    recognitionStartedAt: trialRecognitionStartedAt,
    recognitionEndedAt: trialRecognitionEndedAt
  };
  trials.push(finalTrial);
  $("estadoEnsayo").textContent = "Siguiente ensayo";
  if (sessionConfig?.immediateFeedback) {
    showImmediateFeedback(finalTrial);
  } else {
    $("retroalimentacionEnsayo")?.classList.add("oculta");
    showVoiceStatus("completado", "Ensayo registrado", "Avanzando automaticamente al siguiente ensayo.");
  }
  currentTrial = null;
  currentPlayback = null;
  window.setTimeout(() => runTrialList(activeList, activeIsPractice), sessionConfig?.immediateFeedback ? 1000 : (sessionConfig?.interTrialMs ?? 700));
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

function showImmediateFeedback(trial) {
  const box = $("retroalimentacionEnsayo");
  if (!box) return;
  const response = trial.patientResponse || trial.rawResponse || "Sin respuesta";
  box.className = `retroalimentacion-ensayo ${trial.isCorrect ? "correcta" : "incorrecta"}`;
  box.innerHTML = `
    <strong>${trial.isCorrect ? "✓ Correcto" : "✗ Incorrecto"}</strong>
    <p><b>Palabra objetivo:</b> ${escapeHtml(trial.rightWord)}</p>
    <p><b>Tu respondiste:</b> ${escapeHtml(response)}</p>
    <p><b>Clasificacion:</b> ${escapeHtml(classificationLabel(trial.classification))}</p>
  `;
  showVoiceStatus("completado", "Ensayo registrado", "Avanzando automaticamente al siguiente ensayo.");
}

function finishSession() {
  const metrics = calculateDichoticMetrics(trials);
  const configuredBlocks = sessionConfig?.blocks || 4;
  const blockResults = (metrics.blockResults || []).filter((block) => Number(block.blockNumber) <= configuredBlocks);
  const durationMs = sessionStartedAt ? Math.round(performance.now() - sessionStartedAt) : null;
  const responseTimes = trials.map((trial) => trial.reactionTime ?? trial.responseLatencyMs).filter(Number.isFinite);
  const meanResponseTimeMs = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;
  const incorrectResponses = metrics.totalErrors + metrics.technicalFailures;
  const modalityMetadata = rehabilitationModeManager.getSessionMetadata({
    activityId: DICHOTIC_ACTIVITY_ID,
    activityVersion: DICHOTIC_ACTIVITY_VERSION,
    stimulusVersion: corpus?.corpusVersion || "",
    overrides: sessionConfig || {}
  });
  result = {
    activityId: DICHOTIC_ACTIVITY_ID,
    activityName: "Prueba de Escucha Dicotica",
    activityVersion: DICHOTIC_ACTIVITY_VERSION,
    ...modalityMetadata,
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
    configuration: sessionConfig || { attendedEar: "right", totalTrials: 120, blocks: 4, trialsPerBlock: 30, sequenceMode: corpus?.sequenceMode, randomized: false },
    headphoneCheck,
    volumeSetting: Number($("volumenDicotica").value),
    exclusionFlags: collectConditions(),
    results: { ...metrics, blockResults, incorrectResponses, meanResponseTimeMs, totalTimeMs: durationMs },
    blockResults,
    trialHistory: trials,
    breaks,
    interruptions,
    researchEvents: sessionConfig?.researchLogging ? rehabilitationModeManager.getResearchEvents() : [],
    browserInfo: sessionConfig?.recordBrowserInfo ? collectBrowserInfo() : null,
    voicePrivacy: { voiceRecordingConsent: false, consentDate: null, consentVersion: "no_audio_storage_default" }
  };
  rehabilitationModeManager.detachResearchLogging(document);
  saveLocal(result);
  saveRemote(result);
  renderResults(result);
}

function renderResults(r) {
  $("pantallaEnsayo").classList.add("oculta");
  $("pantallaResultados").classList.remove("oculta");
  const m = r.results;
  const cards = [["Total de ensayos", m.totalTrials],["Correctas", m.correctResponses],["Incorrectas", m.incorrectResponses ?? m.totalErrors],["Intrusiones oido izquierdo", m.leftEarIntrusions],["Palabras no presentadas", m.nonPresentedWords],["Omisiones", m.omissions],["Tiempo promedio", formatMs(m.meanResponseTimeMs)],["Tiempo total", formatMs(m.totalTimeMs)],["Porcentaje de aciertos", m.accuracyPercentage ?? "N/A"]];
  cards.push(["Modalidad", r.applicationModeLabel || sessionModeLabel(r.sessionMode)]);
  $("resultadosGrid").innerHTML = cards.map(([k,v]) => `<div class="resultado-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
  renderBlockSummary(m.blockResults || []);
  $("bloquesResumenGrid")?.classList.toggle("oculta", r.configuration?.showBlockResults === false);
  $("interpretacionDicotica").innerHTML = `<strong>Descripcion objetiva</strong><p>${objectiveSummary(m)}</p><p>${escapeHtml(r.modalityNotice || "")}</p>`;
  $("tablaBloques").innerHTML = m.blockResults.map((b) => `<tr><td>${b.blockNumber}</td><td>${b.correctResponses}</td><td>${b.leftEarIntrusions}</td><td>${b.nonPresentedWords}</td><td>${b.omissions}</td><td>${b.technicalFailures}</td></tr>`).join("");
  renderTrialDetails();
  renderBars("graficaBloques", m.blockResults.map((b) => [`B${b.blockNumber}`, b.correctResponses]));
  renderBars("graficaCategorias", [["Aciertos", m.correctResponses],["Izquierdo", m.leftEarIntrusions],["No presentadas", m.nonPresentedWords],["Omisiones", m.omissions],["Tecnicos", m.technicalFailures]]);
}

function renderTrialDetails() {
  if (!result || !$("tablaEnsayos")) return;
  const rows = filteredTrialDetails();
  $("tablaEnsayos").innerHTML = rows.map((t) => {
    const visual = t.isCorrect ? `<span class="resultado-ok">✓ Correcta</span>` : `<span class="resultado-error">✗ Incorrecta</span>`;
    return `<tr>
      <td>${t.trialNumber}</td>
      <td>${t.blockNumber}</td>
      <td>${escapeHtml(t.leftWord)}</td>
      <td>${escapeHtml(t.rightWord)}</td>
      <td>${escapeHtml(t.speechTranscriptOriginal || "")}</td>
      <td>${escapeHtml(t.speechTranscriptEdited || "")}</td>
      <td>${escapeHtml(t.captureMethod || captureMethodLabel(t))}</td>
      <td>${escapeHtml(classificationLabel(t.classification))}</td>
      <td>${visual}</td>
      <td>${t.reactionTime ?? t.responseLatencyMs ?? ""}</td>
      <td>${t.recognitionConfidence ?? ""}</td>
    </tr>`;
  }).join("");
}

function renderBlockSummary(blocks = []) {
  const container = $("bloquesResumenGrid");
  if (!container) return;
  container.innerHTML = blocks.map((block) => {
    const blockTrials = (result?.trialHistory || []).filter((trial) => Number(trial.blockNumber) === Number(block.blockNumber));
    const latencies = blockTrials.map((trial) => trial.reactionTime ?? trial.responseLatencyMs).filter(Number.isFinite);
    const meanLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const errors = (block.leftEarIntrusions || 0) + (block.nonPresentedWords || 0) + (block.omissions || 0) + (block.unintelligibleResponses || 0) + (block.technicalFailures || 0);
    return `<article class="bloque-resumen-card">
      <h4>Bloque ${block.blockNumber}</h4>
      <dl>
        <dt>Aciertos</dt><dd>${block.correctResponses || 0}</dd>
        <dt>Errores</dt><dd>${errors}</dd>
        <dt>Intrusiones</dt><dd>${block.leftEarIntrusions || 0}</dd>
        <dt>Omisiones</dt><dd>${block.omissions || 0}</dd>
        <dt>Tiempo promedio</dt><dd>${formatMs(meanLatency)}</dd>
      </dl>
    </article>`;
  }).join("");
}

function filteredTrialDetails() {
  const rows = [...(result?.trialHistory || [])].filter((trial) => {
    if (detailFilter === "correct" && !trial.isCorrect) return false;
    if (detailFilter === "incorrect" && trial.isCorrect) return false;
    if (!["all", "correct", "incorrect"].includes(detailFilter) && trial.classification !== detailFilter) return false;
    if (!detailSearch) return true;
    const haystack = [
      trial.leftWord,
      trial.rightWord,
      trial.rawResponse,
      trial.speechTranscriptOriginal,
      trial.speechTranscriptEdited,
      trial.captureMethod,
      classificationLabel(trial.classification)
    ].join(" ").toLowerCase();
    return haystack.includes(detailSearch);
  });
  rows.sort((a, b) => {
    const av = detailSort === "patientResponse" ? (a.patientResponse || a.rawResponse || "") : (a[detailSort] ?? "");
    const bv = detailSort === "patientResponse" ? (b.patientResponse || b.rawResponse || "") : (b[detailSort] ?? "");
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv), "es", { numeric: true, sensitivity: "base" });
  });
  return rows;
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
function exportCompleteResults() {
  if (!result) return;
  const payload = {
    ...result,
    detailedResponses: result.trialHistory.map(toExportTrial)
  };
  download(`escucha_dicotica_resultados_completos_${sessionId}.json`, JSON.stringify(payload, null, 2), "application/json");
}

async function copyResultsToClipboard() {
  if (!result) return;
  const text = result.trialHistory.map((trial) => {
    const response = trial.patientResponse || trial.rawResponse || "";
    return [
      `Ensayo ${trial.trialNumber} / Bloque ${trial.blockNumber}`,
      `Oido izquierdo: ${trial.leftWord}`,
      `Oido derecho (objetivo): ${trial.rightWord}`,
      `Paciente dijo: "${response}"`,
      `Clasificacion: ${trial.isCorrect ? "✓" : "✗"} ${classificationLabel(trial.classification)}`
    ].join("\n");
  }).join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("Resultados copiados al portapapeles.");
  } catch (error) {
    toast("No se pudo copiar al portapapeles.");
  }
}

function toExportTrial(trial) {
  return {
    trialNumber: trial.trialNumber,
    blockNumber: trial.blockNumber,
    leftWord: trial.leftWord,
    rightWord: trial.rightWord,
    speechTranscriptOriginal: trial.speechTranscriptOriginal || "",
    speechTranscriptEdited: trial.speechTranscriptEdited || "",
    captureMethod: trial.captureMethod || captureMethodLabel(trial),
    classification: trial.classification,
    correct: Boolean(trial.isCorrect),
    reactionTime: trial.reactionTime ?? trial.responseLatencyMs ?? null,
    recognitionConfidence: trial.recognitionConfidence ?? null
  };
}

function showTrialScreen() { $("pantallaPreparacion").classList.add("oculta"); $("pantallaResultados").classList.add("oculta"); $("pantallaEnsayo").classList.remove("oculta"); }
function collectConditions() {
  const conditions = [...document.querySelectorAll("[data-condicion]:checked")].map((el) => el.dataset.condicion);
  const selectedDominance = $("dominanciaLinguistica")?.value || "";
  const dominance = selectedDominance === "otra" ? $("dominanciaOtra")?.value.trim() : selectedDominance;
  return conditions.concat(dominance ? [`dominancia:${dominance}`] : []);
}
function objectiveSummary(m) { return `Se registraron ${m.correctResponses} aciertos, ${m.leftEarIntrusions} respuestas correspondientes al oido izquierdo, ${m.nonPresentedWords} palabras no presentadas y ${m.omissions} omisiones. Estos resultados dependen del corpus, audicion, auriculares e idioma.`; }
function classificationLabel(value) {
  return {
    correct: "Correcta",
    left_ear_intrusion: "Intrusion del oido izquierdo",
    non_presented_word: "Palabra no presentada",
    omission: "Omision",
    unintelligible: "Ininteligible",
    technical_failure: "Fallo tecnico",
    multiple_response: "Respuesta multiple"
  }[value] || value || "";
}
function sessionModeLabel(value) {
  return {
    demo_technical: "Demostracion tecnica",
    practice_demo: "Practica",
    training: "Entrenamiento",
    rehabilitation: "Rehabilitacion",
    clinical: "Evaluacion Clinica",
    experimental: "Experimental con corpus provisional",
    validated_experimental: "Experimental validada",
    research: "Investigacion"
  }[value] || value || "";
}
function captureMethodLabel(trial) { return trial?.scoringMethod?.startsWith("speech") ? "Voz" : "Manual"; }
function formatMs(value) {
  return Number.isFinite(value) ? `${value} ms` : "N/A";
}
function collectBrowserInfo() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    screen: {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      pixelRatio: window.devicePixelRatio ?? null
    }
  };
}
function renderBars(id, data) { const max = Math.max(...data.map(([,v]) => v), 1); $(id).innerHTML = data.map(([k,v]) => `<div class="barra-metrica"><span>${k}</span><i style="width:${Math.max(4,(v/max)*100)}%"></i><strong>${v}</strong></div>`).join(""); }
function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
function createSessionId() { return `dicotica-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function delay(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function toast(msg) { const t = $("toastDicotica"); t.textContent = msg; t.classList.add("visible"); window.setTimeout(() => t.classList.remove("visible"), 2600); }
function escapeHtml(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
