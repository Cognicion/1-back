# FTO-HPFBA-EXPC-IMG-SEI

## Investigación y flujo

La pantalla que contiene el apartado **Expediente → Estudios** es `paciente.html`, controlada por `js/paciente.js`. Los estudios existentes se guardan en `usuarios/{pacienteId}/estudios` mediante `crearEstudio`, `listarEstudios`, `actualizarEstudio` y `eliminarEstudio` (`js/services/estudios.js`). La solicitud general anterior se guardaba en `usuarios/{pacienteId}/solicitudesEstudios`, con datos mínimos y exportación HTML.

El formato nuevo reutiliza el permiso institucional `fray_clinical_formats`, la validación de `formatosInstitucionales.js`, la auditoría de expediente y el generador Word institucional existente (`frayDocx.js`). No se encontró una plantilla `.docx` institucional original dentro del repositorio; por ello el documento nuevo conserva encabezado, clave, tablas y firmas mediante la estructura institucional disponible y el generador actual. La referencia visual proporcionada debe incorporarse como plantilla maestra cuando se entregue el archivo oficial.

Flujo nuevo:

```text
Expediente → Estudios → Solicitar estudio de imagen
→ carga única del paciente y perfil solicitante
→ formulario editable y catálogo local lazy
→ Datos faltantes
→ Guardar borrador o validar solicitud definitiva
→ snapshot en solicitudesEstudios/{solicitudId}
→ registro solicitado en estudios/{solicitudId-estudioId}
→ Word / impresión-PDF
→ auditoría
```

## Modelo y estados

La solicitud conserva `pacienteId`, `formatoId`, `tipo`, `estado`, datos de solicitud, snapshot del paciente, datos clínicos, estudios, médicos y auditoría. Los estados implementados son `borrador` y `solicitado`; los estados posteriores (`agendado`, `realizado`, `cancelado`) permanecen disponibles para la evolución del módulo de Estudios.

Los borradores no crean documentos dentro de `estudios` y se muestran como **Borrador de solicitud**. La solicitud definitiva usa un ID estable y escribe con batch la solicitud y cada estudio, evitando duplicados por doble clic.

## Campos y faltantes

Obligatorios: expediente, nombre, fecha de nacimiento, sexo, servicio, datos clínicos, al menos un estudio, solicitante y cédula; además criterio de urgencia para estudios urgentes.

Recomendados: CURP, peso, talla y médico adscrito. Fecha/hora de cita y “Recibe la solicitud” quedan para Imagenología. `PA` conserva la etiqueta institucional y se muestra una nota temporal porque no existe documentación local que confirme su significado/unidad.

## Archivos añadidos o modificados

- `js/data/catalogoEstudiosImagen.js`: catálogo local y buscable.
- `js/components/solicitudImagenologia.js`: formulario, faltantes, estudios múltiples y documentos.
- `js/services/solicitudesImagenologia.js`: persistencia de borradores y solicitudes definitivas.
- `paciente.html`, `js/paciente.js`, `css/paciente.css`: integración localizada.
- `js/services/formatosInstitucionales.js` y `functions/noteGenerationHandler.js`: reconocimiento del formato Fray.

No se modificaron reglas Firestore porque no existe un archivo de reglas versionado en este proyecto; la protección de interfaz usa el permiso institucional existente. Debe verificarse en el proyecto Firebase desplegado que las reglas actuales permitan al mismo conjunto de usuarios autorizado escribir `solicitudesEstudios` y `estudios`.
