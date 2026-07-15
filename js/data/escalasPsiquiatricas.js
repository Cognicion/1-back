export const ESCALAS_PSIQUIATRICAS = [
  {
    id: "phq9",
    nombre: "PHQ-9",
    area: "Depresión",
    descripcion: "Tamizaje y seguimiento de síntomás depresivos en las últimas 2 semanas.",
    rango: "0-27",
    opciones: ["Nunca", "Varios días", "Más de la mitad de los días", "Casi todos los días"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 4, texto: "Mínimo" },
      { max: 9, texto: "Leve" },
      { max: 14, texto: "Moderado" },
      { max: 19, texto: "Moderadamente grave" },
      { max: 27, texto: "Grave" }
    ],
    items: [
      "Poco interés o placer en hacer cosas.",
      "Sentirse triste, deprimido o sin esperanza.",
      "Problemas para dormir o dormir demasiado.",
      "Cansancio o poca energía.",
      "Poco apetito o comer en exceso.",
      "Sentirse mal consigo mismo o que ha fallado.",
      "Dificultad para concentrarse.",
      "Moverse o hablar lento, o estar inquieto.",
      "Pensamientos de muerte o autolesión."
    ]
  },
  {
    id: "gad7",
    nombre: "GAD-7",
    area: "Ansiedad",
    descripcion: "Tamizaje y seguimiento de ansiedad generalizada en las últimas 2 semanas.",
    rango: "0-21",
    opciones: ["Nunca", "Varios días", "Más de la mitad de los días", "Casi todos los días"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 4, texto: "Mínimo" },
      { max: 9, texto: "Leve" },
      { max: 14, texto: "Moderado" },
      { max: 21, texto: "Grave" }
    ],
    items: [
      "Sentirse nervioso, ansioso o al límite.",
      "No poder parar o controlar la preocupación.",
      "Preocuparse demasiado por diferentes cosas.",
      "Dificultad para relajarse.",
      "Estar tan inquieto que es difícil quedarse quieto.",
      "Irritarse o molestarse con facilidad.",
      "Sentir miedo como si algo terrible pudiera pasar."
    ]
  },
  {
    id: "isi",
    nombre: "ISI",
    area: "Insomnio",
    descripcion: "Índice de severidad del insomnio.",
    rango: "0-28",
    opciones: ["Nada", "Leve", "Moderado", "Severo", "Muy severo"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 7, texto: "Sin insomnio clínico" },
      { max: 14, texto: "Subclínico" },
      { max: 21, texto: "Moderado" },
      { max: 28, texto: "Severo" }
    ],
    items: [
      "Dificultad para conciliar el sueño.",
      "Dificultad para mantener el sueño.",
      "Despertar demasiado temprano.",
      "Satisfacción con el patrón actual de sueño.",
      "Interferencia del sueño con funcionamiento diario.",
      "Percepción de otros sobre deterioro por sueño.",
      "Preocupacion por el problema de sueño."
    ]
  },
  {
    id: "auditc",
    nombre: "AUDIT-C",
    area: "Alcohol",
    descripcion: "Tamizaje breve de consumo de alcohol.",
    rango: "0-12",
    opciones: ["0", "1", "2", "3", "4"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 2, texto: "Bajo riesgo" },
      { max: 4, texto: "Riesgo posible" },
      { max: 12, texto: "Riesgo elevado" }
    ],
    items: [
      "Frecuencia de consumo de alcohol.",
      "Cantidad habitual en un día de consumo.",
      "Frecuencia de consumo elevado en una ocasión."
    ]
  },
  {
    id: "asrs6",
    nombre: "ASRS-6",
    area: "TDAH adulto",
    descripcion: "Tamizaje breve de síntomas compatibles con TDAH en adultos.",
    rango: "0-24",
    opciones: ["Nunca", "Rara vez", "A veces", "Frecuente", "Muy frecuente"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 10, texto: "Baja probabilidad" },
      { max: 16, texto: "Probabilidad intermedia" },
      { max: 24, texto: "Probabilidad elevada" }
    ],
    items: [
      "Dificultad para terminar detalles finales de proyectos.",
      "Dificultad para organizar tareas.",
      "Problemas para recordar citas u obligaciones.",
      "Evita iniciar tareas que requieren esfuerzo mental.",
      "Mueve manos/pies o se inquieta al estar sentado.",
      "Se siente demasiado activo o impulsado por un motor."
    ]
  },
  {
    id: "pss10",
    nombre: "PSS-10",
    area: "Estrés percibido",
    descripcion: "Percepción de estres durante el último mes.",
    rango: "0-40",
    opciones: ["Nunca", "Casi nunca", "A veces", "Con frecuencia", "Muy frecuente"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 13, texto: "Bajo" },
      { max: 26, texto: "Moderado" },
      { max: 40, texto: "Alto" }
    ],
    items: [
      "Se sintió afectado por algo inesperado.",
      "Sintió que no podía controlar cosas importantes.",
      "Se sintió nervioso o estresado.",
      "Sintió confianza para manejar problemas personales.",
      "Sintió que las cosas iban bien.",
      "Sintió que no podía afrontar todo lo que tenía que hacer.",
      "Pudo controlar irritaciones de su vida.",
      "Sintió que tenía todo bajo control.",
      "Se enojo por cosas fuera de su control.",
      "Sintió que las dificultades se acumulaban demasiado."
    ]
  },
  {
    id: "pcl5",
    nombre: "PCL-5",
    area: "Estrés postraumático",
    descripcion: "Seguimiento de síntomas postraumáticos. Requiere interpretación clínica.",
    rango: "0-80",
    opciones: ["Nada", "Un poco", "Moderado", "Bastante", "Extremo"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 30, texto: "Bajo / subumbral" },
      { max: 80, texto: "Elevado; valorar clínicamente" }
    ],
    items: [
      "Recuerdos intrusivos del evento.",
      "Sueños perturbadores relacionados.",
      "Sentir o actuar como si el evento ocurriera de nuevo.",
      "Malestar intenso ante recordatorios.",
      "Reacciones físicas ante recordatorios.",
      "Evitar recuerdos o sentimientos.",
      "Evitar recordatorios externos.",
      "Dificultad para recordar partes importantes.",
      "Creencias negativas persistentes.",
      "Culpa persistente sobre el evento.",
      "Emociones negativas intensas.",
      "Pérdida de interés.",
      "Sentirse distante de otros.",
      "Dificultad para sentir emociones positivas.",
      "Irritabilidad o enojo.",
      "Conducta riesgosa.",
      "Hipervigilancia.",
      "Sobresalto exagerado.",
      "Problemas de concentración.",
      "Problemás de sueño."
    ]
  },
  {
    id: "who5",
    nombre: "WHO-5",
    area: "Bienestar",
    descripcion: "Índice breve de bienestar subjetivo.",
    rango: "0-25",
    opciones: ["Nunca", "Algunas veces", "Menos de la mitad", "Más de la mitad", "Casi siempre", "Siempre"],
    valores: [0, 1, 2, 3, 4, 5],
    puntosCorte: [
      { max: 12, texto: "Bienestar bajo; considerar evaluación" },
      { max: 25, texto: "Bienestar adecuado" }
    ],
    items: [
      "Me he sentido alegre y de buen ánimo.",
      "Me he sentido tranquilo y relajado.",
      "Me he sentido activo y con energía.",
      "Me he despertado fresco y descansado.",
      "Mi vida diaria ha estado llena de cosas interésantes."
    ]
  },
  {
    id: "mdq",
    nombre: "MDQ",
    area: "Bipolaridad",
    descripcion: "Tamizaje de síntomás de espectro bipolar. Requiere entrevista clínica confirmatoria.",
    rango: "0-13",
    opciones: ["No", "Sí"],
    valores: [0, 1],
    puntosCorte: [
      { max: 6, texto: "Tamizaje negativo o bajo" },
      { max: 13, texto: "Tamizaje positivo posible; valorar clínicamente" }
    ],
    items: [
      "Periodo con ánimo tan elevado que otros lo notaron.",
      "Irritabilidad marcada o discusiones frecuentes.",
      "Mayor confianza o grandiosidad.",
      "Menor necesidad de dormir.",
      "Hablar mas o mas rapido.",
      "Pensamientos acelerados.",
      "Distractibilidad marcada.",
      "Aumento de energía.",
      "Mayor actividad social.",
      "Mayor interés sexual.",
      "Conductas inusuales o riesgosas.",
      "Gastos excesivos o problemas por decisiónes impulsivas.",
      "Estos síntomas ocurrieron en el mismo periodo."
    ]
  },
  {
    id: "cssrs_screener",
    nombre: "C-SSRS breve",
    area: "Riesgo suicida",
    descripcion: "Tamizaje breve de ideación/conducta suicida. Cualquier respuesta positiva requiere valoración inmediata.",
    rango: "0-6",
    opciones: ["No", "Sí"],
    valores: [0, 1],
    puntosCorte: [
      { max: 0, texto: "Sin datos positivos en tamizaje" },
      { max: 6, texto: "Dato positivo; requiere evaluación de riesgo" }
    ],
    items: [
      "Ha deseado estar muerto o no despertar.",
      "Ha tenido pensamientos de quitarse la vida.",
      "Ha pensado en algún metodo.",
      "Ha tenido intención de actuar sobre esos pensamientos.",
      "Ha elaborado un plan.",
      "Ha realizado preparativos o intento."
    ]
  },
  {
    id: "epds",
    nombre: "EPDS",
    area: "Depresión perinatal",
    descripcion: "Tamizaje de depresión en embarazo/posparto. Requiere interpretación clínica.",
    rango: "0-30",
    opciones: ["0", "1", "2", "3"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 9, texto: "Bajo" },
      { max: 12, texto: "Posible depresión" },
      { max: 30, texto: "Elevado; valorar clínicamente" }
    ],
    items: [
      "Capacidad para reír y ver el lado bueno.",
      "Mirar al futuro con ilusión.",
      "Culparse innecesariamente.",
      "Ansiedad o preocupación sin motivo claro.",
      "Miedo o pánico sin razón suficiente.",
      "Sentirse sobrepasada.",
      "Dificultad para dormir por tristeza.",
      "Sentirse triste o desgraciada.",
      "Llorar por tristeza.",
      "Pensamientos de hacerse daño."
    ]
  },
  {
    id: "whodas12",
    nombre: "WHODAS 2.0-12",
    area: "Funcionamiento",
    descripcion: "Evaluación breve de funcionamiento y discapacidad percibida.",
    rango: "0-48",
    opciones: ["Ninguna", "Leve", "Moderada", "Severa", "Extrema"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 12, texto: "Dificultad baja" },
      { max: 24, texto: "Dificultad moderada" },
      { max: 48, texto: "Dificultad alta" }
    ],
    items: [
      "Estar de pie por largos periodos.",
      "Cumplir responsabilidades del hogar.",
      "Aprender una nueva tarea.",
      "Participar en actividades comunitarias.",
      "Impacto emocional de problemas de salud.",
      "Concentrarse durante diez minutos.",
      "Caminar largas distancias.",
      "Bañarse o vestirse.",
      "Relacionarse con desconocidos.",
      "Mantener amistades.",
      "Trabajo o escuela.",
      "Participación familiar o social."
    ]
  },
  {
    id: "yale_brown_breve",
    nombre: "Y-BOCS breve",
    area: "TOC",
    descripcion: "Seguimiento breve de obsesiones y compulsiones; no reemplaza Y-BOCS clínica completa.",
    rango: "0-20",
    opciones: ["Nada", "Leve", "Moderado", "Severo", "Extremo"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 7, texto: "Leve" },
      { max: 15, texto: "Moderado" },
      { max: 20, texto: "Severo" }
    ],
    items: [
      "Tiempo ocupado por obsesiones.",
      "Interferencia por obsesiones.",
      "Malestar por obsesiones.",
      "Tiempo ocupado por compulsiones.",
      "Interferencia/malestar por compulsiones."
    ]
  },
  {
    id: "ciwa_ar",
    nombre: "CIWA-Ar",
    area: "Abstinencia alcohólica",
    descripcion: "Evaluación de la gravedad del síndrome de abstinencia alcohólica.",
    introduccion: "La CIWA-Ar ayuda a cuantificar la intensidad de la abstinencia alcohólica y orientar la vigilancia clínica. Debe interpretarse junto con signos vitales, comorbilidades, riesgo de delirium, convulsiones y juicio médico.",
    rango: "0-67",
    consideraciones: [
      "Valorar riesgo de delirium tremens, crisis convulsivas, deshidratación y alteraciones hidroelectrolíticas.",
      "El puntaje no sustituye la exploración física, el estado mental ni la valoración médica.",
      "Repetir de forma seriada si el paciente se encuentra en periodo de riesgo."
    ],
    puntosCorte: [
      { max: 9, texto: "Abstinencia leve o mínima" },
      { max: 18, texto: "Abstinencia moderada" },
      { max: 67, texto: "Abstinencia grave; requiere valoración estrecha" }
    ],
    items: [
      {
        texto: "Náusea y vómito.",
        opciones: ["Ausente", "Leve", "2", "3", "Intermitente", "5", "6", "Náusea constante o vómito repetido"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Temblor.",
        opciones: ["Ausente", "No visible, pero palpable", "2", "3", "Moderado con brazos extendidos", "5", "6", "Severo incluso sin extender brazos"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Sudoración paroxística.",
        opciones: ["Ausente", "Sudoración apenas perceptible", "2", "3", "Sudoración facial", "5", "6", "Sudoración profusa"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Ansiedad.",
        opciones: ["Sin ansiedad", "Leve", "2", "3", "Moderada", "5", "6", "Equivalente a pánico agudo"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Agitación.",
        opciones: ["Actividad normal", "Leve inquietud", "2", "3", "Moderadamente inquieto", "5", "6", "Se mueve constantemente"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Alteraciones táctiles.",
        opciones: ["Ausentes", "Muy leves", "Leves", "Moderadas", "Moderadamente severas", "Severas", "Muy severas", "Alucinaciones táctiles continuas"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Alteraciones auditivas.",
        opciones: ["Ausentes", "Muy leves", "Leves", "Moderadas", "Moderadamente severas", "Severas", "Muy severas", "Alucinaciones auditivas continuas"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Alteraciones visuales.",
        opciones: ["Ausentes", "Muy leves", "Leves", "Moderadas", "Moderadamente severas", "Severas", "Muy severas", "Alucinaciones visuales continuas"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Cefalea o plenitud cefálica.",
        opciones: ["Ausente", "Muy leve", "Leve", "Moderada", "Moderadamente severa", "Severa", "Muy severa", "Extremadamente severa"],
        valores: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      {
        texto: "Orientación y obnubilación del sensorio.",
        opciones: ["Orientado y puede hacer cálculos seriados", "No puede hacer cálculos seriados", "Desorientado en fecha por menos de 2 días", "Desorientado en fecha por más de 2 días", "Desorientado en lugar o persona"],
        valores: [0, 1, 2, 3, 4]
      }
    ]
  },
  {
    id: "ciwa_b",
    nombre: "CIWA-B",
    area: "Abstinencia benzodiacepínica",
    descripcion: "Evaluación de la gravedad de la abstinencia por benzodiacepinas.",
    introduccion: "La CIWA-B organiza síntomas frecuentes de abstinencia por benzodiacepinas. Es una herramienta de apoyo y debe interpretarse en conjunto con dosis previa, vida media del fármaco, tiempo de consumo, comorbilidades, riesgo convulsivo y juicio clínico.",
    rango: "0-88",
    opciones: ["Ausente", "Leve", "Moderado", "Severo", "Muy severo"],
    valores: [0, 1, 2, 3, 4],
    consideraciones: [
      "La retirada de benzodiacepinas debe individualizarse y evitar suspensiones bruscas en pacientes con dependencia.",
      "Vigilar convulsiones, delirium, descompensación psiquiátrica, ideación suicida y síntomas autonómicos intensos.",
      "La escala apoya el seguimiento, pero no sustituye la decisión clínica ni protocolos institucionales."
    ],
    puntosCorte: [
      { max: 20, texto: "Abstinencia leve o síntomas bajos" },
      { max: 40, texto: "Abstinencia moderada" },
      { max: 88, texto: "Abstinencia severa; requiere valoración estrecha" }
    ],
    items: [
      "Ansiedad o nerviosismo.",
      "Irritabilidad.",
      "Inquietud o agitacion.",
      "Sensación de pánico.",
      "ánimo bajo o disforia.",
      "Dificultad para conciliar o mantener el sueño.",
      "Pesadillas o sueño no reparador.",
      "Fatiga o debilidad.",
      "Dificultad para concentrarse.",
      "Alteraciones de memoria.",
      "Temblor.",
      "Sudoración.",
      "Palpitaciones o taquicardía referida.",
      "Náusea, vómito o malestar gastrointestinal.",
      "Pérdida de apetito.",
      "Cefalea.",
      "Dolor, rigidez o espasmos musculares.",
      "Parestesias, hormigueo o sensación de quemazón.",
      "Hipersensibilidad a luz, sonido o tacto.",
      "Mareo o inestabilidad.",
      "Despersonalización, desrealización o sensación de irrealidad.",
      "Alteraciones perceptivas o confusionales."
    ]
  },
  {
    id: "bush-francis",
    nombre: "Bush-Francis Catatonia Rating Scale",
    area: "Catatonia",
    descripcion: "Escala clínica para tamizaje y seguimiento de signos catatónicos. Debe aplicarse por personal clínico entrenado.",
    rango: "0-69",
    opciones: ["Ausente", "Leve", "Moderado", "Severo"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 1, texto: "Sin datos suficientes de catatonia en esta captura" },
      { max: 6, texto: "Datos leves; valorar exploración clínica dirigida" },
      { max: 18, texto: "Catatonia probable; requiere integración clínica" },
      { max: 69, texto: "Catatonia marcada; valorar manejo urgente según contexto" }
    ],
    items: [
      "Inmovilidad / estupor.",
      "Mutismo.",
      "Mirada fija.",
      "Posturas o catalepsia.",
      "Rigidez.",
      "Negativismo.",
      "Flexibilidad cérea.",
      "Retraimiento.",
      "Excitación.",
      "Impulsividad.",
      "Obediencia automática.",
      "Mitgehen.",
      "Gegenhalten.",
      "Ambitendencia.",
      "Grasp reflex.",
      "Perseveración.",
      "Estereotipias.",
      "Manierismos.",
      "Verbigeración.",
      "Rigidez autonómica / signos vegetativos.",
      "Combatividad.",
      "Ecolalia.",
      "Ecopraxia."
    ]
  }
];

export function interpretarEscala(escala, puntaje) {
  const corte = escala.puntosCorte.find((item) => puntaje <= item.max);
  return corte ? corte.texto : "Requiere interpretación clínica";
}
