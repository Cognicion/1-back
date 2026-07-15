export const GRUPOS_CIE10_BIBLIOTECA = [
  { id: "todos", etiqueta: "Todos los CIE-10", descripcion: "Muestra todos los diagnósticos disponibles." },
  { id: "F", etiqueta: "F00-F99 · Trastornos mentales y del comportamiento", descripcion: "Psiquiatría, neurodesarrollo, consumo de sustancias y salud mental." },
  { id: "E", etiqueta: "E00-E90 · Endocrino, nutrición y metabolismo", descripcion: "Diabetes, tiroides, nutrición, metabolismo y trastornos relacionados." },
  { id: "I", etiqueta: "I00-I99 · Sistema circulatorio", descripcion: "Hipertensión, cardiopatía, arritmias, enfermedad vascular y evento vascular cerebral." },
  { id: "L", etiqueta: "L00-L99 · Piel y tejido subcutáneo", descripcion: "Dermatitis, urticaria, psoriasis, acné y otras condiciones dermatológicas." },
  { id: "Z", etiqueta: "Z00-Z99 · Factores que influyen en la salud", descripcion: "Factores psicosociales, adherencia, antecedentes, cuidados y circunstancias de atención." }
];

const CRITERIOS_BASE_POR_GRUPO = {
  F: [
    "Confirmar temporalidad, intensidad, deterioro funcional y contexto clínico mediante entrevista estructurada o semiestructurada.",
    "Descartar causas médicas, neurológicas, farmacológicas o por sustancias antes de integrar un diagnóstico primario.",
    "Valorar riesgo suicida, violencia, psicosis, catatonia, delirium, abstinencia, intoxicación y necesidad de manejo urgente.",
    "Registrar diagnóstico como probable, diferencial o en seguimiento cuando la información aún sea insuficiente."
  ],
  E: [
    "Integrar datos clínicos con mediciones de laboratorio, evolución temporal y tratamiento actual.",
    "Valorar repercusión cardiovascular, renal, neurológica, nutricional y psiquiátrica.",
    "Revisar fármacos que puedan inducir o descompensar alteraciones metabólicas.",
    "Confirmar con criterios clínicos y bioquímicos vigentes según el padecimiento."
  ],
  I: [
    "Correlacionar síntomas, exploración física, signos vitales, electrocardiograma, laboratorios e imagen cuando aplique.",
    "Identificar datos de alarma: dolor torácico, síncope, disnea, déficit neurológico, choque o inestabilidad hemodinámica.",
    "Revisar factores de riesgo cardiovascular, función renal, electrolitos y tratamiento concomitante.",
    "Evitar prescripción que incremente riesgo de arritmia, sangrado, hipotensión o lesión renal sin monitorización."
  ],
  L: [
    "Describir distribución, morfología, evolución, factores desencadenantes, prurito, dolor y signos de infección.",
    "Identificar reacciones medicamentosas, alergias, autoinmunidad, infección, exposición ambiental o enfermedad sistémica.",
    "Registrar gravedad, extensión, recurrencia y respuesta a tratamientos previos.",
    "Derivar o solicitar evaluación especializada ante lesiones extensas, sistémicas, ampollosas o mucosas."
  ],
  Z: [
    "Documentar el factor clínico, social, conductual o administrativo que modifica la atención médica.",
    "Precisar si influye en adherencia, seguimiento, seguridad, funcionamiento, red de apoyo o pronóstico.",
    "Usar estos códigos como complemento del diagnóstico clínico principal, no como sustituto cuando exista enfermedad activa.",
    "Actualizar en cada contacto si cambia el contexto psicosocial o la condición de seguimiento."
  ]
};

const PERFIL_DIAGNOSTICO_POR_PREFIJO = [
  {
    prefijos: ["F31"],
    contraindicados: [],
    precaucion: ["Antidepresivos en monoterapia", "Corticoides sistémicos", "Estimulantes", "Levodopa y agonistas dopaminérgicos"],
    nota: "En trastorno bipolar, evitar antidepresivo sin estabilizador cuando exista riesgo de viraje afectivo; vigilar manía, hipomanía, sueño e impulsividad."
  },
  {
    prefijos: ["F20", "F22", "F23", "F25", "F29"],
    contraindicados: [],
    precaucion: ["Estimulantes", "Cannabinoides", "Corticoides sistémicos", "Levodopa y agonistas dopaminérgicos", "Anticolinérgicos de carga alta"],
    nota: "En psicosis o síndrome psicótico a estudio, revisar fármacos y sustancias que puedan inducir o agravar síntomas psicóticos."
  },
  {
    prefijos: ["F10", "F11", "F13", "F19"],
    contraindicados: [],
    precaucion: ["Benzodiacepinas fuera de protocolos de abstinencia", "Opioides", "Hipnóticos Z", "Gabapentinoides", "Alcohol u otros depresores del SNC"],
    nota: "En trastornos por sustancias, valorar riesgo de sedación, dependencia, recaída, depresión respiratoria y uso no supervisado."
  },
  {
    prefijos: ["F50.0", "F50.2"],
    contraindicados: ["Bupropión"],
    precaucion: ["Antidepresivos tricíclicos", "Antipsicóticos con prolongación QT", "Diuréticos", "Laxantes estimulantes"],
    nota: "En trastornos alimentarios, vigilar electrolitos, QTc, peso, riesgo convulsivo y complicaciones cardiovasculares."
  },
  {
    prefijos: ["F32", "F33"],
    contraindicados: ["IMAO combinado con ISRS/IRSN/tricíclicos"],
    precaucion: ["Antidepresivos si existe sospecha de bipolaridad", "Benzodiacepinas prolongadas", "Fármacos con riesgo de sangrado si se usan ISRS/IRSN"],
    nota: "En depresión, revisar riesgo suicida, bipolaridad, psicosis, catatonia, consumo de sustancias y comorbilidad médica."
  },
  {
    prefijos: ["E10", "E11", "E66"],
    contraindicados: [],
    precaucion: ["Corticoides sistémicos", "Antipsicóticos de riesgo metabólico", "Tiazidas", "Betabloqueadores no selectivos", "SGLT2 si hay riesgo de cetoacidosis"],
    nota: "En diabetes u obesidad, vigilar peso, glucosa, HbA1c, lípidos y riesgo metabólico de psicofármacos."
  },
  {
    prefijos: ["E03", "E05", "E22.1"],
    contraindicados: [],
    precaucion: ["Litio", "Amiodarona", "Antipsicóticos hiperprolactinémicos", "Dopaminérgicos según contexto"],
    nota: "En trastornos tiroideos o hiperprolactinemia, revisar fármacos que modifiquen eje tiroideo o prolactina."
  },
  {
    prefijos: ["I10", "I20", "I21", "I25", "I48", "I50", "I63", "I64"],
    contraindicados: [],
    precaucion: ["AINE", "Corticoides sistémicos", "Estimulantes", "Venlafaxina a dosis altas", "Tricíclicos", "Fármacos que prolongan QT", "Pioglitazona en insuficiencia cardiaca"],
    nota: "En enfermedad cardiovascular, vigilar presión arterial, frecuencia cardiaca, QTc, electrolitos, función renal y riesgo de sangrado."
  },
  {
    prefijos: ["L20", "L23", "L40", "L50", "L70"],
    contraindicados: [],
    precaucion: ["Fármacos con antecedente de reacción cutánea", "Lamotrigina durante titulación", "Carbamazepina", "Alopurinol", "Antibióticos betalactámicos si hay alergia"],
    nota: "Ante enfermedad cutánea o alergia, diferenciar dermatosis basal de reacción medicamentosa y vigilar síntomas sistémicos."
  }
];

const PERFIL_FARMACOLOGICO_POR_CLASE = [
  {
    clases: ["isrs"],
    datos: {
      mecanismoAccion: "Inhibición selectiva de la recaptura de serotonina por bloqueo funcional de SERT.",
      vidaMedia: "Variable por fármaco; fluoxetina/norfluoxetina tiene vida media prolongada.",
      inicioAccion: "Efecto clínico usualmente gradual; valorar respuesta en semanas, no en horas.",
      duracionAccion: "Depende de la vida media y del metabolito activo; fluoxetina puede persistir más tiempo.",
      metabolismo: "Predomina metabolismo hepático, con participación variable de CYP según molécula.",
      eliminacion: "Principalmente renal y fecal como metabolitos; revisar ficha técnica por molécula.",
      ajusteRenal: "Generalmente no requiere ajuste amplio salvo moléculas específicas o daño renal avanzado.",
      ajusteHepatico: "Usar dosis menores o titulación más lenta en hepatopatía clínicamente relevante.",
      monitorizacion: ["Respuesta clínica", "ideación suicida inicial", "síndrome serotoninérgico", "sodio si riesgo", "sangrado si usa AINE/anticoagulante"],
      efectosAdversos: ["Náusea", "diarrea", "insomnio o somnolencia", "disfunción sexual", "sudoración", "hiponatremia", "aumento de riesgo de sangrado"],
      contraindicaciones: ["Uso concomitante con IMAO o linezolid sin periodo de lavado", "Síndrome serotoninérgico activo"],
      precauciones: ["Trastorno bipolar no estabilizado", "QT prolongado según molécula", "uso con AINE/anticoagulantes", "epilepsia no controlada"],
      indicaciones: ["Depresión", "ansiedad", "TOC", "TEPT", "pánico según fármaco"]
    }
  },
  {
    clases: ["irsn"],
    datos: {
      mecanismoAccion: "Inhibición de recaptura de serotonina y noradrenalina con efecto dependiente de dosis.",
      vidaMedia: "Variable; revisar ficha técnica de la molécula.",
      inicioAccion: "Respuesta clínica gradual; los efectos noradrenérgicos pueden depender de dosis.",
      duracionAccion: "Depende de formulación inmediata o prolongada y vida media específica.",
      metabolismo: "Metabolismo hepático; venlafaxina depende de CYP2D6 para metabolito activo, duloxetina de CYP1A2/CYP2D6.",
      eliminacion: "Renal y fecal según molécula; considerar función renal en venlafaxina/desvenlafaxina.",
      ajusteRenal: "Revisar dosis en enfermedad renal moderada a grave según molécula.",
      ajusteHepatico: "Evitar o usar con mucha cautela en hepatopatía relevante según molécula.",
      monitorizacion: ["Presión arterial", "frecuencia cardiaca", "síntomas de suspensión", "sodio si riesgo", "función hepática si duloxetina o riesgo"],
      efectosAdversos: ["Náusea", "sudoración", "insomnio", "elevación de presión arterial", "síntomas por suspensión"],
      contraindicaciones: ["Uso concomitante con IMAO"],
      precauciones: ["Hipertensión arterial", "arritmias", "bipolaridad", "riesgo de sangrado"],
      indicaciones: ["Depresión", "ansiedad", "dolor neuropático según molécula"]
    }
  },
  {
    clases: ["benzodiacepina", "hipnótico"],
    datos: {
      mecanismoAccion: "Modulación alostérica positiva del receptor GABA-A, aumentando la acción inhibitoria de GABA.",
      vidaMedia: "Variable; depende de la molécula y metabolitos activos.",
      inicioAccion: "Usualmente rápido por vía oral o parenteral, según formulación y absorción.",
      duracionAccion: "No siempre coincide con vida media; depende de redistribución y metabolitos activos.",
      metabolismo: "Hepático en muchas moléculas; lorazepam/oxazepam/temazepam dependen más de glucuronidación.",
      eliminacion: "Renal como metabolitos; puede acumularse si hay vida media larga o metabolitos activos.",
      ajusteRenal: "Precaución por acumulación de metabolitos y sedación, especialmente en fragilidad.",
      ajusteHepatico: "Preferir moléculas con glucuronidación en hepatopatía cuando sea necesario.",
      monitorizacion: ["Sedación", "frecuencia respiratoria si hay depresores", "caídas", "delirium", "tolerancia/dependencia"],
      efectosAdversos: ["Sedación", "amnesia", "caídas", "tolerancia", "dependencia", "depresión respiratoria si se combina con depresores"],
      contraindicaciones: ["Insuficiencia respiratoria grave no monitorizada", "miastenia gravis grave", "intoxicación por depresores del SNC"],
      precauciones: ["Adulto mayor", "apnea del sueño", "trastorno por sustancias", "uso con opioides o alcohol", "embarazo"],
      indicaciones: ["Ansiedad aguda", "insomnio breve", "catatonia", "abstinencia alcohólica o benzodiacepínica bajo protocolo"]
    }
  },
  {
    clases: ["antipsicótico", "antipsicotico"],
    datos: {
      mecanismoAccion: "Modulación dopaminérgica D2 y de otros receptores según molécula; algunos tienen acción serotoninérgica 5-HT2A.",
      vidaMedia: "Variable; revisar molécula y formulación.",
      inicioAccion: "Sedación o control conductual puede ser temprano; respuesta antipsicótica suele requerir días a semanas.",
      duracionAccion: "Depende de molécula, formulación oral o depot y afinidad receptorial.",
      metabolismo: "Predomina metabolismo hepático con CYP variables; algunas moléculas tienen metabolitos activos.",
      eliminacion: "Renal/fecal según molécula; paliperidona depende más de eliminación renal.",
      ajusteRenal: "Revisar especialmente paliperidona y pacientes con enfermedad renal avanzada.",
      ajusteHepatico: "Titulación prudente si hepatopatía o polifarmacia con inhibidores/inductores CYP.",
      monitorizacion: ["Peso", "glucosa/HbA1c", "lípidos", "prolactina si aplica", "EPS/acatisia", "QTc si riesgo"],
      efectosAdversos: ["Síntomas extrapiramidales", "acatisia", "sedación", "aumento de peso", "síndrome metabólico", "hiperprolactinemia", "QT prolongado"],
      contraindicaciones: ["Síndrome neuroléptico maligno activo"],
      precauciones: ["Demencia", "Parkinson", "QT prolongado", "diabetes", "dislipidemia", "epilepsia", "hipotensión"],
      indicaciones: ["Psicosis", "manía", "agitación", "trastorno bipolar", "depresión resistente como coadyuvante según fármaco"]
    }
  },
  {
    clases: ["ieca", "inhibidor_enzima_convertidora_angiotensina"],
    datos: {
      mecanismoAccion: "Inhibición de la enzima convertidora de angiotensina, disminuyendo angiotensina II y aldosterona.",
      vidaMedia: "Variable; muchos tienen metabolitos activos.",
      inicioAccion: "Efecto antihipertensivo inicial en horas; efecto pleno puede requerir ajuste progresivo.",
      duracionAccion: "Generalmente permite dosificación diaria o cada 12 horas según molécula.",
      metabolismo: "Varios son profármacos convertidos a metabolitos activos; captopril no sigue el mismo patrón.",
      eliminacion: "Predominantemente renal para muchas moléculas y metabolitos activos.",
      ajusteRenal: "Revisar dosis y vigilar creatinina/eGFR, especialmente al iniciar o subir dosis.",
      ajusteHepatico: "Considerar conversión de profármacos en hepatopatía avanzada.",
      monitorizacion: ["Presión arterial", "creatinina/eGFR", "potasio", "tos/angioedema", "síntomas de hipotensión"],
      efectosAdversos: ["Tos", "hiperpotasemia", "hipotensión", "deterioro renal", "angioedema"],
      contraindicaciones: ["Embarazo", "antecedente de angioedema por IECA", "estenosis bilateral de arterias renales"],
      precauciones: ["Enfermedad renal crónica", "hiperpotasemia", "diuréticos ahorradores de potasio", "ARA-II o aliskireno"],
      indicaciones: ["Hipertensión", "nefroprotección seleccionada", "insuficiencia cardiaca", "cardiopatía isquémica según caso"]
    }
  },
  {
    clases: ["ara-ii", "ara2", "antagonista_receptor_angiotensina_ii"],
    datos: {
      mecanismoAccion: "Antagonismo del receptor AT1 de angiotensina II.",
      vidaMedia: "Variable por molécula.",
      inicioAccion: "Efecto antihipertensivo inicial en horas; estabilización con uso continuo.",
      duracionAccion: "Usualmente dosificación diaria, aunque depende de molécula y respuesta.",
      metabolismo: "Variable; losartán tiene metabolito activo, otras moléculas tienen menor biotransformación.",
      eliminacion: "Renal y biliar/fecal según molécula.",
      ajusteRenal: "Vigilar creatinina/eGFR y potasio; individualizar en daño renal avanzado.",
      ajusteHepatico: "Revisar molécula si hepatopatía porque puede cambiar exposición sistémica.",
      monitorizacion: ["Presión arterial", "creatinina/eGFR", "potasio", "mareo/hipotensión", "uso concomitante con IECA/aliskireno"],
      efectosAdversos: ["Hiperpotasemia", "hipotensión", "deterioro renal", "mareo"],
      contraindicaciones: ["Embarazo", "estenosis bilateral de arterias renales"],
      precauciones: ["Enfermedad renal crónica", "hiperpotasemia", "uso con IECA, aliskireno o ahorradores de potasio"],
      indicaciones: ["Hipertensión", "nefroprotección seleccionada", "insuficiencia cardiaca según molécula"]
    }
  },
  {
    clases: ["aine", "antiinflamatorio"],
    datos: {
      mecanismoAccion: "Inhibición de ciclooxigenasas y síntesis de prostaglandinas.",
      vidaMedia: "Variable por molécula.",
      inicioAccion: "Analgesia en horas; efecto antiinflamatorio requiere exposición sostenida según indicación.",
      duracionAccion: "Depende de molécula y formulación; naproxeno suele durar más que ibuprofeno.",
      metabolismo: "Predomina metabolismo hepático.",
      eliminacion: "Renal como metabolitos; el riesgo renal aumenta con hipovolemia, IECA/ARA-II o diuréticos.",
      ajusteRenal: "Evitar o usar con mucha cautela en enfermedad renal relevante o lesión renal aguda.",
      ajusteHepatico: "Precaución en hepatopatía y riesgo de sangrado.",
      monitorizacion: ["Dolor/sangrado gastrointestinal", "creatinina/eGFR", "presión arterial", "edema", "uso con anticoagulantes"],
      efectosAdversos: ["Gastritis", "sangrado gastrointestinal", "lesión renal aguda", "retención hídrica", "elevación de presión arterial"],
      contraindicaciones: ["Sangrado gastrointestinal activo", "insuficiencia renal grave", "hipersensibilidad a AINE"],
      precauciones: ["Anticoagulantes", "IECA/ARA-II/diuréticos", "insuficiencia cardiaca", "adulto mayor", "asma sensible a AINE"],
      indicaciones: ["Dolor", "inflamación", "fiebre según molécula"]
    }
  },
  {
    clases: ["antiepiléptico", "antiepileptico", "estabilizador"],
    datos: {
      mecanismoAccion: "Modulación de excitabilidad neuronal por canales iónicos, GABA, glutamato o proteínas vesiculares según molécula.",
      vidaMedia: "Variable por molécula; algunas requieren titulación y monitorización.",
      inicioAccion: "Depende de indicación; control de crisis puede requerir niveles o titulación, estabilización afectiva suele ser gradual.",
      duracionAccion: "Depende de vida media, formulación y unión a proteínas.",
      metabolismo: "Variable: hepático en valproato/carbamazepina/lamotrigina; renal predominante en gabapentinoides y levetiracetam.",
      eliminacion: "Variable por molécula; revisar función renal o hepática según fármaco.",
      ajusteRenal: "Necesario o recomendable en gabapentinoides, levetiracetam y otros con eliminación renal.",
      ajusteHepatico: "Crítico para valproato, carbamazepina y fármacos con metabolismo hepático relevante.",
      monitorizacion: ["Somnolencia/ataxia", "exantema", "BH/PFH si aplica", "sodio si carbamazepina/oxcarbazepina", "función renal si gabapentinoide/levetiracetam"],
      efectosAdversos: ["Somnolencia", "mareo", "ataxia", "alteraciones hepáticas o hematológicas según molécula", "exantema"],
      contraindicaciones: ["Hipersensibilidad al fármaco o síndrome cutáneo grave previo relacionado"],
      precauciones: ["Embarazo", "hepatopatía", "interacciones por CYP", "riesgo de exantema", "ideación suicida"],
      indicaciones: ["Epilepsia", "trastorno bipolar según molécula", "dolor neuropático según molécula"]
    }
  }
];

function normalizar(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function unico(lista = []) {
  return Array.from(new Set((lista || []).filter(Boolean)));
}

export function obtenerGrupoCie10(codigo = "") {
  const limpio = String(codigo || "").trim().toUpperCase();
  const letra = limpio.charAt(0);
  return GRUPOS_CIE10_BIBLIOTECA.find((grupo) => grupo.id === letra) || GRUPOS_CIE10_BIBLIOTECA[0];
}

export function obtenerPerfilDiagnostico(codigo = "") {
  const limpio = String(codigo || "").trim().toUpperCase();
  const grupo = obtenerGrupoCie10(limpio);
  const perfil = PERFIL_DIAGNOSTICO_POR_PREFIJO.find((item) =>
    item.prefijos.some((prefijo) => limpio.startsWith(prefijo.toUpperCase()))
  );
  return {
    grupoCie10: grupo,
    letraCie10: grupo.id === "todos" ? "" : grupo.id,
    criteriosOrientativos: CRITERIOS_BASE_POR_GRUPO[grupo.id] || CRITERIOS_BASE_POR_GRUPO.F,
    farmacosContraindicados: perfil?.contraindicados || [],
    farmacosPrecaucion: perfil?.precaucion || [],
    notaFarmacologica: perfil?.nota || "Revisar comorbilidades, alergias, función renal/hepática, embarazo/lactancia e interacciones antes de prescribir."
  };
}

export function enriquecerDiagnosticoClinico(dx = {}) {
  const perfil = obtenerPerfilDiagnostico(dx.codigo);
  return {
    ...dx,
    categoria: dx.categoria || perfil.grupoCie10.etiqueta,
    grupoCie10: perfil.grupoCie10.id,
    letraCie10: perfil.letraCie10,
    criterios: dx.criterios?.length ? dx.criterios : perfil.criteriosOrientativos,
    farmacosContraindicados: unico([...(dx.farmacosContraindicados || []), ...perfil.farmacosContraindicados]),
    farmacosPrecaucion: unico([...(dx.farmacosPrecaucion || []), ...perfil.farmacosPrecaucion]),
    notaFarmacologica: dx.notaFarmacologica || perfil.notaFarmacologica
  };
}

export function enriquecerMedicamentoClinico(medicamento = {}) {
  const textoClases = [
    medicamento.clase,
    ...(medicamento.therapeuticClasses || []),
    ...(medicamento.especialidades || []),
    medicamento.notas
  ].map(normalizar).join(" ");
  const perfil = PERFIL_FARMACOLOGICO_POR_CLASE.find((item) =>
    item.clases.some((clase) => textoClases.includes(normalizar(clase)))
  );
  if (!perfil) {
    return {
      ...medicamento,
      mecanismoAccion: medicamento.mecanismoAccion || medicamento.mechanismOfAction || "Consultar mecanismo específico en ficha técnica o referencia institucional.",
      vidaMedia: medicamento.vidaMedia || medicamento.halfLife || "Variable; consultar ficha técnica.",
      inicioAccion: medicamento.inicioAccion || medicamento.onset || "",
      duracionAccion: medicamento.duracionAccion || medicamento.duration || "",
      metabolismo: medicamento.metabolismo || medicamento.metabolism || "",
      eliminacion: medicamento.eliminacion || medicamento.elimination || "",
      ajusteRenal: medicamento.ajusteRenal || medicamento.renalAdjustment || "",
      ajusteHepatico: medicamento.ajusteHepatico || medicamento.hepaticAdjustment || "",
      monitorizacion: medicamento.monitorizacion || medicamento.monitoring || [],
      efectosAdversos: medicamento.efectosAdversos || medicamento.adverseEffects || [],
      indicaciones: medicamento.indicaciones || medicamento.indications || [],
      contraindicaciones: medicamento.contraindicaciones || medicamento.contraindications || [],
      precauciones: medicamento.precauciones || medicamento.precautions || medicamento.warnings || []
    };
  }
  const datos = perfil.datos;
  return {
    ...medicamento,
    mecanismoAccion: medicamento.mecanismoAccion || medicamento.mechanismOfAction || datos.mecanismoAccion,
    vidaMedia: medicamento.vidaMedia || medicamento.halfLife || datos.vidaMedia,
    inicioAccion: medicamento.inicioAccion || medicamento.onset || datos.inicioAccion,
    duracionAccion: medicamento.duracionAccion || medicamento.duration || datos.duracionAccion,
    metabolismo: medicamento.metabolismo || medicamento.metabolism || datos.metabolismo,
    eliminacion: medicamento.eliminacion || medicamento.elimination || datos.eliminacion,
    ajusteRenal: medicamento.ajusteRenal || medicamento.renalAdjustment || datos.ajusteRenal,
    ajusteHepatico: medicamento.ajusteHepatico || medicamento.hepaticAdjustment || datos.ajusteHepatico,
    monitorizacion: unico([...(medicamento.monitorizacion || medicamento.monitoring || []), ...(datos.monitorizacion || [])]),
    monitoring: unico([...(medicamento.monitoring || medicamento.monitorizacion || []), ...(datos.monitorizacion || [])]),
    efectosAdversos: unico([...(medicamento.efectosAdversos || medicamento.adverseEffects || []), ...datos.efectosAdversos]),
    indications: unico([...(medicamento.indications || []), ...datos.indicaciones]),
    indicaciones: unico([...(medicamento.indicaciones || medicamento.indications || []), ...datos.indicaciones]),
    contraindications: unico([...(medicamento.contraindications || []), ...datos.contraindicaciones]),
    contraindicaciones: unico([...(medicamento.contraindicaciones || medicamento.contraindications || []), ...datos.contraindicaciones]),
    precautions: unico([...(medicamento.precautions || []), ...(medicamento.warnings || []), ...datos.precauciones]),
    precauciones: unico([...(medicamento.precauciones || medicamento.precautions || []), ...(medicamento.warnings || []), ...datos.precauciones]),
    warnings: unico([...(medicamento.warnings || []), ...(medicamento.precautions || []), ...datos.precauciones])
  };
}
