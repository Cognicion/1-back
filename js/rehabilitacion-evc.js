import { auth } from "./firebase.js";
import { aplicarAparienciaGuardada, sincronizarAparienciaUsuario } from "./services/apariencia.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  DOMINIOS_EVC,
  generarPlanEvc,
  resumirPlanEvc
} from "./rehabilitacion-evc-core.js?v=20260814-evc-plan-v1";

aplicarAparienciaGuardada();

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(window.location.search);
const idPaciente = parametros.get("id") || parametros.get("paciente") || "";
let uidUsuarioActual = "";
let planActual = null;
let temporizadorToast = null;

document.addEventListener("DOMContentLoaded", () => {
  renderizarDominios();
  configurarEnlaces();
  $("formEvaluacionEvc")?.addEventListener("submit", crearPlanDesdeFormulario);
  $("guardarPlanEvc")?.addEventListener("click", guardarBorradorLocal);
  $("copiarPlanEvc")?.addEventListener("click", copiarResumenPlan);
  $("imprimirPlanEvc")?.addEventListener("click", () => window.print());
  $("editarEvaluacionEvc")?.addEventListener("click", () => $("evaluacion")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  $("formEvaluacionEvc")?.addEventListener("input", marcarCambiosPendientes);
});

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }
  uidUsuarioActual = usuario.uid;
  await sincronizarAparienciaUsuario(usuario.uid);
  await cargarContextoPaciente();
  restaurarBorradorLocal();
});

function renderizarDominios() {
  const contenedor = $("dominiosEvaluacionEvc");
  if (!contenedor) return;
  contenedor.innerHTML = DOMINIOS_EVC.map((dominio, indice) => `
    <label class="dominio-evc" data-tarjeta-dominio="${dominio.id}" data-nivel="">
      <span class="dominio-evc-indice">${indice + 1}</span>
      <span class="dominio-evc-copy">
        <strong>${escaparHTML(dominio.nombre)}</strong>
        <small>${escaparHTML(dominio.descripcion)}</small>
      </span>
      <select name="dominio-${dominio.id}" data-dominio-evc="${dominio.id}" aria-label="Dificultad en ${escaparHTML(dominio.nombre)}">
        <option value="">No evaluado</option>
        <option value="0">0 · Sin dificultad</option>
        <option value="1">1 · Leve</option>
        <option value="2">2 · Moderada</option>
        <option value="3">3 · Marcada</option>
      </select>
    </label>
  `).join("");
  contenedor.querySelectorAll("[data-dominio-evc]").forEach((select) => {
    select.addEventListener("change", () => actualizarEstadoDominio(select));
  });
}

function actualizarEstadoDominio(select) {
  const tarjeta = select.closest("[data-tarjeta-dominio]");
  tarjeta?.classList.toggle("evaluado", select.value !== "");
  if (tarjeta) tarjeta.dataset.nivel = select.value;
  const evaluados = document.querySelectorAll("[data-dominio-evc]").length
    ? [...document.querySelectorAll("[data-dominio-evc]")].filter((campo) => campo.value !== "").length
    : 0;
  const estado = $("estadoEvaluacionEvc");
  if (estado) estado.textContent = evaluados ? `${evaluados} de ${DOMINIOS_EVC.length} evaluados` : "Sin evaluar";
}

function leerFormulario() {
  const dominios = {};
  document.querySelectorAll("[data-dominio-evc]").forEach((campo) => {
    dominios[campo.dataset.dominioEvc] = campo.value;
  });
  return {
    dominios,
    nombrePaciente: $("nombrePacienteEvc")?.value || "",
    fechaEvc: $("fechaEvc")?.value || "",
    fatiga: $("fatigaEvc")?.value || "1",
    apoyo: $("apoyoEvc")?.value || "ocasional",
    diasSemana: $("diasSemanaEvc")?.value || "3",
    metaPrincipal: $("metaPrincipalEvc")?.value || "",
    actividadSignificativa: $("actividadSignificativaEvc")?.value || "",
    observaciones: $("observacionesEvc")?.value || ""
  };
}

function crearPlanDesdeFormulario(evento) {
  evento.preventDefault();
  const error = $("errorEvaluacionEvc");
  if (error) error.textContent = "";
  if (!$("confirmacionEvc")?.checked) {
    if (error) error.textContent = "Confirma la estabilidad clínica y la revisión profesional antes de generar el plan.";
    $("confirmacionEvc")?.focus();
    return;
  }
  const resultado = generarPlanEvc(leerFormulario());
  if (!resultado.valido) {
    if (error) error.textContent = resultado.errores.join(" ");
    $("evaluacion")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  planActual = resultado;
  renderizarPlan(resultado);
  $("planEvc")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderizarPlan(plan) {
  const panel = $("planEvc");
  if (!panel) return;
  panel.hidden = false;
  $("fechaPlanEvc").textContent = `Generado ${new Date(plan.creadoEn).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", hour12: false })}. Revisión profesional requerida.`;
  $("metaPlanEvc").textContent = plan.metaFuncional;
  $("resumenPlanEvc").innerHTML = [
    ["Periodo inicial", `${plan.duracionInicialSemanas} semanas`],
    ["Frecuencia", `${plan.diasSemana} días/semana`],
    ["Sesión", `Hasta ${plan.minutosSesion} minutos`],
    ["Revisión", `Cada ${plan.revisionSemanas} semanas`]
  ].map(([etiqueta, valor]) => `<article><span>${etiqueta}</span><strong>${valor}</strong></article>`).join("");

  $("perfilDominiosEvc").innerHTML = plan.perfil.map((dominio) => `
    <div class="perfil-dominio-evc">
      <span>${escaparHTML(dominio.nombre)}</span>
      <div class="barra-perfil-evc" aria-hidden="true"><i style="--nivel:${dominio.puntaje === 0 ? 2 : (dominio.puntaje / 3) * 100}%"></i></div>
      <small>${escaparHTML(dominio.nivel)}</small>
    </div>
  `).join("");

  $("prioridadesPlanEvc").innerHTML = plan.prioridades.map((prioridad, indice) => `
    <article class="prioridad-plan-evc">
      <span>Prioridad ${indice + 1} · ${escaparHTML(prioridad.nivel)}</span>
      <h4>${escaparHTML(prioridad.nombre)}</h4>
      <p>${escaparHTML(prioridad.objetivo)}</p>
      <ul>${prioridad.estrategias.map((estrategia) => `<li>${escaparHTML(estrategia)}</li>`).join("")}</ul>
    </article>
  `).join("");

  $("actividadesPlanEvc").innerHTML = plan.actividades.map((actividad) => `
    <article class="actividad-plan-evc">
      <span>${escaparHTML(actividad.tipo)}</span>
      <h4>${escaparHTML(actividad.nombre)}</h4>
      <p>${escaparHTML(actividad.descripcion)}</p>
      <footer>
        <small>${actividad.minutos} min sugeridos</small>
        ${actividad.url ? `<a href="${escaparHTML(urlConPaciente(actividad.url))}">Abrir actividad</a>` : "<small>Práctica acompañada</small>"}
      </footer>
    </article>
  `).join("");

  $("apoyosPlanEvc").innerHTML = plan.apoyos.map((apoyo) => `<li>${escaparHTML(apoyo)}</li>`).join("");
  const contenedorAlertas = $("contenedorAlertasPlanEvc");
  contenedorAlertas.hidden = plan.alertas.length === 0;
  $("alertasPlanEvc").innerHTML = plan.alertas.map((alerta) => `<li>${escaparHTML(alerta)}</li>`).join("");
  $("estadoGuardadoEvc").textContent = "";
}

async function cargarContextoPaciente() {
  if (!idPaciente) return;
  const contexto = $("contextoPacienteEvc");
  const detalle = $("detallePacienteEvc");
  if (contexto) contexto.textContent = "Cargando paciente…";
  try {
    const paciente = await obtenerUsuario(idPaciente);
    const nombre = paciente?.nombreCompleto || paciente?.nombre || paciente?.displayName || "Paciente seleccionado";
    if (contexto) contexto.textContent = nombre;
    if (detalle) detalle.textContent = "El identificador del paciente se conservará al abrir las actividades.";
    if ($("nombrePacienteEvc")) $("nombrePacienteEvc").value = nombre;
  } catch (_) {
    if (contexto) contexto.textContent = "Paciente seleccionado";
    if (detalle) detalle.textContent = "No fue posible cargar el nombre; el identificador se conservará en la navegación.";
  }
}

function configurarEnlaces() {
  document.querySelectorAll("[data-volver-rehabilitacion]").forEach((enlace) => {
    enlace.href = urlConPaciente("rehabilitacion-cognitiva.html");
  });
}

function urlConPaciente(url) {
  if (!idPaciente) return url;
  const destino = new URL(url, window.location.href);
  destino.searchParams.set("id", idPaciente);
  return `${destino.pathname.split("/").pop()}${destino.search}`;
}

function claveBorrador() {
  return `cognicion:rehabilitacion-evc:borrador:${idPaciente || uidUsuarioActual || "general"}`;
}

function guardarBorradorLocal() {
  if (!planActual) return;
  try {
    localStorage.setItem(claveBorrador(), JSON.stringify({ version: 1, guardadoEn: new Date().toISOString(), evaluacion: planActual.evaluacion }));
    $("estadoGuardadoEvc").textContent = "Borrador guardado en este dispositivo. No se añadió al expediente clínico.";
    mostrarToast("Borrador guardado en este dispositivo.");
  } catch (_) {
    $("estadoGuardadoEvc").textContent = "No fue posible guardar el borrador en este dispositivo.";
  }
}

function restaurarBorradorLocal() {
  try {
    const registro = JSON.parse(localStorage.getItem(claveBorrador()) || "null");
    if (!registro?.evaluacion) return;
    cargarEvaluacionEnFormulario(registro.evaluacion);
    const restaurado = generarPlanEvc(registro.evaluacion);
    if (!restaurado.valido) return;
    planActual = restaurado;
    renderizarPlan(restaurado);
    $("estadoGuardadoEvc").textContent = `Borrador recuperado de este dispositivo${registro.guardadoEn ? ` · ${new Date(registro.guardadoEn).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", hour12: false })}` : ""}.`;
  } catch (_) {
    // Un borrador local inválido no debe impedir una nueva evaluación.
  }
}

function cargarEvaluacionEnFormulario(evaluacion) {
  const asignar = (id, valor) => { if ($(id) && valor !== undefined && valor !== null) $(id).value = String(valor); };
  if (!$("nombrePacienteEvc")?.value) asignar("nombrePacienteEvc", evaluacion.nombrePaciente);
  asignar("fechaEvc", evaluacion.fechaEvc);
  asignar("fatigaEvc", evaluacion.fatiga);
  asignar("apoyoEvc", evaluacion.apoyo);
  asignar("diasSemanaEvc", evaluacion.diasSemana);
  asignar("metaPrincipalEvc", evaluacion.metaPrincipal);
  asignar("actividadSignificativaEvc", evaluacion.actividadSignificativa);
  asignar("observacionesEvc", evaluacion.observaciones);
  document.querySelectorAll("[data-dominio-evc]").forEach((campo) => {
    const valor = evaluacion.dominios?.[campo.dataset.dominioEvc];
    campo.value = valor === null || valor === undefined ? "" : String(valor);
    actualizarEstadoDominio(campo);
  });
  if ($("confirmacionEvc")) $("confirmacionEvc").checked = true;
}

async function copiarResumenPlan() {
  if (!planActual) return;
  try {
    await navigator.clipboard.writeText(resumirPlanEvc(planActual));
    mostrarToast("Resumen copiado.");
  } catch (_) {
    mostrarToast("No fue posible copiar el resumen.");
  }
}

function marcarCambiosPendientes(evento) {
  if (!planActual || evento.target.closest("#planEvc")) return;
  const estado = $("estadoEvaluacionEvc");
  if (estado) estado.textContent = "Cambios pendientes de generar";
}

function mostrarToast(mensaje) {
  const toast = $("toastEvc");
  if (!toast) return;
  toast.textContent = mensaje;
  toast.classList.add("visible");
  window.clearTimeout(temporizadorToast);
  temporizadorToast = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export { leerFormulario, renderizarPlan };
