import { buscarMedicamentos, normalizarNombreMedicamento } from "../data/catalogoFarmacologicoUnificado.js?v=20260811-catalog-presentations-v1";
import {
  evaluarInteraccionesClinicas,
  normalizarMedicamentoClinico
} from "./motorClinicoMedicamentos.js?v=20260811-catalog-presentations-v1";

const SEVERIDAD_PUBLICA = {
  critica: "contraindicada",
  contraindicada: "contraindicada",
  alta: "alta",
  moderada: "moderada",
  baja: "baja",
  informativa: "informativa"
};

function tokens(valor = "") {
  return normalizarNombreMedicamento(valor).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
}

function presentacionesCoincidentes(medicamento, query = "") {
  const queryTokens = tokens(query).filter((token) => !["de", "mg", "ml", "g", "tableta", "tabletas", "capsula", "capsulas"].includes(token));
  return (medicamento.presentaciones || []).filter((presentacion) => {
    if (!query.trim()) return false;
    const texto = normalizarNombreMedicamento(presentacion.texto || "");
    const consultaNormalizada = normalizarNombreMedicamento(query);
    const nombreNormalizado = normalizarNombreMedicamento(medicamento.nombre);
    const incluyeNombre = consultaNormalizada.includes(nombreNormalizado);
    const tieneConcentracion = /\d/.test(consultaNormalizada) && /\d/.test(texto);
    return queryTokens.every((token) => texto.includes(token)) || texto.includes(consultaNormalizada) || (incluyeNombre && tieneConcentracion);
  });
}

export function buscarMedicamentosParaConsulta(query = "", limit = 12) {
  if (!String(query || "").trim()) return [];
  return buscarMedicamentos(query, { limit, strict: false, allowEmpty: false }).map((medicamento) => ({
    medicamento,
    presentaciones: presentacionesCoincidentes(medicamento, query)
  }));
}

export function crearSeleccionMedicamento(medicamento, presentacion = null) {
  return {
    clinicalMedicationId: medicamento.id,
    medicationId: medicamento.id,
    nombre: medicamento.nombre,
    genericName: medicamento.genericName || medicamento.nombre,
    principioActivo: medicamento.principioActivo || medicamento.principioActivoNormalizado || medicamento.id,
    selectedPresentationId: presentacion?.id || presentacion?.presentationId || null,
    selectedPresentationText: presentacion?.texto || "",
    presentacion: presentacion?.texto || "",
    via: presentacion?.via || "",
    medicamento: medicamento.nombre,
    originalText: [medicamento.nombre, presentacion?.texto].filter(Boolean).join(" ")
  };
}

export function analizarInteraccionesPublicas(selecciones = []) {
  const porIngrediente = new Map();
  selecciones.forEach((seleccion) => {
    const normalizado = normalizarMedicamentoClinico(seleccion);
    const clave = normalizado.ingredienteIds.length
      ? [...normalizado.ingredienteIds].sort().join("+")
      : normalizado.textoNormalizado;
    if (!clave || porIngrediente.has(clave)) return;
    porIngrediente.set(clave, normalizado);
  });

  const alertas = evaluarInteraccionesClinicas([...porIngrediente.values()]);
  const alertasPublicas = alertas.map((alerta) => ({
    ...alerta,
    severidad: SEVERIDAD_PUBLICA[alerta.severidad] || alerta.severidad,
    medicamentos: (alerta.medicamentos || []).map((nombre) => String(nombre).replace(/\s*\([^)]*\)/g, "").trim()),
    efectoClinico: alerta.efecto || "",
    categoria: inferirCategoriaPublica(alerta)
  }));
  return deduplicarAlertasPublicas(alertasPublicas);
}

function deduplicarAlertasPublicas(alertas = []) {
  const porClave = new Map();
  alertas.forEach((alerta) => {
    const medicamentos = (alerta.medicamentos || [])
      .map((medicamento) => normalizarNombreMedicamento(medicamento))
      .sort()
      .join("|");
    const categoria = normalizarNombreMedicamento(alerta.categoria || alerta.tipo || "interaccion");
    const clave = `${categoria}:${medicamentos}`;
    const existente = porClave.get(clave);
    if (!existente || (alerta.prioridad || 0) > (existente.prioridad || 0)) {
      porClave.set(clave, alerta);
    }
  });
  return [...porClave.values()];
}

function inferirCategoriaPublica(alerta = {}) {
  if (alerta.categoria || alerta.tipoInteraccion) return alerta.categoria || alerta.tipoInteraccion;
  const titulo = normalizarNombreMedicamento(alerta.titulo || "");
  if (/seroton|tramadol|imao|triptan/.test(titulo)) return "serotoninergica";
  if (/qt|arritmia/.test(titulo)) return "qt";
  if (/opioide|benzodiacepina|gabapentinoide|depresor|alcohol|sedacion/.test(titulo)) return "depresora_snc";
  if (/sangrado|hemorrag|aine|anticoagul/.test(titulo)) return "hemorragica";
  if (/litio/.test(titulo)) return "renal_electrolitica";
  if (/sraa|ieca|ara|potasio/.test(titulo)) return "renal_electrolitica";
  return "medicamento-medicamento";
}

export function resumirAnalisisPublico(alertas = []) {
  return {
    resultCount: alertas.length,
    highSeverityCount: alertas.filter((alerta) => ["contraindicada", "alta"].includes(alerta.severidad)).length
  };
}
