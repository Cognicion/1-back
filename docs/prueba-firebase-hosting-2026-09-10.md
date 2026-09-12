# Prueba controlada de Firebase Hosting — 2026-09-10

## Resultado ejecutivo

Se publicó exclusivamente el frontend de COGNICIÓN en el sitio Firebase Hosting ya existente y previamente vacío del proyecto `cognicion-57052`. No se desplegaron Functions, reglas de Firestore ni reglas de Storage. No se modificaron GitHub Pages, Cloudflare, DNS ni `cognicionlabs.com`.

URL primaria para la prueba A/B en AT&T:

<https://cognicion-57052.web.app/>

URL equivalente:

<https://cognicion-57052.firebaseapp.com/>

## 1. Raíz pública actual

La fuente actual de GitHub Pages es la raíz de `main` del repositorio `Cognicion/1-back`. La evidencia local es:

- `index.html`, `.nojekyll` y `CNAME` están en la raíz;
- `CNAME` contiene `cognicionlabs.com`;
- no existe workflow `.github` que construya o publique otro directorio;
- las 54 páginas HTML y sus referencias cargan desde la raíz mediante rutas relativas.

Frontend necesario para el espejo:

- HTML raíz;
- `css/`;
- JavaScript ejecutable y JSON de `js/`, excluyendo `js/tests/`, respaldos y documentación;
- `assets/` sólo en formatos utilizados (`png`, `webp`, `wav`, `json`, `docx`);
- `data/` JSON;
- `manifest.json`, `service-worker.js`, `health.json`, `robots.txt`, `sitemap.xml` y `respiracion.js`.

No se encontraron rutas internas absolutas que obliguen a usar `cognicionlabs.com`. `manifest.json` usa `./dashboard.html`, scope `./` e icono relativo. Sí existen canonical/OG públicos apuntando al dominio de producción, lo cual es correcto para evitar indexar la URL temporal. La Function de Google Calendar conserva un callback a producción, pero `functions/` no se publicó y no forma parte de esta prueba anónima.

## 2. Archivos deliberadamente no publicados

El artefacto generado excluye:

- `.git`, `.github`, configuración local y logs;
- `firebase.json`, `.firebaserc`, `CNAME` y `AGENTS.md`;
- `functions/`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` y `storage.cors.json`;
- `tests/` y `js/tests/`;
- `docs/`, `reports/`, `scripts/`, temporales y renders;
- `fuentes_farmacologicas/`, incluido el PDF Stahl;
- código fuente TypeScript de `sofia/` y documentos de `SOFIA CORE/`;
- respaldos `*.bak-*`, README y dotfiles internos.

Resultado final del build: 692 archivos, 47,530,308 bytes. Los endpoints de prueba para un test, un respaldo y un README excluidos responden 404 públicamente.

## 3. Configuración Firebase

- CLI: `15.22.4`.
- Cuenta autenticada: comprobada localmente.
- Proyecto seleccionado por `.firebaserc` y CLI: `cognicion-57052`.
- Único proyecto visible para la cuenta durante la auditoría: `cognicion-57052` (`COGNICION`, estado ACTIVE).
- Sitio existente: `cognicion-57052`, tipo `DEFAULT_SITE`.
- Antes de la prueba, ambas URLs de Hosting respondían 404.
- `firebase.json` no tenía configuración Hosting; se añadió sin rewrites.

La app es multipágina. Se mantuvieron URLs como `/biblioteca.html`, `/agenda.html`, `/medico.html` y `/paciente.html`; no existe rewrite `** -> /index.html`, `cleanUrls` está desactivado y no se cambió la lógica clínica.

## 4. Build público seguro

`scripts/build-firebase-hosting.mjs` genera `.firebase-hosting-public/` mediante allowlist. Ese directorio está ignorado por Git y Firebase lo reconstruye en `predeploy`. No se usa `public: "."`, evitando que el repositorio completo se convierta en contenido web.

El deploy utilizado fue exactamente:

```text
firebase deploy --only hosting --project cognicion-57052
```

El log confirmó `deploying hosting`, el sitio `hosting[cognicion-57052]` y 692 archivos. No hubo etapas de Functions, Firestore ni Storage.

## 5. Headers observados públicamente

| Recurso | Cache-Control |
|---|---|
| `/` y `/*.html` | `no-cache, max-age=0, must-revalidate` |
| `/service-worker.js` | `no-cache, no-store, must-revalidate` |
| `/health.json` | `no-store` |
| `/manifest.json`, `/js/**`, `/css/**`, `/data/**`, `/respiracion.js` | `no-cache, max-age=0, must-revalidate` |
| `/assets/**` | `public, max-age=3600, must-revalidate` |

`service-worker.js` se entrega como `text/javascript`, con `Service-Worker-Allowed: /`. Firebase también entrega HSTS en las URLs temporales. No se aplicó CSP nueva para evitar romper integraciones existentes durante esta prueba.

La caché de JS/CSS es conservadora porque el proyecto usa principalmente query strings manuales y no filenames content-hashed. Una política inmutable sería prematura.

## 6. Service Worker y origen temporal

- Usa `self.location.origin`/scope y no contiene `cognicionlabs.com` hardcodeado.
- `manifest.json` mantiene rutas relativas.
- La navegación conserva `network-first`, timeout, fallback controlado y respuesta terminal.
- Firebase/Auth/Firestore/Storage/Functions y requests autorizados quedan fuera de Cache Storage.
- Las pruebas confirman que documentos clínicos no se cachean.

El requerimiento mencionaba `CACHE_VERSION = 20260909-navigation-networkfirst-v1`. Al iniciar esta prueba, el `main` canónico ya contenía la versión posterior `20260909-availability-hardening-v2`, que conserva el cambio `network-first` y añade aislamiento de datos, timeout y recovery. No se degradó ni se reutilizó el namespace antiguo de caché.

## 7. Verificación pública posterior al deploy

| URL | Resultado |
|---|---|
| `/` | 200, HTML |
| `/index.html` | 200, HTML |
| `/biblioteca.html` | 200, HTML |
| `/diagnostico-red.html` | 200, HTML |
| `/health.json` | 200, JSON, 176 bytes |
| `/service-worker.js` | 200, JavaScript |
| `/js/availability-bootstrap.js` | 200, JavaScript |
| `/css/theme.css` | 200, CSS |
| `/assets/favicon-cognicion.png` | 200, PNG |
| `https://cognicion-57052.firebaseapp.com/` | 200, HTML |
| `https://cognicion-57052.firebaseapp.com/health.json` | 200, JSON |

Los archivos fuente y los del artefacto fueron idénticos por SHA-256 para las rutas críticas revisadas. `health.json` informa `appVersion 2.209` y build `20260909-availability-hardening-v2`.

## 8. Pruebas

- `tests/firebase-hosting-mirror.test.mjs` y `tests/web-availability-hardening.test.mjs`: 15/15 PASS.
- Configuración JSON: PASS.
- Allowlist y exclusiones: PASS.
- Rutas públicas y MIME: PASS.
- Headers públicos: PASS.
- Exclusiones públicas por 404: PASS.
- No se probó login completo, OAuth ni lectura clínica, conforme al alcance solicitado.

## 9. Entrega solicitada

- FIREBASE PROJECT: `cognicion-57052`
- HOSTING SITE: `cognicion-57052`
- TEMPORARY URL: <https://cognicion-57052.web.app/>
- ALTERNATE URL: <https://cognicion-57052.firebaseapp.com/>
- ROOT: PASS — HTTP 200
- INDEX: PASS — HTTP 200
- BIBLIOTECA: PASS — HTTP 200
- HEALTH: PASS — HTTP 200, JSON, `no-store`
- SERVICE WORKER: PASS — HTTP 200, JS, `no-store`, scope permitido `/`
- ASSETS: PASS — JS, CSS y PNG críticos HTTP 200
- DEPLOY: PASS — exclusivamente Firebase Hosting
- PRODUCTION DOMAIN CHANGED: NO
- GITHUB PAGES CHANGED: NO
- DNS CHANGED: NO

La prueba de infraestructura estará validada funcionalmente cuando el usuario abra la URL temporal desde la misma conexión AT&T afectada. Un resultado accesible allí y un timeout simultáneo en `cognicionlabs.com` aislaría aún más el problema a la ruta hacia GitHub Pages; no demostraría por sí solo la disponibilidad futura de Firebase ni autorizaría una migración.
