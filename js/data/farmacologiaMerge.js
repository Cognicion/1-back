const FORMAS_FARMACEUTICAS = [
  "tabletas",
  "tableta",
  "comprimidos",
  "comprimido",
  "capsulas",
  "capsula",
  "solucion",
  "suspension",
  "inyectable",
  "ampolleta",
  "ampolletas",
  "gotas",
  "jarabe",
  "frasco ampula",
  "frasco",
  "ampula",
  "caps",
  "tabs",
  "oral",
  "intramuscular",
  "intravenosa",
  "intravenoso",
  "subcutanea",
  "subcutaneo",
  "im",
  "iv",
  "sc"
];

function normalizarBasico(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarPrincipioActivo(valor = "") {
  let texto = normalizarBasico(valor)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui|iu|unidades?)\s*(?:\/\s*\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui|iu|unidades?))?\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui|iu|unidades?)\b/g, " ");

  FORMAS_FARMACEUTICAS.forEach((forma) => {
    texto = texto.replace(new RegExp(`\\b${forma}\\b`, "g"), " ");
  });

  return texto
    .replace(/\bde\b|\bdel\b|\bla\b|\bel\b|\bpor\b|\bpara\b/g, " ")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugMedicamento(valor = "") {
  return normalizarBasico(valor)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textoPresentacion(presentacion) {
  if (typeof presentacion === "string") return presentacion;
  return presentacion?.texto || presentacion?.presentationDescription || "";
}

function normalizarPresentacionClave(presentacion = {}) {
  return [
    normalizarBasico(textoPresentacion(presentacion)),
    normalizarBasico(presentacion.via || presentacion.route || "")
  ].join("|");
}

function listaUnica(...listas) {
  return [...new Set(listsToFlat(listas).filter(Boolean))];
}

function listsToFlat(listas) {
  return listas.flatMap((lista) => Array.isArray(lista) ? lista : [lista]);
}

function elegirValor(...valores) {
  return valores.find((valor) => {
    if (Array.isArray(valor)) return valor.length;
    return valor !== undefined && valor !== null && String(valor).trim() !== "";
  });
}

function normalizarPresentaciones(medicamento = {}) {
  return (medicamento.presentaciones || medicamento.formulations || [])
    .map((presentacion) => {
      const texto = textoPresentacion(presentacion);
      if (!texto) return null;
      if (typeof presentacion === "string") return { texto, via: "oral", activo: true };
      return {
        ...presentacion,
        texto,
        via: presentacion.via || presentacion.route || "oral",
        activo: presentacion.activo !== false && presentacion.active !== false
      };
    })
    .filter(Boolean);
}

function normalizarMedicamentoBase(medicamento, origen = "catalogo") {
  const nombre = medicamento.nombre || medicamento.genericName || medicamento.nombreGenerico || medicamento.id || "";
  const id = medicamento.id || slugMedicamento(nombre);
  const presentaciones = normalizarPresentaciones(medicamento);
  return {
    ...medicamento,
    id,
    nombre,
    genericName: medicamento.genericName || medicamento.nombreGenerico || nombre,
    grupoFarmacologico: medicamento.grupoFarmacologico || medicamento.clase || medicamento.claseFarmacologica || medicamento.therapeuticClasses?.[0] || "Medicamento",
    clase: medicamento.clase || medicamento.claseFarmacologica || medicamento.grupoFarmacologico || medicamento.therapeuticClasses?.[0] || "Medicamento",
    therapeuticClasses: listaUnica(medicamento.therapeuticClasses, medicamento.grupoFarmacologico, medicamento.clase, medicamento.claseFarmacologica),
    especialidades: listaUnica(medicamento.especialidades, medicamento.specialties),
    specialties: listaUnica(medicamento.specialties, medicamento.especialidades),
    brandNames: listaUnica(medicamento.brandNames, medicamento.marcas, medicamento.nombresComerciales),
    synonyms: listaUnica(medicamento.synonyms, medicamento.sinonimos),
    presentaciones,
    formulations: medicamento.formulations || presentaciones.map((presentacion, index) => ({
      id: `${id}-p${index + 1}`,
      presentationDescription: presentacion.texto,
      route: presentacion.via || "oral",
      active: presentacion.activo !== false
    })),
    dosisHabitual: medicamento.dosisHabitual || medicamento.adultDosing?.[0]?.usualDose?.text || "",
    adultDosing: medicamento.adultDosing || (medicamento.dosisHabitual ? [{
      indicationId: "uso_habitual",
      population: "adult",
      usualDose: { text: medicamento.dosisHabitual },
      administrationNotes: []
    }] : []),
    pediatricDosing: medicamento.pediatricDosing || [],
    indications: listaUnica(medicamento.indications, medicamento.indicaciones),
    contraindications: listaUnica(medicamento.contraindications, medicamento.contraindicaciones, medicamento.contraindicacionesAbsolutas),
    precautions: listaUnica(medicamento.precautions, medicamento.precauciones, medicamento.warnings),
    warnings: listaUnica(medicamento.warnings, medicamento.precautions, medicamento.precauciones),
    monitoring: listaUnica(medicamento.monitoring, medicamento.monitorizacion, medicamento.vigilancia),
    interactions: listaUnica(medicamento.interactions, medicamento.interaccionesMedicamento),
    references: listaUnica(medicamento.references, medicamento.fuentes),
    active: medicamento.active !== false,
    origenesCatalogo: listaUnica(medicamento.origenesCatalogo, origen),
    origen
  };
}

function clavesMedicamento(medicamento = {}) {
  return listaUnica(
    medicamento.id,
    normalizarPrincipioActivo(medicamento.nombre),
    normalizarPrincipioActivo(medicamento.genericName),
    medicamento.synonyms?.map(normalizarPrincipioActivo),
    medicamento.brandNames?.map(normalizarPrincipioActivo)
  ).filter(Boolean);
}

function fusionarPresentaciones(idClinico, ...listas) {
  const indice = new Map();
  listsToFlat(listas).filter(Boolean).forEach((presentacion) => {
    const texto = textoPresentacion(presentacion);
    if (!texto) return;
    const normalizada = typeof presentacion === "string"
      ? { texto, via: "oral", activo: true }
      : { ...presentacion, texto, via: presentacion.via || presentacion.route || "oral", activo: presentacion.activo !== false && presentacion.active !== false };
    const clave = normalizarPresentacionClave(normalizada);
    if (!indice.has(clave)) indice.set(clave, normalizada);
  });

  const presentaciones = [...indice.values()];
  const formulations = presentaciones.map((presentacion, index) => ({
    id: `${idClinico}-p${index + 1}`,
    presentationDescription: presentacion.texto,
    route: presentacion.via || "oral",
    active: presentacion.activo !== false
  }));
  return { presentaciones, formulations };
}

function fusionarMedicamentos(existente, entrante) {
  const idClinico = existente.id || entrante.id;
  const { presentaciones, formulations } = fusionarPresentaciones(idClinico, existente.presentaciones, entrante.presentaciones);
  const clase = elegirValor(existente.clase, entrante.clase, existente.grupoFarmacologico, entrante.grupoFarmacologico, "Medicamento");
  const therapeuticClasses = listaUnica(existente.therapeuticClasses, entrante.therapeuticClasses, clase);

  return {
    ...entrante,
    ...existente,
    id: idClinico,
    nombre: elegirValor(existente.nombre, entrante.nombre),
    genericName: elegirValor(existente.genericName, entrante.genericName, existente.nombre, entrante.nombre),
    grupoFarmacologico: elegirValor(existente.grupoFarmacologico, entrante.grupoFarmacologico, clase),
    clase,
    therapeuticClasses,
    presentaciones,
    formulations,
    brandNames: listaUnica(existente.brandNames, entrante.brandNames),
    synonyms: listaUnica(existente.synonyms, entrante.synonyms),
    especialidades: listaUnica(existente.especialidades, entrante.especialidades),
    specialties: listaUnica(existente.specialties, entrante.specialties),
    indications: listaUnica(existente.indications, entrante.indications),
    contraindications: listaUnica(existente.contraindications, entrante.contraindications),
    precautions: listaUnica(existente.precautions, entrante.precautions),
    warnings: listaUnica(existente.warnings, entrante.warnings),
    monitoring: listaUnica(existente.monitoring, entrante.monitoring),
    interactions: listaUnica(existente.interactions, entrante.interactions),
    references: listaUnica(existente.references, entrante.references),
    origenesCatalogo: listaUnica(existente.origenesCatalogo, entrante.origenesCatalogo, existente.origen, entrante.origen),
    active: existente.active !== false || entrante.active !== false
  };
}

function crearMedicamentoDesdeFarmacologia(id, ficha = {}) {
  return normalizarMedicamentoBase({
    id,
    nombre: ficha.nombreGenerico || id,
    genericName: ficha.nombreGenerico || id,
    grupoFarmacologico: ficha.grupoFarmacologico || ficha.claseFarmacologica,
    clase: ficha.claseFarmacologica || ficha.grupoFarmacologico,
    therapeuticClasses: [ficha.claseFarmacologica, ficha.subclase].filter(Boolean),
    brandNames: ficha.nombresComerciales || [],
    synonyms: ficha.sinonimos || [],
    presentaciones: ficha.presentaciones || [],
    dosisHabitual: ficha.dosisHabitual,
    indications: ficha.indicaciones || [],
    contraindications: ficha.contraindicacionesAbsolutas || [],
    precautions: ficha.precauciones || [],
    monitoring: ficha.vigilancia || [],
    interactions: ficha.interaccionesMedicamento || [],
    references: ficha.fuentes || [],
    origen: "farmacologia_verificada"
  }, "farmacologia_verificada");
}

export function construirCatalogoFarmacologicoNormalizado({
  medicamentos = [],
  suplementarios = [],
  farmacologiaVerificada = {}
} = {}) {
  const indice = new Map();
  const alias = new Map();
  const conflictos = [];

  const agregar = (medicamento, origen) => {
    const normalizado = normalizarMedicamentoBase({ ...medicamento, origen }, origen);
    if (!normalizado.nombre || normalizado.active === false) return;
    const claves = clavesMedicamento(normalizado);
    const claveExistente = claves.map((clave) => alias.get(clave)).find(Boolean);
    const clavePrincipal = claveExistente || claves[0] || normalizado.id;

    if (!indice.has(clavePrincipal)) {
      indice.set(clavePrincipal, normalizado);
    } else {
      indice.set(clavePrincipal, fusionarMedicamentos(indice.get(clavePrincipal), normalizado));
    }

    claves.forEach((clave) => {
      const previa = alias.get(clave);
      if (previa && previa !== clavePrincipal) conflictos.push({ clave, previa, actual: clavePrincipal });
      alias.set(clave, clavePrincipal);
    });
  };

  medicamentos.forEach((medicamento) => agregar(medicamento, medicamento.origen || "catalogo_legacy"));
  suplementarios.forEach((medicamento) => agregar(medicamento, medicamento.origen || "catalogo_suplementario"));

  Object.entries(farmacologiaVerificada).forEach(([id, ficha]) => {
    const yaExiste = [...indice.values()].some((medicamento) => medicamento.id === id || clavesMedicamento(medicamento).includes(normalizarPrincipioActivo(ficha.nombreGenerico || id)));
    if (!yaExiste) agregar(crearMedicamentoDesdeFarmacologia(id, ficha), "farmacologia_verificada");
  });

  const medicamentosNormalizados = [...indice.values()]
    .map((medicamento) => {
      const idClinico = medicamento.id;
      const { presentaciones, formulations } = fusionarPresentaciones(idClinico, medicamento.presentaciones);
      return {
        ...medicamento,
        clinicalMedicationId: idClinico,
        principioActivoNormalizado: normalizarPrincipioActivo(medicamento.genericName || medicamento.nombre || idClinico),
        presentaciones,
        formulations
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    medicamentos: medicamentosNormalizados,
    conflictos,
    estadisticas: {
      registrosEntrada: medicamentos.length + suplementarios.length,
      medicamentosUnicos: medicamentosNormalizados.length,
      presentaciones: medicamentosNormalizados.reduce((total, medicamento) => total + (medicamento.presentaciones || []).length, 0),
      conflictos: conflictos.length
    }
  };
}

export function crearPresentacionesPlanas(medicamentos = []) {
  return medicamentos.flatMap((medicamento) => {
    const presentaciones = medicamento.presentaciones?.length
      ? medicamento.presentaciones
      : [{ texto: "presentacion no especificada", via: "" }];

    return presentaciones.map((presentacion, index) => ({
      ...medicamento,
      clinicalMedicationId: medicamento.id,
      selectedPresentationId: medicamento.formulations?.[index]?.id || `${medicamento.id}-p${index + 1}`,
      selectedPresentationText: presentacion.texto,
      presentationText: presentacion.texto,
      presentacion: presentacion.texto,
      via: presentacion.via || "",
      texto: `${medicamento.nombre}, ${presentacion.texto}.`
    }));
  });
}

export function agruparMedicamentosPorClase(medicamentos = []) {
  const grupos = new Map();
  medicamentos.forEach((medicamento) => {
    const clase = medicamento.grupoFarmacologico || medicamento.clase || medicamento.therapeuticClasses?.[0] || "Medicamento";
    if (!grupos.has(clase)) grupos.set(clase, []);
    grupos.get(clase).push(medicamento);
  });
  return [...grupos.entries()]
    .map(([grupo, items]) => ({ grupo, medicamentos: items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo, "es"));
}
