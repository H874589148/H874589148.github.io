[Console]::OutputEncoding = [Text.Encoding]::UTF8
$raw = [IO.File]::ReadAllText('f:\GitHub\H874589148.github.io\tools\fmea\fm-data.js')
$json = $raw -replace '(?s)^.*?var FM_SHEETS = ', '' -replace ';\s*$', ''
$data = $json | ConvertFrom-Json
foreach ($s in $data) {
    Write-Output ('=== ' + $s.id + ' | tab=' + $s.tab + ' | rows=' + $s.rows.Count + ' | foots=' + $s.foots.Count)
    Write-Output ('head zh: ' + ($s.head.zh -join ' / '))
    Write-Output ('head en: ' + ($s.head.en -join ' / '))
    Write-Output ('src: ' + $s.src)
    foreach ($f in $s.foots) { Write-Output ('foot: ' + $f) }
}
Write-Output '--- digital rows 2..5 (merge fill check) ---'
foreach ($r in $data[0].rows[2..5]) {
    if ($r.t -eq 'row') { Write-Output ('ROW p=' + $r.p[0] + ' | f=' + $r.f[0].Substring(0, [Math]::Min(30, $r.f[0].Length)) + ' | m=' + $r.m[0].Substring(0, [Math]::Min(40, $r.m[0].Length)) + ' || mEN=' + $r.m[1].Substring(0, [Math]::Min(40, $r.m[1].Length))) }
}
Write-Output '--- analog: first cat + next 2 rows ---'
$ai = 0
foreach ($r in $data[1].rows) {
    if ($r.t -eq 'cat') { Write-Output ('CAT ' + $r.zh + ' == ' + $r.en); $ai = 2; continue }
    if ($ai -gt 0) { Write-Output ('ROW p=' + $r.p[0] + ' / ' + $r.p[1] + ' | m=' + $r.m[0].Substring(0, [Math]::Min(36, $r.m[0].Length))); $ai-- }
}
Write-Output '--- unsplit leftovers (zh contains full-width sep) ---'
$sep = [char]0x3000
$bad = 0
foreach ($s in $data) {
    foreach ($r in $s.rows) {
        if ($r.t -eq 'cat') { if ($r.zh.Contains($sep + '|') -or $r.zh.Contains($sep + '/')) { Write-Output ('BAD cat: ' + $r.zh); $bad++ } }
        else {
            foreach ($pair in @($r.p, $r.f, $r.m)) {
                if ($pair[0].Contains($sep + '|') -or $pair[0].Contains($sep + '/') -or $pair[1].Contains($sep + '|')) { Write-Output ('BAD cell: ' + $pair[0].Substring(0, [Math]::Min(50, $pair[0].Length))); $bad++ }
            }
        }
    }
}
Write-Output ('bad count: ' + $bad)
Write-Output '--- empty zh/en cell count ---'
$empty = 0
foreach ($s in $data) { foreach ($r in $s.rows) { if ($r.t -eq 'row') { foreach ($pair in @($r.p, $r.f, $r.m)) { if (-not $pair[0] -or -not $pair[1]) { $empty++ } } } } }
Write-Output ('empty cells: ' + $empty)
