const CLAVE_VISTA_MODULOS = "cognicion:dashboard:vista-modulos";
const VISTA_PREDETERMINADA = "orbita";
const VISTAS_DISPONIBLES = new Set(["orbita", "tarjetas"]);

function normalizarVistaModulos(valor = "") {
  return VISTAS_DISPONIBLES.has(valor) ? valor : VISTA_PREDETERMINADA;
}

function obtenerVistaModulosGuardada() {
  try {
    return normalizarVistaModulos(localStorage.getItem(CLAVE_VISTA_MODULOS));
  } catch (_) {
    return VISTA_PREDETERMINADA;
  }
}

function guardarVistaModulos(vista) {
  const vistaSegura = normalizarVistaModulos(vista);
  try {
    localStorage.setItem(CLAVE_VISTA_MODULOS, vistaSegura);
  } catch (_) {
    // La vista sigue activa durante la sesión aunque el almacenamiento no esté disponible.
  }
  return vistaSegura;
}

function tarjetaDisponibleParaOrbita(tarjeta) {
  return Boolean(
    tarjeta
    && !tarjeta.hidden
    && tarjeta.getAttribute("aria-hidden") !== "true"
    && tarjeta.style.display !== "none"
  );
}

function limpiarEtiquetaAccion(texto = "") {
  const etiqueta = String(texto)
    .replace(/\s+/g, " ")
    .replace(/^(abrir|entrar al|iniciar)\s+/i, "")
    .trim();
  return etiqueta ? `${etiqueta.charAt(0).toUpperCase()}${etiqueta.slice(1)}` : "";
}

function abreviarEtiquetaOrbital(etiqueta = "") {
  const equivalencias = new Map([
    ["Ejercicios de rehabilitación cognitiva", "Rehabilitación"],
    ["Estadística médica", "Estadística"],
    ["Asistente de Respiración", "Respiración"],
    ["Laboratorio de Neurofisiología", "Neurofisiología"],
    ["Laboratorio de Farmacología", "Farmacología"],
    ["Laboratorio de Modelado Molecular", "Modelado molecular"],
    ["Biblioteca médica", "Biblioteca"]
  ]);
  return equivalencias.get(etiqueta) || etiqueta;
}

function extraerAccesosDesdeTarjetas(contenedorTarjetas) {
  const accesos = [];

  contenedorTarjetas?.querySelectorAll(".module-card").forEach((tarjeta) => {
    if (!tarjetaDisponibleParaOrbita(tarjeta)) return;

    const titulo = tarjeta.querySelector("h3")?.textContent?.trim() || "Módulo";
    const descripcion = tarjeta.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const acciones = [...tarjeta.querySelectorAll(".card-actions :is(a, button)")]
      .filter((accion) => !accion.disabled && accion.getAttribute("aria-hidden") !== "true");

    acciones.forEach((accion) => {
      const etiquetaAccion = limpiarEtiquetaAccion(accion.textContent);
      accesos.push({
        etiqueta: abreviarEtiquetaOrbital(acciones.length > 1 ? (etiquetaAccion || titulo) : titulo),
        descripcion,
        accionOriginal: accion
      });
    });
  });

  return accesos;
}

function crearTrayectoriaOrbital(acceso, indice, total) {
  const anguloInicial = (360 / Math.max(total, 1)) * indice;
  const trayectoria = document.createElement("div");
  trayectoria.className = "laboratory-orbit-track";
  trayectoria.style.setProperty("--orbit-start-angle", `${anguloInicial}deg`);
  trayectoria.style.setProperty("--orbit-end-angle", `${anguloInicial + 360}deg`);
  trayectoria.style.setProperty("--orbit-counter-start-angle", `${-anguloInicial}deg`);
  trayectoria.style.setProperty("--orbit-counter-end-angle", `${-(anguloInicial + 360)}deg`);

  const radio = document.createElement("div");
  radio.className = "laboratory-orbit-radius";
  const orientacion = document.createElement("div");
  orientacion.className = "laboratory-orbit-upright";
  const flotacion = document.createElement("div");
  flotacion.className = "laboratory-orbit-float";
  flotacion.style.animationDelay = `${-(indice % 5) * 0.37}s`;

  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "laboratory-orbit-action";
  boton.textContent = acceso.etiqueta;
  boton.title = acceso.descripcion || acceso.etiqueta;
  boton.setAttribute("aria-label", `${acceso.etiqueta}. ${acceso.descripcion}`.trim());
  boton.addEventListener("click", () => acceso.accionOriginal.click());

  flotacion.append(boton);
  orientacion.append(flotacion);
  radio.append(orientacion);
  trayectoria.append(radio);
  return trayectoria;
}

class OrbitaPanelPrincipal extends HTMLElement {
  constructor() {
    super();
    this.accesos = [];
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="css/public-laboratory-home.css?v=20260811-orbital-cta-v8">
      <style>
        :host {
          --public-cyan: #29d3ff;
          --public-blue: #168cff;
          --public-green: #58d68d;
          --orbita-fondo: rgba(3, 10, 16, .62);
          --orbita-borde: rgba(82, 152, 102, .22);
          display: block;
          color: var(--text, #eef4fb);
        }

        :host-context(html[data-theme="light"]) {
          --public-cyan: #087fae;
          --public-blue: #146fc2;
          --public-green: #287f50;
          --orbita-fondo: rgba(237, 246, 251, .9);
          --orbita-borde: rgba(20, 111, 194, .2);
        }

        :host-context(html[data-theme="biocelular"]) {
          --public-cyan: #ffbd58;
          --public-blue: #d45b4e;
          --public-green: #ff9d5c;
          --orbita-fondo: rgba(24, 3, 8, .44);
          --orbita-borde: rgba(255, 157, 92, .24);
        }

        .contenedor-orbital {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--orbita-borde);
          border-radius: 24px;
          background: var(--orbita-fondo);
          isolation: isolate;
        }

        .laboratory-stage {
          --orbit-width: 1120px;
          --orbit-height: 520px;
          --orbit-radius: 560px;
          --orbit-scale-y: .464286;
          --orbit-inverse-scale-y: 2.153845;
          min-height: 660px;
          overflow: hidden;
        }

        .laboratory-orbit-path,
        .laboratory-orbit-track {
          top: 50%;
        }

        .laboratory-orbit-path {
          border-color: color-mix(in srgb, var(--public-cyan) 34%, transparent);
        }

        .laboratory-stage-glow {
          bottom: 18%;
        }

        .laboratory-brain-visual {
          z-index: 3;
          width: min(700px, 72%);
        }

        .laboratory-orbit-action {
          width: clamp(108px, 10vw, 148px);
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 7px 10px;
          border: 1px solid color-mix(in srgb, var(--public-green) 48%, transparent);
          border-radius: 8px;
          color: inherit;
          background: color-mix(in srgb, var(--orbita-fondo) 88%, #02060b 12%);
          box-shadow: 0 10px 28px rgba(0, 0, 0, .28), 0 0 18px color-mix(in srgb, var(--public-cyan) 12%, transparent);
          font: 750 10px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
          text-align: center;
          text-wrap: balance;
          pointer-events: auto;
          cursor: pointer;
        }

        .laboratory-orbit-action:hover,
        .laboratory-orbit-action:focus-visible {
          border-color: var(--public-green);
          outline: none;
          box-shadow: 0 12px 34px rgba(0, 0, 0, .32), 0 0 24px color-mix(in srgb, var(--public-cyan) 24%, transparent);
        }

        .estado-vacio {
          position: absolute;
          z-index: 8;
          inset: auto 50% 28px auto;
          transform: translateX(50%);
          color: var(--muted, #9aa8ba);
          font-size: 12px;
        }

        @media (max-width: 1100px) {
          .laboratory-stage {
            --orbit-width: 820px;
            --orbit-height: 480px;
            --orbit-radius: 410px;
            --orbit-scale-y: .585366;
            --orbit-inverse-scale-y: 1.708334;
            min-height: 600px;
          }

          .laboratory-orbit-action {
            width: 116px;
            font-size: 9px;
          }
        }

        @media (max-width: 700px) {
          .contenedor-orbital {
            border-radius: 18px;
          }

          .laboratory-stage {
            --orbit-width: 360px;
            --orbit-height: 600px;
            --orbit-radius: 180px;
            --orbit-scale-y: 1.666667;
            --orbit-inverse-scale-y: .6;
            min-height: 690px;
          }

          .laboratory-brain-visual {
            width: min(430px, 118%);
          }

          .laboratory-orbit-action {
            width: 68px;
            min-height: 32px;
            padding: 5px 4px;
            font-size: 7.5px;
          }
        }

        @media (max-width: 390px) {
          .laboratory-stage {
            --orbit-width: 320px;
            --orbit-height: 580px;
            --orbit-radius: 160px;
            --orbit-scale-y: 1.8125;
            --orbit-inverse-scale-y: .551724;
          }

          .laboratory-orbit-action {
            width: 60px;
            font-size: 7px;
          }
        }
      </style>
      <section class="contenedor-orbital" aria-label="Accesos orbitales del Dashboard">
        <div class="laboratory-stage">
          <div class="laboratory-stage-glow" aria-hidden="true"></div>
          <div class="laboratory-orbit-path" aria-hidden="true"></div>
          <div data-trayectorias></div>
          <svg class="laboratory-brain-visual" viewBox="0 0 900 520" aria-hidden="true">
            <defs>
              <linearGradient id="brainFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#073f59" stop-opacity=".72"></stop><stop offset=".52" stop-color="#071b32" stop-opacity=".92"></stop><stop offset="1" stop-color="#04202e" stop-opacity=".8"></stop></linearGradient>
              <linearGradient id="brainLine" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#18a6ff"></stop><stop offset=".5" stop-color="#5beaff"></stop><stop offset="1" stop-color="#4cd488"></stop></linearGradient>
              <radialGradient id="platformFill"><stop offset="0" stop-color="#32d6ff" stop-opacity=".34"></stop><stop offset=".45" stop-color="#058ac5" stop-opacity=".13"></stop><stop offset="1" stop-color="#02101a" stop-opacity="0"></stop></radialGradient>
              <filter id="cyanGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="blur"></feGaussianBlur><feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>
              <pattern id="techGrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#23bfe8" stroke-opacity=".08" stroke-width="1"></path></pattern>
            </defs>
            <rect x="0" y="0" width="900" height="520" fill="url(#techGrid)" opacity=".7"></rect>
            <g class="brain-system" filter="url(#cyanGlow)">
              <path class="brain-shell" d="M446 93c-35-37-94-31-117 10-38-5-68 28-58 65-34 20-35 70-2 91-12 42 24 82 66 73 21 35 71 40 101 10V112c-1-7 3-13 10-19Z"></path>
              <path class="brain-shell" d="M454 93c35-37 94-31 117 10 38-5 68 28 58 65 34 20 35 70 2 91 12 42-24 82-66 73-21 35-71 40-101 10V112c1-7-3-13-10-19Z"></path>
              <path class="brain-divider" d="M450 102v237"></path>
              <g class="brain-folds">
                <path d="M416 119c-31-12-62 8-61 38-31-5-50 27-31 51-27 12-28 50-3 65-8 26 16 48 40 39"></path>
                <path d="M385 151c28 2 39 32 20 51 23 7 30 35 13 52 18 10 19 35 4 48"></path>
                <path d="M348 189c17-9 39-1 46 16M331 244c20-9 43 2 47 22M370 294c8-17 29-24 47-13"></path>
                <path d="M484 119c31-12 62 8 61 38 31-5 50 27 31 51 27 12 28 50 3 65 8 26-16 48-40 39"></path>
                <path d="M515 151c-28 2-39 32-20 51-23 7-30 35-13 52-18 10-19 35-4 48"></path>
                <path d="M552 189c-17-9-39-1-46 16M569 244c-20-9-43 2-47 22M530 294c-8-17-29-24-47-13"></path>
              </g>
              <g class="brain-nodes">
                <circle cx="344" cy="164" r="4"></circle><circle cx="391" cy="212" r="4"></circle><circle cx="354" cy="273" r="4"></circle><circle cx="416" cy="304" r="4"></circle>
                <circle cx="556" cy="164" r="4"></circle><circle cx="509" cy="212" r="4"></circle><circle cx="546" cy="273" r="4"></circle><circle cx="484" cy="304" r="4"></circle>
                <path d="M344 164 391 212l-37 61 62 31M556 164l-47 48 37 61-62 31"></path>
              </g>
            </g>
            <g class="platform-system">
              <ellipse cx="450" cy="420" rx="238" ry="63" fill="url(#platformFill)"></ellipse>
              <ellipse cx="450" cy="420" rx="230" ry="55" class="platform-ring ring-one"></ellipse>
              <ellipse cx="450" cy="420" rx="174" ry="39" class="platform-ring ring-two"></ellipse>
              <ellipse cx="450" cy="420" rx="108" ry="24" class="platform-ring ring-three"></ellipse>
              <path d="M250 420h400M306 399h288M326 441h248" class="platform-lines"></path>
            </g>
            <g class="stage-particles">
              <circle cx="176" cy="126" r="2"></circle><circle cx="250" cy="327" r="2"></circle><circle cx="701" cy="320" r="2"></circle><circle cx="742" cy="118" r="2"></circle><circle cx="627" cy="92" r="1.5"></circle><circle cx="294" cy="92" r="1.5"></circle>
            </g>
          </svg>
          <p class="estado-vacio" data-estado-vacio hidden>No hay módulos disponibles para este perfil.</p>
        </div>
      </section>
    `;
    this.contenedorTrayectorias = this.shadowRoot.querySelector("[data-trayectorias]");
    this.estadoVacio = this.shadowRoot.querySelector("[data-estado-vacio]");
  }

  establecerAccesos(accesos = []) {
    this.accesos = accesos;
    const fragmento = document.createDocumentFragment();
    accesos.forEach((acceso, indice) => {
      fragmento.append(crearTrayectoriaOrbital(acceso, indice, accesos.length));
    });
    this.contenedorTrayectorias.replaceChildren(fragmento);
    this.estadoVacio.hidden = accesos.length > 0;
    console.info(`[ÓRBITA DASHBOARD] ${accesos.length} accesos sincronizados.`);
  }
}

if (!customElements.get("orbita-panel-principal")) {
  customElements.define("orbita-panel-principal", OrbitaPanelPrincipal);
}

function inicializarVistaModulosDashboard() {
  const seccion = document.querySelector(".dashboard-section");
  const contenedorTarjetas = document.querySelector("[data-vista-tarjetas]");
  const orbita = document.querySelector("orbita-panel-principal");
  const botonesVista = [...document.querySelectorAll("[data-seleccionar-vista]")];
  if (!seccion || !contenedorTarjetas || !orbita || !botonesVista.length) return;

  const sincronizarAccesos = () => {
    orbita.establecerAccesos(extraerAccesosDesdeTarjetas(contenedorTarjetas));
  };

  const aplicarVista = (vistaSolicitada, guardar = false) => {
    const vista = guardar ? guardarVistaModulos(vistaSolicitada) : normalizarVistaModulos(vistaSolicitada);
    const mostrarOrbita = vista === "orbita";
    orbita.hidden = !mostrarOrbita;
    contenedorTarjetas.hidden = mostrarOrbita;
    seccion.dataset.vistaModulos = vista;
    botonesVista.forEach((boton) => {
      boton.setAttribute("aria-pressed", String(boton.dataset.seleccionarVista === vista));
    });
    if (mostrarOrbita) sincronizarAccesos();
    console.info(`[ÓRBITA DASHBOARD] Vista activa: ${vista}.`);
  };

  botonesVista.forEach((boton) => {
    boton.addEventListener("click", () => aplicarVista(boton.dataset.seleccionarVista, true));
  });

  const observadorTarjetas = new MutationObserver((cambios) => {
    if (cambios.some((cambio) => cambio.target.classList?.contains("module-card"))) {
      sincronizarAccesos();
    }
  });
  contenedorTarjetas.querySelectorAll(".module-card").forEach((tarjeta) => {
    observadorTarjetas.observe(tarjeta, { attributes: true, attributeFilter: ["hidden", "style", "aria-hidden"] });
  });

  window.addEventListener("beforeunload", () => observadorTarjetas.disconnect(), { once: true });
  sincronizarAccesos();
  aplicarVista(obtenerVistaModulosGuardada());
}

inicializarVistaModulosDashboard();
