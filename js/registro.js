import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { registrarEventoAuditoria } from "./services/auditoria.js";
import { vincularCuentaConCodigoMedico } from "./services/vinculacion.js";

const VERSION_AVISO_PRIVACIDAD = "beta-2026-06-29";

const btnCrearCuenta = document.getElementById("btnCrearCuenta");

btnCrearCuenta.addEventListener("click", async () => {
  const nombre = document.getElementById("nombre").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const correoMedico = document.getElementById("correoMedico").value.trim().toLowerCase();
  const codigoVinculacion = document.getElementById("codigoVinculacion").value.trim().toUpperCase();
  const password = document.getElementById("password").value;
  const aceptaAviso = document.getElementById("aceptaAviso").checked;
  const mensaje = document.getElementById("mensaje");

  if (!nombre || !email || (!correoMedico && !codigoVinculacion) || !password) {
    mensaje.textContent = "Completa nombre, correo, contrasena y correo medico o codigo de vinculacion.";
    return;
  }

  if (!aceptaAviso) {
    mensaje.textContent = "Debes aceptar el Aviso de Privacidad para crear tu cuenta.";
    return;
  }

  if (password.length < 6) {
    mensaje.textContent = "La contrasena debe tener al menos 6 caracteres.";
    return;
  }

  try {
    let uidMedico = "";
    let datosMedico = {};

    if (!codigoVinculacion) {
      mensaje.textContent = "Buscando medico tratante...";

      const qMedico = query(
        collection(db, "usuarios"),
        where("email", "==", correoMedico),
        where("rol", "==", "medico")
      );

      const snapMedico = await getDocs(qMedico);

      if (snapMedico.empty) {
        mensaje.textContent = "No se encontro un medico registrado con ese correo.";
        return;
      }

      const docMedico = snapMedico.docs[0];
      uidMedico = docMedico.id;
      datosMedico = docMedico.data();
    } else {
      mensaje.textContent = "Se usara el codigo para vincular tu expediente previo.";
    }

    mensaje.textContent = "Creando cuenta...";

    const credencial = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const uidPaciente = credencial.user.uid;
    const fechaActual = new Date().toISOString();

    await setDoc(doc(db, "usuarios", uidPaciente), {
      nombre,
      email,
      rol: "paciente",
      tieneCuenta: true,
      estado: "activo",
      tipoPaciente: "privada",
      datosInstitucionales: {
        tipoPaciente: "privada",
        institucionPaciente: "",
        servicioInstitucional: "",
        expediente: "",
        cama: "",
        alergias: "",
        diasEstancia: ""
      },
      creadoPor: uidMedico,
      medicoTratanteUid: uidMedico,
      medicoTratante: datosMedico.nombre || correoMedico,
      aceptoAvisoPrivacidad: true,
      fechaAceptacionAviso: fechaActual,
      versionAvisoPrivacidad: VERSION_AVISO_PRIVACIDAD,
      fechaCreacion: fechaActual
    });

    let resultadoVinculacion = null;

    if (codigoVinculacion) {
      mensaje.textContent = "Vinculando expediente previo...";
      resultadoVinculacion = await vincularCuentaConCodigoMedico(
        codigoVinculacion,
        uidPaciente
      );
    } else {
      await setDoc(
        doc(db, "usuarios", uidPaciente, "permisosMedicos", uidMedico),
        {
          lectura: true,
          agregarNotas: true,
          editarPaciente: true,
          administrarPermisos: true,
          rolPermiso: "tratante",
          fechaOtorgamiento: fechaActual,
          otorgadoPor: uidPaciente
        }
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
          medicoTratanteUid: uidMedico || resultadoVinculacion?.medicoUid || "",
          medicoTratante: datosMedico.nombre || correoMedico || "",
          codigoVinculacion: codigoVinculacion || "",
          expedientePrevioUid: resultadoVinculacion?.expedientePrevioUid || "",
          versionAvisoPrivacidad: VERSION_AVISO_PRIVACIDAD
        }
      });
    } catch (errorAuditoria) {
      console.error("No se pudo registrar la auditoria:", errorAuditoria);
    }

    mensaje.textContent = "Cuenta creada correctamente.";
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
      alert(error.message);
    }
  }
});
