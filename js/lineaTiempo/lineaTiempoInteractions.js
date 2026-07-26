import { MAX_ZOOM, MIN_ZOOM } from "./lineaTiempoUtils.js";

const ZOOM_STEP = 1.15;

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function distancia(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function puntoMedio(a, b) {
  return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
}

export function configurarInteracciones({ root, onSelect, onClearSelection, onZoom, onReset, onFocus }) {
  const viewport = root.querySelector("[data-timeline-scroll]");
  const range = root.querySelector("[data-zoom-range]");
  const disposables = [];
  const state = {
    zoom: 1,
    focusRatio: 0.5,
    hasFocusMarker: false,
    selectedGroupId: null,
    activePointers: new Map(),
    isDragging: false,
    isPinching: false,
    pinchDistance: 0,
    pinchZoom: 1,
    dragStartX: 0,
    dragScrollLeft: 0,
    movedDuringDrag: false
  };

  const timelineMetrics = () => {
    const width = viewport?.scrollWidth || 1;
    const start = width * 0.05;
    const usable = Math.max(1, width * 0.9);
    return { width, start, usable };
  };

  const ratioFromClientX = (clientX) => {
    if (!viewport) return state.focusRatio;
    const rect = viewport.getBoundingClientRect();
    const metrics = timelineMetrics();
    return limitar((clientX - rect.left + viewport.scrollLeft - metrics.start) / metrics.usable, 0, 1);
  };

  const setFocus = (clientX) => {
    state.focusRatio = ratioFromClientX(clientX);
    state.hasFocusMarker = true;
    onFocus?.(state.focusRatio);
  };

  const updateRange = () => {
    if (range) range.value = String(state.zoom);
    const label = root.querySelector("[data-zoom-label]");
    if (label) label.textContent = `${Math.round(state.zoom * 100)} %`;
  };

  const activateGroup = (group, keepSelected = true) => {
    if (!group) return;
    state.selectedGroupId = keepSelected ? group.dataset.groupId : null;
    root.querySelectorAll("[data-group-id]").forEach((item) => {
      const selected = item === group && keepSelected;
      item.dataset.selected = String(selected);
      item.dataset.cardVisible = String(item === group);
      item.setAttribute("aria-expanded", String(item === group));
      const marker = item.querySelector(".timeline-event__marker");
      const preview = item.querySelector(".timeline-event__preview");
      marker?.setAttribute("aria-expanded", String(selected));
      preview?.toggleAttribute("hidden", !selected);
      preview?.setAttribute("aria-hidden", String(!selected));
    });
  };

  const hideHoverGroup = (group) => {
    if (!group || group.dataset.selected === "true") return;
    group.dataset.cardVisible = "false";
    group.setAttribute("aria-expanded", "false");
    group.querySelector(".timeline-event__marker")?.setAttribute("aria-expanded", "false");
    group.querySelector(".timeline-event__preview")?.setAttribute("hidden", "");
    group.querySelector(".timeline-event__preview")?.setAttribute("aria-hidden", "true");
  };

  const showHoverGroup = (group) => {
    if (!group || group.dataset.selected === "true") return;
    group.dataset.cardVisible = "true";
    group.querySelector(".timeline-event__preview")?.removeAttribute("hidden");
    group.querySelector(".timeline-event__preview")?.setAttribute("aria-hidden", "false");
  };

  const closeSelected = () => {
    state.selectedGroupId = null;
    root.querySelectorAll("[data-group-id]").forEach((item) => {
      item.dataset.selected = "false";
      item.dataset.cardVisible = "false";
      item.setAttribute("aria-expanded", "false");
      item.querySelector(".timeline-event__marker")?.setAttribute("aria-expanded", "false");
      item.querySelector(".timeline-event__preview")?.setAttribute("hidden", "");
      item.querySelector(".timeline-event__preview")?.setAttribute("aria-hidden", "true");
    });
    onClearSelection?.();
  };

  const restoreFocusAfterZoom = (focusViewportX) => {
    requestAnimationFrame(() => {
      const newMetrics = timelineMetrics();
      const newFocusX = newMetrics.start + state.focusRatio * newMetrics.usable;
      const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = limitar(newFocusX - focusViewportX, 0, maxScroll);
    });
  };

  const applyZoom = (requestedZoom) => {
    if (!viewport) return;
    const oldMetrics = timelineMetrics();
    const oldFocusX = oldMetrics.start + state.focusRatio * oldMetrics.usable;
    const focusViewportX = oldFocusX - viewport.scrollLeft;
    state.zoom = limitar(requestedZoom, MIN_ZOOM, MAX_ZOOM);
    updateRange();
    onZoom?.(state.zoom, state.focusRatio, state.selectedGroupId, state.hasFocusMarker);
    restoreFocusAfterZoom(focusViewportX);
    requestAnimationFrame(() => activateGroup(
      [...root.querySelectorAll("[data-group-id]")].find((item) => item.dataset.groupId === state.selectedGroupId),
      Boolean(state.selectedGroupId)
    ));
  };

  const onClick = (event) => {
    if (state.movedDuringDrag) {
      state.movedDuringDrag = false;
      return;
    }
    const marker = event.target.closest(".timeline-event__marker");
    setFocus(event.clientX);
    if (marker) {
      const group = marker.closest("[data-group-id]");
      activateGroup(group, true);
      onSelect?.({ eventId: group.dataset.eventId, groupId: group.dataset.groupId });
    } else {
      closeSelected();
    }
  };

  const onPointerEnter = (event) => {
    if (event.relatedTarget?.closest?.(".timeline-event__marker")) return;
    const marker = event.target.closest(".timeline-event__marker");
    const group = marker?.closest("[data-group-id]");
    if (group && group.dataset.selected !== "true") showHoverGroup(group);
  };
  const onPointerLeave = (event) => {
    if (event.relatedTarget?.closest?.("[data-group-id]") === event.target.closest("[data-group-id]")) return;
    const group = event.target.closest("[data-group-id]");
    hideHoverGroup(group);
  };

  const onFocusIn = (event) => {
    const marker = event.target.closest(".timeline-event__marker");
    if (marker) showHoverGroup(marker.closest("[data-group-id]"));
  };

  const onFocusOut = (event) => {
    const group = event.target.closest("[data-group-id]");
    if (group && event.relatedTarget?.closest?.("[data-group-id]") !== group) hideHoverGroup(group);
  };

  const onKeydown = (event) => {
    const group = event.target.closest("[data-group-id]");
    if (!group) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSelected();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateGroup(group, true);
      onSelect?.({ eventId: group.dataset.eventId, groupId: group.dataset.groupId });
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const grupos = [...root.querySelectorAll("[data-group-id]")];
      const indice = grupos.indexOf(group);
      grupos[indice + (event.key === "ArrowRight" ? 1 : -1)]?.focus();
    }
  };

  const onWheel = (event) => {
    if (!event.target.closest("[data-timeline-scroll]")) return;
    setFocus(event.clientX);
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (horizontal) {
      event.preventDefault();
      viewport.scrollLeft += event.deltaX;
      return;
    }
    if (event.deltaY !== 0) {
      event.preventDefault();
      applyZoom(state.zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
    }
  };

  const onPointerDown = (event) => {
    if (!viewport) return;
    state.activePointers.set(event.pointerId, event);
    if (state.activePointers.size >= 2) {
      state.isPinching = true;
      viewport.classList.add("is-pinching");
      const pointers = [...state.activePointers.values()];
      state.pinchDistance = distancia(pointers[0], pointers[1]);
      state.pinchZoom = state.zoom;
      setFocus(puntoMedio(pointers[0], pointers[1]).clientX);
      return;
    }
    if (event.target.closest("[data-group-id], button, input, article")) return;
    state.isDragging = true;
    state.movedDuringDrag = false;
    state.dragStartX = event.clientX;
    state.dragScrollLeft = viewport.scrollLeft;
    viewport.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (state.activePointers.has(event.pointerId)) state.activePointers.set(event.pointerId, event);
    if (state.isPinching && state.activePointers.size >= 2) {
      const pointers = [...state.activePointers.values()];
      const currentDistance = distancia(pointers[0], pointers[1]);
      const center = puntoMedio(pointers[0], pointers[1]);
      setFocus(center.clientX);
      applyZoom(state.pinchZoom * (currentDistance / Math.max(1, state.pinchDistance)));
      return;
    }
    if (!state.isDragging || !viewport) return;
    const delta = event.clientX - state.dragStartX;
    if (Math.abs(delta) > 3) state.movedDuringDrag = true;
    viewport.scrollLeft = state.dragScrollLeft - delta;
  };

  const onPointerUp = (event) => {
    state.activePointers.delete(event.pointerId);
    if (state.activePointers.size < 2) {
      state.isPinching = false;
      viewport?.classList.remove("is-pinching");
    }
    state.isDragging = false;
  };

  const zoomOut = () => applyZoom(state.zoom / ZOOM_STEP);
  const zoomIn = () => applyZoom(state.zoom * ZOOM_STEP);
  const fit = () => { state.zoom = 1; updateRange(); onReset?.("fit"); };
  const reset = () => { state.zoom = 1; updateRange(); onReset?.("reset"); };
  const onRangeInput = () => applyZoom(Number(range.value));

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("pointerover", onPointerEnter);
  root.addEventListener("pointerout", onPointerLeave);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  viewport?.addEventListener("wheel", onWheel, { passive: false });
  viewport?.addEventListener("pointerdown", onPointerDown);
  viewport?.addEventListener("pointermove", onPointerMove);
  viewport?.addEventListener("pointerup", onPointerUp);
  viewport?.addEventListener("pointercancel", onPointerUp);
  root.querySelector("[data-action='zoom-out']")?.addEventListener("click", zoomOut);
  root.querySelector("[data-action='zoom-in']")?.addEventListener("click", zoomIn);
  root.querySelector("[data-action='fit']")?.addEventListener("click", fit);
  root.querySelector("[data-action='reset']")?.addEventListener("click", reset);
  range?.addEventListener("input", onRangeInput);
  updateRange();

  disposables.push(() => root.removeEventListener("click", onClick));
  disposables.push(() => root.removeEventListener("keydown", onKeydown));
  disposables.push(() => root.removeEventListener("pointerover", onPointerEnter));
  disposables.push(() => root.removeEventListener("pointerout", onPointerLeave));
  disposables.push(() => root.removeEventListener("focusin", onFocusIn));
  disposables.push(() => root.removeEventListener("focusout", onFocusOut));
  disposables.push(() => viewport?.removeEventListener("wheel", onWheel));
  disposables.push(() => viewport?.removeEventListener("pointerdown", onPointerDown));
  disposables.push(() => viewport?.removeEventListener("pointermove", onPointerMove));
  disposables.push(() => viewport?.removeEventListener("pointerup", onPointerUp));
  disposables.push(() => viewport?.removeEventListener("pointercancel", onPointerUp));
  disposables.push(() => root.querySelector("[data-action='zoom-out']")?.removeEventListener("click", zoomOut));
  disposables.push(() => root.querySelector("[data-action='zoom-in']")?.removeEventListener("click", zoomIn));
  disposables.push(() => root.querySelector("[data-action='fit']")?.removeEventListener("click", fit));
  disposables.push(() => root.querySelector("[data-action='reset']")?.removeEventListener("click", reset));
  disposables.push(() => range?.removeEventListener("input", onRangeInput));

  return {
    getZoom: () => state.zoom,
    getState: () => ({ ...state, activePointers: undefined }),
    destruir() { disposables.splice(0).forEach((dispose) => dispose()); }
  };
}
