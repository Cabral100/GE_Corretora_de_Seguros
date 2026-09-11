$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-BrandIcon {
  param(
    [int]$Size,
    [string]$Path,
    [bool]$Maskable = $false
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#ffffff'))

  $padding = if ($Maskable) { [int]($Size * 0.18) } else { [int]($Size * 0.09) }
  $inner = $Size - ($padding * 2)
  $half = [int]($inner / 2)
  $black = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#151515'))
  $navy = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#101c4e'))
  $red = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#d9192a'))
  $yellow = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f5c400'))
  $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [Math]::Max(4, $Size * 0.035))

  $graphics.FillRectangle($black, $padding, $padding, $half, $half)
  $graphics.FillRectangle($navy, $padding + $half, $padding, $inner - $half, $half)
  $graphics.FillRectangle($red, $padding, $padding + $half, $half, $inner - $half)
  $graphics.FillRectangle($yellow, $padding + $half, $padding + $half, $inner - $half, $inner - $half)
  $graphics.DrawRectangle($whitePen, $padding, $padding, $inner, $inner)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $whitePen.Dispose()
  $black.Dispose()
  $navy.Dispose()
  $red.Dispose()
  $yellow.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-BrandIcon -Size 180 -Path (Join-Path $PSScriptRoot '..\assets\apple-touch-icon.png')
New-BrandIcon -Size 192 -Path (Join-Path $PSScriptRoot '..\assets\icon-192.png')
New-BrandIcon -Size 512 -Path (Join-Path $PSScriptRoot '..\assets\icon-512.png')
New-BrandIcon -Size 512 -Path (Join-Path $PSScriptRoot '..\assets\icon-maskable-512.png') -Maskable $true

$ogPath = Join-Path $PSScriptRoot '..\assets\og-cover.png'
$og = New-Object System.Drawing.Bitmap(1200, 630)
$canvas = [System.Drawing.Graphics]::FromImage($og)
$canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$canvas.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$canvas.Clear([System.Drawing.ColorTranslator]::FromHtml('#f5f7fc'))

$navyPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#101c4e'), 170)
$redPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#d9192a'), 54)
$yellowPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#f5c400'), 28)
$canvas.DrawArc($navyPen, 740, -110, 600, 820, 88, 188)
$canvas.DrawArc($redPen, 795, -70, 515, 735, 88, 188)
$canvas.DrawArc($yellowPen, 852, -25, 430, 650, 88, 188)

$black = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#151515'))
$navy = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#101c4e'))
$red = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#d9192a'))
$yellow = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f5c400'))
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#5b6177'))
$canvas.FillRectangle($black, 82, 74, 30, 30)
$canvas.FillRectangle($navy, 112, 74, 30, 30)
$canvas.FillRectangle($red, 82, 104, 30, 30)
$canvas.FillRectangle($yellow, 112, 104, 30, 30)

$brandFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
$titleFont = New-Object System.Drawing.Font('Segoe UI', 50, [System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Regular)
$buttonFont = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$canvas.DrawString('G.E. CORRETORA DE SEGUROS', $brandFont, $navy, 164, 87)
$canvas.DrawString('Proteção sob medida.', $titleFont, $navy, 78, 245)
$canvas.DrawString('Seguros e planos de saúde com atendimento personalizado.', $bodyFont, $muted, 83, 333)
$canvas.FillRectangle($red, 82, 430, 330, 72)
$canvas.FillRectangle($yellow, 82, 502, 118, 7)
$canvas.DrawString('FALE COM UM ESPECIALISTA', $buttonFont, $white, 108, 453)

$og.Save($ogPath, [System.Drawing.Imaging.ImageFormat]::Png)
$brandFont.Dispose()
$titleFont.Dispose()
$bodyFont.Dispose()
$buttonFont.Dispose()
$black.Dispose()
$navy.Dispose()
$red.Dispose()
$yellow.Dispose()
$white.Dispose()
$muted.Dispose()
$navyPen.Dispose()
$redPen.Dispose()
$yellowPen.Dispose()
$canvas.Dispose()
$og.Dispose()
