# MIDC — Motor de Interpretación Documental Clínica

## Arquitectura

MIDC es un núcleo aislado. No conoce pacientes, expedientes, Firebase, Panel Médico ni persistencia. Esos conceptos permanecen en `patient-transfer` y sus adaptadores.

```mermaid
flowchart LR
  A[Documento clínico] --> B[Normalizadores]
  B --> C[Boundary Engine]
  C --> D[Adapters de parsers actuales]
  D --> E[Modelos ClinicalDocument / ClinicalNote]
  E --> F[Validators]
  F --> G[Confidence Engine]
  G --> H[ClinicalImportResult]
  H --> I[Consumidores futuros]
```

## Módulos

- `core/`: modelos sin dependencias de aplicación.
- `boundaries/`: alias y límites con offsets del texto fuente.
- `normalizers/`: normalización clínica reutilizable.
- `confidence/`: reglas deterministas HIGH/MEDIUM/LOW/UNKNOWN.
- `validators/`: validación no destructiva.
- `adapters/`: compatibilidad con parsers actuales.
- `utils/`: contexto, resultado y logger.

## Contrato común de parser

```js
{
  parser,
  version,
  value,
  confidence,
  requiresReview,
  warnings,
  evidence,
  metadata
}
```

`ClinicalEvidence` conserva `documentId`, `page`, `block`, `offsetStart`, `offsetEnd`, `heading`, `rawText` y `confidence`.

## Boundary Engine

`findSectionStart()`, `findFirstBoundary()` y `extractBoundedSection()` trabajan sobre texto original y devuelven offsets. En esta fase los adapters de Subjetivo y Examen Mental llaman a los parsers actuales; no se modifica la segmentación ni el render.

## Confidence Engine

- `HIGH`: encabezado explícito o tabla estructurada.
- `MEDIUM`: inferencia entre límites reconocidos.
- `LOW`: texto libre/contexto.
- `UNKNOWN`: sin evidencia suficiente.

No usa IA ni puntuaciones opacas.

## Dependencias y compatibilidad

Los adapters importan únicamente parsers existentes de `patient-transfer`. El importador actual no importa todavía MIDC; por eso persistencia, Firebase, Panel Médico, Expediente y producción permanecen intactos.

## Plan de migración

1. Validar adapters de Subjetivo y Examen Mental con fixtures reales anonimizados.
2. Introducir un mapper de `ClinicalSection` detrás de `parseClinicalSections`.
3. Migrar Diagnósticos manteniendo `clinicalCandidateParser` como fallback.
4. Migrar Medicamentos y luego Signos Vitales.
5. Integrar el resultado en revisión sin cambiar el contrato de persistencia.
6. Migrar persistencia únicamente después de pruebas de contrato e idempotencia.

Fases posteriores: PDF, OCR, Dictado y consumidores analíticos se documentan, pero no se implementan aquí.
