# Índice semántico desidentificado de SOFÍA

## Propósito

El índice amplía las matrices estructuradas con afinidad semántica entre archivos clínicos. Sirve para búsqueda exploratoria de relaciones y agrupaciones; no calcula causalidad, no emite recomendaciones clínicas y no predice resultados individuales.

## Flujo

```text
registro clínico nuevo o modificado
-> trigger backend
-> validación de fuente y perfil de paciente
-> SemanticDocumentBuilder
-> desidentificación y fragmentación efímera
-> OpenAI Embeddings API
-> vector + metadatos seguros en Firestore
-> búsqueda KNN con distancia coseno
-> relaciones agregadas con soporte entre pacientes
-> callable exclusivo de administrador
-> Centro de Control / herramienta administrativa de SOFÍA
```

La reconstrucción histórica utiliza el mismo flujo y procesa lotes pequeños. Su cursor está cifrado; el navegador solo recibe un identificador aleatorio del trabajo y conteos agregados.

## Fuentes incluidas

La fuente única está en `CLINICAL_RECORD_SOURCE_CATALOG`. Incluye el perfil clínico y subcolecciones de notas, historia clínica, documentos importados, interconsultas, tratamientos, indicaciones, recetas, estudios, laboratorios, signos vitales, escalas, rehabilitación y eventos.

Agenda, mensajería, autenticación, permisos, preferencias, diarios personales, fotografías, binarios, rutas de archivos y controles operativos no forman parte del índice clínico. “Todos los archivos” se limita a las fuentes clínicas autorizadas del catálogo, no a datos privados u operativos sin una finalidad analítica definida.

## Privacidad

- El `patientId` real nunca se guarda en las colecciones analíticas; se usa `analyticsPatientId` SHA-256.
- Nombres, teléfonos, correos, CURP, RFC, domicilio, expediente, URLs, rutas, nombres de archivo y fechas exactas se eliminan o sustituyen antes de la API.
- El texto desidentificado solo existe en memoria durante la solicitud de embedding.
- Firestore persiste el vector, hashes de contenido y procedencia no identificable; no persiste el texto de entrada.
- El panel no recibe vectores, hashes de paciente, texto clínico ni filas individuales.
- Las relaciones visibles requieren al menos tres pares de pacientes desidentificados.
- Los cursores operativos se almacenan cifrados y no se devuelven al cliente.

## Configuración inicial

- Modelo: `text-embedding-3-small`.
- Dimensiones: `512`.
- Distancia: coseno.
- Similitud mínima: `0.78`.
- Vecinos por fragmento: `20`.
- Lote histórico: `20` archivos.
- Versión del motor: `1.0.0`.

El índice vectorial se declara en `firestore.indexes.json`. Cloud Firestore no genera embeddings: únicamente almacena los vectores y ejecuta la búsqueda de vecinos.

## Colecciones

- `clinicalAnalyticsEmbeddings`: vectores y metadatos seguros por fragmento.
- `clinicalAnalyticsEmbeddingManifests`: idempotencia y estado por archivo.
- `clinicalAnalyticsSemanticRelations`: pares semánticos sin texto ni identidad.
- `clinicalAnalyticsEmbeddingSources`: cobertura agregada por fuente.
- `clinicalAnalyticsEmbeddingStatus`: salud y versión del índice.
- `clinicalAnalyticsEmbeddingJobs`: control operativo cifrado de reconstrucciones.

## Interpretación

Una similitud alta significa que dos representaciones están próximas en el espacio vectorial. Puede deberse a tema, contexto, vocabulario o estructura documental compartida. No significa equivalencia clínica, asociación estadística confirmada, causalidad ni probabilidad de desenlace.

Referencias técnicas:

- OpenAI Embeddings API: https://developers.openai.com/api/docs/models/text-embedding-3-small
- Cloud Firestore vector search: https://firebase.google.com/docs/firestore/vector-search
- Firestore index definition: https://firebase.google.com/docs/reference/firestore/indexes
