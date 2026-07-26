export function iniciarAnimacionADN(container) {
  if (!container) return { destruir() {} };
  const canvas = document.createElement("canvas");
  canvas.className = "timeline-dna-canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.replaceChildren(canvas);
  const context = canvas.getContext("2d", { alpha: true });
  let frame = 0;
  let raf = 0;
  let pausado = document.hidden;
  const reducirMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ajustar = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = container.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * ratio);
    canvas.height = Math.max(1, rect.height * ratio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const dibujar = () => {
    if (!context || pausado) return;
    const rect = container.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    const amplitud = Math.min(28, rect.width / 18);
    const ciclos = 2.6;
    context.lineWidth = 1.2;
    context.strokeStyle = "var(--timeline-dna-line)";
    const resolverColor = getComputedStyle(container).getPropertyValue("--timeline-dna-line").trim() || "rgba(79,149,105,.12)";
    context.strokeStyle = resolverColor;
    [0, Math.PI].forEach((fase) => {
      context.beginPath();
      for (let y = -20; y <= rect.height + 20; y += 4) {
        const x = rect.width * .72 + Math.sin(y / rect.height * Math.PI * ciclos + frame * .004 + fase) * amplitud;
        if (y === -20) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    });
    for (let y = 0; y < rect.height; y += 22) {
      const fase = y / rect.height * Math.PI * ciclos + frame * .004;
      const x1 = rect.width * .72 + Math.sin(fase) * amplitud;
      const x2 = rect.width * .72 + Math.sin(fase + Math.PI) * amplitud;
      context.beginPath();
      context.moveTo(x1, y);
      context.lineTo(x2, y + 11);
      context.stroke();
    }
    frame += 1;
    if (!reducirMovimiento) raf = requestAnimationFrame(dibujar);
  };
  const onVisibility = () => {
    pausado = document.hidden;
    if (!pausado && !reducirMovimiento) { cancelAnimationFrame(raf); raf = requestAnimationFrame(dibujar); }
  };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(ajustar) : null;
  observer?.observe(container);
  document.addEventListener("visibilitychange", onVisibility);
  ajustar();
  dibujar();
  return {
    pausar() { pausado = true; cancelAnimationFrame(raf); },
    destruir() {
      pausado = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
    }
  };
}
