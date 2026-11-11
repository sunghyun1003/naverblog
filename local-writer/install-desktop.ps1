$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
if (!$desktop -or !(Test-Path -LiteralPath $desktop)) { throw 'Windows desktop directory is unavailable.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$launcher = Join-Path $PSScriptRoot 'desktop.ps1'
$shell = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $desktop '블로그 임시저장 도우미.lnk'
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '" -NodePath "' + $node + '"'
$shortcut.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$shortcut.Description = '네이버 로그인 및 임시저장 PC 도우미'
$shortcut.Save()
Write-Output $shortcutPath
