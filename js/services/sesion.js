import { obtenerUsuario } from "./usuarios.js";
import { getAuthenticatedUserOnce } from "./authContextService.js";
import { registrarEventoAuditoria } from "./auditoria.js";

const INACTIVIDAD_MS = 15 * 60 * 1000;
const EVENTOS_ACTIVIDAD = ["click", "keydown", "mousemove", "scroll", "touchstart"];
const monitoreosActivos = new Map();

export function iniciarMonitoreoSesion(modulo, opciones = {}) {
  const claveMonitoreo = opciones.clave || modulo || "global";
  if (monitoreosActivos.has(claveMonitoreo)) {
    return monitoreosActivos.get(claveMonitoreo);
  }

  const inactividadMs = opciones.inactividadMs || INACTIVIDAD_MS;
  let usuario = opciones.usuarioInicial || null;
  let datosUsuario = opciones.datosUsuarioInicial || null;
  let ultimoMovimiento = Date.now();
  let inactividadRegistrada = false;
  const uidConDatosIniciales = usuario?.uid && datosUsuario ? usuario.uid : "";

  getAuthenticatedUserOnce().then(async (user) => {
    usuario = user;
    if (!user) {
      datosUsuario = null;
      return;
    }

    if (uidConDatosIniciales === user.uid && datosUsuario) return;
    datosUsuario = await obtenerUsuario(user.uid);
  }).catch((error) => {
    console.warn("No se pudo resolver la sesion para auditoria:", error);
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

  const intervalo = window.setInterval(() => {
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

  const limpiar = () => {
    EVENTOS_ACTIVIDAD.forEach((evento) => {
      window.removeEventListener(evento, marcarActividad);
    });
    window.clearInterval(intervalo);
    monitoreosActivos.delete(claveMonitoreo);
  };

  monitoreosActivos.set(claveMonitoreo, limpiar);
  window.addEventListener("pagehide", limpiar, { once: true });

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

  return limpiar;
}
