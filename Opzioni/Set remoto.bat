@echo off
setlocal EnableDelayedExpansion

set FILE=.env
set TEMP_FILE=.env_temp

if not exist %FILE% (
    echo APP_MODE=REMOTE > %FILE%
    echo File .env creato con APP_MODE=REMOTE
    exit /b
)

echo Modificando .env in REMOTE...

rem Rimuove la riga APP_MODE se esiste già
(for /f "usebackq delims=" %%a in (%FILE%) do (
    set LINE=%%a
    echo !LINE! | findstr /V /I "APP_MODE=" >nul && echo !LINE!>>%TEMP_FILE%
))

rem Aggiunge la nuova riga APP_MODE=REMOTE
echo APP_MODE=REMOTE>>%TEMP_FILE%

rem Sostituisce il file originale con quello modificato
move /Y %TEMP_FILE% %FILE% >nul

echo Modalità impostata su REMOTE.
