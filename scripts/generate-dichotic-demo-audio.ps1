$ErrorActionPreference = "Stop"

$outputDir = Join-Path $PSScriptRoot "..\assets\audio\dichotic\demo"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$words = @(
  "casa", "perro", "mesa", "luna", "silla", "flor", "gato", "mano",
  "vaso", "libro", "cama", "nube", "pan", "tren", "sol", "mar",
  "cafe", "rio", "puerta", "zapato", "camino", "ventana", "lapiz", "carta"
)

$voice = New-Object -ComObject SAPI.SpVoice

foreach ($word in $words) {
  $filePath = Join-Path $outputDir "demo_$word.wav"
  if (Test-Path $filePath) { continue }
  $stream = New-Object -ComObject SAPI.SpFileStream
  $stream.Open($filePath, 3, $false)
  $voice.AudioOutputStream = $stream
  [void]$voice.Speak($word, 0)
  $stream.Close()
}

Write-Output "Generated demo audio files in $outputDir"
