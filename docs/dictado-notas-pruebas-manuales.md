# Dictado y notas automáticas — pruebas manuales

Estado: **VERSIÓN ALFA · EN DESARROLLO**. No usar el resultado sin revisión clínica.

## Preparación

1. Abrir `nota.html` mediante HTTPS o `localhost` en Chrome o Edge actualizado.
2. Seleccionar un paciente de prueba sin datos reales y confirmar nombre, edad, identificador y encuentro.
3. Abrir “Diagnóstico seguro y lista de prueba”. No registrar texto clínico completo en consola, capturas o telemetría.

## Casos que requieren intervención del usuario

| Caso | Acción | Resultado esperado |
|---|---|---|
| Permiso concedido | Iniciar y permitir micrófono | Estado `listening`, micrófono activo y barra con nivel. |
| Permiso rechazado | Bloquear permiso | Estado no disponible, mensaje explícito y tracks liberados. |
| Voz | Dictar una frase | Provisional separado; al finalizar se consolida una sola vez. |
| Pausa/reanudación | Pausar, editar texto y reanudar | No reinicia mientras está pausado; conserva la edición manual. |
| Finalizar/cancelar | Finalizar; repetir y cancelar | Finalizar conserva borrador. Cancelar confirma, limpia y rechaza eventos tardíos. |
| Limpieza | Pulsar limpiar con texto | Solicita confirmación y no modifica la nota principal. |
| Recuperación | Recargar y recuperar | Recupera solo el mismo usuario, paciente y encuentro. |
| Paciente | Cambiar con sesión activa | Solicita confirmación; crea contexto nuevo y limpia provisionales. |
| Aislamiento | Dictar A, cambiar a B y provocar cierre tardío | Ningún segmento de A aparece en B. |
| Red | Desconectar temporalmente | Conserva texto, muestra error y aplica backoff/reintentos limitados. |
| Navegación | Salir de la página | Detiene reconocimiento, MediaStream, tracks, audio y listeners. |
| Privacidad | Revisar aviso | Indica que Web Speech puede usar servicios del proveedor del navegador; no afirma procesamiento local. |

## Revisión de nota

1. Generar un borrador con negaciones, dos informantes, temporalidad, riesgo y un medicamento.
2. Confirmar que generar no cambia `subjetivo`, `objetivo`, `análisis` ni `plan`.
3. Comparar transcripción, propuesta, alertas y fragmentos de origen.
4. Aceptar/rechazar secciones, editar una, restaurarla y regenerarla de forma individual.
5. Intentar insertar sin confirmar un riesgo crítico: debe bloquearse.
6. Confirmar riesgos y seleccionar secciones: “Insertar secciones revisadas” modifica únicamente esas secciones.
7. Deshacer debe restaurar los campos previos.
8. Las indicaciones deben permanecer como propuestas individuales; no se guardan automáticamente.

## Limitación conocida

La prueba automatizada simula eventos de reconocimiento, pero no puede conceder permisos ni producir audio físico. La disponibilidad, privacidad, calidad, límites y procesamiento remoto de Web Speech API dependen del navegador y su proveedor.
