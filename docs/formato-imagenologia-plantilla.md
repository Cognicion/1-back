# Solicitud de imagenología institucional

La fuente de verdad visual es `assets/formatos-fray/FTO-HPFBA-EXPC-IMG-SEI.docx`, derivada de la plantilla oficial. El archivo conserva encabezados, logos, estilos, márgenes, tabla y controles de contenido institucionales.

Flujo de datos:

```text
Expediente y catálogo de médicos
→ formulario de solicitud
→ snapshot normalizado
→ validación de campos obligatorios
→ clon en memoria de la plantilla DOCX
→ reemplazo de controles y marcadores en word/document.xml
→ generación del DOCX
→ registro de solicitud y auditoría
```

La selección de médico solicitante y médico adscrito reutiliza `catalogoMedicosFirmasIndicacionesCache`, cargado desde `usuarios/{uid}/catalogoMedicosFirmas`. No se crea un catálogo paralelo.

Los controles institucionales conservados se identifican por las etiquetas `fechaSolicitud`, `horaSolicitud`, `fechaNacimiento`, `sexo`, `género`, `servicio solicitante`, `tipo` y `criterio de urgencia`. Los campos sin control existente usan marcadores como `{{NOMBRE_COMPLETO}}`, `{{CURP}}`, `{{ESTUDIO}}`, `{{DATOS_CLINICOS_1}}`, `{{MEDICO_SOLICITANTE}}` y `{{MEDICO_ADSCRITO}}`.

El motor `crearDocumentoWordDesdePlantilla` mantiene intactas las partes del paquete DOCX salvo `word/document.xml`; no reconstruye el documento ni sustituye sus logos o tablas.
