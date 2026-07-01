import { auth, db } from "./firebase.js";
import { ESCALAS_PSIQUIATRICAS } from "./data/escalasPsiquiatricas.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario,
  actualizarUsuario,
  solicitarEliminacionPaciente,
  buscarMedicoPorCorreo,
  otorgarPermisoMedico,
  listarPermisosMedicos,
  cambiarRolPermisoMedico,
  revocarPermisoMedico
} from "./services/usuarios.js";

import {
  crearTratamiento,
  listarTratamientos,
  actualizarTratamiento,
  eliminarTratamiento
} from "./services/tratamientos.js";

import {
  crearEstudio,
  listarEstudios,
  actualizarEstudio,
  eliminarEstudio
} from "./services/estudios.js";

import {
  crearNotaRapida,
  listarNotasRapidas
} from "./services/notasRapidas.js";

import {
  crearCodigoExpedienteParaPaciente,
  vincularExpedienteConCodigoPaciente
} from "./services/vinculacion.js";

let uidPaciente = "";
let datosPacienteActual = null;
let medicoActualDatos = {};
let tratamientosCache = [];
let estudiosCache = [];
let escalasAsignadasCache = new Map();
let diagnosticosCatalogoActual = [];
let diagnosticoReemplazoIndex = null;
const CLAVE_CATALOGO_MANUAL = "cognicion_catalogo_diagnosticos_manual";
let catalogoManualDiagnosticos = cargarCatalogoManualDiagnosticos();

iniciarMonitoreoSesion("Expediente paciente");

function cargarCatalogoManualDiagnosticos() {
  try {
    const guardado = localStorage.getItem(CLAVE_CATALOGO_MANUAL);
    const datos = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.warn("No se pudo cargar el catalogo manual de diagnosticos", error);
    return [];
  }
}

function guardarCatalogoManualDiagnosticos() {
  localStorage.setItem(CLAVE_CATALOGO_MANUAL, JSON.stringify(catalogoManualDiagnosticos));
}

function catalogoManualPorTipo(nombreCatalogo) {
  return catalogoManualDiagnosticos.filter((dx) => dx.catalogo === nombreCatalogo);
}

function catalogoDiagnosticosCombinado() {
  return [
    ...CIE10.map((dx) => ({ ...dx, catalogo: "CIE-10" })),
    ...CIE11.map((dx) => ({ ...dx, catalogo: "CIE-11" })),
    ...catalogoManualDiagnosticos
  ];
}

function formatearDiagnostico(diagnostico) {
  if (!diagnostico) return "Sin diagnostico";

  if (typeof diagnostico === "string") {
    return diagnostico.trim() || "Sin diagnostico";
  }

  if (typeof diagnostico === "object") {
    const codigo = diagnostico.codigo ? `${diagnostico.codigo} - ` : "";
    const texto =
      diagnostico.texto ||
      diagnostico.nombre ||
      diagnostico.descripcion ||
      "";

    return `${codigo}${texto}`.trim() || "Sin diagnostico";
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

function obtenerFechaNacimiento(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return (
    datos.fechaNacimiento ||
    institucional.fechaNacimiento ||
    datos.fecha_nacimiento ||
    datos.fechaDeNacimiento ||
    datos.fechaNac ||
    datos.nacimiento ||
    ""
  );
}

function obtenerFechaIngreso(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return (
    datos.fechaIngreso ||
    institucional.fechaIngreso ||
    datos.fecha_ingreso ||
    datos.ingreso ||
    ""
  );
}

function normalizarFechaIngreso(valor = "") {
  const limpio = String(valor).trim();
  if (!limpio) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) return limpio;

  const coincidencia = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(limpio);
  if (!coincidencia) return limpio;

  const [, dia, mes, anio, hora = "00", minuto = "00"] = coincidencia;
  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}T${hora.padStart(2, "0")}:${minuto}`;
}

function partesFechaIngreso(valor = "") {
  const normalizada = normalizarFechaIngreso(valor);
  if (!normalizada) return { fecha: "", hora: "" };

  const [fecha, hora = ""] = normalizada.split("T");
  return { fecha, hora };
}

function parsearFechaIngreso(fechaIngreso) {
  if (!fechaIngreso) return null;

  const valor = String(fechaIngreso);
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
    partes.push(`${estancia.dias} dia${estancia.dias === 1 ? "" : "s"}`);
  }
  partes.push(`${estancia.horas} h`);

  return partes.join(" ");
}

function formatearFecha(fecha) {
  if (!fecha) return "Sin registro";

  const [soloFecha, hora] = String(fecha).split("T");
  const partes = soloFecha.split("-");
  if (partes.length !== 3) return fecha;

  return hora ? `${partes[2]}/${partes[1]}/${partes[0]} ${hora}` : `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function valorCampo(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function ponerValor(id, valor) {
  const campo = document.getElementById(id);
  if (campo) campo.value = valor || "";
}

function ocultarSecciones() {
  [
    "seccionResumen",
    "seccionPermisos",
    "seccionResultadosEscalas",
    "seccionTratamiento",
    "seccionDiagnosticos",
    "seccionCarpetas",
    "seccionNotasFlotantes",
    "seccionInterconsulta",
    "seccionEstudios",
    "seccionNotasRapidas"
  ].forEach((id) => {
    const seccion = document.getElementById(id);
    if (seccion) seccion.style.display = "none";
  });
}

function renderizarDiagnosticos(datos) {
  const diagnosticoDiv = document.getElementById("diagnostico");

  if (!diagnosticoDiv) return;

  diagnosticoDiv.innerHTML = "";

  const historial = Array.isArray(datos.historialDiagnosticos)
    ? datos.historialDiagnosticos
    : [];

  const principal = datos.diagnostico || historial[historial.length - 1] || "";
  const clavePrincipal = claveDiagnostico(principal);

  if (historial.length === 0) {
    const linea = document.createElement("div");
    linea.className = "diagnostico-linea principal";
    linea.textContent = formatearDiagnostico(principal);
    diagnosticoDiv.appendChild(linea);
    return;
  }

  historial.forEach((dx, index) => {
    const esPrincipal = claveDiagnostico(dx) === clavePrincipal;
    const linea = document.createElement("div");
    linea.className = `diagnostico-linea${esPrincipal ? " principal" : ""}`;

    const texto = document.createElement("span");
    texto.textContent = formatearDiagnostico(dx);

    const acciones = document.createElement("div");
    acciones.className = "diagnostico-acciones";

    if (esPrincipal) {
      const etiqueta = document.createElement("span");
      etiqueta.className = "diagnostico-principal-badge";
      etiqueta.textContent = "Principal";
      acciones.appendChild(etiqueta);
    } else {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "boton-diagnostico-principal";
      boton.textContent = "Marcar principal";
      boton.addEventListener("click", () => window.marcarDiagnosticoPrincipal(index));
      acciones.appendChild(boton);
    }

    linea.append(texto, acciones);
    diagnosticoDiv.appendChild(linea);
  });
}

function normalizarDiagnostico(diagnostico = {}, catalogoFallback = "CIE-10") {
  if (typeof diagnostico === "string") {
    return {
      codigo: "",
      nombre: diagnostico,
      texto: diagnostico,
      catalogo: catalogoFallback,
      fechaSeleccion: new Date().toISOString()
    };
  }

  const catalogo = diagnostico.catalogo || catalogoFallback;
  const nombre = diagnostico.nombre || diagnostico.texto || diagnostico.descripcion || "";

  return {
    codigo: diagnostico.codigo || "",
    nombre,
    texto: diagnostico.texto || nombre,
    catalogo,
    fechaSeleccion: diagnostico.fechaSeleccion || new Date().toISOString(),
    manual: diagnostico.manual === true,
    agregadoManual: diagnostico.agregadoManual === true
  };
}

function obtenerHistorialDiagnosticos(datos = datosPacienteActual || {}) {
  const historial = Array.isArray(datos.historialDiagnosticos)
    ? datos.historialDiagnosticos
    : [];

  if (historial.length) return historial.map((dx) => normalizarDiagnostico(dx, dx.catalogo || "CIE-10"));

  return datos.diagnostico
    ? [normalizarDiagnostico(datos.diagnostico, datos.diagnostico?.catalogo || "CIE-10")]
    : [];
}

function obtenerCatalogoDiagnostico() {
  const catalogo = document.getElementById("diagnosticoCatalogo")?.value || "CIE-10";
  const base = catalogo === "CIE-11" ? CIE11 : CIE10;
  return [...base, ...catalogoManualPorTipo(catalogo)];
}

function renderizarResultadosBusquedaDiagnosticos() {
  const contenedor = document.getElementById("resultadosBusquedaDiagnosticos");
  const buscador = document.getElementById("diagnosticoBusqueda");
  const catalogoSeleccionado = document.getElementById("diagnosticoCatalogo")?.value || "CIE-10";

  if (!contenedor || !buscador) return;

  const texto = buscador.value.trim().toLowerCase();

  if (!texto) {
    contenedor.textContent = diagnosticoReemplazoIndex === null
      ? "Escribe para buscar en el catalogo."
      : "Busca el diagnostico que sustituira al seleccionado.";
    return;
  }

  diagnosticosCatalogoActual = obtenerCatalogoDiagnostico()
    .filter((dx) => `${dx.codigo} ${dx.nombre}`.toLowerCase().includes(texto))
    .slice(0, 18)
    .map((dx) => normalizarDiagnostico(dx, catalogoSeleccionado));

  contenedor.innerHTML = diagnosticosCatalogoActual.length
    ? diagnosticosCatalogoActual.map((dx, index) => `
      <button type="button" class="diagnostico-opcion" data-agregar-diagnostico="${index}">
        <strong>
          ${escaparHTML(dx.catalogo)} ${escaparHTML(dx.codigo)}
          ${dx.agregadoManual ? '<em class="diagnostico-manual-badge">Agregado manualmente</em>' : ""}
        </strong>
        <span>${escaparHTML(dx.nombre)}</span>
      </button>
    `).join("")
    : "<p>No se encontraron resultados en el catalogo seleccionado.</p>";

  contenedor.querySelectorAll("[data-agregar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => agregarDiagnosticoPaciente(Number(boton.dataset.agregarDiagnostico)));
  });
}

function renderizarPanelDiagnosticos() {
  const contenedor = document.getElementById("panelDiagnosticosPaciente");
  if (!contenedor) return;

  const historial = obtenerHistorialDiagnosticos();
  const principal = datosPacienteActual?.diagnostico || historial[historial.length - 1] || "";
  const clavePrincipal = claveDiagnostico(principal);

  if (!historial.length) {
    contenedor.innerHTML = "<p>Aun no hay diagnosticos registrados.</p>";
    return;
  }

  contenedor.innerHTML = historial.map((dx, index) => {
    const esPrincipal = claveDiagnostico(dx) === clavePrincipal;
    return `
      <article class="registro-card diagnostico-card">
        <div class="registro-top">
          <div>
            <strong>${escaparHTML(dx.catalogo || "CIE")} ${escaparHTML(dx.codigo || "")}</strong>
            <span>${escaparHTML(dx.nombre || dx.texto || "Diagnostico")}</span>
          </div>
          <span class="diagnostico-principal-badge">${esPrincipal ? "Principal" : "Secundario"}</span>
        </div>
        <div class="registro-actions">
          ${esPrincipal ? "" : `<button type="button" data-principal-diagnostico="${index}">Marcar principal</button>`}
          <button type="button" data-reemplazar-diagnostico="${index}">Cambiar por catalogo</button>
          <button type="button" data-editar-diagnostico="${index}">Editar codigo/texto</button>
          <button type="button" class="boton-peligro" data-quitar-diagnostico="${index}">Quitar</button>
        </div>
      </article>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-principal-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => window.marcarDiagnosticoPrincipal(Number(boton.dataset.principalDiagnostico)));
  });

  contenedor.querySelectorAll("[data-editar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => editarDiagnosticoPaciente(Number(boton.dataset.editarDiagnostico)));
  });

  contenedor.querySelectorAll("[data-reemplazar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => prepararReemplazoDiagnostico(Number(boton.dataset.reemplazarDiagnostico)));
  });

  contenedor.querySelectorAll("[data-quitar-diagnostico]").forEach((boton) => {
    boton.addEventListener("click", () => quitarDiagnosticoPaciente(Number(boton.dataset.quitarDiagnostico)));
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const parametros = new URLSearchParams(window.location.search);
  uidPaciente = parametros.get("id");
  medicoActualDatos = await obtenerUsuario(user.uid) || {};

  await cargarDatosPaciente();
});

async function cargarDatosPaciente() {
  const datos = await obtenerUsuario(uidPaciente);
  datosPacienteActual = datos;

  if (!datos) {
    document.getElementById("nombrePaciente").innerText =
      "Paciente no encontrado";
    return;
  }

  document.getElementById("nombrePaciente").innerText =
    datos.nombre || "Paciente sin nombre";

  document.getElementById("correoPaciente").innerText =
    datos.email || "Sin correo";

  document.getElementById("expedienteCognicionPaciente").innerText =
    datos.expedienteCognicion ||
    datos.datosInstitucionales?.expedienteCognicion ||
    "Sin expediente";

  const fechaNacimiento = obtenerFechaNacimiento(datos);
  const edadCalculada = calcularEdad(fechaNacimiento);

  const edadVisible = edadCalculada !== "" && edadCalculada !== null && edadCalculada !== undefined
  ? edadCalculada
  : "";

  document.getElementById("fechaNacimientoPaciente").innerText =
  formatearFecha(fechaNacimiento);

  document.getElementById("edadPaciente").innerText =
  edadVisible !== "" && edadVisible !== null && edadVisible !== undefined
    ? `${edadVisible} a\u00f1os`
    : "No registrada";

  if (fechaNacimiento && datos.fechaNacimiento !== fechaNacimiento) {
    await actualizarUsuario(uidPaciente, {
      fechaNacimiento,
      edad: deleteField(),
      "datosInstitucionales.edad": deleteField()
    });
    datos.fechaNacimiento = fechaNacimiento;
    delete datos.edad;
    if (datos.datosInstitucionales) delete datos.datosInstitucionales.edad;
    datosPacienteActual = datos;
  }

  renderizarDiagnosticos(datos);
  renderizarPanelDiagnosticos();

  document.getElementById("tratamiento").innerText =
    datos.tratamiento || "Sin tratamiento registrado";

  document.getElementById("medicoTratante").innerText =
    datos.medicoTratante || "Sin mÃ©dico tratante";

  document.getElementById("ultimaConsulta").innerText =
    datos.ultimaConsulta || "Sin fecha";

  document.getElementById("proximaConsulta").textContent =
    datos.proximaConsulta || "Sin programar";

  document.getElementById("telefonoPaciente").innerText =
    datos.telefono || "Sin tel\u00e9fono";

  document.getElementById("tipoPaciente").innerText =
    datos.tipoPaciente === "institucion" ? "Paciente de institucion" : "Consulta privada";

  document.getElementById("institucionPaciente").innerText =
    datos.institucionPaciente || datos.institucion || "Sin institucion";

  document.getElementById("servicioInstitucional").innerText =
    datos.servicioInstitucional || datos.servicio || "Sin servicio";

  document.getElementById("expedientePaciente").innerText =
    datos.expediente || datos.numeroExpediente || "Sin expediente";

  document.getElementById("camaPaciente").innerText =
    datos.cama || "Sin cama";

  document.getElementById("curpPaciente").innerText =
    datos.curp || datos.datosInstitucionales?.curp || "Sin registro";

  const fechaIngreso = obtenerFechaIngreso(datos);
  const diasEstancia = calcularDiasEstancia(fechaIngreso);

  document.getElementById("fechaIngresoPaciente").innerText =
    formatearFecha(fechaIngreso);

  document.getElementById("medicoAdscritoEncargadoPaciente").innerText =
    datos.medicoAdscritoEncargado ||
    datos.datosInstitucionales?.medicoAdscritoEncargado ||
    datos.medicoAdscrito ||
    "Sin registro";

  document.getElementById("residenteEncargadoPaciente").innerText =
    datos.residenteEncargado ||
    datos.datosInstitucionales?.residenteEncargado ||
    datos.medicoResidente ||
    "Sin registro";

  document.getElementById("sexoPaciente").innerText =
    datos.sexo || "Sin registro";

  document.getElementById("generoPaciente").innerText =
    datos.genero || datos.identidadGenero || "Sin registro";

  document.getElementById("alergiasPaciente").innerText =
    datos.alergias || "Sin registro";

  document.getElementById("pesoPaciente").innerText =
    datos.peso || datos.signosVitales?.peso || "Sin registro";

  document.getElementById("tallaPaciente").innerText =
    datos.talla || datos.signosVitales?.talla || "Sin registro";

  document.getElementById("perimetroAbdominalPaciente").innerText =
    datos.perimetroAbdominal || datos.signosVitales?.perimetroAbdominal || "Sin registro";

  document.getElementById("diasEstanciaPaciente").innerText =
    formatearEstancia(diasEstancia);
}

window.mostrarResumen = function() {
  ocultarSecciones();
  document.getElementById("seccionResumen").style.display = "block";
};

window.mostrarPermisos = async function() {
  ocultarSecciones();
  document.getElementById("seccionPermisos").style.display = "block";

  await cargarPermisosMedicos();
};

window.mostrarResultadosEscalas = async function() {
  ocultarSecciones();
  document.getElementById("seccionResultadosEscalas").style.display = "block";
  await cargarResultadosEscalasPaciente();
  await cargarEscalasAsignablesPaciente();
  await cargarTareasMiSaludMedico();
};

window.mostrarTratamiento = async function() {
  ocultarSecciones();
  document.getElementById("seccionTratamiento").style.display = "block";
  await cargarTratamientosPaciente();
};

window.mostrarDiagnosticos = function() {
  ocultarSecciones();
  document.getElementById("seccionDiagnosticos").style.display = "block";
  renderizarPanelDiagnosticos();
  renderizarResultadosBusquedaDiagnosticos();
};

window.mostrarCarpetas = async function() {
  ocultarSecciones();
  document.getElementById("seccionCarpetas").style.display = "block";
  await cargarCarpetasPaciente();
};

window.mostrarNotasFlotantes = async function() {
  ocultarSecciones();
  document.getElementById("seccionNotasFlotantes").style.display = "block";
  await cargarNotasFlotantesPaciente();
};

window.mostrarInterconsulta = async function() {
  ocultarSecciones();
  document.getElementById("seccionInterconsulta").style.display = "block";
  autollenarInterconsulta();
  await cargarInterconsultasPaciente();
};

window.mostrarEstudios = async function() {
  ocultarSecciones();
  document.getElementById("seccionEstudios").style.display = "block";
  await cargarEstudiosPaciente();
};

window.mostrarNotasRapidas = async function() {
  ocultarSecciones();
  document.getElementById("seccionNotasRapidas").style.display = "block";
  await cargarNotasRapidasPaciente();
};

async function cargarResultadosEscalasPaciente() {
  const contenedor = document.getElementById("resultadosEscalasExpediente");
  if (!contenedor) return;
  contenedor.innerHTML = "Cargando resultados...";

  try {
    const q = query(
      collection(db, "usuarios", uidPaciente, "resultadosEscalas"),
      orderBy("fechaISO", "desc"),
      limit(20)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      contenedor.innerHTML = "<p>No hay resultados de escalas registrados.</p>";
      return;
    }

    contenedor.innerHTML = snap.docs.map((docResultado) => {
      const r = docResultado.data();
      const fecha = r.fechaISO ? new Date(r.fechaISO).toLocaleString("es-MX") : "Sin fecha";
      return `
        <article class="resultado-escala-card">
          <div>
            <strong>${r.escalaNombre || "Escala"}</strong>
            <span>${r.area || ""} Â· ${fecha}</span>
          </div>
          <div class="resultado-puntaje">${r.puntaje} / ${r.rango || ""}</div>
          <p>${r.interpretacion || "Sin interpretacion"}</p>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Error al cargar escalas:", error);
    contenedor.innerHTML = "<p>No se pudieron cargar los resultados.</p>";
  }
}

async function cargarEscalasAsignablesPaciente() {
  const contenedor = document.getElementById("listaEscalasAsignables");
  if (!contenedor) return;
  contenedor.textContent = "Cargando escalas...";

  try {
    const snap = await getDocs(collection(db, "usuarios", uidPaciente, "escalasAsignadas"));
    escalasAsignadasCache = new Map(snap.docs.map((docEscala) => [docEscala.id, docEscala.data()]));

    contenedor.innerHTML = ESCALAS_PSIQUIATRICAS.map((escala) => {
      const asignada = escalasAsignadasCache.get(escala.id);
      const visible = asignada?.visiblePaciente === true;
      return `
        <article class="registro-card escala-asignable">
          <div class="registro-top">
            <div>
              <strong>${escaparHTML(escala.nombre)}</strong>
              <span>${escaparHTML(escala.area || "")}</span>
            </div>
            <label class="switch-linea">
              <input type="checkbox" data-escala-visible="${escala.id}" ${visible ? "checked" : ""}>
              Visible
            </label>
          </div>
          <p>${escaparHTML(escala.descripcion || "Sin descripcion")}</p>
        </article>
      `;
    }).join("");

    document.querySelectorAll("[data-escala-visible]").forEach((control) => {
      control.addEventListener("change", () => actualizarVisibilidadEscala(control));
    });
  } catch (error) {
    console.error("Error al cargar escalas asignables:", error);
    contenedor.textContent = "No se pudieron cargar las escalas.";
  }
}

async function actualizarVisibilidadEscala(control) {
  const escalaId = control.dataset.escalaVisible;
  const escala = ESCALAS_PSIQUIATRICAS.find((item) => item.id === escalaId);
  if (!escala) return;

  const visiblePaciente = control.checked;

  await setDoc(doc(db, "usuarios", uidPaciente, "escalasAsignadas", escalaId), {
    escalaId,
    escalaNombre: escala.nombre,
    area: escala.area || "",
    visiblePaciente,
    actualizadoPor: auth.currentUser?.uid || "",
    actualizadoEn: serverTimestamp(),
    fechaISO: new Date().toISOString()
  }, { merge: true });

  await registrarAccionExpediente({
    accion: visiblePaciente ? "activar_escala_mi_salud" : "ocultar_escala_mi_salud",
    descripcion: visiblePaciente
      ? "El medico hizo visible una escala en Mi Salud."
      : "El medico oculto una escala en Mi Salud.",
    detalles: {
      escalaId,
      escalaNombre: escala.nombre
    }
  });
}

async function guardarTareaMiSaludPaciente() {
  const titulo = valorCampo("tareaMiSaludTitulo").trim();
  const indicaciones = valorCampo("tareaMiSaludIndicaciones").trim();
  const fechaLimite = valorCampo("tareaMiSaludFecha");

  if (!titulo) {
    alert("Escribe la tarea que quieres asignar.");
    return;
  }

  await addDoc(collection(db, "usuarios", uidPaciente, "tareasMiSalud"), {
    titulo,
    indicaciones,
    fechaLimite,
    estado: "pendiente",
    visiblePaciente: true,
    creadoPor: auth.currentUser?.uid || "",
    creadoEn: serverTimestamp(),
    fechaISO: new Date().toISOString()
  });

  await registrarAccionExpediente({
    accion: "asignar_tarea_mi_salud",
    descripcion: "El medico asigno una tarea en Mi Salud.",
    detalles: {
      titulo,
      fechaLimite
    }
  });

  ponerValor("tareaMiSaludTitulo", "");
  ponerValor("tareaMiSaludIndicaciones", "");
  ponerValor("tareaMiSaludFecha", "");
  await cargarTareasMiSaludMedico();
}

async function cargarTareasMiSaludMedico() {
  const contenedor = document.getElementById("listaTareasMiSaludMedico");
  if (!contenedor) return;
  contenedor.textContent = "Cargando tareas...";

  try {
    const q = query(
      collection(db, "usuarios", uidPaciente, "tareasMiSalud"),
      orderBy("fechaISO", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      contenedor.innerHTML = "<p>Aun no hay tareas asignadas.</p>";
      return;
    }

    contenedor.innerHTML = snap.docs.map((docTarea) => {
      const tarea = docTarea.data();
      return `
        <article class="registro-card">
          <div class="registro-top">
            <div>
              <strong>${escaparHTML(tarea.titulo || "Tarea")}</strong>
              <span>${escaparHTML(tarea.fechaLimite ? `Limite: ${tarea.fechaLimite}` : "Sin fecha limite")}</span>
            </div>
            <span class="estado-badge ${tarea.estado === "completada" ? "activo" : ""}">${escaparHTML(tarea.estado || "pendiente")}</span>
          </div>
          ${tarea.indicaciones ? `<p>${escaparHTML(tarea.indicaciones)}</p>` : ""}
          <div class="registro-actions">
            <button type="button" class="boton-peligro" data-eliminar-tarea-mi-salud="${docTarea.id}">Eliminar</button>
          </div>
        </article>
      `;
    }).join("");

    document.querySelectorAll("[data-eliminar-tarea-mi-salud]").forEach((boton) => {
      boton.addEventListener("click", () => eliminarTareaMiSaludPaciente(boton.dataset.eliminarTareaMiSalud));
    });
  } catch (error) {
    console.error("Error al cargar tareas de Mi Salud:", error);
    contenedor.textContent = "No se pudieron cargar las tareas.";
  }
}

async function eliminarTareaMiSaludPaciente(tareaId) {
  if (!confirm("Eliminar esta tarea de Mi Salud?")) return;

  await deleteDoc(doc(db, "usuarios", uidPaciente, "tareasMiSalud", tareaId));
  await registrarAccionExpediente({
    accion: "eliminar_tarea_mi_salud",
    descripcion: "El medico elimino una tarea de Mi Salud.",
    detalles: { tareaId }
  });
  await cargarTareasMiSaludMedico();
}

async function cargarPermisosMedicos() {
  const contenedor = document.getElementById("listaPermisosMedicos");
  contenedor.innerHTML = "Cargando permisos...";

  const permisos = await listarPermisosMedicos(uidPaciente);

  if (permisos.length === 0) {
    contenedor.innerHTML = `
      <p>No hay mÃ©dicos con permisos registrados.</p>
    `;
    return;
  }

  contenedor.innerHTML = "";

  for (const permiso of permisos) {
    const medico = await obtenerUsuario(permiso.uid);

    const nombreMedico =
      medico?.nombre ||
      medico?.email ||
      permiso.uid;

    const rolActual = permiso.rolPermiso || "estudiante";

    contenedor.innerHTML += `
      <div class="dato" style="margin-bottom:16px;">
        <strong>${nombreMedico}</strong>
        <br>
        <span>Rol actual: ${rolActual}</span>
        <br><br>

        <select id="rol-${permiso.uid}">
          <option value="tratante" ${rolActual === "tratante" ? "selected" : ""}>Tratante</option>
          <option value="colaborador" ${rolActual === "colaborador" ? "selected" : ""}>Colaborador</option>
          <option value="estudiante" ${rolActual === "estudiante" ? "selected" : ""}>Estudiante</option>
        </select>

        <button onclick="cambiarRolPermiso('${permiso.uid}')">
          Cambiar rol
        </button>

        <button style="background:#8b0000; color:white;" onclick="revocarPermiso('${permiso.uid}')">
          Revocar
        </button>
      </div>
    `;
  }
}

window.agregarPermisoMedico = async function() {
  const correo = document
    .getElementById("correoMedicoPermiso")
    .value
    .trim()
    .toLowerCase();

  const rol = document.getElementById("rolPermisoMedico").value;

  if (!correo) {
    alert("Escribe el correo del mÃ©dico.");
    return;
  }

  const medico = await buscarMedicoPorCorreo(correo);

  if (!medico) {
    alert("No se encontrÃ³ un mÃ©dico registrado con ese correo.");
    return;
  }

  await otorgarPermisoMedico(
    uidPaciente,
    medico.uid,
    rol,
    auth.currentUser.uid
  );

  alert("Permiso otorgado correctamente.");

  document.getElementById("correoMedicoPermiso").value = "";

  await cargarPermisosMedicos();
};

window.cambiarRolPermiso = async function(uidMedico) {
  const nuevoRol = document.getElementById(`rol-${uidMedico}`).value;

  await cambiarRolPermisoMedico(
    uidPaciente,
    uidMedico,
    nuevoRol,
    auth.currentUser.uid
  );

  alert("Rol actualizado.");

  await cargarPermisosMedicos();
};

window.revocarPermiso = async function(uidMedico) {
  const confirmar = confirm("Â¿Seguro que deseas revocar el acceso de este mÃ©dico?");

  if (!confirmar) return;

  await revocarPermisoMedico(uidPaciente, uidMedico);

  alert("Permiso revocado.");

  await cargarPermisosMedicos();
};

window.editarNombrePaciente = async function() {
  const nuevoNombre = prompt("Nuevo nombre:");

  if (!nuevoNombre) return;

  await actualizarUsuario(uidPaciente, {
    nombre: nuevoNombre
  });

  await cargarDatosPaciente();

  alert("Nombre actualizado");
};

window.editarDatosPaciente = async function() {
  const datos = await obtenerUsuario(uidPaciente);

  const nuevoTelefono = prompt("Tel\u00e9fono:", datos.telefono || "");
  if (nuevoTelefono === null) return;

  const nuevaFechaNacimiento = prompt(
    "Fecha de nacimiento (AAAA-MM-DD):",
    datos.fechaNacimiento || ""
  );
  if (nuevaFechaNacimiento === null) return;

  const nuevoDiagnostico = prompt("DiagnÃ³stico:", datos.diagnostico || "");
  if (nuevoDiagnostico === null) return;

  const nuevoTratamiento = prompt("Tratamiento:", datos.tratamiento || "");
  if (nuevoTratamiento === null) return;

  const nuevoMedico = prompt("MÃ©dico tratante:", datos.medicoTratante || "");
  if (nuevoMedico === null) return;

  const nuevaConsulta = prompt("Ãšltima consulta:", datos.ultimaConsulta || "");
  if (nuevaConsulta === null) return;

  await actualizarUsuario(uidPaciente, {
    telefono: nuevoTelefono,
    fechaNacimiento: nuevaFechaNacimiento,
    diagnostico: nuevoDiagnostico,
    tratamiento: nuevoTratamiento,
    medicoTratante: nuevoMedico,
    ultimaConsulta: nuevaConsulta
  });

  await cargarDatosPaciente();

  alert("Datos actualizados");
};

window.editarCampoPaciente = async function(campo, etiqueta, tipo = "text") {
  if (campo === "edad") {
    alert("La edad se calcula automaticamente a partir de la fecha de nacimiento. Edita la fecha de nacimiento para actualizarla.");
    return;
  }

  if (campo === "fechaIngreso") {
    window.abrirSelectorIngresoPaciente();
    return;
  }

  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const valorActual = campo === "fechaNacimiento"
    ? obtenerFechaNacimiento(datos)
    : campo === "fechaIngreso"
      ? obtenerFechaIngreso(datos)
      : datos?.[campo] || datos?.datosInstitucionales?.[campo] || "";
  const etiquetaCampo = etiqueta || campo;
  let nuevoValor = null;

  if (tipo === "textarea") {
    nuevoValor = prompt(`${etiquetaCampo}:`, valorActual);
  } else if (tipo === "date") {
    nuevoValor = prompt(`${etiquetaCampo} (AAAA-MM-DD):`, valorActual);
  } else if (tipo === "datetime") {
    nuevoValor = prompt(`${etiquetaCampo} (DD/MM/AAAA HH:mm):`, formatearFecha(valorActual));
  } else if (tipo === "number") {
    nuevoValor = prompt(`${etiquetaCampo}:`, valorActual);
  } else {
    nuevoValor = prompt(`${etiquetaCampo}:`, valorActual);
  }

  if (nuevoValor === null) return;
  if (campo === "fechaIngreso") nuevoValor = normalizarFechaIngreso(nuevoValor);

  const actualizacion = {
    [campo]: nuevoValor
  };

  const camposInstitucionales = new Set([
    "tipoPaciente",
    "institucionPaciente",
    "servicioInstitucional",
    "expediente",
    "cama",
    "curp",
    "fechaIngreso",
    "medicoAdscritoEncargado",
    "residenteEncargado",
    "fechaNacimiento",
    "sexo",
    "genero",
    "alergias",
    "peso",
    "talla",
    "perimetroAbdominal",
    "diasEstancia"
  ]);

  if (campo === "fechaNacimiento") {
    actualizacion.edad = deleteField();
  }

  if (camposInstitucionales.has(campo)) {
    const datosInstitucionales = {
      ...(datos?.datosInstitucionales || {}),
      [campo]: nuevoValor
    };
    delete datosInstitucionales.edad;
    actualizacion.datosInstitucionales = datosInstitucionales;

    if (campo === "institucionPaciente") actualizacion.institucion = nuevoValor;
    if (campo === "servicioInstitucional") actualizacion.servicio = nuevoValor;
    if (campo === "expediente") actualizacion.numeroExpediente = nuevoValor;
    if (["peso", "talla", "perimetroAbdominal"].includes(campo)) {
      actualizacion.signosVitales = {
        ...(datos?.signosVitales || {}),
        [campo]: nuevoValor
      };
    }
  }

  await actualizarUsuario(uidPaciente, actualizacion);
  await cargarDatosPaciente();
};

window.abrirSelectorIngresoPaciente = async function() {
  const modal = document.getElementById("modalIngresoPaciente");
  const inputFecha = document.getElementById("ingresoPacienteFecha");
  const inputHora = document.getElementById("ingresoPacienteHora");
  if (!modal || !inputFecha || !inputHora) return;

  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const partes = partesFechaIngreso(obtenerFechaIngreso(datos));

  inputFecha.value = partes.fecha;
  inputHora.value = partes.hora;
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
};

function cerrarSelectorIngresoPaciente() {
  const modal = document.getElementById("modalIngresoPaciente");
  if (!modal) return;

  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

async function guardarIngresoPacienteDesdeModal() {
  const fecha = document.getElementById("ingresoPacienteFecha")?.value || "";
  const hora = document.getElementById("ingresoPacienteHora")?.value || "00:00";

  if (!fecha) {
    alert("Selecciona el dia de ingreso.");
    return;
  }

  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const fechaIngreso = `${fecha}T${hora || "00:00"}`;
  const datosInstitucionales = {
    ...(datos?.datosInstitucionales || {}),
    fechaIngreso
  };

  await actualizarUsuario(uidPaciente, {
    fechaIngreso,
    datosInstitucionales
  });

  cerrarSelectorIngresoPaciente();
  await cargarDatosPaciente();
}

async function limpiarIngresoPacienteDesdeModal() {
  const datos = datosPacienteActual || await obtenerUsuario(uidPaciente);
  const datosInstitucionales = {
    ...(datos?.datosInstitucionales || {}),
    fechaIngreso: ""
  };

  await actualizarUsuario(uidPaciente, {
    fechaIngreso: "",
    datosInstitucionales
  });

  cerrarSelectorIngresoPaciente();
  await cargarDatosPaciente();
}

window.marcarDiagnosticoPrincipal = async function(index) {
  const datos = await obtenerUsuario(uidPaciente);
  const historial = obtenerHistorialDiagnosticos(datos);

  const diagnostico = historial[index];

  if (!diagnostico) {
    alert("No se encontro el diagnostico seleccionado.");
    return;
  }

  await actualizarUsuario(uidPaciente, {
    diagnostico
  });

  await registrarAccionExpediente({
    accion: "cambiar_diagnostico_principal",
    descripcion: "El medico cambio el diagnostico principal del expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico)
    }
  });

  await cargarDatosPaciente();
};

async function guardarHistorialDiagnosticos(historial, principal = null) {
  const limpio = historial.map((dx) => normalizarDiagnostico(dx, dx.catalogo || "CIE-10"));
  const diagnosticoPrincipal = principal || limpio[limpio.length - 1] || "";

  await actualizarUsuario(uidPaciente, {
    diagnostico: diagnosticoPrincipal || deleteField(),
    historialDiagnosticos: limpio,
    datosClinicosResumen: {
      ...(datosPacienteActual?.datosClinicosResumen || {}),
      diagnostico: diagnosticoPrincipal || null,
      historialDiagnosticos: limpio,
      fechaActualizacionDiagnosticos: new Date().toISOString()
    }
  });

  datosPacienteActual = {
    ...(datosPacienteActual || {}),
    diagnostico: diagnosticoPrincipal,
    historialDiagnosticos: limpio
  };
}

async function agregarDiagnosticoPaciente(index) {
  const diagnostico = diagnosticosCatalogoActual[index];
  if (!diagnostico) return;

  const historial = obtenerHistorialDiagnosticos();

  if (diagnosticoReemplazoIndex !== null) {
    const anterior = historial[diagnosticoReemplazoIndex];
    if (!anterior) {
      diagnosticoReemplazoIndex = null;
      return;
    }

    historial[diagnosticoReemplazoIndex] = diagnostico;

    const principalActual = datosPacienteActual?.diagnostico || anterior;
    const principal = claveDiagnostico(principalActual) === claveDiagnostico(anterior)
      ? diagnostico
      : principalActual;

    await guardarHistorialDiagnosticos(historial, principal);

    await registrarAccionExpediente({
      accion: "cambiar_diagnostico",
      descripcion: "El medico cambio un diagnostico usando el catalogo diagnostico.",
      detalles: {
        anterior: formatearDiagnostico(anterior),
        nuevo: formatearDiagnostico(diagnostico),
        catalogo: diagnostico.catalogo
      }
    });

    diagnosticoReemplazoIndex = null;
    ponerValor("diagnosticoBusqueda", "");
    await cargarDatosPaciente();
    renderizarResultadosBusquedaDiagnosticos();
    return;
  }

  const existe = historial.some((dx) => claveDiagnostico(dx) === claveDiagnostico(diagnostico));

  if (existe) {
    alert("Ese diagnostico ya esta registrado.");
    return;
  }

  const nuevoHistorial = [...historial, diagnostico];
  const debeSerPrincipal = !datosPacienteActual?.diagnostico;
  await guardarHistorialDiagnosticos(nuevoHistorial, debeSerPrincipal ? diagnostico : datosPacienteActual?.diagnostico);

  await registrarAccionExpediente({
    accion: "agregar_diagnostico",
    descripcion: "El medico agrego un diagnostico al expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico),
      catalogo: diagnostico.catalogo
    }
  });

  ponerValor("diagnosticoBusqueda", "");
  await cargarDatosPaciente();
  renderizarResultadosBusquedaDiagnosticos();
}

function prepararReemplazoDiagnostico(index) {
  diagnosticoReemplazoIndex = index;
  ponerValor("diagnosticoBusqueda", "");
  document.getElementById("diagnosticoBusqueda")?.focus();
  renderizarResultadosBusquedaDiagnosticos();
}

async function editarDiagnosticoPaciente(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];

  if (!diagnostico) return;

  const catalogo = prompt("Catalogo:", diagnostico.catalogo || "CIE-10");
  if (catalogo === null) return;

  const codigo = prompt("Codigo diagnostico:", diagnostico.codigo || "");
  if (codigo === null) return;

  const nombre = prompt("Nombre diagnostico:", diagnostico.nombre || diagnostico.texto || "");
  if (nombre === null) return;

  const texto = prompt("Texto visible del diagnostico:", diagnostico.texto || diagnostico.nombre || "");
  if (texto === null) return;

  const actualizado = {
    ...diagnostico,
    catalogo: catalogo.trim() || diagnostico.catalogo || "Manual",
    codigo: codigo.trim(),
    nombre: nombre.trim() || texto.trim() || diagnostico.nombre,
    texto: texto.trim() || nombre.trim() || diagnostico.texto || diagnostico.nombre,
    fechaSeleccion: diagnostico.fechaSeleccion || new Date().toISOString()
  };

  historial[index] = actualizado;

  const principalActual = datosPacienteActual?.diagnostico || historial[historial.length - 1] || "";
  const principal = claveDiagnostico(principalActual) === claveDiagnostico(diagnostico)
    ? actualizado
    : principalActual;

  await guardarHistorialDiagnosticos(historial, principal);

  await registrarAccionExpediente({
    accion: "editar_diagnostico",
    descripcion: "El medico cambio el texto de un diagnostico del expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(actualizado)
    }
  });

  await cargarDatosPaciente();
}

async function agregarDiagnosticoManualPaciente() {
  const catalogo = valorCampo("diagnosticoManualCatalogo") || "Manual";
  const codigo = valorCampo("diagnosticoManualCodigo");
  const nombre = valorCampo("diagnosticoManualNombre");
  const texto = valorCampo("diagnosticoManualTexto") || nombre;
  const incluirEnCatalogo = document.getElementById("diagnosticoManualIncluirCatalogo")?.checked || false;

  if (!codigo && !texto) {
    alert("Escribe al menos un codigo o un texto diagnostico.");
    return;
  }

  const diagnostico = normalizarDiagnostico({
    catalogo,
    codigo,
    nombre: nombre || texto || codigo,
    texto: texto || nombre || codigo,
    manual: true
  }, catalogo);

  if (incluirEnCatalogo) {
    if (!["CIE-10", "CIE-11"].includes(catalogo)) {
      alert("Para incluirlo en catalogo, elige CIE-10 o CIE-11.");
      return;
    }

    if (!codigo || !(nombre || texto)) {
      alert("Para incluirlo en catalogo, escribe codigo y nombre diagnostico.");
      return;
    }

    const existe = catalogoDiagnosticosCombinado().some((dx) =>
      dx.codigo.toLowerCase() === codigo.toLowerCase() &&
      (dx.catalogo || "CIE-10") === catalogo
    );

    if (!existe) {
      catalogoManualDiagnosticos.push({
        codigo,
        nombre: nombre || texto,
        catalogo,
        texto: `${codigo} - ${nombre || texto}`,
        agregadoManual: true,
        fechaAgregado: new Date().toISOString()
      });
      guardarCatalogoManualDiagnosticos();
    }
  }

  const historial = obtenerHistorialDiagnosticos();
  const nuevoHistorial = [...historial, diagnostico];
  const debeSerPrincipal = !datosPacienteActual?.diagnostico;

  await guardarHistorialDiagnosticos(nuevoHistorial, debeSerPrincipal ? diagnostico : datosPacienteActual?.diagnostico);

  await registrarAccionExpediente({
    accion: "agregar_diagnostico_manual",
    descripcion: "El medico agrego un diagnostico manual al expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico),
      catalogo
    }
  });

  ["diagnosticoManualCodigo", "diagnosticoManualNombre", "diagnosticoManualTexto"].forEach((id) => ponerValor(id, ""));
  const incluirCatalogo = document.getElementById("diagnosticoManualIncluirCatalogo");
  if (incluirCatalogo) incluirCatalogo.checked = false;
  await cargarDatosPaciente();
}

async function quitarDiagnosticoPaciente(index) {
  const historial = obtenerHistorialDiagnosticos();
  const diagnostico = historial[index];

  if (!diagnostico) return;
  if (!confirm("Quitar este diagnostico del expediente?")) return;

  const nuevoHistorial = historial.filter((_, i) => i !== index);
  const principalActual = datosPacienteActual?.diagnostico || historial[historial.length - 1] || "";
  const principal = claveDiagnostico(principalActual) === claveDiagnostico(diagnostico)
    ? nuevoHistorial[nuevoHistorial.length - 1] || null
    : principalActual;

  await guardarHistorialDiagnosticos(nuevoHistorial, principal);

  await registrarAccionExpediente({
    accion: "quitar_diagnostico",
    descripcion: "El medico quito un diagnostico del expediente.",
    detalles: {
      diagnostico: formatearDiagnostico(diagnostico)
    }
  });

  await cargarDatosPaciente();
}

async function cargarCarpetasPaciente() {
  const selector = document.getElementById("selectorCarpetasPaciente");
  const lista = document.getElementById("listaCarpetasPaciente");
  if (!selector || !lista) return;

  const uidMedico = auth.currentUser?.uid;
  const carpetasAsignadas = Array.isArray(datosPacienteActual?.carpetas)
    ? datosPacienteActual.carpetas
    : [];

  selector.innerHTML = `<option value="">Seleccionar carpeta</option>`;

  if (uidMedico) {
    const snap = await getDocs(query(collection(db, "usuarios", uidMedico, "carpetasPacientes"), orderBy("nombre", "asc")));
    snap.forEach((docCarpeta) => {
      const carpeta = docCarpeta.data();
      selector.innerHTML += `<option value="${escaparHTML(carpeta.nombre || "")}">${escaparHTML(carpeta.nombre || "Sin nombre")}</option>`;
    });
  }

  lista.innerHTML = carpetasAsignadas.length
    ? carpetasAsignadas.map((nombre) => `
      <article class="registro-card">
        <div class="registro-top">
          <strong>${escaparHTML(nombre)}</strong>
          <button type="button" class="boton-peligro" data-quitar-carpeta="${escaparHTML(nombre)}">Quitar</button>
        </div>
      </article>
    `).join("")
    : "<p>Este paciente aun no esta en carpetas.</p>";

  lista.querySelectorAll("[data-quitar-carpeta]").forEach((boton) => {
    boton.addEventListener("click", () => quitarCarpetaPaciente(boton.dataset.quitarCarpeta));
  });
}

async function asignarCarpetaPorNombre(nombre) {
  const carpeta = String(nombre || "").trim();
  if (!carpeta) {
    alert("Escribe o selecciona una carpeta.");
    return;
  }

  const uidMedico = auth.currentUser?.uid;
  if (uidMedico) {
    await setDoc(doc(db, "usuarios", uidMedico, "carpetasPacientes", carpeta.toLowerCase().replace(/\s+/g, "-")), {
      nombre: carpeta,
      fechaActualizacion: new Date().toISOString()
    }, { merge: true });
  }

  const actuales = Array.isArray(datosPacienteActual?.carpetas) ? datosPacienteActual.carpetas : [];
  const carpetas = Array.from(new Set([...actuales, carpeta]));

  await actualizarUsuario(uidPaciente, { carpetas });
  datosPacienteActual = { ...(datosPacienteActual || {}), carpetas };
  ponerValor("nuevaCarpetaPaciente", "");

  await registrarAccionExpediente({
    accion: "asignar_carpeta_paciente",
    descripcion: "El medico asigno el paciente a una carpeta.",
    detalles: { carpeta }
  });

  await cargarCarpetasPaciente();
}

async function quitarCarpetaPaciente(nombre) {
  const carpeta = String(nombre || "").trim();
  const actuales = Array.isArray(datosPacienteActual?.carpetas) ? datosPacienteActual.carpetas : [];
  const carpetas = actuales.filter((item) => item !== carpeta);
  await actualizarUsuario(uidPaciente, { carpetas });
  datosPacienteActual = { ...(datosPacienteActual || {}), carpetas };
  await cargarCarpetasPaciente();
}

async function cargarNotasFlotantesPaciente() {
  const lista = document.getElementById("listaNotasFlotantesPaciente");
  if (!lista) return;

  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "notasFlotantes"), orderBy("fechaActualizacion", "desc")));

  if (snap.empty) {
    lista.innerHTML = "<p>No hay notas flotantes registradas.</p>";
    return;
  }

  lista.innerHTML = snap.docs.map((docNota) => {
    const nota = docNota.data();
    const abierta = nota.contraida ? "" : " open";
    return `
      <details class="nota-flotante-card"${abierta}>
        <summary>
          <strong>${escaparHTML(nota.titulo || "Nota flotante")}</strong>
          <span>${nota.contraida ? "Contraida" : "Visible"}</span>
        </summary>
        <p>${escaparHTML(nota.texto || "").replace(/\n/g, "<br>")}</p>
        <div class="registro-actions">
          <button type="button" data-editar-nota-flotante="${docNota.id}">Editar</button>
          <button type="button" class="boton-peligro" data-eliminar-nota-flotante="${docNota.id}">Eliminar</button>
        </div>
      </details>
    `;
  }).join("");

  lista.querySelectorAll("[data-editar-nota-flotante]").forEach((boton) => {
    boton.addEventListener("click", () => editarNotaFlotantePaciente(boton.dataset.editarNotaFlotante));
  });

  lista.querySelectorAll("[data-eliminar-nota-flotante]").forEach((boton) => {
    boton.addEventListener("click", () => eliminarNotaFlotantePaciente(boton.dataset.eliminarNotaFlotante));
  });
}

async function guardarNotaFlotantePaciente() {
  const id = valorCampo("notaFlotanteId");
  const titulo = valorCampo("notaFlotanteTitulo") || "Nota flotante";
  const texto = valorCampo("notaFlotanteTexto");
  const contraida = valorCampo("notaFlotanteContraida") === "true";

  if (!texto) {
    alert("Escribe el contenido de la nota flotante.");
    return;
  }

  const payload = {
    titulo,
    texto,
    contraida,
    medicoUid: auth.currentUser?.uid || "",
    fechaActualizacion: new Date().toISOString()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id), payload);
  } else {
    await addDoc(collection(db, "usuarios", uidPaciente, "notasFlotantes"), {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
  }

  limpiarNotaFlotantePaciente();
  await cargarNotasFlotantesPaciente();
}

function limpiarNotaFlotantePaciente() {
  ponerValor("notaFlotanteId", "");
  ponerValor("notaFlotanteTitulo", "");
  ponerValor("notaFlotanteTexto", "");
  ponerValor("notaFlotanteContraida", "false");
}

async function editarNotaFlotantePaciente(id) {
  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "notasFlotantes"), orderBy("fechaActualizacion", "desc")));
  const docNota = snap.docs.find((item) => item.id === id);
  if (!docNota) return;
  const nota = docNota.data();
  ponerValor("notaFlotanteId", id);
  ponerValor("notaFlotanteTitulo", nota.titulo || "");
  ponerValor("notaFlotanteTexto", nota.texto || "");
  ponerValor("notaFlotanteContraida", nota.contraida ? "true" : "false");
  document.getElementById("notaFlotanteTitulo")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function eliminarNotaFlotantePaciente(id) {
  if (!confirm("Eliminar esta nota flotante?")) return;
  await deleteDoc(doc(db, "usuarios", uidPaciente, "notasFlotantes", id));
  await cargarNotasFlotantesPaciente();
}

function datosInterconsultaFormulario() {
  const paciente = datosPacienteActual || {};
  const fechaNacimiento = obtenerFechaNacimiento(paciente);
  const edad = calcularEdad(fechaNacimiento);
  const datosInst = paciente.datosInstitucionales || {};
  const resumen = paciente.datosClinicosResumen || {};

  return {
    formato: valorCampo("interconsultaFormato") || "cognicion",
    servicioSolicitante: valorCampo("interconsultaServicioSolicitante") || paciente.servicioInstitucional || paciente.servicio || datosInst.servicioInstitucional || "",
    servicio: valorCampo("interconsultaServicio"),
    prioridad: valorCampo("interconsultaPrioridad") || "ordinaria",
    fecha: valorCampo("interconsultaFecha") || new Date().toISOString().slice(0, 10),
    hora: valorCampo("interconsultaHora") || new Date().toTimeString().slice(0, 5),
    motivo: valorCampo("interconsultaMotivo"),
    resumen: valorCampo("interconsultaResumen"),
    pregunta: valorCampo("interconsultaPregunta"),
    pacienteNombre: paciente.nombre || "",
    fechaNacimiento,
    curp: valorCampo("interconsultaCurp") || paciente.curp || datosInst.curp || "",
    edad: edad !== "" ? `${edad}` : "",
    sexo: paciente.sexo || datosInst.sexo || "",
    genero: paciente.genero || paciente.identidadGenero || datosInst.genero || "",
    expediente: paciente.expediente || paciente.numeroExpediente || datosInst.expediente || "",
    cama: paciente.cama || datosInst.cama || "",
    alergias: paciente.alergias || datosInst.alergias || "",
    peso: valorCampo("interconsultaPeso") || paciente.peso || paciente.signosVitales?.peso || "",
    talla: valorCampo("interconsultaTalla") || paciente.talla || paciente.signosVitales?.talla || "",
    perimetroAbdominal: valorCampo("interconsultaPerimetroAbdominal") || paciente.perimetroAbdominal || paciente.signosVitales?.perimetroAbdominal || "",
    diagnostico: valorCampo("interconsultaSospechaDiagnostica") || formatearDiagnostico(resumen.diagnostico || paciente.diagnostico),
    medicoSolicitante: valorCampo("interconsultaMedicoSolicitante") || paciente.medicoTratante || medicoActualDatos.nombre || "",
    cedulaSolicitante: valorCampo("interconsultaCedulaSolicitante") || medicoActualDatos.cedula || medicoActualDatos.cedulaProfesional || ""
  };
}

function autollenarInterconsulta() {
  const paciente = datosPacienteActual || {};
  const ahora = new Date();
  const fechaNacimiento = obtenerFechaNacimiento(paciente);
  const datosInst = paciente.datosInstitucionales || {};
  const resumen = paciente.datosClinicosResumen || {};
  const valores = {
    interconsultaServicioSolicitante: paciente.servicioInstitucional || paciente.servicio || datosInst.servicioInstitucional || "Observacion",
    interconsultaFecha: ahora.toISOString().slice(0, 10),
    interconsultaHora: ahora.toTimeString().slice(0, 5),
    interconsultaCurp: paciente.curp || datosInst.curp || "",
    interconsultaPeso: paciente.peso || paciente.signosVitales?.peso || "",
    interconsultaTalla: paciente.talla || paciente.signosVitales?.talla || "",
    interconsultaPerimetroAbdominal: paciente.perimetroAbdominal || paciente.signosVitales?.perimetroAbdominal || "",
    interconsultaSospechaDiagnostica: formatearDiagnostico(resumen.diagnostico || paciente.diagnostico),
    interconsultaMedicoSolicitante: paciente.medicoTratante || medicoActualDatos.nombre || "",
    interconsultaCedulaSolicitante: medicoActualDatos.cedula || medicoActualDatos.cedulaProfesional || ""
  };

  Object.entries(valores).forEach(([id, valor]) => {
    if (!valorCampo(id)) ponerValor(id, valor);
  });

  const motivo = document.getElementById("interconsultaMotivo");
  if (motivo && !motivo.value.trim()) {
    motivo.value = "";
  }
}

async function guardarInterconsultaPaciente() {
  const datos = datosInterconsultaFormulario();
  if (!datos.servicio || !datos.motivo) {
    alert("Indica el servicio solicitado y el motivo de interconsulta.");
    return;
  }

  await actualizarUsuario(uidPaciente, {
    curp: datos.curp || "",
    peso: datos.peso || "",
    talla: datos.talla || "",
    perimetroAbdominal: datos.perimetroAbdominal || "",
    datosInstitucionales: {
      ...(datosPacienteActual?.datosInstitucionales || {}),
      curp: datos.curp || "",
      peso: datos.peso || "",
      talla: datos.talla || "",
      perimetroAbdominal: datos.perimetroAbdominal || "",
      servicioInstitucional: datos.servicioSolicitante || datosPacienteActual?.servicioInstitucional || ""
    },
    signosVitales: {
      ...(datosPacienteActual?.signosVitales || {}),
      peso: datos.peso || "",
      talla: datos.talla || "",
      perimetroAbdominal: datos.perimetroAbdominal || ""
    }
  });

  await addDoc(collection(db, "usuarios", uidPaciente, "interconsultas"), {
    ...datos,
    medicoUid: auth.currentUser?.uid || "",
    fechaCreacion: new Date().toISOString()
  });

  await registrarAccionExpediente({
    accion: "solicitar_interconsulta",
    descripcion: "El medico registro una solicitud de interconsulta.",
    detalles: { servicio: datos.servicio, formato: datos.formato }
  });

  datosPacienteActual = await obtenerUsuario(uidPaciente);
  await cargarInterconsultasPaciente();
  alert("Interconsulta guardada.");
}

async function cargarInterconsultasPaciente() {
  const lista = document.getElementById("listaInterconsultasPaciente");
  if (!lista) return;

  const snap = await getDocs(query(collection(db, "usuarios", uidPaciente, "interconsultas"), orderBy("fechaCreacion", "desc")));

  lista.innerHTML = snap.empty
    ? "<p>No hay interconsultas registradas.</p>"
    : snap.docs.map((docInterconsulta) => {
      const item = docInterconsulta.data();
      return `
        <article class="registro-card">
          <div class="registro-top">
            <strong>${escaparHTML(item.servicio || "Interconsulta")}</strong>
            <span class="estado-badge">${escaparHTML(item.formato || "cognicion")}</span>
          </div>
          <p>${escaparHTML(item.motivo || "")}</p>
          <small>${escaparHTML(item.fecha || "")} · ${escaparHTML(item.prioridad || "")}</small>
        </article>
      `;
    }).join("");
}

async function recursoDataUriPaciente(ruta) {
  const respuesta = await fetch(ruta);
  const blob = await respuesta.blob();
  return await new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onloadend = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(blob);
  });
}

function formatoFechaInterconsulta(fecha = "") {
  if (!fecha) return "";
  const partes = String(fecha).split("-");
  if (partes.length !== 3) return fecha;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

async function htmlInterconsultaWord(datos) {
  const logoSalud = datos.formato === "fray"
    ? await recursoDataUriPaciente("assets/fray-observacion-salud-conasama-stack.png")
    : "";
  const logoFray = datos.formato === "fray"
    ? await recursoDataUriPaciente("assets/fray-observacion-image2.png")
    : "";

  const encabezadoFray = `
    <table class="encabezado-fray">
      <tr>
        <td class="encabezado-logo-izq"><img src="${logoSalud}" class="logo-salud"></td>
        <td class="encabezado-centro">
          SECRETARÍA DE SALUD<br>
          COMISIÓN NACIONAL DE SALUD MENTAL Y ADICCIONES<br>
          HOSPITAL PSIQUIÁTRICO "FRAY BERNARDINO ÁLVAREZ"
        </td>
        <td class="encabezado-logo-der"><img src="${logoFray}" class="logo-fray"></td>
      </tr>
    </table>
    <div class="linea-encabezado"></div>
  `;

  const encabezadoCognicion = `<h1>Cognicion · Solicitud de interconsulta</h1>`;
  const motivoCompleto = [
    datos.motivo,
    datos.resumen ? `Resumen clinico: ${datos.resumen}` : "",
    datos.pregunta ? `Pregunta clinica: ${datos.pregunta}` : ""
  ].filter(Boolean).join("\n\n");

  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page WordSection1 { size: 21.59cm 27.94cm; margin: 2.5cm 3cm 1.25cm 3cm; }
          div.WordSection1 { page: WordSection1; }
          body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; }
          .encabezado-fray { width: 100%; border-collapse: collapse; margin: 0 0 2pt; }
          .encabezado-fray td { border: none; vertical-align: middle; }
          .encabezado-logo-izq { width: 30%; text-align: left; }
          .encabezado-centro { width: 40%; text-align: center; font-size: 10pt; font-weight: bold; line-height: 1.05; }
          .encabezado-logo-der { width: 30%; text-align: right; }
          .logo-salud { width: 118px; }
          .logo-fray { width: 58px; }
          .linea-encabezado { border-top: 1px dashed #777; height: 1px; margin: 2pt 0 9pt; }
          h1 { text-align:center; font-size: 12pt; margin: 0; text-transform: uppercase; font-weight: bold; }
          .subtitulo { text-align:center; margin: 2pt 0 14pt; font-weight: bold; }
          p { margin: 0 0 7pt; line-height: 1.12; text-align: left; }
          .datos { margin-top: 10pt; }
          .datos p { margin-bottom: 6pt; }
          .label { font-weight: bold; }
          .motivo-titulo { margin-top: 16pt; margin-bottom: 7pt; font-weight: bold; }
          .motivo { min-height: 115pt; text-align: justify; line-height: 1.18; }
          .firmas { margin-top: 20pt; }
          .firmas p { margin-bottom: 13pt; }
        </style>
      </head>
      <body>
        <div class="WordSection1">
          ${datos.formato === "fray" ? encabezadoFray : encabezadoCognicion}
          <h1>SOLICITUD DE INTERCONSULTA</h1>
          <p class="subtitulo">(ATENCIÓN INTRAHOSPITALARIA)</p>

          <div class="datos">
            <p><span class="label">Fecha:</span> ${escaparHTML(formatoFechaInterconsulta(datos.fecha))}
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Hora:</span> ${escaparHTML(datos.hora)}
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">No. de expediente:</span> ${escaparHTML(datos.expediente)}</p>
            <p><span class="label">Nombre completo del paciente:</span> ${escaparHTML(datos.pacienteNombre)}</p>
            <p><span class="label">Fecha de nacimiento:</span> ${escaparHTML(formatoFechaInterconsulta(datos.fechaNacimiento))}
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">CURP:</span> ${escaparHTML(datos.curp)}</p>
            <p><span class="label">Edad:</span> ${escaparHTML(datos.edad)} años
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Sexo:</span> ${escaparHTML(datos.sexo)}
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Genero:</span> ${escaparHTML(datos.genero)}</p>
            <p><span class="label">No. de cama:</span> ${escaparHTML(datos.cama)}
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Alergia:</span> ${escaparHTML(datos.alergias)}
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Peso:</span> ${escaparHTML(datos.peso)} Kg
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Talla:</span> ${escaparHTML(datos.talla)} m
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Perímetro abdominal:</span> ${escaparHTML(datos.perimetroAbdominal)} cm</p>
            <p>&nbsp;</p>
            <p><span class="label">Servicio solicitante:</span> ${escaparHTML(datos.servicioSolicitante)}
              &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Servicio interconsultante:</span> ${escaparHTML(datos.servicio)}</p>
            <p>&nbsp;</p>
            <p><span class="label">Sospecha diagnóstica:</span> ${escaparHTML(datos.diagnostico)}</p>
          </div>

          <p class="motivo-titulo">Motivo de la interconsulta:</p>
          <p class="motivo">${escaparHTML(motivoCompleto).replace(/\n/g, "<br>")}</p>

          <div class="firmas">
            <p><span class="label">Médico solicitante:</span> ${escaparHTML(datos.medicoSolicitante)}
              &nbsp;&nbsp;&nbsp; <span class="label">Cédula profesional:</span> ${escaparHTML(datos.cedulaSolicitante)}
              &nbsp;&nbsp;&nbsp; <span class="label">Firma:</span> _____________</p>
            <p><span class="label">Médico interconsultante:</span> _____________________________________________________________</p>
            <p><span class="label">Cédula profesional:</span> _________________
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Firma:</span> _______________</p>
            <p>&nbsp;</p>
            <p><span class="label">Recibe la interconsulta:</span> _______________________________________________________________</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function fechaHoraZipActual() {
  const fecha = new Date();
  const horaDos = (
    (fecha.getHours() << 11) |
    (fecha.getMinutes() << 5) |
    Math.floor(fecha.getSeconds() / 2)
  );
  const fechaDos = (
    ((fecha.getFullYear() - 1980) << 9) |
    ((fecha.getMonth() + 1) << 5) |
    fecha.getDate()
  );
  return { horaDos, fechaDos };
}

let tablaCrc32 = null;

function obtenerTablaCrc32() {
  if (tablaCrc32) return tablaCrc32;
  tablaCrc32 = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tablaCrc32[i] = c >>> 0;
  }
  return tablaCrc32;
}

function crc32(bytes) {
  const tabla = obtenerTablaCrc32();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = tabla[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escribirUint16(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
}

function escribirUint32(buffer, offset, valor) {
  buffer[offset] = valor & 0xff;
  buffer[offset + 1] = (valor >>> 8) & 0xff;
  buffer[offset + 2] = (valor >>> 16) & 0xff;
  buffer[offset + 3] = (valor >>> 24) & 0xff;
}

function unirBytes(partes, total) {
  const salida = new Uint8Array(total);
  let offset = 0;
  partes.forEach((parte) => {
    salida.set(parte, offset);
    offset += parte.length;
  });
  return salida;
}

function crearZipSinCompresion(archivos) {
  const encoder = new TextEncoder();
  const { horaDos, fechaDos } = fechaHoraZipActual();
  const partes = [];
  const centrales = [];
  let offset = 0;

  archivos.forEach((archivo) => {
    const nombre = encoder.encode(archivo.nombre);
    const contenido = typeof archivo.contenido === "string"
      ? encoder.encode(archivo.contenido)
      : archivo.contenido;
    const crc = crc32(contenido);
    const local = new Uint8Array(30 + nombre.length);

    escribirUint32(local, 0, 0x04034b50);
    escribirUint16(local, 4, 20);
    escribirUint16(local, 6, 0);
    escribirUint16(local, 8, 0);
    escribirUint16(local, 10, horaDos);
    escribirUint16(local, 12, fechaDos);
    escribirUint32(local, 14, crc);
    escribirUint32(local, 18, contenido.length);
    escribirUint32(local, 22, contenido.length);
    escribirUint16(local, 26, nombre.length);
    escribirUint16(local, 28, 0);
    local.set(nombre, 30);

    partes.push(local, contenido);

    const central = new Uint8Array(46 + nombre.length);
    escribirUint32(central, 0, 0x02014b50);
    escribirUint16(central, 4, 20);
    escribirUint16(central, 6, 20);
    escribirUint16(central, 8, 0);
    escribirUint16(central, 10, 0);
    escribirUint16(central, 12, horaDos);
    escribirUint16(central, 14, fechaDos);
    escribirUint32(central, 16, crc);
    escribirUint32(central, 20, contenido.length);
    escribirUint32(central, 24, contenido.length);
    escribirUint16(central, 28, nombre.length);
    escribirUint16(central, 30, 0);
    escribirUint16(central, 32, 0);
    escribirUint16(central, 34, 0);
    escribirUint16(central, 36, 0);
    escribirUint32(central, 38, 0);
    escribirUint32(central, 42, offset);
    central.set(nombre, 46);
    centrales.push(central);

    offset += local.length + contenido.length;
  });

  const inicioCentral = offset;
  centrales.forEach((central) => {
    partes.push(central);
    offset += central.length;
  });

  const fin = new Uint8Array(22);
  escribirUint32(fin, 0, 0x06054b50);
  escribirUint16(fin, 4, 0);
  escribirUint16(fin, 6, 0);
  escribirUint16(fin, 8, archivos.length);
  escribirUint16(fin, 10, archivos.length);
  escribirUint32(fin, 12, offset - inicioCentral);
  escribirUint32(fin, 16, inicioCentral);
  escribirUint16(fin, 20, 0);
  partes.push(fin);
  offset += fin.length;

  return unirBytes(partes, offset);
}

function crearDocxDesdeHtml(html) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk"/>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const archivos = [
    {
      nombre: "[Content_Types].xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="html" ContentType="text/html"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    },
    {
      nombre: "_rels/.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    {
      nombre: "word/document.xml",
      contenido: documentXml
    },
    {
      nombre: "word/_rels/document.xml.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.html"/>
</Relationships>`
    },
    {
      nombre: "word/afchunk.html",
      contenido: `\ufeff${html}`
    }
  ];

  return new Blob([crearZipSinCompresion(archivos)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function descargarInterconsultaPaciente() {
  const datos = datosInterconsultaFormulario();
  const html = await htmlInterconsultaWord(datos);
  const blob = crearDocxDesdeHtml(html);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `Interconsulta_${datos.formato}_${(datos.pacienteNombre || "paciente").replace(/\s+/g, "_")}_${datos.fecha}.docx`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

window.abrirNota = function() {
  window.location.href = "nota.html?id=" + uidPaciente;
};

window.previsualizarMiSalud = function() {
  window.location.href = `mi-salud.html?paciente=${uidPaciente}&preview=1`;
};

window.solicitarEliminarPaciente = async function() {
  const confirmar = confirm(
    "Â¿Deseas suspender este paciente y solicitar eliminaciÃ³n al administrador?"
  );

  if (!confirmar) return;

  try {
    await solicitarEliminacionPaciente(
      uidPaciente,
      auth.currentUser.uid
    );

    alert("Paciente suspendido. EliminaciÃ³n pendiente de autorizaciÃ³n.");

    window.location.href = "medico.html";
  } catch (error) {
    alert(error.message);
  }
};

window.abrirHistoriaClinica = function() {
  if (!uidPaciente) {
    alert("No se encontrÃ³ el ID del paciente.");
    return;
  }

  window.location.href = `historia.html?id=${uidPaciente}`;
};

function datosFormularioTratamiento() {
  return {
    medicamento: valorCampo("tratamientoMedicamento"),
    dosis: valorCampo("tratamientoDosis"),
    frecuencia: valorCampo("tratamientoFrecuencia"),
    via: valorCampo("tratamientoVia"),
    horarios: valorCampo("tratamientoHorarios"),
    fechaInicio: valorCampo("tratamientoFechaInicio"),
    estado: valorCampo("tratamientoEstado") || "activo",
    fechaSuspension: valorCampo("tratamientoFechaSuspension"),
    motivoSuspension: valorCampo("tratamientoMotivoSuspension"),
    observaciones: valorCampo("tratamientoObservaciones"),
    creadoPor: auth.currentUser?.uid || ""
  };
}

function limpiarFormularioTratamiento() {
  [
    "tratamientoId",
    "tratamientoMedicamento",
    "tratamientoDosis",
    "tratamientoFrecuencia",
    "tratamientoVia",
    "tratamientoHorarios",
    "tratamientoFechaInicio",
    "tratamientoFechaSuspension",
    "tratamientoMotivoSuspension",
    "tratamientoObservaciones"
  ].forEach((id) => ponerValor(id, ""));
  ponerValor("tratamientoEstado", "activo");
}

async function guardarTratamientoPaciente() {
  const datos = datosFormularioTratamiento();

  if (!datos.medicamento) {
    alert("Escribe el medicamento.");
    return;
  }

  const tratamientoId = valorCampo("tratamientoId");

  if (tratamientoId) {
    await actualizarTratamiento(uidPaciente, tratamientoId, datos);
  } else {
    await crearTratamiento(uidPaciente, datos);
  }

  await registrarAccionExpediente({
    accion: tratamientoId ? "editar_tratamiento" : "crear_tratamiento",
    descripcion: tratamientoId
      ? "El medico edito un tratamiento del expediente."
      : "El medico creo un tratamiento en el expediente.",
    detalles: {
      tratamientoId,
      medicamento: datos.medicamento,
      estado: datos.estado
    }
  });

  limpiarFormularioTratamiento();
  await cargarTratamientosPaciente();
  await sincronizarResumenTratamiento();
  alert("Tratamiento guardado.");
}

async function cargarTratamientosPaciente() {
  const activos = document.getElementById("tratamientosActivos");
  const suspendidos = document.getElementById("tratamientosSuspendidos");
  if (!activos || !suspendidos) return;

  activos.textContent = "Cargando tratamientos...";
  suspendidos.textContent = "Cargando tratamientos...";

  try {
    tratamientosCache = await listarTratamientos(uidPaciente);
    const listaActivos = tratamientosCache.filter((t) => (t.estado || "activo") === "activo");
    const listaSuspendidos = tratamientosCache.filter((t) => t.estado === "suspendido");

    activos.innerHTML = listaActivos.length
      ? listaActivos.map(renderizarTratamiento).join("")
      : "<p>Aun no hay tratamientos activos.</p>";

    suspendidos.innerHTML = listaSuspendidos.length
      ? listaSuspendidos.map(renderizarTratamiento).join("")
      : "<p>No hay tratamientos suspendidos.</p>";

    vincularAccionesTratamientos();
  } catch (error) {
    console.error("Error al cargar tratamientos:", error);
    activos.textContent = "No se pudieron cargar los tratamientos.";
    suspendidos.textContent = "No se pudieron cargar los tratamientos.";
  }
}

function renderizarTratamiento(t) {
  const indicacion = formatearIndicacionTratamiento(t, false);
  return `
    <article class="registro-card">
      <div class="registro-top">
        <div>
          <strong>${escaparHTML(t.medicamento || "Medicamento")}</strong>
          <span>${escaparHTML(indicacion || "Sin indicacion completa")}</span>
        </div>
        <span class="estado-badge ${t.estado === "suspendido" ? "suspendido" : "activo"}">${escaparHTML(t.estado || "activo")}</span>
      </div>
      <p><b>Inicio:</b> ${escaparHTML(formatearFecha(t.fechaInicio) || "Sin fecha")}</p>
      ${t.estado === "suspendido" ? `<p><b>Suspension:</b> ${escaparHTML(formatearFecha(t.fechaSuspension))} Â· ${escaparHTML(t.motivoSuspension || "Sin motivo registrado")}</p>` : ""}
      ${t.observaciones ? `<p>${escaparHTML(t.observaciones)}</p>` : ""}
      <div class="registro-actions">
        <button type="button" data-editar-tratamiento="${t.id}">Editar</button>
        <button type="button" class="boton-peligro" data-eliminar-tratamiento="${t.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function vincularAccionesTratamientos() {
  document.querySelectorAll("[data-editar-tratamiento]").forEach((boton) => {
    boton.addEventListener("click", () => editarTratamientoPaciente(boton.dataset.editarTratamiento));
  });

  document.querySelectorAll("[data-eliminar-tratamiento]").forEach((boton) => {
    boton.addEventListener("click", () => eliminarTratamientoPaciente(boton.dataset.eliminarTratamiento));
  });
}

function editarTratamientoPaciente(id) {
  const t = tratamientosCache.find((item) => item.id === id);
  if (!t) return;

  ponerValor("tratamientoId", t.id);
  ponerValor("tratamientoMedicamento", t.medicamento);
  ponerValor("tratamientoDosis", t.dosis);
  ponerValor("tratamientoFrecuencia", t.frecuencia);
  ponerValor("tratamientoVia", t.via);
  ponerValor("tratamientoHorarios", t.horarios);
  ponerValor("tratamientoFechaInicio", t.fechaInicio);
  ponerValor("tratamientoEstado", t.estado || "activo");
  ponerValor("tratamientoFechaSuspension", t.fechaSuspension);
  ponerValor("tratamientoMotivoSuspension", t.motivoSuspension);
  ponerValor("tratamientoObservaciones", t.observaciones);
}

async function eliminarTratamientoPaciente(id) {
  if (!confirm("Eliminar este tratamiento del expediente?")) return;
  const tratamiento = tratamientosCache.find((item) => item.id === id);
  await eliminarTratamiento(uidPaciente, id);
  await registrarAccionExpediente({
    accion: "eliminar_tratamiento",
    descripcion: "El medico elimino un tratamiento del expediente.",
    detalles: {
      tratamientoId: id,
      medicamento: tratamiento?.medicamento || ""
    }
  });
  await cargarTratamientosPaciente();
  await sincronizarResumenTratamiento();
}

async function sincronizarResumenTratamiento() {
  const activos = tratamientosCache.filter((t) => (t.estado || "activo") === "activo");
  const resumen = activos.map((t) =>
    formatearIndicacionTratamiento(t, true)
  ).filter(Boolean).join("\n");

  await actualizarUsuario(uidPaciente, {
    tratamiento: resumen,
    datosClinicosResumen: {
      ...(datosPacienteActual?.datosClinicosResumen || {}),
      tratamientoActivo: resumen,
      tratamientosActivos: activos,
      fechaActualizacionTratamiento: new Date().toISOString()
    }
  });

  const tratamiento = document.getElementById("tratamiento");
  if (tratamiento) tratamiento.innerText = resumen || "Sin tratamiento registrado";
}

function limpiarPuntoFinal(texto = "") {
  return String(texto).trim().replace(/[.\s]+$/, "");
}

function asegurarPunto(texto = "") {
  const limpio = String(texto).trim();
  if (!limpio) return "";
  return /[.!?]$/.test(limpio) ? limpio : `${limpio}.`;
}

function formatearHorariosTratamiento(horarios = "") {
  const limpio = String(horarios).trim();
  if (!limpio) return "";

  if (/^(a\s+las|alrededor\s+de|por\s+la|en\s+la)/i.test(limpio)) {
    return limpio;
  }

  const multiples = limpio
    .split(/[,;]/)
    .map((h) => h.trim())
    .filter(Boolean);

  if (multiples.length > 1) {
    return `a las ${multiples.join(", ")}`;
  }

  return `a las ${limpio}`;
}

function formatearIndicacionTratamiento(t = {}, incluirMedicamento = true) {
  const medicamento = incluirMedicamento ? asegurarPunto(t.medicamento || "") : "";
  const via = limpiarPuntoFinal(t.via || "");
  const frecuencia = limpiarPuntoFinal(t.frecuencia || "");
  const dosis = limpiarPuntoFinal(t.dosis || "");
  const horarios = formatearHorariosTratamiento(t.horarios || "");

  const tomar = [via, frecuencia].filter(Boolean).join(" ");
  const partes = [];

  if (medicamento) partes.push(medicamento);
  if (tomar) partes.push(asegurarPunto(`Tomar ${tomar}`));
  if (dosis || horarios) partes.push(asegurarPunto([dosis, horarios].filter(Boolean).join(" ")));

  if (!partes.length && !incluirMedicamento) {
    return [t.dosis, t.frecuencia, t.via, t.horarios].filter(Boolean).join(" · ");
  }

  return partes.join(" ");
}

function datosFormularioEstudio() {
  return {
    nombre: valorCampo("estudioNombre"),
    tipo: valorCampo("estudioTipo"),
    fecha: valorCampo("estudioFecha"),
    resultado: valorCampo("estudioResultado"),
    observaciones: valorCampo("estudioObservaciones"),
    enlace: valorCampo("estudioEnlace"),
    creadoPor: auth.currentUser?.uid || ""
  };
}

function limpiarFormularioEstudio() {
  [
    "estudioId",
    "estudioNombre",
    "estudioTipo",
    "estudioFecha",
    "estudioResultado",
    "estudioObservaciones",
    "estudioEnlace"
  ].forEach((id) => ponerValor(id, ""));
}

async function guardarEstudioPaciente() {
  const datos = datosFormularioEstudio();
  if (!datos.nombre) {
    alert("Escribe el nombre del estudio.");
    return;
  }

  const estudioId = valorCampo("estudioId");
  if (estudioId) {
    await actualizarEstudio(uidPaciente, estudioId, datos);
  } else {
    await crearEstudio(uidPaciente, datos);
  }

  await registrarAccionExpediente({
    accion: estudioId ? "editar_estudio" : "crear_estudio",
    descripcion: estudioId
      ? "El medico edito un estudio del expediente."
      : "El medico registro un estudio en el expediente.",
    detalles: {
      estudioId,
      nombre: datos.nombre,
      tipo: datos.tipo
    }
  });

  limpiarFormularioEstudio();
  await cargarEstudiosPaciente();
  alert("Estudio guardado.");
}

async function cargarEstudiosPaciente() {
  const contenedor = document.getElementById("listaEstudios");
  if (!contenedor) return;
  contenedor.textContent = "Cargando estudios...";

  try {
    estudiosCache = await listarEstudios(uidPaciente);
    contenedor.innerHTML = estudiosCache.length
      ? estudiosCache.map(renderizarEstudio).join("")
      : "<p>Aun no hay estudios registrados.</p>";
    vincularAccionesEstudios();
  } catch (error) {
    console.error("Error al cargar estudios:", error);
    contenedor.textContent = "No se pudieron cargar los estudios.";
  }
}

function renderizarEstudio(estudio) {
  return `
    <article class="registro-card">
      <div class="registro-top">
        <div>
          <strong>${escaparHTML(estudio.nombre || "Estudio")}</strong>
          <span>${escaparHTML(estudio.tipo || "Sin tipo")} Â· ${escaparHTML(formatearFecha(estudio.fecha))}</span>
        </div>
      </div>
      ${estudio.resultado ? `<p><b>Resultado:</b> ${escaparHTML(estudio.resultado)}</p>` : ""}
      ${estudio.observaciones ? `<p>${escaparHTML(estudio.observaciones)}</p>` : ""}
      ${estudio.enlace ? `<p><a href="${escaparHTML(estudio.enlace)}" target="_blank" rel="noopener">Abrir enlace</a></p>` : ""}
      <div class="registro-actions">
        <button type="button" data-editar-estudio="${estudio.id}">Editar</button>
        <button type="button" class="boton-peligro" data-eliminar-estudio="${estudio.id}">Eliminar</button>
      </div>
    </article>
  `;
}

function vincularAccionesEstudios() {
  document.querySelectorAll("[data-editar-estudio]").forEach((boton) => {
    boton.addEventListener("click", () => editarEstudioPaciente(boton.dataset.editarEstudio));
  });

  document.querySelectorAll("[data-eliminar-estudio]").forEach((boton) => {
    boton.addEventListener("click", () => eliminarEstudioPaciente(boton.dataset.eliminarEstudio));
  });
}

function editarEstudioPaciente(id) {
  const estudio = estudiosCache.find((item) => item.id === id);
  if (!estudio) return;

  ponerValor("estudioId", estudio.id);
  ponerValor("estudioNombre", estudio.nombre);
  ponerValor("estudioTipo", estudio.tipo);
  ponerValor("estudioFecha", estudio.fecha);
  ponerValor("estudioResultado", estudio.resultado);
  ponerValor("estudioObservaciones", estudio.observaciones);
  ponerValor("estudioEnlace", estudio.enlace);
}

async function eliminarEstudioPaciente(id) {
  if (!confirm("Eliminar este estudio del expediente?")) return;
  const estudio = estudiosCache.find((item) => item.id === id);
  await eliminarEstudio(uidPaciente, id);
  await registrarAccionExpediente({
    accion: "eliminar_estudio",
    descripcion: "El medico elimino un estudio del expediente.",
    detalles: {
      estudioId: id,
      nombre: estudio?.nombre || ""
    }
  });
  await cargarEstudiosPaciente();
}

async function guardarNotaRapidaPaciente() {
  const texto = valorCampo("notaRapidaTexto");
  if (!texto) {
    alert("Escribe una observacion.");
    return;
  }

  const medico = await obtenerUsuario(auth.currentUser.uid);
  await crearNotaRapida(uidPaciente, {
    texto,
    medicoUid: auth.currentUser.uid,
    medicoNombre: medico?.nombre || medico?.email || "Medico",
    pacienteId: uidPaciente
  });

  await registrarAccionExpediente({
    accion: "crear_nota_rapida",
    descripcion: "El medico creo una nota rapida en el expediente.",
    detalles: {
      longitudTexto: texto.length
    }
  });

  ponerValor("notaRapidaTexto", "");
  await cargarNotasRapidasPaciente();
  alert("Nota rapida guardada.");
}

async function cargarNotasRapidasPaciente() {
  const contenedor = document.getElementById("historialNotasRapidas");
  if (!contenedor) return;
  contenedor.textContent = "Cargando notas...";

  try {
    const notas = await listarNotasRapidas(uidPaciente);
    contenedor.innerHTML = notas.length
      ? notas.map((nota) => {
          const fecha = nota.fechaISO ? new Date(nota.fechaISO).toLocaleString("es-MX") : "Sin fecha";
          return `
            <article class="registro-card">
              <div class="registro-top">
                <div>
                  <strong>${escaparHTML(nota.medicoNombre || "Medico")}</strong>
                  <span>${escaparHTML(fecha)}</span>
                </div>
              </div>
              <p>${escaparHTML(nota.texto)}</p>
            </article>
          `;
        }).join("")
      : "<p>Aun no hay notas rapidas.</p>";
  } catch (error) {
    console.error("Error al cargar notas rapidas:", error);
    contenedor.textContent = "No se pudieron cargar las notas rapidas.";
  }
}

document.getElementById("guardarTratamiento")?.addEventListener("click", guardarTratamientoPaciente);
document.getElementById("limpiarTratamiento")?.addEventListener("click", limpiarFormularioTratamiento);
document.getElementById("guardarEstudio")?.addEventListener("click", guardarEstudioPaciente);
document.getElementById("limpiarEstudio")?.addEventListener("click", limpiarFormularioEstudio);
document.getElementById("guardarNotaRapida")?.addEventListener("click", guardarNotaRapidaPaciente);
document.getElementById("guardarTareaMiSalud")?.addEventListener("click", guardarTareaMiSaludPaciente);
document.getElementById("btnGenerarCodigoPaciente")?.addEventListener("click", generarCodigoVinculacionDesdeMedico);
document.getElementById("btnVincularCodigoPaciente")?.addEventListener("click", vincularCuentaPacienteDesdeMedico);
document.getElementById("diagnosticoBusqueda")?.addEventListener("input", renderizarResultadosBusquedaDiagnosticos);
document.getElementById("diagnosticoCatalogo")?.addEventListener("change", () => {
  ponerValor("diagnosticoBusqueda", "");
  renderizarResultadosBusquedaDiagnosticos();
});
document.getElementById("agregarDiagnosticoManual")?.addEventListener("click", agregarDiagnosticoManualPaciente);
document.getElementById("crearCarpetaPaciente")?.addEventListener("click", () => asignarCarpetaPorNombre(valorCampo("nuevaCarpetaPaciente")));
document.getElementById("asignarCarpetaPaciente")?.addEventListener("click", () => asignarCarpetaPorNombre(valorCampo("selectorCarpetasPaciente")));
document.getElementById("guardarNotaFlotante")?.addEventListener("click", guardarNotaFlotantePaciente);
document.getElementById("nuevaNotaFlotante")?.addEventListener("click", limpiarNotaFlotantePaciente);
document.getElementById("guardarInterconsulta")?.addEventListener("click", guardarInterconsultaPaciente);
document.getElementById("descargarInterconsulta")?.addEventListener("click", descargarInterconsultaPaciente);
document.getElementById("cerrarIngresoPaciente")?.addEventListener("click", cerrarSelectorIngresoPaciente);
document.getElementById("guardarIngresoPaciente")?.addEventListener("click", guardarIngresoPacienteDesdeModal);
document.getElementById("limpiarIngresoPaciente")?.addEventListener("click", limpiarIngresoPacienteDesdeModal);
document.getElementById("modalIngresoPaciente")?.addEventListener("click", (e) => {
  if (e.target.id === "modalIngresoPaciente") cerrarSelectorIngresoPaciente();
});

async function generarCodigoVinculacionDesdeMedico() {
  const contenedor = document.getElementById("codigoVinculacionMedico");
  if (!auth.currentUser || !uidPaciente) return;

  try {
    const codigo = await crearCodigoExpedienteParaPaciente(uidPaciente, auth.currentUser.uid);
    if (contenedor) contenedor.textContent = codigo;

    await registrarAccionExpediente({
      accion: "generar_codigo_vinculacion_paciente",
      descripcion: "El medico genero un codigo para vincular el expediente con la cuenta del paciente.",
      detalles: { codigo }
    });
  } catch (error) {
    alert("No se pudo generar el codigo: " + error.message);
  }
}

async function vincularCuentaPacienteDesdeMedico() {
  const input = document.getElementById("codigoPacienteParaMedico");
  const codigo = input?.value.trim().toUpperCase();

  if (!codigo) {
    alert("Escribe el codigo entregado por el paciente.");
    return;
  }

  if (!confirm("Vincular este expediente con la cuenta del paciente?")) return;

  try {
    const resultado = await vincularExpedienteConCodigoPaciente(
      codigo,
      uidPaciente,
      auth.currentUser?.uid || ""
    );

    await registrarAccionExpediente({
      accion: "vincular_expediente_con_cuenta_paciente",
      descripcion: "El medico vinculo un expediente previo con una cuenta de paciente.",
      detalles: {
        codigo,
        pacienteCuentaUid: resultado.pacienteUid,
        expedientePrevioUid: resultado.expedientePrevioUid
      }
    });

    alert("Cuenta vinculada correctamente.");
    window.location.href = `paciente.html?id=${resultado.pacienteUid}`;
  } catch (error) {
    alert("No se pudo vincular la cuenta: " + error.message);
  }
}

async function registrarAccionExpediente({ accion, descripcion, detalles = {} }) {
  const usuario = auth.currentUser;
  if (!usuario) return;

  const medico = await obtenerUsuario(usuario.uid);
  const paciente = datosPacienteActual || await obtenerUsuario(uidPaciente);

  await registrarEventoAuditoria({
    accion,
    modulo: "Expediente paciente",
    descripcion,
    usuarioUid: usuario.uid,
    usuarioNombre: medico?.nombre || usuario.email || "",
    usuarioRol: medico?.rol || "",
    pacienteUid: uidPaciente,
    pacienteNombre: paciente?.nombre || "",
    exito: true,
    detalles
  });
}

