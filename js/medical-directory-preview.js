const section = document.getElementById("profesionales");
async function load() {
  const status = section.querySelector("[data-directory-status]");
  try {
    const [{ getFeaturedProfessionals }, { renderCards }] = await Promise.all([
      import("./services/professionalsService.js"), import("./components/professionalCards.js")
    ]);
    const { professionals } = await getFeaturedProfessionals();
    renderCards(section.querySelector("[data-professional-grid]"), professionals);
    status.textContent = professionals.length ? "" : "Próximamente podrás conocer aquí a nuestros profesionales.";
  } catch {
    status.textContent = "No fue posible cargar los profesionales en este momento.";
    console.warn("[COGNICION][DIRECTORY] Vista previa no disponible.");
  } finally { section.setAttribute("aria-busy", "false"); }
}
if (section) {
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "180px" });
    observer.observe(section);
  } else void load();
}

