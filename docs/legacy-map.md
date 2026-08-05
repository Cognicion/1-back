# Mapa legacy del MIDC v1

## Activo

| Módulo | Responsabilidad | Estado |
|---|---|---|
| `clinical-document-engine/parsers/diagnosisParser.js` | Parser MIDC de diagnósticos | Activo |
| `clinical-document-engine/parsers/medicationParser.js` | Parser MIDC de medicamentos | Activo |
| `clinical-document-engine/parsers/vitalSignsParser.js` | Parser MIDC de signos vitales | Activo |
| `clinical-document-engine/engine/*` | CEE, ciclo de vida, matching y validación | Activo |

## Compatibilidad

| Módulo | Motivo de permanencia |
|---|---|
| `patient-transfer/parsing/vitalSignsParser.js` | Conserva el contrato legacy y el payload de nota |
| `clinicalCandidateParser.detectTreatmentCandidates()` | Punto de entrada histórico; delega al MedicationAdapter |
| `clinicalCandidateParser.detectDiagnosisCandidates()` | Punto de entrada histórico; delega al DiagnosisAdapter |
| `adapters/diagnosisAdapter.js` | Traducción a filas legacy |
| `adapters/medicationAdapter.js` | Traducción a candidatos legacy |
| `adapters/vitalSignsAdapter.js` | Agregación compatible `vitalSigns` |
| `subjectiveAdapter.js`, `mentalExamAdapter.js` | Compatibilidad temporal con parsers de secciones aún legacy |

## Pendiente de migración

- `subjectiveSectionParser.js` y `clinicalSectionParser.js`: requieren una migración posterior al contrato ClinicalSection nativo.
- Parsers de laboratorios, escalas, estudios y timeline: no implementados en MIDC v1.

## Código legacy clasificado, no eliminado

Las funciones históricas internas de `clinicalCandidateParser.js` permanecen porque son referencias de compatibilidad y pruebas del flujo actual. No se eliminaron sin una prueba de que ninguna ruta las consuma.

## Dependencias circulares

No se detectaron ciclos entre `clinical-document-engine/parsers`, `engine` y `adapters`. Los adapters importan parsers y CEE; los parsers no importan adapters. Los wrappers de `patient-transfer` importan adapters de forma unidireccional.
