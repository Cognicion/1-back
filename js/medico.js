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
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";

iniciarMonitoreoSesion("Panel medico");

let pacientesGlobal = [];
let uidMedicoActual = "";
let carpetasMedico = [];
let ultimaRecargaPacientes = 0;
const STORAGE_ORDEN_PACIENTES = "cognicion.medico.ordenPacientes";
let ordenPacientesActual = cargarPreferenciaOrdenPacientes();
const STORAGE_FILTRO_CARPETA = "cognicion.medico.filtroCarpeta";
let filtroCarpetaActual = cargarPreferenciaFiltroCarpeta();
const STORAGE_CARPETAS_VISIBLES = "cognicion.medico.carpetasVisibles";
let carpetasVisiblesInline = cargarPreferenciaCarpetasVisibles();
const FILTROS_ATENCION_DEFAULT = ["hospitalizados", "privado", "hpfba", "hpijnn", "otra"];
const STORAGE_FILTROS_ATENCION = "cognicion.medico.filtrosAtencion";
let filtrosAtencionActuales = cargarPreferenciasFiltroAtencion();
let mostrarPacientesArchivados = false;

const COLUMNAS_PACIENTES = [
  { key: "cama", label: "Cama", cssVar: "--col-cama" },
  { key: "nombre", label: "Nombre", cssVar: "--col-nombre", obligatoria: true },
  { key: "ingreso", label: "Ingreso", cssVar: "--col-ingreso" },
  { key: "estancia", label: "Estancia", cssVar: "--col-estancia" },
  { key: "edad", label: "Edad", cssVar: "--col-edad" },
  { key: "atencion", label: "Atencion en", cssVar: "--col-atencion" },
  { key: "diagnostico", label: "Diagnostico", cssVar: "--col-diagnostico" },
  { key: "medicamento", label: "Medicamento", cssVar: "--col-medicamento" },
  { key: "dosisDia", label: "Dosis/dia", cssVar: "--col-dosis-dia" },
  { key: "ultima", label: "Ultima consulta", cssVar: "--col-ultima" },
  { key: "proxima", label: "Proxima consulta", cssVar: "--col-proxima" },
  { key: "adscrito", label: "Adscrito", cssVar: "--col-adscrito" },
  { key: "residente", label: "Residente", cssVar: "--col-residente" },
  { key: "carpeta", label: "Carpeta", cssVar: "--col-carpeta" },
  { key: "archivo", label: "Archivo", cssVar: "--col-archivo" }
];
const COLUMNAS_PACIENTES_DEFAULT = COLUMNAS_PACIENTES.map((columna) => columna.key);
const STORAGE_COLUMNAS_PACIENTES = "cognicion.medico.columnasPacientes";
const STORAGE_COLUMNAS_PACIENTES_VERSION = "cognicion.medico.columnasPacientes.version";
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
  uidMedicoActual = user.uid;
  filtroCarpetaActual = cargarPreferenciaFiltroCarpeta();
  carpetasVisiblesInline = cargarPreferenciaCarpetasVisibles();

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
      guardarPreferenciaOrdenPacientes();
      filtrarPacientes();
    });
  }

  inicializarFiltroAtencion();
  inicializarColumnasPacientes();
  inicializarCarpetasPacientes();
  inicializarPacientesArchivados();
  inicializarPanelMedicoColapsable();

  await cargarCarpetasMedico(user.uid);
  await cargarPacientes(user.uid);
});

function inicializarPanelMedicoColapsable() {
  const botonContraer = document.getElementById("contraerPanelMedico");
  const botonExpandir = document.getElementById("expandirPanelMedico");
  const claseContraida = "panel-medico-contraido";

  document.body.classList.remove(claseContraida);

  const actualizarEstado = (contraido) => {
    document.body.classList.toggle(claseContraida, contraido);
    botonContraer?.setAttribute("aria-expanded", String(!contraido));
    botonExpandir?.setAttribute("aria-hidden", String(!contraido));
  };

  botonContraer?.addEventListener("click", () => actualizarEstado(true));
  botonExpandir?.addEventListener("click", () => actualizarEstado(false));
}

async function refrescarPacientesSiCorresponde() {
  if (!uidMedicoActual || document.hidden) return;
  if (Date.now() - ultimaRecargaPacientes < 2500) return;

  try {
    await cargarPacientes(uidMedicoActual, { silencioso: true });
  } catch (error) {
    console.warn("No se pudo refrescar el panel medico:", error);
  }
}

window.addEventListener("focus", refrescarPacientesSiCorresponde);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refrescarPacientesSiCorresponde();
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

  if (!["medico", "psicologo"].includes(datos.rol)) {
    alert("Acceso restringido al personal clinico.");
    await auth.signOut();
    window.location.href = "login.html";
    return false;
  }

  document.getElementById("nombreMedico").textContent =
    datos.nombre || "Médico sin nombre";

  return true;
}

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function claveStorageMedico(base) {
  return uidMedicoActual ? `${base}.${uidMedicoActual}` : base;
}

function slugCarpeta(nombre = "") {
  return String(nombre || "sin-carpeta")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sin-carpeta";
}

function obtenerCarpetasPaciente(paciente = {}, uidMedico = uidMedicoActual) {
  const carpetasPorMedico = paciente.carpetasPorMedico || {};
  const carpetasDelMedico = uidMedico ? carpetasPorMedico[uidMedico] : [];

  if (Array.isArray(carpetasDelMedico)) {
    return carpetasDelMedico.filter(Boolean);
  }

  if (typeof carpetasDelMedico === "string" && carpetasDelMedico.trim()) {
    return [carpetasDelMedico.trim()];
  }

  const carpetaLegacy = paciente.carpetaMedico || paciente.carpetaPaciente || paciente.carpeta || "";
  return carpetaLegacy ? [carpetaLegacy] : [];
}

function obtenerCarpetaPrincipal(paciente = {}) {
  return obtenerCarpetasPaciente(paciente)[0] || "";
}

function sincronizarCarpetasDesdePacientes() {
  const existentes = new Set(carpetasMedico.map((carpeta) => carpeta.toLowerCase()));

  pacientesGlobal.forEach((paciente) => {
    obtenerCarpetasPaciente(paciente).forEach((carpeta) => {
      const nombre = String(carpeta || "").trim();
      if (!nombre || existentes.has(nombre.toLowerCase())) return;
      carpetasMedico.push(nombre);
      existentes.add(nombre.toLowerCase());
    });
  });

  carpetasMedico.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

async function cargarCarpetasMedico(uidMedico = uidMedicoActual) {
  if (!uidMedico) return;

  const snap = await getDocs(query(
    collection(db, "usuarios", uidMedico, "carpetasPacientes"),
    orderBy("nombre", "asc")
  ));

  carpetasMedico = snap.docs
    .map((docCarpeta) => docCarpeta.data()?.nombre || "")
    .filter(Boolean);

  renderizarSelectorFiltroCarpetas();
  renderizarListaCarpetasMedico();
  renderizarOpcionesCarpetasVisibles();
  renderizarCarpetasInlineMedico();
}

function renderizarSelectorFiltroCarpetas() {
  const selector = document.getElementById("filtroCarpetaMedico");
  if (!selector) return;

  selector.innerHTML = `
    <option value="">Todas las carpetas</option>
    <option value="__sin_carpeta__">Sin carpeta</option>
    ${carpetasMedico.map((carpeta) => `
      <option value="${escaparHTML(carpeta)}">${escaparHTML(carpeta)}</option>
    `).join("")}
  `;
  selector.value = filtroCarpetaActual;
}

function renderizarListaCarpetasMedico() {
  const lista = document.getElementById("listaCarpetasMedico");
  if (!lista) return;

  if (carpetasMedico.length === 0) {
    lista.innerHTML = "<p>Sin carpetas creadas.</p>";
    return;
  }

  lista.innerHTML = carpetasMedico.map((carpeta) => {
    const total = pacientesGlobal.filter((paciente) =>
      obtenerCarpetasPaciente(paciente).includes(carpeta)
    ).length;
    return `
      <div class="carpeta-chip-medico">
        <button type="button" class="carpeta-chip-abrir" data-filtro-carpeta="${escaparHTML(carpeta)}">
          <span>${escaparHTML(carpeta)}</span>
          <small>${total}</small>
        </button>
        <button type="button" class="carpeta-chip-editar" data-editar-carpeta="${escaparHTML(carpeta)}">
          Editar
        </button>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-filtro-carpeta]").forEach((boton) => {
    boton.addEventListener("click", () => {
      filtroCarpetaActual = boton.dataset.filtroCarpeta || "";
      guardarPreferenciaFiltroCarpeta();
      renderizarSelectorFiltroCarpetas();
      actualizarTextoCarpetasPacientes();
      filtrarPacientes();
      cerrarCarpetasPacientes();
    });
  });

  lista.querySelectorAll("[data-editar-carpeta]").forEach((boton) => {
    boton.addEventListener("click", () => {
      editarNombreCarpetaMedico(boton.dataset.editarCarpeta || "");
    });
  });
}

async function editarNombreCarpetaMedico(nombreActual = "") {
  const actual = nombreActual.trim();
  if (!actual || !uidMedicoActual) return;

  const nuevoNombre = prompt("Nuevo nombre de la carpeta:", actual)?.trim() || "";
  if (!nuevoNombre || nuevoNombre === actual) return;

  if (carpetasMedico.some((carpeta) => carpeta.toLowerCase() === nuevoNombre.toLowerCase() && carpeta !== actual)) {
    alert("Ya existe una carpeta con ese nombre.");
    return;
  }

  const idAnterior = slugCarpeta(actual);
  const idNuevo = slugCarpeta(nuevoNombre);

  try {
    await setDoc(doc(db, "usuarios", uidMedicoActual, "carpetasPacientes", idNuevo), {
      nombre: nuevoNombre,
      fechaActualizacion: new Date().toISOString(),
      renombradaDesde: actual
    }, { merge: true });

    if (idNuevo !== idAnterior) {
      await deleteDoc(doc(db, "usuarios", uidMedicoActual, "carpetasPacientes", idAnterior));
    }

    const pacientesPorActualizar = pacientesGlobal.filter((paciente) =>
      obtenerCarpetasPaciente(paciente).includes(actual)
    );

    await Promise.all(pacientesPorActualizar.map(async (paciente) => {
      const carpetas = obtenerCarpetasPaciente(paciente).map((carpeta) =>
        carpeta === actual ? nuevoNombre : carpeta
      );
      await updateDoc(doc(db, "usuarios", paciente.id), {
        [`carpetasPorMedico.${uidMedicoActual}`]: carpetas
      });
      paciente.carpetasPorMedico = {
        ...(paciente.carpetasPorMedico || {}),
        [uidMedicoActual]: carpetas
      };
    }));

    if (filtroCarpetaActual === actual) {
      filtroCarpetaActual = nuevoNombre;
      guardarPreferenciaFiltroCarpeta();
    }

    if (carpetasVisiblesInline !== null && carpetasVisiblesInline.has(actual)) {
      carpetasVisiblesInline.delete(actual);
      carpetasVisiblesInline.add(nuevoNombre);
      guardarPreferenciaCarpetasVisibles();
    }

    await cargarCarpetasMedico(uidMedicoActual);
    actualizarTextoCarpetasPacientes();
    filtrarPacientes();
  } catch (error) {
    alert("No se pudo editar la carpeta: " + error.message);
  }
}

function cargarPreferenciaCarpetasVisibles() {
  try {
    const guardado = localStorage.getItem(claveStorageMedico(STORAGE_CARPETAS_VISIBLES));
    if (!guardado) return null;

    const carpetas = JSON.parse(guardado);
    return Array.isArray(carpetas) ? new Set(carpetas) : null;
  } catch (error) {
    console.warn("No se pudo cargar la preferencia de carpetas visibles:", error);
    return null;
  }
}

function guardarPreferenciaCarpetasVisibles() {
  try {
    const clave = claveStorageMedico(STORAGE_CARPETAS_VISIBLES);
    if (carpetasVisiblesInline === null) {
      localStorage.removeItem(clave);
      return;
    }

    localStorage.setItem(clave, JSON.stringify([...carpetasVisiblesInline]));
  } catch (error) {
    console.warn("No se pudo guardar la preferencia de carpetas visibles:", error);
  }
}

function carpetaInlineVisible(carpeta = "") {
  return carpetasVisiblesInline === null || carpetasVisiblesInline.has(carpeta);
}

function carpetasInlineDisponibles() {
  return carpetasMedico.filter(carpetaInlineVisible);
}

function renderizarOpcionesCarpetasVisibles() {
  const contenedor = document.getElementById("opcionesCarpetasVisibles");
  if (!contenedor) return;

  const opciones = [
    ...carpetasMedico.map((carpeta) => ({ valor: carpeta, etiqueta: carpeta })),
    { valor: "__sin_carpeta__", etiqueta: "Sin carpeta" }
  ];

  if (opciones.length === 0) {
    contenedor.innerHTML = `<p>Sin carpetas creadas.</p>`;
    return;
  }

  contenedor.innerHTML = opciones.map((opcion) => `
    <label class="opcion-carpeta-visible">
      <input
        type="checkbox"
        class="carpeta-visible-check"
        value="${escaparHTML(opcion.valor)}"
        ${carpetaInlineVisible(opcion.valor) ? "checked" : ""}
      >
      <span>${escaparHTML(opcion.etiqueta)}</span>
    </label>
  `).join("");
}

function aplicarChecksCarpetasVisibles() {
  const checks = [...document.querySelectorAll(".carpeta-visible-check")];
  carpetasVisiblesInline = new Set(
    checks
      .filter((check) => check.checked)
      .map((check) => check.value)
  );

  if (!filtroCarpetaActual || carpetaInlineVisible(filtroCarpetaActual)) {
    guardarPreferenciaCarpetasVisibles();
    renderizarCarpetasInlineMedico();
    return;
  }

  filtroCarpetaActual = "";
  guardarPreferenciaFiltroCarpeta();
  guardarPreferenciaCarpetasVisibles();
  actualizarTextoCarpetasPacientes();
  renderizarSelectorFiltroCarpetas();
  renderizarCarpetasInlineMedico();
  filtrarPacientes();
}

function marcarTodasCarpetasVisibles() {
  carpetasVisiblesInline = null;
  guardarPreferenciaCarpetasVisibles();
  renderizarOpcionesCarpetasVisibles();
  renderizarCarpetasInlineMedico();
}

function ocultarTodasCarpetasVisibles() {
  carpetasVisiblesInline = new Set();
  if (filtroCarpetaActual) {
    filtroCarpetaActual = "";
    guardarPreferenciaFiltroCarpeta();
    actualizarTextoCarpetasPacientes();
    filtrarPacientes();
  }
  guardarPreferenciaCarpetasVisibles();
  renderizarOpcionesCarpetasVisibles();
  renderizarCarpetasInlineMedico();
}

function totalPacientesEnCarpeta(carpeta = "") {
  if (carpeta === "__sin_carpeta__") {
    return pacientesGlobal.filter((paciente) => obtenerCarpetasPaciente(paciente).length === 0).length;
  }

  if (!carpeta) return pacientesGlobal.length;

  return pacientesGlobal.filter((paciente) =>
    obtenerCarpetasPaciente(paciente).includes(carpeta)
  ).length;
}

function abrirCarpetaDesdeLista(carpeta = "") {
  filtroCarpetaActual = carpeta;
  guardarPreferenciaFiltroCarpeta();
  renderizarSelectorFiltroCarpetas();
  actualizarTextoCarpetasPacientes();
  renderizarCarpetasInlineMedico();
  filtrarPacientes();
}

function renderizarCarpetasInlineMedico() {
  const contenedor = document.getElementById("carpetasPacientesInline");
  if (!contenedor) return;

  const carpetas = [
    { valor: "", etiqueta: "Todos", total: totalPacientesEnCarpeta(""), editable: false },
    ...carpetasInlineDisponibles().map((carpeta) => ({
      valor: carpeta,
      etiqueta: carpeta,
      total: totalPacientesEnCarpeta(carpeta),
      editable: true
    })),
    ...(carpetaInlineVisible("__sin_carpeta__")
      ? [{ valor: "__sin_carpeta__", etiqueta: "Sin carpeta", total: totalPacientesEnCarpeta("__sin_carpeta__"), editable: false }]
      : [])
  ];

  contenedor.innerHTML = carpetas.map((carpeta) => {
    const activa = filtroCarpetaActual === carpeta.valor;
    return `
      <div class="carpeta-inline-grupo ${activa ? "activa" : ""}">
        <button
          type="button"
          class="carpeta-inline-medico ${activa ? "activa" : ""}"
          data-carpeta-inline="${escaparHTML(carpeta.valor)}"
          title="Abrir ${escaparHTML(carpeta.etiqueta)}"
        >
          <span>${escaparHTML(carpeta.etiqueta)}</span>
          <small>${carpeta.total}</small>
        </button>
      </div>
    `;
  }).join("");

  contenedor.querySelectorAll("[data-carpeta-inline]").forEach((boton) => {
    boton.addEventListener("click", () => {
      abrirCarpetaDesdeLista(boton.dataset.carpetaInline || "");
    });

    boton.addEventListener("keydown", (e) => {
      if (e.key === "Enter") abrirCarpetaDesdeLista(boton.dataset.carpetaInline || "");
    });
  });
}

function opcionesCarpetasHTML(seleccionada = "") {
  return `
    <option value="" ${!seleccionada ? "selected" : ""}>Sin carpeta</option>
    ${carpetasMedico.map((carpeta) => `
      <option value="${escaparHTML(carpeta)}" ${carpeta === seleccionada ? "selected" : ""}>
        ${escaparHTML(carpeta)}
      </option>
    `).join("")}
  `;
}

async function crearCarpetaMedico() {
  const input = document.getElementById("nuevaCarpetaMedico");
  const nombre = input?.value?.trim() || "";

  if (!nombre) {
    alert("Escribe el nombre de la carpeta.");
    return;
  }

  if (!uidMedicoActual) return;

  await setDoc(doc(db, "usuarios", uidMedicoActual, "carpetasPacientes", slugCarpeta(nombre)), {
    nombre,
    fechaActualizacion: new Date().toISOString()
  }, { merge: true });

  if (input) input.value = "";
  if (carpetasVisiblesInline !== null) {
    carpetasVisiblesInline.add(nombre);
    guardarPreferenciaCarpetasVisibles();
  }
  filtroCarpetaActual = nombre;
  guardarPreferenciaFiltroCarpeta();
  await cargarCarpetasMedico(uidMedicoActual);
  actualizarTextoCarpetasPacientes();
  renderizarCarpetasInlineMedico();
  filtrarPacientes();
}

function cargarPreferenciaFiltroCarpeta() {
  try {
    return localStorage.getItem(claveStorageMedico(STORAGE_FILTRO_CARPETA)) || "";
  } catch (error) {
    console.warn("No se pudo cargar el filtro de carpeta:", error);
    return "";
  }
}

function guardarPreferenciaFiltroCarpeta() {
  try {
    localStorage.setItem(claveStorageMedico(STORAGE_FILTRO_CARPETA), filtroCarpetaActual);
  } catch (error) {
    console.warn("No se pudo guardar el filtro de carpeta:", error);
  }
}

function actualizarTextoCarpetasPacientes() {
  const boton = document.getElementById("btnCarpetasPacientes");
  if (!boton) return;

  if (!filtroCarpetaActual) {
    boton.textContent = "Carpetas";
  } else if (filtroCarpetaActual === "__sin_carpeta__") {
    boton.textContent = "Carpeta: sin carpeta";
  } else {
    boton.textContent = `Carpeta: ${filtroCarpetaActual}`;
  }
  renderizarCarpetasInlineMedico();
}

function moverModalesPacienteAlBody() {
  [
    "modalFiltroAtencion",
    "modalColumnasPacientes",
    "modalCarpetasPacientes"
  ].forEach((id) => {
    const modal = document.getElementById(id);
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  });
}

function abrirCarpetasPacientes() {
  const modal = document.getElementById("modalCarpetasPacientes");
  if (!modal) return;

  renderizarSelectorFiltroCarpetas();
  renderizarListaCarpetasMedico();
  renderizarOpcionesCarpetasVisibles();
  sincronizarFiltroColumnaCarpeta();
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarCarpetasPacientes() {
  const modal = document.getElementById("modalCarpetasPacientes");
  if (!modal) return;

  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function aplicarFiltroCarpetaDesdeModal() {
  filtroCarpetaActual = document.getElementById("filtroCarpetaMedico")?.value || "";
  guardarPreferenciaFiltroCarpeta();
  actualizarTextoCarpetasPacientes();
  filtrarPacientes();
  cerrarCarpetasPacientes();
}

function sincronizarFiltroColumnaCarpeta() {
  const check = document.getElementById("mostrarColumnaCarpetaMedico");
  if (!check) return;

  check.checked = columnasPacientesVisibles.has("carpeta");
}

function alternarColumnaCarpetaDesdeFiltro() {
  const check = document.getElementById("mostrarColumnaCarpetaMedico");
  if (!check) return;

  if (check.checked) {
    columnasPacientesVisibles.add("carpeta");
  } else {
    columnasPacientesVisibles.delete("carpeta");
  }

  guardarPreferenciasColumnasPacientes();
  aplicarColumnasPacientes();
  renderizarOpcionesColumnasPacientes();
}

function inicializarCarpetasPacientes() {
  moverModalesPacienteAlBody();
  actualizarTextoCarpetasPacientes();
  inicializarCarpetasInlineColapsables();

  document.getElementById("btnCarpetasPacientes")?.addEventListener("click", abrirCarpetasPacientes);
  document.getElementById("cerrarCarpetasPacientes")?.addEventListener("click", cerrarCarpetasPacientes);
  document.getElementById("crearCarpetaMedico")?.addEventListener("click", crearCarpetaMedico);
  document.getElementById("aplicarFiltroCarpetaMedico")?.addEventListener("click", aplicarFiltroCarpetaDesdeModal);
  document.getElementById("mostrarColumnaCarpetaMedico")?.addEventListener("change", alternarColumnaCarpetaDesdeFiltro);
  document.getElementById("opcionesCarpetasVisibles")?.addEventListener("change", (e) => {
    if (e.target.closest(".carpeta-visible-check")) aplicarChecksCarpetasVisibles();
  });
  document.getElementById("mostrarTodasCarpetasInline")?.addEventListener("click", marcarTodasCarpetasVisibles);
  document.getElementById("ocultarTodasCarpetasInline")?.addEventListener("click", ocultarTodasCarpetasVisibles);
  document.getElementById("limpiarFiltroCarpetaMedico")?.addEventListener("click", () => {
    filtroCarpetaActual = "";
    guardarPreferenciaFiltroCarpeta();
    renderizarSelectorFiltroCarpetas();
    actualizarTextoCarpetasPacientes();
    renderizarCarpetasInlineMedico();
    filtrarPacientes();
    cerrarCarpetasPacientes();
  });
  document.getElementById("modalCarpetasPacientes")?.addEventListener("click", (e) => {
    if (e.target.id === "modalCarpetasPacientes") cerrarCarpetasPacientes();
  });
}

function inicializarCarpetasInlineColapsables() {
  const contenedor = document.querySelector(".carpetas-lista-pacientes");
  const boton = document.getElementById("alternarCarpetasInline");
  if (!contenedor || !boton) return;

  contenedor.classList.remove("carpetas-contraidas");
  boton.setAttribute("aria-expanded", "true");

  boton.addEventListener("click", () => {
    const contraidas = contenedor.classList.toggle("carpetas-contraidas");
    boton.setAttribute("aria-expanded", String(!contraidas));
    boton.setAttribute("aria-label", contraidas ? "Expandir carpetas" : "Contraer carpetas");
  });
}

async function cargarPacientes(uidMedico, opciones = {}) {
  const lista = document.getElementById("listaPacientes");
  if (!opciones.silencioso && lista) lista.innerHTML = "Cargando pacientes...";

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

  sincronizarCarpetasDesdePacientes();
  renderizarSelectorFiltroCarpetas();
  renderizarOpcionesCarpetasVisibles();
  filtrarPacientes();
  renderizarListaCarpetasMedico();
  renderizarCarpetasInlineMedico();
  calcularEstadisticas(pacientesGlobal.filter((paciente) => !pacienteArchivadoParaMedico(paciente)));
  ultimaRecargaPacientes = Date.now();
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

function numeroDesdeTextoMedicamento(valor = "") {
  const texto = String(valor || "").trim().replace(",", ".");
  const fraccion = texto.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraccion) {
    const numerador = Number(fraccion[1]);
    const denominador = Number(fraccion[2]);
    return denominador ? numerador / denominador : 0;
  }

  const numero = texto.match(/\d+(?:\.\d+)?/);
  return numero ? Number(numero[0]) : 0;
}

function calcularDosisTotalDiaMedicamento(t = {}) {
  if (t.dosisTotalDia || t.dosisDia) return t.dosisTotalDia || t.dosisDia;

  const presentacion = String(t.medicamento || "").match(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|\u00b5g|g|ml|ui|u)\b/i);
  const cantidades = [...String(t.dosis || "").matchAll(/(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*(?:tabletas?|tabs?|comprimidos?|capsulas?|caps?|gotas?|ampolletas?|ml|mg|mg\.|capsula|tableta)\b/gi)]
    .map((match) => numeroDesdeTextoMedicamento(match[1]))
    .filter((valor) => valor > 0);
  const textoFrecuencia = String(t.frecuencia || "").toLowerCase();
  const veces =
    numeroDesdeTextoMedicamento(textoFrecuencia) ||
    (textoFrecuencia.includes("cada 24") ? 1 : 0) ||
    (textoFrecuencia.includes("cada 12") ? 2 : 0) ||
    (textoFrecuencia.includes("cada 8") ? 3 : 0) ||
    (textoFrecuencia.includes("cada 6") ? 4 : 0);
  const cantidadManual = Number(String(t.cantidadTotalDia || "").replace(",", "."));

  let cantidadTotal = Number.isFinite(cantidadManual) && cantidadManual > 0 ? cantidadManual : 0;
  if (!cantidadTotal && cantidades.length > 1) cantidadTotal = cantidades.reduce((total, valor) => total + valor, 0);
  if (!cantidadTotal && cantidades.length === 1 && veces > 0) cantidadTotal = cantidades[0] * veces;
  if (!cantidadTotal && cantidades.length === 1) cantidadTotal = cantidades[0];
  if (!cantidadTotal) return "";

  if (!presentacion) return `${cantidadTotal} unidad${cantidadTotal === 1 ? "" : "es"}/dia`;

  const total = cantidadTotal * Number(presentacion[1].replace(",", "."));
  const redondeado = Number.isInteger(total) ? total : Number(total.toFixed(2));
  return `${redondeado} ${presentacion[2].replace("\u00b5g", "mcg")}/dia`;
}

function obtenerResumenMedicamentosDosisDia(paciente = {}) {
  const tratamientos = tratamientosActivosPaciente(paciente);
  const resumen = paciente.datosClinicosResumen || {};
  const dosisResumen = Array.isArray(resumen.medicamentosDosisDia)
    ? resumen.medicamentosDosisDia
    : [];

  if (!tratamientos.length && dosisResumen.length) {
    return {
      medicamentos: dosisResumen
        .map((item) => etiquetaMedicamentoGrafica(item?.medicamento || item))
        .filter(Boolean),
      dosis: dosisResumen.map((item) => item.dosisDia).filter(Boolean)
    };
  }

  return {
    medicamentos: tratamientos
      .map((t) => t.medicamento || t.texto || "")
      .filter(Boolean),
    dosis: tratamientos
      .map(calcularDosisTotalDiaMedicamento)
      .filter(Boolean)
  };
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

  if (!institucion && (tipoPaciente === "privada" || tipoPaciente !== "institucion")) {
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

function deduplicarPacientes(pacientes = []) {
  const vistos = new Set();
  return pacientes.filter((paciente) => {
    const clave = paciente.id || `${paciente.nombre || ""}-${obtenerFechaNacimiento(paciente) || ""}-${obtenerCamaPaciente(paciente) || ""}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function pacienteArchivadoParaMedico(paciente) {
  if (!paciente || !uidMedicoActual) return false;
  return Boolean(paciente.archivadoPorMedico?.[uidMedicoActual]);
}

function actualizarTextoPacientesArchivados() {
  const boton = document.getElementById("btnPacientesArchivados");
  if (!boton) return;

  boton.textContent = mostrarPacientesArchivados ? "Ver activos" : "Ver archivados";
  boton.classList.toggle("activo", mostrarPacientesArchivados);
}

function inicializarPacientesArchivados() {
  const boton = document.getElementById("btnPacientesArchivados");
  if (!boton) return;

  actualizarTextoPacientesArchivados();
  boton.addEventListener("click", () => {
    mostrarPacientesArchivados = !mostrarPacientesArchivados;
    actualizarTextoPacientesArchivados();
    filtrarPacientes();
  });
}

async function alternarArchivoPaciente(pacienteId, archivar) {
  if (!pacienteId || !uidMedicoActual) return;

  const paciente = pacientesGlobal.find((item) => item.id === pacienteId);
  const nombre = paciente?.nombre || "este paciente";
  const mensaje = archivar
    ? `¿Archivar a ${nombre}? Podrás verlo después en "Ver archivados".`
    : `¿Restaurar a ${nombre} a la lista activa?`;

  if (!confirm(mensaje)) return;

  const fechaArchivo = new Date().toISOString();

  await updateDoc(doc(db, "usuarios", pacienteId), {
    [`archivadoPorMedico.${uidMedicoActual}`]: archivar,
    [`archivadoPorMedicoFecha.${uidMedicoActual}`]: fechaArchivo
  });

  if (paciente) {
    paciente.archivadoPorMedico = {
      ...(paciente.archivadoPorMedico || {}),
      [uidMedicoActual]: archivar
    };
    paciente.archivadoPorMedicoFecha = {
      ...(paciente.archivadoPorMedicoFecha || {}),
      [uidMedicoActual]: fechaArchivo
    };
  }

  filtrarPacientes();
  renderizarListaCarpetasMedico();
  renderizarCarpetasInlineMedico();
  calcularEstadisticas(pacientesGlobal.filter((item) => !pacienteArchivadoParaMedico(item)));
}

function mostrarPacientes(pacientes) {
  const lista = document.getElementById("listaPacientes");
  lista.innerHTML = "";
  const pacientesUnicos = deduplicarPacientes(pacientes);

  if (pacientesUnicos.length === 0) {
    lista.innerHTML = `
      <p class="paciente-vacio">
        No hay pacientes registrados.
      </p>
    `;
    return;
  }

  const filas = pacientesUnicos.map((paciente) => {
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
    const carpetaPrincipal = obtenerCarpetaPrincipal(paciente);
    const archivado = pacienteArchivadoParaMedico(paciente);
    const textoArchivo = archivado ? "Restaurar" : "Archivar";
    const tituloArchivo = archivado ? "Restaurar paciente a lista activa" : "Archivar paciente";
    const resumenMedicamentos = obtenerResumenMedicamentosDosisDia(paciente);
    const medicamentosHtml = resumenMedicamentos.medicamentos.length
      ? resumenMedicamentos.medicamentos.map((med) => `<span>${escaparHTML(med)}</span>`).join("")
      : "<span>Sin medicamento</span>";
    const dosisDiaHtml = resumenMedicamentos.dosis.length
      ? resumenMedicamentos.dosis.map((dosis) => `<span>${escaparHTML(dosis)}</span>`).join("")
      : "<span>Sin registro</span>";

    return `
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
        <span class="paciente-dato medicamento-columna" data-col-key="medicamento">${medicamentosHtml}</span>
        <span class="paciente-dato dosis-dia-columna" data-col-key="dosisDia">${dosisDiaHtml}</span>
        <span class="paciente-dato" data-col-key="ultima">${ultimaConsulta}</span>
        <span class="paciente-dato" data-col-key="proxima">${proximaConsulta}</span>
        <span class="paciente-dato" data-col-key="adscrito">${medicoAdscrito}</span>
        <span class="paciente-dato" data-col-key="residente">${residente}</span>
        <span class="paciente-dato carpeta-columna" data-col-key="carpeta">
          <select class="selector-carpeta" data-paciente-id="${paciente.id}" aria-label="Carpeta">
            ${opcionesCarpetasHTML(carpetaPrincipal)}
          </select>
        </span>
        <span class="paciente-dato archivo-columna" data-col-key="archivo">
          <button
            type="button"
            class="boton-archivo-paciente ${archivado ? "restaurar" : ""}"
            data-paciente-id="${paciente.id}"
            data-archivar="${archivado ? "false" : "true"}"
            aria-label="${tituloArchivo}">
            ${textoArchivo}
          </button>
        </span>
      </a>
    `;
  });

  lista.innerHTML = filas.join("");

  aplicarColumnasPacientes();
}

function filtrarPacientes() {
  const buscador = document.getElementById("buscadorPacientes");
  const texto = buscador ? buscador.value.toLowerCase() : "";

  const filtrados = pacientesGlobal.filter((paciente) => {
    if (pacienteArchivadoParaMedico(paciente) !== mostrarPacientesArchivados) return false;

    const carpetasPaciente = obtenerCarpetasPaciente(paciente);
    const coincideCarpeta = !filtroCarpetaActual ||
      (filtroCarpetaActual === "__sin_carpeta__" && carpetasPaciente.length === 0) ||
      carpetasPaciente.includes(filtroCarpetaActual);

    if (!coincideCarpeta) return false;

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
    const carpeta = obtenerCarpetaPrincipal(paciente).toLowerCase();
    const diagnostico = formatearDiagnostico(obtenerDiagnosticosPaciente(paciente).principal).toLowerCase();
    const resumenMedicamentos = obtenerResumenMedicamentosDosisDia(paciente);
    const medicamentos = resumenMedicamentos.medicamentos.join(" ").toLowerCase();
    const dosisDia = resumenMedicamentos.dosis.join(" ").toLowerCase();
    return [nombre, cama, fechaIngreso, medicoAdscrito, residente, atencion, carpeta, diagnostico, medicamentos, dosisDia].some((valor) => valor.includes(texto));
  });

  const ordenados = deduplicarPacientes(ordenarPacientes(filtrados));
  mostrarPacientes(ordenados);
  renderizarGraficasMedico(ordenados);
}

function cargarPreferenciaOrdenPacientes() {
  try {
    return localStorage.getItem(STORAGE_ORDEN_PACIENTES) || "nombre_asc";
  } catch (error) {
    console.warn("No se pudo cargar el orden de pacientes:", error);
    return "nombre_asc";
  }
}

function guardarPreferenciaOrdenPacientes() {
  try {
    localStorage.setItem(STORAGE_ORDEN_PACIENTES, ordenPacientesActual);
  } catch (error) {
    console.warn("No se pudo guardar el orden de pacientes:", error);
  }
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
    if (localStorage.getItem(STORAGE_COLUMNAS_PACIENTES_VERSION) !== "archivo-v1") {
      if (!visibles.includes("carpeta")) visibles.push("carpeta");
      if (!visibles.includes("medicamento")) visibles.push("medicamento");
      if (!visibles.includes("dosisDia")) visibles.push("dosisDia");
      if (!visibles.includes("archivo")) visibles.push("archivo");
      localStorage.setItem(STORAGE_COLUMNAS_PACIENTES_VERSION, "archivo-v1");
      localStorage.setItem(STORAGE_COLUMNAS_PACIENTES, JSON.stringify(visibles));
    }

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
      cerrarCarpetasPacientes();
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

function etiquetaDiagnosticoGrafica(dx) {
  if (!dx) return "";
  if (typeof dx === "string") return dx.trim().slice(0, 36);

  if (typeof dx !== "object") return String(dx || "").trim().slice(0, 36);

  const codigo = dx.codigo || "";
  const nombre = dx.nombre || dx.texto || dx.descripcion || dx.diagnostico || "";
  const etiqueta = codigo && nombre
    ? `${codigo} ${nombre}`
    : (codigo || nombre || "");

  return etiqueta.trim().slice(0, 36);
}

function diagnosticosParaGrafica(paciente = {}) {
  const acumulados = [];

  if (Array.isArray(paciente.historialDiagnosticos)) {
    acumulados.push(...paciente.historialDiagnosticos);
  }

  if (Array.isArray(paciente.diagnosticos)) {
    acumulados.push(...paciente.diagnosticos);
  }

  if (paciente.diagnostico) {
    acumulados.push(paciente.diagnostico);
  }

  const vistos = new Set();
  return acumulados.filter((dx) => {
    const clave = claveDiagnostico(dx);
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function contarDiagnosticosTodos(pacientes = []) {
  return pacientes.reduce((conteo, paciente) => {
    const diagnosticos = diagnosticosParaGrafica(paciente);

    if (!diagnosticos.length) {
      conteo["Sin diagnóstico"] = (conteo["Sin diagnóstico"] || 0) + 1;
      return conteo;
    }

    diagnosticos.forEach((dx) => {
      const etiqueta = etiquetaDiagnosticoGrafica(dx) || "Sin diagnóstico";
      conteo[etiqueta] = (conteo[etiqueta] || 0) + 1;
    });

    return conteo;
  }, {});
}

function etiquetaMedicamentoGrafica(valor = "") {
  const crudo = (valor && typeof valor === "object")
    ? (
      valor.medicamento ||
      valor.nombre ||
      valor.texto ||
      valor.descripcion ||
      valor.principioActivo ||
      valor.presentacion ||
      ""
    )
    : valor;

  const texto = String(crudo || "").trim();
  if (!texto) return "";
  if (texto === "[object Object]") return "";

  const antesDeComa = texto.split(",")[0]?.trim();
  const antesDePunto = texto.split(".")[0]?.trim();
  const etiqueta = antesDeComa || antesDePunto || texto;

  return etiqueta.slice(0, 36);
}

function tratamientosActivosPaciente(paciente = {}) {
  const resumen = paciente.datosClinicosResumen || {};

  const limpiar = (lista = []) => lista
    .filter((t) => t && (typeof t !== "object" || (t.estado || "activo") === "activo"))
    .map((t) => {
      if (typeof t === "string") return { medicamento: t };
      return t;
    })
    .filter((t) => etiquetaMedicamentoGrafica(t));

  if (Array.isArray(resumen.tratamientosActivos)) {
    return limpiar(resumen.tratamientosActivos);
  }

  if (Array.isArray(paciente.tratamientosActivos)) {
    return limpiar(paciente.tratamientosActivos);
  }

  if (Array.isArray(paciente.tratamientos)) {
    return limpiar(paciente.tratamientos);
  }

  const textoResumen = resumen.tratamientoActivo || paciente.tratamiento || "";
  return textoResumen
    ? String(textoResumen).split(/\n+/).map((medicamento) => ({ medicamento }))
    : [];
}

function contarMedicamentosIndicados(pacientes = []) {
  return pacientes.reduce((conteo, paciente) => {
    tratamientosActivosPaciente(paciente).forEach((tratamiento) => {
      const etiqueta = etiquetaMedicamentoGrafica(tratamiento);
      if (!etiqueta) return;
      conteo[etiqueta] = (conteo[etiqueta] || 0) + 1;
    });

    return conteo;
  }, {});
}

function dibujarBarras(canvasId, conteo) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  const barH = 28;
  const separacion = 10;
  const cssHeight = Math.max(
    Number(canvas.getAttribute("height")) || 180,
    28 + entradas.length * (barH + separacion)
  );

  canvas.style.height = `${cssHeight}px`;
  canvas.width = rect.width * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  const max = Math.max(...entradas.map(([, v]) => v), 1);

  ctx.font = "12px Arial";

  if (!entradas.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Sin datos registrados", 8, 32);
    return;
  }

  entradas.forEach(([label, valor], i) => {
    const y = 18 + i * (barH + separacion);
    const barW = Math.max(2, (width - 150) * valor / max);
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
  dibujarBarras("graficaDiagnosticos", contarDiagnosticosTodos(pacientes));
  dibujarBarras("graficaMedicamentos", contarMedicamentosIndicados(pacientes));
}

document.addEventListener("click", (e) => {
  const botonArchivo = e.target.closest(".boton-archivo-paciente");
  if (botonArchivo) {
    e.preventDefault();
    e.stopPropagation();
    alternarArchivoPaciente(
      botonArchivo.dataset.pacienteId,
      botonArchivo.dataset.archivar === "true"
    ).catch((error) => {
      alert("No se pudo actualizar el archivo del paciente: " + error.message);
    });
    return;
  }

  if (e.target.closest(".selector-atencion, .selector-carpeta")) {
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
    if (!e.target.closest(".selector-atencion, .selector-carpeta, .boton-archivo-paciente")) return;

    e.stopPropagation();
  }, true);
});

document.addEventListener("change", async (e) => {
  const selectorCarpeta = e.target.closest(".selector-carpeta");
  if (selectorCarpeta) {
    e.preventDefault();
    e.stopPropagation();

    const pacienteId = selectorCarpeta.dataset.pacienteId;
    const carpeta = selectorCarpeta.value;
    const paciente = pacientesGlobal.find((item) => item.id === pacienteId);
    const anterior = paciente ? obtenerCarpetaPrincipal(paciente) : "";

    if (!pacienteId) return;

    try {
      const carpetas = carpeta ? [carpeta] : [];
      await updateDoc(doc(db, "usuarios", pacienteId), {
        [`carpetasPorMedico.${uidMedicoActual}`]: carpetas
      });

      if (paciente) {
        paciente.carpetasPorMedico = {
          ...(paciente.carpetasPorMedico || {}),
          [uidMedicoActual]: carpetas
        };
      }

      renderizarListaCarpetasMedico();
      renderizarCarpetasInlineMedico();
      filtrarPacientes();
    } catch (error) {
      selectorCarpeta.value = anterior;
      alert("No se pudo mover el paciente de carpeta: " + error.message);
    }
    return;
  }

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
