export const CRITERIOS_DIAGNOSTICOS = [
  {
    codigo: "F32 / 6A60",
    nombre: "Episodio depresivo",
    categoria: "Estado de animo",
    criterios: [
      "Animo deprimido, perdida de interes o disminucion significativa de energia.",
      "Sintomas asociados: alteraciones de sueno/apetito, culpa, baja autoestima, concentracion reducida, enlentecimiento/agitación o ideacion suicida.",
      "Duracion clinicamente relevante y deterioro funcional.",
      "Descartar sustancias, duelo no complicado, condiciones medicas u otros trastornos primarios."
    ],
    psicoeducacion: "La depresion no es falta de voluntad; es un cuadro clinico tratable. El seguimiento combina tratamiento, activacion conductual, sueno, red de apoyo y medicion objetiva."
  },
  {
    codigo: "F33 / 6A70",
    nombre: "Trastorno depresivo recurrente",
    categoria: "Estado de animo",
    criterios: [
      "Historia de dos o mas episodios depresivos separados por periodos de mejoria.",
      "Evaluar gravedad actual, sintomas psicoticos, riesgo suicida y funcionamiento.",
      "Explorar bipolaridad antes de iniciar o ajustar antidepresivos.",
      "Planear prevencion de recaidas y continuidad terapeutica."
    ],
    psicoeducacion: "Las recaidas pueden prevenirse con seguimiento, adherencia, deteccion temprana de sintomas y un plan de crisis claro."
  },
  {
    codigo: "F31 / 6A40-6A41",
    nombre: "Trastorno bipolar",
    categoria: "Estado de animo",
    criterios: [
      "Presencia de episodios de mania, hipomania y/o depresion segun subtipo.",
      "Mania: elevacion/irritabilidad del animo con aumento de energia, menor necesidad de sueno, grandiosidad, verborrea, fuga de ideas, distractibilidad o conductas de riesgo.",
      "Valorar psicosis, riesgo, consumo de sustancias y antecedentes familiares.",
      "Evitar interpretar depresion recurrente sin tamizar historia de hipomania/mania."
    ],
    psicoeducacion: "El ritmo de sueno, la adherencia y la identificacion temprana de cambios de energia son pilares del autocuidado."
  },
  {
    codigo: "F20 / 6A20",
    nombre: "Esquizofrenia",
    categoria: "Psicosis",
    criterios: [
      "Sintomas psicoticos persistentes como delirios, alucinaciones, pensamiento desorganizado o experiencias de influencia/control.",
      "Deterioro funcional, sintomas negativos o alteraciones cognitivas pueden estar presentes.",
      "Descartar causas organicas, sustancias, trastorno afectivo primario y delirium.",
      "Valorar riesgo, red de apoyo, adherencia y rehabilitacion psicosocial."
    ],
    psicoeducacion: "La psicosis requiere atencion temprana, continuidad terapeutica, apoyo familiar y reduccion de recaidas."
  },
  {
    codigo: "F41.1 / 6B00",
    nombre: "Ansiedad generalizada",
    categoria: "Ansiedad",
    criterios: [
      "Preocupacion excesiva y dificil de controlar sobre multiples areas.",
      "Sintomas como inquietud, tension muscular, fatiga, irritabilidad, problemas de concentracion o sueno.",
      "Deterioro funcional y persistencia clinicamente significativa.",
      "Descartar hipertiroidismo, sustancias, ansiedad inducida por medicamentos u otros trastornos."
    ],
    psicoeducacion: "La ansiedad se trabaja con psicoeducacion, regulacion fisiologica, exposicion gradual, sueño y estrategias cognitivas."
  },
  {
    codigo: "F42 / 6B20",
    nombre: "Trastorno obsesivo compulsivo",
    categoria: "Ansiedad / TOC",
    criterios: [
      "Obsesiones intrusivas y/o compulsiones repetitivas.",
      "La persona intenta resistir o neutralizar pensamientos, imagenes o impulsos.",
      "Consumen tiempo o causan deterioro significativo.",
      "Diferenciar de psicosis, tics, ansiedad generalizada o personalidad obsesiva."
    ],
    psicoeducacion: "El TOC no se reduce a 'manias'; el tratamiento suele incluir exposicion con prevencion de respuesta y seguimiento."
  },
  {
    codigo: "F43.1 / 6B40",
    nombre: "Trastorno de estres postraumatico",
    categoria: "Trauma",
    criterios: [
      "Exposicion a evento traumatico.",
      "Reexperimentacion, evitacion, amenaza persistente/hipervigilancia y alteraciones cognitivas o emocionales.",
      "Deterioro funcional y persistencia posterior al evento.",
      "Valorar disociacion, depresion, consumo de sustancias y riesgo suicida."
    ],
    psicoeducacion: "Las reacciones postraumaticas son respuestas del sistema de amenaza. El tratamiento busca seguridad, regulacion y procesamiento gradual."
  },
  {
    codigo: "F10-F19 / 6C4x",
    nombre: "Trastornos por uso de sustancias",
    categoria: "Adicciones",
    criterios: [
      "Patron de consumo con perdida de control, craving, tolerancia, abstinencia o uso pese a consecuencias.",
      "Evaluar sustancia, cantidad, frecuencia, abstinencia, comorbilidad y riesgo medico.",
      "Explorar motivacion para cambio y red de apoyo.",
      "Plan de reduccion de danos, desintoxicacion o rehabilitacion segun gravedad."
    ],
    psicoeducacion: "El consumo problematico es tratable. La recuperacion combina seguridad, plan terapeutico, apoyo y prevencion de recaidas."
  }
];

export const PSICOEDUCACION = [
  {
    titulo: "Higiene del sueno",
    tema: "Sueno",
    texto: "Mantener horarios regulares, reducir pantallas antes de dormir, evitar cafeina tarde y usar la cama principalmente para dormir."
  },
  {
    titulo: "Activacion conductual",
    tema: "Depresion",
    texto: "Programar actividades pequenas, valiosas y realistas ayuda a recuperar energia, estructura y sensacion de logro."
  },
  {
    titulo: "Respiracion y regulacion",
    tema: "Ansiedad",
    texto: "La respiracion lenta, la relajacion muscular y el anclaje sensorial reducen activacion fisiologica en crisis de ansiedad."
  },
  {
    titulo: "Adherencia al tratamiento",
    tema: "Tratamiento",
    texto: "Tomar medicamentos segun indicacion, reportar efectos adversos y no suspender sin supervision reduce recaidas."
  },
  {
    titulo: "Plan de crisis",
    tema: "Seguridad",
    texto: "Identificar senales de alarma, contactos de apoyo, servicios de urgencia y pasos concretos ante riesgo."
  }
];
