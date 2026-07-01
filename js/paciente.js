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
let tratamientosCache = [];
let estudiosCache = [];
let escalasAsignadasCache = new Map();
let diagnosticosCatalogoActual = [];
let diagnosticoReemplazoIndex = null;

iniciarMonitoreoSesion("Expediente paciente");

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
    fechaSeleccion: diagnostico.fechaSeleccion || new Date().toISOString()
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
  return catalogo === "CIE-11" ? CIE11 : CIE10;
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
        <strong>${escaparHTML(dx.catalogo)} ${escaparHTML(dx.codigo)}</strong>
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
          <button type="button" data-editar-diagnostico="${index}">Ajustar texto</button>
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
    "fechaIngreso",
    "medicoAdscritoEncargado",
    "residenteEncargado",
    "fechaNacimiento",
    "sexo",
    "genero",
    "alergias",
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
  }

  await actualizarUsuario(uidPaciente, actualizacion);
  await cargarDatosPaciente();
};

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
    historialDiagnosticos: limpio
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

  const texto = prompt("Texto del diagnostico:", diagnostico.texto || diagnostico.nombre || "");
  if (texto === null) return;

  const actualizado = {
    ...diagnostico,
    nombre: texto.trim() || diagnostico.nombre,
    texto: texto.trim() || diagnostico.texto || diagnostico.nombre,
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
    tratamiento: resumen
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

