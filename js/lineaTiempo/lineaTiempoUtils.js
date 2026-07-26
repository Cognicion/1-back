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
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
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
    origen: datos.origen === "automatico" ? "automatico" : "manual",
    referenciaId: datos.referenciaId ? String(datos.referenciaId).slice(0, 160) : null,
    referenciaTipo: datos.referenciaTipo ? String(datos.referenciaTipo).slice(0, 80) : null,
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
  return [...new Map(marcas.map((marca) => [marca.fecha.getTime(), marca])).values()];
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
  return String(origen || "").trim() || "No especificado";
}

export function formatearImportanciaEvento(importancia) {
  const etiquetas = { baja: "Baja", media: "Media", alta: "Alta" };
  return etiquetas[String(importancia || "").trim().toLocaleLowerCase("es-MX")] || "No especificada";
}
