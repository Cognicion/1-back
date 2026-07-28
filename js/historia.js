import { auth } from "./firebase.js";
import { registrarEventoAuditoria } from "./services/auditoria.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";
import { getAuthenticatedUserOnce, getUserProfileOnce } from "./services/authContextService.js";
import { crearGestorSustanciasHistoria } from "./components/sustanciasHistoria.js";
import { configurarCamposRedimensionables } from "./components/redimensionadorCampos.js";
import { esPacienteMujer } from "./utils/sexo.js";

import {
  obtenerUsuario,
  actualizarUsuario
} from "./services/usuarios.js";

import {
  guardarHistoriaClinica,
  obtenerHistoriaClinica,
  sanitizarDatosHistoriaClinica
} from "./services/historias.js";

let uidPaciente = null;
let pacienteActual = {};
let gestorSustanciasHistoria = null;
let guardandoHistoria = false;

iniciarMonitoreoSesion("Historia clinica");

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

function valorInstitucional(paciente = {}, campo, alternos = []) {
  const institucional = paciente.datosInstitucionales || {};
  const signosVitales = paciente.signosVitales || {};
  const somatometria = paciente.somatometria || {};
  const claves = [campo, ...alternos];

  for (const clave of claves) {
    const valor = paciente[clave] ?? institucional[clave] ?? signosVitales[clave] ?? somatometria[clave];
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  return "";
}

function inferirTipoPaciente(paciente = {}) {
  const tipoGuardado = valorInstitucional(paciente, "tipoPaciente");
  if (tipoGuardado) return tipoGuardado;

  const institucion = valorInstitucional(paciente, "institucionPaciente", ["institucion"]);
  return institucion ? "institucion" : "privada";
}

function campoConRespaldo(datos = {}, paciente = {}, campo, alternos = []) {
  const valorFormulario = datos[campo];
  if (valorFormulario !== undefined && valorFormulario !== null && String(valorFormulario).trim() !== "") {
    return valorFormulario;
  }

  return valorInstitucional(paciente, campo, alternos);
}

function numeroClinico(valor = "") {
  const coincidencia = String(valor)
    .trim()
    .replace(",", ".")
    .match(/\d+(?:\.\d+)?/);
  const numero = coincidencia ? Number(coincidencia[0]) : NaN;
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function normalizarMedidaClinica(valor = "") {
  const numero = numeroClinico(valor);
  return numero === null ? "" : String(numero);
}

function calcularIMCHistoria() {
  const peso = numeroClinico(document.getElementById("peso")?.value || "");
  const talla = numeroClinico(document.getElementById("talla")?.value || "");
  const campoIMC = document.getElementById("imc");
  if (!campoIMC || !peso || !talla) return;
  campoIMC.value = (peso / (talla * talla)).toFixed(2);
}

async function inicializarHistoriaClinica() {
  const user = await getAuthenticatedUserOnce();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await getUserProfileOnce(user.uid);

 if (!usuario || (usuario.rol !== "admin" && !usuarioEsPersonalClinico(usuario.rol))) {
  alert("Acceso restringido al personal clinico");
  window.location.href = "dashboard.html";
  return;
}

  const parametros = new URLSearchParams(window.location.search);
  uidPaciente = parametros.get("id");
  if (!uidPaciente) return;

  await cargarPaciente();
  gestorSustanciasHistoria = crearGestorSustanciasHistoria({
    contenedor: document.getElementById("selectorSustanciasHistoria"),
    edadPaciente: calcularEdad(obtenerFechaNacimiento(pacienteActual))
  });
  await cargarHistoria();
  configurarCamposNarrativosHistoria();
}

inicializarHistoriaClinica().catch((error) => {
  console.error("No se pudo inicializar la historia clinica:", error);
  window.location.href = "dashboard.html";
});

async function cargarPaciente() {
  const paciente = await obtenerUsuario(uidPaciente);
  if (!paciente) return;
  pacienteActual = paciente;

  document.getElementById("nombrePaciente").textContent =
    obtenerNombrePacienteParaMostrar(paciente) || "Paciente";

  document.getElementById("datosPaciente").textContent =
    `${calcularEdad(obtenerFechaNacimiento(paciente)) || ""} años`;
}

async function cargarHistoria() {
  const historia = await obtenerHistoriaClinica(uidPaciente);
  const raiz = {
    tipoPaciente: inferirTipoPaciente(pacienteActual),
    institucionPaciente: valorInstitucional(pacienteActual, "institucionPaciente", ["institucion"]),
    servicioInstitucional: valorInstitucional(pacienteActual, "servicioInstitucional", ["servicio"]),
    expediente: valorInstitucional(pacienteActual, "expediente", ["numeroExpediente"]),
    cama: valorInstitucional(pacienteActual, "cama"),
    sexo: valorInstitucional(pacienteActual, "sexo"),
    genero: valorInstitucional(pacienteActual, "genero", ["identidadGenero"]),
    alergias: valorInstitucional(pacienteActual, "alergias"),
    tipoSangre: valorInstitucional(pacienteActual, "tipoSangre"),
    peso: valorInstitucional(pacienteActual, "peso"),
    talla: valorInstitucional(pacienteActual, "talla"),
    imc: valorInstitucional(pacienteActual, "imc"),
    perimetroAbdominal: valorInstitucional(pacienteActual, "perimetroAbdominal"),
    diagnosticoClinico: pacienteActual.datosClinicosResumen?.diagnostico?.texto || pacienteActual.diagnostico?.texto || pacienteActual.diagnostico || "",
    codigoDiagnostico: pacienteActual.datosClinicosResumen?.diagnostico?.codigo || pacienteActual.diagnostico?.codigo || "",
    tratamientoFarmacologico: pacienteActual.datosClinicosResumen?.tratamientoActivo || pacienteActual.tratamiento || "",
    historiaFamiliar: "",
    historiaAcademica: "",
    historiaLaboral: "",
    antecedentesGinecoobstetricos: "",
    sustancias: { seleccionadas: [], observacionesGenerales: "" }
  };

  const datos = historia.exists() ? { ...raiz, ...historia.data() } : raiz;

  Object.keys(datos).forEach((campo) => {
    if (campo === "sustancias") return;
    const elemento = document.getElementById(campo);
    if (elemento) elemento.value = datos[campo];
  });
  gestorSustanciasHistoria?.cargar(datos.sustancias, {
    consumoSustancias: datos.consumoSustancias
  });
  actualizarVisibilidadGinecoobstetricos(datos.antecedentesGinecoobstetricos);
  if (!datos.imc) calcularIMCHistoria();
}

function actualizarVisibilidadGinecoobstetricos(valorGuardado = "") {
  const bloque = document.getElementById("bloqueGinecoobstetricos");
  const campo = document.getElementById("antecedentesGinecoobstetricos");
  const aviso = document.getElementById("avisoGinecoobstetricos");
  if (!bloque || !campo) return;
  const tieneContenido = Boolean(String(campo.value || valorGuardado || "").trim());
  const visiblePorSexo = esPacienteMujer({ ...pacienteActual, sexo: document.getElementById("sexo")?.value || pacienteActual.sexo });
  bloque.hidden = !visiblePorSexo && !tieneContenido;
  if (aviso) {
    aviso.hidden = visiblePorSexo || !tieneContenido;
    aviso.textContent = "Existen antecedentes ginecoobstetricos guardados; se muestran porque contienen información, aunque el sexo actual no corresponde al apartado.";
  }
}

function configurarCamposNarrativosHistoria() {
  const items = [...document.querySelectorAll("#formHistoria textarea")].map((objetivo) => ({
    objetivo,
    clave: `historia:${objetivo.id || "sin-id"}`,
    minimo: 80,
    alturaBase: Math.max(130, Number(objetivo.rows || 5) * 22)
  }));
  configurarCamposRedimensionables({
    items,
    onAction: (accion, item) => console.debug("[HistoriaClinica:Expandir]", { etapa: accion, campo: item.clave, resultado: "ok" })
  });
}

function obtenerDatosHistoriaClinica() {
  etapaActual = "obtener-datos";
  const datos = {};
  calcularIMCHistoria();
  document.querySelectorAll("input, textarea, select").forEach((campo) => {
    const id = campo.id?.trim();
    if (!id || campo.closest("#selectorSustanciasHistoria, #bloquesSustanciasHistoria") || id === "observacionesSustanciasHistoria") return;
    if (["button", "submit", "reset"].includes(campo.type)) return;
    if (campo.type === "checkbox") datos[id] = campo.checked;
    else if (campo.type === "radio") {
      if (campo.checked) datos[id] = campo.value;
    } else datos[id] = campo.value;
  });
  const pesoNormalizado = normalizarMedidaClinica(datos.peso);
  if (datos.peso?.trim() && !pesoNormalizado) throw Object.assign(new Error("PESO_INVALIDO"), { code: "validation/invalid-weight" });
  datos.peso = pesoNormalizado;
  datos.talla = normalizarMedidaClinica(datos.talla) || String(datos.talla || "").trim();
  datos.perimetroAbdominal = normalizarMedidaClinica(datos.perimetroAbdominal) || String(datos.perimetroAbdominal || "").trim();
  calcularIMCHistoria();
  datos.imc = String(document.getElementById("imc")?.value || "").trim();
  datos.sustancias = gestorSustanciasHistoria?.obtenerDatos() || { seleccionadas: [], observacionesGenerales: "" };
  const advertencias = gestorSustanciasHistoria?.validar() || [];
  const bloqueante = advertencias.find((advertencia) => advertencia.includes("otra sustancia seleccionada"));
  if (bloqueante) throw Object.assign(new Error(bloqueante), { code: "validation/substances" });
  if (advertencias.length) alert("Se encontraron advertencias en el consumo de sustancias. La información se conservará y puedes revisarla antes de continuar.");
  return sanitizarDatosHistoriaClinica(datos);
}

function mostrarEstadoGuardadoHistoria(texto = "") {
  const estado = document.getElementById("estadoGuardarHistoria");
  if (estado) estado.textContent = texto;
}

function bloquearGuardarHistoria(bloquear) {
  const boton = document.getElementById("guardarHistoria");
  if (!boton) return;
  boton.disabled = bloquear;
  boton.setAttribute("aria-busy", String(bloquear));
}

function manejarErrorGuardadoHistoria(error, etapaActual) {
  const code = error?.code || null;
  console.error("[HistoriaClinica:Guardar]", { code, name: error?.name || null, message: error?.message || null, stage: etapaActual });
  const detalle = code ? ` Código: ${code}` : "";
  const mensaje = code === "permission-denied" || code === "PERMISSION_DENIED"
    ? "No tienes permisos para guardar esta historia clínica."
    : code === "patient-id-missing"
      ? "No se identificó el paciente seleccionado."
      : String(code || "").startsWith("validation/")
        ? `Revisa los datos de la historia clínica.${detalle}`
        : `No fue posible guardar la historia clínica.${detalle}`;
  mostrarEstadoGuardadoHistoria("Error al guardar");
  alert(mensaje);
}

window.guardarHistoria = async () => {
  if (guardandoHistoria) return;
  guardandoHistoria = true;
  let etapaActual = "inicio";
  bloquearGuardarHistoria(true);
  mostrarEstadoGuardadoHistoria("Guardando...");
  try {
    etapaActual = "validar-paciente";
    if (!uidPaciente) {
      throw Object.assign(new Error("No hay paciente seleccionado"), { code: "patient-id-missing" });
    }

  const datos = {};
  calcularIMCHistoria();

  document.querySelectorAll("input, textarea, select").forEach((campo) => {
    const id = campo.id?.trim();

    if (!id) {
      console.warn("Campo de historia ignorado porque no tiene id:", campo);
      return;
    }

    if (campo.closest("#selectorSustanciasHistoria, #bloquesSustanciasHistoria") || id === "observacionesSustanciasHistoria") return;

    if (
      campo.type === "button" ||
      campo.type === "submit" ||
      campo.type === "reset"
    ) {
      return;
    }

    if (campo.type === "checkbox") {
      datos[id] = campo.checked;
      return;
    }

    if (campo.type === "radio") {
      if (campo.checked) {
        datos[id] = campo.value;
      }
      return;
    }

    datos[id] = campo.value;
  });

  const pesoNormalizado = normalizarMedidaClinica(datos.peso);
  if (datos.peso?.trim() && !pesoNormalizado) {
    throw Object.assign(new Error("Peso clínico inválido"), { code: "validation/invalid-weight" });
    alert("Registra un peso numérico válido.");
    return;
  }
  datos.peso = pesoNormalizado;
  datos.talla = normalizarMedidaClinica(datos.talla) || String(datos.talla || "").trim();
  datos.perimetroAbdominal = normalizarMedidaClinica(datos.perimetroAbdominal) || String(datos.perimetroAbdominal || "").trim();
  calcularIMCHistoria();
  datos.imc = String(document.getElementById("imc")?.value || "").trim();

  datos.sustancias = gestorSustanciasHistoria?.obtenerDatos() || { seleccionadas: [], observacionesGenerales: "" };
  const advertenciasSustancias = gestorSustanciasHistoria?.validar() || [];
  const advertenciaBloqueante = advertenciasSustancias.find((advertencia) => advertencia.includes("otra sustancia seleccionada"));
  if (advertenciaBloqueante) {
    throw Object.assign(new Error(advertenciaBloqueante), { code: "validation/substances" });
    alert(advertenciaBloqueante);
    return;
  }
  if (advertenciasSustancias.length) {
    alert("Se encontraron advertencias en el consumo de sustancias. La información se conservará y puedes revisarla antes de continuar.");
  }

  console.debug("[HistoriaClinica] datos preparados para guardar", {
    pacienteId: uidPaciente,
    sustanciasSeleccionadas: datos.sustancias.seleccionadas.length
  });

  etapaActual = "persistir-historia";
  const datosSeguros = sanitizarDatosHistoriaClinica(datos);
  await guardarHistoriaClinica(uidPaciente, datosSeguros);

  etapaActual = "actualizar-paciente";
  const pacienteDatosActuales = await obtenerUsuario(uidPaciente);
  const tipoPaciente = datos.tipoPaciente || inferirTipoPaciente(pacienteDatosActuales);
  const institucionPaciente = campoConRespaldo(datos, pacienteDatosActuales, "institucionPaciente", ["institucion"]);
  const servicioInstitucional = campoConRespaldo(datos, pacienteDatosActuales, "servicioInstitucional", ["servicio"]);
  const expediente = campoConRespaldo(datos, pacienteDatosActuales, "expediente", ["numeroExpediente"]);
  const cama = campoConRespaldo(datos, pacienteDatosActuales, "cama");
  const sexo = campoConRespaldo(datos, pacienteDatosActuales, "sexo");
  const genero = campoConRespaldo(datos, pacienteDatosActuales, "genero", ["identidadGenero"]);
  const alergias = campoConRespaldo(datos, pacienteDatosActuales, "alergias");
  const tipoSangre = campoConRespaldo(datos, pacienteDatosActuales, "tipoSangre");
  const peso = campoConRespaldo(datos, pacienteDatosActuales, "peso");
  const talla = campoConRespaldo(datos, pacienteDatosActuales, "talla");
  const imc = campoConRespaldo(datos, pacienteDatosActuales, "imc");
  const perimetroAbdominal = campoConRespaldo(datos, pacienteDatosActuales, "perimetroAbdominal");

  await actualizarUsuario(uidPaciente, sanitizarDatosHistoriaClinica({
    tipoPaciente,
    institucionPaciente,
    institucion: institucionPaciente,
    servicioInstitucional,
    servicio: servicioInstitucional,
    expediente,
    numeroExpediente: expediente,
    cama,
    sexo,
    genero,
    alergias,
    tipoSangre,
    peso,
    talla,
    imc,
    perimetroAbdominal,
    datosInstitucionales: {
      ...(pacienteDatosActuales?.datosInstitucionales || {}),
      tipoPaciente,
      institucionPaciente,
      servicioInstitucional,
      expediente,
      cama,
      sexo,
      genero,
      alergias,
      tipoSangre,
      peso,
      talla,
      imc,
      perimetroAbdominal
    },
    signosVitales: {
      ...(pacienteDatosActuales?.signosVitales || {}),
      peso,
      talla,
      imc,
      perimetroAbdominal
    },
    somatometria: {
      ...(pacienteDatosActuales?.somatometria || {}),
      peso,
      talla,
      imc,
      perimetroAbdominal
    },
    datosClinicosResumen: {
      ...(pacienteDatosActuales?.datosClinicosResumen || {}),
      diagnosticoManualHistoria: datos.diagnosticoClinico || "",
      codigoDiagnosticoHistoria: datos.codigoDiagnostico || "",
      tratamientoHistoria: datos.tratamientoFarmacologico || "",
      fechaActualizacionHistoria: new Date().toISOString()
    }
  }));

  pacienteActual = await obtenerUsuario(uidPaciente) || pacienteActual;
  if (String(valorInstitucional(pacienteActual, "peso")) !== String(peso)) {
    throw new Error("No se confirmó la persistencia del peso del paciente.");
  }

  const usuario = auth.currentUser;
  const medico = usuario ? await obtenerUsuario(usuario.uid) : null;
  const paciente = pacienteActual || await obtenerUsuario(uidPaciente);

  etapaActual = "auditoria";
  try {
    await registrarEventoAuditoria({
    accion: "guardar_historia_clinica",
    modulo: "Historia clínica",
    descripcion: "El medico guardo historia clinica.",
    usuarioUid: usuario?.uid || "",
    usuarioNombre: medico?.nombre || usuario?.email || "",
    usuarioRol: medico?.rol || "",
    pacienteUid: uidPaciente,
    pacienteNombre: paciente?.nombre || "",
    exito: true,
    detalles: {
      camposRegistrados: Object.values(datos).filter(Boolean).length
    }
    });
  } catch (error) {
    console.error("[HistoriaClinica:Guardar]", { code: error?.code || null, name: error?.name || null, message: error?.message || null, stage: "auditoria" });
  }

    mostrarEstadoGuardadoHistoria("Guardado");
    alert("Historia clinica guardada.");
  } catch (error) {
    manejarErrorGuardadoHistoria(error, etapaActual);
    return;
    console.error("No se pudo guardar la historia clínica.", {
      codigo: error?.code || null
    });
    alert("No fue posible guardar la historia clínica. Verifica tu conexión y permisos, e inténtalo de nuevo.");
  } finally {
    guardandoHistoria = false;
    bloquearGuardarHistoria(false);
  }
};

window.descargarHistoriaPDF = () => {
  window.print();
};

const tabs = document.querySelectorAll(".tab");
const secciones = document.querySelectorAll(".seccion");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("activo"));
    secciones.forEach((s) => s.classList.remove("activa"));

    tab.classList.add("activo");

    const seccion = document.getElementById(tab.dataset.seccion);
    if (seccion) seccion.classList.add("activa");
  });
});

["peso", "talla"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", calcularIMCHistoria);
  document.getElementById(id)?.addEventListener("change", calcularIMCHistoria);
});

document.getElementById("sexo")?.addEventListener("input", () => actualizarVisibilidadGinecoobstetricos());
document.getElementById("sexo")?.addEventListener("change", () => actualizarVisibilidadGinecoobstetricos());
