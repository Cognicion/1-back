import { numero } from "./formulas.js";

export const MEDICAMENTOS_PEDIATRICOS = [
  {
    id: "paracetamol",
    nombre: "Paracetamol / acetaminofen",
    categoria: "Analgesico / antipiretico",
    opciones: [{ etiqueta: "10-15 mg/kg/dosis cada 4-6 h", mgKgDosis: 15, frecuenciaDia: 4, maxMgKgDia: 75, maxMgDia: 4000 }],
    presentaciones: ["Suspension 120 mg/5 mL", "Suspension 160 mg/5 mL", "Tabletas 500 mg", "Gotas segun marca"],
    nombresComerciales: ["Tempra", "Tylenol", "Dolex", "Panadol"],
    contraindicaciones: ["Hepatopatia grave", "Hipersensibilidad al paracetamol"],
    interacciones: ["Alcohol y hepatotoxicos: aumenta riesgo hepatico", "Warfarina: posible aumento de INR con uso repetido"],
    fuente: "Dosis comun en referencias pediatricas; validar con guia local."
  },
  {
    id: "ibuprofeno",
    nombre: "Ibuprofeno",
    categoria: "AINE",
    opciones: [{ etiqueta: "5-10 mg/kg/dosis cada 6-8 h", mgKgDosis: 10, frecuenciaDia: 3, maxMgKgDia: 40, maxMgDia: 2400 }],
    presentaciones: ["Suspension 100 mg/5 mL", "Suspension 200 mg/5 mL", "Tabletas 200 mg", "Tabletas 400 mg"],
    nombresComerciales: ["Advil", "Motrin", "Actron", "Dalsy"],
    contraindicaciones: ["Insuficiencia renal significativa", "Sangrado gastrointestinal activo", "Deshidratacion importante", "Alergia a AINE"],
    interacciones: ["Anticoagulantes/antiagregantes: aumenta sangrado", "IECA/ARA-II/diureticos: aumenta riesgo renal", "Litio/metotrexato: puede aumentar niveles"],
    advertencia: "Evitar en deshidratacion, enfermedad renal o lactantes pequenos sin indicacion clinica.",
    fuente: "Dosis comun en referencias pediatricas; validar con guia local."
  },
  {
    id: "amoxicilina",
    nombre: "Amoxicilina",
    categoria: "Antibiotico",
    opciones: [
      { etiqueta: "40 mg/kg/dia dividido cada 8-12 h", mgKgDia: 40, frecuenciaDia: 2, maxMgDia: 4000 },
      { etiqueta: "80-90 mg/kg/dia dividido cada 12 h", mgKgDia: 90, frecuenciaDia: 2, maxMgDia: 4000 }
    ],
    presentaciones: ["Suspension 250 mg/5 mL", "Suspension 400 mg/5 mL", "Capsulas 500 mg", "Tabletas 875 mg"],
    nombresComerciales: ["Amoxil", "Trimox", "Polymox"],
    contraindicaciones: ["Alergia a penicilinas", "Antecedente de reaccion anafilactica a beta-lactamicos"],
    interacciones: ["Alopurinol: aumenta riesgo de exantema", "Warfarina: posible aumento de INR", "Metotrexato: puede disminuir eliminacion"],
    fuente: "Rangos clinicos habituales; ajustar por indicacion, foco, funcion renal y guia local."
  },
  {
    id: "amoxicilina_clavulanato",
    nombre: "Amoxicilina / acido clavulanico",
    categoria: "Antibiotico",
    opciones: [
      { etiqueta: "40-45 mg/kg/dia de amoxicilina dividido cada 12 h", mgKgDia: 45, frecuenciaDia: 2, maxMgDia: 4000 },
      { etiqueta: "80-90 mg/kg/dia de amoxicilina dividido cada 12 h", mgKgDia: 90, frecuenciaDia: 2, maxMgDia: 4000 }
    ],
    presentaciones: ["Suspension 400/57 mg por 5 mL", "Suspension 600/42.9 mg por 5 mL", "Tabletas 875/125 mg"],
    nombresComerciales: ["Augmentin", "Clavulin", "Amoxiclav"],
    contraindicaciones: ["Alergia a penicilinas", "Antecedente de ictericia colestasica asociada a amoxicilina/clavulanato"],
    interacciones: ["Warfarina: posible aumento de INR", "Metotrexato: posible aumento de toxicidad", "Alopurinol: mayor riesgo de exantema"],
    advertencia: "Calcular habitualmente con el componente amoxicilina y revisar exposicion a clavulanato.",
    fuente: "Rangos clinicos habituales; ajustar por indicacion, foco, funcion renal y guia local."
  },
  {
    id: "cefalexina",
    nombre: "Cefalexina",
    categoria: "Antibiotico",
    opciones: [{ etiqueta: "25-50 mg/kg/dia dividido cada 6-8 h", mgKgDia: 50, frecuenciaDia: 3, maxMgDia: 4000 }],
    presentaciones: ["Suspension 250 mg/5 mL", "Capsulas 250 mg", "Capsulas 500 mg"],
    nombresComerciales: ["Keflex", "Ceporex"],
    contraindicaciones: ["Alergia grave a cefalosporinas", "Precaucion en anafilaxia a penicilinas"],
    interacciones: ["Probenecid: puede aumentar niveles", "Anticoagulantes: vigilar INR en uso concomitante"],
    fuente: "Rangos clinicos habituales; validar con guia institucional."
  },
  {
    id: "ceftriaxona",
    nombre: "Ceftriaxona",
    categoria: "Antibiotico",
    opciones: [{ etiqueta: "50-75 mg/kg/dia cada 24 h", mgKgDia: 75, frecuenciaDia: 1, maxMgDia: 2000 }],
    presentaciones: ["Frasco ampula 500 mg", "Frasco ampula 1 g", "Frasco ampula 2 g"],
    nombresComerciales: ["Rocephin", "Longacef"],
    contraindicaciones: ["Neonatos con hiperbilirrubinemia", "Uso simultaneo con calcio IV en neonatos", "Alergia grave a cefalosporinas"],
    interacciones: ["Calcio IV: riesgo de precipitados en neonatos", "Anticoagulantes: vigilar sangrado/INR"],
    advertencia: "Precaucion en neonatos, hiperbilirrubinemia y uso con calcio IV.",
    fuente: "Rangos clinicos habituales; validar con guia institucional."
  },
  {
    id: "azitromicina",
    nombre: "Azitromicina",
    categoria: "Antibiotico macrolido",
    opciones: [
      { etiqueta: "10 mg/kg/dia cada 24 h", mgKgDia: 10, frecuenciaDia: 1, maxMgDia: 500 },
      { etiqueta: "10 mg/kg dia 1, luego 5 mg/kg/dia", mgKgDia: 10, frecuenciaDia: 1, maxMgDia: 500 }
    ],
    presentaciones: ["Suspension 200 mg/5 mL", "Tabletas 250 mg", "Tabletas 500 mg"],
    nombresComerciales: ["Zithromax", "Azitrocin"],
    contraindicaciones: ["Hipersensibilidad a macrolidos", "Antecedente de colestasis asociada a azitromicina"],
    interacciones: ["Farmacos que prolongan QT: aumenta riesgo arrtimico", "Digoxina: puede aumentar niveles", "Warfarina: vigilar INR"],
    advertencia: "Vigilar QT y factores de riesgo cardiaco.",
    fuente: "Rangos clinicos habituales; validar indicacion y guia local."
  },
  {
    id: "ondansetron",
    nombre: "Ondansetron",
    categoria: "Antiemetico",
    opciones: [{ etiqueta: "0.15 mg/kg/dosis", mgKgDosis: 0.15, frecuenciaDia: 1, maxMgDia: 8 }],
    presentaciones: ["Tabletas 4 mg", "Tabletas 8 mg", "Solucion oral 4 mg/5 mL", "Ampolleta 2 mg/mL"],
    nombresComerciales: ["Zofran", "Yatrox"],
    contraindicaciones: ["Uso concomitante con apomorfina", "QT largo congenito o riesgo alto no monitorizado"],
    interacciones: ["ISRS/IRSN/tramadol: vigilar sindrome serotoninergico", "Macrolidos/antipsicoticos: aumenta riesgo QT"],
    fuente: "Rango habitual; considerar QT, interacciones y contexto clinico."
  },
  {
    id: "metoclopramida",
    nombre: "Metoclopramida",
    categoria: "Antiemetico / procinetico",
    opciones: [{ etiqueta: "0.1-0.15 mg/kg/dosis cada 6-8 h", mgKgDosis: 0.1, frecuenciaDia: 3, maxMgDia: 30 }],
    presentaciones: ["Gotas/solucion oral segun marca", "Tabletas 10 mg", "Ampolleta 5 mg/mL"],
    nombresComerciales: ["Primperan", "Plasil", "Reglan"],
    contraindicaciones: ["Obstruccion/perforacion gastrointestinal", "Feocromocitoma", "Epilepsia no controlada", "Antecedente de discinesia por metoclopramida"],
    interacciones: ["Antipsicoticos: aumenta riesgo extrapiramidal", "ISRS: posible aumento de efectos serotoninergicos/extrapiramidales", "Levodopa: antagonismo dopaminergico"],
    advertencia: "Usar con cautela por riesgo de distonia y efectos extrapiramidales.",
    fuente: "Rango educativo; validar por edad, indicacion y regulacion local."
  },
  {
    id: "salbutamol",
    nombre: "Salbutamol / albuterol",
    categoria: "Broncodilatador beta-2",
    opciones: [{ etiqueta: "0.15 mg/kg/dosis nebulizada", mgKgDosis: 0.15, frecuenciaDia: 1, maxMgDia: 5 }],
    presentaciones: ["Inhalador 100 mcg/disparo", "Solucion nebulizable 5 mg/mL", "Jarabe segun marca"],
    nombresComerciales: ["Ventolin", "Airomir", "ProAir"],
    contraindicaciones: ["Hipersensibilidad", "Precaucion en arritmias o cardiopatia significativa"],
    interacciones: ["Beta bloqueadores: reducen efecto", "Diureticos/esteroides: pueden aumentar hipokalemia", "IMAO/triciclicos: potencian efectos cardiovasculares"],
    advertencia: "La dosis inhalada depende del dispositivo y protocolo; esta calculadora aproxima nebulizacion.",
    fuente: "Rangos clinicos habituales; validar protocolo respiratorio local."
  },
  {
    id: "prednisolona",
    nombre: "Prednisolona / prednisona",
    categoria: "Corticoide",
    opciones: [{ etiqueta: "1-2 mg/kg/dia cada 12-24 h", mgKgDia: 1, frecuenciaDia: 1, maxMgDia: 60 }],
    presentaciones: ["Solucion 15 mg/5 mL", "Tabletas 5 mg", "Tabletas 20 mg", "Tabletas 50 mg"],
    nombresComerciales: ["Prelone", "Meticorten", "Dacortin"],
    contraindicaciones: ["Infeccion sistemica no tratada", "Hipersensibilidad"],
    interacciones: ["AINE: aumenta riesgo gastrointestinal", "Vacunas vivas: precaucion en inmunosupresion", "Inductores CYP3A4: reducen efecto"],
    fuente: "Rango educativo; ajustar por indicacion y duracion."
  },
  {
    id: "dexametasona",
    nombre: "Dexametasona",
    categoria: "Corticoide",
    opciones: [{ etiqueta: "0.15-0.6 mg/kg/dosis", mgKgDosis: 0.6, frecuenciaDia: 1, maxMgDia: 16 }],
    presentaciones: ["Tabletas 0.5 mg", "Tabletas 4 mg", "Solucion oral 0.5 mg/5 mL", "Ampolleta 4 mg/mL"],
    nombresComerciales: ["Decadron", "Fortecortin"],
    contraindicaciones: ["Infeccion sistemica no tratada", "Hipersensibilidad"],
    interacciones: ["AINE: aumenta riesgo gastrointestinal", "Inductores/inhibidores CYP3A4: alteran exposicion", "Vacunas vivas: precaucion"],
    fuente: "Rango educativo; validar indicacion, via y protocolo."
  },
  {
    id: "cetirizina",
    nombre: "Cetirizina",
    categoria: "Antihistaminico",
    opciones: [{ etiqueta: "0.25 mg/kg/dia cada 24 h", mgKgDia: 0.25, frecuenciaDia: 1, maxMgDia: 10 }],
    presentaciones: ["Solucion 1 mg/mL", "Tabletas 10 mg", "Gotas segun marca"],
    nombresComerciales: ["Zyrtec", "Reactine"],
    contraindicaciones: ["Hipersensibilidad", "Ajustar/evitar en insuficiencia renal grave segun contexto"],
    interacciones: ["Alcohol/sedantes: puede aumentar somnolencia"],
    fuente: "Rango educativo; validar por edad y presentacion disponible."
  },
  {
    id: "hidroxizina",
    nombre: "Hidroxizina",
    categoria: "Antihistaminico / ansiolitico",
    opciones: [{ etiqueta: "0.5-1 mg/kg/dosis cada 6-8 h", mgKgDosis: 0.5, frecuenciaDia: 3, maxMgDia: 100 }],
    presentaciones: ["Jarabe 10 mg/5 mL", "Tabletas 10 mg", "Tabletas 25 mg"],
    nombresComerciales: ["Atarax", "Vistaril"],
    contraindicaciones: ["QT largo", "Hipersensibilidad", "Primer trimestre de embarazo"],
    interacciones: ["Sedantes: aumenta depresion SNC", "Farmacos que prolongan QT: aumenta riesgo arritmico", "Alcohol: aumenta sedacion"],
    advertencia: "Vigilar sedacion, QT y combinaciones con psicofarmacos.",
    fuente: "Rango educativo; validar por edad, peso e indicacion."
  },
  {
    id: "lorazepam",
    nombre: "Lorazepam",
    categoria: "Benzodiacepina",
    opciones: [{ etiqueta: "0.05-0.1 mg/kg/dosis", mgKgDosis: 0.05, frecuenciaDia: 1, maxMgDia: 4 }],
    presentaciones: ["Tabletas 1 mg", "Tabletas 2 mg", "Ampolleta 2 mg/mL"],
    nombresComerciales: ["Ativan", "Orfidal", "Temesta"],
    contraindicaciones: ["Depresion respiratoria grave", "Miastenia gravis", "Apnea del sueno grave", "Hipersensibilidad a benzodiacepinas"],
    interacciones: ["Opioides/alcohol/sedantes: depresion respiratoria y sedacion", "Clozapina: riesgo de colapso/sedacion intensa", "Anticonvulsivos sedantes: efecto aditivo"],
    advertencia: "Uso bajo supervision clinica; vigilar depresion respiratoria y sedacion.",
    fuente: "Rango educativo inicial; ajustar a indicacion y protocolo."
  },
  {
    id: "diazepam",
    nombre: "Diazepam",
    categoria: "Benzodiacepina",
    opciones: [{ etiqueta: "0.1-0.3 mg/kg/dosis", mgKgDosis: 0.2, frecuenciaDia: 1, maxMgDia: 10 }],
    presentaciones: ["Tabletas 5 mg", "Tabletas 10 mg", "Solucion rectal segun marca", "Ampolleta 5 mg/mL"],
    nombresComerciales: ["Valium", "Stesolid"],
    contraindicaciones: ["Depresion respiratoria grave", "Miastenia gravis", "Apnea del sueno grave", "Hipersensibilidad"],
    interacciones: ["Opioides/alcohol/sedantes: depresion respiratoria", "Inhibidores CYP3A4/2C19: aumentan niveles", "Inductores CYP: reducen efecto"],
    advertencia: "Validar indicacion y via; esta calculadora es apoyo educativo.",
    fuente: "Rango educativo; ajustar a protocolo de urgencias o indicacion."
  },
  {
    id: "risperidona",
    nombre: "Risperidona",
    categoria: "Antipsicotico",
    opciones: [{ etiqueta: "0.01-0.03 mg/kg/dia cada 12-24 h", mgKgDia: 0.02, frecuenciaDia: 1, maxMgDia: 6 }],
    presentaciones: ["Solucion oral 1 mg/mL", "Tabletas 0.5 mg", "Tabletas 1 mg", "Tabletas 2 mg"],
    nombresComerciales: ["Risperdal", "Risperin"],
    contraindicaciones: ["Hipersensibilidad a risperidona/paliperidona", "Precaucion en QT largo, sindrome neuroleptico maligno previo o epilepsia"],
    interacciones: ["ISRS CYP2D6 como fluoxetina/paroxetina: aumentan niveles", "Farmacos QT: riesgo aditivo", "Antihipertensivos: hipotension"],
    advertencia: "Vigilar sintomas extrapiramidales, peso, prolactina, metabolismo y QT segun riesgo.",
    fuente: "Rango educativo; debe individualizarse por edad, indicacion y protocolo."
  },
  {
    id: "aripiprazol",
    nombre: "Aripiprazol",
    categoria: "Antipsicotico",
    opciones: [{ etiqueta: "0.05-0.15 mg/kg/dia cada 24 h", mgKgDia: 0.05, frecuenciaDia: 1, maxMgDia: 30 }],
    presentaciones: ["Tabletas 5 mg", "Tabletas 10 mg", "Tabletas 15 mg", "Solucion oral segun pais"],
    nombresComerciales: ["Abilify"],
    contraindicaciones: ["Hipersensibilidad", "Precaucion en epilepsia, riesgo metabolico o acatisia marcada"],
    interacciones: ["Inhibidores CYP2D6/3A4: aumentan niveles", "Inductores CYP3A4: reducen niveles", "Farmacos sedantes: efecto aditivo"],
    advertencia: "Vigilar acatisia, activacion, metabolismo y sintomas extrapiramidales.",
    fuente: "Rango educativo; validar indicacion y edad autorizada."
  },
  {
    id: "fluoxetina",
    nombre: "Fluoxetina",
    categoria: "ISRS",
    opciones: [{ etiqueta: "0.2-0.5 mg/kg/dia cada 24 h", mgKgDia: 0.2, frecuenciaDia: 1, maxMgDia: 60 }],
    presentaciones: ["Capsulas 20 mg", "Tabletas 20 mg", "Solucion 20 mg/5 mL"],
    nombresComerciales: ["Prozac", "Sarafem"],
    contraindicaciones: ["Uso concomitante con IMAO", "Pimozida o tioridazina", "Hipersensibilidad"],
    interacciones: ["IMAO/linezolid/triptanos/tramadol: sindrome serotoninergico", "CYP2D6: aumenta niveles de algunos antipsicoticos/TCAs", "AINE/anticoagulantes: sangrado"],
    advertencia: "Vigilar activacion, ideacion suicida, viraje maniforme e interacciones serotoninergicas.",
    fuente: "Rango educativo; validar diagnostico, edad, consentimiento y guia local."
  },
  {
    id: "sertralina",
    nombre: "Sertralina",
    categoria: "ISRS",
    opciones: [{ etiqueta: "0.5-1 mg/kg/dia cada 24 h", mgKgDia: 0.5, frecuenciaDia: 1, maxMgDia: 200 }],
    presentaciones: ["Tabletas 25 mg", "Tabletas 50 mg", "Tabletas 100 mg", "Concentrado oral segun pais"],
    nombresComerciales: ["Zoloft", "Altruline"],
    contraindicaciones: ["Uso concomitante con IMAO", "Pimozida", "Hipersensibilidad"],
    interacciones: ["IMAO/linezolid/tramadol/triptanos: sindrome serotoninergico", "AINE/anticoagulantes: sangrado", "Farmacos QT: precaucion en riesgo cardiaco"],
    advertencia: "Vigilar activacion, ideacion suicida, viraje maniforme y sintomas gastrointestinales.",
    fuente: "Rango educativo; validar indicacion y edad autorizada."
  },
  {
    id: "metilfenidato",
    nombre: "Metilfenidato",
    categoria: "Estimulante",
    opciones: [{ etiqueta: "0.3 mg/kg/dosis cada 8-12 h", mgKgDosis: 0.3, frecuenciaDia: 2, maxMgDia: 60 }],
    presentaciones: ["Tabletas IR 10 mg", "Tabletas/liberacion modificada 18 mg", "27 mg", "36 mg", "54 mg"],
    nombresComerciales: ["Ritalin", "Concerta", "Medikinet"],
    contraindicaciones: ["Uso con IMAO", "Cardiopatia estructural grave no valorada", "Glaucoma", "Ansiedad/agitation severa no estabilizada"],
    interacciones: ["IMAO: crisis hipertensiva", "Antihipertensivos: puede reducir efecto", "ISRS/antipsicoticos: vigilar activacion o efectos cardiovasculares"],
    advertencia: "Controlar TA, FC, peso, talla, apetito, sueno y riesgo cardiovascular.",
    fuente: "Rango educativo; ajustar segun formulacion, respuesta y normativa local."
  },
  {
    id: "atomoxetina",
    nombre: "Atomoxetina",
    categoria: "Inhibidor recaptura noradrenalina",
    opciones: [{ etiqueta: "0.5-1.2 mg/kg/dia cada 24 h", mgKgDia: 1.2, frecuenciaDia: 1, maxMgDia: 100 }],
    presentaciones: ["Capsulas 10 mg", "18 mg", "25 mg", "40 mg", "60 mg", "80 mg", "100 mg"],
    nombresComerciales: ["Strattera"],
    contraindicaciones: ["Uso con IMAO", "Glaucoma de angulo estrecho", "Feocromocitoma", "Enfermedad cardiovascular grave no controlada"],
    interacciones: ["Fluoxetina/paroxetina: aumentan niveles por CYP2D6", "Salbutamol sistemico: puede potenciar efectos cardiovasculares", "IMAO: contraindicado"],
    advertencia: "Vigilar TA, FC, apetito, somnolencia, irritabilidad e ideacion suicida.",
    fuente: "Rango educativo; validar edad, peso y respuesta."
  },
  {
    id: "clonidina",
    nombre: "Clonidina",
    categoria: "Agonista alfa-2",
    opciones: [{ etiqueta: "0.002-0.005 mg/kg/dia dividido cada 8-12 h", mgKgDia: 0.003, frecuenciaDia: 2, maxMgDia: 0.4 }],
    presentaciones: ["Tabletas 0.1 mg", "Tabletas 0.15 mg", "Tabletas 0.2 mg", "Parche segun pais"],
    nombresComerciales: ["Catapres"],
    contraindicaciones: ["Hipersensibilidad", "Precaucion en bradicardia, hipotension o bloqueo AV"],
    interacciones: ["Sedantes: somnolencia aditiva", "Antihipertensivos: hipotension/bradicardia", "Suspension brusca: hipertension rebote"],
    advertencia: "No suspender bruscamente. Vigilar TA, FC y sedacion.",
    fuente: "Rango educativo; individualizar titulación."
  },
  {
    id: "acido_valproico",
    nombre: "Acido valproico / valproato",
    categoria: "Anticonvulsivo / estabilizador",
    opciones: [{ etiqueta: "10-15 mg/kg/dia dividido cada 12 h", mgKgDia: 15, frecuenciaDia: 2, maxMgDia: 3000 }],
    presentaciones: ["Jarabe 250 mg/5 mL", "Capsulas 250 mg", "Tabletas 500 mg", "Liberacion prolongada segun marca"],
    nombresComerciales: ["Depakene", "Depakote", "Epival"],
    contraindicaciones: ["Hepatopatia significativa", "Trastornos del ciclo de la urea", "Enfermedad mitocondrial POLG", "Embarazo en algunas indicaciones"],
    interacciones: ["Lamotrigina: aumenta niveles y riesgo de rash", "Carbapenemicos: reducen niveles de valproato", "Topiramato: hiperamonemia", "AAS: aumenta fraccion libre"],
    advertencia: "Requiere vigilancia clinica y laboratorial segun protocolo: funcion hepatica, plaquetas, niveles si aplica.",
    fuente: "Rango educativo; validar indicacion neurologica/psiquiatrica y protocolo."
  },
  {
    id: "carbamazepina",
    nombre: "Carbamazepina",
    categoria: "Anticonvulsivo / estabilizador",
    opciones: [{ etiqueta: "10-20 mg/kg/dia dividido cada 12 h", mgKgDia: 10, frecuenciaDia: 2, maxMgDia: 1200 }],
    presentaciones: ["Suspension 100 mg/5 mL", "Tabletas 200 mg", "Liberacion prolongada 200/400 mg"],
    nombresComerciales: ["Tegretol", "Carbatrol"],
    contraindicaciones: ["Bloqueo AV", "Depresion medular", "Uso con IMAO", "Hipersensibilidad a triciclicos/carbamazepina"],
    interacciones: ["Inductor CYP: reduce niveles de multiples farmacos", "Macrolidos/azoles: aumentan niveles", "Anticonceptivos: reduce eficacia", "Litio/antipsicoticos: neurotoxicidad posible"],
    advertencia: "Vigilar rash, hemograma, sodio, funcion hepatica e interacciones.",
    fuente: "Rango educativo; validar por indicacion y niveles cuando aplique."
  },
  {
    id: "levetiracetam",
    nombre: "Levetiracetam",
    categoria: "Anticonvulsivo",
    opciones: [{ etiqueta: "20-60 mg/kg/dia dividido cada 12 h", mgKgDia: 20, frecuenciaDia: 2, maxMgDia: 3000 }],
    presentaciones: ["Solucion 100 mg/mL", "Tabletas 250 mg", "500 mg", "750 mg", "1000 mg"],
    nombresComerciales: ["Keppra"],
    contraindicaciones: ["Hipersensibilidad", "Ajuste en insuficiencia renal"],
    interacciones: ["Pocas interacciones CYP relevantes", "Sedantes: somnolencia aditiva"],
    advertencia: "Vigilar irritabilidad, cambios conductuales y funcion renal.",
    fuente: "Rango educativo; ajustar a indicacion neurologica y funcion renal."
  },
  {
    id: "omeprazol",
    nombre: "Omeprazol",
    categoria: "Inhibidor de bomba de protones",
    opciones: [{ etiqueta: "0.7-1 mg/kg/dia cada 24 h", mgKgDia: 1, frecuenciaDia: 1, maxMgDia: 40 }],
    presentaciones: ["Capsulas 10 mg", "Capsulas 20 mg", "Suspension magistral segun institucion"],
    nombresComerciales: ["Losec", "Prilosec"],
    contraindicaciones: ["Hipersensibilidad a IBP"],
    interacciones: ["Clopidogrel: puede reducir activacion", "Diazepam/fenitoina: posible aumento", "Farmacos dependientes de pH gastrico: altera absorcion"],
    fuente: "Rango educativo; validar indicacion y duracion."
  },
  {
    id: "melatonina",
    nombre: "Melatonina",
    categoria: "Regulador sueno-vigilia",
    opciones: [{ etiqueta: "0.05-0.1 mg/kg/dia nocturna", mgKgDia: 0.05, frecuenciaDia: 1, maxMgDia: 5 }],
    presentaciones: ["Tabletas/gotas 1 mg", "3 mg", "5 mg segun marca"],
    nombresComerciales: ["Circadin", "Melamil", "Natrol"],
    contraindicaciones: ["Hipersensibilidad", "Precaucion en epilepsia o enfermedad autoinmune segun contexto"],
    interacciones: ["Sedantes: somnolencia aditiva", "Fluvoxamina: puede aumentar niveles de melatonina", "Anticoagulantes: precaucion teorica"],
    advertencia: "Acompanar de intervenciones de higiene del sueno; validar preparacion y calidad del producto.",
    fuente: "Rango educativo; evidencia y regulacion varian por pais."
  }
];

export function calcularDosisMedicamento({ medicamentoId, opcionIndice = 0, pesoKg, concentracionMgMl, pesoConfirmado = false }) {
  const medicamento = MEDICAMENTOS_PEDIATRICOS.find((item) => item.id === medicamentoId);
  const peso = numero(pesoKg);
  if (!medicamento) return { error: "Selecciona un medicamento." };
  if (!peso || peso <= 0) return { error: "Registra un peso actual en kg." };
  if (!pesoConfirmado) return { error: "Confirma que el peso usado es actual antes de calcular dosis." };

  const opcion = medicamento.opciones[Number(opcionIndice)] || medicamento.opciones[0];
  let mgDosis = opcion.mgKgDosis ? opcion.mgKgDosis * peso : (opcion.mgKgDia * peso) / (opcion.frecuenciaDia || 1);
  let mgDia = mgDosis * (opcion.frecuenciaDia || 1);

  if (opcion.maxMgKgDia) mgDia = Math.min(mgDia, opcion.maxMgKgDia * peso);
  if (opcion.maxMgDia) mgDia = Math.min(mgDia, opcion.maxMgDia);
  if (opcion.mgKgDia || opcion.maxMgKgDia || opcion.maxMgDia) {
    mgDosis = mgDia / (opcion.frecuenciaDia || 1);
  }

  const concentracion = numero(concentracionMgMl);
  return {
    medicamento,
    opcion,
    mgDosis,
    mgDia,
    volumenMlDosis: concentracion ? mgDosis / concentracion : null,
    frecuenciaDia: opcion.frecuenciaDia || 1
  };
}
