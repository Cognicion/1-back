import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { aplicarAparienciaGuardada } from "../services/apariencia.js";
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
  percentilDesdeLMS,
  superficieCorporal
} from "./formulas.js";
import { calcularDosisMedicamento, MEDICAMENTOS_PEDIATRICOS } from "./medicamentos.js";
import { FUENTES_PEDIATRIA } from "./fuentes.js";

aplicarAparienciaGuardada();

const estado = {
  paciente: {},
  uidPaciente: new URLSearchParams(window.location.search).get("id") || "",
  seccion: "resumen",
  favoritos: JSON.parse(localStorage.getItem("cognicionPediatriaFavoritos") || "[]"),
  historial: JSON.parse(localStorage.getItem("cognicionPediatriaHistorial") || "[]")
};

const categorias = [
  ["resumen", "Resumen pediatrico"],
  ["crecimiento", "Crecimiento y antropometria"],
  ["vitales", "Signos vitales"],
  ["liquidos", "Liquidos y electrolitos"],
  ["medicamentos", "Medicamentos y dosis"],
  ["desarrollo", "Desarrollo y tamizajes"],
  ["nutricion", "Nutricion"],
  ["vacunacion", "Vacunacion"],
  ["indicaciones", "Indicaciones y tratamiento"],
  ["graficas", "Graficas y seguimiento"],
  ["fuentes", "Fuentes"]
];

const SECCIONES_ABIERTAS_DEFAULT = new Set(["resumen", "crecimiento", "liquidos", "medicamentos"]);

const $ = (id) => document.getElementById(id);

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }
  $("usuarioSesion").textContent = usuario.email || "Usuario activo";
  await cargarPaciente();
  inicializar();
});

async function cargarPaciente() {
  if (!estado.uidPaciente) {
    estado.paciente = {};
    return;
  }
  try {
    const snap = await getDoc(doc(db, "usuarios", estado.uidPaciente));
    estado.paciente = snap.exists() ? snap.data() : {};
    $("estadoPaciente").textContent = snap.exists()
      ? "Datos cargados desde expediente"
      : "No se encontro el expediente";
  } catch (error) {
    console.warn("No se pudo cargar paciente para pediatria", error);
    $("estadoPaciente").textContent = "Modo manual: no se pudo leer expediente";
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
  $("copiarResumenPediatria").addEventListener("click", copiarResumen);
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
  $("pediatriaNav").innerHTML = categorias.map(([id, etiqueta]) => `
    <button class="ped-nav-btn" data-seccion="${id}">
      ${etiqueta}
    </button>
  `).join("");
  document.querySelectorAll(".ped-nav-btn").forEach((boton) => {
    boton.addEventListener("click", () => {
      abrirSeccionPediatria(boton.dataset.seccion);
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

function calcularTodo() {
  const edad = calcularEdadPediatrica($("fechaNacimiento").value, new Date(), $("edadGestacional").value);
  const peso = $("pesoKg").value;
  const talla = $("tallaCm").value;
  const tallaInfo = analizarTalla(talla);
  const imc = calcularIMC(peso, talla);
  const sc = superficieCorporal(peso, talla);
  const mantenimiento = mantenimientoHollidaySegarDetalle(peso);
  const deficit = calcularDeficit(peso, $("deshidratacion").value);
  const diuresis = calcularDiuresis($("diuresisMl").value, peso, $("diuresisHoras").value);
  const sodio = corregirSodioPorGlucosa($("sodio").value, $("glucosa").value);
  const gap = calcularAnionGap($("sodio").value, $("cloro").value, $("bicarbonato").value);
  const dosis = calcularDosisMedicamento({
    medicamentoId: $("medicamentoSelect").value,
    opcionIndice: $("opcionDosisSelect").value,
    pesoKg: peso,
    concentracionMgMl: $("concentracionMgMl").value,
    pesoConfirmado: $("pesoConfirmado").checked
  });
  const edadHtml = edad ? `
    <b>${edad.edadCronologicaTexto}</b>
    <span>${edad.diasTotales} dias de vida | ${edad.semanasTotales.toFixed(1)} semanas | ${edad.anosDecimales.toFixed(2)} anos</span>
    <span>Meses totales aproximados: ${Math.floor(edad.diasTotales / 30.4375)}.</span>
    ${edad.edadCorregidaSemanas !== null ? `<span>Edad corregida: ${edad.edadCorregidaSemanas.toFixed(1)} semanas. Edad postmenstrual: ${edad.edadPostmenstrualSemanas.toFixed(1)} semanas.</span>` : ""}
  ` : "Registra fecha de nacimiento.";

  setHtmlSiExiste("edadResultado", edadHtml);

  setTextoSiExiste("fechaVisible", formatearFechaDDMMAAAA($("fechaNacimiento").value) || "Sin fecha");
  setHtmlSiExiste("antropometriaResultado", `
    <b>IMC: ${imc ? imc.toFixed(2) : "sin calcular"} kg/m²</b>
    <span>Talla normalizada: ${formatearTallaClinica(tallaInfo)}</span>
    ${tallaInfo.error ? `<span class="ped-alerta">${tallaInfo.error}</span>` : ""}
    ${tallaInfo.advertencias?.map((mensaje) => `<span class="ped-alerta-suave">${mensaje}</span>`).join("") || ""}
    <span>SC Mosteller: ${sc ? sc.mosteller.toFixed(2) : "-"} m² | Haycock: ${sc ? sc.haycock.toFixed(2) : "-"} m²</span>
    ${sc ? `<span>Mosteller = √((peso ${numero(peso)} kg × talla ${tallaInfo.valorCm?.toFixed(1)} cm) / 3600).</span>` : ""}
    <span>Los percentiles y curvas solo se activan cuando existan tablas LMS oficiales cargadas por edad, sexo e indicador.</span>
  `);

  setHtmlSiExiste("liquidosResultado", mantenimiento ? `
    <b>Mantenimiento Holliday-Segar: ${mantenimiento.mlDia.toFixed(0)} mL/dia</b>
    <span>${mantenimiento.mlHora.toFixed(1)} mL/h | regla 4-2-1: ${mantenimiento.regla421.toFixed(1)} mL/h</span>
    <span>Peso usado: ${mantenimiento.pesoKg.toFixed(2)} kg. Formula: ${mantenimiento.formulaTexto} = ${mantenimiento.mlDia.toFixed(0)} mL/dia.</span>
    <div class="ped-formula-list">${mantenimiento.tramos.map((tramo) => `<span>${tramo.etiqueta}: ${tramo.pesoKg.toFixed(tramo.pesoKg % 1 ? 1 : 0)} kg × ${tramo.factor} = ${tramo.subtotal.toFixed(0)} mL</span>`).join("")}</div>
    <span>Deficit estimado: ${deficit ? deficit.toFixed(0) : "-"} mL. Diuresis: ${diuresis ? diuresis.toFixed(2) : "-"} mL/kg/h.</span>
    <span>Na corregido: ${sodio ? sodio.toFixed(1) : "-"} mEq/L | Anion gap: ${gap ? gap.toFixed(1) : "-"}</span>
    ${$("pesoConfirmado").checked ? "" : `<span class="ped-alerta">Confirma peso actual antes de usar el resultado para indicaciones.</span>`}
  ` : "Registra peso actual.");

  setHtmlSiExiste("medicamentoResultado", dosis.error ? `
    <b>${dosis.error}</b>
    <span>La calculadora bloquea dosis si no confirmas peso actual.</span>
  ` : `
    <b>${dosis.medicamento.nombre}: ${dosis.mgDosis.toFixed(2)} mg por dosis</b>
    <span>${dosis.frecuenciaDia} dosis/dia | total diario ${dosis.mgDia.toFixed(2)} mg/dia.</span>
    <span>${dosis.volumenMlDosis ? `Volumen: ${dosis.volumenMlDosis.toFixed(2)} mL por dosis.` : "Agrega concentracion mg/mL para volumen."}</span>
    ${infoMedicamentoPediatrico(dosis.medicamento)}
  `);

  const lms = percentilDesdeLMS(valorDe("lmsValor"), valorDe("lmsL"), valorDe("lmsM"), valorDe("lmsS"));
  setHtmlSiExiste("percentilResultado", lms ? `
    <b>Z: ${lms.z.toFixed(2)} | percentil: ${lms.percentil.toFixed(1)}</b>
    <span>Resultado calculado con parametros LMS ingresados manualmente.</span>
  ` : "Carga L, M y S oficiales para calcular z-score/percentil.");

  renderGraficasPediatria({ peso, tallaInfo, imc, sc, mantenimiento, deficit, diuresis });
  renderResumen(edad);
}

function setHtmlSiExiste(id, html) {
  const elemento = $(id);
  if (elemento) elemento.innerHTML = html;
}

function valorDe(id) {
  return $(id)?.value || "";
}

function setTextoSiExiste(id, texto) {
  const elemento = $(id);
  if (elemento) elemento.textContent = texto;
}

function formatearTallaClinica(tallaInfo) {
  if (!tallaInfo?.valido) return "Sin talla valida";
  return `${tallaInfo.valorCm.toFixed(1)} cm (${tallaInfo.valorM.toFixed(2)} m)`;
}

function obtenerDiagnosticosPaciente() {
  const p = estado.paciente || {};
  const lista = Array.isArray(p.diagnosticos) ? p.diagnosticos : Array.isArray(p.historialDiagnosticos) ? p.historialDiagnosticos : [];
  return lista
    .map((diag) => {
      if (typeof diag === "string") return diag;
      return diag?.texto || [diag?.codigo, diag?.nombre].filter(Boolean).join(" - ");
    })
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

function renderResumen(edad = null) {
  const tallaInfo = analizarTalla($("tallaCm").value);
  const imc = calcularIMC($("pesoKg").value, $("tallaCm").value);
  const sc = superficieCorporal($("pesoKg").value, $("tallaCm").value);
  const diagnosticos = obtenerDiagnosticosPaciente();
  const medicamentos = obtenerMedicamentosActivos();
  $("resumenPediatria").innerHTML = `
    <article class="ped-summary-card"><span>Paciente</span><b>${$("nombrePaciente").value || "Modo manual"}</b><small>${$("sexoPaciente").value || "Sexo sin registro"} · ${formatearFechaDDMMAAAA($("fechaNacimiento").value) || "Sin fecha de nacimiento"}</small></article>
    <article class="ped-summary-card"><span>Edad exacta</span><b>${edad?.edadCronologicaTexto || "Sin edad"}</b><small>${edad ? `${Math.floor(edad.diasTotales / 30.4375)} meses totales · ${edad.diasTotales} dias` : "Calculada desde fecha de nacimiento"}</small></article>
    <article class="ped-summary-card"><span>Somatometria</span><b>${$("pesoKg").value || "-"} kg · ${formatearTallaClinica(tallaInfo)}</b><small>IMC ${imc ? imc.toFixed(2) : "-"} kg/m² · SC ${sc ? sc.mosteller.toFixed(2) : "-"} m²</small></article>
    <article class="ped-summary-card"><span>Alergias y alertas</span><b>${$("alergias").value || "Sin alergias registradas"}</b><small>${diagnosticos.length ? `Dx: ${diagnosticos.join("; ")}` : "Sin diagnosticos cargados"}${medicamentos.length ? ` · Tx: ${medicamentos.join(", ")}` : ""}</small></article>
  `;
}

function renderSeccion() {
  const filtro = $("busquedaPediatria").value.toLowerCase().trim();
  const secciones = [
    ["resumen", "Accesos rapidos", [
      card("Edad exacta", "Calcula edad cronologica, dias de vida y edad corregida.", "crecimiento"),
      card("Crecimiento", "IMC, superficie corporal, LMS avanzado y trazabilidad de unidades.", "crecimiento"),
      card("Dosis pediatricas", "Calculadora segura por kg con confirmacion de peso.", "medicamentos"),
      card("Liquidos", "Mantenimiento, deficit, diuresis y electrolitos basicos.", "liquidos")
    ]],
    ["crecimiento", "Crecimiento y antropometria", [panelEdad(), panelAntropometria(), panelPercentiles()]],
    ["vitales", "Signos vitales", [panelVitales()]],
    ["liquidos", "Liquidos", [panelLiquidos()]],
    ["medicamentos", "Dosis pediatricas", [panelMedicamentos()]],
    ["desarrollo", "Desarrollo y tamizajes", [pendiente("Desarrollo y tamizajes", "Hitos, red flags y tamizajes se integraran con referencias versionadas, sin sustituir valoracion clinica.")]],
    ["nutricion", "Nutricion", [pendiente("Nutricion", "Requerimientos caloricos, proteicos y micronutrientes por edad se cargaran como tablas versionadas.")]],
    ["vacunacion", "Vacunacion", [pendiente("Vacunacion", "Esquema nacional y alertas por edad requieren versionamiento oficial por pais.")]],
    ["indicaciones", "Indicaciones y tratamiento", [pendiente("Indicaciones y tratamiento", "Integrara medicamentos activos, alergias, peso usado, calculos y validaciones antes de emitir indicaciones.")]],
    ["graficas", "Graficas pediatricas", [panelGraficas()]],
    ["fuentes", "Fuentes", [panelFuentes()]]
  ];
  const contenido = secciones
    .map(([id, titulo, tarjetas]) => {
      const tarjetasFiltradas = tarjetas.filter((html) => !filtro || `${titulo} ${html}`.toLowerCase().includes(filtro));
      if (!tarjetasFiltradas.length) return "";
      const abierto = filtro || estado.seccion === id || SECCIONES_ABIERTAS_DEFAULT.has(id) ? " open" : "";
      return `
        <details id="ped-seccion-${id}" class="ped-section-block"${abierto}>
          <summary>
            <span>${titulo}</span>
            <small>${tarjetasFiltradas.length} modulo${tarjetasFiltradas.length === 1 ? "" : "s"}</small>
          </summary>
          <div class="ped-section-content">${tarjetasFiltradas.join("")}</div>
        </details>
      `;
    })
    .filter(Boolean);
  $("contenidoPediatria").innerHTML = contenido.length ? contenido.join("") : `<div class="ped-empty">No se encontraron herramientas para esta busqueda.</div>`;
  bindEntradasCalculo();
  document.querySelectorAll("[data-ir]").forEach((boton) => {
    boton.addEventListener("click", () => {
      abrirSeccionPediatria(boton.dataset.ir);
    });
  });
}

function abrirSeccionPediatria(destino) {
  if (!destino) return;
  estado.seccion = destino;
  renderNavegacion();
  renderSeccion();
  calcularTodo();

  requestAnimationFrame(() => {
    const seccion = document.getElementById(`ped-seccion-${destino}`);
    if (seccion?.tagName === "DETAILS") seccion.open = true;
    seccion?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function card(titulo, texto, destino) {
  return `<article class="ped-card"><span>Herramienta</span><h3>${titulo}</h3><p>${texto}</p><button class="ped-primary" data-ir="${destino}">Abrir</button></article>`;
}

function panelEdad() {
  return `<article class="ped-panel"><h3>Edad pediatrica</h3><p>Usa la fecha de nacimiento como raiz para calculos pediatricos. La edad corregida se calcula si registras edad gestacional al nacimiento.</p><div class="ped-result" id="edadResultado"></div><div class="ped-meta">Fecha visible: <b id="fechaVisible"></b></div></article>`;
}

function panelAntropometria() {
  return `<article class="ped-panel"><h3>Antropometria</h3><p>IMC y superficie corporal. Los percentiles no se calculan sin tablas LMS oficiales completas.</p><div class="ped-result" id="antropometriaResultado"></div></article>`;
}

function panelPercentiles() {
  return `
    <article class="ped-panel">
      <h3>Crecimiento y percentiles</h3>
      <div class="ped-result ped-lms-auto">
        <b>Percentiles oficiales: no disponibles en esta instalacion.</b>
        <span>Cognicion no dibuja curvas ni clasifica percentiles sin tablas LMS oficiales por sexo, edad e indicador. Cuando se carguen tablas validadas, este bloque calculara z-score y percentil automaticamente.</span>
      </div>
      <details class="ped-advanced">
        <summary>Motor LMS manual avanzado</summary>
        <p>Usalo solo si tienes los parametros L, M y S de una fuente oficial para el indicador exacto.</p>
        <div class="ped-grid-mini">
          <input id="lmsValor" data-ped-calc placeholder="Valor observado">
          <input id="lmsL" data-ped-calc placeholder="L">
          <input id="lmsM" data-ped-calc placeholder="M">
          <input id="lmsS" data-ped-calc placeholder="S">
        </div>
        <div class="ped-result" id="percentilResultado"></div>
      </details>
    </article>
  `;
}

function panelVitales() {
  return `<article class="ped-panel"><h3>Signos vitales</h3><p>Captura PA, FC, FR, temperatura y SatO2 en el panel izquierdo. La interpretacion por percentiles de PA se activara al cargar tablas AAP por edad, sexo y talla.</p><div class="ped-result"><b>Presion arterial pediatrica</b><span>Para percentiles se requiere la tabla oficial AAP 2017. Por ahora el modulo registra y prepara datos sin clasificar de forma falsa.</span></div></article>`;
}

function panelLiquidos() {
  return `<article class="ped-panel"><h3>Liquidos y electrolitos</h3><div class="ped-result" id="liquidosResultado"></div></article>`;
}

function panelMedicamentos() {
  return `<article class="ped-panel"><h3>Dosis pediatricas seguras</h3><p>Selecciona medicamento, esquema, concentracion y confirma peso actual. El resultado es apoyo de calculo, no orden medica automatica.</p><div class="ped-result ped-med-result" id="medicamentoResultado"></div></article>`;
}

function listaCompactaMedicamento(titulo, items = []) {
  if (!items?.length) return "";
  return `
    <div class="ped-med-info">
      <strong>${titulo}</strong>
      <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
    </div>
  `;
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

function panelGraficas() {
  return `<article class="ped-panel ped-panel-graficas"><h3>Graficas y seguimiento</h3><p>Valores calculados y tendencia clinica. Las curvas percentilares se mostraran solo cuando existan tablas oficiales cargadas.</p><div id="graficasPediatria" class="ped-charts"></div></article>`;
}

function renderGraficasPediatria({ peso, tallaInfo, imc, sc, mantenimiento, deficit, diuresis }) {
  const contenedor = $("graficasPediatria");
  if (!contenedor) return;

  const pesoNum = numero(peso);
  const imcNum = numero(imc);
  const scNum = sc?.mosteller ? numero(sc.mosteller) : null;
  const mantenimientoNum = mantenimiento?.mlDia ? numero(mantenimiento.mlDia) : null;
  const deficitNum = numero(deficit);
  const diuresisNum = numero(diuresis);

  contenedor.innerHTML = `
    ${tarjetaValoresClinicos("Somatometria calculada", [
      ["Peso", pesoNum !== null ? `${pesoNum.toFixed(2)} kg` : "-"],
      ["Talla/longitud", tallaInfo?.valido ? formatearTallaClinica(tallaInfo) : "-"],
      ["IMC", imcNum !== null ? `${imcNum.toFixed(2)} kg/m²` : "-"],
      ["SC Mosteller", scNum !== null ? `${scNum.toFixed(2)} m²` : "-"]
    ], "Sin tablas LMS oficiales, estos valores no se representan como percentiles.")}
    ${tarjetaValoresClinicos("Liquidos y electrolitos", [
      ["Mantenimiento", mantenimientoNum !== null ? `${mantenimientoNum.toFixed(0)} mL/dia` : "-"],
      ["mL/h", mantenimiento?.mlHora ? `${mantenimiento.mlHora.toFixed(1)} mL/h` : "-"],
      ["Deficit", deficitNum !== null ? `${deficitNum.toFixed(0)} mL` : "-"],
      ["Diuresis", diuresisNum !== null ? `${diuresisNum.toFixed(2)} mL/kg/h` : "-"]
    ], "La grafica longitudinal se activara con registros seriados fechados del expediente.")}
    <div class="ped-chart-card ped-chart-pending">
      <h4>Curvas de crecimiento</h4>
      <p>Preparado para curvas OMS/CDC u otra referencia oficial. No se dibujan curvas ficticias ni rangos arbitrarios.</p>
    </div>
  `;
}

function tarjetaValoresClinicos(titulo, datos, nota) {
  const filas = datos.map(([etiqueta, valor]) => `
    <div class="ped-value-row">
      <span>${etiqueta}</span>
      <b>${valor}</b>
    </div>
  `).join("");
  return `<div class="ped-chart-card"><h4>${titulo}</h4>${filas}<p>${nota}</p></div>`;
}

function panelFuentes() {
  return `<article class="ped-panel"><h3>Fuentes y trazabilidad</h3>${FUENTES_PEDIATRIA.map((fuente) => `<div class="ped-source"><b>${fuente.tema}</b><a href="${fuente.url}" target="_blank" rel="noopener">${fuente.titulo}</a><span>${fuente.nota}</span></div>`).join("")}</article>`;
}

function pendiente(titulo, texto) {
  return `<article class="ped-panel ped-pending"><h3>${titulo}</h3><p>${texto}</p><div class="ped-result"><b>Fase preparada</b><span>Sin calculos inventados. Se activara cuando se carguen tablas, formulas o protocolos validados.</span></div></article>`;
}

async function copiarResumen() {
  const texto = [
    `Paciente: ${$("nombrePaciente").value || "Sin nombre"}`,
    `Fecha nacimiento: ${formatearFechaDDMMAAAA($("fechaNacimiento").value) || "Sin registro"}`,
    `Edad: ${$("edadResultado").querySelector("b")?.textContent || "Sin calcular"}`,
    `Peso: ${$("pesoKg").value || "-"} kg`,
    `Talla: ${formatearTallaClinica(analizarTalla($("tallaCm").value))}`,
    `Alergias: ${$("alergias").value || "Sin registro"}`
  ].join("\n");
  await navigator.clipboard.writeText(texto);
  registrarHistorial("Resumen copiado");
}

function registrarHistorial(texto) {
  estado.historial.unshift({ texto, fecha: new Date().toISOString() });
  estado.historial = estado.historial.slice(0, 10);
  localStorage.setItem("cognicionPediatriaHistorial", JSON.stringify(estado.historial));
}
