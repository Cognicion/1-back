export const INGREDIENTES_MEDICAMENTOS = [
  {
    id: "paracetamol",
    nombre: "Paracetamol",
    sinonimos: ["paracetamol", "acetaminofen", "acetaminofén", "tempra", "tylenol", "zaldiar", "tramacet"],
    clases: ["analgesico_no_opioide"],
    riesgos: { hepatotoxico: 2 }
  },
  {
    id: "ibuprofeno",
    nombre: "Ibuprofeno",
    sinonimos: ["ibuprofeno", "advil", "motrin"],
    clases: ["aine"],
    riesgos: { renal: 2, sangrado: 1 }
  },
  {
    id: "naproxeno",
    nombre: "Naproxeno",
    sinonimos: ["naproxeno", "flanax"],
    clases: ["aine"],
    riesgos: { renal: 2, sangrado: 1 }
  },
  {
    id: "diclofenaco",
    nombre: "Diclofenaco",
    sinonimos: ["diclofenaco", "voltaren"],
    clases: ["aine"],
    riesgos: { renal: 2, sangrado: 1 }
  },
  {
    id: "ketorolaco",
    nombre: "Ketorolaco",
    sinonimos: ["ketorolaco", "dolac"],
    clases: ["aine"],
    riesgos: { renal: 3, sangrado: 2 }
  },
  {
    id: "metformina",
    nombre: "Metformina",
    sinonimos: ["metformina", "glucophage"],
    clases: ["biguanida"],
    riesgos: { renal: 1 }
  },
  {
    id: "bupropion",
    nombre: "Bupropión",
    sinonimos: ["bupropion", "bupropión", "wellbutrin", "zyban"],
    clases: ["ndri"],
    riesgos: { convulsivo: 3 }
  },
  {
    id: "valproato",
    nombre: "Valproato",
    sinonimos: ["valproato", "acido valproico", "ácido valproico", "divalproato", "atemperator"],
    clases: ["antiepileptico", "estabilizador_animo"],
    riesgos: { teratogenico: 3, hepatotoxico: 2 }
  },
  {
    id: "litio",
    nombre: "Litio",
    sinonimos: ["litio", "carbonato de litio"],
    clases: ["estabilizador_animo"],
    riesgos: { renal: 2 }
  },
  {
    id: "lorazepam",
    nombre: "Lorazepam",
    sinonimos: ["lorazepam"],
    clases: ["benzodiacepina", "depresor_snc"],
    riesgos: { sedacion: 2, respiratorio: 1 }
  },
  {
    id: "diazepam",
    nombre: "Diazepam",
    sinonimos: ["diazepam", "valium"],
    clases: ["benzodiacepina", "depresor_snc"],
    riesgos: { sedacion: 2, respiratorio: 1 }
  },
  {
    id: "clonazepam",
    nombre: "Clonazepam",
    sinonimos: ["clonazepam", "rivotril"],
    clases: ["benzodiacepina", "depresor_snc"],
    riesgos: { sedacion: 2, respiratorio: 1 }
  },
  {
    id: "tramadol",
    nombre: "Tramadol",
    sinonimos: ["tramadol", "zaldiar", "tramacet"],
    clases: ["opioide", "depresor_snc", "serotoninergico"],
    riesgos: { sedacion: 2, respiratorio: 2, convulsivo: 1 }
  },
  {
    id: "morfina",
    nombre: "Morfina",
    sinonimos: ["morfina", "morphine"],
    clases: ["opioide", "depresor_snc"],
    riesgos: { sedacion: 3, respiratorio: 3 }
  },
  {
    id: "sertralina",
    nombre: "Sertralina",
    sinonimos: ["sertralina", "altruline", "zoloft"],
    clases: ["isrs", "serotoninergico"],
    riesgos: { qt: 1, sangrado: 1 }
  },
  {
    id: "fluoxetina",
    nombre: "Fluoxetina",
    sinonimos: ["fluoxetina", "prozac"],
    clases: ["isrs", "serotoninergico", "inhibidor_cyp2d6"],
    riesgos: { qt: 1, sangrado: 1 }
  },
  {
    id: "citalopram",
    nombre: "Citalopram",
    sinonimos: ["citalopram"],
    clases: ["isrs", "serotoninergico"],
    riesgos: { qt: 2, sangrado: 1 }
  },
  {
    id: "escitalopram",
    nombre: "Escitalopram",
    sinonimos: ["escitalopram", "lexapro"],
    clases: ["isrs", "serotoninergico"],
    riesgos: { qt: 2, sangrado: 1 }
  },
  {
    id: "haloperidol",
    nombre: "Haloperidol",
    sinonimos: ["haloperidol", "haldol"],
    clases: ["antipsicotico"],
    riesgos: { qt: 3, sedacion: 1 }
  },
  {
    id: "quetiapina",
    nombre: "Quetiapina",
    sinonimos: ["quetiapina", "seroquel"],
    clases: ["antipsicotico", "sustrato_cyp3a4"],
    riesgos: { qt: 2, sedacion: 2, anticolinergico: 1 }
  },
  {
    id: "amitriptilina",
    nombre: "Amitriptilina",
    sinonimos: ["amitriptilina"],
    clases: ["triciclico", "serotoninergico"],
    riesgos: { qt: 2, sedacion: 2, anticolinergico: 3 }
  },
  {
    id: "biperideno",
    nombre: "Biperideno",
    sinonimos: ["biperideno", "akineton"],
    clases: ["anticolinergico"],
    riesgos: { anticolinergico: 3 }
  },
  {
    id: "hidroxicina",
    nombre: "Hidroxicina",
    sinonimos: ["hidroxicina"],
    clases: ["antihistaminico", "depresor_snc", "anticolinergico"],
    riesgos: { sedacion: 2, anticolinergico: 2, qt: 1 }
  },
  {
    id: "warfarina",
    nombre: "Warfarina",
    sinonimos: ["warfarina", "coumadin"],
    clases: ["anticoagulante"],
    riesgos: { sangrado: 3 }
  },
  {
    id: "rivaroxaban",
    nombre: "Rivaroxabán",
    sinonimos: ["rivaroxaban", "rivaroxabán", "xarelto"],
    clases: ["anticoagulante"],
    riesgos: { sangrado: 3 }
  },
  {
    id: "aspirina",
    nombre: "Ácido acetilsalicílico",
    sinonimos: ["aspirina", "acido acetilsalicilico", "ácido acetilsalicílico", "asa"],
    clases: ["antiagregante", "aine"],
    riesgos: { sangrado: 2, renal: 1 }
  },
  {
    id: "carbamazepina",
    nombre: "Carbamazepina",
    sinonimos: ["carbamazepina", "tegretol"],
    clases: ["antiepileptico", "inductor_cyp3a4"],
    riesgos: { sedacion: 1 }
  },
  {
    id: "enalapril",
    nombre: "Enalapril",
    sinonimos: ["enalapril"],
    clases: ["ieca"],
    riesgos: { potasio: 1, embarazo: 2 }
  },
  {
    id: "losartan",
    nombre: "Losartán",
    sinonimos: ["losartan", "losartán"],
    clases: ["ara2"],
    riesgos: { potasio: 1, embarazo: 2 }
  },
  {
    id: "espironolactona",
    nombre: "Espironolactona",
    sinonimos: ["espironolactona"],
    clases: ["diuretico", "ahorrador_potasio"],
    riesgos: { potasio: 2 }
  },
  {
    id: "furosemida",
    nombre: "Furosemida",
    sinonimos: ["furosemida"],
    clases: ["diuretico"],
    riesgos: { renal: 1 }
  },
  {
    id: "propranolol",
    nombre: "Propranolol",
    sinonimos: ["propranolol"],
    clases: ["betabloqueador_no_selectivo"],
    riesgos: { broncoespasmo: 2 }
  },
  {
    id: "prednisona",
    nombre: "Prednisona",
    sinonimos: ["prednisona", "corticoide"],
    clases: ["corticoide_sistemico"],
    riesgos: { glucosa: 2 }
  },
  {
    id: "gentamicina",
    nombre: "Gentamicina",
    sinonimos: ["gentamicina"],
    clases: ["aminoglucosido"],
    riesgos: { renal: 3 }
  },
  {
    id: "azitromicina",
    nombre: "Azitromicina",
    sinonimos: ["azitromicina"],
    clases: ["macrolido"],
    riesgos: { qt: 2 }
  },
  {
    id: "claritromicina",
    nombre: "Claritromicina",
    sinonimos: ["claritromicina"],
    clases: ["macrolido", "inhibidor_cyp3a4"],
    riesgos: { qt: 2 }
  },
  {
    id: "ciprofloxacino",
    nombre: "Ciprofloxacino",
    sinonimos: ["ciprofloxacino", "ciprofloxacina"],
    clases: ["fluoroquinolona"],
    riesgos: { qt: 1 }
  },
  {
    id: "clozapina",
    nombre: "Clozapina",
    sinonimos: ["clozapina"],
    clases: ["antipsicotico"],
    riesgos: { sedacion: 2, anticolinergico: 2, neutropenia: 3 }
  }
];

export const DIAGNOSTICOS_CLINICOS = [
  {
    id: "hepatopatia_cronica",
    nombre: "Hepatopatía crónica / insuficiencia hepática",
    categoria: "funcion_hepatica",
    sinonimos: ["insuficiencia hepatica", "insuficiencia hepática", "hepatopatia", "hepatopatía", "cirrosis", "child pugh", "child-pugh", "hepatitis b", "hepatitis c", "insufisiencia hepatica"]
  },
  {
    id: "enfermedad_renal_cronica",
    nombre: "Enfermedad renal crónica / insuficiencia renal",
    categoria: "funcion_renal",
    sinonimos: ["insuficiencia renal", "enfermedad renal cronica", "enfermedad renal crónica", "erc", "filtrado glomerular bajo", "dialisis", "diálisis"]
  },
  {
    id: "embarazo",
    nombre: "Embarazo",
    categoria: "embarazo",
    sinonimos: ["embarazo", "embarazada", "gestacion", "gestación"]
  },
  {
    id: "epilepsia",
    nombre: "Epilepsia / antecedente convulsivo",
    categoria: "riesgo_convulsivo",
    sinonimos: ["epilepsia", "crisis convulsiva", "convulsiones", "antecedente convulsivo"]
  },
  {
    id: "asma",
    nombre: "Asma / broncoespasmo",
    categoria: "riesgo_broncoespasmo",
    sinonimos: ["asma", "broncoespasmo", "epoc con broncoespasmo"]
  },
  {
    id: "glaucoma_angulo_cerrado",
    nombre: "Glaucoma de ángulo cerrado",
    categoria: "glaucoma",
    sinonimos: ["glaucoma", "angulo cerrado", "ángulo cerrado"]
  },
  {
    id: "qt_prolongado",
    nombre: "QT prolongado / riesgo arrítmico",
    categoria: "qt",
    sinonimos: ["qt prolongado", "qtc prolongado", "torsades", "arritmia ventricular"]
  },
  {
    id: "sangrado_digestivo",
    nombre: "Sangrado digestivo / úlcera péptica",
    categoria: "sangrado",
    sinonimos: ["sangrado digestivo", "hemorragia digestiva", "ulcera peptica", "úlcera péptica", "melena"]
  },
  {
    id: "insuficiencia_respiratoria",
    nombre: "Insuficiencia respiratoria",
    categoria: "respiratorio",
    sinonimos: ["insuficiencia respiratoria", "apnea del sueño", "hipoventilacion", "hipoventilación"]
  },
  {
    id: "hiperpotasemia",
    nombre: "Hiperpotasemia",
    categoria: "potasio",
    sinonimos: ["hiperpotasemia", "hiperkalemia", "potasio alto"]
  },
  {
    id: "hipertension_no_controlada",
    nombre: "Hipertensión no controlada",
    categoria: "hipertension",
    sinonimos: ["hipertension no controlada", "hipertensión no controlada", "crisis hipertensiva"]
  },
  {
    id: "diabetes",
    nombre: "Diabetes mellitus",
    categoria: "glucosa",
    sinonimos: ["diabetes", "dm2", "dm1", "hiperglucemia"]
  },
  {
    id: "neutropenia",
    nombre: "Neutropenia / agranulocitosis",
    categoria: "neutropenia",
    sinonimos: ["neutropenia", "agranulocitosis", "neutrofilos bajos", "neutrófilos bajos"]
  },
  {
    id: "deshidratacion",
    nombre: "Deshidratación",
    categoria: "hidratacion",
    sinonimos: ["deshidratacion", "deshidratación", "vomitos persistentes", "vómitos persistentes", "diarrea intensa"]
  }
];

export const REGLAS_MEDICAMENTO_DIAGNOSTICO = [
  {
    id: "paracetamol_hepatopatia",
    ingrediente: "paracetamol",
    diagnosticoCategoria: "funcion_hepatica",
    severidad: "moderada",
    titulo: "Paracetamol en hepatopatía crónica",
    efecto: "El antecedente hepático aumenta la vulnerabilidad a hepatotoxicidad, especialmente con dosis altas, consumo de alcohol, ayuno o Child-Pugh avanzado.",
    recomendacion: "Usar la menor dosis efectiva, evitar duplicidad de productos combinados, documentar indicación y vigilar función hepática. En Child-Pugh B/C o descompensación, preferir alternativa o justificar.",
    escalamiento: { childPugh: { b: "alta", c: "alta" } },
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "aine_enfermedad_renal",
    clase: "aine",
    diagnosticoCategoria: "funcion_renal",
    severidad: "alta",
    titulo: "AINE en insuficiencia renal",
    efecto: "Los AINE pueden reducir perfusión renal, precipitar lesión renal aguda y empeorar enfermedad renal crónica.",
    recomendacion: "Evitar si es posible; si se usa, limitar dosis/duración y monitorizar creatinina, presión arterial y potasio.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "metformina_enfermedad_renal",
    ingrediente: "metformina",
    diagnosticoCategoria: "funcion_renal",
    severidad: "alta",
    titulo: "Metformina con función renal reducida",
    efecto: "La insuficiencia renal aumenta el riesgo de acumulación y acidosis láctica, especialmente con eGFR bajo o enfermedad aguda.",
    recomendacion: "Verificar eGFR antes de prescribir o continuar; ajustar o suspender según función renal.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "bupropion_epilepsia",
    ingrediente: "bupropion",
    diagnosticoCategoria: "riesgo_convulsivo",
    severidad: "alta",
    titulo: "Bupropión en epilepsia o antecedente convulsivo",
    efecto: "Bupropión disminuye el umbral convulsivo y puede aumentar el riesgo de crisis.",
    recomendacion: "Evitar salvo indicación excepcional y documentada; considerar alternativas.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "valproato_embarazo",
    ingrediente: "valproato",
    diagnosticoCategoria: "embarazo",
    severidad: "critica",
    titulo: "Valproato en embarazo",
    efecto: "Valproato se asocia con teratogenicidad y alteraciones del neurodesarrollo fetal.",
    recomendacion: "Evitar salvo indicación estrictamente indispensable; requiere valoración especializada, consentimiento y documentación.",
    permiteOverride: true,
    requiereJustificacionSi: ["critica"]
  },
  {
    id: "ieca_ara_embarazo",
    clases: ["ieca", "ara2"],
    diagnosticoCategoria: "embarazo",
    severidad: "alta",
    titulo: "IECA/ARA-II en embarazo",
    efecto: "Puede causar toxicidad fetal, especialmente renal, y complicaciones obstétricas.",
    recomendacion: "Suspender o sustituir por alternativa segura según contexto clínico.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "propranolol_asma",
    ingrediente: "propranolol",
    diagnosticoCategoria: "riesgo_broncoespasmo",
    severidad: "alta",
    titulo: "Betabloqueador no selectivo en asma",
    efecto: "Puede precipitar broncoespasmo y reducir respuesta a beta-agonistas.",
    recomendacion: "Evitar o justificar; preferir alternativas cardioselectivas si procede.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "anticolinergico_glaucoma",
    clase: "anticolinergico",
    diagnosticoCategoria: "glaucoma",
    severidad: "alta",
    titulo: "Carga anticolinérgica en glaucoma",
    efecto: "Los anticolinérgicos pueden precipitar cierre angular o aumentar síntomas oculares en pacientes vulnerables.",
    recomendacion: "Evitar en glaucoma de ángulo cerrado o confirmar seguridad oftalmológica.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "qt_farmaco_qt",
    riesgo: "qt",
    diagnosticoCategoria: "qt",
    severidad: "alta",
    titulo: "Fármaco con riesgo de QT en paciente vulnerable",
    efecto: "La presencia de QT prolongado o riesgo arrítmico aumenta la probabilidad de eventos ventriculares.",
    recomendacion: "Valorar ECG, electrolitos, dosis y alternativas.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "benzodiacepina_resp",
    clase: "benzodiacepina",
    diagnosticoCategoria: "respiratorio",
    severidad: "alta",
    titulo: "Benzodiacepina en insuficiencia respiratoria",
    efecto: "Puede agravar hipoventilación, apnea o depresión respiratoria.",
    recomendacion: "Evitar o usar dosis mínima con vigilancia estrecha.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "potasio_farmaco_hiperpotasemia",
    riesgo: "potasio",
    diagnosticoCategoria: "potasio",
    severidad: "alta",
    titulo: "Medicamento que puede aumentar potasio en hiperpotasemia",
    efecto: "Puede agravar hiperpotasemia y riesgo arrítmico.",
    recomendacion: "Evitar combinación o controlar potasio y función renal.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  },
  {
    id: "corticoide_diabetes",
    clase: "corticoide_sistemico",
    diagnosticoCategoria: "glucosa",
    severidad: "moderada",
    titulo: "Corticoide sistémico en diabetes",
    efecto: "Puede elevar glucosa y descompensar control metabólico.",
    recomendacion: "Planear monitoreo glucémico y ajustes terapéuticos si se usa.",
    permiteOverride: true
  },
  {
    id: "clozapina_neutropenia",
    ingrediente: "clozapina",
    diagnosticoCategoria: "neutropenia",
    severidad: "critica",
    titulo: "Clozapina en neutropenia",
    efecto: "Clozapina puede asociarse a neutropenia grave o agranulocitosis.",
    recomendacion: "No iniciar o suspender según conteo absoluto de neutrófilos y protocolo institucional.",
    permiteOverride: true,
    requiereJustificacionSi: ["critica"]
  },
  {
    id: "litio_renal",
    ingrediente: "litio",
    diagnosticoCategoria: "funcion_renal",
    severidad: "alta",
    titulo: "Litio con enfermedad renal",
    efecto: "La función renal reducida aumenta niveles de litio y riesgo de toxicidad.",
    recomendacion: "Revisar eGFR, niveles séricos, hidratación y necesidad de alternativa.",
    permiteOverride: true,
    requiereJustificacionSi: ["alta"]
  }
];

export const REGLAS_INTERACCIONES_CLINICAS = [
  {
    id: "opioide_benzodiacepina",
    clasesA: ["opioide"],
    clasesB: ["benzodiacepina"],
    severidad: "alta",
    titulo: "Opioide + benzodiacepina",
    efecto: "Aumenta sedación profunda, caídas y depresión respiratoria.",
    recomendacion: "Evitar si es posible; si es indispensable, usar dosis mínima y vigilancia respiratoria.",
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "anticoagulante_aine",
    clasesA: ["anticoagulante", "antiagregante"],
    clasesB: ["aine"],
    severidad: "alta",
    titulo: "Anticoagulante/antiagregante + AINE",
    efecto: "Incrementa riesgo de sangrado gastrointestinal y sistémico.",
    recomendacion: "Evitar o justificar; valorar gastroprotección y vigilancia de sangrado.",
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "litio_aine",
    ingredientesA: ["litio"],
    clasesB: ["aine"],
    severidad: "alta",
    titulo: "Litio + AINE",
    efecto: "Los AINE pueden elevar niveles de litio y precipitar toxicidad.",
    recomendacion: "Evitar o monitorizar niveles de litio y función renal.",
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "litio_diuretico",
    ingredientesA: ["litio"],
    clasesB: ["diuretico"],
    severidad: "alta",
    titulo: "Litio + diurético",
    efecto: "Los diuréticos pueden elevar litio y favorecer toxicidad neurológica o renal.",
    recomendacion: "Evitar o controlar estrechamente niveles, función renal e hidratación.",
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "isrs_imao",
    clasesA: ["isrs", "serotoninergico"],
    clasesB: ["imao"],
    severidad: "critica",
    titulo: "Serotoninérgico + IMAO",
    efecto: "Riesgo de síndrome serotoninérgico potencialmente grave.",
    recomendacion: "No combinar sin protocolo especializado y periodo de lavado.",
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "serotoninergico_tramadol",
    clasesA: ["serotoninergico"],
    ingredientesB: ["tramadol"],
    severidad: "alta",
    titulo: "Serotoninérgico + tramadol",
    efecto: "Aumenta riesgo serotoninérgico y convulsivo.",
    recomendacion: "Valorar analgesia alternativa y vigilar síntomas serotoninérgicos.",
    permiteOverride: true,
    requiereJustificacion: true
  },
  {
    id: "inductor_cyp3a4_sustrato",
    clasesA: ["inductor_cyp3a4"],
    clasesB: ["sustrato_cyp3a4"],
    severidad: "moderada",
    titulo: "Interacción CYP3A4 potencial",
    efecto: "Un inductor de CYP3A4 puede reducir exposición del fármaco sustrato y disminuir respuesta clínica.",
    recomendacion: "Vigilar respuesta, dosis y necesidad de alternativa.",
    evidencia: "potencial"
  }
];

export const UMBRALES_RIESGO_ACUMULATIVO = {
  qt: { minimo: 3, severidad: "alta", titulo: "Carga acumulativa de QT" },
  sedacion: { minimo: 4, severidad: "moderada", titulo: "Carga sedante acumulativa" },
  anticolinergico: { minimo: 3, severidad: "moderada", titulo: "Carga anticolinérgica acumulativa" },
  hepatotoxico: { minimo: 4, severidad: "moderada", titulo: "Carga hepatotóxica acumulativa" },
  renal: { minimo: 4, severidad: "moderada", titulo: "Carga renal acumulativa" }
};
