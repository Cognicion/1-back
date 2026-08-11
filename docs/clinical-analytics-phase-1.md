# Motor de Descubrimiento de Patrones: fase analítica clínica 1

## Flujo implementado

```text
expediente clínico
  → callable analyzePatientClinicalContext
  → autorización backend médico-paciente
  → clinicalAnalytics.contextBuilder
  → clinicalAnalytics.variableExtractor
  → clinicalAnalytics.timelineAnalyzer
  → clinicalAnalytics.patternAnalyzer
  → clinicalAnalytics.probabilityEngine
  → resultado individual de SOFÍA
  → desidentificación SHA-256 / analyticsPatientId
  → colecciones analíticas globales
  → callable getClinicalKnowledgeAdmin
```

La pantalla individual se muestra únicamente en `sofia.html` después de seleccionar un paciente autorizado. El panel administrativo se importa bajo demanda y solo puede consultar resultados agregados mediante una callable que vuelve a validar el rol admin.

## Contratos y versiones

Cada variable incluye `variableId`, `canonicalName`, `domain`, `datatype`, `statisticalType`, `unit`, `source`, `observedAt`, `value`, `confidence`, `provenance` y `extractorVersion`.

Los resultados globales conservan `schemaVersion`, `extractorVersion`, `patternEngineVersion` y `probabilityEngineVersion`. La fuente se registra como `cognicion_empirical`; las referencias externas permanecen en `clinicalAnalyticsEvidence` y no se mezclan automáticamente con las probabilidades empíricas.

## Probabilidad

La primera versión calcula proporciones empíricas y probabilidad condicional observacional. Guarda numerador, denominador, muestra, cohorte, periodo, intervalo Wilson al 95%, método y estado de evidencia. Con menos de 10 observaciones o menos de 3 eventos devuelve `insufficient_evidence` y la interfaz muestra “Evidencia insuficiente”. No se emiten conclusiones causales ni recomendaciones terapéuticas.

## Privacidad

El dataset global no guarda `patientId`, nombres, teléfonos, correo, domicilio, CURP, RFC, expediente visible, fotografías ni texto clínico bruto. El vínculo analítico usa `analyticsPatientId`, un hash unidireccional. Los UID de médicos tampoco se escriben: los trabajos guardan únicamente `actorAnalyticsId` hash cuando aplica.

El resultado individual puede incluir el `patientId` real porque se entrega únicamente después de la validación backend de la sesión médico-paciente. El administrador recibe solo variables, conteos, patrones, relaciones, probabilidades y referencias.

## Actualización incremental

`clinicalAnalyticsOnRecordWrite` observa registros bajo `usuarios/{patientId}/{collectionId}/{recordId}`. Reprocesa únicamente el paciente afectado y usa `clinicalAnalyticsRuns` para evitar duplicados por evento. Los documentos analíticos no están bajo ese patrón de trigger.

## Evidencia metodológica registrada

- TRIPOD+AI: reporte transparente de futuros modelos predictivos.
- PROBAST+AI: riesgo de sesgo y aplicabilidad.
- NICE ESF: estándares de evidencia para tecnología digital.
- NICE RWE: calidad y uso de datos del mundo real.
- FDA Clinical Decision Support Software: referencia regulatoria/metodológica.

Estas referencias orientan el desarrollo y no constituyen validación del producto.

## Límites de esta fase

No se implementan predicción diagnóstica, recomendaciones farmacológicas, pronóstico autónomo, causalidad, embeddings, redes neuronales, clasificación automática de riesgo suicida ni decisiones clínicas sin revisión médica. La pantalla existente de SOFÍA conserva sus módulos previos; el nuevo panel es una capa analítica separada.
