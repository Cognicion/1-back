let reconocimiento = null;
let dictadoActivo = false;
let textoBaseDictado = "";
let reinicioDictadoTimer = null;
let actualizandoTextareaDictado = false;
let ultimoResultadoDictado = 0;
let reconocimientoIniciado = false;

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
  const texto = String(fragmento || "")
    .replace(/\bcoma\b/gi, ",")
    .replace(/\bpunto y coma\b/gi, ";")
    .replace(/\bdos puntos\b/gi, ":")
    .replace(/\bpunto aparte\b/gi, ".\n")
    .replace(/\bnueva linea\b/gi, "\n")
    .replace(/\bnuevo renglon\b/gi, "\n")
    .replace(/\bpunto\b/gi, ".")
    .replace(/\binterrogacion\b/gi, "?")
    .replace(/\bsigno de interrogacion\b/gi, "?")
    .replace(/\bideacion suicida\b/gi, "ideacion suicida")
    .replace(/\bbenzodiazepina(s)?\b/gi, "benzodiacepina$1")
    .replace(/\bbenzodiacepina s\b/gi, "benzodiacepinas")
    .replace(/\bciwa ar\b/gi, "CIWA-Ar")
    .replace(/\bciwa b\b/gi, "CIWA-B")
    .replace(/\bcie diez\b/gi, "CIE-10")
    .replace(/\bcie once\b/gi, "CIE-11")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:?])/g, "$1")
    .replace(/([,.;:?])([^\s\n])/g, "$1 $2")
    .replace(/\.{2,}/g, ".")
    .replace(/,{2,}/g, ",")
    .trim();

  return corregirCapitalizacionDictado(texto);
}

function corregirCapitalizacionDictado(texto = "") {
  return texto.replace(/(^|[.!?\n]\s+)([a-záéíóúñ])/g, (coincidencia, inicio, letra) => {
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

      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const fragmento = normalizarFragmentoDictado(elegirMejorAlternativa(evento.results[i]));
        if (!fragmento) continue;

        if (evento.results[i].isFinal) {
          textoFinal = unirFragmentoDictado(textoFinal, fragmento);
        } else {
          textoInterino = unirFragmentoDictado(textoInterino, fragmento);
        }
      }

      if (textoFinal) {
        textoBaseDictado = unirFragmentoDictado(textoBaseDictado || textarea.value, textoFinal);
      }

      escribirTextareaDictado(unirTextoClinico(textoBaseDictado, textoInterino));
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
        actualizarEstadoDictado("Dictado detenido: revise permisos del microfono", "detenido");
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
        const demora = tiempoDesdeResultado < 600 ? 450 : 250;
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
  actualizarEstadoDictado("Dictado pausado", "pausado");
}

export function limpiarDictado() {
  const textarea = obtenerElemento("textoDictadoClinico");
  if (!textarea) return;

  textarea.value = "";
  textoBaseDictado = "";
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
    alert("No se encontro el campo de nota clinica para insertar el dictado.");
    return;
  }

  const confirmado = confirm("Revise y corrija el dictado antes de integrarlo al expediente clinico.");
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
