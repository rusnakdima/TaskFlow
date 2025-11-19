# TaskFlow Flatpak Build

This directory contains the files needed to build TaskFlow as a Flatpak application.

## Files

- `com.tcs.taskflow.yml`: The Flatpak manifest file that defines how to build the application.
- `build.sh`: A convenience script to build the Flatpak.

## Building

To build the Flatpak:

1. Ensure you have `flatpak` and `flatpak-builder` installed on your system.
2. Run `./build.sh` from this directory.
3. This will create a `build` with the built application.

To create a distributable `.flatpak` bundle:

```bash
flatpak build-bundle repo taskflow.flatpak com.tcs.taskflow
```

To install and run:

```bash
flatpak install taskflow.flatpak
flatpak run com.tcs.taskflow
```

## Notes

- The build process requires internet access to download dependencies.
- Building may take some time the first time due to downloading SDKs and extensions.
- Ensure your system has enough disk space (around 5-10 GB free).
