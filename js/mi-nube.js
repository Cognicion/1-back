import { auth } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import {
  cancelCloudUpload,
  confirmCloudUpload,
  createCloudFolder,
  downloadPrivateCloudFile,
  listChildFolders,
  listFolderContents,
  listTrashContents,
  moveCloudItem,
  permanentlyDeleteCloudItem,
  reconcileCloudStorageUsage,
  renameCloudItem,
  reserveCloudUpload,
  restoreCloudItem,
  trashCloudItem,
  uploadReservedFile,
  waitForCloudItem
} from "./services/cloudFilesService.js";
import { loadCloudPreview, revokeCloudPreviewUrl } from "./services/cloudPreviewService.js?v=20260822-mi-nube-v2-090";
import { subscribeCloudUsage } from "./services/cloudQuotaService.js";
import {
  calcularEstadoCuotaMiNube,
  clasificarElementoMiNube,
  construirBreadcrumbs,
  escaparHtml,
  filtrarElementosMiNube,
  formatearBytes,
  obtenerIdsDescendientes,
  ordenarElementosMiNube,
  renderizarMarkdownSeguro,
  validarArchivoMiNube
} from "./mi-nube-core.js?v=20260822-mi-nube-v2-090";
import {
  cargarProyeccionApuntesParaMiNube,
  crearUrlEditorApunte,
  crearUrlNuevoApunte
} from "./services/notesCloudBridgeService.js?v=20260822-mi-nube-v2-090";
import {
  construirBreadcrumbsCarpetasApuntes,
  listarContenidoCarpetaApuntes
} from "./notes-cloud-projection-core.js?v=20260822-mi-nube-v2-090";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const UPLOAD_CONCURRENCY = 3;
const SEARCH_DEBOUNCE_MS = 320;
const FILTERS = new Set(["all", "files", "images", "pdf", "text", "notes", "trash"]);
const SORTS = new Set(["recent", "name-asc", "name-desc"]);

const state = {
  uid: "",
  currentFolderId: null,
  currentNoteFolderId: null,
  folders: [],
  cloudItems: [],
  notes: [],
  noteFolders: [],
  notesProjection: null,
  notesLoading: false,
  notesGeneration: 0,
  cursor: null,
  hasMore: false,
  filter: FILTERS.has(new URLSearchParams(window.location.search).get("filtro"))
    ? new URLSearchParams(window.location.search).get("filtro")
    : "all",
  query: "",
  sort: "name-asc",
  view: "grid",
  loading: false,
  usage: calcularEstadoCuotaMiNube(),
  unsubscribeUsage: () => {},
  uploadQueue: [],
  activeUploads: 0,
  uploads: new Map(),
  activeItem: null,
  previewScale: 1,
  activePreviewUrl: "",
  searchTimer: null,
  loadError: "",
  loadGeneration: 0,
  previewRequest: 0,
  moveBrowserId: null,
  moveBrowserTrail: [],
  moveFolderCursor: null,
  moveFolderHasMore: false,
  moveRequest: 0,
  layoutDiagnosticLogged: false
};

const dom = {};

iniciarMonitoreoSesion("Mi nube");

const stopAuthObserver = onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("login.html");
    return;
  }

  state.uid = user.uid;
  state.view = readUserPreference("view", "grid") === "list" ? "list" : "grid";
  const storedSort = readUserPreference("sort", "name-asc");
  state.sort = SORTS.has(storedSort) ? storedSort : "name-asc";
  cacheDom();
  bindInterface();
  applyView();
  setActiveFilter(state.filter);
  state.unsubscribeUsage = subscribeCloudUsage(
    state.uid,
    (usage) => {
      state.usage = calcularEstadoCuotaMiNube(usage);
      renderUsage();
    },
    () => showStatus("No se pudo actualizar el indicador de almacenamiento.", true)
  );

  try {
    await Promise.all([loadFolders(), loadNotes()]);
    if (state.filter === "notes") {
      renderBreadcrumbs();
      renderItems();
    } else {
      await loadCurrentLocation();
    }
  } catch (error) {
    handleError(error, "No fue posible abrir Mi nube.");
    renderItems();
  } finally {
    document.body.classList.remove("bloqueado");
  }
});

window.addEventListener("pagehide", () => {
  stopAuthObserver();
  state.unsubscribeUsage?.();
  revokeCloudPreviewUrl();
  for (const upload of state.uploads.values()) upload.task?.cancel?.();
}, { once: true });

function cacheDom() {
  const ids = [
    "cloudApp", "cloudSearch", "cloudSearchClear", "cloudNewButton", "cloudNewMenu", "cloudFileInput", "cloudBreadcrumbs",
    "cloudGridButton", "cloudListButton", "cloudSort", "cloudItems", "cloudLoadMore",
    "cloudUsageText", "cloudUsageBar", "cloudUsageReserved", "cloudQuotaPercent", "cloudReconcile",
    "cloudUploadPanel", "cloudUploadPanelClose", "cloudUploadQueue", "cloudDropOverlay", "cloudStatus", "cloudToastRegion", "cloudFolderDialog",
    "cloudFolderForm", "cloudFolderInput", "cloudFolderParent", "cloudFolderError", "cloudRenameDialog",
    "cloudRenameForm", "cloudRenameInput", "cloudRenameError", "cloudMoveDialog",
    "cloudMoveForm", "cloudMoveSelect", "cloudMoveError", "cloudMoveBreadcrumbs", "cloudMoveUp",
    "cloudMoveFolderList", "cloudMoveLoadMore", "cloudPreviewDialog",
    "cloudPreviewContainer", "cloudPreviewTitle", "cloudPreviewMeta", "cloudPreviewDownload",
    "cloudPreviewZoomIn", "cloudPreviewZoomOut", "cloudPreviewFit", "cloudPreviewClose",
    "cloudLoadingState", "cloudListHeader", "cloudMobileFilter", "cloudEmptyUploadButton", "cloudUploadSummary",
    "cloudRetryButton", "cloudSidebar", "cloudSidebarToggle", "cloudSidebarClose", "cloudSidebarBackdrop"
  ];
  ids.forEach((id) => { dom[id] = document.getElementById(id); });
  if (!state.layoutDiagnosticLogged) {
    const workspace = document.querySelector(".cloud-workspace");
    const app = document.getElementById("cloudApp");
    console.info("[MI NUBE] Montaje visual", {
      appEncontrado: Boolean(app),
      workspaceEncontrado: Boolean(workspace),
      itemsEncontrado: Boolean(dom.cloudItems),
      tema: document.documentElement.dataset.theme || "no-detectado",
      zIndexAplicacion: app ? getComputedStyle(app).zIndex : "no-aplica"
    });
    state.layoutDiagnosticLogged = true;
  }
}

function bindInterface() {
  dom.cloudNewButton?.addEventListener("click", toggleNewMenu);
  document.addEventListener("click", closeTransientMenus);
  document.addEventListener("keydown", handleGlobalKeydown);
  document.querySelectorAll("[data-cloud-new]").forEach((button) => {
    button.addEventListener("click", () => handleNewAction(button.dataset.cloudNew));
  });
  document.querySelectorAll("[data-cloud-filter]").forEach((button) => {
    button.addEventListener("click", () => changeFilter(button.dataset.cloudFilter));
  });
  dom.cloudSearch?.addEventListener("input", scheduleSearch);
  dom.cloudSearchClear?.addEventListener("click", clearSearch);
  dom.cloudGridButton?.addEventListener("click", () => changeView("grid"));
  dom.cloudListButton?.addEventListener("click", () => changeView("list"));
  dom.cloudSort?.addEventListener("change", () => {
    state.sort = SORTS.has(dom.cloudSort.value) ? dom.cloudSort.value : "name-asc";
    saveUserPreference("sort", state.sort);
    state.cursor = null;
    void loadCurrentLocation();
  });
  dom.cloudItems?.addEventListener("click", handleItemAction);
  dom.cloudBreadcrumbs?.addEventListener("click", handleBreadcrumb);
  dom.cloudLoadMore?.addEventListener("click", () => loadMore());
  dom.cloudFileInput?.addEventListener("change", () => {
    enqueueFiles([...dom.cloudFileInput.files]);
    dom.cloudFileInput.value = "";
  });
  dom.cloudUploadQueue?.addEventListener("click", handleUploadAction);
  dom.cloudUploadPanelClose?.addEventListener("click", () => { dom.cloudUploadPanel.hidden = true; });
  dom.cloudReconcile?.addEventListener("click", reconcileUsage);
  dom.cloudMobileFilter?.addEventListener("change", () => changeFilter(dom.cloudMobileFilter.value));
  dom.cloudEmptyUploadButton?.addEventListener("click", () => dom.cloudFileInput?.click());
  dom.cloudRetryButton?.addEventListener("click", () => loadCurrentLocation());
  dom.cloudSidebarToggle?.addEventListener("click", openMobileSidebar);
  dom.cloudSidebarClose?.addEventListener("click", closeMobileSidebar);
  dom.cloudSidebarBackdrop?.addEventListener("click", closeMobileSidebar);
  bindDragAndDrop();
  bindDialogs();
}

function bindDialogs() {
  dom.cloudFolderForm?.addEventListener("submit", submitFolder);
  dom.cloudRenameForm?.addEventListener("submit", submitRename);
  dom.cloudMoveForm?.addEventListener("submit", submitMove);
  dom.cloudMoveFolderList?.addEventListener("click", handleMoveFolderClick);
  dom.cloudMoveUp?.addEventListener("click", moveFolderUp);
  dom.cloudMoveLoadMore?.addEventListener("click", () => loadMoveFolders({ append: true }));
  document.querySelectorAll("[data-cloud-dialog-close], [data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
  dom.cloudPreviewClose?.addEventListener("click", closePreview);
  dom.cloudMoveDialog?.addEventListener("close", () => { state.moveRequest += 1; });
  dom.cloudPreviewDialog?.addEventListener("close", () => {
    state.previewRequest += 1;
    revokeCloudPreviewUrl();
    state.previewScale = 1;
    state.activePreviewUrl = "";
    state.activeItem = null;
    dom.cloudPreviewContainer?.replaceChildren();
  });
  dom.cloudPreviewDownload?.addEventListener("click", () => {
    if (state.activeItem) void downloadItem(state.activeItem);
  });
  dom.cloudPreviewZoomIn?.addEventListener("click", () => changePreviewScale(0.2));
  dom.cloudPreviewZoomOut?.addEventListener("click", () => changePreviewScale(-0.2));
  dom.cloudPreviewFit?.addEventListener("click", fitPreview);
}

function bindDragAndDrop() {
  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth += 1;
    dom.cloudDropOverlay?.removeAttribute("hidden");
  });
  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dom.cloudDropOverlay?.setAttribute("hidden", "");
  });
  window.addEventListener("drop", (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth = 0;
    dom.cloudDropOverlay?.setAttribute("hidden", "");
    enqueueFiles([...event.dataTransfer.files]);
  });
}

function hasFiles(dataTransfer) {
  return [...(dataTransfer?.types || [])].includes("Files");
}

async function loadFolders() {
  const result = await listChildFolders(state.uid, { parentFolderId: null, pageSize: 50 });
  mergeKnownFolders(result.items);
}

function mergeKnownFolders(items = []) {
  const byId = new Map(state.folders.map((folder) => [folder.id, folder]));
  items.filter((item) => item?.type === "folder").forEach((folder) => byId.set(folder.id, folder));
  state.folders = [...byId.values()];
}

async function loadNotes({ append = false } = {}) {
  if (append || state.notesLoading) return;
  const generation = state.notesGeneration + 1;
  state.notesGeneration = generation;
  state.notesLoading = true;
  try {
    const projection = await cargarProyeccionApuntesParaMiNube(state.uid);
    if (generation !== state.notesGeneration) return;
    state.notesProjection = projection;
    state.notes = projection.notes;
    state.noteFolders = projection.folders;
    const diagnostics = projection.diagnostics;
    console.info("[MiNube][NotesProjection]", "Proyección cargada", {
      folderCount: diagnostics.folderCount,
      noteCount: diagnostics.noteCount,
      rootFolderCount: diagnostics.rootFolderCount,
      orphanFolders: diagnostics.orphanFolders,
      orphanNotes: diagnostics.orphanNotes,
      cycleFolders: diagnostics.cycleFolders
    });
    if (diagnostics.orphanFolders || diagnostics.orphanNotes || diagnostics.cycleFolders) {
      console.warn("[MiNube][NotesProjection]", "Referencias huérfanas o cíclicas colocadas temporalmente en raíz", {
        orphanFolders: diagnostics.orphanFolders,
        orphanNotes: diagnostics.orphanNotes,
        cycleFolders: diagnostics.cycleFolders
      });
    }
  } catch (error) {
    state.notes = [];
    state.noteFolders = [];
    state.notesProjection = null;
    console.warn("[MiNube][NotesProjection]", "No se pudieron proyectar los apuntes", {
      code: error?.code || error?.name || "error"
    });
  } finally {
    if (generation === state.notesGeneration) {
      state.notesLoading = false;
      renderItems();
    }
  }
}

async function loadCurrentLocation({ append = false } = {}) {
  if (append && state.loading) return;
  const generation = state.loadGeneration + 1;
  state.loadGeneration = generation;
  const requestedFilter = state.filter;
  const requestedFolderId = state.currentFolderId;
  const requestedSort = state.sort;
  const requestedCursor = append ? state.cursor : null;
  state.loading = true;
  setBusy(true);
  showStatus(append ? "Cargando más elementos…" : "Cargando…");
  try {
    const result = requestedFilter === "trash"
      ? await listTrashContents(state.uid, { cursor: requestedCursor })
      : await listFolderContents(state.uid, {
        parentFolderId: requestedFolderId,
        cursor: requestedCursor,
        sort: requestedSort
      });
    if (generation !== state.loadGeneration
      || requestedFilter !== state.filter
      || requestedFolderId !== state.currentFolderId
      || requestedSort !== state.sort) return;
    state.cloudItems = append ? [...state.cloudItems, ...result.items] : result.items;
    mergeKnownFolders(result.items);
    state.cursor = result.cursor;
    state.hasMore = result.hasMore;
    state.loadError = "";
    renderBreadcrumbs();
    renderItems();
    showStatus("");
  } catch (error) {
    if (generation !== state.loadGeneration) return;
    state.loadError = friendlyError(error, "No se pudieron cargar los archivos.");
    handleError(error, "No se pudieron cargar los archivos.");
    if (!append) state.cloudItems = [];
    renderItems();
  } finally {
    if (generation === state.loadGeneration) {
      state.loading = false;
      setBusy(false);
    }
  }
}

async function loadMore() {
  if (state.filter === "notes") return;
  const tasks = [];
  if (state.hasMore && !state.loading) tasks.push(loadCurrentLocation({ append: true }));
  await Promise.all(tasks);
}

function itemsForRender() {
  let items;
  if (state.filter === "notes") {
    items = state.query
      ? state.notes
      : listarContenidoCarpetaApuntes(state.notesProjection, state.currentNoteFolderId);
  } else if (state.filter === "trash") {
    items = state.cloudItems;
  } else {
    const notesAtRoot = state.filter === "all" && state.currentFolderId === null
      ? (state.query
          ? state.notes
          : listarContenidoCarpetaApuntes(state.notesProjection))
      : [];
    items = [...state.cloudItems, ...notesAtRoot];
  }
  return ordenarElementosMiNube(filtrarElementosMiNube(items, {
    query: state.query,
    filter: state.filter,
    deleted: state.filter === "trash" ? "all" : false
  }), state.filter === "trash" ? "recent" : state.sort, { foldersFirst: state.filter !== "trash" });
}

function renderItems() {
  if (!dom.cloudItems) return;
  const items = itemsForRender();
  dom.cloudItems.dataset.view = state.view;

  if (!items.length) {
    dom.cloudItems.innerHTML = emptyStateHtml();
  } else {
    dom.cloudItems.innerHTML = items.map(renderItemHtml).join("");
  }
  if (dom.cloudLoadMore) {
    const cloudCanLoad = state.filter !== "notes" && state.hasMore;
    dom.cloudLoadMore.hidden = !cloudCanLoad;
    dom.cloudLoadMore.disabled = state.loading || state.notesLoading;
  }
  if (dom.cloudListHeader) dom.cloudListHeader.hidden = state.view !== "list" || !items.length;
}

function renderItemHtml(item) {
  const category = clasificarElementoMiNube(item);
  const isFolder = category === "folder";
  const isNoteFolder = category === "note-folder";
  const isNote = category === "note";
  const name = item.name || item.title || item.titulo || item.originalName || "Sin nombre";
  const typeLabel = isNoteFolder ? "Carpeta de Mis apuntes" : isFolder ? "Carpeta" : isNote ? "Mis apuntes" : typeLabelFor(category, item);
  const size = isFolder || isNoteFolder || isNote ? "—" : formatearBytes(item.sizeBytes || 0);
  const date = formatDate(item.updatedAt || item.fechaActualizacion || item.createdAt || item.fechaCreacion);
  const source = isNote || isNoteFolder ? "Mis apuntes" : isFolder ? "Mi nube" : `Archivo · ${typeLabel}`;
  const action = isNoteFolder ? "open-note-folder" : isFolder ? "open-folder" : isNote ? "open-note" : "preview";
  const icon = iconFor(category);
  const listView = state.view === "list";
  const content = listView
    ? `<span class="cloud-item-preview cloud-item-preview--${escaparHtml(category)}" aria-hidden="true">${icon}</span>
       <strong class="cloud-item-name" title="${escaparHtml(name)}">${escaparHtml(name)}</strong>
       <span class="cloud-item-type">${escaparHtml(typeLabel)}</span>
       <span class="cloud-item-size">${escaparHtml(size)}</span>
       <time class="cloud-item-date">${escaparHtml(date)}</time>`
    : `<span class="cloud-item-preview cloud-item-preview--${escaparHtml(category)}" aria-hidden="true">${icon}</span>
       <span class="cloud-item-copy">
         <strong class="cloud-item-name" title="${escaparHtml(name)}">${escaparHtml(name)}</strong>
         <span class="cloud-item-details">${escaparHtml(typeLabel)} · ${escaparHtml(size)}</span>
         <span class="cloud-item-source">${escaparHtml(source)}</span>
       </span>`;
  return `
    <article class="cloud-item ${listView ? "cloud-item-list" : "cloud-item-grid"}" role="listitem" data-cloud-id="${escaparHtml(item.id)}" data-cloud-source="${isNote ? "note" : isNoteFolder ? "note-folder" : "cloud-file"}">
      <button class="cloud-item-open" type="button" data-cloud-action="${action}" aria-label="Abrir ${escaparHtml(name)}">${content}</button>
      ${renderActionsHtml(item, { isFolder, isNoteFolder, isNote })}
    </article>`;
}

function renderActionsHtml(item, { isFolder, isNoteFolder, isNote }) {
  if (isNoteFolder) return "";
  if (isNote) {
    return `<a class="cloud-item-menu-button cloud-note-edit" href="${escaparHtml(crearUrlEditorApunte(item.id))}" aria-label="Editar ${escaparHtml(item.name || item.titulo || "apunte")}">Editar</a>`;
  }
  if (state.filter === "trash" || item.deleted) {
    return `<details class="cloud-actions-menu cloud-item-menu-button">
      <summary aria-label="Acciones para ${escaparHtml(item.name)}">⋮</summary>
      <div role="menu">
        <button type="button" data-cloud-action="restore" role="menuitem">Restaurar</button>
        <button type="button" data-cloud-action="delete-forever" role="menuitem" class="danger">Eliminar definitivamente</button>
      </div>
    </details>`;
  }
  return `<details class="cloud-actions-menu cloud-item-menu-button">
    <summary aria-label="Acciones para ${escaparHtml(item.name)}">⋮</summary>
    <div role="menu">
      ${isFolder ? '<button type="button" data-cloud-action="open-folder" role="menuitem">Abrir</button>' : '<button type="button" data-cloud-action="preview" role="menuitem">Previsualizar</button>'}
      <button type="button" data-cloud-action="rename" role="menuitem">Renombrar</button>
      <button type="button" data-cloud-action="move" role="menuitem">Mover</button>
      ${isFolder ? "" : '<button type="button" data-cloud-action="download" role="menuitem">Descargar</button>'}
      <button type="button" data-cloud-action="trash" role="menuitem" class="danger">Eliminar</button>
    </div>
  </details>`;
}

function emptyStateHtml() {
  if (state.loadError) return `<section class="cloud-empty"><strong>No pudimos cargar Mi nube.</strong><p>${escaparHtml(state.loadError)}</p><button type="button" data-cloud-action="retry">Reintentar</button></section>`;
  if (state.query) return '<section class="cloud-empty"><strong>No encontramos archivos con ese nombre.</strong><p>Prueba con otro término.</p></section>';
  if (state.filter === "trash") return '<section class="cloud-empty"><strong>La papelera está vacía.</strong><p>Los archivos enviados aquí siguen ocupando espacio hasta su eliminación definitiva.</p></section>';
  if (state.filter === "notes" && state.currentNoteFolderId) return '<section class="cloud-empty"><strong>Esta carpeta está vacía.</strong></section>';
  if (state.filter === "notes") return `<section class="cloud-empty"><strong>Aún no tienes apuntes.</strong><p>Los apuntes conservan su módulo y almacenamiento actuales.</p><a href="${escaparHtml(crearUrlNuevoApunte())}">Crear mi primer apunte</a></section>`;
  if (state.currentFolderId) return '<section class="cloud-empty"><strong>Esta carpeta está vacía.</strong></section>';
  return '<section class="cloud-empty"><strong>Tu nube está vacía</strong><p>Sube imágenes, documentos PDF, archivos de texto o crea tu primer apunte.</p><button type="button" data-cloud-action="choose-upload">Subir archivo</button></section>';
}

function renderBreadcrumbs() {
  if (!dom.cloudBreadcrumbs) return;
  if (state.filter === "notes") {
    const crumbs = construirBreadcrumbsCarpetasApuntes(state.notesProjection, state.currentNoteFolderId);
    if (state.currentNoteFolderId && crumbs.length === 1) state.currentNoteFolderId = null;
    dom.cloudBreadcrumbs.innerHTML = `<ol><li><button type="button" data-cloud-folder="">Mi nube</button></li>${crumbs.map((crumb, index) => {
      const last = index === crumbs.length - 1;
      return `<li>${last
        ? `<button type="button" aria-current="page">${escaparHtml(crumb.name)}</button>`
        : `<button type="button" data-note-folder="${escaparHtml(crumb.id || "")}">${escaparHtml(crumb.name)}</button>`}</li>`;
    }).join("")}</ol>`;
    return;
  }
  if (state.filter === "trash") {
    dom.cloudBreadcrumbs.innerHTML = '<ol><li><button type="button" data-cloud-folder="">Mi nube</button></li><li><button type="button" aria-current="page">Papelera</button></li></ol>';
    return;
  }
  try {
    const crumbs = construirBreadcrumbs(state.folders, state.currentFolderId);
    dom.cloudBreadcrumbs.innerHTML = `<ol>${crumbs.map((crumb, index) => {
      const last = index === crumbs.length - 1;
      return `<li>${last
        ? `<button type="button" aria-current="page">${escaparHtml(crumb.name)}</button>`
        : `<button type="button" data-cloud-folder="${escaparHtml(crumb.id || "")}">${escaparHtml(crumb.name)}</button>`}</li>`;
    }).join("")}</ol>`;
  } catch {
    state.currentFolderId = null;
    dom.cloudBreadcrumbs.innerHTML = '<ol><li><button type="button" aria-current="page">Mi nube</button></li></ol>';
  }
}

function renderUsage() {
  if (dom.cloudUsageText) dom.cloudUsageText.textContent = `${formatearBytes(state.usage.usedBytes)} de ${formatearBytes(state.usage.maxBytes)}`;
  if (dom.cloudUsageReserved) {
    dom.cloudUsageReserved.textContent = `${formatearBytes(state.usage.reservedBytes)} reservados en cargas activas`;
    dom.cloudUsageReserved.hidden = !state.usage.reservedBytes;
  }
  if (dom.cloudUsageBar) {
    const percent = Math.min(100, Math.max(0, Number(state.usage.percentUsed) || 0));
    dom.cloudUsageBar.setAttribute("aria-valuenow", String(percent));
    dom.cloudUsageBar.setAttribute("aria-valuetext", `${formatearBytes(state.usage.usedBytes + state.usage.reservedBytes)} de ${formatearBytes(state.usage.maxBytes)}`);
    const fill = dom.cloudUsageBar.querySelector("span");
    if (fill) fill.style.width = `${percent}%`;
  }
  if (dom.cloudQuotaPercent) dom.cloudQuotaPercent.textContent = `${state.usage.percentUsed} %`;
  if (dom.cloudReconcile) dom.cloudReconcile.hidden = false;
}

async function handleItemAction(event) {
  const actionElement = event.target.closest("[data-cloud-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.cloudAction;
  if (action === "choose-upload") {
    dom.cloudFileInput?.click();
    return;
  }
  if (action === "retry") {
    void loadCurrentLocation();
    return;
  }
  const article = actionElement.closest("[data-cloud-id]");
  const item = findItem(article?.dataset.cloudId, article?.dataset.cloudSource);
  if (!item) return;
  article.querySelector("details")?.removeAttribute("open");

  if (action === "open-folder") return openFolder(item.id, item);
  if (action === "open-note-folder") return openNoteFolder(item.id);
  if (action === "open-note") {
    window.location.href = crearUrlEditorApunte(item.id);
    return;
  }
  if (action === "preview") return previewItem(item);
  if (action === "download") return downloadItem(item);
  if (action === "rename") return openRenameDialog(item);
  if (action === "move") return openMoveDialog(item);
  if (action === "trash") return trashItem(item);
  if (action === "restore") return restoreItem(item);
  if (action === "delete-forever") return deleteForever(item);
}

function findItem(id, source) {
  const list = source === "note"
    ? state.notes
    : source === "note-folder"
      ? state.noteFolders
      : state.cloudItems;
  return list.find((item) => item.id === id) || null;
}

async function openFolder(folderId, folder = null) {
  if (folder?.type === "folder") mergeKnownFolders([folder]);
  state.currentFolderId = folderId || null;
  state.currentNoteFolderId = null;
  if (["notes", "trash"].includes(state.filter)) {
    setActiveFilter("all");
    updateFilterUrl();
  }
  state.cursor = null;
  await loadCurrentLocation();
}

function openNoteFolder(folderId = null) {
  const requestedId = String(folderId || "").trim() || null;
  state.currentNoteFolderId = requestedId && state.notesProjection?.folderById?.has(requestedId)
    ? requestedId
    : null;
  state.currentFolderId = null;
  if (state.filter !== "notes") setActiveFilter("notes");
  updateFilterUrl();
  renderBreadcrumbs();
  renderItems();
}

function handleBreadcrumb(event) {
  const noteButton = event.target.closest("[data-note-folder]");
  if (noteButton) {
    openNoteFolder(noteButton.dataset.noteFolder || null);
    return;
  }
  const button = event.target.closest("[data-cloud-folder]");
  if (!button) return;
  void openFolder(button.dataset.cloudFolder || null);
}

function changeFilter(filter) {
  if (!FILTERS.has(filter) || filter === state.filter) return;
  setActiveFilter(filter);
  if (["notes", "trash"].includes(filter)) state.currentFolderId = null;
  state.currentNoteFolderId = null;
  state.cursor = null;
  updateFilterUrl();
  if (filter === "notes") {
    state.loadGeneration += 1;
    state.loading = false;
    setBusy(false);
    renderBreadcrumbs();
    renderItems();
    return;
  }
  void loadCurrentLocation();
}

function setActiveFilter(filter) {
  state.filter = FILTERS.has(filter) ? filter : "all";
  document.querySelectorAll("[data-cloud-filter]").forEach((button) => {
    const active = button.dataset.cloudFilter === state.filter;
    button.classList.toggle("active", active);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (dom.cloudMobileFilter) dom.cloudMobileFilter.value = state.filter;
  if (dom.cloudSort) {
    dom.cloudSort.disabled = state.filter === "trash";
    dom.cloudSort.value = state.filter === "trash" ? "recent" : state.sort;
  }
  closeMobileSidebar();
}

function updateFilterUrl() {
  const url = new URL(window.location.href);
  if (state.filter === "all") url.searchParams.delete("filtro");
  else url.searchParams.set("filtro", state.filter);
  history.replaceState(null, "", url);
}

function scheduleSearch() {
  window.clearTimeout(state.searchTimer);
  if (dom.cloudSearchClear) dom.cloudSearchClear.hidden = !dom.cloudSearch?.value;
  state.searchTimer = window.setTimeout(() => {
    state.query = dom.cloudSearch?.value.trim() || "";
    renderItems();
  }, SEARCH_DEBOUNCE_MS);
}

function clearSearch() {
  if (!dom.cloudSearch) return;
  dom.cloudSearch.value = "";
  state.query = "";
  if (dom.cloudSearchClear) dom.cloudSearchClear.hidden = true;
  renderItems();
  dom.cloudSearch.focus();
}

function openMobileSidebar() {
  dom.cloudSidebar?.classList.add("is-open");
  dom.cloudSidebarBackdrop?.removeAttribute("hidden");
  dom.cloudSidebarToggle?.setAttribute("aria-expanded", "true");
}

function closeMobileSidebar() {
  dom.cloudSidebar?.classList.remove("is-open");
  dom.cloudSidebarBackdrop?.setAttribute("hidden", "");
  dom.cloudSidebarToggle?.setAttribute("aria-expanded", "false");
}

function changeView(view) {
  state.view = view === "list" ? "list" : "grid";
  saveUserPreference("view", state.view);
  applyView();
  renderItems();
}

function applyView() {
  const grid = state.view === "grid";
  dom.cloudGridButton?.setAttribute("aria-pressed", String(grid));
  dom.cloudListButton?.setAttribute("aria-pressed", String(!grid));
  dom.cloudGridButton?.classList.toggle("active", grid);
  dom.cloudListButton?.classList.toggle("active", !grid);
  if (dom.cloudSort) dom.cloudSort.value = state.sort;
}

function handleNewAction(action) {
  closeNewMenu();
  if (action === "upload") dom.cloudFileInput?.click();
  if (action === "folder") openFolderDialog();
  if (action === "note") window.location.href = crearUrlNuevoApunte();
}

function toggleNewMenu(event) {
  event.stopPropagation();
  if (!dom.cloudNewMenu) return;
  const open = dom.cloudNewMenu.hidden;
  dom.cloudNewMenu.hidden = !open;
  dom.cloudNewButton?.setAttribute("aria-expanded", String(open));
}

function closeNewMenu() {
  if (!dom.cloudNewMenu) return;
  dom.cloudNewMenu.hidden = true;
  dom.cloudNewButton?.setAttribute("aria-expanded", "false");
}

function closeTransientMenus(event) {
  if (!event.target.closest("#cloudNewButton, #cloudNewMenu")) closeNewMenu();
  document.querySelectorAll(".cloud-actions-menu[open]").forEach((menu) => {
    if (!menu.contains(event.target)) menu.removeAttribute("open");
  });
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") return;
  closeNewMenu();
  document.querySelectorAll(".cloud-actions-menu[open]").forEach((menu) => menu.removeAttribute("open"));
}

function openFolderDialog() {
  if (!dom.cloudFolderDialog) return;
  dom.cloudFolderInput.value = "";
  if (dom.cloudFolderParent) {
    dom.cloudFolderParent.innerHTML = `<option value="">Mi nube</option>${buildFolderOptions(null)}`;
    dom.cloudFolderParent.value = state.currentFolderId || "";
  }
  setInlineError(dom.cloudFolderError, "");
  dom.cloudFolderDialog.showModal();
  requestAnimationFrame(() => dom.cloudFolderInput?.focus());
}

async function submitFolder(event) {
  event.preventDefault();
  const name = dom.cloudFolderInput?.value.trim() || "";
  if (!name) {
    setInlineError(dom.cloudFolderError, "Escribe un nombre para la carpeta.");
    return;
  }
  setFormBusy(dom.cloudFolderForm, true);
  try {
    await createCloudFolder({
      name,
      parentFolderId: dom.cloudFolderParent?.value || null,
      requestId: crypto.randomUUID?.() || `${Date.now()}-folder-${Math.random().toString(16).slice(2)}`
    });
    dom.cloudFolderDialog.close();
    await refreshCloudView();
    showStatus("Carpeta creada.");
  } catch (error) {
    setInlineError(dom.cloudFolderError, friendlyError(error, "No se pudo crear la carpeta."));
  } finally {
    setFormBusy(dom.cloudFolderForm, false);
  }
}

function openRenameDialog(item) {
  state.activeItem = item;
  dom.cloudRenameInput.value = item.name || item.originalName || "";
  setInlineError(dom.cloudRenameError, "");
  dom.cloudRenameDialog?.showModal();
  requestAnimationFrame(() => dom.cloudRenameInput?.select());
}

async function submitRename(event) {
  event.preventDefault();
  const item = state.activeItem;
  const name = dom.cloudRenameInput?.value.trim() || "";
  if (!item || !name) {
    setInlineError(dom.cloudRenameError, "Escribe un nombre.");
    return;
  }
  setFormBusy(dom.cloudRenameForm, true);
  try {
    await renameCloudItem({ itemId: item.id, name });
    dom.cloudRenameDialog.close();
    await refreshCloudView();
    showStatus("Nombre actualizado.");
  } catch (error) {
    setInlineError(dom.cloudRenameError, friendlyError(error, "No se pudo renombrar el elemento."));
  } finally {
    setFormBusy(dom.cloudRenameForm, false);
  }
}

function openMoveDialog(item) {
  state.activeItem = item;
  state.moveBrowserId = null;
  state.moveBrowserTrail = [];
  state.moveFolderCursor = null;
  state.moveFolderHasMore = false;
  if (dom.cloudMoveSelect) dom.cloudMoveSelect.value = "";
  setInlineError(dom.cloudMoveError, "");
  dom.cloudMoveDialog?.showModal();
  renderMoveLocation();
  void loadMoveFolders();
}

async function loadMoveFolders({ append = false } = {}) {
  if (!dom.cloudMoveFolderList || (append && !state.moveFolderHasMore)) return;
  const requestId = state.moveRequest + 1;
  state.moveRequest = requestId;
  const parentFolderId = state.moveBrowserId;
  if (!append) {
    setInlineError(dom.cloudMoveError, "");
    if (dom.cloudMoveLoadMore) dom.cloudMoveLoadMore.hidden = true;
  }
  dom.cloudMoveLoadMore?.setAttribute("disabled", "");
  if (!append) dom.cloudMoveFolderList.innerHTML = '<p class="cloud-move-loading">Cargando carpetas…</p>';
  try {
    const result = await listChildFolders(state.uid, {
      parentFolderId,
      cursor: append ? state.moveFolderCursor : null,
      pageSize: 40
    });
    if (requestId !== state.moveRequest || parentFolderId !== state.moveBrowserId) return;
    const folders = result.items.filter((folder) => folder.id !== state.activeItem?.id);
    mergeKnownFolders(folders);
    const html = folders.map((folder) => `
      <button type="button" role="option" data-cloud-move-folder="${escaparHtml(folder.id)}" data-cloud-move-name="${escaparHtml(folder.name)}">
        <span aria-hidden="true">📁</span><span>${escaparHtml(folder.name)}</span><span aria-hidden="true">›</span>
      </button>`).join("");
    if (append) dom.cloudMoveFolderList.insertAdjacentHTML("beforeend", html);
    else dom.cloudMoveFolderList.innerHTML = html || '<p class="cloud-move-empty">No hay subcarpetas aquí.</p>';
    state.moveFolderCursor = result.cursor;
    state.moveFolderHasMore = result.hasMore;
    if (dom.cloudMoveLoadMore) dom.cloudMoveLoadMore.hidden = !result.hasMore;
  } catch (error) {
    if (requestId !== state.moveRequest) return;
    setInlineError(dom.cloudMoveError, friendlyError(error, "No se pudieron cargar las carpetas."));
    if (!append) dom.cloudMoveFolderList.innerHTML = '<p class="cloud-move-empty">No se pudieron cargar las carpetas.</p>';
  } finally {
    if (requestId === state.moveRequest) dom.cloudMoveLoadMore?.removeAttribute("disabled");
  }
}

function handleMoveFolderClick(event) {
  const button = event.target.closest("[data-cloud-move-folder]");
  if (!button) return;
  state.moveBrowserTrail.push({ id: button.dataset.cloudMoveFolder, name: button.dataset.cloudMoveName || "Carpeta" });
  state.moveBrowserId = button.dataset.cloudMoveFolder;
  state.moveFolderCursor = null;
  state.moveFolderHasMore = false;
  if (dom.cloudMoveSelect) dom.cloudMoveSelect.value = state.moveBrowserId;
  renderMoveLocation();
  void loadMoveFolders();
}

function moveFolderUp() {
  if (!state.moveBrowserTrail.length) return;
  state.moveBrowserTrail.pop();
  state.moveBrowserId = state.moveBrowserTrail.at(-1)?.id || null;
  state.moveFolderCursor = null;
  state.moveFolderHasMore = false;
  if (dom.cloudMoveSelect) dom.cloudMoveSelect.value = state.moveBrowserId || "";
  renderMoveLocation();
  void loadMoveFolders();
}

function renderMoveLocation() {
  const names = ["Mi nube", ...state.moveBrowserTrail.map((folder) => folder.name)];
  if (dom.cloudMoveBreadcrumbs) dom.cloudMoveBreadcrumbs.textContent = names.join(" › ");
  if (dom.cloudMoveUp) dom.cloudMoveUp.disabled = state.moveBrowserTrail.length === 0;
}

function buildFolderOptions(item) {
  const excludedIds = new Set();
  if (item?.type === "folder") {
    excludedIds.add(item.id);
    obtenerIdsDescendientes(state.folders, item.id).forEach((id) => excludedIds.add(id));
  }
  const byParent = new Map();
  state.folders.forEach((folder) => {
    const key = folder.parentFolderId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder);
  });
  const result = [];
  const visit = (parentId = "", depth = 0, ancestry = new Set()) => {
    const children = (byParent.get(parentId) || []).sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
    children.forEach((folder) => {
      if (excludedIds.has(folder.id) || ancestry.has(folder.id)) return;
      const nextAncestry = new Set(ancestry).add(folder.id);
      result.push(`<option value="${escaparHtml(folder.id)}">${"— ".repeat(depth)}${escaparHtml(folder.name)}</option>`);
      visit(folder.id, depth + 1, nextAncestry);
    });
  };
  visit();
  return result.join("");
}

async function submitMove(event) {
  event.preventDefault();
  if (!state.activeItem) return;
  setFormBusy(dom.cloudMoveForm, true);
  try {
    await moveCloudItem({ itemId: state.activeItem.id, parentFolderId: dom.cloudMoveSelect.value || null });
    dom.cloudMoveDialog.close();
    await refreshCloudView();
    showStatus("Elemento movido.");
  } catch (error) {
    setInlineError(dom.cloudMoveError, friendlyError(error, "No se pudo mover el elemento."));
  } finally {
    setFormBusy(dom.cloudMoveForm, false);
  }
}

async function trashItem(item) {
  if (!window.confirm(`¿Enviar “${item.name}” a la papelera? Seguirá ocupando espacio.`)) return;
  try {
    await trashCloudItem({ itemId: item.id });
    await refreshCloudView();
    showStatus("Elemento enviado a la papelera.");
  } catch (error) {
    handleError(error, "No se pudo eliminar el elemento.");
  }
}

async function restoreItem(item) {
  try {
    await restoreCloudItem({ itemId: item.id });
    await refreshCloudView();
    showStatus("Elemento restaurado.");
  } catch (error) {
    handleError(error, "No se pudo restaurar el elemento.");
  }
}

async function deleteForever(item) {
  if (!window.confirm(`¿Eliminar definitivamente “${item.name}”? Esta acción no se puede deshacer.`)) return;
  try {
    await permanentlyDeleteCloudItem({ itemId: item.id });
    await refreshCloudView();
    showStatus("Elemento eliminado definitivamente.");
  } catch (error) {
    handleError(error, "No se pudo eliminar definitivamente el elemento.");
  }
}

async function previewItem(item) {
  const requestId = state.previewRequest + 1;
  state.previewRequest = requestId;
  revokeCloudPreviewUrl();
  state.activePreviewUrl = "";
  state.activeItem = item;
  state.previewScale = 1;
  dom.cloudPreviewTitle.textContent = item.name || item.originalName || "Vista previa";
  dom.cloudPreviewMeta.textContent = `${typeLabelFor(clasificarElementoMiNube(item), item)} · ${formatearBytes(item.sizeBytes || 0)}`;
  dom.cloudPreviewContainer.innerHTML = '<p class="cloud-preview-loading">Preparando vista previa…</p>';
  dom.cloudPreviewDialog?.showModal();
  try {
    const preview = await loadCloudPreview(item);
    if (requestId !== state.previewRequest || !dom.cloudPreviewDialog?.open) {
      if (preview.url) revokeCloudPreviewUrl(preview.url);
      return;
    }
    if (preview.kind === "image") {
      state.activePreviewUrl = preview.url;
      dom.cloudPreviewContainer.innerHTML = `<img src="${escaparHtml(preview.url)}" alt="Vista previa de ${escaparHtml(item.name)}" data-cloud-preview-zoomable>`;
    } else if (preview.kind === "pdf") {
      state.activePreviewUrl = preview.url;
      renderPdfPreview(preview, item, requestId);
    } else if (preview.kind === "markdown") {
      dom.cloudPreviewContainer.innerHTML = `<article class="cloud-markdown-preview">${renderizarMarkdownSeguro(preview.text)}</article>`;
    } else {
      const pre = document.createElement("pre");
      pre.className = "cloud-text-preview";
      pre.textContent = preview.text;
      dom.cloudPreviewContainer.replaceChildren(pre);
    }
  } catch (error) {
    if (requestId !== state.previewRequest) return;
    if (clasificarElementoMiNube(item) === "pdf") {
      renderPdfFallback(item);
    } else {
      dom.cloudPreviewContainer.innerHTML = `<p class="cloud-preview-error">${escaparHtml(friendlyError(error, "No se pudo abrir la vista previa."))}</p>`;
    }
  }
}

function renderPdfPreview(preview, item, requestId) {
  const iframe = document.createElement("iframe");
  iframe.src = `${preview.url}#view=FitH`;
  iframe.title = `PDF: ${item.name || item.originalName || "Documento"}`;
  iframe.dataset.cloudPreviewPdf = "";
  iframe.addEventListener("error", () => {
    if (requestId !== state.previewRequest || !dom.cloudPreviewDialog?.open) return;
    renderPdfFallback(item);
  }, { once: true });
  dom.cloudPreviewContainer.replaceChildren(iframe);
}

function renderPdfFallback(item) {
  if (state.activePreviewUrl) revokeCloudPreviewUrl(state.activePreviewUrl);
  state.activePreviewUrl = "";
  const fallback = document.createElement("div");
  fallback.className = "cloud-preview-state cloud-preview-error";
  const message = document.createElement("strong");
  message.textContent = "No fue posible previsualizar este PDF.";
  const download = document.createElement("button");
  download.type = "button";
  download.className = "cloud-secondary-button";
  download.textContent = "Descargar archivo";
  download.addEventListener("click", () => void downloadItem(item));
  fallback.append(message, download);
  dom.cloudPreviewContainer.replaceChildren(fallback);
}

function closePreview() {
  dom.cloudPreviewDialog?.close();
}

function changePreviewScale(delta) {
  setPreviewScale(Math.min(3, Math.max(0.4, state.previewScale + delta)));
}

function setPreviewScale(scale) {
  state.previewScale = scale;
  const image = dom.cloudPreviewContainer?.querySelector("[data-cloud-preview-zoomable]");
  if (image) image.style.transform = `scale(${scale})`;
  const pdf = dom.cloudPreviewContainer?.querySelector("[data-cloud-preview-pdf]");
  if (pdf && state.activePreviewUrl) pdf.src = `${state.activePreviewUrl}#zoom=${Math.round(scale * 100)}`;
}

function fitPreview() {
  state.previewScale = 1;
  const image = dom.cloudPreviewContainer?.querySelector("[data-cloud-preview-zoomable]");
  if (image) image.style.transform = "scale(1)";
  const pdf = dom.cloudPreviewContainer?.querySelector("[data-cloud-preview-pdf]");
  if (pdf && state.activePreviewUrl) pdf.src = `${state.activePreviewUrl}#view=FitH`;
}

async function downloadItem(item) {
  try {
    showStatus(`Preparando “${item.name}”…`);
    await downloadPrivateCloudFile(item);
    showStatus("Descarga iniciada.");
  } catch (error) {
    handleError(error, "No se pudo descargar el archivo.");
  }
}

function enqueueFiles(files) {
  if (!files?.length) return;
  let locallyAllocated = state.usage.usedBytes + state.usage.reservedBytes;
  files.forEach((file) => {
    let validated;
    try {
      validated = validarArchivoMiNube(file);
    } catch (error) {
      addRejectedUpload(file, friendlyError(error, "Tipo de archivo no permitido."));
      return;
    }
    const quota = calcularEstadoCuotaMiNube({
      usedBytes: locallyAllocated,
      newFileBytes: validated.sizeBytes,
      maxBytes: state.usage.maxBytes
    });
    if (!quota.canUpload) {
      addRejectedUpload(file, `No tienes suficiente espacio disponible. Necesitas liberar ${formatearBytes(quota.missingBytes)}.`);
      return;
    }
    locallyAllocated += validated.sizeBytes;
    const upload = {
      localId: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      validated,
      status: "queued",
      progress: 0,
      task: null,
      reservation: null,
      cancelled: false,
      parentFolderId: state.currentFolderId
    };
    state.uploads.set(upload.localId, upload);
    state.uploadQueue.push(upload);
    renderUpload(upload);
  });
  processUploadQueue();
}

function processUploadQueue() {
  while (state.activeUploads < UPLOAD_CONCURRENCY && state.uploadQueue.length) {
    const upload = state.uploadQueue.shift();
    if (upload.cancelled) continue;
    state.activeUploads += 1;
    processUpload(upload).finally(() => {
      state.activeUploads -= 1;
      processUploadQueue();
    });
  }
}

async function processUpload(upload) {
  upload.status = "reserving";
  renderUpload(upload);
  try {
    upload.reservation = await reserveCloudUpload({
      requestId: upload.localId,
      name: upload.validated.name,
      originalName: upload.validated.originalName,
      extension: upload.validated.extension,
      mimeType: upload.validated.mimeType,
      sizeBytes: upload.validated.sizeBytes,
      parentFolderId: upload.parentFolderId
    });
    if (upload.cancelled) throw Object.assign(new Error("Carga cancelada."), { code: "storage/canceled" });
    upload.status = "uploading";
    await uploadReservedFile({
      file: upload.file,
      reservation: upload.reservation,
      onTask: (task) => { upload.task = task; },
      onProgress: (progress) => {
        upload.progress = progress;
        renderUpload(upload);
      }
    });
    upload.status = "confirming";
    renderUpload(upload);
    await confirmUploadReliably(upload.reservation.fileId);
    upload.status = "done";
    upload.progress = 100;
    renderUpload(upload);
    await refreshCloudView();
  } catch (error) {
    if (upload.reservation?.fileId) {
      try { await cancelCloudUpload({ fileId: upload.reservation.fileId }); } catch { /* la reconciliación libera la reserva */ }
    }
    upload.status = upload.cancelled || isCancelledError(error) ? "cancelled" : "error";
    upload.error = friendlyError(error, "No se pudo subir el archivo.");
    renderUpload(upload);
  }
}

async function confirmUploadReliably(fileId) {
  try {
    return await confirmCloudUpload({ fileId });
  } catch (error) {
    const code = String(error?.code || "").toLowerCase();
    const transient = code.includes("unavailable")
      || code.includes("deadline-exceeded")
      || code.includes("network-request-failed")
      || code.includes("internal");
    if (!transient) throw error;
    try {
      await waitForCloudItem(state.uid, fileId, 15000);
      return { alreadyConfirmed: true };
    } catch {
      throw error;
    }
  }
}

function renderUpload(upload) {
  if (!dom.cloudUploadQueue) return;
  dom.cloudUploadPanel?.removeAttribute("hidden");
  let row = dom.cloudUploadQueue.querySelector(`[data-upload-id="${CSS.escape(upload.localId)}"]`);
  if (!row) {
    row = document.createElement("article");
    row.className = "cloud-upload";
    row.dataset.uploadId = upload.localId;
    dom.cloudUploadQueue.append(row);
  }
  const statusLabel = {
    queued: "En espera",
    reserving: "Verificando espacio…",
    uploading: `${upload.progress} %`,
    confirming: "Confirmando…",
    done: "Completado",
    cancelled: "Carga cancelada",
    error: upload.error || "Error"
  }[upload.status] || "";
  const cancellable = ["queued", "reserving", "uploading"].includes(upload.status);
  row.className = `cloud-upload cloud-upload--${upload.status}`;
  row.innerHTML = `
    <div><strong>${escaparHtml(upload.file.name)}</strong><small>${escaparHtml(statusLabel)}</small></div>
    <progress max="100" value="${Number(upload.progress) || 0}">${Number(upload.progress) || 0}%</progress>
    ${cancellable ? '<button type="button" data-cloud-upload-action="cancel">Cancelar</button>' : '<button type="button" data-cloud-upload-action="dismiss">Cerrar</button>'}`;
  updateUploadSummary();
}

function updateUploadSummary() {
  if (!dom.cloudUploadSummary) return;
  const uploads = [...state.uploads.values()];
  const pending = uploads.filter((upload) => ["queued", "reserving", "uploading", "confirming"].includes(upload.status)).length;
  const failed = uploads.filter((upload) => upload.status === "error").length;
  dom.cloudUploadSummary.textContent = pending
    ? `${pending} ${pending === 1 ? "carga en curso" : "cargas en curso"}.`
    : failed
      ? `${failed} ${failed === 1 ? "carga necesita atención" : "cargas necesitan atención"}.`
      : uploads.length
        ? "Las cargas terminaron."
        : "Progreso individual de tus archivos.";
}

function addRejectedUpload(file, message) {
  const upload = {
    localId: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    status: "error",
    progress: 0,
    error: message
  };
  state.uploads.set(upload.localId, upload);
  renderUpload(upload);
}

function handleUploadAction(event) {
  const button = event.target.closest("[data-cloud-upload-action]");
  if (!button) return;
  const row = button.closest("[data-upload-id]");
  const upload = state.uploads.get(row?.dataset.uploadId);
  if (!upload) return;
  if (button.dataset.cloudUploadAction === "cancel") {
    upload.cancelled = true;
    upload.task?.cancel?.();
    state.uploadQueue = state.uploadQueue.filter((entry) => entry !== upload);
    upload.status = "cancelled";
    renderUpload(upload);
    if (upload.reservation?.fileId) void cancelCloudUpload({ fileId: upload.reservation.fileId }).catch(() => {});
    return;
  }
  state.uploads.delete(upload.localId);
  row.remove();
  updateUploadSummary();
}

async function reconcileUsage() {
  if (!dom.cloudReconcile || dom.cloudReconcile.disabled) return;
  dom.cloudReconcile.disabled = true;
  showStatus("Revisando el almacenamiento…");
  try {
    await reconcileCloudStorageUsage();
    await refreshCloudView();
    showStatus("Almacenamiento verificado.");
  } catch (error) {
    handleError(error, "No se pudo reconciliar el almacenamiento.");
  } finally {
    dom.cloudReconcile.disabled = false;
  }
}

function typeLabelFor(category, item = {}) {
  if (category === "image") return "Imagen";
  if (category === "pdf") return "PDF";
  if (category === "text") return item.mimeType === "text/markdown" ? "Markdown" : "Texto";
  return "Archivo";
}

function iconFor(category) {
  return ({ folder: "📁", "note-folder": "📂", note: "📝", image: "▧", pdf: "PDF", text: "TXT", file: "□" })[category] || "□";
}

function formatDate(value) {
  let date;
  if (typeof value?.toDate === "function") date = value.toDate();
  else if (Number.isFinite(value?.seconds)) date = new Date(value.seconds * 1000);
  else date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

function friendlyError(error, fallback) {
  const code = String(error?.code || "").replace(/^functions\//, "");
  const missing = Number(error?.details?.missingBytes || error?.details?.requiredBytes || 0);
  if (code === "resource-exhausted" || code === "storage/quota-exceeded") {
    return missing
      ? `No tienes suficiente espacio disponible en Mi nube. Necesitas liberar ${formatearBytes(missing)}.`
      : "No tienes suficiente espacio disponible en Mi nube.";
  }
  if (code.includes("unauthenticated")) return "Tu sesión terminó. Vuelve a iniciar sesión.";
  if (code.includes("permission-denied") || code.includes("unauthorized")) return "No tienes permiso para realizar esta acción.";
  if (code.includes("invalid-argument")) return error?.message || "Los datos del archivo no son válidos.";
  if (isCancelledError(error)) return "Carga cancelada.";
  if (code.includes("retry-limit-exceeded") || code.includes("network-request-failed") || code === "unavailable") return "Se perdió la conexión. Inténtalo de nuevo.";
  if (code.includes("object-not-found") || code === "not-found") return "El archivo ya no está disponible.";
  return error?.message && !/internal/i.test(error.message) ? error.message : fallback;
}

function isCancelledError(error) {
  return String(error?.code || "").includes("canceled") || /cancelad/i.test(String(error?.message || ""));
}

function handleError(error, fallback) {
  console.error("[MI NUBE]", error?.code || error?.name || "error");
  showStatus(friendlyError(error, fallback), true);
}

function showStatus(message, error = false) {
  if (!dom.cloudStatus) return;
  dom.cloudStatus.textContent = message;
  dom.cloudStatus.classList.toggle("error", Boolean(error));
  if (!message || (!error && /^(Cargando|Preparando|Revisando)/i.test(message)) || !dom.cloudToastRegion) return;
  const toast = document.createElement("div");
  toast.className = "cloud-toast";
  toast.dataset.tone = error ? "error" : "success";
  toast.textContent = message;
  dom.cloudToastRegion.append(toast);
  while (dom.cloudToastRegion.children.length > 4) dom.cloudToastRegion.firstElementChild?.remove();
  window.setTimeout(() => toast.remove(), error ? 6000 : 3800);
}

function setBusy(busy) {
  document.body.classList.toggle("cloud-loading", Boolean(busy));
  dom.cloudApp?.setAttribute("aria-busy", String(Boolean(busy)));
  dom.cloudItems?.setAttribute("aria-busy", String(Boolean(busy)));
  if (dom.cloudLoadMore) dom.cloudLoadMore.disabled = Boolean(busy);
}

function setInlineError(element, message) {
  if (!element) return;
  element.textContent = message || "";
  element.hidden = !message;
}

async function refreshCloudView() {
  let currentPath = [];
  if (state.currentFolderId) {
    try {
      const pathIds = new Set(construirBreadcrumbs(state.folders, state.currentFolderId).map((crumb) => crumb.id).filter(Boolean));
      currentPath = state.folders.filter((folder) => pathIds.has(folder.id));
    } catch { /* la consulta vigente reconstruirá las carpetas disponibles */ }
  }
  state.folders = currentPath;
  await loadFolders();
  await loadCurrentLocation();
}

function setFormBusy(form, busy) {
  form?.querySelectorAll("button, input, select").forEach((control) => { control.disabled = Boolean(busy); });
}

function preferenceKey(name) {
  return `cognicion:mi-nube:${name}:${state.uid || "anonimo"}`;
}

function readUserPreference(name, fallback) {
  try { return localStorage.getItem(preferenceKey(name)) || fallback; } catch { return fallback; }
}

function saveUserPreference(name, value) {
  try { localStorage.setItem(preferenceKey(name), value); } catch { /* preferencia opcional */ }
}
