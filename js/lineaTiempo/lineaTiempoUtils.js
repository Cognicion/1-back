export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 4;

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
  administrativo: { etiqueta: "Administrativo", icono: "□", color: "var(--timeline-type-admin)" },
  personalizado: { etiqueta: "Personalizado", icono: "•", color: "var(--timeline-type-default)" }
});

export function obtenerConfiguracionTipoEvento(tipo = "personalizado") {
  return TIPOS_EVENTO[tipo] || TIPOS_EVENTO.personalizado;
}

export function normalizarFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
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
    tipo: TIPOS_EVENTO[datos.tipo] ? datos.tipo : "personalizado",
    categoria: String(datos.categoria || "Evento clínico").trim().slice(0, 80),
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
  const separacionMinima = Math.min(0.08, 1 / Math.max(eventos.length * 2, 12));
  let anterior = -Infinity;
  const posiciones = eventos.map((evento) => {
    const natural = (evento.fechaEvento - rango.minimo) / rango.duracion;
    const posicion = Math.max(natural, anterior + separacionMinima);
    anterior = posicion;
    return { evento, posicion };
  });
  const exceso = posiciones.at(-1).posicion - 1;
  if (exceso > 0) {
    const factor = 1 / posiciones.at(-1).posicion;
    return posiciones.map((item) => ({ ...item, posicion: item.posicion * factor }));
  }
  return posiciones;
}

export function generarMarcasTemporales(rango, limite = 9) {
  if (!rango.minimo || !rango.maximo) return [];
  const duracionDias = rango.duracion / 86400000;
  let unidad = "year";
  if (duracionDias < 31) unidad = "day";
  else if (duracionDias < 550) unidad = "month";
  const marcas = [];
  const cursor = new Date(rango.minimo);
  cursor.setHours(0, 0, 0, 0);
  if (unidad === "day") cursor.setDate(cursor.getDate() + 1);
  else if (unidad === "month") cursor.setMonth(cursor.getMonth() + 1, 1);
  else cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
  while (cursor < rango.maximo && marcas.length < limite) {
    const posicion = (cursor - rango.minimo) / rango.duracion;
    if (posicion > 0 && posicion < 1) marcas.push({ fecha: new Date(cursor), posicion });
    if (unidad === "day") cursor.setDate(cursor.getDate() + Math.max(1, Math.ceil(duracionDias / 8)));
    else if (unidad === "month") cursor.setMonth(cursor.getMonth() + Math.max(1, Math.ceil(duracionDias / 240)), 1);
    else cursor.setFullYear(cursor.getFullYear() + Math.max(1, Math.ceil(duracionDias / 3650)), 0, 1);
  }
  return marcas;
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
