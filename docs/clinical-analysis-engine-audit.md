# Auditoría y arquitectura del Motor Analítico Central

## Diagrama

```text
Módulo de patrones (lazy, admin)
        |
        v
Pattern Search Adapter
        |
        v
analizarTextoClinico(texto, opciones)
        |
        +--> normalizeText
        +--> tokenizeText
        +--> classifyToken
        +--> applyLexicalFilters
        +--> buildPattern
        +--> createAnalysisTrace
        |
        v
Resultado trazable: original -> normalizado -> tokens -> categorías -> filtros -> firma
```

## Auditoría de funciones relacionadas

### Patrones y léxico

| Área | Funciones | Ubicación | Estado |
|---|---|---|---|
| Normalización de patrones | `normalize`, `tokens`, `collectTexts`, `metadata`, `matches` | `functions/patternDiscoveryHandler.js` | Permanece en backend; procesa lectura administrativa y no se duplica en UI |
| Conteo de patrones | `add`, `discoverTextPatterns` | `functions/patternDiscoveryHandler.js` | Permanece en backend; no se cambia el algoritmo |
| Preferencias y orquestación | `leerUmbral`, `guardarUmbral`, `leerPreferencia`, `guardarPreferencia`, `inicializarMotorDescubrimientoPatrones` | `js/admin/patternDiscovery/patternDiscoveryController.js` | Permanece como interfaz/orquestación |
| Filtro de resultados | `filterPatterns` | `js/core/clinical-analysis-engine/patterns/filterPatterns.js` | Migrado al núcleo |
| Firma léxica | `buildLexicalSignature` | `js/admin/patternDiscovery/language/lexicalSignature.js` | Compatibilidad; fuente real en núcleo |
| Conectores y funcionales | `isFunctionWordPattern` | `js/admin/patternDiscovery/patternFunctionWords.js` | Compatibilidad; clasificación real en núcleo |
| Renderizado | `renderizarPatrones` | `js/admin/patternDiscovery/patternRenderer.js` | Permanece en UI; consume adaptador |

### Texto clínico, SOFÍA y afirmaciones

| Funciones | Archivo | Estado |
|---|---|---|
| `normalizarComparacion`, `normalizarTextoClinicoConservador`, `aplicarComandosDeVozSeguros` | `js/services/clinicalTextNormalizer.js` | Permanece; tiene semántica de dictado y normalización conservadora distinta |
| `segmentarConversacionClinica`, `segmentarTranscripcion`, `extraerAfirmacionesClinicas`, `extraerMedicamentos` | `js/services/clinicalPipeline.js` | Permanece; migración futura requiere pruebas de regresión de SOFÍA |
| `extraerHallazgosMentales`, `detectarContradicciones`, `detectarRiesgosEstructurados`, `generarSecciones`, `ejecutarPipelineClinico` | `js/services/clinicalPipeline.js` | Permanece; no se modifica en esta fase |

### Línea de tiempo y temporalidad

| Funciones | Archivo | Estado |
|---|---|---|
| `normalizarTextoDeteccion`, `limpiarHTMLConFechas`, `extraerTextoClinicoFuente` | `js/lineaTiempo/lineaTiempoDeteccionEventos.js` | Permanece; no se migra sin comparar eventos existentes |
| `segmentarClausulasClinicas`, `detectarExpresionesTemporalesLocales`, `resolverFechaTemporal` | `js/lineaTiempo/lineaTiempoDeteccionEventos.js` | Permanece; temporalidad propia del dominio |
| `extraerEventosDesdeFragmentos`, `crearEventosEstructuradosDesdeFuente`, `normalizarCandidatoEvento`, `detectarEventosEnFuentes` | `js/lineaTiempo/lineaTiempoDeteccionEventos.js` | Permanece; integración futura mediante adaptador |
| `ordenarEventosPorFecha`, `agruparEventosPorFecha`, `normalizarEvento`, `agruparEventosParaEscalaVisible` | `js/lineaTiempo/lineaTiempoUtils.js` | Permanece; funciones de presentación y ordenamiento |

### Eventos locales del paciente

`js/lineaTiempo/lineaTiempoPaciente.js` contiene funciones de carga, renderizado, filtros y persistencia de sugerencias (`cargarLineaTiempo`, `extraerSugerenciasLocales`, `cargarFuentesClinicasDeteccion127`, `persistirSugerenciasDetectadas127`, `inicializarDetectorEventosClinicos`, `inicializarLineaTiempoPaciente`). Permanecen sin cambios.

## Diccionarios centralizados

Se crearon archivos independientes en `js/core/clinical-analysis-engine/dictionaries/` para conectores, preposiciones protegidas, artículos, pronombres, negaciones, sinónimos, términos clínicos y expresiones temporales. Los tres últimos diccionarios vacíos son preparatorios; no agregan semántica nueva.

## Migración realizada

- Se creó la API `analizarTextoClinico(texto, opciones)`.
- La búsqueda de patrones usa `patternSearchAdapter.js`, que consume únicamente la API central.
- Normalización, tokenización, clasificación, firma léxica, filtro y traza están en el núcleo.
- Los archivos lingüísticos antiguos de patrones son adaptadores de compatibilidad y ya no son la fuente de verdad.
- No se migró todavía SOFÍA, Historia Clínica ni Línea de tiempo para evitar cambiar resultados.

## Compatibilidad y trazabilidad

El resultado expone `originalText`, `normalizedText`, `tokens`, `tokenCategories`, `filtersApplied`, `lexicalSignature` y `trace`. No se modifica el texto clínico almacenado ni se añaden consultas. El motor se descarga únicamente junto con el módulo de patrones lazy.
