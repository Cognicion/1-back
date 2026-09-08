# Agenda y WhatsApp administrativo — entrega local, 8 de septiembre de 2026

> Registro original de implementación. La autorización posterior excluye expresamente el frontend. El estado ejecutado, la corrección de región y las limitaciones verificadas después de crear índices están en `agenda-whatsapp-backend-release-status.md`; las referencias a recursos ausentes y autorización pendiente de este documento son históricas.

Implementación funcional terminada en local; pendiente autorización de release y piloto real. No se ejecutaron deploy, commit, push, mensajes reales, cobros ni modificaciones de pacientes/credenciales. No se repitió ni revocó OAuth. Automatización ausente/deshabilitada por defecto; el código sólo acepta modo piloto y destinatarios autorizados.

## 1. Base y fallos de Agenda

Repositorio canónico: `D:\Escritorio\PROYECTO COGNICION\1-back`, rama `main`, HEAD `6223c45`. Divergencia comprobada con la referencia local `origin/main`: 0/0, sin modificar historial. La base local era 2.195 con cambios pendientes de recurrencia y Agenda. Este trabajo reservó 2.196. Durante la ejecución otro trabajo incrementó la versión compartida a **2.197**; se conservó y se alinearon `agenda.html` y su CSS/JS con 2.197. El marcador de este trabajo conserva su procedencia 2.196. No se atribuyen los cambios farmacológicos concurrentes a esta entrega.

### FAILED_PRECONDITION: causa demostrada, corrección preparada

La lectura de `js/agenda.js` hacía tres consultas: fecha legacy, solapamiento civil y recurrencias. Su diagnóstico ocultaba el mensaje dejando prácticamente sólo `code`. Ahora cada fallo conserva operación, fuente y forma estática de consulta, con mensaje saneado: no incluye valores de filtros, rutas de usuarios, URL de consola con datos, teléfonos ni pacientes.

La consulta real que falla es:

```js
collection(db, 'usuarios', uid, 'agenda')
where('startDate', '<=', finDelRango)
where('endDate', '>=', inicioDelRango)
orderBy('startDate', 'asc')
orderBy('endDate', 'asc')
```

El índice necesario es **agenda / COLLECTION / startDate ASC, endDate ASC**. Ya estaba declarado localmente, pero falta remotamente. No es el índice de instantes ni un índice COLLECTION_GROUP.

Evidencia independiente de mocks: `scripts/audit-agenda-release.cjs` ejecutó `runQuery` con `explainOptions.analyze:false` sobre un padre ficticio inexistente, sin obtener documentos clínicos. Ambas formas civiles, implícita y explícitamente ordenada, devolvieron HTTP 400, FAILED_PRECONDITION, `no matching index found.`. La consulta moderna ordenada `startAt/endAt` devolvió HTTP 200 y plan `(startAt ASC, endAt ASC, __name__ ASC)`, alcance Collection. La consulta legacy por `fecha` devolvió HTTP 200. El índice remoto de instantes sigue READY; no se recreó.

El controlador de Agenda conserva el estado de carga incompleta y el reintento; no convierte errores en una agenda vacía. La transacción de Appointment Service también ordena explícitamente la consulta moderna para utilizar el índice READY. La consulta de ocupación del bot tiene su propio conjunto completo de lecturas transaccionales y no depende del resultado visual auxiliar de Agenda.

**El error de producción aún necesita la creación del índice civil y esperar READY. No se declara solucionado remotamente por modificar código local.**

### TYPE=terminate y bloqueo del navegador

Chrome aislado, sin extensiones ni perfil personal, ejecutó el SDK Firestore 10.12.2 real contra Firestore Emulator. La consulta civil devolvió un documento ficticio con `fromCache:false`. Al llamar `terminate`, se observó un POST con `TYPE=terminate`. No hubo ERR_BLOCKED_BY_CLIENT; se observaron dos ERR_ABORTED de streams cancelados durante el cierre.

Esto demuestra que `TYPE=terminate` es una petición de cierre, no la explicación del índice ausente. No demuestra qué extensión/política intervino en el perfil personal ni que todas sus lecturas funcionen. No se cambió transporte, proxy, antivirus, firewall ni perfil. Si persiste sólo en ese perfil tras publicar el índice: **en el bloqueador del navegador, permite las peticiones a `firestore.googleapis.com` únicamente para `cognicionlabs.com`**. No realizar excepciones globales.

### BIOCELULAR LOGIN y caché

El diagnóstico de layout del tema buscaba el elemento de login también en Agenda y advertía su ausencia esperada. Se limitó esa advertencia al contexto real de login; se conservan errores inesperados. No se rediseñó Agenda ni se silenció la consola globalmente.

Se compararon hashes SHA-256 con saltos de línea normalizados, no sólo query strings: `agenda.html`, `js/agenda.js`, `js/config/appVersion.js` y `functions/appointments/recurrence.mjs` servidos coinciden con HEAD; el sitio sirve **2.194**, distinto del árbol local. Las referencias locales de Agenda ya coinciden con 2.197. El service worker existente usa network-only para HTML/Firebase y network-first para módulos JS sin versión; el módulo de recurrencias `.mjs` sigue red normal. No hizo falta vaciar cookies, sesiones o almacenamiento del usuario ni modificar el worker global.

Backend remoto: manageAppointment ACTIVE, Node.js 24, us-central1, actualización `2026-09-08T10:08:10.835895592Z`. whatsappWebhook y las cuatro Functions OAuth también figuraron ACTIVE. Esto verifica existencia/estado, no equivalencia binaria con el código local modificado.

## 2. Bot implementado

Flujo: firma HMAC del webhook existente → recibo técnico y trabajo cifrado en transacción antes del ACK → trigger Firestore con recuperación por Scheduler → sesión administrativa → adaptador autorizado → Appointment Service compartido → outbox durable → Cloud API.

- Menú determinista: hola, menú, agendar, confirmar, reprogramar, cancelar, ayuda, salir, recordatorios y dejar de recibir recordatorios. Botones/listas ligados a una transición y vencimiento de 15 minutos. Un “sí” aislado o un botón viejo no autoriza operaciones.
- Selección explícita de profesional si hay varios; catálogo administrativo de servicio/modalidad y duración configurado por el profesional. No hay UID hardcodeado ni UID aceptado desde el paciente.
- Fecha completa o hoy/mañana/próximos en zona del profesional; próximos explora hasta siete días, muestra hasta ocho opciones y permite otras fechas dentro de 90 días y la política existente.
- Horarios del dominio real, datos mínimos de paciente externo, consentimiento, resumen con fecha/hora/zona/duración, confirmación explícita y éxito sólo después de persistir. Si ocurre conflicto, se conserva la cita anterior y se solicita otro horario.
- Confirmación/cancelación de dominio; reprogramación sobre el mismo documento. Las citas ajenas no se consultan ni se autorizan por coincidencia telefónica. Una cita previa requiere vinculación explícita del profesional a un destinatario permitido; esta vinculación está disponible en Configuración de Agenda.
- El callable médico sigue autenticado. El adaptador servidor inyecta autorización de canal, verifica configuración, profesional, estado de cuenta y vinculación en la transacción. El cliente no puede introducir `isVirtualOccurrence`, temporalModel ni otros marcadores internos en Appointment Service.
- Se mantiene la corrección virtual de recurrencias. Se valida el ancla persistida antes de quitar sus instantes de las ocurrencias; no se elimina `inconsistent-canonical-instant`. La disponibilidad no descarta silenciosamente bloqueos inválidos. Se conservan día 31, IANA, DST fail-safe, legacy y [start,end).

**Límites deliberados del piloto:** administra citas individuales vinculadas; no permite que el paciente cree o edite series recurrentes. Las series existentes sí bloquean disponibilidad. No consulta Free/Busy externo ni datos clínicos. El bot no está habilitado para producción abierta; máximo diez profesionales y diez destinatarios configurados.

### Durabilidad, privacidad y entrega

Se distinguen `whatsappWebhookEvents` (recibo técnico), `whatsappBotJobs` (trabajo), `whatsappBotSessions` (estado), `whatsappBotOutbox` (salida) y vínculos/autorizaciones. Recibos históricos no se convierten en trabajos. Firma, WABA, Phone Number ID, destinatario piloto y timestamp se comprueban antes de encolar. Muestras antiguas o teléfonos ficticios no autorizados no actúan.

Se usa AES-256-GCM con AAD por propósito y clave aleatoria envuelta con el KMS existente; no se guarda payload completo. Una clave HMAC separada evita guardar números en la lista piloto. Mensaje mínimo cifrado en trabajo: teléfono, texto administrativo acotado, botón y timestamp. Al terminar el trabajo se elimina su contenido cifrado. Sesiones: 1 hora; trabajos entrantes/salientes y outbox: 24 horas; correlación de estado: 7 días; vínculos/recordatorios: hasta cita +30 días; teléfono cifrado/consentimiento: 120 días desde la interacción, para el horizonte máximo de 90 días más margen. No hay historial de conversación perpetuo. TTL debe habilitarse en la release; la aplicación además rechaza documentos vencidos sin esperar su borrado asíncrono. Auditoría y recibos técnicos existentes conservan su política actual.

Leases, máximo cinco intentos y backoff acotado. Un mensaje posterior espera si el anterior aún debe recuperar una mutación persistida. La acción usa el mismo requestId al recuperar; no se confirma dos veces. Pacing transaccional: al menos un segundo por canal y seis segundos por destinatario. Un mensaje de estado no abre sesiones ni genera respuestas.

Cloud API implementa texto, botones, listas y plantillas, timeout de 10 segundos y errores saneados. Message ID significa **accepted**, no delivered. delivered/read proceden de callbacks correlacionados. HTTP 429 admite reintento; timeout/5xx/acuse perdido quedan **uncertain** y no se reenvían a ciegas. No se promete exactly-once de Meta a extremo. Una incertidumbre requiere conciliación de estado o revisión del operador.

Se mantuvo la exclusión existente de GET del webhook en `_Default`, comprobada por lectura:

```text
resource.type="cloud_run_revision" AND logName="projects/cognicion-57052/logs/run.googleapis.com%2Frequests" AND resource.labels.location="us-central1" AND resource.labels.service_name="whatsappwebhook" AND httpRequest.requestMethod="GET"
```

Nombre: `whatsapp_webhook_verify_get`. No se modificó. La lista remota actual contiene sólo `_Default` y `_Required`; no apareció otro sink de exportación. Antes del piloto comprobar que ningún sink adicional archiva esos GET sin exclusión. No se registran manualmente query params, headers sensibles, texto, teléfonos ni errores completos del proveedor.

## 3. Recordatorios, pagos y configuración

Recordatorios implementados con consentimiento explícito, opt-out, anticipación, horario local de notificación, plantilla e idioma y política de sólo no confirmadas. Scheduler consulta `state/dueAt` con límite 40, sin recorrer toda la base. Antes de encolar y de enviar se releen cita, horario, cancelación, consentimiento, vinculación y configuración. Cambios médicos de cita también generan trabajo mediante trigger. Consentimiento posterior puede programar citas previamente vinculadas, sin duplicar trabajos ya existentes.

Fuera de la ventana de 24 horas se comprueba la plantilla actualmente en Meta; MISSING, REJECTED, PAUSED o estado desconocido bloquean el trabajo. No se sustituye por texto libre. Los trabajos bloqueados no se marcan enviados y no se reactivan masivamente tras aprobar una plantilla. Para el piloto, aprobar y verificar la plantilla antes de programar la cita de prueba. Los recordatorios dentro de la ventana también respetan consentimiento y horas.

Plantilla propuesta, **no creada ni aprobada**: nombre `cognicion_recordatorio_cita`, idioma `es_MX`, categoría administrativa/UTILITY sujeta a Meta, cuerpo con un parámetro de texto:

> Recordatorio de cita COGNICIÓN: {{1}}. Escribe menú para confirmar, reprogramar o cancelar tu cita. Para no recibir recordatorios escribe dejar de recibir recordatorios.

`{{1}}` recibe fecha completa, hora y zona; sin datos clínicos. Ejemplo exclusivamente ficticio: martes, 8 de enero de 2030, 09:00 (America/Mexico_City).

No se encontró pasarela utilizable/configurada en el backend. **Pago no configurado**: no se inventaron checkout, destinatario, importe, webhook ni botones. Citas sin pago obligatorio funcionan. Con pago obligatorio, el canal bloquea reserva; el dominio bloquea confirmación no pagada. Una futura integración requiere proveedor elegido, cuenta beneficiaria explícita, credenciales, política de importe/moneda y webhook verificado; no impide el piloto sin pago.

Agenda → Configuración → WhatsApp carga bajo demanda: habilitar/detener profesional, catálogo, recordatorios, consulta real de plantilla guardada, vinculación explícita y administración del canal para administradores. Un botón específico detiene todo el canal sin volver a introducir teléfonos. No se introdujeron tarjetas ni nueva página. Desactivar profesional/canal se vuelve a comprobar antes de cada operación/envío; una solicitud Graph que ya salió no puede retirarse.

## 4. Pruebas y evidencia

Resultado final: **186 pruebas automatizadas, 186 PASS, 0 FAIL, 0 SKIP**, duración 105269.4069 ms. No se suman las repeticiones de ejecuciones anteriores. Incluye dominio Appointment, disponibilidad, transacciones, Rules de Firestore, recurrencias modernas/históricas, contratos Agenda, Google Calendar contracts/Rules, WhatsApp anterior, transporte y nuevas pruebas del bot.

Las pruebas integradas usan Firestore Emulator real y los handlers/servicios de producción invocados localmente. AES-GCM es real; la envoltura KMS y Graph API son mocks. No equivalen a Functions/Eventarc/Scheduler desplegados. Se cubren concurrencia, cita ajena, identidad externa, doble entrega/botones expirados, antes/después de persistir, estado de envío incierto, entrega monotónica, bloqueos/vacaciones, consentimiento, plantilla no aprobada, cancelación/reprogramación de recordatorio y pago pendiente. El webhook de pago no aplica porque no hay integración; no se cuenta como PASS.

Una prueba ejecuta Chrome y SDK Firebase real con autorización de prueba contra emulador. Gstatic sólo sirve el SDK; todos los destinos de datos salvo localhost están bloqueados. Los mocks de pantalla bloquean todas las peticiones remotas. Ninguno escribe en producción. No usar un servidor estático normal de `agenda.html` para asumir aislamiento: sin el harness la interfaz utiliza el proyecto Firebase de producción.

Visual: **46 ejecuciones de escenarios PASS (23 escenarios distintos)**, cero errores JS, a 1440×900, 1366×768 y 390×844; claro/oscuro y controles del tema biocelular. Parte de los escenarios se repite por viewport; no son 46 pruebas independientes de backend. Zoom medido: escala 1, CSS zoom 1. La prueba 720×450 con DPR 2 comprueba reflow equivalente a 200%, no modifica el zoom personal de Chrome. Máximo de render observado en la última matriz: 57 ms con fixtures; no es benchmark de producción. Se revisaron las capturas y se corrigió el desborde de los nuevos botones en móvil.

Evidencia local excluida de Git:

- `.tmp/bot-tests/results.txt`: resultado completo final.
- `.tmp/bot-tests/browser-emulator.json`: lectura real y cierre de WebChannel.
- `.tmp/bot-tests/remote-audit.jsonl`: planes remotos y hashes de sitio/HEAD/local.
- `.tmp/whatsapp-tests/agenda-visual/after/metrics.json` y PNG: capturas y escenarios visuales.

Una ejecución intermedia falló por reinicializar la configuración del cliente de pruebas al sembrar fixtures. Se corrigió el harness para reutilizar la misma instancia; no se cambiaron resultados esperados ni reglas del dominio para aprobarlo. La última ejecución indicada arriba pasó completa.

Reproducción en PowerShell, sin instalar herramientas:

```powershell
Set-Location -LiteralPath 'D:\Escritorio\PROYECTO COGNICION\1-back'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-agenda-whatsapp.ps1
$env:TEMP = Join-Path $PWD '.tmp/bot-tests'
$env:TMP = $env:TEMP
node scripts/qa-agenda-visual.cjs
node scripts/audit-agenda-release.cjs
node scripts/check-agenda-bot-release.cjs
```

El Bypass se aplica sólo al proceso hijo, no cambia la política del equipo. El runner fija Java 21 y temporales en D:, y restaura el entorno. Puertos del emulador: 8087/4407/4507, proyecto demo. `audit-agenda-release` sí consulta producción en modo de planificación/lectura pública; no obtiene pacientes. `check-agenda-bot-release` valida sintaxis, diff y hashes del manifiesto revisado.

Estado por entorno:

| Entorno | Evidencia | Estado |
|---|---|---|
| UI mocks | matriz visual y controlador real | PASS local |
| SDK/handlers/dominio contra emulador | 186 pruebas, incluidos los contratos | PASS local |
| Infraestructura real read-only | índices, Functions, IAM/KMS, APIs, exclusión y archivos públicos | Verificado con límites descritos |
| Webhook real sintético Meta | prueba histórica confirmada por usuario | No repetida; no prueba conversación |
| Teléfono piloto autorizado | Graph real y respuestas/callbacks | Pendiente de credencial, configuración y aprobación agrupada |
| Cita real controlada visible en Agenda | E2E con mismo ID tras reprogramación | Pendiente del piloto |
| Producción abierta | acceso general/número empresarial | NO-GO; fuera de este piloto |

OAuth real ya fue autorizado por el usuario. Sólo queda verificar su estado real mediante getGoogleCalendarConnectionStatus, documento server-only, token cifrado y UI conectada; no se necesita repetir autorización. OAuth conectado no significa sincronización ni Free/Busy.

## 5. Requisitos externos agrupados

1. **Secret Manager:** no existe WHATSAPP_ACCESS_TOKEN. Proveer un token adecuado al activo y sistema de Meta, con permiso de envío `whatsapp_business_messaging` y consulta de plantillas `whatsapp_business_management`. No usar el token temporal de capturas como credencial de producción. Gestionar/revocar el token expuesto desde Meta según corresponda; otro token no demuestra revocación. No pegar valores en chat. Falta también **WHATSAPP_IDENTITY_KEY**, clave aleatoria estable de al menos 32 caracteres para HMAC; no usar ni rotar META_APP_SECRET para ese propósito. No rotar esa identidad sin migrar vínculos.
2. **Meta:** administrador debe confirmar WABA ID, Phone Number ID, versión Graph vigente, activo asignado al token, modo actual de app/número de prueba, suscripción y destinatario piloto verificado. Sin ACCESS_TOKEN no fue posible consultar estado real, restricciones, permisos o plantillas; no se afirman aprobados. La recepción sintética histórica no prueba recepción de cualquier usuario. No migrar ni quitar el número empresarial. Si se quiere ese número, comprobar elegibilidad y procedimiento oficial de incorporación/coexistencia antes de cualquier cambio; el cierre actual usa el número de prueba existente.
3. **Plantilla:** crear/aprobar el cuerpo administrativo anterior o configurar una equivalente con un parámetro de cuerpo, nombre e idioma exactos. Comprobarla desde Agenda antes del piloto de recordatorios fuera de ventana. No hace falta plantilla para iniciar el flujo sin recordatorio fuera de ventana.
4. **Configuración administrativa:** elegir explícitamente profesional, servicios/duración, jornada IANA habilitada, un destinatario autorizado y consentimiento. El máximo código es diez destinatarios; la primera prueba debe utilizar uno. No se deducen identidades por teléfono.
5. **Release:** aprobar recursos de la siguiente sección. KMS ya tiene el binding `roles/cloudkms.cryptoKeyEncrypterDecrypter` para `1037684177162-compute@developer.gserviceaccount.com`; se reutiliza `projects/cognicion-57052/locations/global/keyRings/cognicion-calendar/cryptoKeys/refresh-tokens`, sin cambiar OAuth. APIs cloudkms, cloudscheduler, eventarc y pubsub están habilitadas. La cuenta runtime tiene actualmente Editor, Eventarc Event Receiver y Run Invoker; no se ampliaron roles. Las nuevas referencias secretas requieren Secret Accessor limitado a esos secretos.
6. **Pagos:** sólo si se exige pago, falta proveedor/cuenta beneficiaria/configuración verificable. Queda deshabilitado, sin impedir el piloto gratuito.

## 6. Una secuencia de release — NO ejecutada

La aprobación solicitada abarca exclusivamente los archivos del manifiesto, dos índices aditivos, TTL/exenciones de los nuevos datos temporales, Rules completas revisadas, seis Functions y el frontend compatible. Primero canal deshabilitado; activación posterior sólo del piloto de un destinatario aprobado. No autoriza cambios farmacológicos concurrentes, mensajes masivos, cobros, OAuth, migración de número ni publicación abierta.

### A. Congelar y comprobar

```powershell
Set-Location -LiteralPath 'D:\Escritorio\PROYECTO COGNICION\1-back'
git status --short --branch
git rev-parse --show-toplevel
git rev-parse HEAD
git diff --check
node scripts/check-agenda-bot-release.cjs
gcloud.cmd functions list --project=cognicion-57052 --format='table(name,state)'
gcloud.cmd secrets list --project=cognicion-57052 --format='value(name)'
gcloud.cmd kms keys get-iam-policy refresh-tokens --keyring=cognicion-calendar --location=global --project=cognicion-57052
gcloud.cmd logging sinks describe _Default --project=cognicion-57052 --format='json(exclusions)'
```

Si cambió un hash, volver a revisar ese cambio antes de publicación; no regenerar el manifiesto para eludir la revisión. `.env.cognicion-57052` permanece ignorado. Confirmar su parámetro KMS sin imprimir secretos. El manifiesto local del SDK fue cargado correctamente y contiene una sola declaración KMS. Firebase CLI dispone de `deploy --dry-run`, pero su ayuda advierte que puede habilitar APIs; no se ejecutó como supuesto read-only.

Tras resolver los requisitos humanos, alta interactiva de secretos, sin valores en línea de comandos:

```powershell
firebase.cmd functions:secrets:set WHATSAPP_ACCESS_TOKEN --project cognicion-57052
firebase.cmd functions:secrets:set WHATSAPP_IDENTITY_KEY --project cognicion-57052
gcloud.cmd secrets add-iam-policy-binding WHATSAPP_ACCESS_TOKEN --project=cognicion-57052 --member='serviceAccount:1037684177162-compute@developer.gserviceaccount.com' --role=roles/secretmanager.secretAccessor
gcloud.cmd secrets add-iam-policy-binding WHATSAPP_IDENTITY_KEY --project=cognicion-57052 --member='serviceAccount:1037684177162-compute@developer.gserviceaccount.com' --role=roles/secretmanager.secretAccessor
```

No sustituir versiones ya válidas si otro administrador las creó entretanto: comprobar nombres/versiones/IAM primero, sin `versions access` ni impresión de valores.

### B. Crear sólo índices ausentes y TTL nuevo

```powershell
gcloud.cmd firestore indexes composite list --project=cognicion-57052 --database='(default)' --format=json
gcloud.cmd firestore indexes composite create --project=cognicion-57052 --database='(default)' --collection-group=agenda --query-scope=collection --field-config=field-path=startDate,order=ascending --field-config=field-path=endDate,order=ascending
gcloud.cmd firestore indexes composite create --project=cognicion-57052 --database='(default)' --collection-group=whatsappBotJobs --query-scope=collection --field-config=field-path=state,order=ascending --field-config=field-path=dueAt,order=ascending
gcloud.cmd firestore indexes composite list --project=cognicion-57052 --database='(default)' --format=json
```

Ejecutar cada create sólo si sigue ausente. **No continuar hasta que ambos estén READY**; si BUILDING, esperar y consultar de nuevo. Nunca borrar/recrear el índice `startAt/endAt` READY ni desplegar índices ajenos en bloque. Repetir `node scripts/audit-agenda-release.cjs`: la consulta civil debe pasar de 400 a 200 con el plan esperado.

TTL y exclusión de índices sólo en campos nuevos enumerados en el archivo versionado:

```powershell
$botFields = (Get-Content -Raw firestore.indexes.json | ConvertFrom-Json).fieldOverrides | Where-Object { $_.collectionGroup -like 'whatsappBot*' }
foreach ($field in $botFields) {
  if ($field.ttl -eq $true) {
    gcloud.cmd firestore fields ttls update $field.fieldPath --collection-group=$($field.collectionGroup) --database='(default)' --project=cognicion-57052 --enable-ttl
    if ($LASTEXITCODE -ne 0) { throw 'No continuar: TTL pendiente.' }
  }
  gcloud.cmd firestore indexes fields update $field.fieldPath --collection-group=$($field.collectionGroup) --database='(default)' --project=cognicion-57052 --disable-indexes
  if ($LASTEXITCODE -ne 0) { throw 'No continuar: exención pendiente.' }
}
gcloud.cmd firestore fields ttls list --project=cognicion-57052 --database='(default)'
```

No cambia índices de pacientes ni de las citas. Revisar que los grupos nuevos no hayan sido usados por otra implementación antes de activar TTL. La eliminación automática es asíncrona, no una garantía de borrado a segundo exacto.

### C. Rules completas y Functions seleccionadas

El diff completo de Rules sólo añade diez bloques server-only `allow read, write: if false` para el bot. No modifica reglas previas de Agenda, OAuth ni WhatsApp; no añade allow amplio. Las subcolecciones de vínculo quedan cubiertas por el rechazo recursivo. Rules Emulator comprobó lectura/escritura denegada.

```powershell
firebase.cmd deploy --project cognicion-57052 --only firestore:rules
firebase.cmd deploy --project cognicion-57052 --only functions:manageAppointment,functions:whatsappWebhook,functions:configureWhatsAppBot,functions:whatsappBotWorkCreated,functions:whatsappBotDrain,functions:whatsappBotAppointmentChanged
gcloud.cmd functions list --project=cognicion-57052 --format='table(name,state,updateTime)'
gcloud.cmd scheduler jobs list --location=us-central1 --project=cognicion-57052
gcloud.cmd eventarc triggers list --location=northamerica-south1 --project=cognicion-57052
```

No `--force`. Confirmar interactivamente la política de reintentos ya revisada. Las seis Functions y Scheduler usan **us-central1**. Los dos triggers Eventarc usan **northamerica-south1**, ubicación de `(default)`, con destino Cloud Run en us-central1. En la release se corrigió la configuración original que confundía ambas ubicaciones: Cloud Functions rechazó la creación en northamerica-south1. Se crean recursos Eventarc/Scheduler gestionados por Firebase. El scheduler retorna sin acciones si el canal está deshabilitado y además se pausa después del deploy. Node24 y dependencias ya presentes; no se reinstalaron herramientas.

Secrets: manageAppointment ninguno; whatsappWebhook verify/app-secret/identity; configureWhatsAppBot identity/access; workers access. Webhook y worker de mensajes usan KMS mediante el parámetro existente. No desplegar las cuatro Functions de Google Calendar ni otros exports.

### D. Frontend compatible, prueba controlada y cierre

Publicar los archivos frontend revisados por el mecanismo actual del propietario. `firebase.json` no declara Hosting: **no inventar un `firebase deploy --only hosting`**. El agente no hace push. El manifiesto delimita archivos; no incluir el resto del árbol ni `.tmp`, secretos o archivos de prueba en una publicación de datos. El frontend necesita también el módulo público `functions/appointments/recurrence.mjs`, ya utilizado por Agenda; no exponer nuevos módulos servidor innecesariamente en el alojamiento estático.

Después de publicar: verificar contenido/hashes y APP_VERSION, abrir Agenda con sesión del profesional, comprobar carga completa del rango y estado OAuth mediante su lectura existente sin repetir autorización. Configurar canal piloto primero detenido, profesional/servicios/jornada sin pago y destinatario único. Consultar plantilla real. Activarlo sólo al realizar el smoke test aprobado.

Smoke test desde el teléfono autorizado: hola → agendar → fecha → horario → nombre ficticio autorizado para QA → consentimiento → resumen → confirmar → observar cita en Agenda. Confirmar, reprogramar y comprobar mismo ID, cancelar y comprobar cancelación. Probar recordatorio consentido con horario controlado y plantilla válida; comprobar delivered por callback, no sólo accepted. No reservar contra pacientes reales ajenos. Al finalizar, detener automatización salvo aprobación explícita para mantener el piloto.

No pasar a producción abierta sin verificar restricciones de Meta, recepción real, identidad, cuotas/coste, plantilla y aceptación del piloto. Si el número empresarial requiere coexistencia, esa incorporación permanece separada y no puede interrumpir el canal actual.

### E. Rollback delimitado

Primero detener todo el canal desde Configuración → WhatsApp → administración. Si el frontend falla, un administrador puede poner **sólo** `whatsappBotConfig/channel.enabled=false` desde la consola. Pausar el nuevo Scheduler si hace falta. Un envío HTTP ya iniciado puede llegar: no prometer retirarlo.

Conservar recibos, outbox, bindings, Rules server-only e índices; no borrar citas ni reejecutar trabajos uncertain. Conciliar pendientes antes de restaurar handlers anteriores. Restaurar exclusivamente código aprobado desde el artefacto previo por el propietario, sin `reset --hard`, sin borrar cambios concurrentes ni revertir OAuth. Un rollback del webhook a recepción técnica suspenderá nuevas conversaciones: anunciarlo al operador y mantener el piloto detenido.

## 7. Archivos, publicación y decisión

`docs/agenda-whatsapp-release-manifest.json` enumera rutas exactas y hashes. Cambios principales:

- Agenda: agenda.html, css/agenda.css (únicamente ajuste de botones nuevos), js/agenda.js, js/agenda/visualModel.js, js/config/appVersion.js, js/themes/biocellularThemeController.js; nuevos agendaReadDiagnostics.js y agendaWhatsAppSettings.js.
- Dominio: functions/appointments/domain.mjs, recurrence.mjs y service.mjs; incluye cambios de recurrencia preexistentes preservados y endurecimiento probado.
- Backend bot: functions/whatsappBot/{index,config,crypto,ingress,machine,worker,transport,settings}.js y appointments.mjs; conexión en functions/index.js y handlers/store del webhook existente.
- Seguridad: firestore.rules y firestore.indexes.json; .gitignore para artefactos locales de QA.
- Pruebas/scripts: rutas exactas en manifiesto. El ajuste a la prueba estática del export del webhook contempla los parámetros nuevos, sin relajar HMAC/Rules/idempotencia.

GO revisión técnica local. GO condicionado para release cerrada tras secretos/configuración/índices READY y aprobación agrupada. **NO-GO para afirmar Agenda corregida en producción, conversación real completada, recordatorios reales entregados o cobro operativo antes de verificarlos. NO-GO producción abierta.**

La entrega incluye código de conversación y no sólo transporte. Los pasos pendientes son configuración externa, publicación autorizada y smoke test real; no un futuro encargo para escribir el bot.

Referencias: [índices Firestore](https://firebase.google.com/docs/firestore/query-data/indexing), [callables autenticadas](https://firebase.google.com/docs/functions/callable), [ejecución y trabajo posterior al retorno](https://firebase.google.com/docs/functions/tips), [triggers Firestore e idempotencia](https://firebase.google.com/docs/functions/firestore-events). Meta: [envío](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages), [plantillas](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [colección oficial Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api). Las páginas nuevas de Meta no pudieron recuperarse directamente en esta sesión; el contrato se contrastó con su colección oficial. Permisos/aprobaciones de esta cuenta siguen sin verificarse.
