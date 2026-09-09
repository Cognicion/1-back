import { auth } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { registrarEventoAuditoria } from "./services/auditoria.js";
import { registrarVisita } from "./services/visitas.js";
import { vincularCuentaConCodigoMedico } from "./services/vinculacion.js";
import {
  descartarCuentaSinPerfil,
  registrarPerfilPacienteSeguro
} from "./services/professionalPatientAccessService.js?v=20260909-registro-datos-v1";
import {
  ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL,
  ROL_ENFERMERIA_SALUD_MENTAL
} from "./utils/roles.js";
import { abrirLegalModal } from "./legal/legalModal.js";
import { betaConsent, privacyNotice } from "./legal/legalDocuments.js";
import { registrarProfesional } from "./services/professionalRegistrationService.js?v=20260909-registro-datos-v1";
import { fechaMaximaNacimiento, fechaNacimientoValida } from "./utils/fechaNacimientoRegistro.js";

const VERSION_AVISO_PRIVACIDAD = "2026-08-01";
const INTERVALO_VERIFICACION_CORREO_MS = 5000;
const TIEMPO_MAXIMO_VERIFICACION_CORREO_MS = 10 * 60 * 1000;

const btnCrearCuenta = document.getElementById("btnCrearCuenta");
const campoFechaNacimiento = document.getElementById("fechaNacimiento");
campoFechaNacimiento.max = fechaMaximaNacimiento();
let registroEnProceso = false;
window.addEventListener("beforeunload", (event) => {
  if (!registroEnProceso) return;
  event.preventDefault();
  event.returnValue = "";
});
let tipoCuentaSeleccionada = "paciente";
let modalidadProfesionalSeleccionada = "gratuita";
const ERRORES_DEFINITIVOS_REGISTRO = new Set([
  "functions/already-exists",
  "functions/failed-precondition",
  "functions/invalid-argument",
  "functions/not-found",
  "functions/permission-denied",
  "functions/resource-exhausted"
]);

async function limpiarAuthDeRegistroFallido(error) {
  if (!ERRORES_DEFINITIVOS_REGISTRO.has(error?.code)) return;
  try {
    await descartarCuentaSinPerfil();
  } catch (cleanupError) {
    console.error("No se pudo limpiar la cuenta sin perfil tras el registro fallido:", cleanupError);
  } finally {
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error("No se pudo cerrar la sesión del registro fallido:", signOutError);
    }
  }
}

async function crearOReanudarCuentaAuth(email, password) {
  if (auth.currentUser?.email?.toLowerCase() === email) {
    return { user: auth.currentUser };
  }
  try {
    return await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    if (error?.code !== "auth/email-already-in-use") throw error;
    return signInWithEmailAndPassword(auth, email, password);
  }
}

function esperar(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function esperarVerificacionCorreo(usuario, mensaje) {
  const inicio = Date.now();

  while (Date.now() - inicio < TIEMPO_MAXIMO_VERIFICACION_CORREO_MS) {
    await esperar(INTERVALO_VERIFICACION_CORREO_MS);
    try {
      await reload(usuario);
    } catch (error) {
      if (error?.code !== "auth/network-request-failed" && error?.code !== "auth/too-many-requests") {
        throw error;
      }
      continue;
    }

    if (usuario.emailVerified) {
      mensaje.textContent = "Correo verificado. Finalizando tu perfil profesional...";
      return true;
    }
  }

  return false;
}

function configurarModalidadProfesional() {
  const campoCodigo = document.getElementById("campoCodigoProfesional");
  const nota = document.getElementById("notaModalidadProfesional");

  document.querySelectorAll("[data-modalidad-profesional]").forEach((boton) => {
    boton.addEventListener("click", () => {
      modalidadProfesionalSeleccionada = boton.dataset.modalidadProfesional || "gratuita";
      document.querySelectorAll("[data-modalidad-profesional]").forEach((item) => {
        item.classList.toggle("activo", item === boton);
      });
      const usaCodigo = modalidadProfesionalSeleccionada === "codigo_admin";
      campoCodigo?.classList.toggle("oculto", !usaCodigo);
      if (nota) {
        nota.textContent = usaCodigo
          ? "Usa el código Pro de un solo uso generado por administración. Pro no concede acceso al Centro de Control."
          : "Sin código. Incluye hasta 5 pacientes distintos en tu cuenta profesional.";
        nota.classList.toggle("nota-plan-gratuito", !usaCodigo);
      }
    });
  });
}

function configurarTipoCuenta() {
  const titulo = document.getElementById("tituloRegistro");
  const descripcion = document.getElementById("descripcionRegistro");
  const camposPaciente = document.getElementById("camposPacienteRegistro");
  const camposMedico = document.getElementById("camposMedicoRegistro");

  document.querySelectorAll("[data-tipo-cuenta]").forEach((boton) => {
    boton.addEventListener("click", () => {
      tipoCuentaSeleccionada = boton.dataset.tipoCuenta || "paciente";

      document.querySelectorAll("[data-tipo-cuenta]").forEach((item) => {
        item.classList.toggle("activo", item === boton);
      });

      const esProfesional = ["medico", "psicologo", ROL_ENFERMERIA_SALUD_MENTAL].includes(tipoCuentaSeleccionada);
      camposPaciente?.classList.toggle("oculto", esProfesional);
      camposMedico?.classList.toggle("oculto", !esProfesional);

      if (titulo) {
        titulo.textContent = tipoCuentaSeleccionada === "medico"
          ? "Registro de medico"
          : tipoCuentaSeleccionada === "psicologo"
            ? "Registro de psicologo"
            : tipoCuentaSeleccionada === ROL_ENFERMERIA_SALUD_MENTAL
              ? `Registro de ${ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL}`
              : "Registro de paciente";
      }
      if (descripcion) {
        descripcion.textContent = esProfesional
          ? "Crea una cuenta gratuita para hasta 5 pacientes o usa un código para activar Pro."
          : "Tu medico debe estar registrado para vincular tu expediente.";
      }
    });
  });
}

async function crearCuentaProfesional({ nombre, fechaNacimiento, email, password, codigoAutorizacion, aceptaAviso, aceptaBeta, aceptaComunicaciones, mensaje, rol }) {
  const rolProfesional = rol === "psicologo"
    ? "psicologo"
    : rol === ROL_ENFERMERIA_SALUD_MENTAL
      ? ROL_ENFERMERIA_SALUD_MENTAL
      : "medico";
  const etiquetaRol = rolProfesional === "psicologo"
    ? "psicologo"
    : rolProfesional === ROL_ENFERMERIA_SALUD_MENTAL
      ? ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL
      : "medico";

  const modalidadRegistro = modalidadProfesionalSeleccionada;
  const usaCodigo = modalidadRegistro === "codigo_admin";
  if (!nombre || !email || !password || (usaCodigo && !codigoAutorizacion)) {
    mensaje.textContent = usaCodigo
      ? "Completa nombre, correo, contraseña y código de autorización."
      : "Completa nombre, correo y contraseña.";
    return;
  }

  if (!aceptaAviso || !aceptaBeta) {
    mensaje.textContent = "Debes leer y aceptar el Aviso de Privacidad y el Consentimiento Beta para crear tu cuenta.";
    return;
  }

  if (password.length < 6) {
    mensaje.textContent = "La contrasena debe tener al menos 6 caracteres.";
    return;
  }

  mensaje.textContent = `Creando cuenta de ${etiquetaRol}...`;
  const credencial = await crearOReanudarCuentaAuth(email, password);
  const uidProfesional = credencial.user.uid;
  await reload(credencial.user);
  if (!credencial.user.emailVerified) {
    try {
      await sendEmailVerification(credencial.user);
    } catch (verificationError) {
      if (verificationError?.code !== "auth/too-many-requests") throw verificationError;
    }
    mensaje.textContent = "Te enviamos un correo de verificación. Mantén esta pestaña abierta: al verificarlo terminaremos automáticamente tu perfil profesional.";
    const correoVerificado = await esperarVerificacionCorreo(credencial.user, mensaje);
    if (!correoVerificado) {
      mensaje.textContent = "La verificación sigue pendiente. Cuando hayas verificado el correo, vuelve a esta pantalla e ingresa los mismos datos para terminar el registro; no se creará una cuenta duplicada.";
      return;
    }
  }
  await credencial.user.getIdToken(true);
  let registroProfesional;
  try {
    registroProfesional = await registrarProfesional({
      nombre,
      fechaNacimiento,
      aceptaComunicaciones,
      rol: rolProfesional,
      modalidadRegistro,
      codigoAutorizacion,
      aceptaAviso,
      aceptaBeta
    });
  } catch (registrationError) {
    await limpiarAuthDeRegistroFallido(registrationError);
    throw registrationError;
  }

  try {
    await registrarEventoAuditoria({
      accion: `crear_cuenta_${rolProfesional}_${usaCodigo ? "codigo_admin" : "gratuita"}`,
      modulo: "Registro",
      descripcion: usaCodigo
        ? `Se creó una cuenta de ${etiquetaRol} con código de autorización generado por admin.`
        : `Se creó una cuenta gratuita de ${etiquetaRol} con límite de 5 pacientes.`,
      usuarioUid: uidProfesional,
      usuarioNombre: nombre,
      usuarioRol: rolProfesional,
      exito: true,
      detalles: {
        registroReintentado: registroProfesional.alreadyRegistered === true,
        modalidadRegistroProfesional: modalidadRegistro,
        tipoMembresia: usaCodigo ? "pro" : "gratuita",
        limitePacientes: usaCodigo ? null : 5,
        versionAvisoPrivacidad: VERSION_AVISO_PRIVACIDAD
      }
    });
  } catch (errorAuditoria) {
    console.error("No se pudo registrar la auditoria:", errorAuditoria);
  }

  mensaje.textContent = usaCodigo
    ? `Cuenta Pro de ${etiquetaRol} creada correctamente.`
    : `Cuenta gratuita de ${etiquetaRol} creada correctamente. Puedes gestionar hasta 5 pacientes.`;
  registroEnProceso = false;
  window.location.href = "dashboard.html";
}

configurarTipoCuenta();
configurarModalidadProfesional();

async function procesarCreacionCuenta() {
  const nombre = document.getElementById("nombre").value.trim();
  const fechaNacimiento = campoFechaNacimiento.value;
  const email = document.getElementById("email").value.trim().toLowerCase();
  const correoMedico = document.getElementById("correoMedico").value.trim().toLowerCase();
  const codigoVinculacion = document.getElementById("codigoVinculacion").value.trim().toUpperCase();
  const codigoAutorizacion = document.getElementById("codigoAutorizacionMedico").value.trim().toUpperCase();
  const password = document.getElementById("password").value;
  const aceptaAviso = document.getElementById("aceptaAviso").checked;
  const aceptaBeta = document.getElementById("aceptaBeta").checked;
  const aceptaComunicaciones = document.getElementById("aceptaComunicaciones").checked;
  const mensaje = document.getElementById("mensaje");
  const mensajeLegal = document.getElementById("mensajeLegal");
  if (!fechaNacimientoValida(fechaNacimiento)) {
    mensaje.textContent = "Ingresa una fecha de nacimiento válida; es obligatoria y no puede estar en el futuro.";
    campoFechaNacimiento.disabled = false;
    campoFechaNacimiento.focus();
    return;
  }
  console.log("[LEGAL][SIGNUP] Estado inicial", { privacyAccepted: aceptaAviso, betaAccepted: aceptaBeta, communicationsAccepted: aceptaComunicaciones });
  if (aceptaAviso) console.log("[LEGAL][SIGNUP] Aviso aceptado");
  if (aceptaBeta) console.log("[LEGAL][SIGNUP] Consentimiento Beta aceptado");
  console.log("[LEGAL][SIGNUP] Comunicaciones", { accepted: aceptaComunicaciones });

  if (!aceptaAviso || !aceptaBeta) {
    const textoLegal = "Debes leer y aceptar el Aviso de Privacidad y el Consentimiento Beta para crear tu cuenta.";
    mensajeLegal.textContent = textoLegal;
    mensaje.textContent = textoLegal;
    return;
  }
  mensajeLegal.textContent = "";

  if (["medico", "psicologo", ROL_ENFERMERIA_SALUD_MENTAL].includes(tipoCuentaSeleccionada)) {
    try {
      await crearCuentaProfesional({
        nombre,
        fechaNacimiento,
        email,
        password,
        codigoAutorizacion,
        aceptaAviso,
        aceptaBeta,
        aceptaComunicaciones,
        mensaje,
        rol: tipoCuentaSeleccionada
      });
    } catch (error) {
      console.error(error);
      if (error.code === "auth/email-already-in-use") {
        mensaje.textContent = "Ese correo ya esta registrado.";
      } else if (error.code === "auth/invalid-email") {
        mensaje.textContent = "Correo invalido.";
      } else if (error.code === "auth/weak-password") {
        mensaje.textContent = "Contrasena demasiado debil.";
      } else {
        mensaje.textContent = error.message;
      }
    }
    return;
  }



  if (!nombre || !email || (!correoMedico && !codigoVinculacion) || !password) {
      mensaje.textContent = "Completa nombre, correo, contrasena y correo medico o codigo de vinculacion.";
    return;
  }

  if (password.length < 6) {
    mensaje.textContent = "La contrasena debe tener al menos 6 caracteres.";
    return;
  }

  try {
    mensaje.textContent = "Creando cuenta...";
    const credencial = await crearOReanudarCuentaAuth(email, password);
    const uidPaciente = credencial.user.uid;
    let registroPaciente;
    try {
      registroPaciente = await registrarPerfilPacienteSeguro({
        nombre,
        fechaNacimiento,
        aceptaComunicaciones,
        correoMedico,
        usaCodigoVinculacion: Boolean(codigoVinculacion),
        aceptaAviso,
        aceptaBeta
      });
    } catch (registrationError) {
      await limpiarAuthDeRegistroFallido(registrationError);
      throw registrationError;
    }

    try {
      await registrarVisita({
        usuario: credencial.user,
        perfil: { nombre, email, rol: "paciente" }
      });
    } catch (errorVisita) {
      console.warn("No se pudo asociar la visita con la cuenta creada:", errorVisita);
    }

    let resultadoVinculacion = null;

    if (codigoVinculacion) {
      mensaje.textContent = "Vinculando expediente previo...";
      resultadoVinculacion = await vincularCuentaConCodigoMedico(
        codigoVinculacion,
        uidPaciente
      );
    }

    try {
      await registrarEventoAuditoria({
        accion: codigoVinculacion ? "crear_cuenta_y_vincular_expediente" : "crear_cuenta_paciente",
        modulo: "Registro",
        descripcion: codigoVinculacion
          ? "Se creo una cuenta de paciente y se vinculo a un expediente previo."
          : "Se creo una cuenta de paciente y se acepto el Aviso de Privacidad.",
        usuarioUid: uidPaciente,
        usuarioNombre: nombre,
        usuarioRol: "paciente",
        pacienteUid: uidPaciente,
        pacienteNombre: nombre,
        exito: true,
        detalles: {
          medicoTratanteUid: registroPaciente.medicoUid || resultadoVinculacion?.medicoUid || "",
          medicoTratante: correoMedico || "",
          codigoVinculacion: codigoVinculacion || "",
          expedientePrevioUid: resultadoVinculacion?.expedientePrevioUid || "",
          versionAvisoPrivacidad: VERSION_AVISO_PRIVACIDAD
        }
      });
    } catch (errorAuditoria) {
      console.error("No se pudo registrar la auditoria:", errorAuditoria);
    }

    mensaje.textContent = "Cuenta creada correctamente.";
    registroEnProceso = false;
    window.location.href = "dashboard.html";
  } catch (error) {
    console.error(error);

    if (error.code === "auth/email-already-in-use") {
      mensaje.textContent = "Ese correo ya esta registrado.";
    } else if (error.code === "auth/invalid-email") {
      mensaje.textContent = "Correo invalido.";
    } else if (error.code === "auth/weak-password") {
      mensaje.textContent = "Contrasena demasiado debil.";
    } else {
      mensaje.textContent = error.message;
    }
  }
}

btnCrearCuenta.addEventListener("click", async () => {
  if (btnCrearCuenta.disabled) return;
  const textoBotonOriginal = btnCrearCuenta.textContent;
  btnCrearCuenta.disabled = true;
  registroEnProceso = true;
  const controles = [...document.querySelectorAll(".auth-card input, [data-tipo-cuenta], [data-modalidad-profesional]")];
  const estadosPrevios = controles.map((control) => control.disabled);
  controles.forEach((control) => { control.disabled = true; });
  btnCrearCuenta.textContent = "Procesando...";

  try {
    await procesarCreacionCuenta();
  } finally {
    registroEnProceso = false;
    controles.forEach((control, index) => { control.disabled = estadosPrevios[index]; });
    btnCrearCuenta.disabled = false;
    btnCrearCuenta.textContent = textoBotonOriginal;
  }
});

document.querySelectorAll("[data-legal-document]").forEach((trigger) => trigger.addEventListener("click", () => {
  abrirLegalModal(trigger.dataset.legalDocument === "beta_consent" ? betaConsent : privacyNotice, trigger);
}));
