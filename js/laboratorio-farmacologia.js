import { MEDICAMENTOS_MAESTROS, MEDICAMENTOS_PRESENTACIONES, medicamentoPorTexto } from "./data/medicamentos.js";
import { evaluarMedicamentosPaciente, obtenerIndicadorSeguridadMedicamento } from "./services/motorClinicoMedicamentos.js";

const seleccionados = [];
const $ = (id) => document.getElementById(id);

function textoNormalizado(valor = "") {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function escapar(valor = "") {
  return String(valor || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function opcionesMedicamentos() {
  const opciones = [];
  MEDICAMENTOS_MAESTROS.forEach((med) => {
    if (med.nombre) opciones.push(med.nombre);
    if (med.genericName && med.genericName !== med.nombre) opciones.push(med.genericName);
    (med.brandNames || []).forEach((marca) => opciones.push(`${marca} (${med.nombre})`));
    (med.synonyms || []).forEach((sinonimo) => opciones.push(sinonimo));
  });
  MEDICAMENTOS_PRESENTACIONES.forEach((med) => {
    if (med.texto) opciones.push(med.texto);
    else if (med.nombre && med.presentacion) opciones.push(`${med.nombre}, ${med.presentacion}.`);
  });
  return [...new Set(opciones.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function pacienteSimulado() {
  const comorbilidades = $("farmacoComorbilidades")?.value || "";
  return {
    edad: $("farmacoEdad")?.value || "",
    sexo: $("farmacoSexo")?.value || "",
    eGFR: $("farmacoEGFR")?.value || "",
    creatinina: $("farmacoCreatinina")?.value || "",
    alergias: $("farmacoAlergias")?.value || "",
    comorbilidades,
    diagnosticos: comorbilidades,
    antecedentes: comorbilidades,
    antecedentesMedicos: comorbilidades,
    observaciones: comorbilidades
  };
}

function renderCatalogo() {
  const datalist = $("farmacoCatalogo");
  if (!datalist) return;
  datalist.innerHTML = opcionesMedicamentos().map((opcion) => `<option value="${escapar(opcion)}"></option>`).join("");
}

function renderSeleccionados() {
  const contenedor = $("farmacosSeleccionados");
  if (!contenedor) return;
  contenedor.innerHTML = seleccionados.length
    ? seleccionados.map((med, index) => `
      <article class="farmaco-chip">
        <div><strong>${escapar(med.medicamento)}</strong>${med.indicacion ? `<small>${escapar(med.indicacion)}</small>` : ""}</div>
        <button type="button" data-quitar-farmaco="${index}">Quitar</button>
      </article>
    `).join("")
    : "<p>No hay medicamentos seleccionados.</p>";
  contenedor.querySelectorAll("[data-quitar-farmaco]").forEach((boton) => {
    boton.addEventListener("click", () => {
      seleccionados.splice(Number(boton.dataset.quitarFarmaco), 1);
      renderSeleccionados();
      evaluar();
    });
  });
}

function agregarMedicamento() {
  const nombre = $("farmacoBuscador")?.value?.trim();
  if (!nombre) return;
  const dosis = $("farmacoDosis")?.value?.trim();
  const claveNuevo = `${textoNormalizado(nombre)}|${textoNormalizado(dosis)}`;
  if (seleccionados.some((med) => `${textoNormalizado(med.medicamento)}|${textoNormalizado(med.indicacion)}` === claveNuevo)) {
    alert("Ese medicamento ya está en la simulación.");
    return;
  }
  seleccionados.push({
    id: `farmaco-${Date.now()}-${seleccionados.length}`,
    medicamento: nombre,
    nombre,
    indicacion: dosis,
    texto: `${nombre} ${dosis}`.trim()
  });
  $("farmacoBuscador").value = "";
  $("farmacoDosis").value = "";
  renderSeleccionados();
  evaluar();
}

function severidadClase(severidad = "") {
  const texto = textoNormalizado(severidad);
  if (texto.includes("critica") || texto.includes("crítica")) return "alta";
  if (texto.includes("alta")) return "alta";
  if (texto.includes("relevante") || texto.includes("moderada")) return "relevante";
  return "precaucion";
}

function renderAlerta(item, tipo = "alerta") {
  const etiquetaTipo = {
    interaccion: "Interacción medicamento-medicamento",
    diagnostico: "Alerta medicamento-diagnóstico",
    contraindicacion: "Contraindicación absoluta",
    precaucion: "Precaución clínica",
    duplicidad: "Duplicidad terapéutica",
    acumulativo: "Efecto farmacodinámico acumulativo",
    monitorizacion: "Ajuste o monitorización",
    dato_faltante: "Dato clínico faltante"
  }[tipo] || "Alerta clínica";

  return `
    <article class="interaccion-card ${severidadClase(item.severidad || item.nivel || "")}">
      <strong>${escapar(item.titulo || item.nombre || "Alerta clínica")}</strong>
      <p><b>Medicamentos:</b> ${escapar((item.medicamentos || []).join(" + ") || "No especificados")}</p>
      ${item.diagnosticos?.length ? `<p><b>Diagnóstico/comorbilidad:</b> ${escapar(item.diagnosticos.join(", "))}</p>` : ""}
      <p>${escapar(item.efecto || item.descripcion || "")}</p>
      ${item.recomendacion ? `<p><b>Recomendación:</b> ${escapar(item.recomendacion)}</p>` : ""}
      ${item.parametrosVigilancia?.length ? `<p><b>Vigilar:</b> ${escapar(item.parametrosVigilancia.join(", "))}</p>` : ""}
      ${item.fuentes?.length ? `<small>Fuente local: ${escapar(item.fuentes.join("; "))}</small>` : ""}
      <small>${escapar(etiquetaTipo)} · Severidad: ${escapar(item.severidad || "no especificada")}</small>
    </article>
  `;
}

function clasificarAlertas(alertas = []) {
  const grupos = {
    interacciones: [],
    diagnosticos: [],
    absolutas: [],
    precauciones: [],
    duplicidades: [],
    acumulativos: [],
    monitorizacion: []
  };

  alertas.forEach((alerta) => {
    if (alerta.tipo === "duplicidad_terapeutica") grupos.duplicidades.push(alerta);
    else if (alerta.tipo === "riesgo_acumulativo") grupos.acumulativos.push(alerta);
    else if (alerta.tipo?.includes("interaccion")) grupos.interacciones.push(alerta);
    else if (alerta.tipo?.includes("contraindicacion") && alerta.severidad === "critica") grupos.absolutas.push(alerta);
    else if (alerta.diagnosticos?.length) grupos.diagnosticos.push(alerta);
    else if (alerta.tipo?.includes("dosis") || alerta.parametrosVigilancia?.length) grupos.monitorizacion.push(alerta);
    else grupos.precauciones.push(alerta);
  });

  return grupos;
}

function renderSeccion(titulo, items, tipo, vacio = "No se encontraron alertas en esta categoría con la base local actual.") {
  return `
    <section class="farmaco-result-section">
      <h3>${escapar(titulo)} <span>${items.length}</span></h3>
      <div class="farmaco-result-list">
        ${items.length ? items.map((item) => renderAlerta(item, tipo)).join("") : `<p class="farmaco-empty">${escapar(vacio)}</p>`}
      </div>
    </section>
  `;
}

function renderFichaMedicamento(medEvaluado) {
  const ficha = medicamentoPorTexto(medEvaluado.textoOriginal || medEvaluado.nombre || medEvaluado.medicamento || "");
  if (!ficha) {
    return `<li>${escapar(medEvaluado.textoOriginal || "Medicamento no identificado en catálogo maestro")}</li>`;
  }
  const lista = (titulo, valores = []) => {
    const items = (valores || []).filter(Boolean).slice(0, 4);
    return items.length ? `<p><b>${titulo}:</b> ${escapar(items.join("; "))}</p>` : "";
  };
  return `
    <li>
      <strong>${escapar(ficha.nombre)}</strong>
      <small>${escapar(ficha.clase || "Medicamento")}</small>
      ${ficha.brandNames?.length ? `<p><b>Marcas:</b> ${escapar(ficha.brandNames.slice(0, 6).join(", "))}</p>` : ""}
      ${ficha.dosisHabitual ? `<p><b>Dosis habitual:</b> ${escapar(ficha.dosisHabitual)}</p>` : ""}
      ${ficha.mecanismoAccion ? `<p><b>Mecanismo:</b> ${escapar(ficha.mecanismoAccion)}</p>` : ""}
      ${ficha.vidaMedia ? `<p><b>Vida media:</b> ${escapar(ficha.vidaMedia)}</p>` : ""}
      ${lista("Indicaciones", ficha.indicaciones || ficha.indications)}
      ${lista("Contraindicaciones", ficha.contraindicaciones || ficha.contraindications)}
      ${lista("Precaución", ficha.precauciones || ficha.precautions)}
      ${lista("Efectos adversos", ficha.efectosAdversos)}
    </li>
  `;
}

function datosFaltantes(paciente, evaluacion) {
  const faltantes = [];
  const textosDx = evaluacion.textosDiagnosticosEvaluados || [];
  if (!textosDx.length) faltantes.push("Diagnósticos o comorbilidades registradas");

  const textoAlertas = (evaluacion.alertas || []).map((alerta) => `${alerta.titulo} ${alerta.efecto} ${alerta.recomendacion}`).join(" ");
  if (/renal|creatinina|eGFR|filtrado/i.test(textoAlertas) && !paciente.eGFR && !paciente.creatinina) {
    faltantes.push("Función renal / creatinina / eGFR");
  }
  if (/hep[aá]t|child/i.test(textoAlertas) && !/child|hep[aá]t|cirrosis/i.test(paciente.comorbilidades || "")) {
    faltantes.push("Función hepática / Child-Pugh si aplica");
  }
  return [...new Set(faltantes)];
}

function renderResumen(evaluacion, indicador, paciente) {
  const grupos = clasificarAlertas(evaluacion.alertas || []);
  const faltantes = datosFaltantes(paciente, evaluacion);
  const diagnosticos = evaluacion.diagnosticosDetectados || [];
  const medicamentosUnicos = evaluacion.medicamentosNormalizados || [];

  return `
    <article class="farmaco-resumen ${severidadClase(indicador.clase || "")}">
      <div>
        <strong>Resumen de seguridad: ${escapar(indicador.etiqueta || "Revisión sin alertas críticas")}</strong>
        <p>Catálogo activo: ${MEDICAMENTOS_MAESTROS.length} medicamentos y ${MEDICAMENTOS_PRESENTACIONES.length} presentaciones.</p>
      </div>
      <dl>
        <div><dt>Principios activos únicos</dt><dd>${medicamentosUnicos.length}</dd></div>
        <div><dt>Diagnósticos activos revisados</dt><dd>${diagnosticos.length}</dd></div>
        <div><dt>Interacciones</dt><dd>${grupos.interacciones.length}</dd></div>
        <div><dt>Alertas diagnóstico</dt><dd>${grupos.diagnosticos.length}</dd></div>
        <div><dt>Contraindicaciones absolutas</dt><dd>${grupos.absolutas.length}</dd></div>
        <div><dt>Datos faltantes</dt><dd>${faltantes.length}</dd></div>
      </dl>
    </article>
    <details class="farmaco-details" open>
      <summary>Medicamentos evaluados</summary>
      <ul>${medicamentosUnicos.map(renderFichaMedicamento).join("") || "<li>Sin medicamentos evaluados.</li>"}</ul>
    </details>
    <details class="farmaco-details">
      <summary>Diagnósticos y comorbilidades considerados</summary>
      ${diagnosticos.length
        ? `<ul>${diagnosticos.map((dx) => `<li>${escapar(dx.nombre)}${dx.codigo ? ` · ${escapar(dx.codigo)}` : ""}${dx.categoria ? ` · ${escapar(dx.categoria)}` : ""}</li>`).join("")}</ul>`
        : `<p>No hay diagnósticos o comorbilidades disponibles para evaluar contraindicaciones y precauciones. El análisis actual solo incluye los medicamentos registrados.</p>`}
    </details>
    ${faltantes.length ? `<article class="interaccion-card precaucion"><strong>Evaluación incompleta por falta de datos</strong><p>${escapar(faltantes.join(", "))}</p><p>No se debe interpretar la ausencia de alertas como uso seguro si faltan datos clínicos.</p></article>` : ""}
  `;
}

function evaluar() {
  const salida = $("resultadoInteraccionesFarmaco");
  if (!salida) return;
  if (seleccionados.length < 2) {
    salida.textContent = "Agrega dos o más medicamentos para iniciar la revisión.";
    return;
  }
  const paciente = pacienteSimulado();
  const evaluacion = evaluarMedicamentosPaciente({ paciente, medicamentos: seleccionados });
  const indicador = obtenerIndicadorSeguridadMedicamento(evaluacion.alertas || []);
  const grupos = clasificarAlertas(evaluacion.alertas || []);
  salida.innerHTML = [
    renderResumen(evaluacion, indicador, paciente),
    renderSeccion("A. Interacciones medicamento-medicamento", grupos.interacciones, "interaccion"),
    renderSeccion("B. Alertas medicamento-diagnóstico", grupos.diagnosticos, "diagnostico"),
    renderSeccion("C. Contraindicaciones absolutas", grupos.absolutas, "contraindicacion"),
    renderSeccion("D. Contraindicaciones relativas y precauciones", grupos.precauciones, "precaucion"),
    renderSeccion("E. Duplicidades terapéuticas", grupos.duplicidades, "duplicidad"),
    renderSeccion("F. Efectos farmacodinámicos acumulativos", grupos.acumulativos, "acumulativo"),
    renderSeccion("G. Ajustes y monitorización", grupos.monitorizacion, "monitorizacion")
  ].join("");
}

function limpiar() {
  seleccionados.splice(0, seleccionados.length);
  renderSeleccionados();
  const salida = $("resultadoInteraccionesFarmaco");
  if (salida) salida.textContent = "Agrega dos o más medicamentos para iniciar la revisión.";
}

renderCatalogo();
renderSeleccionados();
$("agregarFarmaco")?.addEventListener("click", agregarMedicamento);
$("evaluarFarmacos")?.addEventListener("click", evaluar);
$("limpiarFarmacos")?.addEventListener("click", limpiar);
$("farmacoBuscador")?.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter") {
    evento.preventDefault();
    agregarMedicamento();
  }
});
