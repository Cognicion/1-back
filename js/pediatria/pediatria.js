import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { aplicarAparienciaGuardada } from "../services/apariencia.js";
import { calcularEdadPediatrica, formatearFechaDDMMAAAA } from "./edad.js";
import {
  calcularAnionGap,
  calcularDeficit,
  calcularDiuresis,
  calcularIMC,
  corregirSodioPorGlucosa,
  mantenimientoHollidaySegar,
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
  ["resumen", "Resumen clinico"],
  ["edad", "Edad y etapa"],
  ["antropometria", "Antropometria"],
  ["percentiles", "Percentiles LMS"],
  ["vitales", "Signos vitales"],
  ["liquidos", "Liquidos"],
  ["medicamentos", "Dosis pediatricas"],
  ["graficas", "Graficas"],
  ["neonatos", "Neonatologia"],
  ["urgencias", "Urgencias"],
  ["nutricion", "Nutricion"],
  ["desarrollo", "Desarrollo"],
  ["vacunas", "Vacunas"],
  ["nefro", "Renal"],
  ["respiratorio", "Respiratorio"],
  ["endocrino", "Endocrino"],
  ["fuentes", "Fuentes"]
];

const SECCIONES_ABIERTAS_DEFAULT = new Set(["resumen", "edad", "antropometria", "liquidos", "medicamentos", "graficas"]);

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
      estado.seccion = boton.dataset.seccion;
      const seccion = document.getElementById(`ped-seccion-${estado.seccion}`);
      if (seccion?.tagName === "DETAILS") seccion.open = true;
      seccion?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
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
  const imc = calcularIMC(peso, talla);
  const sc = superficieCorporal(peso, talla);
  const mantenimiento = mantenimientoHollidaySegar(peso);
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
    ${edad.edadCorregidaSemanas !== null ? `<span>Edad corregida: ${edad.edadCorregidaSemanas.toFixed(1)} semanas. Edad postmenstrual: ${edad.edadPostmenstrualSemanas.toFixed(1)} semanas.</span>` : ""}
  ` : "Registra fecha de nacimiento.";

  setHtmlSiExiste("edadResultado", edadHtml);

  setTextoSiExiste("fechaVisible", formatearFechaDDMMAAAA($("fechaNacimiento").value) || "Sin fecha");
  setHtmlSiExiste("antropometriaResultado", `
    <b>IMC: ${imc ? imc.toFixed(2) : "sin calcular"}</b>
    <span>SC Mosteller: ${sc ? sc.mosteller.toFixed(2) : "-"} m2 | Haycock: ${sc ? sc.haycock.toFixed(2) : "-"} m2</span>
    <span>Los percentiles requieren tablas LMS oficiales cargadas para edad/sexo/indicador.</span>
  `);

  setHtmlSiExiste("liquidosResultado", mantenimiento ? `
    <b>Mantenimiento: ${mantenimiento.mlDia.toFixed(0)} mL/dia</b>
    <span>${mantenimiento.mlHora.toFixed(1)} mL/h | regla 4-2-1: ${mantenimiento.regla421.toFixed(1)} mL/h</span>
    <span>Deficit estimado: ${deficit ? deficit.toFixed(0) : "-"} mL. Diuresis: ${diuresis ? diuresis.toFixed(2) : "-"} mL/kg/h.</span>
    <span>Na corregido: ${sodio ? sodio.toFixed(1) : "-"} mEq/L | Anion gap: ${gap ? gap.toFixed(1) : "-"}</span>
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

  renderGraficasPediatria({ peso, talla, imc, sc, mantenimiento, deficit, diuresis });
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

function renderResumen(edad = null) {
  $("resumenPediatria").innerHTML = `
    <article><span>Paciente</span><b>${$("nombrePaciente").value || "Modo manual"}</b></article>
    <article><span>Edad</span><b>${edad?.edadCronologicaTexto || "Sin edad"}</b></article>
    <article><span>Peso actual</span><b>${$("pesoKg").value || "-"} kg</b></article>
    <article><span>Alertas</span><b>${$("alergias").value || "Sin alergias registradas"}</b></article>
  `;
}

function renderSeccion() {
  const filtro = $("busquedaPediatria").value.toLowerCase().trim();
  const secciones = [
    ["resumen", "Accesos rapidos", [
      card("Edad exacta", "Calcula edad cronologica, dias de vida y edad corregida.", "edad"),
      card("Antropometria", "IMC y superficie corporal con varias formulas.", "antropometria"),
      card("Dosis pediatricas", "Calculadora segura por kg con confirmacion de peso.", "medicamentos"),
      card("Liquidos", "Mantenimiento, deficit, diuresis y electrolitos basicos.", "liquidos")
    ]],
    ["edad", "Edad y etapa", [panelEdad()]],
    ["antropometria", "Antropometria", [panelAntropometria()]],
    ["percentiles", "Percentiles LMS", [panelPercentiles()]],
    ["vitales", "Signos vitales", [panelVitales()]],
    ["liquidos", "Liquidos", [panelLiquidos()]],
    ["medicamentos", "Dosis pediatricas", [panelMedicamentos()]],
    ["graficas", "Graficas pediatricas", [panelGraficas()]],
    ["neonatos", "Neonatologia", [pendiente("Neonatologia", "Bilirrubina, edad gestacional, peso al nacer, sepsis neonatal y nutricion parenteral se agregaran con tablas oficiales.")]],
    ["urgencias", "Urgencias", [pendiente("Urgencias pediatricas", "Se dejara listo para PALS/APLS, convulsiones, anafilaxia y choque, con validacion local.")]],
    ["nutricion", "Nutricion", [pendiente("Nutricion", "Requerimientos caloricos, proteicos y micronutrientes por edad se cargaran como tablas versionadas.")]],
    ["desarrollo", "Desarrollo", [pendiente("Desarrollo", "Hitos, tamizajes y red flags se integraran sin sustituir valoracion clinica.")]],
    ["vacunas", "Vacunas", [pendiente("Vacunas", "Esquema nacional y alertas por edad requieren versionamiento oficial por pais.")]],
    ["nefro", "Renal", [pendiente("Renal", "eGFR Schwartz, ajuste renal y electrolitos avanzados se agregaran por fase.")]],
    ["respiratorio", "Respiratorio", [pendiente("Respiratorio", "Oxigenoterapia, crisis asmatica y escalas respiratorias se preparan para fase posterior.")]],
    ["endocrino", "Endocrino", [pendiente("Endocrino", "Glucosa, insulina, cetoacidosis y crecimiento puberal se agregaran con protocolos.")]],
    ["fuentes", "Fuentes", [panelFuentes()]]
  ];
  const contenido = secciones
    .map(([id, titulo, tarjetas]) => {
      const tarjetasFiltradas = tarjetas.filter((html) => !filtro || `${titulo} ${html}`.toLowerCase().includes(filtro));
      if (!tarjetasFiltradas.length) return "";
      const abierto = filtro || SECCIONES_ABIERTAS_DEFAULT.has(id) ? " open" : "";
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
      estado.seccion = boton.dataset.ir;
      renderNavegacion();
      renderSeccion();
      calcularTodo();
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
  return `<article class="ped-panel"><h3>Motor LMS para percentiles</h3><p>Ingresa valores L, M y S oficiales si deseas validar un indicador puntual. Cognicion no inventa percentiles.</p><div class="ped-grid-mini"><input id="lmsValor" data-ped-calc placeholder="Valor observado"><input id="lmsL" data-ped-calc placeholder="L"><input id="lmsM" data-ped-calc placeholder="M"><input id="lmsS" data-ped-calc placeholder="S"></div><div class="ped-result" id="percentilResultado"></div></article>`;
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
  return `<article class="ped-panel ped-panel-graficas"><h3>Graficas clinicas pediatricas</h3><p>Visualizacion rapida de somatometria, superficie corporal y liquidos calculados. No sustituye percentiles oficiales.</p><div id="graficasPediatria" class="ped-charts"></div></article>`;
}

function renderGraficasPediatria({ peso, talla, imc, sc, mantenimiento, deficit, diuresis }) {
  const contenedor = $("graficasPediatria");
  if (!contenedor) return;

  const pesoNum = numero(peso);
  const tallaNum = numero(talla);
  const imcNum = numero(imc);
  const scNum = sc?.mosteller ? numero(sc.mosteller) : null;
  const mantenimientoNum = mantenimiento?.mlDia ? numero(mantenimiento.mlDia) : null;
  const deficitNum = numero(deficit);
  const diuresisNum = numero(diuresis);

  contenedor.innerHTML = `
    ${graficaBarras("Somatometria", [
      { etiqueta: "Peso", valor: pesoNum, unidad: "kg", max: Math.max(30, pesoNum || 0) },
      { etiqueta: "Talla", valor: tallaNum, unidad: "cm", max: Math.max(120, tallaNum || 0) },
      { etiqueta: "IMC", valor: imcNum, unidad: "kg/m2", max: 35 },
      { etiqueta: "SC", valor: scNum, unidad: "m2", max: Math.max(2, scNum || 0) }
    ])}
    ${graficaBarras("Liquidos", [
      { etiqueta: "Mant.", valor: mantenimientoNum, unidad: "mL/dia", max: Math.max(1200, mantenimientoNum || 0, deficitNum || 0) },
      { etiqueta: "Deficit", valor: deficitNum, unidad: "mL", max: Math.max(1200, mantenimientoNum || 0, deficitNum || 0) },
      { etiqueta: "Diuresis", valor: diuresisNum, unidad: "mL/kg/h", max: 5 }
    ])}
  `;
}

function graficaBarras(titulo, datos) {
  const filas = datos.map((item) => {
    const valor = numero(item.valor);
    const max = numero(item.max) || 1;
    const porcentaje = valor ? Math.max(4, Math.min(100, (valor / max) * 100)) : 0;
    return `
      <div class="ped-chart-row">
        <span>${item.etiqueta}</span>
        <div class="ped-chart-track"><i style="width:${porcentaje}%"></i></div>
        <b>${valor !== null ? valor.toFixed(valor >= 10 ? 0 : 2) : "-"} ${item.unidad}</b>
      </div>
    `;
  }).join("");
  return `<div class="ped-chart-card"><h4>${titulo}</h4>${filas}</div>`;
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
    `Talla: ${$("tallaCm").value || "-"} cm`,
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
