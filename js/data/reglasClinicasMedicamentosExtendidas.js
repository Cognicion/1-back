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

const STAHL_LOCAL = "Stahl, Prescriber's Guide, 6th ed. (2017), fuente local fuentes_farmacologicas/stahl_prescribers_guide.pdf";

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
  { id: "captopril", nombre: "Captopril", sinonimos: ["captopril", "capoten", "captopril tabletas", "captopril 25 mg", "captopril 50 mg"], clases: ["ieca"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "lisinopril", nombre: "Lisinopril", sinonimos: ["lisinopril", "prinivil", "zestril"], clases: ["ieca"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "valsartan", nombre: "Valsartan", sinonimos: ["valsartan", "valsartán", "diovan"], clases: ["ara2"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "telmisartan", nombre: "Telmisartan", sinonimos: ["telmisartan", "telmisartán", "micardis"], clases: ["ara2"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "hidroclorotiazida", nombre: "Hidroclorotiazida", sinonimos: ["hidroclorotiazida", "hydrochlorothiazide", "hctz"], clases: ["diuretico", "tiazida"], riesgos: { renal: 1, hipotension: 1, potasio_bajo: 1 } },
  { id: "metformina", nombre: "Metformina", sinonimos: ["metformina", "metformin"], clases: ["hipoglucemiante", "biguanida"], riesgos: { renal: 1, glucosa: 1 } },
  { id: "insulina", nombre: "Insulina", sinonimos: ["insulina", "insulin", "glargina", "lispro", "aspart"], clases: ["hipoglucemiante", "insulina"], riesgos: { glucosa: 2 } },
  { id: "atorvastatina", nombre: "Atorvastatina", sinonimos: ["atorvastatina", "atorvastatin", "lipitor"], clases: ["estatina", "sustrato_cyp3a4"], riesgos: { hepatotoxico: 1, muscular: 1 } },
  { id: "rosuvastatina", nombre: "Rosuvastatina", sinonimos: ["rosuvastatina", "rosuvastatin", "crestor"], clases: ["estatina"], riesgos: { renal: 1, muscular: 1 } },
  { id: "acido_acetilsalicilico", nombre: "Acido acetilsalicilico", sinonimos: ["acido acetilsalicilico", "ácido acetilsalicílico", "aspirina", "aspirin", "asa"], clases: ["antiagregante", "aine"], riesgos: { sangrado: 2, renal: 1 } },
  { id: "clopidogrel", nombre: "Clopidogrel", sinonimos: ["clopidogrel", "plavix"], clases: ["antiagregante", "sustrato_cyp2c19"], riesgos: { sangrado: 2 } },
  { id: "apixaban", nombre: "Apixaban", sinonimos: ["apixaban", "apixabán", "eliquis"], clases: ["anticoagulante", "sustrato_cyp3a4", "sustrato_pgp"], riesgos: { sangrado: 3, renal: 1 } },
  { id: "omeprazol", nombre: "Omeprazol", sinonimos: ["omeprazol", "omeprazole"], clases: ["ibp", "inhibidor_cyp2c19"], riesgos: {} },
  { id: "pantoprazol", nombre: "Pantoprazol", sinonimos: ["pantoprazol", "pantoprazole"], clases: ["ibp"], riesgos: {} },
  { id: "paracetamol", nombre: "Paracetamol", sinonimos: ["paracetamol", "acetaminofen", "acetaminofén", "acetaminophen", "tylenol"], clases: ["analgesico"], riesgos: { hepatotoxico: 1 } },
  { id: "naproxeno", nombre: "Naproxeno", sinonimos: ["naproxeno", "naproxen", "aleve"], clases: ["aine"], riesgos: { sangrado: 2, renal: 2, cardiovascular: 1 } },
  { id: "diclofenaco", nombre: "Diclofenaco", sinonimos: ["diclofenaco", "diclofenac"], clases: ["aine"], riesgos: { sangrado: 2, renal: 2, cardiovascular: 1, hepatotoxico: 1 } },
  { id: "prednisona", nombre: "Prednisona", sinonimos: ["prednisona", "prednisone"], clases: ["corticoide"], riesgos: { glucosa: 2, metabolico: 1, cardiovascular: 1 } },
  { id: "dexametasona", nombre: "Dexametasona", sinonimos: ["dexametasona", "dexamethasone"], clases: ["corticoide"], riesgos: { glucosa: 2, metabolico: 1, cardiovascular: 1 } },
  { id: "enalapril", nombre: "Enalapril", sinonimos: ["enalapril", "enalapril maleato", "maleato de enalapril"], clases: ["ieca"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "losartan", nombre: "Losartán", sinonimos: ["losartan", "losartán", "losartan potasico", "losartán potásico", "cozaar"], clases: ["ara2"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "aliskiren", nombre: "Aliskirén", sinonimos: ["aliskiren", "aliskirén", "rasilez", "tekturna"], clases: ["inhibidor_renina"], riesgos: { potasio: 1, renal: 1, hipotension: 1 } },
  { id: "alprazolam", nombre: "Alprazolam", sinonimos: ["alprazolam", "tafil", "xanax"], clases: ["benzodiacepina", "depresor_snc", "sustrato_cyp3a4"], riesgos: { sedacion: 2, respiratorio: 1, caidas: 2 } },
  { id: "midazolam", nombre: "Midazolam", sinonimos: ["midazolam"], clases: ["benzodiacepina", "depresor_snc", "sustrato_cyp3a4"], riesgos: { sedacion: 3, respiratorio: 2, caidas: 2 } },
  { id: "paroxetina", nombre: "Paroxetina", sinonimos: ["paroxetina", "paxil"], clases: ["isrs", "serotoninergico", "inhibidor_cyp2d6"], riesgos: { sangrado: 1, sedacion: 1, anticolinergico: 1 } },
  { id: "fluoxetina", nombre: "Fluoxetina", sinonimos: ["fluoxetina", "prozac"], clases: ["isrs", "serotoninergico", "inhibidor_cyp2d6"], riesgos: { sangrado: 1 } },
  { id: "escitalopram", nombre: "Escitalopram", sinonimos: ["escitalopram", "lexapro"], clases: ["isrs", "serotoninergico"], riesgos: { sangrado: 1, qt: 1 } },
  { id: "fluvoxamina", nombre: "Fluvoxamina", sinonimos: ["fluvoxamina", "luvox"], clases: ["isrs", "serotoninergico", "inhibidor_cyp1a2", "inhibidor_cyp3a4"], riesgos: { sangrado: 1 } },
  { id: "venlafaxina", nombre: "Venlafaxina", sinonimos: ["venlafaxina", "efexor"], clases: ["irsn", "serotoninergico"], riesgos: { qt: 1, sangrado: 1, presion: 2 } },
  { id: "duloxetina", nombre: "Duloxetina", sinonimos: ["duloxetina", "cymbalta"], clases: ["irsn", "serotoninergico", "inhibidor_cyp2d6"], riesgos: { sangrado: 1, hepatotoxico: 1 } },
  { id: "mirtazapina", nombre: "Mirtazapina", sinonimos: ["mirtazapina", "remeron"], clases: ["antidepresivo", "depresor_snc"], riesgos: { sedacion: 2, peso: 2 } },
  { id: "trazodona", nombre: "Trazodona", sinonimos: ["trazodona"], clases: ["antidepresivo", "serotoninergico", "depresor_snc"], riesgos: { sedacion: 2, qt: 1 } },
  { id: "risperidona", nombre: "Risperidona", sinonimos: ["risperidona", "risperdal"], clases: ["antipsicotico", "sustrato_cyp2d6"], riesgos: { qt: 1, sedacion: 1, hiperprolactina: 3, prolactina: 3, eps: 2, peso: 1, glucosa: 1, metabolico: 1, hipotension: 2, cardiovascular: 1 } },
  { id: "olanzapina", nombre: "Olanzapina", sinonimos: ["olanzapina", "zyprexa"], clases: ["antipsicotico", "sustrato_cyp1a2"], riesgos: { sedacion: 2, anticolinergico: 1, peso: 3, glucosa: 2, metabolico: 3, hipotension: 1, cardiovascular: 1, eps: 1 } },
  { id: "ziprasidona", nombre: "Ziprasidona", sinonimos: ["ziprasidona", "geodon"], clases: ["antipsicotico"], riesgos: { qt: 3 } },
  { id: "aripiprazol", nombre: "Aripiprazol", sinonimos: ["aripiprazol", "abilify"], clases: ["antipsicotico", "sustrato_cyp2d6", "sustrato_cyp3a4"], riesgos: { akatisia: 2 } },
  { id: "quetiapina", nombre: "Quetiapina", sinonimos: ["quetiapina", "seroquel"], clases: ["antipsicotico", "sustrato_cyp3a4"], riesgos: { qt: 2, sedacion: 2, anticolinergico: 1, peso: 2, glucosa: 1 } },
  { id: "paliperidona", nombre: "Paliperidona", sinonimos: ["paliperidona", "invega"], clases: ["antipsicotico"], riesgos: { sedacion: 1, hiperprolactina: 2, peso: 1, glucosa: 1, renal: 1 } },
  { id: "clozapina", nombre: "Clozapina", sinonimos: ["clozapina", "leponex", "clozaril"], clases: ["antipsicotico", "depresor_snc", "anticolinergico", "sustrato_cyp1a2"], riesgos: { sedacion: 3, anticolinergico: 2, peso: 3, glucosa: 3, convulsivo: 2 } },
  { id: "clorpromazina", nombre: "Clorpromazina", sinonimos: ["clorpromazina", "largactil"], clases: ["antipsicotico", "depresor_snc", "anticolinergico"], riesgos: { qt: 2, sedacion: 3, anticolinergico: 2, hipotension: 2 } },
  { id: "levomepromazina", nombre: "Levomepromazina", sinonimos: ["levomepromazina", "sinogan"], clases: ["antipsicotico", "depresor_snc", "anticolinergico"], riesgos: { qt: 2, sedacion: 3, anticolinergico: 2, hipotension: 2 } },
  { id: "linezolid", nombre: "Linezolid", sinonimos: ["linezolid"], clases: ["antibiotico", "imao_reversible"], riesgos: { serotoninergico: 3 } },
  { id: "selegilina", nombre: "Selegilina", sinonimos: ["selegilina"], clases: ["imao"], riesgos: { serotoninergico: 3, presion: 2 } },
  { id: "fenelzina", nombre: "Fenelzina", sinonimos: ["fenelzina", "phenelzine"], clases: ["imao"], riesgos: { serotoninergico: 3, presion: 2 } },
  { id: "lamotrigina", nombre: "Lamotrigina", sinonimos: ["lamotrigina", "lamictal"], clases: ["antiepileptico", "estabilizador_animo"], riesgos: { dermatologico: 2 } },
  { id: "valproato", nombre: "Valproato", sinonimos: ["valproato", "acido valproico", "ácido valproico", "divalproex", "valproic"], clases: ["antiepileptico", "estabilizador_animo", "inhibidor_ugt"], riesgos: { hepatotoxico: 2, dermatologico: 1 } },
  { id: "carbamazepina", nombre: "Carbamazepina", sinonimos: ["carbamazepina", "tegretol"], clases: ["antiepileptico", "estabilizador_animo", "inductor_cyp3a4", "inductor_enzimatico"], riesgos: { sedacion: 1, sodio: 2, dermatologico: 2 } },
  { id: "fenitoina", nombre: "Fenitoína", sinonimos: ["fenitoina", "fenitoína", "phenytoin"], clases: ["antiepileptico", "inductor_cyp3a4"], riesgos: { sedacion: 1, teratogenico: 1 } },
  { id: "topiramato", nombre: "Topiramato", sinonimos: ["topiramato", "topamax"], clases: ["antiepileptico"], riesgos: { sedacion: 1, cognitivo: 2, renal: 1 } },
  { id: "pregabalina", nombre: "Pregabalina", sinonimos: ["pregabalina", "lyrica"], clases: ["gabapentinoide", "depresor_snc"], riesgos: { sedacion: 2, respiratorio: 1, caidas: 2 } },
  { id: "gabapentina", nombre: "Gabapentina", sinonimos: ["gabapentina", "neurontin"], clases: ["gabapentinoide", "depresor_snc"], riesgos: { sedacion: 2, respiratorio: 1, caidas: 2, renal: 1 } },
  { id: "levetiracetam", nombre: "Levetiracetam", sinonimos: ["levetiracetam", "keppra"], clases: ["antiepileptico"], riesgos: { conducta: 1 } },
  { id: "metilfenidato", nombre: "Metilfenidato", sinonimos: ["metilfenidato", "ritalin", "concerta"], clases: ["estimulante"], riesgos: { presion: 2, cardiovascular: 2, ansiedad: 1, apetito: 1 } },
  { id: "atomoxetina", nombre: "Atomoxetina", sinonimos: ["atomoxetina", "strattera"], clases: ["noradrenergico", "sustrato_cyp2d6"], riesgos: { presion: 1, cardiovascular: 1, hipotension: 1 } },
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
  { id: "enfermedad_renal_cronica", nombre: "Enfermedad renal cronica / insuficiencia renal", categoria: "funcion_renal", sinonimos: ["renal", "i13", "i13 enfermedad cardiaca y renal hipertensiva", "enfermedad cardiaca y renal hipertensiva", "enfermedad renal", "insuficiencia renal", "lesion renal aguda", "lesion renal", "aki", "erc", "enfermedad renal cronica"] },
  { id: "insuficiencia_cardiaca", nombre: "Insuficiencia cardiaca / enfermedad cardiovascular", categoria: "cardiovascular", sinonimos: ["insuficiencia cardiaca", "i50", "enfermedad cardiovascular", "cardiovascular", "cardiopatia", "cardiopatia hipertensiva", "i13"] },
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
  {
    id: "sraa_funcion_renal_i13",
    clases: ["ieca", "ara2", "inhibidor_renina"],
    diagnosticoCategoria: "funcion_renal",
    severidad: "alta",
    titulo: "Bloqueador del SRAA en enfermedad renal/cardiaca hipertensiva",
    mecanismo: "IECA/ARA-II modifican la hemodinamia glomerular y pueden elevar potasio o creatinina, especialmente con enfermedad renal, hipovolemia, diureticos, AINEs o bloqueo dual.",
    efecto: "Aumenta la necesidad de vigilancia renal/electrolitica y de presion arterial.",
    recomendacion: "Confirmar indicacion, evitar bloqueo dual rutinario y monitorizar potasio, creatinina, eGFR y presion arterial al inicio y tras ajustes.",
    parametrosVigilancia: ["Potasio", "Creatinina", "eGFR", "Presion arterial"],
    evidencia: "etiquetado_oficial_y_regla_clinica",
    confianza: "alta",
    fuentes: ["DailyMed: etiquetas de IECA/ARA-II advierten hipotension, hiperpotasemia y cambios de funcion renal, especialmente con bloqueo dual del SRAA."]
  },
  {
    id: "diuretico_funcion_renal_i13",
    clase: "diuretico",
    diagnosticoCategoria: "funcion_renal",
    severidad: "moderada",
    titulo: "Diuretico en enfermedad renal/cardiaca hipertensiva",
    mecanismo: "Los diureticos modifican volumen intravascular, presion arterial y electrolitos; el riesgo aumenta con SRAA o AINEs.",
    efecto: "Puede aparecer hipotension, deterioro renal o alteraciones de sodio/potasio.",
    recomendacion: "Vigilar peso/balance, presion arterial, creatinina/eGFR, sodio y potasio.",
    parametrosVigilancia: ["Presion arterial", "Creatinina", "eGFR", "Sodio", "Potasio"],
    evidencia: "etiquetado_oficial_y_regla_clinica",
    confianza: "moderada",
    fuentes: ["DailyMed: etiquetas de diureticos describen cambios de volumen, electrolitos y funcion renal."]
  },
  {
    id: "aine_funcion_renal_i13_ext",
    clase: "aine",
    diagnosticoCategoria: "funcion_renal",
    severidad: "alta",
    titulo: "AINE en enfermedad renal/cardiaca hipertensiva",
    mecanismo: "La inhibicion de prostaglandinas por AINEs puede reducir perfusion renal y antagonizar efecto antihipertensivo.",
    efecto: "Mayor riesgo de lesion renal aguda, retencion de liquidos, hipertension o hiperpotasemia, sobre todo con IECA/ARA-II y diureticos.",
    recomendacion: "Evitar uso sostenido si es posible; si se usa, limitar duracion y monitorizar creatinina/eGFR, potasio y presion arterial.",
    parametrosVigilancia: ["Creatinina", "eGFR", "Potasio", "Presion arterial", "Edema"],
    evidencia: "etiquetado_oficial_y_regla_clinica",
    confianza: "alta",
    fuentes: ["DailyMed: etiquetas de AINEs advierten toxicidad renal, eventos cardiovasculares y reduccion de respuesta a antihipertensivos."]
  },
  { id: "isrs_bipolaridad", clase: "isrs", diagnosticoCategoria: "bipolaridad", severidad: "moderada", titulo: "Antidepresivo en antecedente bipolar", efecto: "Los antidepresivos pueden asociarse a viraje afectivo o inestabilidad si no hay cobertura estabilizadora en pacientes vulnerables.", recomendacion: "Tamizar historia de manía/hipomanía, documentar justificación y vigilar activación, insomnio o irritabilidad." },
  { id: "serotoninergico_hiponatremia", clase: "serotoninergico", diagnosticoCategoria: "sodio", severidad: "moderada", titulo: "Serotoninérgico en hiponatremia", efecto: "ISRS/IRSN pueden contribuir a SIADH e hiponatremia, sobre todo en adultos mayores o con diuréticos.", recomendacion: "Valorar sodio basal y seguimiento clínico/laboratorial." },
  { id: "gabapentinoide_renal", clase: "gabapentinoide", diagnosticoCategoria: "funcion_renal", severidad: "moderada", titulo: "Gabapentinoide con función renal reducida", efecto: "Gabapentina/pregabalina se eliminan principalmente por vía renal y pueden acumularse.", recomendacion: "Ajustar dosis según eGFR y vigilar sedación, mareo y caídas." },
  { id: "sedante_adulto_mayor", riesgo: "sedacion", diagnosticoCategoria: "adulto_mayor", severidad: "moderada", titulo: "Sedante en adulto mayor o fragilidad", efecto: "Aumenta riesgo de caídas, delirium, deterioro cognitivo y depresión respiratoria.", recomendacion: "Usar dosis mínima, preferir alternativas y registrar vigilancia de marcha, cognición y sueño." },
  { id: "anticolinergico_demencia", clase: "anticolinergico", diagnosticoCategoria: "demencia", severidad: "alta", titulo: "Carga anticolinérgica en deterioro cognitivo", efecto: "Puede empeorar memoria, confusión, delirium, estreñimiento y retención urinaria.", recomendacion: "Evitar si es posible y revisar carga anticolinérgica total." },
  { id: "antipsicotico_metabolico", clase: "antipsicotico", excluirIngredientes: ["olanzapina", "clozapina"], diagnosticoCategoria: "metabolico", severidad: "moderada", titulo: "Antipsicótico en obesidad o síndrome metabólico", efecto: "Los antipsicóticos pueden favorecer aumento de peso, resistencia a la insulina, dislipidemia y empeoramiento del riesgo cardiometabólico; el riesgo varía por molécula, dosis, duración y vulnerabilidad basal.", recomendacion: "Documentar balance riesgo-beneficio, elegir la alternativa con menor carga metabólica cuando sea clínicamente posible y vigilar peso/IMC, cintura, presión arterial, glucosa/HbA1c y lípidos.", parametrosVigilancia: ["Peso/IMC", "Circunferencia abdominal", "Presión arterial", "Glucosa/HbA1c", "Perfil de lípidos"], fuentes: ["Etiquetado FDA/DailyMed de antipsicóticos atípicos: advertencias de hiperglucemia, dislipidemia y aumento de peso; verificar ficha técnica de cada molécula."] },
  { id: "antipsicotico_diabetes", clase: "antipsicotico", excluirIngredientes: ["olanzapina", "clozapina"], diagnosticoCategoria: "glucosa", severidad: "moderada", titulo: "Antipsicótico en diabetes o hiperglucemia", efecto: "Puede descompensar control glucémico o aumentar riesgo metabólico, especialmente con antipsicóticos de mayor carga metabólica o polifarmacia.", recomendacion: "Registrar glucosa/HbA1c basal, vigilar síntomas de hiperglucemia, peso, lípidos y coordinar ajustes antidiabéticos si procede.", parametrosVigilancia: ["Glucosa capilar si aplica", "HbA1c", "Peso/IMC", "Lípidos", "Síntomas de hiperglucemia"], fuentes: ["Etiquetado FDA/DailyMed de antipsicóticos atípicos: advertencias metabólicas; verificar ficha técnica de cada molécula."] },
  { id: "olanzapina_metabolico", ingrediente: "olanzapina", diagnosticoCategoria: "metabolico", severidad: "alta", titulo: "Olanzapina con riesgo metabólico", efecto: "Olanzapina tiene una carga metabólica relevante y puede aumentar peso, glucosa, HbA1c y lípidos, con mayor impacto en obesidad, diabetes o síndrome metabólico.", recomendacion: "Documentar balance riesgo-beneficio, considerar alternativas de menor riesgo metabólico si son clínicamente viables y monitorizar peso, cintura, glucosa/HbA1c y lípidos desde el inicio.", parametrosVigilancia: ["Peso/IMC", "Circunferencia abdominal", "Glucosa/HbA1c", "Perfil de lípidos", "Presión arterial"] },
  { id: "olanzapina_diabetes", ingrediente: "olanzapina", diagnosticoCategoria: "glucosa", severidad: "alta", titulo: "Olanzapina en diabetes o hiperglucemia", efecto: "Puede empeorar control glucémico y favorecer ganancia ponderal/dislipidemia.", recomendacion: "Usar solo con justificación clínica clara, coordinar control metabólico y vigilar glucosa/HbA1c, peso y lípidos estrechamente.", parametrosVigilancia: ["Glucosa", "HbA1c", "Peso/IMC", "Lípidos"] },
  { id: "clozapina_metabolico", ingrediente: "clozapina", diagnosticoCategoria: "metabolico", severidad: "alta", titulo: "Clozapina con riesgo metabólico", efecto: "Clozapina puede aumentar de forma importante peso, glucosa y lípidos, además de requerir vigilancia hematológica y clínica específica.", recomendacion: "Plan de seguimiento metabólico, educación al paciente y coordinación de manejo de obesidad/diabetes/dislipidemia; vigilar peso, cintura, glucosa/HbA1c y lípidos.", parametrosVigilancia: ["Peso/IMC", "Circunferencia abdominal", "Glucosa/HbA1c", "Perfil de lípidos", "Biometría hemática según protocolo"] },
  { id: "clozapina_diabetes", ingrediente: "clozapina", diagnosticoCategoria: "glucosa", severidad: "alta", titulo: "Clozapina en diabetes o hiperglucemia", efecto: "Puede descompensar control glucémico y favorecer ganancia ponderal/dislipidemia.", recomendacion: "Requiere vigilancia metabólica estrecha y coordinación con manejo médico; individualizar continuidad según respuesta y alternativas.", parametrosVigilancia: ["Glucosa", "HbA1c", "Peso/IMC", "Lípidos"] },
  { id: "benzodiacepina_suicidio", clase: "benzodiacepina", diagnosticoCategoria: "riesgo_suicida", severidad: "moderada", titulo: "Benzodiacepina en contexto de riesgo suicida", efecto: "Puede aumentar desinhibición, sedación o riesgo de uso no seguro en sobredosis.", recomendacion: "Prescribir cantidades limitadas, involucrar red de apoyo y documentar plan de seguridad." },
  { id: "litio_deshidratacion", ingrediente: "litio", diagnosticoCategoria: "hidratacion", severidad: "alta", titulo: "Litio con deshidratación o pérdidas gastrointestinales", efecto: "La deshidratación puede elevar litio y precipitar toxicidad.", recomendacion: "Valorar suspensión temporal, hidratación, función renal y nivel sérico." },
  { id: "ieca_lactancia", clases: ["ieca", "ara2"], diagnosticoCategoria: "lactancia", severidad: "moderada", titulo: "IECA/ARA-II durante lactancia", efecto: "Requiere valoración del fármaco específico, edad del lactante y alternativas.", recomendacion: "Confirmar compatibilidad y vigilar al lactante si procede." },
  {
    id: "olanzapina_riesgo_cardiovascular",
    ingrediente: "olanzapina",
    diagnosticoCategoria: "hipertension",
    severidad: "moderada",
    titulo: "Olanzapina en hipertensión o riesgo cardiovascular",
    mecanismo: "La carga metabólica puede agravar el riesgo cardiovascular a largo plazo y el antagonismo alfa-1 puede favorecer hipotensión u ortostatismo; además puede potenciar antihipertensivos.",
    efecto: "Puede aumentar peso, glucosa y lípidos y, en paralelo, producir mareo o hipotensión ortostática.",
    recomendacion: "Registrar presión arterial sentado/de pie, peso/IMC, cintura, glucosa/HbA1c y lípidos; revisar antihipertensivos y síntomas ortostáticos.",
    parametrosVigilancia: ["Presión arterial y ortostatismo", "Peso/IMC", "Glucosa/HbA1c", "Perfil de lípidos"],
    evidencia: "documentada_en_fuente_local",
    confianza: "alta",
    fuentes: [`${STAHL_LOCAL}, monografía de olanzapina, PDF 545-553 (impresas 527-535).`]
  },
  {
    id: "risperidona_riesgo_cardiovascular",
    ingrediente: "risperidona",
    diagnosticoCategoria: "hipertension",
    severidad: "moderada",
    titulo: "Risperidona en hipertensión o riesgo cardiovascular",
    mecanismo: "El antagonismo alfa-1 puede causar hipotensión ortostática y risperidona puede potenciar el efecto de antihipertensivos; QTc debe valorarse según factores coexistentes.",
    efecto: "Mayor riesgo de mareo, síncope u ortostatismo, especialmente con deshidratación, calor o antihipertensivos.",
    recomendacion: "Medir presión arterial sentado/de pie, revisar fármacos antihipertensivos, electrolitos y ECG/QTc cuando existan factores de riesgo.",
    parametrosVigilancia: ["Presión arterial y ortostatismo", "Frecuencia cardiaca", "ECG/QTc si hay factores de riesgo", "Potasio y magnesio si procede"],
    evidencia: "documentada_en_fuente_local",
    confianza: "alta",
    fuentes: [`${STAHL_LOCAL}, monografía de risperidona, PDF 664-672 (impresas 646-654).`]
  },
  {
    id: "estimulante_noradrenergico_hipertension",
    clases: ["estimulante", "noradrenergico"],
    diagnosticoCategoria: "hipertension",
    severidad: "moderada",
    titulo: "Estimulante o noradrenérgico en hipertensión/riesgo cardiovascular",
    efecto: "Los fármacos estimulantes o noradrenérgicos pueden elevar presión arterial y frecuencia cardiaca, o reducir la tolerancia cardiovascular en pacientes con hipertensión, taquiarritmias o cardiopatía.",
    recomendacion: "Verificar presión arterial y frecuencia cardiaca basal, control de hipertensión, antecedentes cardiovasculares y necesidad de ECG o valoración cardiológica según el contexto clínico.",
    parametrosVigilancia: ["Presión arterial", "Frecuencia cardiaca", "Palpitaciones", "Dolor torácico", "Insomnio/ansiedad"],
    mecanismo: "Metilfenidato aumenta señal dopaminérgica/noradrenérgica y atomoxetina inhibe la recaptura de noradrenalina; ambos pueden elevar presión arterial o frecuencia cardiaca.",
    evidencia: "documentada_en_fuente_local",
    confianza: "alta",
    fuentes: [
      `${STAHL_LOCAL}, atomoxetina PDF 95-99 (impresas 77-81).`,
      `${STAHL_LOCAL}, metilfenidato PDF 471-479 (impresas 453-461).`
    ]
  }
];

const INTERACCIONES_EXTRA = [
  {
    id: "sraa_aine_riesgo_renal",
    clasesA: ["ieca", "ara2"],
    clasesB: ["aine"],
    severidad: "alta",
    titulo: "IECA/ARA-II + AINE: riesgo renal y perdida de efecto antihipertensivo",
    mecanismo: "El bloqueo eferente del SRAA combinado con inhibicion de prostaglandinas por AINE puede reducir filtracion glomerular; los AINEs tambien pueden atenuar el efecto antihipertensivo.",
    efecto: "Mayor riesgo de lesion renal aguda, hiperpotasemia, elevacion de creatinina, edema o descontrol de presion arterial.",
    recomendacion: "Evitar AINE sostenido si es posible. Si se usa, limitar duracion y vigilar creatinina/eGFR, potasio y presion arterial.",
    parametrosVigilancia: ["Creatinina", "eGFR", "Potasio", "Presion arterial", "Edema"],
    evidencia: "documentada_en_etiquetado",
    confianza: "alta",
    fuentes: ["DailyMed: etiquetas de AINEs e IECA/ARA-II describen deterioro renal, hiperpotasemia y menor respuesta antihipertensiva."]
  },
  {
    id: "serotoninergico_antitrombotico_sangrado",
    clasesA: ["isrs", "irsn"],
    clasesB: ["antiagregante", "anticoagulante"],
    severidad: "moderada",
    titulo: "ISRS/IRSN + antiagregante/anticoagulante",
    mecanismo: "Los serotoninergicos pueden disminuir captacion plaquetaria de serotonina y aumentar tendencia a sangrado; el riesgo se suma con antiagregantes o anticoagulantes.",
    efecto: "Aumenta riesgo de sangrado gastrointestinal u otros sangrados.",
    recomendacion: "Valorar indicacion, antecedente de sangrado, gastroproteccion si procede y vigilancia de sangrado; monitorizar INR si warfarina.",
    parametrosVigilancia: ["Sangrado", "Melena/hematemesis", "Hemoglobina si riesgo", "INR si warfarina"],
    evidencia: "documentada",
    confianza: "moderada",
    fuentes: ["Etiquetas FDA/DailyMed de ISRS/IRSN advierten aumento de sangrado con AINEs, aspirina, warfarina u otros anticoagulantes."]
  },
  {
    id: "valproato_lamotrigina_rash",
    ingredientesA: ["valproato"],
    ingredientesB: ["lamotrigina"],
    severidad: "alta",
    titulo: "Valproato + lamotrigina",
    mecanismo: "Valproato inhibe el metabolismo de lamotrigina y aumenta su exposicion.",
    efecto: "Mayor riesgo de rash grave, incluyendo SJS/TEN, especialmente durante titulacion.",
    recomendacion: "Usar esquema de titulacion de lamotrigina reducido para valproato, educar sobre rash y suspender/valorar de inmediato ante lesiones cutaneas.",
    parametrosVigilancia: ["Rash", "Fiebre/mucosas", "Titulacion"],
    evidencia: "documentada_en_etiquetado",
    confianza: "alta",
    fuentes: ["DailyMed: etiqueta de lamotrigina advierte que valproato aumenta concentraciones de lamotrigina y riesgo de rash grave."]
  },
  {
    id: "carbamazepina_induccion_enzimatica",
    ingredientesA: ["carbamazepina"],
    clasesB: ["sustrato_cyp3a4", "anticoagulante", "anticonceptivo_hormonal", "antipsicotico"],
    severidad: "moderada",
    titulo: "Carbamazepina: induccion enzimatica",
    mecanismo: "Carbamazepina induce CYP3A4 y otras enzimas/transportadores, reduciendo exposicion de multiples sustratos.",
    efecto: "Puede reducir eficacia de farmacos sensibles, incluidos anticonceptivos, anticoagulantes directos y algunos psicofarmacos.",
    recomendacion: "Revisar cada sustrato, considerar alternativas o ajuste con monitorizacion clinica/laboratorial.",
    parametrosVigilancia: ["Eficacia clinica", "Niveles si disponibles", "Sangrado/trombosis si anticoagulante"],
    evidencia: "documentada_en_etiquetado",
    confianza: "alta",
    fuentes: ["DailyMed: etiqueta de carbamazepina describe autoinduccion e induccion de CYP3A4 con interacciones amplias."]
  },
  {
    id: "olanzapina_risperidona_polifarmacia",
    ingredientesA: ["olanzapina"],
    ingredientesB: ["risperidona"],
    severidad: "alta",
    titulo: "Olanzapina + risperidona: duplicidad antipsicótica y cargas aditivas",
    mecanismo: "Polifarmacia con bloqueo dopaminérgico, serotoninérgico y alfa-adrenérgico; las cargas sedante, ortostática, metabólica y extrapiramidal pueden sumarse.",
    efecto: "Puede aumentar sedación, hipotensión/ortostatismo, aumento de peso o alteraciones glucolipídicas, EPS e hiperprolactinemia. El riesgo de QT depende de dosis y factores coexistentes.",
    recomendacion: "Confirmar indicación y duración de la combinación; vigilar estado de alerta, presión sentado/de pie, peso, glucosa/HbA1c, lípidos, EPS, prolactina si síntomas y ECG/electrolitos si hay riesgo de QT.",
    parametrosVigilancia: ["Sedación/SNC", "Presión arterial y ortostatismo", "Peso/IMC", "Glucosa/HbA1c", "Lípidos", "EPS/acatisia", "Prolactina si síntomas", "ECG/QTc si riesgo"],
    evidencia: "mecanismo_y_monografias_locales",
    confianza: "moderada",
    fuentes: [
      `${STAHL_LOCAL}, olanzapina PDF 545-553 (impresas 527-535).`,
      `${STAHL_LOCAL}, risperidona PDF 664-672 (impresas 646-654).`
    ],
    requiereJustificacion: true
  },
  {
    id: "metilfenidato_atomoxetina_cardiovascular",
    ingredientesA: ["metilfenidato"],
    ingredientesB: ["atomoxetina"],
    severidad: "moderada",
    titulo: "Metilfenidato + atomoxetina: vigilancia cardiovascular combinada",
    mecanismo: "Ambos aumentan señal catecolaminérgica. Stahl señala una posibilidad teórica de potenciación cardiovascular, pero también resume que la coadministración no aumentó los efectos cardiovasculares más allá de metilfenidato solo.",
    efecto: "La combinación requiere vigilancia de presión arterial, frecuencia cardiaca, palpitaciones, ansiedad e insomnio, sin presentar la interacción como daño demostrado.",
    recomendacion: "Documentar el motivo de la combinación y medir presión arterial y frecuencia cardiaca basal y durante la titulación; reevaluar ante hipertensión, taquicardia, dolor torácico o síncope.",
    parametrosVigilancia: ["Presión arterial", "Frecuencia cardiaca", "Palpitaciones", "Dolor torácico o síncope", "Sueño/ansiedad"],
    evidencia: "mixta_en_fuente_local",
    confianza: "moderada",
    fuentes: [
      `${STAHL_LOCAL}, atomoxetina PDF 95-99 (impresas 77-81).`,
      `${STAHL_LOCAL}, metilfenidato PDF 471-479 (impresas 453-461).`
    ]
  },
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
  { id: "espironolactona_ieca_ara", clasesA: ["ahorrador_potasio"], clasesB: ["ieca", "ara2"], severidad: "alta", titulo: "Ahorrador de potasio + IECA/ARA-II", mecanismo: "Espironolactona reduce excrecion de potasio y el bloqueo SRAA reduce aldosterona; la combinacion aumenta hiperpotasemia y deterioro renal.", efecto: "Aumenta riesgo de hiperpotasemia y deterioro de funcion renal.", recomendacion: "Controlar potasio, creatinina y eGFR; evitar si K+ elevado o funcion renal inestable.", parametrosVigilancia: ["Potasio", "Creatinina", "eGFR", "Presion arterial"], evidencia: "documentada_en_etiquetado", confianza: "alta", fuentes: ["DailyMed: etiquetas de espironolactona e IECA/ARA-II advierten hiperpotasemia con farmacos que aumentan potasio o bloquean SRAA."] },
  { id: "metotrexato_trimethoprim", ingredientesA: ["metotrexato"], ingredientesB: ["trimetoprim"], severidad: "critica", titulo: "Metotrexato + trimetoprim/sulfametoxazol", efecto: "Riesgo de mielosupresión grave por efecto antifolato aditivo.", recomendacion: "Evitar combinación salvo indicación especializada.", requiereJustificacion: true },
  { id: "metotrexato_aine", ingredientesA: ["metotrexato"], clasesB: ["aine"], severidad: "alta", titulo: "Metotrexato + AINE", efecto: "Puede aumentar toxicidad de metotrexato, sobre todo con dosis altas o función renal reducida.", recomendacion: "Vigilar función renal, biometría hemática y signos de toxicidad." },
  { id: "azatioprina_alopurinol", ingredientesA: ["azatioprina"], ingredientesB: ["alopurinol"], severidad: "critica", titulo: "Azatioprina + alopurinol", efecto: "Riesgo de mielosupresión grave por aumento de metabolitos activos.", recomendacion: "Evitar o ajustar drásticamente con control especializado.", requiereJustificacion: true },
  { id: "cyp3a4_inhibidor_sustrato", clasesA: ["inhibidor_cyp3a4"], clasesB: ["sustrato_cyp3a4"], severidad: "moderada", titulo: "Inhibidor CYP3A4 + sustrato CYP3A4", efecto: "Puede aumentar exposición del sustrato y eventos adversos.", recomendacion: "Revisar dosis, toxicidad esperada y alternativas.", evidencia: "potencial" },
  { id: "rifampicina_anticonceptivo", ingredientesA: ["rifampicina"], clasesB: ["anticonceptivo_hormonal"], severidad: "alta", titulo: "Rifampicina + anticonceptivo hormonal", efecto: "Puede disminuir eficacia anticonceptiva.", recomendacion: "Indicar método alternativo/no hormonal durante y después del tratamiento." },
  { id: "amiodarona_digoxina", ingredientesA: ["amiodarona"], ingredientesB: ["digoxina"], severidad: "alta", titulo: "Amiodarona + digoxina", efecto: "Puede aumentar niveles de digoxina y bradicardia.", recomendacion: "Reducir dosis de digoxina según criterio clínico y monitorizar niveles/ECG." },
  { id: "warfarina_isrs", ingredientesA: ["warfarina"], clasesB: ["isrs", "irsn"], severidad: "moderada", titulo: "Warfarina + ISRS/IRSN", efecto: "Puede aumentar riesgo de sangrado por efecto plaquetario y/o interacciones metabólicas.", recomendacion: "Vigilar INR, sangrado y necesidad de gastroprotección." },
  { id: "nsaid_isrs", clasesA: ["aine"], clasesB: ["isrs", "irsn"], severidad: "moderada", titulo: "AINE + ISRS/IRSN", mecanismo: "Los serotoninergicos pueden alterar funcion plaquetaria y los AINEs aumentan lesion/sangrado gastrointestinal.", efecto: "Aumenta riesgo de sangrado gastrointestinal.", recomendacion: "Evitar uso prolongado, valorar gastroproteccion y vigilar sangrado.", parametrosVigilancia: ["Melena/hematemesis", "Equimosis/sangrado", "Hemoglobina si riesgo", "Dolor epigastrico"], evidencia: "documentada_en_etiquetado", confianza: "moderada", fuentes: ["DailyMed: etiquetas de ISRS/IRSN advierten sangrado con AINEs/aspirina/anticoagulantes; etiquetas de AINEs advierten sangrado GI."] },
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
      `${STAHL_LOCAL}, atomoxetina PDF 95-99.`,
      `${STAHL_LOCAL}, metilfenidato PDF 471-479.`
    ]
  },
  metabolico: {
    minimo: 3,
    severidad: "moderada",
    titulo: "Carga metabólica acumulativa",
    descripcion: "Dos o más tratamientos pueden sumar aumento de peso, dislipidemia o alteración de glucosa.",
    recomendacion: "Vigilar peso/IMC, cintura, glucosa/HbA1c, lípidos y presión arterial; revisar necesidad de polifarmacia.",
    parametrosVigilancia: ["Peso/IMC", "Cintura", "Glucosa/HbA1c", "Perfil de lípidos"],
    fuentes: [`${STAHL_LOCAL}, monografías de los fármacos implicados.`]
  },
  cardiovascular: {
    minimo: 3,
    severidad: "moderada",
    titulo: "Carga cardiovascular acumulativa",
    descripcion: "La combinación reúne efectos sobre presión arterial, frecuencia cardiaca, ortostatismo o tolerancia cardiovascular.",
    recomendacion: "Revisar antecedentes, presión arterial, frecuencia cardiaca y ECG/electrolitos según el mecanismo implicado.",
    parametrosVigilancia: ["Presión arterial", "Frecuencia cardiaca", "Síntomas cardiovasculares"],
    fuentes: [`${STAHL_LOCAL}, monografías de los fármacos implicados.`]
  },
  hipotension: {
    minimo: 3,
    severidad: "moderada",
    titulo: "Carga hipotensora/ortostática acumulativa",
    descripcion: "Varios medicamentos pueden sumar hipotensión, mareo o síncope.",
    recomendacion: "Medir presión sentado/de pie, revisar hidratación y ajustar fármacos según síntomas.",
    parametrosVigilancia: ["Presión arterial sentado/de pie", "Mareo", "Síncope", "Caídas"],
    fuentes: [`${STAHL_LOCAL}, monografías de los fármacos implicados.`]
  },
  eps: {
    minimo: 3,
    severidad: "moderada",
    titulo: "Carga extrapiramidal acumulativa",
    descripcion: "El bloqueo dopaminérgico combinado puede aumentar parkinsonismo, distonía, acatisia o discinesia.",
    recomendacion: "Evaluar EPS/acatisia basal y periódicamente y revisar dosis o polifarmacia.",
    parametrosVigilancia: ["EPS", "Acatisia", "Marcha", "Movimientos involuntarios"],
    fuentes: [`${STAHL_LOCAL}, monografías de los antipsicóticos implicados.`]
  },
  prolactina: {
    minimo: 3,
    severidad: "moderada",
    titulo: "Carga de hiperprolactinemia",
    descripcion: "La combinación puede aumentar la probabilidad de síntomas relacionados con prolactina.",
    recomendacion: "Preguntar por síntomas y solicitar prolactina cuando esté clínicamente indicada.",
    parametrosVigilancia: ["Síntomas sexuales/reproductivos", "Prolactina si síntomas"],
    fuentes: [`${STAHL_LOCAL}, monografía de risperidona PDF 664-672.`]
  },
  serotoninergico: {
    minimo: 3,
    severidad: "alta",
    titulo: "Carga serotoninérgica acumulativa",
    descripcion: "Múltiples fármacos serotoninérgicos pueden aumentar toxicidad serotoninérgica.",
    recomendacion: "Revisar combinaciones, dosis y síntomas autonómicos, neuromusculares y mentales.",
    parametrosVigilancia: ["Estado mental", "Clonus/hiperreflexia", "Temperatura", "Signos autonómicos"],
    fuentes: ["Regla farmacodinámica local; verificar las monografías de los fármacos implicados."]
  },
  sangrado: { minimo: 4, severidad: "alta", titulo: "Carga hemorrágica acumulativa" },
  glucosa: { minimo: 3, severidad: "moderada", titulo: "Carga metabólica glucémica acumulativa" }
};
