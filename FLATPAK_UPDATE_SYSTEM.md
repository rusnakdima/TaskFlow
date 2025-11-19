# Flatpak Update System for TaskFlow

This document explains how the Flatpak update system works with the TaskFlow application and how to manage version updates.

## Overview

The TaskFlow application can be distributed as a Flatpak package with automatic update capabilities. The update system works in two layers:

1. **Application-level updates**: Using Tauri's built-in updater plugin
2. **System-level updates**: Using Flatpak's built-in update mechanism

## Version Management

### Version Synchronization

All version information is synchronized across these files using the `scripts/sync-versions.sh` script:

- `package.json` - Frontend version
- `src-tauri/Cargo.toml` - Rust backend version
- `src-tauri/tauri.conf.json` - Tauri configuration
- `src/environments/environment.ts` - Angular environment configuration
- `flatpak/com.tcs.taskflow.yml` - Flatpak manifest
- `flatpak/com.tcs.taskflow.metainfo.xml` - App metadata with release history

### Updating Versions

To update the version across all files:

```bash
./scripts/sync-versions.sh <new-version>
```

Example:
```bash
./scripts/sync-versions.sh 1.0.0
```

This will update the version in all files and add a new release entry to the metainfo.xml with the current date.

## Building the Flatpak

To build the Flatpak package:

```bash
cd flatpak
./build.sh
```

The build script automatically checks for version consistency and runs the sync script if needed before building.

### Build Cache Optimization

The build script includes an option to preserve the build cache (`.flatpak-builder` directory) which can significantly speed up subsequent builds by reusing previously built components. When you run the build script, you'll be prompted to choose whether to:

- Clean all previous builds (default behavior, ensures consistency)
- Preserve the build cache for faster rebuilds

Preserving the cache is especially helpful during development when making small changes, as it avoids rebuilding unchanged dependencies.

For automated builds or CI/CD pipelines, you can also run the build script with environment variables to skip the prompts:

```bash
# For a clean build (no cache)
CLEAN_BUILD=1 ./build.sh

# For a cached build (reuse cache)
CLEAN_BUILD=0 ./build.sh
```

## Flatpak Update Process

### For Users

End users can update the application using standard Flatpak commands:

```bash
# Update all Flatpak apps
flatpak update

# Update only this app
flatpak update com.tcs.taskflow

# Check for updates
flatpak remote-info flathub com.tcs.taskflow
```

### For Developers

When releasing a new version:

1. Update version in `package.json` (this is the source of truth)
2. Run version sync: `./scripts/sync-versions.sh <new-version>`
3. Build Flatpak package: `cd flatpak && ./build.sh`
4. Publish to Flathub or distribute the `.flatpak` bundle

## Tauri Updater Integration

The application also includes Tauri's updater plugin, which provides additional update capabilities:

- Can check for updates from within the application
- Supports custom update endpoints
- Provides UI feedback during updates
- Falls back to system updates if Flatpak is the deployment method

## Metainfo File

The `com.tcs.taskflow.metainfo.xml` file contains:

- Release history with dates
- Application description and screenshots
- Developer information
- Update metadata used by app stores

## Troubleshooting

### Version Mismatch

If you get version mismatch errors during build, run:

```bash
./scripts/sync-versions.sh <correct-version>
```

### Flatpak Build Issues

Make sure you have the necessary Flatpak dependencies installed:

```bash
flatpak install flathub org.gnome.Platform//48
flatpak install flathub org.gnome.Sdk//48
flatpak install flathub org.freedesktop.Sdk.Extension.node22//24.08
flatpak install flathub org.freedesktop.Sdk.Extension.rust-stable//24.08
```

## Publishing to Flathub

To publish to Flathub, you need to:

1. Fork the Flathub repository template
2. Submit a pull request with your updated manifest
3. Follow Flathub's review process
4. Maintain the application according to Flathub policies