import { ESTRUCTURAS_ATLAS_CEREBRAL } from "../../atlasCerebralData.js";

const ATLAS_BY_ID = new Map(ESTRUCTURAS_ATLAS_CEREBRAL.map((region) => [region.id, region]));

const DEFAULTS = Object.freeze({
  nombreCompleto: "",
  aliases: [],
  tipo: "region",
  nivelAnatomico: "region",
  regionPadre: null,
  hemisferio: "bilateral",
  sistemas: [],
  funciones: [],
  descripcion: { basico: "", intermedio: "", avanzado: "" },
  relacionesConocidas: [],
  neurotransmisoresRelevantes: [],
  receptoresRelevantes: [],
  patologiasRelacionadas: [],
  porQueImporta: [],
  conceptosFuncionales: [],
  etiquetas: [],
  atlasRefs: [],
  fisiologiaTargets: [],
  evidencia: "establecida",
  referencias: []
});

function freezeArray(value) {
  return Object.freeze([...(value || [])]);
}

function defineRegion(definition) {
  const descripcion = typeof definition.descripcion === "string"
    ? { basico: definition.descripcion, intermedio: definition.descripcion, avanzado: definition.descripcion }
    : { ...DEFAULTS.descripcion, ...(definition.descripcion || {}) };
  const region = {
    ...DEFAULTS,
    ...definition,
    nombreCompleto: definition.nombreCompleto || definition.nombre,
    descripcion: Object.freeze(descripcion)
  };
  [
    "aliases", "sistemas", "funciones", "relacionesConocidas", "neurotransmisoresRelevantes",
    "receptoresRelevantes", "patologiasRelacionadas", "porQueImporta", "conceptosFuncionales",
    "etiquetas", "atlasRefs", "fisiologiaTargets", "referencias"
  ].forEach((field) => { region[field] = freezeArray(region[field]); });
  return Object.freeze(region);
}

function fromAtlas(atlasId, overrides) {
  const source = ATLAS_BY_ID.get(atlasId);
  if (!source) throw new Error(`No existe la region de atlas ${atlasId}`);
  return defineRegion({
    nombre: source.name_es,
    nombreCompleto: source.name_es,
    aliases: [source.name_en, source.name_la].filter(Boolean),
    hemisferio: source.hemisphere === "midline" ? "linea_media" : source.hemisphere,
    funciones: source.functions || [],
    descripcion: {
      basico: source.description,
      intermedio: source.description,
      avanzado: `${source.description} Nivel de confianza del atlas: ${source.confidence_level || "no indicado"}.`
    },
    patologiasRelacionadas: source.clinical_relevance || [],
    atlasRefs: [atlasId],
    fuenteAnatomica: Object.freeze({ tipo: "atlas_cerebral", id: atlasId }),
    ...overrides
  });
}

const region = (id, nombre, regionPadre, tipo, nivelAnatomico, extra = {}) => defineRegion({
  id, nombre, regionPadre, tipo, nivelAnatomico, ...extra
});

/**
 * Registro canonico del connectome. Las entidades que ya existen exactamente en
 * el Atlas 3D se adaptan desde atlasCerebralData.js. Las agregaciones bilaterales
 * nuevas enlazan atlasRefs, pero no copian los objetos del atlas.
 */
export const BRAIN_REGIONS = Object.freeze([
  region("sistema_nervioso_central", "Sistema nervioso central", null, "sistema", "sistema", {
    aliases: ["SNC", "Central nervous system"],
    sistemas: ["integracion"],
    funciones: ["Integracion de informacion neural"],
    descripcion: "Nivel raiz para organizar encefalo y futuras vias medulares.",
    porQueImporta: ["Permite ampliar el mapa sin limitarlo a memoria."],
    referencias: ["kandel_2021"]
  }),
  fromAtlas("brain", {
    id: "brain",
    regionPadre: "sistema_nervioso_central",
    tipo: "region",
    nivelAnatomico: "organo",
    sistemas: ["integracion", "memoria", "aprendizaje"],
    referencias: ["kandel_2021"]
  }),
  region("telencefalo", "Telencefalo", "brain", "region", "division", {
    aliases: ["Cerebro anterior telencefalico", "Telencephalon"],
    sistemas: ["memoria", "aprendizaje", "ejecutivo"],
    funciones: ["Organizacion de corteza y nucleos telencefalicos"],
    descripcion: "Division que agrupa corteza cerebral, formacion hipocampal, amigdala y ganglios basales.",
    referencias: ["kandel_2021"]
  }),
  region("diencefalo", "Diencefalo", "brain", "region", "division", {
    aliases: ["Diencephalon"],
    sistemas: ["memoria", "atencion", "integracion"],
    funciones: ["Relevo e integracion talamica e hipotalamica"],
    descripcion: "Division que contiene talamo, hipotalamo y cuerpos mamilares, entre otras estructuras.",
    referencias: ["kandel_2021"]
  }),
  region("mesencefalo", "Mesencefalo", "brain", "region", "division", {
    aliases: ["Midbrain"],
    sistemas: ["recompensa", "motor", "modulacion"],
    funciones: ["Integra nucleos motores, sensoriales y moduladores"],
    descripcion: "Parte rostral del tronco encefalico; incluye VTA, sustancia negra y sustancia gris periacueductal.",
    referencias: ["kandel_2021"]
  }),

  region("region_temporal_medial", "Region temporal medial", "telencefalo", "region", "region", {
    aliases: ["Lobulo temporal medial", "Medial temporal lobe"],
    sistemas: ["memoria_episodica", "memoria_semantica", "navegacion"],
    funciones: ["Conecta neocorteza con formacion hipocampal", "Apoya adquisicion de recuerdos declarativos"],
    descripcion: {
      basico: "Conjunto de regiones clave para formar recuerdos nuevos.",
      intermedio: "Incluye formacion hipocampal y cortezas entorrinal, perirrinal y parahipocampal.",
      avanzado: "No constituye un almacen unico: participa en redes distribuidas y sus contribuciones dependen del tipo y etapa de memoria."
    },
    porQueImporta: ["Es una puerta de entrada y salida para la formacion hipocampal."],
    referencias: ["squire_wixted_2011", "van_strien_2009"]
  }),
  region("formacion_hipocampal", "Formacion hipocampal", "region_temporal_medial", "complejo", "formacion", {
    aliases: ["Hippocampal formation"],
    sistemas: ["memoria_episodica", "navegacion", "plasticidad"],
    funciones: ["Codificacion y recuperacion de relaciones episodicas", "Representacion espacial"],
    descripcion: "Conjunto que incluye giro dentado, campos hipocampales y subiculo; sus limites terminologicos pueden variar entre fuentes.",
    porQueImporta: ["Reune subestructuras con computaciones complementarias, no intercambiables."],
    referencias: ["amaral_witter_1989", "van_strien_2009"]
  }),
  region("hipocampo", "Hipocampo", "formacion_hipocampal", "complejo", "region", {
    aliases: ["Hippocampus", "Asta de Ammon"],
    sistemas: ["memoria_episodica", "navegacion", "consolidacion", "memoria_emocional"],
    funciones: ["Memoria relacional y episodica", "Contexto", "Navegacion espacial"],
    descripcion: {
      basico: "Participa en formar y relacionar recuerdos de eventos y lugares.",
      intermedio: "Integra informacion entorrinal mediante giro dentado, CA3, CA2, CA1 y subiculo.",
      avanzado: "Es una agregacion anatomica bilateral en este mapa; las funciones se distribuyen entre subcampos y redes extrahipocampales."
    },
    neurotransmisoresRelevantes: ["glutamato", "GABA", "acetilcolina", "dopamina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A", "muscarinicos", "nicotinicos"],
    patologiasRelacionadas: ["Amnesia por lesiones bilaterales", "Esclerosis temporal mesial", "Enfermedad de Alzheimer"],
    porQueImporta: ["Participa en varios circuitos sin ser por si solo el lugar de toda la memoria."],
    atlasRefs: ["left-hippocampus"],
    fisiologiaTargets: ["sinapsis_glutamatergica", "plasticidad_ltp"],
    referencias: ["squire_wixted_2011", "amaral_witter_1989"]
  }),
  region("corteza_entorrinal", "Corteza entorrinal", "region_temporal_medial", "corteza", "area_cortical", {
    aliases: ["Entorrinal", "Entorhinal cortex", "EC"],
    sistemas: ["memoria_episodica", "navegacion", "consolidacion"],
    funciones: ["Interfaz bidireccional entre neocorteza y formacion hipocampal", "Entrada por vias perforante y temporoamonica"],
    descripcion: "Corteza parahipocampal medial que canaliza multiples entradas corticales hacia la formacion hipocampal y recibe sus salidas.",
    neurotransmisoresRelevantes: ["glutamato", "GABA", "acetilcolina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A", "muscarinicos"],
    patologiasRelacionadas: ["Afectacion temprana en enfermedad de Alzheimer", "Epilepsia temporal"],
    porQueImporta: ["Es una interfaz, no un simple relevo pasivo."],
    atlasRefs: ["left-parahippocampal-gyrus"],
    fisiologiaTargets: ["sinapsis_glutamatergica"],
    referencias: ["van_strien_2009"]
  }),
  region("corteza_entorrinal_medial", "Corteza entorrinal medial", "corteza_entorrinal", "corteza", "subregion_cortical", {
    aliases: ["MEC", "Medial entorhinal cortex"],
    sistemas: ["navegacion", "memoria_espacial"],
    funciones: ["Representacion espacial y de trayectoria en redes entorrinales"],
    descripcion: "Subregion entorrinal asociada con codigos espaciales; contiene tipos celulares funcionales, no nucleos separados.",
    conceptosFuncionales: ["grid cells", "head-direction cells", "border cells"],
    porQueImporta: ["Conecta codigos espaciales distribuidos con el hipocampo."],
    evidencia: "modelo_funcional",
    referencias: ["moser_2008"]
  }),
  region("corteza_perirrinal", "Corteza perirrinal", "region_temporal_medial", "corteza", "area_cortical", {
    aliases: ["Perirhinal cortex", "PRC"],
    sistemas: ["memoria_episodica", "memoria_semantica", "reconocimiento"],
    funciones: ["Procesamiento de informacion sobre items y familiaridad", "Interfaz temporal-entorrinal"],
    descripcion: "Corteza temporal medial lateral a la entorrinal, participante en redes de reconocimiento y memoria de objetos.",
    referencias: ["van_strien_2009", "ranganath_ritchey_2012"]
  }),
  region("corteza_parahipocampal", "Corteza parahipocampal", "region_temporal_medial", "corteza", "area_cortical", {
    aliases: ["Parahippocampal cortex", "PHC"],
    sistemas: ["memoria_episodica", "memoria_contextual", "navegacion"],
    funciones: ["Procesamiento contextual y espacial", "Interfaz con corteza entorrinal"],
    descripcion: "Region cortical posterior del giro parahipocampal. No equivale al giro parahipocampal completo.",
    atlasRefs: ["left-parahippocampal-gyrus"],
    referencias: ["ranganath_ritchey_2012", "van_strien_2009"]
  }),
  region("giro_dentado", "Giro dentado", "formacion_hipocampal", "subcampo", "subcampo", {
    aliases: ["Dentate gyrus", "DG"],
    sistemas: ["memoria_episodica", "procesamiento_patrones", "plasticidad", "navegacion"],
    funciones: ["Contribucion propuesta a separacion de patrones", "Entrada al circuito trisináptico"],
    descripcion: {
      basico: "Ayuda a mantener distintos recuerdos parecidos.",
      intermedio: "Recibe corteza entorrinal y proyecta mediante fibras musgosas a CA3.",
      avanzado: "La separacion de patrones es una asociacion funcional respaldada por modelos y evidencia experimental, no una funcion exclusiva ni absoluta."
    },
    neurotransmisoresRelevantes: ["glutamato", "GABA", "acetilcolina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A"],
    porQueImporta: ["Es la primera sinapsis clasica del circuito trisináptico."],
    fisiologiaTargets: ["plasticidad_ltp", "sinapsis_glutamatergica"],
    evidencia: "modelo_funcional",
    referencias: ["yassa_stark_2011", "amaral_witter_1989"]
  }),
  region("ca3", "CA3", "hipocampo", "subcampo", "subcampo", {
    aliases: ["Cornu Ammonis 3", "Campo CA3"],
    sistemas: ["memoria_episodica", "procesamiento_patrones", "plasticidad"],
    funciones: ["Contribucion propuesta a completamiento de patrones", "Asociacion recurrente"],
    descripcion: {
      basico: "Ayuda a recuperar una representacion completa a partir de pistas parciales.",
      intermedio: "Recibe fibras musgosas y envia colaterales de Schaffer a CA1; posee conexiones recurrentes extensas.",
      avanzado: "El completamiento de patrones es un modelo funcional apoyado por conectividad recurrente y estudios experimentales; no es exclusivo de CA3."
    },
    neurotransmisoresRelevantes: ["glutamato", "GABA", "acetilcolina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A", "mGluR"],
    patologiasRelacionadas: ["Epilepsia temporal: hiperexcitabilidad de redes recurrentes"],
    porQueImporta: ["Sus conexiones recurrentes permiten estudiar memoria asociativa."],
    fisiologiaTargets: ["sinapsis_glutamatergica", "plasticidad_ltp"],
    evidencia: "modelo_funcional",
    referencias: ["nakazawa_2002", "amaral_witter_1989"]
  }),
  region("ca2", "CA2", "hipocampo", "subcampo", "subcampo", {
    aliases: ["Cornu Ammonis 2", "Campo CA2"],
    sistemas: ["memoria_episodica", "memoria_social"],
    funciones: ["Participacion en redes hipocampales y memoria social propuesta"],
    descripcion: "Subcampo pequeno entre CA3 y CA1 con conectividad y plasticidad distintivas; se incluye para conservar la jerarquia anatomica.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    receptoresRelevantes: ["AMPA", "NMDA", "GABA-A"],
    evidencia: "probable",
    referencias: ["kandel_2021"]
  }),
  region("ca1", "CA1", "hipocampo", "subcampo", "subcampo", {
    aliases: ["Cornu Ammonis 1", "Campo CA1"],
    sistemas: ["memoria_episodica", "procesamiento_patrones", "plasticidad", "integracion_temporal"],
    funciones: ["Integracion y comparacion de entradas CA3 y entorrinales", "Salida hipocampal hacia subiculo"],
    descripcion: {
      basico: "Integra informacion antes de que salga del hipocampo.",
      intermedio: "Recibe colaterales de Schaffer desde CA3 y una entrada entorrinal mas directa; proyecta hacia subiculo y corteza entorrinal.",
      avanzado: "La descripcion como comparador o detector de coincidencia/desajuste es un modelo funcional, no una etiqueta anatomica absoluta."
    },
    neurotransmisoresRelevantes: ["glutamato", "GABA", "acetilcolina", "dopamina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A", "mGluR", "D1/D5"],
    patologiasRelacionadas: ["Vulnerabilidad a hipoxia", "Epilepsia temporal", "Enfermedad de Alzheimer"],
    porQueImporta: ["La sinapsis CA3-CA1 es un modelo muy utilizado para estudiar LTP y LTD."],
    fisiologiaTargets: ["potencial_accion", "sinapsis_glutamatergica", "plasticidad_ltp"],
    evidencia: "modelo_funcional",
    referencias: ["bliss_collingridge_1993", "malenka_bear_2004", "amaral_witter_1989"]
  }),
  region("subiculo", "Subiculo", "formacion_hipocampal", "subcampo", "subcampo", {
    aliases: ["Subiculum"],
    sistemas: ["memoria_episodica", "navegacion", "consolidacion"],
    funciones: ["Principal interfaz de salida hipocampal", "Distribucion hacia fornix y cortezas parahipocampales"],
    descripcion: "Zona de transicion entre CA1 y corteza entorrinal/parahipocampal; participa en multiples salidas hipocampales.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A"],
    porQueImporta: ["Conecta el procesamiento intrahipocampal con redes diencefalicas y corticales."],
    referencias: ["van_strien_2009", "aggleton_brown_1999"]
  }),

  region("fornix", "Fornix", "telencefalo", "tracto", "tracto", {
    aliases: ["Fornix cerebri", "Fornix cerebral"],
    sistemas: ["memoria_episodica", "circuito_papez"],
    funciones: ["Via mayor de salida hipocampal hacia regiones septales y diencefalicas"],
    descripcion: "Haz de sustancia blanca; en este grafo es una entidad tracto, no una conexion generica.",
    patologiasRelacionadas: ["Lesiones bilaterales pueden asociarse con alteraciones de memoria"],
    porQueImporta: ["Su interrupcion permite estudiar desconexion del eje hipocampo-diencefalo."],
    referencias: ["aggleton_brown_1999", "kandel_2021"]
  }),
  region("cuerpos_mamilares", "Cuerpos mamilares", "hipotalamo", "nucleo", "nucleo", {
    aliases: ["Mammillary bodies", "Corpora mamillaria"],
    sistemas: ["memoria_episodica", "circuito_papez"],
    funciones: ["Relevo diencefalico en circuitos de memoria"],
    descripcion: "Nucleos hipotalamicos que reciben proyecciones del fornix y proyectan al talamo anterior.",
    patologiasRelacionadas: ["Sindrome de Wernicke-Korsakoff: afectacion dentro de una red mas amplia"],
    referencias: ["aggleton_brown_1999", "papez_1937"]
  }),
  region("tracto_mamilotalamico", "Tracto mamilotalamico", "diencefalo", "tracto", "tracto", {
    aliases: ["Mammillothalamic tract", "Fasciculo de Vicq d'Azyr"],
    sistemas: ["memoria_episodica", "circuito_papez"],
    funciones: ["Conecta cuerpos mamilares con nucleos anteriores del talamo"],
    descripcion: "Tracto diencefalico representado como nodo para distinguir el fasciculo de las proyecciones que lo enlazan.",
    referencias: ["aggleton_brown_1999", "papez_1937"]
  }),
  fromAtlas("thalamus", {
    id: "talamo",
    nombre: "Talamo",
    nombreCompleto: "Talamo",
    regionPadre: "diencefalo",
    tipo: "complejo_nuclear",
    nivelAnatomico: "region",
    sistemas: ["memoria_trabajo", "memoria_episodica", "atencion", "motor"],
    porQueImporta: ["Sus nucleos participan en circuitos distintos; no funciona como un relevo unico."],
    referencias: ["kandel_2021"]
  }),
  region("nucleos_anteriores_talamo", "Nucleos anteriores del talamo", "talamo", "nucleo", "nucleo", {
    aliases: ["Anterior thalamic nuclei", "ATN"],
    sistemas: ["memoria_episodica", "circuito_papez", "navegacion"],
    funciones: ["Eje hipocampo-diencefalo-cingulado", "Procesamiento mnemonico y espacial"],
    descripcion: "Grupo nuclear talamico conectado con cuerpos mamilares, corteza cingulada y formacion hipocampal ampliada.",
    patologiasRelacionadas: ["Amnesia diencefalica"],
    porQueImporta: ["La memoria episodica depende de una red que incluye talamo anterior, no solo hipocampo."],
    referencias: ["aggleton_brown_1999"]
  }),
  region("nucleo_mediodorsal_talamo", "Nucleo mediodorsal del talamo", "talamo", "nucleo", "nucleo", {
    aliases: ["Mediodorsal thalamic nucleus", "MD thalamus"],
    sistemas: ["memoria_trabajo", "ejecutivo", "recompensa"],
    funciones: ["Interaccion recurrente con corteza prefrontal", "Mantenimiento y control de representaciones"],
    descripcion: "Nucleo talamico de asociacion con conexiones prefrontales; su contribucion depende de la tarea y de subcircuitos.",
    referencias: ["bolkan_2017", "desposito_postle_2015"]
  }),
  region("giro_cingulado", "Giro cingulado", "telencefalo", "corteza", "giro", {
    aliases: ["Cingulate gyrus"],
    sistemas: ["memoria_episodica", "emocion", "circuito_papez"],
    funciones: ["Integra informacion mnemonica, motivacional y autonómica en redes distribuidas"],
    descripcion: "Corteza medial alrededor del cuerpo calloso; incluye subregiones funcionalmente distintas.",
    referencias: ["papez_1937", "ranganath_ritchey_2012"]
  }),
  region("cingulo", "Cingulo", "telencefalo", "tracto", "tracto", {
    aliases: ["Cingulum bundle", "Fasciculo del cingulo"],
    sistemas: ["memoria_episodica", "circuito_papez"],
    funciones: ["Conecta regiones cinguladas, retrospleniales y parahipocampales"],
    descripcion: "Haz largo de sustancia blanca medial; se distingue de la corteza del giro cingulado.",
    referencias: ["ranganath_ritchey_2012", "kandel_2021"]
  }),
  region("corteza_retrosplenial", "Corteza retrosplenial", "giro_cingulado", "corteza", "area_cortical", {
    aliases: ["Retrosplenial cortex", "RSC"],
    sistemas: ["memoria_episodica", "navegacion", "memoria_contextual"],
    funciones: ["Transformacion entre marcos espaciales", "Contexto y recuperacion autobiografica"],
    descripcion: "Corteza medial posterior fuertemente conectada con talamo anterior, hipocampo ampliado y redes corticales.",
    referencias: ["ranganath_ritchey_2012", "moser_2008"]
  }),
  region("corteza_cingulada_posterior", "Corteza cingulada posterior", "giro_cingulado", "corteza", "area_cortical", {
    aliases: ["Posterior cingulate cortex", "PCC"],
    sistemas: ["memoria_episodica", "atencion_interna", "red_modo_predeterminado"],
    funciones: ["Recuperacion autobiografica y construccion de contexto interno"],
    descripcion: "Nodo cortical posterior de redes de memoria y cognicion interna; no equivale a toda la corteza retrosplenial.",
    referencias: ["ranganath_ritchey_2012"]
  }),
  region("precuneo", "Precuneo", "telencefalo", "corteza", "area_cortical", {
    aliases: ["Precuneus"],
    sistemas: ["memoria_episodica", "navegacion", "atencion_interna"],
    funciones: ["Imagineria visuoespacial", "Recuperacion autobiografica"],
    descripcion: "Corteza parietal medial que participa en redes distribuidas de memoria, escena y cognicion interna.",
    referencias: ["ranganath_ritchey_2012"]
  }),

  region("corteza_prefrontal", "Corteza prefrontal", "telencefalo", "corteza", "region_cortical", {
    aliases: ["Prefrontal cortex", "PFC"],
    sistemas: ["memoria_trabajo", "ejecutivo", "memoria_episodica", "recompensa", "emocion"],
    funciones: ["Control ejecutivo", "Organizacion estrategica y monitoreo", "Valoracion y regulacion"],
    descripcion: "Conjunto heterogeneo de regiones frontales; sus subregiones no deben tratarse como una sola unidad funcional.",
    porQueImporta: ["Participa en multiples circuitos y ayuda a dirigir el uso de la memoria."],
    referencias: ["desposito_postle_2015", "haber_knutson_2010"]
  }),
  region("corteza_prefrontal_medial", "Corteza prefrontal medial", "corteza_prefrontal", "corteza", "area_cortical", {
    aliases: ["Medial prefrontal cortex", "mPFC"],
    sistemas: ["memoria_episodica", "recompensa", "emocion", "consolidacion"],
    funciones: ["Integracion de memoria, valor y contexto", "Participacion en recuperacion y esquemas"],
    descripcion: "Conjunto medial prefrontal con conexiones limbicas y de asociacion; los limites cambian entre especies y atlas.",
    referencias: ["ranganath_ritchey_2012", "haber_knutson_2010"]
  }),
  region("corteza_prefrontal_ventromedial", "Corteza prefrontal ventromedial", "corteza_prefrontal_medial", "corteza", "area_cortical", {
    aliases: ["Ventromedial prefrontal cortex", "vmPFC"],
    sistemas: ["memoria_emocional", "extincion", "recompensa"],
    funciones: ["Regulacion contextual del aprendizaje emocional", "Valoracion"],
    descripcion: "Region prefrontal ventromedial involucrada en redes de valor y extincion; no inhibe de forma simple y uniforme a la amigdala.",
    evidencia: "modelo_funcional",
    referencias: ["milad_quirk_2012", "haber_knutson_2010"]
  }),
  region("corteza_prefrontal_dorsolateral", "Corteza prefrontal dorsolateral", "corteza_prefrontal", "corteza", "area_cortical", {
    aliases: ["Dorsolateral prefrontal cortex", "DLPFC", "dlPFC"],
    sistemas: ["memoria_trabajo", "ejecutivo", "atencion"],
    funciones: ["Mantenimiento y manipulacion de informacion", "Control de metas"],
    descripcion: "Nodo de redes frontoparietales para memoria de trabajo y control; no actua aislado.",
    neurotransmisoresRelevantes: ["glutamato", "GABA", "dopamina", "noradrenalina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A", "D1", "alfa-2A"],
    referencias: ["desposito_postle_2015", "bolkan_2017"]
  }),
  region("corteza_parietal_posterior", "Corteza parietal posterior", "telencefalo", "corteza", "region_cortical", {
    aliases: ["Posterior parietal cortex", "PPC"],
    sistemas: ["memoria_trabajo", "atencion", "navegacion", "ejecutivo"],
    funciones: ["Representaciones atencionales y espaciales", "Mantenimiento distribuido segun contenido"],
    descripcion: "Region de asociacion parietal que coopera con corteza prefrontal dentro de redes frontoparietales.",
    referencias: ["desposito_postle_2015"]
  }),
  region("corteza_temporal_anterior", "Corteza temporal anterior", "telencefalo", "corteza", "region_cortical", {
    aliases: ["Anterior temporal lobe", "ATL"],
    sistemas: ["memoria_semantica", "lenguaje", "social"],
    funciones: ["Integracion multimodal de conocimiento conceptual"],
    descripcion: "Conjunto temporal anterior propuesto como hub transmodal dentro de una red semantica distribuida.",
    atlasRefs: ["left-temporal-pole"],
    evidencia: "modelo_funcional",
    referencias: ["lambon_ralph_2017"]
  }),
  region("corteza_temporal_lateral", "Corteza temporal lateral", "telencefalo", "corteza", "region_cortical", {
    aliases: ["Lateral temporal cortex", "LTC"],
    sistemas: ["memoria_semantica", "lenguaje"],
    funciones: ["Representacion de conocimiento y lenguaje en redes distribuidas"],
    descripcion: "Regiones temporales laterales de asociacion; la memoria semantica no se localiza por completo aqui.",
    atlasRefs: ["left-middle-temporal-gyrus"],
    referencias: ["lambon_ralph_2017"]
  }),
  region("corteza_asociativa_multimodal", "Corteza asociativa multimodal", "telencefalo", "corteza", "sistema_distribuido", {
    aliases: ["Multimodal association cortex"],
    sistemas: ["memoria_semantica", "memoria_episodica"],
    funciones: ["Integra rasgos conceptuales distribuidos entre modalidades"],
    descripcion: "Nodo agregado educativo para multiples regiones de asociacion; puede expandirse en futuras fases sin inventar una localizacion unica.",
    evidencia: "modelo_funcional",
    referencias: ["lambon_ralph_2017", "squire_wixted_2011"]
  }),
  region("cortezas_sensoriales_asociativas", "Cortezas sensoriales asociativas", "telencefalo", "corteza", "sistema_distribuido", {
    aliases: ["Sensory association cortices"],
    sistemas: ["memoria_episodica", "memoria_emocional", "condicionamiento"],
    funciones: ["Representaciones perceptivas elaboradas que alimentan memoria y aprendizaje"],
    descripcion: "Agregacion educativa de cortezas visuales, auditivas y somatosensoriales de asociacion.",
    referencias: ["kandel_2021", "ledoux_2000"]
  }),
  region("talamo_sensorial", "Talamo sensorial relevante", "talamo", "nucleo", "grupo_nuclear", {
    aliases: ["Sensory thalamus"],
    sistemas: ["condicionamiento", "atencion", "sensorial"],
    funciones: ["Relevo sensorial hacia corteza y rutas amigdalinas segun modalidad"],
    descripcion: "Nodo agregado para nucleos sensoriales relevantes; debe expandirse por modalidad en una fase futura.",
    referencias: ["ledoux_2000"]
  }),

  region("amigdala", "Amigdala", "telencefalo", "complejo_nuclear", "complejo", {
    aliases: ["Amygdala", "Complejo amigdalino"],
    sistemas: ["memoria_emocional", "condicionamiento", "recompensa", "saliencia"],
    funciones: ["Aprendizaje asociativo emocional", "Modulacion de consolidacion", "Saliencia"],
    descripcion: "Complejo de nucleos con conectividad distinta; no es un centro unico del miedo ni de toda emocion.",
    neurotransmisoresRelevantes: ["glutamato", "GABA", "noradrenalina", "dopamina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A", "beta-adrenergicos"],
    patologiasRelacionadas: ["Alteraciones de aprendizaje emocional en lesiones bilaterales extensas"],
    porQueImporta: ["Vincula relevancia emocional, contexto y memoria sin explicar por si sola la emocion."],
    atlasRefs: ["left-amygdala"],
    referencias: ["phelps_ledoux_2005", "ledoux_2000"]
  }),
  region("amigdala_basolateral", "Complejo amigdalino basolateral", "amigdala", "nucleo", "complejo_nuclear", {
    aliases: ["Basolateral amygdala", "BLA"],
    sistemas: ["memoria_emocional", "condicionamiento", "recompensa", "reconsolidacion"],
    funciones: ["Integra informacion sensorial y contextual", "Plasticidad asociativa"],
    descripcion: "Conjunto de nucleos lateral, basal y accesorios representado como complejo funcional-anatomico simplificado.",
    neurotransmisoresRelevantes: ["glutamato", "GABA", "noradrenalina", "dopamina"],
    receptoresRelevantes: ["NMDA", "AMPA", "GABA-A", "beta-adrenergicos"],
    fisiologiaTargets: ["plasticidad_ltp", "sinapsis_glutamatergica"],
    referencias: ["ledoux_2000", "nader_2000"]
  }),
  region("amigdala_central", "Nucleo central de la amigdala", "amigdala", "nucleo", "nucleo", {
    aliases: ["Central amygdala", "CeA"],
    sistemas: ["memoria_emocional", "condicionamiento", "respuesta_autonomica"],
    funciones: ["Coordina salidas autonomicas y defensivas en circuitos de condicionamiento"],
    descripcion: "Principal nucleo de salida en modelos clasicos de condicionamiento aversivo; contiene microcircuitos heterogeneos.",
    neurotransmisoresRelevantes: ["GABA", "neuropeptidos"],
    receptoresRelevantes: ["GABA-A", "NMDA", "AMPA"],
    referencias: ["ledoux_2000"]
  }),
  region("hipotalamo", "Hipotalamo", "diencefalo", "complejo_nuclear", "region", {
    aliases: ["Hypothalamus"],
    sistemas: ["respuesta_autonomica", "motivacion", "circuito_papez"],
    funciones: ["Control autonomico y endocrino", "Conductas motivadas"],
    descripcion: "Conjunto diencefalico heterogeneo. Se incluye para salidas amigdalinas y como padre de cuerpos mamilares.",
    referencias: ["kandel_2021", "ledoux_2000"]
  }),
  region("sustancia_gris_periacueductal", "Sustancia gris periacueductal", "mesencefalo", "region", "region", {
    aliases: ["Periaqueductal gray", "PAG"],
    sistemas: ["respuesta_defensiva", "dolor", "condicionamiento"],
    funciones: ["Organizacion de respuestas defensivas y modulacion del dolor"],
    descripcion: "Region alrededor del acueducto mesencefalico; recibe salidas de circuitos amigdalinos e hipotalamicos.",
    referencias: ["ledoux_2000"]
  }),

  region("ganglios_basales", "Ganglios basales", "telencefalo", "complejo_nuclear", "sistema", {
    aliases: ["Basal ganglia"],
    sistemas: ["aprendizaje_procedimental", "habitos", "motor", "recompensa", "ejecutivo"],
    funciones: ["Seleccion de acciones", "Aprendizaje por refuerzo y habitos", "Bucles cortico-subcorticales"],
    descripcion: "Sistema de nucleos que participa en bucles paralelos; no es solo motor.",
    referencias: ["alexander_delong_strick_1986", "yin_knowlton_2006"]
  }),
  region("estriado", "Estriado", "ganglios_basales", "complejo_nuclear", "region", {
    aliases: ["Striatum", "Neoestriado"],
    sistemas: ["aprendizaje_procedimental", "habitos", "recompensa", "motor"],
    funciones: ["Principal entrada de ganglios basales", "Seleccion y aprendizaje de acciones"],
    descripcion: "Incluye caudado y putamen dorsal, y se relaciona con estriado ventral; aqui se conserva la jerarquia explicita.",
    neurotransmisoresRelevantes: ["glutamato", "GABA", "dopamina", "acetilcolina"],
    receptoresRelevantes: ["D1", "D2", "NMDA", "AMPA", "muscarinicos"],
    porQueImporta: ["Integra estado cortical y senales moduladoras para ajustar seleccion de acciones."],
    referencias: ["yin_knowlton_2006", "alexander_delong_strick_1986"]
  }),
  region("caudado", "Nucleo caudado", "estriado", "nucleo", "nucleo", {
    aliases: ["Caudate nucleus"],
    sistemas: ["ejecutivo", "aprendizaje_procedimental", "habitos"],
    funciones: ["Bucles asociativos y oculomotores de ganglios basales"],
    descripcion: "Componente estriatal dorsal con gradientes y territorios funcionales, no una unidad uniforme.",
    receptoresRelevantes: ["D1", "D2", "NMDA", "AMPA"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  region("putamen", "Putamen", "estriado", "nucleo", "nucleo", {
    aliases: ["Putamen"],
    sistemas: ["motor", "aprendizaje_procedimental", "habitos"],
    funciones: ["Bucles sensorimotores y aprendizaje de secuencias"],
    descripcion: "Componente estriatal dorsal especialmente conectado con cortezas sensorimotoras.",
    receptoresRelevantes: ["D1", "D2", "NMDA", "AMPA"],
    referencias: ["yin_knowlton_2006", "alexander_delong_strick_1986"]
  }),
  region("nucleo_accumbens", "Nucleo accumbens", "estriado", "nucleo", "nucleo", {
    aliases: ["Nucleus accumbens", "NAc", "Estriado ventral"],
    sistemas: ["recompensa", "aprendizaje_refuerzo", "motivacion"],
    funciones: ["Integra entradas corticales, hipocampales y amigdalinas con modulacion dopaminergica"],
    descripcion: "Componente principal del estriado ventral en este modelo; no es un centro aislado del placer.",
    neurotransmisoresRelevantes: ["glutamato", "GABA", "dopamina"],
    receptoresRelevantes: ["D1", "D2", "NMDA", "AMPA", "GABA-A"],
    porQueImporta: ["Vincula contexto, valor y seleccion de acciones."],
    referencias: ["haber_knutson_2010", "schultz_dayan_montague_1997"]
  }),
  region("globo_palido", "Globo palido", "ganglios_basales", "complejo_nuclear", "region", {
    aliases: ["Globus pallidus"],
    sistemas: ["motor", "aprendizaje_procedimental", "recompensa"],
    funciones: ["Procesamiento de salida e interno de ganglios basales"],
    descripcion: "Complejo palidal con segmentos interno y externo; el palido ventral se representa aparte.",
    referencias: ["alexander_delong_strick_1986"]
  }),
  region("globo_palido_interno", "Globo palido interno", "globo_palido", "nucleo", "nucleo", {
    aliases: ["GPi", "Internal globus pallidus"],
    sistemas: ["motor", "aprendizaje_procedimental"],
    funciones: ["Salida inhibitoria de ganglios basales hacia talamo"],
    descripcion: "Uno de los nucleos de salida de los ganglios basales en bucles motores y asociativos.",
    neurotransmisoresRelevantes: ["GABA"],
    receptoresRelevantes: ["GABA-A", "GABA-B"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  region("sustancia_negra", "Sustancia negra", "mesencefalo", "complejo_nuclear", "region", {
    aliases: ["Substantia nigra"],
    sistemas: ["motor", "aprendizaje_refuerzo", "modulacion"],
    funciones: ["Integra componentes dopaminergicos y de salida de ganglios basales"],
    descripcion: "Complejo mesencefalico dividido aqui en pars compacta y pars reticulata.",
    referencias: ["kandel_2021"]
  }),
  region("sustancia_negra_compacta", "Sustancia negra pars compacta", "sustancia_negra", "nucleo", "nucleo", {
    aliases: ["SNc", "Substantia nigra pars compacta"],
    sistemas: ["dopamina", "motor", "aprendizaje_refuerzo"],
    funciones: ["Modulacion dopaminergica del estriado dorsal"],
    descripcion: "Poblacion dopaminergica mesencefalica con proyecciones nigroestriatales predominantes.",
    neurotransmisoresRelevantes: ["dopamina"],
    receptoresRelevantes: ["D2 autoreceptor"],
    patologiasRelacionadas: ["Enfermedad de Parkinson"],
    referencias: ["kandel_2021"]
  }),
  region("sustancia_negra_reticulata", "Sustancia negra pars reticulata", "sustancia_negra", "nucleo", "nucleo", {
    aliases: ["SNr", "Substantia nigra pars reticulata"],
    sistemas: ["motor", "aprendizaje_procedimental"],
    funciones: ["Salida inhibitoria de ganglios basales"],
    descripcion: "Nucleo de salida funcionalmente relacionado con GPi, distinto de la pars compacta dopaminergica.",
    neurotransmisoresRelevantes: ["GABA"],
    referencias: ["alexander_delong_strick_1986"]
  }),
  region("palido_ventral", "Palido ventral", "ganglios_basales", "nucleo", "nucleo", {
    aliases: ["Ventral pallidum", "VP"],
    sistemas: ["recompensa", "motivacion", "aprendizaje_refuerzo"],
    funciones: ["Salida del estriado ventral hacia talamo y tronco"],
    descripcion: "Componente de circuitos limbicos de ganglios basales, diferenciado del globo palido dorsal.",
    neurotransmisoresRelevantes: ["GABA"],
    referencias: ["haber_knutson_2010"]
  }),
  region("vta", "Area tegmental ventral", "mesencefalo", "region", "region", {
    aliases: ["Ventral tegmental area", "VTA", "ATV"],
    sistemas: ["dopamina", "recompensa", "aprendizaje_refuerzo", "memoria"],
    funciones: ["Modulacion dopaminergica de estriado ventral, corteza y regiones limbicas"],
    descripcion: "Region mesencefalica heterogenea; dopamina se muestra como modulador, no como una conexion anatomica ni sinonimo de placer.",
    neurotransmisoresRelevantes: ["dopamina", "GABA", "glutamato"],
    receptoresRelevantes: ["D2 autoreceptor"],
    porQueImporta: ["Sus senales pueden relacionarse con error de prediccion, saliencia y aprendizaje segun poblacion y tarea."],
    evidencia: "modelo_funcional",
    referencias: ["schultz_dayan_montague_1997", "yetnikoff_2014"]
  }),
  region("corteza_motora", "Corteza motora", "telencefalo", "corteza", "region_cortical", {
    aliases: ["Motor cortex"],
    sistemas: ["motor", "aprendizaje_procedimental"],
    funciones: ["Planificacion y ejecucion motora dentro de bucles cortico-subcorticales"],
    descripcion: "Agregacion educativa de regiones motoras; puede subdividirse en fases posteriores.",
    referencias: ["alexander_delong_strick_1986"]
  }),

  region("septum_medial", "Septum medial", "telencefalo", "nucleo", "nucleo", {
    aliases: ["Medial septum"],
    sistemas: ["acetilcolina", "memoria", "navegacion", "plasticidad"],
    funciones: ["Modulacion septohipocampal y ritmos relacionados con navegacion"],
    descripcion: "Nucleo basal anterior con poblaciones colinergicas, GABAergicas y glutamatergicas; la capa muestra solo proyecciones principales.",
    neurotransmisoresRelevantes: ["acetilcolina", "GABA", "glutamato"],
    receptoresRelevantes: ["nicotinicos", "muscarinicos"],
    referencias: ["hasselmo_2006", "kandel_2021"]
  }),
  region("nucleo_basal_meynert", "Nucleo basal de Meynert", "telencefalo", "nucleo", "nucleo", {
    aliases: ["Nucleus basalis of Meynert", "NBM"],
    sistemas: ["acetilcolina", "atencion", "memoria"],
    funciones: ["Modulacion colinergica extensa de neocorteza"],
    descripcion: "Componente colinergico basal anterior con proyecciones corticales difusas; no es una ruta punto a punto simple.",
    neurotransmisoresRelevantes: ["acetilcolina"],
    patologiasRelacionadas: ["Degeneracion colinergica en enfermedades neurodegenerativas"],
    referencias: ["hasselmo_2006", "kandel_2021"]
  }),

  // Segunda capa anatomica: formacion hipocampal y lobulo temporal.
  region("corteza_entorrinal_lateral", "Corteza entorrinal lateral", "corteza_entorrinal", "corteza", "subregion_cortical", {
    aliases: ["LEC", "Lateral entorhinal cortex"],
    sistemas: ["memoria_episodica", "reconocimiento", "memoria_contextual"],
    funciones: ["Integra informacion sobre items, tiempo y contexto en redes entorrinales"],
    descripcion: {
      basico: "Subregion entorrinal que aporta informacion no espacial y contextual al hipocampo.",
      intermedio: "Se diferencia de la corteza entorrinal medial por conectividad y perfiles funcionales relativos.",
      avanzado: "Las etiquetas medial/lateral proceden sobre todo de modelos animales; la correspondencia con subdivisiones humanas anterolateral/posteromedial no es exacta."
    },
    conceptosFuncionales: ["codigos de items", "codigos temporales"],
    evidencia: "modelo_funcional",
    referencias: ["schultz_engelhardt_2014", "van_strien_2009"]
  }),
  region("hilus_giro_dentado", "Hilus del giro dentado", "giro_dentado", "subregion", "subcampo", {
    aliases: ["Hilus", "Capa polimorfa del giro dentado", "Dentate hilus"],
    sistemas: ["memoria_episodica", "plasticidad", "microcircuito_hipocampal"],
    funciones: ["Integra celulas musgosas, interneuronas y colaterales locales"],
    descripcion: "Region polimorfa interna del giro dentado. Se mantiene separada de CA4 porque su equivalencia terminologica no es universal.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    etiquetas: ["terminologia_variable"],
    referencias: ["schultz_engelhardt_2014", "fipat_tna"]
  }),
  region("ca4", "CA4", "hilus_giro_dentado", "subcampo", "subcampo", {
    aliases: ["Campo CA4", "Cornu Ammonis 4"],
    sistemas: ["memoria_episodica", "microcircuito_hipocampal"],
    funciones: ["Participa en el continuo hilar-hipocampal descrito en atlas humanos"],
    descripcion: "Campo definido de manera variable dentro de la region hilar en nomenclaturas humanas; no se usa aqui como sinonimo exacto de todo el hilus.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    etiquetas: ["terminologia_variable"],
    referencias: ["schultz_engelhardt_2014", "fipat_tna"]
  }),
  region("presubiculo", "Presubiculo", "formacion_hipocampal", "corteza", "subcampo", {
    aliases: ["Presubiculum", "PrS"],
    sistemas: ["navegacion", "memoria_espacial", "memoria_contextual"],
    funciones: ["Integra orientacion y senales de direccion dentro de la region hipocampal"],
    descripcion: "Componente perialocortical del complejo subicular, distinto del subiculo y del parasubiculo.",
    conceptosFuncionales: ["head-direction cells"],
    referencias: ["insausti_2017", "witter_canto_2014"]
  }),
  region("parasubiculo", "Parasubiculo", "formacion_hipocampal", "corteza", "subcampo", {
    aliases: ["Parasubiculum", "PaS"],
    sistemas: ["navegacion", "memoria_espacial", "memoria_contextual"],
    funciones: ["Intercambia informacion espacial con corteza entorrinal medial y presubiculo"],
    descripcion: "Componente perialocortical pequeno y diferenciado, incluido como entidad anatomica y no como tipo celular.",
    conceptosFuncionales: ["grid cells", "head-direction cells", "border cells"],
    referencias: ["insausti_2017", "witter_canto_2014"]
  }),
  region("giro_fusiforme", "Giro fusiforme", "telencefalo", "corteza", "giro", {
    aliases: ["Fusiform gyrus", "Giro occipitotemporal"],
    sistemas: ["reconocimiento", "memoria_semantica", "integracion_multimodal"],
    funciones: ["Procesamiento visual complejo en redes de objetos, caras y conocimiento"],
    descripcion: "Giro ventral temporo-occipital que participa en redes distribuidas; no constituye por si solo un almacen de memoria.",
    atlasRefs: ["left-fusiform-gyrus"],
    referencias: ["lambon_ralph_2017", "kandel_2021"]
  }),
  region("polo_temporal", "Polo temporal", "corteza_temporal_anterior", "corteza", "subregion_cortical", {
    aliases: ["Temporal pole", "Polus temporalis"],
    sistemas: ["memoria_semantica", "social", "emocion"],
    funciones: ["Integracion semantica y socioemocional dentro de redes temporales anteriores"],
    descripcion: "Extremo anterior del lobulo temporal. Es una subregion de la corteza temporal anterior, no un sinonimo de toda ella.",
    atlasRefs: ["left-temporal-pole"],
    referencias: ["lambon_ralph_2017", "von_der_heide_2013"]
  }),

  // Sistema septal y diencefalo relacionado con memoria.
  region("banda_diagonal_broca", "Banda diagonal de Broca", "telencefalo", "nucleo", "nucleo", {
    aliases: ["Diagonal band of Broca", "DBB", "Nucleo de la banda diagonal"],
    sistemas: ["acetilcolina", "memoria", "navegacion", "theta"],
    funciones: ["Modulacion septohipocampal y entorrinal", "Participacion en ritmos theta"],
    descripcion: "Componente heterogeneo del prosencefalo basal con poblaciones colinergicas, GABAergicas y glutamatergicas.",
    neurotransmisoresRelevantes: ["acetilcolina", "GABA", "glutamato"],
    referencias: ["nunez_buno_2021", "hasselmo_2006"]
  }),
  region("nucleos_septales_laterales", "Nucleos septales laterales", "telencefalo", "complejo_nuclear", "grupo_nuclear", {
    aliases: ["Lateral septal nuclei", "Septum lateral", "LS"],
    sistemas: ["memoria_contextual", "emocion", "navegacion"],
    funciones: ["Integra salidas hipocampales con circuitos hipotalamicos y motivacionales"],
    descripcion: "Complejo septal lateral conectado de manera topografica con hipocampo e hipotalamo; no se reduce a una via colinergica.",
    neurotransmisoresRelevantes: ["GABA"],
    referencias: ["kandel_2021", "nunez_buno_2021"]
  }),
  region("nucleo_reuniens_talamo", "Nucleo reuniens del talamo", "talamo", "nucleo", "nucleo", {
    aliases: ["Nucleus reuniens", "Reuniens", "RE"],
    sistemas: ["memoria_episodica", "memoria_trabajo", "ejecutivo", "navegacion"],
    funciones: ["Coordina comunicacion entre hipocampo y corteza prefrontal medial"],
    descripcion: "Nucleo talamico de linea media dentro de un circuito prefrontal-reuniens-hipocampal; no es un simple relevo pasivo.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["dolleman_reuniens_2019"]
  }),
  region("nucleo_reticular_talamo", "Nucleo reticular del talamo", "talamo", "nucleo", "nucleo", {
    aliases: ["Thalamic reticular nucleus", "TRN", "NRT"],
    sistemas: ["atencion", "memoria_trabajo", "sueño_vigilia"],
    funciones: ["Modula la actividad de nucleos talamicos mediante inhibicion"],
    descripcion: "Lamina nuclear GABAergica que rodea lateralmente el talamo y recibe colaterales corticotalamicas y talamocorticales.",
    neurotransmisoresRelevantes: ["GABA"],
    referencias: ["pinault_2004", "kandel_2021"]
  }),

  // Corteza cingulada, prefrontal, parietal e insular.
  region("corteza_cingulada_anterior", "Corteza cingulada anterior", "giro_cingulado", "corteza", "area_cortical", {
    aliases: ["Anterior cingulate cortex", "ACC", "CCA"],
    sistemas: ["saliencia", "emocion", "ejecutivo", "recompensa"],
    funciones: ["Integra valor, estado interno y control adaptativo"],
    descripcion: "Region cingulada anterior. Se usa un unico nodo compartido por redes cinguladas y prefrontales para evitar duplicar ACC.",
    referencias: ["vogt_2016", "menon_2011"]
  }),
  region("corteza_cingulada_media", "Corteza cingulada media", "giro_cingulado", "corteza", "area_cortical", {
    aliases: ["Midcingulate cortex", "MCC", "Corteza mediocingulada"],
    sistemas: ["saliencia", "control", "motor", "dolor"],
    funciones: ["Vincula seleccion de respuesta, control y senales motivacionales"],
    descripcion: "Region cingulada distinta de ACC y PCC; la denominacion dorsal ACC no se usa como sinonimo automatico.",
    referencias: ["vogt_2016"]
  }),
  region("corteza_prefrontal_ventrolateral", "Corteza prefrontal ventrolateral", "corteza_prefrontal", "corteza", "area_cortical", {
    aliases: ["Ventrolateral prefrontal cortex", "VLPFC", "vlPFC"],
    sistemas: ["ejecutivo", "memoria_trabajo", "recuperacion", "lenguaje"],
    funciones: ["Seleccion, control de recuperacion e inhibicion dependiente de tarea"],
    descripcion: "Subregion lateral prefrontal integrada en redes frontoparietales y semanticas; sus limites dependen del atlas.",
    referencias: ["desposito_postle_2015", "lambon_ralph_2017"]
  }),
  region("corteza_prefrontal_dorsomedial", "Corteza prefrontal dorsomedial", "corteza_prefrontal_medial", "corteza", "area_cortical", {
    aliases: ["Dorsomedial prefrontal cortex", "dmPFC"],
    sistemas: ["ejecutivo", "social", "memoria_episodica", "saliencia"],
    funciones: ["Control, inferencia y evaluacion en redes mediales"],
    descripcion: "Subregion dorsomedial del agregado mPFC; no se equipara automaticamente con corteza cingulada media.",
    evidencia: "modelo_funcional",
    referencias: ["menon_2011", "ranganath_ritchey_2012"]
  }),
  region("corteza_orbitofrontal", "Corteza orbitofrontal", "corteza_prefrontal", "corteza", "region_cortical", {
    aliases: ["Orbitofrontal cortex", "OFC", "COF"],
    sistemas: ["recompensa", "valor", "memoria_semantica", "emocion"],
    funciones: ["Representacion flexible de valor y resultados esperados"],
    descripcion: "Region prefrontal orbital heterogenea conectada con temporal anterior, amigdala y estriado ventral.",
    referencias: ["haber_knutson_2010", "von_der_heide_2013"]
  }),
  region("giro_angular", "Giro angular", "corteza_parietal_posterior", "corteza", "giro", {
    aliases: ["Angular gyrus", "AG", "Giro angularis"],
    sistemas: ["memoria_episodica", "memoria_semantica", "integracion_multimodal"],
    funciones: ["Representacion multimodal de informacion recuperada"],
    descripcion: "Componente parietal ventral asociado con recuperacion y representacion multimodal; no es un almacen episodico aislado.",
    evidencia: "modelo_funcional",
    referencias: ["rugg_king_2018"]
  }),
  region("giro_supramarginal", "Giro supramarginal", "corteza_parietal_posterior", "corteza", "giro", {
    aliases: ["Supramarginal gyrus", "SMG", "Giro supramarginalis"],
    sistemas: ["atencion", "memoria_trabajo", "integracion_multimodal", "lenguaje"],
    funciones: ["Integra informacion fonologica, somatosensorial y atencional segun tarea"],
    descripcion: "Componente del lobulo parietal inferior, distinto del giro angular aunque ambos participan en redes distribuidas.",
    referencias: ["rugg_king_2018", "desposito_postle_2015"]
  }),
  region("insula_anterior", "Insula anterior", "telencefalo", "corteza", "area_cortical", {
    aliases: ["Anterior insula", "AI"],
    sistemas: ["saliencia", "interocepcion", "control"],
    funciones: ["Detecta y prioriza senales relevantes dentro de redes funcionales"],
    descripcion: "Region insular anterior incluida para representar la red de saliencia como overlay funcional, no como tracto.",
    evidencia: "modelo_funcional",
    referencias: ["seeley_2007", "menon_2011"]
  }),

  // Complejo amigdalino detallado.
  region("nucleo_lateral_amigdala", "Nucleo lateral de la amigdala", "amigdala_basolateral", "nucleo", "subnucleo", {
    aliases: ["Lateral amygdala", "LA"],
    sistemas: ["condicionamiento", "memoria_emocional", "sensorial"],
    funciones: ["Recibe entradas sensoriales y participa en asociaciones aprendidas"],
    descripcion: "Subnucleo del complejo basolateral con entradas talamicas y corticales dependientes de modalidad.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["sah_2003", "ledoux_2000"]
  }),
  region("nucleo_basal_amigdala", "Nucleo basal de la amigdala", "amigdala_basolateral", "nucleo", "subnucleo", {
    aliases: ["Basal amygdala", "BA", "Nucleo basolateral basal"],
    sistemas: ["memoria_emocional", "recompensa", "extincion", "reconsolidacion"],
    funciones: ["Integra contexto, valor y control prefrontal en microcircuitos amigdalinos"],
    descripcion: "Subnucleo del complejo basolateral, separado del nucleo lateral y del nucleo central.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["sah_2003", "phelps_ledoux_2005"]
  }),
  region("nucleo_medial_amigdala", "Nucleo medial de la amigdala", "amigdala", "nucleo", "nucleo", {
    aliases: ["Medial amygdala", "MeA"],
    sistemas: ["social", "olfaccion", "respuesta_autonomica"],
    funciones: ["Integra senales quimiosensoriales y sociales con respuestas hipotalamicas"],
    descripcion: "Nucleo amigdalino medial con conectividad y funciones distintas del complejo basolateral.",
    neurotransmisoresRelevantes: ["GABA", "peptidos"],
    referencias: ["sah_2003", "kandel_2021"]
  }),
  region("masas_intercaladas_amigdala", "Masas intercaladas de la amigdala", "amigdala", "grupo_celular", "subcampo", {
    aliases: ["Intercalated cell masses", "ITC", "Intercalated cells"],
    sistemas: ["extincion", "condicionamiento", "memoria_emocional"],
    funciones: ["Modulan de manera inhibitoria el flujo entre complejos amigdalinos"],
    descripcion: "Grupos de neuronas GABAergicas; se muestran en nivel avanzado y no se presentan como un nucleo unico uniforme.",
    neurotransmisoresRelevantes: ["GABA"],
    evidencia: "modelo_funcional",
    referencias: ["sah_2003", "milad_quirk_2012"]
  }),

  // Ganglios basales y aprendizaje por recompensa.
  region("globo_palido_externo", "Globo palido externo", "globo_palido", "nucleo", "nucleo", {
    aliases: ["GPe", "External globus pallidus"],
    sistemas: ["motor", "aprendizaje_procedimental", "seleccion_acciones"],
    funciones: ["Integra la via indirecta y circuitos recurrentes de ganglios basales"],
    descripcion: "Segmento palidal externo GABAergico, distinto del GPi de salida.",
    neurotransmisoresRelevantes: ["GABA"],
    referencias: ["lanciego_2012", "alexander_delong_strick_1986"]
  }),
  region("nucleo_subtalamico", "Nucleo subtalamico", "diencefalo", "nucleo", "nucleo", {
    aliases: ["Subthalamic nucleus", "STN", "NST"],
    sistemas: ["ganglios_basales", "motor", "seleccion_acciones", "ejecutivo"],
    funciones: ["Aporta una proyeccion excitatoria a nucleos de salida de ganglios basales"],
    descripcion: "Nucleo diencefalico integrado funcionalmente en ganglios basales; su padre anatomico no se cambia a telencefalo.",
    neurotransmisoresRelevantes: ["glutamato"],
    referencias: ["lanciego_2012"]
  }),
  region("nucleo_accumbens_core", "Nucleo accumbens core", "nucleo_accumbens", "nucleo", "subnucleo", {
    aliases: ["NAc core", "Accumbens core"],
    sistemas: ["recompensa", "aprendizaje_refuerzo", "seleccion_acciones"],
    funciones: ["Integra senales de claves, acciones y valor en el estriado ventral"],
    descripcion: "Subterritorio core del nucleo accumbens; sus limites y funciones se solapan parcialmente con otros territorios estriatales.",
    neurotransmisoresRelevantes: ["GABA", "dopamina", "glutamato"],
    referencias: ["haber_knutson_2010", "lanciego_2012"]
  }),
  region("nucleo_accumbens_shell", "Nucleo accumbens shell", "nucleo_accumbens", "nucleo", "subnucleo", {
    aliases: ["NAc shell", "Accumbens shell"],
    sistemas: ["recompensa", "motivacion", "aprendizaje_refuerzo"],
    funciones: ["Integra contexto, estado interno y valor en circuitos limbicos"],
    descripcion: "Subterritorio shell del nucleo accumbens con conectividad limbica y palidal diferenciada, no absoluta.",
    neurotransmisoresRelevantes: ["GABA", "dopamina", "glutamato"],
    referencias: ["haber_knutson_2010", "lanciego_2012"]
  }),
  region("habenula_lateral", "Habenula lateral", "diencefalo", "nucleo", "nucleo", {
    aliases: ["Lateral habenula", "LHb"],
    sistemas: ["recompensa", "aversion", "aprendizaje_refuerzo"],
    funciones: ["Integra resultados adversos y modula sistemas monoaminergicos"],
    descripcion: "Nucleo epitalamico conectado con RMTg y sistemas dopaminergicos; no codifica de forma exclusiva la aversion.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["hikosaka_2010"]
  }),
  region("nucleo_tegmental_rostromedial", "Nucleo tegmental rostromedial", "mesencefalo", "nucleo", "nucleo", {
    aliases: ["Rostromedial tegmental nucleus", "RMTg", "Cola de VTA"],
    sistemas: ["recompensa", "aversion", "dopamina"],
    funciones: ["Proporciona control GABAergico a poblaciones dopaminergicas mesencefalicas"],
    descripcion: "Nucleo tegmental GABAergico incluido en nivel avanzado del circuito habenula-RMTg-VTA.",
    neurotransmisoresRelevantes: ["GABA"],
    referencias: ["jhou_2009", "hikosaka_2010"]
  }),

  // Sistemas moduladores ascendentes.
  region("nucleo_rafe_dorsal", "Nucleo del rafe dorsal", "mesencefalo", "nucleo", "nucleo", {
    aliases: ["Dorsal raphe nucleus", "DRN", "Rafe dorsal"],
    sistemas: ["serotonina", "emocion", "aprendizaje", "sueño_vigilia"],
    funciones: ["Modulacion serotoninergica heterogenea de corteza y regiones limbicas"],
    descripcion: "Nucleo del rafe con subpoblaciones y proyecciones distintas; la capa no lo trata como una fuente homogenea.",
    neurotransmisoresRelevantes: ["serotonina", "glutamato", "GABA"],
    referencias: ["hornung_2003", "kandel_2021"]
  }),
  region("nucleo_rafe_mediano", "Nucleo del rafe mediano", "tronco_encefalico", "nucleo", "nucleo", {
    aliases: ["Median raphe nucleus", "MRN", "Rafe medial", "Rafe mediano"],
    sistemas: ["serotonina", "memoria", "navegacion", "sueño_vigilia"],
    funciones: ["Modulacion serotoninergica de hipocampo, septum y regiones limbicas"],
    descripcion: "Nucleo rostral del rafe con proyecciones que se solapan parcialmente, pero no son identicas, a las del rafe dorsal.",
    neurotransmisoresRelevantes: ["serotonina"],
    referencias: ["hornung_2003"]
  }),
  region("locus_coeruleus", "Locus coeruleus", "puente", "nucleo", "nucleo", {
    aliases: ["Locus coeruleus", "LC", "Nucleo ceruleo"],
    sistemas: ["noradrenalina", "atencion", "memoria", "sueño_vigilia"],
    funciones: ["Modulacion noradrenergica de redes corticales, hipocampales y amigdalinas"],
    descripcion: "Nucleo pontino pequeno con proyecciones extensas y organizadas; no produce una modulacion uniforme.",
    neurotransmisoresRelevantes: ["noradrenalina"],
    referencias: ["poe_2020"]
  }),
  region("nucleo_tuberomamilar", "Nucleo tuberomamilar", "hipotalamo", "nucleo", "nucleo", {
    aliases: ["Tuberomammillary nucleus", "TMN", "Nucleo tuberomamilar histaminergico"],
    sistemas: ["histamina", "sueño_vigilia", "atencion", "memoria"],
    funciones: ["Modulacion histaminergica difusa del encefalo"],
    descripcion: "Principal origen histaminergico del cerebro mamifero, situado en hipotalamo posterior.",
    neurotransmisoresRelevantes: ["histamina"],
    referencias: ["haas_2008"]
  }),

  // Tronco y cerebelo para aprendizaje motor.
  fromAtlas("brainstem", {
    id: "tronco_encefalico",
    nombre: "Tronco encefalico",
    nombreCompleto: "Tronco encefalico",
    regionPadre: "brain",
    tipo: "region",
    nivelAnatomico: "division",
    sistemas: ["motor", "modulacion", "integracion"],
    referencias: ["kandel_2021"]
  }),
  fromAtlas("cerebellum", {
    id: "cerebelo",
    nombre: "Cerebelo",
    nombreCompleto: "Cerebelo",
    regionPadre: "brain",
    tipo: "region",
    nivelAnatomico: "organo",
    sistemas: ["aprendizaje_motor", "motor", "prediccion"],
    referencias: ["apps_garwicz_2005", "ebner_2015"]
  }),
  region("corteza_cerebelosa", "Corteza cerebelosa", "cerebelo", "corteza", "region_cortical", {
    aliases: ["Cerebellar cortex"],
    sistemas: ["aprendizaje_motor", "prediccion", "automatizacion"],
    funciones: ["Integra fibras musgosas y trepadoras y ajusta la salida de nucleos profundos"],
    descripcion: "Corteza laminada del cerebelo representada como agregado; sus microzonas no se subdividen aun.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["apps_garwicz_2005", "ebner_2015"]
  }),
  region("nucleo_dentado_cerebelo", "Nucleo dentado", "cerebelo", "nucleo", "nucleo", {
    aliases: ["Dentate nucleus", "Nucleo dentado cerebeloso"],
    sistemas: ["aprendizaje_motor", "planificacion", "cognicion"],
    funciones: ["Salida cerebelosa lateral hacia talamo y otras dianas"],
    descripcion: "Nucleo profundo lateral del cerebelo, distinto del giro dentado hipocampal.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["apps_garwicz_2005"]
  }),
  region("nucleos_interpuestos_cerebelo", "Nucleos interpuestos del cerebelo", "cerebelo", "grupo_nuclear", "grupo_nuclear", {
    aliases: ["Interposed nuclei", "Nucleos globoso y emboliforme"],
    sistemas: ["aprendizaje_motor", "correccion_error", "motor"],
    funciones: ["Salida de regiones cerebelosas intermedias hacia circuitos motores"],
    descripcion: "Agrupacion educativa de nucleos globoso y emboliforme; puede expandirse sin duplicarlos.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["apps_garwicz_2005"]
  }),
  region("nucleo_fastigial_cerebelo", "Nucleo fastigial", "cerebelo", "nucleo", "nucleo", {
    aliases: ["Fastigial nucleus", "Nucleo del fastigio"],
    sistemas: ["motor", "postura", "aprendizaje_motor"],
    funciones: ["Salida vermiana hacia circuitos vestibulares y del tronco"],
    descripcion: "Nucleo profundo medial del cerebelo, incluido a escala de circuito y no de microzona.",
    neurotransmisoresRelevantes: ["glutamato", "GABA"],
    referencias: ["apps_garwicz_2005"]
  }),
  region("puente", "Puente", "tronco_encefalico", "region", "division", {
    aliases: ["Pons", "Protuberancia anular"],
    sistemas: ["motor", "aprendizaje_motor", "integracion"],
    funciones: ["Aloja nucleos pontinos que relevan informacion cortical al cerebelo"],
    descripcion: "Division del tronco; las conexiones corticopontocerebelosas representan nucleos pontinos de forma agregada.",
    referencias: ["apps_garwicz_2005", "kandel_2021"]
  }),
  region("oliva_inferior", "Oliva inferior", "tronco_encefalico", "complejo_nuclear", "nucleo", {
    aliases: ["Inferior olive", "Complejo olivar inferior"],
    sistemas: ["aprendizaje_motor", "correccion_error", "plasticidad"],
    funciones: ["Origina fibras trepadoras hacia corteza cerebelosa"],
    descripcion: "Complejo nuclear bulbar implicado en senales instructivas y sincronizacion; no equivale por si solo a un error computacional.",
    neurotransmisoresRelevantes: ["glutamato"],
    evidencia: "modelo_funcional",
    referencias: ["ebner_2015", "apps_garwicz_2005"]
  })
]);

export const BRAIN_REGION_BY_ID = new Map(BRAIN_REGIONS.map((item) => [item.id, item]));
