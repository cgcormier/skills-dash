param([ValidateSet('dev', 'build', 'test')][string]$Action = 'dev')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswherePath)) { throw 'Microsoft C++ Build Tools are required. See README.md.' }
$instances = & $vswherePath -all -products '*' -format json | ConvertFrom-Json
$devBatch = $instances | Sort-Object installationVersion -Descending | ForEach-Object {
  $candidate = Join-Path $_.installationPath 'VC\Auxiliary\Build\vcvars64.bat'
  if (Test-Path -LiteralPath $candidate) { $candidate }
} | Select-Object -First 1
if (-not $devBatch) { throw 'No C++ developer environment was found. See README.md.' }
$taskCommand = switch ($Action) {
  'dev' { 'npm run tauri -- dev' }
  'build' { 'npm run tauri -- build' }
  'test' { 'cargo test --manifest-path src-tauri/Cargo.toml' }
}
& $env:ComSpec /d /c "`"$devBatch`" && $taskCommand"
exit $LASTEXITCODE
