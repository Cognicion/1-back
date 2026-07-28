export const CATEGORIAS_IMAGEN = Object.freeze([
  { id: "rayos-x", nombre: "Rayos X" },
  { id: "tomografia", nombre: "Tomografía computarizada" },
  { id: "resonancia", nombre: "Resonancia magnética" },
  { id: "ultrasonido", nombre: "Ultrasonido" },
  { id: "mastografia", nombre: "Mastografía" },
  { id: "fluoroscopia", nombre: "Fluoroscopia" },
  { id: "otro", nombre: "Otro estudio de imagen" }
]);

export const CATALOGO_ESTUDIOS_IMAGEN = Object.freeze([
  { id: "rx-abdomen-pie-decubito", nombre: "Radiografía de abdomen de pie y decúbito", modalidad: "rayos-x", region: "abdomen", activo: true, sinonimos: ["rx abdomen"] },
  { id: "rx-torax", nombre: "Radiografía de tórax", modalidad: "rayos-x", region: "tórax", activo: true, sinonimos: ["placa de torax"] },
  { id: "rx-craneo", nombre: "Radiografía de cráneo", modalidad: "rayos-x", region: "cráneo", activo: true, sinonimos: [] },
  { id: "tc-craneo-simple", nombre: "Tomografía de cráneo simple", modalidad: "tomografia", region: "cráneo", activo: true, sinonimos: ["tac craneo simple"] },
  { id: "tc-craneo-contraste", nombre: "Tomografía de cráneo contrastada", modalidad: "tomografia", region: "cráneo", activo: true, sinonimos: ["tac craneo contrastada"] },
  { id: "tc-abdomen", nombre: "Tomografía de abdomen", modalidad: "tomografia", region: "abdomen", activo: true, sinonimos: ["tac abdomen"] },
  { id: "rm-cerebral", nombre: "Resonancia magnética cerebral", modalidad: "resonancia", region: "encéfalo", activo: true, sinonimos: ["rm cerebral"] },
  { id: "rm-columna", nombre: "Resonancia magnética de columna", modalidad: "resonancia", region: "columna", activo: true, sinonimos: [] },
  { id: "us-abdominal", nombre: "Ultrasonido abdominal", modalidad: "ultrasonido", region: "abdomen", activo: true, sinonimos: ["eco abdominal"] },
  { id: "us-pelvico", nombre: "Ultrasonido pélvico", modalidad: "ultrasonido", region: "pelvis", activo: true, sinonimos: [] },
  { id: "mastografia-bilateral", nombre: "Mastografía bilateral", modalidad: "mastografia", region: "mamas", activo: true, sinonimos: [] },
  { id: "fluoroscopia-digestiva", nombre: "Fluoroscopia digestiva", modalidad: "fluoroscopia", region: "abdomen", activo: true, sinonimos: [] },
  { id: "otro-estudio-imagen", nombre: "Otro estudio de imagen", modalidad: "otro", region: "", activo: true, sinonimos: [] }
]);

export const ESTUDIOS_IMAGEN_POR_ID = Object.freeze(Object.fromEntries(CATALOGO_ESTUDIOS_IMAGEN.map((estudio) => [estudio.id, estudio])));
export const MODALIDADES_IMAGEN_POR_ID = Object.freeze(Object.fromEntries(CATEGORIAS_IMAGEN.map((item) => [item.id, item])));
