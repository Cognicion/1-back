# Recuperación del dominio — estado de ejecución

## Control 15:28 UTC: decisión pendiente para WWW

El apex continúa PASS: API activa, health esperado y smoke de diez rutas
ejecutado por la puerta de seguridad de prepare-www-hosting.
WWW ya tiene CERT_ACTIVE y redirectTarget=cognicionlabs.com, pero continúa
HOST_MISMATCH / OWNERSHIP_MISSING. La API solicita sustituir su CNAME
cognicion.github.io por cognicion-57052.web.app. El TXT ACME fue detectado.

Pruebas GET con curl sin ignorar TLS:

- WWW directo a Firebase mediante --resolve y hostname/SNI: TLS válido,
  HTTP 404, X-Cache MISS, tanto en raíz con query nueva como en biblioteca.
- WWW por DNS público: IP 185.199.110.153, TLS válido, HTTP 301 a
  https://cognicionlabs.com/biblioteca.html?prueba=continuidad.

No se efectuó ninguna escritura DNS ni deploy en este control. La
redirección actual de GitHub funciona; el destino Firebase todavía no pasó
el control previo de redirección. La documentación oficial de OwnershipState
admite TXT hosting-site o CNAME al sitio por hostname. Cambiar el CNAME
resolvería el requisito DNS indicado, pero también movería el tráfico antes
de confirmar el 301 en destino. No afirmar que esperar el certificado resolverá
este punto: el certificado ya está activo.

Se solicita al usuario decisión concreta sobre aceptar posible interrupción
temporal solo de WWW al efectuar ese cambio. Hasta tener respuesta o una
prueba directa 301 correcta, conservar WWW y no repetir la solicitud en cada
heartbeat. El apex no requiere cambios. No alterar ni recrear CustomDomain.

Referencia: https://firebase.google.com/docs/reference/hosting/rest/v1beta1/projects.sites.customDomains#ownershipstate

## Estado vigente: apex recuperado a las 12:06 UTC

APEX HTTP/TLS/CONTENIDO: PASS. Las diez rutas del smoke, sin parámetros
especiales, entregan HTTP 200 y SHA-256 idéntico al frontend local, tanto en
cognicionlabs.com como en web.app. Firebase devuelve HOST_ACTIVE,
OWNERSHIP_ACTIVE y CERT_ACTIVE. Login.html accesible no acredita login
autenticado; ese QA permanece pendiente.

Se aisló una diferencia de caché: la URL ordinaria entregaba 404 con
`X-Cache: HIT`; la misma ruta con `?migration_check=<timestamp>` entregó 200
con `X-Cache: MISS`, TLS válido y contenido esperado. Se reprodujo en diez
rutas. HTTP/1.1 y HTTP/2 sin parámetro daban ambos 404, por lo que cambiar de
protocolo no solucionaba la discrepancia. No era necesario volver a asociar
el apex ni cambiar DNS. Esto prueba la discrepancia de caché observada, no
qué servidor había atendido previamente al navegador del usuario.

Después de 18/18 pruebas locales PASS y respaldo, se republicó exclusivamente
el frontend existente (692 archivos, 47,530,308 bytes), con
`firebase deploy --only hosting --project cognicion-57052 --non-interactive`.
Firebase documenta la invalidación del contenido CDN al republicar:
https://firebase.google.com/docs/hosting/manage-cache
Tras el deploy, las URLs normales pasaron a 200. No hubo cambios funcionales
ni de APP_VERSION o CACHE_VERSION, datos clínicos o reglas.

Release vigente: `sites/cognicion-57052/releases/1789041955563000`.
Version: `sites/cognicion-57052/versions/2c876f7655812eaf`.
Release anterior conservada para rollback de contenido:
`sites/cognicion-57052/releases/1789021564880000`.

### WWW preparado, sin cambiar tráfico

Se reutilizó el recurso www con undelete y etag (validación previa); operación
completada. Se actualizó únicamente redirectTarget a cognicionlabs.com;
operación completada. Se añadió el desafío TXT exacto de la API mediante
`node scripts/reconcile-hosting-dns.mjs --www --apply`; el nombre y valor
fueron confirmados en el servidor DNS autoritativo. Todos los registros
preexistentes se preservaron.

WWW sigue en CERT_VALIDATING / OWNERSHIP_MISSING a las 12:07 UTC. El CNAME
permanece cognicion.github.io. No cambiarlo todavía. Próximo control: leer
CustomDomain www y desafíos vigentes (la API ya no tiene deleteTime). No
repetir undelete ni patch cuando redirectTarget ya es correcto. El script
prepare-www-hosting es idempotente y devuelve su estado actual.
DNS solicitado actualmente por Firebase: CNAME www -> cognicion-57052.web.app.
Antes de cambiar tráfico, validar TLS y redirect con hostname/SNI contra
Firebase, conservando ruta/query, y respaldar/reconciliar por el ID real
del CNAME. No crear mezclas A/CNAME ni asumir que un certificado del apex
cubre www. Token DPAPI existente, no solicitarlo otra vez.

Respaldos más recientes: `.firebase/migration/2026-09-10T12-07-56.070Z/`
y `.firebase/migration/dns-2026-09-10T12-07-28.288Z.json` y su after.
Cambio local de diagnóstico: smoke-hosting admite --fresh y registra edge y
X-Cache, guardando sus resultados separados de las pruebas normales. Un
PASS con --fresh no sustituye el PASS de las URLs normales.

Seguimiento programado sigue activo para terminar WWW, no para esperar
el apex que ya pasó. QA autenticado/segunda red y automatización de deploy
siguen pendientes; no declarar PRODUCTION GO global por el smoke solo.
No commit/push. Continúan vigentes las restricciones de Git y seguridad.

## Actualización de las 08:33 UTC

El certificado del apex pasó a `CERT_ACTIVE`, con `HOST_ACTIVE` y
`OWNERSHIP_ACTIVE`, sin issues del apex ni actualizaciones DNS de hosting
pendientes en la respuesta actual. La release sigue siendo la misma.
Dos clientes independientes de software en esta misma máquina (Node y curl,
no dos redes independientes) reciben aún HTTP 404 desde 199.36.158.100 con
TLS validado. No atribuir ya este 404 a un certificado pendiente.

El usuario informó acceso a www y apex desde AT&T, y aportó captura de
`cognicionlabs.com/health.json` en incógnito con versión 2.209 y build esperado.
Esto acredita acceso en su prueba, pero no identifica el servidor que la
atendió ni explica la diferencia con el monitor. QA autenticado pendiente.
No se realizaron nuevas escrituras de DNS ni cambios en www en este control.
Respaldo actualizado: `.firebase/migration/2026-09-10T08-33-44.868Z/`.

## Estado comprobado a las 07:46 UTC del 10 de septiembre de 2026

La recuperación **no está completada**. `cognicionlabs.com` conecta a
`199.36.158.100`, presenta un certificado válido para su hostname y responde
404 «Site Not Found». No es la aplicación ni una pantalla recovery propia.

Firebase project/site: `cognicion-57052`.
Recurso existente: `projects/cognicion-57052/sites/cognicion-57052/customDomains/cognicionlabs.com`.
Estado API: `HOST_ACTIVE`, `OWNERSHIP_ACTIVE`, `CERT_PROPAGATING`, sin issues.
La propiedad pasó a activa a las 07:38:44 UTC; eso todavía no acreditó
publicación de contenido para el hostname.

`https://cognicion-57052.web.app` entrega diez recursos comprobados por GET,
TLS validado y SHA-256 idéntico al repositorio: raíz, index, login, biblioteca,
agenda, health, SW, bootstrap JS, CSS e imagen. App 2.209; build/SW
`20260909-availability-hardening-v2`. No se rebajó ninguna versión.

Release conservada: `sites/cognicion-57052/releases/1789021564880000`.
Version: `sites/cognicion-57052/versions/bf15817cae23674b`.
No hubo nuevo deploy en esta fase: el contenido de la release ya funciona en web.app.

## Escrituras externas efectuadas

Se añadió exclusivamente el TXT ACME que devolvió la API de Firebase para
`_acme-challenge.cognicionlabs.com`. Se releyeron los registros y se comprobó
que todos los IDs preexistentes conservaran nombre, tipo, contenido, TTL y
estado del proxy. El A de Firebase y TXT hosting-site ya existían.
No se modificaron correo, verificaciones Google, nameservers, DNSSEC ni CAA.

Las respuestas completas de DNS, IDs, TTL, CustomDomain, releases y estado
inicial de Git están respaldadas en `.firebase/migration/`, excluida de Git
y del artefacto público. El token Cloudflare se almacena cifrado con DPAPI
CurrentUser, nunca en texto plano ni en el chat. Se corrigió la captura local
para no depender del cmdlet PowerShell que fallaba al guardar.

## Contingencia y www

No se revirtió a GitHub: la prueba directa con hostname/SNI hacia el proveedor
anterior expiró. La configuración Pages conserva el dominio y main como
fuente, pero eso no prueba TLS ni contenido operativo del origen anterior.
Una reversión sin esa evidencia no cumple la condición de seguridad acordada.

`www` conserva el CNAME anterior; su recurso Firebase existe en estado
soft-deleted. No se ha restaurado ni se ha cambiado su tráfico. Después del
PASS del apex, reutilizar el recurso con `:undelete` y etag, establecer
`redirectTarget=cognicionlabs.com`, consultar desafíos actuales y preparar
certificado antes de reconciliar el CNAME exacto que indique Firebase.
`scripts/prepare-www-hosting.mjs` está preparado, no ejecutado y requiere
revisión de la operación devuelta antes de continuar con DNS.

## Comprobaciones y reanudación

Desde el repositorio canónico, sin otro monitor simultáneo:

```powershell
node scripts/wait-hosting-domain.mjs --once
node scripts/smoke-hosting.mjs cognicionlabs.com cognicion-57052.web.app
```

El primer comando devuelve 1 si no hay health esperado. Sin `--once` tiene
un límite de diez minutos, backoff y bloqueo contra ejecuciones simultáneas.
El segundo exige TLS válido, HTTP 200 y contenido idéntico; un recovery/404
no pasa. El estado se guarda localmente para reanudar.

Los scripts de inspección y reconciliación usan credenciales autorizadas de
Firebase CLI y el token Cloudflare cifrado. No se deben imprimir las
credenciales ni publicar `.firebase/`. No repetir escrituras si el estado ya
es correcto; no recrear el apex ni emitir PATCH vacíos.

## Validación local y límites pendientes

18/18 pruebas PASS: espejo multipágina/allowlist, headers, portabilidad,
network-first/timeout/recovery, exclusión de datos clínicos y requests
autorizados, actualización waiting con una sola recarga y recuperación ante
activación agotada. `git diff --check`: PASS (solo avisos LF/CRLF).

QA de login autenticado y render completo: PENDING, sin cuenta de prueba.
AT&T: web.app PASS reportado por el usuario; apex PENDING en esa conexión.
Segunda red independiente: PENDING; el servicio de navegación no entregó
una comprobación utilizable. No se identifica esta máquina como red AT&T.

No hay cambios clínicos, Auth, App Check, Functions, Firestore ni Storage.
No hay commit ni push. `main` y `origin/main` tienen divergencia 0/0 en la
referencia local comprobada. Los scripts y configuración permanecen locales.
CI/publicaciones futuras quedan después de recuperar el apex; no se activó
ningún pipeline competidor ni se crearon claves permanentes.

Fuente de procedimiento: [Firebase Custom Domains](https://firebase.google.com/docs/hosting/custom-domain).
La documentación admite demoras de provisión/distribución; no constituye una
garantía de recuperación a una hora determinada ni sustituye la prueba GET.

PRODUCTION: NO-GO hasta contenido real y validaciones pendientes.

## Seguimiento programado

Se creó en este mismo hilo la automatización `recuperaci-n-cognici-n-firebase`,
activa cada 15 minutos, con fin el 11 de septiembre de 2026 a las 07:50 UTC
(01:50 de Ciudad de México). Comprueba el estado y continúa www únicamente
tras recuperar el apex. Debe pausarse al completar o al alcanzar el límite;
solo informa cambios significativos o acciones necesarias.
Necesita esta computadora encendida y la aplicación abierta, con acceso al
repositorio y las credenciales locales existentes. No es CI de despliegue.
