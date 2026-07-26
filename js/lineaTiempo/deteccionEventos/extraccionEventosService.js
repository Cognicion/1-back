import { resolverFechaClinica, resolverIntervaloClinico } from "./normalizacionFechasClinicas.js";
import {
  categoriaDesdeFrase,
  importanciaDesdeFrase,
  sujetoDesdeFrase,
  textoVisible,
  tituloDesdeFrase
} from "./eventosDetectadosUtils.js";

const PATRONES_TEMPORALES = [
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/gi,
  /\b\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}\b/gi,
  /\b[a-záéíóúñ]+\s+de\s+\d{4}\b/gi,
  /\b(?:en|desde|alrededor de|aproximadamente en)\s+\d{4}\b/gi,
  /\b(?:a principios de|a mediados de|a finales de)\s+\d{4}\b/gi,
  /\b(?:ayer|anteayer|la semana pasada|el mes pasado|el año pasado|el ano pasado)\b/gi,
  /\b(?:desde\s+)?(?:aproximadamente\s+|alrededor\s+de\s+)?hace\s+(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:día|dias|días|semana|semanas|mes|meses|año|años|ano|anos)\b/gi,
  /\b(?:a los|desde los)\s+\d{1,2}\s+años\b/gi,
  /\b(?:infancia|adolescencia|desde joven|desde pequeño|desde pequeno|hace tiempo|recientemente|años atrás|anos atras)\b/gi
];

const PALABRAS_RELEVANTES = /\b(ingres|internad|hospitaliz|alta|urgencia|crisis|intento suicida|suicid|autoles|violencia|diagnostic|tratamiento|medicamento|suspend|inici|resonancia|tomografia|laboratorio|gabinete|estudio|cirugia|enfermedad|consumo|alcohol|cocaina|metanfetamina|cannabis|recaid|trauma|fallec|murio|muerte|embarazo|parto|legal|aislamiento|insomnio|ansiedad|depres)/i;
const NEGACION = /\b(niega|niegan|no ha presentado|no presenta|sin antecedente|se descarto|descarta|no refiere|niega antecedente)\b/i;
const FUTURO_CONDICIONAL = /\b(se considerara|si empeora|proxima consulta|se hospitalizara|se programo|se indicara)\b/i;

function normalizarFrase(frase = "") {
  return String(frase || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function segmentarEnFrases(texto = "") {
  return String(texto || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((frase) => frase.trim())
    .filter((frase) => frase.length >= 12);
}

function contieneTemporalidad(frase = "") {
  return PATRONES_TEMPORALES.some((patron) => {
    patron.lastIndex = 0;
    return patron.test(frase);
  });
}

function extraerExpresionTemporal(frase = "") {
  for (const patron of PATRONES_TEMPORALES) {
    patron.lastIndex = 0;
    const match = patron.exec(frase);
    if (match?.[0]) return match[0];
  }
  return "";
}

export function extraerEventosClinicosLocales(fragmentos = [], contextoPaciente = {}) {
  const eventos = [];
  for (const fragmento of fragmentos) {
    const frases = segmentarEnFrases(fragmento.texto);
    for (const frase of frases) {
      if (!contieneTemporalidad(frase)) continue;
      const fraseNormalizada = normalizarFrase(frase);
      if (!PALABRAS_RELEVANTES.test(fraseNormalizada)) continue;
      if (NEGACION.test(fraseNormalizada)) continue;
      if (FUTURO_CONDICIONAL.test(fraseNormalizada)) continue;

      const intervalo = resolverIntervaloClinico(frase, {
        fechaReferencia: fragmento.fechaDocumento,
        fechaNacimiento: contextoPaciente.fechaNacimiento,
        origenFechaReferencia: fragmento.origenFechaReferencia
      });
      const expresion = intervalo?.expresionTemporalOriginal || extraerExpresionTemporal(frase);
      const fecha = intervalo || resolverFechaClinica(expresion || frase, {
        fechaReferencia: fragmento.fechaDocumento,
        fechaNacimiento: contextoPaciente.fechaNacimiento,
        origenFechaReferencia: fragmento.origenFechaReferencia
      });
      if (!fecha) continue;

      eventos.push({
        tituloSugerido: tituloDesdeFrase(frase),
        descripcionSugerida: textoVisible(frase.replace(expresion, "").trim() || frase, 360),
        fechaTipo: fecha.requiereRevisionFecha ? "aproximada" : "exacta",
        fechaInicioISO: fecha.fechaInicioISO,
        fechaFinISO: fecha.fechaFinISO,
        precisionTemporal: fecha.precisionTemporal,
        expresionTemporalOriginal: expresion || fecha.expresionTemporalOriginal,
        fragmentoSoporte: textoVisible(frase, 280),
        categoriaSugerida: categoriaDesdeFrase(frase),
        importanciaSugerida: importanciaDesdeFrase(frase),
        confianza: fecha.fechaInicioISO ? 0.78 : 0.52,
        requiereRevisionFecha: Boolean(fecha.requiereRevisionFecha),
        fechaReferenciaISO: fecha.fechaReferenciaISO,
        origenFechaReferencia: fecha.origenFechaReferencia,
        sujeto: sujetoDesdeFrase(frase),
        origenTipo: fragmento.origenTipo,
        origenSubtipo: fragmento.origenSubtipo,
        origenId: fragmento.origenId,
        origenFechaISO: fragmento.fechaDocumentoISO,
        seccion: fragmento.seccion || "",
        indiceFragmento: fragmento.indiceFragmento || 0,
        hashFuente: fragmento.hashFuente,
        hashFragmento: fragmento.hashFragmento
      });
    }
  }
  return eventos;
}
