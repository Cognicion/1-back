import {
  crearObjectUrlPreview,
  prepararBlobParaPreview,
  resolverTipoPreviewCloud
} from "../cloud-preview-core.js?v=20260822-mi-nube-v2-090";
import {
  descargarBlobTemporalAdmin,
  listarArchivosNubeAdmin,
  solicitarAccesoArchivoNubeAdmin
} from "../services/cloudAdminModerationService.js?v=20260822-mi-nube-admin-v1";

const PAGE_SIZE = 40;
const PREVIEW_LIMITS = Object.freeze({ image: 32 * 1024 * 1024, pdf: 64 * 1024 * 1024, text: 2 * 1024 * 1024 });

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  })[character]);
}

function formatBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let amount = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)} ${unit}`;
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleString("es-MX", {
    dateStyle: "short", timeStyle: "short", hour12: false
  });
}

function friendlyError(error, fallback) {
  const code = String(error?.code || "").replace(/^functions\//u, "");
  if (code === "unauthenticated") return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (code === "permission-denied") return "No tienes autorización para consultar este almacenamiento.";
  if (code === "not-found") return "El archivo solicitado ya no está disponible.";
  if (code === "invalid-argument") return "La solicitud no es válida.";
  return fallback;
}

function trace(operation, result, startedAt, extra = {}) {
  console.info("[MiNube][AdminModeration]", {
    operation,
    result,
    durationMs: Math.max(0, performance.now() - startedAt),
    ...extra
  });
}

export function montarExploradorMiNubeAdmin(container, { ownerUid }) {
  if (!container || !ownerUid) throw new Error("No se pudo iniciar el explorador administrativo.");
  let destroyed = false;
  let loadGeneration = 0;
  let previewGeneration = 0;
  let activeObjectUrl = "";
  const state = {
    currentFolderId: null,
    deleted: false,
    breadcrumbs: [],
    items: [],
    nextCursor: null,
    usage: null,
    counts: null
  };

  container.innerHTML = `
    <section class="admin-cloud-explorer" aria-label="Explorador administrativo de Mi nube">
      <header class="admin-cloud-summary">
        <div><span>Almacenamiento</span><strong data-admin-cloud-usage>—</strong></div>
        <div><span>Archivos activos</span><strong data-admin-cloud-files>—</strong></div>
        <div><span>Carpetas</span><strong data-admin-cloud-folders>—</strong></div>
        <div><span>Papelera</span><strong data-admin-cloud-trash>—</strong></div>
      </header>
      <div class="admin-cloud-toolbar">
        <nav data-admin-cloud-breadcrumbs aria-label="Ubicación de Mi nube"></nav>
        <label>Estado
          <select data-admin-cloud-status>
            <option value="active">Activos</option>
            <option value="trash">Papelera</option>
          </select>
        </label>
      </div>
      <p class="admin-cloud-notice">Vista de moderación de solo lectura. Mis apuntes y las reservas de carga no se incluyen.</p>
      <div data-admin-cloud-status-message class="admin-cloud-status" role="status" aria-live="polite">Cargando…</div>
      <div class="admin-cloud-table-wrap">
        <table class="admin-cloud-table">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Tamaño</th><th>Fecha</th><th>Ubicación</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody data-admin-cloud-items></tbody>
        </table>
      </div>
      <button type="button" data-admin-cloud-more class="admin-cloud-more" hidden>Cargar más</button>
    </section>
    <dialog class="admin-cloud-preview" data-admin-cloud-preview>
      <header>
        <div><strong data-admin-cloud-preview-title>Vista previa</strong><span data-admin-cloud-preview-meta></span></div>
        <button type="button" data-admin-cloud-preview-close aria-label="Cerrar vista previa">Cerrar</button>
      </header>
      <div class="admin-cloud-preview-body" data-admin-cloud-preview-body></div>
      <footer>
        <button type="button" data-admin-cloud-preview-download>Descargar</button>
        <button type="button" data-admin-cloud-preview-zoom-out aria-label="Reducir zoom">−</button>
        <button type="button" data-admin-cloud-preview-fit>Ajustar</button>
        <button type="button" data-admin-cloud-preview-zoom-in aria-label="Aumentar zoom">+</button>
      </footer>
    </dialog>`;

  const dom = {
    breadcrumbs: container.querySelector("[data-admin-cloud-breadcrumbs]"),
    files: container.querySelector("[data-admin-cloud-files]"),
    folders: container.querySelector("[data-admin-cloud-folders]"),
    items: container.querySelector("[data-admin-cloud-items]"),
    more: container.querySelector("[data-admin-cloud-more]"),
    preview: container.querySelector("[data-admin-cloud-preview]"),
    previewBody: container.querySelector("[data-admin-cloud-preview-body]"),
    previewDownload: container.querySelector("[data-admin-cloud-preview-download]"),
    previewMeta: container.querySelector("[data-admin-cloud-preview-meta]"),
    previewTitle: container.querySelector("[data-admin-cloud-preview-title]"),
    status: container.querySelector("[data-admin-cloud-status-message]"),
    statusSelect: container.querySelector("[data-admin-cloud-status]"),
    trash: container.querySelector("[data-admin-cloud-trash]"),
    usage: container.querySelector("[data-admin-cloud-usage]")
  };
  let activePreviewItem = null;
  let previewScale = 1;

  function revokePreviewUrl() {
    if (!activeObjectUrl) return;
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
    trace("preview-object-url-revoke", "success", performance.now());
  }

  function closePreview() {
    previewGeneration += 1;
    revokePreviewUrl();
    activePreviewItem = null;
    dom.previewBody?.replaceChildren();
    if (dom.preview?.open) dom.preview.close();
  }

  function renderSummary() {
    const usage = state.usage || {};
    dom.usage.textContent = `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.maxBytes)}${usage.reservedBytes ? ` · ${formatBytes(usage.reservedBytes)} reservados` : ""}`;
    dom.files.textContent = String(state.counts?.activeFiles ?? 0);
    dom.folders.textContent = String(state.counts?.activeFolders ?? 0);
    dom.trash.textContent = String(state.counts?.trashItems ?? 0);
  }

  function renderBreadcrumbs() {
    const parts = [{ id: null, name: "Mi nube" }, ...state.breadcrumbs];
    dom.breadcrumbs.innerHTML = parts.map((part, index) => `
      <button type="button" data-admin-cloud-crumb="${index}" ${index === parts.length - 1 ? "aria-current=\"page\"" : ""}>${escapeHtml(part.name)}</button>
      ${index < parts.length - 1 ? "<span aria-hidden=\"true\">›</span>" : ""}
    `).join("");
  }

  function renderItems() {
    if (!state.items.length) {
      dom.items.innerHTML = '<tr><td colspan="7">Esta ubicación no contiene elementos.</td></tr>';
    } else {
      const location = ["Mi nube", ...state.breadcrumbs.map((item) => item.name)].join(" / ");
      dom.items.innerHTML = state.items.map((item) => `
        <tr>
          <td><button type="button" class="admin-cloud-name" data-admin-cloud-open="${escapeHtml(item.id)}">${item.type === "folder" ? "📁" : "📄"} ${escapeHtml(item.name)}</button></td>
          <td>${escapeHtml(item.type === "folder" ? "Carpeta" : (item.mimeType || item.extension || "Archivo"))}</td>
          <td>${item.type === "file" ? escapeHtml(formatBytes(item.sizeBytes)) : "—"}</td>
          <td>${escapeHtml(formatDate(item.updatedAt || item.createdAt))}</td>
          <td>${escapeHtml(location)}</td>
          <td><span class="admin-cloud-state ${item.deleted ? "is-trash" : ""}">${item.deleted ? "Papelera" : "Activo"}</span></td>
          <td>${item.type === "file" ? `
            <div class="admin-cloud-actions">
              <button type="button" data-admin-cloud-preview-file="${escapeHtml(item.id)}">Ver</button>
              <button type="button" data-admin-cloud-download-file="${escapeHtml(item.id)}">Descargar</button>
            </div>` : "—"}</td>
        </tr>`).join("");
    }
    dom.more.hidden = !state.nextCursor;
  }

  async function loadPage({ append = false } = {}) {
    const generation = ++loadGeneration;
    const startedAt = performance.now();
    dom.status.textContent = append ? "Cargando más elementos…" : "Consultando almacenamiento…";
    dom.more.disabled = true;
    try {
      const result = await listarArchivosNubeAdmin({
        ownerUid,
        parentFolderId: state.currentFolderId,
        deleted: state.deleted,
        pageSize: PAGE_SIZE,
        cursor: append ? state.nextCursor : null,
        includeSummary: !state.usage
      });
      if (destroyed || generation !== loadGeneration) return;
      state.items = append ? [...state.items, ...(result.items || [])] : (result.items || []);
      state.nextCursor = result.nextCursor || null;
      state.usage = result.usage || state.usage;
      state.counts = result.counts || state.counts;
      renderSummary();
      renderBreadcrumbs();
      renderItems();
      dom.status.textContent = `${state.items.length} elemento${state.items.length === 1 ? "" : "s"} en esta ubicación.`;
      trace("list", "success", startedAt, { itemCount: result.items?.length || 0 });
    } catch (error) {
      if (destroyed || generation !== loadGeneration) return;
      dom.status.textContent = friendlyError(error, "No fue posible consultar Mi nube.");
      if (!append) {
        state.items = [];
        renderItems();
      }
      trace("list", "error", startedAt, { errorCode: String(error?.code || "internal") });
    } finally {
      if (!destroyed && generation === loadGeneration) dom.more.disabled = false;
    }
  }

  function findItem(id) {
    return state.items.find((item) => item.id === id) || null;
  }

  function openFolder(item) {
    if (!item || item.type !== "folder") return;
    state.currentFolderId = item.id;
    state.breadcrumbs.push({ id: item.id, name: item.name });
    state.nextCursor = null;
    loadPage();
  }

  async function requestDownload(item) {
    const startedAt = performance.now();
    try {
      const access = await solicitarAccesoArchivoNubeAdmin({ ownerUid, fileId: item.id, operation: "download" });
      const link = document.createElement("a");
      link.href = access.url;
      link.rel = "noopener";
      link.download = item.name || "archivo";
      document.body.append(link);
      link.click();
      link.remove();
      trace("download", "success", startedAt);
    } catch (error) {
      dom.status.textContent = friendlyError(error, "No fue posible descargar el archivo.");
      trace("download", "error", startedAt, { errorCode: String(error?.code || "internal") });
    }
  }

  function applyPreviewScale() {
    const zoomable = dom.previewBody.querySelector("[data-admin-cloud-zoomable]");
    if (!zoomable) return;
    zoomable.style.transform = `scale(${previewScale})`;
    zoomable.style.transformOrigin = "center top";
  }

  async function openPreview(item) {
    const startedAt = performance.now();
    closePreview();
    const generation = ++previewGeneration;
    activePreviewItem = item;
    previewScale = 1;
    dom.previewTitle.textContent = item.name || "Vista previa";
    dom.previewMeta.textContent = `${item.mimeType || item.extension || "Archivo"} · ${formatBytes(item.sizeBytes)}`;
    dom.previewBody.innerHTML = "<p>Preparando vista previa privada…</p>";
    dom.preview.showModal();
    try {
      const kind = resolverTipoPreviewCloud(item);
      if (!kind) throw new Error("preview-not-supported");
      if (Number(item.sizeBytes) > PREVIEW_LIMITS[kind]) {
        const sizeError = new Error("preview-too-large");
        sizeError.code = "preview-too-large";
        throw sizeError;
      }
      const access = await solicitarAccesoArchivoNubeAdmin({ ownerUid, fileId: item.id, operation: "preview" });
      const blob = await descargarBlobTemporalAdmin(access.url);
      if (destroyed || generation !== previewGeneration || !dom.preview.open) return;
      if (kind === "text") {
        const pre = document.createElement("pre");
        pre.textContent = await blob.text();
        if (destroyed || generation !== previewGeneration || !dom.preview.open) return;
        dom.previewBody.replaceChildren(pre);
      } else {
        const previewBlob = prepararBlobParaPreview(blob, kind);
        activeObjectUrl = crearObjectUrlPreview(previewBlob);
        trace("preview-object-url-create", "success", startedAt, { mimeType: previewBlob.type, sizeBytes: previewBlob.size });
        if (kind === "pdf") {
          const iframe = document.createElement("iframe");
          iframe.src = activeObjectUrl;
          iframe.title = "Vista previa PDF administrativa";
          iframe.dataset.adminCloudZoomable = "";
          iframe.addEventListener("error", () => {
            if (generation !== previewGeneration) return;
            dom.previewBody.innerHTML = '<p>No fue posible previsualizar este PDF. Usa Descargar archivo.</p>';
          }, { once: true });
          dom.previewBody.replaceChildren(iframe);
        } else {
          const image = document.createElement("img");
          image.src = activeObjectUrl;
          image.alt = "Vista previa administrativa del archivo";
          image.dataset.adminCloudZoomable = "";
          dom.previewBody.replaceChildren(image);
        }
      }
      trace("preview", "success", startedAt, { mimeType: item.mimeType, sizeBytes: item.sizeBytes });
    } catch (error) {
      if (destroyed || generation !== previewGeneration) return;
      const message = error?.code === "preview-too-large"
        ? "El archivo es demasiado grande para previsualizarlo. Puedes descargarlo."
        : friendlyError(error, "No fue posible previsualizar este archivo. Puedes descargarlo.");
      dom.previewBody.innerHTML = `<p>${escapeHtml(message)}</p>`;
      trace("preview", "error", startedAt, { errorCode: String(error?.code || "internal") });
    }
  }

  container.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const openId = target.dataset.adminCloudOpen;
    const previewId = target.dataset.adminCloudPreviewFile;
    const downloadId = target.dataset.adminCloudDownloadFile;
    if (openId) {
      const item = findItem(openId);
      if (item?.type === "folder") openFolder(item);
      else if (item) openPreview(item);
    } else if (previewId) {
      const item = findItem(previewId);
      if (item) openPreview(item);
    } else if (downloadId) {
      const item = findItem(downloadId);
      if (item) requestDownload(item);
    } else if (target.hasAttribute("data-admin-cloud-more")) {
      loadPage({ append: true });
    } else if (target.dataset.adminCloudCrumb !== undefined) {
      const index = Number(target.dataset.adminCloudCrumb);
      state.breadcrumbs = index <= 0 ? [] : state.breadcrumbs.slice(0, index);
      state.currentFolderId = state.breadcrumbs.at(-1)?.id || null;
      state.nextCursor = null;
      loadPage();
    } else if (target.hasAttribute("data-admin-cloud-preview-close")) {
      closePreview();
    } else if (target.hasAttribute("data-admin-cloud-preview-download") && activePreviewItem) {
      requestDownload(activePreviewItem);
    } else if (target.hasAttribute("data-admin-cloud-preview-zoom-in")) {
      previewScale = Math.min(3, previewScale + 0.2);
      applyPreviewScale();
    } else if (target.hasAttribute("data-admin-cloud-preview-zoom-out")) {
      previewScale = Math.max(0.4, previewScale - 0.2);
      applyPreviewScale();
    } else if (target.hasAttribute("data-admin-cloud-preview-fit")) {
      previewScale = 1;
      applyPreviewScale();
    }
  });
  dom.statusSelect.addEventListener("change", () => {
    state.deleted = dom.statusSelect.value === "trash";
    state.currentFolderId = null;
    state.breadcrumbs = [];
    state.nextCursor = null;
    loadPage();
  });
  dom.preview.addEventListener("close", closePreview);
  dom.preview.addEventListener("click", (event) => {
    if (event.target === dom.preview) closePreview();
  });
  loadPage();

  return () => {
    destroyed = true;
    loadGeneration += 1;
    closePreview();
    container.replaceChildren();
  };
}
