export const BATERIA_EVC_VERSION = "0.2.0";

export const PRUEBAS_EVC = Object.freeze({
  atencion: {
    id: "atencion",
    nombre: "Cancelación visual breve",
    duracion: "45 s",
    mide: "Aciertos, omisiones, comisiones y distribución izquierda/derecha.",
    cautela: "La visión, la exploración espacial, la comprensión y el uso de la mano pueden modificar el resultado.",
    referencia: "Confirmar con un tamizaje post-EVC validado y pruebas de atención cuando el equipo lo indique."
  },
  memoria: {
    id: "memoria",
    nombre: "Aprendizaje y reconocimiento breve",
    duracion: "1–2 min",
    mide: "Reconocimiento de cinco palabras después de una interferencia breve.",
    cautela: "No equivale a una prueba estandarizada de memoria; lenguaje, lectura y atención influyen en el resultado.",
    referencia: "Complementar con una prueba validada de aprendizaje y recuerdo si existe sospecha clínica."
  },
  ejecutivas: {
    id: "ejecutivas",
    nombre: "Cambio de regla",
    duracion: "2–3 min",
    mide: "Precisión al mantener y alternar dos reglas de respuesta.",
    cautela: "La comprensión verbal, la velocidad motora y la atención también participan en esta tarea.",
    referencia: "Confirmar con evaluación ejecutiva validada y observación en actividades cotidianas."
  },
  lenguaje: {
    id: "lenguaje",
    nombre: "Fluidez semántica asistida",
    duracion: "60 s",
    mide: "Palabras válidas y distintas de una categoría, repeticiones y nivel de ayuda.",
    cautela: "Edad, escolaridad, idioma, afasia y quién transcribe cambian el desempeño; el conteo no usa normas poblacionales.",
    referencia: "Ante alteración, solicitar evaluación de lenguaje y comunicación por personal capacitado."
  },
  velocidad: {
    id: "velocidad",
    nombre: "Codificación símbolo–número",
    duracion: "45 s",
    mide: "Respuestas correctas, precisión y tiempo de respuesta en una clave breve.",
    cautela: "Visión, uso de la mano, familiaridad digital y fatiga pueden enlentecer la respuesta sin implicar déficit cognitivo.",
    referencia: "Interpretar junto con una medida clínica validada de velocidad y el funcionamiento diario."
  },
  visuoespacial: {
    id: "visuoespacial",
    nombre: "Bisección digital de líneas",
    duracion: "2 min",
    mide: "Error absoluto y sesgo direccional al señalar el centro de cinco líneas.",
    cautela: "No descarta negligencia ni alteraciones campimétricas; pantalla, postura, visión y control motor influyen.",
    referencia: "Si hay asimetría o sospecha funcional, valorar exploración espacial con instrumentos clínicos apropiados."
  }
});

const ETIQUETAS_APOYO = Object.freeze({
  0: "Sin apoyo adicional en esta tarea",
  1: "Apoyo ligero sugerido",
  2: "Apoyo moderado sugerido",
  3: "Apoyo alto sugerido"
});

function limitar(valor, minimo, maximo, respaldo = minimo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return respaldo;
  return Math.min(maximo, Math.max(minimo, numero));
}

function entero(valor, minimo = 0, maximo = Number.MAX_SAFE_INTEGER) {
  return Math.round(limitar(valor, minimo, maximo, minimo));
}

function redondear(valor, decimales = 1) {
  const factor = 10 ** decimales;
  return Math.round((Number(valor) || 0) * factor) / factor;
}

function porcentaje(parte, total) {
  return total > 0 ? redondear((parte / total) * 100, 1) : 0;
}

function etiquetaApoyo(nivel) {
  return ETIQUETAS_APOYO[nivel] || "No evaluable";
}

function resultadoBase(dominio, metricas, nivelApoyo, resumen, advertencias = []) {
  return {
    dominio,
    pruebaId: PRUEBAS_EVC[dominio]?.id || dominio,
    pruebaNombre: PRUEBAS_EVC[dominio]?.nombre || "Prueba orientativa",
    versionBateria: BATERIA_EVC_VERSION,
    completada: true,
    noEvaluable: false,
    nivelApoyo,
    etiqueta: etiquetaApoyo(nivelApoyo),
    resumen,
    metricas,
    advertencias: [...new Set(advertencias.filter(Boolean))],
    interpretacion: "Clasificación operativa interna de esta tarea; no es un punto de corte diagnóstico ni una norma poblacional.",
    completadaEn: new Date().toISOString()
  };
}

export function crearResultadoNoEvaluable(dominio, motivo = "La tarea no pudo completarse de forma interpretable.") {
  return {
    dominio,
    pruebaId: PRUEBAS_EVC[dominio]?.id || dominio,
    pruebaNombre: PRUEBAS_EVC[dominio]?.nombre || "Prueba orientativa",
    versionBateria: BATERIA_EVC_VERSION,
    completada: false,
    noEvaluable: true,
    nivelApoyo: null,
    etiqueta: "No evaluable",
    resumen: String(motivo || "La tarea no pudo completarse de forma interpretable.").slice(0, 280),
    metricas: {},
    advertencias: ["No inferir ausencia ni presencia de alteración a partir de una tarea no evaluable."],
    interpretacion: "Requiere adaptación o evaluación profesional con otro método.",
    completadaEn: new Date().toISOString()
  };
}

function calificarAtencion(datos = {}) {
  const objetivos = entero(datos.objetivos, 1, 100);
  const aciertos = entero(datos.aciertos, 0, objetivos);
  const comisiones = entero(datos.comisiones, 0, 100);
  const omisiones = Math.max(0, objetivos - aciertos);
  const omisionesIzquierda = entero(datos.omisionesIzquierda, 0, objetivos);
  const omisionesDerecha = entero(datos.omisionesDerecha, 0, objetivos);
  const precisionAjustada = porcentaje(Math.max(0, aciertos - comisiones), objetivos);
  const asimetria = Math.abs(omisionesIzquierda - omisionesDerecha);
  let nivel = precisionAjustada >= 90 ? 0 : precisionAjustada >= 75 ? 1 : precisionAjustada >= 50 ? 2 : 3;
  const advertencias = [];
  if (asimetria >= 2 && Math.max(omisionesIzquierda, omisionesDerecha) >= 2) {
    nivel = Math.max(nivel, 2);
    advertencias.push("Se observó una diferencia lateral de omisiones; requiere confirmación clínica y revisión visual/motora.");
  }
  const duracionSegundos = redondear(limitar(datos.duracionSegundos, 0, 180, 0), 1);
  if (duracionSegundos < 20) advertencias.push("La tarea terminó antes de 20 segundos; interpretar con cautela.");
  return resultadoBase("atencion", {
    objetivos,
    aciertos,
    omisiones,
    comisiones,
    precisionAjustada,
    omisionesIzquierda,
    omisionesDerecha,
    duracionSegundos
  }, nivel, `${aciertos}/${objetivos} objetivos, ${omisiones} omisiones y ${comisiones} comisiones.`, advertencias);
}

function calificarMemoria(datos = {}) {
  const objetivos = entero(datos.objetivos, 1, 20);
  const reconocidos = entero(datos.reconocidos, 0, objetivos);
  const falsosPositivos = entero(datos.falsosPositivos, 0, 20);
  const puntuacionAjustada = Math.max(0, reconocidos - falsosPositivos);
  let nivel = puntuacionAjustada >= objetivos && falsosPositivos === 0
    ? 0
    : puntuacionAjustada >= Math.ceil(objetivos * 0.7)
      ? 1
      : puntuacionAjustada >= Math.ceil(objetivos * 0.3)
        ? 2
        : 3;
  const demoraSegundos = redondear(limitar(datos.demoraSegundos, 0, 300, 0), 1);
  const advertencias = [];
  if (demoraSegundos < 25) {
    nivel = Math.max(nivel, 1);
    advertencias.push("La interferencia fue menor de 25 segundos; no interpretar como recuerdo diferido.");
  }
  return resultadoBase("memoria", {
    objetivos,
    reconocidos,
    falsosPositivos,
    puntuacionAjustada,
    demoraSegundos
  }, nivel, `${reconocidos}/${objetivos} palabras reconocidas y ${falsosPositivos} falsas selecciones.`, advertencias);
}

function calificarEjecutivas(datos = {}) {
  const total = entero(datos.total, 1, 100);
  const correctas = entero(datos.correctas, 0, total);
  const cambios = entero(datos.cambios, 1, total);
  const cambiosCorrectos = entero(datos.cambiosCorrectos, 0, cambios);
  const precision = porcentaje(correctas, total);
  const precisionCambios = porcentaje(cambiosCorrectos, cambios);
  const nivel = precision >= 90 && precisionCambios >= 85
    ? 0
    : precision >= 75 && precisionCambios >= 65
      ? 1
      : precision >= 55 && precisionCambios >= 45
        ? 2
        : 3;
  const advertencias = total < 12 ? ["Se registraron pocos ensayos; conviene repetir la tarea en condiciones estables."] : [];
  return resultadoBase("ejecutivas", {
    total,
    correctas,
    cambios,
    cambiosCorrectos,
    precision,
    precisionCambios,
    medianaRespuestaMs: entero(datos.medianaRespuestaMs, 0, 60000)
  }, nivel, `${precision}% de precisión total y ${precisionCambios}% en ensayos con cambio de regla.`, advertencias);
}

function calificarLenguaje(datos = {}) {
  const palabrasValidas = entero(datos.palabrasValidas, 0, 200);
  const repeticiones = entero(datos.repeticiones, 0, 200);
  const ayuda = ["ninguna", "repeticion-instruccion", "claves", "no-completa"].includes(datos.ayuda) ? datos.ayuda : "ninguna";
  const pisoAyuda = { ninguna: 0, "repeticion-instruccion": 1, claves: 2, "no-completa": 3 }[ayuda];
  const nivelConteo = palabrasValidas >= 15 ? 0 : palabrasValidas >= 10 ? 1 : palabrasValidas >= 5 ? 2 : 3;
  const nivel = Math.max(nivelConteo, pisoAyuda);
  const duracionSegundos = redondear(limitar(datos.duracionSegundos, 0, 120, 0), 1);
  const modoRegistro = datos.modoRegistro === "paciente" ? "paciente" : "acompañante";
  const advertencias = ["El número de palabras no se compara con normas de edad, escolaridad o idioma."];
  if (duracionSegundos < 45) advertencias.push("El registro duró menos de 45 segundos; el conteo no es comparable con una ronda de 60 segundos.");
  if (modoRegistro === "paciente") advertencias.push("La escritura o el uso de la mano pudo influir en el conteo.");
  return resultadoBase("lenguaje", {
    palabrasValidas,
    repeticiones,
    ayuda,
    modoRegistro,
    duracionSegundos
  }, nivel, `${palabrasValidas} palabras distintas registradas, ${repeticiones} repeticiones y ayuda: ${ayuda.replace(/-/g, " ")}.`, advertencias);
}

function calificarVelocidad(datos = {}) {
  const intentos = entero(datos.intentos, 1, 100);
  const correctas = entero(datos.correctas, 0, intentos);
  const precision = porcentaje(correctas, intentos);
  const duracionSegundos = redondear(limitar(datos.duracionSegundos, 1, 180, 45), 1);
  const correctasPorMinuto = redondear((correctas / duracionSegundos) * 60, 1);
  const nivel = correctas >= 18 && precision >= 90
    ? 0
    : correctas >= 13 && precision >= 80
      ? 1
      : correctas >= 7 && precision >= 60
        ? 2
        : 3;
  const advertencias = [];
  if (datos.usoManoComprometido) advertencias.push("El control motor de la respuesta puede explicar parte de la lentificación.");
  return resultadoBase("velocidad", {
    intentos,
    correctas,
    errores: intentos - correctas,
    precision,
    duracionSegundos,
    correctasPorMinuto,
    medianaRespuestaMs: entero(datos.medianaRespuestaMs, 0, 60000)
  }, nivel, `${correctas} respuestas correctas en ${duracionSegundos} s (${precision}% de precisión).`, advertencias);
}

function calificarVisuoespacial(datos = {}) {
  const errores = Array.isArray(datos.erroresPorcentaje)
    ? datos.erroresPorcentaje.map(Number).filter(Number.isFinite).slice(0, 12)
    : [];
  if (!errores.length) return crearResultadoNoEvaluable("visuoespacial", "No se registraron respuestas de bisección.");
  const errorAbsolutoMedio = redondear(errores.reduce((suma, valor) => suma + Math.abs(valor), 0) / errores.length, 1);
  const sesgoDireccional = redondear(errores.reduce((suma, valor) => suma + valor, 0) / errores.length, 1);
  let nivel = errorAbsolutoMedio <= 3 ? 0 : errorAbsolutoMedio <= 6 ? 1 : errorAbsolutoMedio <= 10 ? 2 : 3;
  const advertencias = [];
  if (Math.abs(sesgoDireccional) >= 8) {
    nivel = Math.max(nivel, 2);
    advertencias.push("Se observó sesgo direccional consistente; no diagnostica negligencia y requiere valoración clínica.");
  }
  if (errores.length < 5) advertencias.push("Se completaron menos de cinco líneas; conviene repetir la tarea.");
  return resultadoBase("visuoespacial", {
    lineas: errores.length,
    erroresPorcentaje: errores.map((valor) => redondear(valor, 1)),
    errorAbsolutoMedio,
    sesgoDireccional
  }, nivel, `Error absoluto medio ${errorAbsolutoMedio}% y sesgo direccional ${sesgoDireccional}%.`, advertencias);
}

export function calificarPruebaEvc(dominio, datos = {}) {
  const calificadores = {
    atencion: calificarAtencion,
    memoria: calificarMemoria,
    ejecutivas: calificarEjecutivas,
    lenguaje: calificarLenguaje,
    velocidad: calificarVelocidad,
    visuoespacial: calificarVisuoespacial
  };
  return calificadores[dominio]
    ? calificadores[dominio](datos)
    : crearResultadoNoEvaluable(dominio, "Dominio no reconocido por la batería.");
}

export function progresoBateriaEvc(resultados = {}) {
  const dominios = Object.keys(PRUEBAS_EVC);
  const abordados = dominios.filter((id) => resultados[id]?.completada || resultados[id]?.noEvaluable).length;
  const completados = dominios.filter((id) => resultados[id]?.completada).length;
  const noEvaluables = dominios.filter((id) => resultados[id]?.noEvaluable).length;
  return { total: dominios.length, abordados, completados, noEvaluables, completa: abordados === dominios.length };
}

export function normalizarPalabrasFluidez(texto = "") {
  const tokens = String(texto)
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[\n,;]+/)
    .map((palabra) => palabra.replace(/[^a-zñ\s-]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const unicas = [...new Set(tokens)];
  return { tokens, unicas, repeticiones: Math.max(0, tokens.length - unicas.length) };
}
