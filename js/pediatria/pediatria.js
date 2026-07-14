import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { aplicarAparienciaGuardada } from "../services/apariencia.js";
import { buildGrowthAssessment, normalizeText } from "../services/growth/growthCalculationService.js";
import { calcularEdadPediatrica, formatearFechaDDMMAAAA } from "./edad.js";
import {
  analizarTalla,
  calcularAnionGap,
  calcularDeficit,
  calcularDiuresis,
  calcularIMC,
  corregirSodioPorGlucosa,
  mantenimientoHollidaySegarDetalle,
  numero,
  superficieCorporal
} from "./formulas.js";
import { calcularDosisMedicamento, MEDICAMENTOS_PEDIATRICOS } from "./medicamentos.js";
import { FUENTES_PEDIATRIA } from "./fuentes.js";

aplicarAparienciaGuardada();

const estado = {
  paciente: {},
  uidPaciente: new URLSearchParams(window.location.search).get("id") || "",
  usuario: null,
  usuarioDatos: {},
  seccion: "resumen",
  modoTemporal: false,
  pacientesBusqueda: [],
  historial: JSON.parse(localStorage.getItem("cognicionPediatriaHistorial") || "[]"),
  ultimosPacientes: JSON.parse(localStorage.getItem("cognicionPediatriaUltimosPacientes") || "[]"),
  crecimiento: null
};

const secciones = [
  ["resumen", "Resumen"],
  ["crecimiento", "Crecimiento"],
  ["herramientas", "Herramientas"],
  ["tratamiento", "Tratamiento"],
  ["seguimiento", "Seguimiento"]
];

const $ = (id) => document.getElementById(id);

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }
  estado.usuario = usuario;
  estado.usuarioDatos = await cargarUsuario(usuario.uid);
  $("usuarioSesion").textContent = usuario.email || "Usuario activo";
  $("fechaMedicion").value = new Date().toISOString().slice(0, 10);
  await cargarPacienteInicial();
  inicializar();
});

async function cargarUsuario(uid) {
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    return snap.exists() ? snap.data() : {};
  } catch (error) {
    console.warn("No se pudo leer usuario actual", error);
    return {};
  }
}

async function cargarPacienteInicial() {
  if (!estado.uidPaciente) return;
  try {
    const snap = await getDoc(doc(db, "usuarios", estado.uidPaciente));
    if (!snap.exists()) {
      $("estadoPaciente").textContent = "No se encontró el expediente.";
      return;
    }
    seleccionarPaciente(estado.uidPaciente, snap.data(), { silent: true });
  } catch (error) {
    console.warn("No se pudo cargar paciente para pediatría", error);
    $("estadoPaciente").textContent = "No se pudo leer el expediente.";
  }
}

function inicializar() {
  renderNavegacion();
  llenarDatosPaciente();
  poblarMedicamentos();
  bindEventos();
  renderSeccion();
  calcularTodo();
}

function bindEventos() {
  bindEntradasCalculo();
  $("busquedaPediatria").addEventListener("input", renderSeccion);
  $("buscadorPacientePediatria").addEventListener("input", debounce(buscarPacientes, 260));
  $("btnBuscarPaciente").addEventListener("click", buscarPacientes);
  $("btnModoTemporal").addEventListener("click", activarModoTemporal);
  $("btnUltimosPacientes").addEventListener("click", mostrarUltimosPacientes);
  $("btnGuardarMedicion").addEventListener("click", guardarMedicionPediatrica);
}

function bindEntradasCalculo() {
  document.querySelectorAll("[data-ped-calc]").forEach((elemento) => {
    if (elemento.dataset.pedBound === "1") return;
    elemento.dataset.pedBound = "1";
    elemento.addEventListener("input", calcularTodo);
    elemento.addEventListener("change", calcularTodo);
  });
}

function renderNavegacion() {
  $("pediatriaNav").innerHTML = secciones.map(([id, etiqueta]) => `
    <button class="ped-nav-btn ${estado.seccion === id ? "activo" : ""}" data-seccion="${id}">
      ${etiqueta}
    </button>
  `).join("");
  document.querySelectorAll(".ped-nav-btn").forEach((boton) => {
    boton.addEventListener("click", () => {
      estado.seccion = boton.dataset.seccion;
      renderNavegacion();
      renderSeccion();
      calcularTodo();
    });
  });
}

function llenarDatosPaciente() {
  const p = estado.paciente || {};
  const inst = p.datosInstitucionales || {};
  const signos = p.signosVitales || {};
  const somato = p.somatometria || {};
  $("nombrePaciente").value = p.nombre || p.nombreCompleto || "";
  $("sexoPaciente").value = p.sexo || inst.sexo || "";
  $("fechaNacimiento").value = normalizarFechaInput(p.fechaNacimiento || inst.fechaNacimiento || "");
  $("edadGestacional").value = p.edadGestacional || p.edadGestacionalNacimiento || "";
  $("pesoKg").value = p.peso || signos.peso || somato.peso || inst.peso || "";
  $("tallaCm").value = p.talla || signos.talla || somato.talla || inst.talla || "";
  $("perimetroCefalico").value = p.perimetroCefalico || somato.perimetroCefalico || "";
  $("alergias").value = p.alergias || inst.alergias || "";
}

function normalizarFechaInput(valor) {
  if (!valor) return "";
  const iso = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = String(valor).match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (local) return `${local[3]}-${local[2]}-${local[1]}`;
  return "";
}

function poblarMedicamentos() {
  $("medicamentoSelect").innerHTML = MEDICAMENTOS_PEDIATRICOS.map((med) => `
    <option value="${med.id}">${med.nombre} · ${med.categoria}</option>
  `).join("");
  $("medicamentoSelect").addEventListener("change", () => {
    const med = MEDICAMENTOS_PEDIATRICOS.find((item) => item.id === $("medicamentoSelect").value);
    $("opcionDosisSelect").innerHTML = (med?.opciones || []).map((opcion, index) => `
      <option value="${index}">${opcion.etiqueta}</option>
    `).join("");
    calcularTodo();
  });
  $("medicamentoSelect").dispatchEvent(new Event("change"));
}

async function buscarPacientes() {
  const termino = normalizeText($("buscadorPacientePediatria").value);
  if (!termino || termino.length < 2) {
    $("resultadosBusquedaPacientes").innerHTML = "";
    return;
  }
  $("resultadosBusquedaPacientes").innerHTML = `<div class="ped-empty">Buscando pacientes...</div>`;
  try {
    const snap = await getDocs(collection(db, "usuarios"));
    const resultados = [];
    snap.forEach((documento) => {
      const data = documento.data();
      if (!parecePaciente(data) || !puedeVerPaciente(documento.id, data)) return;
      const texto = normalizeText([
        data.nombre,
        data.nombreCompleto,
        data.apellidos,
        data.expediente,
        data.expedienteCognicion,
        data.expedienteInstitucional,
        data.curp,
        data.telefono,
        data.correo,
        data.email,
        data.fechaNacimiento
      ].filter(Boolean).join(" "));
      if (texto.includes(termino)) resultados.push({ id: documento.id, data });
    });
    estado.pacientesBusqueda = resultados.slice(0, 20);
    renderResultadosBusqueda();
  } catch (error) {
    console.warn("No se pudo buscar pacientes pediátricos", error);
    $("resultadosBusquedaPacientes").innerHTML = `<div class="ped-empty">No se pudieron cargar pacientes con los permisos actuales.</div>`;
  }
}

function parecePaciente(data = {}) {
  const rol = normalizeText(data.rol || data.role || "");
  return rol === "paciente" || data.fechaNacimiento || data.expedienteCognicion || data.tipoPaciente;
}

function puedeVerPaciente(id, data = {}) {
  const rol = normalizeText(estado.usuarioDatos.rol || estado.usuarioDatos.role || "");
  if (rol.includes("admin")) return true;
  const uid = estado.usuario?.uid;
  if (!uid) return false;
  if (id === uid) return true;
  const camposUid = [
    data.uidMedico,
    data.medicoUid,
    data.creadoPor,
    data.uidProfesional,
    data.profesionalUid,
    data.medicoTratanteUid,
    data.psicologoUid
  ].filter(Boolean);
  if (camposUid.includes(uid)) return true;
  const listas = [data.permisos, data.medicosAutorizados, data.profesionalesAutorizados, data.vinculadoA]
    .filter(Array.isArray);
  return listas.some((lista) => lista.includes(uid));
}

function renderResultadosBusqueda() {
  if (!estado.pacientesBusqueda.length) {
    $("resultadosBusquedaPacientes").innerHTML = `<div class="ped-empty">No se encontraron pacientes con ese criterio.</div>`;
    return;
  }
  $("resultadosBusquedaPacientes").innerHTML = estado.pacientesBusqueda.map(({ id, data }) => `
    <button class="ped-patient-result" type="button" data-paciente-id="${id}">
      <strong>${data.nombre || data.nombreCompleto || "Paciente sin nombre"}</strong>
      <span>${data.expedienteCognicion || data.expediente || "Sin expediente"} · ${formatearFechaDDMMAAAA(data.fechaNacimiento) || "Sin fecha de nacimiento"}</span>
    </button>
  `).join("");
  document.querySelectorAll("[data-paciente-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = estado.pacientesBusqueda.find((paciente) => paciente.id === button.dataset.pacienteId);
      if (item) seleccionarPaciente(item.id, item.data);
    });
  });
}

function seleccionarPaciente(id, data, options = {}) {
  estado.uidPaciente = id;
  estado.paciente = data || {};
  estado.modoTemporal = false;
  guardarUltimoPaciente(id, data);
  llenarDatosPaciente();
  mostrarPanelMediciones(true);
  renderPacienteActivo();
  $("estadoPaciente").textContent = "Expediente pediátrico conectado.";
  $("resultadosBusquedaPacientes").innerHTML = options.silent ? "" : `<div class="ped-ok">Paciente seleccionado.</div>`;
  calcularTodo();
  renderSeccion();
}

function activarModoTemporal() {
  estado.uidPaciente = "";
  estado.paciente = {};
  estado.modoTemporal = true;
  mostrarPanelMediciones(true);
  renderPacienteActivo();
  $("estadoPaciente").textContent = "Evaluación temporal sin expediente. No se guardará en historial del paciente.";
  $("resultadosBusquedaPacientes").innerHTML = `<div class="ped-alerta-box">Modo temporal activo. Úsalo solo cuando el paciente aún no tenga expediente.</div>`;
}

function mostrarPanelMediciones(mostrar) {
  $("panelMediciones").classList.toggle("oculto", !mostrar);
}

function renderPacienteActivo() {
  const nombre = $("nombrePaciente").value || "Paciente temporal";
  const fecha = formatearFechaDDMMAAAA($("fechaNacimiento").value) || "Sin fecha de nacimiento";
  const etiqueta = estado.modoTemporal ? "Evaluación sin expediente" : (estado.uidPaciente ? "Expediente conectado" : "Sin expediente");
  $("pacienteActivoCard").innerHTML = `<strong>${nombre}</strong><span>${etiqueta} · ${fecha}</span>`;
}

function mostrarUltimosPacientes() {
  const lista = estado.ultimosPacientes.filter(Boolean);
  if (!lista.length) {
    $("resultadosBusquedaPacientes").innerHTML = `<div class="ped-empty">Aún no hay pacientes pediátricos recientes.</div>`;
    return;
  }
  $("resultadosBusquedaPacientes").innerHTML = lista.map((item) => `
    <button class="ped-patient-result" type="button" data-ultimo-id="${item.id}">
      <strong>${item.nombre}</strong>
      <span>${item.fechaNacimiento || "Sin fecha"} · último acceso ${formatearFechaDDMMAAAA(item.fechaAcceso)}</span>
    </button>
  `).join("");
  document.querySelectorAll("[data-ultimo-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const snap = await getDoc(doc(db, "usuarios", button.dataset.ultimoId));
      if (snap.exists()) seleccionarPaciente(button.dataset.ultimoId, snap.data());
    });
  });
}

function guardarUltimoPaciente(id, data = {}) {
  const item = {
    id,
    nombre: data.nombre || data.nombreCompleto || "Paciente sin nombre",
    fechaNacimiento: formatearFechaDDMMAAAA(data.fechaNacimiento) || "",
    fechaAcceso: new Date().toISOString()
  };
  estado.ultimosPacientes = [item, ...estado.ultimosPacientes.filter((paciente) => paciente.id !== id)].slice(0, 8);
  localStorage.setItem("cognicionPediatriaUltimosPacientes", JSON.stringify(estado.ultimosPacientes));
}

function calcularTodo() {
  const edad = calcularEdadPediatrica($("fechaNacimiento").value, $("fechaMedicion").value ? new Date($("fechaMedicion").value) : new Date(), $("edadGestacional").value);
  const tallaInfo = analizarTalla($("tallaCm").value);
  const imc = calcularIMC($("pesoKg").value, $("tallaCm").value);
  const sc = superficieCorporal($("pesoKg").value, $("tallaCm").value);
  const mantenimiento = mantenimientoHollidaySegarDetalle($("pesoKg").value);
  const deficit = calcularDeficit($("pesoKg").value, $("deshidratacion").value);
  const diuresis = calcularDiuresis($("diuresisMl").value, $("pesoKg").value, $("diuresisHoras").value);
  const sodio = corregirSodioPorGlucosa($("sodio").value, $("glucosa").value);
  const gap = calcularAnionGap($("sodio").value, $("cloro").value, $("bicarbonato").value);
  const dosis = calcularDosisMedicamento({
    medicamentoId: $("medicamentoSelect").value,
    opcionIndice: $("opcionDosisSelect").value,
    pesoKg: $("pesoKg").value,
    concentracionMgMl: $("concentracionMgMl").value,
    pesoConfirmado: $("pesoConfirmado").checked
  });

  estado.crecimiento = buildGrowthAssessment({
    nombre: $("nombrePaciente").value,
    sexo: $("sexoPaciente").value,
    fechaNacimiento: $("fechaNacimiento").value,
    fechaMedicion: $("fechaMedicion").value,
    edadGestacional: $("edadGestacional").value,
    pesoKg: $("pesoKg").value,
    tallaCm: $("tallaCm").value,
    perimetroCefalico: $("perimetroCefalico").value,
    referenceId: $("referenciaCrecimiento")?.value || "who_2006_0_5"
  });

  renderResumen(edad, { tallaInfo, imc, sc });
  renderPacienteActivo();
  estado.calculos = { edad, tallaInfo, imc, sc, mantenimiento, deficit, diuresis, sodio, gap, dosis };
  refrescarResultadosVisibles();
}

function refrescarResultadosVisibles() {
  renderSeccion();
}

function renderResumen(edad = null, calculos = {}) {
  const imc = calculos.imc ?? calcularIMC($("pesoKg").value, $("tallaCm").value);
  const sc = calculos.sc ?? superficieCorporal($("pesoKg").value, $("tallaCm").value);
  const tallaInfo = calculos.tallaInfo ?? analizarTalla($("tallaCm").value);
  const diagnosticos = obtenerDiagnosticosPaciente();
  const medicamentos = obtenerMedicamentosActivos();
  $("resumenPediatria").innerHTML = `
    <article class="ped-summary-card"><span>Paciente</span><b>${$("nombrePaciente").value || (estado.modoTemporal ? "Evaluación temporal" : "Sin paciente")}</b><small>${$("sexoPaciente").value || "Sexo sin registro"} · ${formatearFechaDDMMAAAA($("fechaNacimiento").value) || "Sin fecha de nacimiento"}</small></article>
    <article class="ped-summary-card"><span>Edad exacta</span><b>${edad?.edadCronologicaTexto || "Sin edad"}</b><small>${edad ? `${Math.floor(edad.diasTotales / 30.4375)} meses totales · ${edad.diasTotales} días` : "Calculada desde fecha de nacimiento"}</small></article>
    <article class="ped-summary-card"><span>Somatometría</span><b>${$("pesoKg").value || "-"} kg · ${formatearTallaClinica(tallaInfo)}</b><small>IMC ${imc ? imc.toFixed(2) : "-"} kg/m² · SC ${sc ? sc.mosteller.toFixed(2) : "-"} m²</small></article>
    <article class="ped-summary-card"><span>Alergias y contexto</span><b>${$("alergias").value || "Sin alergias registradas"}</b><small>${diagnosticos.length ? `Dx: ${diagnosticos.join("; ")}` : "Sin diagnósticos cargados"}${medicamentos.length ? ` · Tx: ${medicamentos.join(", ")}` : ""}</small></article>
  `;
}

function renderSeccion() {
  $("tituloSeccionPediatria").textContent = secciones.find(([id]) => id === estado.seccion)?.[1] || "Centro pediátrico";
  const filtro = normalizeText($("busquedaPediatria").value);
  const html = {
    resumen: renderTabResumen(),
    crecimiento: renderTabCrecimiento(),
    herramientas: renderTabHerramientas(),
    tratamiento: renderTabTratamiento(),
    seguimiento: renderTabSeguimiento()
  }[estado.seccion] || renderTabResumen();
  $("contenidoPediatria").innerHTML = filtrarHtmlBasico(html, filtro);
  bindEntradasCalculo();
  bindBotonesDinamicos();
}

function filtrarHtmlBasico(html, filtro) {
  if (!filtro) return html;
  return normalizeText(html).includes(filtro) ? html : `<div class="ped-empty">No se encontraron resultados en esta pestaña.</div>`;
}

function bindBotonesDinamicos() {
  document.querySelectorAll("[data-ir]").forEach((boton) => {
    boton.addEventListener("click", () => {
      estado.seccion = boton.dataset.ir;
      renderNavegacion();
      renderSeccion();
    });
  });
  $("referenciaCrecimiento")?.addEventListener("change", calcularTodo);
  document.querySelectorAll("[data-set-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const target = $(input.dataset.setField);
      if (target) target.value = input.value;
      if (target?.id === "medicamentoSelect") {
        target.dispatchEvent(new Event("change"));
        return;
      }
      calcularTodo();
    });
    input.addEventListener("change", () => {
      const target = $(input.dataset.setField);
      if (target) target.value = input.value;
      if (target?.id === "medicamentoSelect") {
        target.dispatchEvent(new Event("change"));
        return;
      }
      calcularTodo();
    });
  });
  document.querySelectorAll("[data-check-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const target = $(input.dataset.checkField);
      if (target) target.checked = input.checked;
      calcularTodo();
    });
  });
}

function renderTabResumen() {
  return `
    <article class="ped-panel ped-flow-panel">
      <h3>Ruta de atención pediátrica</h3>
      <ol class="ped-flow">
        <li><b>1. Selecciona paciente.</b><span>El expediente aporta edad, alergias, diagnósticos, tratamientos y antecedentes.</span></li>
        <li><b>2. Confirma mediciones.</b><span>Registra peso, talla/longitud, perímetro cefálico y fecha de medición.</span></li>
        <li><b>3. Calcula e interpreta.</b><span>Cognición muestra edad exacta, IMC, superficie corporal, líquidos y alertas de datos faltantes.</span></li>
        <li><b>4. Guarda resultados.</b><span>Las mediciones seriadas alimentan seguimiento y futuras gráficas.</span></li>
      </ol>
      <div class="ped-action-row">
        <button class="ped-primary" type="button" data-ir="crecimiento">Revisar crecimiento</button>
        <button class="ped-secondary" type="button" data-ir="herramientas">Ver herramientas</button>
        <button class="ped-secondary" type="button" data-ir="tratamiento">Tratamiento</button>
      </div>
    </article>
    ${renderAlertasCrecimiento()}
  `;
}

function renderTabCrecimiento() {
  const crecimiento = estado.crecimiento || buildGrowthAssessment({});
  const c = estado.calculos || {};
  return `
    <article class="ped-panel">
      <div class="ped-panel-title-row">
        <div>
          <h3>Crecimiento y somatometría</h3>
          <p>Los percentiles se calculan únicamente si existe una tabla oficial local para la referencia seleccionada.</p>
        </div>
        <label class="ped-field ped-reference-select">Referencia
          <select id="referenciaCrecimiento">
            <option value="who_2006_0_5" ${crecimiento.reference?.id === "who_2006_0_5" ? "selected" : ""}>OMS 2006/2007</option>
            <option value="cdc_2000_2_20" ${crecimiento.reference?.id === "cdc_2000_2_20" ? "selected" : ""}>CDC 2000</option>
            <option value="mx_context" ${crecimiento.reference?.id === "mx_context" ? "selected" : ""}>México - contexto poblacional</option>
          </select>
        </label>
      </div>
      <div class="ped-result">
        <b>Edad: ${c.edad?.edadCronologicaTexto || "sin calcular"}</b>
        <span>Fecha visible: ${formatearFechaDDMMAAAA($("fechaNacimiento").value) || "sin fecha"}</span>
        <span>IMC: ${c.imc ? c.imc.toFixed(2) : "-"} kg/m² · SC Mosteller: ${c.sc ? c.sc.mosteller.toFixed(2) : "-"} m²</span>
        <span>Talla normalizada: ${formatearTallaClinica(c.tallaInfo || analizarTalla($("tallaCm").value))}</span>
      </div>
      <div class="ped-growth-grid">
        ${crecimiento.indicators.map(renderGrowthIndicator).join("")}
      </div>
      ${renderAlertasCrecimiento()}
    </article>
  `;
}

function renderGrowthIndicator(indicator) {
  return `
    <div class="ped-growth-card">
      <span>${indicator.label}</span>
      <b>${indicator.available ? `${formatNumber(indicator.value)} ${indicator.unit}` : "Sin dato"}</b>
      <small>${indicator.interpretation}</small>
    </div>
  `;
}

function renderAlertasCrecimiento() {
  const alertas = estado.crecimiento?.alerts || [];
  if (!alertas.length) return "";
  return `
    <article class="ped-panel ped-alert-panel">
      <h3>Alertas de calidad de dato</h3>
      <ul>${alertas.map((mensaje) => `<li>${mensaje}</li>`).join("")}</ul>
    </article>
  `;
}

function renderTabHerramientas() {
  return `
    <article class="ped-card"><span>Herramienta</span><h3>Edad exacta</h3><p>Edad cronológica, días de vida, semanas y edad corregida si se registra edad gestacional.</p><button class="ped-primary" data-ir="crecimiento">Abrir</button></article>
    <article class="ped-card"><span>Herramienta</span><h3>Líquidos y electrolitos</h3><p>Mantenimiento Holliday-Segar, déficit por deshidratación, diuresis, sodio corregido y anion gap.</p><button class="ped-primary" data-ir="tratamiento">Abrir</button></article>
    <article class="ped-card"><span>Herramienta</span><h3>Dosis pediátricas</h3><p>Cálculo por kg, presentaciones, contraindicaciones e interacciones del catálogo pediátrico.</p><button class="ped-primary" data-ir="tratamiento">Abrir</button></article>
    <article class="ped-card"><span>Fuente</span><h3>Referencias</h3><p>Fuentes clínicas usadas y referencias pendientes de importación local.</p><button class="ped-secondary" data-ir="seguimiento">Ver fuentes</button></article>
  `;
}

function renderTabTratamiento() {
  const c = estado.calculos || {};
  return `
    <article class="ped-panel">
      <h3>Líquidos, electrolitos y medicamentos</h3>
      <div class="ped-tool-form">
        <label>Deshidratación (%)
          <input data-set-field="deshidratacion" value="${$("deshidratacion").value}" placeholder="Ej. 5">
        </label>
        <label>Diuresis total (mL)
          <input data-set-field="diuresisMl" value="${$("diuresisMl").value}" placeholder="Ej. 480">
        </label>
        <label>Periodo de diuresis (h)
          <input data-set-field="diuresisHoras" value="${$("diuresisHoras").value}" placeholder="Ej. 8">
        </label>
        <label>Na / Glucosa / Cl / HCO3
          <input data-set-field="sodio" value="${$("sodio").value}" placeholder="Na">
        </label>
      </div>
      <div class="ped-result">
        ${c.mantenimiento ? `<b>Mantenimiento: ${c.mantenimiento.mlDia.toFixed(0)} mL/día</b><span>${c.mantenimiento.mlHora.toFixed(1)} mL/h · regla 4-2-1: ${c.mantenimiento.regla421.toFixed(1)} mL/h</span>` : `<b>Registra peso para líquidos.</b>`}
        <span>Déficit: ${c.deficit ? c.deficit.toFixed(0) : "-"} mL · Diuresis: ${c.diuresis ? c.diuresis.toFixed(2) : "-"} mL/kg/h</span>
        <span>Na corregido: ${c.sodio ? c.sodio.toFixed(1) : "-"} mEq/L · Anion gap: ${c.gap ? c.gap.toFixed(1) : "-"}</span>
      </div>
      ${renderMedicamentosPanel(c.dosis)}
    </article>
  `;
}

function renderMedicamentosPanel(dosis) {
  const med = MEDICAMENTOS_PEDIATRICOS.find((item) => item.id === $("medicamentoSelect").value);
  return `
    <div class="ped-medication-box">
      <div class="ped-tool-form">
        <label>Medicamento
          <select data-set-field="medicamentoSelect">${MEDICAMENTOS_PEDIATRICOS.map((item) => `<option value="${item.id}" ${item.id === $("medicamentoSelect").value ? "selected" : ""}>${item.nombre}</option>`).join("")}</select>
        </label>
        <label>Esquema
          <select data-set-field="opcionDosisSelect">${(med?.opciones || []).map((opcion, index) => `<option value="${index}" ${String(index) === String($("opcionDosisSelect").value) ? "selected" : ""}>${opcion.etiqueta}</option>`).join("")}</select>
        </label>
        <label>Concentración
          <input data-set-field="concentracionMgMl" value="${$("concentracionMgMl").value}" placeholder="160 mg/5 mL o 32 mg/mL">
        </label>
        <label class="ped-check-line"><input type="checkbox" data-check-field="pesoConfirmado" ${$("pesoConfirmado").checked ? "checked" : ""}> Peso actual confirmado</label>
      </div>
      <div class="ped-result">
        ${dosis?.error ? `<b>${dosis.error}</b><span>La calculadora bloquea dosis si no confirmas peso actual.</span>` : dosis ? `
          <b>${dosis.medicamento.nombre}: ${dosis.mgDosis.toFixed(2)} mg por dosis</b>
          <span>${dosis.frecuenciaDia} dosis/día · total diario ${dosis.mgDia.toFixed(2)} mg/día</span>
          <span>${dosis.volumenMlDosis ? `Volumen: ${dosis.volumenMlDosis.toFixed(2)} mL por dosis.` : "Agrega concentración mg/mL para volumen."}</span>
          ${dosis.advertencias?.map((mensaje) => `<span class="ped-alerta">${mensaje}</span>`).join("") || ""}
          ${infoMedicamentoPediatrico(dosis.medicamento)}
        ` : `<b>Selecciona medicamento y confirma peso.</b>`}
      </div>
    </div>
  `;
}

function renderTabSeguimiento() {
  return `
    <article class="ped-panel">
      <h3>Seguimiento pediátrico</h3>
      <p>Las mediciones guardadas se usarán para gráficas seriadas y comparación longitudinal. Las curvas percentilares se activarán cuando existan tablas oficiales importadas.</p>
      <div class="ped-history-list">
        ${estado.historial.length ? estado.historial.map((item) => `<div><b>${item.texto}</b><span>${new Date(item.fecha).toLocaleString("es-MX")}</span></div>`).join("") : `<div class="ped-empty">Sin eventos recientes.</div>`}
      </div>
    </article>
    <article class="ped-panel">
      <h3>Fuentes y trazabilidad</h3>
      ${FUENTES_PEDIATRIA.map((fuente) => `<div class="ped-source"><b>${fuente.tema}</b><a href="${fuente.url}" target="_blank" rel="noopener">${fuente.titulo}</a><span>${fuente.nota}</span></div>`).join("")}
    </article>
  `;
}

async function guardarMedicionPediatrica() {
  if (estado.modoTemporal || !estado.uidPaciente) {
    registrarHistorial("Medición temporal calculada");
    alert("La evaluación temporal no se guardó en expediente. Selecciona un paciente para guardar historial.");
    return;
  }
  const payload = {
    idPaciente: estado.uidPaciente,
    uidProfesional: estado.usuario?.uid || "",
    nombrePaciente: $("nombrePaciente").value || "",
    fechaMedicion: $("fechaMedicion").value || new Date().toISOString().slice(0, 10),
    fechaNacimiento: $("fechaNacimiento").value || "",
    sexo: $("sexoPaciente").value || "",
    pesoKg: numero($("pesoKg").value),
    tallaCm: estado.crecimiento?.measurements?.heightCm || null,
    perimetroCefalicoCm: numero($("perimetroCefalico").value),
    imc: estado.crecimiento?.measurements?.bmi || null,
    referenciaCrecimiento: estado.crecimiento?.reference || null,
    interpretacionCrecimiento: estado.crecimiento?.indicators || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  try {
    await addDoc(collection(db, "usuarios", estado.uidPaciente, "medicionesPediatricas"), payload);
    registrarHistorial("Medición pediátrica guardada");
    renderSeccion();
  } catch (error) {
    console.error("No se pudo guardar medición pediátrica", error);
    alert("No se pudo guardar la medición. Revisa permisos de Firestore.");
  }
}

function obtenerDiagnosticosPaciente() {
  const p = estado.paciente || {};
  const lista = Array.isArray(p.diagnosticos) ? p.diagnosticos : Array.isArray(p.historialDiagnosticos) ? p.historialDiagnosticos : [];
  return lista
    .map((diag) => typeof diag === "string" ? diag : diag?.texto || [diag?.codigo, diag?.nombre].filter(Boolean).join(" - "))
    .filter(Boolean)
    .slice(0, 4);
}

function obtenerMedicamentosActivos() {
  const p = estado.paciente || {};
  const tratamientos = Array.isArray(p.tratamientos) ? p.tratamientos : Array.isArray(p.tratamiento) ? p.tratamiento : [];
  return tratamientos
    .filter((tto) => !tto.estado || String(tto.estado).toLowerCase() === "activo")
    .map((tto) => tto.medicamento || tto.nombre || tto.texto)
    .filter(Boolean)
    .slice(0, 4);
}

function infoMedicamentoPediatrico(medicamento) {
  if (!medicamento) return "";
  return `
    <div class="ped-med-grid">
      ${listaCompactaMedicamento("Presentaciones", medicamento.presentaciones)}
      ${listaCompactaMedicamento("Nombres comerciales", medicamento.nombresComerciales)}
      ${listaCompactaMedicamento("Contraindicaciones / precauciones", medicamento.contraindicaciones)}
      ${listaCompactaMedicamento("Interacciones relevantes", medicamento.interacciones)}
    </div>
    ${medicamento.advertencia ? `<span class="ped-med-warning">${medicamento.advertencia}</span>` : ""}
    ${medicamento.fuente ? `<span class="ped-med-source">${medicamento.fuente}</span>` : ""}
  `;
}

function listaCompactaMedicamento(titulo, items = []) {
  if (!items?.length) return "";
  return `<div class="ped-med-info"><strong>${titulo}</strong><ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul></div>`;
}

function formatearTallaClinica(tallaInfo) {
  if (!tallaInfo?.valido) return "Sin talla válida";
  return `${tallaInfo.valorCm.toFixed(1)} cm (${tallaInfo.valorM.toFixed(2)} m)`;
}

function formatNumber(value) {
  const numeric = numero(value);
  if (numeric === null) return "-";
  return numeric.toFixed(Math.abs(numeric) >= 10 ? 1 : 2);
}

function registrarHistorial(texto) {
  estado.historial.unshift({ texto, fecha: new Date().toISOString() });
  estado.historial = estado.historial.slice(0, 12);
  localStorage.setItem("cognicionPediatriaHistorial", JSON.stringify(estado.historial));
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
