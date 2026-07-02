param(
  [switch]$Release
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Sdk = $env:ANDROID_SDK_ROOT
if (-not $Sdk) { $Sdk = $env:ANDROID_HOME }
if (-not $Sdk) { $Sdk = "C:\Users\K24\dev\android-sdk" }

$BuildTools = Get-ChildItem -LiteralPath (Join-Path $Sdk "build-tools") -Directory |
  Sort-Object Name -Descending |
  Select-Object -First 1
if (-not $BuildTools) { throw "Android build-tools tidak ditemukan di $Sdk" }

$PlatformJar = Get-ChildItem -LiteralPath (Join-Path $Sdk "platforms") -Directory |
  Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName "android.jar" } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1
if (-not $PlatformJar) { throw "android.jar tidak ditemukan di $Sdk\platforms" }

$Aapt2 = Join-Path $BuildTools.FullName "aapt2.exe"
$D8 = Join-Path $BuildTools.FullName "d8.bat"
$Zipalign = Join-Path $BuildTools.FullName "zipalign.exe"
$Apksigner = Join-Path $BuildTools.FullName "apksigner.bat"
$JavaBin = if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME "bin\javac.exe"))) {
  Join-Path $env:JAVA_HOME "bin"
} else {
  $null
}
$Javac = if ($JavaBin) { Join-Path $JavaBin "javac.exe" } else { "javac" }
$Jar = if ($JavaBin) { Join-Path $JavaBin "jar.exe" } else { "jar" }
$Keytool = if ($JavaBin) { Join-Path $JavaBin "keytool.exe" } else { "keytool" }

$Build = Join-Path $Root "build"
$AndroidJar = Join-Path $Build "android.jar"
$Compiled = Join-Path $Build "compiled"
$Gen = Join-Path $Build "gen"
$Classes = Join-Path $Build "classes"
$Dex = Join-Path $Build "dex"
$Dist = Join-Path $Root "dist"
$DebugKeystore = Join-Path $Root "keystore\anta-debug.jks"
$ReleaseKeystore = Join-Path $Root "keystore\antasiar-release.jks"

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$resolvedBuild = if (Test-Path -LiteralPath $Build) { (Resolve-Path -LiteralPath $Build).Path } else { $Build }
if (-not $resolvedBuild.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Build path tidak aman: $resolvedBuild"
}

Remove-Item -LiteralPath $Build -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Compiled, $Gen, $Classes, $Dex, $Dist | Out-Null
Copy-Item -LiteralPath $PlatformJar -Destination $AndroidJar -Force

& $Aapt2 compile --dir (Join-Path $Root "app\src\main\res") -o $Compiled
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile gagal" }

$linkArgs = @(
  "link",
  "-o", (Join-Path $Build "unsigned.apk"),
  "-I", $AndroidJar,
  "--manifest", (Join-Path $Root "app\src\main\AndroidManifest.xml"),
  "--java", $Gen,
  "--auto-add-overlay",
  "--min-sdk-version", "23",
  "--target-sdk-version", "36"
)
Get-ChildItem -LiteralPath $Compiled -Filter *.flat | ForEach-Object {
  $linkArgs += @("-R", $_.FullName)
}
& $Aapt2 @linkArgs
if ($LASTEXITCODE -ne 0) { throw "aapt2 link gagal" }

$javaFiles = @(
  (Join-Path $Root "app\src\main\java\id\antasiar\app\MainActivity.java"),
  (Join-Path $Gen "id\antasiar\app\R.java")
)
& $Javac -encoding UTF-8 --release 17 -classpath $AndroidJar -d $Classes $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac gagal" }

$classFiles = Get-ChildItem -LiteralPath $Classes -Recurse -Filter *.class | ForEach-Object { $_.FullName }
if (-not $classFiles) { throw "class Java tidak ditemukan" }
& $D8 --min-api 23 --lib $AndroidJar --output $Dex $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 gagal" }

Copy-Item -LiteralPath (Join-Path $Build "unsigned.apk") -Destination (Join-Path $Build "withdex.apk") -Force
Push-Location $Dex
try {
  & $Jar uf (Join-Path $Build "withdex.apk") "classes.dex"
  if ($LASTEXITCODE -ne 0) { throw "jar update gagal" }
} finally {
  Pop-Location
}

& $Zipalign -f -p 4 (Join-Path $Build "withdex.apk") (Join-Path $Build "aligned.apk")
if ($LASTEXITCODE -ne 0) { throw "zipalign gagal" }

if ($Release) {
  $Keystore = $ReleaseKeystore
  $Alias = "antasiar"
  $StorePass = $env:ANTASIAR_RELEASE_STOREPASS
  if (-not $StorePass) { throw "Set env ANTASIAR_RELEASE_STOREPASS untuk build release" }
  $KeyPass = if ($env:ANTASIAR_RELEASE_KEYPASS) { $env:ANTASIAR_RELEASE_KEYPASS } else { $StorePass }
  $Out = Join-Path $Dist "anta-ai-release.apk"
} else {
  $Keystore = $DebugKeystore
  $Alias = "anta-debug"
  $StorePass = "android"
  $KeyPass = "android"
  $Out = Join-Path $Dist "anta-ai-debug.apk"
}

if (-not $Release -and -not (Test-Path -LiteralPath $Keystore)) {
  & $Keytool -genkeypair -v `
    -keystore $Keystore `
    -storepass android `
    -keypass android `
    -alias anta-debug `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -dname "CN=Anta Debug,O=Anta,C=ID"
  if ($LASTEXITCODE -ne 0) { throw "debug keystore gagal dibuat" }
}
if (-not (Test-Path -LiteralPath $Keystore)) { throw "Keystore tidak ditemukan: $Keystore" }

& $Apksigner sign `
  --ks $Keystore `
  --ks-pass "pass:$StorePass" `
  --key-pass "pass:$KeyPass" `
  --ks-key-alias $Alias `
  --out $Out `
  (Join-Path $Build "aligned.apk")
if ($LASTEXITCODE -ne 0) { throw "apksigner gagal" }

& $Apksigner verify --verbose --print-certs $Out
if ($LASTEXITCODE -ne 0) { throw "APK verify gagal" }

Write-Host "APK siap: $Out"
