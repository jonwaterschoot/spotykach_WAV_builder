$env:Path = "C:\Program Files\nodejs;" + $env:Path
Write-Host "Starting Spotykach WAV Builder..."
& "C:\Program Files\nodejs\npm.cmd" run dev
