import {
  DIAGNOSTICOS_CLINICOS as DIAGNOSTICOS_BASE,
  INGREDIENTES_MEDICAMENTOS as INGREDIENTES_BASE,
  REGLAS_INTERACCIONES_CLINICAS as INTERACCIONES_BASE,
  REGLAS_MEDICAMENTO_DIAGNOSTICO as MED_DX_BASE,
  UMBRALES_RIESGO_ACUMULATIVO as UMBRALES_BASE
} from "./reglasClinicasMedicamentos.js";

const FUENTES_BASE = [
  "Motor local educativo de Cognición. Verificar con ficha técnica, guías clínicas y juicio clínico antes de prescribir."
];

function unirPorId(base = [], extra = []) {
  const mapa = new Map();
  [...base, ...extra].forEach((item) => {
    const previo = mapa.get(item.id);
    if (!previo) {
      mapa.set(item.id, item);
      return;
    }
    mapa.set(item.id, {
      ...previo,
      ...item,
      sinonimos: [...new Set([...(previo.sinonimos || []), ...(item.sinonimos || [])])],
      clases: [...new Set([...(previo.clases || []), ...(item.clases || [])])],
      riesgos: { ...(previo.riesgos || {}), ...(item.riesgos || {}) }
    });
  });
  return [...mapa.values()];
}

const INGREDIENTES_EXTRA = [
  { id: "enalapril", nombre: "Enalapril", sinonimos: ["enalapril", "enalapril maleato", "maleato de enalapril"], clases: ["ieca"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "losartan", nombre: "Losartán", sinonimos: ["losartan", "losartán", "losartan potasico", "losartán potásico", "cozaar"], clases: ["ara2"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "aliskiren", nombre: "Aliskirén", sinonimos: ["aliskiren", "aliskirén", "rasilez", "tekturna"], clases: ["inhibidor_renina"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "alprazolam", nombre: "Alprazolam", sinonimos: ["alprazolam", "tafil", "xanax"], clases: ["benzodiacepina", "depresor_snc", "sustrato_cyp3a4"], riesgos: { sedacion: 2, respiratorio: 1, caidas: 2 } },
  { id: "midazolam", nombre: "Midazolam", sinonimos: ["midazolam"], clases: ["benzodiacepina", "depresor_snc", "sustrato_cyp3a4"], riesgos: { sedacion: 3, respiratorio: 2, caidas: 2 } },
  { id: "paroxetina", nombre: "Paroxetina", sinonimos: ["paroxetina", "paxil"], clases: ["isrs", "serotoninergico", "inhibidor_cyp2d6"], riesgos: { sangrado: 1, sedacion: 1, anticolinergico: 1 } },
  { id: "fluvoxamina", nombre: "Fluvoxamina", sinonimos: ["fluvoxamina", "luvox"], clases: ["isrs", "serotoninergico", "inhibidor_cyp1a2", "inhibidor_cyp3a4"], riesgos: { sangrado: 1 } },
  { id: "venlafaxina", nombre: "Venlafaxina", sinonimos: ["venlafaxina", "efexor"], clases: ["irsn", "serotoninergico"], riesgos: { qt: 1, sangrado: 1, presion: 2 } },
  { id: "duloxetina", nombre: "Duloxetina", sinonimos: ["duloxetina", "cymbalta"], clases: ["irsn", "serotoninergico", "inhibidor_cyp2d6"], riesgos: { sangrado: 1, hepatotoxico: 1 } },
  { id: "mirtazapina", nombre: "Mirtazapina", sinonimos: ["mirtazapina", "remeron"], clases: ["antidepresivo", "depresor_snc"], riesgos: { sedacion: 2, peso: 2 } },
  { id: "trazodona", nombre: "Trazodona", sinonimos: ["trazodona"], clases: ["antidepresivo", "serotoninergico", "depresor_snc"], riesgos: { sedacion: 2, qt: 1 } },
  { id: "risperidona", nombre: "Risperidona", sinonimos: ["risperidona", "risperdal"], clases: ["antipsicotico", "sustrato_cyp2d6"], riesgos: { qt: 1, sedacion: 1, hiperprolactina: 2 } },
  { id: "olanzapina", nombre: "Olanzapina", sinonimos: ["olanzapina", "zyprexa"], clases: ["antipsicotico", "sustrato_cyp1a2"], riesgos: { sedacion: 2, anticolinergico: 1, peso: 3, glucosa: 2 } },
  { id: "ziprasidona", nombre: "Ziprasidona", sinonimos: ["ziprasidona", "geodon"], clases: ["antipsicotico"], riesgos: { qt: 3 } },
  { id: "aripiprazol", nombre: "Aripiprazol", sinonimos: ["aripiprazol", "abilify"], clases: ["antipsicotico", "sustrato_cyp2d6", "sustrato_cyp3a4"], riesgos: { akatisia: 2 } },
  { id: "clorpromazina", nombre: "Clorpromazina", sinonimos: ["clorpromazina", "largactil"], clases: ["antipsicotico", "depresor_snc", "anticolinergico"], riesgos: { qt: 2, sedacion: 3, anticolinergico: 2, hipotension: 2 } },
  { id: "levomepromazina", nombre: "Levomepromazina", sinonimos: ["levomepromazina", "sinogan"], clases: ["antipsicotico", "depresor_snc", "anticolinergico"], riesgos: { qt: 2, sedacion: 3, anticolinergico: 2, hipotension: 2 } },
  { id: "linezolid", nombre: "Linezolid", sinonimos: ["linezolid"], clases: ["antibiotico", "imao_reversible"], riesgos: { serotoninergico: 3 } },
  { id: "selegilina", nombre: "Selegilina", sinonimos: ["selegilina"], clases: ["imao"], riesgos: { serotoninergico: 3, presion: 2 } },
  { id: "fenelzina", nombre: "Fenelzina", sinonimos: ["fenelzina", "phenelzine"], clases: ["imao"], riesgos: { serotoninergico: 3, presion: 2 } },
  { id: "lamotrigina", nombre: "Lamotrigina", sinonimos: ["lamotrigina", "lamictal"], clases: ["antiepileptico", "estabilizador_animo"], riesgos: { dermatologico: 2 } },
  { id: "fenitoina", nombre: "Fenitoína", sinonimos: ["fenitoina", "fenitoína", "phenytoin"], clases: ["antiepileptico", "inductor_cyp3a4"], riesgos: { sedacion: 1, teratogenico: 1 } },
  { id: "topiramato", nombre: "Topiramato", sinonimos: ["topiramato", "topamax"], clases: ["antiepileptico"], riesgos: { sedacion: 1, cognitivo: 2, renal: 1 } },
  { id: "pregabalina", nombre: "Pregabalina", sinonimos: ["pregabalina", "lyrica"], clases: ["gabapentinoide", "depresor_snc"], riesgos: { sedacion: 2, respiratorio: 1, caidas: 2 } },
  { id: "gabapentina", nombre: "Gabapentina", sinonimos: ["gabapentina", "neurontin"], clases: ["gabapentinoide", "depresor_snc"], riesgos: { sedacion: 2, respiratorio: 1, caidas: 2, renal: 1 } },
  { id: "levetiracetam", nombre: "Levetiracetam", sinonimos: ["levetiracetam", "keppra"], clases: ["antiepileptico"], riesgos: { conducta: 1 } },
  { id: "metilfenidato", nombre: "Metilfenidato", sinonimos: ["metilfenidato", "ritalin", "concerta"], clases: ["estimulante"], riesgos: { presion: 2, ansiedad: 1, apetito: 1 } },
  { id: "atomoxetina", nombre: "Atomoxetina", sinonimos: ["atomoxetina", "strattera"], clases: ["noradrenergico", "sustrato_cyp2d6"], riesgos: { presion: 1 } },
  { id: "zolpidem", nombre: "Zolpidem", sinonimos: ["zolpidem", "stilnox"], clases: ["hipnotico_z", "depresor_snc"], riesgos: { sedacion: 2, caidas: 2 } },
  { id: "fentanilo", nombre: "Fentanilo", sinonimos: ["fentanilo", "fentanyl"], clases: ["opioide", "depresor_snc", "sustrato_cyp3a4"], riesgos: { sedacion: 3, respiratorio: 3 } },
  { id: "oxicodona", nombre: "Oxicodona", sinonimos: ["oxicodona", "oxycodone"], clases: ["opioide", "depresor_snc", "sustrato_cyp3a4"], riesgos: { sedacion: 3, respiratorio: 3 } },
  { id: "metadona", nombre: "Metadona", sinonimos: ["metadona", "methadone"], clases: ["opioide", "depresor_snc"], riesgos: { sedacion: 3, respiratorio: 3, qt: 3 } },
  { id: "buprenorfina", nombre: "Buprenorfina", sinonimos: ["buprenorfina", "buprenorphine"], clases: ["opioide", "depresor_snc"], riesgos: { sedacion: 2, respiratorio: 2 } },
  { id: "sildenafil", nombre: "Sildenafil", sinonimos: ["sildenafil", "viagra"], clases: ["pde5"], riesgos: { hipotension: 2 } },
  { id: "nitroglicerina", nombre: "Nitroglicerina", sinonimos: ["nitroglicerina", "trinitrato de glicerilo", "isosorbide", "isosorbida"], clases: ["nitrato"], riesgos: { hipotension: 3 } },
  { id: "verapamilo", nombre: "Verapamilo", sinonimos: ["verapamilo", "verapamil"], clases: ["calcioantagonista_no_dhp", "inhibidor_cyp3a4"], riesgos: { bradicardia: 2, hipotension: 2 } },
  { id: "diltiazem", nombre: "Diltiazem", sinonimos: ["diltiazem"], clases: ["calcioantagonista_no_dhp", "inhibidor_cyp3a4"], riesgos: { bradicardia: 2, hipotension: 2 } },
  { id: "metoprolol", nombre: "Metoprolol", sinonimos: ["metoprolol"], clases: ["betabloqueador", "sustrato_cyp2d6"], riesgos: { bradicardia: 2, hipotension: 1 } },
  { id: "digoxina", nombre: "Digoxina", sinonimos: ["digoxina", "digoxin"], clases: ["glucosido_cardiaco", "sustrato_pgp"], riesgos: { bradicardia: 2, arritmia: 2 } },
  { id: "amiodarona", nombre: "Amiodarona", sinonimos: ["amiodarona", "amiodarone"], clases: ["antiarritmico", "inhibidor_cyp3a4", "inhibidor_pgp"], riesgos: { qt: 3, bradicardia: 2 } },
  { id: "ketoconazol", nombre: "Ketoconazol", sinonimos: ["ketoconazol", "ketoconazole"], clases: ["azol", "inhibidor_cyp3a4"], riesgos: { hepatotoxico: 2, qt: 1 } },
  { id: "fluconazol", nombre: "Fluconazol", sinonimos: ["fluconazol", "fluconazole"], clases: ["azol", "inhibidor_cyp3a4"], riesgos: { qt: 1, hepatotoxico: 1 } },
  { id: "rifampicina", nombre: "Rifampicina", sinonimos: ["rifampicina", "rifampin"], clases: ["inductor_cyp3a4", "inductor_enzimatico"], riesgos: { hepatotoxico: 1 } },
  { id: "ritonavir", nombre: "Ritonavir", sinonimos: ["ritonavir"], clases: ["inhibidor_cyp3a4", "inhibidor_pgp"], riesgos: { qt: 1 } },
  { id: "trimetoprim", nombre: "Trimetoprim/sulfametoxazol", sinonimos: ["trimetoprim", "sulfametoxazol", "tmp smx", "bactrim"], clases: ["antibiotico", "inhibidor_folato"], riesgos: { potasio: 1, renal: 1, sangrado: 1 } },
  { id: "metotrexato", nombre: "Metotrexato", sinonimos: ["metotrexato", "methotrexate"], clases: ["antimetabolito"], riesgos: { hepatotoxico: 2, renal: 2, mielosupresion: 3 } },
  { id: "azatioprina", nombre: "Azatioprina", sinonimos: ["azatioprina", "azathioprine"], clases: ["inmunosupresor"], riesgos: { mielosupresion: 2 } },
  { id: "alopurinol", nombre: "Alopurinol", sinonimos: ["alopurinol", "allopurinol"], clases: ["inhibidor_xantina_oxidasa"], riesgos: { dermatologico: 1 } },
  { id: "anticonceptivo_hormonal", nombre: "Anticonceptivo hormonal", sinonimos: ["etinilestradiol", "levonorgestrel", "drospirenona", "anticonceptivo oral", "pastillas anticonceptivas"], clases: ["anticonceptivo_hormonal", "sustrato_cyp3a4"], riesgos: { trombosis: 1 } },
  { id: "hierba_san_juan", nombre: "Hierba de San Juan", sinonimos: ["hierba de san juan", "hiperico", "hipérico", "st john"], clases: ["suplemento", "inductor_cyp3a4", "serotoninergico"], riesgos: { serotoninergico: 2 } },
  { id: "alcohol", nombre: "Alcohol", sinonimos: ["alcohol", "etanol", "bebidas alcoholicas", "bebidas alcohólicas"], clases: ["sustancia", "depresor_snc"], riesgos: { sedacion: 2, respiratorio: 1, hepatotoxico: 1, caidas: 2 } }
];

const DX_EXTRA = [
  { id: "hipertension_no_controlada", nombre: "Hipertensión arterial / riesgo cardiovascular", categoria: "hipertension", sinonimos: ["hipertension", "hipertensión", "hipertension arterial", "hipertensión arterial", "hta", "presion alta", "presión alta", "riesgo cardiovascular", "cardiopatia", "cardiopatía", "taquiarritmia"] },
  { id: "lactancia", nombre: "Lactancia", categoria: "lactancia", sinonimos: ["lactancia", "amamantando", "puerperio con lactancia"] },
  { id: "adulto_mayor_fragil", nombre: "Adulto mayor / fragilidad", categoria: "adulto_mayor", sinonimos: ["adulto mayor", "anciano", "fragilidad", "alto riesgo de caidas", "riesgo de caídas"] },
  { id: "demencia", nombre: "Deterioro cognitivo mayor / demencia", categoria: "demencia", sinonimos: ["demencia", "deterioro cognitivo mayor", "alzheimer", "delirium previo"] },
  { id: "trastorno_bipolar", nombre: "Trastorno bipolar", categoria: "bipolaridad", sinonimos: ["trastorno bipolar", "bipolaridad", "episodio maniaco", "episodio maníaco", "hipomania"] },
  { id: "hiponatremia", nombre: "Hiponatremia", categoria: "sodio", sinonimos: ["hiponatremia", "sodio bajo", "na bajo"] },
  { id: "obesidad", nombre: "Obesidad / síndrome metabólico", categoria: "metabolico", sinonimos: ["obesidad", "síndrome metabólico", "sindrome metabolico", "dislipidemia"] },
  { id: "suicidio", nombre: "Riesgo suicida", categoria: "riesgo_suicida", sinonimos: ["riesgo suicida", "ideacion suicida", "ideación suicida", "intento suicida", "plan suicida"] }
];

const MED_DX_EXTRA = [
  { id: "isrs_bipolaridad", clase: "isrs", diagnosticoCategoria: "bipolaridad", severidad: "moderada", titulo: "Antidepresivo en antecedente bipolar", efecto: "Los antidepresivos pueden asociarse a viraje afectivo o inestabilidad si no hay cobertura estabilizadora en pacientes vulnerables.", recomendacion: "Tamizar historia de manía/hipomanía, documentar justificación y vigilar activación, insomnio o irritabilidad." },
  { id: "serotoninergico_hiponatremia", clase: "serotoninergico", diagnosticoCategoria: "sodio", severidad: "moderada", titulo: "Serotoninérgico en hiponatremia", efecto: "ISRS/IRSN pueden contribuir a SIADH e hiponatremia, sobre todo en adultos mayores o con diuréticos.", recomendacion: "Valorar sodio basal y seguimiento clínico/laboratorial." },
  { id: "gabapentinoide_renal", clase: "gabapentinoide", diagnosticoCategoria: "funcion_renal", severidad: "moderada", titulo: "Gabapentinoide con función renal reducida", efecto: "Gabapentina/pregabalina se eliminan principalmente por vía renal y pueden acumularse.", recomendacion: "Ajustar dosis según eGFR y vigilar sedación, mareo y caídas." },
  { id: "sedante_adulto_mayor", riesgo: "sedacion", diagnosticoCategoria: "adulto_mayor", severidad: "moderada", titulo: "Sedante en adulto mayor o fragilidad", efecto: "Aumenta riesgo de caídas, delirium, deterioro cognitivo y depresión respiratoria.", recomendacion: "Usar dosis mínima, preferir alternativas y registrar vigilancia de marcha, cognición y sueño." },
  { id: "anticolinergico_demencia", clase: "anticolinergico", diagnosticoCategoria: "demencia", severidad: "alta", titulo: "Carga anticolinérgica en deterioro cognitivo", efecto: "Puede empeorar memoria, confusión, delirium, estreñimiento y retención urinaria.", recomendacion: "Evitar si es posible y revisar carga anticolinérgica total." },
  { id: "olanzapina_metabolico", ingrediente: "olanzapina", diagnosticoCategoria: "metabolico", severidad: "moderada", titulo: "Olanzapina con riesgo metabólico", efecto: "Puede aumentar peso, glucosa y lípidos.", recomendacion: "Documentar balance riesgo-beneficio y monitorizar peso, cintura, glucosa y lípidos." },
  { id: "clozapina_metabolico", ingrediente: "clozapina", diagnosticoCategoria: "metabolico", severidad: "moderada", titulo: "Clozapina con riesgo metabólico", efecto: "Puede aumentar peso, glucosa y lípidos.", recomendacion: "Plan de seguimiento metabólico y educación al paciente." },
  { id: "benzodiacepina_suicidio", clase: "benzodiacepina", diagnosticoCategoria: "riesgo_suicida", severidad: "moderada", titulo: "Benzodiacepina en contexto de riesgo suicida", efecto: "Puede aumentar desinhibición, sedación o riesgo de uso no seguro en sobredosis.", recomendacion: "Prescribir cantidades limitadas, involucrar red de apoyo y documentar plan de seguridad." },
  { id: "litio_deshidratacion", ingrediente: "litio", diagnosticoCategoria: "hidratacion", severidad: "alta", titulo: "Litio con deshidratación o pérdidas gastrointestinales", efecto: "La deshidratación puede elevar litio y precipitar toxicidad.", recomendacion: "Valorar suspensión temporal, hidratación, función renal y nivel sérico." },
  { id: "ieca_lactancia", clases: ["ieca", "ara2"], diagnosticoCategoria: "lactancia", severidad: "moderada", titulo: "IECA/ARA-II durante lactancia", efecto: "Requiere valoración del fármaco específico, edad del lactante y alternativas.", recomendacion: "Confirmar compatibilidad y vigilar al lactante si procede." },
  {
    id: "estimulante_noradrenergico_hipertension",
    clases: ["estimulante", "noradrenergico"],
    diagnosticoCategoria: "hipertension",
    severidad: "moderada",
    titulo: "Estimulante o noradrenérgico en hipertensión/riesgo cardiovascular",
    efecto: "Los fármacos estimulantes o noradrenérgicos pueden elevar presión arterial y frecuencia cardiaca, o reducir la tolerancia cardiovascular en pacientes con hipertensión, taquiarritmias o cardiopatía.",
    recomendacion: "Verificar presión arterial y frecuencia cardiaca basal, control de hipertensión, antecedentes cardiovasculares y necesidad de ECG o valoración cardiológica según el contexto clínico.",
    parametrosVigilancia: ["Presión arterial", "Frecuencia cardiaca", "Palpitaciones", "Dolor torácico", "Insomnio/ansiedad"],
    fuentes: [
      "DailyMed/FDA atomoxetina: advertencias sobre aumento de presión arterial/frecuencia cardiaca y precaución en hipertensión o enfermedad cardiovascular.",
      "DailyMed/FDA metilfenidato: estimulantes del SNC pueden aumentar presión arterial y frecuencia cardiaca; monitorizar hipertensión/taquicardia."
    ]
  }
];

const INTERACCIONES_EXTRA = [
  {
    id: "bloqueo_dual_sraa_ieca_ara2",
    clasesA: ["ieca"],
    clasesB: ["ara2"],
    severidad: "alta",
    titulo: "Bloqueo dual del SRAA: IECA + ARA-II",
    efecto: "La combinación produce bloqueo dual del sistema renina-angiotensina-aldosterona y aumenta el riesgo de hiperpotasemia, hipotensión, síncope, lesión renal aguda, deterioro de la función renal, elevación de creatinina y alteraciones hidroelectrolíticas.",
    recomendacion: "Evitar uso rutinario combinado. Si existe una indicación excepcional, documentar justificación y vigilar presión arterial, creatinina/eGFR, potasio sérico, balance hídrico y síntomas de hipotensión o síncope.",
    evidencia: "documentada",
    fuentes: [
      "FDA/DailyMed losartán/ARA-II: bloqueo dual del SRAA con IECA, ARA-II o aliskirén se asocia con mayor riesgo de hipotensión, síncope, hiperpotasemia y cambios en función renal.",
      "Guías nefrológicas y cardiovasculares: evitar bloqueo dual rutinario IECA + ARA-II por riesgo renal y electrolítico."
    ],
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "bloqueo_dual_sraa_ieca_renina",
    clasesA: ["ieca"],
    clasesB: ["inhibidor_renina"],
    severidad: "alta",
    titulo: "Bloqueo dual del SRAA: IECA + inhibidor directo de renina",
    efecto: "La combinación intensifica el bloqueo del sistema renina-angiotensina-aldosterona y aumenta el riesgo de hiperpotasemia, hipotensión, síncope, deterioro de función renal y lesión renal aguda.",
    recomendacion: "Evitar uso rutinario combinado. Si se justifica excepcionalmente, documentar indicación y vigilar presión arterial, creatinina/eGFR y potasio.",
    evidencia: "documentada",
    fuentes: [
      "Ficha técnica de ARA-II/IECA e inhibidores de renina: el bloqueo dual del SRAA se asocia con mayor riesgo renal, hiperpotasemia e hipotensión."
    ],
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "bloqueo_dual_sraa_ara2_renina",
    clasesA: ["ara2"],
    clasesB: ["inhibidor_renina"],
    severidad: "alta",
    titulo: "Bloqueo dual del SRAA: ARA-II + inhibidor directo de renina",
    efecto: "La combinación intensifica el bloqueo del sistema renina-angiotensina-aldosterona y aumenta el riesgo de hiperpotasemia, hipotensión, síncope, deterioro de función renal y lesión renal aguda.",
    recomendacion: "Evitar uso rutinario combinado. Si se justifica excepcionalmente, documentar indicación y vigilar presión arterial, creatinina/eGFR y potasio.",
    evidencia: "documentada",
    fuentes: [
      "Ficha técnica de ARA-II/IECA e inhibidores de renina: el bloqueo dual del SRAA se asocia con mayor riesgo renal, hiperpotasemia e hipotensión."
    ],
    permiteOverride: true,
    requiereJustificacion: true
  },
  { id: "opioide_gabapentinoide", clasesA: ["opioide"], clasesB: ["gabapentinoide"], severidad: "alta", titulo: "Opioide + gabapentinoide", efecto: "Aumenta sedación, caídas y depresión respiratoria, especialmente en adultos mayores o enfermedad respiratoria.", recomendacion: "Evitar si no es indispensable; ajustar dosis y vigilar respiración y somnolencia.", requiereJustificacion: true },
  { id: "benzodiacepina_gabapentinoide", clasesA: ["benzodiacepina"], clasesB: ["gabapentinoide"], severidad: "moderada", titulo: "Benzodiacepina + gabapentinoide", efecto: "Puede potenciar sedación, mareo y caídas.", recomendacion: "Usar dosis mínima y vigilar estado de alerta y marcha." },
  { id: "alcohol_depresor_snc", ingredientesA: ["alcohol"], clasesB: ["depresor_snc"], severidad: "alta", titulo: "Alcohol + depresor del SNC", efecto: "Potencia sedación, deterioro psicomotor y depresión respiratoria.", recomendacion: "Indicar evitar alcohol durante el tratamiento y documentar orientación." },
  { id: "linezolid_serotoninergico", ingredientesA: ["linezolid"], clasesB: ["serotoninergico"], severidad: "critica", titulo: "Linezolid + serotoninérgico", efecto: "Riesgo de síndrome serotoninérgico.", recomendacion: "Evitar combinación o manejar con protocolo especializado y vigilancia estrecha.", requiereJustificacion: true },
  { id: "imao_serotoninergico_ext", clasesA: ["imao", "imao_reversible"], clasesB: ["serotoninergico"], severidad: "critica", titulo: "IMAO + serotoninérgico", efecto: "Riesgo de síndrome serotoninérgico o crisis autonómica.", recomendacion: "No combinar sin periodo de lavado/protocolo especializado.", requiereJustificacion: true },
  { id: "qt_qt", clasesA: ["antipsicotico"], clasesB: ["macrolido", "fluoroquinolona", "antiarritmico"], severidad: "alta", titulo: "Combinación con riesgo de QT", efecto: "Puede aumentar prolongación QT y riesgo de arritmia ventricular.", recomendacion: "Valorar ECG, potasio, magnesio, dosis y alternativas.", requiereJustificacion: true },
  { id: "pde5_nitrato", clasesA: ["pde5"], clasesB: ["nitrato"], severidad: "critica", titulo: "Inhibidor PDE5 + nitrato", efecto: "Riesgo de hipotensión grave.", recomendacion: "Contraindicar combinación y documentar advertencia al paciente.", requiereJustificacion: true },
  { id: "betabloqueador_verapamilo_diltiazem", clasesA: ["betabloqueador", "betabloqueador_no_selectivo"], clasesB: ["calcioantagonista_no_dhp"], severidad: "alta", titulo: "Betabloqueador + verapamilo/diltiazem", efecto: "Aumenta riesgo de bradicardia, bloqueo AV e hipotensión.", recomendacion: "Evitar o monitorizar FC, PA y ECG si se justifica." },
  { id: "litio_ieca_ara", ingredientesA: ["litio"], clasesB: ["ieca", "ara2"], severidad: "alta", titulo: "Litio + IECA/ARA-II", efecto: "Puede aumentar niveles de litio y toxicidad renal/neurológica.", recomendacion: "Monitorizar litio, creatinina y estado de hidratación." },
  { id: "litio_deshidratante", ingredientesA: ["litio"], clasesB: ["diuretico"], severidad: "alta", titulo: "Litio + diurético", efecto: "Puede elevar niveles de litio, especialmente con depleción de sodio o volumen.", recomendacion: "Evitar si es posible o monitorizar niveles y función renal." },
  { id: "espironolactona_ieca_ara", clasesA: ["ahorrador_potasio"], clasesB: ["ieca", "ara2"], severidad: "alta", titulo: "Ahorrador de potasio + IECA/ARA-II", efecto: "Aumenta riesgo de hiperpotasemia.", recomendacion: "Controlar potasio y función renal; evitar si K+ elevado." },
  { id: "metotrexato_trimethoprim", ingredientesA: ["metotrexato"], ingredientesB: ["trimetoprim"], severidad: "critica", titulo: "Metotrexato + trimetoprim/sulfametoxazol", efecto: "Riesgo de mielosupresión grave por efecto antifolato aditivo.", recomendacion: "Evitar combinación salvo indicación especializada.", requiereJustificacion: true },
  { id: "metotrexato_aine", ingredientesA: ["metotrexato"], clasesB: ["aine"], severidad: "alta", titulo: "Metotrexato + AINE", efecto: "Puede aumentar toxicidad de metotrexato, sobre todo con dosis altas o función renal reducida.", recomendacion: "Vigilar función renal, biometría hemática y signos de toxicidad." },
  { id: "azatioprina_alopurinol", ingredientesA: ["azatioprina"], ingredientesB: ["alopurinol"], severidad: "critica", titulo: "Azatioprina + alopurinol", efecto: "Riesgo de mielosupresión grave por aumento de metabolitos activos.", recomendacion: "Evitar o ajustar drásticamente con control especializado.", requiereJustificacion: true },
  { id: "cyp3a4_inhibidor_sustrato", clasesA: ["inhibidor_cyp3a4"], clasesB: ["sustrato_cyp3a4"], severidad: "moderada", titulo: "Inhibidor CYP3A4 + sustrato CYP3A4", efecto: "Puede aumentar exposición del sustrato y eventos adversos.", recomendacion: "Revisar dosis, toxicidad esperada y alternativas.", evidencia: "potencial" },
  { id: "rifampicina_anticonceptivo", ingredientesA: ["rifampicina"], clasesB: ["anticonceptivo_hormonal"], severidad: "alta", titulo: "Rifampicina + anticonceptivo hormonal", efecto: "Puede disminuir eficacia anticonceptiva.", recomendacion: "Indicar método alternativo/no hormonal durante y después del tratamiento." },
  { id: "amiodarona_digoxina", ingredientesA: ["amiodarona"], ingredientesB: ["digoxina"], severidad: "alta", titulo: "Amiodarona + digoxina", efecto: "Puede aumentar niveles de digoxina y bradicardia.", recomendacion: "Reducir dosis de digoxina según criterio clínico y monitorizar niveles/ECG." },
  { id: "warfarina_isrs", ingredientesA: ["warfarina"], clasesB: ["isrs", "irsn"], severidad: "moderada", titulo: "Warfarina + ISRS/IRSN", efecto: "Puede aumentar riesgo de sangrado por efecto plaquetario y/o interacciones metabólicas.", recomendacion: "Vigilar INR, sangrado y necesidad de gastroprotección." },
  { id: "nsaid_isrs", clasesA: ["aine"], clasesB: ["isrs", "irsn"], severidad: "moderada", titulo: "AINE + ISRS/IRSN", efecto: "Aumenta riesgo de sangrado gastrointestinal.", recomendacion: "Evitar uso prolongado, valorar gastroprotección y vigilar sangrado." },
  { id: "clozapina_depresor_snc", ingredientesA: ["clozapina"], clasesB: ["depresor_snc"], severidad: "moderada", titulo: "Clozapina + depresor del SNC", efecto: "Puede aumentar sedación, hipotensión y riesgo respiratorio.", recomendacion: "Ajustar dosis, vigilar estado de alerta y signos respiratorios." }
];

export const INGREDIENTES_MEDICAMENTOS = unirPorId(INGREDIENTES_BASE, INGREDIENTES_EXTRA);
export const DIAGNOSTICOS_CLINICOS = unirPorId(DIAGNOSTICOS_BASE, DX_EXTRA);
export const REGLAS_MEDICAMENTO_DIAGNOSTICO = [...MED_DX_BASE, ...MED_DX_EXTRA].map((regla) => ({
  evidencia: regla.evidencia || "regla_local",
  fuentes: regla.fuentes || FUENTES_BASE,
  ...regla
}));
export const REGLAS_INTERACCIONES_CLINICAS = [...INTERACCIONES_BASE, ...INTERACCIONES_EXTRA].map((regla) => ({
  evidencia: regla.evidencia || "regla_local",
  fuentes: regla.fuentes || FUENTES_BASE,
  ...regla
}));
export const UMBRALES_RIESGO_ACUMULATIVO = {
  ...UMBRALES_BASE,
  respiratorio: { minimo: 4, severidad: "alta", titulo: "Carga respiratoria depresora acumulativa" },
  caidas: { minimo: 4, severidad: "moderada", titulo: "Carga acumulativa de caídas" },
  presion: {
    minimo: 3,
    severidad: "moderada",
    titulo: "Riesgo de elevación de la presión arterial y la frecuencia cardiaca",
    descripcion: "La combinación puede sumar efectos simpaticomiméticos o noradrenérgicos y favorecer elevación de presión arterial, frecuencia cardiaca, palpitaciones, ansiedad, insomnio o menor tolerancia cardiovascular en pacientes vulnerables.",
    recomendacion: "Medir presión arterial y frecuencia cardiaca basal y durante el seguimiento. Valorar antecedentes cardiovasculares, hipertensión, taquiarritmias, ansiedad intensa, insomnio y ajuste de dosis según respuesta clínica.",
    parametrosVigilancia: ["Presión arterial", "Frecuencia cardiaca", "Síntomas cardiovasculares", "Insomnio/ansiedad"],
    fuentes: [
      "DailyMed/FDA atomoxetina: puede aumentar presión arterial y frecuencia cardiaca; medir basal y periódicamente.",
      "DailyMed/FDA metilfenidato: los estimulantes del SNC pueden aumentar presión arterial y frecuencia cardiaca."
    ]
  },
  sangrado: { minimo: 4, severidad: "alta", titulo: "Carga hemorrágica acumulativa" },
  glucosa: { minimo: 3, severidad: "moderada", titulo: "Carga metabólica glucémica acumulativa" }
};
