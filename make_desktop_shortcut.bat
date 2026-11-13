@echo off
rem ============================================================
rem  Make a DESKTOP shortcut for the KwangIl sales site.
rem  Double-click this file once on each PC. That's all.
rem  Opens the site as an app window (no address bar) in Chrome
rem  or Edge. If neither is installed, makes a normal web shortcut.
rem  Then opens the app once and shows how to pin it to the taskbar
rem  (Windows does not let scripts pin to the taskbar).
rem ============================================================
set "URL=https://kwangilchair.com"
set "MSG_B64=67CU7YOV7ZmU66m07JeQICLqtJHsnbzssrTslrQg7JiB7JeF6rSA66asIiDslYTsnbTsvZjsnYQg66eM65Ok7JeI7Iq164uI64ukLgoK7J6R7JeF7KSEKO2ZlOuptCDslYTrnpgp7JeQ64+EIOuRkOugpOuptDoK7KeA6riIIOyXtOumsCDsmIHsl4XqtIDrpqwg7LC97J2YIOyekeyXheykhCDslYTsnbTsvZjsnYQg7Jik66W47Kq9IO2BtOumrSDihpIgIuyekeyXhSDtkZzsi5zspITsl5Ag6rOg7KCVIgoKKOyciOuPhOyasCDqt5zsuZnsg4Eg7J206rKD66eM7J2AIOyngeygkSDriIzrn6zslbwg7ZWp64uI64ukKQ=="
set "NAME_B64=6rSR7J287LK07Ja0IOyYgeyXheq0gOumrA=="

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference='Stop';" ^
 "$url='%URL%';" ^
 "$name=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%NAME_B64%'));" ^
 "$desk=[Environment]::GetFolderPath('Desktop');" ^
 "$dir=Join-Path $env:LOCALAPPDATA 'kwangil'; New-Item -ItemType Directory -Force $dir | Out-Null;" ^
 "$ico=Join-Path $dir 'site.ico';" ^
 "try{ Invoke-WebRequest ($url.TrimEnd('/')+'/favicon.ico') -OutFile $ico -UseBasicParsing -TimeoutSec 8 }catch{ $ico='' };" ^
 "$chrome=@(\"$env:ProgramFiles\Google\Chrome\Application\chrome.exe\",\"${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe\",\"$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe\") | ? { Test-Path $_ } | select -First 1;" ^
 "$edge=@(\"${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe\",\"$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe\") | ? { Test-Path $_ } | select -First 1;" ^
 "$exe= if($chrome){$chrome}elseif($edge){$edge}else{''};" ^
 "$ws=New-Object -ComObject WScript.Shell;" ^
 "if($exe){" ^
 "  $lnk=Join-Path $desk ($name+'.lnk');" ^
 "  $s=$ws.CreateShortcut($lnk); $s.TargetPath=$exe; $s.Arguments='--app='+$url; $s.WorkingDirectory=(Split-Path $exe);" ^
 "  if($ico -and (Test-Path $ico) -and (Get-Item $ico).Length -gt 0){ $s.IconLocation=$ico } else { $s.IconLocation=$exe+',0' };" ^
 "  $s.Description=$name; $s.Save();" ^
 "}else{" ^
 "  $lnk=Join-Path $desk ($name+'.url');" ^
 "  $s=$ws.CreateShortcut($lnk); $s.TargetPath=$url; $s.Save();" ^
 "};" ^
 "Write-Host ''; Write-Host ('  OK  -> '+$lnk); Write-Host '';" ^
 "try{ Start-Process $lnk; Start-Sleep 3 }catch{};" ^
 "$msg=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%MSG_B64%'));" ^
 "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($msg,$name,0,64)"

if errorlevel 1 (
  echo.
  echo  [X] failed. Right-click this file and choose "Run as administrator", then try again.
  echo.
)
pause
