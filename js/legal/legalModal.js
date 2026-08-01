let modalState = null;

function obtenerModal() {
  if (modalState) return modalState;
  const root = document.createElement("div");
  root.innerHTML = `<div class="legal-modal-backdrop oculto" data-legal-modal-backdrop><section class="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title" aria-describedby="legal-modal-content"><header><div><span class="legal-modal-type" data-legal-modal-type></span><h2 id="legal-modal-title" data-legal-modal-title></h2><p data-legal-modal-meta></p></div><button type="button" class="legal-modal-close" data-legal-modal-close aria-label="Cerrar documento">×</button></header><div class="legal-modal-content" id="legal-modal-content" data-legal-modal-content tabindex="0"></div><footer><button type="button" class="btn-secundario legal-modal-close" data-legal-modal-close>Cerrar</button></footer></section></div>`;
  document.body.append(root.firstElementChild);
  const backdrop = document.querySelector("[data-legal-modal-backdrop]");
  modalState = { backdrop, trigger: null, scrollTop: {} };
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) cerrarLegalModal(); });
  backdrop.querySelectorAll("[data-legal-modal-close]").forEach((button) => button.addEventListener("click", cerrarLegalModal));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !backdrop.classList.contains("oculto")) cerrarLegalModal(); });
  return modalState;
}

function abrirLegalModal(documento, trigger = null) {
  const state = obtenerModal();
  state.trigger = trigger || document.activeElement;
  state.backdrop.dataset.documentType = documento.type;
  state.backdrop.querySelector("[data-legal-modal-type]").textContent = documento.type;
  state.backdrop.querySelector("[data-legal-modal-title]").textContent = documento.title;
  state.backdrop.querySelector("[data-legal-modal-meta]").textContent = `Versión ${documento.version} · Última actualización: ${documento.updatedAt}`;
  const content = state.backdrop.querySelector("[data-legal-modal-content]");
  content.replaceChildren(...documento.sections.flatMap(([heading, text]) => { const section = document.createElement("section"); const h3 = document.createElement("h3"); h3.textContent = heading; const p = document.createElement("p"); p.textContent = text; section.append(h3, p); return [section]; }));
  content.scrollTop = state.scrollTop[documento.type] || 0;
  state.backdrop.classList.remove("oculto");
  document.body.classList.add("legal-modal-open");
  state.backdrop.querySelector("[data-legal-modal-close]").focus();
  console.log("[LEGAL][MODAL] Documento abierto", { documentType: documento.type, version: documento.version });
}

function cerrarLegalModal() {
  const state = obtenerModal();
  const type = state.backdrop.dataset.documentType;
  const content = state.backdrop.querySelector("[data-legal-modal-content]");
  state.scrollTop[type] = content.scrollTop;
  state.backdrop.classList.add("oculto");
  document.body.classList.remove("legal-modal-open");
  state.trigger?.focus?.();
  console.log("[LEGAL][MODAL] Documento cerrado", { documentType: type });
}

export { abrirLegalModal, cerrarLegalModal };
