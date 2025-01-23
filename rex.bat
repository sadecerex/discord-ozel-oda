@echo off
color a
title Rex Özel Oda Sistemi
:loop
echo Bot Baslatiliyor...
node index.js
echo Ufak Bir Sorun Tespit Edildi Restart Atıyorum ...
timeout /t 5
goto loop
