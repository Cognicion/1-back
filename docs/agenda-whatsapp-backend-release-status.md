# Release backend Agenda + WhatsApp — cierre ejecutado

8 de septiembre de 2026. Proyecto `cognicion-57052`; Firestore `(default)` en `northamerica-south1`. Release delimitada autorizada y completada. **Bot detenido, Scheduler pausado, recordatorios y pagos deshabilitados. No se publicaron archivos frontend ni se enviaron mensajes reales.**

## Código y alcance

Repositorio canónico: `D:\Escritorio\PROYECTO COGNICION\1-back`, rama `main`, HEAD `6223c45eaa60affd8bf0db57924e65f128c5bce1`. Versión local compartida: **2.197**, sin incremento adicional por el ajuste de infraestructura. El frontend continúa fuera de esta release. No hubo commit ni push. La referencia local `origin/main` tiene divergencia 0/0; esto no implica que el árbol de trabajo esté limpio.

Se preservaron los cambios preexistentes de farmacología, pacientes, SOFÍA y otros módulos. El diff de `functions/index.js` sólo conecta el runtime del bot al webhook existente y añade sus exports. Las cuatro Functions OAuth y las otras Functions ajenas al alcance conservan exactamente su `updateTime`: **40 Functions preexistentes sin cambios**. El proyecto pasó de 42 a 46 Functions.

El manifiesto `agenda-whatsapp-release-manifest.json` contiene 41 archivos. Conserva los hashes anteriores en las enmiendas revisadas; no se regeneró para aceptar cambios ajenos. La revisión incluyó Rules completas, cambios de Appointment Service y webhook, módulos nuevos y configuración de despliegue.

Cambios localizados de esta ejecución:

- `functions/whatsappBot/index.js`: región de ejecución de los tres procesos de fondo a `us-central1`; no modifica lógica de citas, transporte ni OAuth.
- `tests/whatsapp-bot-deployment.test.mjs`: verifica metadatos reales del SDK, región, filtros, reintentos y programación.
- `scripts/agenda-bot-release-ops.cjs`: verificaciones saneadas, metadatos, stop del canal, TTL y pruebas negativas; nunca lee payloads de Secret Manager.
- `docs/agenda-whatsapp-administrative-delivery.md`: aclaración del alcance posterior y corrección de la región operativa.
- Manifiesto y este informe actualizados.

## Recursos e índices

| Recurso | Campos / alcance | Estado |
|---|---|---|
| Índice nuevo `agenda`, ID `CICAgNjpgYIK` | `startDate ASC, endDate ASC`, COLLECTION | READY |
| Índice nuevo `whatsappBotJobs`, ID `CICAgNiroIEK` | `state ASC, dueAt ASC`, COLLECTION | READY |
| Índice previo `agenda`, ID `CICAgNiav4AK` | `startAt ASC, endAt ASC`, COLLECTION | READY |
| Los otros ocho índices previos | Conservados | READY |

**Once índices READY**, sin recrear ni borrar ninguno. Las Functions dependientes se desplegaron después de verificarlo.

Se creó únicamente la configuración de detención `whatsappBotConfig/channel`, con `enabled=false`, `pilot=true`, `allowedSubjects=[]` y `professionalIds=[]`. Actualmente hay **cero destinatarios y cero profesionales habilitados**. No se adivinó un teléfono, UID o activo Meta. El soporte del piloto está publicado; su configuración nominal requiere los datos administrativos explícitos del operador.

## Secret Manager e IAM

El usuario creó los secretos; esta ejecución verificó nombres y versiones habilitadas, sin recuperar, mostrar ni guardar valores. Se vinculó `roles/secretmanager.secretAccessor`, limitado a `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_IDENTITY_KEY`, a la cuenta runtime `1037684177162-compute@developer.gserviceaccount.com`.

Se conservó el permiso KMS existente `roles/cloudkms.cryptoKeyEncrypterDecrypter` sobre `refresh-tokens`. El parámetro `GOOGLE_CALENDAR_KMS_KEY_NAME` se cargó desde el .env ignorado y su referencia coincide en las seis Functions. No se modificó la clave, los secretos OAuth ni el flujo Google Calendar.

La cuenta runtime ya tenía `roles/editor`, `roles/eventarc.eventReceiver` y `roles/run.invoker`; no se añadieron estos roles de proyecto. Scheduler invoca mediante OIDC con esa cuenta. Los tres endpoints de fondo rechazan invocaciones anónimas.

La existencia de una versión habilitada de ACCESS_TOKEN **no demuestra permisos, vigencia ni asignación correcta en Meta**. La longitud/entropía del valor de IDENTITY_KEY tampoco se inspeccionó: se respeta la prohibición de acceder a su contenido. El callable validará su uso al configurar el destinatario.

## Rules publicadas

Rules completas desplegadas correctamente. Diff: sólo diez bloques nuevos `allow read, write: if false` para Config, Professionals, Jobs, Sessions, Recipients, Bindings, Outbox, MessageIds, Rate y AppointmentOwners del bot. Los vínculos anidados quedan bajo el rechazo recursivo. No se relajaron reglas existentes de Agenda, OAuth o recepción WhatsApp.

Ruleset: `projects/cognicion-57052/rulesets/b22d9fad-9c63-4046-9eb3-60a5aeff12bf`.

SHA-256 normalizado LF, coincidente entre archivo local y Rules desplegadas:
`e9a86dfdd6e27df0bba487ef2741d3c3a4a0c5e7c1e07ac9864300879bc4517b`.

El compilador mostró advertencias preexistentes en `validProvisionalPatientCreate`; se comprobó que ese bloque coincide con HEAD y no se modificó.

## Functions publicadas

Todas **ACTIVE**, Gen 2, Node.js 24, ejecución en **us-central1**. Versiones secretas vinculadas: 1; sólo se enumeran nombres.

| Function | Resultado | Secrets |
|---|---|---|
| manageAppointment | Actualizada | Ninguno |
| whatsappWebhook | Actualizada, URL conservada | WHATSAPP_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_IDENTITY_KEY |
| configureWhatsAppBot | Creada | WHATSAPP_IDENTITY_KEY, WHATSAPP_ACCESS_TOKEN |
| whatsappBotWorkCreated | Creada | WHATSAPP_ACCESS_TOKEN |
| whatsappBotDrain | Creada | WHATSAPP_ACCESS_TOKEN |
| whatsappBotAppointmentChanged | Creada | WHATSAPP_ACCESS_TOKEN |

Eventarc en `northamerica-south1`, ambos con reintentos y origen `(default)`:

- `whatsappbotworkcreated-271619`: creación de `whatsappBotJobs/{jobId}` → whatsappBotWorkCreated en us-central1.
- `whatsappbotappointmentchanged-318564`: escritura de `usuarios/{doctorUid}/agenda/{appointmentId}` → whatsappBotAppointmentChanged en us-central1.

Scheduler `firebase-schedule-whatsappBotDrain-us-central1`: cada minuto, UTC, **PAUSED**. El Scheduler previo `cleanupExpiredCloudReservations` permanece ENABLED cada 60 minutos, sin modificaciones.

URLs comprobadas:

- https://us-central1-cognicion-57052.cloudfunctions.net/manageAppointment
- https://us-central1-cognicion-57052.cloudfunctions.net/whatsappWebhook
- https://us-central1-cognicion-57052.cloudfunctions.net/configureWhatsAppBot
- Scheduler, invocación autenticada: https://us-central1-cognicion-57052.cloudfunctions.net/whatsappBotDrain
- Cloud Run privado WorkCreated: https://whatsappbotworkcreated-hquasctbdq-uc.a.run.app
- Cloud Run privado AppointmentChanged: https://whatsappbotappointmentchanged-hquasctbdq-uc.a.run.app

Se conservó habilitada la exclusión `whatsapp_webhook_verify_get` del sink `_Default`, que excluye los request logs GET automáticos de `whatsappwebhook` en us-central1. No se usaron verify tokens en pruebas ni se registraron parámetros sensibles.

## TTL y retención

Siete políticas `expiresAt` están **ACTIVE**:

`whatsappBotJobs`, `whatsappBotSessions`, `whatsappBotOutbox`, `whatsappBotRecipients`, `whatsappBotMessageIds`, `whatsappBotAppointmentOwners`, `whatsappBotAppointmentBindings`.

Once exenciones de índices de campo verificadas: esos siete `expiresAt`, `encrypted` de Jobs/Sessions/Outbox y `phone` de Recipients. Este último contiene el sobre cifrado, no un teléfono en claro. No se alteraron índices de datos clínicos. TTL es asíncrono; no promete borrado al segundo de la expiración. Antes y después no había documentos en estos siete grupos; los recibos técnicos históricos no se convirtieron en trabajos.

## Incidencias resueltas durante la release

1. La configuración inicial confundía región de Firestore con región de ejecución: Google rechazó con HTTP 403 la creación de las tres Functions en northamerica-south1. Se corrigió sólo `options.region` a us-central1; Firebase resolvió automáticamente los triggers Eventarc en la ubicación de la base. Es coherente con el patrón que ya existe en el proyecto. [Regiones de Functions](https://firebase.google.com/docs/functions/locations).
2. El CLI exigió confirmar los reintentos nuevos. Se aceptó la confirmación puntual ya autorizada mediante sesión interactiva, sin `--force`.
3. Un intento falló al listar Functions antes de publicar. La lectura remota directa funcionó; el reintento del mismo despliegue selectivo terminó correctamente. No se cambiaron transportes ni permisos para sortearlo.
4. La comprobación REST de Rules necesitó indicar el proyecto consumidor con `x-goog-user-project`; después coincidió el hash. No se habilitaron APIs ajenas para corregir esa comprobación.
5. Se mantuvieron TEMP/TMP en D: y se deshabilitó únicamente el archivo local de log de gcloud mediante variable de proceso, debido al espacio crítico previo de C:. No se limpió disco ni se alteró Cloud Logging remoto. No se reinstalaron SDKs ante la advertencia de versión del CLI.

## Pruebas y evidencia por entorno

| Entorno / evidencia | Resultado exacto |
|---|---|
| Node + Firestore Emulator + Chrome aislado, proyecto demo, Java 21 | **187/187 PASS**, 0 FAIL, 0 SKIP; 133.510302 s |
| Nueva regresión de despliegue | Incluida en las 187, no sumada dos veces |
| Callables reales sin autenticación | 2/2 rechazan con 401 UNAUTHENTICATED |
| Webhook real: GET sin verificación, POST sin HMAC, PUT | 403, 403, 405; 3/3 |
| Tres Functions de fondo, invocación anónima | 3/3 rechazan con 403 |
| Lecturas anónimas de diez colecciones server-only | 10/10 rechazan con 403 PERMISSION_DENIED |
| Total de smoke negativo post-deploy | **18/18 PASS**, sin sumar las repeticiones de las mismas pruebas |
| Rules locales vs desplegadas | Hash idéntico |
| Metadatos Functions | 6 ACTIVE, 40 ajenas sin cambios, región/secrets/KMS comprobados |
| Índices / TTL | 11 READY / 7 ACTIVE |
| Sintaxis, manifiesto y git diff --check | PASS |
| Conversación real, envío/entrega Meta, creación real controlada | **NO EJECUTADOS**, requieren autorización posterior |
| OAuth real | Autorización previa del usuario conservada; no repetida ni revocada |

Las 187 incluyen Appointment Service transaccional, recurrencias modernas/históricas, disponibilidad, Rules, Google Calendar, webhook, máquina de estados, identidad, concurrencia, idempotencia, fallos antes/después de persistencia, envío incierto, consentimiento, recordatorios y pagos bloqueados. Cloud API y KMS están simulados en el entorno demo; eso no prueba un envío real ni permisos efectivos del token Meta. La regresión de Chrome utiliza Firestore SDK real contra el emulador y distingue el cierre TYPE=terminate. El QA visual histórico no se presenta como nueva evidencia post-deploy ni como OAuth real.

La planificación de consultas en Firestore remoto, sobre un padre ficticio y con `analyze:false`, produjo:

- Civil con orden explícito startDate/endDate: **HTTP 200**, índice nuevo utilizado.
- Moderna con orden explícito startAt/endAt: **HTTP 200**, índice previo utilizado.
- Legacy por fecha: **HTTP 200**.
- Civil antigua con orden implícito: **HTTP 400 FAILED_PRECONDITION**. La release separada del frontend debe incluir el `orderBy` corregido; **no se afirma que la Agenda pública antigua esté corregida sólo por desplegar el índice**.

El script de auditoría obtuvo los cuatro resultados, pero falló después al intentar verificar contenido del sitio: no se reporta esa ejecución completa como PASS. La última comparación previa situaba el sitio en 2.194; esta release no actualizó el frontend ni sus referencias de caché.

Evidencia local, sin payloads ni credenciales: `.tmp/bot-tests/results.txt`, `release-regressions.log`, `functions-before-release.json`, `functions-after-release.json`, `backend-negative-smoke.json`, `remote-audit-after-index.jsonl` y comprobaciones finales. Los archivos temporales quedan en D: e ignorados por Git.

## Estado operativo y requisitos externos agrupados

- **Bot:** desplegado y detenido; cero destinatarios configurados, cero profesionales habilitados. La selección nominal de UN profesional y UN destinatario sigue pendiente. No buscar expedientes por coincidencia telefónica.
- **Meta:** confirmar en la cuenta existente WABA, Phone Number ID, versión Graph vigente, asignación/permisos/vigencia del token, restricciones del número de prueba y destinatario verificado. No se consultó el valor del token ni se repitió la verificación GET. No se afirma que una muestra sintética permita recibir de cualquier usuario. No migrar ni interrumpir el WhatsApp empresarial.
- **Recordatorios:** deshabilitados. Faltan comprobación de plantilla realmente APPROVED y consentimiento válido; no se enviaron ni se simuló aprobación.
- **Pagos:** deshabilitados, sin proveedor/cuenta beneficiaria configurados. Las modalidades con pago obligatorio se rechazan; no hay checkout ficticio ni confirmación sin pago.
- **Agenda:** frontend 2.197 no publicado. Para ver la cita real durante QA se necesita la interfaz local autenticada compatible o una publicación separada autorizada. El harness de mocks no sirve para comprobar una cita real.
- **Google Calendar:** no se modificó OAuth. La autorización real previa del usuario no está pendiente de repetición; resta confirmar estado persistido, documento server-only, token cifrado y UI cuando corresponda. No hay Free/Busy ni sincronización en este bot.
- **Permiso pendiente:** el smoke de conversación/envío y creación controlada requiere la autorización posterior expresa del usuario. Esta release no la presupone.

## Comandos de comprobación y despliegue reproducibles

Desde el repositorio canónico; no recrear índices/secretos ya existentes y no ejecutar `snapshot` de nuevo, pues contiene la línea base anterior a la release:

```powershell
Set-Location -LiteralPath 'D:\Escritorio\PROYECTO COGNICION\1-back'
$env:CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true'
$env:TEMP=Join-Path $PWD '.tmp/bot-tests'
$env:TMP=$env:TEMP
node scripts/check-agenda-bot-release.cjs
node scripts/agenda-bot-release-ops.cjs indexes
node scripts/agenda-bot-release-ops.cjs field-status
node scripts/agenda-bot-release-ops.cjs verify-rules
node scripts/agenda-bot-release-ops.cjs functions --complete
node scripts/agenda-bot-release-ops.cjs status
node scripts/agenda-bot-release-ops.cjs smoke
```

Secuencia efectivamente utilizada: IAM limitado → canal detenido → índices READY → TTL/exenciones → Rules → seis Functions seleccionadas → corrección regional probada y reintento sólo de las tres pendientes → pausa Scheduler → verificaciones. Comandos principales ya ejecutados, no pendientes:

```powershell
firebase.cmd deploy --project cognicion-57052 --only firestore:rules --non-interactive
firebase.cmd deploy --project cognicion-57052 --only functions:manageAppointment,functions:whatsappWebhook,functions:configureWhatsAppBot,functions:whatsappBotWorkCreated,functions:whatsappBotDrain,functions:whatsappBotAppointmentChanged
# Tras la corrección de región, únicamente las tres que habían fallado:
firebase.cmd deploy --project cognicion-57052 --only functions:whatsappBotWorkCreated,functions:whatsappBotDrain,functions:whatsappBotAppointmentChanged
gcloud.cmd scheduler jobs pause firebase-schedule-whatsappBotDrain-us-central1 --location=us-central1 --project=cognicion-57052 --quiet
```

## UNA conversación real futura — no ejecutarla todavía

1. Obtener autorización específica del smoke y reservar una ventana de QA con el profesional. Confirmar que el único teléfono piloto es destinatario permitido del número de prueba Meta. No usar pacientes existentes ni mandar mensajes a terceros.
2. Con el administrador autenticado, abrir la configuración WhatsApp de la Agenda compatible local. Configurar WABA, Phone Number ID, versión Graph, **un UID profesional validado** y **un teléfono piloto**, canal inicialmente detenido. Los valores se introducen en los controles administrativos; nunca secretos. Confirmar que se devuelve un destinatario autorizado. Si se usa el frontend público antiguo, esa configuración UI todavía no está publicada: no usar los mocks como sustituto.
3. Verificar jornada real, zona IANA, duración de servicio y política sin pago. Guardar inicialmente el profesional detenido y recordatorios desmarcados. No cambiar políticas de citas reales sin acordarlo con el profesional.
4. Dentro de la ventana autorizada, habilitar el canal piloto y después el profesional; ese orden respeta la validación del callable. Mantener recordatorios deshabilitados. Reanudar únicamente el Scheduler del bot para recuperación de trabajos:

```powershell
gcloud.cmd scheduler jobs resume firebase-schedule-whatsappBotDrain-us-central1 --location=us-central1 --project=cognicion-57052 --quiet
```

5. Desde el teléfono autorizado: **hola → agendar → servicio → fecha o próximos → horario concreto → nombre administrativo de QA → No autorizar recordatorios → revisar fecha completa/hora/zona → Confirmar operación**. Esperar “Cita guardada en COGNICIÓN”; comprobar una sola cita persistida en Agenda autenticada. No atribuir entrega al simple message ID de Graph.
6. En la misma conversación: **confirmar → elegir esa cita → Confirmar operación**; después **reprogramar → elegirla → nueva fecha/horario → Confirmar operación**. Verificar que conserva el documento original. Finalmente **cancelar → elegirla → Confirmar operación**; verificar estado cancelada, sin borrado físico. No repetir botones vencidos para forzar acciones.
7. Detener profesional y canal desde Configuración. Si falla la UI, un administrador cambia únicamente `whatsappBotConfig/channel.enabled=false` en Firestore Console. Pausar el Scheduler con el comando anterior de `pause`. Conciliar un estado de envío incierto antes de cualquier reintento manual; no reenviar a ciegas.

Criterio de aceptación de esa prueba futura: un destinatario autorizado, una cita externa controlada, sin duplicados, mismo documento al reprogramar, cancelación de dominio y ningún dato ajeno revelado. La producción abierta, los recordatorios reales y los pagos no quedan autorizados por completar ese smoke.

Rollback delimitado: primero canal detenido y Scheduler pausado; conservar citas, recibos, Rules server-only, índices y TTL. Cualquier restauración de código usa únicamente un artefacto previamente revisado, sin reset destructivo ni redeploy de OAuth u otros módulos. Una petición saliente ya iniciada no se puede retirar; en esta release no hubo envíos.
