import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ESCALAS_COGNITIVAS, calcularPuntajeEscalaCognitiva, interpretarEscalaCognitiva, obtenerPuntajesDominioCognitivo } from "./data/escalasCognitivas.js";
import { PRUEBAS_INTERACTIVAS, calcularPuntajePruebaInteractiva, interpretarPruebaInteractiva, obtenerPruebaInteractiva, puntajesDominioPruebaInteractiva } from "./data/pruebasInteractivas.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { guardarEscalaAplicada } from "./services/escalas.js?v=20260716-expediente-fix-2";

const escalas = [...ESCALAS_COGNITIVAS, ...PRUEBAS_INTERACTIVAS.filter((prueba) => !ESCALAS_COGNITIVAS.some((escala) => escala.id === prueba.id))];
let escalaActual = null;
let modoActual = "interactiva";
let resultadoActual = null;
let usuarioActualDatos = null;
let toastTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  renderizarEscalas();
  document.getElementById("buscarEscala")?.addEventListener("input", renderizarEscalas);
  document.getElementById("filtroCategoriaEscala")?.addEventListener("change", renderizarEscalas);
  document.querySelectorAll("[data-cerrar-escala]").forEach((el) => el.addEventListener("click", cerrarPanelEscala));
  document.querySelectorAll("[data-modo-escala]").forEach((boton) => boton.addEventListener("click", () => cambiarModo(boton.dataset.modoEscala)));
  document.getElementById("calcularEscala")?.addEventListener("click", calcularEscalaActual);
  document.getElementById("guardarEscala")?.addEventListener("click", guardarEscalaActual);
  document.getElementById("limpiarEscala")?.addEventListener("click", limpiarEscalaActual);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  usuarioActualDatos = await obtenerUsuario(user.uid).catch(() => null);
});

function renderizarEscalas() {
  const grid = document.getElementById("gridEscalas");
  const vacio = document.getElementById("sinEscalas");
  if (!grid) return;
  const busqueda = normalizarTexto(document.getElementById("buscarEscala")?.value || "");
  const categoria = document.getElementById("filtroCategoriaEscala")?.value || "";
  const filtradas = escalas.filter((escala) => {
    const tipo = escala.tipoEscala || (escala.area === "Cognitiva" ? "cognitiva" : "psiquiatrica");
    const texto = [escala.nombre, escala.subtitulo, escala.descripcion, escala.area, ...(escala.dominiosEvaluados || [])].join(" ");
    return (!categoria || tipo === categoria) && (!busqueda || normalizarTexto(texto).includes(busqueda));
  });

  grid.innerHTML = filtradas.map((escala) => {
    const interactiva = Boolean(obtenerPruebaInteractiva(escala.id) || escala.reactivos?.length);
    const tipo = escala.tipoEscala === "cognitiva" || escala.area === "Cognitiva" ? "Cognicion" : "Clinica";
    return `
      <article class="tarjeta-escala">
        <div class="tarjeta-icono">${escaparHTML((escala.nombre || "ES").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase())}</div>
        <span class="badge-escala">${escaparHTML(tipo)} · ${interactiva ? "Aplicable" : "Captura"}</span>
        <h3>${escaparHTML(escala.nombre)}</h3>
        <small>${escaparHTML(escala.subtitulo || escala.area || "Escala clinica")}</small>
        <p>${escaparHTML(escala.descripcion || "Instrumento clinico estructurado.")}</p>
        <ul>${(escala.dominiosEvaluados || []).slice(0, 6).map((d) => `<li>${escaparHTML(d)}</li>`).join("")}</ul>
        <div class="acciones-tarjeta-escala">
          <button type="button" data-aplicar-escala="${escaparHTML(escala.id)}">Aplicar prueba ahora</button>
          <button type="button" class="boton-secundario" data-capturar-escala="${escaparHTML(escala.id)}">Capturar resultado previo</button>
        </div>
      </article>`;
  }).join("");

  vacio?.classList.toggle("visible", filtradas.length === 0);
  grid.querySelectorAll("[data-aplicar-escala]").forEach((boton) => boton.addEventListener("click", () => abrirEscala(boton.dataset.aplicarEscala, "interactiva")));
  grid.querySelectorAll("[data-capturar-escala]").forEach((boton) => boton.addEventListener("click", () => abrirEscala(boton.dataset.capturarEscala, "manual")));
}

function abrirEscala(id, modo = "interactiva") {
  escalaActual = escalas.find((escala) => escala.id === id) || null;
  if (!escalaActual) return;
  modoActual = modo === "manual" ? "manual" : "interactiva";
  if (modoActual === "interactiva" && !obtenerBaseInteractiva(escalaActual)) modoActual = "manual";
  resultadoActual = null;
  document.getElementById("subtituloEscala").textContent = escalaActual.subtitulo || escalaActual.area || "Escala";
  document.getElementById("tituloEscala").textContent = escalaActual.nombre || "Escala";
  document.getElementById("descripcionEscala").textContent = escalaActual.descripcion || "";
  document.getElementById("observacionesEscala").value = "";
  document.getElementById("visibilidadEscalaPaciente").checked = false;
  actualizarModoVisual();
  renderizarFormulario();
  document.getElementById("resultadoEscala").innerHTML = `<strong>Resultado</strong><p>Aplica la prueba o captura puntajes y calcula el resultado.</p>`;
  document.getElementById("panelEscala")?.classList.add("abierto");
  document.getElementById("panelEscala")?.setAttribute("aria-hidden", "false");
}

function obtenerBaseInteractiva(escala) {
  return obtenerPruebaInteractiva(escala.id) || (escala.reactivos?.length ? escala : null);
}

function cambiarModo(modo) {
  if (modo === "interactiva" && !obtenerBaseInteractiva(escalaActual)) {
    mostrarToast("Esta escala solo permite captura estructurada por ahora.");
    return;
  }
  modoActual = modo === "manual" ? "manual" : "interactiva";
  resultadoActual = null;
  actualizarModoVisual();
  renderizarFormulario();
  document.getElementById("resultadoEscala").innerHTML = `<strong>Resultado</strong><p>Aplica la prueba o captura puntajes y calcula el resultado.</p>`;
}

function actualizarModoVisual() {
  document.querySelectorAll("[data-modo-escala]").forEach((boton) => boton.classList.toggle("activo", boton.dataset.modoEscala === modoActual));
  document.getElementById("modoAplicarEscala")?.toggleAttribute("disabled", !obtenerBaseInteractiva(escalaActual));
}

function renderizarFormulario() {
  const form = document.getElementById("formEscala");
  if (!form || !escalaActual) return;
  const base = modoActual === "interactiva" ? obtenerBaseInteractiva(escalaActual) : escalaActual;
  const items = modoActual === "interactiva" ? base?.reactivos || [] : base?.items || base?.reactivos || [];
  const oficial = base?.requiereInstrumentoOficial ? "<p><strong>Instrumento oficial:</strong> use material autorizado. Cognicion guia la aplicacion/captura sin reproducir contenido protegido.</p>" : "";
  document.getElementById("avisoEscala").innerHTML = `<p><strong>${modoActual === "manual" ? "Capturar resultado previo" : "Aplicar prueba ahora"}.</strong> Los resultados son apoyo clinico y no sustituyen valoracion medica o neuropsicologica.</p>${oficial}`;
  form.innerHTML = items.map((item, index) => {
    if (item.tipo === "select" || item.opciones) {
      const opciones = (item.opciones || []).map((opcion) => {
        const val = opcion.valor != null ? Number(opcion.valor) : 0;
        return `<option value="${val}">${escaparHTML(opcion.texto)} (${val})</option>`;
      }).join("");
      return `<label class="item-escala"><span>${index + 1}. ${escaparHTML(item.texto || `Item ${index + 1}`)}</span><select data-item-escala="${index}"><option value="">Seleccionar</option>${opciones}</select><small>${escaparHTML(item.dominio || "")}</small></label>`;
    }
    const minAttr = item.min != null ? item.min : "";
    const maxAttr = item.max != null ? item.max : "";
    const stepAttr = item.step != null ? item.step : 1;
    const placeholder = `${item.min != null ? item.min : ""}-${item.max != null ? item.max : ""}`;
    return `<label class="item-escala"><span>${index + 1}. ${escaparHTML(item.texto || `Item ${index + 1}`)}</span><input type="number" data-item-escala="${index}" min="${minAttr}" max="${maxAttr}" step="${stepAttr}" placeholder="${placeholder}"><small>${escaparHTML(item.dominio || "")}${item.max !== undefined ? ` · max ${escaparHTML(item.max)}` : ""}</small></label>`;
  }).join("");
}

function leerRespuestas(base) {
  const items = modoActual === "interactiva" ? base?.reactivos || [] : base?.items || base?.reactivos || [];
  const respuestas = [];
  let valido = true;
  document.querySelectorAll("[data-item-escala]").forEach((control) => {
    const index = Number(control.dataset.itemEscala);
    const item = items[index];
    const valor = control.value === "" ? null : Number(control.value);
    const min = item?.min != null ? Number(item.min) : Number.NEGATIVE_INFINITY;
    const max = item?.max != null ? Number(item.max) : Number.POSITIVE_INFINITY;
    const invalido = valor === null || Number.isNaN(valor) || valor < min || valor > max;
    control.classList.toggle("campo-error", invalido);
    if (invalido) valido = false;
    respuestas.push({ item: item?.texto || `Item ${index + 1}`, dominio: item?.dominio || "", valor });
  });
  return { respuestas, valido };
}

function calcularEscalaActual() {
  if (!escalaActual) return;
  const base = modoActual === "interactiva" ? obtenerBaseInteractiva(escalaActual) : escalaActual;
  const { respuestas, valido } = leerRespuestas(base);
  if (!valido) {
    mostrarToast("Responde todos los campos y revisa rangos marcados.");
    return;
  }
  const puntaje = modoActual === "interactiva" ? calcularPuntajePruebaInteractiva(base, respuestas) : calcularPuntajeEscalaCognitiva(base, respuestas);
  const interpretacion = modoActual === "interactiva" ? interpretarPruebaInteractiva(base, puntaje) : interpretarEscalaCognitiva(base, puntaje, respuestas);
  const dominios = modoActual === "interactiva" ? puntajesDominioPruebaInteractiva(respuestas) : obtenerPuntajesDominioCognitivo(respuestas);
  const observaciones = document.getElementById("observacionesEscala")?.value.trim() || "";
  const fechaAplicacion = new Date().toISOString();
  resultadoActual = { escala: base, respuestas, puntaje, interpretacion, dominios, observaciones, fechaAplicacion };
  const subpuntajes = Object.entries(dominios || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
  document.getElementById("resultadoEscala").innerHTML = `
    <strong>${escaparHTML(base.nombre)}: ${escaparHTML(puntaje)}${base.puntajeMaximo ? `/${escaparHTML(base.puntajeMaximo)}` : ""}</strong>
    <p>${escaparHTML(interpretacion)}</p>
    <p><strong>Aplicador:</strong> ${escaparHTML(usuarioActualDatos?.nombre || auth.currentUser?.email || "Usuario actual")}</p>
    <p><strong>Visible para paciente:</strong> ${document.getElementById("visibilidadEscalaPaciente")?.checked ? "Si" : "No"}</p>
    ${subpuntajes ? `<p><strong>Subpuntajes:</strong> ${escaparHTML(subpuntajes)}</p>` : ""}
  `;
}

async function guardarEscalaActual() {
  if (!resultadoActual) calcularEscalaActual();
  if (!resultadoActual) return;
  const params = new URLSearchParams(window.location.search);
  const idPaciente = params.get("id") || params.get("paciente") || "";
  if (!idPaciente) {
    guardarLocal(resultadoActual);
    mostrarToast("Resultado calculado y conservado localmente. Abre Escalas desde un paciente para guardarlo en expediente.");
    return;
  }
  const paciente = await obtenerUsuario(idPaciente).catch(() => null);
  const visible = Boolean(document.getElementById("visibilidadEscalaPaciente")?.checked);
  const { escala, respuestas, puntaje, interpretacion, dominios, observaciones, fechaAplicacion } = resultadoActual;
  const idEscalaAplicada = doc(collection(db, "usuarios", idPaciente, "escalasAplicadas")).id;
  const registro = {
    idEscalaAplicada,
    idPaciente,
    uidMedico: auth.currentUser?.uid || "",
    uidProfesional: auth.currentUser?.uid || "",
    rolProfesional: usuarioActualDatos?.rol || "",
    nombrePaciente: paciente?.nombre || paciente?.displayName || "Paciente",
    nombreEscala: escala.nombre,
    escalaId: escala.id,
    tipoEscala: escala.tipoEscala || escala.area || "cognitiva",
    fechaAplicacion,
    origen: "modulo_escalas",
    modoAplicacion: modoActual === "manual" ? "captura_resultado_previo" : "aplicacion_interactiva",
    puntajeTotal: puntaje,
    puntajeMaximo: escala.puntajeMaximo || "",
    dominiosEvaluados: escala.dominiosEvaluados || [],
    puntajesPorDominio: dominios || {},
    respuestasPorItem: respuestas,
    interpretacion,
    observaciones,
    observacionesClinicas: observaciones,
    recomendaciones: "Interpretar dentro del contexto clinico.",
    visibilidadPaciente: visible,
    visibleDesdePaciente: visible,
    medicoNombre: usuarioActualDatos?.nombre || auth.currentUser?.email || ""
  };
  await guardarEscalaAplicada(idPaciente, registro);
  mostrarToast("Resultado guardado en Escalas/Tamizajes del paciente.");
}

function guardarLocal(resultado) {
  const clave = `cognicion_escalas_local_${auth.currentUser?.uid || "anon"}`;
  const previos = JSON.parse(localStorage.getItem(clave) || "[]");
  previos.unshift({ ...resultado, guardadoLocal: true });
  localStorage.setItem(clave, JSON.stringify(previos.slice(0, 25)));
}

function limpiarEscalaActual() {
  resultadoActual = null;
  document.querySelectorAll("[data-item-escala]").forEach((control) => { control.value = ""; control.classList.remove("campo-error"); });
  const observaciones = document.getElementById("observacionesEscala");
  if (observaciones) observaciones.value = "";
  document.getElementById("resultadoEscala").innerHTML = `<strong>Resultado</strong><p>Aplica la prueba o captura puntajes y calcula el resultado.</p>`;
}

function cerrarPanelEscala() {
  document.getElementById("panelEscala")?.classList.remove("abierto");
  document.getElementById("panelEscala")?.setAttribute("aria-hidden", "true");
}

function mostrarToast(mensaje) {
  const toast = document.getElementById("toastEscalas");
  if (!toast) return;
  toast.textContent = mensaje;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function normalizarTexto(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escaparHTML(valor) {
  return String(valor || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}
