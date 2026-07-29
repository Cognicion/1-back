import { normalizarHistoriaClinicaParaExportacion } from "./historiaClinicaExportModel.js";
import { descargarHistoriaClinicaPdf } from "./historiaClinicaPdf.js";
import { descargarHistoriaClinicaDocx } from "./historiaClinicaDocx.js";
import { listarMedicosDelCatalogoDeFirmas, resolverMedicoDelCatalogo } from "../services/catalogoMedicosFirmas.js";
import { getAuthenticatedUserOnce, getUserProfileOnce } from "../services/authContextService.js";
import { HISTORIA_CLINICA_EXPORT_VERSION } from "../config/appVersion.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const mostrar = (v) => esc(v || "Sin información registrada.");
const dato = (etiqueta, valor) => `<div class="hc-dato"><span class="hc-dato__etiqueta">${esc(etiqueta)}</span><span class="hc-dato__valor">${mostrar(valor)}</span></div>`;
const fecha = (v) => v ? new Date(v).toLocaleDateString("es-MX") : "";

function renderFamiliograma(datos) {
  const personas = datos.personas || [], posiciones = new Map(personas.map((persona, i) => [persona.id, { x: 90 + (i % 5) * 140, y: 70 + Math.floor(i / 5) * 120 }]));
  const relaciones = (datos.relaciones || []).map((relacion) => { const a = posiciones.get(relacion.personaA), b = posiciones.get(relacion.personaB); return a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#71857d" stroke-width="2"/>` : ""; }).join("");
  const nodos = personas.map((persona) => { const p = posiciones.get(persona.id); const forma = persona.sexo === "f" ? `<circle cx="${p.x}" cy="${p.y}" r="24"` : `<rect x="${p.x - 24}" y="${p.y - 24}" width="48" height="48"`; return `${forma} fill="#fff" stroke="#1f6b58" stroke-width="2"${persona.fallecido ? " stroke-dasharray=\"5 4\"" : ""}/><text x="${p.x}" y="${p.y + 40}" text-anchor="middle" font-size="11" fill="#1d2a27">${esc(persona.nombre || "Sin nombre")}</text>`; }).join("");
  return `<svg class="hc-familiograma" viewBox="0 0 760 ${Math.max(220, 120 * Math.ceil(personas.length / 5))}" role="img" aria-label="Familiograma">${relaciones}${nodos}</svg>`;
}

function renderSeccion(seccion) {
  if (seccion.kind === "family") return `<section class="hc-bloque" data-export-section><h2 class="hc-bloque__titulo">${esc(seccion.titulo)}</h2>${renderFamiliograma(seccion.data)}${seccion.data.observacionesGenerales ? `<p class="hc-texto">${esc(seccion.data.observacionesGenerales)}</p>` : ""}</section>`;
  if (seccion.kind === "development") return `<section class="hc-bloque hc-bloque--largo" data-export-section><h2 class="hc-bloque__titulo">${esc(seccion.titulo)}</h2><div class="hc-grid">${seccion.data.registros.map((item) => dato(item.hitoId, [item.estado, item.edad?.desconocida ? "Edad desconocida" : item.edad?.valor != null ? `${item.edad.valor} ${item.edad.unidad}` : "", item.observaciones].filter(Boolean).join(" · "))).join("")}</div>${seccion.data.observacionesGenerales ? `<p class="hc-texto">${esc(seccion.data.observacionesGenerales)}</p>` : ""}</section>`;
  return `<section class="hc-bloque ${String(seccion.data).length > 900 ? "hc-bloque--largo" : ""}" data-export-section><h2 class="hc-bloque__titulo">${esc(seccion.titulo)}</h2><p class="hc-texto">${esc(seccion.data)}</p></section>`;
}

function renderDiagnosticos(diagnosticos = []) {
  if (!diagnosticos.length) return "";
  return `<section class="hc-bloque" data-export-section><h2 class="hc-bloque__titulo">Diagnósticos</h2><table class="hc-tabla"><thead><tr><th>Código</th><th>Diagnóstico</th><th>Estado</th><th>Sistema</th></tr></thead><tbody>${diagnosticos.map((dx) => `<tr><td>${mostrar(dx.codigo)}</td><td>${mostrar(dx.diagnostico)}</td><td>${mostrar(dx.estado)}</td><td>${mostrar(dx.sistema)}</td></tr>`).join("")}</tbody></table></section>`;
}

function renderModelo(modelo) {
  const p = modelo.paciente, i = modelo.institucional, s = modelo.seguridad, m = modelo.medico;
  const vitales = Object.entries({ PA:modelo.vitales.presionArterial, FC:modelo.vitales.frecuenciaCardiaca, FR:modelo.vitales.frecuenciaRespiratoria, "Temp.":modelo.vitales.temperatura, "SpO₂":modelo.vitales.saturacionO2, Peso:modelo.somatometria.peso, Talla:modelo.somatometria.talla, IMC:modelo.somatometria.imc }).filter(([,v]) => v);
  const secciones = modelo.secciones.filter((seccion) => seccion.clave !== "diagnosticos").map(renderSeccion).join("");
  return `<article class="hc-documento" data-historia-documento><div class="hc-portada"><div class="hc-marca">${modelo.marca}</div><h1 class="hc-titulo">${modelo.titulo}</h1><p class="hc-meta">Generado: ${fecha(modelo.generadoEn)} · ${new Date(modelo.generadoEn).toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit"})} · Versión ${esc(modelo.version)}</p><section class="hc-bloque"><h2 class="hc-bloque__titulo">Identificación</h2><div class="hc-grid">${dato("Nombre",p.nombre)}${dato("Fecha de nacimiento",fecha(p.fechaNacimiento))}${dato("Edad",p.edad ? `${p.edad} años` : "")}${dato("Sexo",p.sexo)}${dato("Género",p.genero)}${dato("CURP",p.curp)}${dato("Teléfono",p.telefono)}</div></section><section class="hc-bloque"><h2 class="hc-bloque__titulo">Institución e ingreso</h2><div class="hc-grid">${dato("Institución",i.institucion)}${dato("Expediente institucional",i.expediente)}${dato("Servicio",i.servicio)}${dato("Cama / consultorio",i.cama)}${dato("Fecha de ingreso",fecha(i.fechaIngreso))}${dato("Tipo de atención",i.tipoAtencion)}</div></section><section class="hc-bloque"><h2 class="hc-bloque__titulo">Seguridad clínica</h2><div class="hc-grid">${dato("Alergias",s.alergias)}${dato("Tipo de sangre",s.tipoSangre)}${dato("Médico responsable",m.nombre)}${dato("Cargo",m.cargo)}${dato("Cédula profesional",m.cedula)}</div></section></div>${vitales.length ? `<section class="hc-bloque"><h2 class="hc-bloque__titulo">Signos vitales y somatometría</h2><table class="hc-tabla"><thead><tr>${vitales.map(([k])=>`<th>${esc(k)}</th>`).join("")}</tr></thead><tbody><tr>${vitales.map(([,v])=>`<td>${mostrar(v)}</td>`).join("")}</tr></tbody></table></section>` : ""}${renderDiagnosticos(modelo.diagnosticos)}${secciones}<section class="hc-bloque"><h2 class="hc-bloque__titulo">Firmas</h2><div class="hc-firmas"><div class="hc-firma"><strong>${mostrar(m.nombre)}</strong><span>${mostrar(m.cargo)}</span>${m.cedula ? `<span>Céd. Prof. ${esc(m.cedula)}</span>` : ""}<br><span>Firma</span></div></div></section><footer class="hc-pie"><span>Generado mediante COGNICIÓN LABS</span><span>Versión ${esc(HISTORIA_CLINICA_EXPORT_VERSION)}</span></footer></article>`;
}

function obtenerUiActual(gestores) {
  const ui = {};
  document.querySelectorAll("#formHistoria input, #formHistoria textarea, #formHistoria select").forEach((campo) => { if (campo.id) ui[campo.id] = campo.value; });
  ui.sustancias = gestores.sustancias?.obtenerDatos?.() || {};
  ui.hitosDesarrollo = gestores.hitosDesarrollo?.obtenerDatos?.() || {};
  ui.familiograma = gestores.familiograma?.obtenerDatos?.() || {};
  return ui;
}

export async function abrirExportacionHistoria({ paciente, historia, gestores, uidMedico } = {}) {
  const usuario = await getAuthenticatedUserOnce();
  const perfil = await getUserProfileOnce(usuario?.uid);
  const catalogo = await listarMedicosDelCatalogoDeFirmas(uidMedico || usuario?.uid);
  const medico = resolverMedicoDelCatalogo(perfil?.nombre, catalogo) || perfil || {};
  const modelo = normalizarHistoriaClinicaParaExportacion({ paciente, historia, ui: obtenerUiActual(gestores), medico });
  const modal = document.getElementById("historiaExportModal");
  const vista = document.getElementById("historiaExportVista");
  vista.innerHTML = renderModelo(modelo);
  modal.hidden = false;
  const documento = vista.querySelector("[data-historia-documento]");
  modal.querySelector("[data-export-pdf]").onclick = () => descargarHistoriaClinicaPdf(documento, `Historia_Clinica_${modelo.paciente.nombre.replace(/\s+/g,"_")}`);
  modal.querySelector("[data-export-docx]").onclick = () => descargarHistoriaClinicaDocx(modelo, `Historia_Clinica_${modelo.paciente.nombre.replace(/\s+/g,"_")}`);
  modal.querySelector("[data-export-cerrar]").onclick = () => { modal.hidden = true; };
}
