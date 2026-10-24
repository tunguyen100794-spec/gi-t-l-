@echo off
chcp 65001 >nul
title Cap Nhat Zalo Bot - Gold Laundry
cd /d "%~dp0"

echo =======================================================
echo   GIAT SAY GOLD LAUNDRY - CAP NHAT BOT ZALO
echo =======================================================
echo.
echo Dang tu dong tai phien ban moi nhat ve may...

curl -s -L -o "%~dp0gateway.js" "https://giatsayquynhon.vn/the/gateway.js"
curl -s -L -o "%~dp0vip_card_full.png" "https://giatsayquynhon.vn/the/vip_card_full.png"

echo.
echo =======================================================
echo   ✓ DA CAP NHAT PHIEN BAN MOI NHAT THANH CONG!
echo =======================================================
echo.
echo Hay khoi dong lai file "1_Chay_Bot_Zalo.bat" de su dung.
echo.
pause
