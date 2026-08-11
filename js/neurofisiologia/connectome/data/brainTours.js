function step(nodeId, connectionId, titulo, basico, intermedio = basico, avanzado = intermedio) {
  return Object.freeze({
    nodeId,
    connectionId: connectionId || null,
    titulo,
    texto: Object.freeze({ basico, intermedio, avanzado })
  });
}

function tour(definition) {
  return Object.freeze({
    velocidadMs: 3600,
    tipo: "recorrido",
    ...definition,
    pasos: Object.freeze([...(definition.pasos || [])]),
    referencias: Object.freeze([...(definition.referencias || [])])
  });
}

/** Los recorridos referencian IDs; nunca contienen copias de nodos o aristas. */
export const BRAIN_TOURS = Object.freeze([
  tour({
    id: "formacion_recuerdo_episodico",
    nombre: "Como se forma un recuerdo episodico",
    circuitoId: "episodic_memory",
    tipo: "actividad_educativa",
    descargo: "Flujo funcional educativo: no representa actividad neuronal real medida ni implica procesamiento estrictamente serial.",
    pasos: [
      step("cortezas_sensoriales_asociativas", null, "Contenido perceptivo", "El episodio comienza con informacion de lo que vemos, oimos y sentimos."),
      step("corteza_parahipocampal", "sensorial_parahipocampal", "Contexto", "La red parahipocampal aporta informacion sobre escena y contexto."),
      step("corteza_entorrinal", "parahipocampal_entorrinal", "Interfaz entorrinal", "La corteza entorrinal organiza entradas hacia la formacion hipocampal."),
      step("giro_dentado", "via_perforante_ec_dg", "Representaciones diferenciadas", "El giro dentado contribuye a distinguir experiencias parecidas.", "La separacion de patrones es una contribucion propuesta, no exclusiva.", "Modelos computacionales y datos experimentales relacionan el giro dentado con codificacion escasa y separacion de patrones, con dependencia de tarea y especie."),
      step("ca3", "fibras_musgosas_dg_ca3", "Asociacion en CA3", "CA3 ayuda a relacionar elementos y recuperar conjuntos desde pistas parciales.", "La red recurrente de CA3 sustenta modelos de completamiento de patrones.", "La conectividad recurrente y la plasticidad CA3 apoyan modelos autoasociativos; completamiento no es una funcion absoluta ni exclusiva."),
      step("ca1", "colaterales_schaffer_ca3_ca1", "Integracion en CA1", "CA1 integra lo que llega desde CA3 con entradas entorrinales.", "La convergencia permite modelos de comparacion e integracion temporal.", "CA1 recibe colaterales de Schaffer y via temporoamonica; la etiqueta comparador es un modelo funcional."),
      step("subiculo", "proyeccion_ca1_subiculo", "Salida hipocampal", "El subiculo distribuye el resultado hacia otras redes."),
      step("corteza_retrosplenial", "subiculo_retrosplenial", "Memoria en red", "El recuerdo involucra redes corticales posteriores y prefrontales, no solo el hipocampo.")
    ],
    referencias: ["dickerson_eichenbaum_2010", "basu_siegelbaum_2015", "knierim_neunuebel_2016"]
  }),
  tour({
    id: "circuito_hipocampal_paso_a_paso",
    nombre: "Circuito hipocampal paso a paso",
    circuitoId: "hipocampal_trisynaptic",
    pasos: [
      step("corteza_entorrinal", null, "Entrada", "La corteza entorrinal es la interfaz cortical principal."),
      step("giro_dentado", "via_perforante_ec_dg", "Via perforante", "La via perforante lleva informacion al giro dentado."),
      step("ca3", "fibras_musgosas_dg_ca3", "Fibras musgosas", "Las celulas granulares proyectan a CA3."),
      step("ca1", "colaterales_schaffer_ca3_ca1", "Colaterales de Schaffer", "CA3 proyecta a CA1 por una sinapsis clasica para estudiar LTP."),
      step("subiculo", "proyeccion_ca1_subiculo", "Salida", "CA1 entrega informacion al subiculo."),
      step("corteza_entorrinal", "proyeccion_subiculo_entorrinal", "Retorno cortical", "Las salidas regresan a corteza entorrinal y se distribuyen a otras regiones.")
    ],
    referencias: ["basu_siegelbaum_2015", "amaral_witter_1989"]
  }),
  tour({
    id: "que_hace_ca3",
    nombre: "Que hace CA3",
    circuitoId: "hipocampal_trisynaptic",
    pasos: [
      step("ca3", null, "CA3 no trabaja solo", "CA3 recibe una entrada potente desde giro dentado."),
      step("ca3", "recurrentes_ca3", "Red recurrente", "Sus conexiones recurrentes permiten asociar patrones de actividad."),
      step("ca1", "colaterales_schaffer_ca3_ca1", "Salida hacia CA1", "Las colaterales de Schaffer llevan la representacion hacia CA1."),
      step("ca3", null, "Cautela", "Decir completamiento de patrones resume una teoria util, no una funcion unica de CA3.")
    ],
    referencias: ["knierim_neunuebel_2016", "nakazawa_2002"]
  }),
  tour({
    id: "que_hace_ca1",
    nombre: "Que hace CA1",
    circuitoId: "hipocampal_trisynaptic",
    pasos: [
      step("ca1", "colaterales_schaffer_ca3_ca1", "Entrada desde CA3", "CA1 recibe las colaterales de Schaffer."),
      step("ca1", "via_temporoamonica_ec_ca1", "Entrada entorrinal directa", "Tambien recibe una corriente mas directa desde corteza entorrinal."),
      step("ca1", null, "Integracion", "La convergencia permite comparar e integrar informacion, segun modelos funcionales."),
      step("subiculo", "proyeccion_ca1_subiculo", "Salida", "CA1 proyecta al subiculo y otras dianas."),
      step("ca1", null, "Plasticidad", "La sinapsis CA3-CA1 es un modelo muy usado para estudiar NMDA, calcio, AMPA, LTP y LTD; no toda plasticidad funciona igual.")
    ],
    referencias: ["bliss_collingridge_1993", "ncbi_nmda_plasticity", "malenka_bear_2004"]
  }),
  tour({
    id: "corteza_entorrinal",
    nombre: "Como participa la corteza entorrinal",
    circuitoId: "hipocampal_trisynaptic",
    pasos: [
      step("corteza_entorrinal", null, "Interfaz", "Conecta redes corticales distribuidas con la formacion hipocampal."),
      step("giro_dentado", "via_perforante_ec_dg", "Ruta indirecta", "La via perforante inicia la secuencia giro dentado-CA3-CA1."),
      step("ca1", "via_temporoamonica_ec_ca1", "Ruta directa", "Una ruta entorrinal llega mas directamente a CA1."),
      step("corteza_entorrinal", "proyeccion_subiculo_entorrinal", "Retorno", "Las capas profundas reciben salidas hipocampales y las redistribuyen."),
      step("corteza_entorrinal_medial", null, "Espacio", "La porcion medial participa en redes de codificacion espacial; grid cells son un tipo funcional de actividad.")
    ],
    referencias: ["van_strien_2009", "basu_siegelbaum_2015", "brandon_koenig_leutgeb_2014"]
  }),
  tour({
    id: "circuito_papez",
    nombre: "Circuito de Papez",
    circuitoId: "papez",
    pasos: [
      step("subiculo", null, "Salida hipocampal", "El recorrido parte del subiculo como salida mayor de la formacion hipocampal."),
      step("fornix", "subiculo_fornix", "Fornix", "Los axones ingresan al fornix, un tracto seleccionable."),
      step("cuerpos_mamilares", "fornix_cuerpos_mamilares", "Cuerpos mamilares", "El fornix poscomisural alcanza cuerpos mamilares."),
      step("tracto_mamilotalamico", "cuerpos_mamilares_tracto_mtt", "Tracto mamilotalamico", "Este tracto asciende hacia el talamo anterior."),
      step("nucleos_anteriores_talamo", "tracto_mtt_talamo_anterior", "Talamo anterior", "Los nucleos anteriores forman parte de una red de memoria diencefalica."),
      step("giro_cingulado", "talamo_anterior_giro_cingulado", "Corteza cingulada", "La informacion alcanza regiones cinguladas."),
      step("cingulo", "giro_cingulado_cingulo", "Cingulo", "El haz del cingulo conecta regiones mediales y parahipocampales."),
      step("corteza_entorrinal", "cingulo_entorrinal", "Regreso temporal medial", "El esquema retorna a la interfaz entorrinal-hipocampal."),
      step("giro_cingulado", null, "Vision moderna", "Papez fue historicamente emocional; hoy no se considera una explicacion completa de la emocion y se integra en redes de memoria mas amplias.")
    ],
    referencias: ["papez_1937", "bubb_2017", "vann_nelson_2015"]
  }),
  tour({
    id: "memoria_trabajo",
    nombre: "Memoria de trabajo",
    circuitoId: "working_memory",
    pasos: [
      step("corteza_prefrontal_dorsolateral", null, "Metas y control", "DLPFC participa en mantener y manipular informacion relevante."),
      step("corteza_parietal_posterior", "dlpfc_parietal", "Red frontoparietal", "El contenido se mantiene de forma distribuida, no solo en prefrontal."),
      step("nucleo_mediodorsal_talamo", "dlpfc_mediodorsal", "Bucle talamocortical", "El talamo mediodorsal interactua con prefrontal para sostener actividad y seleccionar respuestas."),
      step("caudado", "dlpfc_caudado", "Gating", "Bucles con ganglios basales contribuyen a decidir que informacion actualizar o usar."),
      step("vta", "vta_dlpfc_dopamina", "Modulacion", "Dopamina modula la red; su efecto depende del receptor y del estado, no es simplemente mas o menos memoria.")
    ],
    referencias: ["desposito_postle_2015", "bolkan_2017", "chatham_badre_2015"]
  }),
  tour({
    id: "aprendizaje_recompensa",
    nombre: "Aprendizaje por recompensa",
    circuitoId: "reward_learning",
    pasos: [
      step("vta", null, "VTA", "Poblaciones de VTA emiten senales dopaminergicas moduladoras."),
      step("nucleo_accumbens", "vta_accumbens_dopamina", "Estriado ventral", "Nucleo accumbens integra dopamina con entradas de corteza, amigdala e hipocampo."),
      step("palido_ventral", "accumbens_palido_ventral", "Salida ventral", "Accumbens influye en palido ventral mediante proyecciones GABAergicas."),
      step("nucleo_mediodorsal_talamo", "palido_ventral_mediodorsal", "Talamo", "El bucle retorna por talamo de asociacion."),
      step("corteza_prefrontal_medial", "mediodorsal_prefrontal_medial", "Valor y metas", "Prefrontal integra resultados, contexto y metas para guiar conducta."),
      step("vta", null, "Cautela computacional", "Algunas respuestas dopaminergicas se modelan como error de prediccion; dopamina no significa placer y no es una conexion anatomica por si misma.")
    ],
    referencias: ["haber_knutson_2010", "schultz_dayan_montague_1997"]
  })
]);

export const BRAIN_TOUR_BY_ID = new Map(BRAIN_TOURS.map((item) => [item.id, item]));
