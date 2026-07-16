export const DATO_NO_ENCONTRADO = "dato no encontrado en fuente local";
export const FUENTE_PENDIENTE = "fuente pendiente";

export const FUENTE_STAHL = Object.freeze({
  id: "stahl_prescribers_guide_6e_2017",
  titulo: "Stahl's Essential Psychopharmacology: Prescriber's Guide, 6th ed.",
  autores: "Stephen M. Stahl",
  editorial: "Cambridge University Press",
  anio: 2017,
  rutaLocal: "fuentes_farmacologicas/stahl_prescribers_guide.pdf",
  tipo: "guía de prescripción / fuente secundaria especializada",
  confiabilidad: "alta para transcripción de la monografía local; requiere contraste con etiquetado vigente para decisiones clínicas"
});

const camposMinimos = [
  "id", "nombreGenerico", "claseFarmacologica", "subclase", "indicaciones",
  "dosisHabitual", "rangoDosis", "vidaMedia", "tiempoConcentracionMaxima",
  "duracionEfecto", "viaEliminacion", "metabolismo", "cyp", "metabolitosActivos",
  "contraindicacionesAbsolutas", "contraindicacionesRelativas", "precauciones",
  "embarazoLactancia", "advertenciasGeriatricas", "advertenciasPediatricas",
  "interaccionesMedicamento", "interaccionesDiagnostico", "efectosAdversos",
  "vigilancia", "laboratorios", "fuentes"
];

const registro = (datos) => ({
  esquema: "cognicion.farmacologia.v1",
  nombresComerciales: [],
  sinonimos: [],
  indicaciones: [],
  contraindicacionesAbsolutas: [],
  contraindicacionesRelativas: [],
  precauciones: [],
  cyp: [],
  metabolitosActivos: [],
  interaccionesMedicamento: [],
  interaccionesDiagnostico: [],
  efectosAdversos: [],
  vigilancia: [],
  laboratorios: [],
  fuentes: [],
  ...datos,
  estadoFuente: "verificada_local",
  fechaRevision: "2026-07-15"
});

export const FARMACOLOGIA_VERIFICADA = Object.freeze({
  olanzapina: registro({
    id: "olanzapina",
    nombreGenerico: "Olanzapina",
    nombresComerciales: ["Zyprexa"],
    claseFarmacologica: "Antipsicótico de segunda generación",
    subclase: "Antipsicótico atípico con antagonismo dopaminérgico y serotoninérgico",
    mecanismoAccion: "Antagonismo D2 y 5-HT2A, con actividad adicional sobre receptores histaminérgicos, muscarínicos y alfa-adrenérgicos",
    indicaciones: ["Esquizofrenia", "Episodios maníacos o mixtos del trastorno bipolar", "Mantenimiento del trastorno bipolar", "Depresión bipolar en combinación con fluoxetina"],
    dosisHabitual: "5-20 mg/día por vía oral",
    rangoDosis: "Inicio habitual 5-10 mg/día; máximo aprobado indicado por Stahl: 20 mg/día",
    vidaMedia: "21-54 horas (fármaco original)",
    tiempoConcentracionMaxima: DATO_NO_ENCONTRADO,
    duracionEfecto: "La monografía diferencia formulación oral, intramuscular y depot; no proporciona una duración clínica única aplicable a todas las formulaciones",
    viaEliminacion: DATO_NO_ENCONTRADO,
    metabolismo: "Metabolismo hepático; sustrato de CYP1A2 y CYP2D6. Los metabolitos descritos son inactivos",
    cyp: ["CYP1A2: sustrato", "CYP2D6: sustrato"],
    metabolitosActivos: ["No: Stahl describe metabolitos inactivos"],
    contraindicacionesAbsolutas: ["Alergia comprobada a olanzapina"],
    contraindicacionesRelativas: [],
    precauciones: ["Riesgo metabólico: aumento de peso, glucosa y lípidos", "Hipotensión/ortostatismo y potenciación de antihipertensivos", "Sedación", "Demencia en personas mayores", "Riesgo de síntomas extrapiramidales, aunque menor que con algunos antipsicóticos"],
    embarazoLactancia: ["Embarazo: valorar beneficio materno frente a riesgo fetal; vigilar síntomas extrapiramidales o de retirada neonatal tras exposición en tercer trimestre", "Lactancia: Stahl recomienda suspender el fármaco o usar alimentación con fórmula"],
    advertenciasGeriatricas: ["En psicosis asociada a demencia existe aumento de mortalidad y eventos cerebrovasculares; no es una indicación aprobada"],
    advertenciasPediatricas: ["Usar dosis del extremo inferior y vigilancia metabólica más estrecha"],
    interaccionesMedicamento: ["Puede potenciar el efecto de antihipertensivos", "Puede antagonizar levodopa y agonistas dopaminérgicos", "Fluvoxamina (inhibidor CYP1A2) puede elevar exposición", "Tabaco y carbamazepina (inductores CYP1A2) pueden reducir exposición"],
    interaccionesDiagnostico: ["Obesidad, diabetes, dislipidemia o riesgo cardiovascular aumentan la relevancia del riesgo metabólico", "Condiciones que predisponen a hipotensión requieren vigilancia"],
    efectosAdversos: ["Aumento de peso", "Alteraciones de glucosa y lípidos", "Sedación", "Hipotensión ortostática", "Efectos anticolinérgicos", "Síntomas extrapiramidales"],
    vigilancia: ["Peso/IMC y cintura", "Presión arterial y ortostatismo", "Glucosa o HbA1c", "Perfil de lípidos", "EPS/acatisia", "ECG/QTc si existen factores de riesgo"],
    laboratorios: ["Glucosa o HbA1c", "Perfil de lípidos"],
    fuentes: [{ ...FUENTE_STAHL, paginasPdf: [545, 546, 547, 548, 549, 550, 551, 552, 553], paginasImpresas: "527-535", secciones: ["Therapeutics", "Side Effects", "Dosing and Use", "Pharmacokinetics", "Drug Interactions", "Special Populations"] }],
    confianza: "alta para los campos transcritos; dato ausente se marca explícitamente"
  }),
  risperidona: registro({
    id: "risperidona",
    nombreGenerico: "Risperidona",
    nombresComerciales: ["Risperdal"],
    claseFarmacologica: "Antipsicótico de segunda generación",
    subclase: "Antipsicótico atípico con antagonismo D2/5-HT2A",
    mecanismoAccion: "Antagonismo D2 y 5-HT2A, con actividad alfa-adrenérgica relacionada con hipotensión/ortostatismo",
    indicaciones: ["Esquizofrenia", "Manía o episodios mixtos del trastorno bipolar", "Irritabilidad asociada a autismo", "Mantenimiento con formulación de acción prolongada según indicación"],
    dosisHabitual: "2-6 mg/día por vía oral en muchos adultos",
    rangoDosis: "2-8 mg/día oral para psicosis aguda o trastorno bipolar; 0.5-2 mg/día en infancia o personas mayores; depot 12.5-50 mg cada 2 semanas",
    vidaMedia: "20-24 horas para la formulación oral según Stahl; 3-6 días para risperidona de acción prolongada",
    tiempoConcentracionMaxima: "Depot en microesferas: 21 días; dato oral no encontrado en fuente local",
    duracionEfecto: "La fase de eliminación de la formulación de acción prolongada es aproximadamente 7-8 semanas después de la última inyección",
    viaEliminacion: DATO_NO_ENCONTRADO,
    metabolismo: "Metabolizada por CYP2D6; la monografía describe metabolitos activos",
    cyp: ["CYP2D6: sustrato"],
    metabolitosActivos: ["9-hidroxirisperidona (paliperidona), metabolito activo"],
    contraindicacionesAbsolutas: ["Alergia comprobada a risperidona o paliperidona"],
    contraindicacionesRelativas: [],
    precauciones: ["Condiciones que predisponen a hipotensión", "Riesgo de aspiración/disfagia", "Priapismo", "EPS dependientes de dosis", "Hiperprolactinemia", "Riesgo metabólico", "Demencia y enfermedad de Parkinson o cuerpos de Lewy"],
    embarazoLactancia: ["Embarazo: valorar beneficio-riesgo; vigilar síntomas extrapiramidales o de retirada neonatal tras exposición en tercer trimestre", "Lactancia: aparece en leche materna; Stahl recomienda suspender el fármaco o usar fórmula"],
    advertenciasGeriatricas: ["En demencia aumenta mortalidad y eventos cerebrovasculares; cautela adicional en fibrilación auricular"],
    advertenciasPediatricas: ["Aprobaciones por edad dependen de indicación; vigilar con mayor frecuencia y usar dosis bajas"],
    interaccionesMedicamento: ["Puede potenciar antihipertensivos", "Puede antagonizar levodopa y agonistas dopaminérgicos", "Carbamazepina puede disminuir concentraciones", "Fluoxetina y paroxetina pueden aumentar concentraciones por inhibición CYP2D6"],
    interaccionesDiagnostico: ["Hipotensión, deshidratación o sobrecalentamiento aumentan riesgo ortostático", "Parkinson o demencia con cuerpos de Lewy aumentan la relevancia de efectos motores", "Riesgo cardiovascular requiere valorar ortostatismo y QTc según factores coexistentes"],
    efectosAdversos: ["Hiperprolactinemia", "Síntomas extrapiramidales", "Sedación", "Aumento de peso", "Hipotensión ortostática", "QT prolongado en contexto susceptible"],
    vigilancia: ["Presión arterial y ortostatismo", "Prolactina si síntomas", "EPS/acatisia", "Peso/IMC", "Glucosa o HbA1c", "Lípidos", "ECG/QTc si existen factores de riesgo"],
    laboratorios: ["Prolactina si está indicada", "Glucosa o HbA1c", "Perfil de lípidos"],
    fuentes: [{ ...FUENTE_STAHL, paginasPdf: [664, 665, 666, 667, 668, 669, 670, 671, 672], paginasImpresas: "646-654", secciones: ["Therapeutics", "Side Effects", "Dosing and Use", "Pharmacokinetics", "Drug Interactions", "Special Populations", "Microspheres"] }],
    confianza: "alta para los campos transcritos; la vida media se presenta exactamente como la reporta esta edición"
  }),
  metilfenidato: registro({
    id: "metilfenidato",
    nombreGenerico: "Metilfenidato",
    nombresComerciales: ["Ritalin", "Concerta"],
    claseFarmacologica: "Estimulante del sistema nervioso central",
    subclase: "Inhibidor de la recaptura de dopamina y noradrenalina",
    mecanismoAccion: "Inhibe transportadores de dopamina y noradrenalina, aumentando señal catecolaminérgica central",
    indicaciones: ["Trastorno por déficit de atención e hiperactividad", "Narcolepsia"],
    dosisHabitual: "Individualizar por formulación y respuesta; las formulaciones no son intercambiables miligramo por miligramo sin revisar ficha",
    rangoDosis: "Depende de formulación inmediata, prolongada o transdérmica; consultar la sección de dosificación específica de la monografía",
    vidaMedia: "Adultos: promedio 3.5 horas (rango 1.3-7.7); niños: promedio 2.5 horas (rango 1.5-5)",
    tiempoConcentracionMaxima: DATO_NO_ENCONTRADO,
    duracionEfecto: "Depende de la formulación inmediata, prolongada o transdérmica; no debe inferirse a partir de una sola vida media",
    viaEliminacion: DATO_NO_ENCONTRADO,
    metabolismo: "La monografía señala diferencias de primer paso entre vía oral y transdérmica; no identifica una enzima CYP responsable en la sección revisada",
    cyp: ["dato no encontrado en fuente local para función como sustrato, inhibidor o inductor CYP"],
    metabolitosActivos: [DATO_NO_ENCONTRADO],
    contraindicacionesAbsolutas: ["Uso con IMAO o dentro de los 14 días posteriores", "Glaucoma", "Anomalías cardiacas estructurales", "Angioedema o anafilaxia relacionados", "Alergia comprobada a metilfenidato"],
    contraindicacionesRelativas: ["Tics motores o síndrome de Tourette: la monografía reserva excepciones para manejo experto"],
    precauciones: ["Cualquier grado de hipertensión", "Hipertiroidismo", "Antecedente de uso problemático de sustancias", "Psicosis", "Riesgo de tolerancia, dependencia y desvío", "Posible supresión del crecimiento"],
    embarazoLactancia: [DATO_NO_ENCONTRADO],
    advertenciasGeriatricas: [DATO_NO_ENCONTRADO],
    advertenciasPediatricas: ["Vigilar talla, peso, presión arterial y necesidad continuada del tratamiento"],
    interaccionesMedicamento: ["Usar con cautela con antihipertensivos", "Puede inhibir el metabolismo de ISRS, algunos anticonvulsivos, tricíclicos y anticoagulantes cumarínicos", "No se aconseja combinar con IMAO", "La acción cardiovascular y del SNC puede sumarse con fármacos noradrenérgicos como atomoxetina"],
    interaccionesDiagnostico: ["Hipertensión, taquiarritmias o cardiopatía aumentan el riesgo clínico", "Psicosis puede empeorar", "Antecedente de consumo de sustancias aumenta riesgo de uso no terapéutico"],
    efectosAdversos: ["Aumento de presión arterial y frecuencia cardiaca", "Insomnio", "Disminución del apetito", "Pérdida de peso", "Ansiedad o agitación", "Tics", "Riesgo de abuso y dependencia"],
    vigilancia: ["Presión arterial", "Frecuencia cardiaca", "Peso y talla", "Apetito", "Sueño", "Síntomas psicóticos o afectivos", "Uso seguro y desvío"],
    laboratorios: ["Stahl considera prudente vigilar periódicamente biometría hemática, plaquetas y función hepática durante uso prolongado"],
    fuentes: [{ ...FUENTE_STAHL, paginasPdf: [471, 472, 473, 474, 475, 476, 477, 478, 479], paginasImpresas: "453-461", secciones: ["Therapeutics", "Side Effects", "Dosing and Use", "Pharmacokinetics", "Drug Interactions", "Special Populations"] }],
    confianza: "alta para los campos transcritos; la variación por formulación permanece explícita"
  }),
  atomoxetina: registro({
    id: "atomoxetina",
    nombreGenerico: "Atomoxetina",
    nombresComerciales: ["Strattera"],
    claseFarmacologica: "Fármaco no estimulante para TDAH",
    subclase: "Inhibidor selectivo de la recaptura de noradrenalina",
    mecanismoAccion: "Inhibición selectiva del transportador de noradrenalina; aumenta noradrenalina y dopamina en corteza prefrontal",
    indicaciones: ["Trastorno por déficit de atención e hiperactividad en mayores de 6 años y adultos"],
    dosisHabitual: "Adultos y pacientes >70 kg: iniciar 40 mg/día y aumentar a 80 mg/día; máximo 100 mg/día",
    rangoDosis: "Niños hasta 70 kg: 0.5-1.2 mg/kg/día; máximo 1.4 mg/kg/día o 100 mg/día, lo que sea menor. Adultos: 40-100 mg/día",
    vidaMedia: "Aproximadamente 5 horas",
    tiempoConcentracionMaxima: DATO_NO_ENCONTRADO,
    duracionEfecto: "El efecto terapéutico puede persistir más allá de la vida media; la monografía permite dosificación una vez al día",
    viaEliminacion: DATO_NO_ENCONTRADO,
    metabolismo: "Metabolizada por CYP2D6; metabolizadores lentos pueden tener mayor exposición y requieren titulación prudente",
    cyp: ["CYP2D6: sustrato"],
    metabolitosActivos: [DATO_NO_ENCONTRADO],
    contraindicacionesAbsolutas: ["Uso actual de IMAO", "Feocromocitoma o antecedente de feocromocitoma", "Trastorno cardiovascular grave que pueda deteriorarse con incrementos de presión arterial o frecuencia cardiaca", "Glaucoma de ángulo cerrado", "Alergia comprobada a atomoxetina"],
    contraindicacionesRelativas: [],
    precauciones: ["Hipertensión, taquicardia, enfermedad cardiovascular o cerebrovascular", "Trastorno bipolar", "Retención urinaria o hiperplasia prostática", "Hepatotoxicidad rara", "Ideación suicida o activación en menores"],
    embarazoLactancia: ["Embarazo: no hay estudios controlados; valorar beneficio-riesgo y generalmente suspender antes de embarazo previsto", "Lactancia: secreción desconocida; Stahl recomienda suspender el fármaco o usar fórmula"],
    advertenciasGeriatricas: ["Algunas personas mayores toleran mejor dosis menores"],
    advertenciasPediatricas: ["Aprobada a partir de 6 años; vigilar talla, peso, ideación suicida y activación"],
    interaccionesMedicamento: ["Inhibidores CYP2D6 como paroxetina o fluoxetina pueden elevar concentraciones", "Albuterol oral o IV puede aumentar presión arterial y frecuencia cardiaca", "Usar con cautela con antihipertensivos", "La coadministración con metilfenidato no aumentó efectos cardiovasculares más allá de los observados con metilfenidato solo en la evidencia resumida por Stahl"],
    interaccionesDiagnostico: ["Hipertensión o riesgo cardiovascular requiere presión arterial y frecuencia cardiaca basal y periódica", "Enfermedad hepática requiere ajuste según gravedad", "Bipolaridad puede desestabilizarse"],
    efectosAdversos: ["Aumento de frecuencia cardiaca", "Aumento de presión arterial", "Hipotensión ortostática", "Sedación o fatiga", "Disminución del apetito", "Insomnio", "Síntomas gastrointestinales", "Hepatotoxicidad rara"],
    vigilancia: ["Presión arterial", "Frecuencia cardiaca", "Talla y peso", "Ánimo e ideación suicida", "Síntomas hepáticos", "Retención urinaria"],
    laboratorios: ["Pruebas de función hepática si aparecen ictericia u otros datos de lesión hepática"],
    fuentes: [{ ...FUENTE_STAHL, paginasPdf: [95, 96, 97, 98, 99], paginasImpresas: "77-81", secciones: ["Therapeutics", "Side Effects", "Dosing and Use", "Pharmacokinetics", "Drug Interactions", "Special Populations"] }],
    confianza: "alta para los campos transcritos; dato ausente se marca explícitamente"
  })
});

function textoNormalizado(valor = "") {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function esValorGenerico(valor = "") {
  return /variable|revisar (la )?molecula|consultar ficha|segun molecula/i.test(textoNormalizado(valor));
}

function listaUnica(...listas) {
  return [...new Set(listas.flat().filter(Boolean))];
}

export function enriquecerFarmacologiaUnificada(medicamento = {}) {
  const id = textoNormalizado(medicamento.id || medicamento.nombre).replace(/[^a-z0-9]+/g, "-");
  const verificada = FARMACOLOGIA_VERIFICADA[id];
  if (!verificada) {
    const vidaMedia = medicamento.vidaMedia && !esValorGenerico(medicamento.vidaMedia)
      ? medicamento.vidaMedia
      : FUENTE_PENDIENTE;
    return {
      ...medicamento,
      vidaMedia,
      halfLife: vidaMedia,
      estadoFuente: "fuente_pendiente",
      fuente: FUENTE_PENDIENTE,
      fuentes: [],
      paginaSeccion: FUENTE_PENDIENTE,
      confianza: "no evaluada",
      farmacologia: {
        esquema: "cognicion.farmacologia.v1",
        id: medicamento.id || id,
        nombreGenerico: medicamento.genericName || medicamento.nombre || "",
        estadoFuente: "fuente_pendiente",
        fuente: FUENTE_PENDIENTE
      }
    };
  }

  return {
    ...medicamento,
    nombre: verificada.nombreGenerico,
    genericName: verificada.nombreGenerico,
    brandNames: listaUnica(medicamento.brandNames || [], verificada.nombresComerciales),
    synonyms: listaUnica(medicamento.synonyms || [], verificada.sinonimos),
    clase: verificada.claseFarmacologica,
    therapeuticClasses: listaUnica([verificada.claseFarmacologica, verificada.subclase]),
    dosisHabitual: verificada.dosisHabitual,
    rangoDosis: verificada.rangoDosis,
    mecanismoAccion: verificada.mecanismoAccion,
    vidaMedia: verificada.vidaMedia,
    halfLife: verificada.vidaMedia,
    tiempoConcentracionMaxima: verificada.tiempoConcentracionMaxima,
    duracionAccion: verificada.duracionEfecto,
    metabolismo: verificada.metabolismo,
    eliminacion: verificada.viaEliminacion,
    cyp: verificada.cyp,
    metabolitosActivos: verificada.metabolitosActivos,
    indications: verificada.indicaciones,
    indicaciones: verificada.indicaciones,
    contraindications: verificada.contraindicacionesAbsolutas,
    contraindicaciones: verificada.contraindicacionesAbsolutas,
    contraindicacionesRelativas: verificada.contraindicacionesRelativas,
    precautions: verificada.precauciones,
    precauciones: verificada.precauciones,
    warnings: listaUnica(verificada.precauciones, verificada.embarazoLactancia, verificada.advertenciasGeriatricas, verificada.advertenciasPediatricas),
    embarazoLactancia: verificada.embarazoLactancia,
    advertenciasGeriatricas: verificada.advertenciasGeriatricas,
    advertenciasPediatricas: verificada.advertenciasPediatricas,
    interactions: verificada.interaccionesMedicamento,
    interaccionesDiagnostico: verificada.interaccionesDiagnostico,
    adverseEffects: verificada.efectosAdversos,
    efectosAdversos: verificada.efectosAdversos,
    monitoring: verificada.vigilancia,
    monitorizacion: verificada.vigilancia,
    parametrosLaboratorio: verificada.laboratorios,
    references: verificada.fuentes,
    fuentes: verificada.fuentes,
    fuente: FUENTE_STAHL.titulo,
    paginaSeccion: verificada.fuentes.map((item) => `PDF ${item.paginasPdf.join(", ")} / impresa ${item.paginasImpresas}: ${item.secciones.join(", ")}`).join("; "),
    estadoFuente: verificada.estadoFuente,
    confianza: verificada.confianza,
    farmacologia: verificada
  };
}

export function construirCapaFarmacologicaUnificada(medicamentos = []) {
  return medicamentos.map(enriquecerFarmacologiaUnificada);
}

export function resumirCoberturaFarmacologica(medicamentos = []) {
  const total = medicamentos.length;
  const verificados = medicamentos.filter((med) => med.estadoFuente === "verificada_local");
  const pendientes = medicamentos.filter((med) => med.estadoFuente !== "verificada_local");
  const completos = verificados.filter((med) => {
    const ficha = med.farmacologia || {};
    return camposMinimos.every((campo) => {
      const valor = ficha[campo];
      const lista = Array.isArray(valor) ? valor : [valor];
      return lista.length && lista.every((item) => item && ![DATO_NO_ENCONTRADO, FUENTE_PENDIENTE].includes(item));
    });
  });
  return {
    totalNormalizados: total,
    conFuenteVerificada: verificados.length,
    datosCompletos: completos.length,
    fuentePendiente: pendientes.length,
    idsVerificados: verificados.map((med) => med.id)
  };
}
