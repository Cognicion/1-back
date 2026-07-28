import {
  CATALOGO_SUSTANCIAS,
  CATEGORIAS_SUSTANCIAS,
  CATEGORIAS_SUSTANCIAS_POR_ID,
  SUSTANCIAS_POR_ID
} from "../data/catalogoSustancias.js";

const OTRA_SUSTANCIA_ID = "otra-sustancia";

function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[caracter]));
}

function normalizarTexto(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function fechaValida(valor) {
  if (!valor) return true;
  const fecha = new Date(`${valor}T00:00:00`);
  return !Number.isNaN(fecha.getTime());
}

function registroVacio() {
  return {
    sustanciaId: "",
    nombrePersonalizado: "",
    inicioConsumo: { fecha: "", edad: null, textoAproximado: "" },
    ultimoConsumo: { fecha: "", consumoActual: false, textoAproximado: "" },
    descripcion: ""
  };
}

function normalizarRegistro(registro = {}) {
  const base = registroVacio();
  const inicio = registro.inicioConsumo || {};
  const ultimo = registro.ultimoConsumo || {};
  const edad = registro.inicioConsumo?.edad;
  return {
    ...base,
    ...registro,
    sustanciaId: String(registro.sustanciaId || "").trim(),
    nombrePersonalizado: String(registro.nombrePersonalizado || ""),
    inicioConsumo: {
      ...base.inicioConsumo,
      ...inicio,
      edad: edad === "" || edad === null || edad === undefined ? null : Number(edad)
    },
    ultimoConsumo: {
      ...base.ultimoConsumo,
      ...ultimo,
      consumoActual: ultimo.consumoActual === true
    },
    descripcion: String(registro.descripcion || "")
  };
}

function normalizarSustancias(valor = {}, legado = {}) {
  const objeto = valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
  const seleccionadas = Array.isArray(objeto.seleccionadas) ? objeto.seleccionadas : [];
  const porId = new Map();
  seleccionadas.forEach((registro) => {
    const normalizado = normalizarRegistro(registro);
    if (SUSTANCIAS_POR_ID[normalizado.sustanciaId] && !porId.has(normalizado.sustanciaId)) {
      porId.set(normalizado.sustanciaId, normalizado);
    }
  });
  const observaciones = objeto.observacionesGenerales || (typeof valor === "string" ? valor : "") || legado.consumoSustancias || "";
  return { seleccionadas: [...porId.values()], observacionesGenerales: String(observaciones) };
}

function resumenInicio(registro) {
  return registro.inicioConsumo.edad !== null && Number.isFinite(registro.inicioConsumo.edad)
    ? `${registro.inicioConsumo.edad} años`
    : registro.inicioConsumo.fecha || registro.inicioConsumo.textoAproximado || "Sin dato";
}

function resumenUltimo(registro) {
  if (registro.ultimoConsumo.consumoActual) return "Consumo actual";
  return registro.ultimoConsumo.fecha || registro.ultimoConsumo.textoAproximado || "Sin dato";
}

export function crearGestorSustanciasHistoria({ contenedor, edadPaciente = null } = {}) {
  if (!contenedor) throw new Error("Falta el contenedor de sustancias.");
  const estado = { registros: new Map(), busqueda: "", categoria: "" };

  const obtenerRegistro = (sustanciaId) => estado.registros.get(sustanciaId);
  const obtenerNombre = (registro) => registro.sustanciaId === OTRA_SUSTANCIA_ID && registro.nombrePersonalizado
    ? registro.nombrePersonalizado
    : SUSTANCIAS_POR_ID[registro.sustanciaId]?.nombre || "Sustancia";

  function construirInterfaz() {
    contenedor.innerHTML = `
      <div class="sustancias-selector" aria-label="Selección de sustancias">
        <label for="buscadorSustanciasHistoria">Buscar sustancia</label>
        <input id="buscadorSustanciasHistoria" type="search" placeholder="Buscar por nombre..." autocomplete="off">
        <label for="categoriaSustanciasHistoria">Categoría</label>
        <select id="categoriaSustanciasHistoria">
          <option value="">Todas las categorías</option>
          ${CATEGORIAS_SUSTANCIAS.map((categoria) => `<option value="${escapar(categoria.id)}">${escapar(categoria.nombre)}</option>`).join("")}
        </select>
        <div id="opcionesSustanciasHistoria" class="sustancias-opciones" role="group" aria-label="Sustancias disponibles"></div>
        <div id="sustanciasSeleccionadasHistoria" class="sustancias-chips" aria-live="polite"></div>
      </div>
      <div id="bloquesSustanciasHistoria" class="sustancias-bloques"></div>
      <label for="observacionesSustanciasHistoria">Observaciones generales</label>
      <textarea id="observacionesSustanciasHistoria" rows="5" placeholder="Observaciones generales sobre consumo de sustancias."></textarea>
      <p id="validacionSustanciasHistoria" class="sustancias-validacion" role="status" aria-live="polite"></p>
    `;

    contenedor.addEventListener("input", manejarCambio);
    contenedor.addEventListener("change", manejarCambio);
    contenedor.addEventListener("click", manejarClick);
    contenedor.querySelectorAll("details[data-sustancia-details]").forEach((detalle) => detalle.addEventListener("toggle", actualizarAria));
  }

  function renderizarOpciones() {
    const opciones = contenedor.querySelector("#opcionesSustanciasHistoria");
    if (!opciones) return;
    const texto = normalizarTexto(estado.busqueda);
    const filtradas = CATALOGO_SUSTANCIAS.filter((sustancia) => {
      const coincideCategoria = !estado.categoria || sustancia.categoria === estado.categoria;
      const coincideTexto = !texto || normalizarTexto(`${sustancia.nombre} ${sustancia.id}`).includes(texto);
      return coincideCategoria && coincideTexto;
    });
    opciones.innerHTML = filtradas.map((sustancia) => `
      <label class="sustancia-opcion">
        <input type="checkbox" data-sustancia-select="${escapar(sustancia.id)}" ${estado.registros.has(sustancia.id) ? "checked" : ""}>
        <span>${escapar(sustancia.nombre)}</span>
      </label>
    `).join("") || `<p class="sustancias-vacio">No se encontraron sustancias.</p>`;
  }

  function renderizarChips() {
    const chips = contenedor.querySelector("#sustanciasSeleccionadasHistoria");
    if (!chips) return;
    chips.innerHTML = [...estado.registros.values()].map((registro) => `
      <button type="button" class="sustancia-chip" data-sustancia-chip="${escapar(registro.sustanciaId)}" title="Retirar ${escapar(obtenerNombre(registro))}">${escapar(obtenerNombre(registro))} <span aria-hidden="true">×</span></button>
    `).join("");
  }

  function renderizarBloques() {
    const bloques = contenedor.querySelector("#bloquesSustanciasHistoria");
    if (!bloques) return;
    bloques.innerHTML = [...estado.registros.values()].map((registro) => {
      const sustancia = SUSTANCIAS_POR_ID[registro.sustanciaId];
      const detailsId = `detalle-sustancia-${registro.sustanciaId}`;
      return `
        <article class="sustancia-bloque" data-sustancia-bloque="${escapar(registro.sustanciaId)}">
          <details data-sustancia-details="${escapar(registro.sustanciaId)}">
            <summary aria-controls="${detailsId}" aria-expanded="false">
              <span><strong>${escapar(obtenerNombre(registro))}</strong><small>Inicio: ${escapar(resumenInicio(registro))} · Último: ${escapar(resumenUltimo(registro))}</small></span>
              <button type="button" class="sustancia-quitar" data-sustancia-remove="${escapar(registro.sustanciaId)}">Quitar</button>
            </summary>
            <div id="${detailsId}" class="sustancia-campos">
              ${registro.sustanciaId === OTRA_SUSTANCIA_ID ? `<label for="sustancia-${registro.sustanciaId}-nombre">Nombre personalizado</label><input id="sustancia-${registro.sustanciaId}-nombre" data-sustancia-field="nombrePersonalizado" data-sustancia-id="${escapar(registro.sustanciaId)}" value="${escapar(registro.nombrePersonalizado)}" placeholder="Describe la sustancia">` : `<p class="sustancia-categoria">${escapar(CATEGORIAS_SUSTANCIAS_POR_ID[sustancia?.categoria]?.nombre || "")}</p>`}
              <div class="sustancia-dos-columnas">
                <div><label for="sustancia-${registro.sustanciaId}-inicio-fecha">Fecha de inicio</label><input id="sustancia-${registro.sustanciaId}-inicio-fecha" type="date" data-sustancia-field="inicioConsumo.fecha" data-sustancia-id="${escapar(registro.sustanciaId)}" value="${escapar(registro.inicioConsumo.fecha)}"></div>
                <div><label for="sustancia-${registro.sustanciaId}-inicio-edad">Edad de inicio</label><input id="sustancia-${registro.sustanciaId}-inicio-edad" type="number" min="0" max="120" step="1" inputmode="numeric" data-sustancia-field="inicioConsumo.edad" data-sustancia-id="${escapar(registro.sustanciaId)}" value="${registro.inicioConsumo.edad ?? ""}"></div>
              </div>
              <label for="sustancia-${registro.sustanciaId}-inicio-aprox">Inicio aproximado</label>
              <input id="sustancia-${registro.sustanciaId}-inicio-aprox" data-sustancia-field="inicioConsumo.textoAproximado" data-sustancia-id="${escapar(registro.sustanciaId)}" value="${escapar(registro.inicioConsumo.textoAproximado)}" placeholder="Ej. En la adolescencia o hace aproximadamente 5 años">
              <div class="sustancia-dos-columnas">
                <div><label for="sustancia-${registro.sustanciaId}-ultimo-fecha">Fecha del último consumo</label><input id="sustancia-${registro.sustanciaId}-ultimo-fecha" type="date" data-sustancia-field="ultimoConsumo.fecha" data-sustancia-id="${escapar(registro.sustanciaId)}" value="${escapar(registro.ultimoConsumo.fecha)}"></div>
                <label class="sustancia-checkbox"><input type="checkbox" data-sustancia-field="ultimoConsumo.consumoActual" data-sustancia-id="${escapar(registro.sustanciaId)}" ${registro.ultimoConsumo.consumoActual ? "checked" : ""}> Continúa consumiendo</label>
              </div>
              <label for="sustancia-${registro.sustanciaId}-ultimo-aprox">Último consumo aproximado</label>
              <input id="sustancia-${registro.sustanciaId}-ultimo-aprox" data-sustancia-field="ultimoConsumo.textoAproximado" data-sustancia-id="${escapar(registro.sustanciaId)}" value="${escapar(registro.ultimoConsumo.textoAproximado)}" placeholder="Ej. Hace dos meses">
              <label for="sustancia-${registro.sustanciaId}-descripcion">Descripción del consumo</label>
              <textarea id="sustancia-${registro.sustanciaId}-descripcion" rows="5" data-sustancia-field="descripcion" data-sustancia-id="${escapar(registro.sustanciaId)}" placeholder="Frecuencia, cantidad, vía, patrón, contexto, abstinencia, consecuencias y tratamientos previos.">${escapar(registro.descripcion)}</textarea>
            </div>
          </details>
        </article>
      `;
    }).join("");
    bloques.querySelectorAll("details[data-sustancia-details]").forEach((detalle) => detalle.addEventListener("toggle", actualizarAria));
  }

  function actualizarAria(evento) {
    const summary = evento.currentTarget?.querySelector("summary");
    summary?.setAttribute("aria-expanded", String(evento.currentTarget.open));
  }

  function renderizarTodo() {
    renderizarOpciones();
    renderizarChips();
    renderizarBloques();
  }

  function cambiarCampo(sustanciaId, campo, valor) {
    const registro = obtenerRegistro(sustanciaId);
    if (!registro) return;
    if (campo === "inicioConsumo.edad") registro.inicioConsumo.edad = valor === "" ? null : Number(valor);
    else if (campo.includes(".")) {
      const [grupo, clave] = campo.split(".");
      registro[grupo][clave] = valor;
    } else registro[campo] = valor;
    const bloque = contenedor.querySelector(`[data-sustancia-bloque="${CSS.escape(sustanciaId)}"]`);
    const summary = bloque?.querySelector("summary span small");
    if (summary) summary.textContent = `Inicio: ${resumenInicio(registro)} · Último: ${resumenUltimo(registro)}`;
  }

  function manejarCambio(evento) {
    const campo = evento.target;
    if (campo.id === "buscadorSustanciasHistoria") {
      estado.busqueda = campo.value;
      renderizarOpciones();
      return;
    }
    if (campo.id === "categoriaSustanciasHistoria") {
      estado.categoria = campo.value;
      renderizarOpciones();
      return;
    }
    if (campo.id === "observacionesSustanciasHistoria") return;
    if (campo.matches("[data-sustancia-select]")) {
      alternarSustancia(campo.dataset.sustanciaSelect, campo.checked);
      return;
    }
    if (campo.matches("[data-sustancia-field]")) {
      cambiarCampo(campo.dataset.sustanciaId, campo.dataset.sustanciaField, campo.type === "checkbox" ? campo.checked : campo.value);
    }
  }

  function manejarClick(evento) {
    const quitar = evento.target.closest("[data-sustancia-remove], [data-sustancia-chip]");
    if (!quitar) return;
    evento.preventDefault();
    const sustanciaId = quitar.dataset.sustanciaRemove || quitar.dataset.sustanciaChip;
    retirarSustancia(sustanciaId);
  }

  function alternarSustancia(sustanciaId, seleccionado) {
    if (!SUSTANCIAS_POR_ID[sustanciaId]) return;
    if (seleccionado && !estado.registros.has(sustanciaId)) {
      estado.registros.set(sustanciaId, normalizarRegistro({ sustanciaId }));
      console.debug("[HistoriaClinica:Sustancias]", { action: "substance-added", substanceId: sustanciaId, selectedCount: estado.registros.size });
    } else if (!seleccionado) retirarSustancia(sustanciaId, false);
    renderizarTodo();
  }

  function tieneInformacion(registro) {
    return Boolean(registro.nombrePersonalizado || registro.inicioConsumo.fecha || registro.inicioConsumo.edad !== null || registro.inicioConsumo.textoAproximado || registro.ultimoConsumo.fecha || registro.ultimoConsumo.consumoActual || registro.ultimoConsumo.textoAproximado || registro.descripcion.trim());
  }

  function retirarSustancia(sustanciaId, confirmar = true) {
    const registro = obtenerRegistro(sustanciaId);
    if (!registro) return;
    if (confirmar && tieneInformacion(registro) && !window.confirm("Se retirará esta sustancia de la historia clínica. ¿Deseas continuar?")) return;
    estado.registros.delete(sustanciaId);
    console.debug("[HistoriaClinica:Sustancias]", { action: "substance-removed", substanceId: sustanciaId, selectedCount: estado.registros.size });
    renderizarTodo();
  }

  function cargar(valor, legado = {}) {
    const normalizado = normalizarSustancias(valor, legado);
    estado.registros.clear();
    normalizado.seleccionadas.forEach((registro) => estado.registros.set(registro.sustanciaId, registro));
    const observaciones = contenedor.querySelector("#observacionesSustanciasHistoria");
    if (observaciones) observaciones.value = normalizado.observacionesGenerales;
    renderizarTodo();
    console.debug("[HistoriaClinica:Sustancias]", { action: "normalized", selectedCount: estado.registros.size });
  }

  function obtenerDatos() {
    return {
      seleccionadas: [...estado.registros.values()].map((registro) => normalizarRegistro({ ...registro })),
      observacionesGenerales: contenedor.querySelector("#observacionesSustanciasHistoria")?.value || ""
    };
  }

  function validar() {
    const advertencias = [];
    const edadPacienteNumerica = Number(edadPaciente);
    for (const registro of estado.registros.values()) {
      if (registro.sustanciaId === OTRA_SUSTANCIA_ID && !normalizarTexto(registro.nombrePersonalizado)) {
        advertencias.push("Escribe el nombre de la otra sustancia seleccionada.");
      }
      if (registro.inicioConsumo.edad !== null && (!Number.isInteger(registro.inicioConsumo.edad) || registro.inicioConsumo.edad < 0 || registro.inicioConsumo.edad > 120)) {
        advertencias.push(`La edad de inicio de ${obtenerNombre(registro)} no es válida.`);
      }
      if (!fechaValida(registro.inicioConsumo.fecha) || !fechaValida(registro.ultimoConsumo.fecha)) advertencias.push(`Revisa las fechas de ${obtenerNombre(registro)}.`);
      if (registro.inicioConsumo.fecha && registro.ultimoConsumo.fecha && registro.inicioConsumo.fecha > registro.ultimoConsumo.fecha) advertencias.push(`El inicio es posterior al último consumo de ${obtenerNombre(registro)}.`);
      if (Number.isFinite(edadPacienteNumerica) && Number.isFinite(registro.inicioConsumo.edad) && registro.inicioConsumo.edad > edadPacienteNumerica) advertencias.push(`La edad de inicio de ${obtenerNombre(registro)} supera la edad del paciente.`);
    }
    const salida = contenedor.querySelector("#validacionSustanciasHistoria");
    if (salida) salida.textContent = advertencias.join(" ");
    return advertencias;
  }

  construirInterfaz();
  return { cargar, obtenerDatos, validar, renderizar: renderizarTodo };
}
