# Flujo de datos del programa TDAH

- **Documento de arquitectura:** 1.2.0
- **Esquema de persistencia descrito:** 1.0.0
- **Fuente de verdad:** registros canónicos del programa y resultados bajo `usuarios/{patientId}`
- **Complemento clínico:** [adhd-cognitive-rehabilitation.md](./adhd-cognitive-rehabilitation.md)

## 1. Principios

1. El ensayo crudo, la métrica derivada, el perfil, el programa y la presentación son capas distintas.
2. Firestore es la fuente remota canónica; IndexedDB es respaldo temporal pendiente de sincronización, no una segunda fuente clínica definitiva.
3. Los resultados canónicos se referencian por identificadores estables; métricas y telemetría no se copian dentro de sesiones, evaluaciones, metas o retos.
4. Cada transformación conserva versión, procedencia, calidad y referencias.
5. La UI y SOFÍA consumen derivados; no reinterpretan ni reescriben ensayos crudos.
6. Un dato ausente permanece ausente. No se transforma en cero, normalidad o ausencia de dificultad.
7. La IA generativa no decide diagnóstico, selección de tratamiento ni configuración canónica del programa.

## 2. Diagrama textual

```text
FUENTES
  ├─ tareas existentes: CPT-X, Go/No-Go, N-Back, Stroop, escucha dicótica
  ├─ tareas nativas: Stop-Signal, cambio de reglas, temporal, rutas
  ├─ contexto: sueño, medicación, fatiga, motivación, dispositivo, interrupciones
  └─ metas/dificultades funcionales + valoración paciente/cuidador/docente/clínico
          │
          ▼
NORMALIZACIÓN Y MÉTRICAS
  adaptador/runner → contrato común → métricas por tarea → QC/validez
          │                                  │
          │                                  └─ telemetría opcional sanitizada
          ▼
PERSISTENCIA CANÓNICA
  resumen rehabilitacionResultados/{resultId}
  + telemetryBlocks/{blockId}
  + referencias a evaluación/sesión/meta/reto
  + evento append-only en auditoria
          │
          ▼
PERFIL T0/T1/T2/T3
  métricas válidas por dominio + objetivos funcionales
  → señal interna de selección, no normativa
          │
          ▼
PROGRAMA
  reglas explícitas → dominios priorizados → sesiones/bloques
  → revisión/edición clínica auditada → ejecución/adaptación
          │
          ▼
UI
  métricas + calidad + contexto + plan + adherencia + retos
  (sin convertir telemetría cruda en diagnóstico)
          │
          ├───────────────────────────┐
          ▼                           ▼
LONGITUDINAL                     SOFÍA
  cambio intraindividual          resumen derivado de solo lectura
  + práctica/contexto/versiones    sin ensayos ni identificadores
          │                           sin autoridad clínica/canónica
          ▼
EXPORTACIÓN DE INVESTIGACIÓN
  JSON/CSV seudonimizado, sin identificadores/rutas/texto libre por defecto
```

## 3. Orígenes y contrato común

### 3.1 Tareas existentes

Las páginas existentes se abren con una URL deliberadamente mínima:

```text
adhd=1, embed=1, adhdTask={taskId}
```

La URL no contiene `patientId`, `programId`, `sessionId`, `evaluationId`, `goalId`, `challengeId`, `attemptId`, semilla ni token. El `bridgeToken` se entrega una sola vez mediante el nombre de bootstrap del `iframe`; la página lo captura y limpia `window.name`. Después del mensaje `ready`, el host envía por `postMessage` de mismo origen un sobre `config` versionado con el contexto necesario. Los mensajes se aceptan solo si coinciden origen, ventana, canal, versión y token; el `iframe` usa política `no-referrer`. Así se evita colocar identificadores clínicos en historial, consulta o referente HTTP.

El contexto de ejecución que llega por el sobre `config` contiene, según corresponda:

```text
taskId, taskVersion, programId, sessionId, evaluationId,
goalId, challengeId, attemptId, mode, randomSeed, configuration
```

El adaptador transforma las formas históricas de cada tarea a un sobre común con:

```text
taskId
taskVersion
metricsVersion
status
valid / quality
metrics
context
telemetry { trials, events, sequence... }  // solo si se habilita
```

### 3.2 Tareas nativas

El runner nativo genera la secuencia con semilla/configuración versionada, registra eventos y entrega el mismo contrato. La semilla o forma se conserva para reconocer si una reevaluación repitió configuración o utilizó una alternativa.

### 3.3 Contexto y transferencia funcional

El contexto de evaluación conserva únicamente campos permitidos, entre ellos sueño, medicación, última dosis, cambios de tratamiento, fatiga, motivación, distractibilidad, modalidad de entrada, dispositivo, navegador, refresco, pérdidas de foco/visibilidad e interrupciones.

Las metas y retos funcionales mantienen acción, contexto, frecuencia, meta, fecha de revisión, dominio, fuente de valoración y progreso. El texto libre se limita y no entra por defecto en exportaciones de investigación.

## 4. Transformación a métricas

La cadena por resultado es:

```text
ensayos puntuables
  → filtros de práctica/validez
  → conteos y TR válidos
  → fórmula específica de tarea
  → reglas QC y warnings
  → summary.metrics
```

Las fórmulas de d-prime, CV, SSRT por integración, costos de interferencia/cambio, estimación temporal y planificación están especificadas en [adhd-cognitive-rehabilitation.md](./adhd-cognitive-rehabilitation.md#7-métricas-y-fórmulas).

Invariantes:

- `taskVersion` identifica reglas/estímulos de la tarea;
- `metricsVersion` identifica el algoritmo de cálculo;
- `valid=false` o `quality.valid=false` impide usar el resultado como evidencia válida del perfil;
- `completed_with_incomplete_data` conserva el intento pero expone faltantes;
- los ensayos parciales de un bloque interrumpido se descartan y el bloque se reinicia;
- la velocidad nunca se interpreta aislada de precisión y anticipaciones.

## 5. Esquema Firestore

### 5.1 Jerarquía canónica

```text
usuarios/{patientId}
│
├─ rehabilitacionProgramas/{programId}
│  ├─ evaluaciones/{evaluationId}
│  ├─ perfiles/{profileId}
│  ├─ planes/{planId}
│  ├─ metas/{goalId}
│  ├─ sesiones/{sessionId}
│  ├─ retos/{challengeId}
│  └─ auditoria/{auditId}
│
└─ rehabilitacionResultados/{resultId}
   └─ telemetryBlocks/{blockId}
```

`patientId` pertenece al registro clínico canónico y puede ser identificable dentro del sistema. Nunca se incluye en una exportación de investigación. `programId`, `resultId` y los identificadores de entidades se validan como IDs Firestore sin `/`, con máximo de 160 caracteres.

### 5.2 Documento raíz del programa

Campos estructurales esperados:

```js
{
  programId,
  protocolId: "cognicion-tdah-multicomponente",
  protocolVersion: "1.1.0",
  persistenceSchemaVersion: "1.0.0",
  status,                         // draft, draft_for_clinician_review, archived...
  modality,
  configuration,
  sourceProfile,
  programEngineVersion,
  generatedBy: "explicit_rules",
  generativeAiUsed: false,
  clinicianControl,
  lastResultId,
  createdAtIso,
  createdAt, updatedAt, lastActivityAt
}
```

El documento puede contener el plan resumido vigente, pero resultados y entidades longitudinales viven en sus colecciones propias.

### 5.3 Evaluaciones

Ruta: `rehabilitacionProgramas/{programId}/evaluaciones/{evaluationId}`.

```js
{
  id, programId,
  protocolId, protocolVersion, persistenceSchemaVersion,
  phase: "T0" | "T1" | "T2" | "T3",
  assessmentContext,
  formConfiguration,
  taskResultIds: [],
  status,
  updatedAt
}
```

La evaluación agrupa referencias; no duplica telemetría ensayo por ensayo.

### 5.4 Perfiles

Ruta: `.../perfiles/{profileId}`.

```js
{
  id, programId, profileId, assessmentId, assessmentPhase,
  profileEngineVersion,
  normative: false,
  scoreType: "raw_and_intraindividual",
  selectionFormula,
  domains: [{
    id, status, sourceTasks, validTasks, measures,
    linkedGoals, observedDifficultySignal, selectionSignal, caveats
  }],
  quality,
  context,
  interpretationNotices,
  protocolId, protocolVersion, persistenceSchemaVersion,
  updatedAt
}
```

El perfil es derivado y reproducible desde resultados, objetivos y versión de motor; no reemplaza esas fuentes.

### 5.5 Planes

Ruta: `.../planes/{planId}`.

```js
{
  id, programId,
  programEngineVersion,
  sourceProfile,
  configuration,
  prioritizedDomains,
  sessions,
  reassessment,
  validation,
  manualOverride,
  auditTrail,
  protocolId, protocolVersion, persistenceSchemaVersion,
  updatedAt
}
```

Una edición clínica no sobrescribe silenciosamente el origen: agrega entrada a `auditTrail` con tipo, motivo, rol, fecha y fuente.

### 5.6 Metas y retos

Rutas: `.../metas/{goalId}` y `.../retos/{challengeId}`.

```js
// meta
{
  id, programId, action, context, frequency, target, reviewDate,
  domains, reviewSource, progress: [{ at, achievement, source, note }],
  resultIds, protocolId, protocolVersion, persistenceSchemaVersion, updatedAt
}

// reto
{
  id, programId, templateId, sessionNumber, label, domains, ageMode,
  dueDate, status: "pending" | "completed" | "partial" | "not_completed",
  linkedGoalId, linkedGoalIds, goalBinding, applicationContext,
  ratings, sourceReports, completedAt, resultIds,
  protocolId, protocolVersion, persistenceSchemaVersion, updatedAt
}
```

`achievement` y valoraciones se limitan a 0–1, pero son registros estructurados de cumplimiento/avance, no escalas normativas.

El reto nace con `status="pending"`. El bloque de sesión registra únicamente su asignación (`status="assigned"`, `outcomePending=true`) y no exige simular el desenlace para cerrar la sesión. En un seguimiento posterior e independiente se persiste `completed`, `partial` o `not_completed`, junto con fuente y fecha; solo entonces se actualiza el progreso de la meta vinculada. Asignación, cierre de sesión y desenlace funcional son estados separados.

### 5.7 Sesiones

Ruta: `.../sesiones/{sessionId}`.

```js
{
  id, programId, sessionId,
  sessionEngineVersion, schemaVersion,
  protocolVersion, programEngineVersion,
  plannedSessionNumber,
  status: "not_started" | "in_progress" | "paused" |
          "completed" | "completed_with_incomplete_data" | "abandoned",
  context,
  blocks: [{
    id, kind, taskId, taskVersion, moduleId, challengeId, required, status,
    attempts,
    result: {
      resultId, taskId, taskVersion, metricsVersion, status, valid,
      quality: { valid, flags },
      canonicalSource: "usuarios/{patientId}/rehabilitacionResultados/{resultId}",
      snapshotContainsMetrics: false,
      completedAtIso
    },
    resultVersion, quality, mustRestart, interruptionCount
  }],
  transitionLog,
  dataQuality,
  resultIds,
  startedAt, pausedAt, completedAt, updatedAt
}
```

El resultado de una tarea dentro de la sesión es una referencia compacta y **no contiene métricas**. `rehabilitacionResultados/{resultId}` es el Single Source of Truth (SSoT) de métricas y calidad completa; la sesión conserva únicamente la identidad, versiones, estado y calidad mínima necesarios para integridad y renderizado. Tampoco incluye ensayos, puzzles, secuencias o eventos. El motor de estados impide más de un bloque activo, obliga a ejecutar los componentes en el orden declarativo y evita completar una sesión con bloques obligatorios pendientes. Solo se guarda una pausa dentro de tarea en un límite seguro.

### 5.8 Resultado canónico

Ruta: `usuarios/{patientId}/rehabilitacionResultados/{resultId}`.

```js
{
  idResultado: resultId,
  resultId,
  programId,
  taskId,
  activityId,
  taskVersion,
  metricsVersion,
  metrics,
  results: metrics,              // compatibilidad con consumidores existentes
  status,
  valid,
  quality,
  references: { sessionId, evaluationId, goalId, challengeId },
  telemetry: { enabled, blockCount, recordCount },
  completedAtIso,
  protocolId, protocolVersion, persistenceSchemaVersion,
  createdAt, updatedAt
}
```

El resumen omite `trialHistory`, `trials`, `sequence`, `events`, `researchEvents`, respuestas detalladas e información extensa del navegador.

### 5.9 Bloques de telemetría

Ruta: `.../rehabilitacionResultados/{resultId}/telemetryBlocks/{blockId}`.

```js
{
  resultId, programId, taskId,
  channel,                       // trials, events, sequence...
  blockIndex, totalBlocks,
  recordCount,
  records: [],
  protocolId, protocolVersion, persistenceSchemaVersion,
  createdAt
}
```

Cada bloque contiene como máximo 100 registros. El máximo por resultado es 50 bloques/5,000 registros. Los arreglos voluminosos de telemetría se excluyen de indexación en `firestore.indexes.json`.

### 5.10 Auditoría

Ruta: `.../auditoria/{auditId}`.

```js
{
  auditId, programId,
  eventType,
  resultId, taskId,
  occurredAtIso,
  protocolId, protocolVersion, persistenceSchemaVersion,
  createdAt
}
```

La auditoría es append-only en reglas Firestore: paciente/profesional autorizado/administrador pueden crear según sus permisos, pero ninguna actualización o eliminación está permitida.

## 6. Escritura atómica de un resultado

`saveTaskResult` prepara primero el resumen y los bloques sanitizados. Un único batch remoto:

1. crea/actualiza el resultado canónico;
2. escribe sus bloques de telemetría;
3. actualiza `lastActivityAt` y `lastResultId` del programa;
4. agrega `resultId` a sesión, evaluación, meta y reto referenciados;
5. agrega el evento `task_result_saved` a auditoría.

Esto evita un resultado “huérfano” por escrituras remotas parciales. Solo un fallo transitorio de red conserva una operación local con `pendingSync=true`; no se declara éxito remoto. Los errores no transitorios, incluidos autenticación, permisos o argumentos inválidos, se propagan y no se encolan como si fueran trabajo offline autorizado.

El orquestador debe transmitir siempre `telemetryEnabled` desde la configuración del programa. La ausencia de esa decisión se trata como telemetría desactivada; no se debe depender de un valor implícito de la capa de persistencia.

## 7. Borradores locales y recuperación

Las claves de IndexedDB incluyen:

```text
adhd:{persistenceSchemaVersion}:{patientId}:{programId}:{kind}:{id}
```

El borrador guarda versión, identificador, payload sanitizado, operación remota reproducible y `pendingSince`. La carga enumera el prefijo completo del programa y fusiona programa, evaluaciones, perfiles, planes, metas, sesiones, retos, resultados y auditoría locales con Firestore. Una sincronización exitosa elimina el borrador correspondiente.

Los fallos transitorios de red se reintentan automáticamente con el evento `online` o mediante `syncPendingAdhdWrites`. El reintento es idempotente, usa exclusión mutua y no sobrescribe un documento remoto más reciente. Un error `permission-denied`/`unauthenticated` se propaga y retira la operación de la cola: nunca se presenta como guardado offline autorizado.

IndexedDB no debe usarse para comparar pacientes, alimentar SOFÍA como registro canónico ni ocultar al usuario que la sincronización está pendiente.

## 8. Perfil y generación del programa

```text
resultados válidos de T0
  + dificultades/metas funcionales
  → medidas por dominio
  → señal de dificultad observada
  → señal de selección = 0.60 vínculo funcional + 0.40 señal observada
  → perfil no normativo
  → reglas explícitas de priorización
  → plan en borrador para revisión clínica
```

Un dominio con datos incompletos se marca `partial` o `insufficient_data`; no se marca conservado. El generador requiere edad compatible y perfil basal. Antes de los 6 años devuelve programa bloqueado.

Cada sesión generada debe contener activación, al menos dos tareas cognitivas distintas, metacognición, transferencia funcional, autoevaluación y feedback. La adaptación posterior modifica una dimensión por vez y nunca reescribe el resultado basal.

## 9. Consumo por la UI

La UI debe renderizar:

- estado y versión del protocolo;
- métricas crudas con unidad, calidad y tarea de origen;
- faltantes y advertencias, no ceros sustitutivos;
- perfil por dominio sin score global;
- razones explícitas de priorización;
- plan, progreso de sesiones y adherencia;
- metas y retos funcionales con fuente de valoración;
- comparación longitudinal con contexto, práctica y versiones;
- avisos de carácter experimental/no normativo.

La UI no debe:

- consultar telemetría para inventar interpretación clínica;
- ocultar resultados inválidos o sincronización pendiente;
- mezclar el índice interno con una escala clínica;
- presentar velocidad mejorada cuando cayó la precisión;
- afirmar causalidad a partir de cambio pre–post.

## 10. Flujo longitudinal

Las evaluaciones completadas y válidas se ordenan por `T0`, `T1`, `T2` y `T3`. Para cada métrica con la misma clave, unidad, versión de tarea y configuración métrica se calcula cambio absoluto y porcentual; las demás se conservan en `unavailableMeasures` con motivo.

Antes de mostrar dirección del cambio se comparan:

- contexto de sueño, fatiga, motivación, medicación, dosis, dispositivo y entrada;
- protocolo, motor de perfil y versión de cada tarea;
- misma forma/semilla frente a configuración alternativa;
- misma configuración métrica fijada desde T0, separada de la dificultad adaptativa de entrenamiento;
- presencia de métrica basal y de seguimiento.

El resumen conserva `normative=false`, `causalAttribution=false` y el aviso de efecto de práctica. Un cambio de `taskVersion` excluye las medidas de esa tarea con `task_version_mismatch`; una configuración métrica diferente usa `metric_configuration_mismatch`; y una unidad distinta usa `unit_mismatch`. Los cambios de protocolo, motor, contexto o forma generan cautelas visibles. La falta de versión/configuración suficiente queda como comparabilidad no verificada, nunca como equivalencia asumida.

## 11. Puente con SOFÍA

SOFÍA recibe un payload con `payloadType="derived_read_only_summary"`:

```js
{
  bridgeVersion,
  protocolId, protocolVersion,
  dataRole: {
    derived: true,
    readOnly: true,
    sourceOfTruth: false,
    containsRawTrials: false,
    containsDirectIdentifiers: false
  },
  authority: {
    mayDiagnose: false,
    mayChangeProgram: false,
    maySelectClinicalTreatment: false,
    mayPersistAsCanonicalRecord: false,
    clinicianRetainsFinalControl: true
  },
  provenance,
  cognitiveProfile,
  longitudinalTrends,
  adherence,
  functionalGoals,
  programStatus,
  notices
}
```

El validador rechaza identificadores directos, ensayos crudos y campos que aparenten recomendación, diagnóstico o decisión clínica. Las metas se codifican y pueden redactar términos sensibles. SOFÍA no modifica Firestore ni se convierte en Single Source of Truth.

## 12. Exportación de investigación

La exportación es una proyección separada del registro clínico:

```text
bundle clínico autorizado
  → código de sujeto externo
  → retiro de identificadores directos y enlaces al registro fuente
  → retiro de texto libre
  → retiro/generalización de fechas según política
  → validación
  → JSON o CSV longitudinal
```

El código de sujeto no puede reutilizar un identificador conocido. No se exportan `patientId`, `programId` enlazable, rutas Firestore, nombre, CURP, correo, expediente, dirección o tabla de correspondencia. El archivo declara que está seudonimizado y que seudonimización no equivale a anonimización.

El CSV usa formato largo con `subjectCode`, `protocolId`, `protocolVersion`, `recordPath`, `value` y `valueType`. El JSON conserva estructura y auditoría de categorías retiradas. La generación del archivo no autoriza por sí misma su transferencia o uso secundario.

## 13. Seguridad, privacidad y acceso

Las reglas Firestore permiten lectura/escritura según cuenta activa y relación autorizada:

- la propia cuenta del paciente;
- administrador;
- profesional con permiso de lectura o edición sobre el paciente.

La auditoría no puede actualizarse ni eliminarse. La telemetría aplica las mismas fronteras de acceso que su resultado. Las claves con posible PII se retiran de la telemetría, pero la sanitización técnica no sustituye consentimiento, control de acceso, cifrado de plataforma, minimización, retención ni revisión ética.

No se registran nombres, CURP, expedientes, diagnósticos, medicamentos, textos clínicos, rutas Firestore ni identificadores reales dentro de eventos técnicos o trazas de depuración.

## 14. Matriz mínima de trazabilidad

| Capa | Identificador | Versión obligatoria | Fuente inmediata | Consumidor autorizado |
|---|---|---|---|---|
| Tarea | `taskId`, `attemptId` | `taskVersion` | runner/adaptador | motor de métricas |
| Métrica | `resultId` | `metricsVersion` | ensayos puntuables | resultado/perfil/UI |
| Resultado | `resultId` | protocolo + persistencia | métrica + QC | evaluación/sesión/meta/reto |
| Perfil | `profileId`, `assessmentId` | `profileEngineVersion` | resultados válidos + metas | generador/UI/longitudinal |
| Plan | `planId`, `programId` | `programEngineVersion` | perfil + reglas explícitas | sesión/UI/clínico |
| Sesión | `sessionId` | `sessionEngineVersion`, `schemaVersion` | plan + transiciones | persistencia/UI/adherencia |
| Longitudinal | `comparisonId` | `longitudinalEngineVersion` | evaluaciones emparejadas | UI/SOFÍA/exportación |
| SOFÍA | resumen derivado | `bridgeVersion` | perfil/longitudinal/adherencia | contexto de solo lectura |
| Investigación | `subjectCode` | `researchExportVersion` | proyección seudonimizada | archivo autorizado |

## 15. Migración y compatibilidad

- Los registros históricos conservan sus versiones originales.
- Una migración añade `fromSchemaVersion`, `toSchemaVersion` y `dataReconstructed`.
- Una versión mayor futura no se modifica con un motor anterior.
- Un campo desconocido no se interpreta automáticamente.
- Una `taskVersion` distinta impide la comparación numérica de sus métricas; otras diferencias de versión muestran advertencia y requieren revisión.
- Agregar una métrica no autoriza recalcular silenciosamente datos históricos; el recálculo debe crear una derivación versionada y trazable.

## 16. Fallos que el diseño debe impedir

1. Guardar telemetría identificable dentro del resumen.
2. Duplicar resultados completos en múltiples documentos.
3. Mostrar guardado exitoso cuando solo existe borrador local.
4. Reanudar un ensayo parcial después de interrupción.
5. Usar un resultado inválido para priorizar dominio sin advertencia.
6. Convertir ausencia de dato en cero o normalidad.
7. Comparar versiones/unidades diferentes como si fueran equivalentes.
8. Permitir que SOFÍA escriba el plan o emita decisiones clínicas.
9. Exportar identificadores o la tabla de correspondencia.
10. Confundir adherencia, desempeño entrenado o índice interno con eficacia clínica.
11. Contabilizar la asignación de un reto como transferencia funcional conseguida.
12. Copiar métricas dentro de la sesión y crear una segunda fuente de verdad.

## 17. Límite de verificación de reglas

La arquitectura y las pruebas estáticas describen y revisan el contrato, pero no sustituyen la evaluación del motor de reglas. Al corte del 1 de septiembre de 2026, la prueba dinámica incluida para Firebase Emulator no llegó a ejecutar sus aserciones por incompatibilidad del runtime local (Java 17) y, después, por un fallo Netty/loopback con Java 21. Las reglas deben compilarse y superar la suite de emulador en un entorno compatible antes de despliegue; este documento no afirma que hayan sido validadas contra producción.
