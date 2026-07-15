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
import { CATALOGO_MEDICAMENTOS_PEDIATRICOS } from "./catalogoMedicamentosPediatricos.js";
import {
  CATALOGO_FARMACOLOGICO_PEDIATRIA,
  MODOS_DOSIFICACION_PEDIATRICA,
  buildPediatricPrescription,
  estadoPediatricoMedicamento,
  loadBrandsForPresentation,
  loadMedicationInformation,
  loadMedicationPresentations,
  savePediatricPrescription,
  searchPediatricMedication,
  synchronizeFrequencyAndInterval
} from "./prescripcionPediatrica.js";
import { MEDICAMENTOS_PEDIATRICOS } from "./medicamentos.js";
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
  crecimiento: null,
  prescripcion: {
    medicationId: "paracetamol",
    indicationId: "dolor_fiebre",
    schemeIndex: 1,
    dosingMode: "mg_kg_dosis",
    administrationsPerDay: 4,
    intervalHours: 6,
    route: "oral",
    presentationId: "paracetamol_susp_160_5",
    brandName: "Genérico",
    duration: 3,
    durationUnit: "días",
    customSchedule: "06:00, 12:00, 18:00, 00:00",
    weightConfirmed: false
  },
  prescripcionCalculada: null,
  busquedaMedicamento: ""
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
  $("medicamentoSelect").innerHTML = CATALOGO_MEDICAMENTOS_PEDIATRICOS.map((med) => `
    <option value="${med.medicationId}">${med.genericName} · ${med.drugClass}</option>
  `).join("");
  $("medicamentoSelect").addEventListener("change", () => {
    const med = loadMedicationInformation($("medicamentoSelect").value);
    const indication = med?.indications?.find((item) => item.indicationId === estado.prescripcion.indicationId) || med?.indications?.[0];
    $("opcionDosisSelect").innerHTML = (indication?.dosingSchemes || []).map((opcion, index) => `
      <option value="${index}">${opcion.label}</option>
    `).join("");
    estado.prescripcion.medicationId = $("medicamentoSelect").value;
    calcularTodo();
  });
  $("medicamentoSelect").value = estado.prescripcion.medicationId;
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
  const tallaInfo = analizarTalla($("tallaCm").value, $("tallaUnidad")?.value || "cm");
  const imc = calcularIMC($("pesoKg").value, tallaInfo.valorCm);
  const sc = superficieCorporal($("pesoKg").value, tallaInfo.valorCm);
  const mantenimiento = mantenimientoHollidaySegarDetalle($("pesoKg").value);
  const deficit = calcularDeficit($("pesoKg").value, $("deshidratacion").value);
  const diuresis = calcularDiuresis($("diuresisMl").value, $("pesoKg").value, $("diuresisHoras").value);
  const sodio = corregirSodioPorGlucosa($("sodio").value, $("glucosa").value);
  const gap = calcularAnionGap($("sodio").value, $("cloro").value, $("bicarbonato").value);
  sincronizarPrescripcionConPaciente();
  const dosis = buildPediatricPrescription(leerInputPrescripcion());
  estado.prescripcionCalculada = dosis;

  estado.crecimiento = buildGrowthAssessment({
    nombre: $("nombrePaciente").value,
    sexo: $("sexoPaciente").value,
    fechaNacimiento: $("fechaNacimiento").value,
    fechaMedicion: $("fechaMedicion").value,
    edadGestacional: $("edadGestacional").value,
    pesoKg: $("pesoKg").value,
    tallaCm: $("tallaCm").value,
    tallaUnidad: $("tallaUnidad")?.value || "cm",
    perimetroCefalico: $("perimetroCefalico").value,
    referenceId: $("referenciaCrecimiento")?.value || "who_auto"
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
  bindPrescripcionPediatrica();
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
          <p>Percentiles, puntuación Z y curvas se calculan con la referencia seleccionada y la edad exacta del paciente.</p>
        </div>
        <label class="ped-field ped-reference-select">Referencia
          <select id="referenciaCrecimiento">
            <option value="who_auto" ${["who_2006_0_5", "who_2007_5_19"].includes(crecimiento.reference?.id) ? "selected" : ""}>OMS automática por edad</option>
            <option value="who_2006_0_5" ${crecimiento.reference?.id === "who_2006_0_5" ? "selected" : ""}>OMS 2006, 0 a 5 años</option>
            <option value="who_2007_5_19" ${crecimiento.reference?.id === "who_2007_5_19" ? "selected" : ""}>OMS 2007, 5 a 19 años</option>
            <option value="cdc_2000_2_20" ${crecimiento.reference?.id === "cdc_2000_2_20" ? "selected" : ""}>CDC 2000</option>
            <option value="mx_context" ${crecimiento.reference?.id === "mx_context" ? "selected" : ""}>México - contexto poblacional</option>
          </select>
        </label>
      </div>
      <div class="ped-result">
        <b>Edad: ${c.edad?.edadCronologicaTexto || "sin calcular"}</b>
        <span>Fecha visible: ${formatearFechaDDMMAAAA($("fechaNacimiento").value) || "sin fecha"}</span>
        <span>IMC: ${c.imc ? c.imc.toFixed(2) : "-"} kg/m² · SC Mosteller: ${c.sc ? c.sc.mosteller.toFixed(2) : "-"} m²</span>
        <span>Talla normalizada: ${formatearTallaClinica(c.tallaInfo || analizarTalla($("tallaCm").value, $("tallaUnidad")?.value || "cm"))}</span>
      </div>
      <div class="ped-growth-grid">
        ${crecimiento.indicators.map(renderGrowthIndicator).join("")}
      </div>
      ${renderAlertasCrecimiento()}
    </article>
  `;
}

function renderGrowthIndicator(indicator) {
  const chart = renderGrowthChart(indicator);
  return `
    <div class="ped-growth-card">
      <span>${indicator.label}</span>
      <b>${indicator.available ? `${formatNumber(indicator.value)} ${indicator.unit}` : "Sin dato"}</b>
      <div class="ped-growth-metrics">
        <div><small>Puntuación Z</small><strong>${indicator.z !== null && indicator.z !== undefined ? `${formatNumber(indicator.z)} DE` : "-"}</strong></div>
        <div><small>Percentil</small><strong>${indicator.percentile !== null && indicator.percentile !== undefined ? `P${formatNumber(indicator.percentile)}` : "-"}</strong></div>
      </div>
      <small>${indicator.interpretation}</small>
      <button class="ped-link-button" type="button" data-growth-reference="${indicator.id}">Ver referencia utilizada</button>
      ${chart}
    </div>
  `;
}

function renderGrowthChart(indicator) {
  if (!indicator.available) {
    return `<div class="ped-growth-chart-empty">Registra el dato para graficar.</div>`;
  }
  if (!Array.isArray(indicator.curves) || !indicator.curves.length) {
    return `
      <div class="ped-growth-chart-empty">
        No se pudo calcular este indicador con la referencia seleccionada.
      </div>
    `;
  }

  const points = indicator.curves.flatMap((curve) => curve.points || []);
  const xs = points.map((p) => Number(p.x)).filter(Number.isFinite);
  const ys = points.map((p) => Number(p.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return `<div class="ped-growth-chart-empty">Curva sin puntos válidos.</div>`;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys, Number(indicator.value));
  const maxY = Math.max(...ys, Number(indicator.value));
  const w = 260;
  const h = 130;
  const pad = 22;
  const xScale = (x) => pad + ((Number(x) - minX) / Math.max(1, maxX - minX)) * (w - pad * 2);
  const yScale = (y) => h - pad - ((Number(y) - minY) / Math.max(1, maxY - minY)) * (h - pad * 2);
  const currentX = Number(indicator.axisValue ?? indicator.ageMonths ?? indicator.heightCm ?? minX);
  const currentY = Number(indicator.value);
  const currentVisible = Number.isFinite(currentX) && Number.isFinite(currentY) && currentX >= minX && currentX <= maxX;

  return `
    <svg class="ped-growth-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfica de ${escapeAttr(indicator.label)}">
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" />
      ${indicator.curves.map((curve, index) => {
        const d = (curve.points || []).map((p, pointIndex) =>
          `${pointIndex === 0 ? "M" : "L"} ${xScale(p.x).toFixed(1)} ${yScale(p.y).toFixed(1)}`
        ).join(" ");
        return `<path d="${d}" class="ped-growth-curve ped-growth-curve-${index}" />`;
      }).join("")}
      ${currentVisible ? `<circle cx="${xScale(currentX).toFixed(1)}" cy="${yScale(currentY).toFixed(1)}" r="4.8" class="ped-growth-point" />` : ""}
      <text x="${pad}" y="14">${escapeAttr(indicator.axisLabel || "Edad")}</text>
      <text x="${w - pad}" y="${h - 6}" text-anchor="end">${escapeAttr(indicator.unit || "")}</text>
    </svg>
    <div class="ped-growth-source">
      ${escapeAttr(indicator.sourceLabel || "Referencia no disponible.")}
    </div>
  `;
}

function renderAlertasCrecimiento() {
  const captura = estado.crecimiento?.captureWarnings || [];
  const clinicas = estado.crecimiento?.clinicalAlerts || [];
  if (!captura.length && !clinicas.length) return "";
  return `
    <article class="ped-panel ped-alert-panel">
      <h3>Revisión clínica de crecimiento</h3>
      ${captura.length ? `<h4>Verifica captura</h4><ul>${captura.map((mensaje) => `<li>${mensaje}</li>`).join("")}</ul>` : ""}
      ${clinicas.length ? `<h4>Alertas clínicas</h4><ul>${clinicas.map((mensaje) => `<li>${mensaje}</li>`).join("")}</ul>` : ""}
    </article>
  `;
}

function mostrarReferenciaCrecimiento(indicatorId = "") {
  const indicador = estado.crecimiento?.indicators?.find((item) => item.id === indicatorId);
  const referencia = indicador?.reference || estado.crecimiento?.reference;
  if (!referencia) return;
  const texto = [
    `Referencia: ${referencia.label}`,
    `Institución: ${referencia.organization}`,
    `Año: ${referencia.publicationYear || referencia.version || "-"}`,
    `Rango: ${referencia.ageRangeMonths?.[0] ?? "-"} a ${referencia.ageRangeMonths?.[1] ?? "-"} meses`,
    `Indicador: ${indicador?.label || "-"}`,
    `Método: ${referencia.method}`,
    `Fuente: ${referencia.sourceUrl}`,
    `Cita: ${referencia.citation || "-"}`
  ].join("\n");
  alert(texto);
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
      ${renderMedicamentosPanelAvanzado()}
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

function renderMedicamentosPanelAvanzado() {
  sincronizarPrescripcionConPaciente();
  const rx = buildPediatricPrescription(leerInputPrescripcion());
  estado.prescripcionCalculada = rx;
  const med = rx.medicationInfo || loadMedicationInformation(estado.prescripcion.medicationId) || CATALOGO_FARMACOLOGICO_PEDIATRIA[0];
  const indicaciones = med?.indications || [];
  const indicacion = indicaciones.find((item) => item.indicationId === estado.prescripcion.indicationId) || indicaciones[0];
  const esquemas = indicacion?.dosingSchemes || [];
  const presentaciones = loadMedicationPresentations(med?.medicationId, { route: estado.prescripcion.route });
  const marcas = loadBrandsForPresentation(med?.medicationId, estado.prescripcion.presentationId);
  const resultados = searchPediatricMedication(estado.busquedaMedicamento || "");
  const pagina = Number(estado.prescripcionSearchPage || 1);
  const porPagina = 20;
  const visibles = resultados.slice(0, pagina * porPagina);
  const pediatricStatus = estadoPediatricoMedicamento(med);
  const sinDosisValidada = !indicaciones.some((item) => item.dosingSchemes?.length);
  const frecuenciaActual = frecuenciaSelectValue(rx);

  return `
    <div class="ped-medication-box ped-prescription-compact">
      <div class="ped-rx-header compact">
        <div>
          <span class="ped-kicker">Prescripcion pediatrica compacta</span>
          <h4>Agregar medicamento</h4>
          <p>Busca, calcula si lo necesitas y guarda desde una sola tarjeta. La informacion avanzada queda disponible bajo demanda.</p>
        </div>
        <div class="ped-rx-status ${rx.valid ? "ok" : "warn"}">${rx.valid ? "Listo" : "Pendiente"}</div>
      </div>

      <div class="ped-rx-grid-compact">
        <label class="ped-rx-search-field">Medicamento
          <input id="buscadorMedicamentoPediatrico" data-ped-rx-search="1" value="${escapeAttr(estado.busquedaMedicamento || "")}" placeholder="Buscar por generico, marca, clase o indicacion">
          <small>Mostrando ${visibles.length} de ${resultados.length} medicamentos del catalogo maestro.</small>
        </label>
        <label>Seleccionado
          <select data-ped-rx="medicationId">
            ${CATALOGO_FARMACOLOGICO_PEDIATRIA.map((item) => `<option value="${item.medicationId}" ${item.medicationId === med.medicationId ? "selected" : ""}>${item.genericName}</option>`).join("")}
          </select>
        </label>
        <label>Indicacion
          ${indicaciones.length ? `
            <select data-ped-rx="indicationId">
              ${indicaciones.map((item) => `<option value="${item.indicationId}" ${item.indicationId === indicacion?.indicationId ? "selected" : ""}>${item.name}</option>`).join("")}
            </select>
          ` : `<input value="Sin esquema pediatrico validado" disabled>`}
        </label>
        <label>Dosis habitual
          ${esquemas.length ? `
            <select data-ped-rx="schemeIndex">
              ${esquemas.map((esquema, index) => `<option value="${index}" ${Number(estado.prescripcion.schemeIndex) === index ? "selected" : ""}>${esquema.label}</option>`).join("")}
            </select>
          ` : `<input value="No disponible" disabled>`}
        </label>
        <label>Dosis manual / final
          <input data-ped-rx="finalDoseMg" value="${rx.finalDoseMg ? formatNumber(rx.finalDoseMg) : escapeAttr(estado.prescripcion.finalDoseMg || "")}" placeholder="mg por dosis">
        </label>
        <label>Presentacion
          <select data-ped-rx="presentationId">
            ${presentaciones.map((item) => `<option value="${item.presentationId}" ${item.presentationId === rx.presentationId ? "selected" : ""}>${item.form || "Presentacion"} - ${item.unitStrength}</option>`).join("")}
            <option value="manual" ${estado.prescripcion.presentationId === "manual" ? "selected" : ""}>No encuentro la presentacion</option>
          </select>
        </label>
        ${estado.prescripcion.presentationId === "manual" ? `
          <label>Presentacion manual
            <input data-ped-rx="manualPresentationText" value="${escapeAttr(estado.prescripcion.manualPresentationText || "")}" placeholder="Ej. suspension 160 mg/5 mL">
          </label>
        ` : ""}
        <label>Marca
          <select data-ped-rx="brandName">
            ${marcas.map((brand) => `<option value="${brand}" ${brand === rx.brandName ? "selected" : ""}>${brand}</option>`).join("")}
            <option value="manual" ${estado.prescripcion.brandName === "manual" ? "selected" : ""}>Otra marca...</option>
          </select>
        </label>
        ${estado.prescripcion.brandName === "manual" ? `
          <label>Marca manual
            <input data-ped-rx="manualBrandName" value="${escapeAttr(estado.prescripcion.manualBrandName || "")}" placeholder="Nombre comercial">
          </label>
        ` : ""}
        <label>Via
          <select data-ped-rx="route">
            ${Array.from(new Set([...(med.routes || []), "oral", "intravenosa", "rectal"])).filter(Boolean).map((route) => `<option value="${route}" ${route === rx.route ? "selected" : ""}>${route}</option>`).join("")}
          </select>
        </label>
        <label>Frecuencia
          <select data-ped-rx-frequency="1">
            ${opcionesFrecuenciaPediatrica(frecuenciaActual)}
          </select>
        </label>
        <label>Duracion
          <input data-ped-rx="duration" value="${escapeAttr(estado.prescripcion.duration || "")}" placeholder="Ej. 3">
        </label>
        <label>Unidad
          <select data-ped-rx="durationUnit">
            ${[["dias", "días"], ["semanas", "semanas"], ["meses", "meses"], ["dosis", "dosis"]].map(([valor, etiqueta]) => `<option value="${valor}" ${valor === normalizarUnidadDuracion(rx.durationUnit || estado.prescripcion.durationUnit) ? "selected" : ""}>${etiqueta}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="ped-rx-inline-actions">
        <label class="ped-check-line"><input type="checkbox" data-ped-rx-check="weightConfirmed" ${rx.weightConfirmed ? "checked" : ""}> Peso usado: ${escapeAttr(String(rx.weightKg || "-"))} kg, ${escapeAttr(rx.weightDate || "sin fecha")}</label>
        <label class="ped-check-line"><input type="checkbox" data-ped-rx-check="isPrn" ${rx.isPrn ? "checked" : ""}> PRN</label>
        <button class="ped-secondary" type="button" data-rx-toggle="calc">Calcular por peso</button>
        <button class="ped-secondary" type="button" data-rx-toggle="schedule">Configurar horarios</button>
        <button class="ped-secondary" type="button" data-rx-toggle="info">Ver informacion</button>
        <button class="ped-secondary" type="button" data-rx-toggle="doses">Ver todas las dosis</button>
      </div>

      ${estado.prescripcion.isPrn ? `
        <div class="ped-rx-mini-panel">
          <label>Motivo PRN
            <input data-ped-rx="prnReason" value="${escapeAttr(estado.prescripcion.prnReason || "")}" placeholder="Dolor, fiebre, nausea...">
          </label>
        </div>
      ` : ""}

      ${estado.prescripcion.panelAbierto === "calc" ? renderCalculadoraPesoCompacta(rx, esquemas) : ""}
      ${estado.prescripcion.panelAbierto === "schedule" ? renderHorariosCompactos(rx) : ""}
      ${estado.prescripcion.panelAbierto === "info" ? renderInfoMedicamentoDrawer(med) : ""}
      ${estado.prescripcion.panelAbierto === "doses" ? renderDosisHabitualesDrawer(esquemas) : ""}

      <div class="ped-search-results compact" id="resultadosMedicamentoPediatrico">
        ${renderResultadosMedicamentosPediatricos(visibles, resultados.length, porPagina)}
      </div>

      <div class="ped-rx-med-summary">
        <div>
          <b>${escapeHTML(med?.genericName || "Medicamento")}</b>
          <span>${escapeHTML(med?.drugClass || "Clase no especificada")}</span>
        </div>
        <span class="ped-med-status ${sinDosisValidada ? "missing" : "ok"}">${pediatricStatus}</span>
      </div>
      ${sinDosisValidada ? `<div class="ped-rx-alerts warn"><div><b>Sin esquema pediatrico validado</b><span>Este medicamento esta disponible en el catalogo, pero aun no cuenta con un esquema pediatrico validado. Puedes registrarlo manualmente si cuentas con una fuente clinica externa.</span></div></div>` : ""}
      ${renderPrescripcionAlertas(rx)}
      <div class="ped-rx-summary compact">
        <div><span>Dosis</span><b>${rx.finalDoseMg ? `${formatNumber(rx.finalDoseMg)} mg` : "-"}</b></div>
        <div><span>Cantidad por toma</span><b>${rx.liquidVolume ? `${formatNumber(rx.liquidVolume.roundedMl)} mL` : rx.unitsPerDose ? `${formatNumber(rx.unitsPerDose.roundedUnits)} unidad(es)` : "-"}</b></div>
        <div><span>Equivalente</span><b>${rx.comparison ? `${formatNumber(rx.comparison.equivalentMgKgDose)} mg/kg/dosis` : "-"}</b></div>
        <div><span>Dosis/dia</span><b>${rx.totalDailyDoseMg ? `${formatNumber(rx.totalDailyDoseMg)} mg/dia` : "-"}</b></div>
      </div>
      <div class="ped-rx-preview compact">
        <span>Vista previa</span>
        <p>${rx.instructionText || "Completa los campos para generar la indicacion."}</p>
      </div>
      <div class="ped-action-row">
        <button class="ped-secondary" type="button" data-rx-action="copy">Copiar indicacion</button>
        <button class="ped-secondary" type="button" data-rx-action="reset">Reiniciar</button>
        <button class="ped-primary" type="button" data-rx-action="save">Agregar al tratamiento</button>
      </div>
    </div>
  `;
}

function renderResultadosMedicamentosPediatricos(resultados, total, porPagina) {
  if (!resultados.length) return `<div class="ped-empty-mini">No se encontraron medicamentos.</div>`;
  return `
    ${resultados.map((item) => `
      <button type="button" class="ped-search-pill" data-ped-pick-med="${item.medicationId}">
        <b>${escapeHTML(item.genericName)}</b>
        <small>${escapeHTML((item.presentations || []).flatMap((p) => p.brands || []).slice(0, 4).join(", ") || "Sin marcas registradas")}</small>
        <small>${escapeHTML(item.drugClass || "Clase no especificada")} · ${escapeHTML(estadoPediatricoMedicamento(item))} · ${(item.presentations || []).length} presentaciones</small>
      </button>
    `).join("")}
    ${resultados.length < total ? `<button type="button" class="ped-secondary ped-load-more" data-rx-action="more-results">Cargar más</button>` : ""}
  `;
}

function renderCalculadoraPesoCompacta(rx, esquemas) {
  return `
    <div class="ped-rx-mini-panel">
      <div class="ped-panel-title-row"><h5>Calcular por peso</h5><button type="button" data-rx-toggle="">Cerrar</button></div>
      <div class="ped-rx-grid-compact three">
        <label>Peso
          <input value="${escapeAttr(rx.weightKg || "")}" disabled>
        </label>
        <label>Esquema
          <select data-ped-rx="schemeIndex">
            ${esquemas.map((esquema, index) => `<option value="${index}" ${Number(estado.prescripcion.schemeIndex) === index ? "selected" : ""}>${esquema.label}</option>`).join("")}
          </select>
        </label>
        <label>Dosis calculada
          <input value="${rx.calculatedDoseMg ? `${formatNumber(rx.calculatedDoseMg)} mg` : "Sin calculo"}" disabled>
        </label>
      </div>
      <button type="button" class="ped-primary" data-rx-action="apply-calculated">Aplicar dosis</button>
    </div>
  `;
}

function renderHorariosCompactos(rx) {
  return `
    <div class="ped-rx-mini-panel">
      <div class="ped-panel-title-row"><h5>Horarios personalizados</h5><button type="button" data-rx-toggle="">Cerrar</button></div>
      <label>Horarios
        <input data-ped-rx="customSchedule" value="${escapeAttr(estado.prescripcion.customSchedule || rx.customSchedule?.join(", ") || "")}" placeholder="06:00, 14:00, 22:00">
      </label>
    </div>
  `;
}

function renderInfoMedicamentoDrawer(medicamento) {
  if (!medicamento) return "";
  return `
    <div class="ped-rx-mini-panel">
      <div class="ped-panel-title-row"><h5>Informacion del medicamento</h5><button type="button" data-rx-toggle="">Cerrar</button></div>
      ${infoMedicamentoPediatricoAvanzado(medicamento)}
    </div>
  `;
}

function renderDosisHabitualesDrawer(esquemas) {
  return `
    <div class="ped-rx-mini-panel">
      <div class="ped-panel-title-row"><h5>Dosis habituales</h5><button type="button" data-rx-toggle="">Cerrar</button></div>
      <div class="ped-usual-doses compact">
        ${esquemas.length ? esquemas.map((esquema, index) => `
          <button type="button" class="ped-dose-option ${Number(estado.prescripcion.schemeIndex) === index ? "activo" : ""}" data-rx-scheme="${index}">
            <b>${escapeHTML(esquema.label)}</b>
            <span>${esquema.minimum ?? "-"}-${esquema.maximum ?? "-"} ${escapeHTML(esquema.unit || "")}</span>
            <small>${escapeHTML(esquema.source || "Validar protocolo local")}</small>
          </button>
        `).join("") : `<div class="ped-empty-mini">Sin dosis pediatrica validada para este medicamento.</div>`}
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

function sincronizarPrescripcionConPaciente() {
  estado.prescripcion.patientId = estado.uidPaciente || "";
  estado.prescripcion.temporal = estado.modoTemporal;
  estado.prescripcion.weightKg = $("pesoKg")?.value || "";
  estado.prescripcion.heightCm = $("tallaCm")?.value || "";
  estado.prescripcion.weightDate = $("fechaMedicion")?.value || "";
  estado.prescripcion.allergies = $("alergias")?.value || "";
  estado.prescripcion.weightConfirmed = typeof estado.prescripcion.weightConfirmed === "boolean"
    ? estado.prescripcion.weightConfirmed
    : Boolean($("pesoConfirmado")?.checked);
  if ($("medicamentoSelect")) $("medicamentoSelect").value = estado.prescripcion.medicationId || $("medicamentoSelect").value;
  if ($("opcionDosisSelect")) $("opcionDosisSelect").value = estado.prescripcion.schemeIndex || 0;
  if ($("pesoConfirmado")) $("pesoConfirmado").checked = estado.prescripcion.weightConfirmed;
}

function leerInputPrescripcion() {
  return { ...estado.prescripcion };
}

function bindPrescripcionPediatrica() {
  const buscadorMedicamento = document.querySelector("[data-ped-rx-search]");
  if (buscadorMedicamento) {
    const actualizarBusqueda = debounce(() => {
      estado.busquedaMedicamento = buscadorMedicamento.value;
      estado.prescripcionSearchPage = 1;
      renderResultadosBusquedaMedicamentos();
    }, 120);
    buscadorMedicamento.addEventListener("input", actualizarBusqueda);
  }
  document.querySelectorAll("[data-ped-rx]").forEach((input) => {
    input.addEventListener("input", () => actualizarPrescripcionDesdeInput(input.dataset.pedRx, input.value, "input"));
    input.addEventListener("change", () => actualizarPrescripcionDesdeInput(input.dataset.pedRx, input.value, "change"));
  });
  document.querySelectorAll("[data-ped-rx-frequency]").forEach((input) => {
    input.addEventListener("change", () => {
      Object.assign(estado.prescripcion, aplicarFrecuenciaPediatrica(input.value));
      calcularTodo();
    });
  });
  document.querySelectorAll("[data-ped-rx-check]").forEach((input) => {
    input.addEventListener("change", () => actualizarPrescripcionDesdeInput(input.dataset.pedRxCheck, input.checked, "check"));
  });
  bindResultadosMedicamentosPediatricos();
  document.querySelectorAll("[data-rx-scheme]").forEach((button) => {
    button.addEventListener("click", () => actualizarPrescripcionDesdeInput("schemeIndex", button.dataset.rxScheme, "scheme"));
  });
  document.querySelectorAll("[data-rx-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      estado.prescripcion.panelAbierto = button.dataset.rxToggle || "";
      calcularTodo();
    });
  });
  document.querySelectorAll("[data-rx-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.rxAction === "copy") await copiarPrescripcionPediatrica();
      if (button.dataset.rxAction === "reset") reiniciarPrescripcionPediatrica();
      if (button.dataset.rxAction === "save") await guardarPrescripcionPediatrica();
      if (button.dataset.rxAction === "apply-calculated") {
        const dosis = estado.prescripcionCalculada?.calculatedDoseMg;
        if (dosis) {
          estado.prescripcion.finalDoseMg = String(Math.round(dosis * 100) / 100);
          estado.prescripcion.panelAbierto = "";
          calcularTodo();
        }
      }
    });
  });
}

function actualizarPrescripcionDesdeInput(key, value, trigger = "") {
  if (key === "busquedaMedicamento") {
    estado.busquedaMedicamento = value;
    estado.prescripcionSearchPage = 1;
    renderResultadosBusquedaMedicamentos();
    return;
  }
  estado.prescripcion[key] = value;
  if (key === "medicationId") {
    const med = loadMedicationInformation(value);
    const indication = med?.indications?.[0];
    const scheme = indication?.dosingSchemes?.[0];
    const route = scheme?.routes?.[0] || med?.routes?.[0] || "oral";
    const presentation = loadMedicationPresentations(value, { route })[0];
    estado.prescripcion.indicationId = indication?.indicationId || "";
    estado.prescripcion.schemeIndex = 0;
    estado.prescripcion.dosingMode = scheme?.type || "mg_kg_dosis";
    estado.prescripcion.route = route;
    estado.prescripcion.presentationId = presentation?.presentationId || "manual";
    estado.prescripcion.brandName = "Genérico";
    estado.prescripcion.finalDoseMg = "";
    estado.busquedaMedicamento = "";
    estado.prescripcionSearchPage = 1;
  }
  if (key === "indicationId") {
    const med = loadMedicationInformation(estado.prescripcion.medicationId);
    const scheme = med?.indications?.find((item) => item.indicationId === value)?.dosingSchemes?.[0];
    estado.prescripcion.schemeIndex = 0;
    estado.prescripcion.dosingMode = scheme?.type || estado.prescripcion.dosingMode;
    estado.prescripcion.finalDoseMg = "";
  }
  if (key === "schemeIndex") {
    estado.prescripcion.finalDoseMg = "";
  }
  if (key === "presentationId" && value === "manual") {
    estado.prescripcion.manualPresentationText ||= "";
  }
  if (key === "brandName" && value === "manual") {
    estado.prescripcion.brandMode = "manual";
  } else if (key === "brandName") {
    estado.prescripcion.brandMode = "catalog";
  }
  if (key === "administrationsPerDay" || key === "intervalHours") {
    const synced = synchronizeFrequencyAndInterval({
      administrationsPerDay: estado.prescripcion.administrationsPerDay,
      intervalHours: estado.prescripcion.intervalHours,
      changed: key === "intervalHours" ? "interval" : "administrations"
    });
    estado.prescripcion.administrationsPerDay = synced.administrationsPerDay;
    estado.prescripcion.intervalHours = synced.intervalHours;
  }
  if (trigger === "input") return;
  calcularTodo();
}

function renderResultadosBusquedaMedicamentos() {
  const contenedor = $("resultadosMedicamentoPediatrico");
  if (!contenedor) return;
  const resultados = searchPediatricMedication(estado.busquedaMedicamento || "");
  const porPagina = 20;
  const pagina = Number(estado.prescripcionSearchPage || 1);
  contenedor.innerHTML = renderResultadosMedicamentosPediatricos(resultados.slice(0, pagina * porPagina), resultados.length, porPagina);
  bindResultadosMedicamentosPediatricos();
}

function bindResultadosMedicamentosPediatricos() {
  document.querySelectorAll("[data-ped-pick-med]").forEach((button) => {
    button.addEventListener("click", () => actualizarPrescripcionDesdeInput("medicationId", button.dataset.pedPickMed, "pick"));
  });
  document.querySelectorAll("[data-rx-action='more-results']").forEach((button) => {
    button.addEventListener("click", () => {
      estado.prescripcionSearchPage = Number(estado.prescripcionSearchPage || 1) + 1;
      renderResultadosBusquedaMedicamentos();
    });
  });
}

async function copiarPrescripcionPediatrica() {
  const rx = buildPediatricPrescription(leerInputPrescripcion());
  if (!rx.instructionText) {
    alert("Completa la prescripción antes de copiar.");
    return;
  }
  await navigator.clipboard?.writeText(rx.instructionText);
  registrarHistorial("Indicación pediátrica copiada");
}

function reiniciarPrescripcionPediatrica() {
  estado.prescripcion = {
    medicationId: "paracetamol",
    indicationId: "dolor_fiebre",
    schemeIndex: 1,
    dosingMode: "mg_kg_dosis",
    administrationsPerDay: 4,
    intervalHours: 6,
    route: "oral",
    presentationId: "paracetamol_susp_160_5",
    brandName: "Genérico",
    duration: 3,
    durationUnit: "días",
    customSchedule: "06:00, 12:00, 18:00, 00:00",
    weightConfirmed: $("pesoConfirmado")?.checked || false
  };
  calcularTodo();
}

async function guardarPrescripcionPediatrica() {
  sincronizarPrescripcionConPaciente();
  const rx = buildPediatricPrescription(leerInputPrescripcion());
  if (!rx.valid) {
    alert(`No se puede guardar todavía:\n\n${rx.errors.join("\n")}`);
    return;
  }
  if (estado.modoTemporal || !estado.uidPaciente) {
    alert("Selecciona un paciente para guardar la prescripción en el expediente.");
    return;
  }
  if (rx.warnings?.length && !confirm(`Hay advertencias clínicas:\n\n${rx.warnings.join("\n")}\n\n¿Guardar de todos modos?`)) return;
  try {
    await savePediatricPrescription({
      db,
      addDoc,
      collection,
      serverTimestamp,
      patientId: estado.uidPaciente,
      prescription: rx,
      createdBy: estado.usuario?.uid || ""
    });
    await addDoc(collection(db, "usuarios", estado.uidPaciente, "tratamientos"), {
      medicamento: rx.genericName,
      dosis: rx.instructionText,
      frecuencia: `${rx.administrationsPerDay || 1} ${Number(rx.administrationsPerDay) === 1 ? "vez" : "veces"} al día`,
      via: rx.route || "oral",
      horarios: rx.customSchedule?.join(", ") || "",
      fechaInicio: new Date().toISOString().slice(0, 10),
      estado: "activo",
      observaciones: "Generado desde calculadora pediátrica de COGNICIÓN.",
      dosisTotalDia: rx.totalDailyDoseMg ? `${formatNumber(rx.totalDailyDoseMg)} mg/día` : "",
      prescripcionPediatrica: rx,
      origen: "calculadora_pediatrica",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    registrarHistorial("Prescripción pediátrica guardada en tratamiento");
    alert("Prescripción guardada en el expediente y vinculada a tratamiento.");
  } catch (error) {
    console.error("No se pudo guardar prescripción pediátrica", error);
    alert("No se pudo guardar la prescripción. Revisa permisos de Firestore.");
  }
}

function renderPrescripcionAlertas(rx) {
  const errores = rx.errors || [];
  const advertencias = rx.warnings || [];
  if (!errores.length && !advertencias.length) {
    return `<div class="ped-rx-alerts ok"><b>Sin bloqueos detectados.</b><span>Verifica alergias, diagnóstico, edad, peso y protocolo institucional.</span></div>`;
  }
  return `
    <div class="ped-rx-alerts ${errores.length ? "error" : "warn"}">
      ${errores.map((item) => `<div><b>Bloqueo</b><span>${item}</span></div>`).join("")}
      ${advertencias.map((item) => `<div><b>Advertencia</b><span>${item}</span></div>`).join("")}
    </div>
  `;
}

function infoMedicamentoPediatricoAvanzado(medicamento) {
  if (!medicamento) return "";
  return `
    <div class="ped-med-info">
      <div><b>Clase</b><span>${medicamento.drugClass || "-"}</span></div>
      <div><b>Mecanismo</b><span>${medicamento.mechanism || "-"}</span></div>
      <div><b>Contraindicaciones</b><span>${(medicamento.contraindications || []).join("; ") || "-"}</span></div>
      <div><b>Interacciones</b><span>${(medicamento.interactions || []).join("; ") || "-"}</span></div>
    </div>
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

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function frecuenciaSelectValue(rx = {}) {
  if (rx.isPrn) return "prn";
  const horario = Array.isArray(rx.customSchedule) ? rx.customSchedule.join(", ") : estado.prescripcion.customSchedule;
  if (horario && String(horario).trim()) return "custom";
  const intervalo = Number(rx.intervalHours || estado.prescripcion.intervalHours);
  if ([4, 6, 8, 12, 24].includes(intervalo)) return `cada_${intervalo}`;
  const tomas = Number(rx.administrationsPerDay || estado.prescripcion.administrationsPerDay);
  if ([1, 2, 3, 4].includes(tomas)) return `${tomas}_dia`;
  return "cada_8";
}

function opcionesFrecuenciaPediatrica(actual = "") {
  const opciones = [
    ["cada_4", "Cada 4 horas"],
    ["cada_6", "Cada 6 horas"],
    ["cada_8", "Cada 8 horas"],
    ["cada_12", "Cada 12 horas"],
    ["cada_24", "Cada 24 horas"],
    ["1_dia", "1 vez al día"],
    ["2_dia", "2 veces al día"],
    ["3_dia", "3 veces al día"],
    ["4_dia", "4 veces al día"],
    ["custom", "Horario personalizado"],
    ["prn", "PRN / según necesidad"]
  ];
  return opciones.map(([valor, etiqueta]) => `<option value="${valor}" ${valor === actual ? "selected" : ""}>${etiqueta}</option>`).join("");
}

function aplicarFrecuenciaPediatrica(valor) {
  if (valor === "prn") return { isPrn: true };
  if (valor === "custom") return { isPrn: false, panelAbierto: "schedule" };
  const cada = String(valor || "").match(/^cada_(\d+)$/);
  if (cada) {
    const intervalHours = Number(cada[1]);
    return {
      isPrn: false,
      intervalHours,
      administrationsPerDay: Math.max(1, Math.round(24 / intervalHours)),
      customSchedule: ""
    };
  }
  const veces = String(valor || "").match(/^(\d+)_dia$/);
  if (veces) {
    const administrationsPerDay = Number(veces[1]);
    return {
      isPrn: false,
      administrationsPerDay,
      intervalHours: Math.max(1, Math.round(24 / administrationsPerDay)),
      customSchedule: ""
    };
  }
  return {};
}

function normalizarUnidadDuracion(value = "") {
  const texto = String(value || "").toLowerCase();
  if (texto.includes("sem")) return "semanas";
  if (texto.includes("mes")) return "meses";
  if (texto.includes("dosis")) return "dosis";
  return "dias";
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
