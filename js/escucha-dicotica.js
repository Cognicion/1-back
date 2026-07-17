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
let volumeConfirmed = false;
let microphoneChecked = false;
let manualCaptureSelected = false;
let corpusPage = 1;
let corpusSearch = "";

const RESPONSE_WINDOW_MS = 5000;
const CORPUS_PAGE_SIZE = 10;

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
  const captureReady = microphoneChecked || manualCaptureSelected;
  const prepReady = Boolean(corpusValidation?.ok && headphoneCheck.headphoneCheckCompleted && volumeConfirmed && captureReady);
  const demoReady = Boolean(prepReady && audioValidation.ok);
  const validatedReady = Boolean(demoReady && corpusValidation?.authorizedMaterial && corpusValidation?.clinicallyValidated);
  $("btnIniciar")?.toggleAttribute("disabled", !validatedReady);
  $("btnDemo")?.toggleAttribute("disabled", !demoReady);
  $("btnPractica")?.toggleAttribute("disabled", !prepReady);
  $("btnContinuarPractica")?.toggleAttribute("disabled", !prepReady);
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
function collectConditions() {
  const conditions = [...document.querySelectorAll("[data-condicion]:checked")].map((el) => el.dataset.condicion);
  const selectedDominance = $("dominanciaLinguistica")?.value || "";
  const dominance = selectedDominance === "otra" ? $("dominanciaOtra")?.value.trim() : selectedDominance;
  return conditions.concat(dominance ? [`dominancia:${dominance}`] : []);
}
function objectiveSummary(m) { return `Se registraron ${m.correctResponses} aciertos, ${m.leftEarIntrusions} respuestas correspondientes al oido izquierdo, ${m.nonPresentedWords} palabras no presentadas y ${m.omissions} omisiones. Estos resultados dependen del corpus, audicion, auriculares e idioma.`; }
function renderBars(id, data) { const max = Math.max(...data.map(([,v]) => v), 1); $(id).innerHTML = data.map(([k,v]) => `<div class="barra-metrica"><span>${k}</span><i style="width:${Math.max(4,(v/max)*100)}%"></i><strong>${v}</strong></div>`).join(""); }
function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
function createSessionId() { return `dicotica-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function delay(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function toast(msg) { const t = $("toastDicotica"); t.textContent = msg; t.classList.add("visible"); window.setTimeout(() => t.classList.remove("visible"), 2600); }
function escapeHtml(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
