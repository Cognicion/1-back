const normalizar = (texto = "") => String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const escapar = (texto = "") => String(texto).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function valorResultado(valor) {
  if (valor === null || valor === undefined) return "Sin calcular";
  if (typeof valor === "number") return Number.isFinite(valor) ? String(Math.round(valor * 100) / 100) : "Sin calcular";
  if (Array.isArray(valor)) return valor.map(valorResultado).join(" · ");
  if (typeof valor === "object") return Object.entries(valor).map(([clave, item]) => clave + ": " + valorResultado(item)).join(" | ");
  return String(valor);
}

export function renderResultado(contenedor, resultado) {
  if (!resultado) {
    contenedor.innerHTML = `<p class="calculadora-nota-ayuda">Completa los campos para calcular.</p>`;
    return;
  }
  const filas = [];
  if (resultado.value !== undefined) filas.push(`<strong class="calculadora-nota-valor">` + escapar(valorResultado(resultado.value)) + " " + escapar(resultado.unit || "") + `</strong>`);
  if (resultado.category) filas.push(`<span class="calculadora-nota-categoria">` + escapar(resultado.category) + `</span>`);
  if (resultado.interpretation) filas.push("<p>" + escapar(resultado.interpretation) + "</p>");
  if (resultado.details && Object.keys(resultado.details).length) {
    filas.push("<dl>" + Object.entries(resultado.details).map(([clave, valor]) => "<div><dt>" + escapar(clave) + "</dt><dd>" + escapar(valorResultado(valor)) + "</dd></div>").join("") + "</dl>");
  }
  if (resultado.warnings?.length) filas.push(`<p class="calculadora-nota-aviso">` + escapar(resultado.warnings.join(" ")) + `</p>`);
  if (resultado.missingData?.length) filas.push(`<p class="calculadora-nota-ayuda">Faltan datos: ` + escapar(resultado.missingData.join(", ")) + `</p>`);
  contenedor.innerHTML = filas.join("") || `<p class="calculadora-nota-ayuda">Sin resultado.</p>`;
}

export function crearCampo(definicion, onChange) {
  const envoltura = document.createElement("label");
  envoltura.className = "calculadora-nota-campo";
  envoltura.append(document.createTextNode(definicion.label + (definicion.unit ? " (" + definicion.unit + ")" : "")));
  const control = document.createElement(definicion.type === "select" ? "select" : "input");
  control.dataset.calculadoraCampo = definicion.id;
  if (definicion.type === "select") {
    (definicion.options || []).forEach((opcion) => {
      const option = document.createElement("option");
      const objeto = typeof opcion === "object" ? opcion : {};
      const valor = objeto.value ?? objeto.valor ?? opcion;
      option.value = valor;
      option.textContent = objeto.label ?? objeto.nombre ?? valor;
      control.appendChild(option);
    });
  } else {
    control.type = definicion.type === "checkbox" ? "checkbox" : definicion.type === "number" ? "number" : "text";
    control.step = definicion.step || "any";
  }
  control.addEventListener("input", onChange);
  control.addEventListener("change", onChange);
  envoltura.appendChild(control);
  if (definicion.help) {
    const ayuda = document.createElement("small");
    ayuda.textContent = definicion.help;
    envoltura.appendChild(ayuda);
  }
  return envoltura;
}

function montarCatalogo(contenedor, calculadoras, configurarDetalle) {
  contenedor.className = "calculadora-nota-embebida";
  contenedor.innerHTML = `<label class="calculadora-nota-busqueda">Buscar dentro de esta categoría<input type="search" data-calculadora-nota-filtro placeholder="Nombre, abreviatura o tema"></label><div class="calculadora-nota-lista" data-calculadora-nota-lista></div><section class="calculadora-nota-detalle" data-calculadora-nota-detalle aria-live="polite"><p class="calculadora-nota-ayuda">Selecciona una calculadora para comenzar.</p></section>`;
  const filtro = contenedor.querySelector("[data-calculadora-nota-filtro]");
  const lista = contenedor.querySelector("[data-calculadora-nota-lista]");
  const detalle = contenedor.querySelector("[data-calculadora-nota-detalle]");
  const renderLista = () => {
    const texto = normalizar(filtro.value.trim());
    const visibles = calculadoras.filter((calc) => {
      const campos = [
        calc.name,
        calc.nombre,
        calc.title,
        calc.abbreviation,
        calc.description,
        calc.descripcion,
        ...(Array.isArray(calc.aliases) ? calc.aliases : [])
      ];
      return normalizar(campos.filter(Boolean).join(" ")).includes(texto);
    }).slice(0, 50);
    lista.innerHTML = visibles.length
      ? visibles.map((calc) => `<button type="button" data-calculadora-id="` + escapar(calc.id) + `"><strong>` + escapar(calc.name || calc.nombre || calc.title) + `</strong></button>`).join("")
      : `<p class="calculadora-nota-ayuda">No se encontraron calculadoras.</p>`;
  };
  filtro.addEventListener("input", renderLista);
  lista.addEventListener("click", (event) => {
    const boton = event.target.closest("[data-calculadora-id]");
    if (!boton) return;
    const calc = calculadoras.find((item) => item.id === boton.dataset.calculadoraId);
    if (calc) {
      detalle.classList.toggle("con-muchos-valores", (calc.inputs || []).length > 8);
      configurarDetalle(detalle, calc);
    }
  });
  renderLista();
}

function montarMedicas(contenedor, data) {
  montarCatalogo(contenedor, data.CALCULADORAS_MEDICAS.filter((calc) => !calc.externalUrl), (detalle, calc) => {
    detalle.innerHTML = `<header><span>` + escapar(calc.type || "Calculadora") + `</span><h3>` + escapar(calc.name) + `</h3><p>` + escapar(calc.description || "") + `</p></header><div class="calculadora-nota-campos"></div><div class="calculadora-nota-resultado"></div>`;
    const campos = detalle.querySelector(".calculadora-nota-campos");
    const resultado = detalle.querySelector(".calculadora-nota-resultado");
    const actualizar = () => {
      const inputs = {};
      campos.querySelectorAll("[data-calculadora-campo]").forEach((control) => { inputs[control.dataset.calculadoraCampo] = control.type === "checkbox" ? control.checked : control.value; });
      try { renderResultado(resultado, data.ejecutarCalculadoraMedica(calc.id, inputs)); }
      catch (error) { resultado.textContent = "No fue posible calcular con estos datos."; console.error("Error en calculadora médica embebida:", error); }
    };
    (calc.inputs || []).forEach((input) => campos.appendChild(crearCampo(input, actualizar)));
    actualizar();
  });
}

function montarPediatricas(contenedor, data) {
  montarCatalogo(contenedor, data.CALCULADORAS_PEDIATRICAS, (detalle, calc) => {
    detalle.innerHTML = `<header><span>Pediatría</span><h3>` + escapar(calc.nombre) + `</h3><p>` + escapar(calc.descripcion || "") + `</p></header><div class="calculadora-nota-campos"></div><div class="calculadora-nota-resultado"></div>`;
    const campos = detalle.querySelector(".calculadora-nota-campos");
    const resultado = detalle.querySelector(".calculadora-nota-resultado");
    const actualizar = () => {
      const inputs = {};
      campos.querySelectorAll("[data-calculadora-campo]").forEach((control) => { inputs[control.dataset.calculadoraCampo] = control.type === "checkbox" ? control.checked : control.value; });
      try { renderResultado(resultado, calc.calcular(inputs)); }
      catch (error) { resultado.textContent = "No fue posible calcular con estos datos."; console.error("Error en calculadora pediátrica embebida:", error); }
    };
    (calc.inputs || []).forEach((input) => campos.appendChild(crearCampo({ id: input.id, label: input.label, unit: input.unidad, type: input.tipo === "select" ? "select" : input.tipo === "checkbox" ? "checkbox" : input.tipo, options: input.opciones, help: input.ayuda }, actualizar)));
    actualizar();
  });
}

function montarBenzodiacepinas(contenedor, data) {
  const opciones = data.BENZODIACEPINAS.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  contenedor.className = "calculadora-nota-embebida";
  const opcionesHTML = opciones.map((item) => `<option value="` + escapar(item.id) + `">` + escapar(item.nombre) + `</option>`).join("");
  contenedor.innerHTML = `<section class="calculadora-nota-detalle calculadora-nota-benzo"><header><span>Farmacología</span><h3>Equivalencias de benzodiacepinas</h3><p>Calcula una equivalencia diaria aproximada.</p></header><div class="calculadora-nota-campos"><label class="calculadora-nota-campo">Medicamento de origen<select data-benzo="origen">` + opcionesHTML + `</select></label><label class="calculadora-nota-campo">Dosis diaria (mg)<input type="number" min="0" step="any" value="1" data-benzo="dosis"></label><label class="calculadora-nota-campo">Medicamento destino<select data-benzo="destino">` + opcionesHTML + `</select></label></div><div class="calculadora-nota-resultado" data-benzo-resultado></div></section>`;
  const actualizar = () => {
    const origen = contenedor.querySelector("[data-benzo='origen']").value;
    const destino = contenedor.querySelector("[data-benzo='destino']").value;
    const dosis = data.normalizarNumero(contenedor.querySelector("[data-benzo='dosis']").value);
    const resultado = data.convertirBenzodiacepina(origen, dosis, destino);
    renderResultado(contenedor.querySelector("[data-benzo-resultado]"), resultado ? { value: data.formatearDosis(resultado.dosisDiariaDestino), unit: "mg/día", category: resultado.destino?.nombre || "", interpretation: "Equivalencia aproximada para revisión clínica." } : { value: null, missingData: ["Completa los medicamentos y la dosis"] });
  };
  const controles = [...contenedor.querySelectorAll("[data-benzo]")];
  controles.forEach((control) => { control.addEventListener("input", actualizar); control.addEventListener("change", actualizar); });
  actualizar();
  return () => controles.forEach((control) => { control.removeEventListener("input", actualizar); control.removeEventListener("change", actualizar); });
}

export async function montarCalculadoraNota(contenedor, tipo) {
  contenedor.textContent = "Cargando calculadora...";
  if (tipo === "medicas") {
    montarMedicas(contenedor, await import("../data/calculadorasMedicas.js"));
    return;
  }
  if (tipo === "pediatricas") {
    montarPediatricas(contenedor, await import("../data/calculadorasPediatricas.js"));
    return;
  }
    return montarBenzodiacepinas(contenedor, await import("../data/benzodiacepinas.js"));
}

// Adaptadores de transición: reutilizan exactamente las fórmulas legacy,
// pero montan una sola calculadora elegida por el usuario.
export function montarCalculadoraMedicaLegacy(contenedor, calc, data) {
  contenedor.className = "calculadora-nota-embebida";
  contenedor.innerHTML = `<section class="calculadora-nota-detalle"><header><span>${escapar(calc.type || "Calculadora médica")}</span><h3>${escapar(calc.name)}</h3><p>${escapar(calc.description || "")}</p></header><div class="calculadora-nota-campos"></div><div class="calculadora-nota-resultado"></div></section>`;
  const campos = contenedor.querySelector(".calculadora-nota-campos");
  const resultado = contenedor.querySelector(".calculadora-nota-resultado");
  const actualizar = () => {
    const inputs = {};
    campos.querySelectorAll("[data-calculadora-campo]").forEach((control) => { inputs[control.dataset.calculadoraCampo] = control.type === "checkbox" ? control.checked : control.value; });
    try { renderResultado(resultado, data.ejecutarCalculadoraMedica(calc.id, inputs)); }
    catch (error) { resultado.textContent = "No fue posible calcular con estos datos."; console.error("Error en calculadora médica embebida:", error); }
  };
  (calc.inputs || []).forEach((input) => campos.appendChild(crearCampo(input, actualizar)));
  actualizar();
  return () => contenedor.replaceChildren();
}

export function montarCalculadoraPediatricaLegacy(contenedor, calc, data) {
  contenedor.className = "calculadora-nota-embebida";
  contenedor.innerHTML = `<section class="calculadora-nota-detalle"><header><span>Pediatría</span><h3>${escapar(calc.nombre)}</h3><p>${escapar(calc.descripcion || "")}</p></header><div class="calculadora-nota-campos"></div><div class="calculadora-nota-resultado"></div></section>`;
  const campos = contenedor.querySelector(".calculadora-nota-campos");
  const resultado = contenedor.querySelector(".calculadora-nota-resultado");
  const actualizar = () => {
    const inputs = {};
    campos.querySelectorAll("[data-calculadora-campo]").forEach((control) => { inputs[control.dataset.calculadoraCampo] = control.type === "checkbox" ? control.checked : control.value; });
    try { renderResultado(resultado, calc.calcular(inputs)); }
    catch (error) { resultado.textContent = "No fue posible calcular con estos datos."; console.error("Error en calculadora pediátrica embebida:", error); }
  };
  (calc.inputs || []).forEach((input) => campos.appendChild(crearCampo({ id: input.id, label: input.label, unit: input.unidad, type: input.tipo === "select" ? "select" : input.tipo === "checkbox" ? "checkbox" : input.tipo, options: input.opciones, help: input.ayuda }, actualizar)));
  actualizar();
  return () => contenedor.replaceChildren();
}
