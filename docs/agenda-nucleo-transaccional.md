# Agenda: auditoría y preparación transaccional

## Fase posterior: instantes canónicos y lectura transaccional acotada (2.191)

Para una creación o reprogramación bajo política IANA, el backend deriva `startAt` y `endAt` (`Timestamp`) exclusivamente de `startDate/startTime/endDate/endTime` y `policy.timeZone`. Esos timestamps son la fuente temporal canónica de una cita `temporalModel: 'modern-instant'`; una inconsistencia con la proyección civil se rechaza. El cliente no puede enviar esos campos. Una cita sin ambos continúa siendo `legacy-civil`: no se reescribe ni se le atribuye retrospectivamente un instante. Al reprogramarla explícitamente bajo política IANA válida se materializan sus instantes nuevos.

La lectura transaccional de una cita moderna combina: (1) `startAt < candidate.endAt` y `endAt > candidate.startAt`; (2) una ventana civil legacy de 366 días, que es el máximo de intervalo admitido por el dominio; y (3) todas las fuentes de recurrencia, expandidas sólo para la ventana candidata. La fusión se deduplica por ID. Esto mantiene bloqueos, vacaciones y eventos bloqueantes. Series y documentos legacy anómalos que superen el máximo soportado quedan como deuda de saneamiento; no se omiten silenciosamente. `firestore.indexes.json` declara el índice mínimo `agenda(startAt ASC, endAt ASC)`.

`calendarProjection()` produce exclusivamente `{appointmentId,startAt,endAt,timeZone,title:'Consulta'}` y rechaza documentos legacy. Es preparación de proveedor: no ejecuta OAuth, Google Calendar ni ninguna API externa.

## Fase posterior: zona IANA y jornada profesional (2.190, 2026-09-07)

La configuración de disponibilidad reside en `appointmentControls/{profesionalUid}.policy`; no duplica citas ni datos clínicos. `availabilityMode: 'legacy-civil'` conserva la Agenda para profesionales sin configuración. Cuando se guarda configuración, el modo pasa a `configured` y contiene `timeZone` IANA, `weeklySchedule`, `dateExceptions`, `slotDurationMinutes`, `bookingEnabled` y los puntos de extensión de buffers y horizonte. Ningún valor se infiere de la zona del navegador.

Las citas históricas continúan en `startDate/startTime/endDate/endTime` como hora civil. En modo configurado esas horas se interpretan exclusivamente en `timeZone`; el dominio rechaza horas inexistentes o ambiguas durante DST. No hubo migración masiva. El flujo temporal es: hora local del profesional → conversión IANA comprobada → instante para comparar ocupación → Timestamp de Firestore para metadatos. Las citas antiguas no se reinterpretan hasta que el profesional configure su agenda.

`getAvailability()` compone jornada semanal, excepción de fecha, citas, bloqueos, vacaciones, eventos con `blocksAvailability`, y una lista inyectada de intervalos externos `{start,end,source}`. Los slots se calculan bajo demanda para una ventana y duración solicitada; nunca se persisten. El contrato de calendario externo se limita a intervalos busy: un futuro proveedor Google/Outlook/CalDAV deberá implementarlo fuera de Appointment Service y sólo podrá recibir la proyección mínima `{title:'Consulta', start, end}`.

Las recurrencias ahora exponen `getOccurrences(series, rangeStart, rangeEnd)`. Salta a la ventana solicitada y no expande desde el origen hasta una fecha futura; conserva el ancla mensual 31. La renderización histórica mantiene su tope de 500 ocurrencias. Crear una serie sin fin se valida dentro del horizonte de reserva finito; no se declara validación infinita.

La interfaz mínima está en Configuración para personal clínico: zona IANA, activación de reservas externas y múltiples intervalos por día. Guarda mediante `manageAppointment`, nunca mediante Firestore cliente. Las Rules no cambian: `appointmentControls` sigue fuera del acceso directo del cliente. No se conectó ningún proveedor externo, OAuth, WhatsApp ni pago; la protección global sigue sin activar.

Fecha: 2026-09-07. Trabajo local sobre main. No publicación ni integraciones externas.

**Estado de entrega:** auditoría documentada y núcleo interno implementado; extracción segura hacia la UI realizada. La integración completa de las escrituras de Agenda sigue pendiente. No se cumple todavía la garantía global para todos los canales y tipos de evento.

## A–B. Arquitectura inspeccionada antes de editar

`agenda.html` → `js/agenda.js` → validación de formulario y advertencia opcional → SDK Firestore directamente → `usuarios/{medicoUid}/agenda/{id}` → nueva consulta → lista/calendario. No hay listener onSnapshot de citas. Hay onAuthStateChanged, monitoreo de sesión (eventos de actividad, intervalo de 60 s y limpieza pagehide) y listeners DOM regenerados al renderizar.

Inventario: agenda.html; css/agenda.css; css/theme/cognicion-theme.css; js/agenda.js; js/services/agendaRecurrence.js; js/services/usuarios.js; js/services/auditoria.js; js/services/sesion.js; js/utils/roles.js; js/utils/nombresPacientes.js; js/mi-salud.js (cargarProximaCita); js/admin.js (vista previa); js/components/accesosRapidos.js, pageHeaderRegistry.js y featureTips.js (navegación); functions/index.js; functions/package.json; functions/clinicalAnalytics/access.js; functions/accountSecurity/professionalDirectory.js y accountDeletion.js; firestore.rules; firestore.indexes.json; firebase.json; js/config/appVersion.js; docs/agenda-profesional-auditoria.md; js/tests/agendaRecurrence.test.mjs.

### Hallazgos comprobados

1. No existe Appointment Service ni Cloud Function de Agenda. Crear usa addDoc; editar y marcar atendida usan updateDoc; eliminar usa deleteDoc. No hay cancelación lógica ni confirmación dedicada.
2. Tres consultas por carga: fecha entre inicio/fin; startDate <= fin y endDate >= inicio; recurrence in weekly/biweekly/monthly. Rango de tres meses, todas las series recurrentes. Se deduplican por ID después de leer; los documentos modernos con fecha se leen dos veces. Índice compuesto startDate ASC/endDate ASC ya declarado. Resto: índices simples automáticos. No se verificó despliegue de índices.
3. Promise.allSettled permite renderizar datos incompletos. No existe garantía de disponibilidad. Las escrituras recargan las tres consultas; cambiar mes también. listarPacientes(forzar:true) omite caché; auditoría vuelve a solicitar el perfil (obtenerUsuario tiene caché). No hay medición de latencia/coste real ni onSnapshot duplicado de Agenda.
4. detectarBloqueo sólo evalúa block/vacation, sólo expande el mes visible, no necesariamente las fechas del formulario. Permite override con confirm(). No evalúa otras citas. Una lectura previa no evita concurrencia.
5. Guardias, eventos, reuniones y actividades académicas se representan como tipos; no bloquean actualmente. No hay horario del médico, zona IANA persistida ni límites de jornada en Agenda. No debe inventarse esa configuración a partir de horarios visibles.
6. Intervalos estrictos [inicio, fin); todo el día termina históricamente a 23:59:59. endTime domina durationMinutes. Sin ambos, ocupa el resto del día. Con duración y sin endTime, endDate multidía no extiende la duración: ambigüedad histórica que necesita normalización explícita antes de automatizar.
7. Recurrencias virtuales weekly/biweekly/monthly; ancla mensual 31 conservada. Editar/eliminar una ocurrencia afecta la serie. No hay excepciones ni fecha final de serie. Expansión tiene límite 500 y búsqueda inicial de series multidía que puede omitir ocurrencias largas iniciadas antes del rango.
8. Paciente registrado: patientId/pacienteId y nombres de visualización. Externo: ID vacío, externalPatient, nombre/teléfono/correo opcionales; no crea expediente. Vinculación manual seleccionando paciente autorizado al editar el mismo documento. Nunca hay resolución por teléfono.
9. Rules sólo comprueban propietario/admin y cuenta no eliminándose; no verifican rol médico, horario, estados, paciente ni concurrencia. El wildcard heredado excluye agenda correctamente. El cliente podía introducir cualquier campo, incluido pago inventado.
10. Auditoría existente global auditoria, posterior a la escritura y no atómica: si falla, la cita ya existe y reintentar puede duplicar. Incluye nombres/URL/navegador; no conviene reutilizar esos datos para canales administrativos.
11. Mi Salud intenta leer toda la agenda del médico y filtrar pacienteId localmente. Rules lo rechazan para un paciente y el catch presenta ausencia de cita. Además sólo excluye atendida. No abrir acceso a esa colección para resolverlo: necesita proyección administrativa autorizada.
12. Formulario mantiene aliases fecha/hora, estado/status, nombres/IDs y notas/description. Son compatibilidad existente, no crear otros estados equivalentes. Al editar no repone recordatorio/seguimiento; posible pérdida de texto anterior, deuda independiente.

## C. Decisión de cambios mínimos

Extraer normalización, intervalos y recurrencia a dominio ES Modules reutilizable por navegador y Node, sin dos algoritmos. Añadir servicio server-side interno con transacción, mutex por agenda, recibos idempotentes sin copia de cita y auditoría atómica en la colección existente. No exportar endpoint externo ni cambiar todas las escrituras de UI mientras falten configuración explícita, tratamiento de series ilimitadas y validación de despliegue conjunto. La interfaz actual reutilizará las funciones puras cuando conserve comportamiento.

El nuevo servicio requiere una activación explícita del control server-side que también cierra las escrituras SDK por Rules. No activar en producción durante esta fase: la UI histórica necesitará conectarse al transporte backend antes de esa activación. Esta frontera impide presentar la preparación como una migración completada.

## D–E. Implementación entregada y alcance efectivo

- `functions/appointments/domain.mjs`: normalización, intervalos, disponibilidad de un intervalo solicitado, invariantes, confirmación/cancelación/reprogramación y proyección administrativa. Sin Firebase ni DOM.
- `functions/appointments/recurrence.mjs`: implementación original de recurrencias trasladada sin cambiarla; pertenece al paquete desplegable de Functions para que Node no dependa de archivos fuera de su source.
- `js/services/agendaRecurrence.js`: reexport compatible de la misma implementación.
- `js/services/appointmentService.js`: fachada del dominio para navegador, sin SDK Admin ni importación de servidor.
- `js/agenda.js`: consume normalización e intervalos compartidos; conserva formulario, render, CRUD, auditoría y semántica de series existentes. No importa ni carga prematuramente el servicio server-side.
- `agenda.html`: únicamente actualiza la clave de caché del módulo Agenda. Se inspeccionó service-worker.js: los scripts versionados usan stale-while-revalidate; una clave nueva evita reutilizar el módulo previo en la primera carga.
- `functions/appointments/service.mjs`: factory interna `createAppointmentService({db})`. Ofrece getAppointment/getAvailability/createAppointment/confirmAppointment/cancelAppointment/rescheduleAppointment. Ningún endpoint se añadió a functions/index.js.
- `firestore.rules`: conserva CRUD heredado mientras el control no esté activo, impide introducir/cambiar payment/confirmation/reminders desde SDK cliente y cierra TODAS las escrituras de agenda, incluso admin cliente, al activar el control.
- `tests/appointment-domain.test.mjs`, `tests/appointment-emulator.test.mjs`: pruebas de dominio, transacciones reales del emulador y Rules reales del repositorio.
- `js/config/appVersion.js`: versión de trabajo encontrada 2.187 → 2.188, incremento convencional 0.001. Conservados cambios previos del archivo y del resto del repositorio.
- Este documento es el reporte completo. No se modificaron estilos, índices, configuración Firebase, package.json ni exports de Functions.

### Flujo de la UI después de esta fase

Formulario → validaciones actuales → normalización/intervalos compartidos → addDoc/updateDoc/deleteDoc actuales → documento original → auditoría cliente separada → tres consultas → normalización compartida → lista/calendario con recurrencias compartidas.

### Flujo del núcleo server-side probado

Solicitud interna con Auth verificado por el futuro transporte → autorización del propietario profesional/admin y comprobación de cuenta activa → control habilitado → recibo idempotente → estado e invariantes → snapshot completo acotado de la agenda → disponibilidad → transacción de cita + revisión del control + recibo + auditoría → respuesta mínima con ID/resultado.

La validación de paciente registrado reutiliza `assertAuthorizedProfessional` y su relación clínica existente. No se consulta el teléfono para vincular. El navegador conserva la selección manual original. No existe todavía identidad de canal; un futuro adaptador deberá resolver y verificar identidad antes de invocar un caso de uso autorizado. No podrá suministrar un UID como sustituto de Firebase Auth.

## Esquema antes/después

La única fuente de verdad sigue siendo `usuarios/{medicoUid}/agenda/{id}`.

Antes (documento moderno del formulario):

```js
{
  type, title, fecha, hora, startDate, startTime, endDate, endTime,
  allDay, durationMinutes,
  pacienteId, pacienteNombre, patientId, patientName, externalPatient,
  patientPhone, patientEmail, description, notas, ubicacion,
  recordatorio, seguimiento, status, estado, recurrence,
  googleCalendarEventId, syncStatus,
  creadoPor, actualizadoPor, fechaCreacion, createdAt, updatedAt
}
```

Después: la UI conserva ese esquema. Las creaciones del servicio interno usan el mismo documento y aliases de fecha/hora, paciente y estado; añaden únicamente:

```js
{
  timeZone: 'America/Mexico_City', // ejemplo; SIEMPRE tomada de política explícita
  confirmation: {status: 'pending', confirmedAt: null, channel: null},
  payment: {
    required: false, type: 'none', status: 'not_required',
    amount: null, currency: 'MXN', paidAt: null
  },
  reminders: {enabled: false, lastSentAt: null}
}
```

El servicio usa Timestamp para los nuevos metadatos; las cadenas ISO antiguas se preservan. No se hace migración masiva. Los valores ausentes se interpretan en memoria como confirmación pendiente, pago no requerido y recordatorios automáticos deshabilitados. `recordatorio` sigue siendo texto libre histórico, no se interpreta como programación ni se convierte automáticamente en reminders.enabled. No existe un segundo campo scheduled/confirmed/paid dentro de status.

Configuración y coordinación: `appointmentControls/{medicoUid}` es un documento interno, denegado por el bloqueo general de Rules. Contiene exclusivamente `enabled`, `revision`, `policy`; nunca nombres, notas ni copias de citas. `policy` es la ubicación única propuesta y utilizada por este núcleo para zona, jornadas y valores por defecto:

```js
{
  enabled: false, // no activar con la UI actual
  revision: 0,
  policy: {
    timeZone: 'America/Mexico_City',
    weeklyHours: { '1': [{start: '09:00', end: '18:00'}] }, // domingo=0
    allowCancellation: true,
    allowReschedule: true,
    remindersEnabled: false,
    payment: {required: false, type: 'none', amount: null, currency: 'MXN'}
  }
}
```

Los días omitidos están cerrados. Se permite end='24:00'. Los objetos evitan los arrays anidados que Firestore rechaza. minDurationMinutes/maxDurationMinutes son límites opcionales. La política de cancelación implementada se limita a permitir/prohibir; plazos, penalizaciones, devolución y vigencia de cambios deben definirse posteriormente aquí, sin duplicarlos en canales. El pago en la cita es la obligación concreta fijada al crearla, no una segunda configuración del médico; una modificación futura de defaults no altera obligaciones existentes.

## Disponibilidad y concurrencia

getAvailability evalúa un intervalo candidato; no fabrica otra cuadrícula de slots. Valida duración positiva, fechas y aliases coherentes; endTime conserva precedencia sobre duración. Requiere zona IANA y jornada explícitas. Rechaza intervalos locales ambiguos/inexistentes y los que atraviesan un cambio de desfase horario; no adivina el instante. Se comparan intervalos civiles en la zona de la agenda; la UI mantiene el cálculo local histórico mediante la misma función parametrizada.

Considera citas no canceladas, bloqueos, vacaciones y eventos con blocksAvailability=true. Guardias/eventos comunes siguen sin bloquear por defecto, como antes. Conserva [inicio,fin). Expande la recurrencia original desde el ancla para incluir series multidía largas. Los documentos no recurrentes se comparan directamente para detectar duraciones nocturnas que no están reflejadas en endDate. Datos incompletos, zona incompatible o regla recurrente desconocida rechazan disponibilidad. El rango candidato tiene tope 366 días y las series que excederían el límite histórico de 500 ocurrencias producen `recurrence-horizon-exceeded`, nunca un falso libre. Para crear nuevas citas multidía sin endTime se rechaza la ambigüedad existente.

La lectura server-side completa se limita a 2.001 documentos: si hay más de 2.000, falla explícitamente. Esto permite incluir legado sin campos indexados y es una decisión de corrección, NO una optimización. No usa los resultados parciales de cargarEventos. Requiere diseñar/medir consultas indexadas completas antes de una agenda de mayor tamaño. La UI conserva su comportamiento de lectura anterior y ese riesgo queda pendiente.

Cada mutación lee y actualiza la revisión del mismo control por médico dentro de una transacción. Se relee la agenda y se valida disponibilidad dentro de ella. Si dos creaciones compiten, la segunda reintenta con el estado comprometido por la primera y recibe conflicto. El chequeo previo de getAvailability nunca es una reserva. También se comprobó la carrera de reprogramaciones: sólo una ocupa el destino y la cita perdedora permanece intacta.

**La garantía sólo aplica con el control activo y estas Rules desplegadas, para escritores que respeten el protocolo.** SDK Admin omite Rules: cualquier tarea administrativa que escriba agenda deberá adoptar el mismo mutex. Con la UI histórica y control inactivo no hay protección global contra double booking. No se activó ni desplegó nada.

Fundamento de la estrategia: [aislamiento serializable y contención de Firestore](https://firebase.google.com/docs/firestore/transaction-data-contention) y [transacciones de Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions). Las pruebas locales verifican nuestro protocolo; no son una prueba de producción.

## Idempotencia

requestId es obligatorio para cada mutación interna, acotado y sin barras. `appointmentControls/{uid}/requests/{hash(actor,requestId)}` guarda fingerprint SHA-256 del comando validado, appointmentId, acción y timestamp. No guarda payload ni otra cita. Repetir el mismo comando devuelve el mismo ID y replayed=true sin reescribir ni duplicar auditoría. Reutilizar una clave para otro contenido/acción produce idempotency-key-reused. Una operación que falla no crea recibo de éxito. No se añadió TTL: borrar recibos arbitrariamente permitiría repetir una creación antigua; falta acordar retención antes de canales externos.

## Máquina de estados e invariantes

| Acción | Precondición | Resultado |
|---|---|---|
| Crear | Intervalo libre y política válida | status/estado=programada, confirmation=pending; payment=pending si requerido |
| Confirmar | programada; confirmation pending/confirmed; pago requerido sólo si paid | confirmation=confirmed, confirmedAt del servidor, channel=doctor |
| Cancelar | programada; política permite | status/estado=cancelada, confirmation=declined; conserva pago |
| Reprogramar | programada; política permite; nuevo intervalo libre | Mismo ID, nuevos aliases fecha/hora, confirmation=pending; conserva obligación de pago |
| Operar atendida/cancelada | Estado terminal | Rechazo; no reabre |

atendida se conserva como estado histórico terminal; su operación actual de UI no se migró. declined/expired se reconocen, pero no se implementan expiradores ni transición de canal paciente. Pago required=false exige type=none, status=not_required, amount/paidAt=null. Pago requerido exige deposit/full, monto positivo y MXN. Paid exige paidAt. Confirmed exige confirmedAt y pago paid cuando es requerido. Estado cancelada no puede mantener confirmation=confirmed. status y estado no pueden contradecirse. No se implementan reembolsos.

Pago verificado → confirmación automática queda **definido como futuro comando exclusivo del backend**, en la misma transacción y con el mismo recibo/mutex. Deberá autenticar el webhook y verificar cita, monto, moneda, cuenta receptora, identificador de pago y evento antes de establecer paid/paidAt y confirmed/confirmedAt. No existe una opción trusted=true ni un método cliente para registrar pagos. El servicio rechaza campos payment enviados como input; Rules impiden cambiarlos incluso en modo histórico. No se implementó proveedor ni webhook.

## Seguridad, privacidad y auditoría

- El núcleo interno acepta sólo propietario autenticado profesional/admin de su propia agenda y cuenta sin tombstone. Auth deberá venir del contexto del futuro transporte. No admite actor/canal suministrados por clientes, ni acceso de pacientes/WhatsApp todavía.
- getAppointment devuelve fechas, duración, zona y estados mediante una lista explícita de campos. No devuelve nombres, teléfono, correo, notas, diagnóstico, medicamentos, historial ni el documento bruto, tampoco campos extra anidados.
- Los comandos nuevos aceptan una lista cerrada de datos administrativos; reprogramar sólo acepta campos horarios. No permiten inyectar estado, confirmation, payment ni propiedades arbitrarias.
- La autorización de vinculación registrada reutiliza el guard clínico existente. Ese guard realiza lecturas fuera de la transacción de Agenda: falta cerrar la ventana de revocación concurrente y revisar equivalencia de roles UI/backend antes de exponer adaptadores.
- Los éxitos se registran atómicamente en la colección global `auditoria` ya existente con actor/canal/acción/appointmentId/fecha/resultado. No se copian nombres, contactos, notas ni URL. Un replay no duplica la entrada. No se llamó al wrapper de navegador porque añade contexto DOM y escribe por separado.
- No se añadieron logs con datos clínicos ni IDs reales. Los tests usan únicamente datos sintéticos en un proyecto demo local. Los rechazos aún devuelven código sin una entrada persistente de auditoría: la política de auditoría de fallos y su límite de volumen quedan pendientes para el transporte, reutilizando auditoria.
- Las Rules heredadas en modo no transaccional siguen confiando en el propietario para fechas/estados/paciente y permiten la eliminación física. Este riesgo no se declara resuelto. Mi Salud mantiene su problema de acceso a la agenda completa; no se abrieron permisos clínicos.

## F–G. Verificación y límites de evidencia

Se utilizó Node 24.18.0 y Firestore Emulator 1.21.0 con el proyecto `demo-cognicion-agenda`, sin credenciales ni datos de producción.

Resultados de dominio: **20/20 PASS**, cero fallos y cero omitidas. Suite histórica agendaRecurrence: **PASS**. Comparación directa del código extraído contra HEAD: **12/12 fixtures equivalentes** (normalización e intervalos en America/Mexico_City y America/New_York). `node --check` de Agenda, fachada, dominio, servicio y versión: **PASS**. `git diff --check`: **PASS** (sólo advertencias de conversión LF/CRLF, sin errores de whitespace).

Resultado final del emulador: **17/17 PASS**, cero fallos y cero omitidas; comando terminó con código 0, duración del test runner 17.1601549 s. Incluye carreras de creación/reprogramación, idempotencia concurrente, CRUD legado, rechazo de pagos inconsistentes en escritura/lectura y Rules que impiden escrituras cliente y acceso a controles. Los mensajes PERMISSION_DENIED son los rechazos esperados por assertFails, no errores omitidos. Total: **37 pruebas nuevas aprobadas**, además de la suite histórica y la comparación de extracción. No se requirió Firebase de producción.

La cobertura de los 16 mínimos solicitados es: crear (emulador), conflicto (dominio/emulador), adyacencia (ambos), bloqueos (ambos), vacaciones (ambos), duración (ambos), reprogramar sin duplicado (emulador, también concurrente), cancelar (ambos), confirmar (ambos), legado (ambos), mensual día 31 (dominio/suite histórica), concurrencia (emulador), idempotencia repetida y concurrente (emulador), usuario no autorizado (emulador y Rules), pago inconsistente (ambos) y pago requerido pendiente sin confirmar (ambos). Son pruebas del núcleo interno, no de la UI conectada a él.

La primera ejecución del emulador no inició por un problema de sockets locales Java/Windows. Se resolvió usando el JDK 21 ya instalado y un directorio de sockets corto dentro del repositorio; no se cambió la configuración permanente del equipo. La primera ejecución funcional rechazó el fixture con arrays anidados: se corrigió el modelo de jornadas a objetos y se repitió. No se cuentan esas ejecuciones fallidas como pruebas aprobadas.

Comandos reproducibles:

```powershell
node --test tests/appointment-domain.test.mjs
node js/tests/agendaRecurrence.test.mjs
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir="D:\Escritorio\PROYECTO COGNICION\1-back\tmp"'
firebase emulators:exec --only firestore --project demo-cognicion-agenda "node --test --test-concurrency=1 tests/appointment-emulator.test.mjs"
```

Validación manual pendiente: sesión médica real, formulario y edición móvil, vinculación de externo a registrado, series completas, eliminación/atendida y navegación entre meses; entrega HTTP/MIME de los módulos .mjs en el hosting real; despliegue coordinado de Rules/transporte/UI; revisión de datos históricos ambiguos y zona/jornada con cada médico. No hubo prueba visual en navegador ni prueba de producción. Playwright no está disponible en las dependencias del repositorio; no se instaló para esta extracción.

## H. Riesgos, deuda y siguiente fase exacta

El núcleo está preparado y probado para **citas no recurrentes dentro del modo transaccional controlado**. La Agenda completa NO está aún migrada a una única vía segura de escritura. Por ello no se afirma el criterio global de éxito solicitado.

Antes de iniciar WhatsApp:

1. Resolver semántica de series ilimitadas/excepciones y su exclusividad; extender el mismo servicio a eventos, guardias, bloqueos, vacaciones, series, atendida y eliminación. Actualmente no permite mutar citas recurrentes ni esos otros tipos; sí los considera al calcular disponibilidad.
2. Definir con los médicos zona/jornada, semántica de duraciones multidía antiguas, overrides autorizados y política de cancelación; no precargar horarios inventados. Inventariar conflictos antiguos sin borrarlos.
3. Conectar TODAS las escrituras de Agenda a un transporte autenticado del servicio y dar feedback de conflicto/idempotencia. Sólo entonces activar control junto con Rules. No activar enabled=true con el formulario actual: quedaría correctamente impedido de escribir.
4. Cerrar la revocación concurrente de acceso de pacientes, dar una proyección propia a Mi Salud y auditar rechazos con controles de volumen. No ampliar lectura de agenda completa a pacientes.
5. Medir tamaño/latencia/lecturas para sustituir el snapshot acotado por consultas completas e índices verificables; revisar carreras de carga entre meses, fallos parciales y textos que se pierden al editar.
6. Repetir pruebas de integración y recorrido manual completo. Sólo después de revisar ese resultado, abordar la fase expresamente solicitada de WhatsApp Business Platform + webhook + identificación segura + agendamiento conversacional.

No se añadió WhatsApp, chatbot, SOFÍA, proveedor de pago, correo, recordatorio programado ni colección duplicada de citas. No se hicieron commits, push, ramas ni worktrees.

Deuda adicional de ciclo de vida: integrar eliminación de controles/recibos con el flujo existente de eliminación de cuenta y acordar retención, sin invalidar inadvertidamente la idempotencia. Revisar cualquier campo de pago histórico antes de activar la frontera: un dato escrito anteriormente por cliente no equivale a comprobación de proveedor.

Estado Git: main; 0 commits por delante y 0 por detrás de la referencia local origin/main al cierre. No se ejecutó fetch ni se afirmó que esa referencia refleje cambios remotos más recientes. Los cambios previos de farmacología y otros módulos permanecen fuera de esta tarea.

---

# Migración de la interfaz al núcleo transaccional

Fecha: 2026-09-07. Esta fase sustituye las escrituras directas de **citas** de `js/agenda.js` por el callable autenticado `manageAppointment`; no cambia el CRUD de eventos, bloqueos, guardias, vacaciones u otros tipos.

## Matriz de rutas encontradas

| Operación | Archivo y función UI | Escritura previa | Destino | Estado |
|---|---|---|---|---|
| Crear cita desde formulario, Nueva cita o día del calendario | `js/agenda.js`, submit de `formCita` | `addDoc` | `createAppointment` vía `manageAppointment` | Migrada |
| Editar sin alterar horario, incluida vinculación de externo | `js/agenda.js`, submit/`editarEvento` | `updateDoc` | `updateAppointment` | Migrada |
| Reprogramar fecha, hora, final, duración o recurrencia | `js/agenda.js`, submit/`cambioHorarioCita` | `updateDoc` | `rescheduleAppointment` | Migrada |
| Confirmar | Nuevo control mínimo `data-confirmar` en la tarjeta | No existía acción separada | `confirmAppointment` | Migrada/nueva |
| Marcar atendida | `marcarAtendida` | `updateDoc` | `completeAppointment` | Migrada |
| Cancelar | Nuevo control mínimo `data-cancelar` | Antes sólo había eliminación física | `cancelAppointment` | Migrada; conserva historial |
| Eliminar cita | `eliminarEvento` | `deleteDoc` | No aplica | Eliminada de la UI para citas; queda sólo para no-citas |
| Crear/editar/eliminar evento, bloqueo, guardia, vacaciones, otros | submit/`eliminarEvento` | SDK Firestore | CRUD existente | Fuera de alcance, no migrada |
| Arrastrar, resize, popover, modal, masiva, generador de citas | búsqueda estática del checkout | No encontrado | — | No existe |
| Recurrencia de citas | mismo formulario, regla en documento | `addDoc`/`updateDoc` | create/reschedule transaccional con validación de 500 ocurrencias | Migrada, con límite documentado |

No se encontraron otras escrituras de `usuarios/{uid}/agenda` fuera de Agenda. `js/mi-salud.js` sólo intenta leer esa colección; no escribe y su defecto de permisos sigue fuera de esta fase.

## Arquitectura y flujo resultantes

```text
Agenda UI
  ├─ cita → appointmentCommandService → callable manageAppointment
  │          → Appointment Service transaccional → usuarios/{doctorUid}/agenda
  └─ otro tipo de Agenda → SDK Firestore heredado → misma subcolección
```

El callable deriva `doctorUid` únicamente de Firebase Auth verificado; el navegador no puede escogerlo. Genera un `requestId` nuevo por intención de usuario, deshabilita el control durante la operación y el backend conserva la garantía real de idempotencia. Crear activa el control interno del médico sólo si no existía; no hay activación masiva. Un control existente con `enabled:false` continúa rechazando los comandos, para no saltar una desactivación administrativa explícita.

Creación y reprogramación vuelven a validar disponibilidad dentro de la transacción. La edición sin horario admite sólo metadatos administrativos permitidos; no puede modificar fecha/hora como atajo. Vincular a un paciente registrado es precisamente una edición administrativa del mismo documento: valida la relación profesional-paciente existente, actualiza `patientId`/aliases, pasa `externalPatient` a false y no crea otra cita.

Confirmar, cancelar y atender son transiciones de dominio. Se reemplazó el botón de eliminar de una cita por Cancelar cita; la eliminación física se conserva exclusivamente para elementos no-cita porque una cita requiere conservar estado y auditoría. El control Confirmar es mínimo y usa el mismo comando que podrá reutilizar un canal futuro.

La UI traduce los códigos del dominio a mensajes sin detalles internos y siempre recarga la Agenda después de error o éxito. Conflicto, estado terminal, autorización, idempotencia y pago pendiente dejan el documento sin una escritura cliente alternativa. Los `console.warn` no incluyen datos clínicos y se mantienen para QA manual.

## Recurrencia, zona y jornada

La recurrencia sigue siendo una regla en el único documento; no se generan documentos infinitos. Para una cita recurrente, el servicio valida las primeras 500 ocurrencias antes de escribir y usa la misma expansión mensual con día ancla 31. Para solicitudes posteriores a la ventana segura de una serie existente devuelve `recurrence-horizon-exceeded`, en vez de declarar un horario libre. Esto conserva la regla y evita un falso negativo de conflicto, pero es una deuda de producto: requiere modelar fin de serie/excepciones o un algoritmo de intersección de series antes de prometer disponibilidad ilimitada.

No hay una zona horaria ni jornada guardada actualmente. El primer control utiliza la política explícita `availabilityMode: legacy-civil`: compara los campos civiles `YYYY-MM-DD` y `HH:mm` exactamente como la Agenda histórica, sin tomar accidentalmente la zona del navegador ni inventar jornadas. No almacena una IANA falsa. Los controles configurados posteriormente con `timeZone` y `weeklyHours` continúan usando el modo estricto del núcleo. Por ello WhatsApp no debe consultar disponibilidad hasta que cada profesional tenga una zona IANA y horario explícitos.

## Seguridad, Rules y rendimiento

Cuando existe `appointmentControls/{uid}` habilitado, Rules deniegan create/update/delete cliente de documentos que son citas modernas (`type:appointment`) o citas antiguas identificadas por campos de paciente. También deniegan convertir un evento en cita. Mantienen permitido el CRUD de los otros tipos. Rules bloquean siempre payment, confirmation y reminders desde el SDK cliente. Admin SDK sigue omitiendo Rules y debe usar el mismo servicio.

Antes: una creación de cita hacía una escritura Firestore y una auditoría separada, tras tres consultas de recarga; no había llamada backend. Después: una llamada callable, una transacción que escribe cita/control/recibo/auditoría y las mismas tres consultas de recarga. No se añadieron listeners ni consultas por render. La transacción lee hasta 2,000 documentos para compatibilidad de legado; es correcta pero todavía no está optimizada para agendas grandes.

## Evidencia de migración

- Dominio: 27/27 PASS.
- Emulador Firestore: 23/23 PASS. Incluye creación registrado/externo, vinculación posterior, actualización, reprogramación concurrente, cancelación, confirmación, atendida, doble petición, two-client conflict, [start,end), bloqueos, vacaciones, recurrencia mensual día 31, citas antiguas, autorización, pago pendiente/inconsistente y Rules.
- Prueba estática de UI: 4/4 PASS. Verifica las seis acciones, el retorno antes del branch SDK, el adaptador callable sin escrituras Firestore y UID derivado en backend.
- `node --check` de UI, adaptador, dominio, servicio e índice Functions: PASS. Carga de `functions/index.js`: PASS. Recurrencia histórica: PASS. `git diff --check`: PASS.

No hubo prueba de navegador autenticado ni deploy de Cloud Functions/Rules; no se presentan como ejecutados.

## Checklist QA manual

1. Con sesión de médico, crear una cita con paciente registrado y otra externa; doble clic no debe duplicar.
2. Editar sólo notas/ubicación/recordatorio/seguimiento y verificar mismo ID/horario.
3. Vincular la externa a un paciente ya autorizado; verificar un documento, sin duplicado.
4. Reprogramar a libre, después intentar a ocupado desde otra pestaña; mostrar conflicto y recargar.
5. Confirmar, cancelar y marcar atendida; verificar estados y que una cancelada deja libre el horario.
6. Intentar crear en bloqueo y vacaciones; debe rechazar sin diálogo de override.
7. Crear y editar recurrencia mensual iniciada el 31; revisar febrero/abril/mayo y que vuelve a 31.
8. En móvil, repetir creación, edición, cancelación y botones de tarjeta.
9. Verificar eventos, guardias, bloqueos, vacaciones y eliminación de no-citas para asegurar que su CRUD histórico conserva comportamiento.
10. Tras publicar Functions y Rules juntas, inspeccionar consola de red: sólo `manageAppointment` muta citas; probar que un SDK cliente no puede cambiar horario, confirmation ni payment.status.

## Decisión de salida de esta fase

A. Las rutas UI de citas encontradas pasan por el dominio seguro: **sí, con evidencia estática y de emulador**.

B. Cliente puede saltarlo tras activarse el control: **no**, probado por Rules para creación, cambio horario y eliminación; Rules también cubren las citas antiguas identificables.

C. Cliente puede marcar paid: **no**, probado y denegado por Rules/dominio.

D. Double booking bajo concurrencia: **no**, en el protocolo transaccional probado; no es una afirmación sobre escritores Admin SDK ajenos al servicio.

E. Citas antiguas: **sí**, normalización y transición sin migración destructiva, probado.

F. Agenda visual: **pendiente de QA manual autenticado**. La cobertura automática es estática, no sustituye navegador.

G. Rules restrictivas: **preparadas para activación gradual por médico**, no activadas globalmente. Un médico se protege al primer comando transaccional; el deployment conjunto sigue pendiente.

**GO para activar protección transaccional masiva: NO**, hasta ejecutar la checklist en producción/local autenticado, desplegar callable y Rules conjuntamente, medir agendas grandes y resolver/aceptar formalmente el límite de 500 recurrencias.

**GO para iniciar WhatsApp: NO.** Primero se necesita QA manual aprobado, zona IANA y jornada configurada por profesional, resolución de series ilimitadas y una auditoría de cualquier escritor Admin SDK futuro. No se implementó WhatsApp ni pagos.

Versión de esta fase: **2.188 → 2.189**.
