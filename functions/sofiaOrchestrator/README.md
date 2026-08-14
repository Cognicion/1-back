# Orquestador unificado de SOFÍA

Este módulo conecta el chat con el análisis clínico autorizado y con acciones permitidas de `sofia.html`.

## Flujo

1. La Cloud Function valida autenticación, rol y acceso al paciente seleccionado.
2. El contexto clínico se construye en backend y permanece separado del estado DOM.
3. El modelo elige herramientas declaradas mediante function calling.
4. El servidor ejecuta únicamente herramientas registradas y devuelve sus resultados al modelo.
5. Las acciones visuales se devuelven como comandos cerrados; el navegador las valida de nuevo antes de ejecutarlas.

## Permisos

- Automático: lectura estructurada, navegación, filtro, recarga de solo lectura y revisión local de una nota no guardada.
- Solo administrador: lectura de matrices agregadas y desidentificadas entre pacientes; nunca incluye filas individuales.
- No disponible: guardar, editar, prescribir, eliminar, cambiar de paciente o ejecutar JavaScript/selectores arbitrarios.

El modelo no recibe identificadores del perfil ni texto libre de las notas mediante las herramientas clínicas. El nombre conocido del paciente se sustituye por `[paciente actual]` en mensajes, historial y contexto suplementario antes de enviar la solicitud al modelo.

Las trazas `[SOFÍA Unified]` registran nombres de herramientas y tiempos, pero no argumentos, identificadores reales ni contenido clínico.
