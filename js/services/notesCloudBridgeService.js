import { auth, db } from "../firebase.js";
import {
  collection,
  getDocs,
  limit as limitarConsulta,
  orderBy,
  query,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  construirIndiceCarpetasApuntes,
  proyectarCarpetaApuntesParaMiNube
} from "../notes-cloud-projection-core.js?v=20260822-mi-nube-v2-090";

export const NOTES_CLOUD_BRIDGE_MAX_LIMIT = 100;

function crearErrorPuente(code, message) {
  const error = new Error(message);
  error.name = "NotesCloudBridgeError";
  error.code = code;
  return error;
}

function normalizarLimite(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 50;
  return Math.min(NOTES_CLOUD_BRIDGE_MAX_LIMIT, Math.max(1, Math.trunc(numero)));
}

function normalizarRutaInterna(ruta, fallback) {
  const valor = String(ruta || "").trim();
  if (!valor || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(valor) || valor.includes("\\")) return fallback;
  return valor;
}

function decodificarEntidadesBasicas(texto = "") {
  const entidades = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#039;": "'",
    "&#39;": "'"
  };
  return String(texto).replace(/&(nbsp|amp|lt|gt|quot|#0?39);/gi, (entidad) => entidades[entidad.toLowerCase()] || entidad);
}

function extraerTextoPlanoApunte(contenido = "") {
  return decodificarEntidadesBasicas(
    String(contenido || "")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function obtenerDatosDocumento(documento) {
  if (typeof documento?.data === "function") return documento.data() || {};
  return documento && typeof documento === "object" ? documento : {};
}

function obtenerIdDocumento(documento, datos) {
  return String(documento?.id || datos?.id || "").trim();
}

function construirUrl(baseUrl, parametros) {
  const base = normalizarRutaInterna(baseUrl, "apuntes.html");
  const separador = base.includes("?") ? "&" : "?";
  return `${base}${separador}${new URLSearchParams(parametros).toString()}`;
}

export function crearUrlEditorApunte(apunteId, {
  baseUrl = "apuntes.html",
  origin = "mi-nube",
  returnTo = "mi-nube.html"
} = {}) {
  const id = String(apunteId || "").trim();
  if (!id) throw crearErrorPuente("notes-cloud/note-id-required", "Se necesita un apunte para abrir el editor.");
  return construirUrl(baseUrl, {
    apunte: id,
    origen: String(origin || "mi-nube"),
    volver: normalizarRutaInterna(returnTo, "mi-nube.html")
  });
}

export function crearUrlNuevoApunte({
  baseUrl = "apuntes.html",
  origin = "mi-nube",
  returnTo = "mi-nube.html"
} = {}) {
  return construirUrl(baseUrl, {
    nuevo: "1",
    origen: String(origin || "mi-nube"),
    volver: normalizarRutaInterna(returnTo, "mi-nube.html")
  });
}

export function proyectarApunteParaMiNube(documento, {
  ownerId = "",
  editorBaseUrl = "apuntes.html",
  returnTo = "mi-nube.html"
} = {}) {
  const datos = obtenerDatosDocumento(documento);
  const id = obtenerIdDocumento(documento, datos);
  if (!id) throw crearErrorPuente("notes-cloud/note-id-required", "El apunte no tiene un identificador válido.");

  const titulo = String(datos.titulo || "").replace(/\s+/g, " ").trim() || "Sin título";
  const textoPlano = extraerTextoPlanoApunte(datos.contenido || datos.texto || "");
  const carpetaApuntesId = String(datos.carpetaId ?? "").trim() || null;

  return Object.freeze({
    id,
    ownerId: String(ownerId || ""),
    sourceType: "note",
    type: "note",
    name: titulo,
    originalName: titulo,
    extension: "",
    mimeType: "application/x-cognicion-note",
    sizeBytes: 0,
    quotaBytes: 0,
    countsTowardCloudQuota: false,
    parentFolderId: null,
    noteFolderId: carpetaApuntesId,
    createdAt: datos.fechaCreacion || null,
    updatedAt: datos.fechaActualizacion || datos.fechaCreacion || null,
    deleted: false,
    preview: textoPlano.slice(0, 180),
    searchText: `${titulo} ${textoPlano.slice(0, 5000)}`.trim(),
    editorUrl: crearUrlEditorApunte(id, { baseUrl: editorBaseUrl, returnTo })
  });
}

function validarSesionPropietaria(uid, authInstance) {
  const ownerId = String(uid || "").trim();
  if (!ownerId) throw crearErrorPuente("notes-cloud/auth-required", "Inicia sesión para consultar Mis apuntes.");
  if (!authInstance?.currentUser || authInstance.currentUser.uid !== ownerId) {
    throw crearErrorPuente("notes-cloud/owner-mismatch", "La sesión no permite consultar estos apuntes.");
  }
  return ownerId;
}

export async function cargarProyeccionApuntesParaMiNube(uid, {
  dbInstance = db,
  authInstance = auth,
  editorBaseUrl = "apuntes.html",
  returnTo = "mi-nube.html"
} = {}) {
  const ownerId = validarSesionPropietaria(uid, authInstance);
  const apuntesRef = collection(dbInstance, "usuarios", ownerId, "apuntesMedico");
  const carpetasRef = collection(dbInstance, "usuarios", ownerId, "carpetasApuntes");
  const [apuntesSnapshot, carpetasSnapshot] = await Promise.all([
    getDocs(query(apuntesRef, orderBy("fechaActualizacion", "desc"))),
    getDocs(carpetasRef)
  ]);
  const apuntes = apuntesSnapshot.docs.map((documento) => proyectarApunteParaMiNube(documento, {
    ownerId,
    editorBaseUrl,
    returnTo
  }));
  const carpetas = carpetasSnapshot.docs
    .map((documento) => proyectarCarpetaApuntesParaMiNube(documento, { ownerId }))
    .filter(Boolean);
  return construirIndiceCarpetasApuntes({ carpetas, apuntes });
}

export async function listarPaginaApuntesParaMiNube(uid, {
  limite = 50,
  cursor = null,
  dbInstance = db,
  authInstance = auth,
  editorBaseUrl = "apuntes.html",
  returnTo = "mi-nube.html"
} = {}) {
  const ownerId = validarSesionPropietaria(uid, authInstance);

  const referencia = collection(dbInstance, "usuarios", ownerId, "apuntesMedico");
  const limitePagina = normalizarLimite(limite);
  const restricciones = [
    orderBy("fechaActualizacion", "desc")
  ];
  if (cursor) restricciones.push(startAfter(cursor));
  restricciones.push(limitarConsulta(limitePagina + 1));
  const consulta = query(
    referencia,
    ...restricciones
  );
  const snapshot = await getDocs(consulta);
  const hasMore = snapshot.docs.length > limitePagina;
  const documentos = hasMore ? snapshot.docs.slice(0, limitePagina) : snapshot.docs;
  return {
    items: documentos.map((documento) => proyectarApunteParaMiNube(documento, {
      ownerId,
      editorBaseUrl,
      returnTo
    })),
    cursor: documentos.at(-1) || null,
    hasMore
  };
}

export async function listarApuntesParaMiNube(uid, options = {}) {
  const page = await listarPaginaApuntesParaMiNube(uid, options);
  return page.items;
}
