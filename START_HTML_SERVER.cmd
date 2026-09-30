@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "PYEXE="
set "PYARGS="

if not defined PYEXE if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
rem To pin a specific Python, uncomment the next line and set the full path to python.exe
rem set "PYEXE=C:\Python312\python.exe"

if not defined PYEXE (
  where python >nul 2>&1
  if not errorlevel 1 set "PYEXE=python"
)

if not defined PYEXE (
  where py >nul 2>&1
  if not errorlevel 1 (
    set "PYEXE=py"
    set "PYARGS=-3"
  )
)

if not defined PYEXE (
  echo [ERROR] Python not found.
  echo Install Python, or edit this file and set PYEXE to python.exe.
  pause
  exit /b 1
)

"%PYEXE%" %PYARGS% --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python was found, but it cannot run: %PYEXE%
  pause
  exit /b 1
)

set "PORT=8000"
set "LANG_PARAM="
if /I "%~1"=="en" set "LANG_PARAM=?lang=en"
:findport
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  set /a PORT+=1
  if !PORT! GTR 8999 set "PORT=8000"
  goto findport
)

echo Starting RoastSee NEXT upper computer...
echo URL: http://127.0.0.1:%PORT%/next_upper_computer.html%LANG_PARAM%
echo Close the "RoastSee NEXT Server" window to stop the server.

start "RoastSee NEXT Server" /min "%PYEXE%" %PYARGS% -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/next_upper_computer.html%LANG_PARAM%"

endlocal
