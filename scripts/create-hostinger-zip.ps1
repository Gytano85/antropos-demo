param(
	[string]$OutputPath = (Join-Path $PSScriptRoot "..\AntroPOS-Hostinger.zip")
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stage = Join-Path $root ".codex\hostinger-upload"
$allowedStageRoot = Join-Path $root ".codex"

if (Test-Path $stage) {
	$resolvedStage = (Resolve-Path $stage).Path
	if (-not $resolvedStage.StartsWith($allowedStageRoot)) {
		throw "Unsafe staging path: $resolvedStage"
	}
	Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}

New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item -LiteralPath (Join-Path $root "package.json") -Destination $stage
Copy-Item -LiteralPath (Join-Path $root "package-lock.json") -Destination $stage
Copy-Item -LiteralPath (Join-Path $root "turbo.json") -Destination $stage
Copy-Item -LiteralPath (Join-Path $root "tsconfig.json") -Destination $stage

New-Item -ItemType Directory -Path (Join-Path $stage "apps") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "packages") | Out-Null

robocopy `
	(Join-Path $root "apps\web") `
	(Join-Path $stage "apps\web") `
	/E `
	/XD node_modules .next .turbo data `
	/XF .env tsconfig.tsbuildinfo bun.lock *.log | Out-Null

Get-ChildItem (Join-Path $root "packages") -Directory | ForEach-Object {
	robocopy `
		$_.FullName `
		(Join-Path $stage "packages\$($_.Name)") `
		/E `
		/XD node_modules .next .turbo data `
		/XF .env tsconfig.tsbuildinfo bun.lock *.log | Out-Null
}

$dataDir = Join-Path $stage "apps\web\data"
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $dataDir ".gitkeep") -Force | Out-Null

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path $resolvedOutput) {
	Remove-Item -LiteralPath $resolvedOutput -Force
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $resolvedOutput -CompressionLevel Optimal

$fileCount = (Get-ChildItem $stage -Recurse -File | Measure-Object).Count
$zip = Get-Item $resolvedOutput
Write-Output "Created: $($zip.FullName)"
Write-Output "Files: $fileCount"
Write-Output "Size: $([math]::Round($zip.Length / 1MB, 2)) MB"
