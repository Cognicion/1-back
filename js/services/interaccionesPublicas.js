import { buscarMedicamentos, normalizarNombreMedicamento } from "../data/medicamentos.js";
import {
  evaluarInteraccionesClinicas,
  normalizarMedicamentoClinico
} from "./motorClinicoMedicamentos.js";

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
    nombre: medicamento.nombre,
    genericName: medicamento.genericName || medicamento.nombre,
    presentacion: presentacion?.texto || "",
    via: presentacion?.via || "",
    medicamento: medicamento.nombre
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
  return alertas.map((alerta) => ({
    ...alerta,
    severidad: SEVERIDAD_PUBLICA[alerta.severidad] || alerta.severidad,
    medicamentos: (alerta.medicamentos || []).map((nombre) => String(nombre).replace(/\s*\([^)]*\)/g, "").trim()),
    efectoClinico: alerta.efecto || "",
    categoria: alerta.categoria || alerta.tipoInteraccion || "medicamento-medicamento"
  }));
}

export function resumirAnalisisPublico(alertas = []) {
  return {
    resultCount: alertas.length,
    highSeverityCount: alertas.filter((alerta) => ["contraindicada", "alta"].includes(alerta.severidad)).length
  };
}
