[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$ProjectId = "cognicion-57052",
    [string]$Bucket = "cognicion-57052.firebasestorage.app",
    [string]$GcloudPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDirectory = Split-Path -Parent $PSCommandPath
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))
$corsFile = Join-Path $repositoryRoot "storage.cors.json"
$expectedProjectId = "cognicion-57052"
$expectedBucket = "cognicion-57052.firebasestorage.app"
$allowedOrigins = @("https://cognicionlabs.com")

function Resolve-Gcloud {
    if ($GcloudPath) {
        $resolved = [System.IO.Path]::GetFullPath($GcloudPath)
        if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
            throw "No existe gcloud en la ruta indicada: $resolved"
        }
        return $resolved
    }

    $command = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $localSdk = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    if (Test-Path -LiteralPath $localSdk -PathType Leaf) { return $localSdk }
    throw "Google Cloud SDK no está disponible. Instala Google.CloudSDK antes de gestionar CORS."
}

function Assert-CanonicalContext {
    $actualRoot = (& git -C $repositoryRoot rev-parse --show-toplevel 2>$null).Trim().Replace("\", "/")
    $expectedRoot = $repositoryRoot.Replace("\", "/").TrimEnd("/")
    if ($actualRoot.TrimEnd("/") -ne $expectedRoot) {
        throw "Este script solo puede ejecutarse desde el repositorio canónico 1-back."
    }
    if ((& git -C $repositoryRoot branch --show-current 2>$null).Trim() -ne "main") {
        throw "La gestión de CORS solo está permitida desde la rama main."
    }
    if ($ProjectId -ne $expectedProjectId -or $Bucket -ne $expectedBucket) {
        throw "ProjectId o bucket inesperados; se aborta para impedir cambios en otro entorno."
    }
    if (-not (Test-Path -LiteralPath $corsFile -PathType Leaf)) {
        throw "Falta la configuración versionada storage.cors.json."
    }
}

function Normalize-StringArray([object]$Value) {
    return @($Value | ForEach-Object { [string]$_ } | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-ObjectProperty([object]$Value, [string[]]$Names, [object]$Default = $null) {
    if ($null -eq $Value) { return $Default }
    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($name in $Names) {
            if ($Value.Contains($name)) { return $Value[$name] }
        }
        return $Default
    }
    foreach ($name in $Names) {
        $property = $Value.PSObject.Properties[$name]
        if ($null -ne $property) { return $property.Value }
    }
    return $Default
}

function Normalize-CorsEntry([object]$Entry) {
    $origins = @(Normalize-StringArray (Get-ObjectProperty $Entry @("origin", "origins") @()))
    $methods = @(Normalize-StringArray (Get-ObjectProperty $Entry @("method", "methods") @()))
    $headers = @(Normalize-StringArray (Get-ObjectProperty $Entry @("responseHeader", "responseHeaders", "response_headers") @()))
    $maxAge = [int](Get-ObjectProperty $Entry @("maxAgeSeconds", "max_age_seconds") 0)
    return [ordered]@{
        origin = $origins
        method = $methods
        responseHeader = $headers
        maxAgeSeconds = $maxAge
    }
}

function Assert-RestrictiveCors([object[]]$Entries, [switch]$DesiredOnly) {
    foreach ($entryValue in $Entries) {
        $entry = Normalize-CorsEntry $entryValue
        if ($entry.origin -contains "*") { throw "CORS contiene un origen wildcard; se aborta." }
        foreach ($origin in $entry.origin) {
            if (-not $origin.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "CORS contiene un origen no HTTPS: $origin"
            }
            if ($DesiredOnly -and $allowedOrigins -notcontains $origin) {
                throw "storage.cors.json contiene un origen no autorizado: $origin"
            }
        }
        foreach ($method in $entry.method) {
            if ($DesiredOnly -and $method -notin @("GET", "HEAD")) {
                throw "storage.cors.json solicita un método no permitido para getBlob(): $method"
            }
        }
    }
}

function Get-BucketState([string]$Executable) {
    $raw = (& $Executable storage buckets describe "gs://$Bucket" --project=$ProjectId --format=json 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "No se pudo leer el bucket con gcloud:`n$raw" }
    $state = $raw | ConvertFrom-Json
    $cors = @(Get-ObjectProperty $state @("cors_config", "cors") @())
    return [pscustomobject]@{
        Cors = @($cors | ForEach-Object { Normalize-CorsEntry $_ })
        Metageneration = [string](Get-ObjectProperty $state @("metageneration") "")
    }
}

function Cors-Key([object]$Entry) {
    $normalized = Normalize-CorsEntry $Entry
    return ($normalized.origin -join "|")
}

function Merge-Cors([object[]]$Existing, [object[]]$Desired) {
    $merged = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $Existing) { $merged.Add((Normalize-CorsEntry $entry)) }

    foreach ($desiredEntryValue in $Desired) {
        $desiredEntry = Normalize-CorsEntry $desiredEntryValue
        $desiredKey = Cors-Key $desiredEntry
        $index = -1
        for ($i = 0; $i -lt $merged.Count; $i += 1) {
            if ((Cors-Key $merged[$i]) -eq $desiredKey) { $index = $i; break }
        }
        if ($index -lt 0) {
            $merged.Add($desiredEntry)
            continue
        }

        $current = Normalize-CorsEntry $merged[$index]
        $merged[$index] = [ordered]@{
            origin = $current.origin
            method = Normalize-StringArray @($current.method + $desiredEntry.method)
            responseHeader = Normalize-StringArray @($current.responseHeader + $desiredEntry.responseHeader)
            maxAgeSeconds = [Math]::Max($current.maxAgeSeconds, $desiredEntry.maxAgeSeconds)
        }
    }
    return @($merged)
}

function Canonical-Json([object]$Value) {
    return ($Value | ConvertTo-Json -Depth 8 -Compress)
}

function Format-JsonArray([object[]]$Entries) {
    return (ConvertTo-Json -InputObject @($Entries) -Depth 8)
}

Assert-CanonicalContext
$gcloud = Resolve-Gcloud
# Windows PowerShell 5.1 conserva los arrays JSON de nivel raíz como un array
# anidado. El foreach explícito iguala su contrato con PowerShell 7 antes de
# validar o fusionar; omitirlo produciría una entrada CORS vacía.
$desiredDocument = Get-Content -Raw -LiteralPath $corsFile | ConvertFrom-Json
$desired = @()
foreach ($entry in $desiredDocument) { $desired += $entry }
Assert-RestrictiveCors -Entries $desired -DesiredOnly

$before = Get-BucketState $gcloud
Assert-RestrictiveCors -Entries $before.Cors
$finalCors = Merge-Cors -Existing $before.Cors -Desired $desired
Assert-RestrictiveCors -Entries $finalCors

Write-Host "CORS previo:"
Write-Host (Format-JsonArray $before.Cors)
Write-Host "CORS fusionado:"
Write-Host (Format-JsonArray $finalCors)

if (-not $Apply) {
    Write-Host "Dry-run completado. No se modificó el bucket. Usa -Apply solo después de aprobar las pruebas."
    exit 0
}

$check = Get-BucketState $gcloud
if ((Canonical-Json $check.Cors) -ne (Canonical-Json $before.Cors) -or
    ($before.Metageneration -and $check.Metageneration -ne $before.Metageneration)) {
    throw "El bucket cambió después de la lectura inicial; vuelve a ejecutar el dry-run antes de aplicar."
}

$temporaryFile = Join-Path ([System.IO.Path]::GetTempPath()) ("cognicion-storage-cors-" + [guid]::NewGuid() + ".json")
try {
    [System.IO.File]::WriteAllText(
        $temporaryFile,
        ($finalCors | ConvertTo-Json -Depth 8),
        [System.Text.UTF8Encoding]::new($false)
    )
    $output = (& $gcloud storage buckets update "gs://$Bucket" --project=$ProjectId --cors-file=$temporaryFile 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "gcloud no pudo aplicar CORS:`n$output" }
}
finally {
    if (Test-Path -LiteralPath $temporaryFile) { Remove-Item -LiteralPath $temporaryFile -Force }
}

$after = Get-BucketState $gcloud
if ((Canonical-Json $after.Cors) -ne (Canonical-Json $finalCors)) {
    throw "La relectura del bucket no coincide con la configuración fusionada esperada."
}

Write-Host "CORS aplicado y verificado:"
Write-Host (Format-JsonArray $after.Cors)
