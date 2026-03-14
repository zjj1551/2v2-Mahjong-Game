@echo off
title Mahjong Backend Server

echo ========================================
echo Starting Sichuan Mahjong Backend Server...
echo Please keep this window open. A popup will appear when ready.
echo ========================================

set "JAVA_HOME=C:\Program Files\Java\jdk-18.0.1.1"
cd /d "%~dp0mahjong-server"

:: Start background monitoring process, check port 8080
start /b powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $max=120; $i=0; while($i -lt $max) { if(Get-NetTCPConnection -LocalPort 8080) { Write-Host ' '; Write-Host '========================================' -ForegroundColor Green; Write-Host 'SUCCESS: Backend Server is up and running!' -ForegroundColor Green; Write-Host '========================================' -ForegroundColor Green; Write-Host ' '; $wshell = New-Object -ComObject WScript.Shell; $wshell.Popup('Mahjong Backend Server successfully started! You can now test the frontend.', 5, 'Server Started', 64); break; }; Start-Sleep 1; $i++ }"

if exist "maven\apache-maven-3.9.6\bin\mvn.cmd" (
    call ".\maven\apache-maven-3.9.6\bin\mvn.cmd" spring-boot:run
) else (
    call ".\mvnw.cmd" spring-boot:run
)

echo.
echo ========================================
echo Backend Server closed or exited unexpectedly.
echo ========================================
pause
