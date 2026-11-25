$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$html=Get-Content (Join-Path $root 'index.html') -Raw
$js=Get-Content (Join-Path $root 'app.js') -Raw
if($html -notmatch 'app.js' -or $html -notmatch 'styles.css'){throw 'Missing SPA assets'}
if(($js -split "\['").Count-1 -lt 15){throw 'Expected 15 presentation pages'}
if($js -notmatch 'What-if lab' -or $js -notmatch 'featureChart'){throw 'Interactive sections missing'}
$metrics=Get-Content (Join-Path $root 'outputs\metrics\evaluation_metrics.json') -Raw | ConvertFrom-Json
if([math]::Round($metrics.accuracy,4) -ne .6099){throw 'Metrics mismatch'}
if(-not (Test-Path (Join-Path $root 'academic_report\literature_survey.md'))){throw 'Literature survey missing'}
Write-Output 'VERIFIED: SPA assets, 15 pages, live controls, metrics and literature evidence are present.'
