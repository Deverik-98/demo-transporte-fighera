# Copia tu PNG oficial a admin, móvil y favicons.
# Uso: .\scripts\copiar-logo-fighera.ps1 -Origen "C:\ruta\a\tu\logo.png"

param(
  [Parameter(Mandatory = $true)]
  [string]$Origen
)

$root = Split-Path $PSScriptRoot -Parent
$destinos = @(
  "$root\Panel Administrativo ERP\src\assets\brand\logo-transporte-fighiera.png",
  "$root\Prototipo App Choferes Transporte\src\assets\brand\logo-transporte-fighiera.png",
  "$root\Panel Administrativo ERP\public\favicon.png",
  "$root\Prototipo App Choferes Transporte\public\favicon.png"
)

if (-not (Test-Path $Origen)) {
  Write-Error "No existe: $Origen"
  exit 1
}

foreach ($d in $destinos) {
  New-Item -ItemType Directory -Force -Path (Split-Path $d) | Out-Null
  Copy-Item $Origen $d -Force
  Write-Host "OK -> $d"
}

Write-Host "Listo. Ejecuta build y reinicia el servidor en 5180."
