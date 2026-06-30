export const ESCALAS_PSIQUIATRICAS = [
  {
    id: "phq9",
    nombre: "PHQ-9",
    area: "Depresion",
    descripcion: "Tamizaje y seguimiento de sintomas depresivos en las ultimas 2 semanas.",
    rango: "0-27",
    opciones: ["Nunca", "Varios dias", "Mas de la mitad de los dias", "Casi todos los dias"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 4, texto: "Minimo" },
      { max: 9, texto: "Leve" },
      { max: 14, texto: "Moderado" },
      { max: 19, texto: "Moderadamente grave" },
      { max: 27, texto: "Grave" }
    ],
    items: [
      "Poco interes o placer en hacer cosas.",
      "Sentirse triste, deprimido o sin esperanza.",
      "Problemas para dormir o dormir demasiado.",
      "Cansancio o poca energia.",
      "Poco apetito o comer en exceso.",
      "Sentirse mal consigo mismo o que ha fallado.",
      "Dificultad para concentrarse.",
      "Moverse o hablar lento, o estar inquieto.",
      "Pensamientos de muerte o autolesion."
    ]
  },
  {
    id: "gad7",
    nombre: "GAD-7",
    area: "Ansiedad",
    descripcion: "Tamizaje y seguimiento de ansiedad generalizada en las ultimas 2 semanas.",
    rango: "0-21",
    opciones: ["Nunca", "Varios dias", "Mas de la mitad de los dias", "Casi todos los dias"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 4, texto: "Minimo" },
      { max: 9, texto: "Leve" },
      { max: 14, texto: "Moderado" },
      { max: 21, texto: "Grave" }
    ],
    items: [
      "Sentirse nervioso, ansioso o al limite.",
      "No poder parar o controlar la preocupacion.",
      "Preocuparse demasiado por diferentes cosas.",
      "Dificultad para relajarse.",
      "Estar tan inquieto que es dificil quedarse quieto.",
      "Irritarse o molestarse con facilidad.",
      "Sentir miedo como si algo terrible pudiera pasar."
    ]
  },
  {
    id: "isi",
    nombre: "ISI",
    area: "Insomnio",
    descripcion: "Indice de severidad del insomnio.",
    rango: "0-28",
    opciones: ["Nada", "Leve", "Moderado", "Severo", "Muy severo"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 7, texto: "Sin insomnio clinico" },
      { max: 14, texto: "Subclinico" },
      { max: 21, texto: "Moderado" },
      { max: 28, texto: "Severo" }
    ],
    items: [
      "Dificultad para conciliar el sueno.",
      "Dificultad para mantener el sueno.",
      "Despertar demasiado temprano.",
      "Satisfaccion con el patron actual de sueno.",
      "Interferencia del sueno con funcionamiento diario.",
      "Percepcion de otros sobre deterioro por sueno.",
      "Preocupacion por el problema de sueno."
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
      "Cantidad habitual en un dia de consumo.",
      "Frecuencia de consumo elevado en una ocasion."
    ]
  },
  {
    id: "asrs6",
    nombre: "ASRS-6",
    area: "TDAH adulto",
    descripcion: "Tamizaje breve de sintomas compatibles con TDAH en adultos.",
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
    area: "Estres percibido",
    descripcion: "Percepcion de estres durante el ultimo mes.",
    rango: "0-40",
    opciones: ["Nunca", "Casi nunca", "A veces", "Con frecuencia", "Muy frecuente"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 13, texto: "Bajo" },
      { max: 26, texto: "Moderado" },
      { max: 40, texto: "Alto" }
    ],
    items: [
      "Se sintio afectado por algo inesperado.",
      "Sintio que no podia controlar cosas importantes.",
      "Se sintio nervioso o estresado.",
      "Sintio confianza para manejar problemas personales.",
      "Sintio que las cosas iban bien.",
      "Sintio que no podia afrontar todo lo que tenia que hacer.",
      "Pudo controlar irritaciones de su vida.",
      "Sintio que tenia todo bajo control.",
      "Se enojo por cosas fuera de su control.",
      "Sintio que las dificultades se acumulaban demasiado."
    ]
  },
  {
    id: "pcl5",
    nombre: "PCL-5",
    area: "Estres postraumatico",
    descripcion: "Seguimiento de sintomas postraumaticos. Requiere interpretacion clinica.",
    rango: "0-80",
    opciones: ["Nada", "Un poco", "Moderado", "Bastante", "Extremo"],
    valores: [0, 1, 2, 3, 4],
    puntosCorte: [
      { max: 30, texto: "Bajo / subumbral" },
      { max: 80, texto: "Elevado; valorar clinicamente" }
    ],
    items: [
      "Recuerdos intrusivos del evento.",
      "Suenos perturbadores relacionados.",
      "Sentir o actuar como si el evento ocurriera de nuevo.",
      "Malestar intenso ante recordatorios.",
      "Reacciones fisicas ante recordatorios.",
      "Evitar recuerdos o sentimientos.",
      "Evitar recordatorios externos.",
      "Dificultad para recordar partes importantes.",
      "Creencias negativas persistentes.",
      "Culpa persistente sobre el evento.",
      "Emociones negativas intensas.",
      "Perdida de interes.",
      "Sentirse distante de otros.",
      "Dificultad para sentir emociones positivas.",
      "Irritabilidad o enojo.",
      "Conducta riesgosa.",
      "Hipervigilancia.",
      "Sobresalto exagerado.",
      "Problemas de concentracion.",
      "Problemas de sueno."
    ]
  },
  {
    id: "who5",
    nombre: "WHO-5",
    area: "Bienestar",
    descripcion: "Indice breve de bienestar subjetivo.",
    rango: "0-25",
    opciones: ["Nunca", "Algunas veces", "Menos de la mitad", "Mas de la mitad", "Casi siempre", "Siempre"],
    valores: [0, 1, 2, 3, 4, 5],
    puntosCorte: [
      { max: 12, texto: "Bienestar bajo; considerar evaluacion" },
      { max: 25, texto: "Bienestar adecuado" }
    ],
    items: [
      "Me he sentido alegre y de buen animo.",
      "Me he sentido tranquilo y relajado.",
      "Me he sentido activo y con energia.",
      "Me he despertado fresco y descansado.",
      "Mi vida diaria ha estado llena de cosas interesantes."
    ]
  },
  {
    id: "mdq",
    nombre: "MDQ",
    area: "Bipolaridad",
    descripcion: "Tamizaje de sintomas de espectro bipolar. Requiere entrevista clinica confirmatoria.",
    rango: "0-13",
    opciones: ["No", "Si"],
    valores: [0, 1],
    puntosCorte: [
      { max: 6, texto: "Tamizaje negativo o bajo" },
      { max: 13, texto: "Tamizaje positivo posible; valorar clinicamente" }
    ],
    items: [
      "Periodo con animo tan elevado que otros lo notaron.",
      "Irritabilidad marcada o discusiones frecuentes.",
      "Mayor confianza o grandiosidad.",
      "Menor necesidad de dormir.",
      "Hablar mas o mas rapido.",
      "Pensamientos acelerados.",
      "Distractibilidad marcada.",
      "Aumento de energia.",
      "Mayor actividad social.",
      "Mayor interes sexual.",
      "Conductas inusuales o riesgosas.",
      "Gastos excesivos o problemas por decisiones impulsivas.",
      "Estos sintomas ocurrieron en el mismo periodo."
    ]
  },
  {
    id: "cssrs_screener",
    nombre: "C-SSRS breve",
    area: "Riesgo suicida",
    descripcion: "Tamizaje breve de ideacion/conducta suicida. Cualquier respuesta positiva requiere valoracion inmediata.",
    rango: "0-6",
    opciones: ["No", "Si"],
    valores: [0, 1],
    puntosCorte: [
      { max: 0, texto: "Sin datos positivos en tamizaje" },
      { max: 6, texto: "Dato positivo; requiere evaluacion de riesgo" }
    ],
    items: [
      "Ha deseado estar muerto o no despertar.",
      "Ha tenido pensamientos de quitarse la vida.",
      "Ha pensado en algun metodo.",
      "Ha tenido intencion de actuar sobre esos pensamientos.",
      "Ha elaborado un plan.",
      "Ha realizado preparativos o intento."
    ]
  },
  {
    id: "epds",
    nombre: "EPDS",
    area: "Depresion perinatal",
    descripcion: "Tamizaje de depresion en embarazo/posparto. Requiere interpretacion clinica.",
    rango: "0-30",
    opciones: ["0", "1", "2", "3"],
    valores: [0, 1, 2, 3],
    puntosCorte: [
      { max: 9, texto: "Bajo" },
      { max: 12, texto: "Posible depresion" },
      { max: 30, texto: "Elevado; valorar clinicamente" }
    ],
    items: [
      "Capacidad para reir y ver el lado bueno.",
      "Mirar al futuro con ilusion.",
      "Culparse innecesariamente.",
      "Ansiedad o preocupacion sin motivo claro.",
      "Miedo o panico sin razon suficiente.",
      "Sentirse sobrepasada.",
      "Dificultad para dormir por tristeza.",
      "Sentirse triste o desgraciada.",
      "Llorar por tristeza.",
      "Pensamientos de hacerse dano."
    ]
  },
  {
    id: "whodas12",
    nombre: "WHODAS 2.0-12",
    area: "Funcionamiento",
    descripcion: "Evaluacion breve de funcionamiento y discapacidad percibida.",
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
      "Participacion familiar o social."
    ]
  },
  {
    id: "yale_brown_breve",
    nombre: "Y-BOCS breve",
    area: "TOC",
    descripcion: "Seguimiento breve de obsesiones y compulsiones; no reemplaza Y-BOCS clinica completa.",
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
  }
];

export function interpretarEscala(escala, puntaje) {
  const corte = escala.puntosCorte.find((item) => puntaje <= item.max);
  return corte ? corte.texto : "Requiere interpretacion clinica";
}
