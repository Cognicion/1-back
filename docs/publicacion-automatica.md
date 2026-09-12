# Publicacion automatica de la web

## Uso

Trabajar en main y utilizar git add -- <archivos>, git commit y git push origin main.
El primer push que incluya .github/workflows/firebase-deploy.yml activa la
automatizacion. No hace falta ejecutar firebase deploy en el equipo para la web.

Consultar el resultado en:
https://github.com/Cognicion/1-back/actions/workflows/firebase-deploy.yml

Tambien puede repetirse desde Run workflow, seleccionando main.
La publicacion tarda unos minutos; push no significa que ya haya terminado.

## Alcance y pasos

El flujo publica Firebase Hosting: HTML, JavaScript del navegador, CSS, assets y
datos publicos incluidos por scripts/build-firebase-hosting.mjs. Se conserva el
artefacto allowlisted .firebase-hosting-public. No publica Functions, reglas,
credenciales o pruebas como archivos web.

Las Functions, reglas, indices, secretos y datos de Firestore mantienen su
despliegue separado. No se ejecuta un firebase deploy general.

1. Checkout de main sin conservar credenciales Git.
2. Node 24 y pruebas existentes del artefacto de Hosting.
3. Firebase CLI 15.22.4.
4. Autenticacion temporal mediante Google Workload Identity Federation.
5. firebase deploy --only hosting --project cognicion-57052 --non-interactive.
6. Comprobacion HTTP: index.html y appVersion.js coinciden con el commit.

El hook predeploy existente reconstruye el artefacto. Se corrige la comprobacion
de rutas para usar el separador nativo, tanto en Windows como en Linux.
Las acciones externas estan fijadas a SHA. Los despliegues se ejecutan en serie,
sin interrumpir uno que ya este publicando.
No se cambia la version visible: es un ajuste de infraestructura.

## Conexion configurada

Proyecto: cognicion-57052 (1037684177162).
Pool: github-cognicion. Proveedor: github-main.
Cuenta: github-hosting-deploy@cognicion-57052.iam.gserviceaccount.com.

El proveedor exige repository_id 1278375462, repository_owner_id 293690162,
refs/heads/main y el workflow exacto
Cognicion/1-back/.github/workflows/firebase-deploy.yml@refs/heads/main.
No acepta forks, otras ramas u otros workflows.

La cuenta tiene roles/firebasehosting.admin y
roles/serviceusage.serviceUsageConsumer. El principal federado del repositorio
tiene roles/iam.workloadIdentityUser sobre esa cuenta.
No se crearon claves JSON ni secretos de larga duracion.
No se otorgan permisos sobre documentos clinicos o despliegue de Functions.

La identidad se configuro en Google Cloud. El workflow queda local hasta que el
usuario lo incluya en su commit y push. No se crearon commits ni se hizo push.
Una ejecucion real de OIDC requiere ese push; las pruebas locales no la sustituyen.

## Diagnostico

Abrir la ejecucion en Actions y revisar el paso rojo. Un fallo de pruebas o
autenticacion detiene la publicacion; la version anterior sigue disponible.
Si falla la comprobacion HTTP posterior, el despliegue puede haber terminado:
consultar los registros antes de concluir que no se publico.

No subir credenciales al repositorio. Si se renombra el repositorio o el workflow,
actualizar la condicion del proveedor. Mantener restringido el acceso a main.

Referencias oficiales:
https://github.com/google-github-actions/auth
https://firebase.google.com/docs/cli#cli-ci-systems

