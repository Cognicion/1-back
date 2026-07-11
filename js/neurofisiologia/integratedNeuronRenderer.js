import { evaluarEcuacion, formato, REGISTRO_ECUACIONES_NEURO } from "./equationRegistry.js";
import { obtenerVariablesIntegradas, explicarEstadoIntegrado } from "./integratedNeuronModel.js";

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

export function renderizarEscenaIntegrada(contenedor, estado) {
  if (!contenedor) return;
  const onda = estado.posicionOnda > 0 ? 20 + estado.posicionOnda * 43 : 18;
  const vesiculas = crearVesiculas(estado);
  const iones = crearIones(estado);
  const neurotransmisores = crearNeurotransmisores(estado);
  contenedor.innerHTML = `
    <div class="region-label soma-label">Soma</div>
    <div class="region-label axon-label">Axon ${estado.axon.mielina ? "mielinizado" : "amielinico"}</div>
    <div class="region-label terminal-label">Terminal presinaptica</div>
    <div class="region-label sinapsis-label">Hendidura / postsinapsis</div>
    <div class="soma-neuronal ${estado.Vm > -55 ? "excitado" : ""}"><span>Vm<br>${formato(estado.Vm, 1)} mV</span></div>
    <div class="membrana-ampliada">
      <b>Membrana</b>
      <span class="canal-integrado na ${estado.canales.sodio.toLowerCase().replaceAll(" ", "-")}">Na+</span>
      <span class="canal-integrado k ${estado.canales.potasio.toLowerCase().replaceAll(" ", "-")}">K+</span>
      <span class="bomba-integrada">Na/K ATPasa <i>ATP</i></span>
    </div>
    <div class="axon-integrado">
      ${crearMielina(estado)}
      <span class="onda-integrada" style="left:${onda}%"></span>
    </div>
    <div class="terminal-integrada ${estado.sinapsis.caLocal > 0.25 ? "activa" : ""}">
      <span class="canal-ca">Ca2+</span>${vesiculas}
    </div>
    <div class="hendidura-integrada">${neurotransmisores}</div>
    <div class="postsinapsis-integrada ${estado.sinapsis.ocupacion > 0.15 ? "activa" : ""}">
      <span>${estado.sinapsis.tipo.receptor}</span>
      <b>${formato(estado.sinapsis.potencialPost, 1)} mV</b>
      <i class="transportador">Recaptura</i>
      <i class="enzima">Degradacion</i>
    </div>
    ${iones}
    ${estado.farmacos.activos.map((f, i) => `<span class="farmaco-molecula" style="--i:${i}">${f.nombre}</span>`).join("")}
  `;
}

function crearMielina(estado) {
  if (!estado.axon.mielina) return `<span class="axon-continuo"></span>`;
  let html = "";
  for (let i = 0; i < 6; i += 1) html += `<span class="segmento-mielina" style="left:${i * 15 + 3}%"></span><span class="nodo-ranvier" style="left:${i * 15 + 14}%"></span>`;
  if (estado.axon.desmielinizacion.activa) html += `<span class="lesion-integrada"></span>`;
  return html;
}

function crearVesiculas(estado) {
  const total = Math.min(48, Math.max(8, Math.round(estado.sinapsis.vesiculasVisuales)));
  let html = "";
  for (let i = 0; i < total; i += 1) {
    const estadoV = i < estado.sinapsis.vesiculasFusionadas ? "fusion" : i < estado.sinapsis.vesiculasListas ? "lista" : i < estado.sinapsis.vesiculasListas + estado.sinapsis.vesiculasReciclaje ? "reciclaje" : "reserva";
    const x = 14 + ((i * 17) % 68);
    const y = 16 + ((i * 29) % 58);
    html += `<span class="vesicula ${estadoV}" style="left:${x}%;top:${y}%"></span>`;
  }
  return html;
}

function crearIones(estado) {
  const tipos = [
    ["na", "Na+", "#fb923c", estado.INa < -5 ? "canalizado" : ""],
    ["k", "K+", "#34d399", estado.IK > 5 ? "canalizado" : ""],
    ["cl", "Cl-", "#a78bfa", estado.sinapsis.tipoId === "gaba" && estado.sinapsis.ocupacion > 0.08 ? "canalizado" : ""],
    ["ca", "Ca2+", "#facc15", estado.sinapsis.caLocal > 0.2 ? "canalizado" : ""]
  ];
  let html = "";
  tipos.forEach(([id, label, color, clase], ti) => {
    const cantidad = id === "ca" ? 10 : 18;
    for (let i = 0; i < cantidad; i += 1) {
      const x = 6 + ((i * 23 + ti * 11 + Math.round(estado.relojVisual * 13)) % 88);
      const yBase = i % 2 === 0 ? 8 : 68;
      const y = yBase + ((i * 19 + ti * 7 + Math.round(estado.relojVisual * 9)) % 20);
      html += `<span class="ion-integrado ${id} ${clase}" style="left:${x}%;top:${y}%;--ion:${color}">${label}</span>`;
    }
  });
  return html;
}

function crearNeurotransmisores(estado) {
  const cantidad = Math.min(36, Math.round(estado.sinapsis.nt * 7));
  let html = "";
  for (let i = 0; i < cantidad; i += 1) {
    const x = 8 + ((i * 13 + Math.round(estado.relojVisual * 11)) % 82);
    const y = 12 + ((i * 23 + Math.round(estado.relojVisual * 8)) % 76);
    html += `<span class="nt-particula" style="left:${x}%;top:${y}%;background:${estado.sinapsis.tipo.color}"></span>`;
  }
  return html;
}

export function renderizarIndicadoresIntegrados(contenedor, estado) {
  if (!contenedor) return;
  const items = [
    ["Fase", estado.fase],
    ["Na+", estado.canales.sodio],
    ["K+", estado.canales.potasio],
    ["Velocidad", `${formato(estado.velocidadMms, 3)} mm/ms`],
    ["Ca2+ terminal", formato(estado.sinapsis.caLocal, 2)],
    ["P liberacion", formato(estado.sinapsis.probabilidadLiberacion, 3)],
    ["NT", `${estado.sinapsis.tipo.nt} ${formato(estado.sinapsis.nt, 2)}`],
    ["Receptores", `${formato(estado.sinapsis.ocupacion * 100, 1)}%`]
  ];
  contenedor.innerHTML = items.map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("");
}

export function renderizarVariablesIntegradas(contenedor, estado) {
  if (!contenedor) return;
  const filas = obtenerVariablesIntegradas(estado).map(([nombre, simbolo, valor, unidad, referencia, estatus]) => `<tr><td>${nombre}</td><td>${simbolo}</td><td>${formato(valor, 3)}</td><td>${unidad}</td><td>${referencia}</td><td>${estatus}</td></tr>`).join("");
  contenedor.innerHTML = `<table><thead><tr><th>Variable</th><th>Simbolo</th><th>Valor</th><th>Unidad</th><th>Referencia</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>`;
}

export function renderizarMatematicasIntegradas(contenedor, estado, idEcuacion) {
  if (!contenedor) return;
  const ecuacion = evaluarEcuacion(idEcuacion || estado.ecuacionActiva, estado);
  contenedor.innerHTML = `
    <article class="ecuacion-activa">
      <span class="kicker">${ecuacion.categoria}</span>
      <h3>${ecuacion.nombre}</h3>
      <code>${ecuacion.formulaTexto}</code>
      <p>${ecuacion.descripcion}</p>
      <code>${ecuacion.sustitucion}</code>
      <p><b>Interpretacion:</b> ${ecuacion.interpretacion}</p>
    </article>
    <article><h3>Farmacologia activa</h3>${estado.farmacos.activos.length ? estado.farmacos.activos.map((f) => `<p><b>${f.nombre}</b> (${formato(f.intensidad * 100, 0)}%): ${f.descripcion}</p>`).join("") : "<p>Sin farmacos activos.</p>"}</article>
  `;
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
