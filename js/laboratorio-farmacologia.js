import { MEDICAMENTOS } from "./data/medicamentos.js";
import { detectarInteraccionesFarmacologicas } from "./data/interaccionesFarmacologicas.js";
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
  MEDICAMENTOS.forEach((med) => {
    if (med.nombre) opciones.push(med.nombre);
    (med.presentaciones || []).forEach((presentacion) => opciones.push(`${med.nombre}, ${presentacion}.`));
  });
  return [...new Set(opciones)].sort((a, b) => a.localeCompare(b, "es"));
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
    antecedentes: comorbilidades,
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
  if (seleccionados.some((med) => textoNormalizado(med.medicamento) === textoNormalizado(nombre) && textoNormalizado(med.indicacion) === textoNormalizado(dosis))) {
    alert("Ese medicamento ya está en la simulación.");
    return;
  }
  seleccionados.push({ id: `farmaco-${Date.now()}-${seleccionados.length}`, medicamento: nombre, nombre, indicacion: dosis, texto: `${nombre} ${dosis}`.trim() });
  $("farmacoBuscador").value = "";
  $("farmacoDosis").value = "";
  renderSeleccionados();
  evaluar();
}

function severidadClase(severidad = "") {
  const texto = textoNormalizado(severidad);
  if (texto.includes("alta") || texto.includes("critica")) return "alta";
  if (texto.includes("relevante") || texto.includes("moderada")) return "relevante";
  return "precaucion";
}

function renderInteraccion(item, tipo = "interaccion") {
  return `
    <article class="interaccion-card ${severidadClase(item.severidad || item.nivel || "")}">
      <strong>${escapar(item.titulo || item.nombre || "Alerta clínica")}</strong>
      <p><b>Medicamentos:</b> ${escapar((item.medicamentos || []).join(" + ") || "No especificados")}</p>
      <p>${escapar(item.efecto || item.descripcion || "")}</p>
      ${item.recomendacion ? `<p><b>Recomendación:</b> ${escapar(item.recomendacion)}</p>` : ""}
      <small>${tipo === "interaccion" ? "Interacción medicamento-medicamento" : "Alerta por contexto clínico o riesgo acumulativo"}</small>
    </article>
  `;
}

function evaluar() {
  const salida = $("resultadoInteraccionesFarmaco");
  if (!salida) return;
  if (seleccionados.length < 2) {
    salida.textContent = "Agrega dos o más medicamentos para iniciar la revisión.";
    return;
  }
  const interacciones = detectarInteraccionesFarmacologicas(seleccionados);
  const evaluacion = evaluarMedicamentosPaciente({ paciente: pacienteSimulado(), medicamentos: seleccionados });
  const indicador = obtenerIndicadorSeguridadMedicamento(evaluacion.alertas || []);
  const bloques = [
    `<article class="interaccion-card ${severidadClase(indicador.clase || "")}"><strong>Resumen de seguridad: ${escapar(indicador.etiqueta || "Revisión sin alertas críticas")}</strong><p>Medicamentos revisados: ${seleccionados.length}.</p></article>`,
    ...interacciones.map((item) => renderInteraccion(item, "interaccion")),
    ...(evaluacion.alertas || []).map((item) => renderInteraccion(item, "alerta"))
  ];
  salida.innerHTML = bloques.length > 1 ? bloques.join("") : "<p>No se detectaron interacciones relevantes con la base local actual. Mantén revisión clínica y farmacológica habitual.</p>";
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
