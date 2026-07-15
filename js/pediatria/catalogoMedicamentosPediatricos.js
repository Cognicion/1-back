export const CATALOGO_MEDICAMENTOS_PEDIATRICOS = [
  {
    medicationId: "paracetamol",
    genericName: "Paracetamol / acetaminofén",
    synonyms: ["acetaminofen", "acetaminofén", "apap"],
    drugClass: "Analgésico / antipirético",
    mechanism: "Inhibición central de prostaglandinas y modulación de vías nociceptivas. No tiene efecto antiinflamatorio periférico relevante.",
    ageRange: "Uso pediátrico habitual según edad, peso, presentación y contexto clínico.",
    routes: ["oral", "rectal", "intravenosa"],
    indications: [
      {
        indicationId: "dolor_fiebre",
        name: "Dolor o fiebre",
        ageRange: "Pediatría general",
        dosingSchemes: [
          { type: "mg_kg_dosis", label: "10 mg/kg/dosis cada 4 a 6 horas", minimum: 10, usual: 10, maximum: 15, unit: "mg/kg/dosis", frequencyOptions: [4, 5, 6], intervalOptions: [4, 6], maxPerDose: 1000, maxPerDay: 4000, maxMgKgDay: 75, routes: ["oral", "rectal"], source: "Rango pediátrico habitual; verificar guía local." },
          { type: "mg_kg_dosis", label: "15 mg/kg/dosis cada 4 a 6 horas", minimum: 10, usual: 15, maximum: 15, unit: "mg/kg/dosis", frequencyOptions: [4, 5, 6], intervalOptions: [4, 6], maxPerDose: 1000, maxPerDay: 4000, maxMgKgDay: 75, routes: ["oral", "rectal"], source: "Rango pediátrico habitual; verificar guía local." }
        ]
      }
    ],
    presentations: [
      {
        presentationId: "paracetamol_tempra_jarabe_32mg_ml_120ml",
        medicationId: "paracetamol",
        genericName: "Paracetamol",
        brandName: "Tempra",
        manufacturer: "P&G Health México",
        country: "México",
        pharmaceuticalForm: "jarabe",
        form: "jarabe",
        commercialName: "Tempra jarabe infantil",
        activeIngredientAmount: 3.2,
        activeIngredientUnit: "g",
        referenceVolume: 100,
        referenceVolumeUnit: "mL",
        amountMg: 3200,
        volumeMl: 100,
        concentrationMgPerMl: 32,
        commercialStrength: "3.2 g/100 mL",
        unitStrength: "3.2 g/100 mL",
        packageContent: 120,
        packageUnit: "mL",
        packageLabel: "frasco 120 mL",
        route: ["oral"],
        routes: ["oral"],
        ageLabel: "2 a 11 años",
        flavor: "",
        divisible: null,
        requiresReconstitution: false,
        brands: ["Tempra"],
        active: true,
        source: "Sitio oficial Tempra México / alerta sanitaria COFEPRIS sobre Tempra 3.2 g/100 mL",
        sourceType: "fabricante_regulador",
        verifiedAt: "2026-07-15",
        updatedAt: "2026-07-15"
      },
      { presentationId: "paracetamol_susp_120_5", medicationId: "paracetamol", genericName: "Paracetamol", brandName: "Genérico", country: "México", pharmaceuticalForm: "suspensión", form: "suspensión", amountMg: 120, volumeMl: 5, activeIngredientAmount: 120, activeIngredientUnit: "mg", referenceVolume: 5, referenceVolumeUnit: "mL", concentrationMgPerMl: 24, commercialStrength: "120 mg/5 mL", unitStrength: "120 mg/5 mL", routes: ["oral"], route: ["oral"], divisible: null, brands: ["Genérico"], active: true, source: "Catálogo local educativo; validar ficha técnica antes de uso institucional", sourceType: "catalogo_local", verifiedAt: "", updatedAt: "2026-07-14" },
      { presentationId: "paracetamol_susp_160_5", medicationId: "paracetamol", genericName: "Paracetamol", brandName: "Genérico", country: "México", pharmaceuticalForm: "suspensión", form: "suspensión", amountMg: 160, volumeMl: 5, activeIngredientAmount: 160, activeIngredientUnit: "mg", referenceVolume: 5, referenceVolumeUnit: "mL", concentrationMgPerMl: 32, commercialStrength: "160 mg/5 mL", unitStrength: "160 mg/5 mL", routes: ["oral"], route: ["oral"], divisible: null, brands: ["Genérico"], active: true, source: "Catálogo local educativo; validar ficha técnica antes de uso institucional", sourceType: "catalogo_local", verifiedAt: "", updatedAt: "2026-07-14" },
      { presentationId: "paracetamol_gotas_100_1", medicationId: "paracetamol", genericName: "Paracetamol", brandName: "Genérico", country: "México", pharmaceuticalForm: "gotas", form: "gotas", amountMg: 100, volumeMl: 1, activeIngredientAmount: 100, activeIngredientUnit: "mg", referenceVolume: 1, referenceVolumeUnit: "mL", concentrationMgPerMl: 100, commercialStrength: "100 mg/mL", unitStrength: "100 mg/mL", routes: ["oral"], route: ["oral"], dropsPerMl: null, divisible: null, brands: ["Genérico"], active: true, source: "Catálogo local educativo; validar equivalencia gotas/mL por marca", sourceType: "catalogo_local", verifiedAt: "", updatedAt: "2026-07-14" },
      { presentationId: "paracetamol_tab_500", medicationId: "paracetamol", genericName: "Paracetamol", brandName: "Genérico", country: "México", pharmaceuticalForm: "tableta", form: "tableta", amountMg: 500, activeIngredientAmount: 500, activeIngredientUnit: "mg", referenceVolume: 1, referenceVolumeUnit: "tableta", commercialStrength: "500 mg por tableta", unitStrength: "500 mg por tableta", routes: ["oral"], route: ["oral"], divisible: true, brands: ["Genérico"], active: true, source: "Catálogo local educativo; validar ficha técnica antes de uso institucional", sourceType: "catalogo_local", verifiedAt: "", updatedAt: "2026-07-14" }
    ],
    contraindications: ["Hipersensibilidad al paracetamol", "Hepatopatía grave o falla hepática activa"],
    precautions: ["Enfermedad hepática", "Desnutrición", "Uso concomitante de otros productos con paracetamol"],
    interactions: ["Alcohol y hepatotóxicos: aumenta riesgo hepático", "Warfarina: posible aumento de INR con uso repetido"],
    adverseEffects: ["Náusea", "Exantema", "Elevación de transaminasas", "Hepatotoxicidad en sobredosis"],
    renalAdjustment: "Generalmente no requiere ajuste puntual para dosis ocasionales; individualizar en enfermedad renal avanzada.",
    hepaticAdjustment: "Evitar o reducir dosis en hepatopatía significativa según criterio clínico.",
    sources: ["Catálogo educativo COGNICIÓN; validar con ficha técnica y protocolo local."],
    updatedAt: "2026-07-14"
  },
  {
    medicationId: "ibuprofeno",
    genericName: "Ibuprofeno",
    synonyms: ["ibuprofen", "aine"],
    drugClass: "Antiinflamatorio no esteroideo",
    mechanism: "Inhibición de COX-1/COX-2 con disminución de prostaglandinas.",
    ageRange: "Uso pediátrico habitual evitando lactantes pequeños sin indicación específica.",
    routes: ["oral"],
    indications: [
      {
        indicationId: "dolor_fiebre_inflamacion",
        name: "Dolor, fiebre o inflamación",
        ageRange: "Pediatría general",
        dosingSchemes: [
          { type: "mg_kg_dosis", label: "5 mg/kg/dosis cada 6 a 8 horas", minimum: 5, usual: 5, maximum: 10, unit: "mg/kg/dosis", frequencyOptions: [3, 4], intervalOptions: [6, 8], maxPerDose: 600, maxPerDay: 2400, maxMgKgDay: 40, routes: ["oral"], source: "Rango pediátrico habitual; verificar guía local." },
          { type: "mg_kg_dosis", label: "10 mg/kg/dosis cada 6 a 8 horas", minimum: 5, usual: 10, maximum: 10, unit: "mg/kg/dosis", frequencyOptions: [3, 4], intervalOptions: [6, 8], maxPerDose: 600, maxPerDay: 2400, maxMgKgDay: 40, routes: ["oral"], source: "Rango pediátrico habitual; verificar guía local." }
        ]
      }
    ],
    presentations: [
      { presentationId: "ibuprofeno_susp_100_5", form: "suspensión", amountMg: 100, volumeMl: 5, concentrationMgPerMl: 20, unitStrength: "100 mg/5 mL", routes: ["oral"], brands: ["Advil", "Motrin", "Dalsy", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "ibuprofeno_susp_200_5", form: "suspensión", amountMg: 200, volumeMl: 5, concentrationMgPerMl: 40, unitStrength: "200 mg/5 mL", routes: ["oral"], brands: ["Advil", "Motrin", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "ibuprofeno_tab_200", form: "tableta", amountMg: 200, unitStrength: "200 mg por tableta", routes: ["oral"], divisible: true, brands: ["Advil", "Motrin", "Genérico"], active: true, updatedAt: "2026-07-14" }
    ],
    contraindications: ["Alergia a AINE", "Sangrado gastrointestinal activo", "Insuficiencia renal significativa", "Deshidratación importante"],
    precautions: ["Asma sensible a AINE", "Gastritis o antecedente de sangrado", "Uso con anticoagulantes", "Enfermedad renal"],
    interactions: ["Anticoagulantes/antiagregantes: mayor sangrado", "IECA/ARA-II/diuréticos: riesgo renal", "Litio/metotrexato: posible aumento de niveles"],
    adverseEffects: ["Dolor abdominal", "Náusea", "Sangrado gastrointestinal", "Lesión renal aguda en contexto de riesgo"],
    renalAdjustment: "Evitar o individualizar en lesión renal, hipovolemia o deshidratación.",
    hepaticAdjustment: "Precaución en hepatopatía significativa.",
    sources: ["Catálogo educativo COGNICIÓN; validar con ficha técnica y protocolo local."],
    updatedAt: "2026-07-14"
  },
  {
    medicationId: "amoxicilina",
    genericName: "Amoxicilina",
    synonyms: ["amoxil", "penicilina"],
    drugClass: "Antibiótico beta-lactámico",
    mechanism: "Inhibe síntesis de pared bacteriana por unión a proteínas fijadoras de penicilina.",
    ageRange: "Pediatría general según foco infeccioso y función renal.",
    routes: ["oral"],
    indications: [
      {
        indicationId: "infeccion_respiratoria_otitis",
        name: "Otitis media / infección respiratoria susceptible",
        ageRange: "Pediatría general",
        dosingSchemes: [
          { type: "mg_kg_dia", label: "40 mg/kg/día dividido cada 8 a 12 horas", minimum: 25, usual: 40, maximum: 50, unit: "mg/kg/día", frequencyOptions: [2, 3], intervalOptions: [8, 12], maxPerDose: 1000, maxPerDay: 4000, routes: ["oral"], source: "Rango pediátrico habitual; verificar foco y guía local." },
          { type: "mg_kg_dia", label: "80-90 mg/kg/día dividido cada 12 horas", minimum: 80, usual: 90, maximum: 90, unit: "mg/kg/día", frequencyOptions: [2], intervalOptions: [12], maxPerDose: 2000, maxPerDay: 4000, routes: ["oral"], source: "Rango pediátrico habitual; verificar foco y guía local." }
        ]
      }
    ],
    presentations: [
      { presentationId: "amoxicilina_susp_250_5", form: "suspensión", amountMg: 250, volumeMl: 5, concentrationMgPerMl: 50, unitStrength: "250 mg/5 mL", routes: ["oral"], brands: ["Amoxil", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "amoxicilina_susp_400_5", form: "suspensión", amountMg: 400, volumeMl: 5, concentrationMgPerMl: 80, unitStrength: "400 mg/5 mL", routes: ["oral"], brands: ["Amoxil", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "amoxicilina_cap_500", form: "cápsula", amountMg: 500, unitStrength: "500 mg por cápsula", routes: ["oral"], divisible: false, brands: ["Amoxil", "Genérico"], active: true, updatedAt: "2026-07-14" }
    ],
    contraindications: ["Alergia a penicilinas", "Antecedente de anafilaxia a beta-lactámicos"],
    precautions: ["Ajuste renal si enfermedad renal significativa", "Mononucleosis infecciosa por riesgo de exantema"],
    interactions: ["Alopurinol: mayor riesgo de exantema", "Warfarina: vigilar INR", "Metotrexato: posible aumento de toxicidad"],
    adverseEffects: ["Diarrea", "Exantema", "Náusea", "Candidiasis"],
    renalAdjustment: "Ajustar intervalo/dosis en insuficiencia renal según guía local.",
    hepaticAdjustment: "Sin ajuste habitual; vigilar si hepatopatía compleja.",
    sources: ["Catálogo educativo COGNICIÓN; validar con ficha técnica y protocolo local."],
    updatedAt: "2026-07-14"
  },
  {
    medicationId: "ondansetron",
    genericName: "Ondansetrón",
    synonyms: ["ondansetron", "zofran"],
    drugClass: "Antiemético antagonista 5-HT3",
    mechanism: "Antagonismo selectivo 5-HT3 periférico y central.",
    ageRange: "Uso pediátrico según indicación, edad y riesgo de QT.",
    routes: ["oral", "intravenosa"],
    indications: [
      {
        indicationId: "nausea_vomito",
        name: "Náusea y vómito",
        dosingSchemes: [
          { type: "mg_kg_dosis", label: "0.15 mg/kg/dosis", minimum: 0.1, usual: 0.15, maximum: 0.15, unit: "mg/kg/dosis", frequencyOptions: [1, 2, 3], intervalOptions: [8, 12, 24], maxPerDose: 8, maxPerDay: 24, routes: ["oral", "intravenosa"], source: "Rango educativo; verificar indicación y protocolo local." }
        ]
      }
    ],
    presentations: [
      { presentationId: "ondansetron_sol_4_5", form: "solución", amountMg: 4, volumeMl: 5, concentrationMgPerMl: 0.8, unitStrength: "4 mg/5 mL", routes: ["oral"], brands: ["Zofran", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "ondansetron_tab_4", form: "tableta", amountMg: 4, unitStrength: "4 mg por tableta", routes: ["oral"], divisible: false, brands: ["Zofran", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "ondansetron_amp_2_1", form: "ampolla", amountMg: 2, volumeMl: 1, concentrationMgPerMl: 2, unitStrength: "2 mg/mL", routes: ["intravenosa"], brands: ["Zofran", "Genérico"], active: true, updatedAt: "2026-07-14" }
    ],
    contraindications: ["Uso concomitante con apomorfina", "QT largo congénito o riesgo alto sin monitorización"],
    precautions: ["Hipokalemia", "Hipomagnesemia", "Uso con fármacos que prolongan QT"],
    interactions: ["Fármacos QT: riesgo aditivo", "ISRS/IRSN/tramadol: vigilar síndrome serotoninérgico"],
    adverseEffects: ["Cefalea", "Estreñimiento", "Prolongación QT"],
    renalAdjustment: "Sin ajuste habitual.",
    hepaticAdjustment: "Individualizar en hepatopatía grave.",
    sources: ["Catálogo educativo COGNICIÓN; validar con ficha técnica y protocolo local."],
    updatedAt: "2026-07-14"
  },
  {
    medicationId: "risperidona",
    genericName: "Risperidona",
    synonyms: ["risperdal", "antipsicotico", "antipsicótico"],
    drugClass: "Antipsicótico atípico",
    mechanism: "Antagonismo dopaminérgico D2 y serotoninérgico 5-HT2A, con efectos según dosis y susceptibilidad.",
    ageRange: "Uso pediátrico debe individualizarse por indicación, edad y monitoreo metabólico.",
    routes: ["oral"],
    indications: [
      {
        indicationId: "irritabilidad_conducta",
        name: "Irritabilidad/agitación/conducta disruptiva según valoración",
        dosingSchemes: [
          { type: "mg_kg_dia", label: "0.01-0.03 mg/kg/día cada 12 a 24 horas", minimum: 0.01, usual: 0.02, maximum: 0.03, unit: "mg/kg/día", frequencyOptions: [1, 2], intervalOptions: [12, 24], maxPerDose: 3, maxPerDay: 6, routes: ["oral"], source: "Rango educativo; validar edad/indicación autorizada y guía local." }
        ]
      }
    ],
    presentations: [
      { presentationId: "risperidona_sol_1_1", form: "solución", amountMg: 1, volumeMl: 1, concentrationMgPerMl: 1, unitStrength: "1 mg/mL", routes: ["oral"], brands: ["Risperdal", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "risperidona_tab_1", form: "tableta", amountMg: 1, unitStrength: "1 mg por tableta", routes: ["oral"], divisible: true, brands: ["Risperdal", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "risperidona_tab_2", form: "tableta", amountMg: 2, unitStrength: "2 mg por tableta", routes: ["oral"], divisible: true, brands: ["Risperdal", "Genérico"], active: true, updatedAt: "2026-07-14" }
    ],
    contraindications: ["Hipersensibilidad a risperidona o paliperidona"],
    precautions: ["QT largo", "Epilepsia", "Síndrome metabólico", "Hiperprolactinemia", "Síntomas extrapiramidales"],
    interactions: ["Fluoxetina/paroxetina: aumentan exposición", "Fármacos QT: riesgo aditivo", "Antihipertensivos: hipotensión"],
    adverseEffects: ["Somnolencia", "Aumento de peso", "Hiperprolactinemia", "Síntomas extrapiramidales"],
    renalAdjustment: "Considerar dosis inicial menor en enfermedad renal significativa.",
    hepaticAdjustment: "Considerar dosis inicial menor en hepatopatía significativa.",
    sources: ["Catálogo educativo COGNICIÓN; validar con ficha técnica y protocolo local."],
    updatedAt: "2026-07-14"
  },
  {
    medicationId: "sertralina",
    genericName: "Sertralina",
    synonyms: ["zoloft", "isrs"],
    drugClass: "ISRS",
    mechanism: "Inhibición selectiva de recaptura de serotonina.",
    ageRange: "Uso pediátrico según diagnóstico, edad, consentimiento y seguimiento estrecho.",
    routes: ["oral"],
    indications: [
      {
        indicationId: "ansiedad_depresion_toc",
        name: "Ansiedad/depresión/TOC según valoración especializada",
        dosingSchemes: [
          { type: "mg_kg_dia", label: "0.5-1 mg/kg/día cada 24 horas", minimum: 0.5, usual: 0.5, maximum: 1, unit: "mg/kg/día", frequencyOptions: [1], intervalOptions: [24], maxPerDose: 200, maxPerDay: 200, routes: ["oral"], source: "Rango educativo; validar indicación y edad autorizada." }
        ]
      }
    ],
    presentations: [
      { presentationId: "sertralina_tab_25", form: "tableta", amountMg: 25, unitStrength: "25 mg por tableta", routes: ["oral"], divisible: true, brands: ["Zoloft", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "sertralina_tab_50", form: "tableta", amountMg: 50, unitStrength: "50 mg por tableta", routes: ["oral"], divisible: true, brands: ["Zoloft", "Genérico"], active: true, updatedAt: "2026-07-14" },
      { presentationId: "sertralina_tab_100", form: "tableta", amountMg: 100, unitStrength: "100 mg por tableta", routes: ["oral"], divisible: true, brands: ["Zoloft", "Genérico"], active: true, updatedAt: "2026-07-14" }
    ],
    contraindications: ["Uso concomitante con IMAO", "Pimozida", "Hipersensibilidad"],
    precautions: ["Ideación suicida", "Viraje maniforme", "Sangrado con AINE/anticoagulantes", "Hiponatremia"],
    interactions: ["IMAO/linezolid/tramadol: síndrome serotoninérgico", "AINE/anticoagulantes: sangrado", "Otros serotoninérgicos: riesgo aditivo"],
    adverseEffects: ["Náusea", "Diarrea", "Insomnio", "Activación", "Disfunción sexual"],
    renalAdjustment: "Sin ajuste habitual.",
    hepaticAdjustment: "Considerar menor dosis o intervalo en hepatopatía.",
    sources: ["Catálogo educativo COGNICIÓN; validar con ficha técnica y protocolo local."],
    updatedAt: "2026-07-14"
  }
];
