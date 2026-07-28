function crearHitos(categoria, grupo, entradas) {
  return entradas.map(([id, nombre]) => ({ id, nombre, categoria, grupo, activo: true }));
}

export const CATEGORIAS_HITOS_DESARROLLO = Object.freeze([
  { id: "motor-grueso", nombre: "Motor grueso" },
  { id: "motor-fino", nombre: "Motor fino" },
  { id: "lenguaje", nombre: "Lenguaje" },
  { id: "social-adaptativo", nombre: "Social y adaptativo" },
  { id: "autonomia", nombre: "Autonomía" },
  { id: "escolar", nombre: "Escolar y adolescencia" }
]);

export const CATALOGO_HITOS_DESARROLLO = Object.freeze([
  ...crearHitos("motor-grueso", "Motor grueso", [["sostiene-cabeza", "Sostiene la cabeza"], ["se-sienta-con-apoyo", "Se sienta con apoyo"], ["se-sienta-solo", "Se sienta solo"], ["gatea", "Gatea"], ["se-pone-de-pie", "Se pone de pie"], ["camina-con-apoyo", "Camina con apoyo"], ["camina-solo", "Camina solo"], ["corre", "Corre"], ["sube-escaleras", "Sube escaleras"], ["salta", "Salta"]]),
  ...crearHitos("motor-fino", "Motor fino", [["sigue-objetos", "Sigue objetos con la mirada"], ["agarra-objetos", "Agarra objetos"], ["pasa-objetos-de-mano", "Pasa objetos de una mano a otra"], ["pinza-digital", "Realiza pinza digital"], ["garabatea", "Garabatea"], ["dibuja-formas", "Dibuja formas"], ["usa-tijeras", "Usa tijeras"]]),
  ...crearHitos("lenguaje", "Lenguaje", [["balbucea", "Balbucea"], ["primeras-palabras", "Dice primeras palabras"], ["frases-dos-palabras", "Forma frases de dos palabras"], ["frases-completas", "Usa frases completas"], ["comprende-ordenes", "Comprende órdenes"], ["nombra-colores", "Nombra colores"], ["lee", "Lee"]]),
  ...crearHitos("social-adaptativo", "Social y adaptativo", [["sonrisa-social", "Sonrisa social"], ["reconoce-cuidadores", "Reconoce a sus cuidadores"], ["juego-paralelo", "Juego paralelo"], ["juego-simbolico", "Juego simbólico"], ["interactua-pares", "Interactúa con pares"], ["regula-emociones", "Regula emociones"]]),
  ...crearHitos("autonomia", "Autonomía", [["come-con-ayuda", "Come con ayuda"], ["come-solo", "Come solo"], ["control-esfinteres", "Control de esfínteres"], ["se-viste-con-ayuda", "Se viste con ayuda"], ["se-viste-solo", "Se viste solo"], ["higiene-personal", "Realiza higiene personal"]]),
  ...crearHitos("escolar", "Escolar y adolescencia", [["ingreso-escolar", "Ingresa a la escuela"], ["aprende-a-escribir", "Aprende a escribir"], ["pubertad", "Inicio de pubertad"], ["menarca", "Menarca"], ["autonomia-adolescente", "Autonomía en adolescencia"]])
]);

export const HITOS_DESARROLLO_POR_ID = Object.freeze(Object.fromEntries(CATALOGO_HITOS_DESARROLLO.map((hito) => [hito.id, hito])));
export const CATEGORIAS_HITOS_POR_ID = Object.freeze(Object.fromEntries(CATEGORIAS_HITOS_DESARROLLO.map((categoria) => [categoria.id, categoria])));
