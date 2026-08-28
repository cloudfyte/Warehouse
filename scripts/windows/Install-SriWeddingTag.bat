@echo off
REM ============================================================
REM  Sri Wedding Tag - printer paper size setup
REM  Just double-click this file and click YES when Windows asks.
REM  Generated from _payload.ps1 by make_bat.py - do not hand-edit.
REM ============================================================
title Sri Wedding Tag - Printer Setup
setlocal

REM --- Does this already have administrator rights? ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo    Windows will now ask for permission.
  echo    Please click YES on the popup.
  echo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
  if errorlevel 1 (
    echo.
    echo    Permission was refused, so nothing was changed.
    echo    Right-click this file and pick "Run as administrator".
    echo.
    pause
  )
  exit /b
)

set "B64=%TEMP%\sriwedding_tag.b64"
set "PS1=%TEMP%\sriwedding_tag.ps1"
if exist "%B64%" del /q "%B64%"
if exist "%PS1%" del /q "%PS1%"

REM --- Unpack the setup script ---
>"%B64%" echo JEVycm9yQWN0aW9uUHJlZmVyZW5jZSA9ICJTdG9wIgokRm9ybU5hbWUgPSAiU3JpIFdlZGRpbmcg
>>"%B64%" echo VGFnIgokV2lkdGhNbSAgPSA1NAokSGVpZ2h0TW0gPSA2NQoKZnVuY3Rpb24gTGluZSB7IHBhcmFt
>>"%B64%" echo KCR0LCAkYyA9ICJHcmF5IikgV3JpdGUtSG9zdCAkdCAtRm9yZWdyb3VuZENvbG9yICRjIH0KCldy
>>"%B64%" echo aXRlLUhvc3QgIiIKTGluZSAiPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09
>>"%B64%" echo PT09PT09PT0iICJDeWFuIgpMaW5lICIgIFNyaSBXZWRkaW5nIFRhZyAtIHByaW50ZXIgcGFwZXIg
>>"%B64%" echo c2l6ZSBzZXR1cCIgIkN5YW4iCkxpbmUgIj09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09
>>"%B64%" echo PT09PT09PT09PT09PT09IiAiQ3lhbiIKV3JpdGUtSG9zdCAiIgoKIyAtLS0gbXVzdCBiZSBlbGV2
>>"%B64%" echo YXRlZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0t
>>"%B64%" echo LS0tCiRpZCA9IFtTZWN1cml0eS5QcmluY2lwYWwuV2luZG93c0lkZW50aXR5XTo6R2V0Q3VycmVu
>>"%B64%" echo dCgpCiRwciA9IE5ldy1PYmplY3QgU2VjdXJpdHkuUHJpbmNpcGFsLldpbmRvd3NQcmluY2lwYWwo
>>"%B64%" echo JGlkKQppZiAoLW5vdCAkcHIuSXNJblJvbGUoW1NlY3VyaXR5LlByaW5jaXBhbC5XaW5kb3dzQnVp
>>"%B64%" echo bHRJblJvbGVdOjpBZG1pbmlzdHJhdG9yKSkgewogICAgTGluZSAiICBYICBUaGlzIGRpZCBub3Qg
>>"%B64%" echo c3RhcnQgd2l0aCBBZG1pbmlzdHJhdG9yIHJpZ2h0cy4iICJSZWQiCiAgICBMaW5lICIgICAgIENs
>>"%B64%" echo b3NlIHRoaXMgd2luZG93LCByaWdodC1jbGljayB0aGUgZmlsZSBhbmQgY2hvb3NlIiAiWWVsbG93
>>"%B64%" echo IgogICAgTGluZSAiICAgICAnUnVuIGFzIGFkbWluaXN0cmF0b3InLCB0aGVuIHRyeSBhZ2Fpbi4i
>>"%B64%" echo ICJZZWxsb3ciCiAgICBleGl0IDEKfQoKIyAtLS0gc3Bvb2xlciBBUEkgLS0tLS0tLS0tLS0tLS0t
>>"%B64%" echo LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tCiMgVGhlcmUgaXMg
>>"%B64%" echo bm8gUG93ZXJTaGVsbCBjbWRsZXQgZm9yIHByaW50IGZvcm1zLCBzbyBjYWxsIHRoZSBzcG9vbGVy
>>"%B64%" echo IGRpcmVjdGx5Lgp0cnkgewpBZGQtVHlwZSAtVHlwZURlZmluaXRpb24gQCIKdXNpbmcgU3lzdGVt
>>"%B64%" echo Owp1c2luZyBTeXN0ZW0uUnVudGltZS5JbnRlcm9wU2VydmljZXM7CnB1YmxpYyBzdGF0aWMgY2xh
>>"%B64%" echo c3MgUEYKewogICAgW1N0cnVjdExheW91dChMYXlvdXRLaW5kLlNlcXVlbnRpYWwpXQogICAgcHVi
>>"%B64%" echo bGljIHN0cnVjdCBTSVpFTCB7IHB1YmxpYyBpbnQgY3g7IHB1YmxpYyBpbnQgY3k7IH0KICAgIFtT
>>"%B64%" echo dHJ1Y3RMYXlvdXQoTGF5b3V0S2luZC5TZXF1ZW50aWFsKV0KICAgIHB1YmxpYyBzdHJ1Y3QgUkVD
>>"%B64%" echo VEwgeyBwdWJsaWMgaW50IGxlZnQ7IHB1YmxpYyBpbnQgdG9wOyBwdWJsaWMgaW50IHJpZ2h0OyBw
>>"%B64%" echo dWJsaWMgaW50IGJvdHRvbTsgfQogICAgW1N0cnVjdExheW91dChMYXlvdXRLaW5kLlNlcXVlbnRp
>>"%B64%" echo YWwsIENoYXJTZXQgPSBDaGFyU2V0LlVuaWNvZGUpXQogICAgcHVibGljIHN0cnVjdCBGT1JNX0lO
>>"%B64%" echo Rk9fMSB7CiAgICAgICAgcHVibGljIHVpbnQgRmxhZ3M7CiAgICAgICAgW01hcnNoYWxBcyhVbm1h
>>"%B64%" echo bmFnZWRUeXBlLkxQV1N0cildIHB1YmxpYyBzdHJpbmcgcE5hbWU7CiAgICAgICAgcHVibGljIFNJ
>>"%B64%" echo WkVMIFNpemU7CiAgICAgICAgcHVibGljIFJFQ1RMIEltYWdlYWJsZUFyZWE7CiAgICB9CiAgICBb
>>"%B64%" echo U3RydWN0TGF5b3V0KExheW91dEtpbmQuU2VxdWVudGlhbCldCiAgICBwdWJsaWMgc3RydWN0IFBS
>>"%B64%" echo SU5URVJfREVGQVVMVFMgewogICAgICAgIHB1YmxpYyBJbnRQdHIgcERhdGF0eXBlOyBwdWJsaWMg
>>"%B64%" echo SW50UHRyIHBEZXZNb2RlOyBwdWJsaWMgdWludCBEZXNpcmVkQWNjZXNzOwogICAgfQogICAgW0Rs
>>"%B64%" echo bEltcG9ydCgid2luc3Bvb2wuZHJ2IiwgQ2hhclNldCA9IENoYXJTZXQuVW5pY29kZSwgU2V0TGFz
>>"%B64%" echo dEVycm9yID0gdHJ1ZSldCiAgICBwdWJsaWMgc3RhdGljIGV4dGVybiBib29sIE9wZW5QcmludGVy
>>"%B64%" echo KHN0cmluZyBwLCBvdXQgSW50UHRyIGgsIHJlZiBQUklOVEVSX0RFRkFVTFRTIGQpOwogICAgW0Rs
>>"%B64%" echo bEltcG9ydCgid2luc3Bvb2wuZHJ2IiwgU2V0TGFzdEVycm9yID0gdHJ1ZSldCiAgICBwdWJsaWMg
>>"%B64%" echo c3RhdGljIGV4dGVybiBib29sIENsb3NlUHJpbnRlcihJbnRQdHIgaCk7CiAgICBbRGxsSW1wb3J0
>>"%B64%" echo KCJ3aW5zcG9vbC5kcnYiLCBDaGFyU2V0ID0gQ2hhclNldC5Vbmljb2RlLCBTZXRMYXN0RXJyb3Ig
>>"%B64%" echo PSB0cnVlKV0KICAgIHB1YmxpYyBzdGF0aWMgZXh0ZXJuIGJvb2wgQWRkRm9ybShJbnRQdHIgaCwg
>>"%B64%" echo dWludCBsdmwsIHJlZiBGT1JNX0lORk9fMSBmKTsKICAgIFtEbGxJbXBvcnQoIndpbnNwb29sLmRy
>>"%B64%" echo diIsIENoYXJTZXQgPSBDaGFyU2V0LlVuaWNvZGUsIFNldExhc3RFcnJvciA9IHRydWUpXQogICAg
>>"%B64%" echo cHVibGljIHN0YXRpYyBleHRlcm4gYm9vbCBEZWxldGVGb3JtKEludFB0ciBoLCBzdHJpbmcgbmFt
>>"%B64%" echo ZSk7CiAgICBbRGxsSW1wb3J0KCJ3aW5zcG9vbC5kcnYiLCBDaGFyU2V0ID0gQ2hhclNldC5Vbmlj
>>"%B64%" echo b2RlLCBTZXRMYXN0RXJyb3IgPSB0cnVlKV0KICAgIHB1YmxpYyBzdGF0aWMgZXh0ZXJuIGJvb2wg
>>"%B64%" echo R2V0Rm9ybShJbnRQdHIgaCwgc3RyaW5nIG5hbWUsIHVpbnQgbHZsLCBJbnRQdHIgcEZvcm0sIHVp
>>"%B64%" echo bnQgY2IsIG91dCB1aW50IG5lZWQpOwp9CiJACn0gY2F0Y2ggewogICAgTGluZSAiICBYICBUaGlz
>>"%B64%" echo IGNvbXB1dGVyIGNvdWxkIG5vdCBsb2FkIHRoZSBwcmludGVyIHNldHVwIGNvZGUuIiAiUmVkIgog
>>"%B64%" echo ICAgTGluZSAiICAgICAkKCRfLkV4Y2VwdGlvbi5NZXNzYWdlKSIgIlllbGxvdyIKICAgIGV4aXQg
>>"%B64%" echo MQp9CgokdyA9IFtpbnRdKCRXaWR0aE1tICAqIDEwMDApICAgIyBzcG9vbGVyIHVuaXRzIGFyZSB0
>>"%B64%" echo aG91c2FuZHRocyBvZiBhIG1pbGxpbWV0cmUKJGggPSBbaW50XSgkSGVpZ2h0TW0gKiAxMDAwKQoK
>>"%B64%" echo JGRlZnMgPSBOZXctT2JqZWN0IFBGK1BSSU5URVJfREVGQVVMVFMKJGRlZnMucERhdGF0eXBlID0g
>>"%B64%" echo W0ludFB0cl06Olplcm8KJGRlZnMucERldk1vZGUgID0gW0ludFB0cl06Olplcm8KJGRlZnMuRGVz
>>"%B64%" echo aXJlZEFjY2VzcyA9IDEgICAgICAgICMgU0VSVkVSX0FDQ0VTU19BRE1JTklTVEVSCgokaHMgPSBb
>>"%B64%" echo SW50UHRyXTo6WmVybwppZiAoLW5vdCBbUEZdOjpPcGVuUHJpbnRlcigkbnVsbCwgW3JlZl0kaHMs
>>"%B64%" echo IFtyZWZdJGRlZnMpKSB7CiAgICAkZSA9IFtSdW50aW1lLkludGVyb3BTZXJ2aWNlcy5NYXJzaGFs
>>"%B64%" echo XTo6R2V0TGFzdFdpbjMyRXJyb3IoKQogICAgTGluZSAiICBYICBDb3VsZCBub3Qgb3BlbiB0aGUg
>>"%B64%" echo cHJpbnQgc3lzdGVtIChlcnJvciAkZSkuIiAiUmVkIgogICAgTGluZSAiICAgICBNYWtlIHN1cmUg
>>"%B64%" echo dGhlICdQcmludCBTcG9vbGVyJyBzZXJ2aWNlIGlzIHJ1bm5pbmcuIiAiWWVsbG93IgogICAgZXhp
>>"%B64%" echo dCAxCn0KCnRyeSB7CiAgICBMaW5lICIgIEFkZGluZyBwYXBlciBzaXplICckRm9ybU5hbWUnICgk
>>"%B64%" echo V2lkdGhNbSB4ICRIZWlnaHRNbSBtbSkuLi4iICJHcmF5IgoKICAgICMgRGVsZXRlIGZpcnN0IHNv
>>"%B64%" echo IHJlLXJ1bm5pbmcgYWx3YXlzIGVuZHMgaW4gYSBrbm93bi1nb29kIHN0YXRlLgogICAgW3ZvaWRd
>>"%B64%" echo W1BGXTo6RGVsZXRlRm9ybSgkaHMsICRGb3JtTmFtZSkKCiAgICAkZiA9IE5ldy1PYmplY3QgUEYr
>>"%B64%" echo Rk9STV9JTkZPXzEKICAgICRmLkZsYWdzID0gMAogICAgJGYucE5hbWUgPSAkRm9ybU5hbWUKICAg
>>"%B64%" echo ICRzeiA9IE5ldy1PYmplY3QgUEYrU0laRUw7ICRzei5jeCA9ICR3OyAkc3ouY3kgPSAkaAogICAg
>>"%B64%" echo JGYuU2l6ZSA9ICRzegogICAgJGlhID0gTmV3LU9iamVjdCBQRitSRUNUTAogICAgJGlhLmxlZnQg
>>"%B64%" echo PSAwOyAkaWEudG9wID0gMDsgJGlhLnJpZ2h0ID0gJHc7ICRpYS5ib3R0b20gPSAkaAogICAgJGYu
>>"%B64%" echo SW1hZ2VhYmxlQXJlYSA9ICRpYQoKICAgIGlmICgtbm90IFtQRl06OkFkZEZvcm0oJGhzLCAxLCBb
>>"%B64%" echo cmVmXSRmKSkgewogICAgICAgICRlID0gW1J1bnRpbWUuSW50ZXJvcFNlcnZpY2VzLk1hcnNoYWxd
>>"%B64%" echo OjpHZXRMYXN0V2luMzJFcnJvcigpCiAgICAgICAgTGluZSAiICBYICBDb3VsZCBub3QgY3JlYXRl
>>"%B64%" echo IHRoZSBwYXBlciBzaXplIChlcnJvciAkZSkuIiAiUmVkIgogICAgICAgIGV4aXQgMQogICAgfQoK
>>"%B64%" echo ICAgICMgQXNrIGZvciB0aGUgZm9ybSB3aXRoIGEgemVyby1sZW5ndGggYnVmZmVyOiBpZiBpdCBl
>>"%B64%" echo eGlzdHMgdGhlIHNwb29sZXIKICAgICMgcmVwb3J0cyB0aGUgc2l6ZSBpdCB3b3VsZCBuZWVkLCB3
>>"%B64%" echo aGljaCBpcyB0aGUgY2hlYXBlc3QgcHJvb2YgaXQgaXMgcmVhbGx5CiAgICAjIHJlZ2lzdGVyZWQg
>>"%B64%" echo cmF0aGVyIHRoYW4ganVzdCB0cnVzdGluZyBBZGRGb3JtJ3MgcmV0dXJuIHZhbHVlLgogICAgJG5l
>>"%B64%" echo ZWQgPSAwCiAgICBbdm9pZF1bUEZdOjpHZXRGb3JtKCRocywgJEZvcm1OYW1lLCAxLCBbSW50UHRy
>>"%B64%" echo XTo6WmVybywgMCwgW3JlZl0kbmVlZCkKICAgIGlmICgkbmVlZCAtZ3QgMCkgewogICAgICAgIExp
>>"%B64%" echo bmUgIiAgT0sgIFBhcGVyIHNpemUgY3JlYXRlZCBhbmQgdmVyaWZpZWQuIiAiR3JlZW4iCiAgICB9
>>"%B64%" echo IGVsc2UgewogICAgICAgIExpbmUgIiAgWCAgQ3JlYXRlZCwgYnV0IGl0IGNvdWxkIG5vdCBiZSBy
>>"%B64%" echo ZWFkIGJhY2suIiAiUmVkIgogICAgICAgIGV4aXQgMQogICAgfQp9CmZpbmFsbHkgeyBbdm9pZF1b
>>"%B64%" echo UEZdOjpDbG9zZVByaW50ZXIoJGhzKSB9CgojIC0tLSBiZXN0IGVmZm9ydDogbWFrZSBpdCB0aGUg
>>"%B64%" echo ZGVmYXVsdCBwYXBlciBvbiB0aGUgbGFiZWwgcHJpbnRlciAtLS0tLS0tLS0tLS0KV3JpdGUtSG9z
>>"%B64%" echo dCAiIgokY2FuZHMgPSBAKCkKdHJ5IHsKICAgICRjYW5kcyA9IEAoR2V0LVByaW50ZXIgLUVycm9y
>>"%B64%" echo QWN0aW9uIFNpbGVudGx5Q29udGludWUgfAogICAgICAgICAgICAgICBXaGVyZS1PYmplY3QgeyAk
>>"%B64%" echo Xy5OYW1lIC1tYXRjaCAnTFBccyo0NnxTTkJDfFRWU0V8VFZTICcgfSkKfSBjYXRjaCB7CiAgICAj
>>"%B64%" echo IE9sZGVyIFdpbmRvd3Mgd2l0aG91dCB0aGUgUHJpbnRNYW5hZ2VtZW50IG1vZHVsZSAtIGhhcm1s
>>"%B64%" echo ZXNzLCB0aGUgcGFwZXIKICAgICMgc2l6ZSBpcyBhbHJlYWR5IGluc3RhbGxlZCBhbmQgc2VsZWN0
>>"%B64%" echo YWJsZSBieSBoYW5kLgp9CgppZiAoJGNhbmRzLkNvdW50IC1nZSAxKSB7CiAgICAkcCA9ICRjYW5k
>>"%B64%" echo c1swXS5OYW1lCiAgICBMaW5lICIgIExhYmVsIHByaW50ZXIgZm91bmQ6ICRwIiAiR3JheSIKICAg
>>"%B64%" echo IHRyeSB7CiAgICAgICAgU2V0LVByaW50Q29uZmlndXJhdGlvbiAtUHJpbnRlck5hbWUgJHAgLVBh
>>"%B64%" echo cGVyU2l6ZSAkRm9ybU5hbWUgLUVycm9yQWN0aW9uIFN0b3AKICAgICAgICBMaW5lICIgIE9LICBT
>>"%B64%" echo ZXQgYXMgdGhlIGRlZmF1bHQgcGFwZXIgZm9yIHRoYXQgcHJpbnRlci4iICJHcmVlbiIKICAgIH0g
>>"%B64%" echo Y2F0Y2ggewogICAgICAgIExpbmUgIiAgISAgIENvdWxkIG5vdCBzZXQgaXQgYXV0b21hdGljYWxs
>>"%B64%" echo eSAtIG5vdCBhIHByb2JsZW0uIiAiWWVsbG93IgogICAgICAgIExpbmUgIiAgICAgIEp1c3QgcGlj
>>"%B64%" echo ayAnJEZvcm1OYW1lJyBpbiB0aGUgcHJpbnQgd2luZG93LiIgIlllbGxvdyIKICAgIH0KfSBlbHNl
>>"%B64%" echo IHsKICAgIExpbmUgIiAgISAgIE5vIGxhYmVsIHByaW50ZXIgZGV0ZWN0ZWQgLSBub3QgYSBwcm9i
>>"%B64%" echo bGVtLiIgIlllbGxvdyIKICAgIExpbmUgIiAgICAgIFRoZSBwYXBlciBzaXplIGlzIGluc3RhbGxl
>>"%B64%" echo ZCBmb3IgYWxsIHByaW50ZXJzLiIgIlllbGxvdyIKfQoKV3JpdGUtSG9zdCAiIgpMaW5lICI9PT09
>>"%B64%" echo PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSIgIkdyZWVuIgpMaW5l
>>"%B64%" echo ICIgIERPTkUgLSBzZXR1cCBmaW5pc2hlZCBzdWNjZXNzZnVsbHkiICJHcmVlbiIKTGluZSAiPT09
>>"%B64%" echo PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0iICJHcmVlbiIKV3Jp
>>"%B64%" echo dGUtSG9zdCAiIgpMaW5lICIgIE5leHQ6IG9wZW4gdGhlIHdlYnNpdGUsIGNsaWNrIFByaW50IFRh
>>"%B64%" echo ZywgYW5kIGluIiAiQ3lhbiIKTGluZSAiICB0aGUgcHJpbnQgd2luZG93IHNldDoiICJDeWFuIgpM
>>"%B64%" echo aW5lICIgICAgIFBhcGVyIHNpemUgID0gICRGb3JtTmFtZSIgIldoaXRlIgpMaW5lICIgICAgIE1h
>>"%B64%" echo cmdpbnMgICAgID0gIE5vbmUiICJXaGl0ZSIKV3JpdGUtSG9zdCAiIgpleGl0IDAK

certutil -decode "%B64%" "%PS1%" >nul 2>&1
if not exist "%PS1%" (
  echo.
  echo    Could not unpack the setup script.
  echo    Please send a photo of this window to Sathish.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%errorlevel%"

del /q "%B64%" >nul 2>&1
del /q "%PS1%" >nul 2>&1

if not "%RC%"=="0" (
  echo.
  echo    Something went wrong. Please photograph this window
  echo    and send it to Sathish.
  echo.
)
echo   Press any key to close this window...
pause >nul
endlocal
