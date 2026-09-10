# COGNICIÓN — auditoría y hardening de disponibilidad web

Fecha de auditoría: 2026-09-09 (America/Mexico_City)  
Alcance: hosting público, PWA/Service Worker, bootstrap, recuperación, diagnóstico y continuidad.  
Estado de infraestructura: **recomendación solamente; no se cambió DNS, Cloudflare, GitHub Pages ni Firebase Hosting**.

## 1. Resumen ejecutivo

La causa primaria demostrada del incidente no está en el navegador: desde la ruta afectada, DNS e ICMP funcionaron, pero TCP/443 no pudo establecerse contra ninguna de las cuatro direcciones IPv4 de GitHub Pages. La formulación precisa es **falla selectiva de alcance TCP entre esa ruta móvil y el edge de GitHub Pages**. La evidencia no permite atribuir responsable final a la operadora, a un tránsito intermedio o a GitHub.

El Service Worker tenía un defecto real y secundario: entregaba a `FetchEvent.respondWith()` una promesa de navegación rechazada. El cambio previo de `networkOnly` a `networkFirst` va en la dirección correcta, pero antes del hardening aún carecía de timeout y de una `Response` final cuando red y caché fallaban; además podía cachear documentos con query strings sin una política explícita de privacidad.

El dominio usa Cloudflare como DNS autoritativo, no como proxy HTTP/CDN. El navegador recibe directamente las IP de GitHub Pages. Por tanto, Cloudflare no protegió al usuario de la ruta fallida.

Recomendación:

1. Corto plazo: conservar GitHub Pages mientras se valida en ventana controlada el proxy de Cloudflare con TLS Full (strict), sin cachear HTML, `service-worker.js` ni `health.json` en edge al inicio. No activarlo sin pruebas de certificado, redirects, actualización PWA y autenticación.
2. Estratégico: preparar Firebase Hosting como candidato principal en paralelo, con canal de preview, allowlist de archivos públicos, headers explícitos y rollback ensayado. Es el candidato que mejor encaja sin dividir los dos archivos actuales mayores de 25 MiB.
3. Continuidad: publicar una página de estado/recuperación sin PHI en un hostname predeterminado de otro proveedor. No presentar el segundo hostname como expediente clínico offline ni como failover instantáneo.
4. Producción: **NO-GO** hasta validar desde al menos dos redes móviles mexicanas que el frontend, TLS, OAuth, SW y rollback funcionan con la capa elegida.

## 2. Arquitectura actual real

Evidencia local y pública:

- `CNAME` del repositorio: `cognicionlabs.com`.
- Repositorio remoto: `https://github.com/Cognicion/1-back.git`; la API pública reporta `has_pages: true`, repositorio público y rama predeterminada `main`.
- `firebase.json` configura Functions, Firestore, Storage y emuladores, pero **no** contiene bloque `hosting`.
- Nameservers autoritativos: `lia.ns.cloudflare.com` y `henrik.ns.cloudflare.com`.
- Apex `A`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
- `www` es `CNAME cognicion.github.io`.
- No se observó `AAAA` en el apex durante la auditoría.
- 1.1.1.1, 8.8.8.8 y el nameserver autoritativo devolvieron las IP de GitHub Pages, no IP de Cloudflare.

Diagrama actual:

```text
USUARIO
  |
  v
RESOLVER DNS
  |
  v
CLOUDFLARE DNS AUTORITATIVO  <-- dependencia DNS; no transporta HTTP
  |
  | responde IP/CNAME de GitHub Pages (DNS-only)
  v
GITHUB PAGES EDGE           <-- terminación TLS y hosting del frontend
  |
  v
NAVEGADOR / SERVICE WORKER
  |
  +--> gstatic Firebase SDK
  +--> Firebase Auth / Firestore / Storage / Cloud Functions
```

Cloudflare no está en la conexión HTTP actual. Esto se demuestra porque un registro proxied devuelve direcciones anycast de Cloudflare y oculta el origen; los registros observados devuelven exactamente las IP publicadas por GitHub Pages. GitHub documenta esas cuatro IP para dominios apex: <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>. Cloudflare documenta que un registro proxied intercepta la petición antes del origen: <https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/>.

### TLS, redirects y headers

- Terminación TLS actual esperada: GitHub Pages, porque el transporte no atraviesa Cloudflare.
- El incidente ocurre antes de TLS: no se completa TCP/443. Certificado, HSTS, Service Worker y JavaScript todavía no participan.
- `www` debería redirigir al apex porque el dominio configurado es el apex y `www` apunta al dominio predeterminado de Pages; GitHub documenta ese comportamiento. La ruta auditada no permitió observar el redirect porque también agotó el tiempo.
- No se pudo medir desde esta ruta el certificado servido, HSTS ni los headers de caché de producción. El repositorio no puede definirlos para GitHub Pages y no contiene una política CSP declarada en HTML.
- Antes de producción deben capturarse desde una red que sí alcance Pages: cadena y SAN del certificado, expiración, `Location` de HTTP y `www`, HSTS, `Cache-Control`, `Age`, `ETag`, `Server`, `Via`/`CF-Cache-Status` y headers específicos de `service-worker.js`, HTML y `health.json`.

## 3. Causa del incidente

### Primaria, demostrada

```text
DNS OK
ICMP OK
Internet/HTTPS general OK
github.com OK
TCP/443 a las IP de GitHub Pages TIMEOUT
```

La misma ruta falló desde iPhone y desde Windows a través del hotspot; otra conexión sí abrió COGNICIÓN. Durante esta auditoría se reprodujo desde otra ruta de trabajo: `github.com` respondió 200 mientras `cognicion.github.io`, apex y `www` agotaron el tiempo.

Conclusión: **incidente de ruta/filtrado selectivo de TCP/443 hacia el rango de GitHub Pages**. No hay evidencia suficiente para identificar qué red aplicó el descarte.

### Secundaria, demostrada

El Service Worker interceptaba documentos y su estrategia podía terminar en una promesa rechazada. Eso explica los errores de Safari y Chrome, pero no el timeout TCP inicial. Un SW ya instalado puede mejorar la degradación; no puede instalarse ni ejecutarse por primera vez cuando el navegador no llega al origen.

## 4. Single Points of Failure y riesgos

1. **Entrega del frontend:** todo el dominio depende del edge de GitHub Pages.
2. **Ruta IPv4 directa:** no hay proxy y no se observó AAAA; una ruta móvil defectuosa a esas IPv4 elimina el acceso.
3. **DNS:** Cloudflare es el único proveedor autoritativo de zona, aunque opera con dos nameservers.
4. **Recovery en el mismo origen:** cualquier `offline.html`, `health.json` o diagnóstico bajo `cognicionlabs.com` desaparece para un usuario nuevo si el origen no es alcanzable.
5. **Bootstrap externo:** el registro del SW dependía indirectamente de cargar primero módulos Firebase desde `www.gstatic.com`.
6. **SW previo al hardening:** sin timeout de navegación, sin respuesta terminal garantizada y con caché documental demasiado amplia.
7. **Versiones divergentes:** versión visible `2.208`, `CACHE_VERSION` `20260909-navigation-networkfirst-v1` y una constante llamada `APP_VERSION` en control de caché aún en `20260827-panel-pacientes-fallback-v1`.
8. **Versionado manual de assets:** conviven URLs sin versión y numerosas etiquetas `?v=` no coordinadas; puede ocurrir HTML N + JS N+1 + CSS N-1.
9. **Sin health/diagnóstico público mínimo:** no existe señal separada de disponibilidad del frontend.
10. **Sin telemetría de disponibilidad dedicada:** hay marcas puntuales de performance, no un contrato técnico común ni un colector sin PHI.
11. **Idoneidad del hosting:** GitHub Pages declara que no está orientado a SaaS ni a transacciones sensibles, además de límites blandos de 100 GB/mes: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>.
12. **Artefactos publicados:** el árbol rastreado contiene 1,588 archivos (~76.5 MiB), incluyendo una fuente PDF y archivos de desarrollo que no deberían formar parte de una allowlist de hosting por defecto.

## 5. Comparación de hosting

| Criterio | GitHub Pages actual | Firebase Hosting | Cloudflare Pages | Cloudflare edge + GitHub |
|---|---|---|---|---|
| Disponibilidad/ruta | Falló en el incidente observado | CDN global; debe medirse desde México | Red global; debe medirse desde México | Cambia la ruta del usuario a Cloudflare, mitigando el incidente específico |
| TLS/custom domain | Automático, control limitado | SSL y dominio custom | SSL y dominio custom | TLS usuario-edge + edge-origin; requiere Full (strict) válido |
| Cache headers | Control muy limitado | Configurables en `firebase.json` | Configurables con `_headers` | Reglas edge; HTML/JSON no se cachean por defecto |
| Rollback | Ligado a publicación Git | Historial de releases y rollback | Rollback de deployment | DNS-only es rollback del proxy; no revierte contenido |
| Preview | Flujo Git/Actions | Canales de preview | Preview deployments | No agrega preview del origen |
| Integración actual | Ya publicado | Backend ya existe; frontend sigue desacoplado | Git integration sencilla | Cambio operativo menor, origen sin cambios |
| PWA/SW | Compatible | Compatible y headers explícitos | Compatible y headers explícitos | Compatible si se excluye SW/HTML de cache edge inicial |
| Coste | Incluido con límites y restricciones | 10 GB almacenamiento y 10 GB/mes de transferencia sin costo; luego Blaze | Límites de build/archivos por plan | Proxy disponible según plan; funciones avanzadas varían |
| Lock-in | GitHub | Google/Firebase | Cloudflare | Cloudflare + GitHub |
| Observabilidad | Escasa | Métricas de Hosting/GCP | Analytics/headers `Cf-Ray` | `Cf-Ray` y analytics edge, origen sigue separado |
| Bloqueador local | Incidente real | Requiere output público allowlisted | Dos archivos exceden 25 MiB | No elimina GitHub como origen |

Firebase documenta CDN global, SSL y custom domains: <https://firebase.google.com/docs/hosting/quickstart>. También documenta control de caché y headers: <https://firebase.google.com/docs/hosting/manage-cache> y rollback: <https://firebase.google.com/docs/hosting/manage-hosting-resources>.

Cloudflare Pages documenta rollback y custom domains: <https://developers.cloudflare.com/pages/configuration/rollbacks/> y <https://developers.cloudflare.com/pages/configuration/custom-domains/>. Su límite de 25 MiB por archivo bloquea el árbol actual: <https://developers.cloudflare.com/pages/platform/limits/>. Los archivos `js/data/catalogoDiagnosticos.js` (29,499,055 bytes) y `fuentes_farmacologicas/stahl_prescribers_guide.pdf` (26,865,827 bytes) lo exceden.

### Recomendación de hosting

**Firebase Hosting es el candidato estratégico preferido**, sujeto a prueba paralela, porque permite el árbol actual, headers explícitos, CDN, preview y rollback. No debe usarse `public: "."`: se requiere un artefacto público allowlisted para no publicar fuentes, tests, logs, Functions, documentación interna ni material farmacológico.

Cloudflare Pages es una alternativa válida después de dividir/excluir activos mayores de 25 MiB, pero concentraría DNS y hosting en Cloudflare. GitHub Pages no es recomendable como frontend primario de largo plazo para esta plataforma clínica por el incidente y por sus propias condiciones de uso.

## 6. Evaluación de Cloudflare proxy

El proxy puede evitar que el dispositivo se conecte directamente a `185.199.108.153/22`: el usuario resolvería y abriría una IP anycast de Cloudflare, y Cloudflare abriría la conexión al origen. Esto mitiga la ruta móvil observada, pero GitHub Pages continúa siendo origen único.

Configuración candidata, **no aplicada**:

- Proxy en apex y `www`.
- Universal SSL activo.
- SSL/TLS `Full (strict)`, nunca Flexible. Cloudflare exige certificado vigente, confiable y con SAN coincidente: <https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/>.
- Sin `Cache Everything`.
- Bypass de cache edge para `service-worker.js`, documentos HTML, `manifest.json`, `health.json` y diagnóstico durante el canary.
- Caché sólo para assets públicos versionados después de validar la disciplina de versiones.

Posibles roturas a comprobar:

- certificado del origen y renovación de GitHub Pages detrás del proxy;
- 526 por Full (strict) si el certificado del origen no coincide;
- loops si se usa Flexible o reglas de redirect contradictorias;
- HTML/SW obsoletos por Cache Rules;
- `www` vs apex y canonical;
- desafíos/WAF sobre navegación o assets;
- CSP/CORS de `gstatic`, Firebase, Functions y Storage;
- Firebase authorized domains y flujos popup/redirect;
- Google Calendar OAuth callback, que hoy usa directamente `cloudfunctions.net`;
- webhook de WhatsApp, que debe seguir fuera del proxy del frontend;
- una sola recarga en la activación del SW.

Cambiar el proxy no cambia el origin visible del navegador (`https://cognicionlabs.com`), por lo que CORS y OAuth no deberían cambiar por sí solos. Aun así, deben probarse porque reglas edge, redirects o CSP sí pueden alterarlos.

## 7. Estrategia de Service Worker y caché

| Categoría | Estrategia propuesta | Persistencia en Cache Storage |
|---|---|---|
| Documento público allowlisted | network-first con timeout; caché por pathname canónico | Sí, sólo shell público |
| Documento clínico/autenticado | network-first con timeout; recovery shell al fallar | No |
| Asset estático versionado same-origin | cache-first por URL versionada | Sí |
| Asset estático no versionado same-origin | network-first con timeout y fallback | Sí si la respuesta es pública/cacheable |
| Imagen/fuente same-origin | cache-first con error controlado | Sí |
| `health.json` y probes | network-only/bypass del SW | No |
| Firebase/Auth/Firestore/Storage/Functions | no interceptar | No |
| API externa/cross-origin | no interceptar | No |
| Request con Authorization o ruta sensible | no interceptar | No |
| PHI, tokens, respuestas Firestore | prohibido | No |

Las query strings de navegación no deben crear una entrada por paciente/campaña: el único documento cacheado se elige por pathname allowlisted. Para rutas clínicas no se guarda HTML; al fallar la red se sirve `offline.html`. Las respuestas con `private`, `no-store`, `no-cache` o `Vary: *` no deben almacenarse.

El `CACHE_VERSION` identifica el esquema de caché; `APP_VERSION` identifica la versión visible. Deben permanecer separados. Hasta contar con manifest de build, no debe declararse inmutable un asset si su URL no cambia con el contenido.

## 8. Recovery shell, bootstrap y diagnóstico

Recovery shell:

- documento autocontenido, sin Firebase, fuentes externas ni PHI;
- distingue `navigator.onLine === false` de “red disponible pero COGNICIÓN no responde”;
- ofrece reintentar y abrir diagnóstico;
- nunca lee pacientes ni respuestas clínicas cacheadas.

Bootstrap watchdog incremental:

```text
BOOT_START -> HTML_READY -> MAIN_LOADED -> FIRST_RENDER -> APP_READY
                         \-> timeout/error -> recovery UI
```

La primera cobertura se limita a las tres entradas críticas (`index.html`, `login.html`, `dashboard.html`). El recovery no recarga automáticamente. El resto de las páginas debe incorporarse por lotes después de validar ausencia de falsos positivos.

Diagnóstico público:

1. `health.json`;
2. documento principal;
3. asset estático;
4. host de Firebase Auth sin credenciales;
5. host de Firestore sin lectura;
6. host de Cloud Functions sin invocar función clínica;
7. host de Storage sin objeto ni token.

El navegador no expone DNS ni distingue siempre CORS de una falla de transporte; un `TypeError` se reporta honestamente como `CORS/RED ERROR`. Las pruebas cross-origin en modo `no-cors` sólo demuestran reachability del host, no salud funcional ni autorización.

## 9. Health y observabilidad

`health.json` debe ser menor de 1 KB, sin Firebase ni PHI, con estado, versión visible, identificador de build y timestamp. En GitHub Pages no puede garantizarse `Cache-Control: no-store`; los probes usarán query única y `cache: no-store`. Firebase Hosting o Cloudflare permiten fijar headers después.

Contrato de eventos técnicos allowlisted:

- `BOOT_START`, `HTML_READY`, `SW_READY`, `SW_NETWORK_TIMEOUT`, `SW_CACHE_FALLBACK`, `SW_CACHE_MISS`, `MAIN_LOADED`, `FIREBASE_READY`, `FIRST_RENDER`, `APP_READY`.
- Campos: timestamp, appVersion, browser family, clase de plataforma, estado genérico de red y duración.
- Prohibidos: URL completa/query, UID, email, tokens, nombres, diagnósticos, medicamentos, texto clínico, rutas Firestore y payloads.

El hardening local conserva una cola limitada por sesión y no la transmite porque no existe colector aprobado. Un colector futuro debe ser de dominio separado o tolerar reintentos, aceptar sólo el esquema allowlisted y aplicar límites/retención.

## 10. Pruebas de caos

Matriz reproducible propuesta:

| Caso | Inyección | Resultado esperado |
|---|---|---|
| Normal | servidor local/producción | UI y `health.json` OK |
| Offline total | DevTools offline | shell previo o recovery, nunca blanco |
| DNS failure | hosts/proxy de prueba | timeout/recovery; diagnóstico reconoce limitación |
| TCP/origin timeout | route abort/intercept | timeout acotado y recovery |
| JS crítico caído | abort de `dashboard.js`/`auth.js` | watchdog visible, sin reload loop |
| CSS caído | abort CSS | contenido usable/recovery sin dependencia CSS |
| Firebase caído | bloquear Google/Firebase | shell carga; SW permanece registrable; error explícito de función |
| Functions caídas | bloquear `cloudfunctions.net` | frontend vivo; función degradada explícitamente |
| SW/caché antiguo | worker previo + nueva versión | banner no bloqueante y una recarga al aceptar |
| Caché vacío | clear storage + offline | recovery inline o error explícito |
| Red lenta/desaparece | throttling + corte | timeout sin carga infinita |

La automatización local cubre clasificación, privacidad, timeout, fallback y contrato estático. Las pruebas reales de TCP, TLS y OAuth requieren navegador/red externa.

## 11. Redundancia y continuidad

Un Service Worker no resuelve un primer acceso sin TCP. Un DNS failover tampoco es instantáneo: TTL, cachés recursivas, caché negativa, propagación, TLS y conexiones existentes retrasan el cambio. Cloudflare documenta que el TTL controla cuánto tardan en verse cambios: <https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/>.

Diseño recomendado:

```text
PRIMARIO
cognicionlabs.com -> edge/hosting elegido -> shell estático -> Firebase APIs

RECUPERACIÓN INDEPENDIENTE
hostname predeterminado de otro proveedor -> estado + instrucciones + diagnóstico sin PHI
```

No se recomienda exponer inmediatamente la aplicación clínica completa en dos origins. Service Worker scope, cookies, Firebase authorized domains, OAuth redirect URIs y versiones pueden divergir. Primero debe existir una página de recuperación independiente. Después, si se requiere aplicación alterna, debe tratarse como otro origin formal, con pruebas de autorización y un pipeline que publique el mismo build inmutable en ambos destinos.

## 12. Seguridad clínica

- Cache Storage conserva sólo recursos públicos y shells allowlisted.
- Firestore, Auth, Storage, Functions y APIs externas quedan fuera de la intercepción/caché.
- Recovery y diagnóstico no leen autenticación ni datos locales clínicos.
- No se modifican reglas, esquemas, persistencia, pacientes ni Functions.
- No se hace público ningún endpoint privado.
- La persistencia local de Firestore existente sigue siendo una decisión separada por dispositivo personal; no se usa para simular expediente offline.

Hallazgo adicional: la publicación desde la raíz puede exponer archivos que no necesita el navegador. La migración debe producir un directorio allowlisted; no debe copiar ciegamente todo el repositorio.

## 13. Cambios mínimos locales autorizados

1. Endurecer `service-worker.js`: timeout, shell seguro, bypass privado/cross-origin, respuesta terminal y mensajes técnicos sin URL.
2. Añadir `offline.html`, `health.json` y `diagnostico-red.html` autocontenidos.
3. Añadir watchdog/telemetría por sesión a las tres entradas críticas y desacoplar el registro del SW de Firebase.
4. Corregir el control de actualización para una sola recarga y separar `APP_VERSION` de `CACHE_VERSION`.
5. Incrementar versión visible de `2.208` a `2.209`.
6. Añadir pruebas estáticas/dinámicas de disponibilidad y privacidad.

No se tocarán DNS, Cloudflare, hosting, deploy, Firestore, Storage, Functions, OAuth, webhooks, commits ni GitHub.

## 14. Plan de despliegue y rollback

### Cliente/PWA

1. Ejecutar tests locales y `git diff --check`.
2. Servir el árbol con HTTP local y validar navegación normal.
3. En un perfil limpio, instalar SW y confirmar caches allowlisted.
4. Cortar red y confirmar recovery sin PHI.
5. Actualizar desde worker anterior; pulsar “Actualizar”; confirmar exactamente una recarga.
6. Publicar sólo por decisión del usuario.

Rollback del código: restaurar por rutas únicamente los archivos de esta entrega o publicar el commit anterior. No borrar Cache Storage desde servidor; un nuevo `CACHE_VERSION` seguro debe reemplazar al worker defectuoso.

### Cloudflare proxy

1. Exportar DNS y capturar estado de TLS/Pages.
2. Verificar certificado GitHub y Universal SSL.
3. Establecer Full (strict) y reglas de bypass antes del canary.
4. Activar proxy en ventana controlada para apex y `www`.
5. Validar desde Wi-Fi, dos operadoras móviles y navegador limpio.
6. Rollback: volver ambos registros a DNS-only. Considerar hasta el TTL observado; no prometer reversión instantánea.

### Migración de hosting

1. Construir artefacto público allowlisted.
2. Desplegar a un canal/hostname de preview sin cambiar el dominio.
3. Probar tamaño, MIME, redirects, headers, OAuth, SW y datos privados.
4. Ensayar rollback.
5. Cambiar DNS sólo con aprobación explícita y ventana de cambio.

## 15. Criterio de salida

- LOCAL: PASS sólo tras tests automatizados y servidor local.
- SERVICE WORKER: PASS sólo tras fallback, privacidad y actualización de una recarga.
- RECOVERY: PASS sólo si funciona sin dependencias ni PHI.
- SECURITY: PASS sólo si ningún request de datos entra a Cache Storage.
- INFRASTRUCTURE: RECOMMENDATION ONLY.
- PRODUCTION: NO-GO hasta canary en redes externas, verificación de headers/TLS y aprobación de despliegue.

## 16. Resultado de la implementación local

### Archivos modificados

- `service-worker.js`: clasificación, timeouts, fallback terminal, caché pública allowlisted y exclusión de datos/Firebase.
- `index.html`, `login.html`, `dashboard.html`: watchdog temprano y marcadores de scripts críticos.
- `js/availability-bootstrap.js`: watchdog, recovery UI y eventos técnicos allowlisted en sesión.
- `js/dashboard.js`: señal explícita de `APP_READY` y recovery ante fallo de bootstrap.
- `js/services/cacheControlService.js`: registro independiente, actualización no bloqueante y máximo una recarga.
- `js/services/firebaseAppService.js`: evento técnico `FIREBASE_READY` sin identificadores.
- `js/config/appVersion.js`: versión visible `2.208` -> `2.209`.
- `offline.html`: recovery shell autocontenido sin datos clínicos.
- `health.json`: recurso público de 176 bytes con versión/build, sin Firebase ni PHI.
- `diagnostico-red.html`: pruebas secuenciales sin credenciales, tokens ni lecturas clínicas.
- `tests/web-availability-hardening.test.mjs`: pruebas de timeout, caché, privacidad, recovery y versionado.
- `tests/admin-membership-static.test.mjs`: expectativa del marcador nuevo de `dashboard.js`.
- `docs/auditoria-disponibilidad-web-2026-09-09.md`: este informe.

### Validación realizada

- Sintaxis JavaScript (`node --check`) en SW, bootstrap, control de caché, servicio Firebase y dashboard: PASS.
- Pruebas específicas de disponibilidad: 11/11 PASS.
- Regresión dirigida afectada/adyacente: 51/51 PASS tras actualizar la única expectativa causada por esta entrega.
- `git diff --check`: PASS.
- Servidor HTTP local: `health.json` respondió 200 y 176 bytes; index, login, recovery y diagnóstico renderizaron correctamente.
- Navegador Chromium con perfil persistente: instalación y control real del SW, navegación pública cacheada sin servidor, y ruta clínica degradada a `offline.html` sin PHI: PASS.
- Watchdog: dashboard sin completar inicialización muestra recovery y no inicia recargas automáticas: PASS.

Tres pruebas históricas fuera del área modificada permanecen fallando por expectativas ya obsoletas en `HEAD`: `mi-nube-integration-static` exige `APP_VERSION 2.095` y `sofia-ecg-static` exige `2.198`, aunque la base anterior a esta tarea ya era `2.208`; `patient-transfer-static` exige un marcador de `nota.js` de agosto, mientras `HEAD` ya usa `20260904-parametros-colera-v2`. No se alteraron esos módulos ni se maquillaron sus pruebas.

### Estado de entrega

- LOCAL: PASS.
- SERVICE WORKER: PASS local; falta canary de actualización y redes móviles antes de producción.
- RECOVERY: PASS.
- SECURITY: PASS para el alcance local auditado; no se cachean requests clínicas, Firebase ni autorizadas.
- INFRASTRUCTURE: RECOMMENDATION ONLY; sin cambios externos.
- PRODUCTION: NO-GO hasta despliegue controlado, captura TLS/headers, pruebas OAuth/CORS y canary desde al menos dos redes móviles.
