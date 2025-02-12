@echo off
cls
setlocal enabledelayedexpansion

echo Mengirim permintaan bantuan ke laboran dari Lab M...
echo.

:: Tambahkan header user-token dan lab identifier saat mengirim request
curl -s -X GET -H "user-token: 1105365521" -H "lab-identifier: M" http://localhost:3000/request-help > nul
if %errorlevel% neq 0 (
    echo Gagal mengirim permintaan bantuan. Pastikan server Node.js sedang berjalan.
    pause
    exit /b
)

cls
echo Permintaan bantuan dari Lab M telah dikirim
echo.
echo [Menunggu respons dari laboran...]
echo.
echo [Harap tidak di close, sampai laboran merespon]
echo.

:waitLoop
timeout /t 1 >nul

:: Mengambil respons langsung dari curl tanpa menyimpan ke file
set "response="
for /f "delims=" %%i in ('curl -s -X GET -H "user-token: 1105365521" http://localhost:3000/response') do (
    if not defined response (
        set "response=%%i"
    ) else (
        set "response=!response!\n%%i"
    )
)

if "!response!"=="" goto waitLoop

cls
echo !response!
echo.

:askUser
set /p userInput=Apakah Anda ingin menutup aplikasi? (Y/N): 
if /i "%userInput%"=="Y" (
    exit
)
if /i "%userInput%"=="N" goto continueLoop
echo Pilihan tidak valid. Silakan masukkan Y atau N.
goto askUser

:continueLoop
cls
echo [Menunggu respons dari laboran...]
echo.
timeout /t 1 >nul
goto waitLoop