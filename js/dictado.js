const ESTADOS_DICTADO = {
  PREPARADO: "preparado",
  PERMISO: "solicitando permiso",
  ESCUCHANDO: "escuchando",
  PAUSADO: "pausado",
  PROCESANDO: "procesando",
  RECUPERANDO: "recuperando conexión",
  FINALIZADO: "finalizado",
  ERROR: "error",
  NO_DISPONIBLE: "no-disponible"
};

const CLAVE_BORRADOR_DICTADO = "cognicion.dictadoClinico.borrador.v2";
const SILENCIO_MS = 8500;
const REINICIO_MAXIMO = 8;

const estado = {
  reconocimiento: null,
  activo: false,
  iniciado: false,
  pausadoPorUsuario: false,
  textoConfirmado: "",
  ultimoFinalNormalizado: "",
  ultimoFinalEn: 0,
  reinicios: 0,
  reinicioTimer: null,
  cronometroTimer: null,
  inicioEn: 0,
  acumuladoMs: 0,
  actualizacionInterna: false,
  mediaStream: null,
  audioContext: null,
  analyser: null,
  audioFrame: null,
  silencioDesde: null,
  wakeLock: null,
  dispositivosCargados: false
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

function textareaDictado() {
  return $("textoDictadoClinico");
}

function campoDestinoNota() {
  return $("subjetivo") || $("padecimientoActual") || $("motivoAtencion") || $("notaClinica");
}

function pacienteActualId() {
  return new URLSearchParams(window.location.search).get("id") || "";
}

function actualizarEstadoDictado(texto, estadoVisual = "") {
  const nodo = $("estadoDictadoClinico");
  if (!nodo) return;
  nodo.textContent = texto;
  nodo.dataset.estado = estadoVisual || texto.toLowerCase();
}

function normalizarComparacion(texto = "") {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function unirTextoClinico(base = "", fragmento = "") {
  const limpio = normalizarFragmentoDictado(fragmento);
  if (!limpio) return base || "";
  const textoBase = String(base || "").trimEnd();
  if (!textoBase) return limpio;
  const requiereEspacio = !/[\s\n]$/.test(textoBase);
  return `${textoBase}${requiereEspacio ? " " : ""}${limpio}`;
}

function fragmentoFinalYaExiste(fragmento = "") {
  const normalizado = normalizarComparacion(fragmento);
  if (!normalizado) return true;
  const ahora = Date.now();
  if (normalizado === estado.ultimoFinalNormalizado && ahora - estado.ultimoFinalEn < 3500) {
    return true;
  }
  const textoActual = normalizarComparacion(textareaDictado()?.value || "");
  return textoActual.endsWith(normalizado);
}

function registrarFinal(fragmento = "") {
  estado.ultimoFinalNormalizado = normalizarComparacion(fragmento);
  estado.ultimoFinalEn = Date.now();
}

function elegirMejorAlternativa(resultado) {
  if (!resultado) return "";
  const alternativas = Array.from(resultado);
  const mejor = alternativas
    .filter((item) => item?.transcript)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  return mejor?.transcript || resultado[0]?.transcript || "";
}

function aplicarComandosDeVoz(texto = "") {
  let salida = texto;
  salida = salida.replace(/\bnuevo párrafo\b/gi, "\n\n");
  salida = salida.replace(/\bnueva línea\b/gi, "\n");
  salida = salida.replace(/\bpunto y aparte\b/gi, ".\n\n");
  salida = salida.replace(/\bpunto\b/gi, ".");
  salida = salida.replace(/\bcoma\b/gi, ",");
  salida = salida.replace(/\bdos puntos\b/gi, ":");
  salida = salida.replace(/\bpunto y coma\b/gi, ";");
  salida = salida.replace(/\babrir paréntesis\b/gi, "(");
  salida = salida.replace(/\bcerrar paréntesis\b/gi, ")");

  if (/\bpausar dictado\b/i.test(texto)) {
    setTimeout(() => pausarDictado(), 0);
    salida = salida.replace(/\bpausar dictado\b/gi, "");
  }

  if (/\bborrar última frase\b/i.test(texto)) {
    if (confirm("¿Borrar la última frase del dictado confirmado?")) {
      borrarUltimaFrase();
    }
    salida = salida.replace(/\bborrar última frase\b/gi, "");
  }

  return salida;
}

function normalizarFragmentoDictado(texto = "") {
  let salida = aplicarComandosDeVoz(String(texto || "").trim());
  salida = salida
    .replace(/\bmiligramos\b/gi, "mg")
    .replace(/\bmiligramo\b/gi, "mg")
    .replace(/\bmicrogramos\b/gi, "mcg")
    .replace(/\bmicrogramo\b/gi, "mcg")
    .replace(/\bgrados centígrados\b/gi, "°C")
    .replace(/\bgrados celsius\b/gi, "°C")
    .replace(/\bmedia tableta\b/gi, "½ tableta")
    .replace(/\bun cuarto de tableta\b/gi, "¼ tableta")
    .replace(/\btres cuartos de tableta\b/gi, "¾ tableta")
    .replace(/\bcada ocho horas\b/gi, "cada 8 h")
    .replace(/\bcada doce horas\b/gi, "cada 12 h")
    .replace(/\bcada veinticuatro horas\b/gi, "cada 24 h")
    .replace(/\bideacion suicida\b/gi, "ideación suicida")
    .replace(/\bbenzodiacepina\b/gi, "benzodiacepina")
    .replace(/\bbenzodiacepinas\b/gi, "benzodiacepinas")
    .replace(/\bdiagnostico\b/gi, "diagnóstico")
    .replace(/\bclinico\b/gi, "clínico");

  salida = salida.replace(/\s+([,.;:])/g, "$1").replace(/\s{2,}/g, " ");
  if (salida && !/^[a-záéíóúñü]/.test(salida)) return salida;
  return salida ? salida.charAt(0).toUpperCase() + salida.slice(1) : "";
}

function borrarUltimaFrase() {
  const textarea = textareaDictado();
  if (!textarea) return;
  const valor = textarea.value.trimEnd();
  const nuevo = valor.replace(/[^.!?\n]+[.!?]?\s*$/u, "").trimEnd();
  escribirTextarea(nuevo);
}

function escribirTextarea(valor) {
  const textarea = textareaDictado();
  if (!textarea) return;
  estado.actualizacionInterna = true;
  textarea.value = valor;
  estado.textoConfirmado = valor;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  estado.actualizacionInterna = false;
  guardarBorradorTemporal();
}

function mostrarTextoProvisional(texto = "") {
  const nodo = $("dictadoTextoProvisional");
  if (!nodo) return;
  nodo.textContent = texto || "Sin texto provisional.";
  nodo.classList.toggle("activo", Boolean(texto));
}

function guardarBorradorTemporal() {
  const texto = textareaDictado()?.value || "";
  localStorage.setItem(CLAVE_BORRADOR_DICTADO, JSON.stringify({
    texto,
    pacienteId: pacienteActualId(),
    fecha: new Date().toISOString()
  }));
  actualizarBotonRecuperar();
}

function leerBorradorTemporal() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_BORRADOR_DICTADO) || "null");
  } catch {
    return null;
  }
}

function actualizarBotonRecuperar() {
  const boton = $("btnRecuperarDictado");
  if (!boton) return;
  const borrador = leerBorradorTemporal();
  boton.disabled = !borrador?.texto;
}

export function recuperarUltimoDictado() {
  const borrador = leerBorradorTemporal();
  if (!borrador?.texto) {
    alert("No hay un dictado temporal para recuperar.");
    return;
  }
  const textarea = textareaDictado();
  const actual = textarea?.value?.trim() || "";
  const texto = actual
    ? `${actual}\n\n${borrador.texto}`.trim()
    : borrador.texto;
  escribirTextarea(texto);
  actualizarEstadoDictado("Dictado recuperado", ESTADOS_DICTADO.FINALIZADO);
}

function formatearTiempo(ms) {
  const total = Math.floor(ms / 1000);
  const minutos = String(Math.floor(total / 60)).padStart(2, "0");
  const segundos = String(total % 60).padStart(2, "0");
  return `${minutos}:${segundos}`;
}

function iniciarCronometro() {
  detenerCronometro();
  estado.inicioEn = Date.now();
  estado.cronometroTimer = window.setInterval(() => {
    const total = estado.acumuladoMs + (estado.activo ? Date.now() - estado.inicioEn : 0);
    const nodo = $("cronometroDictadoClinico");
    if (nodo) nodo.textContent = formatearTiempo(total);
  }, 500);
}

function detenerCronometro() {
  if (estado.cronometroTimer) {
    window.clearInterval(estado.cronometroTimer);
    estado.cronometroTimer = null;
  }
}

function acumularTiempoActivo() {
  if (!estado.inicioEn) return;
  estado.acumuladoMs += Date.now() - estado.inicioEn;
  estado.inicioEn = 0;
}

async function solicitarWakeLock() {
  try {
    if ("wakeLock" in navigator && !estado.wakeLock) {
      estado.wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {
    estado.wakeLock = null;
  }
}

async function liberarWakeLock() {
  try {
    await estado.wakeLock?.release?.();
  } catch {
    // No hacer nada: algunos navegadores liberan el bloqueo automáticamente.
  } finally {
    estado.wakeLock = null;
  }
}

async function cargarDispositivosAudio() {
  const selector = $("selectorMicrofonoDictado");
  if (!selector || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const entradas = dispositivos.filter((item) => item.kind === "audioinput");
    selector.innerHTML = entradas.length
      ? entradas.map((item, index) => `
          <option value="${item.deviceId}">
            ${item.label || `Micrófono ${index + 1}`}
          </option>
        `).join("")
      : `<option value="">Micrófono predeterminado</option>`;
    estado.dispositivosCargados = true;
  } catch {
    selector.innerHTML = `<option value="">Micrófono predeterminado</option>`;
  }
}

async function iniciarCapturaAudio() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  detenerCapturaAudio();
  actualizarEstadoDictado("Solicitando permiso de micrófono…", ESTADOS_DICTADO.PERMISO);
  const selector = $("selectorMicrofonoDictado");
  const deviceId = selector?.value || "";
  const constraints = {
    audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } : true
  };
  estado.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  if (!estado.dispositivosCargados) await cargarDispositivosAudio();
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  estado.audioContext = new AudioContext();
  const fuente = estado.audioContext.createMediaStreamSource(estado.mediaStream);
  estado.analyser = estado.audioContext.createAnalyser();
  estado.analyser.fftSize = 256;
  fuente.connect(estado.analyser);
  actualizarMedidorAudio();
}

function detenerCapturaAudio() {
  if (estado.audioFrame) {
    cancelAnimationFrame(estado.audioFrame);
    estado.audioFrame = null;
  }
  estado.mediaStream?.getTracks?.().forEach((track) => track.stop());
  estado.mediaStream = null;
  estado.audioContext?.close?.().catch(() => {});
  estado.audioContext = null;
  estado.analyser = null;
  const barra = $("nivelAudioDictado");
  if (barra) barra.style.width = "0%";
}

function actualizarMedidorAudio() {
  if (!estado.analyser) return;
  const datos = new Uint8Array(estado.analyser.frequencyBinCount);
  estado.analyser.getByteTimeDomainData(datos);
  let suma = 0;
  for (const valor of datos) {
    const normalizado = (valor - 128) / 128;
    suma += normalizado * normalizado;
  }
  const rms = Math.sqrt(suma / datos.length);
  const porcentaje = Math.min(100, Math.round(rms * 260));
  const barra = $("nivelAudioDictado");
  if (barra) barra.style.width = `${porcentaje}%`;

  const aviso = $("avisoAudioDictado");
  if (aviso) {
    if (porcentaje < 4 && estado.activo) {
      estado.silencioDesde ||= Date.now();
      aviso.textContent = Date.now() - estado.silencioDesde > SILENCIO_MS
        ? "No se detecta voz. Revisa el micrófono."
        : "Nivel bajo.";
    } else if (porcentaje > 92) {
      estado.silencioDesde = null;
      aviso.textContent = "Volumen muy alto; puede saturar.";
    } else {
      estado.silencioDesde = null;
      aviso.textContent = "Micrófono activo.";
    }
  }
  estado.audioFrame = requestAnimationFrame(actualizarMedidorAudio);
}

export async function probarMicrofono() {
  try {
    await iniciarCapturaAudio();
    actualizarEstadoDictado("Prueba de micrófono activa", ESTADOS_DICTADO.PROCESANDO);
    setTimeout(() => {
      if (!estado.activo) detenerCapturaAudio();
    }, 9000);
  } catch (error) {
    console.error("No se pudo probar el micrófono:", error);
    actualizarEstadoDictado("No se pudo acceder al micrófono", ESTADOS_DICTADO.ERROR);
  }
}

function limpiarReinicio() {
  if (estado.reinicioTimer) {
    clearTimeout(estado.reinicioTimer);
    estado.reinicioTimer = null;
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

  reconocimiento.onstart = () => {
    estado.iniciado = true;
    estado.activo = true;
    estado.reinicios = 0;
    actualizarEstadoDictado("Escuchando…", ESTADOS_DICTADO.ESCUCHANDO);
  };

  reconocimiento.onresult = (evento) => {
    let provisional = "";
    for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
      const resultado = evento.results[i];
      const fragmento = elegirMejorAlternativa(resultado);
      if (!fragmento) continue;
      if (resultado.isFinal) {
        const limpio = normalizarFragmentoDictado(fragmento);
        if (limpio && !fragmentoFinalYaExiste(limpio)) {
          const actual = textareaDictado()?.value || estado.textoConfirmado || "";
          escribirTextarea(unirTextoClinico(actual, limpio));
          registrarFinal(limpio);
        }
      } else {
        provisional = unirTextoClinico(provisional, fragmento);
      }
    }
    mostrarTextoProvisional(normalizarFragmentoDictado(provisional));
  };

  reconocimiento.onerror = (evento) => {
    console.warn("Error de dictado:", evento.error);
    if (evento.error === "not-allowed" || evento.error === "service-not-allowed") {
      actualizarEstadoDictado("Micrófono bloqueado por el navegador", ESTADOS_DICTADO.ERROR);
      pausarDictado();
      return;
    }
    actualizarEstadoDictado("Recuperando conexión de dictado…", ESTADOS_DICTADO.RECUPERANDO);
  };

  reconocimiento.onend = () => {
    estado.iniciado = false;
    if (estado.activo && !estado.pausadoPorUsuario && estado.reinicios < REINICIO_MAXIMO) {
      estado.reinicios += 1;
      limpiarReinicio();
      estado.reinicioTimer = setTimeout(() => {
        try {
          reconocimiento.start();
        } catch {
          actualizarEstadoDictado("Dictado pausado por el navegador", ESTADOS_DICTADO.PAUSADO);
        }
      }, 450);
      return;
    }
    if (!estado.activo) actualizarEstadoDictado("Dictado detenido", ESTADOS_DICTADO.FINALIZADO);
  };

  return reconocimiento;
}

export async function iniciarDictado() {
  if (!navegadorSoportaDictado()) {
    actualizarEstadoDictado("Dictado no disponible en este navegador", ESTADOS_DICTADO.NO_DISPONIBLE);
    alert("Tu navegador no soporta dictado por voz.");
    return;
  }
  if (estado.activo && estado.iniciado) return;

  try {
    estado.pausadoPorUsuario = false;
    estado.textoConfirmado = textareaDictado()?.value || "";
    await solicitarWakeLock();
    await iniciarCapturaAudio();
    estado.reconocimiento ||= crearReconocimiento();
    iniciarCronometro();
    estado.reconocimiento.start();
  } catch (error) {
    console.error("No se pudo iniciar el dictado:", error);
    actualizarEstadoDictado("Error al iniciar dictado", ESTADOS_DICTADO.ERROR);
    detenerCapturaAudio();
  }
}

export function pausarDictado() {
  limpiarReinicio();
  estado.pausadoPorUsuario = true;
  estado.activo = false;
  acumularTiempoActivo();
  detenerCronometro();
  try {
    estado.reconocimiento?.stop?.();
  } catch {
    // Puede estar ya detenido.
  }
  detenerCapturaAudio();
  liberarWakeLock();
  mostrarTextoProvisional("");
  guardarBorradorTemporal();
  actualizarEstadoDictado("Dictado pausado", ESTADOS_DICTADO.PAUSADO);
}

export function finalizarDictado() {
  pausarDictado();
  actualizarEstadoDictado("Dictado finalizado", ESTADOS_DICTADO.FINALIZADO);
}

export function limpiarDictado() {
  const texto = textareaDictado()?.value?.trim() || "";
  if (texto && !confirm("¿Limpiar el dictado actual? Esta acción no modificará la nota principal.")) {
    return;
  }
  escribirTextarea("");
  mostrarTextoProvisional("");
  localStorage.removeItem(CLAVE_BORRADOR_DICTADO);
  actualizarBotonRecuperar();
  actualizarEstadoDictado("Dictado detenido", ESTADOS_DICTADO.FINALIZADO);
}

export function insertarDictadoEnNota() {
  const textarea = textareaDictado();
  const destino = campoDestinoNota();
  const texto = textarea?.value?.trim() || "";
  if (!texto) {
    alert("No hay texto dictado para insertar.");
    return;
  }
  if (!destino) {
    alert("No se encontró el campo principal de la nota para insertar el dictado.");
    return;
  }
  if (!confirm("Revise y corrija el dictado antes de integrarlo al expediente clínico.")) return;
  destino.value = unirTextoClinico(destino.value || "", texto);
  destino.dispatchEvent(new Event("input", { bubbles: true }));
  actualizarEstadoDictado("Dictado insertado en la nota", ESTADOS_DICTADO.FINALIZADO);
}

function asegurarPanelAvanzadoDictado() {
  const textarea = textareaDictado();
  if (!textarea || $("dictadoPanelAvanzado")) return;
  const panel = document.createElement("div");
  panel.id = "dictadoPanelAvanzado";
  panel.className = "dictado-panel-avanzado";
  panel.innerHTML = `
    <div class="dictado-clinico-toolbar">
      <span class="dictado-alfa-badge">VERSIÓN ALFA · EN DESARROLLO</span>
      <label>Modo
        <select id="modoDictadoClinico">
          <option value="dictado_libre">Dictado libre</option>
          <option value="entrevista_clinica">Entrevista clínica</option>
          <option value="nota_por_apartados">Nota por apartados</option>
          <option value="exploracion_mental">Exploración mental</option>
          <option value="evolucion">Evolución</option>
          <option value="ingreso">Ingreso</option>
          <option value="urgencias">Urgencias</option>
          <option value="interconsulta">Interconsulta</option>
          <option value="egreso">Egreso</option>
          <option value="nota_pediatrica">Nota pediátrica</option>
          <option value="transcripcion">Transcripción sin generar nota</option>
        </select>
      </label>
      <label>Micrófono
        <select id="selectorMicrofonoDictado">
          <option value="">Micrófono predeterminado</option>
        </select>
      </label>
      <button id="btnProbarMicrofono" type="button" class="boton-secundario">Probar micrófono</button>
      <button id="btnFinalizarDictado" type="button" class="boton-secundario">Finalizar</button>
      <button id="btnRecuperarDictado" type="button" class="boton-secundario">Recuperar último dictado</button>
    </div>
    <div class="dictado-metricas">
      <span id="cronometroDictadoClinico">00:00</span>
      <div class="dictado-audio-meter" aria-label="Nivel de audio"><span id="nivelAudioDictado"></span></div>
      <span id="avisoAudioDictado">Micrófono sin probar.</span>
    </div>
    <div class="dictado-provisional">
      <strong>Texto provisional</strong>
      <p id="dictadoTextoProvisional">Sin texto provisional.</p>
    </div>
  `;
  textarea.parentElement?.insertBefore(panel, textarea);
  $("btnProbarMicrofono")?.addEventListener("click", probarMicrofono);
  $("btnFinalizarDictado")?.addEventListener("click", finalizarDictado);
  $("btnRecuperarDictado")?.addEventListener("click", recuperarUltimoDictado);
}

export function inicializarDictadoClinico() {
  asegurarPanelAvanzadoDictado();
  const iniciar = $("iniciarDictadoClinico") || $("btnIniciarDictado");
  const pausar = $("pausarDictadoClinico") || $("btnPausarDictado");
  const limpiar = $("limpiarDictadoClinico") || $("btnLimpiarDictado");
  const insertar = $("insertarDictadoClinico") || $("btnInsertarDictado");
  const textarea = textareaDictado();

  if (!navegadorSoportaDictado()) {
    actualizarEstadoDictado("Dictado no disponible en este navegador", ESTADOS_DICTADO.NO_DISPONIBLE);
    if (iniciar) iniciar.disabled = true;
    if (pausar) pausar.disabled = true;
  } else {
    actualizarEstadoDictado("Dictado detenido", ESTADOS_DICTADO.FINALIZADO);
  }

  if (iniciar && iniciar.dataset.dictadoInicializado !== "true") {
    iniciar.dataset.dictadoInicializado = "true";
    iniciar.addEventListener("click", iniciarDictado);
  }
  if (pausar && pausar.dataset.dictadoInicializado !== "true") {
    pausar.dataset.dictadoInicializado = "true";
    pausar.addEventListener("click", pausarDictado);
  }
  if (limpiar && limpiar.dataset.dictadoInicializado !== "true") {
    limpiar.dataset.dictadoInicializado = "true";
    limpiar.addEventListener("click", limpiarDictado);
  }
  if (insertar && insertar.dataset.dictadoInicializado !== "true") {
    insertar.dataset.dictadoInicializado = "true";
    insertar.addEventListener("click", insertarDictadoEnNota);
  }
  if (textarea && textarea.dataset.dictadoInicializado !== "true") {
    textarea.dataset.dictadoInicializado = "true";
    textarea.addEventListener("input", () => {
      if (estado.actualizacionInterna) return;
      estado.textoConfirmado = textarea.value;
      guardarBorradorTemporal();
    });
  }

  cargarDispositivosAudio();
  actualizarBotonRecuperar();
  window.addEventListener("pagehide", finalizarDictado);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && estado.activo) guardarBorradorTemporal();
  });
}

window.inicializarDictadoClinico = inicializarDictadoClinico;
window.iniciarDictado = iniciarDictado;
window.pausarDictado = pausarDictado;
window.finalizarDictado = finalizarDictado;
window.limpiarDictado = limpiarDictado;
window.insertarDictadoEnNota = insertarDictadoEnNota;
window.navegadorSoportaDictado = navegadorSoportaDictado;
window.recuperarUltimoDictado = recuperarUltimoDictado;

document.addEventListener("DOMContentLoaded", inicializarDictadoClinico);
