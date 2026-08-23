# Mi nube: arquitectura y despliegue seguro

## Separación de datos

Mi nube utiliza exclusivamente estas rutas:

```text
Cloud Storage
mi-nube/{uid}/files/{fileId}/{filename}
mi-nube/{uid}/thumbnails/{fileId}/{filename}   # reservado para derivados

Cloud Firestore
usuarios/{uid}/cloudFiles/{fileId}
usuarios/{uid}/cloudStorageUsage/current
usuarios/{uid}/cloudUploadReservations/{fileId}
```

Los apuntes se muestran como una proyección `sourceType: "note"` de la fuente ya
existente `usuarios/{uid}/apuntesMedico`. Mi nube no escribe una colección de
apuntes paralela, no exporta automáticamente apuntes a Storage y no contabiliza
su texto en la cuota.

La reconciliación y el contador solo recorren el prefijo `mi-nube/{uid}/` y las
tres subcolecciones anteriores. No consultan expedientes, notas clínicas,
Sofía, imágenes de perfil ni ningún otro almacenamiento de Cognición.

## Cuota y concurrencia

La cuota máxima es `250 * 1024 * 1024` bytes. El backend decide si una carga es
posible dentro de una transacción de Firestore usando:

```text
usedBytes + reservedBytes + incomingBytes <= maxBytes
```

`reservedBytes` evita que cargas concurrentes superen el límite. Una reserva
vincula UID, `fileId`, ruta, nombre canónico, tamaño y MIME. Storage Rules solo
permiten crear el objeto que coincide con esa reserva. Al finalizar, una
transacción idempotente mueve los bytes reservados a `usedBytes` y crea los
metadatos visibles.

Mover, renombrar y enviar a papelera no cambia la cuota. Los elementos en la
papelera siguen ocupando espacio. La eliminación definitiva descuenta bytes
solo después de que el objeto físico se haya eliminado.

Antes de cualquier `getMetadata`, lectura de contenido o borrado con Admin SDK,
el backend reconstruye y compara la vinculación canónica completa:

```text
uid + fileId + storageName
    -> mi-nube/{uid}/files/{fileId}/{storageName}
```

Una reserva o metadata heredada con ruta distinta nunca se entrega a
`bucket.file()`. La reconciliación la marca en cuarentena sin borrar objetos ni
liberar bytes, para que un documento presembrado no pueda convertir privilegios
Admin SDK en acceso a otro módulo.

## Reglas Firestore canónicas

La fuente desplegada se recuperó el 22 de agosto de 2026 mediante Firebase Rules
REST API, antes de realizar cualquier publicación:

```text
Proyecto: cognicion-57052
Release: projects/cognicion-57052/releases/cloud.firestore
Ruleset: projects/cognicion-57052/rulesets/dfb50c8f-35ff-4bfa-9826-515f8c37845f
Creado: 2026-07-13T22:45:09Z
Tamaño remoto: 2775 bytes
SHA-256: 9aa3c7767ec5c35d3875c170870f2b8b708db23eab35291b382b25feb31f4880
```

La copia inmutable está en
`docs/firebase-firestore-rules-deployed-2026-07-13.rules`. El archivo
`firestore.rules` es desde ahora la fuente canónica fusionada y `firebase.json`
apunta explícitamente a ella. No se despliega ningún fragmento parcial.

El ruleset recuperado contenía un wildcard `usuarios/{uid}/{subdocument=**}`.
En Rules v2 ese patrón también coincide con cero segmentos y sus permisos se
combinan mediante OR con reglas más específicas. La fusión divide el primer
segmento como `subcollection` y excluye expresamente:

```text
cloudFiles
cloudStorageUsage
cloudUploadReservations
apuntesMedico
carpetasApuntes
```

El propietario solo lee `cloudFiles` y `cloudStorageUsage/current`; ni siquiera
el propietario puede escribir metadata, contador o reservas desde el SDK
cliente. Las reservas no son legibles para el navegador. Todas las mutaciones
de estas rutas se realizan mediante Functions/Admin SDK, que no está sujeto a
las reglas cliente.

`apuntesMedico` y `carpetasApuntes` conservan sus rutas y datos originales. El
propietario mantiene CRUD, el administrador conserva lectura y borrado para el
flujo administrativo y ningún otro UID obtiene acceso. No se creó una colección
de apuntes alternativa.

Cerrar el wildcard heredado también eliminó permisos accidentales sobre el
perfil raíz: cualquier usuario autenticado podía crear perfiles profesionales y
la vinculación copiaba datos entre UID desde el navegador. Para conservar los
flujos sin reabrir ese acceso se añadieron dos callables:

```text
registerProfessionalWithCode
manageAccountLinking
```

El registro profesional valida el correo del token, rol, emisor, vigencia y uso
del código en una transacción. La vinculación deriva los UID de
`request.auth`, reserva el expediente y el código, copia documentos con IDs
estables y finaliza de forma idempotente. `codigosVinculacion`, los campos
`vinculacionReserva*` y los campos de resultado de la vinculación son
backend-only. Los códigos legacy sin `versionSeguridad: 1` se rechazan y deben
regenerarse.

Antes de desplegar deben pasar tanto las pruebas específicas de Mi nube como la
matriz de regresión del perfil raíz, creación provisional, roles, vinculación y
Mis apuntes. Este requisito existe porque corregir el wildcard heredado cambia
su efecto accidental sobre `usuarios/{uid}`; no se debe recuperar compatibilidad
reabriendo una escritura global.

Storage Rules usa `firestore.get()` para verificar la reserva. La primera vez
Firebase puede solicitar habilitar el permiso IAM que permite esa consulta
entre productos.

La revisión IAM del 22 de agosto de 2026 confirmó que el service agent de
Storage todavía no tiene `roles/firebaserules.firestoreServiceAgent`:

```text
service-1037684177162@gcp-sa-firebasestorage.iam.gserviceaccount.com
```

Este permiso es un prerrequisito de publicación. Sin él, una reserva correcta
seguirá siendo denegada por Storage Rules. No se modificó IAM desde esta entrega
local.

Comando remoto pendiente para el responsable de publicación:

```powershell
gcloud projects add-iam-policy-binding cognicion-57052 `
  --member="serviceAccount:service-1037684177162@gcp-sa-firebasestorage.iam.gserviceaccount.com" `
  --role="roles/firebaserules.firestoreServiceAgent"
```

Después debe releerse la política IAM y comprobar que el miembro y el rol
coinciden exactamente antes de desplegar Storage Rules.

La auditoría remota también encontró dos prerrequisitos todavía pendientes:

- `cloudscheduler.googleapis.com` no está habilitada. Debe habilitarse antes de
  desplegar `cleanupExpiredCloudReservations`; depender de una confirmación
  interactiva de Firebase CLI no es seguro en un deploy automatizado.
- Los siete índices compuestos de Mi nube versionados en
  `firestore.indexes.json` aún no existen en producción. Deben desplegarse y
  alcanzar estado `READY` antes de exponer las consultas del cliente o la
  limpieza programada.

```powershell
gcloud services enable cloudscheduler.googleapis.com --project=cognicion-57052
firebase deploy --only firestore:indexes --project cognicion-57052
```

Estos comandos remotos quedaron documentados, no ejecutados.

## Storage Rules y CORS recuperados

Rules API no devolvió ningún release de Storage para
`cognicion-57052.firebasestorage.app` ni para el bucket legado `.appspot.com`.
El segundo bucket no existe. Por tanto, no había un ruleset remoto recuperable
que pudiera tratarse como canónico. La base local histórica de
`storage.rules` —la regla de foto de perfil— se preservó literalmente y la ruta
`mi-nube/{uid}/...` se añadió de forma localizada.

La configuración CORS real del bucket sí se recuperó antes de editarla. Su valor
previo era exactamente `[]`. La configuración versionada final está en
`storage.cors.json` y añade únicamente:

```text
Origen: https://cognicionlabs.com
Métodos: GET, HEAD
Headers expuestos: Content-Type, Content-Length, Content-Disposition, ETag
Max age: 3600 segundos
```

`www.cognicionlabs.com` redirige al dominio raíz antes de ejecutar la
aplicación; los aliases de Firebase Hosting responden 404. No se incluye `*`,
orígenes de desarrollo ni métodos de escritura. CORS se aplica solamente
después de pasar la suite y se vuelve a leer para verificar el resultado. El
script `scripts/storage-cors-cognicion.ps1` es dry-run por defecto, fusiona sin
borrar entradas ajenas y exige `-Apply` explícito tras una segunda lectura.
El dry-run se validó tanto con Windows PowerShell 5.1 como con PowerShell 7; en
ambos casos volvió a leer `[]` y produjo la entrada restrictiva anterior sin
modificar el bucket.

## Emulator Suite

El JDK Microsoft OpenJDK 21 está instalado en paralelo con Oracle Java 8. El
launcher `scripts/test-mi-nube-emulators.ps1` selecciona el JDK moderno mediante
`COGNICION_JAVA_HOME`, valida que todos los endpoints sean loopback y aborta si
algún SDK pudiera apuntar a Firebase real. `firebase.json` configura Auth,
Functions, Firestore y Storage Emulator sin cambiar las versiones de producción.

La suite cubre propietario, otro UID y anónimo; manipulación de UID, metadata,
ruta, MIME y tamaño; creación manual y reutilización de reservas; límite
0/249/250 MiB; dos reservas concurrentes; cancelación, contenido inválido,
expiración, reconciliación, borrado definitivo y Single Source of Truth de Mis
apuntes.

Resultados locales finales:

```text
Rules Emulator (Firestore + Storage): 28/28
Flujos E2E (Auth + Functions + Firestore + Storage): 13/13
Functions unitarias: 59/59
Mi nube core + integración estática: 30/30
Auditor predeploy de solo lectura: 8/8
Layout escritorio/móvil: 2/2
Regresión específica de Mis apuntes: 17/17
Compilador oficial de Firestore Rules: 0 incidencias
Compilador oficial de Storage Rules: 0 incidencias
```

El Emulator no ejecuta la tarea programada si no se levanta Pub/Sub. Su consulta,
paginación, índice y transición de cuota se prueban de forma unitaria y mediante
la reconciliación; la invocación horaria real debe comprobarse después del
despliegue.

La suite global histórica del repositorio no está completamente verde: 323 de
336 pruebas pasaron y 13 fallaron por expectativas de versiones/caché o casos
clínicos preexistentes ajenos a Mi nube. No se modificaron esos módulos para
ocultar el baseline. `npm audit --omit=dev` informa 8 vulnerabilidades moderadas
en la cadena transitiva de `firebase-admin`; la corrección automática exige el
salto mayor a Admin 14 y no se aplicó dentro de esta entrega localizada.

## Reconciliación

La callable de reconciliación compara metadatos y objetos únicamente bajo el
UID autenticado, corrige el contador por asignación exacta y libera reservas
vencidas. La tarea programada limpia reservas expiradas de forma paginada. Los
handlers de finalización y borrado son idempotentes porque los eventos de
Storage pueden entregarse más de una vez.

## Privacidad

Los archivos no reciben URLs públicas persistentes. La vista previa y descarga
usan el SDK autenticado para obtener un `Blob`; su URL local se revoca al cerrar
el visor. Mi nube no envía, analiza ni indexa contenido con Sofía u otros modelos
de IA.

## Estado de publicación y orden seguro

La versión local preparada es `2.089`, marcador
`2026-08-22-mi-nube-infraestructura-segura-v1`. No se realizó deploy, cambio IAM,
aplicación CORS, publicación web ni prueba con usuarios de producción. La política
permanente del repositorio reserva esas escrituras al usuario.

Antes de publicar se debe volver a leer Rules, IAM y CORS y conservar esa
evidencia. El orden recomendado es:

1. Conceder al service agent de Storage el rol
   `roles/firebaserules.firestoreServiceAgent` y verificarlo por lectura.
2. Habilitar Cloud Scheduler, desplegar únicamente los índices Firestore y
   esperar hasta que los siete índices de Mi nube estén `READY`.
3. Desplegar primero y por nombre únicamente `registerProfessionalWithCode` y
   `manageAccountLinking`; todavía no desplegar las Functions de Mi nube.
4. Verificar las dos callables sin exponer códigos ni datos clínicos en logs.
5. Activar una ventana breve de mantenimiento para registro, vinculación y Mi
   nube, porque el cliente y las reglas endurecidas deben cambiar
   coordinadamente.
6. Desplegar únicamente el `firestore.rules` canónico fusionado.
7. Con Application Default Credentials del responsable de publicación, ejecutar
   `node scripts/audit-mi-nube-predeploy.mjs --dry-run`. Audita por conteos
   agregados las tres collection groups internas y el prefijo Storage
   `mi-nube/` sin imprimir rutas, UID ni PHI. Como el módulo nunca estuvo
   publicado, el resultado esperado es cero. Si hay reservas, metadata,
   contadores u objetos, el script sale con código 2: bloquear el release e
   invalidarlos mediante un procedimiento Admin controlado antes de continuar.
8. Desplegar las trece Functions de Mi nube y verificar reserva/cancelación.
9. Desplegar `storage.rules` y comprobar una reserva válida y todos los casos de
   denegación.
10. Ejecutar `scripts/storage-cors-cognicion.ps1 -Apply`; el script relee y
    aborta si el bucket cambió desde el dry-run.
11. Publicar el cliente web `2.089` y retirar la ventana de mantenimiento.
12. Ejecutar el recorrido controlado de producción y revisar consola, red,
    contadores, reservas y logs de Functions.

Firestore Rules estrictas deben quedar activas antes de admitir uploads en
Storage: el ruleset remoto recuperado todavía concedía escritura autenticada en
subcolecciones y permitiría fabricar reservas. Solo las callables de registro y
vinculación se despliegan antes que las reglas; las Functions de Mi nube se
retienen hasta cerrar Firestore y auditar cualquier documento presembrado. Sin
una ventana coordinada no existe un orden totalmente libre de incompatibilidad
entre el cliente antiguo y las reglas nuevas.
