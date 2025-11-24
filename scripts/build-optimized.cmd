@echo off
setlocal enabledelayedexpansion

REM Optimized build script for TaskFlow (Windows CMD version)
REM This script helps avoid unnecessary recompilation of Tauri components

echo 🚀 Starting optimized build process...

REM Colors for output (limited in CMD)
REM Green and Red are supported via color command

REM Function to print status
:print_status
echo [INFO] %~1
goto :eof

REM Function to print success
:print_success
echo [SUCCESS] %~1
goto :eof

REM Function to print error
:print_error
echo [ERROR] %~1
goto :eof

REM Check if frontend needs rebuild
:check_frontend_changes
set "frontend_dist=dist\taskflow\browser"
set "last_build_file=.last-frontend-build"
set "force_build=%FORCE_BUILD%"

REM In CI environments, always build (fresh clone)
if defined CI (
  call :print_status "CI environment - building frontend..."
  exit /b 0
)
if "%force_build%"=="true" (
  call :print_status "Forced build - building frontend..."
  exit /b 0
)

if not exist "%frontend_dist%" (
  call :print_status "Frontend not built yet, building..."
  exit /b 0
)

if not exist "%last_build_file%" (
  call :print_status "No previous build record found, building frontend..."
  exit /b 0
)

REM Check if any frontend files changed since last build
REM This is simplified - CMD doesn't have find with -newer
REM We'll check if node_modules or src changed
for /f %%i in ('dir /b /s src\*.ts src\*.html src\*.scss src\*.css 2^>nul ^| find /c "."') do set changed_files=%%i

if %changed_files% gtr 0 (
  call :print_status "Frontend files changed, rebuilding..."
  exit /b 0
) else (
  call :print_status "Frontend unchanged, skipping rebuild"
  exit /b 1
)

REM Check if Rust code needs rebuild
:check_rust_changes
set "rust_target=src-tauri\target"
set "last_rust_build=.last-rust-build"
set "force_build=%FORCE_BUILD%"

REM In CI environments, always build (fresh clone)
if defined CI (
  call :print_status "CI environment - building Rust code..."
  exit /b 0
)
if "%force_build%"=="true" (
  call :print_status "Forced build - building Rust code..."
  exit /b 0
)

if not exist "%rust_target%" (
  call :print_status "Rust not built yet, building..."
  exit /b 0
)

if not exist "%last_rust_build%" (
  call :print_status "No previous Rust build record found, building..."
  exit /b 0
)

REM Check if any Rust files changed since last build
for /f %%i in ('dir /b /s src-tauri\src\*.rs 2^>nul ^| find /c "."') do set changed_files=%%i

if %changed_files% gtr 0 (
  call :print_status "Rust files changed, rebuilding..."
  exit /b 0
) else (
  call :print_status "Rust code unchanged, using cached build"
  exit /b 1
)

REM Main build function
:build_optimized
set "target=%~1"
set "build_type=%~2"

call :print_status "Building for target: %target%, type: %build_type%"

REM Build frontend if needed
call :check_frontend_changes
if %errorlevel% equ 0 (
  call :print_status "Building frontend..."
  if "%build_type%"=="debug" (
    bun run build
  ) else (
    bun run build:prod
  )
  call :print_success "Frontend built successfully"
)

REM Build Tauri app
call :print_status "Building Tauri application..."
if "%target%"=="desktop" (
  if "%build_type%"=="debug" (
    bun run tauri:build:debug
  ) else (
    bun run tauri:build
  )
) else if "%target%"=="android" (
  bun run tauri:build:android
) else if "%target%"=="ios" (
  REM For iOS, we only build the frontend here
  REM The actual iOS build is handled by the workflow
  call :print_status "Frontend built for iOS target"
) else (
  call :print_error "Unknown target: %target%"
  echo Available targets: desktop, android, ios
  exit /b 1
)

echo %date% %time% > .last-rust-build
call :print_success "Build completed successfully!"
goto :eof

REM Clean build artifacts
:clean
call :print_status "Cleaning build artifacts..."
if exist dist rmdir /s /q dist
if exist src-tauri\target rmdir /s /q src-tauri\target
if exist src-tauri\gen\android\app\build rmdir /s /q src-tauri\gen\android\app\build
if exist .last-frontend-build del .last-frontend-build
if exist .last-rust-build del .last-rust-build
call :print_success "Clean completed"
goto :eof

REM Show usage
:usage
echo Usage: %0 [command] [options]
echo.
echo Commands:
echo   build [target] [type]  - Build the application (default: desktop release)
echo   clean                 - Clean all build artifacts
echo   help                  - Show this help
echo.
echo Targets:
echo   desktop               - Desktop application (default)
echo   android               - Android application
echo   ios                   - iOS application (frontend only)
echo.
echo Types:
echo   release               - Release build (default)
echo   debug                 - Debug build
echo.
echo Examples:
echo   %0 build                    # Build desktop release
echo   %0 build android debug      # Build Android APK
echo   %0 clean                    # Clean all artifacts
goto :eof

REM Main script logic
if "%1"=="" (
  call :build_optimized desktop release
) else if "%1"=="build" (
  if "%2"=="" (
    call :build_optimized desktop release
  ) else if "%3"=="" (
    call :build_optimized %2 release
  ) else (
    call :build_optimized %2 %3
  )
) else if "%1"=="clean" (
  call :clean
) else if "%1"=="help" (
  call :usage
) else (
  call :print_error "Unknown command: %1"
  call :usage
  exit /b 1
)
