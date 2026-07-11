import { evaluarEcuacion, formato, REGISTRO_ECUACIONES_NEURO } from "./equationRegistry.js";
import { estadoActualEducativo } from "./learningModeController.js";
import { obtenerVariablesIntegradas, explicarEstadoIntegrado } from "./integratedNeuronModel.js";
import { renderizarMembranaCurvaIntegrada } from "./curvedMembraneRenderer.js";

export const GRAFICAS_INTEGRADAS = [
  { id: "Vm", etiqueta: "Vm", color: "#38bdf8", min: -90, max: 50 },
  { id: "INa", etiqueta: "INa", color: "#fb923c", min: -500, max: 300 },
  { id: "IK", etiqueta: "IK", color: "#34d399", min: -100, max: 500 },
  { id: "ICa", etiqueta: "Ca2+", color: "#facc15", min: 0, max: 3.5 },
  { id: "NT", etiqueta: "NT", color: "#a78bfa", min: 0, max: 8 },
  { id: "Post", etiqueta: "Postsinaptico", color: "#22d3ee", min: -90, max: 20 },
  { id: "Prelease", etiqueta: "P liberacion", color: "#f472b6", min: 0, max: 1 },
  { id: "receptor", etiqueta: "Receptores", color: "#e0f2fe", min: 0, max: 1 }
];

export function poblarSelectorEcuaciones(select) {
  if (!select) return;
  select.innerHTML = REGISTRO_ECUACIONES_NEURO.map((eq) => `<option value="${eq.id}">${eq.nombre}</option>`).join("");
}

export function poblarSelectorGraficas(contenedor, visibles) {
  if (!contenedor) return;
  contenedor.innerHTML = GRAFICAS_INTEGRADAS.map((g) => `<label><input type="checkbox" data-grafica-integrada="${g.id}" ${visibles.has(g.id) ? "checked" : ""}> ${g.etiqueta}</label>`).join("");
}

export function renderizarEscenaIntegrada(contenedor, estado, uiMode = {}) {
  if (!contenedor) return;
  const estadoEdu = estadoActualEducativo(estado, uiMode);
  contenedor.dataset.nivel = uiMode.learningLevel || "basico";
  contenedor.dataset.foco = estadoEdu.foco;
  contenedor.dataset.velocidad = uiMode.particleSpeed || "lenta";
  contenedor.dataset.camara = uiMode.cameraMode || "membrana";
  contenedor.classList.toggle("reducir-animaciones", Boolean(uiMode.reducedMotion));
  if (!contenedor.querySelector(".neuro-canvas-principal")) {
    contenedor.innerHTML = `
      <canvas class="neuro-canvas-principal" aria-label="Membrana neuronal curva funcional"></canvas>
      <div class="neuro-canvas-overlay"></div>
    `;
  }
  renderizarMembranaCurvaIntegrada(
    contenedor.querySelector(".neuro-canvas-principal"),
    contenedor.querySelector(".neuro-canvas-overlay"),
    estado,
    uiMode
  );
}
function crearFlechaEvento(foco) {
  if (foco === "sodio") return `<span class="flecha-evento flecha-na">Na+ entra</span>`;
  if (foco === "potasio") return `<span class="flecha-evento flecha-k">K+ sale</span>`;
  if (foco === "sinapsis") return `<span class="flecha-evento flecha-ca">Ca2+ y NT</span>`;
  if (foco === "propagacion") return `<span class="flecha-evento flecha-axon">impulso</span>`;
  return `<span class="estado-reposo-label">Reposo</span>`;
}

function crearMielina(estado) {
  if (!estado.axon.mielina) return `<span class="axon-continuo"></span>`;
  let html = "";
  for (let i = 0; i < 6; i += 1) html += `<span class="segmento-mielina" style="left:${i * 15 + 3}%"></span><span class="nodo-ranvier" style="left:${i * 15 + 14}%"></span>`;
  if (estado.axon.desmielinizacion.activa) html += `<span class="lesion-integrada"></span>`;
  return html;
}

function crearVesiculas(estado, uiMode = {}) {
  if (uiMode.learningLevel === "basico" && estado.sinapsis.caLocal < 0.25 && estado.sinapsis.nt < 0.05) return "";
  const maximo = uiMode.learningLevel === "basico" ? 10 : uiMode.learningLevel === "intermedio" ? 20 : 36;
  const total = Math.min(maximo, Math.max(6, Math.round(estado.sinapsis.vesiculasVisuales)));
  let html = "";
  for (let i = 0; i < total; i += 1) {
    const estadoV = i < estado.sinapsis.vesiculasFusionadas ? "fusion" : i < estado.sinapsis.vesiculasListas ? "lista" : i < estado.sinapsis.vesiculasListas + estado.sinapsis.vesiculasReciclaje ? "reciclaje" : "reserva";
    const x = 14 + ((i * 17) % 68);
    const y = 16 + ((i * 29) % 58);
    html += `<span class="vesicula ${estadoV}" style="left:${x}%;top:${y}%"></span>`;
  }
  return html;
}

function crearIones(estado, uiMode = {}) {
  const nivel = uiMode.learningLevel || "basico";
  const densidad = uiMode.particleDensity || "baja";
  const foco = estadoActualEducativo(estado, uiMode).foco;
  const totalPorNivel = {
    "muy-baja": nivel === "avanzado" ? 6 : 4,
    baja: nivel === "avanzado" ? 10 : nivel === "intermedio" ? 8 : 5,
    media: nivel === "avanzado" ? 18 : nivel === "intermedio" ? 12 : 8,
    alta: nivel === "avanzado" ? 30 : nivel === "intermedio" ? 18 : 10
  };
  const base = totalPorNivel[densidad] || totalPorNivel.baja;
  const tipos = nivel === "basico" ? [
    ["na", "Na+", "#fb923c", foco === "sodio" ? "canalizado" : ""],
    ["k", "K+", "#34d399", foco === "potasio" ? "canalizado" : ""]
  ] : [
    ["na", "Na+", "#fb923c", foco === "sodio" ? "canalizado" : ""],
    ["k", "K+", "#34d399", foco === "potasio" ? "canalizado" : ""],
    ["cl", "Cl-", "#a78bfa", foco === "sinapsis" && estado.sinapsis.tipoId === "gaba" ? "canalizado" : ""],
    ["ca", "Ca2+", "#facc15", foco === "sinapsis" ? "canalizado" : ""]
  ];
  let html = "";
  tipos.forEach(([id, label, color, clase], ti) => {
    const cantidad = id === "ca" ? Math.max(3, Math.floor(base * 0.45)) : base;
    for (let i = 0; i < cantidad; i += 1) {
      const dirigido = clase && i < (nivel === "basico" ? 2 : 4);
      const x = dirigido ? (id === "k" ? 30 + i * 2 : 25 + i * 2) : 6 + ((i * 23 + ti * 11 + Math.round(estado.relojVisual * 3)) % 88);
      const yBase = dirigido ? (id === "k" ? 57 : 38) : i % 2 === 0 ? 12 : 70;
      const y = dirigido ? yBase : yBase + ((i * 19 + ti * 7 + Math.round(estado.relojVisual * 2)) % 14);
      html += `<span class="ion-integrado ${id} ${dirigido ? clase : ""}" style="left:${x}%;top:${y}%;--ion:${color}">${label}</span>`;
    }
  });
  return html;
}

function crearNeurotransmisores(estado, uiMode = {}) {
  const maximo = uiMode.learningLevel === "basico" ? 10 : uiMode.learningLevel === "intermedio" ? 22 : 36;
  const cantidad = Math.min(maximo, Math.round(estado.sinapsis.nt * 5));
  let html = "";
  for (let i = 0; i < cantidad; i += 1) {
    const x = 8 + ((i * 13 + Math.round(estado.relojVisual * 4)) % 82);
    const y = 12 + ((i * 23 + Math.round(estado.relojVisual * 3)) % 76);
    html += `<span class="nt-particula" style="left:${x}%;top:${y}%;background:${estado.sinapsis.tipo.color}"></span>`;
  }
  return html;
}

export function renderizarIndicadoresIntegrados(contenedor, estado, uiMode = {}) {
  if (!contenedor) return;
  const nivel = uiMode.learningLevel || "basico";
  const items = nivel === "basico" ? [
    ["Vm", `${formato(estado.Vm, 1)} mV`],
    ["Fase", estadoActualEducativo(estado, uiMode).fase],
    ["Canal", estadoActualEducativo(estado, uiMode).canal],
    ["Movimiento", estadoActualEducativo(estado, uiMode).movimiento]
  ] : [
    ["Fase", estado.fase], ["Na+", estado.canales.sodio], ["K+", estado.canales.potasio], ["Velocidad", `${formato(estado.velocidadMms, 3)} mm/ms`],
    ["Ca2+ terminal", formato(estado.sinapsis.caLocal, 2)], ["P liberacion", formato(estado.sinapsis.probabilidadLiberacion, 3)], ["NT", `${estado.sinapsis.tipo.nt} ${formato(estado.sinapsis.nt, 2)}`], ["Receptores", `${formato(estado.sinapsis.ocupacion * 100, 1)}%`]
  ];
  contenedor.innerHTML = items.map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("");
}

export function renderizarVariablesIntegradas(contenedor, estado) {
  if (!contenedor) return;
  const filas = obtenerVariablesIntegradas(estado).map(([nombre, simbolo, valor, unidad, referencia, estatus]) => `<tr><td>${nombre}</td><td>${simbolo}</td><td>${formato(valor, 3)}</td><td>${unidad}</td><td>${referencia}</td><td>${estatus}</td></tr>`).join("");
  contenedor.innerHTML = `<table><thead><tr><th>Variable</th><th>Simbolo</th><th>Valor</th><th>Unidad</th><th>Referencia</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>`;
}

export function renderizarMatematicasIntegradas(contenedor, estado, idEcuacion, uiMode = {}) {
  if (!contenedor) return;
  const ecuacion = evaluarEcuacion(idEcuacion || estado.ecuacionActiva, estado);
  const vista = uiMode.mathView || "resumida";
  const resumen = `<article class="ecuacion-activa vista-${vista}"><span class="kicker">${ecuacion.categoria}</span><h3>${ecuacion.nombre}</h3><code>${ecuacion.formulaTexto}</code><p><b>Resultado:</b> ${formato(ecuacion.resultado, 3)}</p><p><b>Interpretacion:</b> ${ecuacion.interpretacion}</p></article>`;
  const paso = `<article class="ecuacion-activa vista-${vista}"><span class="kicker">Paso a paso</span><h3>${ecuacion.nombre}</h3><p>${ecuacion.descripcion}</p><code>${ecuacion.formulaTexto}</code><code>${ecuacion.sustitucion}</code><p><b>Significado fisiologico:</b> ${ecuacion.interpretacion}</p></article>`;
  const avanzada = `<article class="ecuacion-activa vista-${vista}"><span class="kicker">Avanzada</span><h3>${ecuacion.nombre}</h3><p>${ecuacion.descripcion}</p><code>${ecuacion.formulaTexto}</code><code>${ecuacion.sustitucion}</code><p><b>Resultado:</b> ${formato(ecuacion.resultado, 4)}</p><p><b>Supuesto:</b> Modelo educativo simplificado sincronizado con el motor actual.</p><p><b>Farmacologia:</b> ${estado.farmacos.activos.length ? estado.farmacos.activos.map((f) => `${f.nombre} ${formato(f.intensidad * 100, 0)}%`).join(", ") : "sin farmacos activos"}.</p></article>`;
  contenedor.innerHTML = vista === "avanzada" ? avanzada : vista === "paso" ? paso : resumen;
}

export function renderizarTarjetaEstadoActual(contenedor, estado, uiMode = {}) {
  if (!contenedor) return;
  const info = estadoActualEducativo(estado, uiMode);
  contenedor.innerHTML = `<span class="kicker">Que esta ocurriendo ahora</span><h3>${info.fase}</h3><dl><dt>Canal activo</dt><dd>${info.canal}</dd><dt>Movimiento</dt><dd>${info.movimiento}</dd><dt>Consecuencia</dt><dd>${info.consecuencia}</dd>${info.detalle ? `<dt>Detalle</dt><dd>${info.detalle}</dd>` : ""}</dl>`;
}

export function renderizarExplicacionIntegrada(contenedor, estado) {
  if (!contenedor) return;
  contenedor.innerHTML = `<ol>${explicarEstadoIntegrado(estado).map((p) => `<li>${p}</li>`).join("")}</ol>`;
}

export function dibujarGraficaIntegrada(canvas, estado, visibles) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(125,211,252,.08)";
  for (let x = 0; x < w; x += 70) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const datos = estado.historia.slice(-520);
  if (datos.length < 2) return;
  const t0 = datos[0].t;
  const t1 = datos.at(-1).t || t0 + 1;
  GRAFICAS_INTEGRADAS.filter((g) => visibles.has(g.id)).forEach((g) => {
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    datos.forEach((p, i) => {
      const x = ((p.t - t0) / Math.max(1, t1 - t0)) * w;
      const y = h - ((p[g.id] - g.min) / (g.max - g.min)) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const ultimo = datos.at(-1);
    ctx.fillStyle = g.color;
    ctx.fillText(g.etiqueta, 12, 18 + GRAFICAS_INTEGRADAS.indexOf(g) * 15);
    ctx.fillText(formato(ultimo[g.id], 2), 110, 18 + GRAFICAS_INTEGRADAS.indexOf(g) * 15);
  });
}

export function resumenCopiableEcuacion(estado, idEcuacion) {
  const e = evaluarEcuacion(idEcuacion || estado.ecuacionActiva, estado);
  return `${e.nombre}\n${e.formulaTexto}\n${e.sustitucion}\n${e.interpretacion}`;
}
