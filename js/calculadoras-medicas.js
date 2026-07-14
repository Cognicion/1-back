import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  CALCULADORAS_MEDICAS,
  CATEGORIAS_CALCULADORAS_MEDICAS,
  ejecutarCalculadoraMedica,
  obtenerCalculadoraMedica
} from "./data/calculadorasMedicas.js";

import { registrarEventoAuditoria, resumenError } from "./services/auditoria.js";

const STORAGE_FAVORITAS = "cognicion.calculadorasMedicas.favoritas";
const STORAGE_RECIENTES = "cognicion.calculadorasMedicas.recientes";

const estado = {
  usuario: null,
  perfil: null,
  calculadoraId: CALCULADORAS_MEDICAS[0]?.id || "",
  resultadoActual: null,
  inputsActuales: {},
  pacienteId: "",
  pacientes: [],
  favoritas: leerStorage(STORAGE_FAVORITAS, []),
  recientes: leerStorage(STORAGE_RECIENTES, [])
};

const nodos = {
  buscador: document.getElementById("buscadorCalculadorasMedicas"),
  categoria: document.getElementById("filtroCategoriaCalculadoras"),
  tipo: document.getElementById("filtroTipoCalculadoras"),
  especialidad: document.getElementById("filtroEspecialidadCalculadoras"),
  lista: document.getElementById("listaCalculadorasMedicas"),
  contador: document.getElementById("contadorCalculadoras"),
  panel: document.getElementById("panelCalculadoraMedica"),
  favoritas: document.getElementById("calculadorasFavoritas"),
  recientes: document.getElementById("calculadorasRecientes"),
  modal: document.getElementById("modalCalculadorasMedicas"),
  modalTitulo: document.getElementById("modalCalculadorasTitulo"),
  modalContenido: document.getElementById("contenidoModalCalculadoras"),
  cerrarModal: document.getElementById("cerrarModalCalculadoras"),
  formatoVacio: document.getElementById("btnDescargarFormatoVacio"),
  historialGlobal: document.getElementById("btnVerHistorialGlobal")
};

function leerStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function guardarStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escaparHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizar(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function nombreUsuario(usuario = {}) {
  return usuario.nombre || usuario.displayName || usuario.email || "Usuario";
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad >= 0 ? edad : "";
}

function opcionesUnicas(key) {
  return [...new Set(CALCULADORAS_MEDICAS.flatMap((calc) => {
    const value = calc[key];
    return Array.isArray(value) ? value : [value];
  }).filter(Boolean))].sort();
}

function poblarFiltros() {
  nodos.categoria.innerHTML = `<option value="">Todas</option>${CATEGORIAS_CALCULADORAS_MEDICAS.map((cat) => `<option value="${cat.id}">${escaparHTML(cat.nombre)}</option>`).join("")}`;
  nodos.tipo.innerHTML = `<option value="">Todos</option>${opcionesUnicas("type").map((tipo) => `<option value="${escaparHTML(tipo)}">${escaparHTML(tipo)}</option>`).join("")}`;
  nodos.especialidad.innerHTML = `<option value="">Todas</option>${opcionesUnicas("specialties").map((esp) => `<option value="${escaparHTML(esp)}">${escaparHTML(esp.replaceAll("-", " "))}</option>`).join("")}`;
}

function calculadorasFiltradas() {
  const texto = normalizar(nodos.buscador.value);
  const categoria = nodos.categoria.value;
  const tipo = nodos.tipo.value;
  const especialidad = nodos.especialidad.value;
  return CALCULADORAS_MEDICAS.filter((calc) => {
    if (calc.status !== "active") return false;
    if (categoria && calc.category !== categoria) return false;
    if (tipo && calc.type !== tipo) return false;
    if (especialidad && !calc.specialties?.includes(especialidad)) return false;
    if (!texto) return true;
    const haystack = normalizar([
      calc.name,
      calc.abbreviation,
      calc.description,
      calc.category,
      calc.type,
      ...(calc.specialties || []),
      ...(calc.aliases || [])
    ].join(" "));
    return haystack.includes(texto);
  });
}

function nombreCategoria(id) {
  return CATEGORIAS_CALCULADORAS_MEDICAS.find((cat) => cat.id === id)?.nombre || id;
}

function renderChips() {
  renderChipList(nodos.favoritas, estado.favoritas, "Sin favoritas");
  renderChipList(nodos.recientes, estado.recientes, "Sin recientes");
}

function renderChipList(container, ids, emptyText) {
  if (!ids.length) {
    container.innerHTML = `<div class="calc-med-empty">${emptyText}</div>`;
    return;
  }
  container.innerHTML = ids
    .map((id) => obtenerCalculadoraMedica(id))
    .filter(Boolean)
    .map((calc) => `<button class="calc-med-chip" type="button" data-calc-id="${calc.id}">${escaparHTML(calc.abbreviation || calc.name)}</button>`)
    .join("");
}

function renderLista() {
  const lista = calculadorasFiltradas();
  nodos.contador.textContent = `${lista.length} herramientas`;
  if (!lista.length) {
    nodos.lista.innerHTML = `<div class="calc-med-empty">No se encontraron calculadoras con esos filtros.</div>`;
    return;
  }
  if (!lista.some((calc) => calc.id === estado.calculadoraId)) {
    estado.calculadoraId = lista[0].id;
  }
  nodos.lista.innerHTML = lista.map((calc) => `
    <button class="calc-med-card${calc.id === estado.calculadoraId ? " activa" : ""}" type="button" data-calc-id="${calc.id}">
      <div class="calc-med-badges">
        <span class="calc-med-badge">${escaparHTML(calc.type)}</span>
        <span class="calc-med-badge">${escaparHTML(calc.version)}</span>
      </div>
      <h3>${escaparHTML(calc.name)}</h3>
      <p>${escaparHTML(calc.description)}</p>
    </button>
  `).join("");
}

function agregarReciente(id) {
  estado.recientes = [id, ...estado.recientes.filter((item) => item !== id)].slice(0, 6);
  guardarStorage(STORAGE_RECIENTES, estado.recientes);
  renderChips();
}

function alternarFavorita(id) {
  if (estado.favoritas.includes(id)) {
    estado.favoritas = estado.favoritas.filter((item) => item !== id);
  } else {
    estado.favoritas = [id, ...estado.favoritas].slice(0, 20);
  }
  guardarStorage(STORAGE_FAVORITAS, estado.favoritas);
  renderChips();
  renderPanel();
}

function renderPanel() {
  const calc = obtenerCalculadoraMedica(estado.calculadoraId);
  agregarReciente(calc.id);
  estado.resultadoActual = null;
  estado.inputsActuales = {};
  if (calc.externalUrl) {
    nodos.panel.innerHTML = `
      <div class="calc-med-panel-header">
        <div>
          <span class="kicker">${escaparHTML(nombreCategoria(calc.category))}</span>
          <h2>${escaparHTML(calc.name)}</h2>
          <p>${escaparHTML(calc.description)}</p>
          <div class="calc-med-badges">
            <span class="calc-med-badge">${escaparHTML(calc.type)}</span>
            <span class="calc-med-badge">Versión ${escaparHTML(calc.version)}</span>
            <span class="calc-med-badge">Disponible</span>
          </div>
        </div>
        <button class="calc-med-star" type="button" data-action="favorita" aria-label="Marcar como favorita">${estado.favoritas.includes(calc.id) ? "★" : "☆"}</button>
      </div>
      <section class="calc-med-result">
        <div class="calc-med-result-main">
          <div class="calc-med-result-value">
            <strong>${escaparHTML(calc.abbreviation || "PED")}</strong>
            <span>Módulo</span>
          </div>
          <div>
            <h3>Calculadoras pediátricas disponibles</h3>
            <p>Incluye crecimiento, líquidos, urgencias, neonatología, renal, respiratorio, cardiología y escalas clínicas pediátricas.</p>
            <p class="calc-med-muted">Los cálculos pediátricos verifican unidades y deben interpretarse con protocolos locales y juicio clínico.</p>
          </div>
        </div>
      </section>
      <div class="calc-med-actions">
        <button class="calc-med-primary" type="button" data-action="abrir-modulo">Abrir calculadoras pediátricas</button>
        <button class="calc-med-secondary" type="button" data-action="favorita">Guardar en favoritas</button>
      </div>
    `;
    estado.pacienteId = "";
    return;
  }
  nodos.panel.innerHTML = `
    <div class="calc-med-panel-header">
      <div>
        <span class="kicker">${escaparHTML(nombreCategoria(calc.category))}</span>
        <h2>${escaparHTML(calc.name)}</h2>
        <p>${escaparHTML(calc.description)} Duración aproximada: ${escaparHTML(calc.duration)}.</p>
        <div class="calc-med-badges">
          <span class="calc-med-badge">${escaparHTML(calc.type)}</span>
          <span class="calc-med-badge">Versión ${escaparHTML(calc.version)}</span>
          <span class="calc-med-badge">PDF</span>
        </div>
      </div>
      <button class="calc-med-star" type="button" data-action="favorita" aria-label="Marcar como favorita">${estado.favoritas.includes(calc.id) ? "★" : "☆"}</button>
    </div>

    <section class="calc-med-patient-link">
      <label>Vincular paciente
        <select id="selectorPacienteCalculadora">
          <option value="">Cálculo sin paciente vinculado</option>
          ${estado.pacientes.map((paciente) => `<option value="${paciente.id}">${escaparHTML(etiquetaPaciente(paciente))}</option>`).join("")}
        </select>
      </label>
      <label>Buscar paciente
        <input id="buscarPacienteCalculadora" type="search" placeholder="Nombre o expediente">
      </label>
      <button class="calc-med-secondary" type="button" data-action="recargar-pacientes">Recargar pacientes</button>
    </section>

    <form id="formCalculadoraMedica" class="calc-med-form">
      ${calc.inputs.map(renderInput).join("")}
    </form>

    <div class="calc-med-actions">
      <button class="calc-med-primary" type="button" data-action="calcular">Calcular</button>
      <button class="calc-med-secondary" type="button" data-action="limpiar">Limpiar</button>
      <button class="calc-med-secondary" type="button" data-action="copiar">Copiar resumen</button>
      <button class="calc-med-secondary" type="button" data-action="guardar">Guardar en expediente</button>
      <button class="calc-med-secondary" type="button" data-action="pdf-resultado">Descargar PDF</button>
      <button class="calc-med-secondary" type="button" data-action="pdf-vacio">Formato vacío</button>
    </div>

    <div id="resultadoCalculadoraMedica"></div>

    <details class="calc-med-explain">
      <summary>¿Cómo se utiliza?</summary>
      ${renderExplicacion(calc)}
    </details>
  `;
  estado.pacienteId = "";
}

function renderInput(input) {
  const help = input.help ? `<button class="calc-med-help" type="button" title="${escaparHTML(input.help)}" aria-label="Ayuda de ${escaparHTML(input.label)}">?</button>` : "";
  if (input.type === "select") {
    return `
      <div class="calc-med-field">
        <label><span class="calc-med-field-help">${escaparHTML(input.label)} ${help}</span>
          <select name="${input.id}" ${input.required === false ? "" : "required"}>
            <option value="">Seleccionar</option>
            ${input.options.map((option) => `<option value="${escaparHTML(option.value)}">${escaparHTML(option.label)}</option>`).join("")}
          </select>
        </label>
      </div>
    `;
  }
  if (input.type === "checkbox") {
    return `
      <div class="calc-med-field">
        <label><span class="calc-med-field-help">${help}</span>
          <span><input type="checkbox" name="${input.id}"> ${escaparHTML(input.label)}</span>
        </label>
      </div>
    `;
  }
  return `
    <div class="calc-med-field">
      <label><span class="calc-med-field-help">${escaparHTML(input.label)} ${help}</span>
        <input name="${input.id}" type="${input.type}" step="${input.step || "any"}" placeholder="${escaparHTML(input.unit || "")}" ${input.required === false ? "" : "required"}>
        ${input.unit ? `<small>Unidad esperada: ${escaparHTML(input.unit)}</small>` : ""}
      </label>
    </div>
  `;
}

function renderExplicacion(calc) {
  const fields = calc.inputs.map((input) => `<li><strong>${escaparHTML(input.label)}:</strong> ${escaparHTML(input.help || input.unit || "Dato requerido por la herramienta.")}</li>`).join("");
  const bib = (calc.bibliography || []).map((ref) => `<li>${escaparHTML([ref.authors, ref.title, ref.journal, ref.year].filter(Boolean).join(". "))}</li>`).join("");
  return `
    <p class="calc-med-muted">Herramienta de apoyo clínico. Use datos recientes, verifique unidades y no extrapole fuera del contexto validado.</p>
    <h3>Variables necesarias</h3>
    <ul>${fields}</ul>
    <h3>Limitaciones</h3>
    <ul>
      <li>El resultado no sustituye valoración médica.</li>
      <li>Los datos precargados del expediente deben verificarse antes de usarse.</li>
      <li>Si el resultado parece incompatible con la clínica, revise unidades y fuente del dato.</li>
    </ul>
    <h3>Bibliografía</h3>
    <ul>${bib || "<li>Referencia clínica pendiente de revisión bibliográfica formal para esta versión.</li>"}</ul>
  `;
}

function leerInputsFormulario() {
  const form = document.getElementById("formCalculadoraMedica");
  const calc = obtenerCalculadoraMedica(estado.calculadoraId);
  const values = {};
  calc.inputs.forEach((input) => {
    const element = form.elements[input.id];
    values[input.id] = input.type === "checkbox" ? Boolean(element?.checked) : (element?.value ?? "");
  });
  estado.inputsActuales = values;
  return values;
}

function calcularActual() {
  const calc = obtenerCalculadoraMedica(estado.calculadoraId);
  const inputs = leerInputsFormulario();
  const output = ejecutarCalculadoraMedica(calc.id, inputs);
  estado.resultadoActual = {
    id: `${calc.id}-${Date.now()}`,
    calculatorId: calc.id,
    calculatorVersion: calc.version,
    calculatorName: calc.name,
    category: calc.category,
    type: calc.type,
    patientId: estado.pacienteId || "",
    patientSnapshot: obtenerSnapshotPaciente(),
    inputs,
    normalizedInputs: inputs,
    result: output,
    interpretation: { text: output.interpretation || "", category: output.category || "" },
    missingData: output.missingData || [],
    warnings: output.warnings || [],
    bibliography: calc.bibliography || [],
    performedByUid: estado.usuario?.uid || "",
    performedByName: nombreUsuario(estado.perfil || estado.usuario || {}),
    source: "calculadoras-medicas",
    status: "final",
    isManualEntry: false,
    createdAtText: new Date().toISOString()
  };
  renderResultado();
  registrarAuditoriaSegura("calculo_realizado", `Calculó ${calc.name}`, { calculatorId: calc.id, patientId: estado.pacienteId || "" });
}

function renderResultado() {
  const container = document.getElementById("resultadoCalculadoraMedica");
  const data = estado.resultadoActual;
  if (!data) {
    container.innerHTML = "";
    return;
  }
  const output = data.result || {};
  if (output.missingData?.length) {
    container.innerHTML = `<div class="calc-med-error">Faltan datos: ${output.missingData.map(escaparHTML).join(", ")}.</div>`;
    return;
  }
  if (output.value === null || output.value === undefined || output.value === "NaN") {
    container.innerHTML = `<div class="calc-med-error">No fue posible calcular. ${output.warnings?.map(escaparHTML).join(" ") || "Revise los datos ingresados."}</div>`;
    return;
  }
  const details = output.details && Object.keys(output.details).length
    ? `<table class="calc-med-table"><tbody>${Object.entries(output.details).map(([key, value]) => `<tr><th>${escaparHTML(key)}</th><td>${escaparHTML(typeof value === "object" ? JSON.stringify(value) : value)}</td></tr>`).join("")}</tbody></table>`
    : "";
  const warnings = output.warnings?.length ? `<div class="calc-med-warning">${output.warnings.map(escaparHTML).join("<br>")}</div>` : "";
  container.innerHTML = `
    <section class="calc-med-result">
      <div class="calc-med-result-main">
        <div class="calc-med-result-value">
          <strong>${escaparHTML(output.value)}</strong>
          <span>${escaparHTML(output.unit || "")}</span>
        </div>
        <div>
          <h3>${escaparHTML(output.category || "Resultado")}</h3>
          <p>${escaparHTML(output.interpretation || "Interprete el resultado dentro del contexto clínico.")}</p>
          <p class="calc-med-muted">Paciente: ${escaparHTML(data.patientSnapshot?.nombre || "Sin paciente vinculado")} · Profesional: ${escaparHTML(data.performedByName)}</p>
        </div>
      </div>
      ${warnings}
      ${details}
    </section>
  `;
}

function etiquetaPaciente(paciente) {
  const edad = paciente.edad || calcularEdad(paciente.fechaNacimiento);
  const expediente = paciente.expedienteCognicion || paciente.expediente || paciente.id;
  return `${paciente.nombre || "Sin nombre"}${edad !== "" ? ` · ${edad} años` : ""}${paciente.sexo ? ` · ${paciente.sexo}` : ""} · ${expediente}`;
}

function obtenerSnapshotPaciente() {
  const paciente = estado.pacientes.find((item) => item.id === estado.pacienteId);
  if (!paciente) return {};
  return {
    id: paciente.id,
    nombre: paciente.nombre || "",
    age: paciente.edad || calcularEdad(paciente.fechaNacimiento) || "",
    sex: paciente.sexo || "",
    weight: paciente.peso || "",
    height: paciente.talla || "",
    expedienteCognicion: paciente.expedienteCognicion || ""
  };
}

function precargarPacienteEnFormulario(paciente) {
  const form = document.getElementById("formCalculadoraMedica");
  if (!form || !paciente) return;
  const calc = obtenerCalculadoraMedica(estado.calculadoraId);
  const edad = paciente.edad || calcularEdad(paciente.fechaNacimiento);
  const map = {
    edad,
    sexo: normalizar(paciente.sexo).includes("fem") || normalizar(paciente.genero).includes("fem") ? "femenino" : normalizar(paciente.sexo).includes("mas") ? "masculino" : "",
    peso: paciente.peso || "",
    talla: paciente.talla || "",
    tallaCm: paciente.talla ? Number(paciente.talla) * 100 : ""
  };
  calc.inputs.forEach((input) => {
    const element = form.elements[input.id];
    if (!element || element.type === "checkbox") return;
    if (map[input.id] !== undefined && map[input.id] !== "") element.value = map[input.id];
  });
}

async function cargarPerfilUsuario(user) {
  try {
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    estado.perfil = snap.exists() ? snap.data() : { email: user.email, nombre: user.displayName || user.email };
  } catch {
    estado.perfil = { email: user.email, nombre: user.displayName || user.email };
  }
}

function pacientePuedeVerseLocal(datos = {}, uid = "") {
  if (!uid) return false;
  if ([datos.creadoPor, datos.ownerUid, datos.createdByUid, datos.medicoUid, datos.medicoTratanteUid].includes(uid)) return true;
  if (Array.isArray(datos.medicosAutorizados) && datos.medicosAutorizados.includes(uid)) return true;
  if (datos.permisos && (datos.permisos[uid] || datos.permisos.includes?.(uid))) return true;
  return false;
}

async function cargarPacientesAutorizados() {
  if (!estado.usuario) return;
  const uid = estado.usuario.uid;
  const consultas = [
    query(collection(db, "pacientes"), where("creadoPor", "==", uid), limit(80)),
    query(collection(db, "pacientes"), where("medicoUid", "==", uid), limit(80)),
    query(collection(db, "pacientes"), where("ownerUid", "==", uid), limit(80)),
    query(collection(db, "pacientes"), where("medicosAutorizados", "array-contains", uid), limit(80))
  ];
  const mapa = new Map();
  for (const consulta of consultas) {
    try {
      const snap = await getDocs(consulta);
      snap.forEach((docPaciente) => mapa.set(docPaciente.id, { id: docPaciente.id, ...docPaciente.data() }));
    } catch {
      // Las reglas pueden bloquear alguna variante; seguimos con las demás consultas permitidas.
    }
  }
  estado.pacientes = [...mapa.values()].filter((paciente) => pacientePuedeVerseLocal(paciente, uid) || estado.perfil?.rol === "admin");
}

async function guardarResultado() {
  const data = estado.resultadoActual;
  if (!data) {
    alert("Primero realiza un cálculo.");
    return;
  }
  if (!estado.pacienteId) {
    alert("Vincula un paciente para guardar en expediente. En modo rápido puedes copiar o descargar el resultado sin guardar datos identificables.");
    return;
  }
  const payload = limpiarParaFirestore({
    ...data,
    patientId: estado.pacienteId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  try {
    await addDoc(collection(db, "pacientes", estado.pacienteId, "calculadorasMedicas"), payload);
    await registrarAuditoriaSegura("resultado_guardado", `Guardó resultado de ${data.calculatorName}`, { calculatorId: data.calculatorId, patientId: estado.pacienteId });
    alert("Resultado guardado en el expediente.");
  } catch (error) {
    console.error(error);
    alert("No se pudo guardar el resultado. Revisa permisos de Firestore.");
  }
}

function limpiarParaFirestore(value) {
  if (Array.isArray(value)) return value.map(limpiarParaFirestore).filter((item) => item !== undefined);
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value)
      .map(([key, val]) => [key, limpiarParaFirestore(val)])
      .filter(([, val]) => val !== undefined && val !== null && val !== Number.NaN));
  }
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;
  if (value === undefined) return undefined;
  return value;
}

function resumenClinico(data = estado.resultadoActual) {
  if (!data) return "";
  const output = data.result || {};
  return [
    `Calculadora: ${data.calculatorName}`,
    `Fecha: ${new Date(data.createdAtText || Date.now()).toLocaleString("es-MX")}`,
    `Paciente: ${data.patientSnapshot?.nombre || "Sin paciente vinculado"}`,
    `Resultado: ${output.value} ${output.unit || ""}`,
    `Categoría: ${output.category || "Sin categoría"}`,
    `Interpretación: ${output.interpretation || "Sin interpretación registrada"}`,
    `Versión: ${data.calculatorVersion}`
  ].join("\n");
}

async function copiarResumen() {
  if (!estado.resultadoActual) {
    alert("Primero realiza un cálculo.");
    return;
  }
  await navigator.clipboard.writeText(resumenClinico());
  alert("Resumen copiado.");
}

function abrirVentanaImpresion({ empty = false } = {}) {
  const calc = obtenerCalculadoraMedica(estado.calculadoraId);
  const data = estado.resultadoActual;
  const paciente = data?.patientSnapshot?.nombre || "Sin paciente vinculado";
  const rows = calc.inputs.map((input) => `
    <tr>
      <td>${escaparHTML(input.label)}</td>
      <td>${empty ? "" : escaparHTML(data?.inputs?.[input.id] ?? "")}</td>
      <td>${escaparHTML(input.unit || "")}</td>
    </tr>
  `).join("");
  const resultado = !empty && data ? `
    <h2>Resultado</h2>
    <p><strong>${escaparHTML(data.result.value)} ${escaparHTML(data.result.unit || "")}</strong></p>
    <p>${escaparHTML(data.result.category || "")}</p>
    <p>${escaparHTML(data.result.interpretation || "")}</p>
  ` : `<h2>Resultado</h2><p>________________________________________</p><p>Interpretación: ________________________________</p>`;
  const html = `
    <!doctype html><html><head><meta charset="UTF-8"><title>COGNICIÓN_${escaparHTML(calc.id)}</title>
    <style>
      body{font-family:Arial,sans-serif;color:#111827;margin:32px;line-height:1.45}
      header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0ea5e9;padding-bottom:12px;margin-bottom:18px}
      img{width:46px;height:46px} h1{margin:0;font-size:24px} h2{color:#075985}
      table{width:100%;border-collapse:collapse;margin:14px 0} td,th{border:1px solid #d1d5db;padding:8px;text-align:left} th{background:#e0f2fe}
      .muted{color:#4b5563}.footer{margin-top:28px;border-top:1px solid #d1d5db;padding-top:12px;font-size:12px;color:#4b5563}
    </style></head><body>
      <header><img src="assets/favicon-cognicion.png"><div><h1>COGNICIÓN Labs</h1><div class="muted">Calculadoras médicas</div></div></header>
      <h2>${escaparHTML(calc.name)}</h2>
      <p><strong>Paciente:</strong> ${escaparHTML(paciente)} · <strong>Fecha:</strong> ${new Date().toLocaleString("es-MX")}</p>
      <p>${escaparHTML(calc.description)}</p>
      <table><thead><tr><th>Variable</th><th>Valor</th><th>Unidad</th></tr></thead><tbody>${rows}</tbody></table>
      ${resultado}
      <h2>Bibliografía</h2>
      <ul>${(calc.bibliography || []).map((ref) => `<li>${escaparHTML([ref.authors, ref.title, ref.journal, ref.year].filter(Boolean).join(". "))}</li>`).join("") || "<li>Pendiente de revisión bibliográfica formal.</li>"}</ul>
      <div class="footer">Documento de apoyo a la decisión clínica. No sustituye valoración médica. Versión ${escaparHTML(calc.version)}.</div>
      <script>window.onload=()=>{window.print();};<\/script>
    </body></html>`;
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!win) {
    alert("El navegador bloqueó la ventana de impresión.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

async function mostrarHistorialGlobal() {
  if (!estado.pacienteId) {
    abrirModal("Resultados guardados", `<div class="calc-med-empty">Vincula un paciente desde una calculadora para consultar su historial en este módulo.</div>`);
    return;
  }
  try {
    const snap = await getDocs(query(collection(db, "pacientes", estado.pacienteId, "calculadorasMedicas"), orderBy("createdAtText", "desc"), limit(30)));
    const rows = snap.docs.map((item) => {
      const data = item.data();
      return `<tr><td>${escaparHTML(data.calculatorName)}</td><td>${escaparHTML(data.result?.value)} ${escaparHTML(data.result?.unit || "")}</td><td>${escaparHTML(data.result?.category || "")}</td><td>${escaparHTML(data.createdAtText || "")}</td></tr>`;
    }).join("");
    abrirModal("Resultados guardados", rows ? `<table class="calc-med-table"><thead><tr><th>Calculadora</th><th>Resultado</th><th>Categoría</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="calc-med-empty">Aún no hay resultados guardados para este paciente.</div>`);
  } catch (error) {
    abrirModal("Resultados guardados", `<div class="calc-med-error">No se pudo cargar el historial: ${escaparHTML(error.message)}</div>`);
  }
}

function abrirModal(titulo, contenido) {
  nodos.modalTitulo.textContent = titulo;
  nodos.modalContenido.innerHTML = contenido;
  nodos.modal.classList.remove("oculto");
  nodos.modal.setAttribute("aria-hidden", "false");
}

function cerrarModal() {
  nodos.modal.classList.add("oculto");
  nodos.modal.setAttribute("aria-hidden", "true");
}

async function registrarAuditoriaSegura(accion, descripcion, detalles = {}) {
  try {
    await registrarEventoAuditoria({
      accion,
      modulo: "calculadoras-medicas",
      descripcion,
      usuarioUid: estado.usuario?.uid || "",
      usuarioNombre: nombreUsuario(estado.perfil || estado.usuario || {}),
      usuarioRol: estado.perfil?.rol || "",
      pacienteUid: estado.pacienteId || "",
      pacienteNombre: obtenerSnapshotPaciente().nombre || "",
      detalles
    });
  } catch (error) {
    console.warn("Auditoría no registrada", resumenError(error));
  }
}

function manejarClick(event) {
  const card = event.target.closest("[data-calc-id]");
  if (card) {
    estado.calculadoraId = card.dataset.calcId;
    renderLista();
    renderPanel();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "favorita") alternarFavorita(estado.calculadoraId);
  if (action === "abrir-modulo") {
    const calc = obtenerCalculadoraMedica(estado.calculadoraId);
    if (calc.externalUrl) window.location.href = calc.externalUrl;
  }
  if (action === "calcular") calcularActual();
  if (action === "limpiar") renderPanel();
  if (action === "copiar") copiarResumen();
  if (action === "guardar") guardarResultado();
  if (action === "pdf-resultado") {
    if (!estado.resultadoActual) calcularActual();
    if (estado.resultadoActual) abrirVentanaImpresion({ empty: false });
  }
  if (action === "pdf-vacio") abrirVentanaImpresion({ empty: true });
  if (action === "recargar-pacientes") cargarPacientesAutorizados().then(renderPanel);
}

function manejarCambioPanel(event) {
  if (event.target.id === "selectorPacienteCalculadora") {
    estado.pacienteId = event.target.value;
    const paciente = estado.pacientes.find((item) => item.id === estado.pacienteId);
    if (paciente) precargarPacienteEnFormulario(paciente);
  }
}

function manejarBusquedaPaciente(event) {
  if (event.target.id !== "buscarPacienteCalculadora") return;
  const term = normalizar(event.target.value);
  const selector = document.getElementById("selectorPacienteCalculadora");
  if (!selector) return;
  selector.innerHTML = `<option value="">Cálculo sin paciente vinculado</option>${estado.pacientes
    .filter((paciente) => normalizar(etiquetaPaciente(paciente)).includes(term))
    .map((paciente) => `<option value="${paciente.id}">${escaparHTML(etiquetaPaciente(paciente))}</option>`)
    .join("")}`;
}

function inicializarEventos() {
  [nodos.buscador, nodos.categoria, nodos.tipo, nodos.especialidad].forEach((node) => {
    node.addEventListener("input", () => {
      renderLista();
      renderPanel();
    });
  });
  document.addEventListener("click", manejarClick);
  nodos.panel.addEventListener("change", manejarCambioPanel);
  nodos.panel.addEventListener("input", manejarBusquedaPaciente);
  nodos.cerrarModal.addEventListener("click", cerrarModal);
  nodos.modal.addEventListener("click", (event) => {
    if (event.target === nodos.modal) cerrarModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cerrarModal();
  });
  nodos.formatoVacio.addEventListener("click", () => abrirVentanaImpresion({ empty: true }));
  nodos.historialGlobal.addEventListener("click", mostrarHistorialGlobal);
}

function inicializar() {
  poblarFiltros();
  renderChips();
  renderLista();
  renderPanel();
  inicializarEventos();
  onAuthStateChanged(auth, async (user) => {
    estado.usuario = user;
    if (!user) return;
    await cargarPerfilUsuario(user);
    await cargarPacientesAutorizados();
    renderPanel();
  });
}

inicializar();
