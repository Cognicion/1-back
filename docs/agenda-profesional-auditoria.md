# Auditoría y ampliación de Agenda Médica

## Estado inicial

- `agenda.html` contiene la interfaz, `css/agenda.css` sus estilos y `js/agenda.js` concentra carga, persistencia, auditoría y renderizado.
- Las citas se guardaban en `usuarios/{medicoUid}/agenda` con `pacienteId`, `pacienteNombre`, `fecha`, `hora`, `tipo`, notas, estado y datos de auditoría.
- La creación usaba exclusivamente `addDoc`; la actualización existente solo permitía marcar atendida y la eliminación usaba `deleteDoc`.
- El calendario mensual era un renderizado local sin interacción de creación ni edición.
- El flujo anterior era: formulario de cita -> selección opcional de paciente -> `addDoc` -> auditoría -> lectura completa de la subcolección -> lista/calendario.
- No se encontraron OAuth, mapper, IDs externos ni operaciones de Google Calendar en este checkout. Se conservaron campos de compatibilidad (`googleCalendarEventId`, `syncStatus`) sin fingir una sincronización activa.

## Modelo final

Todos los documentos nuevos comparten un modelo compatible con el legado:

```text
Evento
├── type: appointment | event | meeting | academic | shift | block | vacation | other
├── title, startDate, startTime, endDate, allDay, durationMinutes
├── pacienteId/pacienteNombre (legado) y patientId/patientName/externalPatient (normalizado)
├── patientPhone, patientEmail, description, ubicacion, status
├── recurrence, googleCalendarEventId, syncStatus
└── creadoPor, creadoAt/fechaCreacion, actualizadoPor, updatedAt
```

Las citas antiguas se normalizan al vuelo: si no tienen `type` pero tienen campos de cita, se interpretan como `appointment`; `fecha` y `hora` siguen siendo la fuente de compatibilidad. Una cita no registrada no crea expediente: conserva nombre y datos de contacto opcionales y puede vincularse después seleccionando un paciente existente durante su edición.

## Flujo final

```text
Click/tap en día o botón Nuevo evento
→ preselección de fecha y tipo
→ actualización de campos por tipo
→ validación de paciente/fechas/horario
→ advertencia si cruza bloqueo
→ addDoc/updateDoc en usuarios/{uid}/agenda
→ auditoría agenda_event_created/updated/deleted
→ consulta del rango visible con margen
→ lista y calendario
```

La recurrencia se almacena como regla (`weekly`, `biweekly`, `monthly`) para evitar crear documentos masivos. `js/services/agendaRecurrence.js` calcula únicamente las ocurrencias del mes visible; cada ocurrencia usa `parentEventId + occurrenceDate` como identidad virtual. Editar o eliminar una ocurrencia actualmente edita o elimina la serie completa; no se simulan excepciones individuales.

Los intervalos horarios usan la convención `[inicio, fin)`: un evento que empieza exactamente cuando termina un bloqueo no se considera solapado. Las recurrencias mensuales conservan el día ancla; si ese día no existe en un mes, se usa el último día disponible de ese mes (por ejemplo, una serie iniciada el día 31 ocurre el 30 en abril y el 31 en mayo).

## Seguridad y compatibilidad

Se añadió una regla específica para `agenda` que restringe lectura/escritura al propietario o administrador y se excluyó `agenda` del wildcard heredado que permitía acceso a cualquier usuario autenticado. Las citas históricas no requieren migración destructiva.

## Validación realizada

- `node --check js/agenda.js` ✅
- `node --check js/config/appVersion.js` ✅
- Verificación automática de referencias de IDs entre HTML y JS ✅
- `git diff --check` ✅
- `node js/tests/agendaRecurrence.test.mjs` ✅
- Cálculo quincenal derivado de la fecha inicial ✅
- Carga headless sin sesión: la Agenda redirige a login y los módulos locales responden HTTP 200 ✅
- Revisión estática de la ruta Firestore y preservación de campos de citas antiguas ✅

No se pudo probar una sincronización real de Google Calendar porque no hay implementación ni credenciales/configuración de esa integración en este checkout.
