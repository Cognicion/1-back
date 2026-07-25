// Catálogo deliberadamente ligero: no importa módulos de cálculo ni datos clínicos.
const med = (id, name, description, specialties, aliases = [], keywords = []) => ({
  id, name, description, category: "Calculadoras médicas", specialties, aliases,
  functions: keywords, keywords: [...keywords, ...specialties], kind: "medical"
});
const ped = (id, name, description, keywords = []) => ({
  id, name, description, category: "Calculadoras pediátricas", specialties: ["Pediatría"],
  aliases: [], functions: keywords, keywords: [...keywords, "pediatría"], kind: "pediatric"
});

export const CALCULATOR_CATALOG = [
  { id: "convencional", name: "Calculadora convencional", description: "Operaciones rápidas sin salir de la nota.", category: "Convencionales", specialties: ["Medicina general"], aliases: ["básica", "operaciones"], functions: ["suma", "resta", "multiplicación", "división"], keywords: ["aritmética"], kind: "conventional" },
  med("calculadora-benzodiacepinas", "Equivalencias de benzodiacepinas", "Equivalencia diaria aproximada entre benzodiacepinas.", ["Farmacología"], ["BZD", "benzos"], ["dosis", "diazepam"]),
  med("imc", "Índice de masa corporal", "Clasifica el peso relativo a la talla en adultos.", ["Medicina general", "Nutrición"], ["IMC", "BMI"], ["peso", "talla", "obesidad", "sobrepeso"]),
  med("superficie-corporal", "Superficie corporal", "Estima la superficie corporal a partir de peso y talla.", ["Medicina general"], ["SC", "ASC", "Mosteller"], ["peso", "talla", "dosis"]),
  med("presion-arterial-media", "Presión arterial media", "Calcula la presión arterial media.", ["Cardiología"], ["PAM"], ["presión", "signos vitales"]),
  med("indice-choque", "Índice de choque", "Relaciona frecuencia cardíaca y presión arterial sistólica.", ["Urgencias"], ["shock index"], ["choque", "hemodinámica"]),
  med("ckd-epi-2021", "TFG estimada CKD-EPI 2021", "Estima la función renal mediante CKD-EPI 2021.", ["Nefrología"], ["CKD-EPI", "TFG", "eGFR"], ["función renal", "creatinina"]),
  med("cockcroft-gault", "Cockcroft-Gault", "Estima la depuración de creatinina.", ["Nefrología", "Farmacología"], ["CrCl", "depuración renal"], ["función renal", "creatinina", "ajuste renal"]),
  med("sodio-corregido", "Sodio corregido por hiperglucemia", "Corrige el sodio en presencia de hiperglucemia.", ["Electrolitos"], ["Na corregido"], ["sodio", "glucosa"]),
  med("calcio-corregido", "Calcio corregido por albúmina", "Corrige el calcio total según la albúmina.", ["Electrolitos"], ["Ca corregido"], ["calcio", "albúmina"]),
  med("anion-gap", "Anión gap", "Calcula la brecha aniónica sérica.", ["Electrolitos"], ["anion gap", "brecha aniónica"], ["acidosis", "metabolismo"]),
  med("osmolaridad-calculada", "Osmolaridad plasmática calculada", "Estima la osmolaridad plasmática.", ["Electrolitos"], ["osmolaridad"], ["sodio", "glucosa", "urea"]),
  med("qt-corregido", "QT corregido", "Corrige el intervalo QT según la frecuencia cardíaca.", ["Cardiología"], ["QTc", "Bazett", "Fridericia"], ["electrocardiograma", "riesgo arrítmico"]),
  med("cha2ds2-vasc", "CHA₂DS₂-VASc", "Estima riesgo tromboembólico en fibrilación auricular.", ["Cardiología"], ["CHA2DS2-VASc"], ["riesgo cardiovascular", "ictus"]),
  med("has-bled", "HAS-BLED", "Estima riesgo de sangrado en anticoagulación.", ["Cardiología"], [], ["hemorragia", "anticoagulación"]),
  med("wells-tep", "Wells para tromboembolia pulmonar", "Estratifica la probabilidad de tromboembolia pulmonar.", ["Urgencias", "Neumología"], ["Wells TEP", "EP"], ["riesgo cardiovascular", "trombosis"]),
  med("perc", "PERC", "Apoya la exclusión de embolia pulmonar de bajo riesgo.", ["Urgencias", "Neumología"], [], ["tromboembolia", "riesgo"]),
  med("curb-65", "CURB-65", "Estratifica la gravedad de neumonía adquirida en comunidad.", ["Neumología", "Urgencias"], [], ["neumonía", "gravedad"]),
  med("glasgow", "Glasgow Coma Scale", "Valora el nivel de conciencia.", ["Urgencias", "Neurología"], ["GCS"], ["conciencia", "neurológico"]),
  med("qsofa", "qSOFA", "Identifica riesgo de mala evolución en infección.", ["Urgencias", "Cuidados críticos"], [], ["sepsis", "infección"]),
  med("sofa", "SOFA", "Evalúa disfunción orgánica en pacientes críticos.", ["Cuidados críticos"], [], ["sepsis", "disfunción orgánica"]),
  med("child-pugh", "Child-Pugh", "Clasifica la gravedad de enfermedad hepática.", ["Gastroenterología"], [], ["hígado", "cirrosis"]),
  med("meld-3", "MELD 3.0", "Estima mortalidad en enfermedad hepática avanzada.", ["Gastroenterología"], ["MELD"], ["hígado", "trasplante"]),
  med("fib-4", "FIB-4", "Estima fibrosis hepática a partir de datos clínicos.", ["Gastroenterología"], [], ["hígado", "fibrosis"]),
  med("glasgow-blatchford", "Glasgow-Blatchford", "Estratifica riesgo en sangrado gastrointestinal.", ["Gastroenterología", "Urgencias"], ["GBS"], ["hemorragia", "digestivo"]),
  med("centor-mcisaac", "Centor modificado / McIsaac", "Estima probabilidad de faringitis estreptocócica.", ["Medicina general", "Infectología"], ["Centor"], ["faringitis", "infección"]),
  med("criterios-light", "Criterios de Light", "Clasifica un derrame pleural.", ["Neumología"], ["Light"], ["derrame", "pleura"]),
  ped("imc_pediatrico", "IMC pediátrico", "Calcula y clasifica el IMC en población pediátrica.", ["peso", "talla", "crecimiento", "nutrición"]),
  ped("superficie_corporal", "Superficie corporal pediátrica", "Estima superficie corporal en pediatría.", ["peso", "talla", "dosis"]),
  ped("percentil_lms", "Percentil LMS", "Calcula percentiles pediátricos mediante LMS.", ["crecimiento", "percentiles", "z-score"]),
  ped("peso_ideal_imc", "Peso para IMC objetivo", "Calcula el peso correspondiente a un IMC objetivo.", ["peso", "talla", "nutrición"]),
  ped("requerimiento_energetico", "Requerimiento energético rápido", "Estima requerimiento energético pediátrico.", ["nutrición", "calorías"]),
  ped("holliday_segar", "Líquidos de mantenimiento Holliday-Segar", "Calcula líquidos de mantenimiento por peso.", ["líquidos", "mantenimiento"]),
  ped("regla_421", "Regla 4-2-1", "Calcula velocidad de líquidos de mantenimiento.", ["líquidos", "infusión"]),
  ped("deficit_deshidratacion", "Déficit por deshidratación", "Estima déficit hídrico pediátrico.", ["deshidratación", "líquidos"]),
  ped("sodio_corregido", "Sodio corregido por glucosa", "Corrige sodio según glucosa en pediatría.", ["sodio", "glucosa", "electrolitos"]),
  ped("anion_gap", "Anión gap pediátrico", "Calcula la brecha aniónica.", ["acidosis", "electrolitos"]),
  ped("osmolaridad", "Osmolaridad calculada pediátrica", "Estima osmolaridad plasmática.", ["sodio", "glucosa"]),
  ped("agua_libre", "Déficit de agua libre", "Calcula déficit de agua libre.", ["sodio", "hidratación"]),
  ped("egfr_schwartz", "eGFR Schwartz bedside", "Estima función renal en población pediátrica.", ["función renal", "creatinina", "nefrología"]),
  ped("fena", "Fracción excretada de sodio", "Calcula la fracción excretada de sodio.", ["función renal", "sodio"]),
  ped("tubo_endotraqueal", "Tubo endotraqueal y profundidad", "Estima tamaño y profundidad del tubo.", ["vía aérea", "urgencias"]),
  ped("adrenalina_paro", "Adrenalina en paro", "Calcula dosis de adrenalina en paro pediátrico.", ["paro", "urgencias", "dosis"]),
  ped("bolo_cristaloide", "Bolo de cristaloide", "Calcula volumen de bolo por peso.", ["choque", "líquidos", "dosis"]),
  ped("gir", "Glucose infusion rate (GIR)", "Calcula la velocidad de infusión de glucosa.", ["glucosa", "neonatología"]),
  ped("apgar", "Apgar", "Calcula la puntuación de Apgar.", ["neonatología", "recién nacido"]),
  ped("qt_corregido", "QT corregido pediátrico", "Corrige el intervalo QT según frecuencia cardíaca.", ["QTc", "cardiología"]),
  ped("pam", "Presión arterial media pediátrica", "Calcula la presión arterial media.", ["PAM", "signos vitales"]),
  ped("pafio", "Relación PaO₂/FiO₂", "Calcula la relación PaO₂/FiO₂.", ["respiratorio", "oxigenación"]),
  ped("fio2", "Índice de oxigenación", "Calcula el índice de oxigenación.", ["respiratorio", "oxigenación"]),
  ped("aa_gradiente", "Gradiente alveolo-arterial", "Calcula el gradiente alveolo-arterial.", ["respiratorio", "oxigenación"]),
  ped("peld_simplificado", "PELD educativo simplificado", "Calcula una versión educativa simplificada de PELD.", ["hígado", "trasplante"])
];

export const CALCULATORS_BY_ID = new Map(CALCULATOR_CATALOG.map((item) => [item.id, item]));
