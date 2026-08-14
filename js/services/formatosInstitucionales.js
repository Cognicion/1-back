import { isAdministrator, normalizarRol } from "../utils/roles.js";

export const FORMAT_PERMISSION_FRAY = "fray_clinical_formats";
export const FORMAT_PERMISSION_NAVARRO = "navarro_referral_format";
export const FORMAT_PERMISSION_HUGO_WILSON = "hugo_wilson_private_formats";

export const HUGO_WILSON_FORMAT_OWNER_UID = "D1wJppySnzdtUPMGNMSQLi8YwNJ2";

export const INSTITUTION_FRAY = "hpfba";
export const INSTITUTION_NAVARRO = "navarro";

export const FRAY_FORMAT_IDS = Object.freeze([
  "ingreso_observacion",
  "evolucion_observacion",
  "egreso_traslado_observacion",
  "urgencias",
  "contrarreferencia",
  "solicitud_imagenologia",
  "fray-laboratorio-fto-hpfba-expc-lab-sac"
]);

export const FORMATO_SOLICITUD_IMAGENOLOGIA = Object.freeze({
  id: "solicitud_imagenologia",
  clave: "FTO-HPFBA-EXPC-IMG-SEI",
  nombre: "Solicitud de estudio de imagenología",
  descripcion: "Solicitud institucional para radiografías, tomografía, resonancia magnética, ultrasonido y otros estudios de imagen."
});

export const FORMATO_SOLICITUD_LABORATORIO_FRAY = Object.freeze({
  id: "fray-laboratorio-fto-hpfba-expc-lab-sac",
  clave: "FTO-HPFBA-EXPC-LAB-SAC",
  nombre: "Solicitud de análisis clínicos",
  descripcion: "Solicitud institucional de análisis clínicos Fray."
});

export const FORMATO_SOLICITUD_GENERAL = Object.freeze({
  id: "cognicion",
  clave: "COGNICION-SOLICITUD-GENERAL",
  origen: "cognicion",
  categoria: "general"
});

export function resolverFormatoSolicitud(formatoId = "") {
  const valor = String(formatoId || "").trim();
  if (valor === FORMATO_SOLICITUD_IMAGENOLOGIA.clave || valor === FORMATO_SOLICITUD_IMAGENOLOGIA.id) {
    return {
      ...FORMATO_SOLICITUD_IMAGENOLOGIA,
      id: FORMATO_SOLICITUD_IMAGENOLOGIA.clave,
      origen: "fray",
      categoria: "imagen"
    };
  }
  if (valor === FORMATO_SOLICITUD_LABORATORIO_FRAY.clave || valor === FORMATO_SOLICITUD_LABORATORIO_FRAY.id) {
    return {
      ...FORMATO_SOLICITUD_LABORATORIO_FRAY,
      id: FORMATO_SOLICITUD_LABORATORIO_FRAY.id,
      origen: "fray",
      categoria: "laboratorio"
    };
  }
  if (!valor || valor === FORMATO_SOLICITUD_GENERAL.id || valor === FORMATO_SOLICITUD_GENERAL.clave) {
    return FORMATO_SOLICITUD_GENERAL;
  }
  return null;
}

export const NAVARRO_FORMAT_IDS = Object.freeze([
  "referencia_navarro"
]);

export const HUGO_WILSON_FORMAT_IDS = Object.freeze([
  "hugo_wilson_consulta",
  "hugo_wilson_evolucion",
  "hugo_wilson_interconsulta",
  "hugo_wilson_urgencias",
  "hugo_wilson_egreso"
]);

export const FORMATOS_INSTITUCIONALES = Object.freeze([
  {
    id: FORMAT_PERMISSION_FRAY,
    legacyId: "fray",
    nombre: "Formatos Fray",
    descripcion: "Ingreso, evolucion, egreso/traslado, urgencias, contrarreferencia y solicitud institucional de imagenologia Fray.",
    institutionId: INSTITUTION_FRAY,
    requiereAutorizacion: true,
    valores: FRAY_FORMAT_IDS,
    formatos: [FORMATO_SOLICITUD_IMAGENOLOGIA, FORMATO_SOLICITUD_LABORATORIO_FRAY]
  },
  {
    id: FORMAT_PERMISSION_NAVARRO,
    legacyId: "navarro",
    nombre: "Referencia Navarro",
    descripcion: "Referencia tipo Navarro con permiso institucional independiente.",
    institutionId: INSTITUTION_NAVARRO,
    requiereAutorizacion: true,
    valores: NAVARRO_FORMAT_IDS
  },
  {
    id: FORMAT_PERMISSION_HUGO_WILSON,
    legacyId: "hugo_wilson",
    nombre: "Dr. Hugo Wilson",
    descripcion: "Paquete privado de consulta, evolución, interconsulta, urgencias y egreso para el Dr. Hugo Wilson.",
    institutionId: "",
    requiereAutorizacion: true,
    authorizedUserUid: HUGO_WILSON_FORMAT_OWNER_UID,
    authorizedUserLabel: "Dr. Hugo Wilson",
    valores: HUGO_WILSON_FORMAT_IDS
  }
]);

const LEGACY_PERMISSION_ALIASES = Object.freeze({
  fray: FORMAT_PERMISSION_FRAY,
  fray_observacion: FORMAT_PERMISSION_FRAY,
  fray_observacion_ingreso: FORMAT_PERMISSION_FRAY,
  fray_observacion_evolucion: FORMAT_PERMISSION_FRAY,
  fray_observacion_envio_piso: FORMAT_PERMISSION_FRAY,
  referencia_navarro: FORMAT_PERMISSION_NAVARRO,
  navarro: FORMAT_PERMISSION_NAVARRO,
  hugo_wilson: FORMAT_PERMISSION_HUGO_WILSON
});

export const ACCIONES_FORMATO = Object.freeze([
  "ver", "editar", "guardar_borrador", "generar", "descargar", "imprimir", "cancelar", "administrar_permisos"
]);

function cuentaActiva(usuario = {}) {
  const estado = normalizarRol(usuario.estadoCuenta || usuario.estado || usuario.status || "activo");
  return usuario.activo !== false && usuario.active !== false && usuario.cuentaActiva !== false &&
    !["desactivado", "deshabilitado", "suspendido", "eliminado", "deleted", "disabled", "suspended"].includes(estado);
}

export function esAdministradorFormato(usuario = {}, claims = null) {
  return isAdministrator({ ...(usuario || {}), claims: claims || usuario?.claims || {} });
}

function normalizar(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarPermisoFormato(valor = "") {
  const limpio = normalizar(valor).replace(/[^a-z0-9_:-]/g, "_");
  return LEGACY_PERMISSION_ALIASES[limpio] || limpio;
}

function fechaVigente(valor = "") {
  if (!valor) return true;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? true : fecha.getTime() >= Date.now();
}

function membresiaInstitucionalActiva(usuario = {}, institutionId = "") {
  if (!institutionId) return true;
  const objetivo = normalizar(institutionId);
  const memberships = [
    ...(Array.isArray(usuario.institutionalMemberships) ? usuario.institutionalMemberships : []),
    ...(Array.isArray(usuario.membresiasInstitucionales) ? usuario.membresiasInstitucionales : [])
  ];
  if (memberships.some((item) => {
    const id = normalizar(item?.institutionId || item?.institucionId || item?.id || item?.institution || item?.institucion);
    const status = normalizar(item?.status || item?.estado || "active");
    return id === objetivo && ["active", "activo", "vigente", "authorized", "autorizado"].includes(status) && fechaVigente(item?.expiresAt || item?.expiraEn);
  })) return true;

  const textoInstitucion = normalizar([
    usuario.institucion,
    usuario.unidad,
    usuario.institucionPaciente,
    usuario.servicioInstitucional
  ].join(" "));
  if (objetivo === INSTITUTION_FRAY && (textoInstitucion.includes("fray") || textoInstitucion.includes("bernardino"))) return true;
  if (objetivo === INSTITUTION_NAVARRO && textoInstitucion.includes("navarro")) return true;
  return false;
}

function permisoExplicitoVigente(usuario = {}, permissionId = "") {
  const objetivo = normalizarPermisoFormato(permissionId);
  const metadata = usuario.formatPermissionMetadata?.[objetivo] || usuario.metadataPermisosFormatos?.[objetivo] || null;
  if (metadata) {
    const status = normalizar(metadata.status || metadata.estado || "active");
    if (["revoked", "revocado", "inactive", "inactivo"].includes(status)) return false;
    if (!fechaVigente(metadata.expiresAt || metadata.expiraEn)) return false;
  }
  const permisos = {
    ...(usuario.permisosFormatos || {}),
    ...(usuario.formatosAutorizados || {}),
    ...(usuario.formatPermissions || {})
  };

  if (permisos.todos === true || permisos.all === true) return true;
  if (permisos[objetivo] === true) return true;
  if (Object.entries(permisos).some(([key, value]) => normalizarPermisoFormato(key) === objetivo && value === true)) return true;

  const arreglos = [
    usuario.formatPermissions,
    usuario.permisosFormatosArray,
    usuario.formatosAutorizadosArray
  ].filter(Array.isArray);
  if (arreglos.some((items) => items.some((item) => normalizarPermisoFormato(item) === objetivo))) return true;

  const registros = [
    ...(Array.isArray(usuario.formatPermissionGrants) ? usuario.formatPermissionGrants : []),
    ...(Array.isArray(usuario.permisosFormatosOtorgados) ? usuario.permisosFormatosOtorgados : [])
  ];
  return registros.some((grant) => {
    const id = normalizarPermisoFormato(grant?.permissionId || grant?.formatId || grant?.id);
    const status = normalizar(grant?.status || grant?.estado || "active");
    return id === objetivo && !["revoked", "revocado", "inactive", "inactivo"].includes(status) && fechaVigente(grant?.expiresAt || grant?.expiraEn);
  });
}

export function usuarioEsActorProfesionalFormato(usuario = {}) {
  if (esAdministradorFormato(usuario)) return true;
  const texto = normalizar([
    usuario.rol,
    usuario.role,
    usuario.profesion,
    usuario.profession,
    usuario.especialidad,
    usuario.specialty,
    usuario.cargo,
    usuario.tipoCuenta
  ].join(" "));
  const tieneCedula = Boolean(usuario.cedulaProfesional || usuario.cedula || usuario.cedulaEspecialidad);
  const rolMedico = [
    "medico",
    "medica",
    "doctor",
    "doctora",
    "psiquiatra",
    "medicina",
    "medicina general",
    "medicina interna",
    "paidopsiquiatra"
  ].some((termino) => texto.includes(termino));
  if (texto.includes("psicolog")) return true;
  if (usuario.perfilMedicoVerificado === true || usuario.medicoVerificado === true) return true;
  return rolMedico || (tieneCedula && texto.includes("admin_medico"));
}

export function usuarioPuedeAdministrarPermisosFormato(usuario = {}) {
  return esAdministradorFormato(usuario);
}

function formatoInstitucionalPorPermiso(permissionId = "") {
  return FORMATOS_INSTITUCIONALES.find((item) => item.id === permissionId || item.legacyId === permissionId) || null;
}

function usuarioAutorizadoParaPaquetePrivado(usuario = {}, formato = null) {
  if (!formato?.authorizedUserUid) return true;
  if (esAdministradorFormato(usuario)) return true;
  const uid = String(usuario.uid || usuario.id || usuario.userUid || "").trim();
  return uid === formato.authorizedUserUid;
}

export function resolverFormatoClinico(formatId = "") {
  const id = normalizar(formatId);
  if (FRAY_FORMAT_IDS.includes(id)) {
    return {
      formatId: id,
      permissionId: FORMAT_PERMISSION_FRAY,
      institutionId: INSTITUTION_FRAY,
      institutional: true,
      branding: "fray"
    };
  }
  if (NAVARRO_FORMAT_IDS.includes(id)) {
    return {
      formatId: id,
      permissionId: FORMAT_PERMISSION_NAVARRO,
      institutionId: INSTITUTION_NAVARRO,
      institutional: true,
      branding: "navarro"
    };
  }
  if (HUGO_WILSON_FORMAT_IDS.includes(id)) {
    return {
      formatId: id,
      permissionId: FORMAT_PERMISSION_HUGO_WILSON,
      institutionId: "",
      institutional: true,
      branding: "hugo_wilson"
    };
  }
  return {
    formatId: id,
    permissionId: "",
    institutionId: "",
    institutional: false,
    branding: "cognicion"
  };
}

export function grupoFormatoInstitucional(valor = "", etiqueta = "") {
  const texto = normalizar(`${valor} ${etiqueta}`);
  if (HUGO_WILSON_FORMAT_IDS.includes(normalizar(valor)) || texto.includes("hugo wilson")) return FORMAT_PERMISSION_HUGO_WILSON;
  if (texto.includes("navarro")) return FORMAT_PERMISSION_NAVARRO;
  if (FRAY_FORMAT_IDS.includes(normalizar(valor)) || texto.includes("fray") || texto.includes("observacion")) return FORMAT_PERMISSION_FRAY;
  return "";
}

export function permisosFormatosDesdeUsuario(usuario = {}) {
  const permisos = {};
  const base = {
    ...(usuario.permisosFormatos || {}),
    ...(usuario.formatosAutorizados || {}),
    ...(usuario.formatPermissions && !Array.isArray(usuario.formatPermissions) ? usuario.formatPermissions : {})
  };

  Object.entries(base).forEach(([key, value]) => {
    permisos[normalizarPermisoFormato(key)] = value;
  });

  if (Array.isArray(usuario.formatPermissions)) {
    usuario.formatPermissions.forEach((item) => { permisos[normalizarPermisoFormato(item)] = true; });
  }

  return permisos;
}

export function usuarioTieneFormatoInstitucional(usuario = {}, permissionId = "") {
  const resolved = resolverFormatoClinico(permissionId);
  const formato = formatoInstitucionalPorPermiso(resolved.permissionId || permissionId);
  const idPermiso = formato?.id || resolved.permissionId || permissionId;
  if (!cuentaActiva(usuario) || !usuarioEsActorProfesionalFormato(usuario)) return false;
  if (esAdministradorFormato(usuario)) return true;
  if (!usuarioAutorizadoParaPaquetePrivado(usuario, formato)) return false;
  if (formato?.authorizedUserUid) {
    return permisoExplicitoVigente(usuario, resolved.formatId) || permisoExplicitoVigente(usuario, idPermiso);
  }
  if (permisoExplicitoVigente(usuario, resolved.formatId) || permisoExplicitoVigente(usuario, idPermiso)) return true;
  return membresiaInstitucionalActiva(usuario, formato?.institutionId || resolved.institutionId || "");
}

function permisoIncluyeAccion(valor, accion = "ver") {
  if (valor === true) return true;
  if (!valor || typeof valor !== "object") return false;
  if (valor[accion] === true) return true;
  if (valor.ver === true && accion === "ver") return true;
  return valor.todas === true || valor.all === true;
}

export function resolverPermisosEfectivosFormatos({ usuario = {}, claims = null, catalogoFormatos = FRAY_FORMAT_IDS } = {}) {
  const admin = esAdministradorFormato(usuario, claims);
  if (!cuentaActiva(usuario)) return { accesoGlobal: false, origen: "cuenta_inactiva", formatosPermitidos: [], accionesPermitidas: {}, cuentaActiva: false };
  if (admin) {
    return {
      accesoGlobal: true,
      origen: "rol_admin",
      formatosPermitidos: "*",
      accionesPermitidas: "*",
      cuentaActiva: true
    };
  }
  if (!usuarioEsActorProfesionalFormato(usuario)) return { accesoGlobal: false, origen: "rol_no_autorizado", formatosPermitidos: [], accionesPermitidas: {}, cuentaActiva: true };
  const permisos = permisosFormatosDesdeUsuario(usuario);
  const formatosPermitidos = [];
  const accionesPermitidas = {};
  catalogoFormatos.forEach((formatId) => {
    const resolved = resolverFormatoClinico(formatId);
    const formato = formatoInstitucionalPorPermiso(resolved.permissionId);
    if (!usuarioAutorizadoParaPaquetePrivado(usuario, formato)) return;
    const metadata = usuario.formatPermissionMetadata?.[resolved.permissionId] || usuario.metadataPermisosFormatos?.[resolved.permissionId] || null;
    const metadataEstado = normalizar(metadata?.status || metadata?.estado || "active");
    if (metadata && ["revoked", "revocado", "inactive", "inactivo"].includes(metadataEstado)) return;
    const valor = permisos[normalizarPermisoFormato(formatId)] ?? permisos[resolved.permissionId];
    const acciones = {};
    ACCIONES_FORMATO.forEach((accion) => { if (permisoIncluyeAccion(valor, accion)) acciones[accion] = true; });
    if (Object.keys(acciones).length || permisoIncluyeAccion(valor, "ver")) {
      formatosPermitidos.push(formatId);
      accionesPermitidas[formatId] = acciones;
    }
  });
  return { accesoGlobal: false, origen: formatosPermitidos.length ? "permisos_individuales" : "sin_acceso", formatosPermitidos, accionesPermitidas, cuentaActiva: true };
}

export function puedeAccederFormato({ usuario = {}, claims = null, formatoId = "", accion = "ver" } = {}) {
  const resultado = resolverPermisosEfectivosFormatos({ usuario, claims, catalogoFormatos: [formatoId] });
  if (!resultado.cuentaActiva) return false;
  if (resultado.accesoGlobal) {
    console.debug("[Autorizacion:Admin]", { uid: usuario.uid || usuario.id || null, rol: normalizarRol(usuario.rol || usuario.role || ""), formatoId, accion, origen: resultado.origen, resultado: "permitido" });
    return true;
  }
  const permitido = Boolean(resultado.accionesPermitidas?.[formatoId]?.[accion]);
  console.debug("[FormatosFray:Permisos]", { uid: usuario.uid || usuario.id || null, rol: normalizarRol(usuario.rol || usuario.role || ""), formatoId, accion, origen: resultado.origen, resultado: permitido ? "permitido" : "denegado" });
  return permitido;
}

export async function obtenerPermisosFormatosUsuario(uid, usuarioPrecargado = null) {
  if (usuarioPrecargado) return permisosFormatosDesdeUsuario(usuarioPrecargado);
  if (!uid) return {};

  const [{ db }, { doc, getDoc }] = await Promise.all([
    import("../firebase.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
  ]);
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return {};
  return permisosFormatosDesdeUsuario({
    id: snap.id,
    ...snap.data()
  });
}

export function usuarioPuedeUsarFormato(valor = "", permisos = {}, rol = "", usuario = null) {
  const resolved = resolverFormatoClinico(valor);
  if (!resolved.institutional) return true;
  if (usuario) return puedeAccederFormato({ usuario, formatoId: resolved.formatId, accion: "ver" });
  const rolNormalizado = normalizarRol(rol);
  if (["admin", "administrador", "superadmin", "admin_principal", "administrador_principal"].includes(rolNormalizado)) return true;
  if (formatoInstitucionalPorPermiso(resolved.permissionId)?.authorizedUserUid) return false;
  return permisoIncluyeAccion(permisos[resolved.formatId], "ver") || permisoIncluyeAccion(permisos[resolved.permissionId], "ver");
}

export function obtenerEntitlementsFormatos(usuario = {}) {
  const permisos = permisosFormatosDesdeUsuario(usuario);
  return {
    permisos,
    frayClinicalFormats: usuarioPuedeUsarFormato("evolucion_observacion", permisos, usuario.rol || "", usuario),
    navarroReferralFormat: usuarioPuedeUsarFormato("referencia_navarro", permisos, usuario.rol || "", usuario),
    hugoWilsonPrivateFormats: usuarioPuedeUsarFormato("hugo_wilson_consulta", permisos, usuario.rol || "", usuario),
    canUse(formatId = "") {
      return usuarioPuedeUsarFormato(formatId, permisos, usuario.rol || "", usuario);
    }
  };
}

export function aplicarPermisosFormatosSelect(select, permisos = {}, opciones = {}) {
  if (!select) return;

  const rol = opciones.rol || "";
  const usuario = opciones.usuario || null;
  const fallback = opciones.fallback || "nota_completa";
  const fallbackLabel = opciones.fallbackLabel || "Nota completa";
  const existeFallback = Array.from(select.options).some((option) => option.value === fallback);

  if (!existeFallback) {
    const option = document.createElement("option");
    option.value = fallback;
    option.textContent = fallbackLabel;
    select.prepend(option);
  }

  Array.from(select.options).forEach((option) => {
    const grupo = grupoFormatoInstitucional(option.value, option.textContent);
    const permitido = !grupo || usuarioPuedeUsarFormato(option.value, permisos, rol, usuario);
    option.hidden = !permitido;
    option.disabled = !permitido;
    option.dataset.formatoInstitucional = grupo;
  });

  if (!usuarioPuedeUsarFormato(select.value, permisos, rol, usuario)) {
    select.value = fallback;
  }
}

export function aplicarPermisosFormatosPagina(selectores = [], permisos = {}, opciones = {}) {
  selectores.forEach((config) => {
    const datos = Array.isArray(config)
      ? { selector: config[0], fallback: config[1], fallbackLabel: config[2] }
      : config;
    const select = typeof datos.selector === "string"
      ? document.querySelector(datos.selector)
      : datos.selector;

    aplicarPermisosFormatosSelect(select, permisos, {
      ...opciones,
      fallback: datos.fallback || opciones.fallback,
      fallbackLabel: datos.fallbackLabel || opciones.fallbackLabel
    });
  });
}
