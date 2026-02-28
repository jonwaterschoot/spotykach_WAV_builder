$samplesDir = ".\public\samples"
$releaseDir = ".\.tmp\samples-v1-flac"

Write-Host "Creating release directory: $releaseDir"
if (-Not (Test-Path $releaseDir)) { 
    New-Item -ItemType Directory -Path $releaseDir -Force 
} else {
    Remove-Item -Path "$releaseDir\*" -Include *.flac -Force
}

Write-Host "Collecting .flac samples..."
$files = Get-ChildItem -Path $samplesDir -Filter *.flac -Recurse
foreach ($file in $files) {
    Write-Host "Copying: $($file.Name)"
    Copy-Item -Path $file.FullName -Destination $releaseDir -Force
}

Write-Host "Collection complete. Found $($files.Count) files."
Write-Host "To upload, run: gh release upload samples-v1 .tmp/samples-v1-flac/*.flac --clobber"
