# Matrices de patrones de SOFIA

## Flujo

1. Un cambio clinico activa `clinicalAnalyticsOnRecordWrite`.
2. El backend reconstruye solo el contexto del paciente afectado.
3. `patientFeatureProfile` deriva variables numericas, binarias y categoricas seguras, metricas temporales, documentales y de uso de plataforma.
4. El perfil se guarda por `analyticsPatientId` y reemplaza la version anterior. Si el contenido no cambio, su huella evita una escritura duplicada.
5. El estado de matrices queda marcado como pendiente.
6. Un administrador ejecuta `rebuildClinicalPatternMatricesAdmin`. La funcion vuelve a construir los perfiles de la cohorte autorizada dentro del backend y publica las matrices solo si todos los perfiles se procesaron.
7. Cada calculo se escribe con un identificador de ejecucion nuevo. Un puntero cambia al resultado nuevo solo despues de guardar sus tres matrices completas.
8. El panel administrativo y la herramienta `get_platform_pattern_matrices` de SOFIA leen resultados agregados; nunca reciben filas por paciente.

## Matrices

- `mixed_values`: asociaciones entre valores demograficos, documentales, temporales, clinicos, farmacologicos, escalas, laboratorios, signos vitales y uso de plataforma.
- `documentation_presence`: co-documentacion y omisiones sistematicas de variables.
- `temporal_sequences`: secuencias ordenadas encontradas de forma general, sin una lista fija de desenlaces.

La medida se selecciona por tipos:

- numerica-numerica: Pearson y Spearman;
- binaria-binaria: phi;
- binaria-numerica: correlacion punto-biserial;
- categorica-categorica: V de Cramer;
- categorica-numerica: razon de correlacion eta cuadrada;
- secuencia: probabilidad empirica, intervalo de Wilson y lift descriptivo.

Los valores p compatibles se ajustan con Benjamini-Hochberg. Una asociacion se etiqueta como candidato despues de correccion solo si supera el efecto minimo y la tasa de falsos descubrimientos configurada.

## Privacidad y limites

- El perfil global no guarda `patientId`, nombres, contacto, domicilio, identificadores visibles ni texto clinico.
- Diagnosticos dinamicos solo se desglosan cuando existe un codigo clinico con formato restringido; ocupaciones y texto libre no se copian como categorias.
- Las metricas de escritura almacenan conteos o razones, nunca palabras ni frases.
- Los campos estructurados nuevos de tipo numerico o booleano entran mediante un extractor generico; de los campos de texto solo se conserva presencia y longitud, no su contenido.
- Las fechas clinicas del perfil se reducen a mes; los instantes exactos solo se usan transitoriamente para calcular orden e intervalos.
- Las celdas raras se agrupan y se suprimen si quedan por debajo de `minimumCellCount`.
- Se requieren como minimo 10 observaciones y 3 eventos.
- Los resultados son exploratorios, observacionales y no causales. No activan diagnosticos, tratamientos ni decisiones clinicas.
- "Cualquier patron" significa cualquier par o secuencia entre las variables estructuradas compatibles; no significa publicar toda coincidencia ni explorar identificadores o texto libre.

## Versiones

Cada perfil y resultado conserva las versiones de esquema, extractor, motor de patrones, motor probabilistico y motor de matrices. Un cambio de algoritmo no modifica silenciosamente el significado de resultados anteriores.
