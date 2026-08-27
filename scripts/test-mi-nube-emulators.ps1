[CmdletBinding()]
param(
    [ValidateSet("all", "rules", "flow")]
    [string]$Suite = "all"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDirectory = Split-Path -Parent $PSCommandPath
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))
$expectedProjectId = "cognicion-57052"

function Assert-CanonicalRepository {
    $actualRoot = (& git -C $repositoryRoot rev-parse --show-toplevel 2>$null).Trim().Replace("\", "/")
    $expectedRoot = $repositoryRoot.Replace("\", "/").TrimEnd("/")
    if ($actualRoot.TrimEnd("/") -ne $expectedRoot) {
        throw "El script no está ejecutándose en el repositorio canónico 1-back."
    }

    $branch = (& git -C $repositoryRoot branch --show-current 2>$null).Trim()
    if ($branch -ne "main") {
        throw "La rama activa es '$branch'; las pruebas de Mi nube deben ejecutarse desde main."
    }
}

function Select-Java21 {
    if ($env:COGNICION_JAVA_HOME) {
        $candidate = [System.IO.Path]::GetFullPath($env:COGNICION_JAVA_HOME)
        $javaExecutable = Join-Path $candidate "bin\java.exe"
        if (-not (Test-Path -LiteralPath $javaExecutable -PathType Leaf)) {
            throw "COGNICION_JAVA_HOME no contiene bin\java.exe: $candidate"
        }
        $env:JAVA_HOME = $candidate
        $env:Path = "$(Join-Path $candidate 'bin');$env:Path"
    }

    $javaCommand = Get-Command java -ErrorAction SilentlyContinue
    if (-not $javaCommand) {
        throw "Java no está disponible. Instala un JDK 21 sin eliminar las versiones Java existentes."
    }

    # `java -version` escribe su salida normal en stderr. PowerShell 5 puede
    # convertirla en NativeCommandError cuando ErrorActionPreference es Stop,
    # por lo que se captura mediante Process en vez del pipeline de PowerShell.
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $javaCommand.Source
    $processInfo.Arguments = "-version"
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    $javaProcess = [System.Diagnostics.Process]::Start($processInfo)
    $javaStdout = $javaProcess.StandardOutput.ReadToEnd()
    $javaStderr = $javaProcess.StandardError.ReadToEnd()
    $javaProcess.WaitForExit()
    if ($javaProcess.ExitCode -ne 0) {
        throw "java -version terminó con código $($javaProcess.ExitCode)."
    }
    $versionOutput = ($javaStdout + [Environment]::NewLine + $javaStderr).Trim()
    $versionMatch = [regex]::Match($versionOutput, 'version\s+"(?<version>\d+(?:\.\d+)*)')
    if (-not $versionMatch.Success) {
        throw "No se pudo interpretar java -version:`n$versionOutput"
    }

    $parts = $versionMatch.Groups["version"].Value.Split(".")
    $major = if ($parts[0] -eq "1" -and $parts.Length -gt 1) { [int]$parts[1] } else { [int]$parts[0] }
    if ($major -lt 21) {
        throw "Firebase CLI requiere Java 21 o posterior; se encontró Java $major en $($javaCommand.Source). Usa COGNICION_JAVA_HOME para seleccionar el JDK 21 solo en esta sesión."
    }

    Write-Host "Java validado: $($versionOutput.Split([Environment]::NewLine)[0])"
}

function Resolve-FirebaseCli {
    $localFirebase = Join-Path $repositoryRoot "functions\node_modules\.bin\firebase.cmd"
    if (Test-Path -LiteralPath $localFirebase -PathType Leaf) {
        return $localFirebase
    }

    $globalFirebase = Get-Command firebase -ErrorAction SilentlyContinue
    if (-not $globalFirebase) {
        throw "Firebase CLI no está instalado ni disponible en functions/node_modules/.bin."
    }
    return $globalFirebase.Source
}

function Assert-TestDependencies {
    $requiredPackages = @(
        "functions\node_modules\@firebase\rules-unit-testing\package.json",
        "functions\node_modules\firebase\package.json"
    )
    $missing = @($requiredPackages | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $repositoryRoot $_) -PathType Leaf)
    })
    if ($missing.Count -gt 0) {
        throw "Faltan dependencias de pruebas en functions/node_modules: $($missing -join ', '). Ejecuta la instalación declarada por el proyecto antes de iniciar emuladores."
    }
}

function Set-EmulatorEnvironment {
    # Todos los SDK usados por las pruebas verifican además que estos endpoints
    # pertenezcan estrictamente a loopback antes de inicializar Firebase.
    $env:GCLOUD_PROJECT = $expectedProjectId
    $env:GOOGLE_CLOUD_PROJECT = $expectedProjectId
    $env:FIREBASE_PROJECT_ID = $expectedProjectId
    $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
    $env:FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199"
    $env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
    $env:COGNICION_FUNCTIONS_EMULATOR_HOST = "127.0.0.1:5001"
    # En Windows, la primera carga del conjunto completo de Functions puede
    # superar el límite predeterminado de descubrimiento sin ser un fallo real.
    $env:FUNCTIONS_DISCOVERY_TIMEOUT = "30000"

    # Evita que las Functions clínicas cargadas por el emulador intenten leer
    # un secreto real. Los tests no invocan ninguna ruta de IA.
    $env:OPENAI_API_KEY = "emulator-disabled-not-a-real-key"
}

function Invoke-EmulatorTests {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FirebaseCli,
        [Parameter(Mandatory = $true)]
        [string]$Only,
        [Parameter(Mandatory = $true)]
        [string[]]$TestFiles
    )

    $quotedTests = $TestFiles | ForEach-Object { '"' + $_ + '"' }
    $testCommand = "node --test --test-concurrency=1 $($quotedTests -join ' ')"
    $arguments = @(
        "emulators:exec",
        "--config", (Join-Path $repositoryRoot "firebase.json"),
        "--project", $expectedProjectId,
        "--only", $Only,
        $testCommand
    )

    Write-Host "Emuladores: $Only"
    Write-Host "Pruebas: $($TestFiles -join ', ')"
    & $FirebaseCli @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "La suite de Emulator terminó con código $LASTEXITCODE."
    }
}

Assert-CanonicalRepository
Select-Java21
Assert-TestDependencies
Set-EmulatorEnvironment
$firebaseCli = Resolve-FirebaseCli

Push-Location $repositoryRoot
try {
    if ($Suite -in @("all", "rules")) {
        Invoke-EmulatorTests -FirebaseCli $firebaseCli -Only "firestore,storage" -TestFiles @(
            "functions/test/emulator/firestoreRules.test.mjs",
            "functions/test/emulator/storageRules.test.mjs",
            "functions/test/emulator/notesRegression.test.mjs",
            "functions/test/emulator/profileRules.test.mjs",
            "functions/test/emulator/legacyRegressionRules.test.mjs"
        )
    }

    if ($Suite -in @("all", "flow")) {
        Invoke-EmulatorTests -FirebaseCli $firebaseCli -Only "auth,functions,firestore,storage" -TestFiles @(
            "functions/test/emulator/cloudFlow.test.mjs",
            "functions/test/emulator/cloudQuota.test.mjs",
            "functions/test/emulator/cloudAdminModerationFlow.test.mjs",
            "functions/test/emulator/professionalRegistrationFlow.test.mjs",
            "functions/test/emulator/freeProfessionalPatientLimitFlow.test.mjs",
            "functions/test/emulator/accountLinkingFlow.test.mjs",
            "functions/test/emulator/accountDeletionFlow.test.mjs"
        )
    }
}
finally {
    Pop-Location
}
