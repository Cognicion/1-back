import { COBERTURA_FARMACOLOGICA, MEDICAMENTOS_MAESTROS, MEDICAMENTOS_PRESENTACIONES, medicamentoPorTexto } from "./data/catalogoFarmacologicoUnificado.js?v=20260904-parametros-colera-v2";
import { CIE10 } from "./data/catalogoDiagnosticos.js?v=20260904-parametros-colera-v2";
import {
  evaluarMedicamentosPaciente,
  normalizarMedicamentoClinico,
  obtenerIndicadorSeguridadMedicamento
} from "./services/motorClinicoMedicamentos.js?v=20260904-parametros-colera-v2";
import {
  construirRegistroParametrosClinicos,
  DEFINICIONES_PARAMETROS_CLINICOS,
  GRUPOS_PARAMETROS_CLINICOS,
  resolverParametrosClinicosPaciente
} from "./services/parametrosClinicosPaciente.js?v=20260904-parametros-colera-v2";

const seleccionados = [];
const MENUS_ACTIVOS = [];
const $ = (id) => document.getElementById(id);

function textoNormalizado(valor = "") {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function escapar(valor = "") {
  return String(valor || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textoVisible(valor = "") {
  return String(valor || "")
    .replace(/\u00c3\u00a1/g, "á").replace(/\u00c3\u00a9/g, "é").replace(/\u00c3\u00ad/g, "í").replace(/\u00c3\u00b3/g, "ó").replace(/\u00c3\u00ba/g, "ú")
    .replace(/\u00c3\u0081/g, "Á").replace(/\u00c3\u0089/g, "É").replace(/\u00c3\u008d/g, "Í").replace(/\u00c3\u0093/g, "Ó").replace(/\u00c3\u009a/g, "Ú")
    .replace(/\u00c3\u00b1/g, "ñ").replace(/\u00c3\u0091/g, "Ñ").replace(/\u00c3\u00bc/g, "ü").replace(/\u00c3\u009c/g, "Ü")
    .replace(/\u00c2\u00b7/g, "·").replace(/\u00c2\u00b2/g, "²")
    .replace(/\u00e2\u0080\u0093/g, "–").replace(/\u00e2\u0080\u0094/g, "—")
    .replace(/\u00e2\u0080\u009c/g, "“").replace(/\u00e2\u0080\u009d/g, "”").replace(/\u00e2\u0080\u0099/g, "’");
}

function idCampoParametro(parametroId, campo) {
  return `farmacoParametro-${parametroId}-${campo}`;
}

function renderParametrosClinicos() {
  const contenedor = $("farmacoParametrosClinicos");
  if (!contenedor) return;

  contenedor.innerHTML = GRUPOS_PARAMETROS_CLINICOS.map((grupo) => {
    const definiciones = DEFINICIONES_PARAMETROS_CLINICOS.filter((definicion) => definicion.grupo === grupo.id);
    const notaDerivados = grupo.id === "proteinasSericas"
      ? '<p class="parametros-grupo-nota">Si no se registra globulinas, puede calcularse como proteínas totales − albúmina. La relación A/G también se muestra como derivada y nunca sustituye al resultado del laboratorio.</p>'
      : "";
    return `
      <fieldset class="parametros-grupo" data-parametros-grupo="${escapar(grupo.id)}">
        <legend>${escapar(grupo.etiqueta)}</legend>
        <p>${escapar(grupo.descripcion)}</p>
        <div class="parametros-campos">
          ${definiciones.map((definicion) => `
            <article class="parametro-campo" data-parametro-card="${escapar(definicion.id)}">
              <header>
                <strong>${escapar(definicion.etiqueta)}</strong>
                <small>${escapar(definicion.muestra || "Muestra no especificada")}</small>
              </header>
              <div class="parametro-campo-grid">
                <label>
                  Valor
                  <input
                    id="${escapar(idCampoParametro(definicion.id, "valor"))}"
                    data-parametro-id="${escapar(definicion.id)}"
                    data-parametro-campo="valor"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="Resultado"
                    aria-label="Valor de ${escapar(definicion.etiqueta)}">
                </label>
                <label>
                  Unidad
                  <select
                    id="${escapar(idCampoParametro(definicion.id, "unidad"))}"
                    data-parametro-id="${escapar(definicion.id)}"
                    data-parametro-campo="unidad"
                    aria-label="Unidad de ${escapar(definicion.etiqueta)}">
                    ${(definicion.unidades || [definicion.unidad]).map((unidad) => `<option value="${escapar(unidad)}"${unidad === definicion.unidad ? " selected" : ""}>${escapar(unidad)}</option>`).join("")}
                  </select>
                </label>
                <label class="parametro-rango">
                  Intervalo del laboratorio
                  <input
                    id="${escapar(idCampoParametro(definicion.id, "rango"))}"
                    data-parametro-id="${escapar(definicion.id)}"
                    data-parametro-campo="rangoReferencia"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="Mínimo–máximo, &lt; o &gt;"
                    aria-label="Intervalo de referencia informado para ${escapar(definicion.etiqueta)}">
                </label>
              </div>
            </article>
          `).join("")}
        </div>
        ${notaDerivados}
      </fieldset>
    `;
  }).join("");

  contenedor.addEventListener("input", actualizarResumenParametros);
  contenedor.addEventListener("change", () => {
    actualizarResumenParametros();
    if (seleccionados.length) evaluar();
  });
}

function parametrosClinicosDesdeFormulario() {
  const fecha = $("farmacoParametrosFecha")?.value || "";
  const valores = {};
  DEFINICIONES_PARAMETROS_CLINICOS.forEach((definicion) => {
    const valor = $(idCampoParametro(definicion.id, "valor"))?.value?.trim() || "";
    if (!valor) return;
    valores[definicion.id] = {
      valor,
      unidad: $(idCampoParametro(definicion.id, "unidad"))?.value || definicion.unidad,
      rangoReferencia: $(idCampoParametro(definicion.id, "rango"))?.value?.trim() || "",
      fecha,
      origen: "captura_manual_simulacion",
      procedencia: "laboratorio_farmacologia",
      muestra: definicion.muestra,
      estadoResultado: "final",
      derivado: false
    };
  });
  return construirRegistroParametrosClinicos(valores, {
    fecha,
    origen: "captura_manual_simulacion",
    procedencia: "laboratorio_farmacologia"
  });
}

function resolverParametrosFormulario() {
  const parametrosClinicos = parametrosClinicosDesdeFormulario();
  return {
    parametrosClinicos,
    resueltos: resolverParametrosClinicosPaciente({ parametrosClinicos })
  };
}

function etiquetaEstadoParametro(estado = "") {
  return {
    bajo: "Por debajo del intervalo registrado",
    alto: "Por encima del intervalo registrado",
    en_rango_registrado: "Dentro del intervalo registrado",
    dato_inconsistente: "Dato inconsistente"
  }[estado] || "Sin clasificación: falta un intervalo interpretable";
}

function claseEstadoParametro(estado = "") {
  if (estado === "alto" || estado === "bajo" || estado === "dato_inconsistente") return "fuera-rango";
  if (estado === "en_rango_registrado") return "en-rango";
  return "sin-rango";
}

function textoParametro(registro = {}) {
  const valor = registro.valor ?? "";
  const unidad = registro.unidad ? ` ${registro.unidad}` : "";
  const rango = registro.rangoReferencia ? ` · intervalo: ${registro.rangoReferencia}` : "";
  return `${registro.etiqueta || registro.analito || registro.id}: ${valor}${unidad}${rango}`;
}

function plantillaParametrosResueltos(parametros = {}, { mostrarVacio = true } = {}) {
  const registros = parametros.lista || [];
  const derivados = Object.values(parametros.derivados || {});
  const categorias = parametros.categorias || {};
  if (!registros.length && !derivados.length) {
    return mostrarVacio
      ? '<p class="parametros-vacio">Sin parámetros capturados. El motor no inferirá resultados ausentes.</p>'
      : "";
  }

  const clasificacionKdigo = [
    categorias.eGFR ? `eGFR ${categorias.eGFR.id}: ${categorias.eGFR.etiqueta}` : "",
    categorias.uacr ? `UACR ${categorias.uacr.id}: ${categorias.uacr.etiqueta}` : ""
  ].filter(Boolean);

  return `
    <div class="parametros-resueltos-lista">
      ${registros.map((registro) => `
        <article class="parametro-resultado ${claseEstadoParametro(registro.estado)}">
          <strong>${escapar(registro.etiqueta)}</strong>
          <p>${escapar(`${registro.valor}${registro.unidad ? ` ${registro.unidad}` : ""}`)}</p>
          <small>${escapar(etiquetaEstadoParametro(registro.estado))}${registro.rangoReferencia ? ` · Intervalo: ${escapar(registro.rangoReferencia)}` : ""}</small>
        </article>
      `).join("")}
      ${derivados.map((registro) => `
        <article class="parametro-resultado derivado">
          <strong>${escapar(registro.etiqueta)} <span>Derivado</span></strong>
          <p>${escapar(`${registro.valor}${registro.unidad ? ` ${registro.unidad}` : ""}`)}</p>
          <small>${escapar(registro.formula)} · Cálculo, no medición directa</small>
        </article>
      `).join("")}
    </div>
    ${clasificacionKdigo.length ? `<p class="parametros-kdigo"><b>Categorías KDIGO:</b> ${escapar(clasificacionKdigo.join(" · "))}. Una medición aislada no establece por sí sola enfermedad renal crónica.</p>` : ""}
    ${(parametros.hallazgos || []).some((hallazgo) => ["dato_inconsistente", "dato_no_comparable", "dato_no_clasificable"].includes(hallazgo.estado)) ? `
      <div class="parametros-inconsistencias" role="alert">
        ${(parametros.hallazgos || []).filter((hallazgo) => ["dato_inconsistente", "dato_no_comparable", "dato_no_clasificable"].includes(hallazgo.estado)).map((hallazgo) => `<p><b>${escapar(hallazgo.titulo)}</b>${hallazgo.recomendacion ? ` · ${escapar(hallazgo.recomendacion)}` : ""}</p>`).join("")}
      </div>
    ` : ""}
  `;
}

function actualizarResumenParametros() {
  const salida = $("farmacoParametrosResumen");
  if (!salida) return;
  const { resueltos } = resolverParametrosFormulario();
  salida.innerHTML = plantillaParametrosResueltos(resueltos);
}

function limpiarParametrosClinicos() {
  document.querySelectorAll("#farmacoParametrosClinicos [data-parametro-campo]").forEach((campo) => {
    if (campo.dataset.parametroCampo === "unidad") {
      const definicion = DEFINICIONES_PARAMETROS_CLINICOS.find((item) => item.id === campo.dataset.parametroId);
      campo.value = definicion?.unidad || campo.options?.[0]?.value || "";
    } else {
      campo.value = "";
    }
  });
  if ($("farmacoParametrosFecha")) $("farmacoParametrosFecha").value = "";
  actualizarResumenParametros();
  if (seleccionados.length) evaluar();
}

function opcionesMedicamentos() {
  const opciones = [];
  MEDICAMENTOS_MAESTROS.forEach((med) => {
    if (med.nombre) opciones.push(textoVisible(med.nombre));
    if (med.genericName && med.genericName !== med.nombre) opciones.push(textoVisible(med.genericName));
    (med.brandNames || []).forEach((marca) => opciones.push(textoVisible(`${marca} (${med.nombre})`)));
    (med.synonyms || []).forEach((sinonimo) => opciones.push(textoVisible(sinonimo)));
  });
  MEDICAMENTOS_PRESENTACIONES.forEach((med) => {
    if (med.texto) opciones.push(textoVisible(med.texto));
    else if (med.nombre && med.presentacion) opciones.push(textoVisible(`${med.nombre}, ${med.presentacion}.`));
  });
  return [...new Set(opciones.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function opcionesCie10() {
  return CIE10
    .filter((dx) => dx.codigo && dx.nombre)
    .map((dx) => ({
      valor: textoVisible(`${dx.codigo} - ${dx.nombre}`),
      busqueda: textoNormalizado(`${dx.codigo} ${dx.nombre} ${(dx.aliases || []).join(" ")}`)
    }))
    .sort((a, b) => a.valor.localeCompare(b.valor, "es"));
}

function opcionesAlergiasMedicamentos() {
  const opciones = [];
  MEDICAMENTOS_MAESTROS.forEach((med) => {
    if (med.nombre) opciones.push(textoVisible(med.nombre));
    (med.brandNames || []).forEach((marca) => opciones.push(textoVisible(`${marca} (${med.nombre})`)));
    (med.synonyms || []).forEach((sinonimo) => opciones.push(textoVisible(sinonimo)));
    if (med.clase) opciones.push(textoVisible(med.clase));
  });
  ["AINE", "Penicilina", "Cefalosporina", "Sulfas", "Macrólidos", "Látex", "Contraste yodado"].forEach((opcion) => opciones.push(opcion));
  return [...new Set(opciones.filter(Boolean))]
    .map((valor) => ({ valor, busqueda: textoNormalizado(valor) }))
    .sort((a, b) => a.valor.localeCompare(b.valor, "es"));
}

function cerrarMenus(excepto = null) {
  MENUS_ACTIVOS.forEach((menu) => {
    if (menu !== excepto) menu.hidden = true;
  });
}

function insertarValorEnCampo(campo, valor, modo = "reemplazar") {
  if (!campo) return;
  if (modo === "agregar") {
    const actual = campo.value.trim();
    campo.value = actual ? `${actual}, ${valor}` : valor;
  } else {
    campo.value = valor;
  }
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

function configurarMenuBuscable({ campoId, menuId, opciones, modo = "reemplazar", max = 18 }) {
  const campo = $(campoId);
  const menu = $(menuId);
  if (!campo || !menu) return;
  MENUS_ACTIVOS.push(menu);

  const render = () => {
    const termino = textoNormalizado(campo.value.split(",").pop() || campo.value);
    const resultados = opciones
      .filter((opcion) => !termino || opcion.busqueda.includes(termino))
      .slice(0, max);
    menu.innerHTML = resultados.length
      ? resultados.map((opcion) => `<button type="button" data-valor="${escapar(opcion.valor)}">${escapar(opcion.valor)}</button>`).join("")
      : `<p>No se encontraron coincidencias.</p>`;
    menu.hidden = false;
  };

  campo.addEventListener("focus", () => {
    cerrarMenus(menu);
    render();
  });
  campo.addEventListener("input", render);
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") menu.hidden = true;
    if (evento.key === "Enter" && !menu.hidden) {
      const primero = menu.querySelector("[data-valor]");
      if (primero) {
        evento.preventDefault();
        insertarValorEnCampo(campo, primero.dataset.valor, modo);
        menu.hidden = true;
      }
    }
  });
  menu.addEventListener("pointerdown", (evento) => {
    const boton = evento.target.closest("[data-valor]");
    if (!boton) return;
    evento.preventDefault();
    insertarValorEnCampo(campo, boton.dataset.valor, modo);
    menu.hidden = true;
    campo.focus();
  });
}

function pacienteSimulado() {
  const comorbilidades = $("farmacoComorbilidades")?.value || "";
  const { parametrosClinicos } = resolverParametrosFormulario();
  return {
    edad: $("farmacoEdad")?.value || "",
    sexo: $("farmacoSexo")?.value || "",
    alergias: $("farmacoAlergias")?.value || "",
    comorbilidades,
    diagnosticos: comorbilidades,
    antecedentes: comorbilidades,
    antecedentesMedicos: comorbilidades,
    observaciones: comorbilidades,
    parametrosClinicos
  };
}

function renderCatalogo() {
  const medicamentos = opcionesMedicamentos().map((valor) => ({ valor, busqueda: textoNormalizado(valor) }));
  configurarMenuBuscable({
    campoId: "farmacoBuscador",
    menuId: "farmacoCatalogoMenu",
    opciones: medicamentos,
    modo: "reemplazar"
  });
  configurarMenuBuscable({
    campoId: "farmacoAlergias",
    menuId: "farmacoAlergiasMenu",
    opciones: opcionesAlergiasMedicamentos(),
    modo: "agregar"
  });
  configurarMenuBuscable({
    campoId: "farmacoComorbilidades",
    menuId: "farmacoComorbilidadesMenu",
    opciones: opcionesCie10(),
    modo: "agregar",
    max: 24
  });
}

function claveFarmacoSeleccionado(med) {
  const normalizado = normalizarMedicamentoClinico(med);
  const principio = normalizado.ingredienteIds?.length
    ? normalizado.ingredienteIds.slice().sort().join("+")
    : textoNormalizado(med.medicamento || med.nombre || med.texto || "");
  return [
    principio,
    textoNormalizado(med.indicacion || med.dosis || ""),
    textoNormalizado(med.via || ""),
    textoNormalizado(med.frecuencia || "")
  ].join("|");
}

function normalizarSeleccionados() {
  const vistos = new Set();
  const unicos = [];
  seleccionados.forEach((med) => {
    const clave = claveFarmacoSeleccionado(med);
    if (vistos.has(clave)) return;
    vistos.add(clave);
    unicos.push(med);
  });
  if (unicos.length !== seleccionados.length) {
    seleccionados.splice(0, seleccionados.length, ...unicos);
  }
  return unicos;
}

function renderSeleccionados() {
  const contenedor = $("farmacosSeleccionados");
  if (!contenedor) return;
  const lista = normalizarSeleccionados();
  contenedor.innerHTML = lista.length
    ? lista.map((med, index) => `
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
  const nuevo = {
    id: `farmaco-${Date.now()}-${seleccionados.length}`,
    medicamento: nombre,
    nombre,
    indicacion: dosis,
    texto: `${nombre} ${dosis}`.trim()
  };
  const claveNuevo = claveFarmacoSeleccionado(nuevo);
  if (normalizarSeleccionados().some((med) => claveFarmacoSeleccionado(med) === claveNuevo)) {
    alert("Ese medicamento con la misma prescripción ya está en la simulación.");
    return;
  }
  seleccionados.push(nuevo);
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

function claseIndicadorSeguridad(indicador = {}) {
  if (indicador.estado === "datos_insuficientes") return "incompleta";
  return severidadClase(indicador.clase || indicador.estado || "");
}

function brechasCobertura(cobertura = {}) {
  return [
    Number(cobertura.fuentePendiente || 0) > 0 ? `${cobertura.fuentePendiente} medicamento(s) con fuente pendiente` : "",
    Number(cobertura.sinReglaIngrediente || 0) > 0 ? `${cobertura.sinReglaIngrediente} ingrediente(s) sin reglas cargadas` : "",
    Number(cobertura.fuentesContextoNoDisponibles || 0) > 0 ? `No se pudieron leer: ${(cobertura.detalleFuentesContextoNoDisponibles || []).join(", ")}` : "",
    Number(cobertura.paresMedicamentoMedicamentoSinRegla || 0) > 0 ? `${cobertura.paresMedicamentoMedicamentoSinRegla} par(es) medicamento-medicamento sin regla` : "",
    Number(cobertura.paresMedicamentoDiagnosticoSinRegla || 0) > 0 ? `${cobertura.paresMedicamentoDiagnosticoSinRegla} par(es) medicamento-diagnóstico sin regla` : "",
    Number(cobertura.paresMedicamentoParametroSinRegla || 0) > 0 ? `${cobertura.paresMedicamentoParametroSinRegla} par(es) medicamento-parámetro sin regla (${Number(cobertura.parametrosClinicosRelevantes || 0)} parámetro(s) clínicamente relevante(s))` : "",
    Number(cobertura.cantidadParametrosEsperadosAusentes || 0) > 0
      ? `${cobertura.cantidadParametrosEsperadosAusentes} parámetro(s) de vigilancia esperado(s) sin dato: ${(cobertura.parametrosEsperadosAusentes || []).map((item) => `${item.medicamento}: ${item.etiqueta}`).join(", ")}`
      : "",
    Number(cobertura.hallazgosParametrosNoInterpretables || 0) > 0 ? `${cobertura.hallazgosParametrosNoInterpretables} hallazgo(s) de parámetros no interpretable(s)` : "",
    Number(cobertura.diagnosticosSinCategoriaFarmacologica || 0) > 0 ? `${cobertura.diagnosticosSinCategoriaFarmacologica} diagnóstico(s) sin categoría farmacológica` : ""
  ].filter(Boolean);
}

function renderCoberturaIncompleta(cobertura = {}) {
  const brechas = brechasCobertura(cobertura);
  if (!brechas.length) return "";
  return `
    <article class="farmaco-cobertura-incompleta" role="status">
      <strong>Cobertura clínica incompleta</strong>
      <p>${escapar(brechas.join("; "))}.</p>
      <p>La ausencia de una alerta no equivale a ausencia de riesgo para los pares sin regla o con fuente pendiente.</p>
    </article>
  `;
}

function renderAlerta(item, tipo = "alerta") {
  const etiquetaTipo = {
    interaccion: "Interacción medicamento-medicamento",
    diagnostico: "Alerta medicamento-diagnóstico",
    contraindicacion: "Contraindicación absoluta",
    precaucion: "Precaución clínica",
    duplicidad: "Duplicidad terapéutica",
    acumulativo: "Efecto farmacodinámico acumulativo",
    parametro: "Alerta medicamento-parámetro clínico",
    monitorizacion: "Ajuste o monitorización",
    dato_faltante: "Dato clínico faltante"
  }[tipo] || "Alerta clínica";

  return `
    <article class="interaccion-card ${severidadClase(item.severidad || item.nivel || "")}">
      <strong>${escapar(item.titulo || item.nombre || "Alerta clínica")}</strong>
      <p><b>Medicamentos:</b> ${escapar((item.medicamentos || []).join(" + ") || "No especificados")}</p>
      ${item.presentacionesOriginales?.length ? `<p><b>Prescripciones originales:</b> ${escapar(item.presentacionesOriginales.join(" + "))}</p>` : ""}
      ${item.diagnosticos?.length ? `<p><b>Diagnóstico/comorbilidad:</b> ${escapar(item.diagnosticos.join(", "))}</p>` : ""}
      ${item.mecanismo ? `<p><b>Mecanismo:</b> ${escapar(textoVisible(item.mecanismo))}</p>` : ""}
      <p>${escapar(item.efecto || item.descripcion || "")}</p>
      ${item.recomendacion ? `<p><b>Recomendación:</b> ${escapar(item.recomendacion)}</p>` : ""}
      ${item.datosParametros?.length ? `<p><b>Parámetros relacionados:</b> ${escapar(item.datosParametros.map(textoParametro).join("; "))}</p>` : ""}
      ${item.parametrosVigilancia?.length ? `<p><b>Vigilar:</b> ${escapar(item.parametrosVigilancia.join(", "))}</p>` : ""}
      ${item.fuentes?.length ? `<small>Fuente local: ${escapar(item.fuentes.join("; "))}</small>` : ""}
      <small>${escapar(etiquetaTipo)} · Severidad: ${escapar(item.severidad || "no especificada")} · Evidencia: ${escapar(textoVisible(item.evidencia || "no especificada"))} · Confianza: ${escapar(textoVisible(item.confianza || "no especificada"))}</small>
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
    parametros: [],
    monitorizacion: []
  };

  alertas.forEach((alerta) => {
    if (alerta.tipo === "precaucion_parametro_clinico" || alerta.tipo === "precaucion_funcion_renal" || alerta.datosParametros?.length) grupos.parametros.push(alerta);
    else if (alerta.tipo === "duplicidad_terapeutica") grupos.duplicidades.push(alerta);
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
  const fichaBase = medicamentoPorTexto(medEvaluado.textoOriginal || medEvaluado.nombre || medEvaluado.medicamento || "");
  const ficha = fichaBase || null;
  if (!ficha) {
    return `<li>${escapar(medEvaluado.textoOriginal || "Medicamento no identificado en catálogo maestro")}</li>`;
  }
  const valor = (texto) => escapar(textoVisible(texto || ""));
  const unir = (...listas) => [...new Set(listas.flat().filter(Boolean))];
  const lista = (titulo, valores = []) => {
    const items = (valores || []).filter(Boolean).slice(0, 4);
    return items.length ? `<p class="farmaco-ficha-linea"><span class="farmaco-ficha-categoria">${valor(titulo)}:</span> ${valor(items.join("; "))}</p>` : "";
  };
  const campo = (titulo, contenido) => contenido
    ? `<p class="farmaco-ficha-linea"><span class="farmaco-ficha-categoria">${valor(titulo)}:</span> ${valor(contenido)}</p>`
    : "";
  const enlaceFuente = (fuente = {}) => {
    const url = String(fuente.url || "");
    const titulo = fuente.titulo || fuente.organismo || "Fuente regulatoria";
    if (!/^https:\/\//i.test(url)) return escapar(titulo);
    return `<a href="${escapar(url)}" target="_blank" rel="noopener noreferrer">${escapar(titulo)}</a>`;
  };
  const advertenciasConFuente = (ficha.warningDetails || []).slice(0, 4).map((advertencia) => {
    const fuentes = (advertencia.fuentes || []).map(enlaceFuente).join("; ");
    return `<p class="farmaco-ficha-linea"><span class="farmaco-ficha-categoria">${valor(advertencia.titulo || "Advertencia") }:</span> ${valor(advertencia.texto || "")} ${fuentes ? `<small>Fuente: ${fuentes}</small>` : ""}</p>`;
  }).join("");
  const fuentesRegulatorias = (ficha.regulatorySources || []).slice(0, 2).map((fuente) => `<li>${enlaceFuente(fuente)}${fuente.alcance ? `: ${valor(fuente.alcance)}` : ""}</li>`).join("");
  const farmacocinetica = unir([
    ficha.vidaMedia ? `Vida media: ${ficha.vidaMedia}` : "",
    ficha.inicioAccion ? `Inicio: ${ficha.inicioAccion}` : "",
    ficha.duracionAccion ? `Duración: ${ficha.duracionAccion}` : "",
    ficha.metabolismo ? `Metabolismo: ${ficha.metabolismo}` : "",
    ficha.eliminacion ? `Eliminación: ${ficha.eliminacion}` : "",
    ficha.ajusteRenal ? `Ajuste renal: ${ficha.ajusteRenal}` : "",
    ficha.ajusteHepatico ? `Ajuste hepático: ${ficha.ajusteHepatico}` : ""
  ]);
  const vigilancia = unir(ficha.monitoring || ficha.monitorizacion || [], ficha.parametrosVigilancia || []);
  const presentacionesDetectadas = unir(medEvaluado.prescripcionesRelacionadas || [], medEvaluado.textoOriginal ? [medEvaluado.textoOriginal] : []);
  const presentacionesFicha = unir(
    ficha.farmacologia?.presentaciones?.map((item) => [item.formaFarmaceutica, item.concentracion, item.unidad, item.via].filter(Boolean).join(" ")) || [],
    ficha.presentaciones?.map((item) => item.texto || item) || []
  );
  if (ficha.estadoFuente !== "verificada_local") {
    return `
      <li>
        <strong>${valor(ficha.nombre)}</strong>
        <small>${valor(ficha.clase || "Medicamento")}</small>
        ${lista("Presentaciones detectadas", presentacionesDetectadas)}
        ${advertenciasConFuente}
        ${fuentesRegulatorias ? `<p class="farmaco-ficha-linea"><span class="farmaco-ficha-categoria">Fuentes regulatorias:</span></p><ul>${fuentesRegulatorias}</ul>` : ""}
        ${campo("Estado de evidencia", ficha.confianza || "fuente pendiente")}
        ${campo("Propiedades clínicas restantes", "fuente pendiente de extracción y revisión por molécula")}
      </li>
    `;
  }
  return `
    <li>
      <strong>${valor(ficha.nombre)}</strong>
      <small>${valor(ficha.clase || "Medicamento")}</small>
      ${lista("Presentaciones detectadas", presentacionesDetectadas)}
      ${lista("Presentaciones de referencia", presentacionesFicha)}
      ${ficha.brandNames?.length ? campo("Marcas", ficha.brandNames.slice(0, 6).join(", ")) : ""}
      ${campo("Dosis habitual", ficha.dosisHabitual)}
      ${campo("Rango de dosis", ficha.rangoDosis)}
      ${campo("Mecanismo", ficha.mecanismoAccion)}
      ${farmacocinetica.length ? lista("Farmacocinética", farmacocinetica) : campo("Vida media", ficha.vidaMedia)}
      ${lista("Indicaciones", ficha.indicaciones || ficha.indications)}
      ${lista("Contraindicaciones", ficha.contraindicaciones || ficha.contraindications)}
      ${lista("Contraindicaciones relativas", ficha.contraindicacionesRelativas)}
      ${lista("Precaución", ficha.precauciones || ficha.precautions)}
      ${advertenciasConFuente}
      ${lista("Efectos adversos", ficha.efectosAdversos)}
      ${lista("Vigilancia sugerida", vigilancia)}
      ${lista("Laboratorios sugeridos", ficha.parametrosLaboratorio)}
      ${campo("Fuente", `${ficha.fuente}; ${ficha.paginaSeccion}`)}
      ${campo("Confianza", ficha.confianza)}
    </li>
  `;
}

function datosFaltantes(paciente, evaluacion) {
  const faltantes = [];
  const textosDx = evaluacion.textosDiagnosticosEvaluados || [];
  if (!textosDx.length) faltantes.push("Diagnósticos o comorbilidades registradas");

  const textoAlertas = (evaluacion.alertas || []).map((alerta) => `${alerta.titulo} ${alerta.efecto} ${alerta.recomendacion}`).join(" ");
  const parametros = evaluacion.parametrosClinicos || resolverParametrosClinicosPaciente(paciente);
  if (/renal|creatinina|eGFR|filtrado/i.test(textoAlertas) && !parametros.porId?.eGFR && !parametros.porId?.creatinina) {
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
  const diagnosticosEvaluados = evaluacion.diagnosticosEvaluados || [];
  const diagnosticosActivos = evaluacion.diagnosticosActivos || [];
  const diagnosticosProbables = evaluacion.diagnosticosProbables || [];
  const medicamentosEvaluados = evaluacion.medicamentosNormalizados || [];
  const medicamentosUnicos = evaluacion.principiosActivosNormalizados || medicamentosEvaluados;
  const parametros = evaluacion.parametrosClinicos || resolverParametrosClinicosPaciente(paciente);

  return `
    <article class="farmaco-resumen ${claseIndicadorSeguridad(indicador)}">
      <div>
        <strong>Resumen de seguridad: ${escapar(indicador.etiqueta || "Resultado no disponible")}</strong>
        ${indicador.estado === "datos_insuficientes" ? "<p><b>Datos insuficientes:</b> existen selecciones cuya evidencia o regla local no está cargada.</p>" : ""}
        <p>Catálogo activo: ${MEDICAMENTOS_MAESTROS.length} medicamentos y ${MEDICAMENTOS_PRESENTACIONES.length} presentaciones. Fuente verificada: ${COBERTURA_FARMACOLOGICA.conFuenteVerificada}; fuente regulatoria parcial: ${COBERTURA_FARMACOLOGICA.fuenteRegulatoriaParcial}; fuente pendiente: ${COBERTURA_FARMACOLOGICA.fuentePendienteEstricta}; fichas completas frente al esquema mínimo: ${COBERTURA_FARMACOLOGICA.datosCompletos}.</p>
      </div>
      <dl>
        <div><dt>Principios activos únicos</dt><dd>${medicamentosUnicos.length}</dd></div>
        <div><dt>Diagnósticos activos revisados</dt><dd>${diagnosticosActivos.length || diagnosticos.length}</dd></div>
        <div><dt>Diagnósticos probables/diferenciales</dt><dd>${diagnosticosProbables.length}</dd></div>
        <div><dt>Interacciones</dt><dd>${grupos.interacciones.length}</dd></div>
        <div><dt>Alertas diagnóstico</dt><dd>${grupos.diagnosticos.length}</dd></div>
        <div><dt>Contraindicaciones absolutas</dt><dd>${grupos.absolutas.length}</dd></div>
        <div><dt>Alertas por parámetros</dt><dd>${grupos.parametros.length}</dd></div>
        <div><dt>Parámetros analizados</dt><dd>${parametros.lista?.length || 0}</dd></div>
        <div><dt>Datos faltantes</dt><dd>${faltantes.length}</dd></div>
      </dl>
    </article>
    <details class="farmaco-details">
      <summary>Cómo se calculan las cargas acumulativas</summary>
      <p>${escapar(evaluacion.metodologiaCargas || "Dato insuficiente")}</p>
    </details>
    <details class="farmaco-details" open>
      <summary>Medicamentos evaluados</summary>
      <ul>${medicamentosEvaluados.map(renderFichaMedicamento).join("") || "<li>Sin medicamentos evaluados.</li>"}</ul>
    </details>
    <details class="farmaco-details">
      <summary>Diagnósticos y comorbilidades considerados</summary>
      ${diagnosticosEvaluados.length
        ? `<ul>${diagnosticosEvaluados.map((dx) => `<li>${escapar(dx.texto || dx.nombre)}${dx.codigo ? ` · ${escapar(dx.codigo)}` : ""}${dx.estado ? ` · ${escapar(dx.estado)}` : ""}${dx.origen ? ` · ${escapar(dx.origen)}` : ""}</li>`).join("")}</ul>`
        : `<p>No hay diagnósticos o comorbilidades disponibles para evaluar contraindicaciones y precauciones. El análisis actual solo incluye los medicamentos registrados.</p>`}
      ${diagnosticos.length ? `<p><b>Coincidencias clínicas activas:</b> ${escapar(diagnosticos.map((dx) => dx.nombre).join(", "))}</p>` : ""}
    </details>
    <details class="farmaco-details" open>
      <summary>Parámetros clínicos analizados · ${parametros.lista?.length || 0}</summary>
      ${plantillaParametrosResueltos(parametros)}
    </details>
    ${faltantes.length ? `<article class="interaccion-card precaucion"><strong>Evaluación incompleta por falta de datos</strong><p>${escapar(faltantes.join(", "))}</p><p>No se debe interpretar la ausencia de alertas como uso seguro si faltan datos clínicos.</p></article>` : ""}
  `;
}

function evaluar() {
  const salida = $("resultadoInteraccionesFarmaco");
  if (!salida) return;
  const lista = normalizarSeleccionados();
  if (lista.length < 1) {
    salida.textContent = "Agrega al menos un medicamento para iniciar la revisión.";
    return;
  }
  const paciente = pacienteSimulado();
  const evaluacion = evaluarMedicamentosPaciente({ paciente, medicamentos: lista });
  const indicador = obtenerIndicadorSeguridadMedicamento(evaluacion.alertas || [], evaluacion.cobertura || {});
  const grupos = clasificarAlertas(evaluacion.alertas || []);
  const vacio = brechasCobertura(evaluacion.cobertura).length
    ? "Sin regla cargada para parte de la selección; fuente pendiente o dato insuficiente."
    : "Sin alerta encontrada con la base actual.";
  salida.innerHTML = [
    renderResumen(evaluacion, indicador, paciente),
    renderCoberturaIncompleta(evaluacion.cobertura),
    renderSeccion("A. Interacciones medicamento-medicamento", grupos.interacciones, "interaccion", vacio),
    renderSeccion("B. Alertas medicamento-diagnóstico", grupos.diagnosticos, "diagnostico", vacio),
    renderSeccion("C. Contraindicaciones absolutas", grupos.absolutas, "contraindicacion", vacio),
    renderSeccion("D. Contraindicaciones relativas y precauciones", grupos.precauciones, "precaucion", vacio),
    renderSeccion("E. Duplicidades terapéuticas", grupos.duplicidades, "duplicidad", vacio),
    renderSeccion("F. Cargas acumulativas", grupos.acumulativos, "acumulativo", vacio),
    renderSeccion("G. Alertas medicamento-parámetro clínico", grupos.parametros, "parametro", vacio),
    renderSeccion("H. Ajustes y monitorización", grupos.monitorizacion, "monitorizacion", vacio)
  ].join("");
}

function limpiar() {
  seleccionados.splice(0, seleccionados.length);
  renderSeleccionados();
  const salida = $("resultadoInteraccionesFarmaco");
  if (salida) salida.textContent = "Agrega al menos un medicamento para iniciar la revisión.";
}

renderCatalogo();
renderSeleccionados();
renderParametrosClinicos();
actualizarResumenParametros();
$("agregarFarmaco")?.addEventListener("click", agregarMedicamento);
$("evaluarFarmacos")?.addEventListener("click", evaluar);
$("limpiarFarmacos")?.addEventListener("click", limpiar);
$("limpiarParametrosFarmaco")?.addEventListener("click", limpiarParametrosClinicos);
$("farmacoParametrosFecha")?.addEventListener("change", () => {
  actualizarResumenParametros();
  if (seleccionados.length) evaluar();
});
$("farmacoBuscador")?.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !$("farmacoCatalogoMenu")?.hidden) return;
  if (evento.key === "Enter") {
    evento.preventDefault();
    agregarMedicamento();
  }
});
document.addEventListener("pointerdown", (evento) => {
  if (!evento.target.closest(".farmaco-search-field")) cerrarMenus();
});
