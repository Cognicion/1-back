# MIDC

Motor de Interpretación Documental Clínica, Fase 2.

El núcleo recibe texto/bloques clínicos y produce modelos, candidatos, evidencia y confianza. No importa pacientes, Firebase, Panel Médico ni persistencia.

## Compatibilidad

Los parsers existentes de `patient-transfer` siguen siendo la fuente operativa. Los adapters de este directorio los envuelven sin cambiar sus entradas, salidas persistidas ni el flujo visible.

## Pipeline

`documento → normalización → segmentación → delimitación → interpretación → normalización clínica → validación → confidence → resultado`

## Uso

```js
import { adaptSubjectiveParser, ClinicalDocument } from "./index.js";
const document = new ClinicalDocument({ id: "doc-1", blocks });
const result = adaptSubjectiveParser({ id: "note-1", blocks: document.blocks });
```

Las fases de migración posteriores están documentadas fuera del núcleo. No se integran aún en `medico.html`.
