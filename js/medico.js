import { medicoPuedeVer } from "./services/usuarios.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";

iniciarMonitoreoSesion("Panel medico");

let pacientesGlobal = [];
let ordenPacientesActual = "nombre_asc";
const FILTROS_ATENCION_DEFAULT = ["hospitalizados", "privado", "hpfba", "hpijnn", "otra"];
const STORAGE_FILTROS_ATENCION = "cognicion.medico.filtrosAtencion";
let filtrosAtencionActuales = cargarPreferenciasFiltroAtencion();

const COLUMNAS_PACIENTES = [
  { key: "cama", label: "Cama", cssVar: "--col-cama" },
  { key: "nombre", label: "Nombre", cssVar: "--col-nombre", obligatoria: true },
  { key: "ingreso", label: "Ingreso", cssVar: "--col-ingreso" },
  { key: "estancia", label: "Estancia", cssVar: "--col-estancia" },
  { key: "edad", label: "Edad", cssVar: "--col-edad" },
  { key: "atencion", label: "Atencion en", cssVar: "--col-atencion" },
  { key: "diagnostico", label: "Diagnostico", cssVar: "--col-diagnostico" },
  { key: "ultima", label: "Ultima consulta", cssVar: "--col-ultima" },
  { key: "proxima", label: "Proxima consulta", cssVar: "--col-proxima" },
  { key: "adscrito", label: "Adscrito", cssVar: "--col-adscrito" },
  { key: "residente", label: "Residente", cssVar: "--col-residente" }
];
const COLUMNAS_PACIENTES_DEFAULT = COLUMNAS_PACIENTES.map((columna) => columna.key);
const STORAGE_COLUMNAS_PACIENTES = "cognicion.medico.columnasPacientes";
let columnasPacientesVisibles = cargarPreferenciasColumnasPacientes();

const INSTITUCIONES_ATENCION = {
  privado: {
    etiqueta: "Privado",
    tipoPaciente: "privada",
    institucionPaciente: "",
    servicioInstitucional: ""
  },
  hpfba: {
    etiqueta: "HPFBA",
    tipoPaciente: "institucion",
    institucionPaciente: "Hospital Psiquiatrico Fray Bernardino Alvarez",
    servicioInstitucional: "Observacion"
  },
  hpijnn: {
    etiqueta: "HPIJNN",
    tipoPaciente: "institucion",
    institucionPaciente: "Hospital Psiquiatrico Infantil Juan N. Navarro",
    servicioInstitucional: ""
  },
  otra: {
    etiqueta: "Otra...",
    tipoPaciente: "institucion",
    institucionPaciente: "Otra institucion",
    servicioInstitucional: ""
  }
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const accesoPermitido = await cargarPerfilMedico(user);

  if (!accesoPermitido) return;

  document.body.classList.remove("bloqueado");

  // Mostrar el botón del Centro de Control solo al administrador
  const btnAdmin = document.getElementById("btnAdmin");

  if (btnAdmin) {
    btnAdmin.style.display =
      user.uid === ADMIN_UID ? "inline-flex" : "none";
  }

  console.log("UID del médico:", user.uid);

  const buscador = document.getElementById("buscadorPacientes");

  if (buscador) {
    buscador.addEventListener("input", filtrarPacientes);
  }

  const selectorOrden = document.getElementById("ordenPacientes");

  if (selectorOrden) {
    selectorOrden.value = ordenPacientesActual;
    selectorOrden.addEventListener("change", () => {
      ordenPacientesActual = selectorOrden.value;
      filtrarPacientes();
    });
  }

  inicializarFiltroAtencion();
  inicializarColumnasPacientes();

  await cargarPacientes(user.uid);
});

async function cargarPerfilMedico(user) {
  const correo = user.email;

  document.getElementById("correoMedico").textContent = correo || "";

  const inicial = correo ? correo.charAt(0).toUpperCase() : "M";
  document.getElementById("avatarMedico").textContent = inicial;

  const refUsuario = doc(db, "usuarios", user.uid);
  const snapUsuario = await getDoc(refUsuario);

  if (!snapUsuario.exists()) {
    alert("Tu cuenta no está registrada en Cognición.");
    await auth.signOut();
    window.location.href = "login.html";
    return false;
  }

  const datos = snapUsuario.data();

  if (datos.rol !== "medico") {
    alert("Acceso restringido al personal médico.");
    await auth.signOut();
    window.location.href = "login.html";
    return false;
  }

  document.getElementById("nombreMedico").textContent =
    datos.nombre || "Médico sin nombre";

  return true;
}

async function cargarPacientes(uidMedico) {
  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "Cargando pacientes...";

  const refPacientes = collection(db, "usuarios");
  const snapshot = await getDocs(refPacientes);
  const siguienteExpedienteCognicion = crearGeneradorExpedienteCognicion(
    snapshot.docs.map((documento) => documento.data())
  );

  pacientesGlobal = [];

  for (const docPaciente of snapshot.docs) {
    const datos = docPaciente.data();

    if (datos.rol !== "paciente") continue;
    if (datos.estado === "vinculado") continue;

    const puedeVer = await medicoPuedeVer(uidMedico, docPaciente.id);

    if (puedeVer) {
      const expedienteCognicionActual = obtenerExpedienteCognicion(datos);

      if (!expedienteCognicionActual) {
        const expedienteCognicion = siguienteExpedienteCognicion();
        try {
          await updateDoc(doc(db, "usuarios", docPaciente.id), {
            expedienteCognicion,
            "datosInstitucionales.expedienteCognicion": expedienteCognicion
          });
          datos.expedienteCognicion = expedienteCognicion;
          datos.datosInstitucionales = {
            ...(datos.datosInstitucionales || {}),
            expedienteCognicion
          };
        } catch (error) {
          console.warn("No se pudo asignar expediente Cognicion:", error);
        }
      }

      pacientesGlobal.push({
        id: docPaciente.id,
        ...datos
      });
    }
  }

  filtrarPacientes();
  calcularEstadisticas(pacientesGlobal);
  renderizarGraficasMedico(pacientesGlobal);
}

function formatearDiagnostico(diagnostico) {
  if (!diagnostico) return "Sin diagnóstico";

  if (typeof diagnostico === "string") {
    return diagnostico.trim() || "Sin diagnóstico";
  }

  if (typeof diagnostico === "object") {
    const catalogo = diagnostico.catalogo ? `${diagnostico.catalogo}: ` : "";
    const texto =
      diagnostico.texto ||
      diagnostico.nombre ||
      diagnostico.descripcion ||
      "";
    const codigo = diagnostico.codigo && !texto.startsWith(diagnostico.codigo)
      ? `${diagnostico.codigo} - `
      : "";

    return `${catalogo}${codigo}${texto}`.trim() || "Sin diagnóstico";
  }

  return String(diagnostico);
}

function claveDiagnostico(diagnostico) {
  if (!diagnostico) return "";

  if (typeof diagnostico === "object") {
    return [
      diagnostico.codigo || "",
      diagnostico.texto || "",
      diagnostico.nombre || ""
    ].join("|");
  }

  return String(diagnostico);
}

function obtenerDiagnosticosPaciente(paciente) {
  const historial = Array.isArray(paciente.historialDiagnosticos)
    ? paciente.historialDiagnosticos
    : [];
  const catalogoVisible = paciente.diagnosticoCatalogoVisible || "auto";
  const historialVisible = catalogoVisible === "auto"
    ? historial
    : historial.filter((dx) => (dx.catalogo || "CIE-10") === catalogoVisible);

  const principal =
    (
      catalogoVisible !== "auto" &&
      paciente.diagnostico &&
      (paciente.diagnostico.catalogo || "CIE-10") === catalogoVisible
        ? paciente.diagnostico
        : null
    ) ||
    (catalogoVisible === "auto" ? paciente.diagnostico : null) ||
    historialVisible[historialVisible.length - 1] ||
    historial[historial.length - 1] ||
    "";

  const clavePrincipal = claveDiagnostico(principal);
  const secundarios = historial.filter(
    (diagnostico) => claveDiagnostico(diagnostico) !== clavePrincipal
  );

  if (historial.length === 0 && paciente.diagnostico) {
    return {
      principal,
      secundarios: []
    };
  }

  return {
    principal,
    secundarios
  };
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";

  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();

  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad -= 1;
  }

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

function obtenerCamaPaciente(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return (
    paciente.cama ||
    institucional.cama ||
    paciente.numeroCama ||
    institucional.numeroCama ||
    "Sin cama"
  );
}

function obtenerFechaIngreso(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return (
    paciente.fechaIngreso ||
    institucional.fechaIngreso ||
    paciente.fecha_ingreso ||
    paciente.ingreso ||
    ""
  );
}

function obtenerMedicoAdscritoEncargado(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return (
    paciente.medicoAdscritoEncargado ||
    institucional.medicoAdscritoEncargado ||
    paciente.medicoAdscrito ||
    institucional.medicoAdscrito ||
    "Sin registro"
  );
}

function obtenerResidenteEncargado(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return (
    paciente.residenteEncargado ||
    institucional.residenteEncargado ||
    paciente.medicoResidente ||
    institucional.medicoResidente ||
    "Sin registro"
  );
}

function formatearFechaCorta(fecha) {
  if (!fecha) return "Sin registro";

  const [soloFecha, hora] = String(fecha).split("T");
  const partes = soloFecha.split("-");
  if (partes.length !== 3) return fecha;

  return hora ? `${partes[2]}/${partes[1]}/${partes[0]} ${hora}` : `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function parsearFechaIngreso(fechaIngreso) {
  if (!fechaIngreso) return null;

  const valor = String(fechaIngreso);

  const fechaLatina = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(valor.trim());
  if (fechaLatina) {
    const [, dia, mes, anio, hora = "00", minuto = "00"] = fechaLatina;
    const fecha = new Date(`${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto}`);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const fecha = valor.includes("T")
    ? new Date(valor)
    : new Date(`${valor}T00:00:00`);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function calcularDiasEstancia(fechaIngreso) {
  const ingreso = parsearFechaIngreso(fechaIngreso);
  if (!ingreso) return null;

  const diferencia = Date.now() - ingreso.getTime();
  if (diferencia < 0) return null;

  const horasTotales = Math.floor(diferencia / 3600000);
  const dias = Math.floor(horasTotales / 24);
  const horas = horasTotales % 24;

  return { dias, horas, horasTotales };
}

function formatearEstancia(estancia) {
  if (!estancia) return "Sin registro";
  if (estancia.horasTotales < 1) return "Menos de 1 h";

  const partes = [];
  if (estancia.dias > 0) {
    partes.push(`${estancia.dias} d`);
  }
  partes.push(`${estancia.horas} h`);

  return partes.join(" ");
}

function obtenerExpedienteCognicion(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  return paciente.expedienteCognicion || institucional.expedienteCognicion || "";
}

function crearGeneradorExpedienteCognicion(pacientes = []) {
  const anio = String(new Date().getFullYear()).slice(-2);
  let consecutivoMayor = 999;

  pacientes.forEach((paciente) => {
    const expediente = obtenerExpedienteCognicion(paciente);
    const coincidencia = /^C(\d+)-(\d{2})$/.exec(expediente);

    if (!coincidencia || coincidencia[2] !== anio) return;

    consecutivoMayor = Math.max(consecutivoMayor, Number(coincidencia[1]));
  });

  return function siguienteExpedienteCognicion() {
    consecutivoMayor += 1;
    return `C${consecutivoMayor}-${anio}`;
  };
}

function obtenerAtencionEn(paciente = {}) {
  return INSTITUCIONES_ATENCION[obtenerClaveAtencion(paciente)]?.etiqueta || "Otra...";
}

function obtenerCategoriasAtencion(paciente = {}) {
  const clave = obtenerClaveAtencion(paciente);
  const categorias = new Set([clave]);

  if (clave !== "privado") {
    categorias.add("hospitalizados");
  }

  return categorias;
}

function obtenerClaveAtencion(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  const tipoPaciente = String(paciente.tipoPaciente || institucional.tipoPaciente || "").toLowerCase();
  const institucion = String(
    paciente.institucionPaciente ||
    paciente.institucion ||
    institucional.institucionPaciente ||
    institucional.institucion ||
    ""
  ).trim();

  if (tipoPaciente === "privada" || (!institucion && tipoPaciente !== "institucion")) {
    return "privado";
  }

  const texto = institucion.toLowerCase();

  if (
    texto.includes("fray") ||
    texto.includes("bernardino") ||
    texto.includes("hpfba")
  ) {
    return "hpfba";
  }

  if (
    texto.includes("juan n navarro") ||
    texto.includes("juan n. navarro") ||
    texto.includes("navarro") ||
    texto.includes("hpijnn") ||
    texto.includes("hpij")
  ) {
    return "hpijnn";
  }

  return "otra";
}

function opcionesAtencionHTML(claveActual) {
  return Object.entries(INSTITUCIONES_ATENCION)
    .map(([clave, datos]) => `
      <option value="${clave}" ${clave === claveActual ? "selected" : ""}>
        ${datos.etiqueta}
      </option>
    `)
    .join("");
}

function fechaOrdenable(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.getTime();
}

function obtenerFechaRegistro(paciente = {}) {
  return paciente.fechaCreacion ||
    paciente.fechaRegistro ||
    paciente.creadoEn ||
    paciente.fechaAlta ||
    "";
}

function ordenarPacientes(pacientes) {
  const lista = [...pacientes];

  const compararTexto = (a, b, obtener) =>
    String(obtener(a) || "").localeCompare(String(obtener(b) || ""), "es", { sensitivity: "base" });

  const compararNatural = (a, b, obtener, direccion = "asc") => {
    const valorA = String(obtener(a) || "").trim();
    const valorB = String(obtener(b) || "").trim();
    const sinA = !valorA || valorA === "Sin cama";
    const sinB = !valorB || valorB === "Sin cama";

    if (sinA && sinB) return compararTexto(a, b, (p) => p.nombre);
    if (sinA) return 1;
    if (sinB) return -1;

    const resultado = valorA.localeCompare(valorB, "es", {
      numeric: true,
      sensitivity: "base"
    });

    return direccion === "desc" ? -resultado : resultado;
  };

  const compararFecha = (a, b, obtener, direccion = "desc") => {
    const fechaA = fechaOrdenable(obtener(a));
    const fechaB = fechaOrdenable(obtener(b));
    if (fechaA === null && fechaB === null) return compararTexto(a, b, (p) => p.nombre);
    if (fechaA === null) return 1;
    if (fechaB === null) return -1;
    if (fechaA === fechaB) return compararTexto(a, b, (p) => p.nombre);
    return direccion === "asc" ? fechaA - fechaB : fechaB - fechaA;
  };

  lista.sort((a, b) => {
    switch (ordenPacientesActual) {
      case "nombre_desc":
        return compararTexto(b, a, (p) => p.nombre);
      case "cama_asc":
        return compararNatural(a, b, obtenerCamaPaciente, "asc");
      case "cama_desc":
        return compararNatural(a, b, obtenerCamaPaciente, "desc");
      case "registro_desc":
        return compararFecha(a, b, obtenerFechaRegistro, "desc");
      case "registro_asc":
        return compararFecha(a, b, obtenerFechaRegistro, "asc");
      case "ultima_desc":
        return compararFecha(a, b, (p) => p.ultimaConsulta, "desc");
      case "ultima_asc":
        return compararFecha(a, b, (p) => p.ultimaConsulta, "asc");
      case "proxima_asc":
        return compararFecha(a, b, (p) => p.proximaConsulta, "asc");
      case "proxima_desc":
        return compararFecha(a, b, (p) => p.proximaConsulta, "desc");
      case "atencion_asc":
        return compararTexto(a, b, obtenerAtencionEn);
      case "nombre_asc":
      default:
        return compararTexto(a, b, (p) => p.nombre);
    }
  });

  return lista;
}

function mostrarPacientes(pacientes) {
  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "";

  if (pacientes.length === 0) {
    lista.innerHTML = `
      <p class="paciente-vacio">
        No hay pacientes registrados.
      </p>
    `;
    return;
  }

  pacientes.forEach((paciente) => {
    const nombre = paciente.nombre || "Paciente sin nombre";
    const cama = obtenerCamaPaciente(paciente);
    const fechaIngresoRaw = obtenerFechaIngreso(paciente);
    const fechaIngreso = formatearFechaCorta(fechaIngresoRaw);
    const diasEstancia = formatearEstancia(calcularDiasEstancia(fechaIngresoRaw));
    const edadValor = calcularEdad(obtenerFechaNacimiento(paciente));
    const edad = edadValor ? `${edadValor} a\u00f1os` : "No registrada";
    const claveAtencion = obtenerClaveAtencion(paciente);
    const diagnosticos = obtenerDiagnosticosPaciente(paciente);
    const diagnosticoPrincipal = formatearDiagnostico(diagnosticos.principal);
    const diagnosticosSecundarios = diagnosticos.secundarios
      .map(formatearDiagnostico)
      .filter(Boolean);
    const secundariosHtml = diagnosticosSecundarios.length > 0
      ? `
        <div class="diagnosticos-secundarios">
          <span class="diagnosticos-secundarios-titulo">Secundarios</span>
          ${diagnosticosSecundarios
            .map((diagnostico) => `<span>${diagnostico}</span>`)
            .join("")}
        </div>
      `
      : "";
    const ultimaConsulta = paciente.ultimaConsulta || "Sin registro";
    const proximaConsulta = paciente.proximaConsulta || "Sin programar";
    const medicoAdscrito = obtenerMedicoAdscritoEncargado(paciente);
    const residente = obtenerResidenteEncargado(paciente);

    lista.innerHTML += `
      <a class="fila-paciente" href="paciente.html?id=${paciente.id}">
        <span class="paciente-dato cama-columna" data-col-key="cama">${cama}</span>
        <span class="paciente-nombre" data-col-key="nombre">${nombre}</span>
        <span class="paciente-dato" data-col-key="ingreso">${fechaIngreso}</span>
        <span class="paciente-dato" data-col-key="estancia">${diasEstancia}</span>
        <span class="paciente-dato" data-col-key="edad">${edad}</span>
        <span class="paciente-dato atencion-columna" data-col-key="atencion">
          <select class="selector-atencion" data-paciente-id="${paciente.id}" aria-label="Atencion en">
            ${opcionesAtencionHTML(claveAtencion)}
          </select>
        </span>
        <span class="paciente-dato diagnostico-columna" data-col-key="diagnostico">
        <span class="diagnostico-texto">
          <span class="diagnostico-principal">${diagnosticoPrincipal}</span>
          ${secundariosHtml}
        </span>
        </span>
        <span class="paciente-dato" data-col-key="ultima">${ultimaConsulta}</span>
        <span class="paciente-dato" data-col-key="proxima">${proximaConsulta}</span>
        <span class="paciente-dato" data-col-key="adscrito">${medicoAdscrito}</span>
        <span class="paciente-dato" data-col-key="residente">${residente}</span>
      </a>
    `;
  });

  aplicarColumnasPacientes();
}

function filtrarPacientes() {
  const buscador = document.getElementById("buscadorPacientes");
  const texto = buscador ? buscador.value.toLowerCase() : "";

  const filtrados = pacientesGlobal.filter((paciente) => {
    const categoriasAtencion = obtenerCategoriasAtencion(paciente);
    const coincideFiltroAtencion = [...categoriasAtencion].some((categoria) =>
      filtrosAtencionActuales.has(categoria)
    );

    if (!coincideFiltroAtencion) return false;

    const nombre = (paciente.nombre || "").toLowerCase();
    const cama = obtenerCamaPaciente(paciente).toLowerCase();
    const fechaIngreso = formatearFechaCorta(obtenerFechaIngreso(paciente)).toLowerCase();
    const medicoAdscrito = obtenerMedicoAdscritoEncargado(paciente).toLowerCase();
    const residente = obtenerResidenteEncargado(paciente).toLowerCase();
    const atencion = obtenerAtencionEn(paciente).toLowerCase();
    const diagnostico = formatearDiagnostico(obtenerDiagnosticosPaciente(paciente).principal).toLowerCase();
    return [nombre, cama, fechaIngreso, medicoAdscrito, residente, atencion, diagnostico].some((valor) => valor.includes(texto));
  });

  mostrarPacientes(ordenarPacientes(filtrados));
}

function cargarPreferenciasFiltroAtencion() {
  try {
    const guardado = localStorage.getItem(STORAGE_FILTROS_ATENCION);
    if (!guardado) return new Set(FILTROS_ATENCION_DEFAULT);

    const filtros = JSON.parse(guardado);
    if (!Array.isArray(filtros)) return new Set(FILTROS_ATENCION_DEFAULT);

    const validos = filtros.filter((filtro) => FILTROS_ATENCION_DEFAULT.includes(filtro));
    return new Set(validos);
  } catch (error) {
    console.warn("No se pudieron cargar las preferencias de pacientes:", error);
    return new Set(FILTROS_ATENCION_DEFAULT);
  }
}

function guardarPreferenciasFiltroAtencion() {
  try {
    localStorage.setItem(
      STORAGE_FILTROS_ATENCION,
      JSON.stringify([...filtrosAtencionActuales])
    );
  } catch (error) {
    console.warn("No se pudieron guardar las preferencias de pacientes:", error);
  }
}

function cargarPreferenciasColumnasPacientes() {
  try {
    const guardado = localStorage.getItem(STORAGE_COLUMNAS_PACIENTES);
    if (!guardado) return new Set(COLUMNAS_PACIENTES_DEFAULT);

    const columnas = JSON.parse(guardado);
    if (!Array.isArray(columnas)) return new Set(COLUMNAS_PACIENTES_DEFAULT);

    const clavesValidas = new Set(COLUMNAS_PACIENTES.map((columna) => columna.key));
    const visibles = columnas.filter((columna) => clavesValidas.has(columna));

    if (!visibles.includes("nombre")) visibles.push("nombre");

    return new Set(visibles.length ? visibles : COLUMNAS_PACIENTES_DEFAULT);
  } catch (error) {
    console.warn("No se pudieron cargar las columnas de pacientes:", error);
    return new Set(COLUMNAS_PACIENTES_DEFAULT);
  }
}

function guardarPreferenciasColumnasPacientes() {
  try {
    localStorage.setItem(
      STORAGE_COLUMNAS_PACIENTES,
      JSON.stringify([...columnasPacientesVisibles])
    );
  } catch (error) {
    console.warn("No se pudieron guardar las columnas de pacientes:", error);
  }
}

function asignarClavesEncabezadoColumnas() {
  const encabezados = document.querySelectorAll(".encabezado-pacientes .celda-tabla");
  encabezados.forEach((celda, index) => {
    const columna = COLUMNAS_PACIENTES[index];
    if (columna) celda.dataset.colKey = columna.key;
  });
}

function aplicarColumnasPacientes() {
  asignarClavesEncabezadoColumnas();

  const visibles = COLUMNAS_PACIENTES.filter((columna) =>
    columnasPacientesVisibles.has(columna.key)
  );
  const columnasGrid = visibles.map((columna, index) => {
    const valor = `var(${columna.cssVar})`;
    return index === visibles.length - 1 ? `minmax(${valor}, 1fr)` : valor;
  }).join(" ");
  const minWidth = visibles.map((columna) => `var(${columna.cssVar})`).join(" + ");
  const tabla = document.querySelector(".tabla-pacientes");

  if (tabla && minWidth) {
    tabla.style.setProperty("--tabla-min-width", `calc(${minWidth})`);
  }

  document.querySelectorAll(".encabezado-pacientes, .fila-paciente").forEach((fila) => {
    fila.style.gridTemplateColumns = columnasGrid;
  });

  document.querySelectorAll("[data-col-key]").forEach((celda) => {
    celda.classList.toggle("columna-oculta", !columnasPacientesVisibles.has(celda.dataset.colKey));
  });

  actualizarTextoColumnasPacientes();
}

function actualizarTextoColumnasPacientes() {
  const boton = document.getElementById("btnColumnasPacientes");
  if (!boton) return;

  const visibles = columnasPacientesVisibles.size;
  const total = COLUMNAS_PACIENTES.length;
  boton.textContent = visibles === total
    ? "Mostrar Columnas..."
    : `Columnas: ${visibles}/${total}`;
}

function renderizarOpcionesColumnasPacientes() {
  const contenedor = document.getElementById("opcionesColumnasPacientes");
  if (!contenedor) return;

  contenedor.innerHTML = COLUMNAS_PACIENTES.map((columna) => `
    <label>
      <input
        type="checkbox"
        class="columna-paciente-check"
        value="${columna.key}"
        ${columnasPacientesVisibles.has(columna.key) ? "checked" : ""}
        ${columna.obligatoria ? "disabled" : ""}
      >
      <span>${columna.label}${columna.obligatoria ? " (siempre visible)" : ""}</span>
    </label>
  `).join("");
}

function abrirColumnasPacientes() {
  const modal = document.getElementById("modalColumnasPacientes");
  if (!modal) return;

  renderizarOpcionesColumnasPacientes();
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarColumnasPacientes() {
  const modal = document.getElementById("modalColumnasPacientes");
  if (!modal) return;

  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function aplicarColumnasDesdeModal() {
  const seleccionadas = [...document.querySelectorAll(".columna-paciente-check:checked")]
    .map((check) => check.value);

  if (!seleccionadas.includes("nombre")) seleccionadas.push("nombre");

  columnasPacientesVisibles = new Set(seleccionadas);
  guardarPreferenciasColumnasPacientes();
  aplicarColumnasPacientes();
  cerrarColumnasPacientes();
}

function inicializarColumnasPacientes() {
  actualizarTextoColumnasPacientes();
  aplicarColumnasPacientes();

  document.getElementById("btnColumnasPacientes")?.addEventListener("click", abrirColumnasPacientes);
  document.getElementById("cerrarColumnasPacientes")?.addEventListener("click", cerrarColumnasPacientes);
  document.getElementById("aplicarColumnasPacientes")?.addEventListener("click", aplicarColumnasDesdeModal);

  document.getElementById("todasColumnasPacientes")?.addEventListener("click", () => {
    document.querySelectorAll(".columna-paciente-check").forEach((check) => {
      check.checked = true;
    });
  });

  document.getElementById("restaurarColumnasPacientes")?.addEventListener("click", () => {
    columnasPacientesVisibles = new Set(COLUMNAS_PACIENTES_DEFAULT);
    guardarPreferenciasColumnasPacientes();
    renderizarOpcionesColumnasPacientes();
    aplicarColumnasPacientes();
  });

  document.getElementById("modalColumnasPacientes")?.addEventListener("click", (e) => {
    if (e.target.id === "modalColumnasPacientes") cerrarColumnasPacientes();
  });
}

function actualizarTextoFiltroAtencion() {
  const boton = document.getElementById("btnFiltroAtencion");
  if (!boton) return;

  const totalFiltros = 5;
  const activos = filtrosAtencionActuales.size;

  if (activos === totalFiltros) {
    boton.textContent = "Mostrar: todos";
    return;
  }

  if (activos === 0) {
    boton.textContent = "Mostrar: ninguno";
    return;
  }

  boton.textContent = `Mostrar: ${activos} filtros`;
}

function sincronizarChecksFiltroAtencion() {
  document.querySelectorAll(".filtro-atencion-check").forEach((check) => {
    check.checked = filtrosAtencionActuales.has(check.value);
  });
}

function abrirFiltroAtencion() {
  const modal = document.getElementById("modalFiltroAtencion");
  if (!modal) return;

  sincronizarChecksFiltroAtencion();
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarFiltroAtencion() {
  const modal = document.getElementById("modalFiltroAtencion");
  if (!modal) return;

  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function aplicarFiltroAtencionDesdeModal() {
  filtrosAtencionActuales = new Set(
    [...document.querySelectorAll(".filtro-atencion-check:checked")].map((check) => check.value)
  );
  guardarPreferenciasFiltroAtencion();
  actualizarTextoFiltroAtencion();
  filtrarPacientes();
  cerrarFiltroAtencion();
}

function inicializarFiltroAtencion() {
  const botonAbrir = document.getElementById("btnFiltroAtencion");
  const botonCerrar = document.getElementById("cerrarFiltroAtencion");
  const botonAplicar = document.getElementById("aplicarFiltroAtencion");
  const botonTodos = document.getElementById("todosFiltroAtencion");
  const botonLimpiar = document.getElementById("limpiarFiltroAtencion");
  const modal = document.getElementById("modalFiltroAtencion");

  actualizarTextoFiltroAtencion();

  if (botonAbrir) botonAbrir.addEventListener("click", abrirFiltroAtencion);
  if (botonCerrar) botonCerrar.addEventListener("click", cerrarFiltroAtencion);
  if (botonAplicar) botonAplicar.addEventListener("click", aplicarFiltroAtencionDesdeModal);

  if (botonTodos) {
    botonTodos.addEventListener("click", () => {
      document.querySelectorAll(".filtro-atencion-check").forEach((check) => {
        check.checked = true;
      });
    });
  }

  if (botonLimpiar) {
    botonLimpiar.addEventListener("click", () => {
      document.querySelectorAll(".filtro-atencion-check").forEach((check) => {
        check.checked = false;
      });
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) cerrarFiltroAtencion();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cerrarFiltroAtencion();
      cerrarColumnasPacientes();
    }
  });
}

function calcularEstadisticas(pacientes) {
  const total = pacientes.length;

  const activos = pacientes.filter(
    (paciente) => paciente.estado !== "pendiente"
  ).length;

  const pendientes = pacientes.filter(
    (paciente) => paciente.estado === "pendiente"
  ).length;

  document.getElementById("totalPacientes").textContent = total;
  document.getElementById("pacientesActivos").textContent = activos;
  document.getElementById("pacientesPendientes").textContent = pendientes;

  document.getElementById("expedientesHoy").textContent = 0;
}

function contarPor(pacientes, obtenerClave) {
  return pacientes.reduce((conteo, paciente) => {
    const clave = obtenerClave(paciente) || "Sin registro";
    conteo[clave] = (conteo[clave] || 0) + 1;
    return conteo;
  }, {});
}

function diagnosticoCorto(paciente) {
  const diagnosticos = obtenerDiagnosticosPaciente(paciente);
  const dx = diagnosticos.principal;

  if (!dx) return "Sin diagnóstico";
  if (typeof dx === "string") return dx.slice(0, 28);

  return (dx.codigo || dx.nombre || dx.texto || "Sin diagnóstico").slice(0, 28);
}

function dibujarBarras(canvasId, conteo) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssHeight = Number(canvas.getAttribute("height")) || rect.height || 180;
  canvas.width = rect.width * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...entradas.map(([, v]) => v), 1);
  const barH = Math.max(18, (height - 28) / Math.max(entradas.length, 1) - 8);

  ctx.font = "12px Arial";
  entradas.forEach(([label, valor], i) => {
    const y = 18 + i * (barH + 8);
    const barW = (width - 150) * valor / max;
    ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
    ctx.fillRect(130, y, barW, barH);
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(130, y, 3, barH);
    ctx.fillStyle = "#dbeafe";
    ctx.fillText(label, 8, y + barH - 4);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(String(valor), 138 + barW, y + barH - 4);
  });
}

function renderizarGraficasMedico(pacientes) {
  dibujarBarras("graficaEstados", contarPor(pacientes, (p) => p.estado || "Activo"));
  dibujarBarras("graficaDiagnosticos", contarPor(pacientes, diagnosticoCorto));
}

document.addEventListener("click", (e) => {
  if (e.target.closest(".selector-atencion")) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const diagnosticoColumna = e.target.closest(".diagnostico-columna");

  if (!diagnosticoColumna) return;

  // Evita que al hacer clic se abra el expediente del paciente
  e.preventDefault();
  e.stopPropagation();

  const diagnosticoTexto = diagnosticoColumna.querySelector(".diagnostico-texto");

  if (!diagnosticoTexto) return;

  diagnosticoTexto.classList.toggle("expandido");

});

["pointerdown", "mousedown", "mouseup", "touchstart", "keydown"].forEach((evento) => {
  document.addEventListener(evento, (e) => {
    if (!e.target.closest(".selector-atencion")) return;

    e.stopPropagation();
  }, true);
});

document.addEventListener("change", async (e) => {
  const selector = e.target.closest(".selector-atencion");
  if (!selector) return;

  e.preventDefault();
  e.stopPropagation();

  const pacienteId = selector.dataset.pacienteId;
  const clave = selector.value;
  const institucion = INSTITUCIONES_ATENCION[clave];
  const paciente = pacientesGlobal.find((item) => item.id === pacienteId);
  const claveAnterior = paciente ? obtenerClaveAtencion(paciente) : "privado";

  if (!pacienteId || !institucion) return;

  let institucionPaciente = institucion.institucionPaciente;
  let servicioInstitucional = institucion.servicioInstitucional;

  if (clave === "otra") {
    const captura = prompt("Nombre de la institucion:", paciente?.institucionPaciente || paciente?.datosInstitucionales?.institucionPaciente || "");
    if (captura === null) {
      selector.value = claveAnterior;
      return;
    }
    institucionPaciente = captura.trim() || "Otra institucion";
    servicioInstitucional = paciente?.servicioInstitucional || paciente?.datosInstitucionales?.servicioInstitucional || "";
  }

  try {
    await updateDoc(doc(db, "usuarios", pacienteId), {
      tipoPaciente: institucion.tipoPaciente,
      institucionPaciente,
      institucion: institucionPaciente,
      servicioInstitucional,
      servicio: servicioInstitucional,
      "datosInstitucionales.tipoPaciente": institucion.tipoPaciente,
      "datosInstitucionales.institucionPaciente": institucionPaciente,
      "datosInstitucionales.servicioInstitucional": servicioInstitucional
    });

    if (paciente) {
      paciente.tipoPaciente = institucion.tipoPaciente;
      paciente.institucionPaciente = institucionPaciente;
      paciente.institucion = institucionPaciente;
      paciente.servicioInstitucional = servicioInstitucional;
      paciente.servicio = servicioInstitucional;
      paciente.datosInstitucionales = {
        ...(paciente.datosInstitucionales || {}),
        tipoPaciente: institucion.tipoPaciente,
        institucionPaciente,
        servicioInstitucional
      };
    }

    filtrarPacientes();
  } catch (error) {
    selector.value = claveAnterior;
    alert("No se pudo actualizar la institucion: " + error.message);
  }
});

let columnaActual = null;
let tablaActual = null;
let inicioX = 0;
let anchoInicial = 0;

document.querySelectorAll(".resizer").forEach((resizer) => {
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    tablaActual = resizer.closest(".tabla-pacientes");
    columnaActual = resizer.dataset.col;
    inicioX = e.clientX;

    anchoInicial = parseFloat(
      getComputedStyle(tablaActual)
        .getPropertyValue(columnaActual)
    );

    tablaActual.classList.add("redimensionando");
  });
});

document.addEventListener("mousemove", (e) => {
  if (!columnaActual || !tablaActual) return;

  const diferencia = e.clientX - inicioX;
  const nuevoAncho = Math.max(80, anchoInicial + diferencia);

  tablaActual.style.setProperty(
    columnaActual,
    `${nuevoAncho}px`
  );
});

document.addEventListener("mouseup", () => {
  if (tablaActual) {
    tablaActual.classList.remove("redimensionando");
  }

  columnaActual = null;
  tablaActual = null;
});
