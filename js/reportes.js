import { auth } from "./firebase.js";
import { guardarReporteUsuario } from "./services/reportes.js";
import { aplicarAparienciaGuardada, sincronizarAparienciaUsuario } from "./services/apariencia.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

asegurarCssApariencia();
aplicarAparienciaGuardada();

const TIPOS_REPORTE = [
  {
    valor: "problema",
    titulo: "Reportar un problema",
    descripcion: "Algo no funciona, aparece un error o una pantalla se comporta raro."
  },
  {
    valor: "sugerencia",
    titulo: "Reportar una sugerencia",
    descripcion: "Una mejora visual, de flujo o de claridad para Cognicion."
  },
  {
    valor: "peticion_personal",
    titulo: "Peticion personal",
    descripcion: "Una solicitud puntual relacionada con tu forma de usar la plataforma."
  },
  {
    valor: "nueva_funcionalidad",
    titulo: "Nueva funcionalidad",
    descripcion: "Una herramienta, modulo o capacidad nueva que quisieras agregar."
  }
];

const STORAGE_REPORTE_CONTRAIDO = "cognicion.reporteGlobal.contraido";
let usuarioActual = null;
let tipoSeleccionado = TIPOS_REPORTE[0].valor;

onAuthStateChanged(auth, (user) => {
  usuarioActual = user || null;
  if (user?.uid) sincronizarAparienciaUsuario(user.uid);
});

document.addEventListener("DOMContentLoaded", inicializarReporteGlobal);


function asegurarCssApariencia() {
  if (document.querySelector('link[href="css/apariencia.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/apariencia.css";
  document.head.appendChild(link);
}
function inicializarReporteGlobal() {
  if (document.getElementById("reporteGlobalWidget")) return;

  const raiz = document.createElement("div");
  raiz.id = "reporteGlobalWidget";
  if (localStorage.getItem(STORAGE_REPORTE_CONTRAIDO) === "1") {
    raiz.classList.add("reporte-widget-contraido");
  }
  raiz.innerHTML = `
    <button class="reporte-float-btn" type="button" aria-haspopup="dialog" aria-controls="reporteGlobalModal">
      <span>Reportar</span>
      <small>problema o sugerencia</small>
    </button>

    <button class="reporte-contraer-btn" type="button" aria-label="Contraer o mostrar boton de reportes">
      <span class="reporte-contraer-abierto">&gt;</span>
      <span class="reporte-contraer-cerrado">&lt;</span>
    </button>

    <div class="reporte-overlay" id="reporteGlobalOverlay" aria-hidden="true">
      <section class="reporte-modal" id="reporteGlobalModal" role="dialog" aria-modal="true" aria-labelledby="reporteGlobalTitulo">
        <button class="reporte-cerrar" type="button" aria-label="Cerrar reporte">x</button>

        <div class="reporte-modal-header">
          <span class="reporte-kicker">Centro de mejora</span>
          <h2 id="reporteGlobalTitulo">Reportar un problema, peticion o sugerencia</h2>
          <p>Tu mensaje llegara al centro de control del administrador para revisarlo.</p>
        </div>

        <div class="reporte-opciones" role="radiogroup" aria-label="Tipo de reporte">
          ${TIPOS_REPORTE.map((tipo, indice) => `
            <button class="reporte-opcion ${indice === 0 ? "activo" : ""}" type="button" data-tipo="${tipo.valor}" role="radio" aria-checked="${indice === 0 ? "true" : "false"}">
              <strong>${tipo.titulo}</strong>
              <span>${tipo.descripcion}</span>
            </button>
          `).join("")}
        </div>

        <label class="reporte-campo">
          <span>Titulo breve</span>
          <input id="reporteTitulo" maxlength="90" placeholder="Ej. Error al guardar nota">
        </label>

        <label class="reporte-campo">
          <span>Descripcion</span>
          <textarea id="reporteMensaje" rows="6" maxlength="1800" placeholder="Describe que paso, que esperabas o que te gustaria agregar."></textarea>
        </label>

        <div class="reporte-pagina">
          Pagina actual: <strong>${escaparHTML(window.location.pathname.split("/").pop() || "inicio")}</strong>
        </div>

        <div class="reporte-acciones">
          <p id="reporteEstado" aria-live="polite"></p>
          <button class="reporte-enviar" type="button">Enviar al admin</button>
        </div>
      </section>
    </div>
  `;

  document.body.appendChild(raiz);
  conectarEventosReporte(raiz);
}

function textoUtil(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "")
    .toLowerCase();
}

function pareceContenidoDePrueba(valor = "") {
  const util = textoUtil(valor);
  if (!util) return true;

  const caracteresUnicos = new Set(util.split("")).size;
  const contienePalabras = /[a-záéíóúñ]{3,}/i.test(valor);

  return caracteresUnicos <= 2 && !contienePalabras;
}

function validarReporteUsuario(titulo = "", mensaje = "") {
  const tituloUtil = textoUtil(titulo);
  const mensajeUtil = textoUtil(mensaje);

  if (tituloUtil.length < 5) {
    return { ok: false, mensaje: "Escribe un titulo con al menos 5 caracteres utiles." };
  }

  if (mensajeUtil.length < 15) {
    return { ok: false, mensaje: "Describe un poco mas el problema o sugerencia (minimo 15 caracteres utiles)." };
  }

  if (pareceContenidoDePrueba(titulo) || pareceContenidoDePrueba(mensaje)) {
    return { ok: false, mensaje: "El contenido parece de prueba. Escribe una descripcion breve pero clara." };
  }

  return { ok: true, mensaje: "" };
}
function conectarEventosReporte(raiz) {
  const botonAbrir = raiz.querySelector(".reporte-float-btn");
  const botonContraer = raiz.querySelector(".reporte-contraer-btn");
  const overlay = raiz.querySelector(".reporte-overlay");
  const modal = raiz.querySelector(".reporte-modal");
  const botonCerrar = raiz.querySelector(".reporte-cerrar");
  const botonEnviar = raiz.querySelector(".reporte-enviar");
  const estado = raiz.querySelector("#reporteEstado");
  const titulo = raiz.querySelector("#reporteTitulo");
  const mensaje = raiz.querySelector("#reporteMensaje");

  botonAbrir?.addEventListener("click", () => abrirModalReporte(overlay, mensaje));
  botonContraer?.addEventListener("click", () => alternarReporteContraido(raiz));
  botonCerrar?.addEventListener("click", () => cerrarModalReporte(overlay));

  overlay?.addEventListener("click", (evento) => {
    if (evento.target === overlay) cerrarModalReporte(overlay);
  });

  modal?.addEventListener("click", (evento) => evento.stopPropagation());

  raiz.querySelectorAll(".reporte-opcion").forEach((boton) => {
    boton.addEventListener("click", () => {
      tipoSeleccionado = boton.dataset.tipo || TIPOS_REPORTE[0].valor;
      raiz.querySelectorAll(".reporte-opcion").forEach((opcion) => {
        const activo = opcion === boton;
        opcion.classList.toggle("activo", activo);
        opcion.setAttribute("aria-checked", String(activo));
      });
    });
  });

  botonEnviar?.addEventListener("click", async () => {
    const texto = mensaje?.value.trim() || "";
    const tituloReporte = titulo?.value.trim() || "";

    const validacion = validarReporteUsuario(tituloReporte, texto);
    if (!validacion.ok) {
      estado.textContent = validacion.mensaje;
      estado.className = "reporte-error";
      (!tituloReporte ? titulo : mensaje)?.focus();
      return;
    }

    botonEnviar.disabled = true;
    estado.textContent = "Enviando...";
    estado.className = "";

    try {
      await guardarReporteUsuario({
        tipo: tipoSeleccionado,
        titulo: tituloReporte,
        mensaje: texto,
        pagina: window.location.pathname,
        url: window.location.href,
        estado: "nuevo",
        usuarioUid: usuarioActual?.uid || "",
        usuarioEmail: usuarioActual?.email || "",
        usuarioNombre: usuarioActual?.displayName || "",
        userAgent: navigator.userAgent || ""
      });

      estado.textContent = "Enviado. Gracias, quedo registrado para revision.";
      estado.className = "reporte-ok";
      if (titulo) titulo.value = "";
      if (mensaje) mensaje.value = "";
      setTimeout(() => cerrarModalReporte(overlay), 1000);
    } catch (error) {
      estado.textContent = "No se pudo enviar. Verifica tu sesion o permisos.";
      estado.className = "reporte-error";
      console.error("Error al enviar reporte:", error);
    } finally {
      botonEnviar.disabled = false;
    }
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && overlay?.classList.contains("abierto")) {
      cerrarModalReporte(overlay);
    }
  });
}

function alternarReporteContraido(raiz) {
  const contraido = !raiz.classList.contains("reporte-widget-contraido");
  raiz.classList.toggle("reporte-widget-contraido", contraido);
  localStorage.setItem(STORAGE_REPORTE_CONTRAIDO, contraido ? "1" : "0");
}

function abrirModalReporte(overlay, primerCampo) {
  overlay?.classList.add("abierto");
  overlay?.setAttribute("aria-hidden", "false");
  setTimeout(() => primerCampo?.focus(), 160);
}

function cerrarModalReporte(overlay) {
  overlay?.classList.remove("abierto");
  overlay?.setAttribute("aria-hidden", "true");
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
