# Integración Google Calendar

## Flujo actual auditado

`usuario autenticado → formulario #formCita de agenda.html → datosCita en js/agenda.js → addDoc(usuarios/{uid}/agenda) → cargarCitas/getDocs → render de lista y calendario`.

El adaptador se conecta después de confirmar Firestore: la cita conserva su guardado local y se intenta `calendarSyncAppointment` de forma asíncrona. La función vuelve a obtener el UID desde Firebase Authentication y nunca acepta un UID del navegador.

## Persistencia

- Metadatos: `usuarios/{uid}/integrations/googleCalendar`.
- Tokens: `_googleCalendarTokens/{uid}`, colección exclusiva del backend, con refresh token cifrado AES-256-GCM.
- Estado temporal OAuth: `_googleCalendarOAuthStates/{state}`, con expiración de diez minutos y UID interno.
- Citas: bloque opcional `calendarSync`; las citas antiguas siguen siendo válidas.

## Reglas que deben fusionarse con las reglas existentes

La aplicación no tenía un archivo de reglas versionado. Antes de desplegar, añadir reglas equivalentes a estas dentro del archivo real, conservando las reglas clínicas actuales:

```text
_googleCalendarTokens/{uid}: deny read/write for clients
_googleCalendarOAuthStates/{state}: deny read/write for clients
usuarios/{uid}/integrations/{id}: read only when request.auth.uid == uid; client write denied
usuarios/{uid}/agenda/{id}: preserve current owner permissions; client calendarSync may only be pending/error/deleted
```

Las actualizaciones `synced`, `reauthorization_required` y los metadatos de conexión solo deben venir de Admin SDK/Functions.

## Primera etapa y preparación futura

La primera etapa implementa COGNICIÓN → Google Calendar: crear, actualizar, cancelar, eliminar, reintento manual y sincronización programada/manual. `googleCalendarPullChanges` y el webhook HTTPS están preparados como puntos de extensión, pero todavía no importan cambios ni crean canales push hasta validar credenciales y reglas en un entorno controlado.
