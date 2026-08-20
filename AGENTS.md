Proyecto: COGNICIÓN LABS / PROYECTO COGNICION / 1-back

## Reglas operativas permanentes del repositorio

### REPOSITORIO CANÓNICO PARA CAMBIOS DE LA PÁGINA

- Toda tarea que modifique la página web debe trabajar directamente sobre los archivos de `D:\Escritorio\PROYECTO COGNICION\1-back`.
- No realizar cambios de la página en copias, espejos, carpetas temporales ni otros clones. Antes de editar, comprobar que `git rev-parse --show-toplevel` devuelve el repositorio `1-back` indicado y que la rama activa es `main`.

### RESTRICCIÓN ABSOLUTA: NO USAR GIT WORKTREES EN ESTE REPOSITORIO

- Trabajar directamente en el repositorio principal y en `main`. No crear ni usar `git worktree`, directorios paralelos, ni copias del repositorio para aislar, publicar, fusionar o recuperar cambios.
- Antes de editar o confirmar, ejecutar `git status` e identificar cambios de la tarea actual y cambios preexistentes. Preservar siempre los preexistentes; si no puede trabajarse con seguridad, detenerse y reportar el conflicto.
- Usar staging explícito por ruta (`git add -- <rutas>`). Nunca usar `git add .`, `git add -A` ni una selección que pueda incluir cambios ajenos. Revisar `git diff`, `git diff --cached` y `git diff --check` antes de cada commit.

### TRABAJO EXCLUSIVAMENTE LOCAL; EL USUARIO PUBLICA

- Trabajar siempre directamente en la rama `main`. No crear, cambiar ni usar otras ramas y no usar worktrees. Esta regla solo puede cambiar si el usuario la revoca explícitamente.
- NO ejecutar `git push`, crear pull requests, publicar ramas, tags o releases, ni realizar ninguna otra escritura en GitHub. El usuario se encarga de toda publicación.
- No crear commits por defecto. Dejar los cambios locales, claramente identificados y listos para que el usuario los revise, confirme y publique. Solo crear un commit local si el usuario lo pide explícitamente; aun así, no subirlo.
- Antes de editar, ejecutar `git status --branch` y comprobar que la rama activa sea `main`. Puede usarse `git fetch` como verificación de solo lectura, pero no integrar cambios remotos ni modificar el historial sin autorización.
- Al terminar, reportar archivos modificados, pruebas ejecutadas y cualquier divergencia respecto de `origin/main`. No verificar producción como si el cambio local ya estuviera desplegado.

### Cambios, bugs y datos clínicos

- Mantener cambios localizados: identificar origen -> transformación -> estado -> consumidor -> renderizado o persistencia antes de modificar. Preservar APIs, ES Modules, lazy loading, Single Source of Truth y separación lógica/presentación; no hacer refactors ajenos.
- Para bugs: reproducir -> instrumentar si hace falta -> demostrar la causa -> aplicar el cambio mínimo -> probar -> entregar los cambios locales al usuario. Solo verificar producción después de que el usuario confirme que publicó. No corregir varias hipótesis simultáneas.
- Mantener trazas temporales hasta validación manual cuando sean necesarias. Nunca registrar nombres, CURP, expedientes, textos clínicos, diagnósticos, medicamentos, IDs reales, rutas Firestore ni otra información sensible.
- Antes de cambiar Firebase, datos o un flujo clínico, identificar fuente de datos -> transformación -> persistencia -> recuperación -> renderizado. No modificar esquemas, reglas, permisos, rutas ni persistencia sin necesidad demostrada y no duplicar una fuente de verdad existente.
- Todo cambio funcional visible importante debe incrementar la versión vigente: leer primero la versión real del repositorio y reportar versión anterior -> nueva.

Contexto:
Este proyecto desarrolla un laboratorio clínico/farmacológico para evaluar medicamentos, diagnósticos, interacciones, contraindicaciones, precauciones, comorbilidades y alertas clínicas. El sistema debe ser útil para práctica clínica, pero sin inventar datos ni presentar reglas incompletas como si fueran definitivas.

Reglas generales:
- No inventar datos clínicos, farmacológicos, diagnósticos, interacciones ni contraindicaciones.
- Toda información farmacológica debe tener fuente o marcarse explícitamente como “fuente pendiente” o “dato no encontrado en fuente local”.
- No usar frases genéricas como “vida media variable; revisar molécula” si el medicamento tiene vida media conocida.
- Separar claramente:
  A. Interacciones medicamento-medicamento
  B. Alertas medicamento-diagnóstico
  C. Contraindicaciones absolutas
  D. Contraindicaciones relativas / precauciones
  E. Duplicidades terapéuticas
  F. Cargas acumulativas
- No mezclar precauciones con contraindicaciones absolutas.
- No mezclar interacciones farmacológicas con comorbilidades.
- No mostrar “0 alertas” si en realidad la base no tiene reglas cargadas. Diferenciar:
  - “Sin alerta encontrada con la base actual”
  - “Sin regla cargada para este par”
  - “Dato insuficiente”
  - “Fuente pendiente”

Fuente farmacológica principal:
Usar como fuente local principal para psicofármacos:

fuentes_farmacologicas/stahl_prescribers_guide.pdf

Primero verificar:
- Que el PDF existe.
- Que puede leerse como texto.
- Si no puede leerse, reportar que requiere OCR.
- No copiar texto extenso literal.
- Extraer datos estructurados con trazabilidad por fuente, sección y página.

Objetivo principal:
Unificar todo el catálogo de medicamentos del proyecto en una sola capa farmacológica normalizada. Deben incluirse medicamentos psiquiátricos y no psiquiátricos.

Para psicofármacos:
- Usar Stahl como fuente principal cuando esté disponible.
- Extraer vida media real, metabolismo, CYP, indicaciones, contraindicaciones, precauciones, interacciones, efectos adversos y vigilancia.

Para medicamentos no psiquiátricos:
- Revisar el catálogo actual.
- Buscar si ya existen fuentes locales o datos confiables dentro del proyecto.
- Si no hay fuente suficiente, dejar el medicamento integrado pero marcado como “fuente pendiente”.
- Preparar la arquitectura para agregar fuentes externas confiables después.
- No dejar medicamentos fuera del motor solo porque no sean psiquiátricos.

Datos mínimos por medicamento:
- id interno estable
- nombre original escrito por el usuario
- nombre genérico normalizado
- sinónimos / marcas si existen
- clase farmacológica
- subclase
- indicaciones
- dosis habitual
- rango de dosis
- vida media específica
- tiempo a concentración máxima si aparece
- duración de efecto si aplica
- metabolismo
- CYP relevantes
- sustrato/inhibidor/inductor CYP si aplica
- metabolitos activos
- vía de eliminación
- contraindicaciones absolutas
- contraindicaciones relativas
- precauciones
- advertencias por embarazo/lactancia si existen
- advertencias geriátricas si existen
- advertencias pediátricas si existen
- interacciones medicamento-medicamento
- interacciones medicamento-diagnóstico
- efectos adversos relevantes
- vigilancia sugerida
- parámetros de laboratorio sugeridos
- fuente
- página/sección
- estado de evidencia o confiabilidad

Motor clínico:
El motor debe evaluar de forma separada:

A. Interacciones medicamento-medicamento:
- farmacodinámicas
- farmacocinéticas
- CYP
- QT
- sedación/SNC
- serotoninérgicas
- dopaminérgicas
- anticolinérgicas
- hipotensión/ortostatismo
- riesgo metabólico
- riesgo convulsivo
- sangrado
- renal/electrolitos
- duplicidad terapéutica

B. Alertas medicamento-diagnóstico:
- Usar diagnósticos activos del paciente.
- Aceptar diagnósticos CIE-10 y CIE-11.
- Mapear diagnósticos a categorías clínicas.
- Considerar hipertensión, riesgo cardiovascular, diabetes, obesidad, dislipidemia, enfermedad hepática, enfermedad renal, epilepsia, Parkinson, demencia, glaucoma, hiperplasia prostática, embarazo, lactancia, arritmias, QT prolongado, trastorno bipolar, psicosis, depresión, ansiedad, TDAH, consumo de sustancias y otros diagnósticos disponibles.
- Si un diagnóstico modifica el riesgo de un medicamento, debe aparecer aunque no exista interacción con otro fármaco.

C. Contraindicaciones absolutas:
- Solo cuando la fuente lo sustente claramente.
- Mostrar medicamento, motivo, diagnóstico/condición relacionada y fuente.

D. Contraindicaciones relativas / precauciones:
- Separar de absolutas.
- Incluir recomendación de vigilancia, ajuste o revisión clínica.

E. Duplicidades terapéuticas:
- Detectar duplicados por prescripción exacta.
- Detectar duplicados por principio activo.
- No borrar medicamentos distintos por agrupar solo por principio activo.
- Detectar duplicidad de clase cuando dos medicamentos tengan efecto clínico relevante similar.

F. Cargas acumulativas:
- sedativa
- anticolinérgica
- metabólica
- cardiovascular
- QT
- extrapiramidal
- prolactina
- serotoninérgica
- hipotensora
- renal/electrolítica

Eliminar cualquier texto ambiguo como “carga de presión 3”. Si se usan puntajes, deben tener nombre claro, escala, explicación y fuente.

Normalización:
- Crear o corregir sistema de normalización de nombres.
- Unificar mayúsculas/minúsculas, acentos, sales, formulaciones, marcas y sinónimos.
- Mantener siempre el texto original ingresado por el usuario y el nombre normalizado.
- Evitar que “olanzapina 10 mg” y “Olanzapina” se traten como fármacos distintos si son el mismo principio activo.
- Evitar que formulaciones clínicamente diferentes se fusionen incorrectamente.

Interfaz:
En “Medicamentos evaluados”, cada medicamento debe mostrar:
- nombre
- clase
- dosis habitual
- vida media real
- metabolismo/CYP
- indicaciones
- contraindicaciones
- precauciones
- efectos adversos
- vigilancia sugerida
- fuente

En alertas clínicas, mostrar categorías separadas:
A. Interacciones medicamento-medicamento
B. Alertas medicamento-diagnóstico
C. Contraindicaciones absolutas
D. Contraindicaciones relativas y precauciones
E. Duplicidades terapéuticas
F. Cargas acumulativas

Cada alerta debe mostrar:
- severidad
- medicamentos implicados
- diagnóstico implicado si aplica
- mecanismo
- recomendación clínica
- fuente
- estado de evidencia/confianza

Problemas ya detectados que deben corregirse:
- Se repiten medicamentos en la parte inferior.
- El motor agrupaba por principio activo y no por prescripción exacta, generando duplicaciones o alertas confusas.
- Aparecía “carga de presión 3”, que es ambiguo y debe eliminarse o renombrarse con escala clara.
- No estaban apareciendo vidas medias reales.
- Olanzapina y risperidona mostraban texto genérico de farmacocinética.
- No estaban saliendo todas las contraindicaciones ni interacciones.
- Las comorbilidades/diagnósticos no se estaban considerando adecuadamente.
- El sistema mostraba “0 alertas” aunque podían faltar reglas o datos.
- Deben considerarse diagnósticos CIE-10/CIE-11 además de interacciones farmacológicas.

Pruebas obligatorias:

Caso 1:
Medicamentos:
- Olanzapina
- Risperidona

Diagnóstico/comorbilidad:
- Hipertensión arterial / riesgo cardiovascular

Debe mostrar:
- vida media específica de olanzapina
- vida media específica de risperidona
- metabolito activo de risperidona si aplica
- metabolismo/CYP
- riesgos metabólicos
- sedación/SNC si aplica
- hipotensión/ortostatismo si aplica
- QT si aplica
- EPS/prolactina si aplica
- alerta medicamento-diagnóstico por riesgo cardiovascular/metabólico cuando corresponda
- no debe mostrar 0 alertas si hay reglas pendientes o datos insuficientes

Caso 2:
Medicamentos:
- Metilfenidato
- Atomoxetina

Diagnóstico/comorbilidad:
- Hipertensión arterial / riesgo cardiovascular

Debe mostrar:
- riesgos cardiovasculares
- presión arterial/frecuencia cardiaca
- precauciones o contraindicaciones según fuente
- interacción o precaución combinada si aplica
- eliminar cualquier alerta ambigua tipo “carga de presión 3”

Caso 3:
Agregar un medicamento no psiquiátrico común del catálogo actual y verificar que:
- aparece en la capa unificada
- tiene fuente o queda marcado como fuente pendiente
- participa en interacciones si hay reglas cargadas
- no rompe el motor farmacológico

Implementación:
1. Inspeccionar estructura actual del proyecto.
2. Ubicar catálogo de medicamentos.
3. Ubicar motor clínico/farmacológico.
4. Ubicar render/interfaz del laboratorio.
5. Diseñar o corregir una capa única de datos farmacológicos.
6. Integrar Stahl para psicofármacos.
7. Integrar medicamentos no psiquiátricos o marcarlos como fuente pendiente.
8. Corregir deduplicación.
9. Corregir alertas vacías falsas.
10. Corregir vidas medias genéricas.
11. Corregir contraindicaciones e interacciones incompletas.
12. Agregar pruebas automatizadas o verificables.
13. Ejecutar validación.

Entrega final:
Reportar:
- archivos modificados
- dónde quedó la fuente Stahl
- cómo quedó el esquema de datos
- cuántos medicamentos del catálogo fueron normalizados
- cuántos tienen datos completos
- cuántos quedaron con fuente pendiente
- pruebas ejecutadas
- resultado de olanzapina/risperidona
- resultado de metilfenidato/atomoxetina
- resultado de medicamento no psiquiátrico
- limitaciones pendientes
- siguientes fuentes recomendadas para medicamentos no psiquiátricos

Restricciones:
- No hacer cambios destructivos.
- No borrar trabajo previo sin autorización.
- Antes de editar, revisar el estado actual del proyecto.
- Después de editar, ejecutar pruebas o una validación mínima.
- Si una fuente no alcanza para afirmar algo clínico, marcarlo como pendiente.
