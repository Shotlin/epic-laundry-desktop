$ErrorActionPreference = 'Continue'
$env:PORT = '3002'
$env:EPIC_DATA_FILE = './data/epic2.json'
$env:EPIC_SUPPLIER_STATE = '29'
$wd = "C:/Users/MSI/OneDrive/Desktop/epic_crm_shotlin/server"
Start-Process npm.cmd -ArgumentList start -WorkingDirectory $wd -NoNewWindow -RedirectStandardOutput server2.log -RedirectStandardError server2.err
Start-Sleep -Seconds 11

$h = @{"X-API-Key"="dev-key-change-me"}
$base = "http://localhost:3002"
$intra = "$wd\_intra.json"
$inter = "$wd\_inter.json"
Set-Content -Path $intra -Value '{"data":{"customer":"PRT-00001","posting_date":"2026-07-13","place_of_supply":"29","items":[{"item":"ITM-00001","qty":5,"rate":350,"gst_rate":18}]}}' -NoNewline
Set-Content -Path $inter -Value '{"data":{"customer":"PRT-00001","posting_date":"2026-07-13","place_of_supply":"27","items":[{"item":"ITM-00001","qty":5,"rate":350,"gst_rate":18}]}}' -NoNewline

Write-Host "=== health ==="; curl.exe -s "$base/api/health"
$i = curl.exe -s -X POST "$base/api/sales_invoice" -H "Content-Type: application/json" -H $h -d "@$intra" | ConvertFrom-Json
$iid = $i.id
Write-Host "`n=== intra-state ($iid) submit ==="
curl.exe -s -X POST "$base/api/sales_invoice/$iid/submit" -H $h | ConvertTo-Json -Compress
Write-Host "`n=== GL ==="; curl.exe -s "$base/api/ledger/gl" -H $h
Write-Host "`n=== e-invoice ValDtls ==="; (curl.exe -s "$base/api/gst/einvoice/$iid" -H $h | ConvertFrom-Json).ValDtls | ConvertTo-Json -Compress
Write-Host "`n=== e-way ==="; curl.exe -s "$base/api/gst/eway/$iid" -H $h
Write-Host "`n=== cockpit ==="; curl.exe -s "$base/api/gst/cockpit" -H $h

$t = curl.exe -s -X POST "$base/api/sales_invoice" -H "Content-Type: application/json" -H $h -d "@$inter" | ConvertFrom-Json
$tid = $t.id
Write-Host "`n=== inter-state ($tid, POS 27) submit ==="
curl.exe -s -X POST "$base/api/sales_invoice/$tid/submit" -H $h | ConvertTo-Json -Compress
Write-Host "`n=== GL (look for IGST, no CGST/SGST on inter) ==="; curl.exe -s "$base/api/ledger/gl" -H $h
Write-Host "`n=== GSTR-1 ==="; curl.exe -s "$base/api/gst/gstr1" -H $h
