/**
 * Registro bibliografico del mapa. Los datos anatomicos solo guardan IDs de esta
 * coleccion para evitar repetir citas y URLs en cada entidad.
 */
export const BRAIN_REFERENCES = Object.freeze([
  {
    id: "kandel_2021",
    tipo: "libro",
    cita: "Kandel ER et al. Principles of Neural Science. 6th ed. McGraw Hill; 2021.",
    titulo: "Principles of Neural Science",
    url: "https://accessmedicine.mhmedical.com/book.aspx?bookid=3024",
    alcance: "Neuroanatomia funcional, sistemas de memoria, plasticidad y sistemas moduladores."
  },
  {
    id: "amaral_witter_1989",
    tipo: "revision",
    cita: "Amaral DG, Witter MP. The three-dimensional organization of the hippocampal formation: a review of anatomical data. Neuroscience. 1989;31(3):571-591.",
    titulo: "Three-dimensional organization of the hippocampal formation",
    url: "https://doi.org/10.1016/0306-4522(89)90052-4",
    alcance: "Organizacion anatomica de la formacion hipocampal y circuito trisináptico."
  },
  {
    id: "van_strien_2009",
    tipo: "revision",
    cita: "van Strien NM, Cappaert NLM, Witter MP. The anatomy of memory: an interactive overview of the parahippocampal-hippocampal network. Nature Reviews Neuroscience. 2009;10:272-282.",
    titulo: "The anatomy of memory",
    url: "https://doi.org/10.1038/nrn2614",
    alcance: "Red parahipocampal-hipocampal y sus vias de entrada y salida."
  },
  {
    id: "yassa_stark_2011",
    tipo: "revision",
    cita: "Yassa MA, Stark CEL. Pattern separation in the hippocampus. Trends in Neurosciences. 2011;34(10):515-525.",
    titulo: "Pattern separation in the hippocampus",
    url: "https://doi.org/10.1016/j.tins.2011.06.006",
    alcance: "Separacion de patrones como marco funcional, con cautelas entre modelos animales y humanos."
  },
  {
    id: "nakazawa_2002",
    tipo: "articulo_original",
    cita: "Nakazawa K et al. Requirement for hippocampal CA3 NMDA receptors in associative memory recall. Science. 2002;297(5579):211-218.",
    titulo: "CA3 NMDA receptors in associative memory recall",
    url: "https://doi.org/10.1126/science.1071795",
    alcance: "Evidencia experimental sobre CA3, receptores NMDA y recuperacion asociativa."
  },
  {
    id: "squire_wixted_2011",
    tipo: "revision",
    cita: "Squire LR, Wixted JT. The cognitive neuroscience of human memory since H.M. Annual Review of Neuroscience. 2011;34:259-288.",
    titulo: "The cognitive neuroscience of human memory since H.M.",
    url: "https://doi.org/10.1146/annurev-neuro-061010-113720",
    alcance: "Sistemas de memoria declarativa y papel del lobulo temporal medial."
  },
  {
    id: "ranganath_ritchey_2012",
    tipo: "revision",
    cita: "Ranganath C, Ritchey M. Two cortical systems for memory-guided behaviour. Nature Reviews Neuroscience. 2012;13:713-726.",
    titulo: "Two cortical systems for memory-guided behaviour",
    url: "https://doi.org/10.1038/nrn3338",
    alcance: "Redes corticales de memoria episodica, contexto y comportamiento guiado por memoria."
  },
  {
    id: "aggleton_brown_1999",
    tipo: "revision_teorica",
    cita: "Aggleton JP, Brown MW. Episodic memory, amnesia, and the hippocampal-anterior thalamic axis. Behavioral and Brain Sciences. 1999;22(3):425-444.",
    titulo: "The hippocampal-anterior thalamic axis",
    url: "https://doi.org/10.1017/S0140525X99002034",
    alcance: "Eje hipocampo-talamo anterior y memoria episodica."
  },
  {
    id: "papez_1937",
    tipo: "articulo_historico",
    cita: "Papez JW. A proposed mechanism of emotion. Archives of Neurology & Psychiatry. 1937;38(4):725-743.",
    titulo: "A proposed mechanism of emotion",
    url: "https://doi.org/10.1001/archneurpsyc.1937.02260220069003",
    alcance: "Formulacion historica del circuito de Papez; no representa por si sola la neurociencia moderna de la emocion."
  },
  {
    id: "lambon_ralph_2017",
    tipo: "revision",
    cita: "Lambon Ralph MA, Jefferies E, Patterson K, Rogers TT. The neural and computational bases of semantic cognition. Nature Reviews Neuroscience. 2017;18:42-55.",
    titulo: "The neural and computational bases of semantic cognition",
    url: "https://doi.org/10.1038/nrn.2016.150",
    alcance: "Cognicion semantica distribuida y modelo hub-and-spoke."
  },
  {
    id: "desposito_postle_2015",
    tipo: "revision",
    cita: "D'Esposito M, Postle BR. The cognitive neuroscience of working memory. Annual Review of Psychology. 2015;66:115-142.",
    titulo: "The cognitive neuroscience of working memory",
    url: "https://doi.org/10.1146/annurev-psych-010814-015031",
    alcance: "Memoria de trabajo como funcion de redes distribuidas y control prefrontal."
  },
  {
    id: "bolkan_2017",
    tipo: "articulo_original",
    cita: "Bolkan SS et al. Thalamic projections sustain prefrontal activity during working memory maintenance. Nature Neuroscience. 2017;20:987-996.",
    titulo: "Thalamic projections sustain prefrontal activity",
    url: "https://doi.org/10.1038/nn.4568",
    alcance: "Interaccion talamo-prefrontal durante mantenimiento de memoria de trabajo en modelo animal."
  },
  {
    id: "alexander_delong_strick_1986",
    tipo: "revision",
    cita: "Alexander GE, DeLong MR, Strick PL. Parallel organization of functionally segregated circuits linking basal ganglia and cortex. Annual Review of Neuroscience. 1986;9:357-381.",
    titulo: "Parallel organization of basal ganglia and cortex",
    url: "https://doi.org/10.1146/annurev.ne.09.030186.002041",
    alcance: "Bucles cortico-estriado-palido-talamo-corticales."
  },
  {
    id: "yin_knowlton_2006",
    tipo: "revision",
    cita: "Yin HH, Knowlton BJ. The role of the basal ganglia in habit formation. Nature Reviews Neuroscience. 2006;7:464-476.",
    titulo: "The role of the basal ganglia in habit formation",
    url: "https://doi.org/10.1038/nrn1919",
    alcance: "Aprendizaje de habitos y contribuciones estriatales."
  },
  {
    id: "ledoux_2000",
    tipo: "revision",
    cita: "LeDoux JE. Emotion circuits in the brain. Annual Review of Neuroscience. 2000;23:155-184.",
    titulo: "Emotion circuits in the brain",
    url: "https://doi.org/10.1146/annurev.neuro.23.1.155",
    alcance: "Circuitos de condicionamiento aversivo y amigdala."
  },
  {
    id: "phelps_ledoux_2005",
    tipo: "revision",
    cita: "Phelps EA, LeDoux JE. Contributions of the amygdala to emotion processing: from animal models to human behavior. Neuron. 2005;48(2):175-187.",
    titulo: "Contributions of the amygdala to emotion processing",
    url: "https://doi.org/10.1016/j.neuron.2005.09.025",
    alcance: "Amigdala, aprendizaje emocional y cautelas de traduccion entre especies."
  },
  {
    id: "pitkanen_2000",
    tipo: "revision_anatomica",
    cita: "Pitkanen A, Pikkarainen M, Nurminen N, Ylinen A. Reciprocal connections between the amygdala and the hippocampal formation, perirhinal cortex, and postrhinal cortex in rat: a review. Annals of the New York Academy of Sciences. 2000;911:369-391.",
    titulo: "Reciprocal amygdala-hippocampal connections in rat",
    url: "https://doi.org/10.1111/j.1749-6632.2000.tb06738.x",
    alcance: "Trazado anatomico y topografia de conexiones reciprocas amigdala-formacion hipocampal en rata."
  },
  {
    id: "milad_quirk_2012",
    tipo: "revision",
    cita: "Milad MR, Quirk GJ. Fear extinction as a model for translational neuroscience. Annual Review of Psychology. 2012;63:129-151.",
    titulo: "Fear extinction as a model for translational neuroscience",
    url: "https://doi.org/10.1146/annurev.psych.121208.131631",
    alcance: "Extincion, corteza prefrontal, amigdala e hipocampo."
  },
  {
    id: "nader_2000",
    tipo: "articulo_original",
    cita: "Nader K, Schafe GE, LeDoux JE. Fear memories require protein synthesis in the amygdala for reconsolidation after retrieval. Nature. 2000;406:722-726.",
    titulo: "Fear memory reconsolidation after retrieval",
    url: "https://doi.org/10.1038/35021052",
    alcance: "Reconsolidacion de memoria aversiva en modelo animal."
  },
  {
    id: "schultz_dayan_montague_1997",
    tipo: "articulo_original",
    cita: "Schultz W, Dayan P, Montague PR. A neural substrate of prediction and reward. Science. 1997;275(5306):1593-1599.",
    titulo: "A neural substrate of prediction and reward",
    url: "https://doi.org/10.1126/science.275.5306.1593",
    alcance: "Senales dopaminergicas y error de prediccion de recompensa como modelo computacional."
  },
  {
    id: "haber_knutson_2010",
    tipo: "revision",
    cita: "Haber SN, Knutson B. The reward circuit: linking primate anatomy and human imaging. Neuropsychopharmacology. 2010;35:4-26.",
    titulo: "The reward circuit",
    url: "https://doi.org/10.1038/npp.2009.129",
    alcance: "Circuitos de recompensa, estriado ventral, palido, talamo y corteza prefrontal."
  },
  {
    id: "watabe_uchida_2012",
    tipo: "articulo_original",
    cita: "Watabe-Uchida M, Zhu L, Ogawa SK, Vamanrao A, Uchida N. Whole-brain mapping of direct inputs to midbrain dopamine neurons. Neuron. 2012;74(5):858-873.",
    titulo: "Whole-brain mapping of inputs to dopamine neurons",
    url: "https://doi.org/10.1016/j.neuron.2012.03.017",
    alcance: "Entradas a neuronas dopaminergicas mesencefalicas en modelo animal."
  },
  {
    id: "yetnikoff_2014",
    tipo: "revision",
    cita: "Yetnikoff L, Lavezzi HN, Reichard RA, Zahm DS. An update on the connections of the ventral mesencephalic dopaminergic complex. Neuroscience. 2014;282:23-48.",
    titulo: "Connections of the ventral mesencephalic dopaminergic complex",
    url: "https://doi.org/10.1016/j.neuroscience.2014.04.010",
    alcance: "Organizacion comparada de aferencias y eferencias del complejo dopaminergico mesencefalico."
  },
  {
    id: "tsetsenis_2023",
    tipo: "revision",
    cita: "Tsetsenis T, Broussard JI, Dani JA. Dopaminergic regulation of hippocampal plasticity, learning, and memory. Frontiers in Behavioral Neuroscience. 2023;16:1092420.",
    titulo: "Dopaminergic regulation of hippocampal plasticity, learning, and memory",
    url: "https://doi.org/10.3389/fnbeh.2022.1092420",
    alcance: "Modulacion dopaminergica hipocampal y controversia sobre la contribucion relativa de VTA y locus coeruleus."
  },
  {
    id: "tang_2020",
    tipo: "articulo_original",
    cita: "Tang W, Kochubey O, Kintscher M, Schneggenburger R. A VTA to Basal Amygdala Dopamine Projection Contributes to Signal Salient Somatosensory Events during Fear Learning. Journal of Neuroscience. 2020;40(20):3969-3980.",
    titulo: "VTA to basal amygdala dopamine projection during fear learning",
    url: "https://doi.org/10.1523/JNEUROSCI.1796-19.2020",
    alcance: "Trazado y manipulacion funcional de la proyeccion dopaminergica VTA-amigdala basal en raton."
  },
  {
    id: "moser_2008",
    tipo: "revision",
    cita: "Moser EI, Kropff E, Moser MB. Place cells, grid cells, and the brain's spatial representation system. Annual Review of Neuroscience. 2008;31:69-89.",
    titulo: "Place cells, grid cells, and spatial representation",
    url: "https://doi.org/10.1146/annurev.neuro.31.061307.090723",
    alcance: "Representacion espacial hipocampal-entorrinal y tipos celulares funcionales."
  },
  {
    id: "bliss_collingridge_1993",
    tipo: "revision",
    cita: "Bliss TVP, Collingridge GL. A synaptic model of memory: long-term potentiation in the hippocampus. Nature. 1993;361:31-39.",
    titulo: "A synaptic model of memory",
    url: "https://doi.org/10.1038/361031a0",
    alcance: "LTP hipocampal como modelo de plasticidad sinaptica relacionada con memoria."
  },
  {
    id: "malenka_bear_2004",
    tipo: "revision",
    cita: "Malenka RC, Bear MF. LTP and LTD: an embarrassment of riches. Neuron. 2004;44(1):5-21.",
    titulo: "LTP and LTD",
    url: "https://doi.org/10.1016/j.neuron.2004.09.012",
    alcance: "Mecanismos y diversidad de LTP/LTD; evita reducir toda plasticidad a una sola regla."
  },
  {
    id: "hasselmo_2006",
    tipo: "revision",
    cita: "Hasselmo ME. The role of acetylcholine in learning and memory. Current Opinion in Neurobiology. 2006;16(6):710-715.",
    titulo: "The role of acetylcholine in learning and memory",
    url: "https://doi.org/10.1016/j.conb.2006.09.002",
    alcance: "Modulacion colinergica de codificacion, atencion y memoria."
  },
  {
    id: "fipat_tna",
    tipo: "nomenclatura_oficial",
    cita: "FIPAT. Terminologia Neuroanatomica. Federative International Programme for Anatomical Terminology.",
    titulo: "Terminologia Neuroanatomica",
    url: "https://libraries.dal.ca/Fipat/tna.html",
    alcance: "Nomenclatura y clasificacion neuroanatomica internacional."
  },
  {
    id: "basu_siegelbaum_2015",
    tipo: "revision",
    cita: "Basu J, Siegelbaum SA. The Corticohippocampal Circuit, Synaptic Plasticity, and Memory. Cold Spring Harbor Perspectives in Biology. 2015;7(11):a021733.",
    titulo: "The Corticohippocampal Circuit, Synaptic Plasticity, and Memory",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4632668/",
    alcance: "Secuencia entorrinal-giro dentado-CA3-CA1, via directa entorrinal-CA1 y retorno."
  },
  {
    id: "knierim_neunuebel_2016",
    tipo: "revision",
    cita: "Knierim JJ, Neunuebel JP. Tracking the flow of hippocampal computation: pattern separation, pattern completion, and attractor dynamics. Neurobiology of Learning and Memory. 2016;129:38-49.",
    titulo: "Tracking the flow of hippocampal computation",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4792674/",
    alcance: "Separacion y completamiento de patrones como teorias computacionales contrastables."
  },
  {
    id: "bubb_2017",
    tipo: "revision",
    cita: "Bubb EJ, Kinnavane L, Aggleton JP. Hippocampal-diencephalic-cingulate networks for memory and emotion: an anatomical guide. Brain and Neuroscience Advances. 2017.",
    titulo: "Hippocampal-diencephalic-cingulate networks",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5608081/",
    alcance: "Actualizacion anatomica del circuito de Papez y rutas paralelas de memoria."
  },
  {
    id: "vann_nelson_2015",
    tipo: "revision",
    cita: "Vann SD, Nelson AJD. The mammillary bodies and memory: more than a hippocampal relay. Progress in Brain Research. 2015.",
    titulo: "The mammillary bodies and memory",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4498492/",
    alcance: "Cuerpos mamilares, fornix, tracto mamilotalamico y red de memoria."
  },
  {
    id: "dickerson_eichenbaum_2010",
    tipo: "revision",
    cita: "Dickerson BC, Eichenbaum H. The episodic memory system: neurocircuitry and disorders. Neuropsychopharmacology. 2010;35:86-104.",
    titulo: "The episodic memory system",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2882963/",
    alcance: "Sistema episodico distribuido en lobulo temporal medial y cortezas de asociacion."
  },
  {
    id: "hebscher_voss_2020",
    tipo: "revision",
    cita: "Hebscher M, Voss JL. Testing network properties of episodic memory using non-invasive brain stimulation. Current Opinion in Behavioral Sciences. 2020;32:35-42.",
    titulo: "Testing network properties of episodic memory",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7138212/",
    alcance: "Red posterior-medial, hipocampo, cortezas parahipocampal/retrosplenial/cingulada, precuneo y prefrontal."
  },
  {
    id: "chatham_badre_2015",
    tipo: "revision_modelo",
    cita: "Chatham CH, Badre D. Multiple gates on working memory. Current Opinion in Behavioral Sciences. 2015;1:23-31.",
    titulo: "Multiple gates on working memory",
    url: "https://pubmed.ncbi.nlm.nih.gov/26719851/",
    alcance: "Modelos de gating por circuitos cortico-ganglios basales para memoria de trabajo."
  },
  {
    id: "seger_spiering_2011",
    tipo: "revision",
    cita: "Seger CA, Spiering BJ. A critical review of habit learning and the basal ganglia. Frontiers in Systems Neuroscience. 2011;5:66.",
    titulo: "Habit learning and the basal ganglia",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3163829/",
    alcance: "Habitos y bucles corticostriatales con cautelas sobre simplificaciones."
  },
  {
    id: "maren_2013",
    tipo: "revision",
    cita: "Maren S, Phan KL, Liberzon I. The contextual brain: implications for fear conditioning, extinction and psychopathology. Nature Reviews Neuroscience. 2013;14:417-428. Recurso PMC consultado.",
    titulo: "Context, fear conditioning and extinction",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5072129/",
    alcance: "Interacciones hipocampo-prefrontal-amigdala en contexto, condicionamiento y extincion."
  },
  {
    id: "binder_desai_2011",
    tipo: "revision",
    cita: "Binder JR, Desai RH. The neurobiology of semantic memory. Trends in Cognitive Sciences. 2011;15(11):527-536.",
    titulo: "The neurobiology of semantic memory",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3350748/",
    alcance: "Memoria semantica distribuida en regiones temporales, parietales y de asociacion."
  },
  {
    id: "brandon_koenig_leutgeb_2014",
    tipo: "revision",
    cita: "Brandon MP, Koenig J, Leutgeb S. Parallel and convergent processing in grid cell, head-direction cell, boundary cell, and place cell networks. Wiley Interdisciplinary Reviews: Cognitive Science. 2014;5(2):207-219.",
    titulo: "Parallel and convergent processing in spatial cell networks",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3935336/",
    alcance: "Place, grid, head-direction y border cells como categorias funcionales de actividad."
  },
  {
    id: "bliss_lomo_1973",
    tipo: "articulo_original",
    cita: "Bliss TVP, Lomo T. Long-lasting potentiation of synaptic transmission in the dentate area of the anaesthetized rabbit. Journal of Physiology. 1973;232:331-356.",
    titulo: "Long-lasting potentiation in the dentate area",
    url: "https://pubmed.ncbi.nlm.nih.gov/4727084/",
    alcance: "Demostracion clasica de potenciacion duradera en la via perforante-giro dentado."
  },
  {
    id: "ncbi_nmda_plasticity",
    tipo: "capitulo_libro",
    cita: "NCBI Bookshelf. NMDA receptor-dependent synaptic plasticity, LTP and LTD.",
    titulo: "NMDA receptors and synaptic plasticity",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK5274/",
    alcance: "NMDA, calcio, AMPA y mecanismos de plasticidad; no generalizable a todas las sinapsis."
  },
  {
    id: "schultz_engelhardt_2014",
    tipo: "revision_anatomica",
    cita: "Schultz C, Engelhardt M. Anatomy of the hippocampal formation. Frontiers of Neurology and Neuroscience. 2014;34:6-17.",
    titulo: "Anatomy of the hippocampal formation",
    url: "https://doi.org/10.1159/000360925",
    alcance: "Componentes y conectividad general de la formacion hipocampal, con cautelas de extrapolacion entre especies."
  },
  {
    id: "insausti_2017",
    tipo: "revision_anatomica",
    cita: "Insausti R, Munoz-Lopez M, Insausti AM, Artacho-Perula E. The human periallocortex: layer pattern in presubiculum, parasubiculum and entorhinal cortex. Frontiers in Neuroanatomy. 2017;11:84.",
    titulo: "The human periallocortex",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5632821/",
    alcance: "Citoarquitectura humana de presubiculo, parasubiculo y corteza entorrinal."
  },
  {
    id: "witter_canto_2014",
    tipo: "revision",
    cita: "Witter MP et al. Architecture of spatial circuits in the hippocampal region. Philosophical Transactions of the Royal Society B. 2014;369:20120515.",
    titulo: "Architecture of spatial circuits in the hippocampal region",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3866439/",
    alcance: "Arquitectura de redes espaciales en hipocampo, presubiculo, parasubiculo y entorrinal."
  },
  {
    id: "witter_amaral_2021",
    tipo: "articulo_original",
    cita: "Witter MP, Amaral DG. The entorhinal cortex of the monkey: organization of projections from hippocampus, subiculum, presubiculum and parasubiculum. Journal of Comparative Neurology. 2021;529:828-852.",
    titulo: "Entorhinal projections from hippocampal and subicular regions",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8933866/",
    alcance: "Trazado anatomico en primate de proyecciones hipocampales y subiculares hacia corteza entorrinal."
  },
  {
    id: "nunez_buno_2021",
    tipo: "revision",
    cita: "Nunez A, Buno W. The theta rhythm of the hippocampus: from neuronal and circuit mechanisms to behavior. Frontiers in Cellular Neuroscience. 2021;15:649262.",
    titulo: "The theta rhythm of the hippocampus",
    url: "https://doi.org/10.3389/fncel.2021.649262",
    alcance: "Interaccion septum medial-banda diagonal-hipocampo y ritmos theta en conducta."
  },
  {
    id: "dolleman_reuniens_2019",
    tipo: "revision",
    cita: "Dolleman-van der Weel MJ et al. The nucleus reuniens of the thalamus sits at the nexus of a hippocampus and medial prefrontal cortex circuit enabling memory and behavior. Learning & Memory. 2019;26(7):191-205.",
    titulo: "Nucleus reuniens at the hippocampal-prefrontal nexus",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6581009/",
    alcance: "Anatomia y funciones propuestas del circuito mPFC-reuniens-hipocampo, principalmente en roedores."
  },
  {
    id: "pinault_2004",
    tipo: "revision_anatomica",
    cita: "Pinault D. The thalamic reticular nucleus: structure, function and concept. Brain Research Reviews. 2004;46(1):1-31.",
    titulo: "The thalamic reticular nucleus",
    url: "https://doi.org/10.1016/j.brainresrev.2004.04.008",
    alcance: "Organizacion GABAergica y conexiones del nucleo reticular talamico."
  },
  {
    id: "vogt_2016",
    tipo: "revision_anatomica",
    cita: "Vogt BA. Midcingulate cortex: structure, connections, homologies, functions and diseases. Journal of Chemical Neuroanatomy. 2016;74:28-46.",
    titulo: "Midcingulate cortex",
    url: "https://doi.org/10.1016/j.jchemneu.2016.01.010",
    alcance: "Distincion anatomica entre corteza cingulada anterior, media y posterior."
  },
  {
    id: "rugg_king_2018",
    tipo: "revision",
    cita: "Rugg MD, King DR. Ventral lateral parietal cortex and episodic memory retrieval. Cortex. 2018;107:238-250.",
    titulo: "Ventral lateral parietal cortex and episodic memory retrieval",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5785567/",
    alcance: "Giro angular y corteza parietal ventral en recuperacion episodica, con cautelas funcionales."
  },
  {
    id: "sah_2003",
    tipo: "revision_anatomica",
    cita: "Sah P, Faber ESL, Lopez De Armentia M, Power J. The amygdaloid complex: anatomy and physiology. Physiological Reviews. 2003;83(3):803-834.",
    titulo: "The amygdaloid complex",
    url: "https://pubmed.ncbi.nlm.nih.gov/12843409/",
    alcance: "Nucleos amigdalinos, microcircuitos y conexiones aferentes y eferentes."
  },
  {
    id: "lanciego_2012",
    tipo: "revision_anatomica",
    cita: "Lanciego JL, Luquin N, Obeso JA. Functional neuroanatomy of the basal ganglia. Cold Spring Harbor Perspectives in Medicine. 2012;2:a009621.",
    titulo: "Functional neuroanatomy of the basal ganglia",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3543080/",
    alcance: "Nucleos, vias directa e indirecta y territorios motores, asociativos y limbicos de ganglios basales."
  },
  {
    id: "hikosaka_2010",
    tipo: "revision",
    cita: "Hikosaka O. The habenula: from stress evasion to value-based decision-making. Nature Reviews Neuroscience. 2010;11:503-513.",
    titulo: "The habenula",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3447364/",
    alcance: "Habenula lateral, resultados adversos y modulacion de sistemas monoaminergicos."
  },
  {
    id: "jhou_2009",
    tipo: "articulo_original",
    cita: "Jhou TC et al. The rostromedial tegmental nucleus, a GABAergic afferent to midbrain dopamine neurons, encodes aversive stimuli and inhibits motor responses. Neuron. 2009;61:786-800.",
    titulo: "The rostromedial tegmental nucleus",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2841475/",
    alcance: "Evidencia experimental en roedor para el circuito habenula-RMTg-neuronas dopaminergicas."
  },
  {
    id: "hornung_2003",
    tipo: "revision_anatomica",
    cita: "Hornung JP. The human raphe nuclei and the serotonergic system. Journal of Chemical Neuroanatomy. 2003;26(4):331-343.",
    titulo: "The human raphe nuclei and the serotonergic system",
    url: "https://pubmed.ncbi.nlm.nih.gov/14729135/",
    alcance: "Organizacion humana de nucleos del rafe y proyecciones serotoninergicas ascendentes."
  },
  {
    id: "poe_2020",
    tipo: "revision",
    cita: "Poe GR et al. Locus coeruleus: a new look at the blue spot. Nature Reviews Neuroscience. 2020;21:644-659.",
    titulo: "Locus coeruleus: a new look at the blue spot",
    url: "https://pubmed.ncbi.nlm.nih.gov/32943779/",
    alcance: "Organizacion y funciones moduladoras del locus coeruleus en atencion, aprendizaje, memoria y estados cerebrales."
  },
  {
    id: "haas_2008",
    tipo: "revision",
    cita: "Haas HL, Sergeeva OA, Selbach O. Histamine in the nervous system. Physiological Reviews. 2008;88(3):1183-1241.",
    titulo: "Histamine in the nervous system",
    url: "https://pubmed.ncbi.nlm.nih.gov/18626069/",
    alcance: "Nucleo tuberomamilar y proyecciones histaminergicas difusas."
  },
  {
    id: "seeley_2007",
    tipo: "articulo_original_neuroimagen",
    cita: "Seeley WW et al. Dissociable intrinsic connectivity networks for salience processing and executive control. Journal of Neuroscience. 2007;27(9):2349-2356.",
    titulo: "Dissociable salience and executive-control networks",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2680293/",
    alcance: "Conectividad funcional intrinseca de redes de saliencia y control ejecutivo; no demuestra tractos anatomicos."
  },
  {
    id: "menon_2011",
    tipo: "revision_modelo",
    cita: "Menon V. Large-scale brain networks and psychopathology: a unifying triple network model. Trends in Cognitive Sciences. 2011;15(10):483-506.",
    titulo: "A unifying triple network model",
    url: "https://doi.org/10.1016/j.tics.2011.08.003",
    alcance: "Marco funcional de redes de modo predeterminado, ejecutiva y saliencia; no equivale a conectividad anatomica."
  },
  {
    id: "menon_2023",
    tipo: "revision",
    cita: "Menon V. 20 years of the default mode network: a review and synthesis. Neuron. 2023;111(16):2469-2487.",
    titulo: "20 years of the default mode network",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10524518/",
    alcance: "Red de modo predeterminado y sus asociaciones con memoria, semantica y cognicion interna."
  },
  {
    id: "apps_garwicz_2005",
    tipo: "revision_anatomica",
    cita: "Apps R, Garwicz M. Anatomical and physiological foundations of cerebellar information processing. Nature Reviews Neuroscience. 2005;6(4):297-311.",
    titulo: "Foundations of cerebellar information processing",
    url: "https://doi.org/10.1038/nrn1646",
    alcance: "Microcomplejos cerebelosos, fibras musgosas y trepadoras y nucleos profundos."
  },
  {
    id: "ebner_2015",
    tipo: "revision",
    cita: "Popa LS, Streng ML, Hewitt AL, Ebner TJ. The errors of our ways: understanding error representations in cerebellar-dependent motor learning. Cerebellum. 2016;15:93-105.",
    titulo: "Error representations in cerebellar-dependent motor learning",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4691440/",
    alcance: "Representaciones de error y aprendizaje motor cerebeloso como marco funcional, no localizacion exclusiva."
  },
  {
    id: "von_der_heide_2013",
    tipo: "revision_anatomica",
    cita: "von der Heide RJ, Skipper LM, Klobusicky E, Olson IR. Dissecting the uncinate fasciculus: disorders, controversies and a hypothesis. Brain. 2013;136:1692-1707.",
    titulo: "Dissecting the uncinate fasciculus",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3673595/",
    alcance: "Anatomia frontotemporal del fasciculo uncinado y cautelas sobre sus funciones propuestas."
  },
  {
    id: "kamali_2016",
    tipo: "articulo_original_neuroimagen",
    cita: "Kamali A et al. Revealing the ventral amygdalofugal pathway of the human limbic system using high spatial resolution diffusion tensor tractography. Brain Structure and Function. 2016;221:3561-3569.",
    titulo: "The human ventral amygdalofugal pathway",
    url: "https://pubmed.ncbi.nlm.nih.gov/26454651/",
    alcance: "Tractografia humana de via amigdalofugal ventral, comisura anterior y relaciones con estria terminal; evidencia limitada por el metodo."
  },
  {
    id: "catani_thiebaut_2012",
    tipo: "atlas_neuroanatomico",
    cita: "Catani M, Thiebaut de Schotten M. Atlas of Human Brain Connections. Oxford University Press; 2012.",
    titulo: "Atlas of Human Brain Connections",
    url: "https://academic.oup.com/book/24732",
    alcance: "Atlas de diseccion y tractografia de fasciculos asociativos humanos; respalda representaciones agregadas del arqueado, longitudinal superior y longitudinal inferior."
  }
]);

export const BRAIN_REFERENCE_BY_ID = new Map(BRAIN_REFERENCES.map((reference) => [reference.id, reference]));
