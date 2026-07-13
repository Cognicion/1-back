import {
  CALCULADORAS_PEDIATRICAS,
  CATEGORIAS_CALCULADORAS_PEDIATRICAS,
  redondear
} from "./data/calculadorasPediatricas.js";

const estado = {
  busqueda: "",
  categoria: "todas",
  calculadoraId: CALCULADORAS_PEDIATRICAS[0]?.id || null,
  valores: {}
};

const nodos = {
  buscar: document.getElementById("buscarCalculadora"),
  categorias: document.getElementById("categoriasCalculadoras"),
  lista: document.getElementById("listaCalculadoras"),
  detalle: document.getElementById("detalleCalculadora")
};

function categoriaNombre(id) {
  return CATEGORIAS_CALCULADORAS_PEDIATRICAS.find((categoria) => categoria.id === id)?.nombre || "Pediatria";
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function calculadorasFiltradas() {
  const q = normalizarTexto(estado.busqueda);
  return CALCULADORAS_PEDIATRICAS.filter((calc) => {
    const coincideCategoria = estado.categoria === "todas" || calc.categoria === estado.categoria;
    const base = normalizarTexto(`${calc.nombre} ${calc.descripcion} ${categoriaNombre(calc.categoria)}`);
    return coincideCategoria && (!q || base.includes(q));
  });
}

function crearBotonCategoria(categoria) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = `calc-ped-chip${estado.categoria === categoria.id ? " activa" : ""}`;
  boton.textContent = categoria.nombre;
  boton.addEventListener("click", () => {
    estado.categoria = categoria.id;
    render();
  });
  return boton;
}

function renderCategorias() {
  nodos.categorias.innerHTML = "";
  nodos.categorias.appendChild(crearBotonCategoria({ id: "todas", nombre: "Todas" }));
  CATEGORIAS_CALCULADORAS_PEDIATRICAS.forEach((categoria) => {
    nodos.categorias.appendChild(crearBotonCategoria(categoria));
  });
}

function renderLista() {
  const filtradas = calculadorasFiltradas();
  nodos.lista.innerHTML = "";

  if (!filtradas.length) {
    nodos.lista.innerHTML = `<div class="calc-ped-empty">No se encontraron calculadoras para esta busqueda.</div>`;
    return;
  }

  if (!filtradas.some((calc) => calc.id === estado.calculadoraId)) {
    estado.calculadoraId = filtradas[0].id;
  }

  filtradas.forEach((calc) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = `calc-ped-card${calc.id === estado.calculadoraId ? " activa" : ""}`;
    boton.innerHTML = `
      <strong>${calc.nombre}</strong>
      <span>${calc.descripcion}</span>
      <span>${categoriaNombre(calc.categoria)}</span>
    `;
    boton.addEventListener("click", () => {
      estado.calculadoraId = calc.id;
      estado.valores = {};
      renderDetalle();
      renderLista();
    });
    nodos.lista.appendChild(boton);
  });
}

function valorInicial(input) {
  if (estado.valores[input.id] !== undefined) return estado.valores[input.id];
  if (input.default !== undefined) return input.default;
  if (input.tipo === "select") return input.opciones?.[0]?.valor || "";
  return "";
}

function renderInput(input) {
  const wrap = document.createElement("div");
  wrap.className = "calc-ped-field";
  const label = document.createElement("label");
  label.htmlFor = `calc-${input.id}`;
  label.textContent = `${input.label}${input.unidad ? ` (${input.unidad})` : ""}`;

  let control;
  if (input.tipo === "select") {
    control = document.createElement("select");
    (input.opciones || []).forEach((opcion) => {
      const item = document.createElement("option");
      item.value = opcion.valor;
      item.textContent = opcion.label;
      control.appendChild(item);
    });
  } else if (input.tipo === "textarea") {
    control = document.createElement("textarea");
  } else {
    control = document.createElement("input");
    control.inputMode = "decimal";
    control.type = input.tipo || "text";
  }

  control.id = `calc-${input.id}`;
  control.value = valorInicial(input);
  control.placeholder = input.placeholder || "";
  control.addEventListener("input", () => {
    estado.valores[input.id] = control.value;
    actualizarResultado();
  });
  control.addEventListener("change", () => {
    estado.valores[input.id] = control.value;
    actualizarResultado();
  });

  wrap.append(label, control);
  if (input.ayuda) {
    const ayuda = document.createElement("small");
    ayuda.textContent = input.ayuda;
    wrap.appendChild(ayuda);
  }
  return wrap;
}

function obtenerCalculadoraActual() {
  return CALCULADORAS_PEDIATRICAS.find((calc) => calc.id === estado.calculadoraId) || CALCULADORAS_PEDIATRICAS[0];
}

function obtenerValores(calc) {
  const valores = {};
  (calc.inputs || []).forEach((input) => {
    const control = document.getElementById(`calc-${input.id}`);
    valores[input.id] = control ? control.value : valorInicial(input);
  });
  return valores;
}

function etiquetaCampo(campo) {
  return String(campo)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letra) => letra.toUpperCase())
    .replace("Ml", "mL")
    .replace("Kg", "kg")
    .replace("Dia", "dia")
    .replace("Hora", "hora");
}

function formatearValor(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "Sin calcular";
  if (typeof valor === "number") return String(redondear(valor, Math.abs(valor) >= 100 ? 1 : 2));
  if (typeof valor === "object") return Object.entries(valor)
    .map(([clave, item]) => `${etiquetaCampo(clave)}: ${formatearValor(item)}`)
    .join(" | ");
  return String(valor);
}

function renderResultados(resultado) {
  if (!resultado || typeof resultado !== "object") {
    return `<div class="calc-ped-empty">Completa los campos para calcular.</div>`;
  }
  return `<div class="calc-ped-result-grid">${
    Object.entries(resultado)
      .map(([clave, valor]) => `
        <div class="calc-ped-result-row">
          <span>${etiquetaCampo(clave)}</span>
          <strong>${formatearValor(valor)}</strong>
        </div>
      `)
      .join("")
  }</div>`;
}

function renderGraficaPercentil(resultado) {
  if (!resultado || resultado.percentil === null || resultado.percentil === undefined) return "";
  const percentil = Math.max(0.01, Math.min(99.99, Number(resultado.percentil)));
  const z = resultado.z ?? 0;
  return `
    <div class="calc-ped-panel percentil-card">
      <h3>Grafica de percentil</h3>
      <svg class="percentil-svg" viewBox="0 0 420 140" role="img" aria-label="Curva visual de percentil">
        <path d="M20 116 C92 116 95 22 210 22 C325 22 328 116 400 116" fill="none" stroke="rgba(125,211,252,.25)" stroke-width="7" stroke-linecap="round"/>
        <path d="M20 116 C92 116 95 22 210 22 C325 22 328 116 400 116" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"/>
        <line x1="${20 + percentil * 3.8}" y1="20" x2="${20 + percentil * 3.8}" y2="122" stroke="#facc15" stroke-width="2" stroke-dasharray="5 5"/>
        <circle cx="${20 + percentil * 3.8}" cy="70" r="7" fill="#facc15"/>
        <text x="20" y="132" fill="#9fb1ca" font-size="10">p0</text>
        <text x="199" y="132" fill="#9fb1ca" font-size="10">p50</text>
        <text x="382" y="132" fill="#9fb1ca" font-size="10">p100</text>
      </svg>
      <div class="percentil-track">
        <span class="percentil-marker" style="left:${percentil}%"></span>
      </div>
      <div class="percentil-labels"><span>p1</span><span>p3</span><span>p50</span><span>p97</span><span>p99</span></div>
      <p class="calc-ped-interpretacion">Percentil aproximado: <strong>${redondear(percentil, 1)}</strong>. Z: <strong>${redondear(z, 2)}</strong>.</p>
    </div>
  `;
}

function construirResumen(calc, resultado, interpretacion) {
  const lineas = [
    `Calculadora pediatrica: ${calc.nombre}`,
    `Fecha: ${new Date().toLocaleString("es-MX")}`,
    `Resultado: ${Object.entries(resultado || {}).map(([clave, valor]) => `${etiquetaCampo(clave)} ${formatearValor(valor)}`).join("; ") || "sin calcular"}`,
    `Interpretacion: ${interpretacion || "sin interpretacion"}`
  ];
  return lineas.join("\n");
}

async function copiarResumen(calc, resultado, interpretacion) {
  const texto = construirResumen(calc, resultado, interpretacion);
  try {
    await navigator.clipboard.writeText(texto);
  } catch (error) {
    const temp = document.createElement("textarea");
    temp.value = texto;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
  }
}

function actualizarResultado() {
  const calc = obtenerCalculadoraActual();
  if (!calc) return;
  const valores = obtenerValores(calc);
  estado.valores = valores;

  let resultado = null;
  let interpretacion = "Completa los campos.";
  try {
    resultado = calc.calcular(valores);
    interpretacion = calc.interpretar ? calc.interpretar(resultado, valores) : "";
  } catch (error) {
    resultado = null;
    interpretacion = "No se pudo calcular con los datos actuales.";
    console.error("Error en calculadora pediatrica", calc.id, error);
  }

  const salida = document.getElementById("salidaCalculadora");
  if (!salida) return;
  salida.innerHTML = `
    <div class="calc-ped-results">
      <div class="calc-ped-panel">
        <h3>Resultados</h3>
        ${renderResultados(resultado)}
        <button class="calc-ped-copy" id="copiarResumenCalc" type="button">Copiar resumen</button>
      </div>
      <div class="calc-ped-panel">
        <h3>Interpretacion clinica</h3>
        <p class="calc-ped-interpretacion">${interpretacion}</p>
      </div>
    </div>
    ${calc.grafica === "percentil" ? renderGraficaPercentil(resultado) : ""}
  `;

  document.getElementById("copiarResumenCalc")?.addEventListener("click", () => copiarResumen(calc, resultado, interpretacion));
}

function renderDetalle() {
  const calc = obtenerCalculadoraActual();
  if (!calc) {
    nodos.detalle.innerHTML = `<div class="calc-ped-empty">No hay calculadoras disponibles.</div>`;
    return;
  }

  nodos.detalle.innerHTML = `
    <span class="calc-ped-eyebrow">${categoriaNombre(calc.categoria)}</span>
    <h2>${calc.nombre}</h2>
    <p>${calc.descripcion}</p>
    <form class="calc-ped-form" id="formCalculadora"></form>
    <div id="salidaCalculadora"></div>
  `;

  const form = document.getElementById("formCalculadora");
  (calc.inputs || []).forEach((input) => form.appendChild(renderInput(input)));
  actualizarResultado();
}

function render() {
  renderCategorias();
  renderLista();
  renderDetalle();
}

nodos.buscar?.addEventListener("input", (event) => {
  estado.busqueda = event.target.value;
  renderLista();
  renderDetalle();
});

render();
