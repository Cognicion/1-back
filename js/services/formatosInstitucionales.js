import { db } from "../firebase.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const FORMATOS_INSTITUCIONALES = [
  {
    id: "fray",
    nombre: "Hospital Psiquiatrico Fray Bernardino Alvarez",
    descripcion: "Formatos institucionales Fray: notas de Observacion, interconsulta e indicaciones.",
    requiereAutorizacion: true,
    valores: [
      "fray",
      "fray_observacion_ingreso",
      "fray_observacion_evolucion",
      "fray_observacion_envio_piso"
    ]
  }
];

export function grupoFormatoInstitucional(valor = "", etiqueta = "") {
  const texto = `${valor} ${etiqueta}`.toLowerCase();
  if (texto.includes("fray") || texto.includes("fray_observacion")) return "fray";
  return "";
}

export function permisosFormatosDesdeUsuario(usuario = {}) {
  const permisos = {
    ...(usuario.permisosFormatos || {}),
    ...(usuario.formatosAutorizados || {})
  };

  if (usuario.rol === "admin") {
    return {
      ...permisos,
      fray: true,
      todos: true
    };
  }

  return permisos;
}

export async function obtenerPermisosFormatosUsuario(uid, usuarioPrecargado = null) {
  if (usuarioPrecargado) return permisosFormatosDesdeUsuario(usuarioPrecargado);
  if (!uid) return {};

  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return {};
  return permisosFormatosDesdeUsuario({
    id: snap.id,
    ...snap.data()
  });
}

export function usuarioPuedeUsarFormato(valor = "", permisos = {}, rol = "") {
  const grupo = grupoFormatoInstitucional(valor);
  if (!grupo) return true;
  if (rol === "admin" || permisos.todos === true) return true;
  return permisos[grupo] === true;
}

export function aplicarPermisosFormatosSelect(select, permisos = {}, opciones = {}) {
  if (!select) return;

  const rol = opciones.rol || "";
  const fallback = opciones.fallback || "cognicion";
  const fallbackLabel = opciones.fallbackLabel || "Cognicion";
  const existeFallback = Array.from(select.options).some((option) => option.value === fallback);

  if (!existeFallback) {
    const option = document.createElement("option");
    option.value = fallback;
    option.textContent = fallbackLabel;
    select.prepend(option);
  }

  Array.from(select.options).forEach((option) => {
    const grupo = grupoFormatoInstitucional(option.value, option.textContent);
    const permitido = !grupo || usuarioPuedeUsarFormato(option.value, permisos, rol);
    option.hidden = !permitido;
    option.disabled = !permitido;
    option.dataset.formatoInstitucional = grupo;
  });

  if (!usuarioPuedeUsarFormato(select.value, permisos, rol)) {
    select.value = fallback;
  }
}

export function aplicarPermisosFormatosPagina(selectores = [], permisos = {}, opciones = {}) {
  selectores.forEach((config) => {
    const datos = Array.isArray(config)
      ? { selector: config[0], fallback: config[1], fallbackLabel: config[2] }
      : config;
    const select = typeof datos.selector === "string"
      ? document.querySelector(datos.selector)
      : datos.selector;

    aplicarPermisosFormatosSelect(select, permisos, {
      ...opciones,
      fallback: datos.fallback || opciones.fallback,
      fallbackLabel: datos.fallbackLabel || opciones.fallbackLabel
    });
  });
}
