import { MAX_ZOOM, MIN_ZOOM } from "./lineaTiempoUtils.js";

export function configurarInteracciones({ root, onSelect, onZoom, onReset }) {
  const timelineScroll = root.querySelector("[data-timeline-scroll]");
  const disposables = [];
  let arrastre = null;
  let zoom = 1;
  const onClick = (event) => {
    const grupo = event.target.closest("[data-group-id]");
    if (grupo) onSelect({ grupoId: grupo.dataset.groupId });
  };
  const onKeydown = (event) => {
    const grupo = event.target.closest("[data-group-id]");
    if (!grupo) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect({ grupoId: grupo.dataset.groupId });
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const grupos = [...root.querySelectorAll("[data-group-id]")];
      const indice = grupos.indexOf(grupo);
      const siguiente = grupos[indice + (event.key === "ArrowRight" ? 1 : -1)];
      siguiente?.focus();
    }
  };
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeydown);
  disposables.push(() => root.removeEventListener("click", onClick));
  disposables.push(() => root.removeEventListener("keydown", onKeydown));

  const aplicarZoom = (valor) => {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, valor));
    onZoom(zoom);
  };
  const zoomMenos = root.querySelector("[data-action='zoom-out']");
  const zoomMas = root.querySelector("[data-action='zoom-in']");
  const ajustar = root.querySelector("[data-action='fit']");
  const restablecer = root.querySelector("[data-action='reset']");
  const onZoomOut = () => aplicarZoom(zoom - .2);
  const onZoomIn = () => aplicarZoom(zoom + .2);
  const onFit = () => onReset("fit");
  const onResetClick = () => { zoom = 1; onReset("reset"); };
  zoomMenos?.addEventListener("click", onZoomOut);
  zoomMas?.addEventListener("click", onZoomIn);
  ajustar?.addEventListener("click", onFit);
  restablecer?.addEventListener("click", onResetClick);
  disposables.push(() => zoomMenos?.removeEventListener("click", onZoomOut));
  disposables.push(() => zoomMas?.removeEventListener("click", onZoomIn));
  disposables.push(() => ajustar?.removeEventListener("click", onFit));
  disposables.push(() => restablecer?.removeEventListener("click", onResetClick));

  const onWheel = (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    aplicarZoom(zoom + (event.deltaY < 0 ? .12 : -.12));
  };
  timelineScroll?.addEventListener("wheel", onWheel, { passive: false });
  disposables.push(() => timelineScroll?.removeEventListener("wheel", onWheel));

  const onPointerDown = (event) => {
    if (!timelineScroll || event.target.closest("button, [role='button']")) return;
    arrastre = { x: event.clientX, scrollLeft: timelineScroll.scrollLeft };
    timelineScroll.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!arrastre || !timelineScroll) return;
    timelineScroll.scrollLeft = arrastre.scrollLeft - (event.clientX - arrastre.x);
  };
  const onPointerUp = () => { arrastre = null; };
  timelineScroll?.addEventListener("pointerdown", onPointerDown);
  timelineScroll?.addEventListener("pointermove", onPointerMove);
  timelineScroll?.addEventListener("pointerup", onPointerUp);
  timelineScroll?.addEventListener("pointercancel", onPointerUp);
  disposables.push(() => {
    timelineScroll?.removeEventListener("pointerdown", onPointerDown);
    timelineScroll?.removeEventListener("pointermove", onPointerMove);
    timelineScroll?.removeEventListener("pointerup", onPointerUp);
    timelineScroll?.removeEventListener("pointercancel", onPointerUp);
  });

  return {
    getZoom: () => zoom,
    destruir() { disposables.splice(0).forEach((dispose) => dispose()); }
  };
}
