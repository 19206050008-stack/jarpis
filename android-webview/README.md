# Anta AI Android WebView

Release APK: `dist/anta-ai-release.apk`

App URL: `https://antasiar.my.id`
Package: `id.antasiar.app`

## Build lokal

SDK yang dipakai: `C:\Users\K24\dev\android-sdk`

Debug:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
```

Release:

```powershell
$env:ANTASIAR_RELEASE_STOREPASS="<password-keystore-release>"
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1 -Release
```

Output APK:

`dist\anta-ai-debug.apk`
`dist\anta-ai-release.apk`
