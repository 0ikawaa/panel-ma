@echo off
title MA Importaciones - Plataforma de Arribos
cd /d "D:\MA-Impo"
echo ============================================
echo   MA Importaciones - Plataforma de Arribos
echo ============================================
echo.
echo Iniciando servidor... (dejalo abierto mientras uses la plataforma)
echo Se abrira el navegador en http://localhost:3000
echo.
timeout /t 4 >nul
start "" http://localhost:3000
call npm run dev
pause
