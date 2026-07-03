import { auth } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { obtenerUsuario } from "./usuarios.js";
import { registrarEventoAuditoria } from "./auditoria.js";

const INACTIVIDAD_MS = 15 * 60 * 1000;
const EVENTOS_ACTIVIDAD = ["click", "keydown", "mousemove", "scroll", "touchstart"];

export function iniciarMonitoreoSesion(modulo, opciones = {}) {
  const inactividadMs = opciones.inactividadMs || INACTIVIDAD_MS;
  let usuario = null;
  let datosUsuario = null;
  let ultimoMovimiento = Date.now();
  let inactividadRegistrada = false;

  onAuthStateChanged(auth, async (user) => {
    usuario = user;
    if (!user) return;

    datosUsuario = await obtenerUsuario(user.uid);
  });

  const marcarActividad = () => {
    ultimoMovimiento = Date.now();
    if (inactividadRegistrada) {
      inactividadRegistrada = false;
      registrarSesion({
        accion: "reanudar_actividad",
        modulo,
        descripcion: `El usuario reanudo actividad en ${modulo}.`
      });
    }
  };

  EVENTOS_ACTIVIDAD.forEach((evento) => {
    window.addEventListener(evento, marcarActividad, { passive: true });
  });

  window.setInterval(() => {
    if (!usuario || inactividadRegistrada) return;

    const msInactivo = Date.now() - ultimoMovimiento;
    if (msInactivo >= inactividadMs) {
      inactividadRegistrada = true;
      registrarSesion({
        accion: "sesion_inactiva",
        modulo,
        descripcion: `El usuario permanecio inactivo en ${modulo}.`,
        detalles: {
          minutosInactivo: Math.round(msInactivo / 60000)
        }
      });
    }
  }, 60 * 1000);

  async function registrarSesion(evento) {
    if (!usuario) return;

    try {
      await registrarEventoAuditoria({
        ...evento,
        usuarioUid: usuario.uid,
        usuarioNombre: datosUsuario?.nombre || usuario.email || "",
        usuarioRol: datosUsuario?.rol || "",
        exito: true,
        detalles: {
          ruta: window.location.pathname,
          url: window.location.href,
          ...(evento.detalles || {})
        }
      });
    } catch (error) {
      console.warn("No se pudo registrar auditoria de sesion:", error);
    }
  }
}
