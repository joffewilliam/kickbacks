@ECHO off
setlocal enabledelayedexpansion

set "__KB_AD_FILE=%USERPROFILE%\.vibe-ads\cli-ad.json"
set "__KB_CODEX_EXE=%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe"
set "__KB_AD=Earning Kickback"

if exist "%__KB_AD_FILE%" (
  for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "try { (Get-Content -Raw $env:USERPROFILE\\.vibe-ads\\cli-ad.json | ConvertFrom-Json).adText } catch { '' }"`) do (
    if not "%%A"=="" set "__KB_AD=%%A"
    goto :__kb_after
  )
)

:__kb_after
echo.
echo   [ad]  !__KB_AD!
echo.

if not exist "%__KB_CODEX_EXE%" (
  echo Codex executable not found: %__KB_CODEX_EXE% 1>&2
  exit /b 1
)

endlocal & "%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe" %*
