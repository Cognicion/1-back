import { obtenerHistorialNotas } from "./notas.js";
import { listarEstudios } from "./estudios.js";
import { listarNotasRapidas } from "./notasRapidas.js";
import {
  construirDatosAutomaticos,
  crearDeteccionHistoria,
  detectarDatosHistoria,
  obtenerDefinicionHistoria
} from "./historiaClinicaDeteccion.js?v=20260821-detected-data-v1";
const FAMILIARES = [["madre", /\bmadre\b/iu], ["padre", /\bpadre\b/iu], ["hermano", /\bherman[oa]s?\b/iu], ["hijo", /\bhij[oa]s?\b/iu], ["abuelo", /\babuel[oa]s?\b/iu], ["tio", /\bt[ií]o[as]?\b/iu], ["primo", /\bprim[oa]s?\b/iu], ["pareja", /\bpareja|conyuge|cónyuge|espos[oa]\b/iu]];
const COMORBILIDADES = ["diabetes", "hipertension", "hipertensión", "cancer", "cáncer", "depresion", "depresión", "ansiedad", "bipolar", "esquizofrenia", "epilepsia", "cardiopatia", "cardiopatía", "alcoholismo", "suicidio", "demencia", "alzheimer", "parkinson", "obesidad", "tuberculosis", "enfermedad renal", "enfermedad tiroidea"];
const texto = (valor) => String(valor ?? "").replace(/\s+/g, " ").trim();
const normalizar = (valor) => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const hash = (valor) => { let salida = 2166136261; for (const caracter of valor) { salida ^= caracter.charCodeAt(0); salida = Math.imul(salida, 16777619); } return (salida >>> 0).toString(36); };
const CAMPOS_NARRATIVOS = new Set(["", "texto", "contenido", "nota", "notaeditada", "resumen", "resultado", "descripcion", "hallazgos", "textocompleto", "textoextraido"]);

function textosDeObjeto(valor, salida = [], ruta = "") {
  if (typeof valor === "string") { if (valor.trim()) salida.push({ texto: valor, ruta }); return salida; }
  if (typeof valor === "number" || typeof valor === "boolean") {
    if (typeof valor !== "number" || Number.isFinite(valor)) salida.push({ texto: String(valor), ruta });
    return salida;
  }
  if (Array.isArray(valor) && valor.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
    const combinado = valor.map(texto).filter(Boolean).join(", ");
    if (combinado) salida.push({ texto: combinado, ruta });
    return salida;
  }
  if (!valor || typeof valor !== "object") return salida;
  if (typeof valor.toDate === "function" || typeof valor.seconds === "number") return salida;
  Object.entries(valor).forEach(([clave, dato]) => textosDeObjeto(dato, salida, ruta ? `${ruta}.${clave}` : clave));
  return salida;
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
  const agregar = (tipo, id, datos, fecha = "") => {
    const campos = textosDeObjeto(datos);
    const partes = campos.map((item) => {
      const campo = item.ruta.split(".").pop();
      return campo ? `${campo}: ${item.texto}` : item.texto;
    });
    const textoDeteccion = campos
      .filter((item) => CAMPOS_NARRATIVOS.has(normalizar(item.ruta.split(".").pop())))
      .map((item) => item.texto)
      .join("\n");
    if (partes.length) fuentes.push({ tipo, id, fecha, texto: partes.join("\n"), textoDeteccion, campos });
  };
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
  const familiograma = extraerFamiliograma(fuentes, paciente);
  const historiaFamiliar = familiograma.personas.slice(1).map((persona) => `${persona.parentesco}: ${persona.antecedentes || "sin comorbilidades reportadas"}`).join("\n");
  const detecciones = detectarDatosHistoria(fuentes);
  const definicionFamiliar = obtenerDefinicionHistoria("historiaFamiliar");
  const familiarYaDetectada = detecciones.some((deteccion) => deteccion.clave === "historiaFamiliar" && normalizar(deteccion.valor) === normalizar(historiaFamiliar));
  if (historiaFamiliar && definicionFamiliar && !familiarYaDetectada) {
    const fuentesFamiliares = fuentes
      .filter((fuente) => familiograma.personas.slice(1).some((persona) => (persona.fuentes || []).some((origen) => origen.tipo === fuente.tipo && origen.id === fuente.id)))
      .map(({ tipo, id, fecha }) => ({ tipo, id, fecha }));
    detecciones.push(crearDeteccionHistoria({
      definicion: definicionFamiliar,
      valor: historiaFamiliar,
      fuentes: fuentesFamiliares,
      metodo: "family_relationship_extraction",
      confianza: 0.9
    }));
  }
  const fuentesPublicas = fuentes.map(({ tipo, id, fecha }) => ({ tipo, id, fecha }));
  return {
    datos: construirDatosAutomaticos(detecciones),
    detecciones,
    familiograma: { ...familiograma, fuentes: fuentesPublicas },
    fuentes: fuentesPublicas,
    comorbilidadesFamiliares: familiograma.personas.slice(1).flatMap((persona) => persona.comorbilidades || []).filter((valor, index, lista) => lista.indexOf(valor) === index),
    historiaFamiliar
  };
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
