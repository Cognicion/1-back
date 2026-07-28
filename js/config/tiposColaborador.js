export const TIPOS_COLABORADOR = Object.freeze({
  ninguno: Object.freeze({
    value: null,
    label: "No es colaborador",
    titulo: "",
    icono: "",
    mostrarContactos: false
  }),
  colaborador: Object.freeze({
    value: "colaborador",
    label: "Colaborador",
    titulo: "COLABORADOR DE COGNICIÓN",
    icono: "🤝",
    clase: "reconocimiento-colaborador",
    mostrarContactos: false,
    mensaje: "Gracias por participar en el desarrollo y mejora de COGNICIÓN Labs. Tus observaciones contribuyen a construir una plataforma clínica más útil."
  }),
  destacado: Object.freeze({
    value: "destacado",
    label: "Colaborador destacado",
    titulo: "COLABORADOR DESTACADO",
    icono: "🏅",
    clase: "reconocimiento-destacado",
    mostrarContactos: false,
    mensaje: "Tu participación y retroalimentación han contribuido de manera importante al desarrollo de COGNICIÓN Labs. Gracias por ayudarnos a mejorar la plataforma."
  }),
  estrella: Object.freeze({
    value: "estrella",
    label: "Colaborador estrella",
    titulo: "COLABORADOR ESTRELLA",
    icono: "⭐",
    clase: "reconocimiento-estrella",
    mostrarContactos: true,
    mensaje: "Tu retroalimentación ha dejado huella en COGNICIÓN. Gracias por formar parte activa del desarrollo de COGNICIÓN Labs y ayudarnos a construir una mejor herramienta para la práctica clínica. Como colaborador estrella cuentas con canales directos para dudas, sugerencias y reporte de errores."
  })
});

export const TIPOS_COLABORADOR_POR_VALOR = Object.freeze(
  Object.fromEntries(Object.values(TIPOS_COLABORADOR).filter((tipo) => tipo.value).map((tipo) => [tipo.value, tipo]))
);

export function obtenerTipoColaborador(valor) {
  return TIPOS_COLABORADOR_POR_VALOR[valor] || TIPOS_COLABORADOR.ninguno;
}

export function reconocimientoColaboradorActivo(colaborador) {
  return colaborador?.activo === true && Boolean(obtenerTipoColaborador(colaborador?.tipo).value);
}
