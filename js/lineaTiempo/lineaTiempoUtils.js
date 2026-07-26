export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10;

export const TIPOS_EVENTO = Object.freeze({
  ingreso: { etiqueta: "Ingreso", icono: "↳", color: "var(--timeline-type-ingreso)" },
  alta: { etiqueta: "Alta", icono: "✓", color: "var(--timeline-type-alta)" },
  consulta: { etiqueta: "Consulta", icono: "●", color: "var(--timeline-type-consulta)" },
  nota_clinica: { etiqueta: "Nota clínica", icono: "✎", color: "var(--timeline-type-nota)" },
  diagnostico: { etiqueta: "Diagnóstico", icono: "◇", color: "var(--timeline-type-diagnostico)" },
  cambio_tratamiento: { etiqueta: "Cambio de tratamiento", icono: "✚", color: "var(--timeline-type-tratamiento)" },
  medicamento_iniciado: { etiqueta: "Medicamento iniciado", icono: "+", color: "var(--timeline-type-tratamiento)" },
  medicamento_suspendido: { etiqueta: "Medicamento suspendido", icono: "−", color: "var(--timeline-type-alerta)" },
  estudio_laboratorio: { etiqueta: "Laboratorio", icono: "▣", color: "var(--timeline-type-estudio)" },
  estudio_gabinete: { etiqueta: "Gabinete", icono: "▤", color: "var(--timeline-type-estudio)" },
  urgencia: { etiqueta: "Urgencia", icono: "!", color: "var(--timeline-type-alerta)" },
  hospitalizacion: { etiqueta: "Hospitalización", icono: "H", color: "var(--timeline-type-hospitalizacion)" },
  evento_adverso: { etiqueta: "Evento adverso", icono: "!", color: "var(--timeline-type-alerta)" },
  intento_suicida: { etiqueta: "Intento suicida", icono: "!", color: "var(--timeline-type-alerta)" },
  seguimiento: { etiqueta: "Seguimiento", icono: "↻", color: "var(--timeline-type-consulta)" },
  administrativo: { etiqueta: "Administrativo", icono: "□", color: "var(--timeline-type-admin)" }
});

export function obtenerConfiguracionTipoEvento(tipo = null) {
  return TIPOS_EVENTO[tipo] || { etiqueta: "Evento clínico", icono: "•", color: "var(--timeline-type-default)" };
}

export function normalizarFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === "string") {
    const match = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, dia, mes, anio] = match.map(Number);
      const fechaLocal = new Date(anio, mes - 1, dia, 12, 0, 0, 0);
      return fechaLocal.getFullYear() === anio && fechaLocal.getMonth() === mes - 1 && fechaLocal.getDate() === dia ? fechaLocal : null;
    }
    const iso = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const [, anio, mes, dia] = iso.map(Number);
      return new Date(anio, mes - 1, dia, 12, 0, 0, 0);
    }
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function normalizarEtiquetaOrigen(valor) {
  if (!valor) return "";
  if (typeof valor === "string") return valor.trim().slice(0, 120);
  if (typeof valor === "object") {
    const texto = valor.label || valor.etiqueta || valor.titulo || valor.tipo || valor.nombre || "";
    return typeof texto === "string" ? texto.trim().slice(0, 120) : "";
  }
  return String(valor).trim().slice(0, 120);
}

export function normalizarEvento(id, datos = {}) {
  const fechaEvento = normalizarFecha(datos.fechaEvento);
  if (!fechaEvento) return null;
  return {
    id,
    titulo: String(datos.titulo || "Evento clínico").trim().slice(0, 160),
    descripcion: String(datos.descripcion || "").trim().slice(0, 1200),
    fechaEvento,
    fechaFin: normalizarFecha(datos.fechaFin),
    tipo: TIPOS_EVENTO[datos.tipo] ? datos.tipo : null,
    categoria: String(datos.categoria || "").trim().slice(0, 80),
    importancia: ["baja", "media", "alta"].includes(datos.importancia) ? datos.importancia : "media",
    origen: ["automatico", "detectado"].includes(datos.origen) ? datos.origen : "manual",
    referenciaId: datos.referenciaId ? String(datos.referenciaId).slice(0, 160) : null,
    referenciaTipo: datos.referenciaTipo ? String(datos.referenciaTipo).slice(0, 80) : null,
    detectedEventId: datos.detectedEventId ? String(datos.detectedEventId).slice(0, 160) : null,
    deteccionId: datos.deteccionId ? String(datos.deteccionId).slice(0, 160) : null,
    sourceType: datos.sourceType ? String(datos.sourceType).slice(0, 80) : null,
    sourceId: datos.sourceId ? String(datos.sourceId).slice(0, 160) : null,
    sourceLabel: normalizarEtiquetaOrigen(datos.sourceLabel) || null,
    sourceDate: normalizarFecha(datos.sourceDate),
    fechaEsAproximada: datos.fechaEsAproximada === true,
    precisionTemporal: datos.precisionTemporal || "",
    activo: datos.activo !== false
  };
}

export function ordenarEventosPorFecha(eventos = []) {
  return [...eventos].filter((evento) => evento?.activo !== false).sort((a, b) => a.fechaEvento - b.fechaEvento);
}

export function agruparEventosPorFecha(eventos = []) {
  const grupos = new Map();
  eventos.forEach((evento) => {
    const clave = obtenerClaveFecha(evento.fechaEvento);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(evento);
  });
  return [...grupos.entries()].map(([clave, items]) => ({ clave, fecha: items[0].fechaEvento, items }));
}

export function obtenerClaveFecha(fecha) {
  const valor = normalizarFecha(fecha);
  if (!valor) return "";
  const pad = (numero) => String(numero).padStart(2, "0");
  return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`;
}

export function calcularRangoTemporal(eventos = []) {
  if (!eventos.length) return { minimo: null, maximo: null, duracion: 0 };
  const minimo = eventos[0].fechaEvento;
  const maximo = eventos[eventos.length - 1].fechaEvento;
  return { minimo, maximo, duracion: Math.max(0, maximo - minimo) };
}

export function calcularPosiciones(eventos = [], rango = calcularRangoTemporal(eventos)) {
  if (!eventos.length) return [];
  if (eventos.length === 1 || rango.duracion === 0) return eventos.map((evento) => ({ evento, posicion: 0.5 }));
  // La fecha es la única fuente de verdad para la coordenada horizontal.
  // Los eventos con la misma fecha se agrupan verticalmente al renderizar.
  return eventos.map((evento) => ({
    evento,
    posicion: Math.min(1, Math.max(0, (evento.fechaEvento - rango.minimo) / rango.duracion))
  }));
}

export function seleccionarIntervaloTemporal(inicioMs, finMs, anchoDisponiblePx = 900) {
  const duracionDias = Math.max(1, (finMs - inicioMs) / 86400000);
  const maxEtiquetas = Math.max(5, Math.min(10, Math.floor(anchoDisponiblePx / 110)));
  const opciones = [
    [1, "dia"], [2, "dias"], [7, "semana"], [14, "semanas"], [30, "mes"], [91, "3-meses"],
    [182, "6-meses"], [365, "anio"], [730, "2-anios"], [1826, "5-anios"], [3652, "10-anios"]
  ];
  return opciones.find(([dias]) => duracionDias / dias <= maxEtiquetas)?.[1] || "10-anios";
}

function avanzarIntervalo(fecha, intervalo) {
  const siguiente = new Date(fecha);
  if (intervalo === "dia") siguiente.setDate(siguiente.getDate() + 1);
  else if (intervalo === "dias") siguiente.setDate(siguiente.getDate() + 2);
  else if (intervalo === "semana") siguiente.setDate(siguiente.getDate() + 7);
  else if (intervalo === "semanas") siguiente.setDate(siguiente.getDate() + 14);
  else if (intervalo === "mes") siguiente.setMonth(siguiente.getMonth() + 1, 1);
  else if (intervalo === "3-meses") siguiente.setMonth(siguiente.getMonth() + 3, 1);
  else if (intervalo === "6-meses") siguiente.setMonth(siguiente.getMonth() + 6, 1);
  else {
    const anos = intervalo === "anio" ? 1 : intervalo === "2-anios" ? 2 : intervalo === "5-anios" ? 5 : 10;
    siguiente.setFullYear(siguiente.getFullYear() + anos, 0, 1);
  }
  return siguiente;
}

function alinearIntervalo(fecha, intervalo) {
  const alineada = new Date(fecha);
  alineada.setHours(12, 0, 0, 0);
  if (intervalo === "dia" || intervalo === "dias") return alineada;
  if (intervalo === "semana" || intervalo === "semanas") {
    alineada.setDate(alineada.getDate() - ((alineada.getDay() + 6) % 7));
    return alineada;
  }
  if (intervalo.includes("mes")) {
    alineada.setDate(1);
    if (intervalo === "3-meses") alineada.setMonth(Math.floor(alineada.getMonth() / 3) * 3, 1);
    if (intervalo === "6-meses") alineada.setMonth(Math.floor(alineada.getMonth() / 6) * 6, 1);
    return alineada;
  }
  const anos = intervalo === "anio" ? 1 : intervalo === "2-anios" ? 2 : intervalo === "5-anios" ? 5 : 10;
  alineada.setMonth(0, 1);
  alineada.setFullYear(Math.ceil(alineada.getFullYear() / anos) * anos);
  return alineada;
}

export const DISTANCIA_MINIMA_ETIQUETA_EXTREMO_PX = 90;

export function generarMarcasTemporales(rango, anchoDisponiblePx = 900) {
  if (!rango.minimo || !rango.maximo) return [];
  if (rango.duracion === 0) return [{ fecha: new Date(rango.minimo), posicion: 0.5, esExtremo: true, tipo: "extremo-inicial" }];
  const inicioMs = rango.minimo.getTime();
  const finMs = rango.maximo.getTime();
  const intervalo = seleccionarIntervaloTemporal(inicioMs, finMs, anchoDisponiblePx);
  const marcas = [{ fecha: new Date(rango.minimo), posicion: 0, esExtremo: true, tipo: "extremo-inicial" }];
  let cursor = alinearIntervalo(rango.minimo, intervalo);
  if (cursor <= rango.minimo) cursor = avanzarIntervalo(cursor, intervalo);
  while (cursor < rango.maximo) {
    const posicion = (cursor - rango.minimo) / rango.duracion;
    if (posicion > 0 && posicion < 1) marcas.push({ fecha: new Date(cursor), posicion });
    cursor = avanzarIntervalo(cursor, intervalo);
  }
  marcas.push({ fecha: new Date(rango.maximo), posicion: 1, esExtremo: true, tipo: "extremo-final" });
  const marcasUnicas = [...new Map(marcas.map((marca) => [marca.fecha.getTime(), marca])).values()];
  const etiquetaFinal = formatearFechaCorta(rango.maximo);
  const etiquetaInicial = formatearFechaCorta(rango.minimo);
  const reservaFinal = Math.max(DISTANCIA_MINIMA_ETIQUETA_EXTREMO_PX, etiquetaFinal.length * 7 + 16);
  const reservaInicial = Math.max(DISTANCIA_MINIMA_ETIQUETA_EXTREMO_PX, etiquetaInicial.length * 7 + 16);
  return marcasUnicas.filter((marca) => {
    if (marca.esExtremo) return true;
    const posicionPx = marca.posicion * anchoDisponiblePx;
    return posicionPx >= reservaInicial && anchoDisponiblePx - posicionPx >= reservaFinal;
  });
}

export function formatearFecha(fecha, opciones = {}) {
  const valor = normalizarFecha(fecha);
  if (!valor) return "Sin fecha";
  return valor.toLocaleString("es-MX", { dateStyle: "medium", ...opciones });
}

export function formatearFechaCorta(fecha) {
  const valor = normalizarFecha(fecha);
  return valor ? valor.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "Sin fecha";
}

export function escaparHTML(valor = "") {
  return String(valor).replace(/[&<>"']/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[caracter]));
}
export function debugTimelineRuntime(paso, datos = {}) {
  console.log(`[Timeline runtime] ${paso}`, datos);
}

export function normalizarNombreCategoria(nombre) {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-MX");
}

export function obtenerNombreCategoriaEvento(evento, categorias = []) {
  if (evento?.categoriaNombre?.trim()) return evento.categoriaNombre.trim();
  if (evento?.categoriaId) {
    const categoria = categorias.find((item) => String(item.id) === String(evento.categoriaId));
    if (categoria?.nombre) return categoria.nombre;
  }
  if (evento?.categoria?.trim()) return evento.categoria.trim();
  return "Sin categoría";
}

export function formatearOrigenEvento(origen) {
  const valor = String(origen || "").trim().toLocaleLowerCase("es-MX");
  if (valor === "manual") return "Manual";
  if (valor === "automatico" || valor === "automático") return "Automático";
  if (valor === "detectado") return "Detectado";
  return String(origen || "").trim() || "No especificado";
}

export function obtenerEtiquetaOrigenEvento(evento = {}) {
  const provieneDeDeteccion = evento.origen === "detectado" && Boolean(evento.detectedEventId || evento.deteccionId);
  if (!provieneDeDeteccion) return "";
  const tipo = normalizarEtiquetaOrigen(evento.sourceLabel) || normalizarEtiquetaOrigen(evento.referenciaTipo) || normalizarEtiquetaOrigen(evento.sourceType) || "fuente clinica";
  const etiquetas = {
    nota: "Nota clinica",
    nota_evolucion: "Nota de evolucion",
    nota_ingreso: "Nota inicial / nota de ingreso",
    historia_inicial: "Historia clinica",
    historia_clinica: "Historia clinica",
    tratamiento: "Tratamiento e indicaciones",
    tratamiento_suspendido: "Tratamiento e indicaciones",
    datos_clinicos: "Datos clinicos del paciente",
    estudio: "Estudios"
  };
  const etiqueta = etiquetas[tipo] || tipo;
  const fecha = normalizarFecha(evento.sourceDate) || normalizarFecha(evento.origenFechaISO);
  return fecha ? `Detectado en: ${etiqueta} del ${formatearFecha(fecha)}` : `Detectado en: ${etiqueta}`;
}

export function formatearImportanciaEvento(importancia) {
  const etiquetas = { baja: "Baja", media: "Media", alta: "Alta" };
  return etiquetas[String(importancia || "").trim().toLocaleLowerCase("es-MX")] || "No especificada";
}

export const ESPACIO_ENTRE_MARCADORES_PX = 8;
export const TAMANO_MINIMO_GRUPO_PX = 28;
export const TAMANO_MAXIMO_GRUPO_PX = 42;
export const TAMANOS_EVENTO_POR_IMPORTANCIA = Object.freeze({
  baja: 18,
  media: 24,
  alta: 32,
  critica: 36
});
export const DISTANCIA_MINIMA_MARCADORES_PX = TAMANO_MAXIMO_GRUPO_PX + ESPACIO_ENTRE_MARCADORES_PX;

export function normalizarImportanciaMarcador(valor = "") {
  const normalizada = String(valor ?? "").trim().toLocaleLowerCase("es-MX");
  if (["critica", "crítica", "critico", "crítico", "critical", "4"].includes(normalizada)) return "critica";
  if (["alta", "high", "3"].includes(normalizada)) return "alta";
  if (["media", "moderada", "medium", "2"].includes(normalizada)) return "media";
  return "baja";
}

export function obtenerTamanoMarcadorPorImportancia(valor = "") {
  return TAMANOS_EVENTO_POR_IMPORTANCIA[normalizarImportanciaMarcador(valor)] || TAMANOS_EVENTO_POR_IMPORTANCIA.media;
}

export function calcularTamanoGrupo(cantidad = 1) {
  const total = Math.max(1, Number(cantidad) || 1);
  const base = 26;
  const incremento = Math.min(14, Math.log2(Math.max(2, total)) * 5);
  return Math.max(TAMANO_MINIMO_GRUPO_PX, Math.min(TAMANO_MAXIMO_GRUPO_PX, Math.round(base + incremento)));
}

function obtenerDiametroElementoVisual(elemento) {
  if (!elemento) return TAMANOS_EVENTO_POR_IMPORTANCIA.media;
  if (elemento.tipo === "grupo" || (elemento.items?.length || 0) > 1) {
    return calcularTamanoGrupo(elemento.items?.length || 1);
  }
  return obtenerTamanoMarcadorPorImportancia(elemento.items?.[0]?.importancia || elemento.evento?.importancia);
}

function obtenerPosicionElementoPx(elemento, inicioMs, finMs, anchoPx) {
  const duracion = Math.max(1, finMs - inicioMs);
  return ((elemento.fechaRepresentativaMs - inicioMs) / duracion) * anchoPx;
}

function crearGrupoVisualPorColision(elementos, granularidad) {
  const items = elementos.flatMap((elemento) => elemento.items || []).sort((a, b) => a.fechaEvento - b.fechaEvento);
  const fechaRepresentativaMs = Math.round(items.reduce((suma, evento) => suma + evento.fechaEvento.getTime(), 0) / Math.max(1, items.length));
  const ids = items.map((evento) => evento.id).sort().join("_");
  const claves = elementos.map((elemento) => elemento.etiquetaPeriodo).filter(Boolean);
  const etiquetaPeriodo = claves.length === 1 ? claves[0] : "Eventos cercanos";
  return {
    tipo: "grupo",
    idGrupo: ["colision", granularidad, ids].join(":"),
    items,
    fechaRepresentativaMs,
    granularidad,
    etiquetaPeriodo
  };
}

function agruparElementosVisualesCercanos(elementos, inicioMs, finMs, anchoPx, granularidad) {
  const ordenados = [...elementos].sort((a, b) => a.fechaRepresentativaMs - b.fechaRepresentativaMs);
  const resultado = [];
  for (const elemento of ordenados) {
    const previo = resultado.at(-1);
    if (!previo) {
      resultado.push(elemento);
      continue;
    }
    const distanciaPx = Math.abs(obtenerPosicionElementoPx(elemento, inicioMs, finMs, anchoPx) - obtenerPosicionElementoPx(previo, inicioMs, finMs, anchoPx));
    const distanciaMinima = obtenerDiametroElementoVisual(elemento) / 2 + obtenerDiametroElementoVisual(previo) / 2 + ESPACIO_ENTRE_MARCADORES_PX;
    if (distanciaPx < distanciaMinima) {
      resultado[resultado.length - 1] = crearGrupoVisualPorColision([previo, elemento], granularidad);
      continue;
    }
    resultado.push(elemento);
  }
  return resultado;
}

function granularidadParaRango(inicioMs, finMs) {
  const anos = (finMs - inicioMs) / (365.25 * 86400000);
  if (anos > 20) return "anual";
  if (anos > 8) return "semestral";
  if (anos > 3) return "trimestral";
  if (anos > 1) return "mensual";
  if (anos > .25) return "semanal";
  return "dia";
}

function claveTemporal(fecha, granularidad) {
  const valor = normalizarFecha(fecha);
  const ano = valor.getFullYear();
  const mes = String(valor.getMonth() + 1).padStart(2, "0");
  if (granularidad === "anual") return String(ano);
  if (granularidad === "semestral") return `${ano}-S${valor.getMonth() < 6 ? 1 : 2}`;
  if (granularidad === "trimestral") return `${ano}-T${Math.floor(valor.getMonth() / 3) + 1}`;
  if (granularidad === "mensual") return `${ano}-${mes}`;
  if (granularidad === "semanal") {
    const inicioAno = new Date(ano, 0, 1);
    const semana = Math.ceil((((valor - inicioAno) / 86400000) + inicioAno.getDay() + 1) / 7);
    return `${ano}-W${String(semana).padStart(2, "0")}`;
  }
  return obtenerClaveFecha(valor);
}

function etiquetaGranularidad(clave, granularidad) {
  if (granularidad === "anual") return clave;
  if (granularidad === "semestral") return `${clave.replace("-S", " · semestre ")}`;
  if (granularidad === "trimestral") return `${clave.replace("-T", " · trimestre ")}`;
  return clave;
}

function granularidadMasAmplia(granularidad) {
  const orden = ["anual", "semestral", "trimestral", "mensual", "semanal", "dia"];
  return orden[Math.max(0, orden.indexOf(granularidad) - 1)];
}

export function agruparEventosParaEscalaVisible({ eventos = [], rangoVisibleInicioMs, rangoVisibleFinMs, anchoDisponiblePx = 900 }) {
  const visibles = eventos.filter((evento) => {
    const inicio = evento.fechaEvento.getTime();
    const fin = evento.fechaFin?.getTime?.() || inicio;
    return fin >= rangoVisibleInicioMs && inicio <= rangoVisibleFinMs;
  });
  if (!visibles.length) return [];
  let granularidad = granularidadParaRango(rangoVisibleInicioMs, rangoVisibleFinMs);
  const anchoPorEvento = anchoDisponiblePx / visibles.length;
  if (anchoPorEvento < DISTANCIA_MINIMA_MARCADORES_PX) granularidad = granularidadMasAmplia(granularidad);
  const cubetas = new Map();
  visibles.forEach((evento) => {
    const clave = claveTemporal(evento.fechaEvento, granularidad);
    if (!cubetas.has(clave)) cubetas.set(clave, []);
    cubetas.get(clave).push(evento);
  });
  const elementos = [...cubetas.entries()].map(([clave, items]) => {
    const fechaRepresentativaMs = Math.round(items.reduce((suma, evento) => suma + evento.fechaEvento.getTime(), 0) / items.length);
    if (items.length === 1) return { tipo: "evento", id: items[0].id, evento: items[0], items, fechaRepresentativaMs, granularidad, etiquetaPeriodo: etiquetaGranularidad(clave, granularidad) };
    return {
      tipo: "grupo",
      idGrupo: [granularidad, clave, items.map((evento) => evento.id).sort().join("_")].join(":"),
      items,
      fechaRepresentativaMs,
      granularidad,
      etiquetaPeriodo: etiquetaGranularidad(clave, granularidad)
    };
  }).sort((a, b) => a.fechaRepresentativaMs - b.fechaRepresentativaMs);
  return agruparElementosVisualesCercanos(elementos, rangoVisibleInicioMs, rangoVisibleFinMs, anchoDisponiblePx, granularidad)
    .sort((a, b) => a.fechaRepresentativaMs - b.fechaRepresentativaMs);
}
