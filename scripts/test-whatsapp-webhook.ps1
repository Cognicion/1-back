[CmdletBinding()]
param([string]$JavaHome = $env:COGNICION_JAVA_HOME)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$actualRoot = (& git -C $repositoryRoot rev-parse --show-toplevel).Trim().Replace('\', '/')
if ($actualRoot -ne $repositoryRoot.Replace('\', '/') -or (& git -C $repositoryRoot branch --show-current).Trim() -ne 'main') {
    throw 'Las pruebas requieren el repositorio principal en main.'
}
if (-not $JavaHome) { $JavaHome = $env:JAVA_HOME }
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'release'))) {
    throw 'Indica -JavaHome con el JDK 21 existente; no se instala ni desinstala Java.'
}
$javaRelease = Get-Content -LiteralPath (Join-Path $JavaHome 'release')
if (-not ($javaRelease -match '^JAVA_VERSION="21\.')) { throw 'Estas pruebas requieren Java 21.' }
$firebase = (Get-Command firebase.cmd -ErrorAction Stop).Source
$firebaseEntry = Join-Path (Split-Path -Parent $firebase) 'node_modules/firebase-tools/lib/bin/firebase.js'
if (-not (Test-Path -LiteralPath $firebaseEntry)) { throw 'No se encontró la entrada Node del Firebase CLI global.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
foreach ($package in @('firebase-admin', '@firebase/rules-unit-testing', 'firebase')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot "functions/node_modules/$package/package.json"))) {
        throw "Falta una dependencia declarada: $package. No se instalará automáticamente."
    }
}
$tmpParent = Join-Path $repositoryRoot '.tmp'
$testDirectory = Join-Path $tmpParent 'whatsapp-tests'
foreach ($candidate in @($tmpParent, $testDirectory)) {
    if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'El directorio temporal de pruebas no puede ser un enlace.'
    }
}
$null = New-Item -ItemType Directory -Path $testDirectory -Force
$configuration = Join-Path $testDirectory 'firebase.json'
@{
    firestore = @{ rules = (Join-Path $repositoryRoot 'firestore.rules') }
    emulators = @{
        singleProjectMode = $true
        firestore = @{ host = '127.0.0.1'; port = 8085 }
        hub = @{ host = '127.0.0.1'; port = 4405 }
        logging = @{ host = '127.0.0.1'; port = 4505 }
        ui = @{ enabled = $false }
    }
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configuration -Encoding utf8

$names = @('JAVA_HOME', 'PATH', 'JAVA_TOOL_OPTIONS', 'TEMP', 'TMP', 'CI', 'FIRESTORE_EMULATOR_HOST', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location $testDirectory
try {
    $env:JAVA_HOME = $JavaHome
    $env:PATH = "$(Join-Path $JavaHome 'bin');$env:PATH"
    $env:TEMP = $testDirectory
    $env:TMP = $testDirectory
    $env:JAVA_TOOL_OPTIONS = "-Xmx512m `"-Djava.io.tmpdir=$testDirectory`""
    $env:CI = 'true'
    $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
    $env:GCLOUD_PROJECT = 'demo-cognicion-whatsapp'
    $env:GOOGLE_CLOUD_PROJECT = 'demo-cognicion-whatsapp'
    & $node --test (Join-Path $repositoryRoot 'functions/test/whatsappWebhook.test.js')
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas unitarias/HTTP.' }
    $command = 'node --test --test-concurrency=1 "' + (Join-Path $repositoryRoot 'functions/test/emulator/whatsappWebhook.test.mjs') + '"'
    # Invoke Node directly: the .cmd wrapper reparses quotes in repository paths
    # containing spaces and can split the test command into extra arguments.
    & $node $firebaseEntry emulators:exec --project demo-cognicion-whatsapp --only firestore --config $configuration $command
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas de Firestore/Rules.' }
}
finally {
    Pop-Location
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
