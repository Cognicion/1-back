import { auth, db } from "./firebase.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { MEDICAMENTOS } from "./data/medicamentos.js";
import { ESCALAS_PSIQUIATRICAS, interpretarEscala } from "./data/escalasPsiquiatricas.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  obtenerUsuario,
  listarPacientes,
  actualizarUsuario
} from "./services/usuarios.js";

import {
  guardarNota,
  obtenerHistorialNotas,
  actualizarNota
} from "./services/notas.js";

import {
  obtenerHistoriaClinica
} from "./services/historias.js";

let uidPacienteActual = null;
let diagnosticosSeleccionados = [];
let notaEditandoId = null;
let notasHistorial = {};
let notasHistorialOrdenadas = [];
let historiaClinicaActual = {};
let pacienteActualDatos = {};
let uidMedicoActual = "";
let apuntesMedicoCache = [];

iniciarMonitoreoSesion("Nota medica");

const buscadorDiagnostico = document.getElementById("buscadorDiagnostico");
const resultadosCIE10 = document.getElementById("resultadosCIE10");
const cie10Codigo = document.getElementById("cie10Codigo");
const cie10Nombre = document.getElementById("cie10Nombre");
const buscadorCIE10 = document.getElementById("buscadorCIE10");
const buscadorCIE11 = document.getElementById("buscadorCIE11");
const resultadosCIE10Lista = document.getElementById("resultadosCIE10Lista");
const resultadosCIE11Lista = document.getElementById("resultadosCIE11Lista");
const diagnosticoCatalogoVisible = document.getElementById("diagnosticoCatalogoVisible");
const catalogoDiagnosticos = [
  ...CIE10.map((dx) => ({ ...dx, catalogo: "CIE-10" })),
  ...CIE11.map((dx) => ({ ...dx, catalogo: "CIE-11" }))
];

function configurarBuscadorCatalogo(input, contenedor, catalogo, nombreCatalogo) {
  if (!input || !contenedor) return;

  input.addEventListener("input", () => {
    const texto = input.value.toLowerCase().trim();
    contenedor.innerHTML = "";

    if (texto.length < 2) return;

    catalogo
      .filter((dx) =>
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      )
      .slice(0, 10)
      .forEach((dx) => {
        const item = document.createElement("div");
        item.classList.add("resultado-cie10");
        item.innerHTML = `<strong>${dx.codigo}</strong> <span>${nombreCatalogo}</span> - ${dx.nombre}`;
        item.addEventListener("click", () => {
          agregarDiagnostico({ ...dx, catalogo: nombreCatalogo });
          input.value = "";
          contenedor.innerHTML = "";
        });
        contenedor.appendChild(item);
      });
  });
}

configurarBuscadorCatalogo(buscadorCIE10, resultadosCIE10Lista, CIE10, "CIE-10");
configurarBuscadorCatalogo(buscadorCIE11, resultadosCIE11Lista, CIE11, "CIE-11");

if (buscadorDiagnostico && resultadosCIE10 && cie10Codigo && cie10Nombre) {
  buscadorDiagnostico.addEventListener("input", () => {
    const texto = buscadorDiagnostico.value.toLowerCase().trim();

    resultadosCIE10.innerHTML = "";

    if (texto.length < 2) return;

    const resultados = catalogoDiagnosticos.filter((dx) => {
      return (
        dx.codigo.toLowerCase().includes(texto) ||
        dx.nombre.toLowerCase().includes(texto)
      );
    }).slice(0, 10);

    resultados.forEach((dx) => {
      const item = document.createElement("div");
      item.classList.add("resultado-cie10");

      item.innerHTML = `
        <strong>${dx.codigo}</strong> <span>${dx.catalogo}</span> - ${dx.nombre}
      `;

      item.addEventListener("click", () => {
        agregarDiagnostico(dx);
        buscadorDiagnostico.value = "";
        resultadosCIE10.innerHTML = "";
      });

      resultadosCIE10.appendChild(item);
    });
  });
}

const buscadorMedicamento = document.getElementById("buscadorMedicamento");
const resultadosMedicamentos = document.getElementById("resultadosMedicamentos");

if (buscadorMedicamento && resultadosMedicamentos) {
  buscadorMedicamento.addEventListener("input", () => {
    const texto = buscadorMedicamento.value.toLowerCase().trim();
    resultadosMedicamentos.innerHTML = "";

    if (texto.length < 2) return;

    MEDICAMENTOS.filter((med) =>
      med.nombre.toLowerCase().includes(texto) ||
      med.clase.toLowerCase().includes(texto)
    ).slice(0, 10).forEach((med) => {
      const item = document.createElement("div");
      item.className = "resultado-cie10";
      item.innerHTML = `<strong>${med.nombre}</strong> - ${med.clase}<br><small>${med.dosisHabitual} | ${med.notas}</small>`;
      item.addEventListener("click", () => {
        const tratamiento = document.getElementById("tratamiento");
        const textoMed = `${med.nombre} (${med.clase}) - ${med.dosisHabitual}. ${med.notas}`;
        tratamiento.value = tratamiento.value
          ? `${tratamiento.value}\n${textoMed}`
          : textoMed;
        buscadorMedicamento.value = "";
        resultadosMedicamentos.innerHTML = "";
      });
      resultadosMedicamentos.appendChild(item);
    });
  });

  sincronizarDiagnosticosObservacion();
}

function configurarPanelEscalaNota() {
  const selector = document.getElementById("selectorEscalaNota");
  const botonGuardar = document.getElementById("guardarEscalaNota");

  if (!selector) return;

  selector.innerHTML = ESCALAS_PSIQUIATRICAS
    .map((escala) => `<option value="${escala.id}">${escala.nombre} - ${escala.area}</option>`)
    .join("");

  selector.addEventListener("change", renderizarEscalaNotaSeleccionada);
  botonGuardar?.addEventListener("click", guardarEscalaDesdeNota);
  renderizarEscalaNotaSeleccionada();
}

function escalaNotaActual() {
  const id = document.getElementById("selectorEscalaNota")?.value;
  return ESCALAS_PSIQUIATRICAS.find((escala) => escala.id === id) || ESCALAS_PSIQUIATRICAS[0];
}

function renderizarEscalaNotaSeleccionada() {
  const escala = escalaNotaActual();
  const descripcion = document.getElementById("descripcionEscalaNota");
  const items = document.getElementById("itemsEscalaNota");
  if (!escala || !descripcion || !items) return;

  descripcion.innerHTML = `
    <strong>${escaparHTML(escala.nombre)}</strong> - ${escaparHTML(escala.area)}<br>
    ${escaparHTML(escala.descripcion)}<br>
    <small>Rango: ${escaparHTML(escala.rango)}. Resultado integrado al expediente.</small>
  `;

  items.innerHTML = escala.items.map((item, index) => `
    <div class="item-escala-nota">
      <label>${index + 1}. ${escaparHTML(item)}
        <select data-item-escala-nota="${index}">
          <option value="">Seleccionar</option>
          ${escala.opciones
            .map((opcion, i) => `<option value="${escala.valores[i]}">${escaparHTML(opcion)}</option>`)
            .join("")}
        </select>
      </label>
    </div>
  `).join("");
}

async function guardarEscalaDesdeNota() {
  const selectorPaciente = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selectorPaciente?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente antes de guardar la escala.");
    return;
  }

  const escala = escalaNotaActual();
  if (!escala) return;

  const selects = [...document.querySelectorAll("[data-item-escala-nota]")];
  const respuestas = selects.map((select, index) => ({
    item: escala.items[index],
    valor: select.value === "" ? null : Number(select.value),
    respuesta: select.options[select.selectedIndex]?.textContent || ""
  }));

  if (respuestas.some((respuesta) => respuesta.valor === null)) {
    alert("Responde todos los reactivos de la escala.");
    return;
  }

  const puntaje = respuestas.reduce((total, respuesta) => total + respuesta.valor, 0);
  const interpretacion = interpretarEscala(escala, puntaje);
  const usuario = auth.currentUser;
  const medicoActual = usuario ? await obtenerUsuario(usuario.uid) : null;
  const pacienteActual = await obtenerUsuario(uidPaciente);

  await addDoc(collection(db, "usuarios", uidPaciente, "resultadosEscalas"), {
    escalaId: escala.id,
    escalaNombre: escala.nombre,
    area: escala.area,
    puntaje,
    rango: escala.rango,
    interpretacion,
    respuestas,
    origen: "nota_medica",
    aplicadoPorMedico: true,
    visiblePaciente: false,
    creadoPor: usuario?.uid || "",
    creadoEn: serverTimestamp(),
    fechaISO: new Date().toISOString()
  });

  await registrarEventoAuditoria({
    accion: "guardar_escala_desde_nota",
    modulo: "Nota medica",
    descripcion: "El medico aplico una escala clinica desde la nota.",
    usuarioUid: usuario?.uid || "",
    usuarioNombre: medicoActual?.nombre || usuario?.email || "",
    usuarioRol: medicoActual?.rol || "",
    pacienteUid: uidPaciente,
    pacienteNombre: pacienteActual?.nombre || "",
    exito: true,
    detalles: {
      escalaId: escala.id,
      escalaNombre: escala.nombre,
      puntaje,
      interpretacion
    }
  });

  alert(`Escala guardada: ${escala.nombre} = ${puntaje} (${interpretacion})`);
  renderizarEscalaNotaSeleccionada();
}

configurarPanelEscalaNota();

function agregarDiagnostico(dx) {
  const yaExiste = diagnosticosSeleccionados.some(
    (item) =>
      item.codigo === dx.codigo &&
      (item.catalogo || "CIE-10") === (dx.catalogo || "CIE-10")
  );

  if (yaExiste) {
    alert("Este diagnóstico ya está seleccionado");
    return;
  }

  const nuevoDiagnostico = {
    codigo: dx.codigo,
    nombre: dx.nombre,
    catalogo: dx.catalogo || "CIE-10",
    texto: `${dx.codigo} - ${dx.nombre}`,
    fechaSeleccion: new Date().toISOString()
  };

  diagnosticosSeleccionados.push(nuevoDiagnostico);

  cie10Codigo.value = dx.codigo;
  cie10Nombre.value = dx.nombre;

  renderizarDiagnosticosSeleccionados();
}

function renderizarDiagnosticosSeleccionados() {
  const contenedor = document.getElementById("diagnosticosSeleccionados");

  if (!contenedor) return;

  contenedor.innerHTML = "";
  sincronizarDiagnosticosObservacion();

  if (diagnosticosSeleccionados.length === 0) {
    contenedor.innerHTML = `
      <p style="color:#999;">No hay diagnósticos seleccionados</p>
    `;
    return;
  }

  ["CIE-10", "CIE-11"].forEach((catalogo) => {
    const diagnosticos = diagnosticosSeleccionados
      .map((dx, index) => ({ ...dx, index }))
      .filter((dx) => (dx.catalogo || "CIE-10") === catalogo);

    if (diagnosticos.length === 0) return;

    contenedor.innerHTML += `<h4 class="diagnostico-catalogo-titulo">${catalogo}</h4>`;

    diagnosticos.forEach((dx) => {
      contenedor.innerHTML += `
        <div class="diagnostico-item">
          <span>${dx.texto}</span>

          <button type="button" onclick="eliminarDiagnostico(${dx.index})">
            Eliminar diagnóstico
          </button>
        </div>
      `;
    });
  });
}

window.eliminarDiagnostico = function(index) {
  const confirmar = confirm("¿Eliminar diagnóstico?");

  if (!confirmar) return;

  diagnosticosSeleccionados.splice(index, 1);

  renderizarDiagnosticosSeleccionados();
};

function diagnosticoActual() {
  if (diagnosticosSeleccionados.length === 0) return null;

  const catalogoVisible = diagnosticoCatalogoVisible?.value || "auto";

  if (catalogoVisible !== "auto") {
    const diagnostico = [...diagnosticosSeleccionados]
      .reverse()
      .find((dx) => (dx.catalogo || "CIE-10") === catalogoVisible);

    if (diagnostico) return diagnostico;
  }

  return diagnosticosSeleccionados[diagnosticosSeleccionados.length - 1];
}

function textoDiagnosticos() {
  if (diagnosticosSeleccionados.length === 0) return "";

  return diagnosticosSeleccionados
    .map((dx) => dx.texto)
    .join("\n");
}

function calcularEdadDesdeFecha(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const nacimiento = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad >= 0 ? String(edad) : "";
}

const tipoNota = document.getElementById("tipoNota");
const bloqueNotaRapida = document.getElementById("bloqueNotaRapida");
const bloqueNotaCompleta = document.getElementById("bloqueNotaCompleta");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");
const formatoNota = document.getElementById("formatoNota");
const bloqueObservacionFray = document.getElementById("bloqueObservacionFray");
const btnSincronizarDxObs = document.getElementById("btnSincronizarDxObs");

const camposObservacionFray = {
  tipoNota: "obsTipoNota",
  fechaNota: "obsFechaNota",
  horaNota: "obsHoraNota",
  presionArterial: "obsPresionArterial",
  temperatura: "obsTemperatura",
  frecuenciaCardiaca: "obsFrecuenciaCardiaca",
  frecuenciaRespiratoria: "obsFrecuenciaRespiratoria",
  saturacionO2: "obsSaturacionO2",
  peso: "obsPeso",
  talla: "obsTalla",
  imc: "obsIMC",
  exploracionFisicaNeurologica: "obsExploracionFisicaNeurologica",
  resultadosEstudios: "obsResultadosEstudios",
  pronostico: "obsPronostico",
  destino: "obsDestino",
  medicoAdscrito: "obsMedicoAdscrito",
  cedulaAdscrito: "obsCedulaAdscrito",
  medicoR3: "obsMedicoR3",
  cedulaR3: "obsCedulaR3",
  medicoR2: "obsMedicoR2",
  cedulaR2: "obsCedulaR2"
};

function sincronizarTipoNota() {
  const esRapida = tipoNota?.value === "rapida";
  bloqueNotaRapida?.classList.toggle("oculto", !esRapida);
  bloqueNotaCompleta?.classList.toggle("oculto", esRapida);
}

tipoNota?.addEventListener("change", sincronizarTipoNota);
sincronizarTipoNota();

function valorCampo(id) {
  return document.getElementById(id)?.value || "";
}

function asignarValor(id, valor) {
  const campo = document.getElementById(id);
  if (campo) campo.value = valor || "";
}

function esFormatoFray() {
  return formatoNota?.value?.startsWith("fray_observacion") || false;
}

function sincronizarFormatoNota() {
  bloqueObservacionFray?.classList.remove("oculto");

  if (formatoNota?.value?.startsWith("fray_observacion")) {
    const tipoInstitucional = formatoNota.value.includes("evolucion") ? "evolucion" : "ingreso";
    asignarValor("obsTipoNota", tipoInstitucional);
  }

  if (!valorCampo("obsFechaNota")) asignarValor("obsFechaNota", new Date().toISOString().slice(0, 10));
  if (!valorCampo("obsHoraNota")) {
    const ahora = new Date();
    asignarValor("obsHoraNota", `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`);
  }
  sincronizarDiagnosticosObservacion();
}

formatoNota?.addEventListener("change", sincronizarFormatoNota);
btnSincronizarDxObs?.addEventListener("click", sincronizarDiagnosticosObservacion);

function diagnosticosCIE10Observacion() {
  return diagnosticosSeleccionados
    .filter((dx) => (dx.catalogo || "CIE-10") === "CIE-10")
    .map((dx) => ({
      codigo: dx.codigo || "",
      diagnostico: dx.nombre || dx.texto || "",
      texto: dx.texto || `${dx.codigo || ""} - ${dx.nombre || ""}`.trim()
    }));
}

function sincronizarDiagnosticosObservacion() {
  const contenedor = document.getElementById("obsDiagnosticosLista");
  if (!contenedor) return;

  const diagnosticos = diagnosticosCIE10Observacion();

  if (diagnosticos.length === 0) {
    contenedor.innerHTML = "<p>Sin diagnosticos CIE-10 sincronizados.</p>";
    return;
  }

  contenedor.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Codigo</th>
          <th>Diagnostico</th>
        </tr>
      </thead>
      <tbody>
        ${diagnosticos.map((dx) => `
          <tr>
            <td>${escaparHTML(dx.codigo)}</td>
            <td>${escaparHTML(dx.diagnostico)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function leerFormularioObservacionFray() {
  const datos = Object.entries(camposObservacionFray).reduce((salida, [clave, id]) => {
    salida[clave] = valorCampo(id);
    return salida;
  }, {});
  const administrativos = datosInstitucionalesPaciente(pacienteActualDatos || {});

  return {
    nombrePaciente: administrativos.nombrePaciente,
    servicio: administrativos.servicioInstitucional || "Observacion",
    cama: administrativos.cama,
    expediente: administrativos.expediente,
    fechaNacimiento: administrativos.fechaNacimiento,
    edad: administrativos.edad,
    sexo: administrativos.sexo,
    genero: administrativos.genero,
    alergias: administrativos.alergias,
    diasEstancia: administrativos.diasEstancia || "",
    ...datos,
    motivoAtencion: valorCampo("subjetivo"),
    examenMental: valorCampo("objetivo"),
    planTerapeutico: valorCampo("plan"),
    comentarioAnalisis: valorCampo("analisis"),
    diagnosticosCIE10: diagnosticosCIE10Observacion(),
    preparadoParaWord: true,
    plantillaSugerida: datos.tipoNota === "evolucion"
      ? "fray_observacion_evolucion"
      : "fray_observacion_ingreso"
  };
}

function llenarFormularioObservacionFray(datos = {}) {
  Object.entries(camposObservacionFray).forEach(([clave, id]) => {
    asignarValor(id, datos[clave] || "");
  });
  sincronizarDiagnosticosObservacion();
}

function datosInstitucionalesPaciente(paciente = {}) {
  const institucional = paciente.datosInstitucionales || {};
  const fray = paciente.frayObservacion || {};
  const fechaNacimiento =
    paciente.fechaNacimiento ||
    institucional.fechaNacimiento ||
    paciente.fecha_nacimiento ||
    paciente.fechaDeNacimiento ||
    paciente.fechaNac ||
    paciente.nacimiento ||
    "";

  return {
    nombrePaciente: paciente.nombre || institucional.nombrePaciente || "",
    tipoPaciente: paciente.tipoPaciente || institucional.tipoPaciente || "privada",
    institucionPaciente: paciente.institucionPaciente || paciente.institucion || institucional.institucionPaciente || "",
    servicioInstitucional: paciente.servicioInstitucional || paciente.servicio || institucional.servicioInstitucional || "",
    cama: paciente.cama || institucional.cama || "",
    expediente: paciente.expediente || paciente.numeroExpediente || institucional.expediente || "",
    fechaNacimiento,
    edad: calcularEdadDesdeFecha(fechaNacimiento) || "",
    sexo: paciente.sexo || institucional.sexo || "",
    genero: paciente.genero || paciente.identidadGenero || institucional.genero || "",
    alergias: paciente.alergias || institucional.alergias || "",
    diasEstancia: paciente.diasEstancia || institucional.diasEstancia || "",
    medicoAdscrito: fray.medicoAdscrito || paciente.medicoTratante || "",
    cedulaAdscrito: fray.cedulaAdscrito || "",
    medicoR3: fray.medicoR3 || "",
    cedulaR3: fray.cedulaR3 || "",
    medicoR2: fray.medicoR2 || "",
    cedulaR2: fray.cedulaR2 || ""
  };
}

function aplicarDatosInstitucionalesPaciente(paciente = {}) {
  const datos = datosInstitucionalesPaciente(paciente);

  if (!valorCampo("obsMedicoAdscrito")) asignarValor("obsMedicoAdscrito", datos.medicoAdscrito);
  if (!valorCampo("obsCedulaAdscrito")) asignarValor("obsCedulaAdscrito", datos.cedulaAdscrito);
  if (!valorCampo("obsMedicoR3")) asignarValor("obsMedicoR3", datos.medicoR3);
  if (!valorCampo("obsCedulaR3")) asignarValor("obsCedulaR3", datos.cedulaR3);
  if (!valorCampo("obsMedicoR2")) asignarValor("obsMedicoR2", datos.medicoR2);
  if (!valorCampo("obsCedulaR2")) asignarValor("obsCedulaR2", datos.cedulaR2);
}

function aplicarHistoriaClinicaObservacion(historia = {}) {
  if (!valorCampo("subjetivo")) asignarValor("subjetivo", historia.padecimientoActual || "");
  if (!valorCampo("objetivo")) {
    const examenMental = [
      historia.apariencia ? `Apariencia y conducta: ${historia.apariencia}` : "",
      historia.lenguaje ? `Lenguaje: ${historia.lenguaje}` : "",
      historia.afecto ? `Estado de animo y afecto: ${historia.afecto}` : "",
      historia.pensamiento ? `Pensamiento: ${historia.pensamiento}` : "",
      historia.sensopercepcion ? `Sensopercepcion: ${historia.sensopercepcion}` : "",
      historia.cognicion ? `Funciones cognitivas: ${historia.cognicion}` : "",
      historia.juicio ? `Juicio e insight: ${historia.juicio}` : ""
    ].filter(Boolean).join("\n");
    asignarValor("objetivo", examenMental);
  }
  if (!valorCampo("plan")) {
    asignarValor("plan", [
      historia.tratamientoFarmacologico,
      historia.psicoterapia,
      historia.seguimiento
    ].filter(Boolean).join("\n"));
  }
  if (!valorCampo("analisis")) asignarValor("analisis", historia.diagnosticoClinico || "");
}

function datosPersistentesDesdeObservacion(observacion = {}) {
  return {
    frayObservacion: {
      medicoAdscrito: observacion.medicoAdscrito || "",
      cedulaAdscrito: observacion.cedulaAdscrito || "",
      medicoR3: observacion.medicoR3 || "",
      cedulaR3: observacion.cedulaR3 || "",
      medicoR2: observacion.medicoR2 || "",
      cedulaR2: observacion.cedulaR2 || ""
    }
  };
}

function leerFormularioNota() {
  const formato = formatoNota?.value || "cognicion";
  const observacionFray = esFormatoFray()
    ? leerFormularioObservacionFray()
    : leerFormularioObservacionFray();

  return {
    formatoNota: formato,
    formatoInstitucional: esFormatoFray() ? "fray_bernardino_observacion" : "",
    exportacionWord: {
      habilitada: esFormatoFray(),
      formato,
      plantillaSugerida: observacionFray.plantillaSugerida || "",
      fuenteDatos: "observacionFray"
    },
    observacionFray,
    tipoNota: tipoNota?.value || "completa",
    notaRapida: document.getElementById("notaRapida")?.value || "",
    subjetivo: document.getElementById("subjetivo").value,
    objetivo: document.getElementById("objetivo").value,
    analisis: document.getElementById("analisis").value,
    plan: document.getElementById("plan").value
  };
}

function llenarFormularioNota(datos) {
  if (formatoNota) formatoNota.value = datos.formatoNota || "cognicion";
  if (tipoNota) tipoNota.value = datos.tipoNota || (datos.notaRapida ? "rapida" : "completa");
  document.getElementById("notaRapida").value = datos.notaRapida || "";
  document.getElementById("subjetivo").value = datos.subjetivo || "";
  document.getElementById("objetivo").value = datos.objetivo || "";
  document.getElementById("analisis").value = datos.analisis || "";
  document.getElementById("plan").value = datos.plan || "";
  llenarFormularioObservacionFray(datos.observacionFray || {});
  sincronizarTipoNota();
  sincronizarFormatoNota();
}

function limpiarFormularioNota() {
  notaEditandoId = null;
  llenarFormularioNota({ tipoNota: "completa" });
  btnCancelarEdicion?.classList.add("oculto");
}

window.cancelarEdicionNota = function() {
  limpiarFormularioNota();
};

function referenciaApuntesMedico() {
  if (!uidMedicoActual) return null;
  return collection(db, "usuarios", uidMedicoActual, "apuntesMedico");
}

async function migrarBorradorLegacySiExiste() {
  if (!uidMedicoActual) return;

  const refLegacy = doc(db, "usuarios", uidMedicoActual, "borradoresMedico", "notasGenerales");
  const snapLegacy = await getDoc(refLegacy);

  if (!snapLegacy.exists() || !snapLegacy.data().contenido) return;

  const refApuntes = referenciaApuntesMedico();
  if (!refApuntes) return;

  await addDoc(refApuntes, {
    titulo: "Borrador general",
    contenido: snapLegacy.data().contenido || "",
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    migradoDesdeBorrador: true
  });

  await deleteDoc(refLegacy);
}

async function cargarBorradoresMedico() {
  const estado = document.getElementById("estadoBorradoresMedico");
  const ref = referenciaApuntesMedico();

  if (!ref) return;
  if (estado) estado.textContent = "Cargando...";

  await migrarBorradorLegacySiExiste();

  const qApuntes = query(ref, orderBy("fechaActualizacion", "desc"));
  const snap = await getDocs(qApuntes);

  apuntesMedicoCache = snap.docs.map((docApunte) => ({
    id: docApunte.id,
    ...docApunte.data()
  }));

  renderizarListaApuntes();

  if (apuntesMedicoCache.length > 0) {
    seleccionarApunteMedico(apuntesMedicoCache[0].id);
  } else {
    nuevoApunteMedico();
  }

  if (estado) estado.textContent = apuntesMedicoCache.length ? "Guardado" : "Sin apuntes";
}

window.abrirBorradoresMedico = function() {
  const fondo = document.getElementById("fondoBorradoresMedico");
  const panel = document.getElementById("panelBorradoresMedico");

  fondo?.classList.remove("oculto");
  panel?.classList.add("abierto");
  panel?.setAttribute("aria-hidden", "false");
  document.getElementById("buscadorApuntesMedico")?.focus();
};

window.cerrarBorradoresMedico = function() {
  const fondo = document.getElementById("fondoBorradoresMedico");
  const panel = document.getElementById("panelBorradoresMedico");

  panel?.classList.remove("abierto");
  panel?.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    if (!panel?.classList.contains("abierto")) {
      fondo?.classList.add("oculto");
    }
  }, 220);
};

window.guardarBorradoresMedico = async function() {
  const texto = document.getElementById("borradoresMedicoTexto");
  const titulo = document.getElementById("apunteMedicoTitulo");
  const id = document.getElementById("apunteMedicoId")?.value;
  const estado = document.getElementById("estadoBorradoresMedico");
  const ref = referenciaApuntesMedico();

  if (!texto || !ref) {
    alert("No se pudo identificar al medico para guardar el apunte.");
    return;
  }

  if (estado) estado.textContent = "Guardando...";

  const payload = {
    titulo: titulo?.value.trim() || "Sin titulo",
    contenido: texto.value,
    fechaActualizacion: new Date().toISOString(),
    fechaActualizacionServidor: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "usuarios", uidMedicoActual, "apuntesMedico", id), payload);
  } else {
    const nuevo = await addDoc(ref, {
      ...payload,
      fechaCreacion: new Date().toISOString()
    });
    document.getElementById("apunteMedicoId").value = nuevo.id;
  }

  if (estado) estado.textContent = "Guardado";
  await cargarBorradoresMedico();
};

window.nuevoApunteMedico = function() {
  document.getElementById("apunteMedicoId").value = "";
  document.getElementById("apunteMedicoTitulo").value = "";
  document.getElementById("borradoresMedicoTexto").value = "";
  const estado = document.getElementById("estadoBorradoresMedico");
  if (estado) estado.textContent = "Nuevo apunte";
  document.getElementById("apunteMedicoTitulo")?.focus();
};

window.seleccionarApunteMedico = function(id) {
  const apunte = apuntesMedicoCache.find((item) => item.id === id);
  if (!apunte) return;

  document.getElementById("apunteMedicoId").value = apunte.id;
  document.getElementById("apunteMedicoTitulo").value = apunte.titulo || "";
  document.getElementById("borradoresMedicoTexto").value = apunte.contenido || "";
  const estado = document.getElementById("estadoBorradoresMedico");
  if (estado) estado.textContent = "Guardado";
  renderizarListaApuntes();
};

window.eliminarApunteMedicoActual = async function() {
  const id = document.getElementById("apunteMedicoId")?.value;
  if (!id) {
    nuevoApunteMedico();
    return;
  }

  if (!confirm("Eliminar este apunte?")) return;

  await deleteDoc(doc(db, "usuarios", uidMedicoActual, "apuntesMedico", id));
  await cargarBorradoresMedico();
};

function renderizarListaApuntes() {
  const lista = document.getElementById("listaApuntesMedico");
  const buscador = document.getElementById("buscadorApuntesMedico");
  const activo = document.getElementById("apunteMedicoId")?.value;
  if (!lista) return;

  const textoBusqueda = (buscador?.value || "").trim().toLowerCase();
  const filtrados = apuntesMedicoCache.filter((apunte) => {
    const titulo = (apunte.titulo || "").toLowerCase();
    const contenido = (apunte.contenido || "").toLowerCase();
    return !textoBusqueda || titulo.includes(textoBusqueda) || contenido.includes(textoBusqueda);
  });

  if (!filtrados.length) {
    lista.innerHTML = `<p class="apuntes-vacio">No se encontraron apuntes.</p>`;
    return;
  }

  lista.innerHTML = filtrados.map((apunte) => `
    <button
      type="button"
      class="apunte-lista-item ${apunte.id === activo ? "activo" : ""}"
      onclick="seleccionarApunteMedico('${apunte.id}')"
    >
      <strong>${escaparHTML(apunte.titulo || "Sin titulo")}</strong>
      <span>${escaparHTML((apunte.contenido || "").slice(0, 90))}</span>
    </button>
  `).join("");
}

function bloqueContenidoNota(datos, titulo) {
  const esRapida = datos.tipoNota === "rapida" || datos.notaRapida;
  return `
    <div class="version-nota">
      <h4>${titulo}</h4>
      ${esRapida ? `<p><b>Nota rapida:</b><br>${escaparHTML(datos.notaRapida || "")}</p>` : `
        <p><b>Subjetivo:</b><br>${escaparHTML(datos.subjetivo || "")}</p>
        <p><b>Objetivo:</b><br>${escaparHTML(datos.objetivo || "")}</p>
        <p><b>Analisis:</b><br>${escaparHTML(datos.analisis || "")}</p>
        <p><b>Plan:</b><br>${escaparHTML(datos.plan || "")}</p>
      `}
    </div>
  `;
}

window.editarNotaDesdeHistorial = function(notaId) {
  const datos = notasHistorial[notaId];
  if (!datos) return;
  notaEditandoId = notaId;
  llenarFormularioNota(datos.notaEditada || datos);
  btnCancelarEdicion?.classList.remove("oculto");
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

function cargarDatosNotaComoBorrador(notaId, opciones = {}) {
  const datosNota = notasHistorial[notaId];

  if (!datosNota) {
    alert("No se encontro la nota seleccionada.");
    return;
  }

  const datos = datosNota.notaEditada || datosNota;
  const formatoActual = formatoNota?.value || "cognicion";
  llenarFormularioNota({
    ...datos,
    formatoNota: opciones.mantenerFormatoActual
      ? formatoActual
      : datos.formatoNota || formatoActual
  });

  notaEditandoId = null;
  btnCancelarEdicion?.classList.add("oculto");
  sincronizarFormatoNota();
  document.getElementById("tipoNota")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

window.cargarNotaComoBorrador = function(notaId) {
  cargarDatosNotaComoBorrador(notaId);
  alert("Nota cargada como borrador. Al guardar se creara una nota nueva.");
};

window.cargarNotaPreviaEnFormulario = function() {
  const previa = notasHistorialOrdenadas.find((nota) => nota?.datos);

  if (!previa) {
    alert("No hay una nota previa para cargar.");
    return;
  }

  cargarDatosNotaComoBorrador(previa.id, { mantenerFormatoActual: true });
  alert("Datos de la nota previa cargados. Se guardara como una nota nueva.");
};

function escaparHTML(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);

  if (!usuario || usuario.rol !== "medico") {
    alert("Acceso restringido al personal médico");
    window.location.href = "dashboard.html";
    return;
  }

  uidMedicoActual = user.uid;
  await cargarBorradoresMedico();
  document.getElementById("borradoresMedicoTexto")?.addEventListener("input", () => {
    const estado = document.getElementById("estadoBorradoresMedico");
    if (estado) estado.textContent = "Cambios sin guardar";
  });
  document.getElementById("apunteMedicoTitulo")?.addEventListener("input", () => {
    const estado = document.getElementById("estadoBorradoresMedico");
    if (estado) estado.textContent = "Cambios sin guardar";
    renderizarListaApuntes();
  });
  document.getElementById("buscadorApuntesMedico")?.addEventListener("input", renderizarListaApuntes);

  const parametros = new URLSearchParams(window.location.search);
  uidPacienteActual = parametros.get("id");

  if (uidPacienteActual) {
    const bloqueSelector = document.getElementById("bloqueSelectorPaciente");

    if (bloqueSelector) {
      bloqueSelector.style.display = "none";
    }

    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  } else {
    await cargarListaPacientes();
  }
});

async function cargarListaPacientes() {
  const selector = document.getElementById("uidPaciente");

  if (!selector) return;

  const pacientes = await listarPacientes();

  pacientes.forEach((paciente) => {
    const datos = paciente.data();
    const opcion = document.createElement("option");

    opcion.value = paciente.id;
    opcion.textContent = datos.nombre || "Sin nombre";

    selector.appendChild(opcion);
  });

  selector.addEventListener("change", async () => {
    uidPacienteActual = selector.value;

    await cargarPaciente(uidPacienteActual);
    await cargarHistorial(uidPacienteActual);
  });
}

async function cargarPaciente(uidPaciente) {
  const datos = await obtenerUsuario(uidPaciente);

  if (!datos) return;
  pacienteActualDatos = datos;

  try {
    const historiaSnap = await obtenerHistoriaClinica(uidPaciente);
    historiaClinicaActual = historiaSnap.exists() ? historiaSnap.data() : {};
  } catch (error) {
    console.warn("No se pudo cargar historia clinica para la nota:", error);
    historiaClinicaActual = {};
  }

  const tratamiento = document.getElementById("tratamiento");
  const medico = document.getElementById("medico");
  const ultimaConsulta = document.getElementById("ultimaConsulta");
  const proximaConsulta = document.getElementById("proximaConsulta");

  diagnosticosSeleccionados = [];

  if (Array.isArray(datos.historialDiagnosticos)) {
    diagnosticosSeleccionados = datos.historialDiagnosticos;
  } else if (typeof datos.diagnostico === "object" && datos.diagnostico !== null) {
    diagnosticosSeleccionados = [datos.diagnostico];
  } else if (typeof datos.diagnostico === "string" && datos.diagnostico.trim() !== "") {
    diagnosticosSeleccionados = [
      {
        codigo: "",
        nombre: datos.diagnostico,
        texto: datos.diagnostico,
        fechaSeleccion: new Date().toISOString()
      }
    ];
  }

  renderizarDiagnosticosSeleccionados();

  const dxActual = diagnosticoActual();

  if (buscadorDiagnostico) {
    buscadorDiagnostico.value = dxActual?.texto || "";
  }

  if (cie10Codigo) {
    cie10Codigo.value = dxActual?.codigo || "";
  }

  if (cie10Nombre) {
    cie10Nombre.value = dxActual?.nombre || "";
  }

  if (tratamiento) tratamiento.value = datos.tratamiento || "";
  if (medico) medico.value = datos.medicoTratante || "";
  if (ultimaConsulta) ultimaConsulta.value = datos.ultimaConsulta || "";
  if (proximaConsulta) proximaConsulta.value = datos.proximaConsulta || "";
  if (diagnosticoCatalogoVisible) {
    diagnosticoCatalogoVisible.value = datos.diagnosticoCatalogoVisible || "auto";
  }

  aplicarDatosInstitucionalesPaciente(datos);
  aplicarHistoriaClinicaObservacion(historiaClinicaActual);

  const institucion = `${datos.institucionPaciente || datos.institucion || ""}`.toLowerCase();
  const esPacienteFray = datos.tipoPaciente === "institucion" && institucion.includes("fray");
  if (esPacienteFray && formatoNota?.value === "cognicion") {
    formatoNota.value = "fray_observacion_evolucion";
  }

  sincronizarFormatoNota();
}

window.guardarNotaMedica = async function() {
  const selector = document.getElementById("uidPaciente");
  const uidPaciente = uidPacienteActual || selector?.value;

  if (!uidPaciente) {
    alert("Selecciona un paciente");
    return;
  }

  const diagnostico = diagnosticoActual();

  const tratamiento = document.getElementById("tratamiento").value;
  const medico = document.getElementById("medico").value;
  const ultimaConsulta = document.getElementById("ultimaConsulta").value;
  const proximaConsulta = document.getElementById("proximaConsulta").value;

  const datosNotaClinica = leerFormularioNota();
  const catalogoVisible = diagnosticoCatalogoVisible?.value || "auto";

  try {
    const datosPersistentesInstitucionales = esFormatoFray()
      ? datosPersistentesDesdeObservacion(datosNotaClinica.observacionFray)
      : {};

    await actualizarUsuario(uidPaciente, {
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      medicoTratante: medico,
      ultimaConsulta,
      proximaConsulta,
      ...datosPersistentesInstitucionales
    });

    const notaPayload = {
      autor: medico,
      ...datosNotaClinica,
      diagnostico,
      diagnosticoCatalogoVisible: catalogoVisible,
      diagnosticos: diagnosticosSeleccionados,
      historialDiagnosticos: diagnosticosSeleccionados,
      tratamiento,
      ultimaConsulta,
      proximaConsulta
    };

    if (notaEditandoId) {
      await actualizarNota(uidPaciente, notaEditandoId, {
        ...notaPayload,
        fechaEdicion: new Date().toISOString()
      });
    } else {
      await guardarNota(uidPaciente, notaPayload);
    }

    const usuario = auth.currentUser;
    const medicoActual = usuario ? await obtenerUsuario(usuario.uid) : null;
    const pacienteActual = await obtenerUsuario(uidPaciente);

    await registrarEventoAuditoria({
      accion: notaEditandoId ? "editar_nota_medica" : "crear_nota_medica",
      modulo: "Nota medica",
      descripcion: notaEditandoId
        ? "El medico edito una nota medica sin borrar la original."
        : "El medico creo una nota medica.",
      usuarioUid: usuario?.uid || "",
      usuarioNombre: medicoActual?.nombre || usuario?.email || medico || "",
      usuarioRol: medicoActual?.rol || "",
      pacienteUid: uidPaciente,
      pacienteNombre: pacienteActual?.nombre || "",
      exito: true,
      detalles: {
        notaId: notaEditandoId || "",
        tipoNota: datosNotaClinica.tipoNota || "",
        formatoNota: datosNotaClinica.formatoNota || "cognicion",
        formatoInstitucional: datosNotaClinica.formatoInstitucional || "",
        diagnosticos: diagnosticosSeleccionados.map((dx) => dx.codigo || dx.nombre || dx.texto || "")
      }
    });

    alert(notaEditandoId ? "Edicion guardada sin borrar la nota original" : "Nota medica guardada correctamente");
    limpiarFormularioNota();

    await cargarHistorial(uidPaciente);

  } catch(error) {
    alert("Error: " + error.message);
  }
};

async function cargarHistorial(uidPaciente) {
  const contenedor = document.getElementById("historialNotas");

  if (!contenedor) return;

  contenedor.innerHTML = "";
  notasHistorial = {};
  notasHistorialOrdenadas = [];

  const notas = await obtenerHistorialNotas(uidPaciente);

  if (notas.empty) {
    contenedor.innerHTML = `
      <p style="color:#999">
        No hay notas registradas
      </p>
    `;
    return;
  }

  notas.forEach((nota) => {
    const datos = nota.data();
    notasHistorial[nota.id] = datos;
    notasHistorialOrdenadas.push({ id: nota.id, datos });

    const fecha = new Date(datos.fecha);

    const fechaTexto = fecha.toLocaleDateString("es-MX");

    const horaTexto = fecha.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit"
    });

    let diagnosticosTexto = "";

    if (Array.isArray(datos.historialDiagnosticos)) {
      diagnosticosTexto = datos.historialDiagnosticos
        .map((dx) => dx.texto || "")
        .join("<br>");
    } else if (typeof datos.diagnostico === "object" && datos.diagnostico !== null) {
      diagnosticosTexto = datos.diagnostico.texto || "";
    } else {
      diagnosticosTexto = datos.diagnostico || "";
    }

    contenedor.innerHTML += `
      <details style="
        background:#0d0d0d;
        border:1px solid #333;
        border-radius:20px;
        padding:22px;
        margin-bottom:20px;
      ">

        <summary style="
          cursor:pointer;
          font-size:18px;
          font-weight:bold;
          outline:none;
        ">
          ${fechaTexto} · ${horaTexto} · ${datos.autor || "Sin médico"}
        </summary>

        <div style="margin-top:20px;">

          <p><b>Diagnósticos:</b><br>
            ${diagnosticosTexto}
          </p>

          ${bloqueContenidoNota(datos, "Nota original")}

          ${datos.notaEditada ? bloqueContenidoNota(datos.notaEditada, "Version editada") : ""}

          <div class="acciones-historial-nota">
            <button type="button" class="boton-secundario" onclick="cargarNotaComoBorrador('${nota.id}')">
              Usar como borrador
            </button>

            <button type="button" class="boton-secundario" onclick="editarNotaDesdeHistorial('${nota.id}')">
              Editar esta nota
            </button>
          </div>

        </div>

      </details>
    `;
  });

  notasHistorialOrdenadas.sort((a, b) => {
    const fechaA = new Date(a.datos?.fecha || 0).getTime();
    const fechaB = new Date(b.datos?.fecha || 0).getTime();
    return fechaB - fechaA;
  });
}

window.regresarDesdeNota = function() {
  if (uidPacienteActual) {
    window.location.href = `paciente.html?id=${uidPacienteActual}`;
  } else {
    window.location.href = "medico.html";
  }
};

window.generarPDFNota = function() {
  window.print();
};

function textoWord(valor) {
  return escaparHTML(valor || "").replace(/\n/g, "<br>");
}

function filaWord(etiqueta, valor) {
  return `
    <tr>
      <th>${textoWord(etiqueta)}</th>
      <td>${textoWord(valor)}</td>
    </tr>
  `;
}

function seccionWord(titulo, contenido) {
  return `
    <h2>${textoWord(titulo)}</h2>
    ${contenido}
  `;
}

function tablaCamposWord(filas) {
  return `<table>${filas.join("")}</table>`;
}

function nombreArchivoWordFray(datos) {
  const paciente = (datos.nombrePaciente || pacienteActualDatos.nombre || document.getElementById("uidPaciente")?.selectedOptions?.[0]?.textContent || "paciente")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_");
  const tipo = datos.tipoNota === "evolucion" ? "evolucion" : "ingreso";
  const fecha = datos.fechaNota || new Date().toISOString().slice(0, 10);
  return `Fray_Observacion_${tipo}_${paciente}_${fecha}.doc`;
}

function formatoFechaFray(fecha) {
  if (!fecha) return "";
  const partes = fecha.split("-");
  if (partes.length !== 3) return fecha;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function tituloNotaFray(tipo) {
  return tipo === "evolucion"
    ? "NOTA DE EVOLUCION AL SERVICIO DE OBSERVACION"
    : "NOTA DE INGRESO AL SERVICIO DE OBSERVACION";
}

function bloqueWordFray(titulo, contenido) {
  return `
    <h2>${textoWord(titulo)}</h2>
    <table class="tabla-texto">
      <tr><td>${textoWord(contenido)}</td></tr>
    </table>
  `;
}

async function recursoDataUri(ruta) {
  try {
    const respuesta = await fetch(ruta);
    if (!respuesta.ok) throw new Error("No se pudo leer el recurso");
    const blob = await respuesta.blob();
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(lector.result);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("No se pudo incrustar imagen en Word:", ruta, error);
    return ruta;
  }
}

async function htmlWordFrayObservacion() {
  sincronizarDiagnosticosObservacion();

  const logoSalud = await recursoDataUri("assets/fray-observacion-salud-conasama-stack.png");
  const logoFray = await recursoDataUri("assets/fray-observacion-image2.png");
  const datos = leerFormularioObservacionFray();
  const datosCognicion = leerFormularioNota();
  const diagnosticos = datos.diagnosticosCIE10.length
    ? datos.diagnosticosCIE10
    : diagnosticosSeleccionados.map((dx) => ({
        codigo: dx.codigo || "",
        diagnostico: dx.nombre || dx.texto || ""
      }));

  const tablaDiagnosticos = diagnosticos.length
    ? `
      <table class="tabla-diagnosticos-word">
        <thead>
          <tr><th>DIAGNOSTICO</th><th>CIE-10</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${diagnosticos.map((dx) => textoWord(dx.diagnostico)).join("<br>")}</td>
            <td>${diagnosticos.map((dx) => textoWord(dx.codigo)).join("<br>")}</td>
          </tr>
        </tbody>
      </table>
    `
    : "<p>Sin diagnosticos CIE-10 registrados.</p>";

  const exploracionFisicaNeurologica = datos.exploracionFisicaNeurologica || "";

  const vitales = `
    <table class="tabla-vitales">
      <thead>
        <tr>
          <th>Presion arterial</th>
          <th>Temperatura</th>
          <th>Frecuencia cardiaca</th>
          <th>Frecuencia respiratoria</th>
          <th>SatO2</th>
          <th>Peso</th>
          <th>Talla</th>
          <th>IMC</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${textoWord(datos.presionArterial)}</td>
          <td>${textoWord(datos.temperatura)}</td>
          <td>${textoWord(datos.frecuenciaCardiaca)}</td>
          <td>${textoWord(datos.frecuenciaRespiratoria)}</td>
          <td>${textoWord(datos.saturacionO2)}</td>
          <td>${textoWord(datos.peso)}</td>
          <td>${textoWord(datos.talla)}</td>
          <td>${textoWord(datos.imc)}</td>
        </tr>
      </tbody>
    </table>
  `;

  const firmas = `
    <table class="tabla-firmas">
      <tr>
        <td>${textoWord(datos.medicoAdscrito)}<br>Medico adscrito<br>Ced. Prof. ${textoWord(datos.cedulaAdscrito)}</td>
        <td>${textoWord(datos.medicoR3)}<br>Medico residente de 3er ano<br>Ced. Prof. ${textoWord(datos.cedulaR3)}</td>
        <td>${textoWord(datos.medicoR2)}<br>Medico residente de 2o ano<br>Ced. Prof. ${textoWord(datos.cedulaR2)}</td>
      </tr>
    </table>
  `;

  return `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
          <meta charset="UTF-8">
          <title>Nota Observacion Fray Bernardino</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          
          <style>
    @page WordSection1 {
      size: 21.59cm 27.94cm;
      margin: 36.0pt 36.0pt 36.0pt 36.0pt;
    }

    div.WordSection1 {
      page: WordSection1;
    }

    body {
      font-family: Arial, sans-serif;
      font-size: 9pt;
      color: #111;
      margin: 0;
      padding: 0;
    }

        .encabezado { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0 0 8pt; border-bottom: 1px dashed #777; }
        .encabezado td { border: none; vertical-align: middle; padding: 0 0 4pt; }
        .encabezado-logo-izq { width: 20%; text-align: left; }
        .encabezado-centro { width: 62%; text-align: center; font-weight: 700; font-size: 11pt; line-height: 1.12; text-transform: uppercase; white-space: nowrap; }
        .encabezado-logo-der { width: 14%; text-align: right; }
        .logo-salud { width: 118px; }
        .logo-fray { width: 58px; }
        h1 { text-align: center; font-size: 11.5pt; color: #7b7b7b; margin: 8pt 0 12pt; text-transform: uppercase; letter-spacing: .2pt; }
        h2 { font-size: 9.5pt; margin: 10pt 0 3pt; text-align: left; text-transform: uppercase; }
        p { margin: 0; mso-margin-top-alt: 0cm; mso-margin-bottom-alt: 0cm; line-height: 1.0; mso-line-height-rule: exactly; text-align: left; }
        .identificacion { font-size: 8.6pt; line-height: 1.35; margin: 2pt 0 7pt; }
        .identificacion b { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 3pt 0 8pt; }
        th, td { border: 1px solid #222; padding: 4pt; vertical-align: top; text-align: left; }
        .tabla-vitales { width: auto; table-layout: auto; margin: 3pt 0 8pt; }
        .tabla-vitales th,
        .tabla-vitales td {
          text-align: center;
          white-space: nowrap;
          padding: 2pt 5pt;
          margin: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
        }
        .tabla-vitales th { font-size: 7.2pt; font-weight: 700; }
        .tabla-vitales td { font-size: 8pt; }
        .tabla-vitales th p,
        .tabla-vitales td p {
          margin: 0;
          mso-margin-top-alt: 0cm;
          mso-margin-bottom-alt: 0cm;
          line-height: 1.0;
          mso-line-height-rule: exactly;
        }
        .tabla-texto td { min-height: 42pt; line-height: 1.0; text-align: left; }
        .tabla-diagnosticos-word th { font-size: 8.5pt; text-align: left; }
        .tabla-diagnosticos-word th:first-child,
        .tabla-diagnosticos-word td:first-child { width: 86%; }
        .tabla-diagnosticos-word th:last-child,
        .tabla-diagnosticos-word td:last-child { width: 14%; }
        .pronostico-destino { margin-top: 6pt; }
        .tabla-firmas td { border: none; width: 33.33%; text-align: center; height: 48pt; vertical-align: bottom; font-size: 8.5pt; }
      </style>
    </head>
    <body>
        <div class="WordSection1">
          <table class="encabezado">
        <tr>
          <td class="encabezado-logo-izq">
            <img
              class="logo-salud"
              src="${logoSalud}"
              style="width:2.8cm;height:auto;"
              width="106"
            >
          </td>
          <td class="encabezado-centro">
            SECRETARIA DE SALUD<br>
            COMISION NACIONAL DE SALUD MENTAL Y ADICCIONES<br>
            HOSPITAL PSIQUIATRICO "FRAY BERNARDINO ALVAREZ"
          </td>
          <td class="encabezado-logo-der"><img class="logo-fray" src="${logoFray}"></td>
        </tr>
      </table>

      <h1>${tituloNotaFray(datos.tipoNota)}</h1>

      <p class="identificacion">
        <b>Nombre del paciente:</b> ${textoWord(datos.nombrePaciente || pacienteActualDatos.nombre)}
        &nbsp;&nbsp; <b>Fecha de nacimiento:</b> ${textoWord(formatoFechaFray(datos.fechaNacimiento))}
        &nbsp;&nbsp; <b>Edad:</b> ${textoWord(datos.edad)} ANOS
        &nbsp;&nbsp; <b>Cama:</b> ${textoWord(datos.cama)}
        &nbsp;&nbsp; <b>Expediente:</b> ${textoWord(datos.expediente)}
        &nbsp;&nbsp; <b>Sexo:</b> ${textoWord(datos.sexo)}
        <br>
        <b>Genero:</b> ${textoWord(datos.genero)}
        &nbsp;&nbsp; <b>Servicio:</b> ${textoWord(datos.servicio || "OBSERVACION")}
        &nbsp;&nbsp; <b>Alergias:</b> ${textoWord(datos.alergias)}
        &nbsp;&nbsp; <b>Fecha:</b> ${textoWord(formatoFechaFray(datos.fechaNota))}
        &nbsp;&nbsp; <b>Hora:</b> ${textoWord(datos.horaNota)} H
        &nbsp;&nbsp; <b>Dias estancia:</b> ${textoWord(datos.diasEstancia)}
      </p>

      ${vitales}
      ${bloqueWordFray("MOTIVO DE ATENCION / ACTUALIZACION DEL CUADRO CLINICO", datos.motivoAtencion || datosCognicion.subjetivo)}
      ${bloqueWordFray("EXPLORACION FISICA Y NEUROLOGICA", exploracionFisicaNeurologica)}
      ${bloqueWordFray("EXAMEN MENTAL", datos.examenMental || datosCognicion.objetivo)}
      ${bloqueWordFray("RESULTADOS RELEVANTES DE LOS ESTUDIOS DE DIAGNOSTICO", datos.resultadosEstudios)}
      <h2>DIAGNOSTICOS DE ACUERDO A CIE-10 (PRIMARIO Y COMORBILIDADES)</h2>
      ${tablaDiagnosticos}
      ${bloqueWordFray("PLAN TERAPEUTICO (MEDIDAS GENERALES Y TRATAMIENTO FARMACOLOGICO)", datos.planTerapeutico || datosCognicion.plan)}
      ${bloqueWordFray("COMENTARIO Y/O ANALISIS CLINICO Y FUNDAMENTACION DIAGNOSTICA Y TERAPEUTICA", datos.comentarioAnalisis || datosCognicion.analisis)}
      <p class="pronostico-destino"><b>PRONOSTICO:</b> ${textoWord(datos.pronostico)}</p>
      <p class="pronostico-destino"><b>DESTINO:</b> ${textoWord(datos.destino)}</p>
      <h2>NOMBRE, FIRMA Y CEDULA PROFESIONAL DEL MEDICO QUE REALIZA Y SUPERVISA:</h2>
      ${firmas}
      </div>
      </body>
    </html>
  `;
}

window.descargarNotaFrayObservacion = async function() {
  const datos = leerFormularioObservacionFray();
  const html = await htmlWordFrayObservacion();
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivoWordFray(datos);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
};

window.descargarNotaSeleccionada = async function() {
  if (esFormatoFray()) {
    await window.descargarNotaFrayObservacion();
    return;
  }

  window.generarPDFNota();
};
