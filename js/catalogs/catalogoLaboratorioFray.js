export const ID_FORMATO_LABORATORIO_FRAY = "fray-laboratorio-fto-hpfba-expc-lab-sac";

export const CATALOGO_FRAY_ANALISIS_CLINICOS = Object.freeze([
  {
    id: "hematologia",
    nombre: "Hematología",
    estudios: [
      { id: "biometria_hematica", nombre: "Biometría hemática" },
      { id: "tp", nombre: "TP" },
      { id: "tpt", nombre: "TPT" },
      { id: "eosinofilos_moco_nasal", nombre: "Eosinófilos en moco nasal" }
    ]
  },
  {
    id: "quimica_clinica",
    nombre: "Química clínica",
    estudios: [
      { id: "perfil_quimica_5_elementos", nombre: "Perfil de química sanguínea de 5 elementos" },
      { id: "perfil_lipidos", nombre: "Perfil de lípidos" },
      { id: "funcionamiento_hepatico", nombre: "Pruebas de funcionamiento hepático" },
      { id: "glucosa_postprandial", nombre: "Glucosa postprandial" },
      { id: "ck", nombre: "CK" },
      { id: "ck_mb", nombre: "CK-MB" },
      { id: "enzimas_pancreaticas", nombre: "Enzimas pancreáticas" },
      { id: "hemoglobina_glicosilada", nombre: "Hemoglobina glicosilada" },
      { id: "troponina_i", nombre: "Troponina I" },
      { id: "proteinas_lcr", nombre: "Proteínas en LCR" }
    ]
  },
  {
    id: "inmunologia",
    nombre: "Inmunología",
    estudios: [
      { id: "grupo_sanguineo_rh", nombre: "Grupo sanguíneo y factor RH" },
      { id: "antiestreptolisina", nombre: "Antiestreptolisina" },
      { id: "proteina_c_reactiva", nombre: "Proteína C reactiva" },
      { id: "factor_reumatoide", nombre: "Factor reumatoide" },
      { id: "reacciones_febriles", nombre: "Reacciones febriles" },
      { id: "gonadotrofina_corionica_beta", nombre: "Cuantificación de gonadotrofina coriónica, fracción β" },
      { id: "antigeno_prostatico_total_libre", nombre: "Antígeno prostático total y libre" },
      { id: "treponema_pallidum_igm_igg", nombre: "Ac. IgM-IgG Treponema pallidum" },
      { id: "anti_hiv_1_2", nombre: "Ac. anti-HIV 1 y 2" },
      { id: "prueba_rapida_embarazo", nombre: "Prueba rápida de embarazo" },
      { id: "perfil_tiroideo_completo", nombre: "Perfil tiroideo completo" },
      { id: "anticuerpos_antitiroideos", nombre: "Anticuerpos antitiroideos" },
      { id: "prueba_rapida_hepatitis_c", nombre: "Prueba rápida de hepatitis C" }
    ]
  },
  {
    id: "electrolitos_sericos",
    nombre: "Electrolitos séricos",
    estudios: [
      { id: "sodio", nombre: "Sodio" },
      { id: "potasio", nombre: "Potasio" },
      { id: "cloro", nombre: "Cloro" },
      { id: "fosforo", nombre: "Fósforo" },
      { id: "calcio", nombre: "Calcio" },
      { id: "magnesio", nombre: "Magnesio" }
    ]
  },
  {
    id: "urianalisis",
    nombre: "Urianálisis",
    estudios: [
      { id: "examen_general_orina", nombre: "Examen general de orina" },
      { id: "depuracion_creatinina_24h", nombre: "Depuración de creatinina de 24 horas" },
      { id: "creatinina_orina_azar", nombre: "Creatinina en orina al azar" },
      { id: "electrolitos_orina", nombre: "Electrolitos en orina" }
    ]
  },
  {
    id: "drogas_terapeuticas",
    nombre: "Drogas terapéuticas",
    estudios: [
      { id: "acido_valproico", nombre: "Ácido valproico" },
      { id: "litio", nombre: "Litio" },
      { id: "carbamazepina", nombre: "Carbamazepina" },
      { id: "difenilhidantoina", nombre: "Difenilhidantoína" }
    ]
  },
  {
    id: "parasitologia",
    nombre: "Parasitología",
    estudios: [
      { id: "cps_muestra_unica", nombre: "CPS, muestra única" },
      { id: "cps_seriada_3_muestras", nombre: "CPS seriada en 3 muestras" },
      { id: "sangre_oculta_heces", nombre: "Sangre oculta en heces" },
      { id: "leucocitos_moco_fecal", nombre: "Leucocitos en moco fecal" }
    ]
  },
  {
    id: "drogas_abuso",
    nombre: "Drogas de abuso",
    estudios: [
      { id: "cocaina_orina", nombre: "Cocaína en orina" },
      { id: "opiaceos_orina", nombre: "Opiáceos en orina" },
      { id: "anfetaminas_orina", nombre: "Anfetaminas en orina" },
      { id: "etanol_sangre", nombre: "Etanol en sangre" },
      { id: "cannabinoides_orina", nombre: "Cannabinoides en orina" },
      { id: "benzodiacepinas_orina", nombre: "Benzodiacepinas en orina" },
      { id: "barbituricos_orina", nombre: "Barbitúricos en orina" }
    ]
  },
  {
    id: "bacteriologia",
    nombre: "Bacteriología",
    estudios: [
      { id: "cultivo", nombre: "Cultivo de:", requiereTexto: true }
    ]
  }
]);

export const CATALOGO_FRAY_ANALISIS_CLINICOS_PLANO = Object.freeze(
  CATALOGO_FRAY_ANALISIS_CLINICOS.flatMap((categoria) => categoria.estudios.map((estudio) => ({ ...estudio, categoriaId: categoria.id })))
);

export const TOTAL_ESTUDIOS_FRAY_LABORATORIO = CATALOGO_FRAY_ANALISIS_CLINICOS_PLANO.length;
