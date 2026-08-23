export const MAX_STORAGE_BYTES = 250 * 1024 * 1024;

export const MIME_TYPES_POR_EXTENSION = Object.freeze({
  ".jpg": Object.freeze(["image/jpeg"]),
  ".jpeg": Object.freeze(["image/jpeg"]),
  ".png": Object.freeze(["image/png"]),
  ".webp": Object.freeze(["image/webp"]),
  ".gif": Object.freeze(["image/gif"]),
  ".pdf": Object.freeze(["application/pdf"]),
  ".txt": Object.freeze(["text/plain"]),
  ".md": Object.freeze(["text/markdown"])
});

export const EXTENSIONES_PERMITIDAS = Object.freeze(Object.keys(MIME_TYPES_POR_EXTENSION));
export const MIME_TYPES_PERMITIDOS = Object.freeze([
  ...new Set(Object.values(MIME_TYPES_POR_EXTENSION).flat())
]);

const MENSAJES_VALIDACION = Object.freeze({
  "cloud-file/missing": "Selecciona un archivo.",
  "cloud-file/name-required": "El archivo debe tener un nombre.",
  "cloud-file/extension-required": "El archivo debe tener una extensión permitida.",
  "cloud-file/extension-not-allowed": "La extensión del archivo no está permitida en Mi nube.",
  "cloud-file/mime-required": "No se pudo identificar el tipo del archivo.",
  "cloud-file/mime-not-allowed": "El tipo de archivo no está permitido en Mi nube.",
  "cloud-file/extension-mime-mismatch": "La extensión y el tipo del archivo no coinciden.",
  "cloud-file/empty": "El archivo está vacío.",
  "cloud-file/invalid-size": "No se pudo validar el tamaño del archivo.",
  "cloud-file/too-large": "El archivo supera el espacio máximo disponible en Mi nube."
});

const FILTROS_NORMALIZADOS = Object.freeze({
  all: "all",
  todos: "all",
  files: "files",
  archivos: "files",
  images: "images",
  imagenes: "images",
  image: "images",
  pdf: "pdf",
  text: "text",
  texto: "text",
  notes: "notes",
  note: "notes",
  apuntes: "notes",
  "mis-apuntes": "notes",
  trash: "trash",
  papelera: "trash"
});

const ORDENES_NORMALIZADOS = Object.freeze({
  recent: "updated-desc",
  recientes: "updated-desc",
  "mas-recientes": "updated-desc",
  "updated-desc": "updated-desc",
  "updated-asc": "updated-asc",
  "name-asc": "name-asc",
  "nombre-az": "name-asc",
  "nombre-a-z": "name-asc",
  "name-desc": "name-desc",
  "nombre-za": "name-desc",
  "nombre-z-a": "name-desc",
  "size-desc": "size-desc",
  "mayor-tamano": "size-desc",
  "size-asc": "size-asc",
  "menor-tamano": "size-asc"
});

export class MiNubeValidationError extends Error {
  constructor(code, message = MENSAJES_VALIDACION[code] || "El archivo no es válido.", details = {}) {
    super(message);
    this.name = "MiNubeValidationError";
    this.code = code;
    this.details = details;
  }
}

export class MiNubeHierarchyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MiNubeHierarchyError";
    this.code = code;
    this.details = details;
  }
}

function numeroNoNegativo(valor, fallback = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : fallback;
}

function enteroNoNegativo(valor, fallback = 0) {
  return Math.trunc(numeroNoNegativo(valor, fallback));
}

function cortarPorPuntosDeCodigo(valor, maximo) {
  const caracteres = Array.from(String(valor || ""));
  return caracteres.length > maximo ? caracteres.slice(0, maximo).join("") : caracteres.join("");
}

function nombreVisibleElemento(elemento = {}) {
  return String(
    elemento.name
    || elemento.nombre
    || elemento.title
    || elemento.titulo
    || elemento.originalName
    || elemento.id
    || ""
  ).trim();
}

function parentFolderIdDe(elemento = {}) {
  const valor = elemento.parentFolderId ?? elemento.carpetaPadreId ?? null;
  return valor === "" || valor === undefined ? null : valor;
}

function idElemento(elemento = {}) {
  return String(elemento.id ?? elemento.fileId ?? elemento.noteId ?? "").trim();
}

function esCarpeta(elemento = {}) {
  return esCarpetaApuntes(elemento)
    || String(elemento.type || elemento.tipo || "").toLowerCase() === "folder";
}

function esCarpetaApuntes(elemento = {}) {
  return String(elemento.sourceType || "").toLowerCase() === "notefolder";
}

function esApunte(elemento = {}) {
  return String(elemento.sourceType || "").toLowerCase() === "note"
    || String(elemento.type || elemento.tipo || "").toLowerCase() === "note";
}

export function normalizarMimeType(valor = "") {
  return String(valor || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export function obtenerExtensionArchivo(nombre = "") {
  const ultimoSegmento = String(nombre || "").replace(/\\/g, "/").split("/").pop() || "";
  const indice = ultimoSegmento.lastIndexOf(".");
  if (indice <= 0 || indice === ultimoSegmento.length - 1) return "";
  const extension = ultimoSegmento.slice(indice).normalize("NFKC").toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : "";
}

export function normalizarNombreArchivoSeguro(nombre = "", { maxLength = 180, fallback = "archivo" } = {}) {
  const limite = Math.max(16, enteroNoNegativo(maxLength, 180));
  const ultimoSegmento = String(nombre || "").replace(/\\/g, "/").split("/").pop() || "";
  let limpio = ultimoSegmento
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .trim();

  if (!limpio || limpio === "." || limpio === "..") limpio = String(fallback || "archivo").trim() || "archivo";
  if (Array.from(limpio).length <= limite) return limpio;

  const extension = obtenerExtensionArchivo(limpio);
  const base = extension ? limpio.slice(0, -extension.length) : limpio;
  const espacioBase = Math.max(1, limite - Array.from(extension).length);
  const baseCortada = cortarPorPuntosDeCodigo(base, espacioBase).replace(/[\s.]+$/g, "") || "archivo";
  return `${baseCortada}${extension}`;
}

export function normalizarNombreCarpetaSeguro(nombre = "", { maxLength = 80, fallback = "Nueva carpeta" } = {}) {
  const limite = Math.max(8, enteroNoNegativo(maxLength, 80));
  let limpio = String(nombre || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .trim();
  if (!limpio || limpio === "." || limpio === "..") limpio = String(fallback || "Nueva carpeta").trim() || "Nueva carpeta";
  return cortarPorPuntosDeCodigo(limpio, limite).replace(/[\s.]+$/g, "") || "Nueva carpeta";
}

export function normalizarTextoBusqueda(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function clasificarElementoMiNube(elemento = {}) {
  if (esCarpetaApuntes(elemento)) return "note-folder";
  if (esCarpeta(elemento)) return "folder";
  if (esApunte(elemento)) return "note";

  const mimeType = normalizarMimeType(elemento.mimeType || elemento.typeMime || "");
  const extension = String(elemento.extension || obtenerExtensionArchivo(elemento.originalName || elemento.name || "")).toLowerCase();
  if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) return "image";
  if (mimeType === "application/pdf" || extension === ".pdf") return "pdf";
  if (["text/plain", "text/markdown"].includes(mimeType) || [".txt", ".md"].includes(extension)) return "text";
  return "file";
}

export function validarArchivoMiNube(archivo, { maxFileBytes = MAX_STORAGE_BYTES } = {}) {
  if (!archivo || typeof archivo !== "object") {
    throw new MiNubeValidationError("cloud-file/missing");
  }

  const originalName = String(archivo.name || "").trim();
  if (!originalName) throw new MiNubeValidationError("cloud-file/name-required");

  const extension = obtenerExtensionArchivo(originalName);
  if (!extension) throw new MiNubeValidationError("cloud-file/extension-required", undefined, { originalName });
  if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
    throw new MiNubeValidationError("cloud-file/extension-not-allowed", undefined, { extension });
  }

  const mimeType = normalizarMimeType(archivo.type);
  if (!mimeType) throw new MiNubeValidationError("cloud-file/mime-required", undefined, { extension });
  if (!MIME_TYPES_PERMITIDOS.includes(mimeType)) {
    throw new MiNubeValidationError("cloud-file/mime-not-allowed", undefined, { mimeType, extension });
  }
  if (!MIME_TYPES_POR_EXTENSION[extension].includes(mimeType)) {
    throw new MiNubeValidationError("cloud-file/extension-mime-mismatch", undefined, { mimeType, extension });
  }

  const sizeBytes = Number(archivo.size);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || !Number.isInteger(sizeBytes)) {
    throw new MiNubeValidationError("cloud-file/invalid-size", undefined, { sizeBytes: archivo.size });
  }
  if (sizeBytes === 0) throw new MiNubeValidationError("cloud-file/empty");

  const limite = enteroNoNegativo(maxFileBytes, MAX_STORAGE_BYTES) || MAX_STORAGE_BYTES;
  if (sizeBytes > limite) {
    throw new MiNubeValidationError("cloud-file/too-large", undefined, { sizeBytes, maxFileBytes: limite });
  }

  const name = normalizarNombreArchivoSeguro(originalName);
  return Object.freeze({
    valid: true,
    name,
    originalName,
    extension,
    mimeType,
    sizeBytes,
    category: clasificarElementoMiNube({ name, extension, mimeType, type: "file" })
  });
}

export function evaluarArchivoMiNube(archivo, opciones = {}) {
  try {
    return validarArchivoMiNube(archivo, opciones);
  } catch (error) {
    if (!(error instanceof MiNubeValidationError)) throw error;
    return Object.freeze({
      valid: false,
      code: error.code,
      message: error.message,
      details: Object.freeze({ ...error.details })
    });
  }
}

export function formatearBytes(bytes, { decimals = 1 } = {}) {
  const cantidad = numeroNoNegativo(bytes, 0);
  if (cantidad === 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  const indice = Math.min(Math.floor(Math.log(cantidad) / Math.log(1024)), unidades.length - 1);
  const precision = indice === 0 ? 0 : Math.min(3, enteroNoNegativo(decimals, 1));
  const factor = 10 ** precision;
  const valor = Math.round((cantidad / (1024 ** indice)) * factor) / factor;
  return `${valor} ${unidades[indice]}`;
}

export function calcularBytesFaltantes(usedBytes, newFileBytes, maxBytes = MAX_STORAGE_BYTES, reservedBytes = 0) {
  const usados = enteroNoNegativo(usedBytes);
  const nuevos = enteroNoNegativo(newFileBytes);
  const reservados = enteroNoNegativo(reservedBytes);
  const maximo = enteroNoNegativo(maxBytes, MAX_STORAGE_BYTES) || MAX_STORAGE_BYTES;
  return Math.max(0, (usados + reservados + nuevos) - maximo);
}

export function calcularEstadoCuotaMiNube({
  usedBytes = 0,
  reservedBytes = 0,
  newFileBytes = 0,
  maxBytes = MAX_STORAGE_BYTES
} = {}) {
  const usados = enteroNoNegativo(usedBytes);
  const reservados = enteroNoNegativo(reservedBytes);
  const nuevos = enteroNoNegativo(newFileBytes);
  const maximo = enteroNoNegativo(maxBytes, MAX_STORAGE_BYTES) || MAX_STORAGE_BYTES;
  const ocupados = usados + reservados;
  const disponibles = Math.max(0, maximo - ocupados);
  const faltantes = calcularBytesFaltantes(usados, nuevos, maximo, reservados);
  const limitarPorcentaje = (valor) => Math.min(100, Math.max(0, Math.round(valor * 10) / 10));

  return Object.freeze({
    usedBytes: usados,
    reservedBytes: reservados,
    occupiedBytes: ocupados,
    availableBytes: disponibles,
    newFileBytes: nuevos,
    maxBytes: maximo,
    missingBytes: faltantes,
    canUpload: faltantes === 0,
    percentUsed: limitarPorcentaje(maximo ? (ocupados / maximo) * 100 : 100),
    percentCommitted: limitarPorcentaje(maximo ? (usados / maximo) * 100 : 100)
  });
}

function indexarCarpetas(carpetas = []) {
  const indice = new Map();
  for (const carpeta of Array.isArray(carpetas) ? carpetas : []) {
    if (!esCarpeta(carpeta) && carpeta?.type !== undefined) continue;
    const id = idElemento(carpeta);
    if (!id || indice.has(id)) continue;
    indice.set(id, carpeta);
  }
  return indice;
}

function cicloCanonico(ids = []) {
  if (!ids.length) return [];
  const rotaciones = ids.map((_, indice) => [...ids.slice(indice), ...ids.slice(0, indice)]);
  rotaciones.sort((a, b) => a.join("\u0000").localeCompare(b.join("\u0000")));
  return rotaciones[0];
}

export function detectarCiclosCarpetas(carpetas = []) {
  const indice = indexarCarpetas(carpetas);
  const ciclos = new Map();

  for (const idInicial of indice.keys()) {
    const recorrido = [];
    const posicion = new Map();
    let idActual = idInicial;

    while (idActual && indice.has(idActual)) {
      if (posicion.has(idActual)) {
        const ciclo = cicloCanonico(recorrido.slice(posicion.get(idActual)));
        ciclos.set(ciclo.join("\u0000"), ciclo);
        break;
      }
      posicion.set(idActual, recorrido.length);
      recorrido.push(idActual);
      idActual = String(parentFolderIdDe(indice.get(idActual)) || "");
    }
  }

  return [...ciclos.values()];
}

export function obtenerIdsDescendientes(carpetas = [], carpetaId = "") {
  const raizId = String(carpetaId || "").trim();
  if (!raizId) return [];
  const hijosPorPadre = new Map();

  for (const carpeta of Array.isArray(carpetas) ? carpetas : []) {
    const id = idElemento(carpeta);
    const padre = String(parentFolderIdDe(carpeta) || "");
    if (!id || !padre) continue;
    if (!hijosPorPadre.has(padre)) hijosPorPadre.set(padre, []);
    hijosPorPadre.get(padre).push(id);
  }

  const visitados = new Set([raizId]);
  const pendientes = [...(hijosPorPadre.get(raizId) || [])];
  const descendientes = [];
  while (pendientes.length) {
    const id = pendientes.shift();
    if (!id || visitados.has(id)) continue;
    visitados.add(id);
    descendientes.push(id);
    pendientes.push(...(hijosPorPadre.get(id) || []));
  }
  return descendientes;
}

export function validarMovimientoCarpeta({ carpetaId, nuevoPadreId = null, carpetas = [] } = {}) {
  const id = String(carpetaId || "").trim();
  const padreId = nuevoPadreId === null || nuevoPadreId === undefined || nuevoPadreId === ""
    ? null
    : String(nuevoPadreId).trim();
  const indice = indexarCarpetas(carpetas);

  if (!id || !indice.has(id)) return Object.freeze({ valid: false, code: "cloud-folder/not-found" });
  if (padreId === null) return Object.freeze({ valid: true, code: "ok" });
  if (padreId === id) return Object.freeze({ valid: false, code: "cloud-folder/self-parent" });
  if (!indice.has(padreId)) return Object.freeze({ valid: false, code: "cloud-folder/parent-not-found" });

  const visitados = new Set();
  let actual = padreId;
  while (actual) {
    if (actual === id) return Object.freeze({ valid: false, code: "cloud-folder/descendant-parent" });
    if (visitados.has(actual)) return Object.freeze({ valid: false, code: "cloud-folder/existing-cycle" });
    visitados.add(actual);
    const carpeta = indice.get(actual);
    if (!carpeta) break;
    actual = String(parentFolderIdDe(carpeta) || "");
  }
  return Object.freeze({ valid: true, code: "ok" });
}

export function creariaCicloCarpetas(parametros = {}) {
  return !validarMovimientoCarpeta(parametros).valid;
}

export function construirBreadcrumbs(carpetas = [], carpetaActualId = null, { rootLabel = "Mi nube" } = {}) {
  const raiz = Object.freeze({ id: null, name: String(rootLabel || "Mi nube"), type: "root" });
  if (carpetaActualId === null || carpetaActualId === undefined || carpetaActualId === "") return [raiz];

  const indice = indexarCarpetas(carpetas);
  const visitados = new Set();
  const rutaInvertida = [];
  let actual = String(carpetaActualId);

  while (actual) {
    if (visitados.has(actual)) {
      throw new MiNubeHierarchyError(
        "cloud-folder/hierarchy-cycle",
        "La jerarquía de carpetas contiene un ciclo.",
        { folderId: actual }
      );
    }
    visitados.add(actual);
    const carpeta = indice.get(actual);
    if (!carpeta) {
      throw new MiNubeHierarchyError(
        "cloud-folder/not-found",
        "No se encontró una carpeta de la ruta.",
        { folderId: actual }
      );
    }
    rutaInvertida.push(Object.freeze({
      id: actual,
      name: nombreVisibleElemento(carpeta) || "Carpeta",
      type: "folder"
    }));
    actual = String(parentFolderIdDe(carpeta) || "");
  }

  return [raiz, ...rutaInvertida.reverse()];
}

function cumpleFiltroTipo(elemento, filtro) {
  const categoria = clasificarElementoMiNube(elemento);
  if (filtro === "all") return true;
  if (filtro === "trash") return elemento.deleted === true;
  if (filtro === "files") return !esApunte(elemento);
  if (filtro === "images") return categoria === "image";
  if (filtro === "pdf") return categoria === "pdf";
  if (filtro === "text") return categoria === "text";
  if (filtro === "notes") return ["note", "note-folder"].includes(categoria);
  return true;
}

function textoBusquedaElemento(elemento = {}) {
  return normalizarTextoBusqueda([
    nombreVisibleElemento(elemento),
    elemento.originalName,
    elemento.extension,
    elemento.mimeType,
    elemento.sourceType,
    elemento.preview,
    elemento.searchText
  ].filter(Boolean).join(" "));
}

export function filtrarElementosMiNube(elementos = [], {
  query = "",
  filter = "all",
  parentFolderId,
  deleted = false,
  includeFolders = true
} = {}) {
  const termino = normalizarTextoBusqueda(query);
  const filtroSolicitado = normalizarTextoBusqueda(filter).replace(/\s+/g, "-");
  const filtro = FILTROS_NORMALIZADOS[filtroSolicitado] || "all";
  const filtrarPadre = parentFolderId !== undefined;
  const padreEsperado = parentFolderId === null || parentFolderId === "" ? null : parentFolderId;

  return (Array.isArray(elementos) ? elementos : []).filter((elemento) => {
    if (filtro !== "trash") {
      if (deleted !== "all" && Boolean(elemento?.deleted) !== Boolean(deleted)) return false;
    } else if (elemento?.deleted !== true) {
      return false;
    }
    if (filtrarPadre && parentFolderIdDe(elemento) !== padreEsperado) return false;
    if (termino && !textoBusquedaElemento(elemento).includes(termino)) return false;
    if (esCarpeta(elemento)) {
      if (esCarpetaApuntes(elemento)) {
        return includeFolders && ["all", "notes"].includes(filtro);
      }
      if (includeFolders && ["all", "files"].includes(filtro)) return true;
      if (filtro !== "trash") return false;
    }
    return cumpleFiltroTipo(elemento, filtro);
  });
}

function milisegundosMarcaTiempo(valor) {
  if (!valor) return 0;
  if (typeof valor?.toMillis === "function") return numeroNoNegativo(valor.toMillis(), 0);
  if (Number.isFinite(valor?.seconds)) {
    return (Number(valor.seconds) * 1000) + Math.floor(numeroNoNegativo(valor.nanoseconds, 0) / 1e6);
  }
  if (valor instanceof Date) return numeroNoNegativo(valor.getTime(), 0);
  const numero = Number(valor);
  if (Number.isFinite(numero)) return numero;
  const fecha = Date.parse(String(valor));
  return Number.isFinite(fecha) ? fecha : 0;
}

function compararTexto(a, b) {
  return normalizarTextoBusqueda(a).localeCompare(normalizarTextoBusqueda(b), "es", {
    numeric: true,
    sensitivity: "base"
  });
}

export function ordenarElementosMiNube(elementos = [], order = "updated-desc", { foldersFirst = true } = {}) {
  const ordenSolicitado = normalizarTextoBusqueda(order).replace(/\s+/g, "-");
  const orden = ORDENES_NORMALIZADOS[ordenSolicitado] || "updated-desc";

  return (Array.isArray(elementos) ? elementos : [])
    .map((elemento, indice) => ({ elemento, indice }))
    .sort((a, b) => {
      if (foldersFirst && esCarpeta(a.elemento) !== esCarpeta(b.elemento)) return esCarpeta(a.elemento) ? -1 : 1;
      let comparacion = 0;
      if (orden === "name-asc" || orden === "name-desc") {
        comparacion = compararTexto(nombreVisibleElemento(a.elemento), nombreVisibleElemento(b.elemento));
        if (orden === "name-desc") comparacion *= -1;
      } else if (orden === "size-asc" || orden === "size-desc") {
        comparacion = enteroNoNegativo(a.elemento?.sizeBytes) - enteroNoNegativo(b.elemento?.sizeBytes);
        if (orden === "size-desc") comparacion *= -1;
      } else {
        const fechaA = milisegundosMarcaTiempo(a.elemento?.updatedAt || a.elemento?.fechaActualizacion || a.elemento?.createdAt);
        const fechaB = milisegundosMarcaTiempo(b.elemento?.updatedAt || b.elemento?.fechaActualizacion || b.elemento?.createdAt);
        comparacion = fechaA - fechaB;
        if (orden === "updated-desc") comparacion *= -1;
      }
      if (comparacion !== 0) return comparacion;
      const porNombre = compararTexto(nombreVisibleElemento(a.elemento), nombreVisibleElemento(b.elemento));
      return porNombre || compararTexto(idElemento(a.elemento), idElemento(b.elemento)) || (a.indice - b.indice);
    })
    .map(({ elemento }) => elemento);
}

export function escaparHtml(valor = "") {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function urlMarkdownSegura(valor = "") {
  const url = String(valor || "").trim();
  if (!/^(https?:|mailto:)/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function renderizarMarkdownEnLinea(texto = "") {
  const protegidos = [];
  const proteger = (html) => `\uE000${protegidos.push(html) - 1}\uE001`;
  let trabajo = String(texto || "").replace(/[\u0000\uE000\uE001]/g, "");

  trabajo = trabajo.replace(/`([^`\n]+)`/g, (_, codigo) => proteger(`<code>${escaparHtml(codigo)}</code>`));
  trabajo = trabajo.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (coincidencia, etiqueta, url) => {
    if (!urlMarkdownSegura(url)) return `${etiqueta} (${url})`;
    const href = escaparHtml(url);
    return proteger(`<a href="${href}" target="_blank" rel="noopener noreferrer">${escaparHtml(etiqueta)}</a>`);
  });

  trabajo = escaparHtml(trabajo);
  trabajo = trabajo
    .replace(/\*\*(?=\S)(.+?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)(.+?\S)__/g, "<strong>$1</strong>")
    .replace(/~~(?=\S)(.+?\S)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*(?=\S)(.+?\S)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_(?=\S)(.+?\S)_(?!_)/g, "$1<em>$2</em>");

  return trabajo.replace(/\uE000(\d+)\uE001/g, (_, indice) => protegidos[Number(indice)] || "");
}

function esInicioBloqueMarkdown(linea = "") {
  return /^\s*(?:```|#{1,6}\s+|[-*_]\s*[-*_]\s*[-*_](?:\s*[-*_])*\s*$|>\s?|[-+*]\s+|\d+[.)]\s+)/.test(linea);
}

export function renderizarMarkdownSeguro(markdown = "") {
  const lineas = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const salida = [];
  let indice = 0;

  while (indice < lineas.length) {
    const linea = lineas[indice];
    if (!linea.trim()) {
      indice += 1;
      continue;
    }

    const inicioCodigo = linea.match(/^\s*```\s*([a-z0-9_-]{0,30})\s*$/i);
    if (inicioCodigo) {
      const lenguaje = inicioCodigo[1] ? ` class="language-${inicioCodigo[1].toLowerCase()}"` : "";
      const codigo = [];
      indice += 1;
      while (indice < lineas.length && !/^\s*```\s*$/.test(lineas[indice])) {
        codigo.push(lineas[indice]);
        indice += 1;
      }
      if (indice < lineas.length) indice += 1;
      salida.push(`<pre><code${lenguaje}>${escaparHtml(codigo.join("\n"))}</code></pre>`);
      continue;
    }

    const encabezado = linea.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (encabezado) {
      const nivel = encabezado[1].length;
      salida.push(`<h${nivel}>${renderizarMarkdownEnLinea(encabezado[2])}</h${nivel}>`);
      indice += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(linea)) {
      salida.push("<hr>");
      indice += 1;
      continue;
    }

    if (/^\s*>/.test(linea)) {
      const citas = [];
      while (indice < lineas.length && /^\s*>/.test(lineas[indice])) {
        citas.push(lineas[indice].replace(/^\s*>\s?/, ""));
        indice += 1;
      }
      salida.push(`<blockquote>${citas.map(renderizarMarkdownEnLinea).join("<br>")}</blockquote>`);
      continue;
    }

    const listaNoOrdenada = linea.match(/^\s*[-+*]\s+(.+)$/);
    if (listaNoOrdenada) {
      const items = [];
      while (indice < lineas.length) {
        const item = lineas[indice].match(/^\s*[-+*]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${renderizarMarkdownEnLinea(item[1])}</li>`);
        indice += 1;
      }
      salida.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const listaOrdenada = linea.match(/^\s*\d+[.)]\s+(.+)$/);
    if (listaOrdenada) {
      const items = [];
      while (indice < lineas.length) {
        const item = lineas[indice].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${renderizarMarkdownEnLinea(item[1])}</li>`);
        indice += 1;
      }
      salida.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const parrafo = [linea.trim()];
    indice += 1;
    while (indice < lineas.length && lineas[indice].trim() && !esInicioBloqueMarkdown(lineas[indice])) {
      parrafo.push(lineas[indice].trim());
      indice += 1;
    }
    salida.push(`<p>${renderizarMarkdownEnLinea(parrafo.join(" "))}</p>`);
  }

  return salida.join("\n");
}
