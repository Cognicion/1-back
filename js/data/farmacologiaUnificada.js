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
  grupoFarmacologico: datos.claseFarmacologica || "",
  principioActivoNormalizado: datos.id || "",
  nombresComerciales: [],
  sinonimos: [],
  presentaciones: [],
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

function fuenteDailyMed(id, secciones = [], nota = "Etiqueta oficial consultada para datos de farmacologia, seguridad y dosificacion.") {
  const query = encodeURIComponent(id.replace(/_/g, " "));
  return {
    id: `dailymed_${id}`,
    titulo: "DailyMed / U.S. National Library of Medicine",
    url: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${query}`,
    fechaConsulta: "2026-07-15",
    secciones,
    nota,
    tipo: "etiquetado oficial FDA/SPL",
    confiabilidad: "alta; confirmar producto y presentacion comercial especificos antes de prescribir"
  };
}

function presentacion(forma, concentracion, unidad = "", via = "oral", marca = "", comercial = false) {
  return { formaFarmaceutica: forma, concentracion, unidad, via, marca, fuente: "DailyMed", comercial };
}

function prioritario(datos) {
  const fuente = fuenteDailyMed(datos.id, ["Indications and Usage", "Dosage and Administration", "Contraindications", "Warnings and Precautions", "Drug Interactions", "Clinical Pharmacology"], datos.notaFuente);
  return registro({
    mecanismoAccion: datos.mecanismoAccion || "Ver etiqueta/ficha tecnica especifica.",
    dosisGeriatria: datos.dosisGeriatria || "Iniciar en el extremo bajo del rango cuando aplique; individualizar por fragilidad, funcion renal/hepatica e interacciones.",
    dosisPediatrica: datos.dosisPediatrica || DATO_NO_ENCONTRADO,
    ajusteRenal: datos.ajusteRenal || "Revisar funcion renal y ficha especifica antes de ajustar.",
    ajusteHepatico: datos.ajusteHepatico || "Revisar funcion hepatica y ficha especifica antes de ajustar.",
    tiempoConcentracionMaxima: datos.tmax || datos.tiempoConcentracionMaxima || DATO_NO_ENCONTRADO,
    duracionEfecto: datos.duracionEfecto || DATO_NO_ENCONTRADO,
    viaEliminacion: datos.viaEliminacion || datos.eliminacion || DATO_NO_ENCONTRADO,
    embarazoLactancia: datos.embarazoLactancia || ["Embarazo/lactancia: verificar etiqueta vigente y balance beneficio-riesgo."],
    advertenciasGeriatricas: datos.advertenciasGeriatricas || ["Adulto mayor: iniciar bajo, titular lento y vigilar caidas, funcion renal/hepatica, electrolitos o sangrado segun farmaco."],
    advertenciasPediatricas: datos.advertenciasPediatricas || [],
    confianza: datos.confianza || "moderada-alta para seed oficial; requiere revision por producto/pais antes de uso clinico",
    fuentes: [fuente],
    ...datos,
    fuentePrincipal: "DailyMed"
  });
}

const FARMACOLOGIA_STAHL = {
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
};

const FARMACOLOGIA_PRIORITARIA = Object.freeze(Object.fromEntries([
  prioritario({ id: "losartan", nombreGenerico: "Losartan", grupoFarmacologico: "ARA-II", claseFarmacologica: "ARA-II", subclase: "Antagonista del receptor de angiotensina II", nombresComerciales: ["Cozaar"], sinonimos: ["losartan", "losartan potasico", "losartan potassium"], presentaciones: [presentacion("tableta", "25", "mg"), presentacion("tableta", "50", "mg"), presentacion("tableta", "100", "mg")], mecanismoAccion: "Bloqueo selectivo del receptor AT1 de angiotensina II.", indicaciones: ["Hipertension", "Nefropatia diabetica en diabetes tipo 2", "Reduccion de riesgo de evento vascular cerebral en hipertension con hipertrofia ventricular izquierda segun etiqueta"], dosisHabitual: "50 mg cada 24 h; rango habitual 25-100 mg/dia segun indicacion y respuesta.", rangoDosis: "25-100 mg/dia; puede dividirse cada 12 h.", vidaMedia: "Losartan ~2 h; metabolito activo EXP3174 ~6-9 h.", tmax: "Losartan ~1 h; metabolito activo ~3-4 h.", metabolismo: "Hepatico por CYP2C9 y CYP3A4 a metabolito activo.", cyp: ["CYP2C9: sustrato", "CYP3A4: sustrato"], eliminacion: "Biliar/fecal y urinaria.", metabolitosActivos: ["EXP3174 / E-3174"], contraindicacionesAbsolutas: ["Hipersensibilidad", "No coadministrar aliskiren en diabetes", "Embarazo: suspender al detectarlo por toxicidad fetal del SRAA"], contraindicacionesRelativas: ["Estenosis bilateral de arteria renal", "Hipovolemia", "Enfermedad renal o uso con otros bloqueadores SRAA"], precauciones: ["Hipotension", "Hiperpotasemia", "Deterioro de funcion renal"], efectosAdversos: ["Mareo", "Hipotension", "Hiperpotasemia", "Cambios en funcion renal"], vigilancia: ["Presion arterial", "Creatinina", "eGFR", "Potasio"], laboratorios: ["Creatinina", "eGFR", "Potasio"], interaccionesMedicamento: ["IECA/aliskiren/otros ARA-II: bloqueo dual SRAA", "Diureticos ahorradores de potasio o suplementos de potasio", "AINEs pueden deteriorar funcion renal"], interaccionesDiagnostico: ["Enfermedad renal/cardiaca hipertensiva: vigilar funcion renal, potasio y presion arterial"] }),
  prioritario({ id: "captopril", nombreGenerico: "Captopril", grupoFarmacologico: "IECA", claseFarmacologica: "IECA", subclase: "Inhibidor de la enzima convertidora de angiotensina", nombresComerciales: ["Capoten"], sinonimos: ["captopril", "capoten"], presentaciones: [presentacion("tableta", "12.5", "mg"), presentacion("tableta", "25", "mg"), presentacion("tableta", "50", "mg"), presentacion("tableta", "100", "mg")], mecanismoAccion: "Inhibe ECA, reduce angiotensina II y aldosterona.", indicaciones: ["Hipertension", "Insuficiencia cardiaca", "Postinfarto", "Nefropatia diabetica segun etiqueta"], dosisHabitual: "Hipertension: 25 mg cada 8-12 h; titular segun respuesta.", rangoDosis: "25-150 mg/dia en dosis divididas; maximos dependen de indicacion.", vidaMedia: "Menor de 2 h; aumenta en insuficiencia renal.", tmax: "Concentracion maxima ~1 h.", metabolismo: "Formacion de dimeros/disulfuros; no depende de CYP como via principal.", cyp: ["Sin CYP principal documentado en etiqueta"], eliminacion: "Renal, principalmente como captopril y metabolitos disulfuro.", metabolitosActivos: ["Disulfuros reversibles pueden regenerar captopril"], contraindicacionesAbsolutas: ["Hipersensibilidad", "Antecedente de angioedema por IECA", "Uso con sacubitrilo/valsartan dentro de 36 h", "No coadministrar aliskiren en diabetes", "Embarazo"], contraindicacionesRelativas: ["Estenosis de arteria renal", "Hipovolemia", "Enfermedad renal", "Hiperpotasemia"], precauciones: ["Hipotension", "Hiperpotasemia", "Deterioro renal/lesion renal aguda", "Tos", "Angioedema"], efectosAdversos: ["Tos", "Hipotension", "Hiperpotasemia", "Rash", "Alteracion del gusto", "Deterioro renal"], vigilancia: ["Presion arterial", "Creatinina", "eGFR", "Potasio", "Angioedema/tos"], laboratorios: ["Creatinina", "eGFR", "Potasio"], interaccionesMedicamento: ["ARA-II/aliskiren: bloqueo dual SRAA", "Espironolactona/potasio: hiperpotasemia", "AINEs: lesion renal y menor efecto antihipertensivo", "Litio: toxicidad"], interaccionesDiagnostico: ["I13/enfermedad renal/cardiaca hipertensiva: precaucion renal, electrolitica y hemodinamica"] }),
  prioritario({ id: "enalapril", nombreGenerico: "Enalapril", grupoFarmacologico: "IECA", claseFarmacologica: "IECA", subclase: "Profarmaco IECA", nombresComerciales: ["Vasotec"], sinonimos: ["enalapril", "enalapril maleato"], presentaciones: [presentacion("tableta", "2.5", "mg"), presentacion("tableta", "5", "mg"), presentacion("tableta", "10", "mg"), presentacion("tableta", "20", "mg")], mecanismoAccion: "Profarmaco convertido a enalaprilat, inhibidor de ECA.", indicaciones: ["Hipertension", "Insuficiencia cardiaca", "Disfuncion ventricular izquierda asintomatica"], dosisHabitual: "5-40 mg/dia por via oral en una o dos tomas segun indicacion.", rangoDosis: "2.5-40 mg/dia.", vidaMedia: "Enalaprilat tiene vida media efectiva de acumulacion ~11 h.", tmax: "Enalapril ~1 h; enalaprilat ~3-4 h.", metabolismo: "Hidrolisis hepatica a enalaprilat.", cyp: ["Sin CYP principal"], eliminacion: "Renal.", metabolitosActivos: ["Enalaprilat"], contraindicacionesAbsolutas: ["Angioedema por IECA", "Uso con sacubitrilo/valsartan dentro de 36 h", "No aliskiren en diabetes", "Embarazo"], precauciones: ["Hipotension", "Hiperpotasemia", "Deterioro renal"], efectosAdversos: ["Tos", "Hipotension", "Hiperpotasemia", "Deterioro renal"], vigilancia: ["Presion arterial", "Creatinina/eGFR", "Potasio"], laboratorios: ["Creatinina", "eGFR", "Potasio"], interaccionesMedicamento: ["ARA-II/aliskiren", "Potasio/espironolactona", "AINEs", "Litio"] }),
  prioritario({ id: "lisinopril", nombreGenerico: "Lisinopril", grupoFarmacologico: "IECA", claseFarmacologica: "IECA", subclase: "IECA no profarmaco", nombresComerciales: ["Prinivil", "Zestril"], sinonimos: ["lisinopril"], presentaciones: [presentacion("tableta", "5", "mg"), presentacion("tableta", "10", "mg"), presentacion("tableta", "20", "mg"), presentacion("tableta", "40", "mg")], indicaciones: ["Hipertension", "Insuficiencia cardiaca", "Postinfarto"], dosisHabitual: "10-40 mg cada 24 h segun indicacion.", rangoDosis: "2.5-40 mg/dia.", vidaMedia: "~12 h.", tmax: "~7 h.", metabolismo: "No se metaboliza de forma significativa.", cyp: ["Sin CYP principal"], eliminacion: "Renal sin cambios.", metabolitosActivos: ["No"], contraindicacionesAbsolutas: ["Angioedema por IECA", "Uso con sacubitrilo/valsartan dentro de 36 h", "No aliskiren en diabetes", "Embarazo"], precauciones: ["Hipotension", "Hiperpotasemia", "Deterioro renal"], efectosAdversos: ["Tos", "Mareo", "Hipotension", "Hiperpotasemia"], vigilancia: ["Presion arterial", "Creatinina/eGFR", "Potasio"], laboratorios: ["Creatinina", "eGFR", "Potasio"], interaccionesMedicamento: ["ARA-II/aliskiren", "AINEs", "Potasio/espironolactona", "Litio"] }),
  prioritario({ id: "valsartan", nombreGenerico: "Valsartan", grupoFarmacologico: "ARA-II", claseFarmacologica: "ARA-II", subclase: "Antagonista receptor AT1", nombresComerciales: ["Diovan"], sinonimos: ["valsartan"], presentaciones: [presentacion("tableta", "40", "mg"), presentacion("tableta", "80", "mg"), presentacion("tableta", "160", "mg"), presentacion("tableta", "320", "mg")], indicaciones: ["Hipertension", "Insuficiencia cardiaca", "Postinfarto"], dosisHabitual: "80-320 mg/dia segun indicacion.", rangoDosis: "40-320 mg/dia.", vidaMedia: "~6 h.", tmax: "2-4 h.", metabolismo: "Metabolismo limitado; CYP2C9 participa de forma menor.", cyp: ["CYP2C9: menor"], eliminacion: "Principalmente biliar/fecal; menor urinaria.", metabolitosActivos: ["No principal"], contraindicacionesAbsolutas: ["Hipersensibilidad", "No aliskiren en diabetes", "Embarazo"], precauciones: ["Hipotension", "Hiperpotasemia", "Deterioro renal"], efectosAdversos: ["Mareo", "Hipotension", "Hiperpotasemia"], vigilancia: ["Presion arterial", "Creatinina/eGFR", "Potasio"], laboratorios: ["Creatinina", "eGFR", "Potasio"], interaccionesMedicamento: ["IECA/aliskiren", "AINEs", "Potasio/espironolactona"] }),
  prioritario({ id: "telmisartan", nombreGenerico: "Telmisartan", grupoFarmacologico: "ARA-II", claseFarmacologica: "ARA-II", subclase: "Antagonista receptor AT1", nombresComerciales: ["Micardis"], sinonimos: ["telmisartan"], presentaciones: [presentacion("tableta", "20", "mg"), presentacion("tableta", "40", "mg"), presentacion("tableta", "80", "mg")], indicaciones: ["Hipertension", "Reduccion de riesgo cardiovascular en pacientes seleccionados segun etiqueta"], dosisHabitual: "40 mg cada 24 h; rango 20-80 mg/dia.", rangoDosis: "20-80 mg/dia.", vidaMedia: "~24 h.", tmax: "0.5-1 h.", metabolismo: "Conjugacion a acilglucuronido; no CYP relevante.", cyp: ["Sin CYP principal"], eliminacion: "Biliar/fecal principalmente.", metabolitosActivos: ["No"], contraindicacionesAbsolutas: ["Hipersensibilidad", "No aliskiren en diabetes", "Embarazo"], precauciones: ["Hipotension", "Hiperpotasemia", "Deterioro renal/hepatico"], efectosAdversos: ["Mareo", "Hipotension", "Hiperpotasemia"], vigilancia: ["Presion arterial", "Creatinina/eGFR", "Potasio"], laboratorios: ["Creatinina", "eGFR", "Potasio"], interaccionesMedicamento: ["IECA/aliskiren", "Digoxina", "AINEs", "Potasio/espironolactona"] }),
  prioritario({ id: "espironolactona", nombreGenerico: "Espironolactona", grupoFarmacologico: "Diureticos", claseFarmacologica: "Diuretico ahorrador de potasio", subclase: "Antagonista de aldosterona", nombresComerciales: ["Aldactone"], sinonimos: ["spironolactone", "espironolactona"], presentaciones: [presentacion("tableta", "25", "mg"), presentacion("tableta", "50", "mg"), presentacion("tableta", "100", "mg")], indicaciones: ["Insuficiencia cardiaca", "Hipertension", "Edema", "Hiperaldosteronismo"], dosisHabitual: "25-100 mg/dia segun indicacion.", rangoDosis: "12.5-400 mg/dia segun indicacion.", vidaMedia: "Espironolactona ~1.4 h; metabolitos activos 13-16.5 h aprox.", tmax: "2.6-4.3 h para metabolitos segun producto.", metabolismo: "Hepatico a metabolitos activos, incluyendo canrenona.", cyp: ["Metabolismo hepatico; CYP especifico no central en etiqueta"], eliminacion: "Urinaria y biliar/fecal.", metabolitosActivos: ["Canrenona", "7-alpha-thiomethylspironolactone"], contraindicacionesAbsolutas: ["Hiperpotasemia", "Enfermedad de Addison", "Uso concomitante de eplerenona"], contraindicacionesRelativas: ["Enfermedad renal", "IECA/ARA-II", "Suplementos de potasio"], precauciones: ["Hiperpotasemia", "Deterioro renal", "Ginecomastia"], efectosAdversos: ["Hiperpotasemia", "Ginecomastia", "Mareo", "Alteraciones menstruales"], vigilancia: ["Potasio", "Creatinina/eGFR", "Presion arterial"], laboratorios: ["Potasio", "Creatinina", "eGFR"], interaccionesMedicamento: ["IECA/ARA-II", "Potasio", "AINEs", "Litio"] }),
  prioritario({ id: "furosemida", nombreGenerico: "Furosemida", grupoFarmacologico: "Diureticos", claseFarmacologica: "Diuretico de asa", subclase: "Inhibidor NKCC2", nombresComerciales: ["Lasix"], sinonimos: ["furosemide", "furosemida"], presentaciones: [presentacion("tableta", "20", "mg"), presentacion("tableta", "40", "mg"), presentacion("solucion inyectable", "10", "mg/mL", "IV/IM")], indicaciones: ["Edema", "Hipertension"], dosisHabitual: "20-80 mg/dia por via oral; ajustar por respuesta.", rangoDosis: "20-600 mg/dia segun indicacion y vigilancia.", vidaMedia: "~2 h; prolongada en insuficiencia renal/hepatica.", tmax: "1-2 h oral.", metabolismo: "Metabolismo limitado; glucuronidacion parcial.", cyp: ["Sin CYP principal"], eliminacion: "Renal principalmente.", metabolitosActivos: ["No principal"], contraindicacionesAbsolutas: ["Anuria", "Hipersensibilidad"], precauciones: ["Deshidratacion", "Hipotension", "Hipokalemia/hiponatremia", "Deterioro renal", "Ototoxicidad"], efectosAdversos: ["Hipotension", "Hipokalemia", "Hiponatremia", "Hiperuricemia", "Ototoxicidad"], vigilancia: ["Presion arterial", "Peso/balance", "Creatinina/eGFR", "Sodio", "Potasio"], laboratorios: ["Creatinina", "eGFR", "Sodio", "Potasio", "Magnesio"], interaccionesMedicamento: ["AINE + IECA/ARA-II: triple whammy", "Litio", "Aminoglucosidos"] }),
  prioritario({ id: "ibuprofeno", nombreGenerico: "Ibuprofeno", grupoFarmacologico: "AINEs", claseFarmacologica: "AINE", subclase: "Inhibidor no selectivo COX", nombresComerciales: ["Advil", "Motrin"], sinonimos: ["ibuprofen", "ibuprofeno"], presentaciones: [presentacion("tableta", "200", "mg"), presentacion("tableta", "400", "mg"), presentacion("tableta", "600", "mg"), presentacion("suspension", "100", "mg/5 mL")], indicaciones: ["Dolor", "Fiebre", "Inflamacion"], dosisHabitual: "200-400 mg cada 4-6 h OTC; dosis prescritas segun etiqueta.", rangoDosis: "Maximo diario depende de producto OTC/prescripcion; verificar etiqueta.", vidaMedia: "~2 h.", tmax: "1-2 h.", metabolismo: "Hepatico por oxidacion; participa CYP2C9.", cyp: ["CYP2C9: sustrato"], eliminacion: "Renal como metabolitos.", metabolitosActivos: ["No principal"], contraindicacionesAbsolutas: ["Hipersensibilidad/AINE-asma", "Dolor perioperatorio de CABG", "Sangrado GI activo significativo segun contexto"], contraindicacionesRelativas: ["Enfermedad renal", "Insuficiencia cardiaca", "Anticoagulantes/antiagregantes", "IECA/ARA-II/diureticos"], precauciones: ["Sangrado GI", "Eventos cardiovasculares tromboticos", "Lesion renal", "Hipertension/retencion de liquidos"], efectosAdversos: ["Dispepsia", "Sangrado GI", "Lesion renal", "Edema", "Aumento de presion arterial"], vigilancia: ["Dolor/sangrado GI", "Presion arterial", "Creatinina/eGFR", "Hemoglobina si sangrado"], laboratorios: ["Creatinina", "eGFR", "Hemoglobina si riesgo"], interaccionesMedicamento: ["IECA/ARA-II: menor efecto y riesgo renal", "Diureticos + IECA/ARA-II: triple whammy", "ISRS/IRSN/anticoagulantes/aspirina: sangrado", "Litio"] }),
  prioritario({ id: "sertralina", nombreGenerico: "Sertralina", grupoFarmacologico: "ISRS", claseFarmacologica: "ISRS", subclase: "Inhibidor selectivo de recaptura de serotonina", nombresComerciales: ["Zoloft"], sinonimos: ["sertraline", "sertralina"], presentaciones: [presentacion("tableta", "25", "mg"), presentacion("tableta", "50", "mg"), presentacion("tableta", "100", "mg"), presentacion("concentrado oral", "20", "mg/mL")], indicaciones: ["Depresion mayor", "TOC", "Panico", "TEPT", "Ansiedad social", "Trastorno disforico premenstrual"], dosisHabitual: "50 mg cada 24 h; iniciar 25 mg en panico/TEPT/social segun etiqueta.", rangoDosis: "25-200 mg/dia.", vidaMedia: "Sertralina ~26 h; N-desmetilsertralina ~62-104 h.", tmax: "4.5-8.4 h.", metabolismo: "Hepatico; multiples CYP participan.", cyp: ["CYP2B6/2C19/2D6/3A4: participacion variable", "Inhibidor CYP2D6 debil a moderado segun dosis/contexto"], eliminacion: "Fecal y urinaria como metabolitos.", metabolitosActivos: ["N-desmetilsertralina, menos activa"], contraindicacionesAbsolutas: ["IMAO", "Pimozida", "Disulfiram con concentrado oral por alcohol"], precauciones: ["Sindrome serotoninergico", "Sangrado", "Hiponatremia/SIADH", "Activacion mania", "Convulsiones"], efectosAdversos: ["Nausea", "Diarrea", "Insomnio", "Disfuncion sexual", "Sangrado"], vigilancia: ["Respuesta/ideacion suicida", "Sodio en riesgo", "Sangrado con AINE/anticoagulante", "Mania"], laboratorios: ["Sodio si riesgo", "INR si warfarina"], interaccionesMedicamento: ["AINE/aspirina/anticoagulantes: sangrado", "IMAO/linezolid/tramadol: serotoninergico", "Pimozida"] }),
  prioritario({ id: "litio", nombreGenerico: "Litio", grupoFarmacologico: "Estabilizadores del animo", claseFarmacologica: "Estabilizador del animo", subclase: "Sal de litio", nombresComerciales: ["Lithobid"], sinonimos: ["lithium", "litio", "carbonato de litio"], presentaciones: [presentacion("tableta/capsula", "300", "mg"), presentacion("tableta liberacion prolongada", "450", "mg")], indicaciones: ["Trastorno bipolar mania", "Mantenimiento bipolar"], dosisHabitual: "Individualizar por niveles sericos; esquemas comunes 600-1800 mg/dia segun formulacion y nivel.", rangoDosis: "Ajustar a concentracion serica e indicacion.", vidaMedia: "18-36 h en adultos; puede prolongarse en adulto mayor o enfermedad renal.", tmax: "0.5-3 h inmediata; 4-6 h liberacion prolongada.", metabolismo: "No se metaboliza.", cyp: ["No CYP"], eliminacion: "Renal casi completamente.", metabolitosActivos: ["No"], contraindicacionesAbsolutas: ["Hipersensibilidad; evitar en deshidratacion grave o deterioro renal significativo salvo manejo especializado"], contraindicacionesRelativas: ["Enfermedad renal", "Enfermedad cardiovascular", "Deshidratacion", "Diureticos/IECA/ARA-II/AINEs"], precauciones: ["Margen terapeutico estrecho", "Toxicidad renal/neurologica", "Hipotiroidismo", "Diabetes insipida nefrogenica"], efectosAdversos: ["Temblor", "Poliuria", "Sed", "Nausea", "Hipotiroidismo", "Toxicidad neurologica"], vigilancia: ["Nivel serico de litio", "Creatinina/eGFR", "TSH", "Calcio", "Sodio/hidratacion"], laboratorios: ["Litio serico", "Creatinina", "eGFR", "TSH", "Calcio", "Sodio"], interaccionesMedicamento: ["IECA/ARA-II", "Diureticos", "AINEs", "Metronidazol: pueden aumentar niveles/toxicidad"] }),
  ...[
    ["amlodipino", "Amlodipino", "Calcioantagonistas", "Calcioantagonista dihidropiridinico", "5-10 mg cada 24 h", "30-50 h", "Hepatico principalmente CYP3A4", ["CYP3A4: sustrato"], "Edema, hipotension, mareo", ["Presion arterial", "Edema"]],
    ["metoprolol", "Metoprolol", "Betabloqueadores", "Betabloqueador beta-1 selectivo", "25-200 mg/dia segun sal/formulacion", "3-7 h", "Hepatico por CYP2D6", ["CYP2D6: sustrato"], "Bradicardia, hipotension, broncoespasmo", ["Frecuencia cardiaca", "Presion arterial"]],
    ["propranolol", "Propranolol", "Betabloqueadores", "Betabloqueador no selectivo", "Individualizar; 10-80 mg cada 6-12 h segun indicacion", "3-6 h", "Hepatico CYP1A2/2D6/2C19", ["CYP1A2", "CYP2D6", "CYP2C19"], "Bradicardia, hipotension, broncoespasmo", ["Frecuencia cardiaca", "Presion arterial"]],
    ["hidroclorotiazida", "Hidroclorotiazida", "Diureticos", "Tiazida", "12.5-25 mg cada 24 h", "6-15 h", "No metabolismo significativo", ["Sin CYP principal"], "Hiponatremia, hipokalemia, hiperuricemia", ["Sodio", "Potasio", "Creatinina", "Presion arterial"]],
    ["metformina", "Metformina", "Hipoglucemiantes", "Biguanida", "500-2000 mg/dia con alimentos segun formulacion", "Plasma ~6.2 h; sangre ~17.6 h", "No se metaboliza", ["No CYP"], "Acidosis lactica rara; GI", ["eGFR", "Glucosa/HbA1c", "B12 si uso prolongado"]],
    ["insulina", "Insulina", "Hipoglucemiantes", "Insulina", "Depende de tipo, glucosa, dieta y esquema", "Variable por formulacion", "Proteolisis a peptidos/aminoacidos", ["No CYP"], "Hipoglucemia", ["Glucosa", "HbA1c", "Hipoglucemia"]],
    ["atorvastatina", "Atorvastatina", "Estatinas", "Inhibidor HMG-CoA reductasa", "10-80 mg cada 24 h", "14 h; actividad inhibitoria 20-30 h", "Hepatico CYP3A4", ["CYP3A4: sustrato"], "Miopatia, transaminasas", ["Sintomas musculares", "ALT/AST si clinica"]],
    ["rosuvastatina", "Rosuvastatina", "Estatinas", "Inhibidor HMG-CoA reductasa", "5-40 mg cada 24 h", "19 h", "Metabolismo limitado CYP2C9", ["CYP2C9: menor"], "Miopatia, proteinuria", ["Sintomas musculares", "Funcion renal en riesgo"]],
    ["acido_acetilsalicilico", "Acido acetilsalicilico", "Antiagregantes", "Salicilato/AINE antiagregante", "75-100 mg/dia antiagregante; analgesia segun etiqueta", "AAS 15-20 min; salicilato dosis-dependiente", "Hidrólisis a salicilato; metabolismo hepatico", ["No CYP principal"], "Sangrado, broncoespasmo", ["Sangrado", "Hemoglobina si riesgo"]],
    ["clopidogrel", "Clopidogrel", "Antiagregantes", "Inhibidor P2Y12", "75 mg cada 24 h tras carga si aplica", "Profarmaco ~6 h; efecto plaquetario 7-10 dias", "Hepatico; activacion CYP2C19", ["CYP2C19: activacion", "CYP3A4/2B6/1A2: participacion"], "Sangrado", ["Sangrado", "Adherencia"]],
    ["warfarina", "Warfarina", "Anticoagulantes", "Antagonista vitamina K", "Individualizar por INR", "20-60 h; promedio ~40 h", "Hepatico CYP2C9 principalmente S-warfarina", ["CYP2C9: sustrato", "CYP1A2/3A4: R-warfarina"], "Sangrado", ["INR", "Sangrado"]],
    ["apixaban", "Apixaban", "Anticoagulantes", "Inhibidor factor Xa", "2.5-5 mg cada 12 h segun indicacion", "~12 h", "CYP3A4 y P-gp/BCRP", ["CYP3A4: sustrato", "P-gp: sustrato"], "Sangrado", ["Funcion renal", "Sangrado"]],
    ["rivaroxaban", "Rivaroxaban", "Anticoagulantes", "Inhibidor factor Xa", "10-20 mg/dia o segun indicacion", "5-9 h joven; 11-13 h adulto mayor", "CYP3A4/2J2 y P-gp/BCRP", ["CYP3A4: sustrato", "CYP2J2: sustrato", "P-gp: sustrato"], "Sangrado", ["Funcion renal", "Sangrado"]],
    ["omeprazol", "Omeprazol", "IBP", "Inhibidor bomba de protones", "20-40 mg/dia segun indicacion", "0.5-1 h", "Hepatico CYP2C19/CYP3A4", ["CYP2C19: sustrato/inhibidor", "CYP3A4: sustrato"], "Hipomagnesemia, interacciones CYP2C19", ["Magnesio si uso prolongado/riesgo"]],
    ["pantoprazol", "Pantoprazol", "IBP", "Inhibidor bomba de protones", "40 mg/dia segun indicacion", "~1 h", "Hepatico CYP2C19 y conjugacion", ["CYP2C19: sustrato"], "Hipomagnesemia", ["Magnesio si uso prolongado/riesgo"]],
    ["paracetamol", "Paracetamol", "Analgesicos", "Analgesico/antipiretico", "500-1000 mg cada 6-8 h; respetar maximo diario", "2-3 h", "Hepatico glucuronidacion/sulfatacion; CYP2E1 a NAPQI", ["CYP2E1: via toxica menor"], "Hepatotoxicidad por sobredosis", ["Dosis diaria total", "Funcion hepatica si riesgo"]],
    ["naproxeno", "Naproxeno", "AINEs", "AINE no selectivo", "220-500 mg cada 12 h segun producto", "12-17 h", "Hepatico; conjugacion", ["CYP no principal"], "Sangrado GI, renal, CV", ["Sangrado", "Presion arterial", "Creatinina/eGFR"]],
    ["diclofenaco", "Diclofenaco", "AINEs", "AINE no selectivo", "50 mg cada 8-12 h o segun formulacion", "1-2 h", "Hepatico CYP2C9", ["CYP2C9: sustrato"], "Sangrado GI, hepatotoxicidad, renal/CV", ["ALT/AST si uso prolongado", "Creatinina/eGFR"]],
    ["prednisona", "Prednisona", "Corticoides", "Glucocorticoide", "Individualizar; 5-60 mg/dia segun indicacion", "Prednisolona 3-4 h; efecto biologico 18-36 h", "Hepatico a prednisolona activa", ["CYP3A4: sustrato"], "Hiperglucemia, HTA, infeccion", ["Glucosa", "Presion arterial", "Infeccion"]],
    ["dexametasona", "Dexametasona", "Corticoides", "Glucocorticoide", "Individualizar; 0.5-10 mg/dia segun indicacion", "3-5 h; efecto biologico 36-54 h", "Hepatico CYP3A4", ["CYP3A4: sustrato"], "Hiperglucemia, HTA, supresion adrenal", ["Glucosa", "Presion arterial", "Infeccion"]],
    ["fluoxetina", "Fluoxetina", "ISRS", "ISRS", "20-80 mg/dia", "1-3 dias agudo; 4-6 dias cronico; norfluoxetina 4-16 dias", "Hepatico CYP2D6", ["CYP2D6: sustrato/inhibidor"], "Serotoninergico, sangrado, activacion", ["Ideacion suicida", "Sangrado", "Mania"]],
    ["escitalopram", "Escitalopram", "ISRS", "ISRS", "10-20 mg/dia", "27-32 h", "Hepatico CYP2C19/3A4/2D6", ["CYP2C19", "CYP3A4", "CYP2D6"], "QT dosis/riesgo, serotoninergico", ["QT si riesgo", "Sodio si riesgo"]],
    ["paroxetina", "Paroxetina", "ISRS", "ISRS", "20-50 mg/dia segun indicacion", "~21 h", "Hepatico CYP2D6", ["CYP2D6: sustrato/inhibidor potente"], "Anticolinergico, retirada, sangrado", ["Sangrado", "Sodio", "Retirada"]],
    ["venlafaxina", "Venlafaxina", "IRSN", "IRSN", "75-225 mg/dia", "Venlafaxina 5 h; ODV 11 h", "CYP2D6 a O-desmetilvenlafaxina", ["CYP2D6: sustrato"], "Presion arterial, sangrado", ["Presion arterial", "Sangrado"]],
    ["duloxetina", "Duloxetina", "IRSN", "IRSN", "30-60 mg/dia; max segun indicacion", "~12 h", "Hepatico CYP1A2/2D6", ["CYP1A2: sustrato", "CYP2D6: sustrato/inhibidor"], "Hepatotoxicidad, presion, sangrado", ["Funcion hepatica si riesgo", "Presion arterial"]],
    ["mirtazapina", "Mirtazapina", "Antidepresivos", "NaSSA", "15-45 mg por la noche", "20-40 h", "Hepatico CYP1A2/2D6/3A4", ["CYP1A2", "CYP2D6", "CYP3A4"], "Sedacion, peso", ["Peso", "Sedacion"]],
    ["bupropion", "Bupropion", "Antidepresivos", "NDRI", "150-300 mg/dia segun formulacion", "Bupropion ~21 h; metabolitos 20-37 h", "Hepatico CYP2B6", ["CYP2B6: sustrato", "CYP2D6: inhibidor"], "Convulsiones, hipertension", ["Presion arterial", "Riesgo convulsivo"]],
    ["trazodona", "Trazodona", "Antidepresivos", "SARI", "25-150 mg noche para insomnio; antidepresivo segun etiqueta", "3-9 h segun fase/formulacion", "Hepatico CYP3A4", ["CYP3A4: sustrato"], "Sedacion, hipotension, priapismo, QT", ["Ortostatismo", "Sedacion", "QT si riesgo"]],
    ["amitriptilina", "Amitriptilina", "Triciclicos", "Antidepresivo triciclico", "10-150 mg/dia segun indicacion", "10-28 h", "Hepatico CYP2D6/2C19", ["CYP2D6", "CYP2C19"], "Anticolinergico, QT, sedacion", ["ECG si riesgo", "Anticolinergico"]],
    ["clomipramina", "Clomipramina", "Triciclicos", "Triciclico serotoninergico", "25-250 mg/dia segun indicacion", "19-37 h; desmetilclomipramina 54-77 h", "Hepatico CYP2D6/1A2/2C19/3A4", ["CYP2D6", "CYP1A2", "CYP2C19", "CYP3A4"], "Serotoninergico, convulsiones, QT", ["ECG si riesgo", "Convulsiones"]],
    ["haloperidol", "Haloperidol", "Antipsicoticos tipicos", "Butirofenona", "0.5-20 mg/dia segun indicacion", "~21 h", "Hepatico CYP3A4/2D6", ["CYP3A4", "CYP2D6"], "EPS, QT, NMS", ["EPS", "QT/ECG si riesgo"]],
    ["quetiapina", "Quetiapina", "Antipsicoticos atipicos", "Antipsicotico segunda generacion", "25-800 mg/dia segun indicacion/formulacion", "~6 h", "Hepatico CYP3A4", ["CYP3A4: sustrato"], "Sedacion, hipotension, metabolico", ["Peso", "Glucosa/HbA1c", "Lipidos", "Ortostatismo"]],
    ["aripiprazol", "Aripiprazol", "Antipsicoticos atipicos", "Agonista parcial D2", "10-30 mg/dia", "~75 h; metabolito ~94 h", "Hepatico CYP2D6/3A4", ["CYP2D6", "CYP3A4"], "Acatisia, impulsividad", ["EPS/acatisia", "Peso/metabolico"]],
    ["clozapina", "Clozapina", "Antipsicoticos atipicos", "Antipsicotico resistente", "12.5-900 mg/dia con titulacion y programa REMS donde aplique", "~12 h", "Hepatico CYP1A2 principal", ["CYP1A2: sustrato", "CYP3A4/2D6: menor"], "Agranulocitosis, convulsiones, miocarditis, metabolico", ["Biometria/ANC", "Peso", "Glucosa", "Lipidos", "Miocarditis"]],
    ["paliperidona", "Paliperidona", "Antipsicoticos atipicos", "Metabolito activo de risperidona", "3-12 mg/dia oral segun indicacion", "~23 h oral", "Metabolismo limitado", ["CYP no principal"], "Prolactina, EPS, QT", ["Prolactina si sintomas", "EPS", "Funcion renal"]],
    ["valproato", "Valproato", "Estabilizadores del animo", "Antiepileptico/estabilizador", "Individualizar por indicacion y niveles", "9-16 h", "Hepatico glucuronidacion/beta-oxidacion", ["Inhibidor UGT/CYP2C9 relevante"], "Hepatotoxicidad, pancreatitis, teratogenicidad", ["Valproato serico", "ALT/AST", "Plaquetas"]],
    ["carbamazepina", "Carbamazepina", "Estabilizadores del animo", "Antiepileptico", "200-1200 mg/dia segun indicacion", "25-65 h inicial; 12-17 h autoinducida", "Hepatico CYP3A4; autoinductor", ["CYP3A4: sustrato/inductor", "Inductor enzimatico"], "SJS/TEN, hiponatremia, interacciones", ["Sodio", "BH", "Funcion hepatica", "Niveles si aplica"]],
    ["lamotrigina", "Lamotrigina", "Estabilizadores del animo", "Antiepileptico", "Titular lentamente; dosis depende de valproato/inductores", "25-33 h; aumenta con valproato", "Glucuronidacion UGT", ["UGT: sustrato"], "Rash grave/SJS", ["Rash", "Titulacion", "Interacciones"]],
    ["clonazepam", "Clonazepam", "Benzodiacepinas", "Benzodiacepina", "0.25-2 mg/dia segun indicacion; individualizar", "30-40 h", "Hepatico CYP3A", ["CYP3A: sustrato"], "Sedacion, caidas, dependencia", ["Sedacion", "Caidas", "Uso con depresores SNC"]],
    ["lorazepam", "Lorazepam", "Benzodiacepinas", "Benzodiacepina", "0.5-2 mg cada 8-12 h segun indicacion", "~12 h", "Glucuronidacion", ["No CYP principal"], "Sedacion, caidas, dependencia", ["Sedacion", "Respiracion con opioides/alcohol"]],
    ["diazepam", "Diazepam", "Benzodiacepinas", "Benzodiacepina", "2-10 mg cada 6-12 h segun indicacion", "20-50 h; metabolito hasta ~100 h", "Hepatico CYP2C19/3A4", ["CYP2C19", "CYP3A4"], "Sedacion prolongada, caidas", ["Sedacion", "Caidas"]],
    ["alprazolam", "Alprazolam", "Benzodiacepinas", "Benzodiacepina", "0.25-4 mg/dia segun indicacion/formulacion", "~11 h", "Hepatico CYP3A4", ["CYP3A4: sustrato"], "Sedacion, dependencia, retirada", ["Sedacion", "Caidas", "Uso con opioides/alcohol"]]
  ].map(([id, nombreGenerico, grupoFarmacologico, subclase, dosisHabitual, vidaMedia, metabolismo, cyp, riesgo, vigilancia]) => prioritario({
    id, nombreGenerico, grupoFarmacologico, claseFarmacologica: grupoFarmacologico, subclase,
    sinonimos: [id.replace(/_/g, " "), nombreGenerico.toLowerCase()],
    indicaciones: ["Ver indicaciones aprobadas en etiqueta vigente."],
    dosisHabitual, rangoDosis: "Depende de indicacion, formulacion, edad, funcion renal/hepatica e interacciones.",
    vidaMedia, metabolismo, cyp, viaEliminacion: "Ver etiqueta vigente; depende de metabolitos y funcion organica.", eliminacion: "Ver etiqueta vigente.",
    metabolitosActivos: [DATO_NO_ENCONTRADO],
    contraindicacionesAbsolutas: ["Hipersensibilidad al principio activo; otras contraindicaciones dependen de etiqueta/indicacion."],
    contraindicacionesRelativas: ["Revisar comorbilidades, embarazo/lactancia, funcion renal/hepatica e interacciones."],
    precauciones: [riesgo],
    efectosAdversos: [riesgo],
    vigilancia,
    laboratorios: vigilancia.filter((item) => /creatinina|egfr|potasio|sodio|glucosa|hba1c|lipidos|inr|alt|ast|bh|plaquetas|litio|valproato|tsh|calcio|magnesio/i.test(item)),
    interaccionesMedicamento: ["Ver reglas de motor por grupo farmacologico y etiqueta vigente."],
    interaccionesDiagnostico: ["Ver reglas de motor por diagnostico/comorbilidad."]
  }))
].map((ficha) => [ficha.id, ficha])));

export const FARMACOLOGIA_VERIFICADA = Object.freeze({
  ...FARMACOLOGIA_STAHL,
  ...FARMACOLOGIA_PRIORITARIA
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
    fuente: verificada.fuentePrincipal || verificada.fuentes?.[0]?.titulo || FUENTE_STAHL.titulo,
    paginaSeccion: verificada.fuentes.map((item) => {
      if (Array.isArray(item.paginasPdf)) return `PDF ${item.paginasPdf.join(", ")} / impresa ${item.paginasImpresas}: ${item.secciones.join(", ")}`;
      return `${item.titulo || "Fuente"}${item.url ? ` (${item.url})` : ""}: ${(item.secciones || []).join(", ")}`;
    }).join("; "),
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
