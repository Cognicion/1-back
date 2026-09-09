$ErrorActionPreference = 'Stop'
$project = 'cognicion-57052'
$uid = 'ypa8b80onaRHklCPi6O43AgQKJs1'
$access = (& gcloud.cmd auth print-access-token).Trim()
$headers = @{ Authorization = "Bearer $access"; 'Content-Type' = 'application/json' }
$base = "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents"

function Convert-Value($value) {
  if ($null -ne $value.stringValue) { return $value.stringValue }
  if ($null -ne $value.booleanValue) { return [bool]$value.booleanValue }
  if ($null -ne $value.integerValue) { return [int64]$value.integerValue }
  if ($null -ne $value.doubleValue) { return [double]$value.doubleValue }
  if ($value.arrayValue) { return @($value.arrayValue.values | ForEach-Object { Convert-Value $_ }) }
  if ($value.mapValue) {
    $result = [ordered]@{}
    foreach ($property in $value.mapValue.fields.PSObject.Properties) {
      $result[$property.Name] = Convert-Value $property.Value
    }
    return [pscustomobject]$result
  }
  return $null
}

function Get-Document($path) {
  try {
    $document = Invoke-RestMethod -Method Get -Uri "$base/$path" -Headers $headers
    $result = [ordered]@{}
    foreach ($property in $document.fields.PSObject.Properties) {
      $result[$property.Name] = Convert-Value $property.Value
    }
    return [pscustomobject]$result
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $null }
    throw
  }
}

function Normalize-Role($value) {
  if ($null -eq $value) { return '' }
  $decomposed = ([string]$value).Normalize([Text.NormalizationForm]::FormD)
  $plain = -join ($decomposed.ToCharArray() | Where-Object {
    [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne [Globalization.UnicodeCategory]::NonSpacingMark
  })
  return ($plain.ToLowerInvariant() -replace '[\s_-]+', '').Trim()
}

$query = @{
  structuredQuery = @{
    from = @(@{ collectionId = 'whatsappWebhookEvents' })
    where = @{ compositeFilter = @{ op = 'AND'; filters = @(
      @{ fieldFilter = @{ field = @{ fieldPath = 'receivedAt' }; op = 'GREATER_THAN_OR_EQUAL'; value = @{ timestampValue = '2026-09-09T01:58:30Z' } } }
      @{ fieldFilter = @{ field = @{ fieldPath = 'receivedAt' }; op = 'LESS_THAN_OR_EQUAL'; value = @{ timestampValue = '2026-09-09T01:58:40Z' } } }
    ) } }
    limit = 1
  }
} | ConvertTo-Json -Depth 12
$row = Invoke-RestMethod -Method Post -Uri "$base`:runQuery" -Headers $headers -Body $query |
  Where-Object { $_.document } | Select-Object -First 1
$receiptId = ($row.document.name -split '/')[-1]
$job = Get-Document "whatsappBotJobs/$receiptId"
$channel = Get-Document 'whatsappBotConfig/channel'
$professional = Get-Document "whatsappBotProfessionals/$uid"
$recipient = Get-Document "whatsappBotRecipients/$($job.subject)"
$profile = Get-Document "usuarios/$uid"
$control = Get-Document "appointmentControls/$uid"
$tombstone = Get-Document "accountDeletionTombstones/$uid"

$roles = @()
if ($profile.roles -is [array]) {
  $roles = @($profile.roles)
} elseif ($profile.roles) {
  foreach ($roleProperty in $profile.roles.PSObject.Properties) {
    if ($roleProperty.Value -eq $true) { $roles += $roleProperty.Name }
  }
}
$roleCandidates = @(
  $profile.rol, $profile.role, $profile.tipoUsuario, $profile.tipoProfesional,
  $profile.profesion, $profile.profession, $profile.professionalProfile.role,
  $profile.professionalProfile.profession, $profile.clinicalProfile.role,
  $profile.clinicalProfile.profession
) + $roles
$adminRoles = @('admin', 'administrador', 'superadmin', 'adminprincipal', 'administradorprincipal')
$professionalRoles = @('medico', 'doctor', 'psicologo', 'enfermeriasaludmental')
$isAdmin = [bool](($roleCandidates | Where-Object { $adminRoles -contains (Normalize-Role $_) }).Count -or $profile.admin -eq $true -or $profile.esAdmin -eq $true)
$professionalRole = [bool](($roleCandidates | Where-Object {
  $normalized = Normalize-Role $_
  $professionalRoles -contains $normalized -or $normalized.Contains('medico') -or $normalized.Contains('psicolog')
}).Count)
$verified = $profile.perfilClinicoHabilitado -eq $true -or
  $profile.clinicalProfileEnabled -eq $true -or
  $profile.perfilMedicoVerificado -eq $true -or
  $profile.medicoVerificado -eq $true -or
  $profile.professionalProfile.enabled -eq $true -or
  $profile.clinicalProfile.enabled -eq $true
$credential = [bool]($profile.cedulaProfesional -or $profile.cedula -or $profile.cedulaEspecialidad -or $profile.perfilProfesionalActualizado)
$isProfessional = $professionalRole -and ((-not $isAdmin) -or $verified -or $credential)
$service = @($professional.services | Where-Object { $_.id -eq 'consulta_qa' })
$weekdays = @('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')
$scheduledDays = @($weekdays | Where-Object { @($control.policy.weeklySchedule.$_).Count -gt 0 }).Count

[pscustomobject]@{
  dateResolved = '2026-09-09'
  professionalUidResolved = $channel.professionalIds.Count -eq 1 -and $channel.professionalIds[0] -eq $uid
  serviceFound = $service.Count -eq 1
  duration = if ($service.Count -eq 1) { $service[0].durationMinutes } else { $null }
  profileExists = [bool]$profile
  isProfessional = $isProfessional
  isPersistedAdmin = $isAdmin
  deletionTombstone = [bool]$tombstone
  channelReady = $channel.enabled -eq $true -and $channel.pilot -eq $true -and $channel.professionalIds.Count -eq 1
  professionalReady = $professional.enabled -eq $true -and @($professional.services).Count -gt 0
  professionalInChannel = $channel.professionalIds -contains $uid
  recipientAllowed = $channel.allowedSubjects -contains $job.subject
  channelIdsMatch = $job.phoneNumberId -eq $channel.phoneNumberId -and $job.wabaId -eq $channel.wabaId
  recipientExists = [bool]$recipient
  recipientChannelMatches = $recipient.phoneNumberId -eq $channel.phoneNumberId
  controlEnabled = $control.enabled -eq $true
  bookingEnabled = $control.policy.bookingEnabled -eq $true
  timeZone = $control.policy.timeZone
  scheduledDays = $scheduledDays
  paymentRequired = $control.policy.payment.required -eq $true
  externalAvailabilityRequired = $control.policy.externalAvailabilityRequired -eq $true
} | ConvertTo-Json -Compress

$access = $null
