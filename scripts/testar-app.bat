@echo off
echo Build de teste v0.2.3 — NAO publicar no GitHub ainda.
echo.
cd /d "%~dp0..\apps\desktop"
call pnpm build
if errorlevel 1 exit /b 1
echo.
echo Abrindo app (modo instalador simulado)...
set FORCE_LOAD_FILE=1
start "" pnpm exec electron .
echo.
echo Deve abrir no Dashboard com menu lateral.
echo Login ao servidor: Configuracoes ^> Sincronizacao com servidor
echo.
pause
