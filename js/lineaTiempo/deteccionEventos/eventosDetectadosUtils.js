export const ESTADOS_EVENTO_DETECTADO = Object.freeze({
  pendiente: "pendiente",
  aceptado: "aceptado",
  descartado: "descartado",
  obsoleto: "obsoleto",
  error: "error"
});

export const MOTIVOS_DESCARTE_EVENTO_DETECTADO = Object.freeze({
  duplicado: "Duplicado",
  no_relevante: "No relevante",
  fecha_incorrecta: "Fecha incorrecta",
  no_ocurrio: "No ocurrio",
  otra_persona: "Corresponde a otra persona",
  otro: "Otro"
});

export function normalizarTextoDeteccion(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es-MX");
}

export function textoVisible(valor = "", max = 240) {
  const limpio = String(valor || "").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

export async function hashTextoSHA256(texto = "") {
  const bytes = new TextEncoder().encode(String(texto || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fechaAISO(fecha) {
  if (!fecha) return null;
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime())) return null;
  const pad = (numero) => String(numero).padStart(2, "0");
  return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`;
}

export function fechaLocalDesdeISO(iso = "") {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, anio, mes, dia] = match.map(Number);
  const fecha = new Date(anio, mes - 1, dia, 12, 0, 0, 0);
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia ? fecha : null;
}

export function normalizarFechaDocumento(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (typeof valor.seconds === "number") return new Date(valor.seconds * 1000);
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === "string") {
    const limpio = valor.trim();
    const ddmmaa = limpio.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (ddmmaa) return new Date(Number(ddmmaa[3]), Number(ddmmaa[2]) - 1, Number(ddmmaa[1]), Number(ddmmaa[4] || 12), Number(ddmmaa[5] || 0));
    const iso = limpio.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    const fecha = new Date(limpio);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  return null;
}

export function crearHuellaConceptual({ pacienteId = "", fechaInicioISO = "", tituloSugerido = "", categoriaSugerida = "", sujeto = "" } = {}) {
  return [
    pacienteId,
    fechaInicioISO || "sin-fecha",
    normalizarTextoDeteccion(categoriaSugerida || "evento"),
    normalizarTextoDeteccion(tituloSugerido),
    sujeto || "paciente"
  ].join("|");
}

export function nivelConfianza(confianza = 0) {
  const valor = Number(confianza) || 0;
  if (valor >= 0.85) return "Alta";
  if (valor >= 0.6) return "Media";
  return "Baja";
}

export function tituloDesdeFrase(frase = "") {
  const texto = normalizarTextoDeteccion(frase);
  if (/madre|padre|herman|abuela|abuelo|familiar/.test(texto) && /fallec|murio|muerte/.test(texto)) return "Fallecimiento de familiar";
  if (/intento suicida|suicid/.test(texto)) return "Intento suicida";
  if (/hospitaliz|internad|ingres/.test(texto)) return "Hospitalizacion o ingreso";
  if (/diagnostic/.test(texto)) return "Diagnostico referido";
  if (/tratamiento|medicamento|farmaco|inici[óo]|suspend/.test(texto)) return "Cambio de tratamiento";
  if (/resonancia|tomografia|laboratorio|gabinete|estudio/.test(texto)) return "Estudio clinico";
  if (/consumo|alcohol|cocaina|metanfetamina|cannabis|tabaco/.test(texto)) return "Consumo de sustancias";
  if (/aislamiento|insomnio|ansiedad|depres|sintoma|crisis/.test(texto)) return "Inicio o cambio de sintomas";
  return "Evento clinico detectado";
}

export function sujetoDesdeFrase(frase = "") {
  const texto = normalizarTextoDeteccion(frase);
  if (/\b(madre|padre|herman[oa]|abuela|abuelo|tio|tia|hijo|hija|familiar)\b/.test(texto)) return "familiar";
  return "paciente";
}

export function categoriaDesdeFrase(frase = "") {
  const texto = normalizarTextoDeteccion(frase);
  if (/hospitaliz|internad|ingres/.test(texto)) return "hospitalizacion";
  if (/intento suicida|suicid/.test(texto)) return "intento_suicida";
  if (/diagnostic/.test(texto)) return "diagnostico";
  if (/tratamiento|medicamento|farmaco|suspend/.test(texto)) return "cambio_tratamiento";
  if (/resonancia|tomografia|laboratorio|gabinete|estudio/.test(texto)) return "estudio_gabinete";
  if (/urgencia/.test(texto)) return "urgencia";
  return null;
}

export function importanciaDesdeFrase(frase = "") {
  const texto = normalizarTextoDeteccion(frase);
  if (/intento suicida|violencia|hospitaliz|intoxic|urgencia|evento adverso grave/.test(texto)) return "alta";
  if (/diagnostic|tratamiento|crisis|consumo|fallec/.test(texto)) return "media";
  return "baja";
}
