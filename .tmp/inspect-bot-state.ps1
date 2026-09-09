$ErrorActionPreference = 'Stop'
$project = 'cognicion-57052'
$access = (& gcloud.cmd auth print-access-token).Trim()
$headers = @{ Authorization = "Bearer $access"; 'Content-Type' = 'application/json' }
$base = "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents"
$query = @{
  structuredQuery = @{
    from = @(@{ collectionId = 'whatsappWebhookEvents' })
    where = @{ compositeFilter = @{ op = 'AND'; filters = @(
      @{ fieldFilter = @{ field = @{ fieldPath = 'receivedAt' }; op = 'GREATER_THAN_OR_EQUAL'; value = @{ timestampValue = '2026-09-09T02:23:56Z' } } }
      @{ fieldFilter = @{ field = @{ fieldPath = 'receivedAt' }; op = 'LESS_THAN_OR_EQUAL'; value = @{ timestampValue = '2026-09-09T02:23:57Z' } } }
    ) } }
    limit = 1
  }
} | ConvertTo-Json -Depth 12
$row = Invoke-RestMethod -Method Post -Uri "$base`:runQuery" -Headers $headers -Body $query |
  Where-Object { $_.document } | Select-Object -First 1
$receiptId = ($row.document.name -split '/')[-1]
$job = (Invoke-RestMethod -Method Get -Uri "$base/whatsappBotJobs/$receiptId" -Headers $headers).fields
$subject = $job.subject.stringValue
$sha = [Security.Cryptography.SHA256]::Create()
try {
  $outboxId = [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(('out:' + $receiptId)))).ToLowerInvariant()
} finally { $sha.Dispose() }
$session = (Invoke-RestMethod -Method Get -Uri "$base/whatsappBotSessions/$subject" -Headers $headers).fields
$outbox = (Invoke-RestMethod -Method Get -Uri "$base/whatsappBotOutbox/$outboxId" -Headers $headers).fields
$keyName = 'projects/cognicion-57052/locations/global/keyRings/cognicion-calendar/cryptoKeys/refresh-tokens'

function Open-Envelope($mapField, [string]$aad) {
  $fields = $mapField.mapValue.fields
  $kms = Invoke-RestMethod -Method Post -Uri ("https://cloudkms.googleapis.com/v1/" + $keyName + ':decrypt') -Headers $headers -Body (@{
    ciphertext = $fields.wrappedKey.stringValue
  } | ConvertTo-Json -Compress)
  $key = [Convert]::FromBase64String($kms.plaintext)
  $nonce = [Convert]::FromBase64String($fields.iv.stringValue)
  $tag = [Convert]::FromBase64String($fields.tag.stringValue)
  $ciphertext = [Convert]::FromBase64String($fields.ciphertext.stringValue)
  $plaintext = New-Object byte[] $ciphertext.Length
  $aes = [Security.Cryptography.AesGcm]::new($key)
  try {
    $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext, [Text.Encoding]::UTF8.GetBytes($aad))
    return ([Text.Encoding]::UTF8.GetString($plaintext) | ConvertFrom-Json)
  } finally {
    $aes.Dispose()
    [Array]::Clear($key, 0, $key.Length)
    [Array]::Clear($plaintext, 0, $plaintext.Length)
  }
}

$state = Open-Envelope $session.encrypted $subject
$response = Open-Envelope $outbox.encrypted $outboxId
[pscustomobject]@{
  state = $state.step
  serviceId = $state.service.id
  durationMinutes = $state.service.durationMinutes
  asksForDate = [bool]($response.content.text -match 'fecha')
  choiceCount = @($response.content.choices).Count
  outboxState = $outbox.state.stringValue
} | ConvertTo-Json -Compress
$state = $null
$response = $null
$access = $null
