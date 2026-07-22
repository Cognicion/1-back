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
    nombre: "Trastorno de Ansiedad generalizada",
    categoria: "Ansiedad",
    criterios: [
      "A) Presencia de un período de por lo menos 6 meses con tensión prominente, preocupación y aprensión sobre los acontecimientos y problemas de la vida diaria.",
      "B) Presencia de al menos 4 de los síntomas lsitados a continuación, de los cuales por lo menos uno de ellos debe ser del grupo 1-4:",
      "Síntomas autonómicos:",
      " 1) Palpitaciones o golpeo del corazón o ritmo cardiaco acelerado.",
      " 2) Sudoración.",
      " 3) Temblores o sacudidas.",
      " 4) Sequedad de boca (no debida a medicación o deshidratación).",
      " Síntomas relacionados con el pecho y abdomen:",
      " 5) Dificultad para respirar.",
      " 6) Sensación de ahogo.",
      " 7) Dolor o molestias en el pecho.",
      " 8) Náuseas o malestar abdominal (p. ej., estómago revuelto).",
      "Síntomas relacionados con el estado mental:",
      " 9) Sensación de mareo, inestabilidad o desvanecimiento.",
      " 10) Sensación de que los objetos son irreales (desrealización) o de que uno mismo está distante o no realmente aquí (despersonalización).", 
      " 11) Miedo a perder el control, a perder la conciencia o volverse loco.",
      " 12) Miedo a morir.",
      "Síntomas generales:",
      " 13) Sofocos de calor o escalofríos.",
      " 14) aturdimiento o sensación de hormigueo (parestesias).",
      " 15) Tensión, dolores o molestias musculares.",
      " 16) Inquietud e incapacidad para relajrse.",
      " 17) sentimientos de estar al límite o bajo presión, o de tensión mental",
      " 18) Sensación de nudo en la garganta o dificultad para tragar.",
      "Otros síntomas no específicos:",
      " 19) Respuesta exagerada a pequeñas sorpresas o sobresaltos.",
      " 20) Dificultad para concentrarse o de mente en blanco, a causa de la preocupación o de la ansiedad.",
      " 21) Irritabilidad persistente",
      " 22) Dificultad para conciliar el sueño debido a las preocupaciones."
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
  },

  {
    codigo: "F60.5 /6D10+6D11.4",
    nombre: "Trastorno ansioso anancástico de la personalidad //Trastorno de la personalidad, con rasgo prominente de anancastia",
    categoria: "Trastornos de la personalidad",
    criterios: ["CIE10",
      "A) Deben cumplirse los criterios generales para el diagnostico de trastorno de la personalidad.",
      "B) Deben cumplirse al menos cuatro de los siguientes síntomas:", 
      "1) Sentimientos de duda, y preocupaciones excesivas.",
      "2) Preocupación por detalles, listas, reglas, organización u horarios",
      "3) Perfeccionismo que interfiere con la finalización de tareas.",
      "4) Rectitud y escrupolosidad excesivos",
      "5) Preocupación injustificada por la productividad, hasta el extremo de renunciar a actividades placenteras y relaciones itnerpersonales", 
      "6) Excesiva pedantería y adhesión a las convenciones sociales",
      "7) Rigidez y obstinación",
      "8) Insistencia irracional se sometan a la propia rutina de ahcer las cosas o resistencia irracional a permitir que los demás realicen sus tareas"
    ],
    psicoeducacion: "Brindar información sobre el trastorno anancástico de la personalidad, sus características clínicas y el impacto del perfeccionismo, la rigidez cognitiva y la necesidad de control en el funcionamiento cotidiano; promover el reconocimiento de pensamientos disfuncionales, favorecer el desarrollo de estrategias de flexibilización cognitiva, tolerancia a la incertidumbre y manejo de la ansiedad, reforzando la importancia de la adherencia al tratamiento psicoterapéutico y farmacológico cuando esté indicado."
  },


  {
    codigo: "F60.6 / 6D11.1",
    nombre: "Trastorno ansioso (evitativo) de la personalidad",
    categoria: "Trastornos de la personalidad",
    criterios: [
      "A) Deben cumplirse los criterios generales para el diagnostico de trastorno de la personalidad.",
      "B) Deben cumplirse al menos cuatro de los siguientes síntomas:", 
      "1) Evita actividades laborales o escolares que impliquen un contacto interpersonal significativo, por temor a la critica, desaprobacion o rechazo.", 
      "2) Esta reacio a implicarse con personas, a menos que este seguro de ser aceptado.",
      "3) Muestra restriccion en las relaciones interpersonales debido al miedo a ser avergonzado o ridiculizado.", 
      "4) Preocupacion por ser criticado o rechazado en situaciones sociales.",
      "5) Inhibicion en situaciones interpersonales nuevas debido a sentimientos de inferioridad.", 
      "6) Se ve a si mismo como socialmente inepto, personalmente poco atractivo o inferior a los demas.", 
      "7) Es extraordinariamente reacio a asumir riesgos personales o a implicarse en nuevas actividades debido a que pueden resultar embarazosas.", 
    ],
    psicoeducacion: "Brindar información sobre el trastorno evitativo de la personalidad, sus características clínicas y el papel de la evitación en el mantenimiento de los síntomas; promover el reconocimiento de pensamientos disfuncionales relacionados con el rechazo y la baja autoestima, reforzar estrategias de afrontamiento, habilidades sociales y la importancia de la adherencia al tratamiento psicoterapéutico y farmacológico cuando esté indicado."
  },


  {
    codigo: "F84.0 / Pendiente CIE 111",
    nombre: "Autismo infantil",
    categoria: "Trastornos generalizados del desarrollo",
    criterios: [
      "A) Presencia de un desarrollo anormal o alterado desde antes de los 3 años de edad, que se presenta en una de las siguientes áreas:",
      "  1) Lenguaje receptivo o expresivo utilizado en la comunicación social.",
      "  2) Desarrollo de lazos sociales selectivos o interacción social recíproca.",
      "  3) Juego simbólico y funcional",
      "B) Deben estar presentes al menos 6 síntomas de 1, 2 y 3, incluyendo al menos dos de 1, uno de 2 y uno de 3.",
      "  1.Alteraciones cualitativas en la interacción social que se manifiestan al menos en dos de las siguientes áreas:",
      "    a) Fracaso en la utilización adecuada del contacto visual, la expresión facial, la postura corporal y los gestos para regular la interacción social.",
      "    b) Fracaso en el desarrollo (adecuado a la edad mental y a pesar de tener ocasiones para ello) de relaciones con personas de su edad que impliquen compartir intereses, actividades y emociones",
      "    c) Ausencia de reciprocidad socioemocional, puesta de manifiesto por una respuesta alterada o anormal hacia las emociones de otras personas, o falta de modulación del comportamiento en respuesta al contexto social o débil integración de los comportamientos social, emocional y comunicativo",
      "    d) Falta de interés en compartir las alegrías, los intereses o los logros con otros individuos (p. ej., falta de interés en mostrar, traer hacia sí o señalar a otras personas objetos de interés para el niñoo).",
      "  2. Alteraciones cualitativas en la comunicación que se manifiestan en al menos una de las siguientes áreas:",
      "    a) Retraso o ausencia del desarrollo del lenguaje hablado, aunque no se acompaña de intentos de compensación mediante el recurso de la utilización de gestos alternativos para comunicarse (a menudo precedido por la falta de balbuceo comunicativo",
      "    b) Fracaso relativo para iniciar o mantener una conversación (cualquiera que sea el nivel de competencia en la utilización del lenguaje alcanzado), en la que es necesario el intercambio de respuestas con el interlocutor",
      "    c) Uso estereotipado y repetitivo del lenguaje o uso idiosincrásico de palabras o frases",
      "    d) Ausencia de juegos de simulación espontáneos (en edades tempranas) o de juego social imitativo",
      "  3. Patrones de comportamientos, intereses y actividades restringidas, repetitivas y estereotipadas, que se manifiestan en al menos una de las siguientes áreas:",
      "    a) Preocupación limitada a uno o más comportamientos estereotipados que son anormales en su contenido. En ocasiones el comportamiento no es anormal en sí, pero sí lo es la intensidad y el carácter restrictivo con que se produce.",
      "    b) Existe, en apariencia, una adherencia a rutinas o rituales específicos y carentes de sentido.",
      "    c) Manierismos motores estereotipados y repetitivos que pueden consisitir en palmadas o retorcimientos de las manos o dedos, o movimientos complejos de todo el cuerpo",
      "    d) Preocupaciones por partes de objetos o por elementos carentes de funcionalidad de los objetos de juego (tales como el olor, la textura de su superficie, el ruido o la vibración que producen)",
      "C) El cuadro clínico no puede atribuirse a otras variedades del trastorno generalizado del desarrollo, a un trastorno específico del desarrollo de la comprensión del lenguaje (F80.2) con problemas socioemocionales secundarios, a trastorno reactivo de la vinculación de la infancia (F94.1), a trastorno de la vinculación de la infancia tipo desinhibido (F94.2), a retraso mental (F70-72) acompañado de trastornos de las emociones y del comportamiento, a esquizofrenia (F20) de comienzo excepcionalmente precoz, ni a síndrome de Rett"
    ],
    psicoeducacion: "Brindar información sobre el trastorno evitativo de la personalidad, sus características clínicas y el papel de la evitación en el mantenimiento de los síntomas; promover el reconocimiento de pensamientos disfuncionales relacionados con el rechazo y la baja autoestima, reforzar estrategias de afrontamiento, habilidades sociales y la importancia de la adherencia al tratamiento psicoterapéutico y farmacológico cuando esté indicado."
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
