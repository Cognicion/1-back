import { auth } from "../../firebase.js";
import { getAuthenticatedUserOnce, getUserProfileOnce } from "../../services/authContextService.js";
import { isAdministrator } from "../../utils/roles.js?v=20260719-admin-universal-modules";
import { validarArchivoDocx, calcularHashArchivo } from "./docxValidator.js";
import { extraerDocx } from "./docxExtractor.js";
import { extraerCamposClinicos } from "./clinicalFieldParser.js";
import { extraerSeccionesClinicas } from "./clinicalSectionParser.js";
import { sugerirTipoNota } from "./noteTypeDetector.js";
import { buscarPacientesCandidatos } from "./patientMatcher.js";
import { buscarImportacionDuplicada } from "./duplicateDetector.js";
import { guardarImportacionDocx } from "./docxImportPersistence.js";
import {
  abrirImportacionDocxUI,
  cerrarImportacionDocxUI,
  asegurarImportacionDocxUI,
  mostrarErrorDocx,
  mostrarDuplicadoDocx,
  actualizarProgresoDocx,
  renderizarPreviewDocx,
  leerCorreccionesDocx
} from "./docxImportUI.js";

let estado = {
  file: null,
  hash: "",
  resultado: null,
  duplicado: null,
  usuario: null,
  ultimoErrorTecnico: null
};

function reiniciarEstadoParcial() {
  estado = { ...estado, file: null, hash: "", resultado: null, duplicado: null, ultimoErrorTecnico: null };
  mostrarErrorDocx("");
  mostrarDuplicadoDocx(null);
  actualizarProgresoDocx(0, "Esperando archivo...");
  const preview = document.querySelector("[data-docx-preview]");
  if (preview) {
    preview.hidden = true;
    preview.innerHTML = "";
  }
}

function mostrarErrorImportacion(mensaje, error = null, etapa = "") {
  estado.ultimoErrorTecnico = error ? {
    module: "docx-import",
    stage: etapa,
    uid: estado.usuario?.uid || auth.currentUser?.uid || "",
    role: estado.usuario?.rol || "",
    errorCode: error?.code || error?.name || "",
    message: error?.message || String(error)
  } : null;
  const puedeVerDetalles = Boolean(estado.usuario?.esAdmin || localStorage.getItem("cognicion.debug.docxImport") === "1");
  mostrarErrorDocx(mensaje, puedeVerDetalles ? estado.ultimoErrorTecnico : null);
}

function construirResultado({ bloques, textoPlano, hash, duplicado }) {
  const campos = extraerCamposClinicos(bloques);
  const secciones = extraerSeccionesClinicas(bloques);
  const tipoNota = sugerirTipoNota({ textoPlano, secciones: secciones.secciones });
  return {
    hash,
    duplicado,
    estructura: bloques,
    textoPlano,
    campos: campos.campos,
    camposEncontrados: campos.encontrados,
    camposNoEncontrados: campos.noEncontrados,
    secciones: secciones.secciones,
    seccionesEncontradas: secciones.encontradas,
    tipoNota
  };
}

async function analizarArchivo(file) {
  reiniciarEstadoParcial();
  estado.file = file;

  const validacion = validarArchivoDocx(file);
  if (!validacion.valido) {
    mostrarErrorDocx(validacion.errores.join(" "));
    return;
  }

  actualizarProgresoDocx(10, "Validacion completada.");
  actualizarProgresoDocx(20, "Calculando hash...");
  const hash = await calcularHashArchivo(file);
  estado.hash = hash;

  actualizarProgresoDocx(30, "Verificando duplicados...");
  let duplicado = null;
  try {
    duplicado = await buscarImportacionDuplicada({ hash, usuarioUid: estado.usuario.uid, rol: estado.usuario.rol });
    estado.duplicado = duplicado;
    mostrarDuplicadoDocx(duplicado);
  } catch (error) {
    actualizarProgresoDocx(30, "Error durante la verificacion de duplicados");
    mostrarErrorImportacion(error.message || "No fue posible verificar duplicados.", error, "duplicate-check");
    return;
  }

  actualizarProgresoDocx(45, "Extrayendo DOCX...");
  const extraccion = await extraerDocx(file);

  actualizarProgresoDocx(65, "Detectando campos y secciones...");
  const resultado = construirResultado({ ...extraccion, hash, duplicado });
  estado.resultado = resultado;

  actualizarProgresoDocx(80, "Buscando pacientes candidatos...");
  const pacientes = await buscarPacientesCandidatos(estado.usuario.uid, resultado.campos);

  renderizarPreviewDocx({ resultado, pacientes });
  actualizarProgresoDocx(100, "Vista previa lista. Revisa y confirma.");
}

async function confirmarImportacion() {
  if (!estado.file || !estado.resultado) {
    mostrarErrorDocx("Selecciona y analiza un DOCX antes de confirmar.");
    return;
  }

  const correcciones = leerCorreccionesDocx();
  if (correcciones.modo === "existente" && !correcciones.pacienteIdSeleccionado) {
    mostrarErrorDocx("Selecciona el paciente existente al que se agregara la nota.");
    return;
  }
  if (estado.duplicado && !confirm("Este documento parece haber sido importado anteriormente. Deseas continuar de todos modos?")) {
    return;
  }

  actualizarProgresoDocx(35, "Guardando documento original...");
  const resultado = await guardarImportacionDocx({
    file: estado.file,
    hash: estado.hash,
    usuario: estado.usuario,
    campos: correcciones.campos,
    secciones: correcciones.secciones,
    tipoNota: estado.resultado.tipoNota,
    textoPlano: correcciones.textoPlano,
    estructura: estado.resultado.estructura,
    modo: correcciones.modo,
    pacienteIdSeleccionado: correcciones.pacienteIdSeleccionado
  });

  actualizarProgresoDocx(100, "Importacion guardada.");
  alert("Importacion guardada como borrador de nota clinica.");
  cerrarImportacionDocxUI();
  window.dispatchEvent(new CustomEvent("cognicion:docx-importado", { detail: resultado }));
}

function enlazarEventos() {
  const modal = asegurarImportacionDocxUI();
  const input = modal.querySelector("#archivoImportacionDocx");
  const dropzone = modal.querySelector("[data-docx-dropzone]");

  modal.querySelector("[data-docx-cerrar]")?.addEventListener("click", cerrarImportacionDocxUI);
  modal.querySelector("[data-docx-seleccionar]")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) analizarArchivo(file).catch((error) => mostrarErrorImportacion(error.message || String(error), error, "analysis"));
  });

  ["dragenter", "dragover"].forEach((evento) => {
    dropzone?.addEventListener(evento, (event) => {
      event.preventDefault();
      dropzone.classList.add("activo");
    });
  });
  ["dragleave", "drop"].forEach((evento) => {
    dropzone?.addEventListener(evento, (event) => {
      event.preventDefault();
      dropzone.classList.remove("activo");
    });
  });
  dropzone?.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) analizarArchivo(file).catch((error) => mostrarErrorImportacion(error.message || String(error), error, "analysis"));
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) cerrarImportacionDocxUI();
    if (event.target.closest("[data-docx-cancelar]")) cerrarImportacionDocxUI();
    if (event.target.closest("[data-docx-reintentar]") && estado.file) {
      analizarArchivo(estado.file).catch((error) => mostrarErrorImportacion(error.message || String(error), error, "retry"));
    }
    if (event.target.closest("[data-docx-confirmar]")) {
      confirmarImportacion().catch((error) => mostrarErrorImportacion(error.message || String(error), error, "save"));
    }
  });
}

export async function abrirImportadorDocx() {
  const user = await getAuthenticatedUserOnce();
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  const perfil = await getUserProfileOnce(user.uid);
  estado.usuario = {
    uid: user.uid,
    email: user.email || "",
    nombre: perfil?.nombre || perfil?.nombreCompleto || user.displayName || user.email || "",
    rol: perfil?.rol || "",
    esAdmin: isAdministrator(perfil)
  };
  asegurarImportacionDocxUI();
  abrirImportacionDocxUI();
}

export function inicializarImportacionDocxMedico() {
  enlazarEventos();
  return { abrir: abrirImportadorDocx };
}
