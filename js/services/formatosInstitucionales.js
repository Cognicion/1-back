export const FORMAT_PERMISSION_FRAY = "fray_clinical_formats";
export const FORMAT_PERMISSION_NAVARRO = "navarro_referral_format";

export const INSTITUTION_FRAY = "hpfba";
export const INSTITUTION_NAVARRO = "navarro";

export const FRAY_FORMAT_IDS = Object.freeze([
  "ingreso_observacion",
  "evolucion_observacion",
  "egreso_traslado_observacion",
  "urgencias",
  "contrarreferencia"
]);

export const NAVARRO_FORMAT_IDS = Object.freeze([
  "referencia_navarro"
]);

export const FORMATOS_INSTITUCIONALES = Object.freeze([
  {
    id: FORMAT_PERMISSION_FRAY,
    legacyId: "fray",
    nombre: "Formatos Fray",
    descripcion: "Ingreso, evolucion, egreso/traslado, urgencias y contrarreferencia institucional Fray.",
    institutionId: INSTITUTION_FRAY,
    requiereAutorizacion: true,
    valores: FRAY_FORMAT_IDS
  },
  {
    id: FORMAT_PERMISSION_NAVARRO,
    legacyId: "navarro",
    nombre: "Referencia Navarro",
    descripcion: "Referencia tipo Navarro con permiso institucional independiente.",
    institutionId: INSTITUTION_NAVARRO,
    requiereAutorizacion: true,
    valores: NAVARRO_FORMAT_IDS
  }
]);

const LEGACY_PERMISSION_ALIASES = Object.freeze({
  fray: FORMAT_PERMISSION_FRAY,
  fray_observacion: FORMAT_PERMISSION_FRAY,
  fray_observacion_ingreso: FORMAT_PERMISSION_FRAY,
  fray_observacion_evolucion: FORMAT_PERMISSION_FRAY,
  fray_observacion_envio_piso: FORMAT_PERMISSION_FRAY,
  referencia_navarro: FORMAT_PERMISSION_NAVARRO,
  navarro: FORMAT_PERMISSION_NAVARRO
});

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

  if (usuario.rol === "admin") {
    permisos[FORMAT_PERMISSION_FRAY] = true;
    permisos[FORMAT_PERMISSION_NAVARRO] = true;
    permisos.todos = true;
  }

  return permisos;
}

export function usuarioTieneFormatoInstitucional(usuario = {}, permissionId = "") {
  if (usuario.rol === "admin") return true;
  const formato = FORMATOS_INSTITUCIONALES.find((item) => item.id === permissionId || item.legacyId === permissionId);
  const idPermiso = formato?.id || permissionId;
  if (!permisoExplicitoVigente(usuario, idPermiso)) return false;
  return membresiaInstitucionalActiva(usuario, formato?.institutionId || "");
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
  if (rol === "admin" || permisos.todos === true) return true;
  if (usuario) return usuarioTieneFormatoInstitucional(usuario, resolved.permissionId);
  return permisos[resolved.permissionId] === true;
}

export function obtenerEntitlementsFormatos(usuario = {}) {
  const permisos = permisosFormatosDesdeUsuario(usuario);
  return {
    permisos,
    frayClinicalFormats: usuarioPuedeUsarFormato("evolucion_observacion", permisos, usuario.rol || "", usuario),
    navarroReferralFormat: usuarioPuedeUsarFormato("referencia_navarro", permisos, usuario.rol || "", usuario),
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
