@echo off
chcp 65001 >nul
title Zalo Gateway - Giặt Sấy Gold Laundry
cd /d "%~dp0"

echo =======================================================
echo   GIAT SAY GOLD LAUNDRY - KHOI DONG ZALO GATEWAY
echo =======================================================
echo.
echo Dang khoi chay he thong Zalo Bot ngam...
echo Vui long GIU NGUYEN cua so nay (khong tat di).
echo Trinh duyet se tu dong mo trong vai giay...
echo.

set "PATH=%~dp0node;%PATH%"

"%~dp0node\node.exe" "%~dp0gateway.js"

echo.
echo =======================================================
echo Canh bao: Chuong trinh Zalo Bot da dung lai!
echo Neu co thong bao loi mau do o tren, hay chup anh lai.
echo =======================================================
pause
