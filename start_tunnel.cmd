@echo off
timeout /t 10 /nobreak >nul
C:\cloudflared\cloudflared.exe tunnel --config "C:\Users\Admin\.cloudflared\config.yml" run 051f055a-875e-413c-a5b1-99b26a1c6e0c >> C:\Users\Admin\Shop_App\logs\tunnel.log 2>&1