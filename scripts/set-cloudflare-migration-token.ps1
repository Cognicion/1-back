$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security
$repoRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $repoRoot '.firebase/migration'
[void][System.IO.Directory]::CreateDirectory($secretDirectory)
$form = New-Object System.Windows.Forms.Form
$form.Text = 'COGNICION - Acceso DNS Cloudflare'
$form.Size = New-Object System.Drawing.Size(610,240)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.Add_Shown({$form.Activate(); $inputBox.Focus()})
$label = New-Object System.Windows.Forms.Label
$label.Text = "Token limitado a cognicionlabs.com: Zone DNS Edit + Zone Read.`nSe cifra con Windows DPAPI para este usuario. No se envia al chat."
$label.Location = New-Object System.Drawing.Point(15,15)
$label.Size = New-Object System.Drawing.Size(570,50)
$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.Location = New-Object System.Drawing.Point(15,80)
$inputBox.Width = 560
$inputBox.UseSystemPasswordChar = $true
$save = New-Object System.Windows.Forms.Button
$save.Text = 'Guardar acceso'
$save.Location = New-Object System.Drawing.Point(15,125)
$save.Width = 150
$save.Add_Click({
  if ([string]::IsNullOrWhiteSpace($inputBox.Text)) { return }
  $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($inputBox.Text.Trim())
  try {
    $encrypted = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.IO.File]::WriteAllBytes((Join-Path $secretDirectory 'cloudflare-token.dpapi'), $encrypted)
  } finally {
    [System.Array]::Clear($plainBytes, 0, $plainBytes.Length)
  }
  $inputBox.Clear()
  $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Close()
})
$form.Controls.AddRange(@($label,$inputBox,$save))
$form.AcceptButton = $save
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 600000
$timer.Add_Tick({$timer.Stop(); $form.Close()})
$timer.Start()
[void]$form.ShowDialog()
$timer.Dispose()
$form.Dispose()
