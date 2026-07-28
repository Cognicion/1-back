import { CATALOGO_HITOS_DESARROLLO, CATEGORIAS_HITOS_DESARROLLO, HITOS_DESARROLLO_POR_ID } from "../data/catalogoHitosDesarrollo.js";
import { configurarCamposRedimensionables } from "./redimensionadorCampos.js";

const estados = ["", "alcanzado", "no_alcanzado", "desconocido"];
const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const texto = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function registroVacio(hitoId) {
  return { hitoId, estado: "", edad: { valor: null, unidad: "meses", desconocida: false }, observaciones: "" };
}

function normalizarRegistro(registro = {}) {
  const base = registroVacio(String(registro.hitoId || "").trim());
  const edad = registro.edad || {};
  return {
    ...base, ...registro,
    estado: estados.includes(registro.estado) ? registro.estado : "",
    edad: { ...base.edad, ...edad, valor: edad.desconocida ? null : (edad.valor === "" || edad.valor == null ? null : Number(edad.valor)), desconocida: edad.desconocida === true, unidad: edad.unidad === "anios" ? "anios" : "meses" },
    observaciones: String(registro.observaciones || "")
  };
}

export function crearGestorHitosDesarrolloHistoria({ contenedor, edadPaciente = null } = {}) {
  if (!contenedor) return null;
  const estado = { registros: new Map(), busqueda: "", categoria: "", soloRegistrados: false, abiertos: new Set() };
  const agrupados = () => CATEGORIAS_HITOS_DESARROLLO.map((cat) => ({ ...cat, hitos: CATALOGO_HITOS_DESARROLLO.filter((h) => h.categoria === cat.id).filter((h) => (!estado.categoria || h.categoria === estado.categoria) && (!estado.busqueda || texto(`${h.nombre} ${h.id}`).includes(texto(estado.busqueda))) && (!estado.soloRegistrados || estado.registros.has(h.id))) }));
  const resumen = (registro) => registro?.edad?.desconocida ? "Edad desconocida" : (registro?.edad?.valor != null ? `${registro.edad.valor} ${registro.edad.unidad}` : "Sin edad registrada");

  function construir() {
    contenedor.innerHTML = `<div class="hitos-controles"><label for="buscadorHitosDesarrollo">Buscar hito</label><input id="buscadorHitosDesarrollo" type="search" placeholder="Buscar por nombre..."><label for="categoriaHitosDesarrollo">Categoría</label><select id="categoriaHitosDesarrollo"><option value="">Todas</option>${CATEGORIAS_HITOS_DESARROLLO.map((c) => `<option value="${c.id}">${escapar(c.nombre)}</option>`).join("")}</select><label class="hitos-check"><input id="soloHitosRegistrados" type="checkbox"> Solo registrados</label><button type="button" class="boton-secundario" data-hitos-accion="expandir">Expandir todos</button><button type="button" class="boton-secundario" data-hitos-accion="contraer">Contraer todos</button></div><p id="resumenHitosDesarrollo" class="historia-resumen" role="status"></p><div id="listaHitosDesarrollo"></div><label for="observacionesHitosDesarrollo">Observaciones generales del desarrollo</label><textarea id="observacionesHitosDesarrollo" rows="5"></textarea><p id="validacionHitosDesarrollo" class="historia-aviso-contexto" role="status"></p>`;
    contenedor.addEventListener("input", manejarCambio);
    contenedor.addEventListener("change", manejarCambio);
    contenedor.addEventListener("click", manejarClick);
    renderizar();
  }

  function renderizar() {
    const lista = contenedor.querySelector("#listaHitosDesarrollo");
    if (!lista) return;
    lista.innerHTML = agrupados().filter((g) => g.hitos.length).map((grupo) => `<section class="hitos-grupo"><h4>${escapar(grupo.nombre)}</h4>${grupo.hitos.map((hito) => { const r = estado.registros.get(hito.id) || registroVacio(hito.id); const open = estado.abiertos.has(hito.id); const panel = `hito-${hito.id}`; return `<details class="hito-item" data-hito-id="${hito.id}" ${open ? "open" : ""}><summary aria-controls="${panel}" aria-expanded="${open}"><strong>${escapar(hito.nombre)}</strong><small>${r.estado ? `${escapar(r.estado)} · ${escapar(resumen(r))}` : "Sin registrar"}</small></summary><div id="${panel}" class="hito-campos"><label>Estado<select data-hito-field="estado"><option value="">Sin especificar</option><option value="alcanzado" ${r.estado === "alcanzado" ? "selected" : ""}>Alcanzado</option><option value="no_alcanzado" ${r.estado === "no_alcanzado" ? "selected" : ""}>No alcanzado</option><option value="desconocido" ${r.estado === "desconocido" ? "selected" : ""}>Se desconoce</option></select></label><div class="hito-dos-columnas"><label>Edad aproximada<input type="number" min="0" max="120" step="1" data-hito-field="edad.valor" value="${r.edad.valor ?? ""}" ${r.edad.desconocida ? "disabled" : ""}></label><label>Unidad<select data-hito-field="edad.unidad"><option value="meses" ${r.edad.unidad === "meses" ? "selected" : ""}>Meses</option><option value="anios" ${r.edad.unidad === "anios" ? "selected" : ""}>Años</option></select></label></div><label class="hitos-check"><input type="checkbox" data-hito-field="edad.desconocida" ${r.edad.desconocida ? "checked" : ""}> Edad desconocida</label><label>Observaciones<textarea rows="3" data-hito-field="observaciones" placeholder="Datos del desarrollo, contexto o fuente de información.">${escapar(r.observaciones)}</textarea></label></div></details>`; }).join("")}</section>`).join("") || `<p class="historia-resumen">No hay hitos que coincidan con el filtro.</p>`;
    lista.querySelectorAll("details[data-hito-id]").forEach((d) => d.addEventListener("toggle", () => { const id = d.dataset.hitoId; d.open ? estado.abiertos.add(id) : estado.abiertos.delete(id); d.querySelector("summary")?.setAttribute("aria-expanded", String(d.open)); }));
    configurarCamposRedimensionables({ items: [...lista.querySelectorAll("textarea")].map((objetivo) => ({ objetivo, clave: `hito:${objetivo.closest("[data-hito-id]")?.dataset.hitoId}`, minimo: 80, alturaBase: 110 })), onAction: (accion, item) => console.debug("[HistoriaClinica:Expandir]", { etapa: accion, campo: item.clave, resultado: "ok" }) });
    actualizarResumen();
  }

  function actualizarResumen() { const salida = contenedor.querySelector("#resumenHitosDesarrollo"); if (salida) salida.textContent = `${estado.registros.size} hito(s) con información registrada.`; }
  function actualizarCampo(id, campo, valor) { const r = estado.registros.get(id) || registroVacio(id); if (campo === "edad.valor") r.edad.valor = valor === "" ? null : Number(valor); else if (campo === "edad.unidad") r.edad.unidad = valor; else if (campo === "edad.desconocida") r.edad.desconocida = valor; else r[campo] = valor; if (r.estado || r.edad.valor != null || r.edad.desconocida || r.observaciones.trim()) estado.registros.set(id, r); else estado.registros.delete(id); const d = contenedor.querySelector(`[data-hito-id="${CSS.escape(id)}"]`); d?.querySelector("summary small")?.replaceChildren(`${r.estado ? `${r.estado} · ${resumen(r)}` : "Sin registrar"}`); actualizarResumen(); }
  function manejarCambio(e) { const t = e.target; if (t.id === "buscadorHitosDesarrollo") { estado.busqueda = t.value; renderizar(); return; } if (t.id === "categoriaHitosDesarrollo") { estado.categoria = t.value; renderizar(); return; } if (t.id === "soloHitosRegistrados") { estado.soloRegistrados = t.checked; renderizar(); return; } const d = t.closest("[data-hito-id]"); if (d?.dataset.hitoId && t.dataset.hitoField) actualizarCampo(d.dataset.hitoId, t.dataset.hitoField, t.type === "checkbox" ? t.checked : t.value); }
  function manejarClick(e) { const accion = e.target.closest("[data-hitos-accion]")?.dataset.hitosAccion; if (!accion) return; if (accion === "expandir") agrupados().forEach((g) => g.hitos.forEach((h) => estado.abiertos.add(h.id))); else estado.abiertos.clear(); renderizar(); }
  function cargar(valor = {}) { estado.registros.clear(); (Array.isArray(valor.registros) ? valor.registros : []).forEach((r) => { if (HITOS_DESARROLLO_POR_ID[r.hitoId]) estado.registros.set(r.hitoId, normalizarRegistro(r)); }); const obs = contenedor.querySelector("#observacionesHitosDesarrollo"); if (obs) obs.value = String(valor.observacionesGenerales || ""); renderizar(); console.debug("[HistoriaClinica:Hitos]", { action: "normalized", selectedCount: estado.registros.size }); }
  function obtenerDatos() { return { registros: [...estado.registros.values()].map((r) => ({ ...r, edad: { ...r.edad, valor: r.edad.desconocida ? null : r.edad.valor } })), observacionesGenerales: contenedor.querySelector("#observacionesHitosDesarrollo")?.value || "" }; }
  function validar() { const avisos = []; for (const r of estado.registros.values()) { if (r.edad.valor != null && (!Number.isInteger(r.edad.valor) || r.edad.valor < 0 || r.edad.valor > 120)) avisos.push(`La edad del hito ${r.hitoId} no es válida.`); if (Number.isFinite(Number(edadPaciente)) && r.edad.unidad === "anios" && r.edad.valor > Number(edadPaciente)) avisos.push(`La edad del hito ${r.hitoId} supera la edad del paciente.`); } const out = contenedor.querySelector("#validacionHitosDesarrollo"); if (out) out.textContent = avisos.join(" "); return avisos; }
  construir();
  return { cargar, obtenerDatos, validar, renderizar };
}
