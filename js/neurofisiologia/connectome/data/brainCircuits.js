function defineCircuit(definition) {
  const item = {
    evidencia: "no_especificada",
    funciones: [],
    nodos: [],
    conexiones: [],
    secuencia: [],
    secuenciaConexiones: [],
    neurotransmisores: [],
    etiquetas: [],
    cautelas: [],
    referencias: [],
    ...definition
  };
  [
    "funciones", "nodos", "conexiones", "secuencia", "secuenciaConexiones",
    "neurotransmisores", "etiquetas", "cautelas", "referencias"
  ].forEach((field) => { item[field] = Object.freeze([...(item[field] || [])]); });
  item.alternativaTextual = item.alternativaTextual || item.secuencia.join(" → ");
  return Object.freeze(item);
}

/**
 * Los circuitos son subgrafos declarativos: solo guardan IDs y nunca duplican
 * objetos anatomicos o conexiones completas.
 */
export const BRAIN_CIRCUITS = Object.freeze([
  defineCircuit({
    id: "hipocampal_trisynaptic",
    nombre: "Circuito trisináptico hipocampal",
    categoria: "memoria_episodica",
    descripcion: "Secuencia canonica de entrada entorrinal, giro dentado, CA3 y CA1, ampliada con subiculo y retorno entorrinal.",
    funciones: ["Codificacion episodica", "Separacion de patrones propuesta", "Completamiento de patrones propuesto", "Integracion de entradas"],
    nodos: ["corteza_entorrinal", "giro_dentado", "ca3", "ca1", "subiculo"],
    conexiones: [
      "via_perforante_ec_dg", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1",
      "proyeccion_ca1_subiculo", "proyeccion_subiculo_entorrinal", "via_temporoamonica_ec_ca1", "recurrentes_ca3"
    ],
    secuencia: ["corteza_entorrinal", "giro_dentado", "ca3", "ca1", "subiculo", "corteza_entorrinal"],
    secuenciaConexiones: [
      "via_perforante_ec_dg", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1",
      "proyeccion_ca1_subiculo", "proyeccion_subiculo_entorrinal"
    ],
    alternativaTextual: "Corteza entorrinal → Giro dentado → CA3 → CA1 → Subiculo → Corteza entorrinal",
    neurotransmisores: ["glutamato", "GABA", "acetilcolina"],
    etiquetas: ["memoria", "aprendizaje", "plasticidad", "procesamiento_patrones"],
    cautelas: ["Es un esquema predominante, no la unica ruta hipocampal.", "Las funciones de subcampos son asociaciones respaldadas por modelos y evidencia, no compartimentos absolutos."],
    referencias: ["amaral_witter_1989", "basu_siegelbaum_2015", "knierim_neunuebel_2016", "yassa_stark_2011"]
  }),
  defineCircuit({
    id: "papez",
    nombre: "Circuito de Papez",
    categoria: "memoria_episodica",
    descripcion: "Circuito historico hipocampo-diencefalo-cingulado, hoy integrado en una red de memoria mas amplia.",
    funciones: ["Marco historico de emocion", "Eje hipocampo-talamo anterior para memoria", "Contexto y navegacion"],
    nodos: [
      "subiculo", "fornix", "cuerpos_mamilares", "tracto_mamilotalamico", "nucleos_anteriores_talamo",
      "giro_cingulado", "cingulo", "corteza_retrosplenial", "corteza_entorrinal", "giro_dentado", "ca3", "ca1"
    ],
    conexiones: [
      "subiculo_fornix", "fornix_cuerpos_mamilares", "cuerpos_mamilares_tracto_mtt",
      "tracto_mtt_talamo_anterior", "talamo_anterior_giro_cingulado", "giro_cingulado_cingulo",
      "cingulo_entorrinal", "via_perforante_ec_dg", "fibras_musgosas_dg_ca3",
      "colaterales_schaffer_ca3_ca1", "proyeccion_ca1_subiculo", "talamo_anterior_retrosplenial"
    ],
    secuencia: [
      "subiculo", "fornix", "cuerpos_mamilares", "tracto_mamilotalamico", "nucleos_anteriores_talamo",
      "giro_cingulado", "cingulo", "corteza_entorrinal", "giro_dentado", "ca3", "ca1", "subiculo"
    ],
    secuenciaConexiones: [
      "subiculo_fornix", "fornix_cuerpos_mamilares", "cuerpos_mamilares_tracto_mtt",
      "tracto_mtt_talamo_anterior", "talamo_anterior_giro_cingulado", "giro_cingulado_cingulo",
      "cingulo_entorrinal", "via_perforante_ec_dg", "fibras_musgosas_dg_ca3",
      "colaterales_schaffer_ca3_ca1", "proyeccion_ca1_subiculo"
    ],
    alternativaTextual: "Subiculo → Fornix → Cuerpos mamilares → Tracto mamilotalamico → Talamo anterior → Giro cingulado → Cingulo → Corteza entorrinal → Formacion hipocampal",
    neurotransmisores: ["glutamato", "GABA", "acetilcolina"],
    etiquetas: ["memoria", "historia", "navegacion"],
    cautelas: ["No es una explicacion completa de la emocion.", "El conocimiento moderno enfatiza una red hipocampo-diencefalo-retrosplenial mas extensa y bidireccional."],
    referencias: ["papez_1937", "bubb_2017", "vann_nelson_2015", "aggleton_brown_1999"]
  }),
  defineCircuit({
    id: "episodic_memory",
    nombre: "Red de memoria episodica",
    categoria: "memoria_episodica",
    descripcion: "Red distribuida que vincula contenido, contexto, formacion hipocampal y sistemas corticales de recuperacion y control.",
    funciones: ["Codificacion relacional", "Recuperacion episodica", "Contexto", "Consolidacion en redes distribuidas"],
    nodos: [
      "cortezas_sensoriales_asociativas", "corteza_perirrinal", "corteza_parahipocampal", "corteza_entorrinal",
      "giro_dentado", "ca3", "ca1", "subiculo", "corteza_retrosplenial", "corteza_cingulada_posterior",
      "precuneo", "corteza_prefrontal_medial", "corteza_entorrinal_lateral", "nucleo_reuniens_talamo", "giro_angular"
    ],
    conexiones: [
      "sensorial_perirrinal", "sensorial_parahipocampal", "perirrinal_entorrinal", "parahipocampal_entorrinal",
      "via_perforante_ec_dg", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1",
      "proyeccion_ca1_subiculo", "subiculo_retrosplenial", "retrosplenial_cingulada_posterior",
      "cingulada_posterior_precuneo", "precuneo_prefrontal_medial", "prefrontal_medial_retrosplenial",
      "subiculo_prefrontal_medial", "via_perforante_lec_dg", "via_temporoamonica_lec_ca1",
      "prefrontal_medial_reuniens", "reuniens_ca1", "subiculo_reuniens", "angular_precuneo_funcional"
    ],
    secuencia: [
      "cortezas_sensoriales_asociativas", "corteza_parahipocampal", "corteza_entorrinal", "giro_dentado",
      "ca3", "ca1", "subiculo", "corteza_retrosplenial", "corteza_cingulada_posterior",
      "precuneo", "corteza_prefrontal_medial"
    ],
    secuenciaConexiones: [
      "sensorial_parahipocampal", "parahipocampal_entorrinal", "via_perforante_ec_dg",
      "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1", "proyeccion_ca1_subiculo",
      "subiculo_retrosplenial", "retrosplenial_cingulada_posterior", "cingulada_posterior_precuneo",
      "precuneo_prefrontal_medial"
    ],
    neurotransmisores: ["glutamato", "GABA", "acetilcolina", "dopamina"],
    etiquetas: ["memoria", "contexto", "consolidacion", "recuperacion"],
    cautelas: ["La memoria episodica no reside en un solo nodo.", "La flecha educativa no implica que el procesamiento real sea estrictamente serial."],
    referencias: ["dickerson_eichenbaum_2010", "hebscher_voss_2020", "squire_wixted_2011", "ranganath_ritchey_2012"]
  }),
  defineCircuit({
    id: "semantic_memory",
    nombre: "Red de memoria semantica",
    categoria: "memoria_semantica",
    descripcion: "Red distribuida de representaciones conceptuales y control semantico, con participacion temporal anterior y cortezas multimodales.",
    funciones: ["Conocimiento conceptual", "Integracion multimodal", "Control y seleccion semantica", "Adquisicion de informacion nueva"],
    nodos: [
      "cortezas_sensoriales_asociativas", "corteza_asociativa_multimodal", "corteza_temporal_lateral",
      "corteza_temporal_anterior", "corteza_prefrontal", "corteza_perirrinal", "corteza_entorrinal",
      "giro_dentado", "ca3", "ca1", "subiculo", "giro_fusiforme", "polo_temporal",
      "corteza_prefrontal_ventrolateral", "corteza_orbitofrontal", "giro_angular",
      "corteza_parietal_posterior", "precuneo"
    ],
    conexiones: [
      "sensorial_multimodal", "multimodal_temporal_lateral", "temporal_lateral_anterior",
      "temporal_anterior_prefrontal", "perirrinal_temporal_anterior", "perirrinal_entorrinal",
      "via_perforante_ec_dg", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1", "proyeccion_ca1_subiculo",
      "fusiforme_perirrinal", "fusiforme_temporal_anterior_ilf", "polo_temporal_orbitofrontal_uncinado",
      "temporal_lateral_vlpfc_arqueado", "vlpfc_parietal_funcional", "angular_precuneo_funcional"
    ],
    secuencia: ["cortezas_sensoriales_asociativas", "corteza_asociativa_multimodal", "corteza_temporal_lateral", "corteza_temporal_anterior", "corteza_prefrontal"],
    secuenciaConexiones: ["sensorial_multimodal", "multimodal_temporal_lateral", "temporal_lateral_anterior", "temporal_anterior_prefrontal"],
    neurotransmisores: ["glutamato", "GABA", "acetilcolina"],
    etiquetas: ["memoria", "semantica", "lenguaje", "distribuida"],
    evidencia: "modelo_funcional",
    cautelas: ["No se localiza en una sola estructura.", "El hipocampo se destaca para adquisicion de conocimiento nuevo, no como almacen semantico exclusivo."],
    referencias: ["binder_desai_2011", "lambon_ralph_2017", "squire_wixted_2011"]
  }),
  defineCircuit({
    id: "working_memory",
    nombre: "Red de memoria de trabajo",
    categoria: "memoria_trabajo",
    descripcion: "Red frontoparietal-talamica con bucles de ganglios basales y modulacion dopaminergica.",
    funciones: ["Mantenimiento", "Actualizacion", "Control ejecutivo", "Gating de representaciones"],
    nodos: [
      "corteza_prefrontal_dorsolateral", "corteza_parietal_posterior", "nucleo_mediodorsal_talamo",
      "talamo", "caudado", "globo_palido_interno", "vta", "corteza_prefrontal_ventrolateral",
      "giro_angular", "giro_supramarginal", "nucleo_reticular_talamo", "corteza_prefrontal"
    ],
    conexiones: [
      "dlpfc_parietal", "dlpfc_mediodorsal", "parietal_talamo", "dlpfc_caudado", "caudado_gpi",
      "gpi_mediodorsal", "vta_dlpfc_dopamina", "dlpfc_parietal_slf", "vlpfc_parietal_funcional",
      "reticular_mediodorsal_gaba", "prefrontal_reticular_talamo"
    ],
    secuencia: ["corteza_prefrontal_dorsolateral", "caudado", "globo_palido_interno", "nucleo_mediodorsal_talamo", "corteza_prefrontal_dorsolateral"],
    secuenciaConexiones: ["dlpfc_caudado", "caudado_gpi", "gpi_mediodorsal", "dlpfc_mediodorsal"],
    alternativaTextual: "Corteza prefrontal dorsolateral ↔ Corteza parietal posterior; Corteza prefrontal dorsolateral ↔ Talamo mediodorsal; ganglios basales y dopamina modulan la red",
    neurotransmisores: ["glutamato", "GABA", "dopamina", "noradrenalina"],
    etiquetas: ["mantenimiento", "actualizacion", "ejecutivo", "atencion"],
    evidencia: "modelo_funcional",
    cautelas: ["Memoria de trabajo emerge de redes distribuidas; no es una caja localizada en DLPFC.", "La modulacion dopaminergica depende de receptor y estado."],
    referencias: ["desposito_postle_2015", "bolkan_2017", "chatham_badre_2015", "alexander_delong_strick_1986"]
  }),
  defineCircuit({
    id: "procedural_learning",
    nombre: "Aprendizaje procedimental y seleccion de acciones",
    categoria: "aprendizaje_procedimental",
    descripcion: "Bucle cortico-estriado-palido/nigro-talamo-cortical simplificado, con modulacion nigroestriatal.",
    funciones: ["Aprendizaje de habilidades", "Formacion de habitos", "Seleccion de acciones", "Ajuste motor"],
    nodos: [
      "corteza_motora", "putamen", "globo_palido_interno", "sustancia_negra_reticulata",
      "talamo", "sustancia_negra_compacta", "estriado", "globo_palido_externo", "nucleo_subtalamico"
    ],
    conexiones: [
      "motora_putamen", "putamen_gpi", "putamen_snr", "gpi_talamo_motor", "snr_talamo_motor",
      "talamo_corteza_motora", "snc_estriado_dopamina", "putamen_gpe", "gpe_subtalamico",
      "subtalamico_gpi", "subtalamico_snr"
    ],
    secuencia: ["corteza_motora", "putamen", "globo_palido_interno", "talamo", "corteza_motora"],
    secuenciaConexiones: ["motora_putamen", "putamen_gpi", "gpi_talamo_motor", "talamo_corteza_motora"],
    neurotransmisores: ["glutamato", "GABA", "dopamina", "acetilcolina"],
    etiquetas: ["motor", "habitos", "seleccion_acciones", "dopamina"],
    cautelas: ["El diagrama resume bucles y no muestra todas las vias directa, indirecta e hiperdirecta.", "Aprendizaje procedimental tampoco depende de un solo circuito."],
    referencias: ["alexander_delong_strick_1986", "yin_knowlton_2006", "seger_spiering_2011"]
  }),
  defineCircuit({
    id: "emotional_memory",
    nombre: "Condicionamiento y memoria emocional",
    categoria: "memoria_emocional",
    descripcion: "Red sensorial-amigdalina con contexto hipocampal, control prefrontal y salidas autonomicas/defensivas.",
    funciones: ["Condicionamiento aversivo", "Contexto", "Extincion", "Reconsolidacion", "Expresion de respuestas aprendidas"],
    nodos: [
      "talamo_sensorial", "cortezas_sensoriales_asociativas", "amigdala_basolateral", "amigdala_central",
      "hipocampo", "corteza_prefrontal_ventromedial", "hipotalamo", "sustancia_gris_periacueductal", "vta",
      "nucleo_lateral_amigdala", "nucleo_basal_amigdala", "nucleo_medial_amigdala", "masas_intercaladas_amigdala"
    ],
    conexiones: [
      "talamo_sensorial_bla", "talamo_sensorial_corteza", "corteza_sensorial_bla", "bla_amigdala_central",
      "amigdala_central_hipotalamo", "amigdala_central_pag", "hipocampo_bla", "vmpfc_bla", "vta_amigdala_dopamina",
      "talamo_sensorial_nucleo_lateral", "corteza_sensorial_nucleo_lateral", "nucleo_lateral_basal_amigdala",
      "nucleo_basal_central_amigdala", "nucleo_basal_intercaladas", "intercaladas_nucleo_central",
      "nucleo_medial_hipotalamo_estria_terminal"
    ],
    secuencia: ["talamo_sensorial", "cortezas_sensoriales_asociativas", "amigdala_basolateral", "amigdala_central", "hipotalamo"],
    secuenciaConexiones: ["talamo_sensorial_corteza", "corteza_sensorial_bla", "bla_amigdala_central", "amigdala_central_hipotalamo"],
    neurotransmisores: ["glutamato", "GABA", "noradrenalina", "dopamina"],
    etiquetas: ["emocion", "condicionamiento", "contexto", "extincion", "reconsolidacion"],
    cautelas: ["La amigdala no es un centro unico del miedo.", "Extincion implica aprendizaje nuevo y dependiente del contexto.", "Reconsolidacion se muestra como proceso educativo, no como intervencion clinica."],
    referencias: ["ledoux_2000", "phelps_ledoux_2005", "maren_2013", "milad_quirk_2012", "nader_2000"]
  }),
  defineCircuit({
    id: "reward_learning",
    nombre: "Recompensa y aprendizaje por refuerzo",
    categoria: "recompensa",
    descripcion: "Bucle mesolimbico-cortico-estriado que integra contexto, valor, accion y modulacion dopaminergica.",
    funciones: ["Aprendizaje por refuerzo", "Prediccion y actualizacion de valor", "Motivacion", "Seleccion de acciones"],
    nodos: [
      "vta", "nucleo_accumbens", "palido_ventral", "nucleo_mediodorsal_talamo", "corteza_prefrontal_medial",
      "amigdala_basolateral", "subiculo", "hipocampo", "nucleo_accumbens_core", "nucleo_accumbens_shell",
      "corteza_orbitofrontal", "habenula_lateral", "nucleo_tegmental_rostromedial"
    ],
    conexiones: [
      "vta_accumbens_dopamina", "vta_prefrontal_dopamina", "vta_hipocampo_dopamina", "vta_amigdala_dopamina",
      "prefrontal_accumbens", "bla_accumbens", "subiculo_accumbens", "accumbens_palido_ventral",
      "palido_ventral_mediodorsal", "mediodorsal_prefrontal_medial", "vta_accumbens_core_dopamina",
      "vta_accumbens_shell_dopamina", "accumbens_core_palido_ventral", "accumbens_shell_palido_ventral",
      "orbitofrontal_accumbens_core", "habenula_rmtg", "rmtg_vta", "palido_ventral_habenula"
    ],
    secuencia: ["vta", "nucleo_accumbens", "palido_ventral", "nucleo_mediodorsal_talamo", "corteza_prefrontal_medial", "nucleo_accumbens"],
    secuenciaConexiones: ["vta_accumbens_dopamina", "accumbens_palido_ventral", "palido_ventral_mediodorsal", "mediodorsal_prefrontal_medial", "prefrontal_accumbens"],
    neurotransmisores: ["dopamina", "glutamato", "GABA"],
    etiquetas: ["recompensa", "dopamina", "aprendizaje_refuerzo", "motivacion"],
    evidencia: "modelo_funcional",
    cautelas: ["Dopamina es un modulador y no una estructura ni sinonimo de placer.", "El error de prediccion es una interpretacion computacional de determinadas respuestas, no la funcion unica de VTA."],
    referencias: ["schultz_dayan_montague_1997", "haber_knutson_2010", "yetnikoff_2014"]
  }),
  defineCircuit({
    id: "spatial_navigation",
    nombre: "Navegacion espacial",
    categoria: "memoria_espacial",
    descripcion: "Red entorrinal-hipocampal-retrosplenial-talamica para representar ubicacion, direccion y contexto espacial.",
    funciones: ["Mapa espacial", "Orientacion", "Integracion de trayectoria", "Memoria contextual"],
    nodos: [
      "corteza_entorrinal_medial", "giro_dentado", "ca3", "ca1", "subiculo",
      "corteza_retrosplenial", "nucleos_anteriores_talamo", "presubiculo", "parasubiculo"
    ],
    conexiones: [
      "mec_giro_dentado", "mec_ca1", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1",
      "proyeccion_ca1_subiculo", "subiculo_retrosplenial", "retrosplenial_mec", "talamo_anterior_retrosplenial",
      "presubiculo_mec", "parasubiculo_mec"
    ],
    secuencia: ["corteza_entorrinal_medial", "giro_dentado", "ca3", "ca1", "subiculo", "corteza_retrosplenial", "corteza_entorrinal_medial"],
    secuenciaConexiones: ["mec_giro_dentado", "fibras_musgosas_dg_ca3", "colaterales_schaffer_ca3_ca1", "proyeccion_ca1_subiculo", "subiculo_retrosplenial", "retrosplenial_mec"],
    neurotransmisores: ["glutamato", "GABA", "acetilcolina"],
    etiquetas: ["navegacion", "memoria_espacial", "place_cells", "grid_cells", "head_direction_cells", "border_cells"],
    cautelas: ["Place, grid, head-direction y border cells son categorias funcionales de actividad celular, no nucleos anatomicos.", "El mapa no reproduce coordenadas anatomicas reales."],
    referencias: ["brandon_koenig_leutgeb_2014", "moser_2008", "ranganath_ritchey_2012"]
  }),
  defineCircuit({
    id: "septohippocampal_modulation",
    nombre: "Sistema septohipocampal modulador",
    categoria: "modulacion_memoria",
    descripcion: "Proyecciones colinergicas y GABAergicas del septum medial y banda diagonal hacia redes hipocampales y entorrinales.",
    funciones: ["Modulacion de ritmos theta", "Estado de codificacion y recuperacion", "Plasticidad dependiente del estado"],
    nodos: [
      "septum_medial", "banda_diagonal_broca", "hipocampo", "corteza_entorrinal", "nucleos_septales_laterales"
    ],
    conexiones: [
      "septum_hipocampo_acetilcolina", "septum_hipocampo_gaba", "banda_diagonal_hipocampo_acetilcolina",
      "banda_diagonal_entorrinal_acetilcolina", "hipocampo_septales_laterales"
    ],
    secuencia: ["banda_diagonal_broca", "hipocampo", "nucleos_septales_laterales"],
    secuenciaConexiones: ["banda_diagonal_hipocampo_acetilcolina", "hipocampo_septales_laterales"],
    neurotransmisores: ["acetilcolina", "GABA", "glutamato"],
    etiquetas: ["theta", "memoria", "navegacion", "modulacion"],
    cautelas: ["Theta emerge de interacciones septohipocampales y no de un marcapasos unico.", "Las proyecciones septales contienen poblaciones neuroquimicamente distintas."],
    referencias: ["nunez_buno_2021", "hasselmo_2006"]
  }),
  defineCircuit({
    id: "prefrontal_reuniens_hippocampal",
    nombre: "Circuito prefrontal-reuniens-hipocampal",
    categoria: "memoria_episodica",
    descripcion: "Bucle de linea media talamica que coordina corteza prefrontal medial, reuniens, CA1 y subiculo.",
    funciones: ["Memoria espacial de trabajo", "Organizacion temporal", "Control contextual", "Coordinacion hipocampo-prefrontal"],
    nodos: ["corteza_prefrontal_medial", "nucleo_reuniens_talamo", "ca1", "subiculo"],
    conexiones: ["prefrontal_medial_reuniens", "reuniens_ca1", "proyeccion_ca1_subiculo", "subiculo_reuniens", "subiculo_prefrontal_medial"],
    secuencia: ["corteza_prefrontal_medial", "nucleo_reuniens_talamo", "ca1", "subiculo", "corteza_prefrontal_medial"],
    secuenciaConexiones: ["prefrontal_medial_reuniens", "reuniens_ca1", "proyeccion_ca1_subiculo", "subiculo_prefrontal_medial"],
    neurotransmisores: ["glutamato", "GABA"],
    etiquetas: ["memoria_episodica", "memoria_trabajo", "ejecutivo", "talamo"],
    cautelas: ["La evidencia mecanistica procede principalmente de roedores.", "Reuniens coordina una red; no se presenta como relevo serial obligatorio para toda interaccion hipocampo-prefrontal."],
    referencias: ["dolleman_reuniens_2019"]
  }),
  defineCircuit({
    id: "cerebellar_learning",
    nombre: "Circuito cerebeloso de aprendizaje motor",
    categoria: "aprendizaje_motor",
    descripcion: "Bucle corticopontocerebeloso con entrada olivar, procesamiento cortical cerebeloso y salida por nucleos profundos.",
    funciones: ["Adaptacion motora", "Correccion de error", "Prediccion sensorial", "Automatizacion"],
    nodos: [
      "corteza_motora", "puente", "oliva_inferior", "corteza_cerebelosa", "nucleo_dentado_cerebelo",
      "nucleos_interpuestos_cerebelo", "nucleo_fastigial_cerebelo", "talamo", "tronco_encefalico"
    ],
    conexiones: [
      "corteza_motora_puente", "puente_corteza_cerebelosa", "oliva_inferior_corteza_cerebelosa",
      "corteza_cerebelosa_dentado", "corteza_cerebelosa_interpuestos", "corteza_cerebelosa_fastigial",
      "dentado_talamo", "interpuestos_talamo", "fastigial_tronco_encefalico", "talamo_corteza_motora"
    ],
    secuencia: ["corteza_motora", "puente", "corteza_cerebelosa", "nucleo_dentado_cerebelo", "talamo", "corteza_motora"],
    secuenciaConexiones: ["corteza_motora_puente", "puente_corteza_cerebelosa", "corteza_cerebelosa_dentado", "dentado_talamo", "talamo_corteza_motora"],
    neurotransmisores: ["glutamato", "GABA"],
    etiquetas: ["aprendizaje_motor", "error_prediccion", "automatizacion", "plasticidad"],
    cautelas: ["La animacion representa un flujo educativo, no una secuencia neuronal exclusiva.", "Las senales olivares no se reducen a un unico escalar de error."],
    referencias: ["apps_garwicz_2005", "ebner_2015"]
  })
]);

export const BRAIN_CIRCUIT_BY_ID = new Map(BRAIN_CIRCUITS.map((item) => [item.id, item]));
