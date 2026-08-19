import { obtenerHistorialNotas } from "./notas.js";
import { listarEstudios } from "./estudios.js";
import { listarNotasRapidas } from "./notasRapidas.js";

const SECCIONES = [
  ["motivo", "motivo de consulta|motivo de ingreso|motivo|motivoConsulta|motivoIngreso"],
  ["padecimientoActual", "padecimiento actual|enfermedad actual|padecimientoActual"],
  ["ahf", "antecedentes heredofamiliares|antecedentes familiares|ahf|antecedentesHeredofamiliares"],
  ["app", "antecedentes personales patologicos|antecedentes personales patológicos|app|antecedentesPersonalesPatologicos"],
  ["apnp", "antecedentes personales no patologicos|antecedentes personales no patológicos|apnp|antecedentesPersonalesNoPatologicos"],
  ["antecedentesGinecoobstetricos", "antecedentes ginecoobstetricos|antecedentes ginecoobstétricos"],
  ["hitosDesarrollo", "antecedentes del desarrollo|desarrollo psicomotor"],
  ["historiaAcademica", "antecedentes escolares|historia academica|historia académica"],
  ["historiaLaboral", "antecedentes laborales|historia laboral"],
  ["historiaSocial", "antecedentes sociales|historia social"],
  ["historiaFamiliar", "historia familiar|dinamica familiar|dinámica familiar|historiaFamiliar"],
  ["sustancias", "consumo de sustancias|toxicomanias|toxicomanías|habitos toxicos|hábitos tóxicos|consumoSustancias"],
  ["exploracionFisica", "exploracion fisica|exploración física|exploracionFisica"],
  ["exploracionNeurologica", "exploracion neurologica|exploración neurológica|exploracionNeurologica"],
  ["exploracionMental", "examen mental|exploracion mental|exploración mental|exploracionMental"],
  ["diagnosticoClinico", "diagnostico|diagnósticos|impresion diagnostica|impresión diagnóstica|diagnosticos|diagnosticoClinico"],
  ["tratamientoFarmacologico", "tratamiento|manejo farmacologico|manejo farmacológico|tratamientoFarmacologico"],
  ["indicaciones", "indicaciones|indicaciones medicas|indicaciones médicas"],
  ["plan", "plan terapeutico|plan terapéutico|plan"],
  ["pronostico", "pronostico|pronóstico"],
  ["observaciones", "observaciones|comentario clinico|comentario clínico"]
];
const FAMILIARES = [["madre", /\bmadre\b/iu], ["padre", /\bpadre\b/iu], ["hermano", /\bherman[oa]s?\b/iu], ["hijo", /\bhij[oa]s?\b/iu], ["abuelo", /\babuel[oa]s?\b/iu], ["tio", /\bt[ií]o[as]?\b/iu], ["primo", /\bprim[oa]s?\b/iu], ["pareja", /\bpareja|conyuge|cónyuge|espos[oa]\b/iu]];
const COMORBILIDADES = ["diabetes", "hipertension", "hipertensión", "cancer", "cáncer", "depresion", "depresión", "ansiedad", "bipolar", "esquizofrenia", "epilepsia", "cardiopatia", "cardiopatía", "alcoholismo", "suicidio", "demencia", "alzheimer", "parkinson", "obesidad", "tuberculosis", "enfermedad renal", "enfermedad tiroidea"];
const texto = (valor) => String(valor ?? "").replace(/\s+/g, " ").trim();
const normalizar = (valor) => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const hash = (valor) => { let salida = 2166136261; for (const caracter of valor) { salida ^= caracter.charCodeAt(0); salida = Math.imul(salida, 16777619); } return (salida >>> 0).toString(36); };

function textosDeObjeto(valor, salida = [], ruta = "") {
  if (typeof valor === "string") { if (valor.trim()) salida.push({ texto: valor, ruta }); return salida; }
  if (!valor || typeof valor !== "object") return salida;
  if (typeof valor.toDate === "function" || typeof valor.seconds === "number") return salida;
  Object.entries(valor).forEach(([clave, dato]) => textosDeObjeto(dato, salida, ruta ? `${ruta}.${clave}` : clave));
  return salida;
}

function separarBloques(textoFuente = "") {
  const encabezados = SECCIONES.flatMap(([, aliases]) => aliases.split("|"))
    .sort((a, b) => b.length - a.length)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const expresion = new RegExp(`(?:^|\\n)\\s*(${encabezados})\\s*[:\\-]?\\s*`, "giu");
  const encontrados = [];
  let match;
  while ((match = expresion.exec(textoFuente))) encontrados.push({ alias: match[1], indice: match.index, inicio: match.index + match[0].length });
  return encontrados.map((actual, index) => ({ alias: normalizar(actual.alias), texto: textoFuente.slice(actual.inicio, encontrados[index + 1]?.indice || textoFuente.length).trim() })).filter((bloque) => bloque.texto);
}

function claveSeccion(alias = "") {
  const normal = normalizar(alias);
  return SECCIONES.find(([, aliases]) => aliases.split("|").some((item) => normal === normalizar(item)))?.[0] || "";
}

function frasesFuente(textoFuente = "") { return textoFuente.split(/(?<=[.!?;])\s+|\n+/u).map(texto).filter(Boolean); }

function extraerFamiliograma(fuentes = [], paciente = {}) {
  const pacienteId = `automatico-${hash("paciente")}`;
  const personas = [{ id: pacienteId, nombre: texto(paciente.nombreCompleto || paciente.nombre || "Paciente"), parentesco: "paciente", sexo: texto(paciente.sexo), edad: Number(paciente.edad) || null, fallecido: false, convive: false, pacienteIdentificado: true, antecedentes: "", fuente: "datos_del_paciente", requiereRevision: false }];
  const relaciones = [];
  const mapa = new Map();
  for (const fuente of fuentes) for (const frase of frasesFuente(fuente.texto)) for (const [parentesco, patron] of FAMILIARES) {
    if (!patron.test(frase)) continue;
    const negada = /\bniega|sin antecedentes|no hay|ningun[oa]?\b/iu.test(frase);
    const comorbilidades = COMORBILIDADES.filter((condicion) => normalizar(frase).includes(normalizar(condicion)));
    const persona = mapa.get(parentesco) || { id: `automatico-${hash(parentesco)}`, nombre: parentesco, parentesco, sexo: "", edad: null, fallecido: false, convive: false, pacienteIdentificado: false, antecedentes: "", comorbilidades: [], fuentes: [], requiereRevision: true, negada: false };
    if (!negada) { persona.antecedentes = [persona.antecedentes, frase].filter(Boolean).join("; ").slice(0, 800); persona.comorbilidades = [...persona.comorbilidades, ...comorbilidades].filter((valor, indice, lista) => lista.findIndex((item) => normalizar(item) === normalizar(valor)) === indice); } else persona.negada = true;
    persona.fuentes.push({ tipo: fuente.tipo, id: fuente.id, fecha: fuente.fecha || "" });
    mapa.set(parentesco, persona);
  }
  for (const persona of mapa.values()) {
    persona.antecedentes = persona.comorbilidades.length ? `Comorbilidades familiares detectadas: ${persona.comorbilidades.join(", ")}. ${persona.antecedentes}`.trim() : persona.antecedentes || (persona.negada ? "Sin antecedentes familiares relevantes referidos en las fuentes analizadas." : "");
    personas.push(persona);
    relaciones.push({ id: `automatico-${hash(`paciente-${persona.parentesco}`)}`, personaA: pacienteId, personaB: persona.id, tipo: "filiacion", calidad: "", fuente: "extraccion_automatica", requiereRevision: true });
  }
  return { personas, relaciones, observacionesGenerales: "Generado automáticamente a partir de fuentes clínicas; revisar y confirmar.", generadoAutomaticamente: true, requiereRevision: mapa.size > 0 };
}

function construirFuentes({ paciente = {}, historia = {}, notas = [], estudios = [] } = {}) {
  const fuentes = [];
  const agregar = (tipo, id, datos, fecha = "") => { const partes = textosDeObjeto(datos).map((item) => { const campo = item.ruta.split(".").pop(); return campo ? `${campo}: ${item.texto}` : item.texto; }); if (partes.length) fuentes.push({ tipo, id, fecha, texto: partes.join("\n") }); };
  agregar("paciente", "paciente", paciente, paciente.fechaCreacion);
  agregar("historia_clinica", "historiaInicial", historia, historia.fechaActualizacion);
  notas.forEach((nota) => agregar(nota.tipoFuente || "nota", nota.id || "nota", nota.notaEditada || nota, nota.fecha || nota.fechaCreacion || nota.fechaISO));
  estudios.forEach((estudio) => agregar("documento_oficial", estudio.id || "estudio", estudio, estudio.fecha || estudio.fechaCreacion));
  return fuentes;
}

export async function generarHistoriaClinicaAutomatica({ uidPaciente, paciente = {}, historia = {} } = {}) {
  let notas = [];
  let notasRapidas = [];
  let estudios = [];
  try { notas = (await obtenerHistorialNotas(uidPaciente)).docs.map((documento) => ({ id: documento.id, ...documento.data() })); } catch (error) { console.warn("No se pudieron cargar notas para la historia automática", error?.code || error); }
  try { estudios = await listarEstudios(uidPaciente); } catch (error) { console.warn("No se pudieron cargar documentos oficiales para la historia automática", error?.code || error); }
  try { notasRapidas = await listarNotasRapidas(uidPaciente); } catch (error) { console.warn("No se pudieron cargar notas rápidas para la historia automática", error?.code || error); }
  const fuentes = construirFuentes({ paciente, historia, notas: [...notas, ...notasRapidas.map((nota) => ({ ...nota, tipoFuente: "nota_rapida" }))], estudios });
  const secciones = {};
  for (const fuente of fuentes) for (const bloque of separarBloques(fuente.texto)) { const clave = claveSeccion(bloque.alias); if (clave) secciones[clave] = [...(secciones[clave] || []), `[${fuente.tipo}] ${bloque.texto}`]; }
  const familiograma = extraerFamiliograma(fuentes, paciente);
  const historiaFamiliar = familiograma.personas.slice(1).map((persona) => `${persona.parentesco}: ${persona.antecedentes || "sin comorbilidades reportadas"}`).join("\n");
  return { datos: Object.fromEntries(Object.entries(secciones).map(([clave, partes]) => [clave, [...new Set(partes)].join("\n\n").slice(0, 12000)])), familiograma: { ...familiograma, fuentes: fuentes.map(({ tipo, id, fecha }) => ({ tipo, id, fecha })) }, fuentes: fuentes.map(({ tipo, id, fecha }) => ({ tipo, id, fecha })), comorbilidadesFamiliares: familiograma.personas.slice(1).flatMap((persona) => persona.comorbilidades || []).filter((valor, index, lista) => lista.indexOf(valor) === index), historiaFamiliar };
}

export function combinarHistoriaAutomatica(datosActuales = {}, automatico = {}) {
  const datos = { ...datosActuales };
  for (const [clave, valor] of Object.entries(automatico.datos || {})) if (!String(datos[clave] || "").trim() && String(valor || "").trim()) datos[clave] = valor;
  if (!String(datos.historiaFamiliar || "").trim() && automatico.historiaFamiliar) datos.historiaFamiliar = automatico.historiaFamiliar;
  const existente = datos.familiograma && Array.isArray(datos.familiograma.personas) ? datos.familiograma : { personas: [], relaciones: [], observacionesGenerales: "" };
  const idsExistentes = new Set(existente.personas.map((persona) => normalizar(persona.parentesco || persona.nombre)));
  const pacienteExistente = existente.personas.find((persona) => persona.pacienteIdentificado === true);
  const equivalencias = new Map();
  const personasNuevas = (automatico.familiograma?.personas || []).filter((persona) => {
    if (persona.pacienteIdentificado && pacienteExistente) { equivalencias.set(persona.id, pacienteExistente.id); return false; }
    if (idsExistentes.has(normalizar(persona.parentesco || persona.nombre))) return false;
    return true;
  });
  personasNuevas.forEach((persona) => equivalencias.set(persona.id, persona.id));
  const relacionesNuevas = (automatico.familiograma?.relaciones || []).map((relacion) => ({ ...relacion, personaA: equivalencias.get(relacion.personaA) || relacion.personaA, personaB: equivalencias.get(relacion.personaB) || relacion.personaB })).filter((relacion) => relacion.personaA !== relacion.personaB && [...existente.personas, ...personasNuevas].some((persona) => persona.id === relacion.personaA) && [...existente.personas, ...personasNuevas].some((persona) => persona.id === relacion.personaB));
  datos.familiograma = { ...existente, personas: [...existente.personas, ...personasNuevas], relaciones: [...(existente.relaciones || []), ...relacionesNuevas], observacionesGenerales: existente.observacionesGenerales || automatico.familiograma?.observacionesGenerales || "", fuentes: automatico.fuentes, comorbilidadesFamiliares: automatico.comorbilidadesFamiliares, requiereRevision: true };
  datos.fuentesAutomaticasHistoria = automatico.fuentes;
  datos.comorbilidadesFamiliares = automatico.comorbilidadesFamiliares;
  datos.historiaGeneradaAutomaticamente = true;
  return datos;
}
