# Scripts Directory

This directory contains utility scripts for the TaskFlow project.

## Version Synchronization Script

### `sync-versions.sh`

This script ensures version consistency across all project files:

- `package.json` (frontend version)
- `src-tauri/Cargo.toml` (backend version)
- `src-tauri/tauri.conf.json` (Tauri configuration)
- `src/environments/environment.ts` (Angular environment configuration)
- `flatpak/com.tcs.taskflow.yml` (Flatpak manifest)
- `flatpak/com.tcs.taskflow.metainfo.xml` (App metadata)

#### Usage

```bash
# Update all files to a new version
./scripts/sync-versions.sh 1.2.3
```

This script will update the version in all the relevant files and add a new release entry to the metainfo.xml file with the current date.

#### Files Updated

When you run the script:

1. Updates the version field in `package.json`
2. Updates the version field in `Cargo.toml`
3. Updates the version field in `tauri.conf.json`
4. Updates the version field in `environment.ts`
5. Updates the version field in the Flatpak manifest
6. Adds a new release entry to the metainfo.xml with current date

This ensures consistency across all version references in the project.