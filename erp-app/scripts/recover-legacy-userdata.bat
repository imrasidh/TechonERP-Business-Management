@echo off
setlocal EnableDelayedExpansion
title Techon ERP - Recover old shop data
color 0A

echo.
echo ============================================================
echo   Techon ERP - Recover data after new .exe install
echo ============================================================
echo.
echo This copies your OLD shop data from:
echo   %%APPDATA%%\Techon-ERP
echo into the NEW app folder:
echo   %%APPDATA%%\TechonERP\UserData
echo.
echo Close Techon ERP completely before continuing.
echo.
pause

taskkill /F /IM Techon-ERP.exe >nul 2>&1
timeout /t 2 /nobreak >nul

set "OLD=%APPDATA%\Techon-ERP"
set "NEW=%APPDATA%\TechonERP\UserData"

if not exist "%OLD%" (
  echo.
  echo ERROR: Old folder not found:
  echo   %OLD%
  echo.
  echo Your data may be on another Windows user account, or this PC
  echo was a Counter PC and data lives on the Main Server PC.
  echo.
  pause
  exit /b 1
)

if not exist "%OLD%\IndexedDB" (
  echo.
  echo WARNING: %OLD%\IndexedDB not found.
  echo Checking if data exists elsewhere...
  echo.
)

if not exist "%NEW%" mkdir "%NEW%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set STAMP=%%I
set "BACKUP=%NEW%.wrong-setup-backup-%STAMP%"

if exist "%NEW%\IndexedDB" (
  echo Backing up current empty/wrong setup to:
  echo   %BACKUP%
  move "%NEW%" "%BACKUP%" >nul
  mkdir "%NEW%"
)

echo.
echo Copying old data...
echo   FROM: %OLD%
echo   TO:   %NEW%
echo.

xcopy "%OLD%\*" "%NEW%\" /E /I /H /Y /Q >nul 2>&1
if errorlevel 1 (
  echo Copy had warnings - trying folder by folder...
  if exist "%OLD%\IndexedDB" xcopy "%OLD%\IndexedDB" "%NEW%\IndexedDB\" /E /I /H /Y /Q
  if exist "%OLD%\Local Storage" xcopy "%OLD%\Local Storage" "%NEW%\Local Storage\" /E /I /H /Y /Q
  for %%F in ("%OLD%\tc_*") do copy /Y "%%F" "%NEW%\" >nul 2>&1
)

echo.
echo ============================================================
echo   DONE. Now open Techon ERP again.
echo   Use your OLD password (not the new one you just set).
echo ============================================================
echo.
pause
