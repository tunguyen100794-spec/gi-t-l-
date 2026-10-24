@echo off
chcp 65001 >nul
title Cai Dat Tu Dong Khoi Dong Cung May Tinh
cd /d "%~dp0"

echo =======================================================
echo   GIAT SAY GOLD LAUNDRY - CAI DAT TU DONG KHOI DONG
echo =======================================================
echo.
echo Dang tao loi tat (shortcut) khoi dong cung Windows...

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup', 'Zalo_Bot_Gold_Laundry.lnk')); $s.TargetPath = '%~dp01_Chay_Bot_Zalo.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save(); Write-Host '✓ Da cai dat thanh cong!' -ForegroundColor Green"

echo.
echo =======================================================
echo HOAN TAT! Tu bay gio moi khi bat may tinh thu ngan,
echo Zalo Bot se tu dong chay ngam duoi he thong.
echo =======================================================
echo.
pause
