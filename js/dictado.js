import { auth } from "./firebase.js";
import { AudioCaptureService } from "./services/audioCaptureService.js";
import { aplicarComandosDeVozSeguros } from "./services/clinicalTextNormalizer.js";
import { DraftPersistenceService } from "./services/dictadoPersistence.js";
import {
  DictadoStateMachine,
  ESTADOS_DICTADO,
  ETIQUETAS_ESTADO_DICTADO
} from "./services/dictadoStateMachine.js";
import { TranscriptAssembler } from "./services/transcriptAssembler.js";
import { WebSpeechTranscriptionProvider, PROVIDER_STATUS } from "./services/transcriptionProviders.js";

const SILENCIO_MS = 8500;
const REINICIOS_MAXIMOS = 6;

const runtime = {
  reconocimiento: null,
  maquina: new DictadoStateMachine(),
  audio: new AudioCaptureService(),
  ensamblador: null,
  persistencia: null,
  sessionId: "",
  userId: "",
  patientId: "",
  encounterId: "",
  reinicios: 0,
  reinicioTimer: null,
  cronometroTimer: null,
  meterTimer: null,
  silencioDesde: null,
  inicioEn: 0,
  acumuladoMs: 0,
  actualizacionInterna: false,
  stopSolicitado: false,
  wakeLock: null,
  inicializado: false,
  provider: null,
  errores: [],
  persistenceStatus: "sin_cambios"
};

function $(id) {
  return document.getElementById(id);
}

function obtenerSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function navegadorSoportaDictado() {
  return Boolean(obtenerSpeechRecognition());
}

function crearId(prefijo) {
  if (window.crypto?.randomUUID) return `${prefijo}-${window.crypto.randomUUID()}`;
  return `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pacienteActualId() {
  return $("uidPaciente")?.value || new URLSearchParams(window.location.search).get("id") || "sin-paciente";
}

function encuentroActualId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("notaId") || params.get("encounterId") || new Date().toISOString().slice(0, 10);
}

function usuarioActualId() {
  return (
    auth?.currentUser?.uid ||
    localStorage.getItem("cognicion.uid") ||
    localStorage.getItem("usuarioUid") ||
    localStorage.getItem("uid") ||
    "usuario-local"
  );
}

function contextoActual() {
  return {
    userId: usuarioActualId(),
    patientId: pacienteActualId(),
    encounterId: encuentroActualId()
  };
}

function asegurarContexto({ nuevaSesion = false } = {}) {
  const contexto = contextoActual();
  const requiereSesionNueva =
    nuevaSesion ||
    !runtime.sessionId ||
    runtime.userId !== contexto.userId ||
    runtime.patientId !== contexto.patientId ||
    runtime.encounterId !== contexto.encounterId;

  runtime.userId = contexto.userId;
  runtime.patientId = contexto.patientId;
  runtime.encounterId = contexto.encounterId;
  if (requiereSesionNueva) runtime.sessionId = crearId("dictado");

  if (!runtime.ensamblador || requiereSesionNueva) {
    runtime.ensamblador = new TranscriptAssembler({
      sessionId: runtime.sessionId,
      userId: runtime.userId,
      patientId: runtime.patientId,
      encounterId: runtime.encounterId
    });
  } else {
    runtime.ensamblador.setContext({
      sessionId: runtime.sessionId,
      userId: runtime.userId,
      patientId: runtime.patientId,
      encounterId: runtime.encounterId
    });
  }

  if (!runtime.persistencia || requiereSesionNueva) {
    runtime.persistencia = new DraftPersistenceService({
      userId: runtime.userId,
      patientId: runtime.patientId,
      encounterId: runtime.encounterId
    });
  } else {
    runtime.persistencia.setContext({
      userId: runtime.userId,
      patientId: runtime.patientId,
      encounterId: runtime.encounterId
    });
  }
}

function textareaDictado() {
  return $("textoDictadoClinico");
}

function campoDestinoNota() {
  return $("subjetivo") || $("padecimientoActual") || $("motivoAtencion") || $("notaClinica");
}

function estadoNodo() {
  return $("estadoDictadoClinico");
}

function setEstadoVisual(estado) {
  const nodo = estadoNodo();
  if (!nodo) return;
  nodo.textContent = ETIQUETAS_ESTADO_DICTADO[estado] || estado;
  nodo.dataset.estado = estado;
}

function escribirTextarea(valor) {
  const textarea = textareaDictado();
  if (!textarea) return;
  runtime.actualizacionInterna = true;
  textarea.value = valor || "";
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  runtime.actualizacionInterna = false;
}

function textoActual() {
  return textareaDictado()?.value || "";
}

function mostrarTextoProvisional(texto = "") {
  const nodo = $("dictadoTextoProvisional");
  if (!nodo) return;
  nodo.textContent = texto || "Sin texto provisional.";
  nodo.classList.toggle("activo", Boolean(texto));
}

function mostrarTextoPendiente(texto = "") {
  const nodo = $("dictadoTextoPendiente");
  if (!nodo) return;
  nodo.textContent = texto || "Sin texto pendiente.";
  nodo.classList.toggle("activo", Boolean(texto));
}

function mostrarAdvertencia(texto = "", tipo = "info") {
  const nodo = $("dictadoAdvertencias");
  if (!nodo) return;
  nodo.textContent = texto;
  nodo.dataset.tipo = tipo;
  nodo.hidden = !texto;
}

function formatearTiempo(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function actualizarCronometro() {
  const nodo = $("cronometroDictadoClinico");
  if (!nodo) return;
  const activo = runtime.maquina.current === ESTADOS_DICTADO.LISTENING;
  const total = runtime.acumuladoMs + (activo && runtime.inicioEn ? Date.now() - runtime.inicioEn : 0);
  nodo.textContent = formatearTiempo(total);
}

function iniciarCronometro() {
  if (!runtime.inicioEn) runtime.inicioEn = Date.now();
  if (runtime.cronometroTimer) return;
  runtime.cronometroTimer = window.setInterval(actualizarCronometro, 500);
  actualizarCronometro();
}

function pausarCronometro() {
  if (runtime.inicioEn) {
    runtime.acumuladoMs += Date.now() - runtime.inicioEn;
    runtime.inicioEn = 0;
  }
  actualizarCronometro();
}

function reiniciarCronometro() {
  runtime.inicioEn = 0;
  runtime.acumuladoMs = 0;
  if (runtime.cronometroTimer) {
    window.clearInterval(runtime.cronometroTimer);
    runtime.cronometroTimer = null;
  }
  actualizarCronometro();
}

function actualizarMetricas() {
  const stats = runtime.ensamblador?.stats() || {};
  const segmentos = $("dictadoSegmentos");
  const confianza = $("dictadoConfianza");
  const sesion = $("dictadoSesion");
  if (segmentos) segmentos.textContent = `${stats.finalSegments || 0} segmentos`;
  if (confianza) confianza.textContent = stats.averageConfidence ? `${Math.round(stats.averageConfidence * 100)}% confianza` : "Confianza no disponible";
  if (sesion) sesion.textContent = runtime.sessionId ? `Sesión: ${runtime.sessionId.slice(-8)}` : "Sin sesión";
  actualizarDiagnosticoSeguro();
}

function actualizarBotonRecuperar() {
  const boton = $("btnRecuperarDictado");
  if (!boton || !runtime.persistencia) return;
  const borrador = runtime.persistencia.load();
  const tieneContenido = Boolean(
    borrador?.text || borrador?.pendingText || borrador?.provisional
    || borrador?.pendingSegments?.length || borrador?.interimResults?.length
  );
  boton.disabled = !tieneContenido;
}

function guardarBorradorTemporal() {
  asegurarContexto();
  runtime.persistencia?.save({
    ...runtime.ensamblador?.toJSON(),
    text: textoActual(),
    status: runtime.maquina.current,
    sessionId: runtime.sessionId,
    updatedAt: new Date().toISOString()
  });
  runtime.persistenceStatus = "guardado_local";
  actualizarBotonRecuperar();
}

export function snapshotDictadoClinico() {
  asegurarContexto();
  const snapshot = runtime.ensamblador?.toJSON?.() || {};
  const confirmedSegments = Array.isArray(snapshot.confirmedSegments) ? snapshot.confirmedSegments : [];
  const pendingSegments = Array.isArray(snapshot.pendingSegments) ? snapshot.pendingSegments : [];
  const interimSegments = Array.isArray(snapshot.interimResults)
    ? snapshot.interimResults.map((entry) => Array.isArray(entry) ? entry[1] : entry).filter(Boolean)
    : [];
  const transcriptSegments = [...confirmedSegments, ...pendingSegments, ...interimSegments];
  const speakers = Array.from(new Set(transcriptSegments.map((segment) => segment?.speaker).filter(Boolean)));
  const correctedTranscript = textoActual().trim();
  const confirmedTranscript = (runtime.ensamblador?.getText?.() || snapshot.text || correctedTranscript || "").trim();
  const pendingTranscript = (runtime.ensamblador?.getPendingText?.() || snapshot.pendingText || "").trim();
  return {
    transcriptSessionId: runtime.sessionId,
    userId: runtime.userId,
    patientId: runtime.patientId,
    encounterId: runtime.encounterId,
    confirmedTranscript,
    pendingTranscript,
    correctedTranscript,
    transcriptSegments,
    speakers,
    provenance: {
      source: "dictado_por_voz",
      provider: runtime.provider?.capability?.().id || "web_speech_api",
      providerStatus: runtime.provider?.capability?.().status || PROVIDER_STATUS.NOT_CONFIGURED,
      dictationState: runtime.maquina.current,
      createdAt: snapshot.createdAt || null,
      updatedAt: new Date().toISOString(),
      manualRevision: snapshot.manualRevision || 0
    }
  };
}

function actualizarBotones() {
  const estado = runtime.maquina.current;
  const escuchando = estado === ESTADOS_DICTADO.LISTENING || estado === ESTADOS_DICTADO.REQUESTING_PERMISSION || estado === ESTADOS_DICTADO.RECONNECTING;
  const pausado = estado === ESTADOS_DICTADO.PAUSED || estado === ESTADOS_DICTADO.COMPLETED || estado === ESTADOS_DICTADO.READY;

  const btnIniciar = $("btnIniciarDictado");
  const btnPausar = $("btnPausarDictado");
  const btnReanudar = $("btnReanudarDictado");
  const btnFinalizar = $("btnFinalizarDictado");
  const btnCancelar = $("btnCancelarDictado");
  const btnInsertar = $("btnInsertarDictado");
  const btnLimpiar = $("btnLimpiarDictado");

  if (btnIniciar) {
    btnIniciar.disabled = escuchando;
    btnIniciar.textContent = pausado && textoActual().trim() ? "Continuar dictado" : "Iniciar dictado";
  }
  if (btnPausar) btnPausar.disabled = estado !== ESTADOS_DICTADO.LISTENING;
  if (btnReanudar) btnReanudar.disabled = !pausado;
  if (btnFinalizar) btnFinalizar.disabled = ![ESTADOS_DICTADO.LISTENING, ESTADOS_DICTADO.RECONNECTING, ESTADOS_DICTADO.PAUSED].includes(estado);
  if (btnCancelar) btnCancelar.disabled = !textoActual().trim() && estado === ESTADOS_DICTADO.READY;
  if (btnInsertar) btnInsertar.disabled = !textoActual().trim();
  if (btnLimpiar) btnLimpiar.disabled = !textoActual().trim();
}

function elegirMejorAlternativa(resultado) {
  const alternativas = Array.from(resultado || []);
  const mejor = alternativas
    .filter((item) => item?.transcript)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  return mejor || resultado?.[0] || { transcript: "", confidence: 0 };
}

function ejecutarComandos(comandos = []) {
  for (const comando of comandos) {
    if (comando.type === "pause") setTimeout(() => pausarDictado(), 0);
    if (comando.type === "resume") setTimeout(() => reanudarDictado(), 0);
    if (comando.type === "undo-last-sentence") {
      runtime.ensamblador?.undoLastSentence();
      escribirTextarea(runtime.ensamblador?.getText() || "");
    }
  }
}

function procesarResultado(evento, providerContext = null) {
  if (!runtime.ensamblador) asegurarContexto();
  if (providerContext && (providerContext.sessionId !== runtime.sessionId || providerContext.patientId !== runtime.patientId)) return;
  const streamId = providerContext?.streamId || `${runtime.sessionId}:stream-legacy`;
  const streamSequence = Number(providerContext?.streamSequence || 0);
  const indicesProvisionales = [];

  // Web Speech entrega una instantánea acumulada. Se reconstruyen todos los
  // resultados del ciclo, no solamente las últimas palabras desde resultIndex.
  for (let i = 0; i < evento.results.length; i += 1) {
    const resultado = evento.results[i];
    const alternativa = elegirMejorAlternativa(resultado);
    const limpio = aplicarComandosDeVozSeguros(alternativa.transcript || "");
    ejecutarComandos(limpio.commands);
    if (!limpio.normalizedText) continue;

    const agregado = runtime.ensamblador.addRecognitionResult({
      sessionId: providerContext?.sessionId || runtime.sessionId,
      patientId: providerContext?.patientId || runtime.patientId,
      streamId,
      streamSequence,
      resultIndex: i,
      transcript: limpio.normalizedText,
      confidence: Number.isFinite(Number(alternativa.confidence)) && Number(alternativa.confidence) > 0
        ? Number(alternativa.confidence) : null,
      isFinal: resultado.isFinal,
      provider: "web_speech_api"
    });

    if (!resultado.isFinal) indicesProvisionales.push(i);
  }

  runtime.ensamblador.retainInterimResults(streamId, indicesProvisionales);
  escribirTextarea(runtime.ensamblador.getText());
  mostrarTextoProvisional(runtime.ensamblador.getProvisional());
  mostrarTextoPendiente(runtime.ensamblador.getPendingText());
  guardarBorradorTemporal();
  actualizarMetricas();
}

async function iniciarCapturaMicrofono() {
  const selector = $("selectorMicrofonoDictado");
  try {
    await runtime.audio.start(selector?.value || "");
    iniciarMedidorAudio();
  } catch (error) {
    runtime.maquina.transition(ESTADOS_DICTADO.RECOVERABLE_ERROR, { error });
    mostrarAdvertencia("No se pudo activar el micrófono. Revisa permisos del navegador.", "error");
    throw error;
  }
}

function detenerCapturaMicrofono() {
  if (runtime.meterTimer) {
    window.clearInterval(runtime.meterTimer);
    runtime.meterTimer = null;
  }
  runtime.audio.stop();
  const barra = $("nivelAudioDictado");
  if (barra) barra.style.width = "0%";
}

function iniciarMedidorAudio() {
  if (runtime.meterTimer) window.clearInterval(runtime.meterTimer);
  runtime.meterTimer = window.setInterval(() => {
    const medicion = runtime.audio.measure();
    const barra = $("nivelAudioDictado");
    if (barra) barra.style.width = `${Math.min(100, Math.round(medicion.rms * 280))}%`;

    const advertencia = $("advertenciaAudioDictado");
    if (advertencia) {
      advertencia.textContent = medicion.warnings.join(" · ");
      advertencia.hidden = medicion.warnings.length === 0;
    }

    if (runtime.maquina.current !== ESTADOS_DICTADO.LISTENING) return;
    if (medicion.rms < 0.012) {
      runtime.silencioDesde ||= Date.now();
      if (Date.now() - runtime.silencioDesde > SILENCIO_MS) {
        mostrarAdvertencia("Se detecta volumen bajo. Acerca el micrófono o revisa el dispositivo.", "warning");
      }
    } else {
      runtime.silencioDesde = null;
      mostrarAdvertencia("");
    }
  }, 260);
}

async function cargarDispositivosAudio() {
  const selector = $("selectorMicrofonoDictado");
  if (!selector || selector.dataset.cargado === "true") return;
  try {
    const dispositivos = await runtime.audio.listDevices();
    selector.innerHTML = `<option value="">Micrófono predeterminado</option>${dispositivos
      .map((item, index) => `<option value="${item.deviceId}">${item.label || `Micrófono ${index + 1}`}</option>`)
      .join("")}`;
    selector.dataset.cargado = "true";
  } catch (error) {
    console.warn("No se pudieron listar micrófonos:", error);
  }
}

function crearReconocimiento() {
  const SpeechRecognition = obtenerSpeechRecognition();
  if (!SpeechRecognition) return null;

  const reconocimiento = new SpeechRecognition();
  reconocimiento.lang = "es-MX";
  reconocimiento.continuous = true;
  reconocimiento.interimResults = true;
  reconocimiento.maxAlternatives = 3;

  reconocimiento.onresult = procesarResultado;

  reconocimiento.onerror = (evento) => {
    console.warn("Error de dictado:", evento.error, evento);
    if (evento.error === "not-allowed" || evento.error === "service-not-allowed") {
      runtime.maquina.transition(ESTADOS_DICTADO.FATAL_ERROR, { error: evento.error });
      mostrarAdvertencia("Tu navegador bloqueó el micrófono. Autoriza el permiso para usar dictado.", "error");
      detenerCapturaMicrofono();
      pausarCronometro();
      actualizarBotones();
      return;
    }
    runtime.maquina.transition(ESTADOS_DICTADO.RECOVERABLE_ERROR, { error: evento.error });
    mostrarAdvertencia("El dictado tuvo una interrupción temporal. Puedes reanudarlo sin perder texto.", "warning");
  };

  reconocimiento.onend = () => {
    if (runtime.stopSolicitado) return;
    if (runtime.maquina.current !== ESTADOS_DICTADO.LISTENING && runtime.maquina.current !== ESTADOS_DICTADO.RECONNECTING) return;
    if (runtime.reinicios >= REINICIOS_MAXIMOS) {
      runtime.maquina.transition(ESTADOS_DICTADO.PAUSED, { reason: "max-restarts" });
      mostrarAdvertencia("El dictado se pausó para evitar duplicados tras varias reconexiones.", "warning");
      pausarCronometro();
      detenerCapturaMicrofono();
      actualizarBotones();
      return;
    }
    runtime.reinicios += 1;
    runtime.maquina.transition(ESTADOS_DICTADO.RECONNECTING, { reinicios: runtime.reinicios });
    runtime.reinicioTimer = window.setTimeout(() => {
      try {
        runtime.reconocimiento?.start();
        runtime.maquina.transition(ESTADOS_DICTADO.LISTENING, { reinicios: runtime.reinicios });
      } catch (error) {
        console.warn("No se pudo reanudar el reconocimiento:", error);
      }
      actualizarBotones();
    }, 450);
  };

  return reconocimiento;
}

function crearProveedorTranscripcion() {
  runtime.provider?.dispose?.();
  runtime.provider = new WebSpeechTranscriptionProvider({
    onResult: procesarResultado,
    onError: (error) => {
      runtime.errores.push({ code: error.code, at: new Date().toISOString() });
      runtime.errores = runtime.errores.slice(-8);
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(error.code)) {
        runtime.maquina.transition(ESTADOS_DICTADO.FATAL_ERROR, { error: error.code });
        mostrarAdvertencia(error.code === "audio-capture" ? "No se encontró una entrada de audio disponible." : "El permiso del micrófono fue rechazado. Autorízalo en el navegador para continuar.", "error");
        detenerCapturaMicrofono();
        pausarCronometro();
      } else {
        runtime.maquina.transition(ESTADOS_DICTADO.RECOVERABLE_ERROR, { error: error.code });
        mostrarAdvertencia(error.code === "network" ? "El reconocimiento perdió la conexión. El texto acumulado se conserva." : `Interrupción del reconocimiento (${error.code}). El texto acumulado se conserva.`, "warning");
      }
      actualizarBotones();
      actualizarDiagnosticoSeguro();
    },
    onState: ({ state, retryCount }) => {
      runtime.reinicios = retryCount || 0;
      if (state === "reconnecting") runtime.maquina.transition(ESTADOS_DICTADO.RECONNECTING, { reinicios: runtime.reinicios });
      if (state === "listening" && runtime.maquina.current !== ESTADOS_DICTADO.LISTENING) runtime.maquina.transition(ESTADOS_DICTADO.LISTENING, { reinicios: runtime.reinicios });
      actualizarDiagnosticoSeguro();
    },
    onStreamEnd: ({ streamId }) => {
      runtime.ensamblador?.preserveInterimsAsPending({ streamId });
      mostrarTextoProvisional(runtime.ensamblador?.getProvisional() || "");
      mostrarTextoPendiente(runtime.ensamblador?.getPendingText() || "");
      guardarBorradorTemporal();
      actualizarMetricas();
    }
  });
  return runtime.provider;
}

async function solicitarWakeLock() {
  try {
    runtime.wakeLock = await navigator.wakeLock?.request?.("screen");
  } catch {
    runtime.wakeLock = null;
  }
}

async function liberarWakeLock() {
  try {
    await runtime.wakeLock?.release?.();
  } catch {
    // No action needed.
  } finally {
    runtime.wakeLock = null;
  }
}

export async function iniciarDictado() {
  if (!navegadorSoportaDictado()) {
    runtime.maquina.transition(ESTADOS_DICTADO.FATAL_ERROR, { reason: "unsupported" });
    mostrarAdvertencia("Tu navegador no soporta dictado por voz.", "error");
    return;
  }

  asegurarContexto();
  runtime.stopSolicitado = false;
  runtime.reinicios = 0;
  runtime.maquina.transition(ESTADOS_DICTADO.REQUESTING_PERMISSION, { reason: "start" });
  actualizarBotones();

  try {
    await cargarDispositivosAudio();
    await iniciarCapturaMicrofono();
    await solicitarWakeLock();
    const provider = crearProveedorTranscripcion();
    provider.start({ sessionId: runtime.sessionId, patientId: runtime.patientId, encounterId: runtime.encounterId });
    runtime.maquina.transition(ESTADOS_DICTADO.LISTENING, { reason: "start" });
    iniciarCronometro();
    mostrarAdvertencia("");
  } catch (error) {
    console.warn("No se pudo iniciar dictado:", error);
    runtime.maquina.transition(ESTADOS_DICTADO.RECOVERABLE_ERROR, { error });
    detenerCapturaMicrofono();
  } finally {
    actualizarBotones();
    actualizarMetricas();
  }
}

export function pausarDictado() {
  runtime.stopSolicitado = true;
  if (runtime.reinicioTimer) window.clearTimeout(runtime.reinicioTimer);
  runtime.ensamblador?.preserveInterimsAsPending({ streamId: runtime.provider?.recognition?.cognicionStreamContext?.streamId || "" });
  runtime.ensamblador?.includePendingInText();
  escribirTextarea(runtime.ensamblador?.getText() || "");
  mostrarTextoProvisional("");
  mostrarTextoPendiente(runtime.ensamblador?.getPendingText() || "");
  runtime.provider?.stop();
  runtime.reconocimiento = null;
  detenerCapturaMicrofono();
  pausarCronometro();
  liberarWakeLock();
  runtime.maquina.transition(ESTADOS_DICTADO.PAUSED, { reason: "user" });
  guardarBorradorTemporal();
  actualizarBotones();
}

export async function reanudarDictado() {
  await iniciarDictado();
}

export function finalizarDictado() {
  runtime.stopSolicitado = true;
  if (runtime.reinicioTimer) window.clearTimeout(runtime.reinicioTimer);
  runtime.ensamblador?.preserveInterimsAsPending({ streamId: runtime.provider?.recognition?.cognicionStreamContext?.streamId || "" });
  runtime.ensamblador?.includePendingInText();
  escribirTextarea(runtime.ensamblador?.getText() || "");
  mostrarTextoPendiente(runtime.ensamblador?.getPendingText() || "");
  runtime.provider?.stop();
  runtime.reconocimiento = null;
  detenerCapturaMicrofono();
  pausarCronometro();
  liberarWakeLock();
  mostrarTextoProvisional("");
  runtime.maquina.transition(ESTADOS_DICTADO.COMPLETED, { reason: "finished" });
  guardarBorradorTemporal();
  actualizarBotones();
}

export function cancelarDictado() {
  const hayTexto = textoActual().trim();
  if (hayTexto && !confirm("Se cancelará el dictado actual y se eliminará el borrador local. La nota clínica no se modificará.")) return;
  finalizarDictado();
  asegurarContexto({ nuevaSesion: true });
  runtime.ensamblador.clear();
  runtime.persistencia.clear();
  escribirTextarea("");
  mostrarTextoProvisional("");
  mostrarTextoPendiente("");
  reiniciarCronometro();
  runtime.maquina.transition(ESTADOS_DICTADO.READY, { reason: "cancel" });
  actualizarBotonRecuperar();
  actualizarBotones();
  actualizarMetricas();
}

export function limpiarDictado() {
  if (textoActual().trim() && !confirm("Esto vaciará solo el texto dictado. No modifica la nota clínica principal.")) return;
  asegurarContexto();
  runtime.ensamblador.clear();
  runtime.persistencia.clear();
  escribirTextarea("");
  mostrarTextoProvisional("");
  mostrarTextoPendiente("");
  actualizarBotonRecuperar();
  actualizarBotones();
  actualizarMetricas();
}

export function recuperarUltimoDictado() {
  asegurarContexto();
  const borrador = runtime.persistencia?.load();
  const tieneContenido = Boolean(
    borrador?.text || borrador?.pendingText || borrador?.provisional
    || borrador?.pendingSegments?.length || borrador?.interimResults?.length
  );
  if (!tieneContenido) {
    alert("No hay un dictado temporal para recuperar en este paciente y encuentro.");
    return;
  }
  const actual = textoActual().trim();
  runtime.ensamblador.restore(borrador);
  runtime.ensamblador.preserveInterimsAsPending();
  runtime.ensamblador.includePendingInText();
  const recuperado = runtime.ensamblador.getText();
  const texto = actual && !recuperado.includes(actual) ? `${actual}\n\n${recuperado}`.trim() : recuperado || actual;
  runtime.ensamblador.setManualText(texto, { recordEdit: false });
  escribirTextarea(texto);
  mostrarTextoProvisional("");
  mostrarTextoPendiente(runtime.ensamblador.getPendingText());
  runtime.maquina.transition(ESTADOS_DICTADO.COMPLETED, { reason: "restored" });
  actualizarBotones();
  actualizarMetricas();
}

export function insertarDictadoEnNota() {
  const texto = textoActual().trim();
  if (!texto) {
    alert("No hay texto dictado para insertar.");
    return;
  }
  const confirmado = confirm("Revise y corrija el dictado antes de integrarlo al expediente clínico.");
  if (!confirmado) return;

  const destino = campoDestinoNota();
  if (!destino) {
    alert("No se encontró el campo principal de la nota clínica.");
    return;
  }

  const separador = destino.value?.trim() ? "\n\n" : "";
  destino.value = `${destino.value || ""}${separador}${texto}`;
  destino.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function probarMicrofono() {
  try {
    await iniciarCapturaMicrofono();
    mostrarAdvertencia("Micrófono activo. Si ves movimiento en la barra, la entrada funciona.", "info");
    window.setTimeout(detenerCapturaMicrofono, 2200);
  } catch {
    // Error handled in iniciarCapturaMicrofono.
  }
}

function crearPanelAvanzado() {
  const tarjeta = document.querySelector(".dictado-clinico-card");
  const acciones = document.querySelector(".dictado-clinico-acciones");
  if (!tarjeta || !acciones || $("panelAvanzadoDictado")) return;

  const panel = document.createElement("section");
  panel.id = "panelAvanzadoDictado";
  panel.className = "dictado-panel-avanzado";
  panel.innerHTML = `
    <div class="dictado-clinico-toolbar">
      <label>
        Micrófono
        <select id="selectorMicrofonoDictado">
          <option value="">Micrófono predeterminado</option>
        </select>
      </label>
      <button id="btnProbarMicrofono" type="button" class="boton-secundario">Probar micrófono</button>
      <button id="btnRecuperarDictado" type="button" class="boton-secundario">Recuperar último dictado</button>
      <button id="btnReanudarDictado" type="button" class="boton-secundario">Reanudar</button>
      <button id="btnFinalizarDictado" type="button" class="boton-secundario">Finalizar</button>
      <button id="btnCancelarDictado" type="button" class="boton-secundario dictado-btn-danger">Cancelar sesión</button>
    </div>
    <div class="dictado-metricas" aria-live="polite">
      <span id="cronometroDictadoClinico">00:00</span>
      <div class="dictado-audio-meter" aria-label="Nivel de audio"><span id="nivelAudioDictado"></span></div>
      <span id="dictadoSegmentos">0 segmentos</span>
      <span id="dictadoConfianza">Confianza no disponible</span>
      <span id="dictadoSesion">Sin sesión</span>
    </div>
    <p id="advertenciaAudioDictado" class="dictado-advertencia-audio" hidden></p>
    <p id="dictadoAdvertencias" class="dictado-advertencia-audio" hidden></p>
    <div class="dictado-provisional">
      <strong>Texto pendiente de confirmación</strong>
      <p id="dictadoTextoPendiente">Sin texto pendiente.</p>
      <strong>Texto provisional</strong>
      <p id="dictadoTextoProvisional">Sin texto provisional.</p>
    </div>
    <details class="dictado-diagnostico-seguro">
      <summary>Diagnóstico seguro y lista de prueba</summary>
      <pre id="dictadoDiagnosticoSeguro">Sin iniciar</pre>
      <ul class="dictado-checklist-manual">
        <li>Permitir y rechazar micrófono: verificar estados y mensajes.</li>
        <li>Dictar, pausar, reanudar y finalizar: conservar texto final y provisional.</li>
        <li>Editar durante el dictado: la edición manual debe permanecer.</li>
        <li>Cancelar o limpiar: exigir confirmación y liberar micrófono.</li>
        <li>Recargar: recuperar únicamente el borrador del mismo paciente y encuentro.</li>
        <li>Cambiar de paciente: confirmar y rechazar eventos tardíos del paciente anterior.</li>
        <li>Desconectar red: conservar texto y aplicar reintentos limitados con backoff.</li>
        <li>Navegar fuera: detener reconocimiento y tracks.</li>
      </ul>
      <p>La captura de voz, permisos reales y comportamiento al desconectar requieren intervención del usuario en un navegador compatible.</p>
    </details>
  `;
  acciones.insertAdjacentElement("beforebegin", panel);
}

function actualizarDiagnosticoSeguro() {
  const panel = $("dictadoDiagnosticoSeguro");
  if (!panel) return;
  const stats = runtime.ensamblador?.stats?.() || {};
  const session = runtime.sessionId ? `${runtime.sessionId.slice(0, 8)}…${runtime.sessionId.slice(-4)}` : "sin sesión";
  panel.textContent = [
    `estado=${runtime.maquina.current}`,
    `sessionId=${session}`,
    `segmentos=${stats.total || 0}`,
    `pendientes=${stats.pending || 0}`,
    `provisionales=${stats.provisional || 0}`,
    `errores=${runtime.errores.length}`,
    `reintentos=${runtime.provider?.retryCount || 0}`,
    `micrófono=${runtime.audio?.stream?.active ? "activo" : "liberado"}`,
    `persistencia=${runtime.persistenceStatus}`,
    `proveedor=${runtime.provider?.capability?.().status || (navegadorSoportaDictado() ? PROVIDER_STATUS.AVAILABLE : PROVIDER_STATUS.NOT_SUPPORTED)}`
  ].join("\n");
}

function conectarCambioPaciente() {
  const selector = $("uidPaciente");
  if (!selector || selector.dataset.dictadoContextListener === "true") return;
  selector.addEventListener("change", (event) => {
    const nuevo = event.target.value || "sin-paciente";
    if (runtime.patientId && nuevo !== runtime.patientId && [ESTADOS_DICTADO.LISTENING, ESTADOS_DICTADO.PAUSED, ESTADOS_DICTADO.RECONNECTING].includes(runtime.maquina.current)) {
      const continuar = confirm("Hay una sesión de dictado activa. ¿Finalizarla y cambiar al nuevo paciente? El borrador anterior se conservará aislado.");
      if (!continuar) { event.target.value = runtime.patientId === "sin-paciente" ? "" : runtime.patientId; return; }
      finalizarDictado();
    }
    asegurarContexto({ nuevaSesion: true });
    escribirTextarea("");
    mostrarTextoProvisional("");
    mostrarTextoPendiente("");
    actualizarBotonRecuperar();
    actualizarDiagnosticoSeguro();
  });
  selector.dataset.dictadoContextListener = "true";
}

function conectarBotones() {
  const enlaces = [
    ["btnIniciarDictado", iniciarDictado],
    ["btnPausarDictado", pausarDictado],
    ["btnLimpiarDictado", limpiarDictado],
    ["btnInsertarDictado", insertarDictadoEnNota],
    ["btnReanudarDictado", reanudarDictado],
    ["btnFinalizarDictado", finalizarDictado],
    ["btnCancelarDictado", cancelarDictado],
    ["btnRecuperarDictado", recuperarUltimoDictado],
    ["btnProbarMicrofono", probarMicrofono]
  ];

  for (const [id, handler] of enlaces) {
    const boton = $(id);
    if (!boton || boton.dataset.dictadoListener === "true") continue;
    boton.addEventListener("click", handler);
    boton.dataset.dictadoListener = "true";
  }
}

function conectarTextarea() {
  const textarea = textareaDictado();
  if (!textarea || textarea.dataset.dictadoListener === "true") return;
  textarea.addEventListener("input", () => {
    if (runtime.actualizacionInterna) return;
    asegurarContexto();
    runtime.ensamblador.setManualText(textarea.value);
    guardarBorradorTemporal();
    actualizarBotones();
    actualizarMetricas();
  });
  textarea.dataset.dictadoListener = "true";
}

export function inicializarDictadoClinico() {
  if (runtime.inicializado) return;
  runtime.inicializado = true;
  crearPanelAvanzado();
  asegurarContexto({ nuevaSesion: true });

  if (!navegadorSoportaDictado()) {
    runtime.maquina.transition(ESTADOS_DICTADO.FATAL_ERROR, { reason: "unsupported" });
    mostrarAdvertencia("Tu navegador no soporta dictado por voz.", "error");
  } else {
    runtime.maquina.transition(ESTADOS_DICTADO.READY, { reason: "init" });
  }

  runtime.maquina.subscribe((estado) => {
    setEstadoVisual(estado.current);
    actualizarBotones();
  });

  conectarBotones();
  conectarTextarea();
  conectarCambioPaciente();
  cargarDispositivosAudio();
  actualizarBotonRecuperar();
  actualizarBotones();
  actualizarMetricas();

  window.addEventListener("pagehide", () => {
    runtime.provider?.dispose?.();
    detenerCapturaMicrofono();
    liberarWakeLock();
  });
  actualizarDiagnosticoSeguro();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializarDictadoClinico, { once: true });
} else {
  inicializarDictadoClinico();
}

window.inicializarDictadoClinico = inicializarDictadoClinico;
window.iniciarDictado = iniciarDictado;
window.pausarDictado = pausarDictado;
window.reanudarDictado = reanudarDictado;
window.finalizarDictado = finalizarDictado;
window.cancelarDictado = cancelarDictado;
window.limpiarDictado = limpiarDictado;
window.insertarDictadoEnNota = insertarDictadoEnNota;
window.cognicionDictado = {
  get sessionId() { return runtime.sessionId; },
  get patientId() { return runtime.patientId; },
  get encounterId() { return runtime.encounterId; },
  snapshot: snapshotDictadoClinico,
  getSnapshot: snapshotDictadoClinico,
  diagnostico: () => ({ state: runtime.maquina.current, sessionId: runtime.sessionId, stats: runtime.ensamblador?.stats?.() })
};
window.navegadorSoportaDictado = navegadorSoportaDictado;
window.recuperarUltimoDictado = recuperarUltimoDictado;
window.probarMicrofono = probarMicrofono;
