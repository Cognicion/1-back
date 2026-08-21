# PatientPatternProfile: motor clínico por paciente

## Propósito

`PatientPatternProfile` es la única fuente de verdad para los patrones clínicos longitudinales del paciente seleccionado. El Detector de Patrones y SOFÍA consumen el mismo perfil; ninguno ejecuta un análisis alterno.

```text
expediente autorizado
  → buildPatientClinicalContext
  → extractClinicalVariables
  → buildPatientPatternProfile
  → persistPatientPatternProfile
  → PatientPatternProfile
      ├─ detector-patrones.html
      └─ SOFÍA / herramientas del orquestador
```

## Seguridad y separación de datos

1. Las funciones invocables validan autenticación, rol clínico y relación médico–paciente mediante `assertAuthorizedPatientClinician`.
2. El perfil identificable se almacena únicamente bajo `usuarios/{patientId}/clinicalPatternProfiles/current` y sus subcolecciones protegidas.
3. La página no consulta esa ruta directamente; usa Cloud Functions.
4. Las colecciones globales `clinicalAnalytics*` continúan recibiendo únicamente derivados desidentificados mediante el flujo analítico existente.
5. Los extractos clínicos, IDs de fuente y correcciones médicas no se copian a la base analítica global.
6. SOFÍA recibe un contexto del paciente activo sin identidad directa. Los fragmentos se limpian de identificadores conocidos antes de enviarse al modelo.
7. Un rol administrativo sin rol clínico y sin asignación al paciente no puede abrir perfiles individuales; conserva únicamente el acceso a conocimiento agregado desidentificado.

## Capas del perfil

El perfil conserva explícitamente:

- evidencia documental: fragmento, fuente, fecha del documento, tiempo clínico estimado, polaridad, regla y confianza;
- patrón estructurado: estado actual derivado, categoría y serie completa de observaciones;
- instrumento: cada BSS como evento independiente, con reactivos, cobertura, faltantes y parámetros;
- variable matemática: valor bruto, normalizado, cobertura, confianza y observación de origen;
- snapshots: estados multidimensionales parcialmente observados; lo desconocido permanece `null`;
- auditoría: versiones de algoritmo, extractor, esquema BSS, fecha y revisión clínica.

El estado actual nunca reemplaza la serie histórica. Las observaciones se escriben con IDs deterministas y se combinan de forma idempotente. Las correcciones médicas prevalecen sin borrar la inferencia original.

## BSS

El adaptador `suicideIdeationBeckInferenceService` solo normaliza reactivos BSS explícitos ya almacenados. No completa reactivos desde texto libre ni mediante inferencia especulativa.

- 19/19 reactivos válidos: `scoreStatus = "complete"`, puntaje bruto y `BSS / 38`.
- 1–18 reactivos: `scoreStatus = "partial"`, `rawScore = null`, suma parcial separada y lista de faltantes.
- 0 reactivos: `scoreStatus = "not_calculable"`.

`normalizedScore` representa el puntaje del instrumento dividido entre 38. No es probabilidad de suicidio ni autoriza decisiones automáticas.

## Tiempo clínico

Cada evidencia diferencia `documentDate` de `estimatedClinicalTime`. Expresiones relativas simples, por ejemplo “hace tres días”, se normalizan de forma determinista. Cuando no puede estimarse el fenómeno, `estimatedClinicalTime` queda en `null` y `temporalPrecision` en `unknown`.

Las ventanas disponibles son `current`, `last_24h`, `last_72h`, `last_7d`, `last_30d` e `historical`. No se imputa cero a una dimensión ausente.

## Actualización

El trigger clínico marca el perfil como `outdated`, registra las claves potencialmente afectadas y actualiza únicamente esas series dentro del paciente cuyo registro cambió. Las series no relacionadas se conservan sin recalcular. El resultado se persiste con IDs deterministas, por lo que procesar dos veces el mismo contenido no duplica observaciones.

La extracción todavía relee el contexto longitudinal de ese paciente para resolver contradicciones y estado actual. No reconstruye la cohorte ni las matrices globales. Una optimización futura podrá leer solamente documentos nuevos sin cambiar el contrato de `PatientPatternProfile`.

## Integración con SOFÍA

El orquestador utiliza `getOrBuildPatientPatternProfile` y expone herramientas de lectura para:

- perfil completo del paciente activo;
- evidencia de un patrón;
- trayectoria de un patrón o BSS;
- resultados de instrumentos;
- navegación a la sección visual del detector.

Las instrucciones obligan a SOFÍA a explicar únicamente evidencia almacenada, distinguir confianza semántica de riesgo y no presentar una BSS parcial como resultado definitivo.

## Límites deliberados

- No hay predicción diagnóstica, causalidad, recomendación farmacológica ni decisión sobre hospitalización/alta.
- No se asignan todavía etiquetas de trayectoria como ascendente o recurrente: la estructura existe, pero no hay reglas arbitrarias activas.
- “Ver fuente” emite un evento con la referencia protegida; la apertura puntual depende de que el visor clínico de origen implemente ese evento.
- El motor no reproduce contenido ni claves propietarias de los reactivos BSS; solo conserva valores y evidencia ya documentados por una fuente autorizada.
