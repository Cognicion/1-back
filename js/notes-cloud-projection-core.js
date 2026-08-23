function datosDocumento(documento) {
  if (typeof documento?.data === "function") return documento.data() || {};
  return documento && typeof documento === "object" ? documento : {};
}

function idDocumento(documento, datos = datosDocumento(documento)) {
  return String(documento?.id || datos?.id || "").trim();
}

function idOpcional(valor) {
  const id = String(valor ?? "").trim();
  return id || null;
}

function nombreCarpeta(carpeta = {}) {
  return String(carpeta.name || carpeta.nombre || "").replace(/\s+/gu, " ").trim() || "Carpeta sin nombre";
}

function normalizarBusqueda(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function ordenarCarpetas(carpetas = []) {
  return [...carpetas].sort((a, b) => nombreCarpeta(a).localeCompare(nombreCarpeta(b), "es", {
    numeric: true,
    sensitivity: "base"
  }));
}

export function proyectarCarpetaApuntesParaMiNube(documento, { ownerId = "" } = {}) {
  const datos = datosDocumento(documento);
  const id = idDocumento(documento, datos);
  if (!id) return null;
  const name = nombreCarpeta(datos);
  const parentFolderId = idOpcional(datos.carpetaPadreId ?? datos.parentFolderId);
  return {
    id,
    ownerId: String(ownerId || ""),
    sourceType: "noteFolder",
    type: "folder",
    name,
    originalName: name,
    parentFolderId,
    noteParentFolderId: parentFolderId,
    createdAt: datos.fechaCreacion || null,
    updatedAt: datos.fechaActualizacion || datos.fechaCreacion || null,
    deleted: false,
    sizeBytes: 0,
    quotaBytes: 0,
    countsTowardCloudQuota: false
  };
}

export function construirIndiceCarpetasApuntes({ carpetas = [], apuntes = [] } = {}) {
  const carpetasBase = (Array.isArray(carpetas) ? carpetas : [])
    .map((carpeta) => carpeta?.sourceType === "noteFolder"
      ? {
          ...carpeta,
          id: idDocumento(carpeta),
          name: nombreCarpeta(carpeta),
          parentFolderId: idOpcional(carpeta.parentFolderId ?? carpeta.carpetaPadreId)
        }
      : proyectarCarpetaApuntesParaMiNube(carpeta))
    .filter((carpeta) => carpeta?.id);
  const carpetasInicialesPorId = new Map(carpetasBase.map((carpeta) => [carpeta.id, carpeta]));
  const parentById = new Map();
  let orphanFolders = 0;

  for (const carpeta of carpetasBase) {
    const parentId = idOpcional(carpeta.parentFolderId);
    if (parentId && !carpetasInicialesPorId.has(parentId)) {
      orphanFolders += 1;
      parentById.set(carpeta.id, null);
    } else {
      parentById.set(carpeta.id, parentId);
    }
  }

  const resolvedCycleNodes = new Set();
  const completed = new Set();
  for (const folderId of carpetasInicialesPorId.keys()) {
    if (completed.has(folderId)) continue;
    const path = [];
    const position = new Map();
    let current = folderId;
    while (current && !completed.has(current)) {
      if (position.has(current)) {
        const cycle = path.slice(position.get(current));
        cycle.forEach((id) => {
          parentById.set(id, null);
          resolvedCycleNodes.add(id);
        });
        break;
      }
      position.set(current, path.length);
      path.push(current);
      current = parentById.get(current);
    }
    path.forEach((id) => completed.add(id));
  }

  const folders = carpetasBase.map((carpeta) => ({
    ...carpeta,
    parentFolderId: parentById.get(carpeta.id) || null,
    noteParentFolderId: parentById.get(carpeta.id) || null
  }));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map([["", []]]);
  folders.forEach((folder) => {
    const key = folder.parentFolderId || "";
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(folder);
  });
  childrenByParent.forEach((children, key) => childrenByParent.set(key, ordenarCarpetas(children)));

  const notes = [];
  const notesByFolder = new Map([["", []]]);
  let orphanNotes = 0;
  for (const apunte of Array.isArray(apuntes) ? apuntes : []) {
    const id = idDocumento(apunte);
    if (!id) continue;
    const requestedFolderId = idOpcional(apunte.noteFolderId ?? apunte.carpetaId);
    const folderId = requestedFolderId && folderById.has(requestedFolderId) ? requestedFolderId : null;
    if (requestedFolderId && !folderId) orphanNotes += 1;
    const projected = {
      ...apunte,
      id,
      sourceType: "note",
      type: "note",
      noteFolderId: folderId,
      quotaBytes: 0,
      countsTowardCloudQuota: false
    };
    notes.push(projected);
    const key = folderId || "";
    if (!notesByFolder.has(key)) notesByFolder.set(key, []);
    notesByFolder.get(key).push(projected);
  }

  return {
    folders,
    notes,
    folderById,
    childrenByParent,
    notesByFolder,
    diagnostics: Object.freeze({
      folderCount: folders.length,
      noteCount: notes.length,
      rootFolderCount: childrenByParent.get("")?.length || 0,
      orphanFolders,
      orphanNotes,
      cycleFolders: resolvedCycleNodes.size
    })
  };
}

export function listarContenidoCarpetaApuntes(indice, folderId = null) {
  const requestedId = idOpcional(folderId);
  const key = requestedId && indice?.folderById?.has(requestedId) ? requestedId : "";
  return [
    ...(indice?.childrenByParent?.get(key) || []),
    ...(indice?.notesByFolder?.get(key) || [])
  ];
}

export function construirBreadcrumbsCarpetasApuntes(indice, folderId = null) {
  const root = Object.freeze({ id: null, name: "Mis apuntes", sourceType: "noteFolder" });
  let current = idOpcional(folderId);
  if (!current) return [root];
  const path = [];
  const visited = new Set();
  while (current) {
    if (visited.has(current)) break;
    visited.add(current);
    const folder = indice?.folderById?.get(current);
    if (!folder) return [root];
    path.push(Object.freeze({ id: folder.id, name: folder.name, sourceType: "noteFolder" }));
    current = idOpcional(folder.parentFolderId);
  }
  return [root, ...path.reverse()];
}

export function buscarApuntesProyectados(indice, query = "") {
  const term = normalizarBusqueda(query);
  if (!term) return [...(indice?.notes || [])];
  return (indice?.notes || []).filter((note) => normalizarBusqueda([
    note.name,
    note.titulo,
    note.preview,
    note.searchText
  ].filter(Boolean).join(" ")).includes(term));
}
