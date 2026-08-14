/** Registro único de identidad visual por página autenticada. */
export const PAGE_HEADER_REGISTRY = Object.freeze({
  dashboard: { title: "Cognición", description: "Plataforma clínica integral.", featureCategories: ["general", "dashboard"] },
  medico: { title: "Panel Médico", description: "Base de operación clínica de COGNICIÓN.", featureCategories: ["clinica", "medico"] },
  paciente: { title: "Paciente", description: "Consulta y gestión integral del expediente clínico.", featureCategories: ["pacientes", "expediente", "notas", "cronologia", "permisos", "exportacion"] },
  pacientes: { title: "Pacientes", description: "Gestión y organización de pacientes.", featureCategories: ["clinica", "medico"] },
  nota: { title: "Nota clínica", description: "Documentación, evolución y seguimiento de la atención.", featureCategories: ["notas", "dictado", "diagnosticos", "tratamiento", "exportacion"] },
  historia: { title: "Historia clínica", description: "Antecedentes, evaluación y evolución integral del paciente.", featureCategories: ["historia", "antecedentes", "cronologia", "exportacion"] },
  diagnosticos: { title: "Diagnósticos", description: "Registro, clasificación y seguimiento diagnóstico.", featureCategories: ["diagnosticos", "cie10", "cie11", "dsm5", "biblioteca"] },
  tratamiento: { title: "Tratamiento", description: "Gestión farmacológica y seguimiento terapéutico.", featureCategories: ["medicamentos", "farmacologia", "interacciones", "adherencia", "historial"] },
  laboratorios: { title: "Laboratorios", description: "Resultados y seguimiento de estudios.", featureCategories: ["clinica"] },
  escalas: { title: "Escalas clínicas", description: "Aplicación y consulta de escalas clínicas.", featureCategories: ["clinica", "escalas"] },
  agenda: { title: "Agenda", description: "Organización de citas y actividades.", featureCategories: ["agenda"] },
  "mi-salud": { title: "Mi Salud", description: "Consulta personal de salud y seguimiento.", featureCategories: ["salud"] },
  biblioteca: { title: "Biblioteca", description: "Recursos de consulta para tu práctica.", featureCategories: ["biblioteca"] },
  estadistica: { title: "Estadística", description: "Indicadores y reportes de actividad.", featureCategories: ["reportes"] },
  rehabilitacion: { title: "Rehabilitación cognitiva", description: "Ejercicios y seguimiento cognitivo.", featureCategories: ["rehabilitacion"] },
  "rehabilitacion-cognitiva": { title: "Rehabilitación cognitiva", description: "Ejercicios y seguimiento cognitivo.", featureCategories: ["rehabilitacion"] },
  "rehabilitacion-evc": { title: "Rehabilitación post-EVC", description: "Evaluación funcional y planificación cognitiva personalizada.", featureCategories: ["rehabilitacion", "pacientes"] },
  sofia: { title: "SOFÍA", description: "Asistente para organizar conocimiento y documentación.", featureCategories: ["sofia"] },
  apuntes: { title: "Mis apuntes", description: "Notas personales, recordatorios y pendientes.", featureCategories: ["apuntes"] },
  configuracion: { title: "Configuración", description: "Preferencias, apariencia y cuenta.", featureCategories: ["configuracion"] },
  admin: { title: "Centro de Control", description: "Actividad, permisos y reportes de la plataforma.", featureCategories: ["admin"] },
  "laboratorio-farmacologia": { title: "Laboratorio de Farmacología", description: "Consulta de fármacos e interacciones.", featureCategories: ["farmacologia"] },
  "laboratorio-neurofisiologia": { title: "Laboratorio de Neurofisiología", description: "Exploración de sinapsis y modelos bioeléctricos.", featureCategories: ["neurofisiologia"] },
  "modelado-molecular": { title: "Modelado Molecular", description: "Exploración visual de estructuras moleculares.", featureCategories: ["molecular"] }
});

export const PUBLIC_PAGES = Object.freeze(new Set([
  "index", "login", "registro", "recuperar", "consentimiento", "privacidad", "terminos"
]));

export function pageIdFromLocation(location = window.location) {
  const filename = (location.pathname.split("/").pop() || "dashboard.html").toLowerCase().replace(/\.html?$/, "");
  return filename || "dashboard";
}

export function getPageHeader(pageId = pageIdFromLocation()) {
  return PAGE_HEADER_REGISTRY[pageId] || {
    title: document.title.replace(/\s*[|·-].*$/, "").trim() || "Cognición",
    description: "Plataforma clínica integral.",
    featureCategories: ["general"]
  };
}

export function isPublicPage(pageId = pageIdFromLocation()) {
  return PUBLIC_PAGES.has(pageId);
}
