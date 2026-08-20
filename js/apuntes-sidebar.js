const MEDIA_SIDEBAR_LATERAL = "(min-width: 900px)";
const PREFIJO_ESTADO_SIDEBAR = "cognicion:apuntes:sidebar-retraida";

export function claveEstadoSidebarApuntes(uid = "") {
  const identificador = String(uid || "anonimo").trim() || "anonimo";
  return `${PREFIJO_ESTADO_SIDEBAR}:${identificador}`;
}

function leerPreferencia(almacenamiento, clave) {
  try {
    return almacenamiento?.getItem(clave) === "1";
  } catch (_) {
    return false;
  }
}

function guardarPreferencia(almacenamiento, clave, retraida) {
  try {
    almacenamiento?.setItem(clave, retraida ? "1" : "0");
  } catch (_) {
    // El panel sigue funcionando aunque el almacenamiento local no esté disponible.
  }
}

export function inicializarSidebarApuntes({
  uid = "",
  shell,
  sidebar,
  boton,
  ventana = globalThis.window,
  almacenamiento
} = {}) {
  if (!shell || !sidebar || !boton) return null;

  const consulta = ventana?.matchMedia?.(MEDIA_SIDEBAR_LATERAL) || {
    matches: true,
    addEventListener() {},
    removeEventListener() {}
  };
  let almacenamientoActivo = almacenamiento;
  if (almacenamientoActivo === undefined) {
    try {
      almacenamientoActivo = ventana?.localStorage;
    } catch (_) {
      almacenamientoActivo = null;
    }
  }

  const clave = claveEstadoSidebarApuntes(uid);
  let retraida = leerPreferencia(almacenamientoActivo, clave);

  const actualizarInterfaz = ({ persistir = false } = {}) => {
    const oculta = retraida && consulta.matches;
    const etiqueta = oculta ? "Mostrar panel lateral" : "Ocultar panel lateral";

    shell.classList.toggle("sidebar-retraida", retraida);
    sidebar.inert = oculta;
    if (oculta) sidebar.setAttribute("aria-hidden", "true");
    else sidebar.removeAttribute("aria-hidden");

    boton.setAttribute("aria-expanded", String(!oculta));
    boton.setAttribute("aria-label", etiqueta);
    boton.title = etiqueta;

    if (persistir) guardarPreferencia(almacenamientoActivo, clave, retraida);
    if (typeof ventana?.CustomEvent === "function") {
      shell.dispatchEvent(new ventana.CustomEvent("apuntes:sidebar", {
        detail: { retraida, oculta }
      }));
    }
  };

  const establecer = (siguienteEstado, { persistir = true } = {}) => {
    retraida = Boolean(siguienteEstado);
    actualizarInterfaz({ persistir });
  };
  const alternar = () => establecer(!retraida);
  const responderAlCambioDePantalla = () => actualizarInterfaz();

  boton.addEventListener("click", alternar);
  consulta.addEventListener?.("change", responderAlCambioDePantalla);
  actualizarInterfaz();

  return {
    alternar,
    establecer,
    estaRetraida: () => retraida,
    destruir() {
      boton.removeEventListener("click", alternar);
      consulta.removeEventListener?.("change", responderAlCambioDePantalla);
      sidebar.inert = false;
      sidebar.removeAttribute("aria-hidden");
    }
  };
}
