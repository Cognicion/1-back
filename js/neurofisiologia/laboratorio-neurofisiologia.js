import { aplicarPresetMembrana, construirTablaIonica, calcularGHK, calcularPotencialesEquilibrio, ESTADO_MEMBRANA_BASE, IONES, PRESETS_MEMBRANA, sustituirEcuacionGHK, sustituirEcuacionNernst, validarEstadoMembrana } from "./ionModel.js";
import { simularPotencialAccion } from "./actionPotentialModel.js";
import { simularPropagacionAxonal } from "./axonPropagationModel.js";
import { EXPERIMENTOS_NEUROFISIOLOGIA } from "./experimentManager.js";
import { duplicarProyectoLaboratorio, eliminarProyectoLaboratorio, exportarCSVLaboratorio, guardarProyectoLaboratorio, listarProyectosLaboratorio } from "./labNotebook.js";
import { REGISTRO_FARMACOS_NEURO } from "./drugRegistry.js";
import { crearUiModeNeuro, GRAFICAS_POR_NIVEL, PASOS_TUTORIAL_NEURO } from "./learningModeController.js";
import { REGISTRO_ECUACIONES_NEURO } from "./equationRegistry.js";
import { aplicarFarmacoIntegrado, avanzarNeuronaIntegrada, crearEstadoNeuronaIntegrada, estimularNeuronaIntegrada, limpiarFarmacosIntegrados, actualizarParametrosIntegrados } from "./integratedNeuronModel.js";
import { dibujarGraficaIntegrada, poblarSelectorEcuaciones, poblarSelectorGraficas, renderizarEscenaIntegrada, renderizarExplicacionIntegrada, renderizarIndicadoresIntegrados, renderizarMatematicasIntegradas, renderizarTarjetaEstadoActual, renderizarVariablesIntegradas, resumenCopiableEcuacion } from "./integratedNeuronRenderer.js";


const $ = (id) => document.getElementById(id);
let estadoMembrana = aplicarPresetMembrana("fisiologica");
let membranaActiva = false;
let accionActiva = false;
let axonActivo = false;
let rafMembrana = null;
let rafAccion = null;
let rafAxon = null;
let tiempoAccion = 0;
let tiempoAxon = 0;
let resultadoAccion = simularPotencialAccion();
let superposiciones = [];
let resultadoAxon = simularPropagacionAxonal();
let ultimoProyecto = null;
let integradaActiva = false;
let rafIntegrada = null;
let estadoIntegrado = crearEstadoNeuronaIntegrada();
let graficasIntegradasVisibles = new Set(["Vm"]);
let ecuacionCongelada = null;
let uiModeNeuro = crearUiModeNeuro();
let tutorialVistoNeuro = localStorage.getItem("cognicionNeuroTutorialVisto") === "1";
const escena = $("escenaMembrana");
const graficaAccion = $("graficaAccion");
const graficaAxon = $("graficaAxon");
const graficaIntegrada = $("graficaIntegrada");

inicializar();

function factorTiempoGlobalNeuro() {
  const valor = Number($("globalPlaybackNeuro")?.value || 1);
  return Math.max(0.05, Math.min(8, valor));
}

function configurarSaltosEntreSimuladores() {
  document.querySelectorAll("[data-lab-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const destino = btn.dataset.labJump;
      if (destino === "accion") actualizarAccion();
      if (destino === "axon") actualizarAxon();
      cambiarTab(destino);
    });
  });
}
function inicializar() {
  document.querySelectorAll(".tabs-lab button").forEach((btn) => btn.addEventListener("click", () => cambiarTab(btn.dataset.tab)));
  poblarPresets();
  vincularIntegrada();
  vincularMembrana();
  vincularAccion();
  vincularAxon();
  renderizarExperimentos();
  configurarSaltosEntreSimuladores();
  vincularCuaderno();
  sincronizarControlesMembrana();
  renderizarMembrana();
  actualizarAccion();
  actualizarAxon();
  renderizarProyectos();
}

function cambiarTab(tab) {
  document.querySelectorAll(".tabs-lab button").forEach((b) => b.classList.toggle("activo", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("activo", p.id === `tab-${tab}`));
}

function poblarPresets() {
  const select = $("presetMembrana");
  select.innerHTML = Object.entries(PRESETS_MEMBRANA).map(([id, p]) => `<option value="${id}">${p.nombre}</option>`).join("") + `<option value="fisiologica">Restablecer valores fisiologicos</option>`;
}

function leerTiempoIonicoMembrana() {
  const valor = Number($("tiempoIonesMembrana")?.value || 2.5);
  return Math.max(0.6, Math.min(6, valor));
}

function actualizarEtiquetaTiempoIonico() {
  const escala = leerTiempoIonicoMembrana();
  const etiqueta = $("tiempoIonesMembranaValor");
  if (etiqueta) etiqueta.textContent = `${escala.toFixed(1)}x mas lento`;
  if (escena) escena.style.setProperty("--ion-time-scale", escala.toFixed(2));
}
function vincularMembrana() {
  $("presetMembrana").addEventListener("change", (e) => { estadoMembrana = aplicarPresetMembrana(e.target.value); sincronizarControlesMembrana(); renderizarMembrana(); actualizarAccion(); actualizarAxon(); });
  document.querySelectorAll("[data-ion]").forEach((input) => input.addEventListener("input", () => { const [ion, lugar] = input.dataset.ion.split("."); estadoMembrana.concentraciones[ion][lugar] = Number(input.value); renderizarMembrana(); }));
  document.querySelectorAll("[data-perm]").forEach((input) => input.addEventListener("input", () => { estadoMembrana.permeabilidades[input.dataset.perm] = Number(input.value); renderizarMembrana(); }));
  document.querySelector("[data-membrana='temperaturaC']").addEventListener("input", (e) => { estadoMembrana.temperaturaC = Number(e.target.value); renderizarMembrana(); actualizarAxon(); });
  $("bombaNaK").addEventListener("input", (e) => { estadoMembrana.bombaNaK = Number(e.target.value); renderizarMembrana(); });
  $("zoomMembrana").addEventListener("input", (e) => { escena.style.transform = `scale(${e.target.value})`; });
  $("tiempoIonesMembrana")?.addEventListener("input", () => { actualizarEtiquetaTiempoIonico(); renderizarMembrana(); });
  ["verIones", "verCargas", "verCanales", "verFlechas"].forEach((id) => $(id).addEventListener("change", renderizarMembrana));
  ["ionActivoMembrana", "vistaMembrana", "drogaAbusoMembrana"].forEach((id) => $(id)?.addEventListener("change", renderizarMembrana));
  $("btnMembranaPlay").addEventListener("click", () => { membranaActiva = true; animarMembrana(); });
  $("btnMembranaPausa").addEventListener("click", () => { membranaActiva = false; cancelAnimationFrame(rafMembrana); });
  $("btnMembranaReset").addEventListener("click", () => { estadoMembrana = aplicarPresetMembrana("fisiologica"); sincronizarControlesMembrana(); renderizarMembrana(); });
  $("btnMembranaPaso").addEventListener("click", () => desplazarIones(true));
}

function sincronizarControlesMembrana() {
  document.querySelector("[data-membrana='temperaturaC']").value = estadoMembrana.temperaturaC;
  Object.entries(estadoMembrana.concentraciones).forEach(([ion, vals]) => { document.querySelector(`[data-ion='${ion}.extra']`).value = vals.extra; document.querySelector(`[data-ion='${ion}.intra']`).value = vals.intra; });
  Object.entries(estadoMembrana.permeabilidades).forEach(([ion, val]) => { const input = document.querySelector(`[data-perm='${ion}']`); if (input) input.value = val; });
  $("bombaNaK").value = estadoMembrana.bombaNaK;
}

function renderizarMembrana() {
  escena.querySelectorAll(".ion,.flecha-flujo,.carga,.ion-flujo-dirigido,.canal-selectivo,.droga-abuso-molecula").forEach((n) => n.remove());
  escena.classList.remove("vista-corte", "vista-sinapsis");
  const vm = calcularGHK(estadoMembrana);
  const potenciales = calcularPotencialesEquilibrio(estadoMembrana);
  const validacion = validarEstadoMembrana(estadoMembrana);
  const tabla = construirTablaIonica(estadoMembrana);
  const ionActivo = $("ionActivoMembrana")?.value || "na";
  const vista = $("vistaMembrana")?.value || "membrana";
  const droga = $("drogaAbusoMembrana")?.value || "ninguna";
  aplicarVistaEducativaMembrana(vista);
  if ($("verIones").checked) crearIonesVisuales();
  if ($("verFlechas").checked) crearFlechasVisuales();
  escena.classList.toggle("sin-canales", !$("verCanales").checked);
  crearCanalSelectivoMembrana(tabla, ionActivo, droga);
  crearFlujoDirigidoMembrana(tabla, ionActivo, droga);
  renderizarPanelNeurovisualMembrana(tabla, ionActivo, vista, droga, vm, potenciales);
  $("indicadoresMembrana").innerHTML = [
    ["Vm actual", `${vm.toFixed(1)} mV`], ["ENa", `${potenciales.na.toFixed(1)} mV`], ["EK", `${potenciales.k.toFixed(1)} mV`], ["ECl", `${potenciales.cl.toFixed(1)} mV`], ["ECa", `${potenciales.ca.toFixed(1)} mV`], ["Bomba Na/K", `${Math.round(estadoMembrana.bombaNaK * 100)}%`]
  ].map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("") + validacion.advertencias.map((a) => `<article><span>Advertencia</span><strong>${a}</strong></article>`).join("");
  $("tablaIonica").querySelector("tbody").innerHTML = tabla.map((r) => `<tr class="${r.ion.id === ionActivo ? "ion-activo-row" : ""}"><td style="color:${r.ion.color}">${r.ion.etiqueta}</td><td>${r.intra}</td><td>${r.extra}</td><td>${Number(r.permeabilidad).toFixed(3)}</td><td>${r.potencial.toFixed(1)} mV</td><td>${r.flujo.direccion}</td></tr>`).join("");
  $("ecuacionesMembrana").innerHTML = `<code>${sustituirEcuacionGHK(estadoMembrana)}</code>` + Object.keys(IONES).map((id) => `<code>${sustituirEcuacionNernst(estadoMembrana, id)}</code>`).join("");
}

function aplicarVistaEducativaMembrana(vista) {
  escena.classList.toggle("vista-corte", vista === "corte");
  escena.classList.toggle("vista-sinapsis", vista === "sinapsis");
}

function crearCanalSelectivoMembrana(tabla, ionActivo, droga) {
  const fila = tabla.find((r) => r.ion.id === ionActivo) || tabla[0];
  if (!fila) return;
  const canal = document.createElement("span");
  canal.className = `canal-selectivo ${ionActivo}`;
  canal.innerHTML = `<b>${fila.ion.etiqueta}</b><small>${fila.flujo.direccion}</small>`;
  escena.appendChild(canal);
  if (droga !== "ninguna") {
    const molecula = document.createElement("span");
    molecula.className = `droga-abuso-molecula droga-${droga}`;
    molecula.textContent = etiquetaDrogaAbuso(droga);
    escena.appendChild(molecula);
  }
}

function crearFlujoDirigidoMembrana(tabla, ionActivo, droga) {
  const fila = tabla.find((r) => r.ion.id === ionActivo) || tabla[0];
  if (!fila) return;
  const haciaInterior = fila.flujo.direccion === "hacia el interior";
  const cantidad = Math.max(5, Math.min(18, Math.round(Math.abs(fila.flujo.flujo) / 7) + 6));
  for (let i = 0; i < cantidad; i += 1) {
    const p = document.createElement("span");
    p.className = `ion-flujo-dirigido ${ionActivo} ${haciaInterior ? "entra" : "sale"}`;
    p.textContent = fila.ion.etiqueta;
    p.style.setProperty("--x", `${20 + ((i * 9) % 58)}%`);
    p.style.setProperty("--delay", `${i * 0.13}s`);
    p.style.setProperty("--color", fila.ion.color);
    if (droga !== "ninguna") p.classList.add("modulado");
    escena.appendChild(p);
  }
}

function renderizarPanelNeurovisualMembrana(tabla, ionActivo, vista, droga, vm, potenciales) {
  const panel = $("panelNeurovisualMembrana");
  if (!panel) return;
  const fila = tabla.find((r) => r.ion.id === ionActivo) || tabla[0];
  const drogaInfo = efectoDrogaAbuso(droga);
  const vistaHtml = vista === "corte" ? crearCorteAxonalHtml(fila) : vista === "sinapsis" ? crearSinapsisZoomHtml(fila, droga) : crearMembranaZoomHtml(fila);
  panel.innerHTML = `
    <article class="neurovisual-card principal"><span class="kicker">Ion protagonista</span><h3>${fila.ion.etiqueta}: ${fila.flujo.direccion}</h3><p>${fila.flujo.gradienteQuimico}. ${fila.flujo.gradienteElectrico}. Vm ${vm.toFixed(1)} mV; E${fila.ion.etiqueta} ${potenciales[fila.ion.id].toFixed(1)} mV.</p></article>
    <article class="neurovisual-card visual">${vistaHtml}</article>
    <article class="neurovisual-card droga"><span class="kicker">Droga de abuso</span><h3>${drogaInfo.titulo}</h3><p>${drogaInfo.texto}</p></article>`;
}

function crearMembranaZoomHtml(fila) {
  return `<div class="mini-membrana"><span class="mini-extra">Extracelular</span><span class="mini-bicapa"><i>${fila.ion.etiqueta}</i><b>Canal selectivo</b></span><span class="mini-intra">Intracelular</span><em class="mini-transportador">Na/K ATPasa</em></div>`;
}

function crearCorteAxonalHtml(fila) {
  return `<div class="corte-axon-mini"><span class="mielina-anillo"></span><span class="axon-citoplasma"><i>${fila.ion.etiqueta}</i><i>${fila.ion.etiqueta}</i><i>${fila.ion.etiqueta}</i></span><b>Nodo/corte transversal</b><small>Se observan gradientes alrededor de la membrana axonal.</small></div>`;
}

function crearSinapsisZoomHtml(fila, droga) {
  return `<div class="sinapsis-mini"><span class="boton-presinaptico"><i></i><i></i><i></i><b>Vesiculas</b></span><span class="hendidura-mini"><i></i><i></i><i></i></span><span class="post-mini"><b>Receptores</b><em>Transportadores</em><em>Enzimas catabolicas</em></span>${droga !== "ninguna" ? `<strong>${etiquetaDrogaAbuso(droga)}</strong>` : ""}</div>`;
}

function etiquetaDrogaAbuso(droga) {
  return ({ cocaina: "Cocaina", anfetamina: "Anfetamina", alcohol: "Alcohol", opioide: "Opioide", cannabis: "Cannabis" })[droga] || "Sin droga";
}

function efectoDrogaAbuso(droga) {
  const mapa = {
    ninguna: { titulo: "Sin modulacion", texto: "La simulacion muestra el flujo ionico basal segun concentraciones, permeabilidad y Vm." },
    cocaina: { titulo: "Cocaina", texto: "Modelo educativo: aumenta senal monoaminergica por bloqueo de recaptura; se resaltan transportadores y mayor activacion sinaptica." },
    anfetamina: { titulo: "Anfetamina / metanfetamina", texto: "Modelo educativo: favorece liberacion monoaminergica; se visualiza mayor salida de neurotransmisor." },
    alcohol: { titulo: "Alcohol", texto: "Modelo educativo: potencia tono inhibitorio GABAergico y reduce excitabilidad; se resaltan Cl- y receptores inhibitorios." },
    opioide: { titulo: "Opioide", texto: "Modelo educativo: hiperpolarizacion por salida de K+ y menor liberacion presinaptica; se ve menor activacion terminal." },
    cannabis: { titulo: "Cannabis", texto: "Modelo educativo: modulacion presinaptica de liberacion; la sinapsis muestra menor probabilidad de descarga vesicular." }
  };
  return mapa[droga] || mapa.ninguna;
}
function crearIonesVisuales() {
  Object.values(IONES).forEach((ion) => {
    const total = ion.id === "ca" ? 8 : 18;
    for (let i = 0; i < total; i += 1) {
      const s = document.createElement("span");
      s.className = `ion ${ion.id}`;
      s.textContent = ion.etiqueta;
      s.style.left = `${5 + Math.random() * 88}%`;
      const extra = i < total / 2;
      s.style.top = extra ? `${6 + Math.random() * 28}%` : `${66 + Math.random() * 25}%`;
      escena.appendChild(s);
    }
  });
}

function crearFlechasVisuales() {
  Object.keys(IONES).forEach((ionId, i) => {
    const fila = construirTablaIonica(estadoMembrana).find((r) => r.ion.id === ionId);
    const f = document.createElement("span");
    f.className = "flecha-flujo";
    f.style.left = fila.flujo.direccion === "hacia el interior" ? "38%" : "52%";
    f.style.top = `${44 + i * 3.5}%`;
    f.style.width = `${24 + Math.min(34, Math.abs(fila.flujo.flujo) / 3)}px`;
    f.style.background = fila.ion.color;
    f.style.transform = fila.flujo.direccion === "hacia el exterior" ? "rotate(180deg)" : "none";
    escena.appendChild(f);
  });
}

function animarMembrana() {
  if (!membranaActiva) return;
  desplazarIones(false);
  rafMembrana = requestAnimationFrame(animarMembrana);
}

function desplazarIones() {
  const velocidad = Number($("velocidadMembrana").value || 1);
  escena.querySelectorAll(".ion").forEach((ion) => {
    const y = parseFloat(ion.style.top);
    const delta = (Math.random() - 0.5) * 1.8 * velocidad;
    ion.style.transform = `translate(${(Math.random() - 0.5) * 8}px, ${delta}px)`;
    if (y > 41 && y < 58) ion.style.transform += " scale(0.86)";
  });
}

function vincularAccion() {
  ["estimuloIntensidad", "estimuloDuracion", "estimuloInicio", "segundoEstimulo", "separacionEstimulo", "nivelAccion"].forEach((id) => $(id).addEventListener("input", actualizarAccion));
  $("btnAplicarEstimulo").addEventListener("click", actualizarAccion);
  $("btnAccionPlay").addEventListener("click", () => { accionActiva = true; tiempoAccion = 0; animarAccion(); });
  $("btnAccionPausa").addEventListener("click", () => { accionActiva = false; cancelAnimationFrame(rafAccion); });
  $("btnAccionReset").addEventListener("click", () => { accionActiva = false; tiempoAccion = 0; dibujarAccion(); });
  $("btnSuperponer").addEventListener("click", () => { superposiciones.push(resultadoAccion.trazas); dibujarAccion(); });
  $("btnLimpiarSuperposiciones").addEventListener("click", () => { superposiciones = []; dibujarAccion(); });
  graficaAccion.addEventListener("mousemove", tooltipAccion);
  graficaAccion.addEventListener("mouseleave", () => { const tip = $("tooltipAccion"); if (tip) tip.style.display = "none"; });
}

function parametrosAccion() {
  const potenciales = calcularPotencialesEquilibrio(estadoMembrana);
  return { ENa: potenciales.na, EK: potenciales.k, estimulo: { inicio: Number($("estimuloInicio").value), duracion: Number($("estimuloDuracion").value), intensidad: Number($("estimuloIntensidad").value) }, segundoEstimulo: { activo: $("segundoEstimulo").checked, separacion: Number($("separacionEstimulo").value), intensidad: Number($("estimuloIntensidad").value), duracion: Number($("estimuloDuracion").value) } };
}

function actualizarAccion() {
  resultadoAccion = simularPotencialAccion(parametrosAccion());
  dibujarAccion();
  $("resumenAccion").innerHTML = [["Pico", `${resultadoAccion.resumen.pico.toFixed(1)} mV`], ["Tiempo pico", `${resultadoAccion.resumen.tiempoPico.toFixed(2)} ms`], ["Umbral", resultadoAccion.resumen.superoUmbral ? "Superado" : "Subumbral"], ["Refractario abs.", resultadoAccion.resumen.refractarioAbsoluto ? resultadoAccion.resumen.refractarioAbsoluto.map((x) => x.toFixed(1)).join("-") + " ms" : "No evidente"]].map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("");
}

function dibujarAccion(cursor = null) {
  const ctx = graficaAccion.getContext("2d");
  const w = graficaAccion.width, h = graficaAccion.height;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#020617"; ctx.fillRect(0, 0, w, h); dibujarGrid(ctx, w, h);
  superposiciones.forEach((tr) => dibujarTraza(ctx, tr, "rgba(125,211,252,.24)", "Vm", w, h));
  dibujarTraza(ctx, resultadoAccion.trazas, "#38bdf8", "Vm", w, h);
  if ($("nivelAccion").value !== "basico") { dibujarTraza(ctx, resultadoAccion.trazas, "#fb923c", "INa", w, h, 0.18); dibujarTraza(ctx, resultadoAccion.trazas, "#34d399", "IK", w, h, 0.18); }
  if (cursor !== null) { ctx.strokeStyle = "#e0f2fe"; ctx.beginPath(); ctx.moveTo(cursor, 0); ctx.lineTo(cursor, h); ctx.stroke(); }
  const punto = resultadoAccion.trazas[Math.min(resultadoAccion.trazas.length - 1, Math.floor((tiempoAccion / resultadoAccion.parametros.duracionMs) * resultadoAccion.trazas.length))] || resultadoAccion.trazas[0];
  $("canalSodio").textContent = punto.canales.sodio; $("canalPotasio").textContent = punto.canales.potasio;
}

function dibujarGrid(ctx, w, h) { ctx.strokeStyle = "rgba(125,211,252,.08)"; for (let x = 0; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } }
function dibujarTraza(ctx, trazas, color, campo, w, h, escala = 1) { const maxT = trazas.at(-1).t; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); trazas.forEach((p, i) => { const x = p.t / maxT * w; const valor = campo === "Vm" ? p.Vm : p[campo] * escala; const y = h - ((valor + 90) / 150) * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); }
function animarAccion() { if (!accionActiva) return; tiempoAccion += 0.15 * Number($("velocidadAccion").value || 1) * factorTiempoGlobalNeuro(); if (tiempoAccion > resultadoAccion.parametros.duracionMs) { accionActiva = false; return; } dibujarAccion(tiempoAccion / resultadoAccion.parametros.duracionMs * graficaAccion.width); rafAccion = requestAnimationFrame(animarAccion); }
function tooltipAccion(e) {
  const rect = graficaAccion.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * graficaAccion.width;
  const idx = Math.max(0, Math.min(resultadoAccion.trazas.length - 1, Math.floor(x / graficaAccion.width * resultadoAccion.trazas.length)));
  const p = resultadoAccion.trazas[idx];
  const tip = $("tooltipAccion");
  if (!p || !tip) return;
  tip.innerHTML = `${p.t.toFixed(2)} ms<br>Vm ${p.Vm.toFixed(1)} mV<br>INa ${p.INa.toFixed(1)} | IK ${p.IK.toFixed(1)}<br>${p.fase}`;
  tip.style.display = "block";
  const margen = 12;
  const ancho = tip.offsetWidth || 170;
  const alto = tip.offsetHeight || 78;
  let left = e.clientX + 14;
  let top = e.clientY - alto - 14;
  if (top < margen) top = e.clientY + 18;
  left = Math.min(window.innerWidth - ancho - margen, Math.max(margen, left));
  top = Math.min(window.innerHeight - alto - margen, Math.max(margen, top));
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function vincularAxon() { ["tipoAxon", "longitudAxon", "diametroAxon", "grosorMielina", "temperaturaAxon", "densidadNaAxon", "bloqueoAxon", "desmielinizacionActiva", "severidadDesmielina", "estimularDesde", "bidireccional"].forEach((id) => $(id).addEventListener("input", actualizarAxon)); $("btnAxonPlay").addEventListener("click", () => { axonActivo = true; tiempoAxon = 0; animarAxon(); }); $("btnAxonPausa").addEventListener("click", () => { axonActivo = false; cancelAnimationFrame(rafAxon); }); $("btnAxonReset").addEventListener("click", () => { axonActivo = false; tiempoAxon = 0; dibujarAxonVisual(); dibujarGraficaAxon(); }); }
function parametrosAxon() { return { longitudMm: Number($("longitudAxon").value), diametroUm: Number($("diametroAxon").value), mielina: $("tipoAxon").value === "mielinizado", grosorMielina: Number($("grosorMielina").value), temperaturaC: Number($("temperaturaAxon").value), densidadNa: Number($("densidadNaAxon").value), bloqueoCanales: Number($("bloqueoAxon").value), estimulacion: $("estimularDesde").value, bidireccional: $("bidireccional").checked, desmielinizacion: { activa: $("desmielinizacionActiva").checked, severidad: Number($("severidadDesmielina").value), inicioMm: 35, longitudMm: 15 } }; }
function actualizarAxon() { resultadoAxon = simularPropagacionAxonal(parametrosAxon()); dibujarAxonVisual(); dibujarGraficaAxon(); $("resumenAxon").innerHTML = [["Velocidad", `${resultadoAxon.velocidadMms.toFixed(2)} mm/ms`], ["Tiempo total", `${resultadoAxon.tiempoTotalMs.toFixed(1)} ms`], ["Seguridad", `${Math.round(resultadoAxon.seguridadConduccion * 100)}%`], ["Tipo", resultadoAxon.parametros.mielina ? "Saltatoria" : "Continua"]].map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join(""); }
function dibujarAxonVisual() { const el = $("axonVisual"); const p = resultadoAxon.parametros; el.innerHTML = `<div class="axon-linea"></div>`; if (p.desmielinizacion.activa) el.innerHTML += `<span class="lesion" style="left:${5 + p.desmielinizacion.inicioMm / p.longitudMm * 90}%;width:${p.desmielinizacion.longitudMm / p.longitudMm * 90}%"></span>`; if (p.mielina) { for (let x = 6; x < 92; x += 14) el.innerHTML += `<span class="mielina" style="left:${x}%;width:10%"></span><span class="nodo" style="left:${x + 10}%"></span>`; } resultadoAxon.electrodos.forEach((e) => { el.innerHTML += `<span class="electrodo" style="left:${5 + e.posicion / p.longitudMm * 90}%"></span>`; }); const pos = Math.min(90, tiempoAxon / resultadoAxon.tiempoTotalMs * 90); el.innerHTML += `<span class="onda" style="left:${5 + pos}%"></span>`; }
function dibujarGraficaAxon() { const ctx = graficaAxon.getContext("2d"); const w = graficaAxon.width, h = graficaAxon.height; ctx.clearRect(0,0,w,h); ctx.fillStyle="#020617"; ctx.fillRect(0,0,w,h); dibujarGrid(ctx,w,h); const colores=["#38bdf8","#34d399","#facc15"]; resultadoAxon.electrodos.forEach((e,i)=>dibujarTraza(ctx,e.traza,colores[i%colores.length],"Vm",w,h)); }
function animarAxon(){ if(!axonActivo)return; tiempoAxon += 0.25 * factorTiempoGlobalNeuro(); if(tiempoAxon>resultadoAxon.tiempoTotalMs){axonActivo=false;return;} dibujarAxonVisual(); rafAxon=requestAnimationFrame(animarAxon); }

function renderizarExperimentos(){ $("listaExperimentos").innerHTML=EXPERIMENTOS_NEUROFISIOLOGIA.map((e)=>`<article class="experimento-card"><span class="kicker">${e.variableIndependiente}</span><h3>${e.titulo}</h3><p>${e.objetivo}</p><button data-exp="${e.id}">Cargar configuracion</button><details><summary>Ver guia</summary><p><b>Hipotesis:</b> ${e.hipotesis}</p><ol>${e.pasos.map(p=>`<li>${p}</li>`).join("")}</ol><p><b>Resultado esperado:</b> ${e.resultadoEsperado}</p><p>${e.explicacion}</p></details></article>`).join(""); document.querySelectorAll("[data-exp]").forEach((b)=>b.addEventListener("click",()=>cargarExperimento(b.dataset.exp))); }
function cargarExperimento(id){ const exp=EXPERIMENTOS_NEUROFISIOLOGIA.find(e=>e.id===id); if(!exp)return; if(exp.parametros.preset){estadoMembrana=aplicarPresetMembrana(exp.parametros.preset);sincronizarControlesMembrana();renderizarMembrana();} if(exp.parametros.gNa||exp.parametros.gK||exp.parametros.segundoEstimulo){$("segundoEstimulo").checked=Boolean(exp.parametros.segundoEstimulo);actualizarAccion();cambiarTab("accion");} else if(exp.parametros.mielina!==undefined||exp.parametros.desmielinizacion){$("tipoAxon").value=exp.parametros.mielina===false?"amielinico":"mielinizado";$("desmielinizacionActiva").checked=Boolean(exp.parametros.desmielinizacion);actualizarAxon();cambiarTab("axon");} else cambiarTab("membrana"); $("observacionesProyecto").value=`Experimento: ${exp.titulo}\nHipotesis: ${exp.hipotesis}\n`; }

function vincularCuaderno(){ $("btnGuardarProyecto").addEventListener("click",guardarProyectoActual); $("btnExportarCSV").addEventListener("click",()=>exportarCSVLaboratorio(resultadoAccion.trazas)); $("btnReporte").addEventListener("click",()=>window.print()); }
function guardarProyectoActual(){ ultimoProyecto=guardarProyectoLaboratorio({ nombre: $("nombreProyecto").value || "Proyecto neurofisiologia", observaciones: $("observacionesProyecto").value, parametrosMembrana: estadoMembrana, resultadoAccion: resultadoAccion.resumen, resultadoAxon: { velocidad: resultadoAxon.velocidadMms, seguridad: resultadoAxon.seguridadConduccion } }); renderizarProyectos(); }
function renderizarProyectos(){ const proyectos=listarProyectosLaboratorio(); $("listaProyectos").innerHTML=proyectos.length?proyectos.map(p=>`<div class="proyecto-item"><div><strong>${p.nombre}</strong><br><small>${p.actualizadoEn}</small></div><div><button data-dup="${p.id}">Duplicar</button><button data-del="${p.id}">Eliminar</button></div></div>`).join(""):"<p class='muted'>Aun no hay proyectos guardados.</p>"; document.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{if(confirm("Eliminar proyecto?")){eliminarProyectoLaboratorio(b.dataset.del);renderizarProyectos();}})); document.querySelectorAll("[data-dup]").forEach(b=>b.addEventListener("click",()=>{duplicarProyectoLaboratorio(b.dataset.dup);renderizarProyectos();})); }
function vincularIntegrada() {
  poblarFarmacosIntegrados();
  poblarSelectorEcuaciones($("intEcuacionSeleccionada"));
  aplicarNivelAprendizaje("basico");
  ["intFrecuencia", "intIntensidad", "intTipoAxon", "intDiametro", "intTemperatura", "intDesmielina", "intTipoSinapsis", "intVesiculas", "intLiberacion", "intRecaptura", "intDegradacion", "intSensibilidad"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { leerControlesIntegrados(); renderizarIntegrada(); });
  });
  ["intCamaraNeuro", "intNivelAprendizaje", "intVelocidadParticulas", "intDensidadParticulas", "intIonVisible", "intMostrarCargas", "intExplicacionPaso", "intReducirAnimaciones", "intVistaMatematica"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { leerUiModeIntegrado(); renderizarIntegrada(true); });
  });
  $("intCategoriaFarmaco")?.addEventListener("change", poblarFarmacosIntegrados);
  $("intFarmaco")?.addEventListener("change", mostrarInfoFarmaco);
  $("btnIntegradaPlay")?.addEventListener("click", () => { estadoIntegrado.soloPulsoUnico = false; integradaActiva = true; animarIntegrada(); });
  $("btnIntegradaPausa")?.addEventListener("click", () => { integradaActiva = false; cancelAnimationFrame(rafIntegrada); });
  $("btnIntegradaReset")?.addEventListener("click", () => { integradaActiva = false; cancelAnimationFrame(rafIntegrada); estadoIntegrado = crearEstadoNeuronaIntegrada(); sincronizarControlesIntegrados(); renderizarIntegrada(true); });
  $("btnIntegradaPulso")?.addEventListener("click", () => { estimularNeuronaIntegrada(estadoIntegrado, null, { unico: true, duracionMs: 1.2 }); renderizarIntegrada(true); if (!integradaActiva) { integradaActiva = true; animarIntegrada(); } });
  $("btnIntAgregarFarmaco")?.addEventListener("click", () => { aplicarFarmacoIntegrado(estadoIntegrado, $("intFarmaco").value, Number($("intFarmacoIntensidad").value)); renderizarIntegrada(true); });
  $("btnIntLimpiarFarmacos")?.addEventListener("click", () => { limpiarFarmacosIntegrados(estadoIntegrado); renderizarIntegrada(true); });
  $("intSeguirEcuacion")?.addEventListener("change", () => renderizarIntegrada(true));
  $("intCongelarEcuacion")?.addEventListener("change", (e) => { ecuacionCongelada = e.target.checked ? ($("intEcuacionSeleccionada").value || estadoIntegrado.ecuacionActiva) : null; renderizarIntegrada(true); });
  $("intEcuacionSeleccionada")?.addEventListener("change", () => { ecuacionCongelada = $("intCongelarEcuacion")?.checked ? $("intEcuacionSeleccionada").value : null; renderizarIntegrada(true); });
  $("btnCopiarEcuacion")?.addEventListener("click", async () => {
    const texto = resumenCopiableEcuacion(estadoIntegrado, ecuacionCongelada || $("intEcuacionSeleccionada")?.value || estadoIntegrado.ecuacionActiva);
    try { await navigator.clipboard.writeText(texto); } catch { console.log(texto); }
  });
  $("btnTutorialNeuro")?.addEventListener("click", () => iniciarTutorialNeuro());
  $("btnComenzarRecorrido")?.addEventListener("click", () => iniciarTutorialNeuro());
  $("tutorialNext")?.addEventListener("click", () => moverTutorialNeuro(1));
  $("tutorialPrev")?.addEventListener("click", () => moverTutorialNeuro(-1));
  $("tutorialSkip")?.addEventListener("click", cerrarTutorialNeuro);
  sincronizarControlesIntegrados();
  if (!tutorialVistoNeuro) iniciarTutorialNeuro();
}

function aplicarNivelAprendizaje(nivel) {
  uiModeNeuro.learningLevel = nivel;
  graficasIntegradasVisibles = new Set(GRAFICAS_POR_NIVEL[nivel] || ["Vm"]);
  if ($("selectorGraficasIntegradas")) {
    poblarSelectorGraficas($("selectorGraficasIntegradas"), graficasIntegradasVisibles);
    document.querySelectorAll("[data-grafica-integrada]").forEach((check) => check.addEventListener("change", () => {
      if (check.checked) graficasIntegradasVisibles.add(check.dataset.graficaIntegrada); else graficasIntegradasVisibles.delete(check.dataset.graficaIntegrada);
      dibujarGraficaIntegrada(graficaIntegrada, estadoIntegrado, graficasIntegradasVisibles);
    }));
  }
}

function leerUiModeIntegrado() {
  const nivelAnterior = uiModeNeuro.learningLevel;
  uiModeNeuro.cameraMode = $("intCamaraNeuro")?.value || "membrana";
  uiModeNeuro.learningLevel = $("intNivelAprendizaje")?.value || "basico";
  uiModeNeuro.particleSpeed = $("intVelocidadParticulas")?.value || "lenta";
  uiModeNeuro.particleDensity = $("intDensidadParticulas")?.value || "baja";
  uiModeNeuro.ionFilter = $("intIonVisible")?.value || "todos";
  uiModeNeuro.showCharges = $("intMostrarCargas") ? Boolean($("intMostrarCargas").checked) : true;
  uiModeNeuro.explanationMode = Boolean($("intExplicacionPaso")?.checked);
  uiModeNeuro.reducedMotion = Boolean($("intReducirAnimaciones")?.checked);
  uiModeNeuro.mathView = $("intVistaMatematica")?.value || "resumida";
  if (nivelAnterior !== uiModeNeuro.learningLevel) aplicarNivelAprendizaje(uiModeNeuro.learningLevel);
}

function poblarFarmacosIntegrados() {
  const select = $("intFarmaco");
  if (!select) return;
  const categoria = $("intCategoriaFarmaco")?.value || "principales";
  const principales = new Set(["fenitoina", "benzodiacepina", "pregabalina", "levetiracetam", "litio", "valproato"]);
  const filtros = {
    principales: (f) => principales.has(f.id),
    na: (f) => /Na\+|sodio|Na/i.test(`${f.diana} ${f.clase}`),
    gaba: (f) => /GABA/i.test(`${f.diana} ${f.clase}`),
    ca: (f) => /Ca2|calcio|alfa2delta/i.test(`${f.diana} ${f.clase}`),
    vesicular: (f) => /vesicula|SV2A|liberacion/i.test(`${f.diana} ${f.clase} ${f.descripcion}`),
    intracelular: (f) => /intracelular|multimodal/i.test(`${f.diana} ${f.clase} ${f.descripcion}`),
    herramientas: (f) => /experimental|Tetrodotoxina|Tetraetilamonio/i.test(`${f.nombre} ${f.clase}`),
    abuso: (f) => /droga de abuso/i.test(f.clase),
    todos: () => true
  };
  const lista = REGISTRO_FARMACOS_NEURO.filter(filtros[categoria] || filtros.principales);
  select.innerHTML = lista.map((farmaco) => `<option value="${farmaco.id}">${farmaco.nombre}</option>`).join("");
  mostrarInfoFarmaco();
}

function mostrarInfoFarmaco() {
  const id = $("intFarmaco")?.value;
  const f = REGISTRO_FARMACOS_NEURO.find((item) => item.id === id);
  const box = $("intInfoFarmaco");
  if (!box || !f) return;
  box.innerHTML = `<b>${f.nombre}</b><span>Diana: ${f.diana}</span><span>Efecto: ${f.descripcion}</span><span>Que observar: cambios en ${Object.keys(f.efectos || {}).join(", ")}.</span>`;
}

function sincronizarControlesIntegrados() {
  if (!$("intFrecuencia")) return;
  $("intFrecuencia").value = estadoIntegrado.controles.frecuenciaHz;
  $("intIntensidad").value = estadoIntegrado.controles.intensidad;
  $("intTipoAxon").value = estadoIntegrado.axon.mielina ? "mielinizado" : "amielinico";
  $("intDiametro").value = estadoIntegrado.axon.diametroUm;
  $("intTemperatura").value = estadoIntegrado.axon.temperaturaC;
  $("intDesmielina").checked = estadoIntegrado.axon.desmielinizacion.activa;
  $("intTipoSinapsis").value = estadoIntegrado.sinapsis.tipoId;
  $("intVesiculas").value = estadoIntegrado.sinapsis.vesiculasVisuales;
  $("intLiberacion").value = estadoIntegrado.sinapsis.basalLiberacion;
  $("intRecaptura").value = estadoIntegrado.sinapsis.recaptura;
  $("intDegradacion").value = estadoIntegrado.sinapsis.degradacion;
  $("intSensibilidad").value = estadoIntegrado.sinapsis.sensibilidad;
  if ($("intCamaraNeuro")) $("intCamaraNeuro").value = uiModeNeuro.cameraMode || "membrana";
  $("intNivelAprendizaje").value = uiModeNeuro.learningLevel;
  $("intVelocidadParticulas").value = uiModeNeuro.particleSpeed;
  $("intDensidadParticulas").value = uiModeNeuro.particleDensity;
  if ($("intIonVisible")) $("intIonVisible").value = uiModeNeuro.ionFilter || "todos";
  if ($("intMostrarCargas")) $("intMostrarCargas").checked = uiModeNeuro.showCharges !== false;
  $("intExplicacionPaso").checked = uiModeNeuro.explanationMode;
  $("intReducirAnimaciones").checked = uiModeNeuro.reducedMotion;
  $("intVistaMatematica").value = uiModeNeuro.mathView;
}

function leerControlesIntegrados() {
  if (!$("intFrecuencia")) return;
  actualizarParametrosIntegrados(estadoIntegrado, {
    frecuenciaHz: $("intFrecuencia").value,
    intensidad: $("intIntensidad").value,
    tipoAxon: $("intTipoAxon").value,
    diametroUm: $("intDiametro").value,
    temperaturaC: $("intTemperatura").value,
    desmielinizacion: $("intDesmielina").checked,
    tipoSinapsis: $("intTipoSinapsis").value,
    vesiculasVisuales: $("intVesiculas").value,
    basalLiberacion: $("intLiberacion").value,
    recaptura: $("intRecaptura").value,
    degradacion: $("intDegradacion").value,
    sensibilidad: $("intSensibilidad").value
  });
}

function animarIntegrada() {
  if (!integradaActiva) return;
  leerControlesIntegrados();
  leerUiModeIntegrado();
  const paso = (uiModeNeuro.explanationMode ? 0.18 : 0.34) * factorTiempoGlobalNeuro();
  avanzarNeuronaIntegrada(estadoIntegrado, paso);
  renderizarIntegrada(false);
  rafIntegrada = requestAnimationFrame(animarIntegrada);
}

function renderizarIntegrada(forzarTexto = false) {
  if (!$("escenaIntegrada")) return;
  const ecuacionSeleccionada = ecuacionCongelada || ($("intSeguirEcuacion")?.checked ? estadoIntegrado.ecuacionActiva : ($("intEcuacionSeleccionada")?.value || estadoIntegrado.ecuacionActiva));
  if ($("intEcuacionSeleccionada") && !ecuacionCongelada && $("intSeguirEcuacion")?.checked) $("intEcuacionSeleccionada").value = ecuacionSeleccionada;
  renderizarEscenaIntegrada($("escenaIntegrada"), estadoIntegrado, uiModeNeuro);
  renderizarIndicadoresIntegrados($("estadoIntegrado"), estadoIntegrado, uiModeNeuro);
  renderizarTarjetaEstadoActual($("tarjetaEstadoActual"), estadoIntegrado, uiModeNeuro);
  renderizarVariablesIntegradas($("variablesIntegradas"), estadoIntegrado);
  renderizarMatematicasIntegradas($("matematicasIntegradas"), estadoIntegrado, ecuacionSeleccionada, uiModeNeuro);
  if (forzarTexto || uiModeNeuro.explanationMode) renderizarExplicacionIntegrada($("explicacionIntegrada"), estadoIntegrado);
  dibujarGraficaIntegrada(graficaIntegrada, estadoIntegrado, graficasIntegradasVisibles);
  $("intFarmacosActivos").innerHTML = estadoIntegrado.farmacos.activos.length ? estadoIntegrado.farmacos.activos.map((f) => `<span>${f.nombre} ${Math.round(f.intensidad * 100)}%</span>`).join("") : `<span>Sin farmacos activos</span>`;
}

function iniciarTutorialNeuro() {
  uiModeNeuro.tutorialActive = true;
  uiModeNeuro.tutorialStep = 0;
  mostrarPasoTutorialNeuro();
}

function moverTutorialNeuro(delta) {
  if (delta > 0 && uiModeNeuro.tutorialStep >= PASOS_TUTORIAL_NEURO.length - 1) {
    cerrarTutorialNeuro();
    return;
  }
  uiModeNeuro.tutorialStep = Math.max(0, Math.min(PASOS_TUTORIAL_NEURO.length - 1, uiModeNeuro.tutorialStep + delta));
  mostrarPasoTutorialNeuro();
}

function mostrarPasoTutorialNeuro() {
  const modal = $("tutorialNeuro");
  const paso = PASOS_TUTORIAL_NEURO[uiModeNeuro.tutorialStep];
  if (!modal || !paso) return;
  modal.hidden = false;
  $("tutorialTitulo").textContent = paso.titulo;
  $("tutorialTexto").textContent = paso.texto;
  document.querySelectorAll(".tutorial-focus").forEach((el) => el.classList.remove("tutorial-focus"));
  const objetivo = $(paso.foco);
  if (objetivo) objetivo.classList.add("tutorial-focus");
  $("tutorialPrev").disabled = uiModeNeuro.tutorialStep === 0;
  $("tutorialNext").textContent = uiModeNeuro.tutorialStep === PASOS_TUTORIAL_NEURO.length - 1 ? "Explorar libremente" : "Siguiente";
  if (uiModeNeuro.tutorialStep === PASOS_TUTORIAL_NEURO.length - 1) localStorage.setItem("cognicionNeuroTutorialVisto", "1");
}

function cerrarTutorialNeuro() {
  uiModeNeuro.tutorialActive = false;
  localStorage.setItem("cognicionNeuroTutorialVisto", "1");
  $("tutorialNeuro").hidden = true;
  document.querySelectorAll(".tutorial-focus").forEach((el) => el.classList.remove("tutorial-focus"));
}
