const CLAVE_DESTINO = "cognicion.accesosRapidos.destino";

export const OPCIONES_ACCESOS_RAPIDOS = Object.freeze([
  { value: "dashboard.html", label: "Dashboard" },
  { value: "medico.html", label: "Panel médico" },
  { value: "pacientes.html", label: "Pacientes" },
  { value: "nuevo-paciente.html", label: "Nuevo paciente" },
  { value: "agenda.html", label: "Agenda" },
  { value: "nota.html", label: "Notas clínicas" },
  { value: "calculadoras-medicas.html", label: "Calculadoras médicas" },
  { value: "calculadora-benzodiacepinas.html", label: "Benzodiacepinas" },
  { value: "calculadoras-pediatricas.html", label: "Calculadoras pediátricas" },
  { value: "escalas.html", label: "Escalas clínicas" },
  { value: "laboratorio-farmacologia.html", label: "Laboratorio de farmacología" },
  { value: "biblioteca.html", label: "Biblioteca" },
  { value: "sofia.html", label: "SOFIA" },
  { value: "configuracion.html", label: "Configuración" }
]);

function asegurarEstilos() {
  if (document.querySelector('link[data-estilos-accesos-rapidos]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/accesos-rapidos.css";
  link.dataset.estilosAccesosRapidos = "true";
  document.head.appendChild(link);
}

function destinoGuardado() {
  try {
    const value = localStorage.getItem(CLAVE_DESTINO) || "dashboard.html";
    return OPCIONES_ACCESOS_RAPIDOS.some((opcion) => opcion.value === value) ? value : "dashboard.html";
  } catch {
    return "dashboard.html";
  }
}

function guardarDestino(value) {
  try {
    localStorage.setItem(CLAVE_DESTINO, value);
  } catch {
    // La navegación sigue funcionando aunque el navegador bloquee el almacenamiento.
  }
}

function escaparHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cerrarOtros(actual) {
  document.querySelectorAll("[data-accesos-rapidos].abierto").forEach((contenedor) => {
    if (contenedor !== actual) cerrarPanel(contenedor);
  });
}

function cerrarPanel(contenedor) {
  contenedor.classList.remove("abierto");
  contenedor.querySelector("[data-acceso-toggle]")?.setAttribute("aria-expanded", "false");
  contenedor.querySelector("[data-acceso-panel]")?.setAttribute("aria-hidden", "true");
}

function actualizarPreferencia(contenedor, value) {
  const opcion = OPCIONES_ACCESOS_RAPIDOS.find((item) => item.value === value) || OPCIONES_ACCESOS_RAPIDOS[0];
  const estado = contenedor.querySelector("[data-acceso-estado]");
  if (estado) estado.textContent = `Destino guardado: ${opcion.label}`;
}

function renderizar(contenedor) {
  if (contenedor.dataset.accesosInicializados === "true") return;
  const guardado = destinoGuardado();
  const opciones = OPCIONES_ACCESOS_RAPIDOS.map((opcion) => (
    `<option value="${escaparHTML(opcion.value)}"${opcion.value === guardado ? " selected" : ""}>${escaparHTML(opcion.label)}</option>`
  )).join("");
  contenedor.classList.add("accesos-rapidos");
  contenedor.innerHTML = `
    <button class="accesos-rapidos-toggle" type="button" data-acceso-toggle aria-expanded="false">
      <span aria-hidden="true">⚡</span> Accesos rápidos
    </button>
    <div class="accesos-rapidos-panel" data-acceso-panel aria-hidden="true">
      <strong>Elige tu destino</strong>
      <p>Selecciona a dónde quieres ir y guárdalo para la próxima vez.</p>
      <label>
        Destino
        <select data-acceso-select>${opciones}</select>
      </label>
      <div class="accesos-rapidos-acciones">
        <button type="button" data-acceso-ir>Ir ahora</button>
        <button type="button" class="secundario" data-acceso-guardar>Guardar</button>
      </div>
      <small data-acceso-estado></small>
    </div>`;
  contenedor.dataset.accesosInicializados = "true";
  actualizarPreferencia(contenedor, guardado);

  const toggle = contenedor.querySelector("[data-acceso-toggle]");
  const panel = contenedor.querySelector("[data-acceso-panel]");
  const select = contenedor.querySelector("[data-acceso-select]");
  toggle.addEventListener("click", () => {
    const abrir = !contenedor.classList.contains("abierto");
    cerrarOtros(contenedor);
    contenedor.classList.toggle("abierto", abrir);
    toggle.setAttribute("aria-expanded", String(abrir));
    panel.setAttribute("aria-hidden", String(!abrir));
    if (abrir) select.focus();
  });
  contenedor.querySelector("[data-acceso-ir]").addEventListener("click", () => {
    window.location.href = select.value;
  });
  contenedor.querySelector("[data-acceso-guardar]").addEventListener("click", () => {
    guardarDestino(select.value);
    actualizarPreferencia(contenedor, select.value);
  });
}

export function inicializarAccesosRapidos(root = document) {
  asegurarEstilos();
  root.querySelectorAll("[data-accesos-rapidos]").forEach(renderizar);
}

document.addEventListener("click", (event) => {
  document.querySelectorAll("[data-accesos-rapidos].abierto").forEach((contenedor) => {
    if (!contenedor.contains(event.target)) cerrarPanel(contenedor);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll("[data-accesos-rapidos].abierto").forEach(cerrarPanel);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => inicializarAccesosRapidos());
} else {
  inicializarAccesosRapidos();
}
