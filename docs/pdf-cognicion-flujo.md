# PDF Cognición: flujo, diagnóstico y observabilidad

Fecha de corrección: 2026-08-12  
Versión visible: 1.912

## Flujo de datos

1. `nota.html` ejecuta `descargarNotaSeleccionada()` desde el botón **Descargar nota**.
2. Para el formato Cognición, `descargarNotaSeleccionada()` delega en `generarPDFNota()`.
3. `datosExportacionCognicion()` combina, sin persistir cambios:
   - los valores actuales de `collectNoteData()`;
   - la versión vigente de la nota guardada, si está en edición;
   - los signos vitales resueltos por `resolverSignosVitalesNota()`.
4. `construirContenedorPdfCognicion(datosPdf)` transforma los datos en un árbol DOM temporal A4.
5. El contenedor se adjunta fuera de pantalla, se esperan de forma acotada las fuentes del sistema y los dos logos decorativos, y se validan texto y dimensiones.
6. Sólo después de una preparación válida se entrega el documento al navegador mediante `window.print()`.
7. El navegador ofrece su diálogo nativo para imprimir o guardar como PDF. La limpieza se ejecuta con `afterprint` o mediante un temporizador de respaldo. No se limpia al recuperar el foco, porque Safari/iOS puede hacerlo antes de terminar el paginado.

Este flujo no usa jsPDF, `Blob`, `URL.createObjectURL`, base64, `window.open()` ni una descarga mediante enlace. El `Blob` que existe más adelante en `nota.js` pertenece exclusivamente al formato Word Fray.

## Causa raíz corregida

`resolverSignosVitalesNota()` devuelve legítimamente `null` cuando una nota no contiene signos vitales. La plantilla de evolución llamaba a `crearTablaSignosEvolucionPdfCognicion(null)`. Su parámetro predeterminado `{}` sólo protegía `undefined`, no un `null` explícito, y el primer acceso `signosVitales[clave]` lanzaba un `TypeError` antes de llegar a `window.print()`.

La corrección conserva el contrato del resolver: si el valor no es un registro válido, se omite únicamente la tabla opcional de signos y el resto de la nota continúa.

## Límites y fallos independientes

- **Preparación:** recopilación, normalización, construcción DOM, fuentes, imágenes y validación.
- **Entrega:** disponibilidad y llamada de `window.print()`.

Cada fase tiene un mensaje de usuario distinto. Un fallo de entrega ya no se presenta como si hubiera fallado la construcción.

Las firmas actuales son texto visible (nombre, cargo y cédula), no imágenes ni canvas. Los logos se marcan como decorativos: pueden omitirse si fallan. Una futura imagen no marcada como decorativa deberá tratarse como requerida y no podrá omitirse silenciosamente.

## Trazas temporales

Se conservan trazas con el prefijo `[PDF Cognición]` para validación manual. Registran sólo:

- etapa;
- disponibilidad de impresión y tipo de viewport;
- presencia de signos vitales;
- conteos de diagnósticos, firmas, secciones e imágenes;
- estado de fuentes e imágenes;
- longitud del texto y dimensiones;
- nombre y código permitidos, más archivo/línea/columna sin URL ni parámetros.

No registran nombres, expedientes, identificadores, texto clínico, diagnósticos, medicamentos, valores de signos, rutas Firestore ni contenido de firmas.

## Cobertura de regresión

Las pruebas cubren la omisión segura de signos `null`/`undefined`, datos parciales, campos vacíos, objetos conocidos y desconocidos, arrays, fechas y Timestamps de Firestore, Unicode, texto extenso, firma ausente, logo ausente, límites de espera y renderizado real a PDF A4 en Chrome con viewport móvil y de escritorio.
