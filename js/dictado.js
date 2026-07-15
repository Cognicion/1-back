let reconocimiento = null;
let dictadoActivo = false;
let textoBaseDictado = "";
let reinicioDictadoTimer = null;
let actualizandoTextareaDictado = false;
let ultimoResultadoDictado = 0;
let reconocimientoIniciado = false;
let ultimoFinalDictado = "";
let ultimoFinalDictadoEn = 0;
let reiniciosConsecutivosDictado = 0;

function obtenerSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function obtenerElemento(id) {
  return document.getElementById(id);
}

function actualizarEstadoDictado(mensaje, estado = "") {
  const estadoEl = obtenerElemento("estadoDictadoClinico");
  if (!estadoEl) return;

  estadoEl.textContent = mensaje;
  estadoEl.dataset.estado = estado;
}

function unirTextoClinico(textoActual = "", textoNuevo = "") {
  const actual = textoActual.trim();
  const nuevo = textoNuevo.trim();

  if (!actual) return nuevo;
  if (!nuevo) return actual;

  return `${actual}\n\n${nuevo}`;
}

function unirFragmentoDictado(textoActual = "", textoNuevo = "") {
  const actual = textoActual.trim();
  const nuevo = textoNuevo.trim();

  if (!actual) return nuevo;
  if (!nuevo) return actual;

  const separador = /[\n.!?:;]$/.test(actual) ? " " : ". ";
  return `${actual}${separador}${nuevo}`;
}

function normalizarParaCompararDictado(texto = "") {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fragmentoFinalYaExiste(textoBase = "", fragmento = "") {
  const base = normalizarParaCompararDictado(textoBase);
  const nuevo = normalizarParaCompararDictado(fragmento);
  if (!base || !nuevo) return false;

  const ahora = Date.now();
  const duplicadoReciente = nuevo === ultimoFinalDictado && ahora - ultimoFinalDictadoEn < 3500;
  const repetidoAlFinal = base.endsWith(nuevo);
  return duplicadoReciente || repetidoAlFinal;
}

function registrarFinalDictado(fragmento = "") {
  ultimoFinalDictado = normalizarParaCompararDictado(fragmento);
  ultimoFinalDictadoEn = Date.now();
}

function elegirMejorAlternativa(resultado) {
  const alternativas = Array.from(resultado || []);
  if (!alternativas.length) return "";

  const mejor = alternativas.reduce((seleccionada, actual) => {
    const confianzaActual = Number(actual.confidence || 0);
    const confianzaSeleccionada = Number(seleccionada.confidence || 0);
    return confianzaActual > confianzaSeleccionada ? actual : seleccionada;
  }, alternativas[0]);

  return mejor?.transcript || "";
}

function normalizarFragmentoDictado(fragmento = "") {
  const saltoLinea = " __SALTO_LINEA_DICTADO__ ";
  const texto = String(fragmento || "")
    .replace(/\babrir parentesis\b/gi, "(")
    .replace(/\bcerrar parentesis\b/gi, ")")
    .replace(/\babrir comillas\b/gi, "\"")
    .replace(/\bcerrar comillas\b/gi, "\"")
    .replace(/\bcoma\b/gi, ",")
    .replace(/\bpunto y coma\b/gi, ";")
    .replace(/\bdos puntos\b/gi, ":")
    .replace(/\bpunto aparte\b/gi, `.${saltoLinea}`)
    .replace(/\bnueva línea\b/gi, saltoLinea)
    .replace(/\bnueva linea\b/gi, saltoLinea)
    .replace(/\bnuevo renglón\b/gi, saltoLinea)
    .replace(/\bnuevo renglon\b/gi, saltoLinea)
    .replace(/\bpunto\b/gi, ".")
    .replace(/\binterrogación\b/gi, "?")
    .replace(/\binterrogacion\b/gi, "?")
    .replace(/\bsigno de interrogación\b/gi, "?")
    .replace(/\bsigno de interrogacion\b/gi, "?")
    .replace(/\bideacion suicida\b/gi, "ideación suicida")
    .replace(/\bbenzodiazepina(s)?\b/gi, "benzodiacepina$1")
    .replace(/\bbenzodiacepina s\b/gi, "benzodiacepinas")
    .replace(/\bciwa ar\b/gi, "CIWA-Ar")
    .replace(/\bciwa b\b/gi, "CIWA-B")
    .replace(/\bcie diez\b/gi, "CIE-10")
    .replace(/\bcie once\b/gi, "CIE-11")
    .replace(/\bmiligramos\b/gi, "mg")
    .replace(/\bmiligramo\b/gi, "mg")
    .replace(/\bmicrogramos\b/gi, "mcg")
    .replace(/\bmicrogramo\b/gi, "mcg")
    .replace(/\bgramos\b/gi, "g")
    .replace(/\bgramo\b/gi, "g")
    .replace(/\bmililitros\b/gi, "mL")
    .replace(/\bmililitro\b/gi, "mL")
    .replace(/\blitros por minuto\b/gi, "L/min")
    .replace(/\blatidos por minuto\b/gi, "lpm")
    .replace(/\brespiraciones por minuto\b/gi, "rpm")
    .replace(/\bgrados centígrados\b/gi, "°C")
    .replace(/\bgrados centigrados\b/gi, "°C")
    .replace(/\bpresion arterial\b/gi, "presión arterial")
    .replace(/\bfrecuencia cardiaca\b/gi, "frecuencia cardiaca")
    .replace(/\bfrecuencia respiratoria\b/gi, "frecuencia respiratoria")
    .replace(/\bsaturacion\b/gi, "saturación")
    .replace(/\bdiagnostico\b/gi, "diagnóstico")
    .replace(/\btratamiento farmacologico\b/gi, "tratamiento farmacológico")
    .replace(/\s+/g, " ")
    .replace(new RegExp(`\\s*${saltoLinea.trim()}\\s*`, "g"), "\n")
    .replace(/\s+([,.;:?])/g, "$1")
    .replace(/([,.;:?])([^\s\n])/g, "$1 $2")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\.{2,}/g, ".")
    .replace(/,{2,}/g, ",")
    .trim();

  return corregirCapitalizacionDictado(texto);
}

function corregirCapitalizacionDictado(texto = "") {
  return texto.replace(/(^|[.!?\n]\s*)([a-záéíóúñ])/g, (coincidencia, inicio, letra) => {
    return `${inicio}${letra.toUpperCase()}`;
  });
}

function escribirTextareaDictado(valor = "") {
  const textarea = obtenerElemento("textoDictadoClinico");
  if (!textarea) return;

  actualizandoTextareaDictado = true;
  textarea.value = valor;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  actualizandoTextareaDictado = false;
}

function limpiarTimerReinicioDictado() {
  if (reinicioDictadoTimer) {
    clearTimeout(reinicioDictadoTimer);
    reinicioDictadoTimer = null;
  }
}

function iniciarReconocimientoInterno() {
  if (!reconocimiento || !dictadoActivo) return;

  limpiarTimerReinicioDictado();

  try {
    reconocimiento.start();
    reconocimientoIniciado = true;
    actualizarEstadoDictado("Escuchando...", "escuchando");
  } catch (error) {
    reinicioDictadoTimer = setTimeout(() => {
      if (dictadoActivo) iniciarReconocimientoInterno();
    }, 450);
  }
}

export function navegadorSoportaDictado() {
  return Boolean(obtenerSpeechRecognition());
}

export function iniciarDictado() {
  const textarea = obtenerElemento("textoDictadoClinico");

  if (!navegadorSoportaDictado()) {
    actualizarEstadoDictado("Dictado no disponible en este navegador", "no-disponible");
    alert("Tu navegador no soporta dictado por voz.");
    return;
  }

  if (!textarea) return;

  if (dictadoActivo && reconocimientoIniciado) {
    actualizarEstadoDictado("Escuchando...", "escuchando");
    return;
  }

  if (!reconocimiento) {
    const SpeechRecognition = obtenerSpeechRecognition();
    reconocimiento = new SpeechRecognition();
    reconocimiento.lang = "es-MX";
    reconocimiento.continuous = true;
    reconocimiento.interimResults = true;
    reconocimiento.maxAlternatives = 3;

    reconocimiento.onresult = (evento) => {
      let textoFinal = "";
      let textoInterino = "";
      ultimoResultadoDictado = Date.now();
      reiniciosConsecutivosDictado = 0;

      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const fragmento = normalizarFragmentoDictado(elegirMejorAlternativa(evento.results[i]));
        if (!fragmento) continue;

        if (evento.results[i].isFinal) {
          if (fragmentoFinalYaExiste(textoBaseDictado, fragmento)) continue;
          textoFinal = unirFragmentoDictado(textoFinal, fragmento);
          registrarFinalDictado(fragmento);
        } else {
          textoInterino = unirFragmentoDictado(textoInterino, fragmento);
        }
      }

      if (textoFinal) {
        textoBaseDictado = unirFragmentoDictado(textoBaseDictado, textoFinal);
      }

      escribirTextareaDictado(unirFragmentoDictado(textoBaseDictado, textoInterino));
    };

    reconocimiento.onerror = (evento) => {
      const tipoError = evento?.error || "";

      if (["no-speech", "network"].includes(tipoError)) {
        actualizarEstadoDictado("Sin voz detectada, sigo escuchando...", "escuchando");
        return;
      }

      if (tipoError === "aborted" && dictadoActivo) {
        actualizarEstadoDictado("Reiniciando dictado...", "escuchando");
        return;
      }

      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(tipoError)) {
        actualizarEstadoDictado("Dictado detenido: revise permisos del micrófono", "detenido");
        dictadoActivo = false;
        reconocimientoIniciado = false;
        return;
      }

      actualizarEstadoDictado("Dictado interrumpido, intentando continuar...", "escuchando");
    };

    reconocimiento.onend = () => {
      reconocimientoIniciado = false;

      if (dictadoActivo) {
        const tiempoDesdeResultado = Date.now() - ultimoResultadoDictado;
        reiniciosConsecutivosDictado += 1;
        const demoraBase = tiempoDesdeResultado < 600 ? 450 : 250;
        const demora = Math.min(1500, demoraBase + reiniciosConsecutivosDictado * 120);
        actualizarEstadoDictado("Escuchando... reiniciando", "escuchando");
        limpiarTimerReinicioDictado();
        reinicioDictadoTimer = setTimeout(iniciarReconocimientoInterno, demora);
      } else {
        actualizarEstadoDictado("Dictado pausado", "pausado");
      }
    };
  }

  textoBaseDictado = textarea.value;
  dictadoActivo = true;
  ultimoResultadoDictado = Date.now();
  reiniciosConsecutivosDictado = 0;
  iniciarReconocimientoInterno();
}

export function pausarDictado() {
  dictadoActivo = false;
  limpiarTimerReinicioDictado();

  if (reconocimiento) {
    try {
      reconocimiento.stop();
    } catch (error) {
      // El navegador puede lanzar error si ya estaba detenido.
    }
  }

  textoBaseDictado = obtenerElemento("textoDictadoClinico")?.value || "";
  reconocimientoIniciado = false;
  reiniciosConsecutivosDictado = 0;
  actualizarEstadoDictado("Dictado pausado", "pausado");
}

export function limpiarDictado() {
  const textarea = obtenerElemento("textoDictadoClinico");
  if (!textarea) return;

  textarea.value = "";
  textoBaseDictado = "";
  ultimoFinalDictado = "";
  ultimoFinalDictadoEn = 0;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  actualizarEstadoDictado(dictadoActivo ? "Escuchando..." : "Dictado detenido", dictadoActivo ? "escuchando" : "detenido");
}

function obtenerCampoDestinoNota() {
  const esNotaRapida = obtenerElemento("tipoNota")?.value === "rapida";
  const candidatos = esNotaRapida
    ? ["notaRapida", "subjetivo", "analisis"]
    : ["subjetivo", "notaRapida", "analisis"];

  return candidatos
    .map((id) => obtenerElemento(id))
    .find(Boolean) || null;
}

export function insertarDictadoEnNota() {
  const textarea = obtenerElemento("textoDictadoClinico");
  const destino = obtenerCampoDestinoNota();
  const texto = textarea?.value.trim() || "";

  if (!texto) {
    alert("No hay texto dictado para insertar.");
    return;
  }

  if (!destino) {
    alert("No se encontró el campo de nota clínica para insertar el dictado.");
    return;
  }

  const confirmado = confirm("Revise y corrija el dictado antes de integrarlo al expediente clínico.");
  if (!confirmado) return;

  destino.value = unirTextoClinico(destino.value, texto);
  destino.dispatchEvent(new Event("input", { bubbles: true }));
  destino.focus();
}

export function inicializarDictadoClinico() {
  const iniciar = obtenerElemento("btnIniciarDictado");
  const pausar = obtenerElemento("btnPausarDictado");
  const limpiar = obtenerElemento("btnLimpiarDictado");
  const insertar = obtenerElemento("btnInsertarDictado");

  if (!iniciar || !pausar || !limpiar || !insertar) return;

  iniciar.addEventListener("click", iniciarDictado);
  pausar.addEventListener("click", pausarDictado);
  limpiar.addEventListener("click", limpiarDictado);
  insertar.addEventListener("click", insertarDictadoEnNota);

  obtenerElemento("textoDictadoClinico")?.addEventListener("input", (evento) => {
    if (actualizandoTextareaDictado) return;
    textoBaseDictado = evento.target.value || "";
  });

  if (!navegadorSoportaDictado()) {
    actualizarEstadoDictado("Dictado no disponible en este navegador", "no-disponible");
    iniciar.disabled = true;
    pausar.disabled = true;
    return;
  }

  actualizarEstadoDictado("Dictado detenido", "detenido");
}

window.inicializarDictadoClinico = inicializarDictadoClinico;
window.iniciarDictado = iniciarDictado;
window.pausarDictado = pausarDictado;
window.limpiarDictado = limpiarDictado;
window.insertarDictadoEnNota = insertarDictadoEnNota;
window.navegadorSoportaDictado = navegadorSoportaDictado;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializarDictadoClinico);
} else {
  inicializarDictadoClinico();
}
