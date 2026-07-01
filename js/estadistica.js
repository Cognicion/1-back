import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { medicoPuedeVer, obtenerUsuario } from "./services/usuarios.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

iniciarMonitoreoSesion("Estadistica");

let datos = [];
let columnas = [];
let ultimoResultado = [];
let tiposVariables = {};

const entrada = document.getElementById("entradaDatos");
const archivo = document.getElementById("archivoDatos");
const resumenDatos = document.getElementById("resumenDatos");
const resultados = document.getElementById("resultados");
const variableY = document.getElementById("variableY");
const variableX = document.getElementById("variableX");
const tiposVariablesContenedor = document.getElementById("tiposVariables");
const recomendacionAnalisis = document.getElementById("recomendacionAnalisis");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || usuario.rol !== "medico") {
    alert("Acceso restringido al personal medico.");
    window.location.href = "dashboard.html";
    return;
  }

  document.body.classList.remove("bloqueado");
});

function parsearTabla(texto) {
  const lineas = texto.trim().split(/\r?\n/).filter(Boolean);
  if (lineas.length < 2) return [];
  const separador = lineas[0].includes("\t") ? "\t" : ",";
  const encabezados = lineas[0].split(separador).map((x) => x.trim());

  return lineas.slice(1).map((linea) => {
    const valores = linea.split(separador).map((x) => x.trim());
    return encabezados.reduce((fila, col, i) => {
      const numero = Number(valores[i]);
      fila[col] = valores[i] !== "" && !Number.isNaN(numero) ? numero : valores[i] || "";
      return fila;
    }, {});
  });
}

function cargarDatos() {
  datos = aplicarFiltro(parsearTabla(entrada.value));
  columnas = datos.length ? Object.keys(datos[0]) : [];
  llenarSelects();
  resumenDatos.textContent = `${datos.length} filas, ${columnas.length} variables.`;
  resultados.textContent = "Datos cargados. Selecciona un analisis.";
  dibujarGraficasAutomaticas();
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad >= 0 ? edad : "";
}

function obtenerFechaNacimiento(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return (
    paciente.fechaNacimiento ||
    institucional.fechaNacimiento ||
    paciente.fecha_nacimiento ||
    paciente.fechaDeNacimiento ||
    paciente.fechaNac ||
    paciente.nacimiento ||
    ""
  );
}

function diagnosticoPrincipalTexto(paciente) {
  const dx = paciente.diagnostico ||
    (Array.isArray(paciente.historialDiagnosticos)
      ? paciente.historialDiagnosticos[paciente.historialDiagnosticos.length - 1]
      : "");

  if (!dx) return "";
  if (typeof dx === "string") return dx;
  return dx.codigo || dx.nombre || dx.texto || "";
}

async function cargarPacientesDelMedico() {
  const user = auth.currentUser;
  if (!user) return;

  resultados.textContent = "Cargando pacientes autorizados...";

  const snapshot = await getDocs(collection(db, "usuarios"));
  const filas = [];

  for (const docPaciente of snapshot.docs) {
    const paciente = docPaciente.data();
    if (paciente.rol !== "paciente") continue;

    const puedeVer = await medicoPuedeVer(user.uid, docPaciente.id);
    if (!puedeVer) continue;

    const snapTratamientos = await getDocs(collection(db, "usuarios", docPaciente.id, "tratamientos"));
    const tratamientos = snapTratamientos.docs.map((docTratamiento) => docTratamiento.data());
    const snapEstudios = await getDocs(collection(db, "usuarios", docPaciente.id, "estudios"));

    filas.push({
      id: docPaciente.id,
      nombre: paciente.nombre || "",
      edad: calcularEdad(obtenerFechaNacimiento(paciente)) || "",
      sexo: paciente.sexo || "",
      estado: paciente.estado || "activo",
      diagnostico: diagnosticoPrincipalTexto(paciente),
      catalogo: paciente.diagnostico?.catalogo || paciente.diagnosticoCatalogoVisible || "auto",
      ultimaConsulta: paciente.ultimaConsulta || "",
      proximaConsulta: paciente.proximaConsulta || "",
      tieneTratamiento: tratamientos.some((t) => (t.estado || "activo") === "activo") || paciente.tratamiento ? 1 : 0,
      tratamientosActivos: tratamientos.filter((t) => (t.estado || "activo") === "activo").length,
      tratamientosSuspendidos: tratamientos.filter((t) => t.estado === "suspendido").length,
      estudiosRegistrados: snapEstudios.size,
      numDiagnosticos: Array.isArray(paciente.historialDiagnosticos) ? paciente.historialDiagnosticos.length : (paciente.diagnostico ? 1 : 0)
    });
  }

  datos = filas;
  columnas = datos.length ? Object.keys(datos[0]) : [];
  entrada.value = [
    columnas.join(","),
    ...datos.map((fila) => columnas.map((col) => fila[col]).join(","))
  ].join("\n");
  llenarSelects();
  resumenDatos.textContent = `${datos.length} pacientes autorizados cargados desde Firestore.`;
  resultados.textContent = "Datos clinicos cargados. Selecciona un analisis o grafica.";
  dibujarGraficasAutomaticas();
}

function aplicarFiltro(filas) {
  const filtro = document.getElementById("filtroTexto").value.trim();
  if (!filtro || !filtro.includes("=")) return filas;
  const [campo, valor] = filtro.split("=").map((x) => x.trim());
  return filas.filter((fila) => String(fila[campo]) === valor);
}

function llenarSelects() {
  const seleccionY = variableY.value;
  const seleccionX = variableX.value;
  sincronizarTiposVariables();

  [variableY, variableX].forEach((select) => {
    select.innerHTML = "";
    columnas.forEach((col) => {
      const opcion = document.createElement("option");
      opcion.value = col;
      opcion.textContent = col;
      select.appendChild(opcion);
    });
  });

  variableY.value = columnas.includes(seleccionY) ? seleccionY : columnaSugerida(["cuantitativa", "ordinal", "binaria"]) || columnas[0] || "";
  variableX.value = columnas.includes(seleccionX) ? seleccionX : columnaSugerida(["nominal", "binaria"], variableY.value) || columnas.find((col) => col !== variableY.value) || columnas[0] || "";
  renderizarTiposVariables();
  actualizarRecomendacion();
}

function columnaSugerida(tipos, evitar = "") {
  return columnas.find((col) => col !== evitar && tipos.includes(tiposVariables[col]));
}

function sincronizarTiposVariables() {
  const siguientes = {};
  columnas.forEach((col) => {
    siguientes[col] = tiposVariables[col] || detectarTipoVariable(col);
  });
  tiposVariables = siguientes;
}

function detectarTipoVariable(col) {
  const lista = valores(col).map((x) => String(x).trim()).filter(Boolean);
  if (!lista.length) return "texto";

  const unicos = new Set(lista);
  const numerosValidos = lista.map((x) => Number(x)).filter((x) => !Number.isNaN(x));
  const todosNumericos = numerosValidos.length === lista.length;
  const fechasValidas = lista.filter((x) => !Number.isNaN(new Date(x).getTime()));
  const todosFecha = fechasValidas.length === lista.length && lista.some((x) => /\d{4}-\d{1,2}-\d{1,2}/.test(x));

  if (todosFecha) return "fecha";
  if (unicos.size === 2) return "binaria";
  if (todosNumericos) {
    const todosEnteros = numerosValidos.every((x) => Number.isInteger(x));
    if (todosEnteros && unicos.size <= 7) return "ordinal";
    return "cuantitativa";
  }
  if (unicos.size <= Math.max(10, Math.ceil(Math.sqrt(lista.length) * 2))) return "nominal";
  return "texto";
}

function descripcionTipo(tipo) {
  const textos = {
    cuantitativa: "Numero continuo o escala: edad, puntaje, dias, dosis.",
    ordinal: "Categorias con orden: leve, moderado, severo; o puntajes cortos.",
    nominal: "Categorias sin orden: sexo, diagnostico, unidad, grupo.",
    binaria: "Dos valores: si/no, 0/1, presente/ausente, control/tratamiento.",
    fecha: "Fecha clinica: nacimiento, consulta, ingreso, seguimiento.",
    texto: "Texto libre: notas, nombres, observaciones largas."
  };
  return textos[tipo] || textos.texto;
}

function escaparHTML(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderizarTiposVariables() {
  if (!tiposVariablesContenedor) return;

  if (!columnas.length) {
    tiposVariablesContenedor.innerHTML = "<p class=\"ayuda\">Carga datos para clasificar las variables.</p>";
    return;
  }

  const opciones = ["cuantitativa", "ordinal", "nominal", "binaria", "fecha", "texto"];
  tiposVariablesContenedor.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Variable</th>
          <th>Tipo</th>
          <th>Valores validos</th>
          <th>Guia rapida</th>
        </tr>
      </thead>
      <tbody>
        ${columnas.map((col) => {
          const tipo = tiposVariables[col] || detectarTipoVariable(col);
          const validos = valores(col).length;
          return `
            <tr>
              <td><strong>${escaparHTML(col)}</strong></td>
              <td>
                <select data-tipo-variable="${escaparHTML(col)}">
                  ${opciones.map((op) => `<option value="${op}" ${op === tipo ? "selected" : ""}>${op}</option>`).join("")}
                </select>
              </td>
              <td>${validos} / ${datos.length}</td>
              <td class="tipo-descripcion">${descripcionTipo(tipo)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  tiposVariablesContenedor.querySelectorAll("[data-tipo-variable]").forEach((select) => {
    select.addEventListener("change", () => {
      const col = select.dataset.tipoVariable;
      tiposVariables[col] = select.value;
      renderizarTiposVariables();
      actualizarRecomendacion();
    });
  });
}

function actualizarRecomendacion() {
  if (!recomendacionAnalisis) return;
  if (!columnas.length || !datos.length) {
    recomendacionAnalisis.textContent = "Carga datos para recibir una recomendacion.";
    return;
  }

  const y = variableY.value;
  const x = variableX.value;
  const tipoY = tiposVariables[y] || detectarTipoVariable(y);
  const tipoX = tiposVariables[x] || detectarTipoVariable(x);
  const gruposX = x ? new Set(valores(x)).size : 0;

  let texto = `Variable principal: ${y} (${tipoY}).`;

  if (!x || x === y) {
    texto += " Empieza con Descriptivos si es numerica, o Frecuencias si es categorica.";
  } else if (["cuantitativa", "ordinal"].includes(tipoY) && ["nominal", "binaria"].includes(tipoX)) {
    texto += gruposX <= 2
      ? ` Como ${x} tiene ${gruposX} grupos, usa t de Student para comparar promedios y Grafica de barras para revisar la distribucion.`
      : ` Como ${x} tiene varios grupos, empieza con descriptivos por grupo y grafica de barras; despues conviene agregar ANOVA si necesitas comparaciones formales.`;
  } else if (["cuantitativa", "ordinal"].includes(tipoY) && ["cuantitativa", "ordinal"].includes(tipoX)) {
    texto += ` Con ${x} tambien numerica, usa Correlacion, Regresion lineal y Dispersion.`;
  } else if (["nominal", "binaria"].includes(tipoY) && ["nominal", "binaria"].includes(tipoX)) {
    texto += " Usa Tabla cruzada y Chi cuadrada; si ambas son binarias tambien puedes usar Riesgo relativo / OR.";
  } else if (tipoY === "binaria" && ["cuantitativa", "ordinal"].includes(tipoX)) {
    texto += " Si tienes un punto de corte, usa Sensibilidad / especificidad con el umbral diagnostico.";
  } else if (tipoY === "fecha") {
    texto += " Las fechas sirven mejor para seguimiento, tiempos entre eventos o filtros; conviertelas a dias si quieres analizarlas numericamente.";
  } else {
    texto += " Revisa frecuencias primero y confirma que las columnas esten clasificadas correctamente.";
  }

  recomendacionAnalisis.textContent = texto;
}

function numeros(col) {
  return datos.map((fila) => Number(fila[col])).filter((x) => !Number.isNaN(x));
}

function valores(col) {
  return datos.map((fila) => fila[col]).filter((x) => x !== "");
}

function media(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function mediana(arr) {
  const orden = [...arr].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

function varianza(arr) {
  if (arr.length < 2) return 0;
  const m = media(arr);
  return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
}

function percentil(arr, p) {
  const orden = [...arr].sort((a, b) => a - b);
  const pos = (orden.length - 1) * p;
  const base = Math.floor(pos);
  const resto = pos - base;
  return orden[base + 1] !== undefined
    ? orden[base] + resto * (orden[base + 1] - orden[base])
    : orden[base];
}

function redondear(x) {
  return typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(4)) : x;
}

function logGamma(z) {
  const coeficientes = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  let x = 0.9999999999998099;
  const y = z - 1;
  coeficientes.forEach((c, i) => {
    x += c / (y + i + 1);
  });
  const t = y + coeficientes.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinua(x, a, b) {
  const maxIteraciones = 120;
  const epsilon = 1e-10;
  const fpmin = 1e-30;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIteraciones; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < epsilon) break;
  }

  return h;
}

function betaRegularizada(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaContinua(x, a, b) / a;
  }
  return 1 - bt * betaContinua(1 - x, b, a) / b;
}

function cdfT(t, gl) {
  if (!Number.isFinite(t) || !Number.isFinite(gl) || gl <= 0) return NaN;
  const x = gl / (gl + t * t);
  const ib = betaRegularizada(x, gl / 2, 0.5);
  return t >= 0 ? 1 - ib / 2 : ib / 2;
}

function pTDosColas(t, gl) {
  const p = 2 * (1 - cdfT(Math.abs(t), gl));
  return Math.max(0, Math.min(1, p));
}

function tCritico(gl, alfa = 0.05) {
  const objetivo = 1 - alfa / 2;
  let bajo = 0;
  let alto = 20;
  while (cdfT(alto, gl) < objetivo && alto < 1e6) alto *= 2;
  for (let i = 0; i < 80; i++) {
    const medio = (bajo + alto) / 2;
    if (cdfT(medio, gl) < objetivo) bajo = medio;
    else alto = medio;
  }
  return (bajo + alto) / 2;
}

function interpretarP(p) {
  if (!Number.isFinite(p)) return "No calculable con los datos disponibles.";
  if (p < 0.001) return "Diferencia estadisticamente significativa (p < 0.001).";
  if (p < 0.05) return `Diferencia estadisticamente significativa (p = ${redondear(p)}).`;
  return `No se observa diferencia estadisticamente significativa (p = ${redondear(p)}).`;
}

function tablaHTML(filas) {
  ultimoResultado = filas;
  if (!filas.length) return "<p>No hay resultados.</p>";
  const cols = Object.keys(filas[0]);
  return `
    <table>
      <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>
        ${filas.map((fila) => `
          <tr>${cols.map((c) => `<td>${fila[c]}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function descriptivos() {
  const filas = columnas
    .map((col) => ({ col, arr: numeros(col) }))
    .filter((item) => item.arr.length)
    .map(({ col, arr }) => {
      const de = Math.sqrt(varianza(arr));
      return {
        variable: col,
        n: arr.length,
        media: redondear(media(arr)),
        mediana: redondear(mediana(arr)),
        de: redondear(de),
        varianza: redondear(varianza(arr)),
        min: Math.min(...arr),
        p25: redondear(percentil(arr, 0.25)),
        p75: redondear(percentil(arr, 0.75)),
        max: Math.max(...arr),
        ic95_inf: redondear(media(arr) - 1.96 * de / Math.sqrt(arr.length)),
        ic95_sup: redondear(media(arr) + 1.96 * de / Math.sqrt(arr.length))
      };
    });
  resultados.innerHTML = tablaHTML(filas);
}

function frecuencias() {
  const col = variableY.value;
  const total = valores(col).length;
  const conteo = {};
  valores(col).forEach((v) => conteo[v] = (conteo[v] || 0) + 1);
  resultados.innerHTML = tablaHTML(Object.entries(conteo).map(([valor, n]) => ({
    variable: col,
    valor,
    n,
    porcentaje: redondear(n * 100 / total)
  })));
}

function tablaCruzada() {
  const y = variableY.value;
  const x = variableX.value;
  const gruposX = [...new Set(valores(x))];
  const gruposY = [...new Set(valores(y))];
  const filas = gruposY.map((gy) => {
    const fila = { [y]: gy };
    gruposX.forEach((gx) => {
      fila[gx] = datos.filter((d) => d[y] === gy && d[x] === gx).length;
    });
    return fila;
  });
  resultados.innerHTML = tablaHTML(filas);
}

function ttest() {
  const y = variableY.value;
  const x = variableX.value;
  const grupos = [...new Set(valores(x))].slice(0, 2);
  const a = datos.filter((d) => d[x] === grupos[0]).map((d) => Number(d[y])).filter((v) => !Number.isNaN(v));
  const b = datos.filter((d) => d[x] === grupos[1]).map((d) => Number(d[y])).filter((v) => !Number.isNaN(v));

  if (grupos.length < 2 || a.length < 2 || b.length < 2) {
    resultados.innerHTML = tablaHTML([{
      variable: y,
      grupo1: grupos[0] || "",
      n1: a.length,
      grupo2: grupos[1] || "",
      n2: b.length,
      interpretacion: "Se requieren dos grupos con al menos 2 valores numericos cada uno."
    }]);
    return;
  }

  const mediaA = media(a);
  const mediaB = media(b);
  const varA = varianza(a);
  const varB = varianza(b);
  const diferencia = mediaA - mediaB;
  const se = Math.sqrt(varA / a.length + varB / b.length);
  const t = se ? diferencia / se : 0;
  const glNumerador = (varA / a.length + varB / b.length) ** 2;
  const glDenominador = ((varA / a.length) ** 2) / (a.length - 1) + ((varB / b.length) ** 2) / (b.length - 1);
  const gl = glDenominador ? glNumerador / glDenominador : a.length + b.length - 2;
  const p = pTDosColas(t, gl);
  const critico = tCritico(gl);
  const icInf = diferencia - critico * se;
  const icSup = diferencia + critico * se;
  const dePooled = Math.sqrt(((a.length - 1) * varA + (b.length - 1) * varB) / (a.length + b.length - 2));
  const dCohen = dePooled ? diferencia / dePooled : 0;

  resultados.innerHTML = tablaHTML([{
    variable: y,
    grupo1: grupos[0],
    n1: a.length,
    media1: redondear(mediaA),
    grupo2: grupos[1],
    n2: b.length,
    media2: redondear(mediaB),
    diferencia_medias: redondear(diferencia),
    t: redondear(t),
    df: redondear(gl),
    p: p < 0.001 ? "<0.001" : redondear(p),
    ic95_inf: redondear(icInf),
    ic95_sup: redondear(icSup),
    cohens_d: redondear(dCohen),
    interpretacion: interpretarP(p)
  }]);
}

function chi2() {
  const y = variableY.value;
  const x = variableX.value;
  const xs = [...new Set(valores(x))];
  const ys = [...new Set(valores(y))];
  const matriz = ys.map((yy) => xs.map((xx) => datos.filter((d) => d[y] === yy && d[x] === xx).length));
  const total = matriz.flat().reduce((a, b) => a + b, 0);
  const filas = matriz.map((r) => r.reduce((a, b) => a + b, 0));
  const cols = xs.map((_, j) => matriz.reduce((a, r) => a + r[j], 0));
  let chi = 0;
  matriz.forEach((r, i) => r.forEach((obs, j) => {
    const esp = filas[i] * cols[j] / total;
    chi += esp ? (obs - esp) ** 2 / esp : 0;
  }));
  resultados.innerHTML = tablaHTML([{ chi2: redondear(chi), gl: (xs.length - 1) * (ys.length - 1), n: total }]);
}

function correlacion() {
  const x = numeros(variableX.value);
  const y = numeros(variableY.value);
  const n = Math.min(x.length, y.length);
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const mx = media(xs);
  const my = media(ys);
  const cov = xs.reduce((s, xi, i) => s + (xi - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(xs.reduce((s, xi) => s + (xi - mx) ** 2, 0) * ys.reduce((s, yi) => s + (yi - my) ** 2, 0));
  resultados.innerHTML = tablaHTML([{ x: variableX.value, y: variableY.value, n, r_pearson: redondear(cov / den) }]);
}

function regresion() {
  const x = numeros(variableX.value);
  const y = numeros(variableY.value);
  const n = Math.min(x.length, y.length);
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const mx = media(xs);
  const my = media(ys);
  const b = xs.reduce((s, xi, i) => s + (xi - mx) * (ys[i] - my), 0) / xs.reduce((s, xi) => s + (xi - mx) ** 2, 0);
  const a = my - b * mx;
  resultados.innerHTML = tablaHTML([{ y: variableY.value, x: variableX.value, intercepto: redondear(a), beta: redondear(b), formula: `${variableY.value} = ${redondear(a)} + ${redondear(b)}*${variableX.value}` }]);
}

function diagnostica() {
  const prueba = variableY.value;
  const estado = variableX.value;
  const umbral = Number(document.getElementById("umbral").value);
  let vp = 0, fp = 0, vn = 0, fn = 0;
  datos.forEach((d) => {
    const positivo = Number(d[prueba]) >= umbral;
    const enfermo = Number(d[estado]) === 1 || String(d[estado]).toLowerCase() === "si";
    if (positivo && enfermo) vp++;
    if (positivo && !enfermo) fp++;
    if (!positivo && !enfermo) vn++;
    if (!positivo && enfermo) fn++;
  });
  resultados.innerHTML = tablaHTML([{
    vp, fp, vn, fn,
    sensibilidad: redondear(vp / (vp + fn)),
    especificidad: redondear(vn / (vn + fp)),
    vpp: redondear(vp / (vp + fp)),
    vpn: redondear(vn / (vn + fn))
  }]);
}

function normalidad() {
  const col = variableY.value;
  const arr = numeros(col);
  const m = media(arr);
  const de = Math.sqrt(varianza(arr));
  const asimetria = arr.reduce((s, x) => s + ((x - m) / de) ** 3, 0) / arr.length;
  resultados.innerHTML = tablaHTML([{ variable: col, n: arr.length, asimetria_aprox: redondear(asimetria), nota: "Tamiz exploratorio; confirmar con Shapiro-Wilk si se requiere publicacion." }]);
}

function riesgo() {
  diagnostica();
  const r = ultimoResultado[0];
  const rr = (r.vp / (r.vp + r.fn)) / (r.fp / (r.fp + r.vn));
  const or = (r.vp * r.vn) / (r.fp * r.fn);
  resultados.innerHTML = tablaHTML([{ ...r, riesgo_relativo: redondear(rr), odds_ratio: redondear(or) }]);
}

function conteo(col) {
  return valores(col).reduce((acc, valor) => {
    acc[valor || "Sin registro"] = (acc[valor || "Sin registro"] || 0) + 1;
    return acc;
  }, {});
}

function prepararCanvas(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssHeight = Number(canvas.getAttribute("height")) || rect.height || 220;
  canvas.width = rect.width * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, cssHeight);
  return { canvas, ctx, width: rect.width, height: cssHeight };
}

function graficaBarras() {
  const col = variableY.value;
  const grafica = prepararCanvas("graficaBarras");
  if (!grafica || !col) return;
  const { ctx, width, height } = grafica;
  const entradas = Object.entries(conteo(col)).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(...entradas.map(([, v]) => v), 1);
  const barH = Math.max(16, (height - 30) / Math.max(entradas.length, 1) - 7);
  document.getElementById("tituloGraficaBarras").textContent = `Distribución: ${col}`;
  ctx.font = "12px Arial";
  entradas.forEach(([label, valor], i) => {
    const y = 18 + i * (barH + 7);
    const w = (width - 150) * valor / max;
    ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
    ctx.fillRect(130, y, w, barH);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(130, y, 3, barH);
    ctx.fillStyle = "#dbeafe";
    ctx.fillText(String(label).slice(0, 18), 8, y + barH - 4);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(String(valor), 138 + w, y + barH - 4);
  });
}

function graficaDispersion() {
  const xCol = variableX.value;
  const yCol = variableY.value;
  const grafica = prepararCanvas("graficaDispersion");
  if (!grafica || !xCol || !yCol) return;
  const { ctx, width, height } = grafica;
  const puntos = datos
    .map((fila) => ({ x: Number(fila[xCol]), y: Number(fila[yCol]) }))
    .filter((p) => !Number.isNaN(p.x) && !Number.isNaN(p.y));
  if (!puntos.length) return;
  document.getElementById("tituloGraficaDispersion").textContent = `${yCol} vs ${xCol}`;
  const minX = Math.min(...puntos.map((p) => p.x));
  const maxX = Math.max(...puntos.map((p) => p.x));
  const minY = Math.min(...puntos.map((p) => p.y));
  const maxY = Math.max(...puntos.map((p) => p.y));
  const sx = (x) => 36 + ((x - minX) / (maxX - minX || 1)) * (width - 58);
  const sy = (y) => height - 28 - ((y - minY) / (maxY - minY || 1)) * (height - 52);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
  ctx.beginPath();
  ctx.moveTo(32, 12);
  ctx.lineTo(32, height - 24);
  ctx.lineTo(width - 12, height - 24);
  ctx.stroke();
  ctx.fillStyle = "#38bdf8";
  puntos.forEach((p) => {
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function dibujarGraficasAutomaticas() {
  if (!datos.length || !columnas.length) return;
  if (!variableY.value) variableY.value = columnas[0];
  graficaBarras();
  graficaDispersion();
}

function exportar(tipo) {
  const contenido = tipo === "json"
    ? JSON.stringify(ultimoResultado, null, 2)
    : [Object.keys(ultimoResultado[0] || {}).join(","), ...ultimoResultado.map((r) => Object.values(r).join(","))].join("\n");
  const blob = new Blob([contenido], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `estadistica.${tipo === "json" ? "json" : "csv"}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById("btnCargar").addEventListener("click", cargarDatos);
document.getElementById("btnUsarPanelMedico")?.addEventListener("click", cargarPacientesDelMedico);
document.getElementById("btnPacientesMedico").addEventListener("click", cargarPacientesDelMedico);
document.getElementById("btnEjemplo").addEventListener("click", () => {
  entrada.value = `grupo,edad,phq9,gad7,respuesta,enfermedad
control,35,6,5,0,0
control,42,8,7,0,0
control,31,4,3,0,0
tratamiento,39,14,12,1,1
tratamiento,47,18,15,1,1
tratamiento,52,21,17,1,1`;
  cargarDatos();
});
archivo.addEventListener("change", async () => {
  const file = archivo.files[0];
  if (!file) return;
  entrada.value = await file.text();
  cargarDatos();
});
document.querySelectorAll("[data-analisis]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mapa = { descriptivos, frecuencias, cruzada: tablaCruzada, ttest, chi2, correlacion, regresion, diagnostica, normalidad, riesgo, graficaBarras, graficaDispersion };
    mapa[btn.dataset.analisis]?.();
  });
});
document.getElementById("btnExportarCSV").addEventListener("click", () => exportar("csv"));
document.getElementById("btnExportarJSON").addEventListener("click", () => exportar("json"));
variableY.addEventListener("change", actualizarRecomendacion);
variableX.addEventListener("change", actualizarRecomendacion);
document.getElementById("filtroTexto").addEventListener("change", cargarDatos);

cargarDatos();
