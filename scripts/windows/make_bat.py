#!/usr/bin/env python3
"""Pack _payload.ps1 into a double-clickable, self-elevating .bat.

A .ps1 cannot be double-clicked (Windows opens it in Notepad) and the setup
needs Administrator rights, so the shop copy has to be a .bat that elevates
itself. The PowerShell is carried as base64 and unpacked with certutil, which
sidesteps batch quoting entirely — echoing the script directly would mangle
every quote, parenthesis and percent sign in it.

Run this after editing _payload.ps1:  python3 make_bat.py
"""
import base64, pathlib

ps = pathlib.Path("_payload.ps1").read_bytes()
b64 = base64.b64encode(ps).decode()
lines = [b64[i:i + 76] for i in range(0, len(b64), 76)]

out = ['@echo off',
 'REM ============================================================',
 'REM  Sri Wedding Tag - printer paper size setup',
 'REM  Just double-click this file and click YES when Windows asks.',
 'REM  Generated from _payload.ps1 by make_bat.py - do not hand-edit.',
 'REM ============================================================',
 'title Sri Wedding Tag - Printer Setup',
 'setlocal',
 '',
 'REM --- Does this already have administrator rights? ---',
 'net session >nul 2>&1',
 'if %errorlevel% neq 0 (',
 '  echo.',
 '  echo    Windows will now ask for permission.',
 '  echo    Please click YES on the popup.',
 '  echo.',
 '  powershell -NoProfile -Command "Start-Process -FilePath \'%~f0\' -Verb RunAs" 2>nul',
 '  if errorlevel 1 (',
 '    echo.',
 '    echo    Permission was refused, so nothing was changed.',
 '    echo    Right-click this file and pick "Run as administrator".',
 '    echo.',
 '    pause',
 '  )',
 '  exit /b',
 ')',
 '',
 'set "B64=%TEMP%\\sriwedding_tag.b64"',
 'set "PS1=%TEMP%\\sriwedding_tag.ps1"',
 'if exist "%B64%" del /q "%B64%"',
 'if exist "%PS1%" del /q "%PS1%"',
 '',
 'REM --- Unpack the setup script ---']

for i, ln in enumerate(lines):
    out.append(f'{">" if i == 0 else ">>"}"%B64%" echo {ln}')

out += ['',
 'certutil -decode "%B64%" "%PS1%" >nul 2>&1',
 'if not exist "%PS1%" (',
 '  echo.',
 '  echo    Could not unpack the setup script.',
 '  echo    Please send a photo of this window to Sathish.',
 '  echo.',
 '  pause',
 '  exit /b 1',
 ')',
 '',
 'powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"',
 'set "RC=%errorlevel%"',
 '',
 'del /q "%B64%" >nul 2>&1',
 'del /q "%PS1%" >nul 2>&1',
 '',
 'if not "%RC%"=="0" (',
 '  echo.',
 '  echo    Something went wrong. Please photograph this window',
 '  echo    and send it to Sathish.',
 '  echo.',
 ')',
 'echo   Press any key to close this window...',
 'pause >nul',
 'endlocal']

pathlib.Path("Install-SriWeddingTag.bat").write_bytes(
    ("\r\n".join(out) + "\r\n").encode("ascii"))
print(f"packed {len(ps)} bytes of PowerShell into {len(lines)} base64 lines")
