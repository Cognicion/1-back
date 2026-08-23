# Moderación administrativa de Mi nube

Documento técnico local. No constituye por sí mismo una publicación de políticas ni un despliegue.

## Flujo existente del Centro de Control

- `admin.html` contiene la sección **Usuarios registrados** y la ficha modal de solo lectura.
- `js/admin.js` lee la colección canónica `usuarios`, conserva el UID del perfil seleccionado y abre su ficha sin cambiar la sesión ni `auth.uid`.
- La comprobación visual histórica del Centro de Control reconoce aliases de administración por compatibilidad. Esta nueva operación sensible no depende de esa comprobación: las callables vuelven a leer `usuarios/{actorUid}` mediante Admin SDK y requieren el campo canónico `rol` con valor exacto `admin`, igual que `isAdmin()` en `firestore.rules`.
- La bitácora existente es la colección `auditoria`; no se crea una colección paralela.

## Flujo nuevo

```text
Centro de Control
→ Usuarios registrados
→ Mi nube · solo lectura
→ listAdminCloudFiles / requestAdminCloudFileAccess
→ Firebase Authentication
→ usuarios/{actorUid}.rol == "admin"
→ metadata usuarios/{ownerUid}/cloudFiles
→ validación de binding canónico mi-nube/{ownerUid}/files/{fileId}/{storageName}
→ auditoria
→ URL V4 privada de lectura con vigencia de 2 minutos
→ Blob del navegador para preview o descarga
```

`listAdminCloudFiles` consulta lotes de hasta 50 elementos por `parentFolderId`, estado de papelera y cursor. La cuota se lee de `cloudStorageUsage/current`; los conteos se obtienen con agregaciones Firestore. No se recorre Storage y no se consultan las nubes de otros perfiles hasta que el administrador abre la sección correspondiente.

`requestAdminCloudFileAccess` acepta solamente `ownerUid`, `fileId` y `operation`. No acepta `filename`, `storagePath`, roles ni flags enviados por el cliente. Relee el documento, verifica propietario, identificador, tamaño, MIME y ruta canónica. Para preview/descarga escribe primero la auditoría y solo después genera una URL V4 temporal. Una falla de auditoría deniega el acceso.

Las Firestore Rules y Storage Rules de clientes no cambian: el propietario continúa accediendo mediante el flujo normal y ningún cliente obtiene lectura cruzada. El acceso excepcional usa Admin SDK exclusivamente dentro de las callables.

## Auditoría

Eventos:

- `cloud_file_admin_list`
- `cloud_file_admin_preview`
- `cloud_file_admin_download`
- `cloud_file_admin_security_denied`

Campos técnicos: `action`/`accion`, `adminUid`, `ownerUid`, `fileId` cuando aplica, `operation`, `source: "control-center"`, fecha y resultado. No se guardan nombres de archivos, rutas, URLs firmadas, tokens ni contenido.

## Alcance de mínimo privilegio

La primera versión autoriza solo el rol canónico `admin`. No autoriza médicos, psicólogos, enfermería, pacientes, colaboradores, testers ni flags como `isAdmin: true` enviados por el navegador. La interfaz es observadora: no contiene operaciones de edición, movimiento, renombrado, restauración, eliminación, cuota ni reservas.

Como mejora futura se recomienda separar el rol administrativo técnico del privilegio específico de moderación de contenido, con asignación revocable y revisión periódica. Esa separación no se introduce en esta entrega para evitar un sistema paralelo de roles.

## Propuesta de actualización de privacidad y términos

Texto propuesto para revisión legal; **no publicar automáticamente**:

> Los archivos que el usuario almacena en Mi nube son privados y no se hacen públicos. Personal administrativo expresamente autorizado puede acceder de forma excepcional y registrada a archivos específicos cuando resulte necesario para moderación, seguridad, prevención de abuso, cumplimiento de los términos u obligaciones legales. Estos accesos están sujetos a controles técnicos, mínimo privilegio y trazabilidad.

También debe eliminarse o evitarse cualquier afirmación de cifrado de extremo a extremo o de acceso exclusivo absoluto del usuario. Puede explicarse que los datos se protegen en tránsito y mediante controles de acceso, sin afirmar que el operador carece técnicamente de capacidad de acceso.
