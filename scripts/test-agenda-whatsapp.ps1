[CmdletBinding()]
param([string]$JavaHome = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot', [switch]$BotOnly)
$ErrorActionPreference='Stop'
$repositoryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ((& git -C $repositoryRoot branch --show-current).Trim() -ne 'main') { throw 'Se requiere main.' }
if (!(Get-Content -LiteralPath (Join-Path $JavaHome 'release') | Select-String '^JAVA_VERSION="21\.')) { throw 'Se requiere Java 21 existente.' }
$testDirectory=Join-Path $repositoryRoot '.tmp/bot-tests'
if ((Test-Path $testDirectory) -and ((Get-Item $testDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Temporal enlazado no permitido.' }
$null=New-Item -ItemType Directory -Force -Path $testDirectory
$config=@{firestore=@{rules=(Join-Path $repositoryRoot 'firestore.rules')};emulators=@{singleProjectMode=$false;firestore=@{host='127.0.0.1';port=8087};hub=@{host='127.0.0.1';port=4407};logging=@{host='127.0.0.1';port=4507};ui=@{enabled=$false}}}
$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $testDirectory 'firebase.json') -Encoding utf8
$names=@('JAVA_HOME','PATH','TEMP','TMP','JAVA_TOOL_OPTIONS','CI','BOT_ONLY','PLAYWRIGHT_MODULE_PATH')
$previous=@{};foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
Push-Location $testDirectory
try {
  $env:JAVA_HOME=$JavaHome;$env:PATH="$(Join-Path $JavaHome 'bin');$env:PATH";$env:TEMP=$testDirectory;$env:TMP=$testDirectory
  $env:JAVA_TOOL_OPTIONS="-Xmx768m `"-Djava.io.tmpdir=$testDirectory`"";$env:CI='true';$env:BOT_ONLY=if($BotOnly){'1'}else{'0'}
  if(!$env:PLAYWRIGHT_MODULE_PATH){$env:PLAYWRIGHT_MODULE_PATH='C:/Users/980027131/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'}
  & firebase.cmd emulators:exec --project demo-cognicion-bot --only firestore --config firebase.json 'node ../../scripts/run-agenda-whatsapp-tests.cjs'
  if($LASTEXITCODE -ne 0){throw 'Falló la batería de pruebas; revisar .tmp/bot-tests.'}
} finally {Pop-Location;foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}}
